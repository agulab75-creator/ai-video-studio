
/* ============================ DETECT / TEST TOKEN =========================== */

/** Lists every Page the token can see (+ linked IG account) into "00 Config". */
function detectAccounts() {
  var token = getToken_();
  var found = [], url = graphUrl_('me/accounts', {
    fields: 'id,name,instagram_business_account{id,username}', limit: 100, access_token: token
  });
  var guard = 0;
  while (url && guard++ < 50) {
    var r = apiGet_(url);
    if (!r.ok) {
      if (!found.length) {
        // Maybe this is a Page token: /me is then the Page itself.
        var me = apiGet_(graphUrl_('me', { fields: 'id,name,instagram_business_account{id,username}', access_token: token }));
        if (me.ok && me.data.id) found.push(me.data);
        else throw new Error('Could not list Pages: ' + errText_(r.error));
      }
      break;
    }
    found = found.concat(r.data.data || []);
    url = r.data.paging && r.data.paging.next ? r.data.paging.next : null;
  }
  if (!found.length) throw new Error('This token cannot see any Facebook Page. Give the System User / user access to the Pages first.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SH.CONFIG);
  if (!sh) { setupWorkbook(); sh = ss.getSheetByName(CFG.SH.CONFIG); }
  var values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 14), 4).getValues();
  var headerRow = -1, igRow = -1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === 'Page ID') { headerRow = i + 1; break; }
    if (canonLabel_(values[i][0]) === 'Instagram Account ID') igRow = i + 1;
  }
  if (headerRow < 0) throw new Error('"Page ID" table not found in 00 Config. Run Setup again.');

  var existing = {};
  for (var j = headerRow; j < values.length; j++) {
    var id = String(values[j][0] || '').replace(/[^0-9]/g, '');
    if (id) existing[id] = values[j][2];
  }

  var igAccounts = [];
  found.forEach(function (p) {
    var ig = p.instagram_business_account;
    if (ig && !igAccounts.some(function (a) { return a.id === ig.id; })) igAccounts.push({ id: ig.id, username: ig.username, page: p.name });
  });

  var igId = igRow > 0 ? String(sh.getRange(igRow, 2).getValue() || '').replace(/[^0-9]/g, '') : '';
  if (!igId && igAccounts.length === 1 && igRow > 0) {
    igId = igAccounts[0].id;
    sh.getRange(igRow, 2).setValue(cellValue_(igId));
  }

  var rows = found.map(function (p) {
    var ig = p.instagram_business_account;
    var include = existing[p.id] !== undefined ? isTrue_(existing[p.id]) : !!(igId && ig && ig.id === igId);
    return [cellValue_(String(p.id)), p.name, include, ig ? '@' + ig.username + ' (' + ig.id + ')' : '(no Instagram linked)'];
  });
  var clearRows = Math.max(sh.getLastRow() - headerRow, rows.length);
  sh.getRange(headerRow + 1, 1, clearRows, 4).clearContent();
  sh.getRange(headerRow + 1, 1, rows.length, 4).setValues(rows);
  sh.getRange(headerRow + 1, 3, rows.length, 1).insertCheckboxes();
  sh.getRange(headerRow + 1, 3, rows.length, 1).setValues(rows.map(function (r) { return [r[2]]; }));

  var msg = 'Found ' + found.length + ' Page(s).\n\nInstagram accounts:\n' +
    (igAccounts.length ? igAccounts.map(function (a) { return '@' + a.username + '  ->  ' + a.id + '  (via ' + a.page + ')'; }).join('\n') : 'none linked') +
    '\n\n' + (igId ? 'Instagram Account ID set to ' + igId + '.\n' : 'Paste the right Instagram Account ID into 00 Config.\n') +
    'Tick "Include" for EVERY Page you cross-post to, then run "Test token & permissions".';
  alert_(msg);
}

