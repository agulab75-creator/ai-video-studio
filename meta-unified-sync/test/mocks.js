// Minimal Apps Script service mocks, strict enough to catch real bugs:
// setValues parses strings like Google Sheets does (numeric strings -> numbers,
// losing precision on long IDs; "=..." -> formula; leading apostrophe -> text).
'use strict';

function makeClock(startMs) {
  const c = { t: startMs };
  c.now = () => c.t;
  c.advance = (ms) => { c.t += ms; };
  return c;
}

function parseLikeSheets(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (v.startsWith('=')) {
    const m = /^=HYPERLINK\("([^"]*)","([^"]*)"\)$/.exec(v);
    if (!m) throw new Error('Unsupported formula written to sheet: ' + v);
    return { formula: v, display: m[2] };
  }
  if (/^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);          // numeric string -> number
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  if (/^\d{4}-\d\d-\d\d$/.test(v)) return new Date(v + 'T00:00:00'); // date-looking -> Date
  return v;
}

// Google kills an execution at 360 s. After that NOTHING may run: every service call throws.
const KILL = { at: Infinity, killed: false, clock: null, kills: 0 };
function guard() {
  if (KILL.killed) throw new Error('KILLED');
  if (KILL.clock && KILL.clock.now() > KILL.at) { KILL.killed = true; KILL.kills++; throw new Error('KILLED'); }
}

class Range {
  constructor(sheet, r, c, nr, nc) {
    if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error(`Invalid range ${r},${c},${nr},${nc} on ${sheet.name}`);
    Object.assign(this, { sheet, r, c, nr, nc });
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        let v = this.sheet.get(this.r + i, this.c + j);
        if (v && typeof v === 'object' && v.formula) v = v.display;
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    guard();
    if (vals.length !== this.nr) throw new Error(`setValues rows ${vals.length} != range ${this.nr} on ${this.sheet.name}`);
    vals.forEach((row, i) => {
      if (row.length !== this.nc) throw new Error(`setValues cols ${row.length} != range ${this.nc} on ${this.sheet.name}`);
      row.forEach((v, j) => {
        if (v === undefined) throw new Error('undefined written to ' + this.sheet.name);
        if (typeof v === 'number' && !isFinite(v)) throw new Error('Non-finite number written to ' + this.sheet.name);
        if (v !== null && typeof v === 'object' && Object.prototype.toString.call(v) !== '[object Date]') throw new Error('Object written to ' + this.sheet.name + ': ' + JSON.stringify(v));
        this.sheet.set(this.r + i, this.c + j, parseLikeSheets(v));
      });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() {
    guard();
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, '');
    return this;
  }
  insertCheckboxes() { return this; }
}
['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setWrap', 'setFontSize'].forEach(m => {
  Range.prototype[m] = function () { return this; };
});

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.frozen = 0; this.hidden = false; }
  get(r, c) { const row = this.rows[r - 1]; return row ? row[c - 1] : undefined; }
  set(r, c, v) { (this.rows[r - 1] = this.rows[r - 1] || [])[c - 1] = v; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] || []).some(v => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    this.rows.forEach(row => { (row || []).forEach((v, j) => { if (v !== '' && v !== undefined && j + 1 > m) m = j + 1; }); });
    return m;
  }
  getRange(r, c, nr, nc) {
    if (typeof r === 'string') throw new Error('A1 notation not supported in mock: ' + r);
    return new Range(this, r, c, nr || 1, nc || 1);
  }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  clear() { this.rows = []; return this; }
  hideSheet() { this.hidden = true; return this; }
  setFrozenRows(n) { this.frozen = n; return this; }
  getFrozenRows() { return this.frozen; }
  setFrozenColumns() { return this; }
  setColumnWidth() { return this; }
  deleteRows(start, n) { this.rows.splice(start - 1, n); return this; }
  getName() { return this.name; }
}

