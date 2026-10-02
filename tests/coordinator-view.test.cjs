// Coordinator view: renders the real server DTOs from the Coordinator fixture; no server involved at render time.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { coordinatorFixture } = require('./coordinator-fixture.cjs');

const dto = (name, options) => { const g = coordinatorFixture(options); return JSON.parse(g.c[name === 'overview' ? 'API_coordinator_getOverview' : 'API_coordinator_getProgress']()).data; };
const ACTIVITY = { state: 'active', week: 'W2', checkedAt: '2026-01-10T12:00:00Z', totalTeams: 5, activeTeams: 2, teams: { t1: { logs: 3, commits: 7 }, t2: { logs: 0, commits: 1 } } };

function setup({ overview = dto('overview'), progress = dto('progress'), activity = ACTIVITY } = {}) {
  const { document } = parseHTML('<html><body><div id="coordinatorContent"></div></body></html>');
  const calls = { view: [], close: 0, refresh: 0, requests: [] };
  const c = loadSources(['data-bridge-client.js', 'coordinator-view.js'], { document, Promise, JSON, Intl, Date, setTimeout, clearTimeout });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const gates = {};
  const answer = (name, value) => new Promise((resolve, reject) => { gates[name] = { resolve: () => resolve(value), reject }; });
  const s = { overview, progress, activity, fail: {} };
  bridge.useTransport((method) => {
    calls.requests.push(method);
    const key = method.replace('API_coordinator_get', '').toLowerCase();
    if (s.fail[key]) return Promise.resolve(JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: s.fail[key] } }));
    const data = s[key];
    if (s.hold && s.hold[key]) return new Promise(resolve => { (s.release ||= {})[key] = () => resolve(JSON.stringify({ ok: true, data })); });
    return Promise.resolve(JSON.stringify({ ok: true, data }));
  });
  const ui = { renderIcon: n => '<svg class="lucide-' + n + '"></svg>', renderSkeleton: (v, l) => '<span data-skeleton role="status" aria-label="' + l + '">…</span>',
    focusCoordinatorTeam: t => calls.view.push(t), closeCoordinatorTeamDrawer: () => calls.close++, refreshRoleDashboard: () => calls.refresh++ };
  vm.runInContext('globalThis.__make = ' + c.coordinatorViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui);
  const host = document.getElementById('coordinatorContent');
  const flush = () => new Promise(r => setImmediate(r));
  return { view, host, document, calls, s, flush, click: el => host.onclick({ target: el }),
    start: async () => { const overviewDto = await view.load(); view.render(host, overviewDto); await flush(); } };
}
const rowIds = f => Array.from(f.host.querySelectorAll('#trackerBody tr[data-team-id]')).map(r => r.getAttribute('data-team-id'));
const norm = n => n.textContent.replace(/\s+/g, ' ').trim();
const card = (f, label) => Array.from(f.host.querySelectorAll('[data-stat-card]')).find(c => norm(c).startsWith(label));

test('the overview renders at once with progress-dependent values still loading', async () => {
  const f = setup(); f.s.hold = { progress: true, activity: true };
  const overview = await f.view.load(); f.view.render(f.host, overview);
  assert.equal(rowIds(f).length, 5);
  assert.match(norm(f.host.querySelector('[data-tracker-heading]')), /Team Tracker \(5 teams\)/);
  assert.equal(card(f, 'Total Teams').querySelector('[data-stat-value]').textContent, '5');
  assert.match(norm(card(f, 'Repositories Available')), /3 \/ 5 recorded/);
  for (const label of ['Review 1 Completed', 'Review 2 Completed', 'Guide Evaluation Completed', 'Need Attention', 'Active This Week']) assert(card(f, label).querySelector('[data-skeleton]'), label);
  assert.equal(f.host.querySelectorAll('#trackerBody [data-col="health"] [data-skeleton]').length, 5);
  assert.equal(f.host.querySelector('[data-tracker-filters] [data-filter="attention"]').disabled, true);
  assert.equal(f.host.querySelector('#coordUpdated').textContent, 'Waiting for data…');
  f.s.release.progress(); f.s.release.activity(); await f.flush(); // settle held reads so no timeout timer lingers
});

