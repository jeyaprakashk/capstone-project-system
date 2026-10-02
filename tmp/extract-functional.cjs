// Builds the shell's legacy CSS exactly as dashboard-router.js does, then keeps only declarations
// the dashboard needs to work. Output: tmp/functional.css and a report of what was kept.
const fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({ escapeHtml: s => String(s) });
for (const f of ['lucide-icons.js', 'icon-renderer.js', 'common-styles.js', 'coordinator-dashboard.js', 'guide-dashboard.js', 'reviewer-dashboard.js', 'review-evaluation-client.js', 'internal-assessment-publishing-client.js'])
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
const router = fs.readFileSync('dashboard-router.js', 'utf8');
const start = router.indexOf('<style>') + 7, end = router.indexOf('</style>');
const css = vm.runInContext('`' + router.slice(start, end) + '`', ctx).replace(/\/\*[\s\S]*?\*\//g, '');

// Parse into flat rules with their at-rule context.
const rules = [];
(function parse(text, at) {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith('@')) { if (!/^@(keyframes|font-face|import)/.test(head)) parse(body, [...at, head]); }
    else if (head) rules.push({ at, sel: head.replace(/\s+/g, ' '), decls: body.split(';').map(d => d.trim()).filter(Boolean) });
    i = j;
  }
})(css, []);

const prop = d => d.slice(0, d.indexOf(':')).trim().toLowerCase();
const val = d => d.slice(d.indexOf(':') + 1).trim();
const ALWAYS = /^(position|top|right|bottom|left|inset|z-index|overflow(-x|-y)?|overscroll-behavior(-x|-y)?|visibility|pointer-events|clip|clip-path|isolation|resize|touch-action|user-select|content-visibility|scroll-behavior|scroll-margin(-top)?|container|container-type|container-name)$/;
const STATE = /\[hidden\]|\[open\]|\.open\b|\.menu-open\b|\[aria-expanded|\[aria-hidden|\[data-open|:not\(\[hidden\]\)|:checked|\.active\b|\.team-drawer-open\b|\[data-sticky-decision/;
// Selectors that are hidden somewhere: their display values elsewhere form a show/hide pair.
const hiddenSel = new Set();
for (const r of rules) if (r.decls.some(d => prop(d) === 'display' && /^none/.test(val(d)))) r.sel.split(',').forEach(s => hiddenSel.add(s.trim()));

const kept = [];
for (const r of rules) {
  const sels = r.sel.split(',').map(s => s.trim());
  const keep = [];
  const positioned = r.decls.some(d => prop(d) === 'position' && /fixed|absolute|sticky/.test(val(d)));
  const scrolls = r.decls.some(d => /^overflow/.test(prop(d)) && /auto|scroll|hidden/.test(val(d)));
  const clipped = r.decls.some(d => /^clip/.test(prop(d)));
  for (const d of r.decls) {
    const p = prop(d), v = val(d);
    if (ALWAYS.test(p)) keep.push(d);
    else if (p === 'display' && (/^none/.test(v) || STATE.test(r.sel) || sels.some(s => hiddenSel.has(s)))) keep.push(d);
    else if (/^(width|height|max-width|max-height|min-width|min-height)$/.test(p) && (positioned || clipped || (scrolls && /^max-/.test(p)))) keep.push(d);
    else if (p === 'transform' && (positioned || STATE.test(r.sel))) keep.push(d);
    else if (p === 'margin' && clipped) keep.push(d);
    else if (p === 'white-space' && clipped) keep.push(d);
  }
  if (keep.length) kept.push({ at: r.at, sel: sels.join(', '), decls: keep });
}
// Drop declarations that reference custom properties nobody defines any more; dedupe identical rules.
const seen = new Set(), out = [];
for (const r of kept) {
  const key = r.at.join('|') + '§' + r.sel + '§' + r.decls.join(';');
  if (seen.has(key)) continue; seen.add(key); out.push(r);
}
// Group by at-rule context, preserving source order.
let text = '', open = null;
for (const r of out) {
  const at = r.at.join(' ');
  if (at !== open) { if (open) text += '}\n'; if (at) text += at + ' {\n'; open = at || null; }
  text += (at ? '  ' : '') + r.sel + ' { ' + r.decls.join('; ') + '; }\n';
}
if (open) text += '}\n';
fs.writeFileSync('tmp/functional.css', text);
const vars = [...new Set((text.match(/var\(--[\w-]+/g) || []).map(v => v.slice(4)))];
console.log('legacy rules', rules.length, '-> functional rules', out.length, '| bytes', text.length);
console.log('custom properties referenced:', vars.join(' '));
