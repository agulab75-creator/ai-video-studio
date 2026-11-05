
/* =============================== ORCHESTRATOR =============================== */
/*  LIST_IG > INSIGHTS_IG > LIST_FB > INSIGHTS_FB > ACCOUNT > BUILD > DONE
 *  Instagram goes first so Facebook problems can never hide Instagram data.
 *  Each run does ~4 min of API work, rewrites the visible tabs with what it has
 *  so far, saves its place, and schedules itself again 1 minute later.
 *  A daily trigger starts a fresh cycle.                                       */

var DAY_MS = 86400000;

function newState_(cfg) {
  return { cycle: 'c' + now_(), phase: 'LIST_IG', igId: cfg.igId, startedAt: new Date().toISOString(),
           runs: 0, igListed: 0, fbListed: 0, ig: null, fb: null, fbIncomplete: false,
           lastError: '', errorsInRow: 0, pauseUntil: 0 };
}

function loadState_() { return parseJson_(PropertiesService.getScriptProperties().getProperty(PROP.STATE), null); }
function saveState_(st) {
  st.updatedAt = now_();
  PropertiesService.getScriptProperties().setProperty(PROP.STATE, JSON.stringify(st));
}

/** Menu: start a new full cycle now. */
function startFullSync() {
  var cfg = readConfig_();
  PropertiesService.getScriptProperties().setProperty(PROP.STATE, JSON.stringify(newState_(cfg)));
  var st = runSync_('manual');
  if (!st) return;
  if (st.phase === 'DONE') alert_('Sync complete.\n\n' + summaryText_(st));
  else alert_('Sync is running in the background (now at: ' + st.phase + ').\n\n' +
    'Big accounts take several runs. It continues automatically every minute - you can close this sheet.\n' +
    'Check progress with Meta Sync > Show sync status.');
}

/** Trigger: daily. Starts a new cycle unless one is still in progress. */
function dailySync() {
  var cfg = readConfig_();
  var st = loadState_();
  var busy = st && st.phase !== 'DONE' && st.updatedAt && (now_() - st.updatedAt) < 3 * 3600 * 1000;
  if (!busy) PropertiesService.getScriptProperties().setProperty(PROP.STATE, JSON.stringify(newState_(cfg)));
  runSync_('daily');
}

/** Trigger: continuation of an unfinished cycle. */
function continueSync() { runSync_('continue'); }

