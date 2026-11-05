/**
 * =============================================================================
 *  META UNIFIED CONTENT SYNC  (Instagram + Facebook as ONE content unit)
 * =============================================================================
 *  One row per piece of content. If a post went to Instagram AND to one or more
 *  Facebook Pages (Meta Business Suite cross-post), all copies are merged into a
 *  single row, with separate IG columns, FB columns and combined KPI columns.
 *
 *  Built for big accounts (1000+ posts):
 *    - Full-history pagination with saved cursors (resumes where it stopped)
 *    - Insights fetched 50 objects per HTTP call (Graph API batch)
 *    - Each run stops at ~4.5 min and schedules itself to continue (Apps Script
 *      kills scripts at 6 min) until the whole history is done
 *    - After the first backfill, daily runs only refresh recent posts
 *    - Metric names are auto-discovered and self-heal when Meta deprecates one
 *      (Graph API rejects the WHOLE call if ONE metric name is dead)
 *    - Watches Meta's rate-limit headers and pauses before you get blocked
 *
 *  SECURITY: the access token is stored in Script Properties only. Never paste
 *  it into this file or into a cell.
 *
 *  Graph API: v26.0 (released 29 Jul 2026). Menu: "Meta Sync".
 * =============================================================================
 */

var CFG = {
  API: 'v26.0',

  SH: {
    README: 'README',
    CONFIG: '00 Config',
    CONTENT: '01 Content',
    WEEKLY: '02 Weekly',
    MONTHLY: '03 Monthly',
    FUNNEL: '04 Funnel',
    DAILY: '05 Account Daily',
    REVIEW: '06 Match Review',
    OVERRIDES: '07 Match Overrides',
    RAW_IG: '_raw_ig',
    RAW_FB: '_raw_fb',
    LOG: '_log'
  },

  MAX_RUNTIME_MS: 200 * 1000,     // API work stops after ~3.3 min; the rest is kept for saving + writing the tabs
  HARD_LIMIT_MS: 330 * 1000,      // Google kills a run at 360 s: never be busy past this
  FETCH_MAX_MS: 70 * 1000,        // worst case for one slow Meta call: don't start one that could cross the limit
  SAFETY_NET_MS: 8 * 60 * 1000,   // backup continuation set at the START of every run (resumes a killed run)
  CONTINUE_AFTER_MS: 60 * 1000,   // continuation trigger delay
  PAGE_LIMIT: 100,                // Instagram objects per list call (auto-reduced on errors)
  FB_PAGE_LIMIT: 25,              // Facebook list calls are heavier: start smaller
  BATCH_SIZE: 50,                 // Graph API hard cap per batch call
  FB_BATCH_SIZE: 20,              // Facebook video insights are slow: smaller batches
  SINGLE_BATCH_SUBS: 30,     // one-metric requests are light: batch more of them
  SLOW_METRIC_MIN: 12,       // timeouts before a metric is skipped for that post type
  MAX_RETRIES: 3,
  GET_GAP_MS: 300,                // pause between single calls (Google throttles bursts to one URL)
  BATCH_GAP_MS: 1500,             // pause between batch calls (they all go to the same URL)
  THROTTLE_BACKOFF_MS: [10000, 30000, 60000],
  THROTTLE_PAUSE_MIN: 5,          // Google still throttling after back-off: resume in 5 min
  QUOTA_PAUSE_HOURS: 6,           // Google daily UrlFetch quota used up
  MAX_INSIGHT_RETRIES: 5,         // runs a post may time out before it is marked n/a
  USAGE_PAUSE_PCT: 85,            // pause when Meta usage header crosses this %
  RATE_LIMIT_PAUSE_MIN: 30,
  METRIC_FAIL_LIMIT: 3,           // drop a metric after it fails on 3 objects
  ACCOUNT_BACKFILL_DAYS: 30,
  ACCOUNT_REFRESH_DAYS: 3,        // Meta data can lag up to 48h
  DAILY_HOUR: 6,
  STORY_EVERY_HOURS: 2,
  LOG_MAX_ROWS: 800,

  DEFAULTS: {
    matchWindowHours: 48,
    minSimilarity: 0.6,
    blindMinutes: 30,
    includeFbOnly: true
  }
};

var PROP = {
  TOKEN: 'META_ACCESS_TOKEN',
  STATE: 'SYNC_STATE',
  USAGE: 'META_USAGE',
  METRIC_PREFIX: 'MX_'
};

/* ------------------------------ sheet headers ------------------------------ */

var RAW_IG_HEADERS = [
  'media_id', 'timestamp', 'product_type', 'media_type', 'permalink', 'caption',
  'like_count', 'comments_count', 'shortcode', 'insights_json', 'insights_at',
  'insights_status', 'last_seen', 'deleted'
];

