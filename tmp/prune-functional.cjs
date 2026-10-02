// Report (or with --write, drop) functional rules whose selector uses a class no longer emitted anywhere.
const fs = require('fs'), vm = require('vm');
const write = process.argv.includes('--write');
const sources = fs.readdirSync('.').filter(f => f.endsWith('.js') && !['lucide-icons.js', 'common-styles.js'].includes(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n')
  + fs.readFileSync('common-styles.js', 'utf8').split('function getFunctionalStyles_')[0];
const used = c => new RegExp(`(class(Name)?=[^>]*|classList\\.(add|toggle)\\([^)]*|['"\` ])${c.replace(/-/g, '\\-')}(?![\\w-])`).test(sources);
let css = fs.readFileSync('tmp/functional-final.css', 'utf8');
const lines = css.split('\n'), out = [], dropped = [];
for (const line of lines) {
  const m = line.match(/^\s*([^{@}][^{]*)\{/);
  if (m) {
    const classes = (m[1].replace(/:(not|has|is)\([^)]*\)/g, '').match(/\.[A-Za-z_][\w-]*/g) || []).map(c => c.slice(1));
    const missing = classes.filter(c => !used(c));
    if (missing.length) { dropped.push(line.trim() + '   <- ' + missing.join(',')); continue; }
  }
  out.push(line);
}
let text = out.join('\n').replace(/@[^{\n]+\{\n\}\n?/g, '');
console.log('dropped', dropped.length, '\n  ' + dropped.join('\n  '));
if (write) fs.writeFileSync('tmp/functional-final.css', text);
