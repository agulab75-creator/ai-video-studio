// End-to-end: setup -> token -> detect -> test -> full sync (auto-continue) ->
// validate matching vs ground truth -> manual columns survive -> overrides ->
// next-day incremental sync -> story capture -> expired token handling.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeClock, makeServices } = require('./mocks');
const { makeServer } = require('./fakeMeta');

const opts = { n: Number(process.env.N || 1200), nullRate: Number(process.env.NULLS || 0.02), spikeAt: 260, seed: Number(process.env.SEED || 42) };
const clock = makeClock(Date.parse('2026-09-18T06:00:00Z'));
const server = makeServer(clock, opts);
const env = makeServices(clock, server.fetch, { promptText: 'EAAG' + 'x'.repeat(180) });

const code = fs.readFileSync(path.join(__dirname, '..', 'dist', 'MetaUnifiedSync.gs'), 'utf8');
const ctx = Object.assign({ console }, env.S);
vm.createContext(ctx);
vm.runInContext(code, ctx, { filename: 'MetaUnifiedSync.gs' });
ctx.now_ = () => clock.now();

let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };
const sheet = n => env.ss.getSheetByName(n);
const table = n => { const sh = sheet(n); const v = sh.getDataRange().getValues(); const h = v[0]; return v.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; }); };
const state = () => JSON.parse(env.props.SYNC_STATE || 'null');

function drainTriggers(label) {
  let runs = 0;
  while (true) {
    const t = env.triggers.find(x => x.fn === 'continueSync');
    if (!t) break;
    if (t.at > clock.now()) clock.advance(t.at - clock.now());
    env.setUi(false);
    ctx.continueSync();
    env.setUi(true);
    runs++;
    if (runs > 200) throw new Error('runaway continuation');
  }
  console.log(`  ${label}: ${runs} continuation runs, phase=${state() && state().phase}`);
  return runs;
}

console.log('STEP 1 setup / token / detect / test');
ctx.setupWorkbook();
ctx.promptToken();
check(!!env.props.META_ACCESS_TOKEN, 'token stored in Script Properties');
ctx.detectAccounts();
let cfgRows = sheet('00 Config').getDataRange().getValues();
const pageRows = cfgRows.filter(r => /^\d{10,}$/.test(String(r[0])));
check(pageRows.length === 3, 'detected 3 pages, IDs kept as text: ' + pageRows.map(r => r[0]).join(','));
check(String(cfgRows.find(r => r[0] === 'Instagram Account ID')[1]) === server.IG_ID, 'IG account ID auto-filled exactly');
// tick Page B too (user cross-posts to it)
const cfgSheet = sheet('00 Config');
cfgRows.forEach((r, i) => { if (String(r[0]) === server.PAGE_B) cfgSheet.getRange(i + 1, 3).setValue(true); });
ctx.testToken();
const testMsg = env.alerts[env.alerts.length - 1];
console.log(testMsg.split('\n').map(l => '     ' + l).join('\n'));
check(!/FAIL/.test(testMsg.replace(/FAIL Permission.*\n?/g, '')), 'testToken has no failures');

console.log('STEP 2 full sync with auto-continue');
const t0 = clock.now();
ctx.startFullSync();
drainTriggers('backfill');
const st = state();
check(st.phase === 'DONE', 'cycle finished');
console.log('  fake minutes elapsed:', Math.round((clock.now() - t0) / 60000), ' runs:', st.runs, ' fetches:', env.fetchCount(), ' batches:', server.stats.batches, ' subs:', server.stats.subs);
console.log('  api errors seen:', JSON.stringify(server.stats.errors, null, 0).slice(0, 900));

const content = table('01 Content');
const igRows = content.filter(r => String(r['Content ID']).startsWith('IG_'));
const fbOnlyRows = content.filter(r => String(r['Content ID']).startsWith('FB_'));
const D = server.D;
check(igRows.length === D.ig.length + D.stories.length, `IG rows ${igRows.length} == IG posts ${D.ig.length} + stories ${D.stories.length}`);
check(igRows.every(r => /^\d{17}$/.test(String(r['IG Media ID'])) && typeof r['IG Media ID'] === 'string'), 'IG Media IDs stored as exact 17-digit text');
const idsInSheet = new Set(igRows.map(r => String(r['IG Media ID'])));
check(D.ig.every(m => idsInSheet.has(m.id)), 'every IG media id present exactly');

