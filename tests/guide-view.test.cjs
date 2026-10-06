// Guide view: renders the real server DTO from the Guide fixture; no server involved at render time.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { guideFixture, guideDtoWithGithub } = require('./guide-fixture.cjs');

/** The dashboard DTO once both reads have finished (github filled in). */
function dtoFromServer(options) {
  return guideDtoWithGithub(guideFixture(options));
}
/** The dashboard DTO exactly as API_guide_getDashboard returns it, with the GitHub reply the server would give next. */
function firstPaintFromServer(options) {
  const g = guideFixture(options);
  return { dto: JSON.parse(g.c.API_guide_getDashboard()).data, github: JSON.parse(g.c.API_guide_getGithub()).data };
}

function setup(dto = dtoFromServer()) {
  const { document, window } = parseHTML('<html><body><div id="guideContent"></div></body></html>');
  const calls = { reads: [], weekly: [], loads: 0, refresh: 0, writes: [], toggles: [], github: 0 };
  const c = loadSources(['data-bridge-client.js', 'guide-view.js', 'guide-weekly-client.js'], { document, Promise, setTimeout, clearTimeout, Date, JSON });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const s = { dto, writeError: null, readError: null };
  bridge.useTransport(async (method, args) => {
    if (method === 'API_guide_getDashboard') return s.readError ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: s.readError } }) : JSON.stringify({ ok: true, data: s.dto });
    if (method === 'API_guide_getGithub') { calls.github++; if (s.githubGate) await s.githubGate; return s.githubError ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: s.githubError } }) : JSON.stringify({ ok: true, data: s.github }); }
    if (method === 'API_guide_getCommits') { calls.reads.push(args[0]); return JSON.stringify({ ok: true, data: s.commits || { teamId: args[0], state: 'unavailable', message: 'Commit history is not available yet.', members: [] } }); }
    calls.writes.push([method, args]);
    return s.writeError ? JSON.stringify({ ok: false, error: { code: 'REJECTED', message: s.writeError } }) : JSON.stringify({ ok: true, data: { message: 'Saved' } });
  });
  const ui = { busy: require('./busy-fixture.cjs')(), renderIcon: () => '', renderSkeleton: (v, label) => '<span data-skeleton>' + label + '</span>', refreshRoleDashboard: () => calls.refresh++, beginContentLoading: () => () => {} };
  const weekly = { selectTeam: (t) => calls.weekly.push(['team', t]), selectView: (v) => calls.weekly.push(['view', v]), load: () => calls.loads++, positionTitleInfo: (e, el) => calls.toggles.push(el.id) };
  vm.runInContext('globalThis.__make = ' + c.guideViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui, () => weekly);
  const host = document.getElementById('guideContent');
  return { view, host, document, calls, s, ui, weekly, c, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })), settle: () => new Promise(r => setImmediate(r)) };
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
  assert.equal(byAttr(f, 'data-guide-select', 'T2').querySelector('[data-team-attention]'), null);
  assert.deepEqual(Array.from(root.querySelectorAll('[data-guide-tab]')).map(n => n.getAttribute('data-guide-tab')), ['github', 'title', 'weekly', 'documents', 'evaluation']);
  assert.equal(byAttr(f, 'data-guide-tab', 'title').getAttribute('aria-pressed'), 'true');
  assert(byAttr(f, 'data-guide-tab', 'title').querySelector('strong'), 'GuideWeekly appends attention badges into the tab strong element');
  const evalTab = byAttr(f, 'data-guide-tab', 'evaluation');
  assert.equal(evalTab.disabled, false); assert.equal(evalTab.hasAttribute('data-evaluation-locked'), true);
  assert.equal(evalTab.getAttribute('title'), null); assert.doesNotMatch(evalTab.textContent, /Available/);
  assert.match(f.host.querySelector('#guideEvaluationEditor [data-evaluation-locked-card]').textContent, /Available from/);
  const weekly = f.host.querySelector('#guideWeeklyProgress');
  assert(weekly.hasAttribute('hidden'));
  assert.deepEqual(JSON.parse(weekly.getAttribute('data-guide-weeks')).map(w => w.weekId), ['W1', 'W2']);
  assert(weekly.querySelector('[data-guide-weekly-status]') && weekly.querySelector('[data-guide-weekly-read]'));
  assert(f.host.querySelector('#guideEvaluationEditor').hasAttribute('hidden'));
  assert(f.host.querySelector('#guideRefreshStatus'));
  for (const id of ['guideRefresh', 'guideUpdated']) assert.equal(f.host.querySelector('#' + id), null, id + ' lives in the page header');
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
  const side = byAttr(f, 'data-guide-team', 'T1').querySelector('[data-guide-view="title"]').textContent.replace(/\s+/g, ' ');
  assert.match(side, /Approved by\s*rev@example\.com/); assert.match(side, /Reviewer comment\s*Solid scope/); assert.match(side, /Scope\s*Not recorded separately\./);
  assert.match(card('T1'), /Approved on date unavailable\s*Timing unavailable/);
  assert.equal(byAttr(f, 'data-guide-team', 'T4').querySelector('#title-T4'), null);
  assert.match(byAttr(f, 'data-guide-team', 'T3').textContent, /Team T3 · Not Submitted/);
  assert.match(byAttr(f, 'data-guide-heading', 'T3').textContent, /No title submitted yet/);
});