var RAW_FB_HEADERS = [
  'object_id', 'page_id', 'page_name', 'object_type', 'linked_video_id', 'linked_post_id',
  'created_time', 'message', 'permalink', 'media_kind', 'reactions', 'comments', 'shares',
  'length_s', 'insights_json', 'insights_at', 'insights_status', 'last_seen', 'deleted'
];

// Columns a human types into. Preserved across every rebuild (keyed by Content ID).
var MANUAL_COLS = ['Pillar', 'Objective', 'Hook', 'Leads', 'DMs', 'Sales / Appointments', 'Verdict', 'Notes'];

var CONTENT_HEADERS = [
  'Content ID', 'Published', 'Week', 'Month', 'Format', 'Published On', 'FB Pages', 'Caption',
  'IG Link', 'FB Link',
  'Pillar', 'Objective', 'Hook',
  // combined
  'Total Views', 'Total Reach', 'Total Interactions', 'Combined ERR %',
  // instagram
  'IG Views', 'IG Reach', 'IG Likes', 'IG Comments', 'IG Shares', 'IG Saves', 'IG Reposts',
  'IG Interactions', 'IG Follows', 'IG Profile Visits', 'IG Avg Watch (s)', 'IG Watch Time (min)',
  'IG Skip Rate %', 'IG Views From FB',
  // facebook (summed over every Page the post went to)
  'FB Views', 'FB Reach', 'FB Reactions', 'FB Comments', 'FB Shares', 'FB Interactions',
  'FB Clicks', 'FB Follows', 'FB Avg Watch (s)', 'FB Watch Time (min)',
  // KPIs
  'IG ERR %', 'FB ERR %', 'Saves /1k Reach', 'Shares /1k Reach', 'Comments /1k Reach',
  'Profile Visits /1k Reach', 'Follows /1k Reach', 'View Frequency', 'FB Click CTR %',
  // business outcomes (manual)
  'Leads', 'DMs', 'Sales / Appointments', 'Leads /1k Reach', 'Verdict', 'Notes',
  // keys
  'IG URL', 'FB URLs', 'IG Media ID', 'FB Object IDs', 'Match Confidence', 'Insights Status', 'Last Synced'
];

var DAILY_HEADERS = [
  'Date', 'IG Followers', 'IG Follows', 'IG Unfollows', 'IG Net Follows',
  'IG Reach', 'IG Follower Reach', 'IG Non-Follower Reach', 'IG Non-Follower Share %',
  'IG Views', 'IG Accounts Engaged', 'IG Interactions', 'IG Profile Link Taps',
  'FB Followers', 'FB New Follows', 'FB Unfollows', 'FB Views', 'FB Viewers',
  'FB Post Engagements', 'FB Page Profile Views', 'Updated'
];

var PERIOD_HEADERS = [
  'Period', 'Posts', 'Reels', 'Carousels', 'Images', 'Stories', 'FB-only Posts', 'Cross-posted %',
  'Total Views', 'Total Reach', 'IG Reach', 'FB Reach',
  'Median Reach / Post', 'Median Reel Reach', 'Median Carousel Reach', 'Median Image Reach', 'Median Story Reach',
  'IG ERR %', 'FB ERR %', 'Combined ERR %', 'Saves /1k', 'Shares /1k', 'Comments /1k',
  'Profile Visits /1k', 'Follows /1k', 'IG Avg Watch (s)', 'FB Clicks', 'Leads',
  'IG Followers (end)', 'IG Net Follows', 'IG Follower Growth %', 'Non-Follower Reach Share %',
  'Profile Link Taps', 'FB Followers (end)', 'FB Net Follows'
];

/* ================================== MENU =================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Meta Sync')
    .addItem('1. Setup / repair workbook', 'setupWorkbook')
    .addItem('2. Save access token', 'promptToken')
    .addItem('3. Detect my Pages & Instagram accounts', 'detectAccounts')
    .addItem('4. Test token & permissions', 'testToken')
    .addItem('5. Run full sync now (auto-continues)', 'startFullSync')
    .addItem('6. Turn on daily auto-sync', 'installTriggers')
    .addSeparator()
    .addItem('Show sync status', 'showStatus')
    .addItem('Rebuild sheets from stored data (no API calls)', 'rebuildAll')
    .addItem('Capture live Instagram Stories now', 'storySync')
    .addSeparator()
    .addItem('Re-discover metric names', 'resetMetricDiscovery')
    .addItem('Stop sync & remove all triggers', 'removeTriggers')
    .addItem('Reset sync state (full re-pull next run)', 'resetSyncState')
    .addToUi();
}

/* ================================== SETUP ================================== */

