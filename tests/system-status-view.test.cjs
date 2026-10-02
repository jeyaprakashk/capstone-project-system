// System Status view: the frame renders from a small DTO and keeps the hooks each card's module attaches to.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');

const DTO = { github: { coordUsername: 'coord-gh', reposWithAccess: 7, totalRepos: 9 }, publishing: { configured: true, items: [{ key: 'review1', title: 'Review 1' }, { key: 'guide_eval', title: 'Guide Evaluation' }] } };

function setup(dto = DTO) {
  const { document } = parseHTML('<html><body><div id="systemStatusContent"></div></body></html>');
  const calls = [];
  const c = loadSources(['data-bridge-client.js', 'system-status-view.js'], { document, Promise, JSON, setTimeout, clearTimeout });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  bridge.useFixtures({ API_coordinator_getSystemStatus: () => { calls.push('read'); return dto; } });
  const record = name => (...args) => calls.push([name, ...args]);
  const ui = { renderIcon: n => '<svg class="lucide-' + n + '"></svg>', renderSkeleton: (v, l) => '<span data-skeleton>' + String(l).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';') + '</span>',
    runGithubSync: record('sync'), runStudentInvitationResend: record('resend'), recheckCommitteeConfiguration: record('committee'), recheckReviewConfiguration: record('review'),
    bootstrapAssessmentDefinitions: record('bootstrap'), initializeAssessmentStorage: record('storage'), changeTeamPageSize: record('size') };
  const publishing = { toggle: record('toggle'), refresh: record('refresh') };
  vm.runInContext('globalThis.__make = ' + c.systemStatusViewBrowser_.toString(), c);
  const view = c.__make(bridge, () => ui, () => publishing);
  const host = document.getElementById('systemStatusContent');
  view.render(host, dto);
  return { view, host, calls, click: el => host.onclick({ target: el }) };
}
const norm = n => n.textContent.replace(/\s+/g, ' ').trim();

test('renders every card with the hooks its dashboard module attaches to', () => {
  const f = setup();
  for (const id of ['githubSyncButton', 'githubReposAccess', 'studentInvitationResend', 'committeeConfigurationCard', 'committeeConfigurationSummary', 'committeeConfigurationIssues', 'committeeDirectoryContent', 'committeeConfigLink', 'committeeAssignmentsLink', 'committeeConfigurationCheckedAt',
    'reviewConfigurationCard', 'reviewConfigurationSummary', 'reviewConfigurationIssues', 'createAssessmentDefinitionsButton', 'reviewAssessmentReadiness', 'assessmentStorageSetup', 'initializeAssessmentStorageButton', 'assessmentStorageStatus', 'assessmentStorageResults',
    'weeklyPhase2Setup', 'reviewDefinitionsLink', 'reviewConfigLink', 'reviewRubricsLink', 'reviewConfigurationCheckedAt', 'studentInvitationsPaginationInfo', 'studentInvitationsPageSize', 'studentInvitationsPaginationButtons']) assert(f.host.querySelector('#' + id), id);
  for (const hook of ['[data-resend-status]', '[data-resend-log]', '[data-resend-results]', '[data-weekly-setup-read]', '[data-weekly-setup-status]', '[data-status-cards]', '[data-status-primary]']) assert(f.host.querySelector(hook), hook);
  assert.equal(norm(f.host.querySelector('#githubReposAccess')), '7 / 9');
  assert.match(norm(f.host.querySelector('[data-status-primary]')), /coord-gh/);
  assert.equal(f.host.querySelector('#committeeConfigurationCard').getAttribute('aria-busy'), 'true');
  assert.equal(f.host.querySelector('#reviewConfigurationCard').parentNode, f.host.querySelector('#committeeConfigurationCard').parentNode);
  assert.equal(f.host.querySelector('#initializeAssessmentStorageButton').disabled, true);
  for (const id of ['createAssessmentDefinitionsButton', 'committeeConfigLink', 'reviewDefinitionsLink', 'committeeConfigurationIssues']) assert.equal(f.host.querySelector('#' + id).hasAttribute('hidden'), true, id);
  assert.equal(f.host.querySelector('[data-resend-log]').hasAttribute('hidden'), true);
});

