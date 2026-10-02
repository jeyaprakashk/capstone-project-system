// Reviewer dashboard migration: the DTO must carry exactly the facts the server-rendered HTML did.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadSources, expectGolden } = require('./invariants/golden.cjs');

function serverFixture(email = 'reviewer@example.com') {
  const c = loadSources(['common-constants.js', 'common-helpers.js', 'lucide-icons.js', 'icon-renderer.js', 'reviewer-dashboard.js', 'api-envelope.js', 'reviewer-api.js'],
    { Session: { getActiveUser: () => ({ getEmail: () => email }) }, PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) } });
  const defs = vm.runInContext('FIELD_DEFINITIONS.TEAM_STATUS', c);
  const headers = Object.keys(defs), index = Object.fromEntries(headers.map((k, i) => [k, i]));
  const row = values => headers.map(k => values[k] ?? '');
  const rows = [
    row({ TEAM_ID: 'T1', COMMITTEE_NUMBER: 'C1', GUIDE_NAME: 'Dr. Guide', GUIDE_DECISION: 'Approved', TITLE: '<script>alert(1)</script> Title', S1_REGNO: 'R1', S2_REGNO: 'R2', SIMILARITY_FLAG: 'Similar to T9', WORK_BREAKDOWN_LINK: 'https://example.com/wbs', NEED_ANALYSIS_LINK: 'https://example.com/need' }),
    row({ TEAM_ID: 'T2', COMMITTEE_NUMBER: 'C1', GUIDE_NAME: 'Dr. Guide', GUIDE_DECISION: 'Approved', REVIEWER_DECISION: 'Approved', TITLE: 'Approved title', S1_REGNO: 'R3', REVIEWER_NOTES: 'Good scope' }),
    row({ TEAM_ID: 'T3', COMMITTEE_NUMBER: 'C1', REVIEWER_DECISION: 'Revise', GUIDE_DECISION: 'Approved', TITLE: 'Revision title' }),
    row({ TEAM_ID: 'T4', COMMITTEE_NUMBER: 'C1', TITLE: '   ' }),
    row({ TEAM_ID: 'T5', COMMITTEE_NUMBER: 'C1', TITLE: 'Submitted title', GUIDE_NAME: 'Guide 5' }),
    row({ TEAM_ID: 'OTHER', COMMITTEE_NUMBER: 'C2', TITLE: 'Hidden' })
  ];
  const progress = {
    reviews: [{ key: 'review1', label: 'Review 1' }, { key: 'review2', label: 'Review 2' }], error: '',
    teams: {
      t1: { review1: { available: true, readable: true, status: 'Open', markedStudents: 0, totalStudents: 2, prerequisiteReason: 'Title not approved' }, review2: { available: false, error: 'Storage missing' } },
      t2: { review1: { available: true, readable: true, status: 'Draft', markedStudents: 1, totalStudents: 1 }, review2: { available: true, readable: true, status: '', reason: '', markedStudents: 1, totalStudents: 3 } },
      t3: { review1: { available: true, readable: false, status: 'Submitted', completed: true, markedStudents: 2, totalStudents: 2 } },
      t5: { review1: { available: true, readable: true, status: 'Published', completed: true, markedStudents: 1, totalStudents: 1 }, review2: { available: true, readable: true, status: '', completed: true, markedStudents: 1, totalStudents: 1 } }
    }
  };
  Object.assign(c, {
    getColumnMap: () => index, getSheetRows: () => rows, getCommitteeNumbersForReviewer: () => ['C1'],
    normalizeReviewKey_: s => String(s || '').trim().toLowerCase(), getReviewerReviewProgress_: () => progress
  });
  return { c, progress, rows };
}

// Facts the removed server-rendered HTML presented for each team.
const dtoFacts = dto => dto.teams.map(t => ({
  teamId: t.teamId, guideName: t.guideName, registerNumbers: t.registerNumbers, title: t.title, committee: t.committee,
  statusLabel: t.titleApproval.status.label, canDecide: t.titleApproval.canDecide, documents: t.titleApproval.documents,
  reviews: t.reviews.map(r => ({ key: r.key, enabled: r.enabled, actionLabel: r.actionLabel, note: r.note }))
}));

test('DTO carries the same team facts the server-rendered reviewer HTML showed', () => {
  const { c } = serverFixture();
  const dto = JSON.parse(c.API_reviewer_getDashboard()).data;
  // Captured from the legacy HTML (buildReviewerAssignedTeams_) before it was removed; see git history.
  expectGolden('reviewer-legacy-facts', dtoFacts(dto));
});

test('reviewer DTO summary, review columns, notes and excluded committees match the legacy dashboard', () => {
  const { c, progress } = serverFixture();
  const dto = JSON.parse(c.API_reviewer_getDashboard()).data;
  const data = c.getReviewerDashboardData('reviewer@example.com');
  assert.deepEqual(dto.summary, { pending: data.pending.length, approved: data.approved.length, awaitingGuide: data.notYetGuideApproved.length, total: data.total });
  assert.deepEqual(dto.reviews, progress.reviews);
  assert.equal(dto.reviewError, null);
  assert(!dto.teams.some(t => t.teamId === 'OTHER'));
  assert.equal(dto.teams.find(t => t.teamId === 'T2').titleApproval.reviewerNotes, 'Good scope');
  assert.equal(dto.teams.find(t => t.teamId === 'T1').titleApproval.similarityFlag, 'Similar to T9');
});

