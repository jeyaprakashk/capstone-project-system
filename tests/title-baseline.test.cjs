// Phase 0 golden masters (TITLE-REVISION-PLAN.md): today's downstream results for every TeamStatus title/decision combination.
// Weekly submission, review marking, eligibility, coordinator health and the two digests are driven through the real code on the
// existing fixtures. Later phases (titleGate_) must produce the same results for the states whose meaning is unchanged.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { weeklyFixture } = require('./weekly-progress-fixture.cjs');
const { coordinatorFixture } = require('./coordinator-fixture.cjs');
const { combos, inside } = require('./title-baseline/combos.cjs');
const { expectBaseline } = require('./title-baseline/golden.cjs');

const load = (context, files) => files.forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
const plain = value => JSON.parse(JSON.stringify(value));
const iso = value => value ? new Date(value).toISOString() : '';

/** A weekly fixture whose single team T1 is in the given title state. */
function fixtureFor(combo) {
  const f = weeklyFixture();
  f.set('Title', combo.title);
  f.set('Guide Decision', combo.guide);
  f.set('Reviewer Decision', combo.reviewer);
  return f;
}

test('the states cover every title, Guide Decision and Reviewer Decision combination', () => {
  const list = combos();
  assert.equal(list.length, 2 * 4 * 4);
  assert.equal(new Set(list.map(c => c.id)).size, list.length);
});

test('baseline: the status each state maps to (getTeamStatus_)', () => {
  const result = {};
  for (const combo of combos()) {
    const f = fixtureFor(combo);
    result[combo.id] = f.c.getTeamStatus_(f.status.rows[1]);
  }
  expectBaseline('status', result);
});

test('baseline: weekly submission (the submit gate and the editable weeks on the student page)', () => {
  const result = {};
  for (const combo of combos()) {
    const f = fixtureFor(combo);
    const page = f.c.loadStudentWeeklyProgress_();
    const outcome = {editableWeeks: page.weeks.filter(week => week.editable).map(week => week.weekId), actions: page.actions.length};
    try {
      const saved = f.c.submitWeeklyProgress_(f.input());
      outcome.submit = {saved: true, entryStatus: saved.entryStatus, timeliness: saved.timeliness, weekId: saved.weekId};
    } catch (error) {
      outcome.submit = {saved: false, error: error.message};
    }
    result[combo.id] = outcome;
  }
  expectBaseline('weekly', result);
});

test('baseline: review marking (eligibility, the reviewer status, who can decide, who is pending, the marks cell)', () => {
  const result = {};
  for (const combo of combos()) {
    const f = fixtureFor(combo);
    const c = f.c;
    load(c, ['reviewer-api.js', 'reviewer-dashboard.js', 'review-evaluation.js']);
    f.set('Review Committee Number', 'C1');
    c.getCommitteeNumbersForReviewer_ = () => ['C1'];
    const TS = c.getColumnMap_('TeamStatus', inside(c, 'FIELD_DEFINITIONS.TEAM_STATUS'));
    const row = f.status.rows[1];
    const progress = {reviews: [{key: 'review1'}], teams: {t1: {review1: {available: true, readable: true, completed: false, status: 'Draft', markedStudents: 0, totalStudents: 2, reason: '', prerequisiteReason: ''}}}};
    const team = c.reviewerTeamDto_(row, TS, progress);
    const data = c.getReviewerDashboardData_('reviewer@example.com');
    const ids = rows => rows.map(r => String(r[TS.TEAM_ID]));
    result[combo.id] = {
      reviewEligibility: plain(c.reviewEligibility_(row, TS)),
      reviewerStatus: plain(c.reviewerTitleStatus_(row, TS)),
      titleApproval: {status: plain(team.titleApproval.status), canDecide: team.titleApproval.canDecide},
      marksCellEnabled: team.reviews[0].enabled,
      dashboard: {pending: ids(data.pending), approved: ids(data.approved), notYetGuideApproved: ids(data.notYetGuideApproved)}
    };
  }
  expectBaseline('review-marking', result);
});

test('baseline: eligibility (the title date from the registry and the resulting eligibility)', () => {
  const result = {};
  for (const combo of combos()) {
    const f = fixtureFor(combo);
    const c = f.c;
    f.config.ACADEMIC_YEAR = '2026-27';
    f.set('Semester', 'Odd');
    f.set('Guide Email', 'guide@example.com');
    f.set('Title Approved By', 'reviewer@example.com');
    const team = c.weeklyTeam_('T1');
    const registry = [['2026-27', 'Odd', 'T1', 'guide@example.com', combo.title, 'https://github.com/org/team', '', new Date('2026-01-01T00:00:00Z'), 'reviewer@example.com']];
    const titleDate = c.progressTitleDate_(team, registry);
    const titleStatus = c.getTeamStatus_(team.row);
    const outcome = c.calculateProgressEligibility_({effectiveDate: new Date('2026-01-01T00:00:00Z'), titleDate, titleStatus}, c.getWeeklySubmissionWindows_(), new Date('2026-01-10T00:00:00Z'));
    result[combo.id] = {titleStatus, titleDate: iso(titleDate), eligibility: {status: outcome.status, eligibleFrom: outcome.eligibleFrom || '', enforcedFrom: outcome.enforcedFrom || '', error: outcome.error || ''}};
  }
  expectBaseline('eligibility', result);
});

