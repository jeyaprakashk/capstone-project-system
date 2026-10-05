// Student view: renders the real server DTO from the Student fixture; no server involved at render time.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { studentFixture, SCENARIOS } = require('./student-fixture.cjs');

const dtoFor = (name, options) => { const s = studentFixture(name, options); return JSON.parse(s.c.API_student_getDashboard()).data; };

function setup(dto) {
  const { document, window } = parseHTML('<html><body><div id="studentContent"></div></body></html>');
  const calls = { jump: [], refresh: 0, weekly: 0, logs: [], preview: [] };
  const c = loadSources(['data-bridge-client.js', 'student-view.js'], { document, Promise, JSON });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  bridge.useFixtures({ API_student_getDashboard: () => dto });
  const ui = {
    renderIcon: (name) => '<svg class="lucide-icon lucide-' + name + '"></svg>', renderSkeleton: (v, label) => '<span data-skeleton>' + String(label).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';') + '</span>',
    focusGithubAccountForm: b => calls.jump.push(b), refreshGithubStatus: b => calls.refresh++, loadWeeklyProgress: () => calls.weekly++,
    openWeeklyActivity: t => calls.logs.push(t), previewGithubAccount: (e, form) => calls.preview.push([e, form])
  };
  vm.runInContext('globalThis.__make = ' + c.studentViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui);
  const host = document.getElementById('studentContent');
  view.render(host, dto);
  return { view, host, document, calls, bridge, window, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })) };
}
const norm = n => n.textContent.replace(/\s+/g, ' ').trim();

test('weekly progress appears only after title approval; the title action stays available', () => {
  const pending = setup(dtoFor('awaitingReviewer')), approved = setup(dtoFor('approved'));
  assert.equal(pending.host.querySelector('#studentWeeklyProgress'), null);
  assert.match(norm(pending.host.querySelector('[data-weekly-locked]')), /Weekly logs will appear after project setup\./);
  assert.equal(approved.host.querySelector('[data-weekly-locked]'), null);
  for (const hook of ['[data-weekly-read]', '[data-weekly-status]', '[data-weekly-form]', '[data-weekly-detail]']) assert(approved.host.querySelector('#studentWeeklyProgress ' + hook), hook);
  assert.equal(approved.host.querySelector('#studentRecentActivity'), null);
  const needsTitle = setup(dtoFor('notSubmitted'));
  const titleLink = host => Array.from(host.querySelectorAll('[data-step-card] a[target="_blank"]')).find(a => /title/i.test(norm(a)));
  const action = titleLink(needsTitle.host);
  assert.equal(action.getAttribute('href'), 'https://forms.example/intake?team=T1');
  assert.equal(norm(action), 'Submit title');
  assert.equal(norm(titleLink(setup(dtoFor('revise')).host)), 'Resubmit title');
});

test('setup is collapsed only when complete; incomplete setup lists what is pending', () => {
  for (const name of Object.keys(SCENARIOS)) {
    const dto = dtoFor(name), f = setup(dto), root = f.host.querySelector('.student-project-setup');
    const complete = dto.github.state === 'done' && dto.titleApproved;
    assert.equal(root.tagName, complete ? 'DETAILS' : 'SECTION', name);
    assert.equal(root.hasAttribute('open'), false, name);
    assert.equal(root.querySelectorAll('[data-step-row]').length, 2, name);
    assert.equal(!!f.host.querySelector('#studentWeeklyProgress'), name === 'approved', name);
    if (complete) assert.match(norm(root.querySelector('summary')), /✓ CompleteViewHide/);
    else { assert(root.querySelector('[data-setup-pending]'), name); assert.match(norm(root), /Step 2:/); }
    assert.equal(f.host.querySelectorAll('#studentGithubProfile').length, name === 'githubActive' ? 1 : 0, name);
  }
  const waiting = setup(dtoFor('githubWaiting'));
  assert.match(norm(waiting.host.querySelector('[data-setup-pending]')), /Step 1: Repository invitations must be accepted\./);
  assert.match(norm(waiting.host.querySelector('[data-setup-pending]')), /Finish GitHub setup first\./);
});

