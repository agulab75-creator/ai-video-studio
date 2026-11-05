
/* ================================ RAW STORES ================================ */
/*  Hidden sheets that hold everything pulled from Meta. The visible tabs are
 *  rebuilt from these, so a rebuild never needs an API call.                 */

function RawStore_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  this.sh = ensureHeaders_(ss, name, headers, 0);
  this.headers = headers;
  this.col = {};
  for (var i = 0; i < headers.length; i++) this.col[headers[i]] = i;
  this.rows = [];
  this.map = {};
  this.dirty = false;

  var lastRow = this.sh.getLastRow(), lastCol = this.sh.getLastColumn();
  if (lastRow >= 2 && lastCol >= 1) {
    var values = this.sh.getRange(1, 1, lastRow, lastCol).getValues();
    var srcHead = values[0].map(String);
    var srcIdx = headers.map(function (h) { return srcHead.indexOf(h); });
    for (var r = 1; r < values.length; r++) {
      var row = srcIdx.map(function (j) { return j >= 0 ? values[r][j] : ''; });
      var key = String(row[0] || '');
      if (!key) continue;
      row[0] = key;
      if (this.map[key] !== undefined) continue;   // drop duplicate keys
      this.map[key] = this.rows.length;
      this.rows.push(row);
    }
    var sameHeaders = srcIdx.every(function (j, n) { return j === n; }) && srcHead.length === headers.length;
    if (!sameHeaders) this.dirty = true;
  }
}

RawStore_.prototype.has = function (key) { return this.map[String(key)] !== undefined; };

RawStore_.prototype.get = function (key, field) {
  var i = this.map[String(key)];
  return i === undefined ? undefined : this.rows[i][this.col[field]];
};

RawStore_.prototype.set = function (key, field, value) {
  var i = this.map[String(key)];
  if (i === undefined) return;
  this.rows[i][this.col[field]] = value;
  this.dirty = true;
};

/** Insert or update; only the fields present in obj are touched. */
RawStore_.prototype.upsert = function (key, obj) {
  key = String(key);
  var i = this.map[key];
  if (i === undefined) {
    var row = this.headers.map(function () { return ''; });
    row[0] = key;
    i = this.rows.length;
    this.map[key] = i;
    this.rows.push(row);
  }
  var self = this;
  Object.keys(obj).forEach(function (f) {
    if (self.col[f] !== undefined) self.rows[i][self.col[f]] = obj[f];
  });
  this.dirty = true;
};

RawStore_.prototype.objects = function () {
  var h = this.headers;
  return this.rows.map(function (row) {
    var o = {};
    for (var i = 0; i < h.length; i++) o[h[i]] = row[i];
    return o;
  });
};

RawStore_.prototype.flush = function () {
  if (!this.dirty) return;
  var w = this.headers.length;
  if (this.rows.length) {
    var out = this.rows.map(function (row) { return row.map(cellValue_); });
    var lastRow = this.sh.getLastRow();
    this.sh.getRange(1, 1, 1, w).setValues([this.headers]);
    this.sh.getRange(2, 1, out.length, w).setValues(out);
    if (lastRow > out.length + 1) this.sh.getRange(out.length + 2, 1, lastRow - out.length - 1, w).clearContent();
  }
  this.dirty = false;
};

/**
 * Makes a value safe for setValues: long numeric IDs would lose precision and
 * captions starting with "=" would become formulas. A leading apostrophe forces text.
 */