test('baseline: coordinator (title counts, the tracker status, health and the team drawer)', () => {
  const g = coordinatorFixture();
  // Two extra Guide-approved teams make the Guide-approved and Reviewer-approved totals differ, so a count that read the wrong
  // decision could not hide behind the symmetry of the 32 states (8 of each).
  const list = [...combos(),
    {id: 'extra 1: title=yes guide=Approved reviewer=-', title: 'Project', guide: 'Approved', reviewer: ''},
    {id: 'extra 2: title=yes guide=Approved reviewer=-', title: 'Project', guide: 'Approved', reviewer: ''}];
  const teams = list.map((combo, index) => ({
    'Team ID': 'C' + String(index).padStart(2, '0'), Title: combo.title, 'Guide Decision': combo.guide, 'Reviewer Decision': combo.reviewer,
    'Guide Name': 'Dr. G', 'Guide Email': 'guide@example.com', Semester: 'Odd',
    'Student 1 Email': 's' + index + '@example.com', 'Student 1 Register No': String(1000 + index)
  }));
  g.f.status.rows.splice(1, g.f.status.rows.length, ...teams.map(team => g.f.ts.map(header => team[header] ?? '')));
  g.f.roster.rows.splice(1, g.f.roster.rows.length, ...teams.map(team => g.f.tr.map(header => team[header] ?? '')));
  g.c.getRepoUrlMap_ = () => ({});
  g.c.getAllReviewCompletionStatus_ = () => ({});
  g.c.getTeamReviewCompletionStatus_ = () => ({});
  const call = (name, ...args) => JSON.parse(g.c[name](...args)).data;
  const overview = call('API_coordinator_getOverview');
  const health = call('API_coordinator_getHealth');
  const result = {titleApproved: overview.stats.titleApproved, total: overview.stats.total, needsAttention: health.needsAttention, teams: {}};
  // Health with every other requirement neutralised, so the title rule ("Title approval overdue") is what differs between states.
  const schedule = g.c.getProjectSchedule_(), clock = g.c.getProjectClock_(schedule);
  const TS = g.c.getColumnMap_('TeamStatus', inside(g.c, 'FIELD_DEFINITIONS.TEAM_STATUS'));
  list.forEach((combo, index) => {
    const id = 'C' + String(index).padStart(2, '0');
    const tracked = overview.teams.find(team => team.teamId === id);
    const drawer = call('API_coordinator_getTeamDrawer', id, 'progress');
    const basic = call('API_coordinator_getTeamDrawer', id, 'basic');
    result.teams[combo.id] = {
      trackerTitleStatus: tracked.titleStatus,
      health: health.teams[id].health,
      titleHealth: plain(g.c.assessProjectTeam_(g.f.status.rows[index + 1], TS, 'https://github.com/org/x', [], {}, schedule, clock, {missing: 0, active: false, currentLogged: true}, {repositoryOnly: true, ready: true, message: 'ok'})),
      drawerProgress: {titleStatus: drawer.titleStatus, guideDecision: drawer.guideDecision, reviewerDecision: drawer.reviewerDecision, health: drawer.health},
      drawerBasic: {title: basic.title, titleStatus: basic.titleStatus, guideDecision: basic.guideDecision, reviewerDecision: basic.reviewerDecision}
    };
  });
  expectBaseline('coordinator', result);
});

test('baseline: the Guide reminder and Reviewer approval digests', () => {
  const f = weeklyFixture();
  const c = f.c;
  f.config.HUB_SHEET_ID = 'hub';
  f.config.ACADEMIC_YEAR = '2026-27';
  load(c, ['intake-approval-workflow.js']);
  const list = combos();
  const teams = list.map((combo, index) => ({
    'Team ID': 'D' + String(index).padStart(2, '0'), Title: combo.title, 'Guide Decision': combo.guide, 'Reviewer Decision': combo.reviewer,
    'Guide Email': 'guide@example.com', 'Review Committee Number': 'C1'
  }));
  f.status.rows.splice(1, f.status.rows.length, ...teams.map(team => f.ts.map(header => team[header] ?? '')));
  c.getCommitteeInfo_ = () => ({reviewer1Email: 'rev1@example.com', reviewer2Email: 'rev2@example.com', reviewer3Email: '', reviewer4Email: ''});
  c.sendGuideReminderDigest();
  const guideMails = f.mails.splice(0);
  c.sendReviewerApprovalDigest();
  const reviewerMails = f.mails.splice(0);
  const teamsIn = body => [...body.matchAll(/Team (D\d\d)/g)].map(match => match[1]);
  const byId = Object.fromEntries(list.map((combo, index) => ['D' + String(index).padStart(2, '0'), combo.id]));
  const describe = mails => mails.map(mail => ({to: mail[0], subject: mail[1], states: teamsIn(mail[2]).map(id => byId[id])}));
  expectBaseline('digests', {guideReminder: describe(guideMails), reviewerApproval: describe(reviewerMails)});
});

test('the baselines are recorded for every area, and none is empty', () => {
  const dir = require('node:path').join(__dirname, 'title-baseline', 'snapshots');
  for (const name of ['status', 'weekly', 'review-marking', 'eligibility', 'coordinator', 'digests']) {
    const file = require('node:path').join(dir, name + '.json');
    assert.ok(fs.existsSync(file), name + ' baseline is missing');
    assert.ok(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length > 0, name + ' baseline is empty');
  }
});
