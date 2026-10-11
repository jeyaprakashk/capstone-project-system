// Team drawer view: renders the team-detail DTOs section by section through the bridge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const BASIC = { title: 'Smart Farming', problem: 'x'.repeat(200), guideName: 'Dr. A', guideEmail: 'a@example.com', committeeNumber: 'C1', repoUrl: 'https://github.com/org/t1',
  students: [{ name: 'One', regNo: '001', email: 'one@example.com' }], reviewers: [{ name: 'Rev', email: 'rev@example.com' }] };
const PROGRESS = { titleStatus: 'APPROVED', repoStatus: 'Repository URL recorded', health: 'monitor',
  reviews: [{ label: 'Review 1', available: true, completed: true }, { label: 'Review 2', available: false, completed: false }] };
const ACTIVITY = { weekLogs: 3, weekCommits: 'Unavailable' };
const cap = (allowed, reason = '') => ({ allowed, reason, activity: null, requirements: [] });
const TITLE = {
  title: { teamId: 'T1', revision: 3, status: 'APPROVED', reopened: false, proposal: { title: 'NEW IDEA', problem: 'p' }, notes: '', similarityNote: '40% similar to "X"',
    approved: { value: true, title: 'SMART FARMING', problem: 'p', at: '2026-01-02T10:00:00.000Z', by: 'rev@example.com' }, reopen: null, folderUrl: 'https://drive.example.com/T1',
    documents: [{ key: 'work', label: 'Work Breakdown document', present: true, uploadedBy: null, uploadedAt: null }, { key: 'need', label: 'Need Analysis document', present: false, uploadedBy: null, uploadedAt: null }],
    history: [{ revision: 1, action: 'SUBMIT', actor: 'ann@x.edu', at: '2026-01-01T10:00:00.000Z', notes: '' }, { revision: 3, action: 'REVIEWER_APPROVE', actor: 'rev@example.com', at: '2026-01-02T10:00:00.000Z', notes: 'ok' }],
    can: { submit: cap(false), approve: cap(false), return: cap(false), reopen: cap(true), cancel: cap(false) } },
  requirements: { errors: [], activities: { 'title.submit': { allowed: false, reason: 'x', requirements: [{ label: 'GitHub setup complete', met: false, reason: 'Could not verify: GitHub setup complete.', diagnostic: 'GITHUB_ERROR' }] },
    'title.resubmit': { allowed: true, requirements: [], reason: '' } } }
};

function setup(data = { basic: BASIC, title: TITLE, progress: PROGRESS, activity: ACTIVITY }) {
  const { document, window } = parseHTML('<html><body><div id="content"></div></body></html>');
  const c = loadSources(['data-bridge-client.js', 'title-requests.js', 'team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js'], { document, Promise, JSON, setTimeout, clearTimeout });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const requests = [], fail = {};
  const writes = [];
  bridge.useTransport((method, args) => {
    if (method !== 'API_coordinator_getTeamDrawer') { writes.push([method, args]); return Promise.resolve(JSON.stringify(fail.write ? { ok: false, error: { code: fail.writeCode || 'REJECTED', message: fail.write } } : { ok: true, data: { ok: true } })); }
    requests.push(args.join(':'));
    const section = args[1];
    return Promise.resolve(JSON.stringify(fail[section] ? { ok: false, error: { code: 'UNAVAILABLE', message: fail[section] } } : { ok: true, data: data[section] }));
  });
  const ui = { busy:require('./busy-fixture.cjs')(), renderSkeleton: (v, l) => '<span data-skeleton aria-label="' + l + '">…</span>', renderExpandableText: t => '<details data-expandable>' + String(t).slice(0, 10) + '</details>' };
  vm.runInContext('globalThis.__make = ' + c.teamDrawerViewBrowser_.toString(), c);
  const titleRequests = c.titleRequestsBrowser_();
  const view = c.__make(bridge, () => ui, () => titleRequests);
  const host = document.getElementById('content');
  const flush = () => new Promise(r => setImmediate(r));
  return { view, host, requests, writes, fail, flush, window, open: { value: true } };
}
const section = (f, name) => f.host.querySelector('[data-drawer-section="' + name + '"]');
const text = node => node.textContent.replace(/\s+/g, ' ').trim();

test('mounting shows a skeleton per section and requests all four at once', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value);
  assert.deepEqual(['basic', 'title', 'progress', 'activity'].map(name => section(f, name).querySelectorAll('[data-skeleton]').length > 0), [true, true, true, true]);
  assert.deepEqual(f.requests, ['T1:basic', 'T1:title', 'T1:progress', 'T1:activity']);
  await f.flush();
});