function cellValue_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  if (v.length > 45000) v = v.slice(0, 45000);
  if (/^[=+\-@']/.test(v) || /^[\d\s.,:\/\-]+$/.test(v) || /^(true|false)$/i.test(v)) return "'" + v;
  return v;
}

function parseJson_(s, fallback) {
  if (!s) return fallback;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

/* ============================ METRIC CANDIDATES ============================= */
/*  Every name Meta has used for each metric. Dead names are pruned by
 *  discovery; to add a future renamed metric, just add it to the list.        */

var IG_FEED_CANDIDATES = ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions',
  'follows', 'profile_visits', 'profile_activity', 'reposts', 'facebook_views'];

var METRIC_CANDIDATES = {
  IG_IMAGE: IG_FEED_CANDIDATES,
  IG_CAROUSEL: IG_FEED_CANDIDATES,
  IG_VIDEO: IG_FEED_CANDIDATES,
  IG_REEL: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions',
    'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate', 'reposts',
    'facebook_views', 'crossposted_views', 'follows', 'profile_visits'],
  IG_STORY: ['reach', 'views', 'shares', 'total_interactions', 'follows', 'profile_visits',
    'profile_activity', 'replies', 'navigation', 'reposts', 'link_clicks', 'facebook_views'],
  FB_POST: ['post_media_view', 'post_total_media_view_unique', 'post_clicks', 'post_reactions_by_type_total',
    'post_activity_by_action_type', 'post_impressions', 'post_impressions_unique'],
  FB_VPOST: ['post_media_view', 'post_total_media_view_unique', 'post_clicks', 'post_reactions_by_type_total',
    'post_activity_by_action_type',
    'post_video_views', 'post_video_avg_time_watched', 'post_video_view_time', 'post_video_length',
    'post_impressions', 'post_impressions_unique'],
  FB_REEL: ['blue_reels_play_count', 'fb_reels_total_plays', 'fb_reels_replay_count', 'post_impressions_unique',
    'post_total_media_view_unique', 'post_media_view', 'post_video_avg_time_watched', 'post_video_view_time',
    'post_video_followers', 'post_video_social_actions', 'post_video_likes_by_reaction_type']
};

function insightPath_(kind, objId) {
  return objId + (kind === 'FB_REEL' ? '/video_insights' : '/insights');
}

var MX_CACHE_ = {};
function metricState_(kind) {
  if (MX_CACHE_[kind] === undefined) {
    MX_CACHE_[kind] = parseJson_(PropertiesService.getScriptProperties().getProperty(PROP.METRIC_PREFIX + kind), null);
  }
  return MX_CACHE_[kind];
}

function saveMetricState_(kind, st) {
  MX_CACHE_[kind] = st;
  PropertiesService.getScriptProperties().setProperty(PROP.METRIC_PREFIX + kind, JSON.stringify(st));
}

function resetMetricDiscovery() {
  var props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf(PROP.METRIC_PREFIX) === 0) props.deleteProperty(k);
  });
  MX_CACHE_ = {};
  alert_('Metric discovery reset. The next sync re-tests every metric name against Meta.');
}

/** Pulls {metric: value} out of an insights response (handles values[] and total_value). */
function parseInsightData_(body) {
  var out = {};
  ((body && body.data) || []).forEach(function (m) {
    if (!m || !m.name) return;
    if (m.values && m.values.length) out[m.name] = m.values[m.values.length - 1].value;
    else if (m.total_value) out[m.name] = m.total_value.value;
  });
  return out;
}


