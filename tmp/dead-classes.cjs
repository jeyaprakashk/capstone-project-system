// Classes styled by the old legacy CSS that are neither in app-styles.html nor in getFunctionalStyles_().
const fs = require('fs'), vm = require('vm');
const B = 'tmp/legacy-backup/';
const ctx = vm.createContext({ escapeHtml: s => String(s) });
for (const f of ['lucide-icons.js', 'icon-renderer.js', 'common-styles.js', 'coordinator-dashboard.js', 'guide-dashboard.js', 'reviewer-dashboard.js', 'review-evaluation-client.js', 'internal-assessment-publishing-client.js'])
  vm.runInContext(fs.readFileSync(B + f + '.bak', 'utf8'), ctx, { filename: f });
const router = fs.readFileSync(B + 'dashboard-router.js.bak', 'utf8');
const legacyCss = vm.runInContext('`' + router.slice(router.indexOf('<style>') + 7, router.indexOf('</style>')) + '`', ctx).replace(/\/\*[\s\S]*?\*\//g, '');
const classesIn = css => new Set((css.replace(/\{[^{}]*\}/g, '{}').match(/\.[A-Za-z_][\w-]*/g) || []).map(c => c.slice(1)));
const legacy = classesIn(legacyCss);
const fw = classesIn(fs.readFileSync('app-styles.html', 'utf8'));
const c2 = vm.createContext({}); vm.runInContext(fs.readFileSync('common-styles.js', 'utf8'), c2);
const functional = classesIn(c2.getFunctionalStyles_());
const dead = [...legacy].filter(c => !fw.has(c) && !functional.has(c)).sort();
fs.writeFileSync('tmp/dead-classes.json', JSON.stringify(dead));
console.log('legacy classes', legacy.size, '| framework', fw.size, '| functional', functional.size, '| dead', dead.length);
