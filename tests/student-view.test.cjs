// Student view: renders the real server DTO from the Student fixture; no server involved at render time.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { studentFixture, studentDto, SCENARIOS } = require('./student-fixture.cjs');

const dtoFor = (name, options) => studentDto(name, options);

async function setup(dto, options = {}) {
  const { document, window } = parseHTML('<html><body><nav id="studentSideNav"></nav><div id="studentContent"></div></body></html>');
  const ctl = { fail: false };
  const calls = { jump: [], refresh: 0, weekly: 0, results: 0, logs: [], preview: [] };
  const c = loadSources(['data-bridge-client.js', 'student-view.js'], { document, Promise, JSON, setTimeout, clearTimeout });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const core = { teamId: dto.teamId, roster: dto.roster, titleApproved: dto.titleApproved, assessments: dto.assessments }, project = { setup: dto.setup, github: dto.github, title: dto.title };
  bridge.useFixtures({ API_student_getCore: () => core, API_student_getProject: () => ctl.fail ? JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: 'Project setup is unavailable.' } }) : project });
  const ui = {
    beginContentLoading: () => () => {}, renderIcon: (name) => '<svg class="lucide-icon lucide-' + name + '"></svg>', renderSkeleton: (v, label) => '<span data-skeleton>' + String(label).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';') + '</span>',
    focusGithubAccountForm: b => calls.jump.push(b), refreshGithubStatus: b => calls.refresh++, loadWeeklyProgress: () => calls.weekly++, loadStudentResults: () => calls.results++,
    openWeeklyActivity: t => calls.logs.push(t), previewGithubAccount: (e, form) => calls.preview.push([e, form])
  };
  vm.runInContext('globalThis.__make = ' + c.studentViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui);
  const host = document.getElementById('studentContent');
  view.render(host, core);
  const projectLoaded = () => new Promise(resolve => view.reloadProject(resolve));
  if (options.project !== false) await projectLoaded();
  return { ctl, view, projectLoaded, host, document, calls, bridge, window, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })) };
}
const norm = n => n.textContent.replace(/\s+/g, ' ').trim();

test('weekly progress appears only after title approval; the title action stays available', async () => {
  const pending = (await setup(dtoFor('awaitingReviewer'))), approved = (await setup(dtoFor('approved')));
  assert.equal(pending.host.querySelector('#studentWeeklyProgress'), null);
  assert.match(norm(pending.host.querySelector('[data-weekly-locked]')), /Weekly logs will appear after project setup\./);
  assert.equal(approved.host.querySelector('[data-weekly-locked]'), null);
  for (const hook of ['[data-weekly-read]', '[data-weekly-status]', '[data-weekly-form]', '[data-weekly-detail]']) assert(approved.host.querySelector('#studentWeeklyProgress ' + hook), hook);
  assert.equal(approved.host.querySelector('#studentRecentActivity'), null);
  const needsTitle = (await setup(dtoFor('notSubmitted')));
  const titleLink = host => Array.from(host.querySelectorAll('[data-step-card] a[target="_blank"]')).find(a => /title/i.test(norm(a)));
  const action = titleLink(needsTitle.host);
  assert.equal(action.getAttribute('href'), 'https://forms.example/intake?team=T1');
  assert.equal(norm(action), 'Submit title');
  assert.equal(norm(titleLink((await setup(dtoFor('revise'))).host)), 'Resubmit title');
});

test('setup is collapsed only when complete; incomplete setup lists what is pending', async () => {
  for (const name of Object.keys(SCENARIOS)) {
    const dto = dtoFor(name), f = (await setup(dto)), root = f.host.querySelector('.student-project-setup');
    const complete = dto.github.state === 'done' && dto.titleApproved;
    assert.equal(root.tagName, complete ? 'DETAILS' : 'SECTION', name);
    assert.equal(root.hasAttribute('open'), false, name);
    assert.equal(root.querySelectorAll('[data-step-row]').length, 2, name);
    assert.equal(!!f.host.querySelector('#studentWeeklyProgress'), name === 'approved', name);
    if (complete) assert.match(norm(root.querySelector('summary')), /✓ CompleteViewHide/);
    else { assert(root.querySelector('[data-setup-pending]'), name); assert.match(norm(root), /Step 2:/); }
    assert.equal(f.host.querySelectorAll('#studentGithubProfile').length, name === 'githubActive' ? 1 : 0, name);
  }
  const waiting = (await setup(dtoFor('githubWaiting')));
  assert.match(norm(waiting.host.querySelector('[data-setup-pending]')), /Step 1: Repository invitations must be accepted\./);
  assert.match(norm(waiting.host.querySelector('[data-setup-pending]')), /Finish GitHub setup first\./);
});

