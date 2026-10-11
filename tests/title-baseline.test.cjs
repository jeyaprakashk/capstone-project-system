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
const { legacySteps } = require('./title-baseline/titlelog.cjs');
const { expectBaseline, expectBaselineAs } = require('./title-baseline/golden.cjs');

/** The TitleLog status an old state is translated to (tests/title-baseline/titlelog.cjs). */
const newStatusOf = combo => { const steps = legacySteps(combo.title, combo.guide, combo.reviewer); return !steps.length ? 'NOT_SUBMITTED' : steps.includes('RETURN') ? 'RETURNED' : steps.includes('REVIEWER_APPROVE') ? 'APPROVED' : steps.includes('GUIDE_APPROVE') ? 'AWAITING_REVIEWER' : 'NEEDS_REVIEW'; };
// The four states that mean the same in the old and the new model (tests/title-gate.test.cjs also checks them against status.json).
const SAME_MEANING = new Set(['title=no guide=- reviewer=-', 'title=yes guide=- reviewer=-', 'title=yes guide=Approved reviewer=-', 'title=yes guide=- reviewer=Approved']);
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

test('baseline: the status each old state maps to, now read from TitleLog', () => {
  const result = {};
  for (const combo of combos()) {
    const f = fixtureFor(combo);
    result[combo.id] = f.c.titleSummary_('T1').status;
  }
  // The old getTeamStatus_ had two "returned" statuses (by the guide, by the reviewer); TitleLog has one.
  const OLD_TO_NEW = {NOT_SUBMITTED: 'NOT_SUBMITTED', NEEDS_REVIEW: 'NEEDS_REVIEW', AWAITING_REVIEWER: 'AWAITING_REVIEWER', APPROVED: 'APPROVED', REJECTED_BY_GUIDE: 'RETURNED', REVISE_AWAITING_STUDENT: 'RETURNED'};
  expectBaselineAs('status', result, status => OLD_TO_NEW[status]);
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
    const data = c.getReviewerDashboardData_('reviewer@example.com');
    const title = data.titles['t1'];
    const team = c.reviewerTeamDto_(row, TS, progress, title, '');
    const ids = rows => rows.map(r => String(r[TS.TEAM_ID]));
    result[combo.id] = {
      reviewEligibility: plain(c.reviewEligibility_(row, TS)),
      reviewerStatus: plain(c.reviewerTitleStatus_(title)),
      titleApproval: {status: plain(team.titleApproval.status), canDecide: team.titleApproval.canDecide},
      marksCellEnabled: team.reviews[0].enabled,
      dashboard: {pending: ids(data.pending), approved: ids(data.approved), notYetGuideApproved: ids(data.notYetGuideApproved)}
    };
  }
  // Review marking is gated on an approved title exactly as before, in every one of the 32 states. The reviewer's own groups and chips
  // are compared only for the states whose meaning is the same in both models; the others differ on purpose (a returned title is one
  // status now, and a reviewer cannot decide on a title the guide has not approved).
  const projected = Object.fromEntries(Object.entries(result).map(([id, entry]) => [id, SAME_MEANING.has(id) ? entry : {reviewEligibility: entry.reviewEligibility, marksCellEnabled: entry.marksCellEnabled}]));
  // One recorded quirk is not kept: the old dashboard listed a reviewer-approved team that had no Guide Decision as also awaiting the
  // guide. An approved title has always passed the guide now, so it is in one group only.
  expectBaselineAs('review-marking', projected, (entry, id) => !SAME_MEANING.has(id) ? {reviewEligibility: entry.reviewEligibility, marksCellEnabled: entry.marksCellEnabled}
    : id === 'title=yes guide=- reviewer=Approved' ? {...entry, dashboard: {...entry.dashboard, notYetGuideApproved: []}} : entry);
});

