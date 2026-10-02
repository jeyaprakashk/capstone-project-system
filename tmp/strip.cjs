// Strip appearance declarations from single-line CSS rules: node tmp/strip.cjs <spec.cjs>
// spec: [{file, line, expect, remove?: [props], drop?: true}]  remove defaults to APPEARANCE.
// Works on `selector { decls }` lines and on rule('selectors', 'decls') lines. Validates all, then writes.
const fs = require('fs'), path = require('path');
const APPEARANCE = /^(background(-color|-image)?|color|border(-(top|right|bottom|left))?(-(color|width|style))?|border-radius|border-(top|bottom)-(left|right)-radius|box-shadow|padding(-(top|right|bottom|left|inline|block))?|font(-(size|weight|family|style))?|text-transform|letter-spacing|text-decoration|appearance)$/;
const spec = require(path.resolve(process.argv[2]));
const files = {};
let failed = 0;
const strip = (decls, remove) => decls.split(';').map(d => d.trim()).filter(Boolean)
  .filter(d => { const p = d.split(':')[0].trim(); return remove ? !remove.includes(p) : !APPEARANCE.test(p); }).join('; ');
for (const s of spec) {
  const f = files[s.file] ||= { lines: fs.readFileSync(s.file, 'utf8').split('\n'), drops: new Set() };
  const raw = f.lines[s.line - 1];
  if (raw === undefined || !raw.includes(s.expect)) { console.error(`${s.file}:${s.line} does not contain: ${s.expect}`); failed++; continue; }
  if (s.drop) { f.drops.add(s.line - 1); continue; }
  const cr = raw.endsWith('\r') ? '\r' : '', line = cr ? raw.slice(0, -1) : raw;
  let out;
  const helper = line.match(/^(\s*\$\{rule\('[^']*',\s*')([^']*)('\)\}.*)$/);
  const block = line.match(/^(\s*[^{]+\{\s*)([^}]*?)(\s*\}\s*)$/);
  if (helper) { const d = strip(helper[2], s.remove); out = d ? helper[1] + d + (d.endsWith(';') ? '' : ';') + helper[3] : null; }
  else if (block) { const d = strip(block[2], s.remove); out = d ? block[1] + d + '; }' : null; }
  else { console.error(`${s.file}:${s.line} is not a single-line rule`); failed++; continue; }
  if (out === null) f.drops.add(s.line - 1); else f.lines[s.line - 1] = out + cr;
}
if (failed) { console.error(failed + ' spec(s) failed; nothing written'); process.exit(1); }
for (const [file, f] of Object.entries(files)) fs.writeFileSync(file, f.lines.filter((_, i) => !f.drops.has(i)).join('\n'));
console.log('processed', spec.length, 'rules in', Object.keys(files).length, 'files');