test('an unregistered student sees only account connection', async () => {
  const f = (await setup(dtoFor('githubActive'))), card = f.host.querySelector('[data-step-row]');
  assert.match(norm(card), /Waiting for GitHub account connection/);
  assert.doesNotMatch(norm(card), /Retry GitHub setup|valid username|could not verify/i);
  assert.equal(norm(card.querySelector('button[type="submit"]')), 'Continue');
  assert.equal(card.querySelectorAll('button[type="submit"]').length, 1);
  assert.equal(card.querySelector('#studentGithubProfile').getAttribute('type'), 'url');
  assert.equal(card.querySelector('#studentGithubProfile').hasAttribute('disabled'), false);
  assert.equal(card.querySelector('[data-github-confirmation]').hasAttribute('hidden'), true);
  assert.equal(card.querySelector('#githubStatusRefresh').hasAttribute('hidden'), true);
  const blocked = dtoFor('githubActive'); blocked.github.captureReady = false;
  const g = (await setup(blocked));
  assert.equal(g.host.querySelector('#studentGithubProfile').hasAttribute('disabled'), true);
  assert.equal(g.host.querySelector('button[type="submit"]').hasAttribute('disabled'), true);
  const connected = dtoFor('githubActive'); connected.github.connected = true; connected.github.members[0].canConnect = false;
  const h = (await setup(connected));
  assert.equal(h.host.querySelector('form'), null); assert.doesNotMatch(norm(h.host), /Retry GitHub setup/);
});

test('GitHub rows show each teammate with an icon; only the student can jump to the form', async () => {
  const dto = dtoFor('githubWaiting'); dto.github.connected = false;
  dto.github.members = [{ regno: 'R1', status: 'pending', canConnect: false }, { regno: 'R2', status: 'joined', canConnect: false }, { regno: 'R3', status: 'missing', canConnect: true }, { regno: 'R4', status: 'missing', canConnect: false }];
  const f = (await setup(dto)), card = f.host.querySelector('[data-step-row]');
  assert.equal(card.querySelector('table'), null);
  assert.deepEqual(Array.from(card.querySelectorAll('[data-member-status]')).map(r => [norm(r.querySelector('[data-member-register]')), norm(r.querySelector('[data-member-state]'))]),
    [['R1', 'Accept Invitation Email'], ['R2', 'Repository joined'], ['R3', 'Submit GitHub Account'], ['R4', 'Submit GitHub Account']]);
  assert(card.querySelector('[data-member-status="pending"] .lucide-clock'));
  assert(card.querySelector('[data-member-status="joined"] .lucide-check'));
  assert(card.querySelector('[data-member-status="missing"] .lucide-triangle-alert'));
  const jumps = card.querySelectorAll('[data-github-form-jump]');
  assert.equal(jumps.length, 1); assert.equal(jumps[0].getAttribute('type'), 'button'); assert.equal(jumps[0].hasAttribute('href'), false);
  assert.equal(jumps[0].hasAttribute('onclick'), false);
  f.click(jumps[0]); assert.deepEqual(f.calls.jump, [jumps[0]]);
  assert.equal((norm(card).match(/GitHub setup due/g) || []).length, 1);
  assert.equal(card.querySelector('.break-all').getAttribute('href'), 'https://github.com/org/team');
  const noRepo = dtoFor('githubWaiting'); noRepo.github.repoUrl = '';
  assert.match(norm((await setup(noRepo)).host.querySelector('[data-step-body]')), /Not available yet/);
});

test('connected students have no secondary actions on the GitHub card', async () => {
  const dto = dtoFor('githubWaiting'), card = (await setup(dto)).host.querySelector('[data-step-row]');
  assert.equal(card.querySelectorAll('form,input,[data-github-confirmation],#githubSubmitStatus').length, 0);
  assert.equal(card.querySelectorAll('[data-github-form-jump]').length, 0);
  assert.deepEqual(Array.from(card.querySelector('[data-step-card]').children).map(n => n.hasAttribute('data-step-header') ? 'header' : n.hasAttribute('data-step-body') ? 'body' : n.tagName), ['header', 'body']);
  assert.doesNotMatch(card.innerHTML, /retryGithubSetup|Your GitHub setup is complete/);
});

test('the weekly panel does not depend on teammate setup and keeps repository and current title', async () => {
  const dto = dtoFor('approved'); dto.github.state = 'waiting'; dto.setup.complete = false; dto.github.members[1].status = 'pending';
  const f = (await setup(dto));
  assert(f.host.querySelector('#studentWeeklyProgress'));
  assert(norm(f.host).includes('https://github.com/org/team'));
  assert(norm(f.host).includes('Current title: Project <i>X</i>'));
  assert.equal(f.host.querySelectorAll('i').length, 0);
});

