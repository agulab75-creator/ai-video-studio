
/* ============================== ACCOUNT DAILY =============================== */
/*  Follower growth and non-follower reach only exist at account level, so we
 *  store one row per day. First run backfills 30 days; later runs refresh the
 *  last 3 days (Meta data can arrive up to 48h late).                        */

var IG_DAY_METRICS = ['views', 'accounts_engaged', 'total_interactions', 'profile_links_taps'];
var FB_PAGE_METRICS = ['page_daily_follows_unique', 'page_daily_unfollows_unique', 'page_media_view',
  'page_total_media_view_unique', 'page_post_engagements', 'page_views_total'];

function tzMidnight_(ds, tz) {
  var off = Utilities.formatDate(new Date(ds + 'T12:00:00Z'), tz, 'Z');   // e.g. +0530
  return Date.parse(ds + 'T00:00:00' + off.slice(0, 3) + ':' + off.slice(3));
}

function addDays_(ds, n) {
  return new Date(Date.parse(ds + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function totalValue_(body) {
  var d = body && body.data && body.data[0];
  if (!d) return null;
  var tv = d.total_value || {};
  var out = { value: n_(tv.value), parts: {} };
  if (out.value === undefined && d.values && d.values.length) out.value = n_(d.values[d.values.length - 1].value);
  (tv.breakdowns || []).forEach(function (b) {
    (b.results || []).forEach(function (x) {
      var k = (x.dimension_values || []).join('|');
      out.parts[k] = (out.parts[k] || 0) + (n_(x.value) || 0);
    });
  });
  return out;
}

function syncAccountDaily_(cfg, token) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureHeaders_(ss, CFG.SH.DAILY, DAILY_HEADERS, 1);
  var rows = readTableByHeader_(sh);
  var byDate = {};
  rows.forEach(function (r) {
    var ds = r['Date'] instanceof Date ? Utilities.formatDate(r['Date'], cfg.tz, 'yyyy-MM-dd') : String(r['Date'] || '');
    if (ds) { r['Date'] = ds; byDate[ds] = r; }
  });
  function row(ds) { return byDate[ds] = byDate[ds] || { 'Date': ds }; }

  var today = Utilities.formatDate(new Date(), cfg.tz, 'yyyy-MM-dd');
  var nDays = Object.keys(byDate).length < 7 ? CFG.ACCOUNT_BACKFILL_DAYS : CFG.ACCOUNT_REFRESH_DAYS;
  var days = [];
  for (var i = 1; i <= nDays; i++) days.push(addDays_(today, -i));

  var subs = [], handlers = [];
  function add(rel, tok, fn) { subs.push({ rel: rel, token: tok }); handlers.push(fn); }

  if (cfg.igId) {
    days.forEach(function (ds) {
      var since = Math.floor(tzMidnight_(ds, cfg.tz) / 1000);
      var until = since + 86400;
      var base = { period: 'day', metric_type: 'total_value', since: since, until: until };
      add(relUrl_(cfg.igId + '/insights', merge_(base, { metric: 'reach', breakdown: 'follow_type' })), token, function (b) {
        var t = totalValue_(b); if (!t) return;
        var r = row(ds);
        r['IG Reach'] = t.value;
        if (t.parts.FOLLOWER !== undefined) r['IG Follower Reach'] = t.parts.FOLLOWER;
        if (t.parts.NON_FOLLOWER !== undefined) r['IG Non-Follower Reach'] = t.parts.NON_FOLLOWER;
        var f = n_(r['IG Follower Reach']) || 0, nf = n_(r['IG Non-Follower Reach']) || 0;
        if (f + nf) r['IG Non-Follower Share %'] = Math.round(nf / (f + nf) * 1000) / 10;
      });
      add(relUrl_(cfg.igId + '/insights', merge_(base, { metric: 'follows_and_unfollows', breakdown: 'follow_type' })), token, function (b) {
        var t = totalValue_(b); if (!t) return;
        var r = row(ds);
        r['IG Follows'] = t.parts.FOLLOWER !== undefined ? t.parts.FOLLOWER : 0;
        r['IG Unfollows'] = t.parts.NON_FOLLOWER !== undefined ? t.parts.NON_FOLLOWER : 0;
        r['IG Net Follows'] = r['IG Follows'] - r['IG Unfollows'];
      });
      var cols = { views: 'IG Views', accounts_engaged: 'IG Accounts Engaged', total_interactions: 'IG Interactions', profile_links_taps: 'IG Profile Link Taps' };
      IG_DAY_METRICS.forEach(function (m) {
        add(relUrl_(cfg.igId + '/insights', merge_(base, { metric: m })), token, function (b) {
          var t = totalValue_(b); if (t && t.value !== undefined) row(ds)[cols[m]] = t.value;
        });
      });
    });
  }

  var fbCols = {
    page_daily_follows_unique: 'FB New Follows', page_daily_unfollows_unique: 'FB Unfollows', page_media_view: 'FB Views',
    page_total_media_view_unique: 'FB Viewers', page_post_engagements: 'FB Post Engagements', page_views_total: 'FB Page Profile Views'
  };
  var fbSeen = {};   // reset FB day cells once, then add every Page's value
  cfg.pages.forEach(function (p) {
    var pt = pageToken_(p.id, token);
    var since = Math.floor(tzMidnight_(days[days.length - 1], cfg.tz) / 1000);
    var until = Math.floor(tzMidnight_(today, cfg.tz) / 1000);
    FB_PAGE_METRICS.forEach(function (m) {
      add(relUrl_(p.id + '/insights', { metric: m, period: 'day', since: since, until: until }), pt, function (b) {
        ((b.data && b.data[0] && b.data[0].values) || []).forEach(function (v) {
          var ds = Utilities.formatDate(new Date(parseTime_(v.end_time) - 12 * 3600000), 'America/Los_Angeles', 'yyyy-MM-dd');
          if (days.indexOf(ds) < 0) return;
          var r = row(ds), col = fbCols[m], k = ds + '|' + col;
          if (!fbSeen[k]) { r[col] = 0; fbSeen[k] = true; }
          r[col] = (n_(r[col]) || 0) + (n_(v.value) || 0);
        });
      });
    });
  });

  var errors = {};
  for (var s = 0; s < subs.length; s += CFG.BATCH_SIZE) {
    if (shouldPause_() || !canStartCall_()) break;
    var res = apiBatch_(subs.slice(s, s + CFG.BATCH_SIZE), token);
    res.forEach(function (r, j) {
      if (r.ok) { try { handlers[s + j](r.data); } catch (e) { errors['parse: ' + e.message] = true; } }
      else {
        if (r.kind === 'auth') throw new Error('Access token rejected by Meta: ' + errText_(r.error));
        var m = /metric=([^&]+)/.exec(subs[s + j].rel);
        errors[(m ? decodeURIComponent(m[1]) : '?') + ': ' + errText_(r.error).slice(0, 120)] = true;
      }
    });
  }
  var errList = Object.keys(errors);
  if (errList.length) logMsg_('INFO', 'Account metrics not available (left blank): ' + errList.slice(0, 8).join(' || '));

  // Follower count snapshots (today)
  if (cfg.igId) {
    var ig = apiGet_(graphUrl_(cfg.igId, { fields: 'followers_count', access_token: token }));
    if (ig.ok && ig.data.followers_count !== undefined) row(today)['IG Followers'] = ig.data.followers_count;
  }
  var fbTotal = 0, fbAny = false;
  cfg.pages.forEach(function (p) {
    var r = apiGet_(graphUrl_(p.id, { fields: 'followers_count,fan_count', access_token: pageToken_(p.id, token) }));
    if (r.ok) {
      var v = first_(r.data.followers_count, r.data.fan_count);
      if (v !== undefined) { fbTotal += v; fbAny = true; }
    }
  });
  if (fbAny) row(today)['FB Followers'] = fbTotal;
  row(today)['Updated'] = new Date();
  days.forEach(function (ds) { if (byDate[ds]) byDate[ds]['Updated'] = new Date(); });

  var out = Object.keys(byDate).sort().reverse().map(function (ds) {
    return DAILY_HEADERS.map(function (h) { var v = byDate[ds][h]; return v === undefined || v === null ? '' : (h === 'Date' ? cellValue_(v) : v); });
  });
  writeTable_(sh, DAILY_HEADERS, out);
  if (out.length) sh.getRange(2, DAILY_HEADERS.length, out.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
}

function merge_(a, b) {
  var o = {};
  Object.keys(a).forEach(function (k) { o[k] = a[k]; });
  Object.keys(b).forEach(function (k) { o[k] = b[k]; });
  return o;
}

function readTableByHeader_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var head = v[0].map(String);
  return v.slice(1).map(function (row) {
    var o = {};
    head.forEach(function (h, i) { if (h) o[h] = row[i]; });
    return o;
  });
}

/* ================================ DASHBOARDS ================================ */

function median_(arr) {
  var a = arr.filter(function (x) { return x !== undefined && x !== null && isFinite(x); }).sort(function (x, y) { return x - y; });
  if (!a.length) return undefined;
  var m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Ratio over only the records where the numerator exists. */
function pairRatio_(recs, numKey, denKey, mult) {
  var n = 0, d = 0, any = false;
  recs.forEach(function (r) {
    var a = n_(r[numKey]), b = n_(r[denKey]);
    if (a === undefined || !b) return;
    n += a; d += b; any = true;
  });
  return any && d ? Math.round(n / d * mult * 100) / 100 : undefined;
}

function sumKey_(recs, k) { return sum_(recs.map(function (r) { return r[k]; })); }

/** Daily series with follower counts filled from snapshots + net follows. */
function dailySeries_(cfg) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SH.DAILY);
  var rows = readTableByHeader_(sh).map(function (r) {
    r.ds = r['Date'] instanceof Date ? Utilities.formatDate(r['Date'], cfg.tz, 'yyyy-MM-dd') : String(r['Date'] || '');
    return r;
  }).filter(function (r) { return /^\d{4}-\d\d-\d\d$/.test(r.ds); }).sort(function (a, b) { return a.ds < b.ds ? -1 : 1; });
  fillFollowers_(rows, 'IG Followers', 'IG Net Follows', function (r) { return n_(r['IG Net Follows']); });
  fillFollowers_(rows, 'FB Followers', null, function (r) {
    var a = n_(r['FB New Follows']), b = n_(r['FB Unfollows']);
    return a === undefined && b === undefined ? undefined : (a || 0) - (b || 0);
  });
  return rows;
}

function fillFollowers_(rows, col, netCol, netFn) {
  var key = '_' + col;
  rows.forEach(function (r) { r[key] = n_(r[col]); });
  // Unknown net change for a day counts as 0 (e.g. today, before Meta reports it).
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][key] === undefined && rows[i - 1][key] !== undefined) rows[i][key] = rows[i - 1][key] + (netFn(rows[i]) || 0);
  }
  for (var j = rows.length - 2; j >= 0; j--) {
    if (rows[j][key] === undefined && rows[j + 1][key] !== undefined) rows[j][key] = rows[j + 1][key] - (netFn(rows[j + 1]) || 0);
  }
}

