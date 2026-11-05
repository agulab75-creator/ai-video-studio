// Replays the user's real rollout (19 Sept 2026):
//  1. 00 Config made by an OLD script ("IG Account ID" label)  -> v1 silently skipped Instagram
//  2. label renamed, v1 again under Google "too much traffic" throttling, token without
//     pages_read_user_content, heavy FB video batches timing out -> IG "n/a: UrlFetch failed", FB pending
//  3. v2 pasted over the same sheet: must repair everything.
// Plus: a fresh sheet with the old layout must work with v2 straight away.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeClock, makeServices } = require('./mocks');
const { makeServer } = require('./fakeMeta');

let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };

function world(opts) {
  const clock = makeClock(Date.parse('2026-09-19T05:52:00Z'));
  const server = makeServer(clock, Object.assign({ n: 800, seed: 19, nullRate: 0.01, noUserContent: true, heavyTimeouts: true }, opts));
  const env = makeServices(clock, server.fetch, {
    promptText: 'EAAG' + 'x'.repeat(180),
    throttle: { windowMs: 60000, max: Number(process.env.TMAX || 12), cooldownMs: 20000 }
  });
  return { clock, server, env };
}

function load(w, file) {
  const ctx = Object.assign({ console }, w.env.S);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8'), ctx, { filename: file });
  ctx.now_ = () => w.clock.now();
  return ctx;
}

function drain(w, ctx) {
  let runs = 0;
  while (true) {
    const t = w.env.triggers.find(x => x.fn === 'continueSync');
    if (!t) break;
    if (t.at > w.clock.now()) w.clock.advance(t.at - w.clock.now());
    w.env.setUi(false);
    try { ctx.continueSync(); } catch (e) { console.log('     (trigger error) ' + e.message.slice(0, 120)); }
    w.env.setUi(true);
    if (++runs > 300) throw new Error('runaway');
  }
  return runs;
}

function oldLayoutConfig(w) {
  // Exactly the layout the user's previous script created.
  const sh = w.env.ss.insertSheet('00 Config');
  const rows = [
    ['Setting', 'Value'], ['IG Account ID', "'" + w.server.IG_ID], ['Client Name', ''], ['Match Window (hours)', 48],
    ['Min Text Similarity (0-1)', 0.55], ['Timezone', 'Asia/Kolkata'], ['', ''], ['Token location', 'Script Properties > META_ACCESS_TOKEN'],
    ['', ''], ['FACEBOOK PAGES (add one row per page you cross-post to)', ''], ['Page ID', 'Label', 'Enabled (TRUE/FALSE)'],
    ["'" + w.server.PAGE_A, 'Astro Dr Om Shandilya', true]
  ];
  rows.forEach((r, i) => sh.getRange(i + 1, 1, 1, r.length).setValues([r]));
  return sh;
}

const table = (w, n) => {
  const sh = w.env.ss.getSheetByName(n);
  if (!sh || sh.getLastRow() < 1) return [];
  const v = sh.getDataRange().getValues(); const h = v[0];
  return v.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; });
};
const props = w => JSON.parse(w.env.props.SYNC_STATE || 'null');

/* ---------------- Scenario A: the user's actual history ---------------- */
console.log('SCENARIO A: v1 on old config -> rename -> v1 under throttling -> v2 over the same sheet');
const A = world({});
oldLayoutConfig(A);
let v1 = load(A, 'MetaUnifiedSync_v1.gs');
v1.setupWorkbook(); v1.promptToken();
v1.startFullSync(); drain(A, v1);
let c = table(A, '01 Content');
check(c.filter(r => String(r['Content ID']).startsWith('IG_')).length === 0, 'reproduced: v1 skipped Instagram with the old "IG Account ID" label');

A.env.ss.getSheetByName('00 Config').getRange(2, 1).setValue('Instagram Account ID');   // what the user did
v1.startFullSync(); drain(A, v1);
const rawIg1 = table(A, '_raw_ig');
const fetchNa = rawIg1.filter(r => /UrlFetch failed/.test(r.insights_status)).length;
const rawFb1 = table(A, '_raw_fb');
console.log(`     v1 result: IG posts ${rawIg1.length}, IG "n/a: UrlFetch failed" ${fetchNa}, FB objects ${rawFb1.length}, FB with insights ${rawFb1.filter(r => r.insights_at !== '').length}, Google throttle hits ${A.env.throttleHits()}`);
check(fetchNa > 20 || rawFb1.filter(r => r.insights_at === '').length > 50, 'reproduced: v1 left posts stuck as "UrlFetch failed" / FB insights pending');

// Make the stuck state exactly like the user's sheet: many IG posts saved as
// "n/a: UrlFetch failed..." with a fetch date and no data (what v1 wrote on 19 Sept).
{
  const sh = A.env.ss.getSheetByName('_raw_ig');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cSt = head.indexOf('insights_status') + 1, cAt = head.indexOf('insights_at') + 1, cJs = head.indexOf('insights_json') + 1;
  let n = 0;
  for (let r = 2; r <= sh.getLastRow(); r += 2) {
    sh.getRange(r, cSt).setValue('n/a: UrlFetch failed because too much traffic is being sent to the specified URL.');
    sh.getRange(r, cAt).setValue(A.clock.now());
    sh.getRange(r, cJs).setValue('');
    n++;
  }
  console.log('     injected ' + n + ' IG rows stuck as "n/a: UrlFetch failed" (as in the real sheet)');
}

