
/* ================================= LISTING ================================== */
/*  Full-history pagination. Each call returns {done, stopped}. The paging URL
 *  (token stripped) is kept in state so the next run resumes where it stopped. */

var IG_MEDIA_FIELDS = [
  'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,shortcode',
  'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
  'id,caption,media_type,permalink,timestamp'
];

// Levels 0-1 include reaction/comment counts, which need the pages_read_user_content
// permission. Without it Meta returns #10 and we step down to level 2: the counts
// then come from post insights (post_activity_by_action_type) instead.
var FB_POST_FIELDS = [
  'id,message,created_time,permalink_url,status_type,attachments{media_type,type,target{id},url},shares,' +
    'reactions.limit(0).summary(true),comments.filter(stream).limit(0).summary(true)',
  'id,message,created_time,permalink_url,status_type,attachments{media_type,type,target{id}},shares,' +
    'reactions.limit(0).summary(true),comments.limit(0).summary(true)',
  'id,message,created_time,permalink_url,status_type,attachments{media_type,type,target{id}},shares',
  'id,message,created_time,permalink_url,status_type,shares',
  'id,message,created_time,permalink_url'
];

// Reel like/comment counts come from video insights, so the list call stays light.
var FB_REEL_FIELDS = [
  'id,description,created_time,updated_time,permalink_url,length,post_id',
  'id,description,created_time,updated_time,permalink_url,length',
  'id,description,created_time,updated_time'
];

/**
 * Generic resumable pager. cur = {url, level, limit} (url without token).
 * onItems(items) is called per page and must return true to stop early.
 */
function pageThrough_(cur, token, fieldLevels, buildFirstUrl, onItems) {
  while (true) {
    if (outOfTime_() || shouldPause_()) return { done: false, stopped: true };
    if (!cur.url) cur.url = buildFirstUrl(fieldLevels[cur.level], cur.limit);

    var r = apiGet_(withToken_(cur.url, token));
    if (!r.ok) {
      if (r.kind === 'auth') throw new Error('Access token rejected by Meta: ' + errText_(r.error));
      if (r.kind === 'rate') return { done: false, stopped: true };
      if (r.kind === 'throttle' || r.kind === 'quota' || r.kind === 'deadline') return { done: false, stopped: true };
      if ((r.kind === 'field' || r.kind === 'invalid' || r.kind === 'perm' || r.kind === 'object') && cur.level < fieldLevels.length - 1) {
        cur.level++;
        cur.url = setParam_(cur.url, 'fields', fieldLevels[cur.level]);
        logMsg_('WARN', 'Meta rejected the requested fields (' + errText_(r.error) + '). Retrying with fewer fields (level ' + cur.level + ').');
        continue;
      }
      if (r.kind === 'too_much' || r.kind === 'transient' || r.kind === 'other') {
        if (cur.limit > 10) {
          cur.limit = Math.max(10, Math.floor(cur.limit / 2));
          cur.url = setParam_(cur.url, 'limit', cur.limit);
          logMsg_('WARN', 'Meta asked for smaller pages (' + errText_(r.error) + '). Page size now ' + cur.limit + '.');
          continue;
        }
        if (r.kind === 'too_much' && cur.level < fieldLevels.length - 1) {
          cur.level++;
          cur.url = setParam_(cur.url, 'fields', fieldLevels[cur.level]);
          logMsg_('WARN', 'Still too much data at page size ' + cur.limit + '. Retrying with fewer fields (level ' + cur.level + ').');
          continue;
        }
      }
      return { done: false, stopped: true, error: r.error, kind: r.kind };
    }

    var items = r.data.data || [];
    var stopEarly = items.length ? onItems(items) : false;
    var next = r.data.paging && r.data.paging.next ? stripToken_(r.data.paging.next) : null;
    if (!next || !items.length || stopEarly) { cur.url = null; return { done: true, stopped: false }; }
    cur.url = next;
  }
}

/* ------------------------------- Instagram -------------------------------- */

function igKind_(productType, mediaType) {
  if (productType === 'STORY') return 'IG_STORY';
  if (productType === 'REELS') return 'IG_REEL';
  if (productType === 'AD') return '';
  if (mediaType === 'CAROUSEL_ALBUM') return 'IG_CAROUSEL';
  if (mediaType === 'VIDEO') return 'IG_VIDEO';
  return 'IG_IMAGE';
}

function upsertIgMedia_(store, m, cycle) {
  store.upsert(m.id, {
    timestamp: parseTime_(m.timestamp),
    product_type: m.media_product_type || (m.media_type === 'VIDEO' ? 'REELS' : 'FEED'),
    media_type: m.media_type || '',
    permalink: m.permalink || '',
    caption: m.caption || '',
    like_count: m.like_count === undefined ? '' : m.like_count,
    comments_count: m.comments_count === undefined ? '' : m.comments_count,
    shortcode: m.shortcode || '',
    last_seen: cycle,
    deleted: ''
  });
}

