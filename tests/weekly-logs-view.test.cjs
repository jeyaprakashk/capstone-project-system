// The "All weekly logs" drawer: its markup for the student must stay exactly as it was (golden master), and the
// shared module renders the same drawer for the guide from that student's submissions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { Sync } = require('./sync-promise.cjs');
const { expectGolden } = require('./invariants/golden.cjs');
const { studentData } = require('./weekly-logs-fixture.cjs');

const ui = { busy: require('./busy-fixture.cjs')(), ask: async () => true, openContentDrawer() {}, renderIcon: name => '<svg data-icon="' + name + '" aria-hidden="true"></svg>', beginContentLoading: () => () => {} };

function studentDrawer() {
  const { document, window } = parseHTML('<html><body><section id="studentWeeklyProgress"><div data-weekly-read><span>Skeleton</span></div><p data-weekly-status></p><button data-weekly-refresh>Refresh weekly progress</button><div data-weekly-form></div></section></body></html>');
  const requests = [];
  const bridge = { read: () => { const p = new Sync(); requests.push(v => p.resolve(v)); return p; }, write: () => new Sync() };
  const opened = [];
  const shown = { ...ui, openContentDrawer: (title, html) => opened.push({ title, html }) };
  const context = vm.createContext({ document, Date, Intl, crypto: { randomUUID: () => 'id' } });
  for (const file of ['weekly-logs-view.js', 'student-weekly-view.js']) if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const logs = fs.existsSync('weekly-logs-view.js') ? context.weeklyLogsViewBrowser_(() => shown) : undefined;
  const api = logs ? context.studentWeeklyViewBrowser_(bridge, () => shown, logs) : context.studentWeeklyViewBrowser_(bridge, () => shown);
  api.load();
  const data = studentData();
  requests.at(-1)({ ...data, weeks: data.allWeeks });
  document.querySelector('[data-action="open-logs"]').dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  return opened;
}

test('the student drawer markup is unchanged (golden master)', () => {
  const opened = studentDrawer();
  assert.equal(opened.length, 1);
  expectGolden('student-weekly-logs-drawer', opened[0]);
});
