const fs = require('fs');
const fw = new Set(['btn','btn-primary','btn-outline','btn-sm','btn-lg','tab','tile','tile--selected','tile--locked','nav-item','nav-item--active','page-link','marker-accent','ring-selected','circle','is-active']);
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'lucide-icons.js');
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const l = raw.replace(/\\/g, '');
    const re = /<button\b([^>]*)>/g; let m;
    while ((m = re.exec(l))) {
      const cm = m[1].match(/class=["']([^"']*)/);
      const cls = cm ? cm[1].split(/\s+/).filter(c => c && !/[$'+{]/.test(c)) : [];
      const other = cls.filter(c => !fw.has(c));
      const has = cls.some(c => fw.has(c));
      if (!has || other.length) console.log(`${f}:${i + 1} fw=[${cls.filter(c => fw.has(c)).join(' ')}] other=[${other.join(' ')}]${has ? '' : '  <-- NO FW'}`);
    }
    const re2 = /className\s*=\s*['"`]([^'"`]*)['"`]/g;
    while ((m = re2.exec(l))) if (/button|btn|retry|undo/i.test(l)) console.log(`${f}:${i + 1} [className] ${m[1]}`);
  });
}