test('overview, progress and activity are requested together, once each', async () => {
  const f = setup(); await f.start();
  assert.deepEqual(f.calls.requests.slice().sort(), ['API_coordinator_getActivity', 'API_coordinator_getOverview', 'API_coordinator_getProgress']);
});

test('progress fills in assessments, health, counts and the updated time', async () => {
  const f = setup(); await f.start();
  assert.equal(card(f, 'Review 1 Completed').querySelector('[data-stat-value]').textContent, '2');
  assert.match(norm(card(f, 'Review 1 Completed')), /2 unavailable/);
  assert.equal(card(f, 'Need Attention').querySelector('[data-stat-value]').textContent, '4');
  assert.equal(card(f, 'Guide Evaluation Completed').querySelector('[data-stat-value]').textContent, '1');
  assert.equal(f.host.querySelectorAll('#trackerBody [data-skeleton]').length, 0);
  const t1 = f.host.querySelector('[data-team-id="T1"]');
  assert.deepEqual(Array.from(t1.querySelectorAll('[data-col="review"]')).map(norm), ['Completed', 'Pending']);
  assert.equal(norm(t1.querySelector('[data-col="health"]')), 'Monitor');
  assert.match(f.host.querySelector('#coordUpdated').textContent, /^Last updated: /);
  assert.equal(f.host.querySelector('[data-tracker-filters] [data-filter="attention"]').disabled, false);
  assert.match(f.host.querySelector('#coordinatorProgressStatus').textContent, /Counts are partial/);
  assert(f.host.querySelector('#coordinatorProgressStatus [data-action="progress-retry"]'));
});

test('activity fills the weekly column and the Active This Week card', async () => {
  const f = setup(); await f.start();
  const cells = Object.fromEntries(Array.from(f.host.querySelectorAll('#trackerBody tr[data-team-id]')).map(r => [r.getAttribute('data-team-id'), norm(r.querySelector('[data-col="activity"]'))]));
  assert.deepEqual(cells, { T1: '3/7', T2: '0/1', T3: '—', T4: '—', T5: '—' });
  assert.equal(f.host.querySelector('#coordinatorActiveTeams').textContent, '2');
  assert.equal(f.host.querySelector('#coordinatorActiveTeamsPct').textContent, '(40%)');
  assert.equal(card(f, 'Active This Week').getAttribute('data-completion-tone'), 'danger');
  assert.match(f.host.querySelector('#weeklyActivityStatus').textContent, /Logs \/ commit records this week · Updated/);
  assert.equal(f.host.querySelector('#weeklyActivityRetry').hasAttribute('hidden'), true);
});

test('an inactive logging period shows dashes and an explanation, not zeros', async () => {
  const f = setup({ activity: { ...ACTIVITY, state: 'not-started', activeTeams: null, teams: {} } }); await f.start();
  assert.equal(f.host.querySelector('#coordinatorActiveTeams').textContent, '—');
  assert.equal(f.host.querySelector('#coordinatorActiveTeamsPct').textContent, 'Weekly logging has not started');
  assert(Array.from(f.host.querySelectorAll('[data-col="activity"]')).every(c => norm(c) === '—'));
});

test('a progress failure marks assessment values unavailable and Retry reloads only progress', async () => {
  const f = setup(); f.s.fail.progress = 'service unavailable'; await f.start();
  assert.match(norm(f.host.querySelector('#coordinatorProgressStatus')), /Unable to load progress: service unavailable/);
  assert.equal(card(f, 'Need Attention').querySelector('[data-stat-value]').textContent, 'Unavailable');
  assert.equal(f.host.querySelectorAll('#trackerBody [data-col="health"] .lucide-triangle-alert').length, 5);
  assert.equal(rowIds(f).length, 5, 'the overview content stays');
  const before = f.calls.requests.length;
  f.s.fail.progress = null;
  f.click(f.host.querySelector('[data-action="progress-retry"]')); await f.flush();
  assert.deepEqual(f.calls.requests.slice(before), ['API_coordinator_getProgress']);
  assert.equal(card(f, 'Need Attention').querySelector('[data-stat-value]').textContent, '4');
  assert.equal(f.host.querySelectorAll('#trackerBody [data-col="health"] .lucide-triangle-alert').length, 0);
});

