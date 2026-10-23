// Shared table: the one definition of table markup and styling; no other module writes table tags.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const table = () => { const c = loadSources(['shared-table.js']); return c.sharedTableBrowser_(); };
const build = (t, extra = {}) => t.table({ label: 'Teams', head: t.head(['ID', { label: 'Team', attrs: { 'data-sort': 'x' } }]),
  body: t.tbody(t.row([t.rowHeader('T1'), t.td('<b>x</b>' + t.note('note'), { 'data-col': 'a' })], { 'data-team-id': 'T1' }, true) + t.emptyRow(2, 'none'), { id: 'body' }), ...extra });

test('renders a named, focusable scroll region around a captioned table with scoped headers', () => {
  const { document } = parseHTML('<body>' + build(table()) + '</body>');
  const region = document.querySelector('[role=region]');
  assert.equal(region.getAttribute('tabindex'), '0');
  assert.match(region.getAttribute('aria-label'), /^Teams, scroll horizontally/);
  assert.equal(document.querySelector('caption').textContent, 'Teams');
  assert.deepEqual(Array.from(document.querySelectorAll('thead th')).map(th => th.getAttribute('scope')), ['col', 'col']);
  assert.equal(document.querySelector('tbody th').getAttribute('scope'), 'row');
  assert.equal(document.querySelector('th[data-sort]').textContent, 'Team');
  assert.equal(document.querySelector('tbody#body tr[data-team-id=T1] td[data-col=a] span').textContent, 'note');
});

test('attributes are escaped, true is bare and false or null is skipped', () => {
  const t = table();
  const html = t.td('x', { title: '"><img src=x>', hidden: true, 'data-no': false, 'data-none': null });
  assert.equal(parseHTML('<table><tbody><tr>' + html + '</tr></tbody></table>').document.querySelectorAll('img').length, 0);
  assert.match(html, / hidden[ >]/);
  assert.doesNotMatch(html, /data-no|data-none/);
  assert.equal(parseHTML('<body>' + t.table({ label: '<i>', head: '', body: t.tbody('') }) + '</body>').document.querySelectorAll('i').length, 0);
});

test('uses only compiled utilities: no inline styles, handlers or component classes', () => {
  const { document } = parseHTML('<body>' + build(table()) + '</body>');
  assert.deepEqual(missingClasses(renderedClasses(document.body)), []);
  assert.equal(document.querySelectorAll('[style]').length, 0);
  assert.doesNotMatch(document.body.innerHTML, /\son[a-z]+=/);
  assert.equal(document.querySelectorAll('.table, .card, .btn').length, 0);
});

test('team tables share the Team, Students and Guide columns', () => {
  const t = table();
  assert.deepEqual(Array.from(t.TEAM_COLUMNS), ['Team', 'Students', 'Guide']);
  const { document } = parseHTML('<table><tbody><tr>' + t.teamCells({ teamId: 'G1', guide: 'Dr. A', students: [{ name: 'Asha', regNo: '9923005014' }, { name: '', regNo: '9923005163' }] }, { after: '<i>x</i>' }).join('') + '</tr></tbody></table>');
  const cells = Array.from(document.querySelectorAll('td'));
  assert.equal(cells[0].textContent, 'G1x');
  assert.deepEqual(Array.from(cells[1].querySelectorAll('li')).map(li => li.textContent), ['Asha (9923005014)', 'Name unavailable (9923005163)']);
  assert.equal(cells[2].textContent, 'Dr. A');
  assert.equal(parseHTML('<table><tbody><tr>' + t.teamCells({ teamId: 'G2', students: [] }).join('') + '</tr></tbody></table>').document.querySelectorAll('td')[1].textContent, '—');
});

test('no other module writes its own table markup', () => {
  const offenders = fs.readdirSync('.').filter(file => file.endsWith('.js') && file !== 'shared-table.js')
    .filter(file => /<\/?(table|thead|tbody|tr|th|td)[\s>]/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
