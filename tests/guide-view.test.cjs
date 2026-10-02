// Guide view: renders the real server DTO from the Guide fixture; no server involved at render time.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { guideFixture } = require('./guide-fixture.cjs');

function dtoFromServer(options) {
  const g = guideFixture(options);
  return JSON.parse(g.c.API_guide_getDashboard()).data;
}

function setup(dto = dtoFromServer()) {
  const { document } = parseHTML('<html><body><div id="guideContent"></div></body></html>');
  const calls = { weekly: [], loads: 0, refresh: 0, writes: [], toggles: [] };
  const c = loadSources(['data-bridge-client.js', 'guide-view.js', 'guide-weekly-client.js'], { document, Promise, setTimeout, clearTimeout, Date, JSON });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const s = { dto, writeError: null, readError: null };
  bridge.useTransport(async (method, args) => {
    if (method === 'API_guide_getDashboard') return s.readError ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: s.readError } }) : JSON.stringify({ ok: true, data: s.dto });
    calls.writes.push([method, args]);
    return s.writeError ? JSON.stringify({ ok: false, error: { code: 'REJECTED', message: s.writeError } }) : JSON.stringify({ ok: true, data: { message: 'Saved' } });
  });
  const ui = { renderIcon: () => '', renderSkeleton: (v, label) => '<span data-skeleton>' + label + '</span>', refreshRoleDashboard: () => calls.refresh++, beginContentLoading: () => () => {} };
  const weekly = { selectTeam: (t) => calls.weekly.push(['team', t]), selectView: (v) => calls.weekly.push(['view', v]), load: () => calls.loads++, positionTitleInfo: (e, el) => calls.toggles.push(el.id) };
  vm.runInContext('globalThis.__make = ' + c.guideViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui, () => weekly);
  const host = document.getElementById('guideContent');
  return { view, host, document, calls, s, ui, weekly, c, click: el => host.onclick({ target: el }), settle: () => new Promise(r => setImmediate(r)) };
}
const byAttr = (f, attr, value) => f.host.querySelector('[' + attr + '="' + value + '"]');

test('renders the workspace contract GuideWeekly and GuideEvaluation depend on', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const root = f.host.querySelector('[data-guide-workspace]');
  assert(root);
  const ids = Array.from(root.querySelectorAll('[data-guide-select]')).map(n => n.getAttribute('data-guide-select'));
  assert.deepEqual(ids, ['T2', 'T3', 'T5', 'T6', 'T4', 'T1']);
  assert.equal(root.querySelectorAll('[data-guide-heading]').length, 6);
  assert.equal(root.querySelectorAll('[data-guide-team]').length, 6);
  assert.deepEqual(Array.from(root.querySelectorAll('[data-guide-heading]')).map(n => n.hasAttribute('hidden')), [false, true, true, true, true, true]);
  assert.deepEqual(Array.from(root.querySelectorAll('[data-guide-team]')).map(n => n.hasAttribute('hidden')), [false, true, true, true, true, true]);
  assert.deepEqual(JSON.parse(byAttr(f, 'data-guide-team', 'T1').getAttribute('data-guide-students')), ['001', '002']);
  assert.equal(byAttr(f, 'data-guide-select', 'T2').getAttribute('data-title-attention'), 'true');
  assert.equal(byAttr(f, 'data-guide-select', 'T2').getAttribute('data-documents-attention'), '2');
  assert.equal(byAttr(f, 'data-guide-select', 'T2').getAttribute('aria-pressed'), 'true');
  assert.equal(byAttr(f, 'data-guide-select', 'T1').getAttribute('aria-pressed'), 'false');
  assert(byAttr(f, 'data-guide-select', 'T2').querySelector('[data-team-attention]'));
  assert.deepEqual(Array.from(root.querySelectorAll('[data-guide-tab]')).map(n => n.getAttribute('data-guide-tab')), ['title', 'weekly', 'documents', 'evaluation']);
  assert.equal(byAttr(f, 'data-guide-tab', 'title').getAttribute('aria-pressed'), 'true');
  assert(byAttr(f, 'data-guide-tab', 'title').querySelector('strong'), 'GuideWeekly appends attention badges into the tab strong element');
  assert.equal(byAttr(f, 'data-guide-tab', 'evaluation').disabled, true);
  assert.match(byAttr(f, 'data-guide-tab', 'evaluation').getAttribute('title'), /Available from/);
  const weekly = f.host.querySelector('#guideWeeklyProgress');
  assert(weekly.hasAttribute('hidden'));
  assert.deepEqual(JSON.parse(weekly.getAttribute('data-guide-weeks')).map(w => w.weekId), ['W1', 'W2']);
  assert(weekly.querySelector('[data-guide-weekly-status]') && weekly.querySelector('[data-guide-weekly-read]'));
  assert(f.host.querySelector('#guideEvaluationEditor').hasAttribute('hidden'));
  for (const id of ['guideRefresh', 'guideUpdated', 'guideRefreshStatus']) assert(f.host.querySelector('#' + id), id);
  assert(f.host.querySelector('#guideRefresh').hasAttribute('data-refresh-button'));
  for (const el of f.host.querySelectorAll('[hidden]')) assert.doesNotMatch(el.getAttribute('class') || '', /(^|\s)(flex|grid|block|inline|inline-flex|hidden|table)(\s|$)/, 'hidden-toggled elements carry no display utility');
});