test('each configured assessment gets a collapsed publishing card; a missing configuration shows a notice', () => {
  const f = setup();
  const cards = Array.from(f.host.querySelectorAll('[data-publishing]'));
  assert.deepEqual(cards.map(c => c.getAttribute('data-publishing')), ['review1', 'guide_eval']);
  assert.equal(norm(cards[1].querySelector('h3')), 'Guide Evaluation');
  assert.equal(cards[0].querySelector('[data-publishing-toggle]').getAttribute('aria-expanded'), 'false');
  assert.equal(cards[0].querySelector('[data-publishing-body]').hasAttribute('hidden'), true);
  assert(cards[0].querySelector('[data-publishing-content] [data-skeleton]'));
  assert.equal(cards[0].querySelector('[data-publishing-toggle]').getAttribute('aria-controls'), 'review1PublishingBody');
  const none = setup({ ...DTO, publishing: { configured: false, items: [] } });
  assert.equal(none.host.querySelectorAll('[data-publishing]').length, 0);
  assert.match(norm(none.host), /Assessment configuration needs attention/);
});

test('buttons hand off to the dashboard modules without inline handlers', () => {
  const f = setup(), pick = a => f.host.querySelector('[data-action="' + a + '"]');
  for (const action of ['github-sync', 'resend', 'committee-recheck', 'review-recheck']) f.click(pick(action));
  const bootstrap = pick('bootstrap-definitions'); bootstrap.removeAttribute('hidden'); bootstrap.removeAttribute('disabled'); f.click(bootstrap);
  const storage = pick('storage-init'); storage.removeAttribute('disabled'); f.click(storage);
  f.click(f.host.querySelector('[data-action="publishing-toggle"][data-key="review1"]'));
  f.click(f.host.querySelector('[data-action="publishing-refresh"][data-key="guide_eval"]'));
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [['sync'], ['resend'], ['committee'], ['review'], ['bootstrap'], ['storage'], ['toggle', 'review1'], ['refresh', 'guide_eval']]);
  f.click(pick('storage-init').cloneNode(true)); // a detached clone is not a registered action target
  const select = f.host.querySelector('#studentInvitationsPageSize');
  f.host.onchange({ target: { getAttribute: () => 'resend-size', value: '25' } });
  assert.deepEqual(f.calls.at(-1), ['size', 'invitations', '25']);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
  assert(select);
});

test('disabled buttons never fire', () => {
  const f = setup(), button = f.host.querySelector('#initializeAssessmentStorageButton');
  f.click(button);
  assert.equal(f.calls.length, 0);
});

test('the committee directory lists reviewers and teams, with empty states and a stable key', () => {
  const f = setup();
  const html = f.view.committeeDirectory([
    { number: ' C1 ', members: [{ name: 'Reviewer One', email: 'one@example.com' }, { name: '', email: 'two@example.com' }], teams: ['T1', 'T2'] },
    { number: 'C2', members: [], teams: [] }]);
  const { document } = parseHTML('<div>' + html + '</div>');
  const items = document.querySelectorAll('details.committee-item');
  assert.equal(items.length, 2);
  assert.equal(items[0].getAttribute('data-committee-key'), 'c1');
  assert.equal(norm(items[0].querySelector('summary')), 'Committee C1 2 reviewers · 2 teams');
  assert.match(norm(items[0]), /Reviewer Oneone@example\.com/);
  assert.match(norm(items[0]), /Name not providedtwo@example\.com/);
  assert.match(norm(items[1]), /No reviewers assigned\./); assert.match(norm(items[1]), /No teams assigned/);
  assert(document.querySelector('#committeeReadinessGrid'));
  assert.equal(document.querySelectorAll('a').length, 0);
  assert.equal(f.view.committeeDirectory([]).includes('<details'), false);
});

test('values are escaped and every class is compiled into the stylesheet', () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const bad = setup({ github: { coordUsername: evil, reposWithAccess: 1, totalRepos: 2 }, publishing: { configured: true, items: [{ key: 'k"1', title: evil }] } });
  bad.host.querySelector('#committeeDirectoryContent').innerHTML = bad.view.committeeDirectory([{ number: evil, members: [{ name: evil, email: evil }], teams: [evil] }]);
  assert.equal(bad.host.querySelectorAll('img').length, 0);
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const good = setup();
  good.host.querySelector('#committeeDirectoryContent').innerHTML = good.view.committeeDirectory([{ number: 'C1', members: [{ name: 'A', email: 'a@x' }], teams: ['T1'] }]);
  assert.deepEqual(missingClasses(renderedClasses(good.host).filter(c => !c.startsWith('lucide'))), []);
});

test('load reads once per request and a newer read supersedes an older one', async () => {
  const f = setup();
  const first = f.view.load(), second = f.view.load();
  await assert.rejects(first, e => e.superseded === true);
  assert.equal((await second).github.totalRepos, 9);
});
