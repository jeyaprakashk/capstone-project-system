// One-off: remove non-framework button variant classes from markup in source files.
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'lucide-icons.js' && f !== 'common-styles.js');
const DROP = ['app-btn', 'btn-md', 'btn-secondary', 'btn-icon', 'btn-table-sort'];
const MAP = { 'btn-success': 'btn-primary', 'btn-danger': 'btn-outline', 'btn-warning': 'btn-outline', 'btn-help': 'btn-outline' };
let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let out = src;
  // Class-token boundaries: start of quoted class value or whitespace before, whitespace/quote after.
  const tok = name => new RegExp('(^|[\\s"\'`])' + name + '(?=[\\s"\'`]|$)', 'gm');
  for (const [from, to] of Object.entries(MAP)) out = out.replace(tok(from), (m, pre) => pre + to);
  for (const name of DROP) out = out.replace(new RegExp('(["\'`])' + name + '\\s+', 'g'), '$1').replace(new RegExp('\\s+' + name + '(?=[\\s"\'`])', 'g'), '');
  // Collapse duplicate btn-outline produced by mapping onto a list that already had it.
  out = out.replace(/\bbtn-outline((?:\s+[\w-]+)*?)\s+btn-outline\b/g, 'btn-outline$1');
  if (out !== src) {
    const n = src.split('\n').filter((l, i) => l !== out.split('\n')[i]).length;
    total += n; console.log(f, n, 'lines');
    fs.writeFileSync(f, out);
  }
}
console.log('total lines changed', total);