test('each section renders its own DTO and settles independently', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  const basic = text(section(f, 'basic'));
  for (const expected of ['Smart Farming', 'Dr. A', 'a@example.com', 'One', '001 · one@example.com', 'Review Committee · C1', 'Rev', 'https://github.com/org/t1']) assert(basic.includes(expected), expected);
  assert(section(f, 'basic').querySelector('[data-expandable]'));
  assert.equal(section(f, 'basic').querySelector('a').getAttribute('rel'), 'noopener');
  const progress = text(section(f, 'progress'));
  for (const expected of ['Title StatusApproved', 'Overall HealthMonitor']) assert(progress.includes(expected), expected);
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
    title: { ...TITLE, title: { ...TITLE.title, notes: evil, similarityNote: evil, folderUrl: 'https://x.test/?a="><b>', history: [{ revision: 1, action: evil, actor: evil, at: evil, notes: evil }], proposal: { title: evil, problem: evil } },
      requirements: { errors: [evil], activities: { 'title.submit': { allowed: false, reason: evil, requirements: [{ label: evil, met: false, reason: evil, diagnostic: evil }] } } } },
    progress: { ...PROGRESS, titleStatus: evil, reviews: [{ label: evil, available: true, completed: false }] }, activity: { weekLogs: evil, weekCommits: evil } });
  f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  assert.equal(f.host.querySelectorAll('img, b').length, 0);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
  assert.equal(f.host.querySelectorAll('[style]').length, 0);
  const good = setup(); good.view.mount(good.host, 'T1', () => good.open.value); await good.flush();
  assert.deepEqual(missingClasses(renderedClasses(good.host).filter(c => !c.startsWith('lucide'))), []);
});

test('the title section shows the state, the checklist with its diagnostics, the documents and the history', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  const title = text(section(f, 'title'));
  for (const expected of ['StatusApproved', 'Title in effectSMART FARMING', 'rev@example.com', 'Similarity40% similar', 'Work Breakdown documentPresent', 'Need Analysis documentMissing',
    'GitHub setup completeCould not verify: GitHub setup complete. GITHUB_ERROR', 'Reviewer approved', 'Submitted']) assert(title.includes(expected), expected);
  assert.equal(section(f, 'title').querySelector('a').getAttribute('href'), 'https://drive.example.com/T1');
  assert(section(f, 'title').querySelector('[data-action="title-reopen"]'));
  assert.equal(section(f, 'title').querySelector('[data-action="title-cancel"]'), null);
});

test('reopening needs a reason, sends one write with the revision shown, and reloads only the title section', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  const click = () => section(f, 'title').querySelector('[data-action="title-reopen"]').dispatchEvent(new f.window.Event('click', { bubbles: true }));
  click(); await f.flush();
  assert.equal(f.writes.length, 0);
  assert.equal(section(f, 'title').querySelector('[data-title-status]').textContent, 'Enter a reason.');
  section(f, 'title').querySelector('[data-title-reason]').value = ' Scope change ';
  const before = f.requests.length;
  click(); await f.flush(); await f.flush();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][0], 'API_coordinator_reopenTitle');
  const sent = f.writes[0][1][0];
  assert.match(sent.requestId, /^\S{8,}$/);
  assert.deepEqual({ ...sent, requestId: 'x' }, { requestId: 'x', expectedRevision: 3, teamId: 'T1', reason: 'Scope change' });
  assert.deepEqual(f.requests.slice(before), ['T1:title']);
});

test('a refused or conflicting reopening shows the message and reloads the title section', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  section(f, 'title').querySelector('[data-title-reason]').value = 'Because';
  f.fail.write = 'This title changed since you opened it.'; f.fail.writeCode = 'CONFLICT';
  const before = f.requests.length;
  section(f, 'title').querySelector('[data-action="title-reopen"]').dispatchEvent(new f.window.Event('click', { bubbles: true })); await f.flush(); await f.flush(); await f.flush();
  assert.deepEqual(f.requests.slice(before), ['T1:title']);
  assert.match(section(f, 'title').querySelector('[data-title-status]').textContent, /changed since you opened it/);
  assert.equal(section(f, 'title').querySelector('[data-action="title-reopen"]').disabled, false);
});

test('a reopened title offers only cancelling the reopening', async () => {
  const reopened = { ...TITLE, title: { ...TITLE.title, status: 'REOPENED', reopened: true, reopen: { reason: 'Scope', by: 'coord@x', at: '2026-01-03T10:00:00.000Z' }, can: { ...TITLE.title.can, reopen: cap(false), cancel: cap(true) } } };
  const f = setup({ basic: BASIC, title: reopened, progress: PROGRESS, activity: ACTIVITY }); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  assert.equal(section(f, 'title').querySelector('[data-action="title-reopen"]'), null);
  section(f, 'title').querySelector('[data-title-reason]').value = 'No change';
  section(f, 'title').querySelector('[data-action="title-cancel"]').dispatchEvent(new f.window.Event('click', { bubbles: true })); await f.flush();
  assert.equal(f.writes[0][0], 'API_coordinator_cancelReopen');
  assert.match(text(section(f, 'title')), /ReopenedScope/);
});

test('opening the drawer shows no message in the title section (the list position is not a message)', async () => {
  const f = setup(); f.view.mount(f.host, 'T1', () => f.open.value); await f.flush();
  assert.equal(section(f, 'title').querySelector('[data-title-status]').textContent, '');
});