test('an unregistered student sees only account connection', () => {
  const f = setup(dtoFor('githubActive')), card = f.host.querySelector('[data-step-row]');
  assert.match(norm(card), /Waiting for GitHub account connection/);
  assert.doesNotMatch(norm(card), /Retry GitHub setup|valid username|could not verify/i);
  assert.equal(norm(card.querySelector('button[type="submit"]')), 'Continue');
  assert.equal(card.querySelectorAll('button[type="submit"]').length, 1);
  assert.equal(card.querySelector('#studentGithubProfile').getAttribute('type'), 'url');
  assert.equal(card.querySelector('#studentGithubProfile').hasAttribute('disabled'), false);
  assert.equal(card.querySelector('[data-github-confirmation]').hasAttribute('hidden'), true);
  assert.equal(card.querySelector('#githubStatusRefresh').hasAttribute('hidden'), true);
  const blocked = dtoFor('githubActive'); blocked.github.captureReady = false;
  const g = setup(blocked);
  assert.equal(g.host.querySelector('#studentGithubProfile').hasAttribute('disabled'), true);
  assert.equal(g.host.querySelector('button[type="submit"]').hasAttribute('disabled'), true);
  const connected = dtoFor('githubActive'); connected.github.connected = true; connected.github.members[0].canConnect = false;
  const h = setup(connected);
  assert.equal(h.host.querySelector('form'), null); assert.doesNotMatch(norm(h.host), /Retry GitHub setup/);
});

test('GitHub rows show each teammate with an icon; only the student can jump to the form', () => {
  const dto = dtoFor('githubWaiting'); dto.github.connected = false;
  dto.github.members = [{ regno: 'R1', status: 'pending', canConnect: false }, { regno: 'R2', status: 'joined', canConnect: false }, { regno: 'R3', status: 'missing', canConnect: true }, { regno: 'R4', status: 'missing', canConnect: false }];
  const f = setup(dto), card = f.host.querySelector('[data-step-row]');
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
  assert.match(norm(setup(noRepo).host.querySelector('[data-step-body]')), /Not available yet/);
});

test('connected students have no secondary actions on the GitHub card', () => {
  const dto = dtoFor('githubWaiting'), card = setup(dto).host.querySelector('[data-step-row]');
  assert.equal(card.querySelectorAll('form,input,[data-github-confirmation],#githubSubmitStatus').length, 0);
  assert.equal(card.querySelectorAll('[data-github-form-jump]').length, 0);
  assert.deepEqual(Array.from(card.querySelector('[data-step-card]').children).map(n => n.hasAttribute('data-step-header') ? 'header' : n.hasAttribute('data-step-body') ? 'body' : n.tagName), ['header', 'body']);
  assert.doesNotMatch(card.innerHTML, /retryGithubSetup|Your GitHub setup is complete/);
});

test('the weekly panel does not depend on teammate setup and keeps repository and current title', () => {
  const dto = dtoFor('approved'); dto.github.state = 'waiting'; dto.setup.complete = false; dto.github.members[1].status = 'pending';
  const f = setup(dto);
  assert(f.host.querySelector('#studentWeeklyProgress'));
  assert(norm(f.host).includes('https://github.com/org/team'));
  assert(norm(f.host).includes('Current title: Project <i>X</i>'));
  assert.equal(f.host.querySelectorAll('i').length, 0);
});

test('delegated actions reach the dashboard modules without inline handlers', () => {
  const f = setup(dtoFor('approved'));
  const g = setup(dtoFor('githubActive'));
  g.click(g.host.querySelector('[data-action="github-refresh"]')); assert.equal(g.calls.refresh, 1);
  const form = g.host.querySelector('[data-github-form]'); const submit = new g.window.Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(submit);
  assert.equal(g.calls.preview.length, 1); assert.equal(g.calls.preview[0][1], form);
  for (const host of [f.host, g.host]) assert.deepEqual(Array.from(host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
});

test('escapes every interpolated value and rejects unsafe links', () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const dto = dtoFor('revise');
  Object.assign(dto, { teamId: evil }); dto.roster = [{ name: evil, initials: evil, regno: evil, isMe: true }];
  dto.title = { ...dto.title, currentTitle: evil, note: evil, intake: { url: 'javascript:alert(1)', label: evil } };
  dto.github.repoUrl = 'javascript:alert(2)'; dto.assessments = { reviews: [{ key: 'r"1', label: evil }], guideEvaluationLabel: evil };
  const f = setup(dto);
  assert.equal(f.host.querySelectorAll('img').length, 0);
  assert(Array.from(f.host.querySelectorAll('a')).every(a => !/^javascript:/i.test(a.getAttribute('href'))));
  assert.equal(f.host.querySelector('[data-review-result]').getAttribute('data-review-result'), 'r"1');
});

test('assessment placeholders follow the configured definitions and keep their hooks', () => {
  const f = setup(dtoFor('approved'));
  assert.deepEqual(Array.from(f.host.querySelectorAll('[data-review-result]')).map(n => [n.id, n.getAttribute('data-assessment-label')]), [['studentAssessment-review1', 'Review 1'], ['studentAssessment-review2', 'Review 2']]);
  assert.equal(f.host.querySelector('#studentGuideEvaluation').getAttribute('data-assessment-label'), 'Guide Evaluation');
  assert(f.host.querySelector('[data-review-result] [data-skeleton]'));
  const none = setup(dtoFor('approved', { review: false }));
  assert.equal(none.host.querySelectorAll('[data-review-result]').length, 0);
});

test('every Tailwind class the view renders is compiled into the stylesheet', () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  for (const name of ['githubActive', 'approved', 'revise']) assert.deepEqual(missingClasses(renderedClasses(setup(dtoFor(name)).host).filter(c => !c.startsWith('lucide'))), [], name);
});