function makeServices(clock, fetchHandler, opts) {
  opts = opts || {};
  const sheets = [];
  const ss = {
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { if (sheets.find(s => s.name === n)) throw new Error('dup sheet ' + n); const s = new Sheet(n); sheets.push(s); return s; },
    getSpreadsheetTimeZone: () => 'Asia/Kolkata',
    setActiveSheet: s => { ss._active = s; return s; },
    moveActiveSheet: () => {},
    getSheets: () => sheets
  };
  const alerts = [];
  const ui = {
    alert: (a, b) => { alerts.push(b ? a + ': ' + b : a); return ui.Button.YES; },
    prompt: () => ({ getSelectedButton: () => ui.Button.OK, getResponseText: () => opts.promptText || '' }),
    createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
    ButtonSet: { OK_CANCEL: 1, YES_NO: 2 },
    Button: { OK: 'OK', YES: 'YES', NO: 'NO' }
  };
  let uiAvailable = true;
  const props = {};
  const triggers = [];
  const logs = [];
  let fetchCount = 0, throttleHits = 0;
  const throttleLog = {}, throttleUntil = {};

  const S = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getActive: () => ss,
      getUi: () => { if (!uiAvailable) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in props ? props[k] : null),
        setProperty: (k, v) => {
          guard();
          if (String(v).length > 9000) throw new Error('Property too large: ' + k + ' ' + String(v).length);
          props[k] = String(v);
        },
        deleteProperty: k => { guard(); delete props[k]; },
        getProperties: () => Object.assign({}, props)
      })
    },
    UrlFetchApp: {
      fetch: (url, o) => {
        guard();
        fetchCount++;
        // Google's per-URL throttle: too many calls to the same URL in a window -> exception, plus a cooldown.
        const th = opts.throttle;
        if (th) {
          const now = clock.now();
          const hist = (throttleLog[url] = (throttleLog[url] || []).filter(t => now - t < th.windowMs));
          if (now < (throttleUntil[url] || 0) || hist.length >= th.max) {
            if (!(now < (throttleUntil[url] || 0))) throttleUntil[url] = now + th.cooldownMs;
            throttleHits++;
            clock.advance(100);
            throw new Error('Exception: UrlFetch failed because too much traffic is being sent to the specified URL.');
          }
          hist.push(now);
        }
        const res = fetchHandler(url, o || {});
        clock.advance(res.latency || 500);
        guard();   // a call that ends after the kill never returns
        return {
          getResponseCode: () => res.code,
          getContentText: () => res.body,
          getAllHeaders: () => res.headers || {}
        };
      }
    },
    Utilities: {
      sleep: ms => { guard(); clock.advance(ms); guard(); },
      formatDate: (d, tz, fmt) => formatDate(d, tz, fmt)
    },
    Session: { getScriptTimeZone: () => 'Asia/Kolkata' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: m => logs.push(String(m)) },
    ScriptApp: {
      newTrigger: fn => {
        const t = { fn, kind: null, ms: null };
        const b = {
          timeBased: () => b,
          after: ms => { t.kind = 'after'; t.ms = ms; t.at = clock.now() + ms; return b; },
          everyDays: () => { t.kind = 'daily'; return b; },
          atHour: () => b,
          everyHours: () => { t.kind = 'hourly'; return b; },
          create: () => { guard(); triggers.push(t); return t; }
        };
        return b;
      },
      getProjectTriggers: () => triggers.map(t => ({ getHandlerFunction: () => t.fn, _t: t })),
      deleteTrigger: x => { guard(); const i = triggers.indexOf(x._t); if (i >= 0) triggers.splice(i, 1); }
    }
  };
  KILL.clock = clock;
  return {
    KILL,
    startRun: () => { KILL.at = clock.now() + 360000; KILL.killed = false; },
    endRun: () => { KILL.at = Infinity; KILL.killed = false; },
    S, ss, sheets, alerts, props, triggers, logs,
    setUi: v => { uiAvailable = v; },
    fetchCount: () => fetchCount,
    throttleHits: () => throttleHits
  };
}

function formatDate(d, tz, fmt) {
  if (Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) throw new Error('formatDate got invalid date: ' + d);
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  if (fmt === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (fmt === 'Z') {
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    const off = Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
    const sign = off >= 0 ? '+' : '-';
    const a = Math.abs(off);
    return sign + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0');
  }
  throw new Error('formatDate pattern not supported in mock: ' + fmt);
}

module.exports = { makeClock, makeServices };