test('github status shows member states, timing labels and the repository', () => {
  const f = setup(); f.view.render(f.host, f.s.dto);
  const t1 = byAttr(f, 'data-guide-team', 'T1');
  assert.deepEqual(Array.from(t1.querySelectorAll('[data-member-status]')).map(n => n.getAttribute('data-member-status')), ['joined', 'joined']);
  assert.equal(t1.querySelectorAll('[role="tooltip"], [title*="deadline"]').length, 0, 'timing is shown in the pill, not a tooltip');
  assert.match(t1.textContent, /1 day late/); assert.match(t1.textContent, /1 day earlier/);
  assert.equal(t1.querySelector('aside a').getAttribute('href'), 'https://github.com/org/team1');
  assert.match(byAttr(f, 'data-guide-team', 'T3').textContent, /Submit GitHub Account/);
  assert.match(byAttr(f, 'data-guide-team', 'T2').textContent, /Accept Invitation Email/);
  const unavailable = setup(dtoFromServer({ github: 'throw' })); unavailable.view.render(unavailable.host, unavailable.s.dto);
  assert.match(unavailable.host.textContent, /GitHub status unavailable/); assert.equal(unavailable.host.querySelectorAll('[data-member-status]').length, 0);
});

test('first paint does not wait for GitHub: a placeholder shows, then each team card fills in from one read', async () => {
  const { dto, github } = firstPaintFromServer();
  const f = setup(dto); f.s.github = github;
  let release; f.s.githubGate = new Promise(resolve => { release = resolve; });
  f.view.render(f.host, f.s.dto);
  const t1 = () => byAttr(f, 'data-guide-team', 'T1');
  assert.equal(f.host.querySelectorAll('[data-guide-select]').length, 6, 'the dashboard is usable while GitHub is pending');
  assert(t1().querySelector('[data-github-loading]'));
  assert.doesNotMatch(f.host.textContent, /GitHub status unavailable/);
  assert.equal(f.calls.github, 1);
  release(); await f.settle(); await f.settle();
  assert.equal(t1().querySelector('[data-github-loading]'), null);
  assert.deepEqual(Array.from(t1().querySelectorAll('[data-member-status]')).map(n => n.getAttribute('data-member-status')), ['joined', 'joined']);
  assert.match(byAttr(f, 'data-guide-team', 'T3').textContent, /Submit GitHub Account/);
  assert.match(byAttr(f, 'data-guide-team', 'T4').textContent, /GitHub status unavailable/);
  assert.equal(f.calls.github, 1, 'one batched read for all teams');
});

