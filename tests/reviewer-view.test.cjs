// Reviewer view: renders DTO fixtures through the mock transport; no server involved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');

const team = (n, extra = {}) => ({
  teamId: 'T' + n, guideName: 'Guide ' + n, registerNumbers: ['R' + n + 'a', 'R' + n + 'b'], title: 'Title ' + n, committee: 'C1',
  titleApproval: { status: { tone: 'warning', label: 'Pending review' }, canDecide: true, submittedTitle: 'Title ' + n, similarityFlag: '', documents: [], reviewerNotes: '' },
  reviews: [{ key: 'review1', enabled: true, actionLabel: 'Enter marks', note: 'Open' }, { key: 'review2', enabled: false, actionLabel: 'Enter marks', note: 'Not yet' }],
  ...extra
});
const dtoOf = teams => ({ summary: { pending: teams.length, approved: 0, awaitingGuide: 0, total: teams.length }, reviews: [{ key: 'review1', label: 'Review 1' }, { key: 'review2', label: 'Review 2' }], reviewError: null, teams });

function setup(dto) {
  const { document, window } = parseHTML('<html><body><div id="reviewerContent"></div></body></html>');
  const calls = { marks: [], refresh: 0, loading: 0, finished: 0, writes: [] };
  const c = loadSources(['data-bridge-client.js', 'reviewer-view.js'], { document, Promise, setTimeout, clearTimeout, Intl, Date });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const state = { dto: dto || dtoOf([team(1)]), writeResult: { message: 'Saved' }, writeError: null, readError: null };
  bridge.useTransport(async (method, args) => {
    if (method === 'API_reviewer_getDashboard') return state.readError ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: state.readError } }) : JSON.stringify({ ok: true, data: state.dto });
    calls.writes.push([method, args]);
    return state.writeError ? JSON.stringify({ ok: false, error: { code: 'REJECTED', message: state.writeError } }) : JSON.stringify({ ok: true, data: state.writeResult });
  });
  const ui = { busy: require('./busy-fixture.cjs')(), renderIcon: () => '', refreshRoleDashboard: () => calls.refresh++, beginContentLoading: () => { calls.loading++; return () => { calls.finished++; }; } };
  vm.runInContext('globalThis.__make = ' + c.reviewerViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui, () => ({ open: (...a) => calls.marks.push(a) }));
  const host = document.getElementById('reviewerContent');
  return { view, host, document, calls, state, ui, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })), fire: (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true })), settle: () => new Promise(r => setImmediate(r)) };
}
const rows = f => f.host.querySelectorAll('[data-reviewer-body] tr[data-team-id]');

test('renders header, stats, rows and review columns from the DTO', () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1), team(2)]));
  assert.equal(rows(f).length, 2);
  assert.match(f.host.textContent, /Reviewer Dashboard/);
  assert.match(f.host.textContent, /Pending Your Decision/);
  assert.match(f.host.textContent, /Assigned Teams \(2 teams\)/);
  assert.deepEqual(Array.from(f.host.querySelectorAll('thead th')).map(t => t.textContent).slice(-2), ['Review 1', 'Review 2']);
  assert.equal(f.host.querySelector('[data-action="marks"]:not([disabled])').getAttribute('data-review'), 'review1');
  assert.equal(f.host.querySelectorAll('[data-action="marks"][disabled]').length, 2);
});

test('escapes every interpolated value and never emits inline handlers', () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const t = team(1, { title: evil, guideName: evil, committee: evil, registerNumbers: [evil], teamId: 'T"1' });
  t.titleApproval = { ...t.titleApproval, submittedTitle: evil, similarityFlag: evil, reviewerNotes: evil, documents: [{ label: evil, url: 'javascript:alert(1)' }, { label: 'ok', url: 'https://example.com/a?b=1&c=2' }] };
  const f = setup(); f.view.render(f.host, dtoOf([t]));
  assert.equal(f.host.querySelectorAll('img').length, 0);
  const attributeNames = Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name));
  assert.deepEqual(attributeNames.filter(name => /^on/i.test(name)), []);
  const links = Array.from(f.host.querySelectorAll('details a')).map(a => a.getAttribute('href'));
  assert.deepEqual(links, ['#', 'https://example.com/a?b=1&c=2']);
  assert.equal(f.host.querySelector('[data-team-id]').getAttribute('data-team-id'), 'T"1');
});

test('uses only Tailwind utilities and every one is compiled into the stylesheet', () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const f = setup(); f.view.render(f.host, dtoOf([team(1)]));
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
});

test('search filters across team, guide, register number, title, committee and status', () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1), team(2, { guideName: 'Dr. Rao' }), team(3, { title: 'Smart Farming' })]));
  const search = f.host.querySelector('#reviewerAssignedSearch');
  for (const [query, expected] of [['rao', ['T2']], ['farming', ['T3']], ['r1a', ['T1']], ['pending review', ['T1', 'T2', 'T3']], ['c1', ['T1', 'T2', 'T3']], ['zzz', []]]) {
    search.value = query; f.fire(search, 'input');
    assert.deepEqual(Array.from(rows(f)).map(r => r.getAttribute('data-team-id')), expected, query);
  }
  assert.match(f.host.textContent, /No teams match your search/);
  search.value = ''; f.fire(search, 'input');
  assert.equal(rows(f).length, 3);
});

test('an empty assignment shows its message', () => {
  const f = setup(); f.view.render(f.host, dtoOf([]));
  assert.match(f.host.textContent, /No teams are assigned to you/);
  assert.match(f.host.textContent, /Showing 0 - 0 of 0 teams/);
});