test('baseline: eligibility (the title date and the resulting eligibility, now from TitleLog)', () => {
  const result = {};
  for (const combo of combos()) {
    const f = fixtureFor(combo);
    const c = f.c;
    // The old registry date was 2026-01-01T00:00:00Z; the final approval in the TitleLog rows falls at the same moment.
    f.setTitleStart(Date.parse('2025-12-31T22:00:00Z'));
    const team = c.weeklyTeam_('T1');
    const index = c.readTitleIndex_();
    const titleDate = c.progressTitleDate_(team, index);
    const titleStatus = c.progressTitleStatus_(team, index);
    const outcome = c.calculateProgressEligibility_({effectiveDate: new Date('2026-01-01T00:00:00Z'), titleDate, titleStatus}, c.getWeeklySubmissionWindows_(), new Date('2026-01-10T00:00:00Z'));
    result[combo.id] = {approved: titleStatus === 'APPROVED', titleDate: iso(titleDate), eligibility: {status: outcome.status, eligibleFrom: outcome.eligibleFrom || '', enforcedFrom: outcome.enforcedFrom || '', error: outcome.error || ''}};
  }
  // The old status words differ from the new ones; only "approved or not" and the date are compared, plus the resulting eligibility.
  expectBaselineAs('eligibility', result, entry => ({approved: entry.titleStatus === 'APPROVED', titleDate: entry.titleDate, eligibility: entry.eligibility}));
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
  g.f.syncTitleLog();
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
      titleHealth: plain(g.c.assessProjectTeam_(g.f.status.rows[index + 1], TS, 'https://github.com/org/x', [], {}, schedule, clock, {missing: 0, active: false, currentLogged: true}, {repositoryOnly: true, ready: true, message: 'ok'}, tracked.titleStatus === 'APPROVED')),
      drawerProgress: {titleStatus: drawer.titleStatus, health: drawer.health},
      drawerBasic: {title: basic.title, titleStatus: basic.titleStatus}
    };
  });
  // The 32 old states collapse to the six new statuses: each team is compared with the old state that means the same, so a title that was
  // never submitted but carried a Reviewer Decision is now simply not submitted, a guide rejection and a reviewer revision are both
  // "returned", and the decisions themselves are no longer reported. Titles are normalised to upper case.
  const REPRESENTATIVE = {NOT_SUBMITTED: 'title=no guide=- reviewer=-', NEEDS_REVIEW: 'title=yes guide=- reviewer=-', AWAITING_REVIEWER: 'title=yes guide=Approved reviewer=-',
    APPROVED: 'title=yes guide=- reviewer=Approved', RETURNED: 'title=yes guide=Rejected reviewer=-'};
  const OLD_TO_NEW = {NOT_SUBMITTED: 'NOT_SUBMITTED', NEEDS_REVIEW: 'NEEDS_REVIEW', AWAITING_REVIEWER: 'AWAITING_REVIEWER', APPROVED: 'APPROVED', REJECTED_BY_GUIDE: 'RETURNED', REVISE_AWAITING_STUDENT: 'RETURNED'};
  expectBaselineAs('coordinator', result, (recorded, id, all) => {
    if (id === 'titleApproved') return list.filter(combo => newStatusOf(combo) === 'APPROVED').length;
    if (id === 'needsAttention') {
      const attention = Object.entries(all.teams).filter(([key, team]) => team.health === 'attention').length;
      const wasAttention = list.filter(combo => all.teams[combo.id] && all.teams[combo.id].health === 'attention').length;
      return recorded - wasAttention + list.filter(combo => all.teams[combo.id] && all.teams[REPRESENTATIVE[newStatusOf(combo)]].health === 'attention').length;
    }
    if (id === 'teams') {
      return Object.fromEntries(list.filter(combo => all.teams[combo.id]).map(combo => {
        const status = newStatusOf(combo), rep = all.teams[REPRESENTATIVE[status]];
        return [combo.id, {trackerTitleStatus: status, health: rep.health, titleHealth: rep.titleHealth,
          drawerProgress: {titleStatus: status, health: rep.drawerProgress.health}, drawerBasic: {title: combo.title ? 'PROJECT' : '', titleStatus: status}}];
      }));
    }
    return recorded;
  }, true);
});