test('delegated actions reach the dashboard modules without inline handlers', async () => {
  const f = (await setup(dtoFor('approved')));
  const g = (await setup(dtoFor('githubActive')));
  g.click(g.host.querySelector('[data-action="github-refresh"]')); assert.equal(g.calls.refresh, 1);
  const form = g.host.querySelector('[data-github-form]'); const submit = new g.window.Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(submit);
  assert.equal(g.calls.preview.length, 1); assert.equal(g.calls.preview[0][1], form);
  for (const host of [f.host, g.host]) assert.deepEqual(Array.from(host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
});

test('escapes every interpolated value and rejects unsafe links', async () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const dto = dtoFor('revise');
  Object.assign(dto, { teamId: evil }); dto.roster = [{ name: evil, initials: evil, regno: evil, isMe: true }];
  dto.title = { ...dto.title, currentTitle: evil, note: evil, intake: { url: 'javascript:alert(1)', label: evil } };
  dto.github.repoUrl = 'javascript:alert(2)'; dto.assessments = { reviews: [{ key: 'r"1', label: evil }], guideEvaluationLabel: evil };
  const f = (await setup(dto));
  assert.equal(f.host.querySelectorAll('img').length, 0);
  assert(Array.from(f.host.querySelectorAll('a')).every(a => !/^javascript:/i.test(a.getAttribute('href'))));
  assert.equal(f.host.querySelector('[data-review-result]').getAttribute('data-review-result'), 'r"1');
});

test('assessment placeholders follow the configured definitions and keep their hooks', async () => {
  const f = (await setup(dtoFor('approved')));
  assert.deepEqual(Array.from(f.host.querySelectorAll('[data-review-result]')).map(n => [n.id, n.getAttribute('data-assessment-label')]), [['studentAssessment-review1', 'Review 1'], ['studentAssessment-review2', 'Review 2']]);
  assert.equal(f.host.querySelector('#studentGuideEvaluation').getAttribute('data-assessment-label'), 'Guide Evaluation');
  assert(f.host.querySelector('[data-review-result] [data-skeleton]'));
  const none = (await setup(dtoFor('approved', { review: false })));
  assert.equal(none.host.querySelectorAll('[data-review-result]').length, 0);
});

test('every Tailwind class the view renders is compiled into the stylesheet', async () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  for (const name of ['githubActive', 'approved', 'revise']) assert.deepEqual(missingClasses(renderedClasses((await setup(dtoFor(name))).host).filter(c => !c.startsWith('lucide'))), [], name);
});

test('the endpoint authorizes on the server and returns safe errors', async () => {
  const s = studentFixture('approved');
  s.f.user('stranger@example.com');
  assert.deepEqual(JSON.parse(s.c.API_student_getCore()), { ok: false, error: { code: 'NOT_FOUND', message: 'Student team was not found.' } });
  s.f.user('');
  assert.equal(JSON.parse(s.c.API_student_getCore()).error.code, 'UNAUTHENTICATED');
  const broken = studentFixture('approved');
  broken.c.getStudentBaseData_ = () => { throw new TypeError('column 9 undefined'); };
  const failure = JSON.parse(broken.c.API_student_getCore());
  assert.equal(failure.error.code, 'INTERNAL'); assert.doesNotMatch(failure.error.message, /column/);
});

test('the student screens are sidebar links: Weeks, Assessments and Project, with the first needed screen open', async () => {
  const names = f => Array.from(f.document.querySelectorAll('#studentSideNav [data-student-tab]')).map(t => norm(t));
  const approved = (await setup(dtoFor('approved'))), setupFirst = (await setup(dtoFor('notSubmitted')));
  assert.deepEqual(names(approved), ['Weeks', 'Assessments', 'Project']);
  const open = host => Array.from(host.querySelectorAll('[data-student-panel]')).filter(p => !p.hidden).map(p => p.getAttribute('data-student-panel'));
  assert.deepEqual(open(approved.host), ['weeks']);
  assert.deepEqual(open(setupFirst.host), ['project']);
  assert.equal(approved.document.querySelector('#studentSideNav [aria-current="page"]').getAttribute('data-student-tab'), 'weeks');
  for (const tab of approved.document.querySelectorAll('#studentSideNav [data-student-tab]')) assert.equal(approved.host.querySelector('#' + tab.getAttribute('aria-controls')).getAttribute('aria-labelledby'), tab.id);
  assert(approved.host.querySelector('[data-student-panel="weeks"] #studentWeeklyProgress'));
  assert(approved.host.querySelector('[data-student-panel="assessments"] [data-review-result]'));
  assert(approved.host.querySelector('[data-student-panel="project"] [data-step-card]'));
  assert.equal(approved.host.querySelector('[data-student-panel="weeks"] [data-step-card]'), null);
  assert.equal(approved.host.querySelector('[role="tab"]'), null);
});