function listInstagram_(state, cfg, token, store) {
  var cur = state.ig = state.ig || { url: null, level: 0, limit: CFG.PAGE_LIMIT };
  var res = pageThrough_(cur, token, IG_MEDIA_FIELDS, function (fields, limit) {
    return graphUrl_(cfg.igId + '/media', { fields: fields, limit: limit });
  }, function (items) {
    var reachedSince = false;
    items.forEach(function (m) {
      if (cfg.sinceMs && parseTime_(m.timestamp) < cfg.sinceMs) { reachedSince = true; return; }
      upsertIgMedia_(store, m, state.cycle);
    });
    state.igListed = (state.igListed || 0) + items.length;
    return reachedSince;
  });
  if (res.done) {
    logMsg_('INFO', 'Instagram: ' + state.igListed + ' posts listed.');
    markDeleted_(store, 'timestamp', state.cycle, cfg.sinceMs, function (o) { return o.product_type !== 'STORY'; });
  }
  return res;
}

/** Stories only exist for 24h; the /stories edge returns the live ones. */
function listStories_(cfg, token, store, cycle) {
  var r = apiGet_(graphUrl_(cfg.igId + '/stories', {
    fields: 'id,media_type,media_product_type,permalink,timestamp', limit: 100, access_token: token
  }));
  if (!r.ok && r.kind === 'field') {
    r = apiGet_(graphUrl_(cfg.igId + '/stories', { fields: 'id,media_type,timestamp', limit: 100, access_token: token }));
  }
  if (!r.ok) {
    if (r.kind === 'auth') throw new Error('Access token rejected by Meta: ' + errText_(r.error));
    logMsg_('WARN', 'Could not list stories: ' + errText_(r.error));
    return 0;
  }
  var items = r.data.data || [];
  items.forEach(function (m) {
    m.media_product_type = 'STORY';
    upsertIgMedia_(store, m, cycle);
  });
  return items.length;
}

function markDeleted_(store, timeField, cycle, sinceMs, filterFn) {
  var marked = 0;
  store.objects().forEach(function (o) {
    if (filterFn && !filterFn(o)) return;
    if (sinceMs && num_(o[timeField]) < sinceMs) return;
    if (String(o.last_seen) !== String(cycle) && !isTrue_(o.deleted)) {
      store.set(o[store.headers[0]], 'deleted', 'TRUE');
      marked++;
    }
  });
  if (marked) logMsg_('INFO', 'Marked ' + marked + ' objects as deleted (no longer returned by Meta).');
}

/* -------------------------------- Facebook -------------------------------- */