test('a failed GitHub read leaves the dashboard working and shows the status as unavailable', async () => {
  const { dto } = firstPaintFromServer();
  const f = setup(dto); f.s.githubError = 'GitHub down';
  f.view.render(f.host, f.s.dto); await f.settle(); await f.settle();
  assert.equal(f.host.querySelector('[data-github-loading]'), null);
  assert.match(byAttr(f, 'data-guide-team', 'T1').textContent, /GitHub status unavailable/);
  assert.equal(f.host.querySelectorAll('[data-guide-select]').length, 6);
});

test('a GitHub reply for a replaced render is ignored', async () => {
  const first = firstPaintFromServer();
  const f = setup(first.dto); f.s.github = first.github;
  let release; f.s.githubGate = new Promise(resolve => { release = resolve; });
  f.view.render(f.host, f.s.dto);
  const next = firstPaintFromServer().dto; f.s.githubGate = null;
  f.view.render(f.host, next); await f.settle(); await f.settle();
  release(); await f.settle();
  assert.equal(f.calls.github, 2);
  assert.deepEqual(Array.from(byAttr(f, 'data-guide-team', 'T1').querySelectorAll('[data-member-status]')).map(n => n.getAttribute('data-member-status')), ['joined', 'joined']);
});

test('commit history waits for the GitHub card, then loads when its tab is shown', async () => {
  const { dto, github } = firstPaintFromServer();
  const f = setup(dto); f.s.github = github;
  let release; f.s.githubGate = new Promise(resolve => { release = resolve; });
  f.view.render(f.host, f.s.dto);
  f.host.querySelectorAll('[data-guide-team]').forEach(el => el.setAttribute('hidden', ''));
  const t1 = byAttr(f, 'data-guide-team', 'T1'); t1.removeAttribute('hidden'); t1.querySelector('[data-guide-view="github"]').removeAttribute('hidden');
  f.click(byAttr(f, 'data-guide-tab', 'github')); await f.settle();
  assert.deepEqual(f.calls.reads, [], 'no commit read while the GitHub card is still a placeholder');
  release(); await f.settle(); await f.settle();
  assert.deepEqual(f.calls.reads, ['T1']);
});

test('a normal load starts the weekly and GitHub reads with the dashboard read; the consumers take them over without a second request', async () => {
  const { dto, github } = firstPaintFromServer();
  const f = setup(dto); f.s.github = github;
  const sent = [];
  const bridge = vm.runInContext('(' + f.c.dataBridgeBrowser_.toString() + ')()', f.c);
  bridge.useTransport(async method => { sent.push(method); return JSON.stringify({ ok: true, data: method === 'API_guide_getGithub' ? github : method === 'API_guide_getDashboard' ? dto : { entries: [], weeks: [] } }); });
  vm.runInContext('globalThis.__make2 = ' + f.c.guideViewBrowser_.toString(), f.c);
  const view = f.c.__make2(bridge, () => f.ui, () => f.weekly);
  const loaded = await view.load();
  assert.deepEqual(sent.slice().sort(), ['API_guide_getDashboard', 'API_guide_getGithub', 'API_guide_getWeekly']);
  view.render(f.host, loaded); await f.settle(); await f.settle();
  assert.equal(sent.filter(method => method === 'API_guide_getGithub').length, 1, 'the card was filled from the early read');
  assert.equal(f.host.querySelector('[data-github-loading]'), null);
  assert.equal(await bridge.read('guide-weekly', 'API_guide_getWeekly', [], { prefetched: true }) !== undefined, true);
  assert.equal(sent.filter(method => method === 'API_guide_getWeekly').length, 1, 'GuideWeekly takes the early read over');
  sent.length = 0;
  await view.load(true);
  assert.deepEqual(sent, ['API_guide_getDashboard'], 'a re-read after a saved decision starts no early reads');
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
  assert.deepEqual(f.calls.weekly, [['team', 'T1'], ['view', 'documents'], ['view', 'evaluation']]);
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
  assert.equal(button.disabled, true); assert(f.host.querySelector('#status-T2 [data-skeleton]')); assert.match(f.host.querySelector('#status-T2').textContent, /Submitting…/);
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
  const c = loadSources(['guide-weekly-client.js'], { document: f.document, Date, JSON, DashboardUI: { busy:require('./busy-fixture.cjs')(), renderSkeleton: () => '', beginContentLoading: () => () => {}, guideRun: () => ({}) } });
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
  // Once the weekly read has finished the team pill carries its action count as an accessible description (no visible badge).
  f.host.querySelector('#guideWeeklyProgress').data = { entries: [], weeks: [] };
  api.selectTeam('T2');
  assert.equal(byAttr(f, 'data-guide-select', 'T2').querySelector('[data-team-attention]'), null);
  assert.match(byAttr(f, 'data-guide-select', 'T2').getAttribute('aria-description'), /Title review · 1/);
  assert.equal(byAttr(f, 'data-guide-select', 'T1').className.includes('tile--selected'), false);
});