function aggregate_(recs, days, prevDay) {
  var nonStory = recs.filter(function (r) { return r.format !== 'Story'; });
  var byFmt = function (f) { return median_(recs.filter(function (r) { return r.format === f; }).map(function (r) { return n_(r.totalReach); })); };
  var igAnchored = recs.filter(function (r) { return r.igMediaId; });
  var crossed = igAnchored.filter(function (r) { return r.surface.indexOf('IG + FB') === 0; });
  var reels = recs.filter(function (r) { return r.format === 'Reel' && r.igAvgWatch !== undefined; });
  var wv = 0, ws = 0;
  reels.forEach(function (r) { var v = n_(r.igViews) || 1; wv += v; ws += r.igAvgWatch * v; });

  var a = {
    posts: recs.length,
    reels: recs.filter(function (r) { return r.format === 'Reel'; }).length,
    carousels: recs.filter(function (r) { return r.format === 'Carousel'; }).length,
    images: recs.filter(function (r) { return r.format === 'Image'; }).length,
    stories: recs.filter(function (r) { return r.format === 'Story'; }).length,
    fbOnly: recs.filter(function (r) { return !r.igMediaId; }).length,
    crossPct: igAnchored.length ? Math.round(crossed.length / igAnchored.length * 1000) / 10 : undefined,
    views: sumKey_(recs, 'totalViews'),
    reach: sumKey_(recs, 'totalReach'),
    igReach: sumKey_(recs, 'igReach'),
    fbReach: sumKey_(recs, 'fbReach'),
    medReach: median_(nonStory.map(function (r) { return n_(r.totalReach); })),
    medReel: byFmt('Reel'), medCarousel: byFmt('Carousel'), medImage: byFmt('Image'), medStory: byFmt('Story'),
    igErr: pairRatio_(recs, 'igInter', 'igReach', 100),
    fbErr: pairRatio_(recs, 'fbInter', 'fbReach', 100),
    err: pairRatio_(recs, 'totalInter', 'totalReach', 100),
    saves1k: pairRatio_(recs, 'igSaves', 'igReach', 1000),
    shares1k: pairRatio_(recs, 'sharesAll', 'totalReach', 1000),
    comments1k: pairRatio_(recs, 'commentsAll', 'totalReach', 1000),
    pv1k: pairRatio_(recs, 'igPV', 'igReach', 1000),
    follows1k: pairRatio_(recs, 'followsAll', 'totalReach', 1000),
    igAvgWatch: wv ? Math.round(ws / wv * 10) / 10 : undefined,
    fbClicks: sumKey_(recs, 'fbClicks'),
    leads: sumKey_(recs, 'leads')
  };
  a.leads1k = a.leads !== undefined && a.reach ? Math.round(a.leads / a.reach * 100000) / 100 : undefined;
  a.viewsPerPost = a.views !== undefined && recs.length ? Math.round(a.views / recs.length) : undefined;

  days = days || [];
  var last = days.length ? days[days.length - 1] : null;
  a.igFollowersEnd = last ? last['_IG Followers'] : undefined;
  a.igNet = sum_(days.map(function (d) { return d['IG Net Follows']; }));
  var start = prevDay ? prevDay['_IG Followers'] : (a.igFollowersEnd !== undefined && a.igNet !== undefined ? a.igFollowersEnd - a.igNet : undefined);
  a.igGrowth = start && a.igNet !== undefined ? Math.round(a.igNet / start * 10000) / 100 : undefined;
  var nf = sum_(days.map(function (d) { return d['IG Non-Follower Reach']; }));
  var f = sum_(days.map(function (d) { return d['IG Follower Reach']; }));
  a.nfShare = nf !== undefined && (nf + (f || 0)) ? Math.round(nf / (nf + (f || 0)) * 1000) / 10 : undefined;
  a.linkTaps = sum_(days.map(function (d) { return d['IG Profile Link Taps']; }));
  a.fbFollowersEnd = last ? last['_FB Followers'] : undefined;
  var fbNew = sum_(days.map(function (d) { return d['FB New Follows']; }));
  var fbUn = sum_(days.map(function (d) { return d['FB Unfollows']; }));
  a.fbNet = fbNew === undefined && fbUn === undefined ? undefined : (fbNew || 0) - (fbUn || 0);
  return a;
}