function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  writeReadme_(ss);

  var cfg = sheet_(ss, CFG.SH.CONFIG);
  if (String(cfg.getRange(1, 1).getValue())) migrateConfig_(cfg);
  if (!String(cfg.getRange(1, 1).getValue())) {
    var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
    cfg.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Help']]);
    cfg.getRange(2, 1, 9, 3).setValues([
      ['Client Name', '', 'Just a label'],
      ['Instagram Account ID', '', 'Filled by "Detect my Pages & Instagram accounts" (17841...)'],
      ['Timezone', tz, 'Used for dates, weeks and months'],
      ['Match Window (hours)', CFG.DEFAULTS.matchWindowHours, 'Max gap between the IG and FB copy of the same post'],
      ['Min Caption Similarity (0-1)', CFG.DEFAULTS.minSimilarity, 'Lower = more aggressive matching'],
      ['Blind Match Window (minutes)', CFG.DEFAULTS.blindMinutes, 'For posts with no/very short caption: match only if posted this close in time'],
      ['Backfill Since (YYYY-MM-DD)', '', 'Blank = entire history'],
      ['Include FB-only posts', true, 'TRUE = posts that exist only on Facebook also get a row'],
      ['Token', '(stored in Script Properties)', 'Use menu: Meta Sync > Save access token']
    ]);
    cfg.getRange(13, 1).setValue('FACEBOOK PAGES  (set Include = TRUE for every Page you cross-post to)');
    cfg.getRange(14, 1, 1, 4).setValues([['Page ID', 'Page Name', 'Include', 'Linked Instagram']]);
    styleHeader_(cfg.getRange(1, 1, 1, 3));
    styleHeader_(cfg.getRange(14, 1, 1, 4));
    cfg.getRange(13, 1).setFontWeight('bold');
    cfg.setColumnWidth(1, 260).setColumnWidth(2, 300).setColumnWidth(3, 120).setColumnWidth(4, 420);
  }

  ensureHeaders_(ss, CFG.SH.CONTENT, CONTENT_HEADERS, 3);
  ensureHeaders_(ss, CFG.SH.WEEKLY, PERIOD_HEADERS, 1);
  ensureHeaders_(ss, CFG.SH.MONTHLY, PERIOD_HEADERS, 1);
  sheet_(ss, CFG.SH.FUNNEL);
  ensureHeaders_(ss, CFG.SH.DAILY, DAILY_HEADERS, 1);
  sheet_(ss, CFG.SH.REVIEW);

  var ov = sheet_(ss, CFG.SH.OVERRIDES);
  if (!String(ov.getRange(1, 1).getValue())) {
    ov.getRange(1, 1, 1, 4).setValues([['IG Media ID', 'FB Object ID', 'Action (LINK / BLOCK)', 'Note']]);
    styleHeader_(ov.getRange(1, 1, 1, 4));
    ov.getRange(2, 1, 1, 4).setValues([['', '', '', 'LINK = force these two together. BLOCK = never pair them. IDs are in 01 Content (IG Media ID / FB Object IDs) and 06 Match Review.']]);
    ov.setFrozenRows(1);
  }

  ensureHeaders_(ss, CFG.SH.RAW_IG, RAW_IG_HEADERS, 0).hideSheet();
  ensureHeaders_(ss, CFG.SH.RAW_FB, RAW_FB_HEADERS, 0).hideSheet();
  ensureHeaders_(ss, CFG.SH.LOG, ['Time', 'Level', 'Message'], 0).hideSheet();

  // Put the useful tabs in a sensible order.
  var order = [CFG.SH.README, CFG.SH.CONFIG, CFG.SH.CONTENT, CFG.SH.WEEKLY, CFG.SH.MONTHLY,
               CFG.SH.FUNNEL, CFG.SH.DAILY, CFG.SH.REVIEW, CFG.SH.OVERRIDES];
  for (var i = 0; i < order.length; i++) {
    var sh = ss.getSheetByName(order[i]);
    if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  }
  ss.setActiveSheet(ss.getSheetByName(CFG.SH.CONFIG));

  alert_('Workbook ready.\n\nNext:\n' +
    '2. Meta Sync > Save access token\n' +
    '3. Meta Sync > Detect my Pages & Instagram accounts\n' +
    '4. Meta Sync > Test token & permissions\n' +
    '5. Meta Sync > Run full sync now');
}