/** Minimal metric sets used when discovery can't find a working sample. */
var FALLBACK_METRICS = {
  IG_IMAGE: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
  IG_CAROUSEL: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
  IG_VIDEO: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
  IG_REEL: ['reach', 'views', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
  IG_STORY: ['reach', 'views', 'shares', 'total_interactions'],
  FB_POST: ['post_media_view', 'post_total_media_view_unique', 'post_clicks'],
  FB_VPOST: ['post_media_view', 'post_total_media_view_unique', 'post_clicks'],
  FB_REEL: ['blue_reels_play_count', 'post_impressions_unique', 'post_video_avg_time_watched', 'post_video_view_time']
};

/**
 * Tests each candidate metric on its own against one object.
 * verdict: 'ok' (some metrics work) | 'object' (Meta refused this post) | 'noanswer' (timeouts/throttling: try later)
 */
function probeMetrics_(relFn, candidates, token, topToken) {
  var subs = candidates.map(function (m) { return { rel: relFn(m), token: token }; });
  var res = [];
  for (var i = 0; i < subs.length; i += 25) res = res.concat(apiBatch_(subs.slice(i, i + 25), topToken));
  if (shouldPause_()) return { verdict: 'noanswer', ok: [], okValues: {}, firstError: res[0] && res[0].error };

  // Sub-requests that got no answer get one more try.
  var retryIdx = [];
  res.forEach(function (r, i) { if (!r.ok && isNoAnswer_(r.kind)) retryIdx.push(i); });
  if (retryIdx.length && !shouldPause_()) {
    var again = apiBatch_(retryIdx.map(function (i) { return subs[i]; }), topToken);
    retryIdx.forEach(function (i, n) { res[i] = again[n]; });
  }

  var ok = [], okValues = {}, firstError = null, anyOk = false, noAnswer = false;
  res.forEach(function (r, i) {
    if (r.ok) {
      anyOk = true;
      ok.push(candidates[i]);
      var v = parseInsightData_(r.data);
      Object.keys(v).forEach(function (k) { okValues[k] = v[k]; });
      return;
    }
    if (r.kind === 'auth') throw new Error('Access token rejected by Meta: ' + errText_(r.error));
    if (isNoAnswer_(r.kind)) { noAnswer = true; ok.push(candidates[i]); }   // optimistic; pruned later if really dead
    if (!firstError || isNoAnswer_(classifyError_(firstError))) firstError = r.error;
  });
  if (anyOk) return { verdict: 'ok', ok: ok, okValues: okValues, firstError: firstError };
  return { verdict: noAnswer ? 'noanswer' : 'object', ok: [], okValues: {}, firstError: firstError };
}

/** Up to 5 test posts spread over time (newest, older...), preferring posts under ~2 years old. */
function pickSamples_(list) {
  var young = list.filter(function (it) { return !it.time || now_() - it.time < 700 * 86400000; });
  var pool = young.length ? young : list;
  var n = pool.length, idx = [0, Math.floor(n * 0.1), Math.floor(n * 0.3), Math.floor(n * 0.6), n - 1], out = [];
  idx.forEach(function (i) { if (i >= 0 && i < n && out.indexOf(pool[i]) < 0) out.push(pool[i]); });
  return out;
}

/* ============================== INSIGHTS ENGINE ============================= */

/**
 * items: [{key, kind, objId, token, time}]
 * Returns {results, stopped, stats}. A result is one of:
 *   {status:'ok'|'partial', values}   data from Meta
 *   {status:'n/a: <Meta message>'}     Meta's real answer: no insights for this post
 *   {retry:true, error}                no answer this run (timeouts); retried next run
 * Items with no result at all were not reached (time budget / throttling).
 */
function fetchInsights_(items, topToken, group) {
  var results = {};
  var stopped = false;
  var byKind = {};
  items.forEach(function (it) { (byKind[it.kind] = byKind[it.kind] || []).push(it); });
  RUN.batchSize = RUN.batchSize || {};
  if (!RUN.batchSize[group]) RUN.batchSize[group] = group === 'FB' ? CFG.FB_BATCH_SIZE : CFG.BATCH_SIZE;

  var work = [];
  Object.keys(byKind).forEach(function (kind) {
    if (stopped) return;
    var list = byKind[kind];
    var st = metricState_(kind);
    var metrics = st && st.ok && st.ok.length ? st.ok : null;
    if (!metrics) {
      var samples = pickSamples_(list), objectFails = 0, noAnswers = 0, lastErr = null;
      for (var s = 0; s < samples.length && !metrics; s++) {
        if (outOfTime_() || shouldPause_()) { stopped = true; break; }
        var sample = samples[s];
        var probe = probeMetrics_(function (m) { return relUrl_(insightPath_(kind, sample.objId), { metric: m }); },
          METRIC_CANDIDATES[kind], sample.token, topToken);
        lastErr = probe.firstError;
        if (probe.verdict === 'ok') {
          metrics = probe.ok;
          saveMetricState_(kind, { ok: probe.ok, bad: {}, at: new Date().toISOString() });
          logMsg_('INFO', 'Discovered metrics for ' + kind + ': ' + probe.ok.join(', '));
          results[sample.key] = { status: 'ok', values: probe.okValues };
        } else if (probe.verdict === 'object') {
          objectFails++;
          results[sample.key] = { status: 'n/a: ' + errText_(probe.firstError), values: {} };
        } else {
          noAnswers++;
          if (shouldPause_()) { stopped = true; break; }
        }
      }
      if (!metrics) {
        if (stopped) return;
        if (noAnswers) {
          logMsg_('WARN', kind + ': Meta did not answer the metric test (' + errText_(lastErr) + '). Will retry next run.');
          stopped = true;
          return;
        }
        metrics = FALLBACK_METRICS[kind];
        logMsg_('WARN', kind + ': all ' + objectFails + ' test posts were refused by Meta (' + errText_(lastErr) +
          '). Fetching every post with the basic metric set instead.');
      }
    }
    list.forEach(function (it) {
      if (!results[it.key]) work.push({ item: it, metrics: metrics.filter(function (m) { return !isSlowMetric_(kind, m); }), mode: isSplitKind_(kind) ? 'single' : 'combined', tries: 0, lastErr: null });
    });
  });

  var lastShrinkLog = 0;
  var timedOut = {};   // keys Meta did not answer in time at least once this run
  while (work.length && !stopped) {
    if (outOfTime_() || shouldPause_()) { stopped = true; break; }
    var cap = RUN.batchSize[group];
    if (work.length && work[0].mode === 'single') cap = Math.max(cap, CFG.SINGLE_BATCH_SUBS);

    var batch = [], subs = [], slots = 0;
    while (work.length) {
      var w = work[0];
      // A metric was dropped since this item fell back to one-by-one: go back to one combined call.
      if (w.mode === 'single') {
        var now = metricState_(w.item.kind);
        if (now && now.ok && now.ok.length && now.ok.length < w.metrics.length && !isSplitKind_(w.item.kind) && !w.values) { w.mode = 'combined'; w.metrics = now.ok.slice(); }
      }
      var need = w.mode === 'combined' ? 1 : w.metrics.length;
      if (slots + need > cap && batch.length) break;
      work.shift();
      batch.push(w);
      if (w.mode === 'combined') {
        var cur = metricState_(w.item.kind);
        if (cur && cur.ok && cur.ok.length) w.metrics = cur.ok.slice();
        subs.push({ rel: relUrl_(insightPath_(w.item.kind, w.item.objId), { metric: w.metrics.join(',') }), token: w.item.token });
      } else {
        w.metrics.forEach(function (m) {
          subs.push({ rel: relUrl_(insightPath_(w.item.kind, w.item.objId), { metric: m }), token: w.item.token });
        });
      }
      slots += need;
    }

    var res = apiBatch_(subs, topToken);

    // Meta returns empty slots when a batch is too heavy: use smaller batches from now on.
    var timeouts = res.filter(function (r) { return !r.ok && r.kind === 'transient'; }).length;
    if (timeouts > Math.max(1, subs.length * 0.2) && cap > 5) {
      RUN.batchSize[group] = Math.max(5, Math.floor(cap / 2));
      if (now_() - lastShrinkLog > 60000) {
        logMsg_('WARN', group + ' insights: Meta timed out on ' + timeouts + '/' + subs.length + ' requests. Batch size now ' + RUN.batchSize[group] + '.');
        lastShrinkLog = now_();
      }
    }

    var p = 0;
    batch.forEach(function (w) {
      if (w.mode === 'combined') {
        var r = res[p++];
        if (r.ok) { results[w.item.key] = { status: 'ok', values: parseInsightData_(r.data) }; return; }
        if (isNoAnswer_(r.kind)) timedOut[w.item.key] = true;
        // Meta timed out on the whole metric list (heavy lifetime video stats):
        // ask for each metric separately instead - small requests finish in time.
        if (r.kind === 'transient' && w.metrics.length > 1) {
          if (!isSplitKind_(w.item.kind)) {
            markSplitKind_(w.item.kind);
            logMsg_('INFO', w.item.kind + ': Meta cannot answer all metrics in one request in time. Asking metric by metric from now on.');
          }
          work.forEach(function (x) { if (x.item.kind === w.item.kind && x.mode === 'combined') x.mode = 'single'; });
          w.mode = 'single'; w.lastErr = r.error; work.unshift(w);
          return;
        }
        handleFailure_(w, r, results, work);
        return;
      }
      // single mode: one sub-request per metric
      var values = {}, okCount = 0, failed = [], firstErr = null, noAnswer = false, pendingIdx = [];
      w.metrics.forEach(function (m, mi) {
        var r2 = res[p++];
        noteMetricAnswer_(w.item.kind, m, r2.ok ? 'ok' : (r2.kind === 'transient' ? 'timeout' : 'other'));
        if (r2.ok) {
          okCount++;
          var v = parseInsightData_(r2.data);
          Object.keys(v).forEach(function (k) { values[k] = v[k]; });
        } else {
          if (r2.kind === 'auth') throw new Error('Access token rejected by Meta: ' + errText_(r2.error));
          if (isNoAnswer_(r2.kind)) { noAnswer = true; pendingIdx.push(mi); }
          else failed.push(m);
          if (!firstErr) firstErr = r2.error;
        }
      });
      if (failed.length && okCount) penalizeMetrics_(w.item.kind, failed);
      w.values = w.values || {};
      Object.keys(values).forEach(function (k) { w.values[k] = values[k]; });
      var got = Object.keys(w.values).length > 0;
      if (noAnswer) {
        // Keep what loaded; ask again only for the metrics Meta could not finish in time
        // (minus any metric that turned out to time out on almost every post).
        w.metrics = w.metrics.filter(function (m, i) { return pendingIdx.indexOf(i) >= 0 && !isSlowMetric_(w.item.kind, m); });
        if (!w.metrics.length) {
          results[w.item.key] = got ? { status: 'partial', values: w.values } : { status: 'n/a: Meta timed out on every metric', values: {} };
          return;
        }
        timedOut[w.item.key] = true;
        requeueOrRetry_(w, firstErr, results, work);
      } else if (got) {
        results[w.item.key] = { status: failed.length || w.partial ? 'partial' : 'ok', values: w.values };
      } else {
        results[w.item.key] = { status: 'n/a: ' + errText_(firstErr), values: {} };
      }
    });
    if (SLOW_CHANGED_) {
      SLOW_CHANGED_ = false;
      work = work.filter(function (x) {
        if (x.mode !== 'single') return true;
        x.metrics = x.metrics.filter(function (m) { return !isSlowMetric_(x.item.kind, m); });
        if (x.metrics.length) return true;
        var has = x.values && Object.keys(x.values).length;
        results[x.item.key] = has ? { status: 'partial', values: x.values } : { status: 'n/a: Meta timed out on every metric', values: {} };
        return false;
      });
    }
  }

  if (work.length || shouldPause_() || outOfTime_()) stopped = true;
  // Never lose metrics that did load for a post still waiting on others.
  work.forEach(function (w) {
    if (w.values && Object.keys(w.values).length && !results[w.item.key]) results[w.item.key] = { retry: true, error: w.lastErr, values: w.values };
  });
  saveTallies_();
  var stats = { ok: 0, na: 0, retry: 0, left: 0, timedOut: Object.keys(timedOut).length };
  items.forEach(function (it) {
    var r = results[it.key];
    if (!r) stats.left++;
    else if (r.retry) stats.retry++;
    else if (String(r.status).indexOf('n/a') === 0) stats.na++;
    else stats.ok++;
  });
  return { results: results, stopped: stopped, stats: stats };
}

/**
 * Counts per metric how often Meta answers vs times out when asked alone. A metric that
 * times out on nearly every post (e.g. lifetime watch time on old reels) is dropped for
 * that kind, so posts finish with every other metric instead of waiting forever.
 */
var SLOW_CHANGED_ = false;
function noteMetricAnswer_(kind, m, outcome) {
  if (outcome === 'other') return;
  var st = metricState_(kind);
  if (!st) return;
  st.tally = st.tally || {};
  var t = st.tally[m] = st.tally[m] || { ok: 0, to: 0 };
  if (outcome === 'ok') t.ok++; else t.to++;
  st.slow = st.slow || {};
  if (!st.slow[m] && t.to >= CFG.SLOW_METRIC_MIN && t.ok < t.to * 0.25) {
    st.slow[m] = now_();
    SLOW_CHANGED_ = true;
    logMsg_('WARN', kind + ': Meta times out on "' + m + '" for almost every post (' + t.to + ' timeouts, ' + t.ok +
      ' answers). Skipping this one metric; everything else is still fetched.');
  }
  RUN.tallyDirty = RUN.tallyDirty || {};
  RUN.tallyDirty[kind] = true;
}
function isSlowMetric_(kind, m) {
  var st = metricState_(kind);
  return !!(st && st.slow && st.slow[m] && now_() - st.slow[m] < 14 * 86400000);
}
function saveTallies_() {
  Object.keys(RUN.tallyDirty || {}).forEach(function (k) { saveMetricState_(k, metricState_(k)); });
  RUN.tallyDirty = {};
}

/** Kinds (e.g. FB_REEL) where Meta times out on the full metric list: fetched metric by metric. Remembered for 14 days. */
function isSplitKind_(kind) {
  var st = metricState_(kind);
  return !!(st && st.splitAt && now_() - st.splitAt < 14 * 86400000);
}
function markSplitKind_(kind) {
  var st = metricState_(kind);
  if (!st) return;
  st.splitAt = now_();
  saveMetricState_(kind, st);
}

/** No answer from Meta/Google for this post: try again later in this run, then hand it to the next run. */
function requeueOrRetry_(w, err, results, work) {
  w.lastErr = err;
  var hasValues = w.values && Object.keys(w.values).length;
  if (shouldPause_() || outOfTime_()) {             // run is pausing / out of time: leave it for the next run
    if (hasValues) results[w.item.key] = { retry: true, error: err, values: w.values };
    return;
  }
  if (++w.tries <= 2) { work.push(w); return; }     // back of the queue: the others still get fetched
  results[w.item.key] = { retry: true, error: err, values: hasValues ? w.values : undefined };
}

function handleFailure_(w, r, results, work) {
  switch (r.kind) {
    case 'auth':
      throw new Error('Access token rejected by Meta: ' + errText_(r.error));
    case 'metric':
    case 'invalid':
    case 'perm':
      // Resolve one-by-one right away (front of the queue) so a dead metric is
      // identified and dropped before hundreds of combined calls fail on it.
      if (w.metrics.length > 1) { w.mode = 'single'; work.unshift(w); }
      else results[w.item.key] = { status: 'n/a: ' + errText_(r.error), values: {} };
      return;
    case 'object':
      results[w.item.key] = { status: 'n/a: ' + errText_(r.error), values: {} };
      return;
    case 'other':
      results[w.item.key] = { status: 'n/a: ' + errText_(r.error), values: {} };
      return;
    default:   // transient, too_much, throttle, quota, rate: no answer
      requeueOrRetry_(w, r.error, results, work);
  }
}

/** A metric that fails on METRIC_FAIL_LIMIT objects (while others work) is dropped for that kind. */
function penalizeMetrics_(kind, metrics) {
  var st = metricState_(kind);
  if (!st) return;
  st.bad = st.bad || {};
  metrics.forEach(function (m) {
    st.bad[m] = (st.bad[m] || 0) + 1;
    if (st.bad[m] >= CFG.METRIC_FAIL_LIMIT && st.ok.indexOf(m) >= 0 && st.ok.length > 1) {
      st.ok.splice(st.ok.indexOf(m), 1);
      logMsg_('INFO', 'Dropped metric "' + m + '" for ' + kind + ' (not supported on these posts).');
    }
  });
  saveMetricState_(kind, st);
}