function testToken() {
  var cfg = readConfig_();
  var token = getToken_();
  resetRun_(300000);
  var lines = [];
  var mark = function (ok, text) { lines.push((ok ? 'OK   ' : 'FAIL ') + text); };

  var me = apiGet_(graphUrl_('me', { fields: 'id,name', access_token: token }));
  mark(me.ok, 'Token works' + (me.ok ? ' (' + me.data.name + ')' : ': ' + errText_(me.error)));
  if (!me.ok) { alert_(lines.join('\n')); return; }

  var dbg = apiGet_(graphUrl_('debug_token', { input_token: token, access_token: token }));
  if (dbg.ok && dbg.data.data) {
    var exp = dbg.data.data.expires_at;
    lines.push('     Token expires: ' + (!exp ? 'never' : new Date(exp * 1000).toString()));
    var scopes = dbg.data.data.scopes || [];
    ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'read_insights'].forEach(function (s) {
      mark(scopes.indexOf(s) >= 0, 'Permission ' + s);
    });
  }

  if (cfg.igId) {
    var ig = apiGet_(graphUrl_(cfg.igId, { fields: 'username,followers_count,media_count', access_token: token }));
    mark(ig.ok, 'Instagram account' + (ig.ok ? ' @' + ig.data.username + ' - ' + ig.data.media_count + ' posts, ' + ig.data.followers_count + ' followers' : ': ' + errText_(ig.error)));
    var media = apiGet_(graphUrl_(cfg.igId + '/media', { fields: 'id,media_type,media_product_type', limit: 25, access_token: token }));
    if (media.ok && media.data.data && media.data.data.length) {
      // Test one of each format: Reel, Carousel, Image.
      var seen = {};
      media.data.data.forEach(function (m) {
        var k = igKind_(m.media_product_type, m.media_type);
        if (!k || seen[k]) return;
        seen[k] = true;
        var ins = apiGet_(graphUrl_(m.id + '/insights', { metric: 'reach', access_token: token }));
        mark(ins.ok, 'Instagram ' + (IG_FORMAT_LABEL[k] || k) + ' insights' + (ins.ok ? '' : ': ' + errText_(ins.error)));
      });
    } else mark(false, 'Instagram media list' + (media.ok ? ': no posts' : ': ' + errText_(media.error)));
  } else lines.push('FAIL Instagram Account ID is empty in 00 Config - run "Detect my Pages & Instagram accounts"');

  if (!cfg.pages.length) lines.push('SKIP Facebook (no Page has Include ticked)');
  cfg.pages.forEach(function (p) {
    var pt = pageToken_(p.id, token);
    // Same field sets the sync uses: the first ones need pages_read_user_content.
    var posts = null, level = -1, firstErr = null;
    for (var L = 0; L < FB_POST_FIELDS.length && level < 0; L++) {
      var r = apiGet_(graphUrl_(p.id + '/published_posts', { fields: FB_POST_FIELDS[L], limit: 3, access_token: pt }));
      if (r.ok) { posts = r; level = L; } else if (!firstErr) firstErr = r.error;
    }
    if (level === 0 || level === 1) mark(true, 'Page "' + p.name + '" posts with reaction/comment counts');
    else if (level > 1) {
      mark(false, 'Page "' + p.name + '" reaction/comment counts: ' + errText_(firstErr));
      lines.push('     -> Add the pages_read_user_content permission to the token. Until then posts are listed without');
      lines.push('        those counts and the script takes them from post insights instead.');
    } else mark(false, 'Page "' + p.name + '" posts: ' + errText_(firstErr));
    if (posts && posts.data.data && posts.data.data.length) {
      var pi = apiGet_(graphUrl_(posts.data.data[0].id + '/insights', { metric: 'post_media_view', access_token: pt }));
      mark(pi.ok, 'Page "' + p.name + '" post insights' + (pi.ok ? '' : ': ' + errText_(pi.error)));
    }
    var reels = apiGet_(graphUrl_(p.id + '/video_reels', { fields: 'id', limit: 3, access_token: pt }));
    mark(reels.ok, 'Page "' + p.name + '" reels' + (reels.ok ? '' : ': ' + errText_(reels.error)));
    if (reels.ok && reels.data.data && reels.data.data.length) {
      var ri = apiGet_(graphUrl_(reels.data.data[0].id + '/video_insights', { metric: 'blue_reels_play_count', access_token: pt }));
      mark(ri.ok, 'Page "' + p.name + '" reel insights' + (ri.ok ? '' : ': ' + errText_(ri.error)));
    }
  });

  flushLog_();
  alert_(lines.join('\n') + '\n\nIf everything says OK, run "Run full sync now".');
}