// Matching accuracy vs ground truth
let correct = 0, wrong = 0, missed = 0, totalPairs = 0;
const fbToRow = {};
content.forEach(r => String(r['FB Object IDs'] || '').split(', ').filter(Boolean).forEach(id => { fbToRow[id] = r; }));
Object.entries(D.truth).forEach(([fbId, igId]) => {
  const row = fbToRow[fbId];
  if (!igId) { if (row && String(row['Content ID']).startsWith('IG_')) wrong++; return; }
  totalPairs++;
  if (!row || !String(row['Content ID']).startsWith('IG_')) { missed++; return; }
  if (String(row['IG Media ID']) === igId) correct++; else wrong++;
});
if (process.env.DEBUG) {
  console.log(JSON.stringify(server.stats.samples, null, 1));
  Object.entries(D.truth).forEach(([fbId, igId]) => {
    const row = fbToRow[fbId];
    const bad = igId ? (!row || String(row['IG Media ID']) !== igId) : (row && String(row['Content ID']).startsWith('IG_'));
    if (!bad) return;
    const f = Object.values(D.fb).flatMap(p => p.posts.concat(p.reels)).find(x => x.id === fbId);
    const want = D.ig.find(m => m.id === igId);
    const flat = s => String(s || '').slice(0, 60).replace(/\s+/g, ' ');
    console.log('  BAD', fbId, 'truth ig', igId || '(FB-only)', 'got row', row && row['Content ID'], row && row['Match Confidence'],
      '\n     fb:', flat(f.message || f.description), new Date(f._ts).toISOString(),
      '\n     ig:', want ? flat(want.caption || '(none)') + ' ' + want.timestamp : '-',
      '\n     row:', row && flat(row.Caption), row && row.Published);
  });
}
console.log(`  cross-post objects: ${totalPairs}, correct ${correct}, wrong ${wrong}, missed ${missed}`);
check(wrong / totalPairs < 0.01, `wrong-pair rate ${(100 * wrong / totalPairs).toFixed(2)}% < 1%`);
check(missed / totalPairs < 0.03, `missed-pair rate ${(100 * missed / totalPairs).toFixed(2)}% < 3%`);
const allFbIds = Object.keys(D.truth);
check(allFbIds.every(id => fbToRow[id]), 'every FB object lands in exactly some row');
const dupCheck = {};
content.forEach(r => String(r['FB Object IDs'] || '').split(', ').filter(Boolean).forEach(id => { dupCheck[id] = (dupCheck[id] || 0) + 1; }));
check(Object.values(dupCheck).every(c => c === 1), 'no FB object counted in two rows');
const trueFbOnly = fbOnlyRows.filter(r => /^FB special/.test(String(r.Caption)));
check(trueFbOnly.length === 40, `true FB-only posts -> ${trueFbOnly.length} rows (expected 40; 10 of them were on 2 Pages)`);
check(trueFbOnly.filter(r => /2 Pages/.test(r['Published On'])).length === 10, 'FB-only post on 2 Pages merged into 1 row (x10)');

const recent = r => (clock.now() - new Date(r.Published).getTime()) / 86400e3 < 995;
const ancient = r => (clock.now() - new Date(r.Published).getTime()) / 86400e3 > 1001;
const reelRows = igRows.filter(r => r.Format === 'Reel');
const recentReels = reelRows.filter(recent);
const withIns = recentReels.filter(r => r['IG Reach'] !== '');
check(withIns.length / recentReels.length > 0.95, `recent reels with IG insights ${withIns.length}/${recentReels.length}`);
check(reelRows.filter(ancient).every(r => /n\/a/.test(r['Insights Status'])), 'posts older than Meta retention marked n/a');
const crossReels = reelRows.filter(r => String(r['Published On']).startsWith('IG + FB'));
check(crossReels.filter(r => r['FB Views'] !== '').length / crossReels.length > 0.95, 'cross-posted reels have FB views');
check(crossReels.every(r => r['Total Views'] === '' || r['Total Views'] === (Number(r['IG Views']) || 0) + (Number(r['FB Views']) || 0)), 'Total Views = IG + FB');
const feedRows = igRows.filter(r => r.Format === 'Image' || r.Format === 'Carousel');
check(feedRows.filter(recent).filter(r => r['IG Follows'] !== '').length / feedRows.filter(recent).length > 0.95, 'feed posts have IG follows (reels correctly lack them)');
check(reelRows.every(r => r['IG Follows'] === ''), 'reels have no follows metric (not supported by Meta)');
const mx = JSON.parse(env.props.MX_IG_REEL);
check(mx.ok.indexOf('follows') < 0 && mx.ok.indexOf('views') >= 0, 'discovery dropped unsupported reel metrics: ' + mx.ok.join(','));
check(JSON.parse(env.props.MX_FB_POST).ok.indexOf('post_impressions') < 0, 'deprecated post_impressions dropped');
check(igRows.some(r => /n\/a/.test(r['Insights Status'])), 'old/low-view posts marked n/a instead of failing');
const stories = igRows.filter(r => r.Format === 'Story');
check(stories.length === 2 && stories.every(r => r['IG Reach'] !== ''), 'live stories captured with insights');

