// Guide dashboard migration: the DTO must carry every fact the server-rendered HTML showed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expectGolden } = require('./invariants/golden.cjs');
const { guideFixture, guideFullDto } = require('./guide-fixture.cjs');

const BADGE = { 'on-time': 'On time', late: 'Late', overdue: 'Overdue', pending: 'Pending', unknown: 'Timing unavailable' };
const text = n => n.textContent.replace(/\s+/g, ' ').trim();
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

// Facts shown for each team, derived from the DTO the way the view presents them.
function dtoFacts(dto) {
  return dto.teams.map(t => {
    const p = [];
    if (t.overdueLogs) p.push(t.overdueLogs + ' student weekly log(s) overdue');
    if (t.titleDue) p.push('Title approval due ' + t.titleDue.date + (t.titleDue.overdue ? ' · Overdue' : ''));
    const key = t.status.key;
    if (key === 'NEEDS_REVIEW' && t.similarityFlag) p.push(t.similarityFlag);
    if (key === 'AWAITING_REVIEWER') p.push('You approved — awaiting Reviewer.');
    if (key === 'REJECTED_BY_GUIDE') p.push('Your note: ' + (t.guideNotes || '(none)'), 'Waiting on the team to resubmit.');
    if (key === 'REVISE_AWAITING_STUDENT') p.push("Reviewer's note: " + (t.reviewerNotes || '(none)'), 'Waiting for the team to resubmit — nothing for you to do until they do.');
    if (t.approval) {
      p.push('Approved title: ' + t.title, 'Scope: Not recorded separately.' + (t.documents.find(d => d.label === 'Work Breakdown') ? ' See Work Breakdown.' : ''),
        'Approved by: ' + (t.approval.approvedBy || 'Not recorded'),
        'Approved on: ' + (t.approval.approvedOn || 'Date unavailable') + ' ' + BADGE[t.approval.timing.state] + ' ' + t.approval.timing.explanation,
        'Reviewer comment: ' + (t.reviewerNotes || 'No comment recorded'));
    }
    return {
      teamId: t.teamId,
      selector: { title: t.title || 'No title submitted yet', members: plural(t.members.length, 'member'), titleAttention: key === 'NEEDS_REVIEW', documentsAttention: t.documents.length },
      heading: { title: t.title || 'No title submitted yet', members: t.members.map(m => m.regno ? m.name + ' (' + m.regno + ')' : m.name).join(', '), mailto: t.memberEmails.join(',') },
      students: t.registerNumbers,
      github: t.github ? {
        tone: t.github.tone, due: dto.githubDue || 'Date unavailable',
        members: t.github.members.map(m => ({ state: m.state, name: m.name, regno: m.regno,
          timing: m.timing ? { date: m.timing.date, label: m.timing.daysLate > 0 ? plural(m.timing.daysLate, 'day') + ' late' : BADGE[m.timing.state], explanation: m.timing.explanation } : null })),
        repo: t.repoUrl || null
      } : null,
      title: {
        status: 'Team ' + t.teamId + ' · ' + t.status.text,
        timing: t.titleTiming ? { label: BADGE[t.titleTiming.state], explanation: t.titleTiming.explanation } : null,
        paragraphs: p, form: key === 'NEEDS_REVIEW' ? { value: t.title } : null,
        problem: t.problem ? t.problem.replace(/\s+/g, ' ').trim() : null
      },
      documents: { links: t.documents, last: t.documents.length ? null : (t.lastDocumentSubmission || 'None recorded') }
    };
  });
}

function build(options) {
  const g = guideFixture(options);
  return { g, dto: guideFullDto(g) };
}

test('guide DTO carries the same facts the server-rendered dashboard showed', () => {
  const { dto } = build();
  // Captured from the legacy HTML (buildDashboardContent) before it was removed; see git history.
  expectGolden('guide-legacy-facts', dtoFacts(dto));
});

test('an unavailable GitHub status is reported as unavailable, never as missing accounts', () => {
  const { dto } = build({ github: 'throw' });
  assert(dto.teams.every(t => t.github === null));
});

test('the dashboard read never touches GitHub; the GitHub endpoint carries the status keyed by team', () => {
  const g = guideFixture();
  let calls = 0; const setup = g.c.getTeamsGithubSetup_; g.c.getTeamsGithubSetup_ = (...args) => { calls++; return setup(...args); };
  const dashboard = JSON.parse(g.c.API_guide_getDashboard()).data;
  assert.equal(calls, 0);
  assert(dashboard.teams.every(t => !('github' in t)));
  const github = JSON.parse(g.c.API_guide_getGithub()).data;
  assert.equal(calls, 1, 'one batched GitHub read for every team');
  assert.deepEqual(Object.keys(github.teams).sort(), dashboard.teams.map(t => t.teamId).sort());
  assert.equal(github.teams.T4, null, 'a team without GitHub data is reported as unavailable, not as missing accounts');
});

