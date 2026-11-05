
/* =============================== CONTENT TAB ================================ */

/** Number from a metric value. Objects (breakdowns) are summed. undefined if absent. */
function n_(x) {
  if (x === null || x === undefined || x === '') return undefined;
  if (typeof x === 'number') return isFinite(x) ? x : undefined;
  if (typeof x === 'string') { var v = Number(x); return isFinite(v) ? v : undefined; }
  if (typeof x === 'object') {
    var s = 0, any = false;
    Object.keys(x).forEach(function (k) { var v2 = n_(x[k]); if (v2 !== undefined) { s += v2; any = true; } });
    return any ? s : undefined;
  }
  return undefined;
}

function first_() {
  for (var i = 0; i < arguments.length; i++) { var v = n_(arguments[i]); if (v !== undefined) return v; }
  return undefined;
}

function sum_(list) {
  var s = 0, any = false;
  list.forEach(function (x) { var v = n_(x); if (v !== undefined) { s += v; any = true; } });
  return any ? s : undefined;
}

function ratio_(a, b, mult) {
  a = n_(a); b = n_(b);
  if (a === undefined || !b) return undefined;
  return Math.round(a / b * mult * 100) / 100;
}

function round_(x, d) {
  x = n_(x);
  if (x === undefined) return undefined;
  var p = Math.pow(10, d === undefined ? 0 : d);
  return Math.round(x * p) / p;
}

function objKey_(o, names) {
  if (!o || typeof o !== 'object') return undefined;
  for (var i = 0; i < names.length; i++) if (o[names[i]] !== undefined) return n_(o[names[i]]);
  return undefined;
}

/** Metrics of one FB unit (post object + reel object merged). */
function fbUnitMetrics_(u) {
  var pv = u.post ? parseJson_(u.post.insights_json, {}) : {};
  var rv = u.reel ? parseJson_(u.reel.insights_json, {}) : {};
  var social = rv.post_video_social_actions;
  var activity = pv.post_activity_by_action_type;   // {like, comment, share} - works without pages_read_user_content
  var views = first_(rv.post_media_view, pv.post_media_view, rv.fb_reels_total_plays, rv.blue_reels_play_count,
    pv.post_video_views, rv.post_impressions, pv.post_impressions);
  var reach = first_(rv.post_total_media_view_unique, pv.post_total_media_view_unique,
    rv.post_impressions_unique, pv.post_impressions_unique);
  var reactions = first_(u.post ? u.post.reactions : undefined, u.reel ? u.reel.reactions : undefined,
    pv.post_reactions_by_type_total, rv.post_video_likes_by_reaction_type, objKey_(activity, ['like', 'LIKE']));
  var comments = first_(u.post ? u.post.comments : undefined, u.reel ? u.reel.comments : undefined,
    objKey_(activity, ['comment', 'COMMENT']), objKey_(social, ['COMMENT', 'comment', 'comments']));
  var shares = first_(objKey_(activity, ['share', 'SHARE']), u.post ? u.post.shares : undefined,
    objKey_(social, ['SHARE', 'share', 'shares']));
  return {
    views: views, reach: reach, reactions: reactions, comments: comments, shares: shares,
    interactions: sum_([reactions, comments, shares]),
    clicks: first_(pv.post_clicks),
    follows: first_(rv.post_video_followers),
    avgWatchMs: first_(rv.post_video_avg_time_watched, pv.post_video_avg_time_watched),
    watchMs: first_(rv.post_video_view_time, pv.post_video_view_time),
    status: [u.post ? u.post.insights_status : '', u.reel ? u.reel.insights_status : ''].filter(String).join('/')
  };
}

var IG_FORMAT_LABEL = { IG_REEL: 'Reel', IG_CAROUSEL: 'Carousel', IG_IMAGE: 'Image', IG_VIDEO: 'Video', IG_STORY: 'Story' };

function confidenceLabel_(s) {
  if (!s) return '';
  if (s.manual) return 'Manual';
  if (s.blind) return 'Time-only';
  if (s.sim >= 0.75 || s.score >= 1.3) return 'High';
  return 'Medium';
}