const weekly = table('02 Weekly');
check(weekly.length > opts.n / 7 * 0.8, 'weekly rows: ' + weekly.length);
check(weekly.some(r => r['IG Follower Growth %'] !== ''), 'weekly follower growth computed');
check(weekly.some(r => r['Non-Follower Reach Share %'] !== ''), 'weekly non-follower reach share computed');
check(table('03 Monthly').length > opts.n / 31 * 0.8, 'monthly rows: ' + table('03 Monthly').length);
const funnel = table('04 Funnel');
check(funnel.length === 20 && funnel.every(r => r.Stage), 'funnel has 20 KPI rows');
const daily = table('05 Account Daily');
check(daily.length >= 30, 'account daily rows ' + daily.length);
check(daily.some(r => r['IG Non-Follower Share %'] !== '') && daily.some(r => r['FB New Follows'] !== ''), 'daily IG + FB account metrics filled');
check(table('06 Match Review').length > 1000, 'match review written');

console.log('STEP 3 manual columns survive + overrides');
const sh = sheet('01 Content');
const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
const leadsCol = head.indexOf('Leads') + 1, notesCol = head.indexOf('Notes') + 1;
sh.getRange(2, leadsCol).setValue(7);
sh.getRange(2, notesCol).setValue("'+91 call back");   // text that Sheets would otherwise parse
sh.getRange(1, head.length + 1).setValue('My Custom Col');
sh.getRange(2, head.length + 1).setValue('keep me');
const keyId = sh.getRange(2, 1).getValue();
// Override: block the pair of one matched row, link a FB-only row to an IG post
const matched = table('01 Content').find(r => String(r['Published On']) === 'IG + FB' && r['Match Confidence'] === 'High');
const fbOnly = table('01 Content').find(r => String(r['Content ID']).startsWith('FB_') && !/Pages/.test(r['Published On']));
const igLonely = table('01 Content').find(r => r['Published On'] === 'IG only' && r.Format !== 'Story');
const ov = sheet('07 Match Overrides');
ov.getRange(2, 1, 2, 3).setValues([
  ["'" + matched['IG Media ID'], "'" + String(matched['FB Object IDs']).split(', ')[0], 'BLOCK'],
  ["'" + igLonely['IG Media ID'], "'" + String(fbOnly['FB Object IDs']).split(', ')[0], 'LINK']]);
ctx.rebuildAll();
const after = table('01 Content');
const kept = after.find(r => r['Content ID'] === keyId);
check(kept && kept.Leads === 7 && kept.Notes === '+91 call back' && kept['My Custom Col'] === 'keep me', 'Leads / Notes / custom column preserved after rebuild');
check(kept['Leads /1k Reach'] !== '', 'Leads /1k Reach computed from typed leads');
const mRow = after.find(r => r['IG Media ID'] === matched['IG Media ID']);
check(!String(mRow['FB Object IDs']).includes(String(matched['FB Object IDs']).split(', ')[0]), 'BLOCK override removed the pair');
const lRow = after.find(r => r['IG Media ID'] === igLonely['IG Media ID']);
check(String(lRow['FB Object IDs']).includes(String(fbOnly['FB Object IDs']).split(', ')[0]) && lRow['Match Confidence'] === 'Manual', 'LINK override forced the pair');

console.log('STEP 4 next-day incremental sync');
clock.advance(24 * 3600e3);
const fetchBefore = env.fetchCount(), subsBefore = server.stats.subs;
env.setUi(false);
ctx.dailySync();
env.setUi(true);
drainTriggers('daily');
check(state().phase === 'DONE', 'daily cycle finished');
console.log('  daily fetches:', env.fetchCount() - fetchBefore, ' sub-requests:', server.stats.subs - subsBefore);
check(server.stats.subs - subsBefore < 1500, 'daily run only refreshes recent posts');
check(table('01 Content').find(r => r['Content ID'] === keyId).Leads === 7, 'manual data still there after daily sync');

console.log('STEP 5 story trigger + expired token');
env.setUi(false);
ctx.storySync();
env.props.META_ACCESS_TOKEN = 'EXPIRED';
let threw = false;
try { ctx.dailySync(); } catch (e) { threw = /token/i.test(e.message); }
env.setUi(true);
check(threw, 'expired token surfaces a clear error (Google emails the owner)');
check(!env.triggers.some(t => t.fn === 'continueSync'), 'no retry loop on a dead token');
const log = table('_log');
console.log('  log tail:\n' + log.slice(-6).map(r => '     ' + r.Level + ' ' + String(r.Message).slice(0, 150)).join('\n'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
