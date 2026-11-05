// Checks caption normalisation on Hinglish + Devanagari + emoji using the real script code.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'dist', 'MetaUnifiedSync.gs'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code, ctx);

const dosh = String.fromCharCode(0x0926, 0x094B, 0x0937);          // दोष (with vowel sign)
const kaise = String.fromCharCode(0x0915, 0x0948, 0x0938, 0x0947);  // कैसे
const phone = String.fromCodePoint(0x1F4DE);
const cap = 'Shani ' + dosh + ' ' + kaise + ' hataye? ' + phone + ' Call: +91 98765 43210 @dr.om #astrology https://x.co/a';
const norm = ctx.normText_(cap);
console.log(JSON.stringify(norm));
const ok = norm === 'shani ' + dosh + ' ' + kaise + ' hataye call';
console.log(ok ? 'PASS unicode path keeps Devanagari words intact, strips emoji/phone/tag/link' : 'FAIL');

// Force the fallback (engines without \p{...} support) and compare
const fallbackSrc = /return (\/\[.*\]\+\/g);/.exec(code)[1];
const fb = vm.runInContext(fallbackSrc, ctx);
const viaFallback = cap.toLowerCase().replace(/https?:\/\/\S+|www\.\S+/g, ' ').replace(/#[^\s#]+/g, ' ')
  .replace(/@[\w.]+/g, ' ').replace(/\+?\d[\d\s\-]{7,}\d/g, ' ').replace(fb, ' ').replace(/\s+/g, ' ').trim();
console.log(viaFallback === norm ? 'PASS fallback regex gives the same result' : 'FAIL fallback: ' + JSON.stringify(viaFallback));
process.exit(ok && viaFallback === norm ? 0 : 1);