test('selecting a link shows its panel, supports arrow keys and survives a re-render', async () => {
  const f = (await setup(dtoFor('approved')));
  const tab = key => f.document.querySelector('#studentSideNav [data-student-tab="' + key + '"]');
  const open = () => Array.from(f.host.querySelectorAll('[data-student-panel]')).filter(p => !p.hidden).map(p => p.getAttribute('data-student-panel'));
  f.click(tab('project'));
  assert.deepEqual(open(), ['project']);
  assert.equal(tab('project').getAttribute('aria-current'), 'page'); assert.equal(tab('weeks').hasAttribute('aria-current'), false);
  const key = (el, name) => { const e = new f.window.Event('keydown', { bubbles: true, cancelable: true }); e.key = name; el.dispatchEvent(e); };
  key(tab('project'), 'ArrowDown');
  assert.deepEqual(open(), ['weeks']);
  key(tab('weeks'), 'End');
  assert.deepEqual(open(), ['project']);
  f.view.render(f.host, dtoFor('approved'));
  assert.deepEqual(open(), ['project']);
  assert.equal(f.document.querySelectorAll('#studentSideNav [data-student-tab]').length, 3);
});

test('the sidebar links use only utilities', async () => {
  const f = (await setup(dtoFor('approved'))), nav = f.document.querySelector('#studentSideNav nav');
  assert.equal(nav.querySelectorAll('[style]').length, 0);
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  assert.deepEqual(missingClasses(renderedClasses(nav).filter(c => !c.startsWith('lucide'))), []);
});

test('each screen loads its own data the first time it is shown, and only once per render', async () => {
  const f = (await setup(dtoFor('approved'))), tab = key => f.document.querySelector('#studentSideNav [data-student-tab="' + key + '"]');
  assert.deepEqual([f.calls.weekly, f.calls.results], [0, 0]);
  f.view.activate(); f.view.activate();
  assert.deepEqual([f.calls.weekly, f.calls.results], [1, 0]);
  f.click(tab('assessments')); f.click(tab('weeks')); f.click(tab('assessments'));
  assert.deepEqual([f.calls.weekly, f.calls.results], [1, 1]);
  f.click(tab('project'));
  assert.deepEqual([f.calls.weekly, f.calls.results], [1, 1]);
  f.view.render(f.host, dtoFor('approved'));
  f.view.activate(); f.click(tab('weeks'));
  assert.deepEqual([f.calls.weekly, f.calls.results], [2, 1]);
});

test('a student whose title is not approved loads no weekly or assessment data until asked', async () => {
  const f = (await setup(dtoFor('notSubmitted'))), tab = key => f.document.querySelector('#studentSideNav [data-student-tab="' + key + '"]');
  f.view.activate(); f.click(tab('weeks'));
  assert.deepEqual([f.calls.weekly, f.calls.results], [0, 0]);
  f.click(tab('assessments'));
  assert.deepEqual([f.calls.weekly, f.calls.results], [0, 1]);
});

test('the Project cards load on demand into their slot, keep content on a failed refresh and offer Retry', async () => {
  const f = await setup(dtoFor('githubWaiting'), { project: false }), slot = () => f.host.querySelector('[data-project-setup]');
  assert(slot().querySelector('[data-skeleton]'));
  assert.equal(f.host.querySelector('[data-step-card]'), null);
  assert.equal(f.host.querySelectorAll('[data-student-panel="project"] h2').length, 1);
  f.ctl.fail = true; f.view.state.tab = 'project'; f.view.activate(); await new Promise(r => setTimeout(r, 20));
  assert.match(norm(slot().querySelector('[data-project-error]')), /Project setup is unavailable./);
  assert.equal(f.host.querySelector('[data-step-card]'), null);
  f.ctl.fail = false; f.click(slot().querySelector('[data-action="project-retry"]')); await new Promise(r => setTimeout(r, 20));
  assert(f.host.querySelector('[data-step-card]')); assert.equal(slot().querySelector('[data-project-error]'), null);
  f.ctl.fail = true; await new Promise(resolve => f.view.reloadProject(resolve, resolve));
  assert(f.host.querySelector('[data-step-card]'));
});

test('GitHub refresh reloads only the Project cards and reports back through the callbacks', async () => {
  const f = await setup(dtoFor('githubWaiting'));
  let loaded = 0; await new Promise(resolve => f.view.reloadProject(() => { loaded++; resolve(); }));
  assert.equal(loaded, 1); assert.deepEqual([f.calls.weekly, f.calls.results], [0, 0]);
  f.ctl.fail = true; const error = await new Promise(resolve => f.view.reloadProject(() => resolve(null), resolve));
  assert.match(error.message, /Project setup is unavailable/);
});