test('reviewer DTO is stable and contains no markup or spreadsheet layout', () => {
  const { c } = serverFixture();
  const frame = JSON.parse(c.API_reviewer_getDashboard());
  assert.match(frame.generatedAt, /^\d{4}-\d\d-\d\dT/);
  // Dates vary per run; the snapshot covers data only.
  expectGolden('reviewer-dto', frame.data);
  assert.doesNotMatch(JSON.stringify(frame.data), /<(div|td|tr|span|button|a)\b|class=|onclick=/);
});

test('reviewer endpoints authorize on the server and map failures to safe errors', () => {
  const denied = serverFixture();
  denied.c.getCommitteeNumbersForReviewer = () => [];
  assert.deepEqual(JSON.parse(denied.c.API_reviewer_getDashboard()), { ok: false, error: { code: 'UNAUTHORIZED', message: 'You do not have Reviewer access.' } });
  assert.equal(JSON.parse(denied.c.API_reviewer_submitDecision('T1', 'Approved', '')).error.code, 'UNAUTHORIZED');
  const anonymous = serverFixture('');
  assert.equal(JSON.parse(anonymous.c.API_reviewer_getDashboard()).error.code, 'UNAUTHENTICATED');
  const broken = serverFixture();
  broken.c.getReviewerDashboardData = () => { throw new TypeError('secret column 7 undefined'); };
  const failure = JSON.parse(broken.c.API_reviewer_getDashboard());
  assert.equal(failure.error.code, 'INTERNAL');
  assert.doesNotMatch(failure.error.message, /secret|column/);
});

test('reviewer decision keeps the existing business rules and messages', () => {
  const f = serverFixture();
  f.c.submitReviewerDecision = (team, decision, notes) => { if (decision === 'Revise' && !notes.trim()) throw new Error('Notes are required when requesting revision.'); return { ok: true, message: 'Saved ' + team + ' ' + decision }; };
  assert.deepEqual(JSON.parse(f.c.API_reviewer_submitDecision('T1', 'Approved', '')).data, { message: 'Saved T1 Approved' });
  const rejected = JSON.parse(f.c.API_reviewer_submitDecision('T1', 'Revise', ' '));
  assert.deepEqual(rejected.error, { code: 'REJECTED', message: 'Notes are required when requesting revision.' });
});

test('dashboard shell compiles, defines the bridge before the dashboard script and includes the Tailwind build', () => {
  const fs = require('node:fs');
  const files = ['common-styles.js', 'common-constants.js', 'common-helpers.js', 'guide-dashboard.js', 'coordinator-dashboard.js', 'student-dashboard.js', 'reviewer-dashboard.js',
    'lucide-icons.js', 'icon-renderer.js', 'review-evaluation-client.js', 'internal-assessment-publishing-client.js', 'guide-evaluation-client.js', 'guide-weekly-client.js',
    'dashboard-client-scripts.js', 'review-academic-policy.js', 'data-bridge-client.js', 'reviewer-view.js', 'guide-view.js', 'student-view.js', 'coordinator-view.js', 'system-status-view.js', 'student-api.js', 'coordinator-api.js', 'dashboard-router.js'];
  const c = loadSources(files, { PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    HtmlService: { createHtmlOutputFromFile: name => ({ getContent: () => fs.readFileSync(name + '.html', 'utf8') }) } });
  const html = c.buildDashboardShell('r@example.com', [{ key: 'reviewer', label: 'Reviewer', contentId: 'reviewerContent' }]);
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new vm.Script(script));
  assert(script.indexOf('const DataBridge') >= 0 && script.indexOf('const DataBridge') < script.indexOf('const DashboardUI'));
  assert(script.indexOf('const ReviewerView') < script.indexOf('const DashboardUI'));
  assert(html.indexOf('tailwind-styles') < 0 && html.includes('.px-4{'), 'compiled Tailwind CSS is inlined');
  assert(!html.includes('--fs-h1') && !html.includes('app-styles'), 'the legacy stylesheet is gone');
});

test('workflow rejections returned as {ok:false} are errors, never success', () => {
  const f = serverFixture();
  f.c.submitReviewerDecision = () => ({ ok: false, message: 'You are not an assigned reviewer for Team T1.' });
  assert.deepEqual(JSON.parse(f.c.API_reviewer_submitDecision('T1', 'Approved', '')),
    { ok: false, error: { code: 'REJECTED', message: 'You are not an assigned reviewer for Team T1.' } });
  f.c.submitReviewerDecision = () => ({ ok: true, message: 'Decision recorded for Team T1.' });
  assert.deepEqual(JSON.parse(f.c.API_reviewer_submitDecision('T1', 'Approved', '')).data, { message: 'Decision recorded for Team T1.' });
});