test('each title-approval state shows its own content', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const card = id => byAttr(f, 'data-guide-team', id).querySelector('[data-guide-view="title"]').textContent.replace(/\s+/g, ' ');
  assert.match(card('T2'), /Title \(editable\)/); assert.match(card('T2'), /Similar to T9 \(80%\)/);
  assert.equal(byAttr(f, 'data-guide-team', 'T2').querySelector('#title-T2').getAttribute('value'), 'Needs review');
  assert.match(card('T2'), /Title approval due .* · Overdue/);
  assert.match(card('T4'), /You approved — awaiting Reviewer\./);
  assert.match(card('T5'), /Your note: Too broad/); assert.match(card('T5'), /Waiting on the team to resubmit\./);
  assert.match(card('T6'), /Reviewer's note: Narrow it/); assert.match(card('T6'), /nothing for you to do/);
  assert.match(card('T1'), /Approved by: rev@example\.com/); assert.match(card('T1'), /Reviewer comment: Solid scope/);
  assert.match(card('T1'), /Approved on: Date unavailable Timing unavailable/);
  assert.equal(byAttr(f, 'data-guide-team', 'T4').querySelector('#title-T4'), null);
  assert.match(byAttr(f, 'data-guide-team', 'T3').textContent, /Team T3 · Not Submitted/);
  assert.match(byAttr(f, 'data-guide-heading', 'T3').textContent, /No title submitted yet/);
});

test('github status shows member states, timing tooltips and the repository', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const t1 = byAttr(f, 'data-guide-team', 'T1');
  assert.deepEqual(Array.from(t1.querySelectorAll('[data-member-status]')).map(n => n.getAttribute('data-member-status')), ['joined', 'joined']);
  const tips = Array.from(t1.querySelectorAll('[role="tooltip"]')).map(n => n.textContent);
  assert.equal(tips.length, 2); assert.match(tips[1], /1 day after the deadline/);
  assert.match(t1.textContent, /1 day late/); assert.match(t1.textContent, /On time/);
  assert.equal(t1.querySelector('aside a').getAttribute('href'), 'https://github.com/org/team1');
  assert.match(byAttr(f, 'data-guide-team', 'T3').textContent, /Submit GitHub Account/);
  assert.match(byAttr(f, 'data-guide-team', 'T2').textContent, /Accept Invitation Email/);
  const unavailable = setup(dtoFromServer({ github: 'throw' })); unavailable.view.render(unavailable.host, unavailable.s.dto);
  assert.match(unavailable.host.textContent, /GitHub status unavailable/); assert.equal(unavailable.host.querySelectorAll('[data-member-status]').length, 0);
});

test('documents view lists links or reports that none were submitted', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const docs = id => byAttr(f, 'data-guide-team', id).querySelector('[data-guide-view="documents"]');
  assert.deepEqual(Array.from(docs('T2').querySelectorAll('li a')).map(a => a.getAttribute('href')), ['https://example.com/w2', 'https://example.com/n2']);
  assert.match(docs('T3').textContent, /No documents submitted yet/); assert.match(docs('T3').textContent, /Last document submission: Date unavailable/);
  assert(docs('T3').hasAttribute('hidden'));
});

test('escapes every interpolated value, rejects unsafe links and emits no inline handlers', () => {
  const dto = dtoFromServer(); const evil = '<img src=x onerror=alert(1)>"\'&';
  Object.assign(dto.teams[0], { title: evil, problem: evil, similarityFlag: evil, guideNotes: evil, reviewerNotes: evil, teamId: 'T"2' });
  dto.teams[0].members = [{ name: evil, regno: evil }]; dto.teams[0].documents = [{ label: evil, url: 'javascript:alert(1)' }]; dto.teams[0].repoUrl = 'javascript:alert(2)';
  const f = setup(dto); f.view.render(f.host, dto);
  assert.equal(f.host.querySelectorAll('img').length, 0);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
  assert(Array.from(f.host.querySelectorAll('a')).every(a => !/^javascript:/i.test(a.getAttribute('href'))));
});

test('uses only Tailwind utilities and every one is compiled into the stylesheet', () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const f = setup(); f.view.render(f.host, f.s.dto);
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
  const badge = fs.readFileSync('guide-weekly-client.js', 'utf8').match(/const ATTENTION_BADGE='([^']+)'/)[1].split(/\s+/);
  assert.deepEqual(missingClasses(badge), []);
});

test('team and tab buttons delegate to GuideWeekly', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  f.click(byAttr(f, 'data-guide-select', 'T1')); f.click(byAttr(f, 'data-guide-tab', 'documents')); f.click(byAttr(f, 'data-guide-tab', 'evaluation'));
  assert.deepEqual(f.calls.weekly, [['team', 'T1'], ['view', 'documents']]);
  f.click(f.host.querySelector('[data-action="refresh"]')); assert.equal(f.calls.refresh, 1);
});