// user pastes v2 over the same project (same sheet, same Script Properties)
const hitsBefore = A.env.throttleHits();
const v2 = load(A, 'MetaUnifiedSync.gs');
v2.setupWorkbook();
v2.startFullSync();
const runsA = drain(A, v2);
const stA = props(A);
console.log(`     v2: ${runsA + 1} runs, phase ${stA.phase}, Google throttle hits during v2: ${A.env.throttleHits() - hitsBefore}, Meta batch timeouts: ${A.server.stats.heavyNulls || 0}`);
check(stA.phase === 'DONE', 'v2 finished the cycle');
const rawIg2 = table(A, '_raw_ig');
check(rawIg2.filter(r => /UrlFetch|too much traffic|timed out|in time/i.test(r.insights_status)).length === 0, 'no post left with a network/throttle "n/a"');
check(rawIg2.filter(r => /^retry/.test(r.insights_status)).length === 0, 'no Instagram post left waiting for retry');
const genuineNa = rawIg2.filter(r => /^n\/a/.test(r.insights_status));
check(genuineNa.every(r => /Business Account Conversion|Not enough viewers|does not exist/.test(r.insights_status)),
  `remaining IG n/a are real Meta answers only (${genuineNa.length}: old posts / too few viewers)`);
const igOk = rawIg2.filter(r => /^(ok|partial)$/.test(r.insights_status)).length;
check(igOk / rawIg2.length > 0.75, `IG insights fetched for ${igOk}/${rawIg2.length} posts`);
const rawFb2 = table(A, '_raw_fb');
const fbDone = rawFb2.filter(r => r.insights_at !== '').length;
check(fbDone === rawFb2.length, `FB insights done for ${fbDone}/${rawFb2.length} objects (was ${rawFb1.filter(r => r.insights_at !== '').length})`);
const posts = rawFb2.filter(r => r.object_type === 'POST');
check(posts.length > 100, `FB normal posts now listed without pages_read_user_content: ${posts.length}`);
const contentA = table(A, '01 Content');
const crossA = contentA.filter(r => String(r['Published On']).startsWith('IG + FB'));
check(crossA.length > 500, `cross-posted rows: ${crossA.length} of ${contentA.filter(r => r['IG Media ID']).length} IG posts`);
const withFbCounts = crossA.filter(r => r['FB Comments'] !== '' && r['FB Shares'] !== '').length;
check(withFbCounts / crossA.length > 0.95, `FB comments/shares filled from insights on ${withFbCounts}/${crossA.length} cross-posted rows`);
check(crossA.filter(r => r.Format === 'Reel' && r['FB Views'] !== '').length > 200, 'FB reel views present');
let truthOk = 0, truthBad = 0;
const fbToRow = {};
contentA.forEach(r => String(r['FB Object IDs'] || '').split(', ').filter(Boolean).forEach(id => { fbToRow[id] = r; }));
Object.entries(A.server.D.truth).forEach(([fb, ig]) => {
  if (!A.server.D.fb[A.server.PAGE_A].posts.concat(A.server.D.fb[A.server.PAGE_A].reels).some(x => x.id === fb)) return;
  const row = fbToRow[fb];
  if (!ig) return;
  if (row && String(row['IG Media ID']) === ig) truthOk++; else truthBad++;
});
check(truthBad / (truthOk + truthBad) < 0.01, `matching on Page A: ${truthOk} correct, ${truthBad} wrong/missed`);
const logA = table(A, '_log').map(r => r.Level + ' ' + r.Message);
check(logA.some(l => /Re-queued \d+ Instagram posts/.test(l)), 'log: repaired the old wrongly-marked posts');
check(logA.some(l => /Instagram: \d+ posts listed/.test(l)) && logA.some(l => /Instagram insights: \d+ fetched/.test(l)), 'log: clear progress lines');
check(logA.some(l => /without reaction\/comment counts/.test(l)), 'log: explains the missing pages_read_user_content fallback');
console.log('     log sample:\n' + logA.filter(l => /Re-queued|posts listed|insights:|Batch size|throttl|Pausing|Tabs updated/.test(l)).slice(-12).map(l => '       ' + l.slice(0, 160)).join('\n'));

/* ---------------- Scenario B: fresh old-layout sheet straight on v2 ---------------- */
console.log('SCENARIO B: old config layout, v2 directly');
const B = world({ seed: 5, n: 300 });
oldLayoutConfig(B);
const b2 = load(B, 'MetaUnifiedSync.gs');
b2.setupWorkbook(); b2.promptToken();
const lbl = B.env.ss.getSheetByName('00 Config').getRange(2, 1).getValue();
check(lbl === 'Instagram Account ID', 'setup renamed the old "IG Account ID" label (value kept)');
b2.testToken();
const tt = B.env.alerts[B.env.alerts.length - 1];
check(/reaction\/comment counts: .*pages_read_user_content/.test(tt), 'Test token now flags the missing pages_read_user_content');
b2.startFullSync(); drain(B, b2);
const cB = table(B, '01 Content');
check(cB.filter(r => r['IG Media ID']).length === B.server.D.ig.length + B.server.D.stories.length, 'all Instagram posts present');

/* ---------------- Scenario C: empty Instagram ID must stop loudly ---------------- */
console.log('SCENARIO C: empty Instagram ID');
const C = world({ seed: 7, n: 50 });
const c2 = load(C, 'MetaUnifiedSync.gs');
c2.setupWorkbook(); c2.promptToken();
c2.startFullSync();
check(/Instagram Account ID in "00 Config" is empty/.test(C.env.alerts[C.env.alerts.length - 1]), 'clear error instead of silently skipping Instagram');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