function runSync_(reason) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('Another sync is running. Skipped (' + reason + ').'); return null; }
  var st = null, igStore = null, fbStore = null;
  try {
    resetRun_();
    var cfg = readConfig_();
    if (!cfg.igId) throw new Error('Setup: the Instagram Account ID in "00 Config" is empty. Run Meta Sync > Detect my Pages & Instagram accounts, or paste the 17841... ID next to "Instagram Account ID".');
    var token = getToken_();
    st = loadState_();
    if (!st || st.igId !== cfg.igId) st = newState_(cfg);
    if (st.phase === 'DONE' && reason === 'continue') { removeTriggersByName_('continueSync'); return st; }
    if (st.pauseUntil && now_() < st.pauseUntil) { scheduleContinue_(st.pauseUntil - now_()); return st; }
    st.pauseUntil = 0;
    st.runs++;
    // Safety net first: if Google kills this run at 6 minutes, this backup trigger still resumes the sync.
    scheduleContinue_(CFG.SAFETY_NET_MS);
    logMsg_('INFO', 'Run #' + st.runs + ' (' + reason + ') starting at phase ' + st.phase);

    igStore = new RawStore_(CFG.SH.RAW_IG, RAW_IG_HEADERS);
    fbStore = new RawStore_(CFG.SH.RAW_FB, RAW_FB_HEADERS);
    repairNoAnswerStatuses_(igStore);
    repairNoAnswerStatuses_(fbStore);
    var stopped = false;

    while (!stopped && st.phase !== 'DONE') {
      if (outOfTime_() || shouldPause_()) { stopped = true; break; }
      var res;
      switch (st.phase) {
        case 'LIST_IG':
          if (!cfg.igId) { st.phase = 'LIST_FB'; break; }
          res = listInstagram_(st, cfg, token, igStore);
          if (res.error) throw new Error('Could not list Instagram posts: ' + errText_(res.error));
          if (res.done) {
            var nStories = listStories_(cfg, token, igStore, st.cycle);
            if (nStories) logMsg_('INFO', 'Instagram: ' + nStories + ' live stories.');
            st.phase = 'INSIGHTS_IG';
          } else stopped = true;
          break;

        case 'INSIGHTS_IG':
          stopped = runIgInsights_(igStore, token);
          if (!stopped) st.phase = 'LIST_FB';
          break;

        case 'LIST_FB':
          if (!cfg.pages.length) { st.phase = 'ACCOUNT'; break; }
          res = listFacebook_(st, cfg, token, fbStore);
          if (res.done) st.phase = 'INSIGHTS_FB'; else stopped = true;
          break;

        case 'INSIGHTS_FB':
          stopped = runFbInsights_(fbStore, cfg, token);
          if (!stopped) st.phase = 'ACCOUNT';
          break;

        case 'ACCOUNT':
          if (timeLeft_() < 60000) { stopped = true; break; }
          try { syncAccountDaily_(cfg, token); } catch (e) {
            if (/token rejected/i.test(e.message)) throw e;
            logMsg_('WARN', 'Account-level metrics skipped: ' + e.message);
          }
          st.phase = 'BUILD';
          break;

        case 'BUILD':
          if (timeLeft_() < 60000) { stopped = true; break; }
          igStore.flush(); fbStore.flush();
          var recs = buildContent_(cfg, igStore, fbStore);
          buildDashboards_(recs, cfg);
          st.summary = summarize_(recs);
          st.phase = 'DONE';
          st.finishedAt = new Date().toISOString();
          break;

        default:
          st.phase = 'LIST_IG';
      }
      igStore.flush(); fbStore.flush();
      saveState_(st);
    }

    st.lastError = '';
    st.errorsInRow = 0;
    if (st.phase === 'DONE') {
      removeTriggersByName_('continueSync');
      logMsg_('INFO', 'Cycle complete. ' + summaryText_(st).replace(/\n/g, ' | '));
    } else {
      var pauseMin = 0, why = '';
      if (RUN.quotaHit) { pauseMin = CFG.QUOTA_PAUSE_HOURS * 60; why = 'Google daily UrlFetch quota used up'; }
      else if (RUN.throttled) { pauseMin = CFG.THROTTLE_PAUSE_MIN; why = 'Google is throttling requests ("too much traffic")'; }
      else if (RUN.rateLimited || RUN.usagePct >= CFG.USAGE_PAUSE_PCT) {
        pauseMin = Math.max(CFG.RATE_LIMIT_PAUSE_MIN, RUN.regainMin || 0);
        why = 'Meta rate limit (usage ' + RUN.usagePct + '%)';
      }
      if (pauseMin) {
        st.pauseUntil = now_() + pauseMin * 60000;
        logMsg_('WARN', why + '. Pausing ' + pauseMin + ' min, then resuming automatically.');
        scheduleContinue_(pauseMin * 60000);
      } else {
        scheduleContinue_(CFG.CONTINUE_AFTER_MS);
      }
      saveState_(st);   // saved + next run scheduled BEFORE the slow tab rebuild
      // Show what we have so far, so big accounts fill in run by run (only if there is clearly time left).
      if (elapsed_() < CFG.HARD_LIMIT_MS - 90 * 1000) {
        try {
          var partial = buildContent_(cfg, igStore, fbStore);
          buildDashboards_(partial, cfg);
          st.summary = summarize_(partial);
          logMsg_('INFO', 'Tabs updated with ' + partial.length + ' rows so far (sync still running, now at ' + st.phase + ').');
        } catch (be) { logMsg_('WARN', 'Could not update tabs mid-sync: ' + be.message); }
      }
    }
    saveState_(st);
    return st;
  } catch (e) {
    try { if (igStore) igStore.flush(); if (fbStore) fbStore.flush(); } catch (e2) { /* ignore */ }
    var msg = String(e && e.message || e);
    logMsg_('ERROR', msg);
    if (st) {
      st.lastError = msg;
      st.errorsInRow = (st.errorsInRow || 0) + 1;
      saveState_(st);
      var fatal = /token|Nothing to sync|Setup/i.test(msg);
      if (!fatal && st.errorsInRow <= 5) scheduleContinue_(5 * 60000);
      else removeTriggersByName_('continueSync');
    }
    if (reason === 'manual') alert_('Sync stopped with an error:\n\n' + msg);
    else throw e;   // trigger runs: Google emails the owner the error
    return st;
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/* ------------------------------ insights phases ----------------------------- */

function needsRefresh_(publishedMs, atMs, status, nowMs, isStory) {
  var age = (nowMs - publishedMs) / DAY_MS;
  var since = atMs ? (nowMs - atMs) / DAY_MS : Infinity;
  if (isStory) return age < 1 && since >= 1 / 24;
  if (!atMs) return true;
  if (String(status).indexOf('n/a') === 0) return age < 14 ? since >= 1 : since >= 30;
  if (age <= 7) return since >= 0.4;
  if (age <= 30) return since >= 2;
  if (age <= 90) return since >= 7;
  return since >= 30;
}

function applyResults_(store, results) {
  var t = now_();
  Object.keys(results).forEach(function (key) {
    var r = results[key];
    var prevStatus = String(store.get(key, 'insights_status') || '');
    var merged = null;
    if (r.values && Object.keys(r.values).length) {
      // Metrics can arrive over several runs (heavy reels): add to what is already saved.
      merged = /^retry/.test(prevStatus) ? parseJson_(store.get(key, 'insights_json'), {}) || {} : {};
      Object.keys(r.values).forEach(function (k) { merged[k] = r.values[k]; });
    }
    if (r.retry) {
      // No answer (timeouts): keep any old data, count the attempt, try again next run.
      var prev = /^retry (\d+)/.exec(prevStatus);
      var n = (prev ? Number(prev[1]) : 0) + 1;
      var p0 = {};
      if (merged) p0.insights_json = JSON.stringify(merged);
      if (n >= CFG.MAX_INSIGHT_RETRIES) {
        p0.insights_at = t;
        p0.insights_status = merged ? 'partial' : 'n/a: Meta did not answer after ' + n + ' runs (' + errText_(r.error).slice(0, 120) + ')';
      } else {
        p0.insights_status = 'retry ' + n + ': ' + errText_(r.error).slice(0, 120);
      }
      store.upsert(key, p0);
      return;
    }
    var patch = { insights_at: t, insights_status: r.status };
    if (merged) patch.insights_json = JSON.stringify(merged);
    store.upsert(key, patch);
  });
}

/**
 * Earlier versions saved Google/network failures ("UrlFetch failed because too much
 * traffic...", batch timeouts) as "n/a", which blocked those posts for up to 30 days.
 * Those were never real answers from Meta: reset them so they are fetched again.
 */
var NO_ANSWER_RE_ = /urlfetch|too much traffic|timed out|in time|bad batch|http 5\d\d|address unavailable|exception|unknown error|service invoked|bandwidth/i;
function repairNoAnswerStatuses_(store) {
  var fixed = 0;
  store.objects().forEach(function (o) {
    var st = String(o.insights_status || '');
    if (st.indexOf('n/a') !== 0 || !NO_ANSWER_RE_.test(st)) return;
    if (/did not answer after/.test(st)) return;
    var key = o[store.headers[0]];
    store.upsert(key, { insights_status: '', insights_at: o.insights_json ? o.insights_at : '' });
    fixed++;
  });
  if (fixed) logMsg_('INFO', 'Re-queued ' + fixed + ' ' + (store.headers[0] === 'media_id' ? 'Instagram' : 'Facebook') +
    ' posts that were wrongly marked n/a after a network/throttling error.');
}

function logInsightStats_(label, total, out) {
  var s = out.stats;
  logMsg_('INFO', label + ' insights: ' + s.ok + ' fetched, ' + s.na + ' n/a (Meta has no data), ' + s.retry +
    ' still waiting (retry next run), ' + s.left + ' not reached yet - of ' + total + ' due.' +
    (s.timedOut ? ' Meta timed out at least once on ' + s.timedOut + ' of them (asked metric by metric instead).' : ''));
}

function summarize_(recs) {
  return {
    rows: recs.length,
    igPosts: recs.filter(function (r) { return r.igMediaId; }).length,
    crossPosted: recs.filter(function (r) { return r.igMediaId && r.units.length; }).length,
    fbOnly: recs.filter(function (r) { return !r.igMediaId; }).length
  };
}

function runIgInsights_(store, token) {
  var t = now_();
  var items = store.objects().filter(function (o) {
    if (isTrue_(o.deleted)) return false;
    if (!igKind_(o.product_type, o.media_type)) return false;
    return needsRefresh_(num_(o.timestamp), num_(o.insights_at), o.insights_status, t, o.product_type === 'STORY');
  }).sort(function (a, b) { return num_(b.timestamp) - num_(a.timestamp); }).map(function (o) {
    return { key: String(o.media_id), kind: igKind_(o.product_type, o.media_type), objId: String(o.media_id), token: token, time: num_(o.timestamp) };
  });
  if (!items.length) return false;
  var out = fetchInsights_(items, token, 'IG');
  applyResults_(store, out.results);
  logInsightStats_('Instagram', items.length, out);
  return out.stopped || out.stats.retry > 0 || out.stats.left > 0;
}

function runFbInsights_(store, cfg, token) {
  var t = now_();
  var pageIds = cfg.pages.map(function (p) { return p.id; });
  var items = store.objects().filter(function (o) {
    if (isTrue_(o.deleted) || pageIds.indexOf(String(o.page_id)) < 0) return false;
    return needsRefresh_(num_(o.created_time), num_(o.insights_at), o.insights_status, t, false);
  }).sort(function (a, b) { return num_(b.created_time) - num_(a.created_time); }).map(function (o) {
    var kind = o.object_type === 'REEL' ? 'FB_REEL' : (o.media_kind === 'VIDEO' ? 'FB_VPOST' : 'FB_POST');
    return { key: String(o.object_id), kind: kind, objId: String(o.object_id), token: pageToken_(String(o.page_id), token), time: num_(o.created_time) };
  });
  if (!items.length) return false;
  var out = fetchInsights_(items, token, 'FB');
  applyResults_(store, out.results);
  logInsightStats_('Facebook', items.length, out);
  return out.stopped || out.stats.retry > 0 || out.stats.left > 0;
}

/** Trigger (every 2h): stories disappear after 24h, so grab them while they are live. */
function storySync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    resetRun_(120 * 1000);
    var cfg = readConfig_();
    if (!cfg.igId) return;
    var token = getToken_();
    var st = loadState_();
    var store = new RawStore_(CFG.SH.RAW_IG, RAW_IG_HEADERS);
    var n = listStories_(cfg, token, store, st ? st.cycle : 'stories');
    var t = now_();
    var items = store.objects().filter(function (o) {
      return o.product_type === 'STORY' && needsRefresh_(num_(o.timestamp), num_(o.insights_at), o.insights_status, t, true);
    }).map(function (o) { return { key: String(o.media_id), kind: 'IG_STORY', objId: String(o.media_id), token: token, time: num_(o.timestamp) }; });
    if (items.length) applyResults_(store, fetchInsights_(items, token, 'IG').results);
    store.flush();
    logMsg_('INFO', 'Story capture: ' + n + ' live stories, ' + items.length + ' refreshed.');
  } catch (e) {
    logMsg_('ERROR', 'Story capture failed: ' + e.message);
  } finally {
    flushLog_();
    lock.releaseLock();
  }
}