function periodRow_(label, a) {
  return [label, a.posts, a.reels, a.carousels, a.images, a.stories, a.fbOnly, a.crossPct,
    a.views, a.reach, a.igReach, a.fbReach, a.medReach, a.medReel, a.medCarousel, a.medImage, a.medStory,
    a.igErr, a.fbErr, a.err, a.saves1k, a.shares1k, a.comments1k, a.pv1k, a.follows1k, a.igAvgWatch,
    a.fbClicks, a.leads, a.igFollowersEnd, a.igNet, a.igGrowth, a.nfShare, a.linkTaps, a.fbFollowersEnd, a.fbNet
  ].map(function (v) { return v === undefined ? '' : v; });
}

function buildDashboards_(recs, cfg) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var days = dailySeries_(cfg);
  var dayIndex = {};
  days.forEach(function (d, i) { dayIndex[d.ds] = i; });
  days.forEach(function (d) { var di = dayInfo_(Date.parse(d.ds + 'T12:00:00Z'), 'UTC'); d.week = di.week; d.month = di.month; });

  [['week', CFG.SH.WEEKLY, 'Week of '], ['month', CFG.SH.MONTHLY, '']].forEach(function (spec) {
    var key = spec[0], groups = {}, dgroups = {};
    recs.forEach(function (r) { (groups[r[key]] = groups[r[key]] || []).push(r); });
    days.forEach(function (d) { (dgroups[d[key]] = dgroups[d[key]] || []).push(d); });
    var keys = Object.keys(groups).concat(Object.keys(dgroups)).filter(function (k, i, arr) { return k && arr.indexOf(k) === i; }).sort().reverse();
    var rows = keys.map(function (k) {
      var dd = dgroups[k] || [];
      var prev = dd.length && dayIndex[dd[0].ds] > 0 ? days[dayIndex[dd[0].ds] - 1] : null;
      return periodRow_(spec[2] + k, aggregate_(groups[k] || [], dd, prev));
    });
    var sh = ensureHeaders_(ss, spec[1], PERIOD_HEADERS, 1);
    writeTable_(sh, PERIOD_HEADERS, rows.map(function (r) { return r.map(toCell_); }));
    if (rows.length) sh.getRange(2, 2, rows.length, PERIOD_HEADERS.length - 1).setNumberFormat('#,##0.##');
  });

  buildFunnel_(recs, days, cfg);
}