function fbMediaKind_(p) {
  var st = String(p.status_type || '');
  var link = String(p.permalink_url || '');
  var att = p.attachments && p.attachments.data && p.attachments.data[0];
  var mt = att ? String(att.media_type || '') : '';
  var ty = att ? String(att.type || '') : '';
  if (mt === 'video' || ty.indexOf('video') >= 0 || st === 'added_video' || /\/(reel|videos)\//.test(link)) return 'VIDEO';
  if (mt === 'album' || ty === 'album') return 'ALBUM';
  if (mt === 'photo' || ty === 'photo' || st === 'added_photos') return 'PHOTO';
  if (mt === 'link' || ty === 'share' || st === 'shared_story') return 'LINK';
  if (!att && !st) return 'UNKNOWN';
  return att ? 'OTHER' : 'TEXT';
}

function upsertFbPost_(store, page, p, cycle) {
  var att = p.attachments && p.attachments.data && p.attachments.data[0];
  var kind = fbMediaKind_(p);
  var videoId = (kind === 'VIDEO' && att && att.target && att.target.id) ? String(att.target.id) : '';
  store.upsert(p.id, {
    page_id: page.id,
    page_name: page.name,
    object_type: 'POST',
    linked_video_id: videoId,
    created_time: parseTime_(p.created_time),
    message: String(p.message || '').slice(0, 5000),
    permalink: p.permalink_url || '',
    media_kind: kind,
    reactions: summaryCount_(p.reactions),
    comments: summaryCount_(p.comments),
    shares: p.shares && typeof p.shares.count === 'number' ? p.shares.count : (p.shares === undefined && p.status_type === undefined ? '' : 0),
    last_seen: cycle,
    deleted: ''
  });
}

function upsertFbReel_(store, page, v, cycle) {
  store.upsert(v.id, {
    page_id: page.id,
    page_name: page.name,
    object_type: 'REEL',
    linked_post_id: v.post_id ? String(v.post_id) : '',
    created_time: parseTime_(v.created_time || v.updated_time),
    message: String(v.description || '').slice(0, 5000),
    permalink: v.permalink_url ? (String(v.permalink_url).indexOf('http') === 0 ? v.permalink_url : 'https://www.facebook.com' + v.permalink_url) : 'https://www.facebook.com/reel/' + v.id,
    media_kind: 'VIDEO',
    reactions: summaryCount_(v.likes),
    comments: summaryCount_(v.comments),
    length_s: v.length === undefined ? '' : Math.round(Number(v.length) || 0),
    last_seen: cycle,
    deleted: ''
  });
}

function summaryCount_(edge) {
  if (!edge || !edge.summary) return '';
  return Number(edge.summary.total_count) || 0;
}

/**
 * Walks every enabled Page: published posts first, then Reels.
 * state.fb = {page: index, edge: 'posts'|'reels', cur: {...}}
 */
function listFacebook_(state, cfg, token, store) {
  var f = state.fb = state.fb || { page: 0, edge: 'posts', cur: null, postsEdge: 'published_posts' };
  while (f.page < cfg.pages.length) {
    var page = cfg.pages[f.page];
    var pToken = pageToken_(page.id, token);
    if (!f.cur) f.cur = { url: null, level: 0, limit: CFG.FB_PAGE_LIMIT };
    f.counts = f.counts || {};
    var countKey = page.id + '|' + f.edge;

    var res;
    if (f.edge === 'posts') {
      res = pageThrough_(f.cur, pToken, FB_POST_FIELDS, function (fields, limit) {
        return graphUrl_(page.id + '/' + f.postsEdge, { fields: fields, limit: limit });
      }, function (items) {
        var reachedSince = false;
        items.forEach(function (p) {
          if (cfg.sinceMs && parseTime_(p.created_time) < cfg.sinceMs) { reachedSince = true; return; }
          upsertFbPost_(store, page, p, state.cycle);
        });
        f.counts[countKey] = (f.counts[countKey] || 0) + items.length;
        state.fbListed = (state.fbListed || 0) + items.length;
        return reachedSince;
      });
      if (res.error && f.postsEdge === 'published_posts') {
        logMsg_('WARN', 'published_posts failed for ' + page.name + ' (' + errText_(res.error) + '). Trying /posts.');
        f.postsEdge = 'posts';
        f.cur = null;
        continue;
      }
    } else {
      res = pageThrough_(f.cur, pToken, FB_REEL_FIELDS, function (fields, limit) {
        return graphUrl_(page.id + '/video_reels', { fields: fields, limit: limit });
      }, function (items) {
        var reachedSince = false;
        items.forEach(function (v) {
          if (cfg.sinceMs && parseTime_(v.created_time || v.updated_time) < cfg.sinceMs) { reachedSince = true; return; }
          upsertFbReel_(store, page, v, state.cycle);
        });
        f.counts[countKey] = (f.counts[countKey] || 0) + items.length;
        state.fbListed = (state.fbListed || 0) + items.length;
        return reachedSince;
      });
      if (res.error) {
        logMsg_('WARN', 'Could not list Reels for ' + page.name + ': ' + errText_(res.error));
        res = { done: true };   // reels are optional; carry on
      }
    }

    if (res.stopped && !res.error) return res;
    if (res.error) {
      logMsg_('ERROR', 'Could not list the normal posts of Page "' + page.name + '": ' + errText_(res.error) +
        (res.kind === 'perm' ? ' -> Regenerate the token with the pages_read_user_content permission. Reels are still synced.' : ''));
      state.fbIncomplete = true;
    }
    if (res.done && f.edge === 'posts' && f.cur && f.cur.level >= 2) {
      logMsg_('INFO', 'Page "' + page.name + '": posts listed without reaction/comment counts (token lacks pages_read_user_content); counts come from post insights instead.');
    }
    if (res.done) logMsg_('INFO', 'Facebook "' + page.name + '": ' + (f.counts[countKey] || 0) + ' ' + (f.edge === 'posts' ? 'posts' : 'reels') + ' listed.');

    if (f.edge === 'posts') { f.edge = 'reels'; f.cur = null; continue; }
    f.page++; f.edge = 'posts'; f.cur = null; f.postsEdge = 'published_posts';
  }

  if (!state.fbIncomplete) {
    var pageIds = cfg.pages.map(function (p) { return p.id; });
    markDeleted_(store, 'created_time', state.cycle, cfg.sinceMs, function (o) {
      return pageIds.indexOf(String(o.page_id)) >= 0;
    });
  }
  return { done: true, stopped: false };
}