test('commit history is read only when a GitHub status tab is shown, then counts and the latest commits fill in', async () => {
  const f = setup();
  f.s.commits = { teamId: 'T1', state: 'available', message: '', repositoryUrl: 'https://github.com/org/team1', members: [
    { regno: '001', username: 'one', count: 12, commits: [{ sha: 'a'.repeat(40), shortSha: 'aaaaaaa', message: 'Add <b>sensor</b>', timestamp: '2026-01-05T10:00:00.000Z', url: 'https://github.com/org/team1/commit/' + 'a'.repeat(40) }] },
    { regno: '002', username: 'two', count: 0, commits: [] }] };
  f.view.render(f.host, f.s.dto);
  const t1 = () => byAttr(f, 'data-guide-team', 'T1'), row = r => t1().querySelector('[data-github-member="' + r + '"]');
  f.click(byAttr(f, 'data-guide-tab', 'title')); await f.settle();
  assert.deepEqual(f.calls.reads, [], 'nothing is requested until the GitHub tab is shown');
  f.host.querySelectorAll('[data-guide-team]').forEach(el => el.setAttribute('hidden', ''));
  t1().removeAttribute('hidden'); t1().querySelector('[data-guide-view="github"]').removeAttribute('hidden');
  f.click(byAttr(f, 'data-guide-tab', 'github')); await f.settle();
  assert.deepEqual(f.calls.reads, ['T1']);
  assert.equal(row('001').querySelector('[data-commit-count]').textContent, '12 commits');
  assert.equal(row('002').querySelector('[data-commit-count]').textContent, '0 commits');
  assert.match(row('001').querySelector('[data-commit-list]').textContent, /Add <b>sensor<\/b>/);
  assert.equal(row('001').querySelector('[data-commit-list] script, [data-commit-list] b'), null, 'commit messages are escaped');
  assert.match(row('001').querySelector('[data-commit-list] a[href$="/commits?author=one"]').textContent, /View all on GitHub/);
  assert.match(row('002').querySelector('[data-commit-list]').textContent, /No commits yet/);
  f.click(byAttr(f, 'data-guide-tab', 'github')); await f.settle();
  assert.deepEqual(f.calls.reads, ['T1'], 'a team is read once per dashboard render');
  assert(row('001').querySelector('details').hasAttribute('open') === false, 'commit details start collapsed');
});

test('the approval timing pill says how many days early or late the title was approved', () => {
  const label = days => { const dto = JSON.parse(JSON.stringify(dtoFromServer())); const t = dto.teams.find(x => x.teamId === 'T1'); t.approval.timing = { state: days > 0 ? 'late' : 'on-time', explanation: 'x', days };
    const f = setup(dto); f.view.render(f.host, f.s.dto); const pill = byAttr(f, 'data-guide-team', 'T1').querySelector('[data-guide-view="title"] span[class*="ring-1"]'); return { text: pill.textContent, title: pill.getAttribute('title') }; };
  assert.deepEqual(label(-3), { text: '3 days earlier', title: null });
  assert.equal(label(-1).text, '1 day earlier');
  assert.equal(label(0).text, 'On time');
  assert.equal(label(2).text, '2 days late');
});
