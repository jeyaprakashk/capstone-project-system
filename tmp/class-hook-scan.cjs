// Finds JavaScript that locates elements or reads state via CSS class names.
const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'lucide-icons.js' && !f.startsWith('generated'));
const SEL_CALL = /\b(querySelector(?:All)?|closest|matches|getElementsByClassName)\s*\(\s*(['"`])((?:(?!\2).)*)\2/g;
const READ = [
  ['classList.contains', /classList\.contains\(\s*(['"`])([^'"`]+)\1/g],
  ['className test', /className\s*(?:===|!==|==|!=)\s*['"`][^'"`]*['"`]|\/[^/\n]+\/[gimsuy]*\.test\([^)]*className|className\.(?:includes|indexOf|match|split)\(/g],
];
const rows = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    let m;
    SEL_CALL.lastIndex = 0;
    while ((m = SEL_CALL.exec(l))) {
      const sel = m[3];
      if (m[1] === 'getElementsByClassName') { rows.push([f, i + 1, m[1], sel]); continue; }
      // Strip attribute selectors and strings so class detection only sees real class tokens.
      const bare = sel.replace(/\[[^\]]*\]/g, '').replace(/\$\{[^}]*\}/g, '');
      const classes = bare.match(/\.[A-Za-z_][\w-]*/g);
      if (classes) rows.push([f, i + 1, m[1], sel, classes.join(' ')]);
    }
    for (const [kind, re] of READ) { re.lastIndex = 0; while ((m = re.exec(l))) rows.push([f, i + 1, kind, m[2] || m[0]]); }
  });
}
const byFile = {};
for (const r of rows) (byFile[r[0]] ||= []).push(r);
for (const [f, list] of Object.entries(byFile)) {
  console.log(`\n## ${f} (${list.length})`);
  for (const [, line, kind, sel, cls] of list) console.log(`${line}\t${kind}\t${sel}${cls ? '\t=> ' + cls : ''}`);
}
console.log('\nTOTAL', rows.length);
