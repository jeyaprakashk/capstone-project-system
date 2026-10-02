// Remove named top-level functions (and the JSDoc/banner comments directly above them) from JS files.
// Usage: node tmp/remove-functions.cjs file.js name1 name2 ...
// Uses a small tokenizer so braces inside strings, template literals and comments are ignored.
const fs = require('fs');
const [file, ...names] = process.argv.slice(2);
let src = fs.readFileSync(file, 'utf8');
function endOfFunction(text, bodyOpen) {
  let i = bodyOpen, depth = 0;
  const stack = []; // template literal nesting: depth at which each ${ opened
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '/' && n === '/') { i = text.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && n === '*') { i = text.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"') { i++; while (i < text.length && text[i] !== c) { if (text[i] === '\\') i++; i++; } i++; continue; }
    if (c === '`') { i++; i = scanTemplate(text, i); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return -1;
  function scanTemplate(t, j) {
    while (j < t.length) {
      if (t[j] === '\\') { j += 2; continue; }
      if (t[j] === '`') return j + 1;
      if (t[j] === '$' && t[j + 1] === '{') {
        let d = 1; j += 2;
        while (j < t.length && d) {
          const ch = t[j];
          if (ch === '`') { j = scanTemplate(t, j + 1); continue; }
          if (ch === "'" || ch === '"') { j++; while (j < t.length && t[j] !== ch) { if (t[j] === '\\') j++; j++; } j++; continue; }
          if (ch === '{') d++; else if (ch === '}') d--;
          j++;
        }
        continue;
      }
      j++;
    }
    return j;
  }
}
for (const name of names) {
  const re = new RegExp('^function ' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'm');
  const m = re.exec(src);
  if (!m) { console.error(file + ': function not found: ' + name); process.exit(1); }
  const open = src.indexOf('{', src.indexOf(')', m.index));
  const end = endOfFunction(src, open);
  if (end < 0) { console.error(file + ': could not find end of ' + name); process.exit(1); }
  // Include directly preceding comment lines (JSDoc or // banners) and blank line.
  let startLine = src.lastIndexOf('\n', m.index - 1) + 1, start = m.index;
  const before = src.slice(0, start).split('\n'); before.pop();
  while (before.length && /^\s*(\/\/|\/\*\*|\*|\*\/)/.test(before[before.length - 1])) before.pop();
  start = before.join('\n').length + (before.length ? 1 : 0);
  let stop = end; while (src[stop] === '\r' || src[stop] === '\n') stop++;
  src = src.slice(0, start) + src.slice(stop);
  console.log(file + ': removed ' + name);
}
fs.writeFileSync(file, src);