/* ================================== README ================================== */

function writeReadme_(ss) {
  var sh = sheet_(ss, CFG.SH.README);
  sh.clear();
  var t = [
    ['META UNIFIED CONTENT SYNC - how this workbook works'],
    [''],
    ['ONE ROW = ONE PIECE OF CONTENT. If a post went to Instagram and to one or more Facebook Pages, all copies are merged into one row in "01 Content".'],
    ['Columns starting "IG" are Instagram only, "FB" are Facebook (summed across every Page), "Total"/"Combined" add both platforms.'],
    [''],
    ['TABS'],
    ['00 Config - account IDs, Pages to include, matching settings'],
    ['01 Content - one row per content unit + all post-level KPIs. Type into Pillar, Objective, Hook, Leads, DMs, Sales / Appointments, Verdict, Notes: those are kept on every refresh.'],
    ['02 Weekly / 03 Monthly - cadence, reach, median reach by format, ERR, per-1k-reach KPIs, follower growth, non-follower reach share'],
    ['04 Funnel - last 28 days vs previous 28 days for each funnel stage, with what to do when a stage is weak'],
    ['05 Account Daily - followers, follows/unfollows, reach split follower vs non-follower, profile link taps (IG) and Page follows/views (FB)'],
    ['06 Match Review - how each IG post was paired with its Facebook copies (time gap + caption similarity). Check "Time-only" and "Medium" rows.'],
    ['07 Match Overrides - fix a wrong pair: IG Media ID + FB Object ID + LINK (force) or BLOCK (never pair). Then Meta Sync > Rebuild sheets.'],
    [''],
    ['KPI DEFINITIONS'],
    ['Follower Growth Rate = net new followers in period / followers at start x 100 (02/03 tabs, from 05 Account Daily)'],
    ['Non-Follower Reach Share = non-follower reach / (follower + non-follower reach) - Instagram account level'],
    ['Follows per 1k Reach = (IG follows + FB reel follows) / total reach x 1000. Instagram only reports follows for feed posts and stories, not Reels.'],
    ['Reach = unique accounts. Total Reach adds IG + FB reach, so a person who saw both is counted twice.'],
    ['Views = total plays/displays including repeats. View Frequency = IG views / IG reach (high = repeat viewing or fatigue).'],
    ['Median Reach per Post = middle value, so one viral post does not distort the picture.'],
    ['ERR = (likes + comments + shares + saves) / reach x 100. Facebook: (reactions + comments + shares) / reach x 100.'],
    ['Saves / Shares / Comments / Profile Visits per 1k Reach = metric / reach x 1000'],
    ['Avg Watch (s) = average seconds watched per play (Reels). IG Skip Rate % = share of plays skipped in the first seconds.'],
    ['FB Click CTR % = post clicks / FB reach x 100. Leads are typed by you; Leads /1k Reach is calculated.'],
    [''],
    ['FUNNEL: Impressions > Reach > Engagement > Profile Visits > Follows > Intent Actions > Community & Repeat'],
    [''],
    ['GOOD TO KNOW'],
    ['- Meta stores post insights for about 2 years; older posts may show "n/a". Data can lag up to 48h.'],
    ['- Instagram Stories vanish after 24h. The story trigger (every 2h) captures them while they are live.'],
    ['- Posts under ~5 viewers return "n/a: not enough viewers" (Meta privacy threshold).'],
    ['- Do not put formulas inside 01 Content: that tab is rewritten on every sync. Build charts/pivots on other tabs.'],
    ['- Metric names are discovered automatically. If Meta renames metrics: Meta Sync > Re-discover metric names.']
  ];
  sh.getRange(1, 1, t.length, 1).setValues(t);
  sh.getRange(1, 1).setFontSize(14).setFontWeight('bold');
  [6, 15, 29].forEach(function (r) { sh.getRange(r, 1).setFontWeight('bold'); });
  sh.setColumnWidth(1, 1100);
  sh.getRange(1, 1, t.length, 1).setWrap(true);
}