test('the title timing popover is positioned through GuideWeekly when it opens', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const popover = f.host.querySelector('[popover]');
  assert(popover && f.host.querySelector('[popovertarget="' + popover.id + '"]'));
  assert.equal(popover.hasAttribute('ontoggle'), false);
});

test('Reject needs a note and sends nothing without one', async () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  f.click(f.host.querySelector('[data-decision="Rejected"]')); await f.settle();
  assert.equal(f.host.querySelector('#status-T2').textContent, 'Please add a note explaining the rejection.');
  assert.equal(f.calls.writes.length, 0);
});

test('approve sends the edited title once, re-reads, re-renders and restarts weekly progress', async () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  f.host.querySelector('#title-T2').value = 'Edited title'; f.host.querySelector('#notes-T2').value = 'ok';
  const next = JSON.parse(JSON.stringify(f.s.dto)); next.teams[0].status = { key: 'AWAITING_REVIEWER', text: 'Awaiting Reviewer', tone: 'blue' }; next.teams[0].titleDue = null; f.s.dto = next;
  const button = f.host.querySelector('[data-decision="Approved"]');
  f.click(button); f.click(button);
  assert.equal(button.disabled, true); assert.equal(f.host.querySelector('#status-T2').textContent, 'Submitting...');
  await f.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.writes)), [['API_guide_submitDecision', ['T2', 'Approved', 'ok', 'Edited title']]]);
  assert.equal(f.calls.loads, 1);
  assert.equal(f.host.querySelector('#title-T2'), null);
  assert.match(byAttr(f, 'data-guide-team', 'T2').textContent, /You approved — awaiting Reviewer\./);
});

test('a rejected decision keeps the form and typed text, shows the server message and re-enables buttons', async () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  f.s.writeError = 'You are not the recorded guide for Team T2.';
  f.host.querySelector('#notes-T2').value = 'typed note';
  f.click(f.host.querySelector('[data-decision="Approved"]')); await f.settle();
  assert.equal(f.host.querySelector('#status-T2').textContent, 'You are not the recorded guide for Team T2.');
  assert.equal(f.host.querySelector('[data-decision="Approved"]').disabled, false);
  assert.equal(f.host.querySelector('#notes-T2').value, 'typed note'); assert.equal(f.calls.loads, 0);
  f.s.writeError = null; f.click(f.host.querySelector('[data-decision="Rejected"]')); await f.settle();
  assert.equal(f.calls.writes.length, 2);
});

test('a failed re-read after a saved decision reports it and leaves the content', async () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  f.s.readError = 'Sheets unavailable';
  f.click(f.host.querySelector('[data-decision="Approved"]')); await f.settle();
  assert.match(f.host.querySelector('#status-T2').textContent, /Refresh failed: Sheets unavailable/);
  assert.equal(f.host.querySelector('[data-decision="Approved"]').disabled, false);
  assert.equal(f.host.querySelectorAll('[data-guide-select]').length, 6);
});

test('the real GuideWeekly module drives the rendered workspace (team and tab selection)', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const c = loadSources(['guide-weekly-client.js'], { document: f.document, Date, JSON, DashboardUI: { renderSkeleton: () => '', beginContentLoading: () => () => {}, guideRun: () => ({}) } });
  const api = c.guideWeeklyBrowser_();
  api.selectTeam('T1');
  assert.equal(byAttr(f, 'data-guide-select', 'T1').getAttribute('aria-pressed'), 'true');
  assert.equal(byAttr(f, 'data-guide-select', 'T2').getAttribute('aria-pressed'), 'false');
  assert.equal(byAttr(f, 'data-guide-team', 'T1').hasAttribute('hidden'), false);
  assert.equal(byAttr(f, 'data-guide-team', 'T2').hasAttribute('hidden'), true);
  assert.equal(byAttr(f, 'data-guide-heading', 'T1').hasAttribute('hidden'), false);
  api.selectView('documents');
  assert.equal(byAttr(f, 'data-guide-tab', 'documents').getAttribute('aria-pressed'), 'true');
  assert.equal(byAttr(f, 'data-guide-team', 'T1').querySelector('[data-guide-view="documents"]').hasAttribute('hidden'), false);
  assert.equal(byAttr(f, 'data-guide-team', 'T1').querySelector('[data-guide-view="title"]').hasAttribute('hidden'), true);
  // Once the weekly read has finished the attention pill shows its action count with Tailwind classes.
  f.host.querySelector('#guideWeeklyProgress').data = { entries: [], weeks: [] };
  api.selectTeam('T2');
  const pill = byAttr(f, 'data-guide-select', 'T2').querySelector('[data-team-attention]');
  assert.equal(pill.textContent, 'Title review · 1');
  assert.match(pill.className, /inline-flex/);
  assert.equal(byAttr(f, 'data-guide-select', 'T1').className.includes('tile--selected'), false);
});