/* --------------------------------- triggers --------------------------------- */

function scheduleContinue_(ms) {
  removeTriggersByName_('continueSync');
  ScriptApp.newTrigger('continueSync').timeBased().after(Math.max(60000, Math.round(ms))).create();
}

function removeTriggersByName_(name) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === name) ScriptApp.deleteTrigger(t);
  });
}

function installTriggers() {
  removeTriggersByName_('dailySync');
  removeTriggersByName_('storySync');
  ScriptApp.newTrigger('dailySync').timeBased().everyDays(1).atHour(CFG.DAILY_HOUR).create();
  ScriptApp.newTrigger('storySync').timeBased().everyHours(CFG.STORY_EVERY_HOURS).create();
  alert_('Auto-sync is ON.\n\n- Full refresh every day around ' + CFG.DAILY_HOUR + ':00\n' +
    '- Instagram Stories captured every ' + CFG.STORY_EVERY_HOURS + ' hours (they vanish after 24h)');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  alert_('All automation removed. Nothing will run until you start it again.');
}

function resetSyncState() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('Reset sync state?', 'Clears the hidden raw data and re-pulls everything from Meta on the next sync. ' +
    'Your typed columns (Pillar, Leads, Notes...) in 01 Content are kept.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [CFG.SH.RAW_IG, CFG.SH.RAW_FB].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  PropertiesService.getScriptProperties().deleteProperty(PROP.STATE);
  removeTriggersByName_('continueSync');
  ui.alert('Reset done. Run "Meta Sync > Run full sync now".');
}

