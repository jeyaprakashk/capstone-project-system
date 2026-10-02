// For each class name, print source lines that emit it in markup (not CSS rules).
const fs = require('fs');
const names = process.argv.slice(2);
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'lucide-icons.js');
for (const name of names) {
  const re = new RegExp('(class(Name)?\\s*=|classList\\.(add|toggle)\\(|class=\\\\?["\'])[^;]*?(?<![\\w-])' + name.replace(/-/g, '\\-') + '(?![\\w-])');
  console.log('##### ' + name);
  for (const f of files) fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (!re.test(l)) return;
    const at = l.search(new RegExp('(?<![\\w-])' + name.replace(/-/g, '\\-') + '(?![\\w-])'));
    console.log(`  ${f}:${i + 1}  …${l.slice(Math.max(0, at - 70), at + 70).trim()}…`);
  });
}