test('baseline: the Guide reminder and Reviewer approval digests', () => {
  const f = weeklyFixture();
  const c = f.c;
  f.config.HUB_SHEET_ID = 'hub';
  f.config.ACADEMIC_YEAR = '2026-27';
  load(c, ['title-digests.js']);
  const list = combos();
  const teams = list.map((combo, index) => ({
    'Team ID': 'D' + String(index).padStart(2, '0'), Title: combo.title, 'Guide Decision': combo.guide, 'Reviewer Decision': combo.reviewer,
    'Guide Email': 'guide@example.com', 'Review Committee Number': 'C1'
  }));
  f.status.rows.splice(1, f.status.rows.length, ...teams.map(team => f.ts.map(header => team[header] ?? '')));
  f.syncTitleLog();
  c.getCommitteeInfo_ = () => ({reviewer1Email: 'rev1@example.com', reviewer2Email: 'rev2@example.com', reviewer3Email: '', reviewer4Email: ''});
  c.sendGuideReminderDigest();
  const guideMails = f.mails.splice(0);
  c.sendReviewerApprovalDigest();
  const reviewerMails = f.mails.splice(0);
  const teamsIn = body => [...body.matchAll(/Team (D\d\d)/g)].map(match => match[1]);
  const byId = Object.fromEntries(list.map((combo, index) => ['D' + String(index).padStart(2, '0'), combo.id]));
  const describe = mails => mails.map(mail => ({to: mail[0], subject: mail[1], states: teamsIn(mail[2]).map(id => byId[id])}));
  // The digests now list the teams whose TitleLog status is waiting for the guide (NEEDS_REVIEW) or for the reviewers (AWAITING_REVIEWER).
  // The old rules also listed odd states (a reviewer-approved team with no Guide Decision; a guide-approved team with no title), which
  // are not titles waiting for anyone; the states that mean the same in both models must still be listed, as the snapshot recorded.
  const waiting = status => list.filter(combo => newStatusOf(combo) === status).map(combo => combo.id);
  const recordedGuide = JSON.parse(fs.readFileSync('tests/title-baseline/snapshots/digests.json', 'utf8')).guideReminder[0].states;
  const recordedReviewer = JSON.parse(fs.readFileSync('tests/title-baseline/snapshots/digests.json', 'utf8')).reviewerApproval[0].states;
  assert.deepEqual(describe(guideMails), [{to: 'guide@example.com', subject: 'Reminder: ' + waiting('NEEDS_REVIEW').length + ' title(s) awaiting your review', states: waiting('NEEDS_REVIEW')}]);
  assert.deepEqual(describe(reviewerMails).map(mail => mail.to), ['rev1@example.com', 'rev2@example.com']);
  for (const mail of describe(reviewerMails)) assert.deepEqual(mail.states, waiting('AWAITING_REVIEWER'));
  assert.ok(recordedGuide.includes('title=yes guide=- reviewer=-') && waiting('NEEDS_REVIEW').includes('title=yes guide=- reviewer=-'));
  assert.ok(recordedReviewer.includes('title=yes guide=Approved reviewer=-') && waiting('AWAITING_REVIEWER').includes('title=yes guide=Approved reviewer=-'));
});

test('the baselines are recorded for every area, and none is empty', () => {
  const dir = require('node:path').join(__dirname, 'title-baseline', 'snapshots');
  for (const name of ['status', 'weekly', 'review-marking', 'eligibility', 'coordinator', 'digests']) {
    const file = require('node:path').join(dir, name + '.json');
    assert.ok(fs.existsSync(file), name + ' baseline is missing');
    assert.ok(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).length > 0, name + ' baseline is empty');
  }
});