/* ---------------------------------- rebuild --------------------------------- */

function rebuildAll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { alert_('A sync is running right now. Try again in a minute.'); return; }
  try {
    var cfg = readConfig_();
    var recs = buildContent_(cfg, new RawStore_(CFG.SH.RAW_IG, RAW_IG_HEADERS), new RawStore_(CFG.SH.RAW_FB, RAW_FB_HEADERS));
    buildDashboards_(recs, cfg);
    alert_('Rebuilt ' + recs.length + ' content rows.');
  } finally { flushLog_(); lock.releaseLock(); }
}

/* ---------------------------------- status ---------------------------------- */

function summaryText_(st) {
  var s = st.summary || {};
  return 'Content rows: ' + (s.rows || 0) + '\nInstagram posts: ' + (s.igPosts || 0) +
    '\n...of which cross-posted to Facebook: ' + (s.crossPosted || 0) + '\nFacebook-only posts: ' + (s.fbOnly || 0);
}

function showStatus() {
  var st = loadState_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var count = function (name, doneCol) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return '0';
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var c = head.indexOf(doneCol);
    var v = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues();
    var done = v.filter(function (r) { return r[0] !== ''; }).length;
    return done + ' / ' + v.length + ' have insights';
  };
  var triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var lines = [
    'Phase: ' + (st ? st.phase : 'never run'),
    'Runs this cycle: ' + (st ? st.runs : 0),
    'Cycle started: ' + (st ? st.startedAt : '-'),
    'Last finished: ' + (st && st.finishedAt ? st.finishedAt : '-'),
    'Instagram objects: ' + count(CFG.SH.RAW_IG, 'insights_at'),
    'Facebook objects: ' + count(CFG.SH.RAW_FB, 'insights_at'),
    'Paused until: ' + (st && st.pauseUntil && st.pauseUntil > now_() ? new Date(st.pauseUntil).toString() : '-'),
    'Last error: ' + (st && st.lastError ? st.lastError : 'none'),
    'Triggers: ' + (triggers.length ? triggers.join(', ') : 'none'),
    '',
    st && st.summary ? summaryText_(st) : ''
  ];
  alert_(lines.join('\n'));
}

/* ---------------------------------- logging --------------------------------- */

var LOG_BUFFER_ = [];
function logMsg_(level, msg) {
  Logger.log(level + ': ' + msg);
  LOG_BUFFER_.push([new Date(), level, String(msg).slice(0, 1000)]);
}

function flushLog_() {
  if (!LOG_BUFFER_.length) return;
  try {
    var sh = ensureHeaders_(SpreadsheetApp.getActiveSpreadsheet(), CFG.SH.LOG, ['Time', 'Level', 'Message'], 0);
    sh.getRange(sh.getLastRow() + 1, 1, LOG_BUFFER_.length, 3).setValues(LOG_BUFFER_.map(function (r) { return [r[0], r[1], cellValue_(r[2])]; }));
    var extra = sh.getLastRow() - 1 - CFG.LOG_MAX_ROWS;
    if (extra > 0) sh.deleteRows(2, extra);
  } catch (e) { Logger.log('log write failed: ' + e.message); }
  LOG_BUFFER_ = [];
}
