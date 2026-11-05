// Fake Graph API v26.0 with realistic quirks: deprecated metrics, per-type metric
// support, whole-call failure on one bad metric, field errors, "reduce data"
// errors, batch nulls, usage headers, page tokens, pagination.
'use strict';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const IG_ID = '17841400000000001';
const PAGE_A = '104000000000001';
const PAGE_B = '104000000000002';
const PAGE_C = '555000111222333';

const WORDS = ['shani', 'rahu', 'ketu', 'mangal', 'dosh', 'kundli', 'upay', 'grah', 'shanti', 'lagna', 'bhagya', 'dhan',
  'vivah', 'career', 'health', 'sade', 'sati', 'mahadasha', 'gemstone', 'neelam', 'pukhraj', 'moonga', 'panna', 'mantra',
  'हनुमान', 'चालीसा', 'शनिवार', 'मंगलवार', 'उपाय', 'ग्रह', 'दोष', 'कुंडली', 'भाग्य', 'धन', 'विवाह', 'राहु', 'केतु',
  'kaise', 'kyun', 'kab', 'sahi', 'galat', 'myth', 'truth', 'secret', 'remedy', 'ritual', 'temple', 'fasting', 'budh',
  'guru', 'shukra', 'surya', 'chandra', 'nakshatra', 'rashi', 'mesh', 'vrishabh', 'mithun', 'kark', 'singh', 'kanya',
  'tula', 'vrishchik', 'dhanu', 'makar', 'kumbh', 'meen', 'transit', 'gochar', 'retrograde', 'vakri', 'eclipse', 'grahan'];
const FOOTER = '\n\n📞 Call/WhatsApp: +91 98765 43210\nDr. Om Shandilya | Vedic Astrologer | Book your consultation today\n#astrology #vedicastrology #kundli #jyotish #horoscope';

const IG_VALID = {
  FEED: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'follows', 'profile_visits', 'profile_activity', 'reposts', 'facebook_views'],
  REELS: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate', 'reposts', 'facebook_views', 'crossposted_views'],
  STORY: ['reach', 'views', 'shares', 'total_interactions', 'follows', 'profile_visits', 'profile_activity', 'replies', 'navigation', 'reposts', 'link_clicks', 'facebook_views']
};
const IG_ALL = new Set([].concat(IG_VALID.FEED, IG_VALID.REELS, IG_VALID.STORY));
const FB_POST_VALID = ['post_media_view', 'post_total_media_view_unique', 'post_clicks', 'post_reactions_by_type_total', 'post_activity_by_action_type'];
const FB_VPOST_EXTRA = ['post_video_views', 'post_video_avg_time_watched', 'post_video_view_time', 'post_video_length'];
const FB_REEL_VALID = ['blue_reels_play_count', 'fb_reels_total_plays', 'fb_reels_replay_count', 'post_impressions_unique',
  'post_video_avg_time_watched', 'post_video_view_time', 'post_video_followers', 'post_video_social_actions', 'post_video_likes_by_reaction_type'];