function ensureHeaders_(ss, name, headers, frozenCols) {
  var sh = sheet_(ss, name);
  var width = headers.length;
  var current = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), width)).getValues()[0] : [];
  var same = true;
  for (var i = 0; i < width; i++) if (String(current[i] || '') !== headers[i]) { same = false; break; }
  if (!same && sh.getLastRow() <= 1) {
    sh.getRange(1, 1, 1, width).setValues([headers]);
    styleHeader_(sh.getRange(1, 1, 1, width));
    sh.setFrozenRows(1);
    if (frozenCols) sh.setFrozenColumns(frozenCols);
  }
  return sh;
}

function styleHeader_(range) {
  range.setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff').setWrap(true);
}

function sheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function alert_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* running from a trigger */ }
}

/* ============================== CONFIG / TOKEN ============================== */

function readConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.CONFIG);
  if (!sh) throw new Error('Run "Meta Sync > 1. Setup / repair workbook" first.');

  var last = Math.max(sh.getLastRow(), 14);
  var rows = sh.getRange(1, 1, last, 4).getValues();
  var settings = {};
  var pageHeaderRow = -1;
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][0] || '').trim();
    if (key === 'Page ID') { pageHeaderRow = i; break; }
    if (key) settings[canonLabel_(key)] = rows[i][1];
  }

  var pages = [];
  if (pageHeaderRow >= 0) {
    for (var r = pageHeaderRow + 1; r < rows.length; r++) {
      var id = String(rows[r][0] || '').replace(/[^0-9]/g, '');
      if (!id) continue;
      if (!isTrue_(rows[r][2])) continue;
      pages.push({ id: id, name: String(rows[r][1] || id).trim() });
    }
  }

  var igId = String(settings['Instagram Account ID'] || '').replace(/[^0-9]/g, '');
  var since = settings['Backfill Since (YYYY-MM-DD)'];
  var sinceMs = 0;
  if (since instanceof Date) sinceMs = since.getTime();
  else if (String(since || '').trim()) {
    var d = new Date(String(since).trim() + 'T00:00:00');
    if (!isNaN(d.getTime())) sinceMs = d.getTime();
  }

  var includeFbOnly = settings['Include FB-only posts'];
  return {
    client: String(settings['Client Name'] || ''),
    igId: igId,
    tz: String(settings['Timezone'] || ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone()),
    windowHours: num_(settings['Match Window (hours)']) || CFG.DEFAULTS.matchWindowHours,
    minSim: num_(settings['Min Caption Similarity (0-1)']) || CFG.DEFAULTS.minSimilarity,
    blindMinutes: num_(settings['Blind Match Window (minutes)']) || CFG.DEFAULTS.blindMinutes,
    sinceMs: sinceMs,
    includeFbOnly: (includeFbOnly === '' || includeFbOnly === null || includeFbOnly === undefined) ? true : isTrue_(includeFbOnly),
    pages: pages
  };
}

/** Accepts the labels used by older versions of this sheet (e.g. "IG Account ID"). */
var LABEL_ALIASES = {
  'ig account id': 'Instagram Account ID', 'ig id': 'Instagram Account ID', 'instagram id': 'Instagram Account ID',
  'instagram account id': 'Instagram Account ID', 'instagram business account id': 'Instagram Account ID',
  'min text similarity (0-1)': 'Min Caption Similarity (0-1)', 'min caption similarity (0-1)': 'Min Caption Similarity (0-1)'
};
function canonLabel_(s) {
  var k = String(s || '').trim();
  return LABEL_ALIASES[k.toLowerCase()] || k;
}

/** Renames old labels in "00 Config" to the current ones (values are kept). */
function migrateConfig_(sh) {
  var n = Math.max(sh.getLastRow(), 1);
  var col = sh.getRange(1, 1, n, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    var v = String(col[i][0] || '').trim();
    if (v === 'Page ID') break;
    var c = canonLabel_(v);
    if (v && c !== v) sh.getRange(i + 1, 1).setValue(c);
  }
}

function isTrue_(v) {
  if (v === true) return true;
  var s = String(v || '').trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'X';
}

function num_(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function getToken_() {
  var t = PropertiesService.getScriptProperties().getProperty(PROP.TOKEN);
  if (!t) throw new Error('No access token. Use "Meta Sync > Save access token" first.');
  return t.trim();
}

function promptToken() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Save Meta access token',
    'Paste the access token (System User token recommended). It is stored in Script Properties, not in the sheet.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = String(res.getResponseText() || '').replace(/\s+/g, '');
  if (token.length < 50) { ui.alert('That does not look like a Meta token.'); return; }
  PropertiesService.getScriptProperties().setProperty(PROP.TOKEN, token);
  ui.alert('Token saved. Next: Meta Sync > Detect my Pages & Instagram accounts.');
}