var FUNNEL_ADVICE = {
  '1 Impressions': 'Post more often; shift to Reels/short video; sharpen the first 2-3 seconds.',
  '2 Reach': 'Stronger hooks, titles and covers; use trending formats; post at peak times.',
  '3 Engagement': 'Make it more useful or contrarian; add save/share/comment CTAs; tighter edit and pacing.',
  '4 Profile Visits': 'On-screen identity, series branding, soft "follow for X" CTAs.',
  '5 Follows': 'Clarify the bio; pinned posts/highlights as proof; keep content aligned with the bio promise.',
  '6 Intent Actions': 'Specific CTAs, a lead magnet, spell out the next step in captions/Stories.',
  '7 Community': 'Build series/rituals, feature followers, encourage UGC, challenges and remixes.'
};

function buildFunnel_(recs, days, cfg) {
  var now = new Date();
  var end = dayInfo_(now.getTime(), cfg.tz).day;
  var curStart = addDays_(end, -28), prevStart = addDays_(end, -56);
  var inRange = function (ds, a, b) { return ds >= a && ds < b; };
  var cur = aggregate_(recs.filter(function (r) { return inRange(r.day, curStart, end); }),
    days.filter(function (d) { return inRange(d.ds, curStart, end); }), null);
  var prev = aggregate_(recs.filter(function (r) { return inRange(r.day, prevStart, curStart); }),
    days.filter(function (d) { return inRange(d.ds, prevStart, curStart); }), null);
  cur.cadence = Math.round(cur.posts / 4 * 10) / 10;
  prev.cadence = Math.round(prev.posts / 4 * 10) / 10;

  var spec = [
    ['1 Impressions', 'Total Views', 'views'], ['1 Impressions', 'Views per post', 'viewsPerPost'],
    ['1 Impressions', 'Posts per week (cadence)', 'cadence'],
    ['2 Reach', 'Total Reach (IG + FB)', 'reach'], ['2 Reach', 'Median reach per post', 'medReach'],
    ['2 Reach', 'Non-follower reach share % (IG)', 'nfShare'],
    ['3 Engagement', 'Engagement rate by reach % (ERR)', 'err'], ['3 Engagement', 'Saves per 1k reach', 'saves1k'],
    ['3 Engagement', 'Shares per 1k reach', 'shares1k'], ['3 Engagement', 'Reel avg watch time (s)', 'igAvgWatch'],
    ['4 Profile Visits', 'Profile visits per 1k reach (IG)', 'pv1k'],
    ['5 Follows', 'Follows per 1k reach', 'follows1k'], ['5 Follows', 'IG net new followers', 'igNet'],
    ['5 Follows', 'IG follower growth %', 'igGrowth'],
    ['6 Intent Actions', 'Profile link taps (IG)', 'linkTaps'], ['6 Intent Actions', 'FB link/post clicks', 'fbClicks'],
    ['6 Intent Actions', 'Leads (manual)', 'leads'], ['6 Intent Actions', 'Leads per 1k reach', 'leads1k'],
    ['7 Community', 'Comments per 1k reach', 'comments1k'], ['7 Community', 'Shares per 1k reach', 'shares1k']
  ];
  var rows = spec.map(function (s) {
    var c = cur[s[2]], p = prev[s[2]];
    var ch = (c !== undefined && p) ? Math.round((c - p) / Math.abs(p) * 1000) / 10 : undefined;
    var status = ch === undefined ? '-' : ch >= 10 ? 'Improving' : ch <= -10 ? 'Weak' : 'Stable';
    return [s[0], s[1], c, p, ch, status, status === 'Weak' ? FUNNEL_ADVICE[s[0]] : ''];
  });

  var sh = sheet_(SpreadsheetApp.getActiveSpreadsheet(), CFG.SH.FUNNEL);
  var headers = ['Stage', 'KPI', 'Last 28 days', 'Previous 28 days', 'Change %', 'Status', 'If weak, do this'];
  writeTable_(sh, headers, rows.map(function (r) { return r.map(toCell_); }));
  sh.getRange(1, 9, 3, 1).setValues([
    ['Window: ' + curStart + ' to ' + addDays_(end, -1) + ' vs ' + prevStart + ' to ' + addDays_(curStart, -1)],
    ['Content KPIs use posts published in each window. Recent posts are still collecting views.'],
    ['Funnel: Impressions > Reach > Engagement > Profile Visits > Follows > Intent > Community']
  ]);
  sh.getRange(2, 3, rows.length, 3).setNumberFormat('#,##0.##');
  sh.setColumnWidth(2, 260).setColumnWidth(7, 420);
}