function build(nowMs, opts) {
  opts = opts || {};
  const r = rng(opts.seed || 42);
  const pick = a => a[Math.floor(r() * a.length)];
  const hook = n => Array.from({ length: n }, () => pick(WORDS)).join(' ');
  let idc = 18000000000000000n;
  const nid = () => { idc += 1000n + BigInt(Math.floor(r() * 1000)); return String(idc); };

  const ig = [];
  const fb = { [PAGE_A]: { posts: [], reels: [] }, [PAGE_B]: { posts: [], reels: [] }, [PAGE_C]: { posts: [], reels: [] } };
  const truth = {};   // fb object id -> ig id ('' = FB-only)
  const N = opts.n || 1200;
  let t = nowMs - 3 * 3600e3;
  for (let i = 0; i < N; i++) {
    t -= (0.6 + r() * 0.9) * 86400e3;
    // occasional second post the same day, 40 min apart (hard case for matching)
    const times = r() < 0.08 ? [t, t - 40 * 60e3] : [t];
    times.forEach(ts => {
      const x = r();
      const pt = x < 0.55 ? 'REELS' : 'FEED';
      const mt = x < 0.55 ? 'VIDEO' : x < 0.8 ? 'CAROUSEL_ALBUM' : 'IMAGE';
      const captionless = r() < 0.03;
      const cap = captionless ? '' : hook(8 + Math.floor(r() * 10)) + '\n' + hook(12) + FOOTER;
      const id = nid();
      ig.push({ id, timestamp: iso(ts), media_type: mt, media_product_type: pt, caption: cap || undefined,
        permalink: 'https://www.instagram.com/p/' + id.slice(-8) + '/', like_count: Math.floor(r() * 500), comments_count: Math.floor(r() * 40),
        shortcode: id.slice(-8), _ts: ts });
      // Page A cross-post (85%)
      if (r() < 0.85) addFb(PAGE_A, id, ts + (r() * 6 - 2) * 60e3, cap, pt, mt);
      // Page B cross-post (40%), some scheduled hours later
      if (r() < 0.4) addFb(PAGE_B, id, ts + (r() < 0.12 ? (3 + r() * 17) * 3600e3 : r() * 10 * 60e3), cap, pt, mt);
    });
  }
  // live stories (not in /media)
  const stories = [0, 1].map(k => ({ id: nid(), timestamp: iso(nowMs - (2 + k * 5) * 3600e3), media_type: 'IMAGE', media_product_type: 'STORY',
    permalink: 'https://www.instagram.com/stories/x/' + k, _ts: nowMs - (2 + k * 5) * 3600e3 }));

  // FB-only posts: 40 on A, 10 of them also on B
  for (let k = 0; k < 40; k++) {
    const ts = nowMs - r() * 900 * 86400e3;
    const cap = 'FB special: ' + hook(14) + FOOTER;
    const idA = addFb(PAGE_A, '', ts, cap, 'FEED', 'IMAGE');
    if (k < 10) addFb(PAGE_B, '', ts + 60e3, cap, 'FEED', 'IMAGE');
    void idA;
  }

  function addFb(page, igId, ts, cap, pt, mt) {
    let msg = cap;
    if (msg && r() < 0.3) msg = msg.replace(/#\w+/g, '').trim();          // hashtags stripped
    if (msg && r() < 0.1) msg = msg.split('\n')[0];                         // only first line
    const postNum = nid();
    const postId = page + '_' + postNum;
    if (pt === 'REELS') {
      const reelId = nid();
      fb[page].reels.push({ id: reelId, description: msg || undefined, created_time: iso(ts), updated_time: iso(ts + 3600e3),
        permalink_url: '/reel/' + reelId + '/', length: 20 + Math.floor(r() * 60), _ts: ts });
      truth[reelId] = igId;
      const y = r();
      if (y < 0.9) {
        const withTarget = y < 0.7;
        fb[page].posts.push({ id: postId, message: msg || undefined, created_time: iso(ts + 5e3), permalink_url: 'https://www.facebook.com/reel/' + reelId,
          status_type: 'added_video', _video: true,
          attachments: { data: [withTarget ? { media_type: 'video', type: 'video_inline', target: { id: reelId }, url: 'x' } : { media_type: 'video', type: 'video_inline', url: 'x' }] },
          _reel: reelId, _ts: ts + 5e3 });
        truth[postId] = igId;
      }
      return reelId;
    }
    fb[page].posts.push({ id: postId, message: msg || undefined, created_time: iso(ts), permalink_url: 'https://www.facebook.com/' + postId,
      status_type: 'added_photos', attachments: { data: [{ media_type: mt === 'CAROUSEL_ALBUM' ? 'album' : 'photo', type: mt === 'CAROUSEL_ALBUM' ? 'album' : 'photo', target: { id: nid() } }] },
      _ts: ts });
    truth[postId] = igId;
    return postId;
  }

  Object.values(fb).forEach(p => { p.posts.sort((a, b) => b._ts - a._ts); p.reels.sort((a, b) => b._ts - a._ts); });
  ig.sort((a, b) => b._ts - a._ts);
  return { ig, stories, fb, truth, r };
}

function iso(ms) { return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+0000'); }

function makeServer(clock, opts) {
  opts = opts || {};
  const now0 = clock.now();
  const D = build(now0, opts);
  const stats = { gets: 0, batches: 0, subs: 0, errors: {} };
  const igById = {};
  D.ig.concat(D.stories).forEach(m => { igById[m.id] = m; });
  const fbById = {};
  Object.entries(D.fb).forEach(([pid, p]) => { p.posts.forEach(x => { fbById[x.id] = { o: x, page: pid, type: 'post' }; });
    p.reels.forEach(x => { fbById[x.id] = { o: x, page: pid, type: 'reel' }; }); });
  let totalCalls = 0;

  const err = (code, message, extra) => ({ code: code >= 500 ? 500 : 400, body: { error: Object.assign({ code, message, type: 'OAuthException' }, extra || {}) } });
  const ok = body => ({ code: 200, body });

  function usage() {
    totalCalls++;
    const pct = (opts.spikeAt && totalCalls >= opts.spikeAt && totalCalls < opts.spikeAt + 5) ? 91 : 12;
    return { 'x-app-usage': JSON.stringify({ call_count: pct, total_cputime: 3, total_time: 4 }) };
  }

  function val(seed, lo, hi) { const x = Math.sin(seed) * 10000; return Math.floor(lo + (x - Math.floor(x)) * (hi - lo)); }

  function igInsights(m, metrics) {
    const age = (clock.now() - m._ts) / 86400e3;
    if (m.media_product_type === 'STORY' && age > 1) return err(100, '(#100) Object with ID \'' + m.id + '\' does not exist', { error_subcode: 33 });
    if (age > 1000) return err(100, 'Media Posted Before Business Account Conversion', { error_subcode: 2108006 });
    if (Number(m.id.slice(-2)) === 7) return err(10, '(#10) Not enough viewers for the media to show insights');
    const valid = IG_VALID[m.media_product_type];
    for (const x of metrics) {
      if (!IG_ALL.has(x)) return err(100, '(#100) metric[0] must be one of the following values: reach, likes, ...');
      if (valid.indexOf(x) < 0) return err(100, '(#100) The Media Insights API does not support the ' + x + ' metric for this media product type.');
    }
    const s = Number(m.id.slice(-6));
    const reach = val(s, 200, 20000);
    const data = metrics.map(x => {
      let v = val(s + x.length, 0, reach / 10);
      if (x === 'reach') v = reach;
      if (x === 'views') v = Math.floor(reach * 1.6);
      if (x === 'ig_reels_avg_watch_time') v = val(s, 2000, 25000);
      if (x === 'ig_reels_video_view_total_time') v = val(s, 2000, 25000) * reach;
      if (x === 'reels_skip_rate') v = val(s, 10, 70) + 0.5;
      if (x === 'facebook_views' || x === 'crossposted_views') v = 0;   // only non-zero when shared from the IG app
      if (x === 'navigation') return { name: x, period: 'lifetime', total_value: { value: 40 } };
      return { name: x, period: 'lifetime', values: [{ value: v }], id: m.id + '/insights/' + x + '/lifetime' };
    });
    return ok({ data });
  }

  function fbInsights(f, metrics, token, edge) {
    if (token !== 'PT_' + f.page) return err(10, '(#10) This endpoint requires the pages_read_engagement permission');
    if (f.type === 'reel' && edge !== 'video_insights') return err(100, '(#100) Tried accessing nonexisting field (insights) on node type (Video)');
    if (f.type === 'post' && edge !== 'insights') return err(100, '(#100) Tried accessing nonexisting field (video_insights)');
    const valid = f.type === 'reel' ? FB_REEL_VALID : FB_POST_VALID.concat(f.o._video ? FB_VPOST_EXTRA : []);
    for (const x of metrics) {
      if (/^post_impressions/.test(x) && f.type === 'post') return err(100, '(#100) The value must be a valid insights metric');
      if (valid.indexOf(x) < 0) {
        if (FB_VPOST_EXTRA.indexOf(x) >= 0) return err(100, '(#100) The metric ' + x + ' is not available for this post type');
        return err(100, '(#100) The value must be a valid insights metric');
      }
    }
    const s = Number(String(f.o.id).slice(-6));
    const reach = val(s, 50, 8000);
    const data = metrics.map(x => {
      let v = val(s + x.length, 0, reach / 8);
      if (x === 'post_total_media_view_unique' || x === 'post_impressions_unique') v = reach;
      if (x === 'post_media_view' || x === 'fb_reels_total_plays' || x === 'blue_reels_play_count') v = Math.floor(reach * 1.4);
      if (x === 'post_video_social_actions') v = { COMMENT: 3, SHARE: 5 };
      if (x === 'post_video_likes_by_reaction_type' || x === 'post_reactions_by_type_total') v = { like: 10, love: 4 };
      if (x === 'post_activity_by_action_type') v = { like: 14, comment: 6, share: 3 };
      return { name: x, period: 'lifetime', values: [{ value: v }] };
    });
    return ok({ data });
  }

  function listPage(arr, params, base, mapFn) {
    const limit = Math.min(100, Number(params.limit || 25));
    const after = params.after ? Number(Buffer.from(params.after, 'base64').toString()) : 0;
    const slice = arr.slice(after, after + limit).map(mapFn);
    const body = { data: slice, paging: { cursors: { before: 'MA==', after: Buffer.from(String(after + limit)).toString('base64') } } };
    if (after + limit < arr.length) {
      const q = Object.assign({}, params, { after: Buffer.from(String(after + limit)).toString('base64') });
      body.paging.next = base + '?' + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    }
    return ok(body);
  }

  const strip = o => { const c = {}; Object.keys(o).forEach(k => { if (k[0] !== '_') c[k] = o[k]; }); return c; };

  function handleGet(path, params, token) {
    if (!token) return err(190, 'An active access token must be used');
    if (token === 'EXPIRED') return err(190, 'Error validating access token: Session has expired');
    const parts = path.split('/').filter(Boolean);
    const base = 'https://graph.facebook.com/v26.0/' + parts.join('/');
    const fields = String(params.fields || '');

    if (parts[0] === 'me' && parts[1] === 'accounts') {
      return ok({ data: [
        { id: PAGE_A, name: 'Dr Om Astrology', instagram_business_account: { id: IG_ID, username: 'dr.om' } },
        { id: PAGE_B, name: 'Om Jyotish Kendra' },
        { id: PAGE_C, name: 'Unrelated Page' }] });
    }
    if (parts[0] === 'me') return ok({ id: '999', name: 'Sync System User' });
    if (parts[0] === 'debug_token') return ok({ data: { expires_at: 0, scopes: ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'read_insights', 'business_management'] } });

    if (parts[0] === IG_ID) {
      if (!parts[1]) return ok({ id: IG_ID, username: 'dr.om', followers_count: 25310, media_count: D.ig.length });
      if (parts[1] === 'media') {
        if (params.limit > 100) return err(100, '(#100) limit too large');
        return listPage(D.ig, params, base, m => {
          const o = strip(m);
          const allowed = fields.split(',');
          Object.keys(o).forEach(k => { if (k !== 'id' && allowed.indexOf(k) < 0) delete o[k]; });
          return o;
        });
      }
      if (parts[1] === 'stories') return ok({ data: D.stories.filter(s => clock.now() - s._ts < 86400e3).map(strip) });
      if (parts[1] === 'insights') {
        const m = params.metric;
        if (params.metric_type !== 'total_value') return err(100, '(#100) metric_type=total_value is required');
        if (m === 'profile_links_taps') return err(100, '(#100) metric[0] must be one of the following values: reach, views');
        if (m.indexOf(',') >= 0) return err(100, '(#100) Too many metrics');
        const s = Number(params.since) % 100000;
        const tv = { value: val(s + m.length, 100, 5000) };
        if (params.breakdown === 'follow_type') {
          tv.breakdowns = [{ dimension_keys: ['follow_type'], results: [
            { dimension_values: ['FOLLOWER'], value: m === 'reach' ? Math.floor(tv.value * 0.4) : 30 },
            { dimension_values: ['NON_FOLLOWER'], value: m === 'reach' ? Math.floor(tv.value * 0.6) : 8 }] }];
        }
        return ok({ data: [{ name: m, period: 'day', total_value: tv, id: IG_ID + '/insights/' + m + '/day' }] });
      }
    }

    if ([PAGE_A, PAGE_B, PAGE_C].indexOf(parts[0]) >= 0) {
      const pid = parts[0];
      if (!parts[1]) {
        if (fields.indexOf('access_token') >= 0) return ok({ id: pid, name: 'Page ' + pid, access_token: 'PT_' + pid });
        if (token !== 'PT_' + pid) return err(10, '(#10) needs page token');
        return ok({ id: pid, followers_count: pid === PAGE_A ? 41000 : 3900, fan_count: 1 });
      }
      if (token !== 'PT_' + pid) return err(190, 'Invalid OAuth 2.0 Access Token (page token required)');
      if (parts[1] === 'published_posts' || parts[1] === 'posts') {
        if (opts.noUserContent && /reactions|comments/.test(fields)) {
          return err(10, "(#10) This endpoint requires the 'pages_read_user_content' permission or the 'Page Public Content Access' feature. Refer to https://developers.facebook.com/docs/apps/review/login-permissions#manage-pages for details.");
        }
        if (fields.indexOf('filter(stream)') >= 0) return err(100, '(#100) Syntax error "Expected end of string instead of "("." at character 180: filter(stream)');
        if (pid === PAGE_A && Number(params.limit) > 50 && fields.indexOf('attachments') >= 0) {
          return err(1, "Please reduce the amount of data you're asking for, then retry your request");
        }
        return listPage(D.fb[pid].posts, params, base, p => {
          const o = strip(p);
          if (fields.indexOf('attachments') < 0) delete o.attachments;
          if (fields.indexOf('reactions') >= 0) o.reactions = { data: [], summary: { total_count: val(Number(p.id.slice(-5)), 0, 300) } };
          if (fields.indexOf('comments') >= 0) o.comments = { data: [], summary: { total_count: val(Number(p.id.slice(-4)), 0, 30) } };
          if (fields.indexOf('shares') >= 0 && Number(p.id.slice(-1)) % 3) o.shares = { count: val(Number(p.id.slice(-3)), 1, 40) };
          if (fields.indexOf('status_type') < 0) delete o.status_type;
          return o;
        });
      }
      if (parts[1] === 'video_reels') {
        if (fields.indexOf('post_id') >= 0) return err(100, '(#100) Tried accessing nonexisting field (post_id) on node type (Video)');
        return listPage(D.fb[pid].reels, params, base, v => strip(v));
      }
      if (parts[1] === 'insights') {
        const m = params.metric;
        if (m === 'page_views_total') return err(100, '(#100) The value must be a valid insights metric');
        const since = Number(params.since) * 1000, until = Number(params.until) * 1000;
        const values = [];
        for (let d = since; d < until; d += 86400e3) {
          const day = new Date(d + 12 * 3600e3).toISOString().slice(0, 10);
          values.push({ value: val(d / 1e5 + m.length, 1, 300), end_time: iso(Date.parse(day + 'T00:00:00Z') + 86400e3 + 7 * 3600e3) });
        }
        return ok({ data: [{ name: m, period: 'day', values }] });
      }
    }

    const f = fbById[parts[0]];
    if (f && (parts[1] === 'insights' || parts[1] === 'video_insights')) {
      return fbInsights(f, String(params.metric || '').split(','), token, parts[1]);
    }
    const m = igById[parts[0]];
    if (m && parts[1] === 'insights') return igInsights(m, String(params.metric || '').split(','));

    return err(100, '(#100) Unsupported get request. Object with ID \'' + parts[0] + '\' does not exist', { error_subcode: 33 });
  }

  function parseUrl(u) {
    const url = new URL(u.indexOf('http') === 0 ? u : 'https://graph.facebook.com/v26.0/' + u);
    const path = url.pathname.replace(/^\/v\d+\.\d+/, '');
    const params = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });
    return { path, params };
  }

  function fetch(url, o) {
    const headers = usage();
    if (o.method === 'post') {
      stats.batches++;
      const batch = JSON.parse(o.payload.batch);
      if (batch.length > 50) return { code: 400, body: JSON.stringify({ error: { code: 1, message: 'batch too large' } }), headers };
      const heavy = batch.filter(b => /video_insights/.test(b.relative_url) && /metric=[^&]*%2C[^&]*%2C[^&]*%2C/.test(b.relative_url)).length;
      const out = batch.map(b => {
        stats.subs++;
        if (opts.nullRate && D.r() < opts.nullRate) return null;
        // stuckReels: like the real sheet on 22 Sept - a reel asked for 4+ metrics at once never answers in time.
        if (opts.stuckMetric && /video_insights/.test(b.relative_url) && b.relative_url.indexOf('metric=' + opts.stuckMetric) >= 0) { stats.stuckNulls = (stats.stuckNulls || 0) + 1; return null; }
        if (opts.stuckReels && /video_insights/.test(b.relative_url) && /metric=[^&]*%2C[^&]*%2C[^&]*%2C/.test(b.relative_url)) { stats.stuckNulls = (stats.stuckNulls || 0) + 1; return null; }
        if (opts.heavyTimeouts && heavy > 10 && /video_insights/.test(b.relative_url) && D.r() < 0.7) { stats.heavyNulls = (stats.heavyNulls || 0) + 1; return null; }
        const p = parseUrl(b.relative_url);
        const res = handleGet(p.path, p.params, p.params.access_token || o.payload.access_token);
        if (res.body.error) {
          stats.errors[res.body.error.message.slice(0, 60)] = (stats.errors[res.body.error.message.slice(0, 60)] || 0) + 1;
          const k = res.body.error.message.slice(0, 40) + ' @ ' + p.path.replace(/\d+/g, 'N') + ' ' + (p.params.metric || '').split(',').length;
          (stats.samples = stats.samples || {})[k] = (stats.samples[k] || 0) + 1;
        }
        return { code: res.code, headers: Object.entries(usage()).map(([name, value]) => ({ name, value })), body: JSON.stringify(res.body) };
      });
      const slow = opts.slowHeavy && heavy > 5 ? opts.slowHeavy : 0;
      return { code: 200, body: JSON.stringify(out), headers, latency: 1200 + batch.length * 40 + slow };
    }
    stats.gets++;
    const p = parseUrl(url);
    const res = handleGet(p.path, p.params, p.params.access_token);
    if (res.body.error) stats.errors[res.body.error.message.slice(0, 60)] = (stats.errors[res.body.error.message.slice(0, 60)] || 0) + 1;
    return { code: res.code, body: JSON.stringify(res.body), headers, latency: 700 };
  }

  return { fetch, D, stats, IG_ID, PAGE_A, PAGE_B, PAGE_C };
}

module.exports = { makeServer };
