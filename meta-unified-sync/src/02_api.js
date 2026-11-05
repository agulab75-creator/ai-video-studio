
/* ================================ API LAYER ================================= */

// Per-execution context (reset at the start of every run).
var RUN = {};

function now_() { return Date.now(); }

function resetRun_(budgetMs) {
  RUN = {
    start: now_(), budgetMs: budgetMs || CFG.MAX_RUNTIME_MS,
    usagePct: 0, regainMin: 0, calls: 0,
    rateLimited: false,   // Meta said slow down
    throttled: false,     // Google said "too much traffic" and backing off did not help
    quotaHit: false,      // Google daily UrlFetch quota used up
    lastFetch: 0, extraGapMs: 0, throttleLogged: false,
    deadline: false       // close to Google's 6-minute kill: stop starting calls
  };
}
resetRun_();

function timeLeft_() { return RUN.budgetMs - (now_() - RUN.start); }
function outOfTime_() { return timeLeft_() <= 0 || RUN.deadline; }
function elapsed_() { return now_() - RUN.start; }
/** True if a slow call started now could still finish before Google's 6-minute kill. */
function canStartCall_(extraMs) { return elapsed_() + (extraMs || 0) + CFG.FETCH_MAX_MS < CFG.HARD_LIMIT_MS; }
function shouldPause_() {
  return RUN.rateLimited || RUN.throttled || RUN.quotaHit || RUN.usagePct >= CFG.USAGE_PAUSE_PCT;
}

function graphUrl_(path, params) {
  var qs = [];
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] === undefined || params[k] === null || params[k] === '') return;
    qs.push(k + '=' + encodeURIComponent(params[k]));
  });
  return 'https://graph.facebook.com/' + CFG.API + '/' + path + (qs.length ? '?' + qs.join('&') : '');
}

/** Relative URL for a batch sub-request (no host, no version). */
function relUrl_(path, params) {
  var qs = [];
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] === undefined || params[k] === null || params[k] === '') return;
    qs.push(k + '=' + encodeURIComponent(params[k]));
  });
  return path + (qs.length ? '?' + qs.join('&') : '');
}

function setParam_(url, key, value) {
  var re = new RegExp('([?&])' + key + '=[^&]*');
  var enc = key + '=' + encodeURIComponent(value);
  if (re.test(url)) return url.replace(re, '$1' + enc);
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + enc;
}

function removeParam_(url, key) {
  return url.replace(new RegExp('([?&])' + key + '=[^&]*&?'), '$1').replace(/[?&]$/, '');
}

/** Graph paging URLs embed the token. Strip it before saving; re-add when used. */
function stripToken_(url) { return url ? removeParam_(url, 'access_token') : url; }
function withToken_(url, token) { return setParam_(stripToken_(url), 'access_token', token); }

/**
 * Turns a Graph error into one of:
 *  auth | rate | perm | field | metric | invalid | object | too_much | transient | throttle | quota | other
 * Only "object" / "metric" / "invalid" / "perm" are real answers from Meta about a post.
 * Everything else means "we did not get an answer" and must be retried, never saved as n/a.
 */
function classifyError_(err, httpCode) {
  if (!err) return httpCode >= 500 ? 'transient' : 'other';
  if (err.kind) return err.kind;
  var code = Number(err.code), sub = Number(err.error_subcode), msg = String(err.message || '').toLowerCase();
  if (code === 190 || code === 102 || code === 463 || code === 467) return 'auth';
  if ([4, 17, 32, 613, 80001, 80002, 80004, 80005, 80006, 80008].indexOf(code) >= 0) return 'rate';
  if (msg.indexOf('reduce the amount of data') >= 0) return 'too_much';
  if (code === 1 || code === 2 || err.is_transient) return 'transient';
  if (code === 10) return msg.indexOf('permission') >= 0 || msg.indexOf('feature') >= 0 ? 'perm' : 'object';
  if (code >= 200 && code < 300) return 'perm';
  if (code === 100) {
    if (msg.indexOf('nonexisting field') >= 0 || msg.indexOf('syntax error') >= 0) return 'field';
    if (msg.indexOf('metric') >= 0 || msg.indexOf('breakdown') >= 0) return 'metric';
    if (sub === 33 || sub === 2108006 || msg.indexOf('does not exist') >= 0 || msg.indexOf('posted before') >= 0 ||
        msg.indexOf('business account') >= 0) return 'object';
    return 'invalid';
  }
  if (!code || httpCode >= 500) return 'transient';
  return 'other';
}

