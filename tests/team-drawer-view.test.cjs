// Team drawer view: renders the team-detail DTOs section by section through the bridge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const BASIC = { title: 'Smart Farming', problem: 'x'.repeat(200), guideName: 'Dr. A', guideEmail: 'a@example.com', committeeNumber: 'C1', repoUrl: 'https://github.com/org/t1',
  students: [{ name: 'One', regNo: '001', email: 'one@example.com' }], reviewers: [{ name: 'Rev', email: 'rev@example.com' }] };
const PROGRESS = { titleStatus: 'APPROVED', guideDecision: 'Approved', reviewerDecision: 'Approved', repoStatus: 'Repository URL recorded', health: 'monitor',
  reviews: [{ label: 'Review 1', available: true, completed: true }, { label: 'Review 2', available: false, completed: false }] };
const ACTIVITY = { weekLogs: 3, weekCommits: 'Unavailable' };

function setup(data = { basic: BASIC, progress: PROGRESS, activity: ACTIVITY }) {
  const { document, window } = parseHTML('<html><body><div id="content"></div></body></html>');
  const c = loadSources(['data-bridge-client.js', 'team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js'], { document, Promise, JSON, setTimeout, clearTimeout });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const requests = [], fail = {};
  bridge.useTransport((method, args) => {
    requests.push(args.join(':'));
    const section = args[1];
    return Promise.resolve(JSON.stringify(fail[section] ? { ok: false, error: { code: 'UNAVAILABLE', message: fail[section] } } : { ok: true, data: data[section] }));
  });
  const ui = { renderSkeleton: (v, l) => '<span data-skeleton aria-label="' + l + '">…</span>', renderExpandableText: t => '<details data-expandable>' + String(t).slice(0, 10) + '</details>' };
  vm.runInContext('globalThis.__make = ' + c.teamDrawerViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui);
  const host = document.getElementById('content');
  const flush = () => new Promise(r => setImmediate(r));
  return { view, host, requests, fail, flush, window, open: { value: true } };
}
const section = (f, name) => f.host.querySelector('[data-drawer-section="' + name + '"]');
const text = node => node.textContent.replace(/\s+/g, ' ').trim();

test('mounting shows a skeleton per section and requests all three at once', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value);
  assert.deepEqual(['basic', 'progress', 'activity'].map(name => section(f, name).querySelectorAll('[data-skeleton]').length > 0), [true, true, true]);
  assert.deepEqual(f.requests, ['T1:basic', 'T1:progress', 'T1:activity']);
  await f.flush();
});

test('each section renders its own DTO and settles independently', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  const basic = text(section(f, 'basic'));
  for (const expected of ['Smart Farming', 'Dr. A', 'a@example.com', 'One', '001 · one@example.com', 'Review Committee · C1', 'Rev', 'https://github.com/org/t1']) assert(basic.includes(expected), expected);
  assert(section(f, 'basic').querySelector('[data-expandable]'));
  assert.equal(section(f, 'basic').querySelector('a').getAttribute('rel'), 'noopener');
  const progress = text(section(f, 'progress'));
  for (const expected of ['Title StatusAPPROVED', 'Overall HealthMonitor']) assert(progress.includes(expected), expected);
  for (const expected of ['Review 1Completed', 'Review 2Unavailable']) assert(progress.includes(expected), expected);
  assert(progress.includes('Some review data is unavailable.'), 'partial review data offers a retry');
  assert.equal(text(section(f, 'activity')), 'This WeekDaily Logs3GitHub CommitsUnavailable');
  assert.equal(f.host.querySelectorAll('[data-skeleton]').length, 0);
});

test('a failed section reports it and Retry reloads only that section', async () => {
  const f = setup(); f.fail.progress = 'marks unavailable';
  f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  assert(text(section(f, 'progress')).includes('Unable to load progress: marks unavailable.'));
  assert(text(section(f, 'basic')).includes('Smart Farming'), 'other sections are unaffected');
  const before = f.requests.length; f.fail.progress = null;
  section(f, 'progress').querySelector('[data-action="drawer-retry"]').dispatchEvent(new f.window.Event('click', { bubbles: true })); await f.flush();
  assert.deepEqual(f.requests.slice(before), ['T1:progress']);
  assert(text(section(f, 'progress')).includes('Overall Health'));
});

test('results are ignored after the drawer closes, is cancelled or moves to another team', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); f.open.value = false; await f.flush();
  assert(section(f, 'basic').querySelectorAll('[data-skeleton]').length > 0, 'a closed drawer is not filled');
  f.open.value = true; f.view.mount(f.host, 'T1', () => f.open.value); f.view.cancel(); await f.flush();
  assert(section(f, 'basic').querySelectorAll('[data-skeleton]').length > 0, 'a cancelled mount is not filled');
  f.view.mount(f.host, 'T2', () => f.open.value); await f.flush();
  assert(text(section(f, 'basic')).includes('Smart Farming'));
});

test('escapes every value, uses no inline handlers and only compiled classes', async () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const f = setup({ basic: { ...BASIC, title: evil, guideName: evil, repoUrl: 'https://x.test/?a="><b>', students: [{ name: evil, regNo: evil, email: evil }], reviewers: [{ name: evil, email: evil }] },
    progress: { ...PROGRESS, titleStatus: evil, reviews: [{ label: evil, available: true, completed: false }] }, activity: { weekLogs: evil, weekCommits: evil } });
  f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  assert.equal(f.host.querySelectorAll('img, b').length, 0);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
  assert.equal(f.host.querySelectorAll('[style]').length, 0);
  const good = setup(); good.view.mount(good.host, 'T1', () => good.open.value); await good.flush();
  assert.deepEqual(missingClasses(renderedClasses(good.host).filter(c => !c.startsWith('lucide'))), []);
});
