
/* ================================= MATCHING ================================= */
/*  Meta gives no link between an IG post and its Business Suite cross-post, so
 *  we pair them by: publish-time gap + caption similarity + format family.
 *  - Captions are normalised (hashtags, @mentions, links, phone numbers, emoji
 *    stripped; Hindi/Devanagari kept).
 *  - Words that appear in a big share of ALL captions (your sign-off, clinic
 *    address, "book now" lines) are ignored, so boilerplate can't cause false pairs.
 *  - Pairs are assigned greedily from the best score down: one FB object per Page
 *    per IG post, so a post that went to 3 Pages merges into one row.
 *  - "07 Match Overrides" can force (LINK) or forbid (BLOCK) any pair.        */

var NON_WORD_RE_ = (function () {
  try { return new RegExp('[^\\p{L}\\p{M}\\p{N}\\s]+', 'gu'); } catch (e) {
    return /[\u0000-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u00BF\u2000-\u2BFF\u2E00-\u2E7F\u3000-\u303F\uD800-\uDFFF\uFE00-\uFE0F\uFF00-\uFF0F]+/g;
  }
})();

function normText_(s) {
  return String(s || '').toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, ' ')
    .replace(/#[^\s#]+/g, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/\+?\d[\d\s\-]{7,}\d/g, ' ')
    .replace(NON_WORD_RE_, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens_(norm) {
  var seen = {}, out = [];
  norm.split(' ').forEach(function (t) {
    if (t.length < 2 || seen[t]) return;
    seen[t] = true;
    out.push(t);
  });
  return out;
}

function similarity_(a, b) {
  if (!a.length || !b.length) return 0;
  var set = {};
  a.forEach(function (t) { set[t] = true; });
  var inter = 0;
  b.forEach(function (t) { if (set[t]) inter++; });
  var dice = 2 * inter / (a.length + b.length);
  var overlap = inter / Math.min(a.length, b.length);
  return Math.max(dice, 0.85 * overlap);
}

/* ------------------------------ FB units ------------------------------ */

/** Merges a Page's post object and its Reel/video object into one FB unit. */
function buildFbUnits_(fbObjs) {
  var byPage = {};
  fbObjs.forEach(function (o) {
    if (isTrue_(o.deleted)) return;
    var pid = String(o.page_id);
    (byPage[pid] = byPage[pid] || { posts: [], reels: [] })[o.object_type === 'REEL' ? 'reels' : 'posts'].push(o);
  });

  var units = [];
  Object.keys(byPage).forEach(function (pid) {
    var posts = byPage[pid].posts, reels = byPage[pid].reels;
    var reelById = {}, postByAnyId = {}, reelUsed = {};
    reels.forEach(function (r) { reelById[String(r.object_id)] = r; });
    var pageUnits = posts.map(function (p) {
      var u = { post: p, reel: null };
      postByAnyId[String(p.object_id)] = u;
      var suffix = String(p.object_id).split('_').pop();
      postByAnyId[suffix] = u;
      var vid = String(p.linked_video_id || '');
      if (vid && reelById[vid] && !reelUsed[vid]) { u.reel = reelById[vid]; reelUsed[vid] = true; }
      return u;
    });

    reels.forEach(function (r) {
      var rid = String(r.object_id);
      if (reelUsed[rid]) return;
      var lp = String(r.linked_post_id || '');
      var u = lp ? (postByAnyId[lp] || postByAnyId[lp.split('_').pop()]) : null;
      if (u && !u.reel) { u.reel = r; reelUsed[rid] = true; }
    });

    // Heuristic: same Page, video post within 10 min with the same (or empty) text.
    reels.forEach(function (r) {
      var rid = String(r.object_id);
      if (reelUsed[rid]) return;
      var rt = normText_(r.message), best = null, bestDt = Infinity;
      pageUnits.forEach(function (u) {
        if (u.reel || (u.post.media_kind !== 'VIDEO' && u.post.media_kind !== 'UNKNOWN')) return;
        var dt = Math.abs(num_(u.post.created_time) - num_(r.created_time));
        if (dt > 10 * 60 * 1000) return;
        var pt = normText_(u.post.message);
        if (pt && rt && pt !== rt && similarity_(tokens_(pt), tokens_(rt)) < 0.8) return;
        if (dt < bestDt) { bestDt = dt; best = u; }
      });
      if (best) best.reel = r;
      else pageUnits.push({ post: null, reel: r });
      reelUsed[rid] = true;
    });

    pageUnits.forEach(function (u) { units.push(finishUnit_(u)); });
  });
  return units;
}

function finishUnit_(u) {
  var p = u.post, r = u.reel, main = p || r;
  var mk = p ? String(p.media_kind) : 'VIDEO';
  var label = r ? 'FB Reel' : ({ VIDEO: 'FB Video', PHOTO: 'FB Photo', ALBUM: 'FB Album', LINK: 'FB Link', TEXT: 'FB Text' }[mk] || 'FB Post');
  var family = (r || mk === 'VIDEO') ? 'V' : (mk === 'PHOTO' || mk === 'ALBUM') ? 'I' : (mk === 'LINK' || mk === 'TEXT') ? 'T' : '?';
  var text = (p && p.message) || (r && r.message) || '';
  var ids = [];
  if (p) ids.push(String(p.object_id));
  if (r) ids.push(String(r.object_id));
  return {
    key: String(r ? r.object_id : p.object_id),
    pageId: String(main.page_id),
    pageName: String(main.page_name || main.page_id),
    post: p, reel: r,
    time: num_(p ? p.created_time : r.created_time) || num_(r ? r.created_time : 0),
    text: text,
    label: label,
    family: family,
    permalink: (p && p.permalink) || (r && r.permalink) || '',
    ids: ids
  };
}

/* ------------------------------ scoring ------------------------------ */

function igFamily_(o) {
  var k = igKind_(o.product_type, o.media_type);
  return { IG_REEL: 'V', IG_VIDEO: 'V', IG_IMAGE: 'I', IG_CAROUSEL: 'C', IG_STORY: 'S' }[k] || '?';
}

function familiesCompatible_(a, b) {
  if (a === 'S' || b === 'S') return false;
  if (a === '?' || b === '?') return true;
  if (a === 'T' || b === 'T') return a === b;
  if (a === 'C' || b === 'C') return true;
  return a === b;
}

/** Adds .norm/.tok/.ftok (boilerplate-filtered tokens) to docs. */
function prepareDocs_(docs, pageCount) {
  var df = {};
  docs.forEach(function (d) {
    d.norm = normText_(d.text);
    d.tok = tokens_(d.norm);
    d.tok.forEach(function (t) { df[t] = (df[t] || 0) + 1; });
  });
  var n = docs.length;
  var threshold = n < 20 ? Infinity : Math.max(2 * (1 + pageCount) + 2, Math.ceil(0.15 * n));
  docs.forEach(function (d) {
    d.ftok = d.tok.filter(function (t) { return df[t] < threshold; });
  });
}

function pairScore_(a, b, cfg) {
  var windowMs = cfg.windowHours * 3600 * 1000;
  var dt = Math.abs(a.time - b.time);
  if (!a.time || !b.time || dt > windowMs) return null;
  if (!familiesCompatible_(a.family, b.family)) return null;
  var dtMin = dt / 60000;
  var timeScore = 1 - dt / windowMs;

  if (a.norm && a.norm === b.norm && a.tok.length >= 2) {
    return { score: 1 + 0.3 * timeScore + (dtMin <= 15 ? 0.2 : 0), sim: 1, dtMin: dtMin };
  }
  if (a.tok.length < 3 || b.tok.length < 3) {
    // No usable caption: rely on time only. If just ONE side has a caption,
    // be stricter (10 min), since a real cross-post normally shares the caption.
    var blind = (a.tok.length < 3 && b.tok.length < 3) ? cfg.blindMinutes : Math.min(cfg.blindMinutes, 10);
    if (dtMin > blind) return null;
    return { score: 0.5 + 0.3 * (1 - dtMin / blind), sim: 0, dtMin: dtMin, blind: true };
  }
  var useF = a.ftok.length >= 3 && b.ftok.length >= 3;
  var sim = similarity_(useF ? a.ftok : a.tok, useF ? b.ftok : b.tok);
  // The further apart in time, the more caption evidence we need.
  if (sim < cfg.minSim + 0.3 * (dt / windowMs)) return null;
  return { score: sim + 0.3 * timeScore + (dtMin <= 15 ? 0.2 : 0), sim: sim, dtMin: dtMin };
}

/** Returns units whose time is within the window of t (units sorted by time). */
function unitsNear_(sorted, t, windowMs) {
  var lo = 0, hi = sorted.length;
  while (lo < hi) { var mid = (lo + hi) >> 1; if (sorted[mid].time < t - windowMs) lo = mid + 1; else hi = mid; }
  var out = [];
  for (var i = lo; i < sorted.length && sorted[i].time <= t + windowMs; i++) out.push(sorted[i]);
  return out;
}

/* ------------------------------ main matcher ------------------------------ */

/**
 * igObjs: raw IG rows (not deleted). units: FB units.
 * Returns {groups:[{ig, units:[], scores:[]}], fbOnly:[[unit,...]]}
 */
function matchContent_(igObjs, units, cfg, overrides) {
  var igDocs = igObjs.map(function (o) {
    return { key: String(o.media_id), ig: o, text: o.caption, time: num_(o.timestamp), family: igFamily_(o) };
  });
  var pageCount = Math.max(1, cfg.pages.length);
  prepareDocs_(igDocs.concat(units), pageCount);

  var windowMs = cfg.windowHours * 3600 * 1000;
  var sorted = units.slice().sort(function (a, b) { return a.time - b.time; });
  var unitByObj = {};
  units.forEach(function (u) { u.ids.forEach(function (id) { unitByObj[id] = u; }); });

  var blocked = {};
  (overrides.block || []).forEach(function (p) {
    var u = unitByObj[p.fb];
    if (u) blocked[p.ig + '|' + u.key] = true;
  });

  var groupOf = {}, unitTaken = {}, pagesTaken = {};
  igDocs.forEach(function (d) { groupOf[d.key] = { ig: d.ig, doc: d, units: [], scores: [] }; pagesTaken[d.key] = {}; });

  function assign(igKey, u, s) {
    groupOf[igKey].units.push(u);
    groupOf[igKey].scores.push(s);
    unitTaken[u.key] = true;
    pagesTaken[igKey][u.pageId] = true;
  }

  (overrides.link || []).forEach(function (p) {
    var u = unitByObj[p.fb];
    if (!u || !groupOf[p.ig] || unitTaken[u.key]) return;
    assign(p.ig, u, { score: 99, sim: 1, dtMin: Math.abs(u.time - groupOf[p.ig].doc.time) / 60000, manual: true });
  });

  var pairs = [];
  igDocs.forEach(function (d) {
    if (d.family === 'S') return;
    unitsNear_(sorted, d.time, windowMs).forEach(function (u) {
      if (blocked[d.key + '|' + u.key]) return;
      var s = pairScore_(d, u, cfg);
      if (s) pairs.push({ ig: d.key, u: u, s: s });
    });
  });
  pairs.sort(function (a, b) { return b.s.score - a.s.score || a.s.dtMin - b.s.dtMin; });
  pairs.forEach(function (p) {
    if (unitTaken[p.u.key] || pagesTaken[p.ig][p.u.pageId]) return;
    assign(p.ig, p.u, p.s);
  });

  // FB-only content: cluster the same post across several Pages into one row.
  var left = sorted.filter(function (u) { return !unitTaken[u.key]; });
  var clustered = {}, fbOnly = [];
  left.forEach(function (u) {
    if (clustered[u.key]) return;
    clustered[u.key] = true;
    var cluster = [u], pages = {};
    pages[u.pageId] = true;
    var cands = [];
    unitsNear_(left, u.time, windowMs).forEach(function (v) {
      if (clustered[v.key] || v.pageId === u.pageId) return;
      var s = pairScore_(u, v, cfg);
      if (s) cands.push({ v: v, s: s });
    });
    cands.sort(function (a, b) { return b.s.score - a.s.score; });
    cands.forEach(function (c) {
      if (clustered[c.v.key] || pages[c.v.pageId]) return;
      clustered[c.v.key] = true;
      pages[c.v.pageId] = true;
      cluster.push(c.v);
    });
    fbOnly.push(cluster);
  });

  return { groups: igDocs.map(function (d) { return groupOf[d.key]; }), fbOnly: fbOnly };
}

function readOverrides_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SH.OVERRIDES);
  var out = { link: [], block: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var ig = String(r[0] || '').replace(/[^0-9]/g, '');
    var fb = String(r[1] || '').replace(/[^0-9_]/g, '');
    var act = String(r[2] || '').trim().toUpperCase();
    if (!ig || !fb) return;
    if (act === 'LINK') out.link.push({ ig: ig, fb: fb });
    else if (act === 'BLOCK') out.block.push({ ig: ig, fb: fb });
  });
  return out;
}