test('the endpoint authorizes on the server and returns safe errors', () => {
  const s = studentFixture('approved');
  s.f.user('stranger@example.com');
  assert.deepEqual(JSON.parse(s.c.API_student_getDashboard()), { ok: false, error: { code: 'NOT_FOUND', message: 'Student team was not found.' } });
  s.f.user('');
  assert.equal(JSON.parse(s.c.API_student_getDashboard()).error.code, 'UNAUTHENTICATED');
  const broken = studentFixture('approved');
  broken.c.getStudentDashboardData_ = () => { throw new TypeError('column 9 undefined'); };
  const failure = JSON.parse(broken.c.API_student_getDashboard());
  assert.equal(failure.error.code, 'INTERNAL'); assert.doesNotMatch(failure.error.message, /column/);
});

test('the student screens are tabs: Weeks, Assessments and Project, with the first needed screen open', () => {
  const names = host => Array.from(host.querySelectorAll('[role="tab"]')).map(t => norm(t));
  const approved = setup(dtoFor('approved')), setupFirst = setup(dtoFor('notSubmitted'));
  assert.deepEqual(names(approved.host), ['Weeks', 'Assessments', 'Project']);
  const open = host => Array.from(host.querySelectorAll('[role="tabpanel"]')).filter(p => !p.hidden).map(p => p.getAttribute('data-student-panel'));
  assert.deepEqual(open(approved.host), ['weeks']);
  assert.deepEqual(open(setupFirst.host), ['project']);
  for (const tab of approved.host.querySelectorAll('[role="tab"]')) assert.equal(approved.host.querySelector('#' + tab.getAttribute('aria-controls')).getAttribute('aria-labelledby'), tab.id);
  assert(approved.host.querySelector('[data-student-panel="weeks"] #studentWeeklyProgress'));
  assert(approved.host.querySelector('[data-student-panel="assessments"] [data-review-result]'));
  assert(approved.host.querySelector('[data-student-panel="project"] [data-step-card]'));
  assert.equal(approved.host.querySelector('[data-student-panel="weeks"] [data-step-card]'), null);
});

test('selecting a tab shows its panel, supports arrow keys and survives a re-render', () => {
  const f = setup(dtoFor('approved'));
  const tab = key => f.host.querySelector('[data-student-tab="' + key + '"]');
  const open = () => Array.from(f.host.querySelectorAll('[role="tabpanel"]')).filter(p => !p.hidden).map(p => p.getAttribute('data-student-panel'));
  f.click(tab('project'));
  assert.deepEqual(open(), ['project']);
  assert.equal(tab('project').getAttribute('aria-selected'), 'true'); assert.equal(tab('weeks').getAttribute('aria-selected'), 'false');
  assert.equal(tab('project').getAttribute('tabindex'), '0'); assert.equal(tab('weeks').getAttribute('tabindex'), '-1');
  const key = (el, name) => { const e = new f.window.Event('keydown', { bubbles: true, cancelable: true }); e.key = name; el.dispatchEvent(e); };
  key(tab('project'), 'ArrowRight');
  assert.deepEqual(open(), ['weeks']);
  key(tab('weeks'), 'End');
  assert.deepEqual(open(), ['project']);
  f.view.render(f.host, dtoFor('approved'));
  assert.deepEqual(open(), ['project']);
});

test('the navigation is a sidebar on wide screens and a bottom bar on small ones, using only utilities', () => {
  const nav = setup(dtoFor('approved')).host.querySelector('nav[aria-label="Student sections"]');
  const classes = nav.getAttribute('class').split(/\s+/);
  for (const name of ['fixed', 'bottom-0', 'xl:sticky']) assert(classes.includes(name), name);
  assert.equal(nav.querySelectorAll('[style]').length, 0);
});