function dayInfo_(ms, tz) {
  var d = new Date(ms);
  var ds = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  var u = new Date(ds + 'T00:00:00Z');
  var dow = (u.getUTCDay() + 6) % 7;
  var monday = new Date(u.getTime() - dow * 86400000).toISOString().slice(0, 10);
  return { day: ds, week: monday, month: ds.slice(0, 7) };
}

function link_(url, label) {
  if (!url) return '';
  return { f: '=HYPERLINK("' + String(url).replace(/"/g, '%22') + '","' + label + '")' };
}

/** Builds one unified record (IG anchor + any number of FB units). */
function contentRecord_(ig, units, scores, cfg) {
  var r = {};
  var v = ig ? parseJson_(ig.insights_json, {}) : {};

  if (ig) {
    var kind = igKind_(ig.product_type, ig.media_type);
    r.id = 'IG_' + ig.media_id;
    r.time = num_(ig.timestamp);
    r.format = IG_FORMAT_LABEL[kind] || 'Post';
    r.caption = ig.caption;
    r.igUrl = ig.permalink;
    r.igViews = first_(v.views);
    r.igReach = first_(v.reach);
    r.igLikes = first_(v.likes, ig.like_count);
    r.igComments = first_(v.comments, ig.comments_count);
    r.igShares = first_(v.shares);
    r.igSaves = first_(v.saved);
    r.igReposts = first_(v.reposts);
    var lcss = sum_([r.igLikes, r.igComments, r.igShares, r.igSaves]);
    r.igInter = lcss ? lcss : first_(v.total_interactions, lcss);
    r.igFollows = first_(v.follows);
    r.igPV = first_(v.profile_visits);
    var avg = first_(v.ig_reels_avg_watch_time);
    r.igAvgWatch = avg === undefined ? undefined : round_(avg / 1000, 1);
    var tot = first_(v.ig_reels_video_view_total_time);
    r.igWatchMin = tot === undefined ? undefined : round_(tot / 60000, 1);
    var skip = first_(v.reels_skip_rate);
    r.igSkip = skip === undefined ? undefined : round_(skip <= 1 ? skip * 100 : skip, 1);
    r.igFromFb = first_(v.facebook_views, v.crossposted_views);
    r.igStatus = ig.insights_status || (ig.insights_at ? '' : 'pending');
    r.igMediaId = String(ig.media_id);
  } else {
    r.id = 'FB_' + units[0].key;
    r.time = units[0].time;
    r.format = units[0].label;
    r.caption = units[0].text;
  }

  var fb = units.map(fbUnitMetrics_);
  r.fbViews = sum_(fb.map(function (m) { return m.views; }));
  r.fbReach = sum_(fb.map(function (m) { return m.reach; }));
  r.fbReactions = sum_(fb.map(function (m) { return m.reactions; }));
  r.fbComments = sum_(fb.map(function (m) { return m.comments; }));
  r.fbShares = sum_(fb.map(function (m) { return m.shares; }));
  r.fbInter = sum_(fb.map(function (m) { return m.interactions; }));
  r.fbClicks = sum_(fb.map(function (m) { return m.clicks; }));
  r.fbFollows = sum_(fb.map(function (m) { return m.follows; }));
  var watch = sum_(fb.map(function (m) { return m.watchMs; }));
  r.fbWatchMin = watch === undefined ? undefined : round_(watch / 60000, 1);
  var wSum = 0, wViews = 0, simple = [];
  fb.forEach(function (m) {
    if (m.avgWatchMs === undefined) return;
    simple.push(m.avgWatchMs);
    if (m.views) { wSum += m.avgWatchMs * m.views; wViews += m.views; }
  });
  r.fbAvgWatch = wViews ? round_(wSum / wViews / 1000, 1) :
    (simple.length ? round_(sum_(simple) / simple.length / 1000, 1) : undefined);

  var pages = [];
  units.forEach(function (u) { if (pages.indexOf(u.pageName) < 0) pages.push(u.pageName); });
  r.pages = pages.join(', ');
  r.fbUrls = units.map(function (u) { return u.permalink; }).filter(String);
  r.fbIds = [];
  units.forEach(function (u) { r.fbIds = r.fbIds.concat(u.ids); });

  if (ig && !units.length && r.igFromFb) {
    r.surface = 'IG + FB (shared from IG)';
    r.fbViews = r.igFromFb;
  } else if (ig && units.length) {
    r.surface = 'IG + FB' + (units.length > 1 ? ' (' + units.length + ' Pages)' : '');
  } else if (ig) {
    r.surface = 'IG only';
  } else {
    r.surface = 'FB only' + (units.length > 1 ? ' (' + units.length + ' Pages)' : '');
  }

  // combined + KPIs
  r.totalViews = sum_([r.igViews, r.fbViews]);
  r.totalReach = sum_([r.igReach, r.fbReach]);
  r.totalInter = sum_([r.igInter, r.fbInter]);
  r.sharesAll = sum_([r.igShares, r.fbShares]);
  r.commentsAll = sum_([r.igComments, r.fbComments]);
  r.followsAll = sum_([r.igFollows, r.fbFollows]);
  r.combinedErr = ratio_(r.totalInter, r.totalReach, 100);
  r.igErr = ratio_(r.igInter, r.igReach, 100);
  r.fbErr = ratio_(r.fbInter, r.fbReach, 100);
  r.savesPer1k = ratio_(r.igSaves, r.igReach, 1000);
  r.sharesPer1k = ratio_(r.sharesAll, r.totalReach, 1000);
  r.commentsPer1k = ratio_(r.commentsAll, r.totalReach, 1000);
  r.pvPer1k = ratio_(r.igPV, r.igReach, 1000);
  r.followsPer1k = ratio_(r.followsAll, r.totalReach, 1000);
  r.frequency = ratio_(r.igViews, r.igReach, 1);
  r.fbCtr = ratio_(r.fbClicks, r.fbReach, 100);

  if (!units.length) r.confidence = ig ? 'IG only' : '';
  else if (!ig) r.confidence = 'FB only';
  else {
    var labels = scores.map(confidenceLabel_);
    r.confidence = ['Time-only', 'Medium', 'High', 'Manual'].filter(function (l) { return labels.indexOf(l) >= 0; })[0] || '';
  }
  var st = [];
  if (ig) st.push('IG ' + (r.igStatus || 'ok'));
  fb.forEach(function (m) { st.push('FB ' + (m.status || 'pending')); });
  r.status = st.join(' | ').slice(0, 200);
  r.scores = scores;
  r.units = units;
  return r;
}

/** Reads user-typed columns so a rebuild never wipes them. */
function readPreserved_(sh) {
  var out = { byId: {}, byFbId: {}, extraHeaders: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var idCol = head.indexOf('Content ID');
  var fbCol = head.indexOf('FB Object IDs');
  if (idCol < 0) return out;
  head.forEach(function (h) {
    if (h && CONTENT_HEADERS.indexOf(h) < 0 && out.extraHeaders.indexOf(h) < 0) out.extraHeaders.push(h);
  });
  var keep = MANUAL_COLS.concat(out.extraHeaders);
  for (var r = 1; r < values.length; r++) {
    var id = String(values[r][idCol] || '');
    if (!id) continue;
    var rec = {}, any = false;
    keep.forEach(function (h) {
      var c = head.indexOf(h);
      if (c >= 0 && values[r][c] !== '' && values[r][c] !== null) { rec[h] = values[r][c]; any = true; }
    });
    if (!any) continue;
    out.byId[id] = rec;
    if (id.indexOf('FB_') === 0 && fbCol >= 0) {
      String(values[r][fbCol] || '').split(/[\s,]+/).forEach(function (x) { if (x) out.byFbId[x] = rec; });
    }
  }
  return out;
}

function recordToRow_(r, manual, tz, nowDate) {
  var di = dayInfo_(r.time || 0, tz);
  r.week = di.week; r.month = di.month; r.day = di.day;
  var m = manual || {};
  r.leads = n_(m['Leads']);
  var cells = {
    'Content ID': r.id,
    'Published': r.time ? new Date(r.time) : '',
    'Week': di.week, 'Month': di.month,
    'Format': r.format, 'Published On': r.surface, 'FB Pages': r.pages,
    'Caption': String(r.caption || '').replace(/\s+/g, ' ').slice(0, 250),
    'IG Link': link_(r.igUrl, 'Open IG'),
    'FB Link': link_(r.fbUrls[0], r.fbUrls.length > 1 ? 'Open FB (+' + (r.fbUrls.length - 1) + ')' : 'Open FB'),
    'Total Views': r.totalViews, 'Total Reach': r.totalReach, 'Total Interactions': r.totalInter,
    'Combined ERR %': r.combinedErr,
    'IG Views': r.igViews, 'IG Reach': r.igReach, 'IG Likes': r.igLikes, 'IG Comments': r.igComments,
    'IG Shares': r.igShares, 'IG Saves': r.igSaves, 'IG Reposts': r.igReposts, 'IG Interactions': r.igInter,
    'IG Follows': r.igFollows, 'IG Profile Visits': r.igPV, 'IG Avg Watch (s)': r.igAvgWatch,
    'IG Watch Time (min)': r.igWatchMin, 'IG Skip Rate %': r.igSkip, 'IG Views From FB': r.igFromFb,
    'FB Views': r.fbViews, 'FB Reach': r.fbReach, 'FB Reactions': r.fbReactions, 'FB Comments': r.fbComments,
    'FB Shares': r.fbShares, 'FB Interactions': r.fbInter, 'FB Clicks': r.fbClicks, 'FB Follows': r.fbFollows,
    'FB Avg Watch (s)': r.fbAvgWatch, 'FB Watch Time (min)': r.fbWatchMin,
    'IG ERR %': r.igErr, 'FB ERR %': r.fbErr, 'Saves /1k Reach': r.savesPer1k, 'Shares /1k Reach': r.sharesPer1k,
    'Comments /1k Reach': r.commentsPer1k, 'Profile Visits /1k Reach': r.pvPer1k, 'Follows /1k Reach': r.followsPer1k,
    'View Frequency': r.frequency, 'FB Click CTR %': r.fbCtr,
    'Leads /1k Reach': ratio_(r.leads, r.totalReach, 1000),
    'IG URL': r.igUrl || '', 'FB URLs': r.fbUrls.join('\n'), 'IG Media ID': r.igMediaId || '',
    'FB Object IDs': r.fbIds.join(', '), 'Match Confidence': r.confidence, 'Insights Status': r.status,
    'Last Synced': nowDate
  };
  MANUAL_COLS.forEach(function (h) { if (m[h] !== undefined) cells[h] = m[h]; });
  return cells;
}

function toCell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object' && !(v instanceof Date) && v.f) return v.f;
  return cellValue_(v);
}

/**
 * Rebuilds "01 Content" + "06 Match Review" from the raw stores.
 * Returns the records (used by the dashboards).
 */
function buildContent_(cfg, igStore, fbStore) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pageIds = cfg.pages.map(function (p) { return p.id; });
  var igObjs = igStore.objects().filter(function (o) { return !isTrue_(o.deleted) && o.product_type !== 'AD' && num_(o.timestamp); });
  var fbObjs = fbStore.objects().filter(function (o) { return pageIds.indexOf(String(o.page_id)) >= 0 && num_(o.created_time); });
  var units = buildFbUnits_(fbObjs);
  var m = matchContent_(igObjs, units, cfg, readOverrides_());

  var recs = m.groups.map(function (g) { return contentRecord_(g.ig, g.units, g.scores, cfg); });
  if (cfg.includeFbOnly) m.fbOnly.forEach(function (c) { recs.push(contentRecord_(null, c, [], cfg)); });
  recs.sort(function (a, b) { return b.time - a.time; });

  var sh = ensureHeaders_(ss, CFG.SH.CONTENT, CONTENT_HEADERS, 3);
  var keep = readPreserved_(sh);
  var headers = CONTENT_HEADERS.concat(keep.extraHeaders);
  var nowDate = new Date();

  var out = recs.map(function (r) {
    var manual = keep.byId[r.id];
    if (!manual) for (var i = 0; i < r.fbIds.length && !manual; i++) manual = keep.byFbId[r.fbIds[i]];
    var cells = recordToRow_(r, manual, cfg.tz, nowDate);
    keep.extraHeaders.forEach(function (h) { if (manual && manual[h] !== undefined) cells[h] = manual[h]; });
    return headers.map(function (h) { return toCell_(cells[h]); });
  });

  writeTable_(sh, headers, out);
  if (out.length) {
    var col = function (h) { return headers.indexOf(h) + 1; };
    sh.getRange(2, col('Published'), out.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange(2, col('Last Synced'), out.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange(2, col('Total Views'), out.length, col('FB Click CTR %') - col('Total Views') + 1).setNumberFormat('#,##0.##');
  }
  writeMatchReview_(recs, m, cfg);
  return recs;
}

/** Writes header + rows and clears anything below. */
function writeTable_(sh, headers, rows) {
  var oldRows = sh.getLastRow(), oldCols = sh.getLastColumn();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh.getRange(1, 1, 1, headers.length));
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  if (oldRows > rows.length + 1) {
    sh.getRange(rows.length + 2, 1, oldRows - rows.length - 1, Math.max(oldCols, headers.length)).clearContent();
  }
  if (oldCols > headers.length && oldRows > 0) {
    sh.getRange(1, headers.length + 1, oldRows, oldCols - headers.length).clearContent();
  }
  if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
}

function writeMatchReview_(recs, m, cfg) {
  var sh = sheet_(SpreadsheetApp.getActiveSpreadsheet(), CFG.SH.REVIEW);
  var headers = ['Content ID', 'Published', 'Published On', 'Confidence', 'IG Caption', 'FB Page', 'FB Caption',
    'Gap (min)', 'Caption Similarity', 'IG Media ID', 'FB Object ID', 'Nearest IG post (FB-only rows)'];
  var igSorted = m.groups.map(function (g) { return g.doc; }).sort(function (a, b) { return a.time - b.time; });
  var rows = [];
  recs.forEach(function (r) {
    var when = r.time ? new Date(r.time) : '';
    if (!r.units.length) {
      rows.push([r.id, when, r.surface, r.confidence, snip_(r.caption), '', '', '', '', r.igMediaId || '', '', '']);
      return;
    }
    r.units.forEach(function (u, i) {
      var s = r.scores[i];
      var nearest = '';
      if (!r.igMediaId) {
        var best = null;
        igSorted.forEach(function (d) {
          if (d.family === 'S') return;
          var gap = Math.abs(d.time - u.time);
          if (gap <= 6 * 3600000 && (!best || gap < best.gap)) best = { d: d, gap: gap };
        });
        if (best) nearest = best.d.key + ' (' + Math.round(best.gap / 60000) + ' min apart): ' + snip_(best.d.text, 60);
      }
      rows.push([r.id, when, r.surface, s ? confidenceLabel_(s) : r.confidence,
        r.igMediaId ? snip_(r.caption) : '', u.pageName, snip_(u.text),
        s ? Math.round(s.dtMin) : '', s ? Math.round(s.sim * 100) / 100 : '',
        r.igMediaId || '', u.ids.join(', '), nearest]);
    });
  });
  writeTable_(sh, headers, rows.map(function (row) { return row.map(toCell_); }));
  if (rows.length) sh.getRange(2, 2, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
}

function snip_(s, n) {
  return String(s || '').replace(/\s+/g, ' ').slice(0, n || 90);
}