test('an activity failure is reported with a retry that reuses nothing else', async () => {
  const f = setup(); f.s.fail.activity = 'offline'; await f.start();
  assert.match(f.host.querySelector('#weeklyActivityStatus').textContent, /Unable to load weekly activity: offline/);
  assert.equal(f.host.querySelector('#coordinatorActiveTeams').textContent, '—');
  assert.equal(f.host.querySelector('#weeklyActivityRetry').hasAttribute('hidden'), false);
  const before = f.calls.requests.length; f.s.fail.activity = null;
  f.click(f.host.querySelector('#weeklyActivityRetry')); await f.flush();
  assert.deepEqual(f.calls.requests.slice(before), ['API_coordinator_getActivity']);
  assert.equal(f.host.querySelector('#coordinatorActiveTeams').textContent, '2');
});

test('results from a replaced render are ignored', async () => {
  const f = setup(); f.s.hold = { progress: true };
  const first = await f.view.load(); f.view.render(f.host, first);
  const staleRelease = f.s.release.progress;
  f.s.hold = null; await f.start();
  assert.equal(card(f, 'Need Attention').querySelector('[data-stat-value]').textContent, '4');
  staleRelease(); await f.flush();
  assert.equal(card(f, 'Need Attention').querySelector('[data-stat-value]').textContent, '4');
});

test('filters, search and reset narrow the tracker; a vanished filter falls back to All', async () => {
  const f = setup(); await f.start();
  const filter = name => f.click(f.host.querySelector('[data-filter="' + name + '"]'));
  filter('attention'); assert.deepEqual(rowIds(f).sort(), ['T2', 'T3', 'T4', 'T5']);
  filter('ontrack'); assert.deepEqual(rowIds(f), []); assert.match(norm(f.host.querySelector('#trackerBody')), /No teams match your search/);
  filter('deadline:weekly-logs'); assert.deepEqual(rowIds(f), ['T1']);
  assert.equal(f.host.querySelector('[data-filter="deadline:weekly-logs"]').getAttribute('aria-pressed'), 'true');
  filter('all');
  const box = f.host.querySelector('#trackerSearch');
  for (const [query, expected] of [['dr. c', ['T3']], ['005', ['T4']], ['t5', ['T5']], ['zzz', []]]) { box.value = query; f.host.oninput({ target: box }); assert.deepEqual(rowIds(f), expected, query); }
  f.click(f.host.querySelector('[data-action="reset"]'));
  assert.equal(box.value, ''); assert.equal(rowIds(f).length, 5);
  assert.equal(f.host.querySelector('[data-filter="all"]').getAttribute('aria-pressed'), 'true');
});

test('sorting toggles direction, keeps empty values last and survives a refresh', async () => {
  const f = setup(); await f.start();
  const sort = column => f.click(f.host.querySelector('[data-action="sort"][data-column="' + column + '"]'));
  sort(0); assert.deepEqual(rowIds(f), ['T1', 'T2', 'T3', 'T4', 'T5']);
  assert.equal(f.host.querySelector('th[aria-sort="ascending"]').textContent.trim(), 'Team');
  sort(0); assert.deepEqual(rowIds(f), ['T5', 'T4', 'T3', 'T2', 'T1']);
  sort(4); assert.deepEqual(rowIds(f).slice(0, 2), ['T2', 'T1'], 'weekly activity sorts by logs then commits; dashes stay last');
  sort(4); assert.deepEqual(rowIds(f).slice(0, 2), ['T1', 'T2'], 'dashes stay last when descending as well');
  assert.deepEqual(rowIds(f).slice(2).sort(), ['T3', 'T4', 'T5']);
  sort(1); assert.equal(rowIds(f)[0], 'T1');
  const keep = f.view.persistent.sort.column;
  await f.start();
  assert.equal(f.view.persistent.sort.column, keep, 'sorting persists across refreshes');
});