test('pagination follows page size, clamps pages and supports All', () => {
  const f = setup(); f.view.render(f.host, dtoOf(Array.from({ length: 23 }, (_, i) => team(i + 1))));
  assert.equal(rows(f).length, 10);
  assert.match(f.host.querySelector('#reviewerAssignedPaginationInfo').textContent, /Showing 1 - 10 of 23 teams/);
  f.click(f.host.querySelector('[data-action="page"][data-page="3"]'));
  assert.equal(rows(f).length, 3);
  assert.match(f.host.querySelector('#reviewerAssignedPaginationInfo').textContent, /Showing 21 - 23 of 23 teams/);
  assert(f.host.querySelector('[data-action="page"][aria-current="page"]'));
  const size = f.host.querySelector('#reviewerAssignedPageSize');
  const change = value => { const select = f.host.querySelector('#reviewerAssignedPageSize'); Object.defineProperty(select, 'value', { value, configurable: true }); f.fire(select, 'change'); };
  change('all');
  assert.equal(rows(f).length, 23);
  change('25');
  assert.equal(rows(f).length, 23);
  change('10');
  assert.equal(rows(f).length, 10);
});

test('marks buttons open the shared review drawer; disabled ones do nothing', () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1)]));
  const [enabled, disabled] = f.host.querySelectorAll('[data-action="marks"]');
  f.click(disabled); assert.equal(f.calls.marks.length, 0);
  f.click(enabled); assert.deepEqual(f.calls.marks, [['T1', 'review1', enabled]]);
});

test('Revise needs a note and sends nothing without one', async () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1)]));
  f.click(f.host.querySelector('[data-decision="Revise"]'));
  await f.settle();
  assert.equal(f.host.querySelector('#reviewer-status-T1').textContent, 'Note required.');
  assert.equal(f.calls.writes.length, 0);
});

test('approve sends one write, re-reads, keeps search text and shows the new state', async () => {
  const f = setup(dtoOf([team(1), team(2)])); f.view.render(f.host, f.state.dto);
  const search = f.host.querySelector('#reviewerAssignedSearch'); search.value = 'T2'; f.fire(search, 'input');
  f.state.dto = dtoOf([team(1), team(2, { titleApproval: { ...team(2).titleApproval, canDecide: false, status: { tone: 'success', label: 'Approved' } } })]);
  const button = f.host.querySelector('[data-decision="Approved"]');
  f.click(button); f.click(button);
  assert.equal(button.disabled, true);
  await f.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.writes)), [['API_reviewer_submitDecision', ['T2', 'Approved', '']]]);
  assert.equal(f.calls.loading, f.calls.finished);
  assert.equal(f.host.querySelector('#reviewerAssignedSearch').value, 'T2');
  assert.deepEqual(Array.from(rows(f)).map(r => r.getAttribute('data-team-id')), ['T2']);
  assert.match(f.host.textContent, /Approved/);
  assert.equal(f.host.querySelector('[data-decision]'), null);
});

test('a rejected decision keeps the form, shows the server message and re-enables the buttons', async () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1)]));
  f.state.writeError = 'Another decision is being saved. Try again.';
  f.host.querySelector('#reviewer-notes-T1').value = 'typed note';
  f.click(f.host.querySelector('[data-decision="Approved"]'));
  await f.settle();
  assert.equal(f.host.querySelector('#reviewer-status-T1').textContent, 'Another decision is being saved. Try again.');
  assert.equal(f.host.querySelector('[data-decision="Approved"]').disabled, false);
  assert.equal(f.host.querySelector('#reviewer-notes-T1').value, 'typed note');
  f.state.writeError = null;
  f.click(f.host.querySelector('[data-decision="Approved"]'));
  await f.settle();
  assert.equal(f.calls.writes.length, 2);
});

test('a failed re-read after a saved decision reports it and leaves the content', async () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1)]));
  f.state.readError = 'Sheets unavailable';
  f.click(f.host.querySelector('[data-decision="Approved"]'));
  await f.settle();
  assert.match(f.host.querySelector('#reviewer-status-T1').textContent, /Refresh failed: Sheets unavailable/);
  assert.equal(rows(f).length, 1);
  assert.equal(f.host.querySelector('[data-decision="Approved"]').disabled, false);
  assert.equal(f.calls.loading, f.calls.finished);
});

test('refresh re-renders on success and keeps existing content on failure', async () => {
  const f = setup(dtoOf([team(1)])); f.view.render(f.host, f.state.dto);
  f.state.dto = dtoOf([team(1), team(2)]);
  assert.equal(await f.view.refresh(), true);
  assert.equal(rows(f).length, 2);
  f.state.readError = 'offline';
  assert.equal(await f.view.refresh(), false);
  assert.equal(rows(f).length, 2);
  assert.equal(f.calls.loading, f.calls.finished);
  f.host.setAttribute('aria-busy', 'true');
  assert.equal(await f.view.refresh(), false);
});

test('review errors are shown without hiding the table', () => {
  const f = setup(); f.view.render(f.host, { ...dtoOf([team(1)]), reviews: [], reviewError: 'AssessmentDefinitions <missing>' });
  assert.match(f.host.textContent, /Review marks are unavailable: AssessmentDefinitions <missing>/);
  assert.equal(rows(f).length, 1);
  assert.equal(f.host.querySelectorAll('thead th').length, 6);
});

test('refresh and updated time live in the page header, not the view', () => {
  const f = setup(); f.view.render(f.host, dtoOf([team(1)]));
  assert.equal(f.host.querySelector('[data-action="refresh"]'), null);
  assert.equal(f.host.querySelector('#reviewerRefresh'), null);
  assert.equal(f.host.querySelector('#reviewerUpdated'), null);
});