/** True when an error means "no answer" (retry later) rather than a real verdict from Meta. */
function isNoAnswer_(kind) {
  return kind === 'transient' || kind === 'throttle' || kind === 'quota' || kind === 'rate' || kind === 'too_much' || kind === 'deadline';
}

/** Reads Meta usage headers (x-app-usage, x-business-use-case-usage, x-page-usage). */
function recordUsage_(headers) {
  if (!headers) return;
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i].toLowerCase();
    if (k !== 'x-app-usage' && k !== 'x-business-use-case-usage' && k !== 'x-page-usage' &&
        k !== 'x-instagram-business-use-case-usage') continue;
    try { scanUsage_(JSON.parse(headers[keys[i]])); } catch (e) { /* ignore bad header */ }
  }
}

function scanUsage_(o) {
  if (o === null || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach(scanUsage_); return; }
  ['call_count', 'total_cputime', 'total_time', 'acc_id_util_pct'].forEach(function (k) {
    if (typeof o[k] === 'number' && o[k] > RUN.usagePct) RUN.usagePct = o[k];
  });
  if (typeof o.estimated_time_to_regain_access === 'number' && o.estimated_time_to_regain_access > RUN.regainMin) {
    RUN.regainMin = o.estimated_time_to_regain_access;
  }
  Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') scanUsage_(o[k]); });
}

/**
 * The single place that calls UrlFetchApp. Spaces calls out (Google throttles
 * scripts that hit the same URL too fast) and backs off 10s / 30s / 60s when
 * Google says "too much traffic". Returns {res} or {error, kind}.
 */
function fetch_(url, opts, minGapMs) {
  var backoff = CFG.THROTTLE_BACKOFF_MS;
  for (var t = 0; ; t++) {
    var wait = RUN.lastFetch + minGapMs + RUN.extraGapMs - now_();
    if (!canStartCall_(Math.max(wait, 0))) {
      RUN.deadline = true;   // stop cleanly; the next run picks up from here
      return { error: { message: 'Run time nearly used up - continuing in the next run', kind: 'deadline' }, kind: 'deadline' };
    }
    if (wait > 0) Utilities.sleep(wait);
    RUN.calls++;
    try {
      var res = UrlFetchApp.fetch(url, opts);
      RUN.lastFetch = now_();
      return { res: res };
    } catch (e) {
      RUN.lastFetch = now_();
      var msg = String(e && e.message || e);
      if (/too many times for one day/i.test(msg)) {
        RUN.quotaHit = true;
        return { error: { message: msg, kind: 'quota' }, kind: 'quota' };
      }
      if (/too much traffic|bandwidth quota|rate limit/i.test(msg)) {
        RUN.extraGapMs = Math.min(Math.max(RUN.extraGapMs * 2, 1000), 8000);   // slow down for the rest of the run
        if (!RUN.throttleLogged) {
          logMsg_('WARN', 'Google is throttling requests ("too much traffic"). Slowing down and backing off.');
          RUN.throttleLogged = true;
        }
        if (t < backoff.length && canStartCall_(backoff[t])) { Utilities.sleep(backoff[t]); continue; }
        RUN.throttled = true;
        return { error: { message: msg, kind: 'throttle' }, kind: 'throttle' };
      }
      return { error: { message: msg, kind: 'transient' }, kind: 'transient' };
    }
  }
}

/** GET with retry/backoff. Returns {ok, data} or {ok:false, error, kind}. */
function apiGet_(url) {
  var last = null;
  for (var attempt = 1; attempt <= CFG.MAX_RETRIES; attempt++) {
    var f = fetch_(url, { method: 'get', muteHttpExceptions: true }, CFG.GET_GAP_MS);
    if (!f.res) {
      last = { ok: false, error: f.error, kind: f.kind };
      if (f.kind !== 'transient') return last;
      if (!canStartCall_(2000 * attempt)) return last;
      Utilities.sleep(2000 * attempt);
      continue;
    }
    var res = f.res;
    recordUsage_(res.getAllHeaders());
    var http = res.getResponseCode();
    var body = null;
    try { body = JSON.parse(res.getContentText()); } catch (e) { body = null; }
    if (http === 200 && body && !body.error) return { ok: true, data: body };

    var err = (body && body.error) ? body.error : { message: 'HTTP ' + http, code: http };
    var kind = classifyError_(err, http);
    last = { ok: false, error: err, kind: kind };
    if (kind === 'rate') RUN.rateLimited = true;
    if (kind !== 'transient' || !canStartCall_(2000 * attempt)) return last;
    Utilities.sleep(2000 * attempt);
  }
  return last;
}