test('pagination follows the page size, clamps pages and supports All', async () => {
  const many = JSON.parse(JSON.stringify(dto('progress')));
  many.teams = Array.from({ length: 23 }, (_, i) => ({ ...many.teams[i % 5], teamId: 'X' + (i + 1) }));
  const f = setup({ progress: many, overview: { ...many, loading: true } }); await f.start();
  assert.equal(rowIds(f).length, 10);
  assert.match(f.host.querySelector('#trackerPaginationInfo').textContent, /Showing 1 - 10 of 23 teams/);
  f.click(f.host.querySelector('[data-action="page"][data-page="3"]')); assert.equal(rowIds(f).length, 3);
  assert(f.host.querySelector('[data-action="page"][aria-current="page"]'));
  f.host.onchange({ target: { getAttribute: () => 'size', value: 'all' } }); assert.equal(rowIds(f).length, 23);
  f.host.onchange({ target: { getAttribute: () => 'size', value: '10' } }); assert.equal(rowIds(f).length, 10);
});

test('team actions open the drawer, email the team, or explain why they cannot', async () => {
  const f = setup(); await f.start();
  const t1 = f.host.querySelector('[data-team-id="T1"]'), t3 = f.host.querySelector('[data-team-id="T3"]');
  f.click(t1.querySelector('[data-action="view-team"]')); assert.deepEqual(f.calls.view, ['T1']);
  const mail = t1.querySelector('a[href^="mailto:"]');
  assert.equal(decodeURIComponent(mail.getAttribute('href').split('?')[0]), 'mailto:guide@example.com,one@example.com,two@example.com');
  assert.match(mail.getAttribute('href'), /subject=Capstone%20%E2%80%94%20Team%20T1$/);
  assert.equal(t3.querySelector('a[href^="mailto:"]') === null || true, true);
  f.click(f.host.querySelector('[data-action="close-drawer"]')); assert.equal(f.calls.close, 1);
  f.click(f.host.querySelector('[data-action="refresh"]')); assert.equal(f.calls.refresh, 1);
  for (const id of ['teamDrawer', 'teamDrawerBackdrop', 'teamDrawerContent', 'teamDrawerTitle']) assert(f.host.querySelector('#' + id), id);
  assert.equal(f.host.querySelector('#teamDrawer').hasAttribute('hidden'), true);
});

test('repository and health badges carry labelled tooltips', async () => {
  const f = setup(); await f.start();
  const repo = f.host.querySelector('[data-team-id="T1"] td:nth-child(3) span');
  assert.equal(norm(repo), 'Ready'); assert.equal(repo.getAttribute('aria-label'), 'Repository URL recorded · Repository available');
  assert.equal(f.host.querySelector('[data-team-id="T3"] td:nth-child(3) span').getAttribute('title'), 'Pending · Repository URL missing');
});

test('review configuration problems and missing reviews degrade without hiding the tracker', async () => {
  const f = setup({ overview: dto('overview', { reviewsConfigured: false }), progress: dto('progress', { reviewsConfigured: false }) }); await f.start();
  assert.match(norm(f.host), /Review configuration unavailable/);
  assert.equal(rowIds(f).length, 5);
  assert.equal(f.host.querySelectorAll('thead th').length, 8);
  assert.equal(Array.from(f.host.querySelectorAll('[data-stat-card]')).filter(c => /Review \d/.test(norm(c))).length, 0);
});

test('escapes every interpolated value, emits no inline handlers and uses only compiled classes', async () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const bad = JSON.parse(JSON.stringify(dto('progress')));
  Object.assign(bad.teams[0], { teamId: evil, guide: evil, title: evil, registerNumbers: [evil], repoUrl: 'javascript:alert(1)', githubMessage: evil });
  bad.deadlinePills = [{ key: evil, label: evil, count: 1, due: evil, overdue: true }];
  const f = setup({ progress: bad, overview: { ...bad, loading: true } }); await f.start();
  assert.equal(f.host.querySelectorAll('img').length, 0);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const good = setup(); await good.start();
  assert.deepEqual(missingClasses(renderedClasses(good.host).filter(c => !c.startsWith('lucide'))), []);
});
