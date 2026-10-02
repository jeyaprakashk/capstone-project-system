// Exact, once-only string replacements: node tmp/apply.cjs <edits-module.cjs>
// Validates every edit against every file before writing anything. Preserves each file's line endings.
const fs = require('fs'), path = require('path');
const edits = require(path.resolve(process.argv[2]));
const byFile = {};
for (const e of edits) (byFile[e.file] ||= []).push(e);
const results = {};
let failed = 0;
for (const [file, list] of Object.entries(byFile)) {
  let src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  for (const edit of list) {
    // Files can mix line endings line by line: each newline in the edit matches either LF or CRLF.
    const pattern = new RegExp(edit.find.split(/\r?\n/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\r?\\n'), 'g');
    const matches = src.match(pattern) || [];
    if (matches.length !== 1) { console.error(`${file}: expected 1 match, found ${matches.length}: ${edit.find.slice(0, 100)}`); failed++; continue; }
    const matchEol = /\r\n/.test(matches[0]) ? '\r\n' : /\n/.test(matches[0]) ? '\n' : eol;
    const replace = edit.replace.replace(/\r?\n/g, matchEol);
    src = src.replace(pattern, () => replace);
  }
  results[file] = src;
}
if (failed) { console.error(failed + ' edit(s) failed; nothing written'); process.exit(1); }
for (const [file, src] of Object.entries(results)) fs.writeFileSync(file, src);
console.log('applied', edits.length, 'edits to', Object.keys(results).length, 'files');