/**
 * Graph batch: up to 50 GET sub-requests in one HTTP call.
 * subs: [{rel: 'id/insights?metric=...', token: 'optional per-request token'}]
 * Returns an array aligned with subs: {ok, data} | {ok:false, error, kind}
 * A sub-request Meta could not finish in time comes back as kind "transient".
 */
function apiBatch_(subs, topToken) {
  var payload = subs.map(function (s) {
    var rel = s.rel;
    if (s.token && s.token !== topToken) rel = setParam_(rel, 'access_token', s.token);
    return { method: 'GET', relative_url: rel };
  });

  var arr = null, lastErr = null, lastKind = 'transient';
  for (var attempt = 1; attempt <= CFG.MAX_RETRIES; attempt++) {
    var f = fetch_('https://graph.facebook.com/' + CFG.API + '/', {
      method: 'post',
      payload: { access_token: topToken, batch: JSON.stringify(payload), include_headers: 'true' },
      muteHttpExceptions: true
    }, CFG.BATCH_GAP_MS);
    if (!f.res) {
      lastErr = f.error; lastKind = f.kind;
      if (f.kind !== 'transient' || !canStartCall_(2000 * attempt)) break;
      Utilities.sleep(2000 * attempt);
      continue;
    }
    recordUsage_(f.res.getAllHeaders());
    var parsed = null;
    try { parsed = JSON.parse(f.res.getContentText()); } catch (e) { parsed = null; }
    if (Array.isArray(parsed)) { arr = parsed; break; }
    lastErr = parsed && parsed.error ? parsed.error : { message: 'Bad batch response (HTTP ' + f.res.getResponseCode() + ')' };
    lastKind = classifyError_(lastErr, f.res.getResponseCode());
    if (lastKind === 'rate') { RUN.rateLimited = true; break; }
    if (lastKind === 'auth') break;
    if (lastKind !== 'transient' && lastKind !== 'too_much') break;
    if (!canStartCall_(2000 * attempt)) break;
    Utilities.sleep(2000 * attempt);
  }

  if (!arr) {
    var kind = lastKind === 'other' ? 'transient' : lastKind;
    return subs.map(function () { return { ok: false, error: lastErr, kind: kind }; });
  }

  return subs.map(function (s, i) {
    var r = arr[i];
    if (!r) return { ok: false, error: { message: 'Meta did not finish this request in time (batch timeout)' }, kind: 'transient' };
    if (r.headers) {
      var h = {};
      r.headers.forEach(function (x) { h[x.name] = x.value; });
      recordUsage_(h);
    }
    var body = null;
    try { body = JSON.parse(r.body); } catch (e) { body = null; }
    if (r.code === 200 && body && !body.error) return { ok: true, data: body };
    var err = (body && body.error) ? body.error : { message: 'HTTP ' + r.code, code: r.code };
    var kind2 = classifyError_(err, r.code);
    if (kind2 === 'rate') RUN.rateLimited = true;
    return { ok: false, error: err, kind: kind2 };
  });
}

/** Gets a Page access token from the user/system-user token. Falls back to the main token. */
var PAGE_TOKENS_ = {};
function pageToken_(pageId, userToken) {
  if (PAGE_TOKENS_[pageId]) return PAGE_TOKENS_[pageId];
  var r = apiGet_(graphUrl_(pageId, { fields: 'access_token,name', access_token: userToken }));
  var t = (r.ok && r.data.access_token) ? r.data.access_token : userToken;
  if (!r.ok) {
    if (r.kind === 'auth') throw new Error('Access token rejected by Meta: ' + errText_(r.error));
    logMsg_('WARN', 'Could not get Page token for ' + pageId + ' (' + errText_(r.error) + '). Using main token.');
    if (isNoAnswer_(r.kind)) return t;   // don't cache a fallback caused by a network blip
  }
  PAGE_TOKENS_[pageId] = t;
  return t;
}

function errText_(e) {
  if (!e) return 'unknown error';
  return (e.code ? '#' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ' ' : '') + String(e.message || '').slice(0, 300);
}

/** Parses Meta timestamps like 2024-05-01T10:00:00+0000 safely. */
function parseTime_(s) {
  if (!s) return 0;
  if (typeof s === 'number') return s < 1e12 ? s * 1000 : s;
  var str = String(s).replace(/([+-]\d\d)(\d\d)$/, '$1:$2');
  var t = new Date(str).getTime();
  return isNaN(t) ? 0 : t;
}
