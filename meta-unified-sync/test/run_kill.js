// Google kills any Apps Script run at 360 s. Replays the 21 Sept failure:
// slow Meta video batches -> a run crossed 6 minutes -> killed before scheduling
// the next run -> sync silently stopped. Checks that v2:
//  1. never runs past the limit, even with very slow Meta batches;
//  2. resumes by itself if a run IS killed (safety-net trigger);
//  3. still finishes with every post fetched.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeClock, makeServices } = require('./mocks');
const { makeServer } = require('./fakeMeta');

let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  PASS ' : '  FAIL ') + msg); if (!cond) failures++; };

function world(file, opts) {
  const clock = makeClock(Date.parse('2026-09-21T06:14:00Z'));
  const server = makeServer(clock, Object.assign({ n: 900, seed: 21, nullRate: 0.01, noUserContent: true, heavyTimeouts: true, slowHeavy: 55000 }, opts));
  const env = makeServices(clock, server.fetch, { promptText: 'EAAG' + 'x'.repeat(180), throttle: { windowMs: 60000, max: 12, cooldownMs: 20000 } });
  const ctx = Object.assign({ console }, env.S);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'dist', file), 'utf8'), ctx, { filename: file });
  ctx.now_ = () => clock.now();
  return { clock, server, env, ctx };
}

function setupConfig(w) {
  const sh = w.env.ss.insertSheet('00 Config');
  [['Setting', 'Value'], ['Instagram Account ID', "'" + w.server.IG_ID], ['', ''], ['Page ID', 'Page Name', 'Include'],
   ["'" + w.server.PAGE_A, 'Astro Dr Om Shandilya', true]].forEach((r, i) => sh.getRange(i + 1, 1, 1, r.length).setValues([r]));
}

/** Runs like Google does: one-off trigger fires once, 360 s hard kill, nothing runs after a kill. */
function runAll(w, opts) {
  opts = opts || {};
  const out = { runs: 0, kills: 0, maxSec: 0, stalled: false };
  const one = (fn, isFirst) => {
    w.env.startRun();
    if (opts.killRun === out.runs) w.env.KILL.at = w.clock.now() + (opts.killAfterMs || 100000);
    const t0 = w.clock.now();
    w.env.setUi(!!isFirst);
    try { fn(); } catch (e) { if (/KILLED/.test(e.message)) out.kills++; else console.log('     error: ' + e.message.slice(0, 100)); }
    w.env.setUi(true);
    out.maxSec = Math.max(out.maxSec, Math.min(360, (w.clock.now() - t0) / 1000));
    w.env.endRun();
    out.runs++;
  };
  one(() => w.ctx.startFullSync(), true);
  for (;;) {
    const t = w.env.triggers.find(x => x.fn === 'continueSync');
    if (!t) break;
    w.env.triggers.splice(w.env.triggers.indexOf(t), 1);   // a one-off trigger fires only once
    if (t.at > w.clock.now()) w.clock.advance(t.at - w.clock.now());
    one(() => w.ctx.continueSync());
    if (out.runs > 200) { out.runaway = true; break; }
  }
  const st = JSON.parse(w.env.props.SYNC_STATE || 'null');
  out.phase = st && st.phase;
  out.stalled = out.phase !== 'DONE';
  return out;
}

const table = (w, n) => {
  const sh = w.env.ss.getSheetByName(n);
  const v = sh.getDataRange().getValues(); const h = v[0];
  return v.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; });
};

console.log('NEW VERSION: slow Meta batches');
const w2 = world('MetaUnifiedSync.gs');
setupConfig(w2);
w2.ctx.setupWorkbook(); w2.ctx.promptToken();
const r2 = runAll(w2);
console.log(`     v2: ${r2.runs} runs, ${r2.kills} killed, longest run ${Math.round(r2.maxSec)} s, final phase ${r2.phase}`);
check(r2.kills === 0, 'no run was killed by the 6-minute limit');
check(r2.maxSec <= 335, 'every run stayed under 5.5 min (longest ' + Math.round(r2.maxSec) + ' s)');
check(r2.phase === 'DONE', 'sync finished');
let fb = table(w2, '_raw_fb');
check(fb.every(r => r.insights_at !== ''), `all ${fb.length} Facebook objects have insights`);

console.log('NEW VERSION: a run is killed mid-way (Google kill at a bad moment)');
const w3 = world('MetaUnifiedSync.gs', { seed: 22 });
setupConfig(w3);
w3.ctx.setupWorkbook(); w3.ctx.promptToken();
const r3 = runAll(w3, { killRun: 2, killAfterMs: 120000 });
console.log(`     v2: ${r3.runs} runs, ${r3.kills} killed, final phase ${r3.phase}`);
check(r3.kills === 1, 'the forced kill happened');
check(r3.phase === 'DONE', 'sync resumed by itself after the kill (safety-net trigger) and finished');
fb = table(w3, '_raw_fb');
check(fb.every(r => r.insights_at !== ''), `all ${fb.length} Facebook objects have insights after the kill`);
const ig = table(w3, '_raw_ig');
check(ig.every(r => r.insights_at !== ''), `all ${ig.length} Instagram posts have insights after the kill`);

console.log('NEW VERSION: reels Meta can never answer in one call (22 Sept stall)');
const w4 = world('MetaUnifiedSync.gs', { seed: 23, stuckReels: true, stuckMetric: 'post_video_view_time', heavyTimeouts: false, slowHeavy: 0 });
setupConfig(w4);
w4.ctx.setupWorkbook(); w4.ctx.promptToken();
const r4 = runAll(w4);
console.log(`     v2.2: ${r4.runs} runs, final phase ${r4.phase}, stuck reel calls ${w4.server.stats.stuckNulls || 0}`);
check(r4.phase === 'DONE', 'sync finished even though every full reel request times out');
fb = table(w4, '_raw_fb');
const reels = fb.filter(r => r.object_type === 'REEL');
const withData = reels.filter(r => { try { return Object.keys(JSON.parse(r.insights_json || '{}')).length > 3; } catch (e) { return false; } });
check(reels.length > 50 && withData.length / reels.length > 0.9, `reels with metrics: ${withData.length}/${reels.length}`);
const c4 = table(w4, '01 Content').filter(r => r.Format === 'Reel' && r['FB Views'] !== '');
check(c4.length > 50, `FB reel views in 01 Content: ${c4.length}`);
const lg = table(w4, '_log').map(r => r.Message);
check(lg.some(l => /Skipping this one metric/.test(l)), 'log names the one metric Meta never answers');
check(lg.some(l => /Meta timed out at least once on \d+/.test(l)), 'log reports the timeouts honestly');
console.log('     ' + lg.filter(l => /Facebook insights:/.test(l)).slice(0, 3).join('\n     '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
