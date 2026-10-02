// Show dead class names that remain in class-building code, with surrounding text.
const fs = require('fs');
const dead = JSON.parse(fs.readFileSync('tmp/dead-classes.json', 'utf8'));
const files = fs.readdirSync('.').filter(f => f.endsWith('.js') && !['lucide-icons.js', 'common-styles.js'].includes(f));
for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
  for (const c of dead) {
    const re = new RegExp(`['" ]${c.replace(/-/g, '\\-')}(?![\\w-])`, 'g');
    let m;
    while ((m = re.exec(l))) {
      const ctx = l.slice(Math.max(0, m.index - 70), m.index + c.length + 50);
      if (/class|className|classList/.test(ctx)) console.log(`${f}:${i + 1} [${c}] …${ctx.replace(/\s+/g, ' ')}…`);
    }
  }
});