test('the GitHub endpoint reports every team unavailable, not an error, when GitHub cannot be read', () => {
  const g = guideFixture({ github: 'throw' });
  const frame = JSON.parse(g.c.API_guide_getGithub());
  assert.equal(frame.ok, true);
  assert(Object.values(frame.data.teams).length > 0 && Object.values(frame.data.teams).every(value => value === null));
});

test('the dashboard never reads the hub registry; approval details come from their own endpoint, which reads it only for approved teams', () => {
  const run = g => {
    let reads = 0; g.c.getHubRegistrySheet_ = () => { reads++; return {}; };
    const dashboard = JSON.parse(g.c.API_guide_getDashboard()).data;
    const afterDashboard = reads;
    const approvals = JSON.parse(g.c.API_guide_getApprovals()).data;
    return { dashboard, approvals, afterDashboard, total: reads };
  };
  const withApproved = run(guideFixture());
  assert.equal(withApproved.afterDashboard, 0, 'first paint does not wait for the second spreadsheet');
  assert.equal(withApproved.total, 1);
  assert.deepEqual(withApproved.dashboard.teams.filter(t => t.approval).map(t => t.approval.timing), [null], 'pending until the approvals reply');
  assert.deepEqual(withApproved.dashboard.teams.filter(t => t.approval).map(t => t.approval.approvedOn), [null]);
  assert.deepEqual(Object.keys(withApproved.approvals.teams), ['T1']);
  assert.equal(withApproved.approvals.teams.T1.approvedOn, '', 'an unreadable registry is an empty date, not an error');
  assert.equal(withApproved.approvals.teams.T1.timing.state, 'unknown');
  const g = guideFixture(), decision = g.ts.indexOf('Reviewer Decision');
  g.f.status.rows.forEach((row, index) => { if (index) row[decision] = ''; });
  const none = run(g);
  assert.equal(none.total, 0, 'no approved team, so no registry read at all');
  assert.deepEqual(none.approvals, { teams: {} });
  assert(none.dashboard.teams.every(t => t.approval === null));
});

test('guide commits DTO counts every collected commit per mapped member and skips the template bootstrap', () => {
  const { g } = build();
  const sha = n => String(n).padStart(40, 'a');
  const row = (n, authorId, message, day) => ({ teamId: 'T1', timestamp: new Date('2026-01-' + day + 'T10:00:00Z'), username: 'u' + authorId, sha: sha(n), message, repositoryUrl: 'https://github.com/org/team1', authorId, authorResolution: 'resolved' });
  const collected = [row(1, '1', 'first', '02'), row(2, '1', 'second', '03'), row(3, '1', 'third', '04'), row(4, '1', 'fourth', '05'), row(5, '2', 'other', '06'),
    { ...row(6, '1', 'Initial commit: Capstone project for Team T1', '01'), username: 'system' }, { ...row(7, '1', 'elsewhere', '07'), repositoryUrl: 'https://github.com/org/other' }];
  const setup = { repoUrl: 'https://github.com/org/team1', members: [{ label: '001', username: 'one', githubId: '1', status: 'valid' }, { label: '002', username: 'two', githubId: '2', status: 'valid' }, { label: '003', username: '', githubId: '', status: 'unavailable' }] };
  const dto = JSON.parse(JSON.stringify(g.c.buildGuideCommitsDto_('T1', setup, collected, true)));
  assert.equal(dto.state, 'available');
  assert.deepEqual(dto.members.map(m => [m.regno, m.count, m.commits.length]), [['001', 4, 3], ['002', 1, 1], ['003', null, 0]]);
  assert.deepEqual(dto.members[0].commits.map(c => c.message), ['fourth', 'third', 'second']);
  assert.equal(dto.members[0].commits[0].url, 'https://github.com/org/team1/commit/' + sha(4));
  assert.equal(g.c.buildGuideCommitsDto_('T1', setup, collected, false).state, 'unavailable');
  assert.equal(g.c.buildGuideCommitsDto_('T1', { ...setup, repoUrl: '' }, collected, true).state, 'unavailable');
});

test('guide commits endpoint refuses a team that belongs to another guide', () => {
  const { g } = build();
  const frame = JSON.parse(g.c.API_guide_getCommits('NOT-MY-TEAM'));
  assert.equal(frame.ok, false); assert.equal(frame.error.code, 'UNAUTHORIZED');
});
