// Remove dead legacy class tokens from markup in JS sources.
// Usage: node tmp/strip-classes.cjs [--write] files...
// Handles class="..." / class=\"...\" attributes inside JS strings, and className = '...' assignments.
// Only whole tokens inside static text are removed; tokens touching ${...} or '+expr+' are reported.
const fs = require('fs');
const dead = new Set(JSON.parse(fs.readFileSync('tmp/dead-classes.json', 'utf8')));
const write = process.argv.includes('--write');
const files = process.argv.slice(2).filter(a => a !== '--write');
const report = { removed: 0, partial: [], classList: [], emptied: 0 };

function processValue(value, jsQuote) {
  // Split value into static and dynamic segments.
  const segs = []; let i = 0, buf = '';
  while (i < value.length) {
    if (value.startsWith('${', i)) {
      let d = 1, j = i + 2;
      while (j < value.length && d) { if (value[j] === '{') d++; else if (value[j] === '}') d--; j++; }
      segs.push({ s: buf }); buf = ''; segs.push({ d: value.slice(i, j) }); i = j; continue;
    }
    if (jsQuote && value[i] === jsQuote && value[i - 1] !== '\\') {
      // ' + expr + '  : find the resume point  + '
      const rest = value.slice(i + 1);
      const m = rest.match(new RegExp('^\\s*\\+[\\s\\S]*?\\+\\s*' + (jsQuote === "'" ? "'" : '"')));
      if (!m) return null;
      segs.push({ s: buf }); buf = ''; segs.push({ d: value.slice(i, i + 1 + m[0].length) }); i += 1 + m[0].length; continue;
    }
    buf += value[i++];
  }
  segs.push({ s: buf });
  // Remove dead tokens from static segments; tokens touching a dynamic segment are partial.
  let out = '';
  segs.forEach((seg, k) => {
    if (seg.d !== undefined) { out += seg.d; return; }
    const parts = seg.s.split(/(\s+)/);
    const kept = parts.map((p, idx) => {
      if (!p || /^\s+$/.test(p)) return p;
      const touchesPrev = idx === 0 && k > 0, touchesNext = idx === parts.length - 1 && k < segs.length - 1;
      if (touchesPrev || touchesNext) { if ([...dead].some(c => p.includes(c))) report.partial.push(p); return p; }
      if (dead.has(p)) { report.removed++; return ''; }
      return p;
    });
    out += kept.join('').replace(/\s{2,}/g, ' ');
  });
  // Trim spaces at value start/end when they are static.
  return out.replace(/^\s+(?!\$)/, '').replace(/(?<!\})\s+$/, '');
}

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const out = lines.map((line, n) => {
    let result = line;
    // Attribute values: class="...", class=\"...\"
    result = result.replace(/(\s)class=(\\?")((?:(?!\2)[\s\S])*?)\2/g, (all, sp, q, value) => {
      // Determine enclosing JS quote: if the attribute uses a bare ", the JS string is '...' or `...`.
      const jsQuote = q === '"' ? "'" : null;
      const v = processValue(value, jsQuote);
      if (v === null) { report.partial.push(file + ':' + (n + 1) + ' unparsed: ' + value.slice(0, 60)); return all; }
      if (v.trim() === '') { report.emptied++; return ''; }
      return sp + 'class=' + q + v + q;
    });
    // className = '...'
    result = result.replace(/(\.className\s*=\s*)(['"`])([^'"`]*)\2/g, (all, pre, q, value) => {
      const v = processValue(value, null);
      return pre + q + (v === null ? value : v) + q;
    });
    for (const m of result.matchAll(/classList\.(add|remove|toggle|contains)\(\s*['"]([\w-]+)['"]/g)) if (dead.has(m[2])) report.classList.push(file + ':' + (n + 1) + ' ' + m[0]);
    return result;
  });
  const next = out.join('\n');
  if (write && next !== src) fs.writeFileSync(file, next);
}
console.log('removed tokens:', report.removed, '| emptied class attributes:', report.emptied);
console.log('partial/dynamic tokens (' + report.partial.length + '):\n  ' + [...new Set(report.partial)].join('\n  '));
console.log('classList calls on dead classes (' + report.classList.length + '):\n  ' + report.classList.join('\n  '));
