// The proof that these sheets are read and written by header name (AGENTS.md, "Sheet access"): the real code runs on a sheet whose
// columns are in the reverse order and that has an extra column in the middle, and must give the same answer as on the normal layout.
// A function that reached a column by its number would give a different answer, whatever the number was held in.
// Sheets with their own shuffled tests (CommitCollectionStatus, GitHubAccounts, Config, Commits, the assessment journals) are in
// commit-collection, github-identity, spreadsheet-resolution and guide-evaluation tests.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {weeklyFixture} = require('./weekly-progress-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));

/** Reverse the order of every row and add a column nobody maps in the middle. Works on a fixture sheet in place. */
function shuffle(sheet) {
  sheet.rows.forEach((row, index) => {
    row.reverse();
    row.splice(Math.floor(row.length / 2), 0, index ? 'extra value' : 'Extra');
  });
  return sheet;
}

/** The same question asked of the normal layout and of the shuffled one. */
function sameAnswer(prepare, ask) {
  const normal = weeklyFixture(), moved = weeklyFixture();
  [normal, moved].forEach(prepare);
  return {normal: plain(ask(normal)), moved: plain(ask(moved))};
}

function bothWays(prepareNormal, prepareShuffled, ask) {
  const normal = weeklyFixture(), moved = weeklyFixture();
  prepareNormal(normal);
  prepareShuffled(moved);
  return {normal: plain(ask(normal)), moved: plain(ask(moved))};
}

test('TeamStatus: team facts are the same on a shuffled sheet', () => {
  const {normal, moved} = bothWays(() => {}, f => shuffle(f.sheets.get('TeamStatus')), f => {
    f.time('2026-01-06T00:00:00Z');
    const columns = f.c.getColumnMap_('TeamStatus', vm.runInContext('FIELD_DEFINITIONS.TEAM_STATUS', f.c));
    const rows = f.c.getSheetRows_('TeamStatus');
    return {teams: rows.map(row => row[columns.TEAM_ID]), emails: rows.map(row => row[columns.S1_EMAIL]), repo: f.c.getRepoUrlForTeam_('T1'),
      students: f.c.getStudentsFromTeamStatusRow_(rows[0], columns)};
  });
  assert.deepEqual(moved, normal);
  assert.equal(normal.teams[0], 'T1');
  assert.equal(normal.repo, 'https://github.com/org/team');
});

test('TeamRoster and WeeklyWindows and LogEntries: the weekly student, windows and progress are the same on shuffled sheets', () => {
  const ask = f => {
    f.time('2026-01-06T00:00:00Z');
    f.user('one@example.com');
    return {students: f.c.weeklyStudents_(), windows: f.c.getWeeklySubmissionWindows_(), progress: f.c.loadStudentWeeklyProgress_()};
  };
  const {normal, moved} = bothWays(() => {}, f => ['TeamRoster', 'WeeklyWindows', 'LogEntries', 'ProgressEligibility'].forEach(name => shuffle(f.sheets.get(name))), ask);
  assert.deepEqual(moved, normal);
  assert.ok(normal.students.length >= 2);
  assert.equal(normal.windows.length, 2);
});

test('LogEntries: a submission lands under the right headers on a shuffled sheet', () => {
  const submit = f => {
    f.time('2026-01-06T00:00:00Z');
    f.user('one@example.com');
    f.c.submitWeeklyProgress_(f.input({requestId: 'request-number-1', workCompleted: 'Built the thing'}));
    return f.entries().map(({id, recordedAt, submittedAt, firstSubmittedAt, ...rest}) => rest);
  };
  const {normal, moved} = bothWays(() => {}, f => shuffle(f.sheets.get('LogEntries')), submit);
  assert.deepEqual(moved, normal);
  assert.equal(normal.length, 1);
  assert.equal(normal[0].workCompleted, 'Built the thing');
});

test('TeamStatus: a repository write lands in the Repo URL column of a shuffled sheet and leaves the rest', () => {
  const f = weeklyFixture(), sheet = shuffle(f.sheets.get('TeamStatus'));
  const header = sheet.rows[0], row = sheet.rows[1];
  const before = row.slice();
  f.c.updateTeamStatusRepoUrl_('T1', 'https://github.com/org/changed');
  const repo = header.indexOf('Repo URL');
  assert.equal(row[repo], 'https://github.com/org/changed');
  row.forEach((value, index) => { if (index !== repo) assert.equal(value, before[index], 'column ' + header[index] + ' is untouched'); });
});

for (const key of ['GuideSignoff', 'AIProgressAnalysis']) {
  test(key + ': a record is appended under the right headers and read back the same on a shuffled sheet', () => {
    const record = key === 'GuideSignoff'
      ? {id: 'S1', entryId: 'E1', status: 'DISCUSSED', guideEmail: 'guide@example.com', signedAt: '2026-01-06T00:00:00.000Z'}
      : {id: 'A1', entryId: 'E1', technical_substance: 'HIGH', specificity: 'LOW', outcome: 'MEDIUM', next_action: 'HIGH', github_support: 'LOW', score: 6, comment: 'Fine', analyzedAt: '2026-01-06T00:00:00.000Z'};
    const run = f => {
      const headers = Object.values(vm.runInContext('FIELD_DEFINITIONS.' + key, f.c));
      f.sheet(key, [headers]);
      return headers;
    };
    const {normal, moved} = bothWays(f => run(f), f => { run(f); shuffle(f.sheets.get(key)); }, f => {
      f.c.appendWeeklyPhase2_(key, record);
      return f.c.weeklyPhase2Rows_(key);
    });
    assert.deepEqual(moved, normal);
    assert.equal(normal.length, 1);
    assert.equal(normal[0].entryId, 'E1');
  });
}

test('ReviewCommittee: committee facts are the same on a shuffled sheet', () => {
  const rowFor = headers => {
    const values = {'Review Committee Number': 'C1', 'Reviewer 1 Name': 'Rev One', 'Reviewer 1 Email': 'r1@example.com', 'Reviewer 2 Name': 'Rev Two', 'Reviewer 2 Email': 'r2@example.com'};
    return headers.map(header => values[header] || '');
  };
  const add = f => {
    const headers = Object.values(vm.runInContext('FIELD_DEFINITIONS.REVIEW_COMMITTEE', f.c));
    f.sheet('ReviewCommittee', [headers, rowFor(headers)]);
  };
  const {normal, moved} = bothWays(add, f => { add(f); shuffle(f.sheets.get('ReviewCommittee')); }, f => ({
    info: f.c.getCommitteeInfo_('C1'), numbers: f.c.getCommitteeNumbersForReviewer_('r2@example.com')
  }));
  assert.deepEqual(moved, normal);
  assert.equal(normal.info.reviewer2Email, 'r2@example.com');
  assert.deepEqual(normal.numbers, ['C1']);
});

// The configuration sheets are parsed from the rows as read, so the same rows are shuffled before parsing.
function shuffledRows(rows) {
  return rows.map((row, index) => {
    const copy = row.slice().reverse();
    copy.splice(Math.floor(copy.length / 2), 0, index ? 'extra value' : 'Extra');
    return copy;
  });
}

function configurationContext() {
  const f = weeklyFixture();
  ['assessment-registry.js', 'milestone-config.js', 'rubric-config.js', 'review-academic-policy.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), f.c, {filename: file}));
  return f.c;
}

test('AssessmentDefinitions: definitions are the same from a shuffled sheet', () => {
  const c = configurationContext();
  const headers = plain(vm.runInContext('ASSESSMENT_DEFINITION_HEADERS_', c));
  const rows = [headers,
    ['review1', 'REVIEW', 'Review 1', 1, 40, '2026-01-01', '2026-02-01', '[]', 'review-attendance-v1', ''],
    ['guide_eval', 'GUIDE_EVALUATION', 'Guide Evaluation', 2, 20, '2026-01-01', '2026-03-01', '[{"assessmentId":"review1","condition":"RECORDED"}]', 'guide-bands-v3-target-level-2', '']];
  const normal = plain(c.parseAssessmentDefinitions_(rows, 'UTC')), moved = plain(c.parseAssessmentDefinitions_(shuffledRows(rows), 'UTC'));
  assert.deepEqual(moved, normal);
  assert.deepEqual(normal.map(item => item.key), ['review1', 'guide_eval']);
});

test('Milestones: milestones are the same from a shuffled sheet', () => {
  const c = configurationContext();
  const rows = [plain(vm.runInContext('MILESTONE_HEADERS_', c)),
    ['start', 'Project Sem. Start', '2026-01-05', 'Not Applicable', ''],
    ['report', 'Report Submission', '2026-03-20', 'Not Applicable', '']];
  const normal = plain(c.parseMilestoneRows_(rows, 'UTC')), moved = plain(c.parseMilestoneRows_(shuffledRows(rows), 'UTC'));
  assert.deepEqual(moved, normal);
  assert.equal(normal.length, 2);
});

test('Rubrics: criteria are the same from a shuffled sheet', () => {
  const c = configurationContext();
  const levels = Array.from({length: 6}, (_, level) => 'Level ' + level);
  const rows = [['Assessment ID', 'Order', 'PI', 'Criterion', 'CO', 'Max Marks', 'Type', ...levels],
    ...[15, 25].map((max, i) => ['guide_eval', i + 1, 'PI' + (i + 1), 'Criterion ' + (i + 1), 'CO' + (i + 1), max, 'Individual', ...levels.map((_, level) => 'Descriptor ' + level)])];
  const definitions = [{key: 'guide_eval', label: 'Guide Evaluation', type: 'GUIDE_EVALUATION'}];
  const normal = plain(c.parseRubricRows_(rows, definitions)), moved = plain(c.parseRubricRows_(shuffledRows(rows), definitions));
  assert.deepEqual(moved, normal);
  assert.equal(normal.guide_eval.length, 2);
  assert.equal(normal.guide_eval[1].maxMarks, 25);
});

test('the shuffle really moves columns, so a position-based reader would give a different answer', () => {
  const f = weeklyFixture(), sheet = shuffle(f.sheets.get('TeamStatus'));
  assert.notEqual(sheet.rows[0][0], 'Team ID');
  assert.ok(sheet.rows[0].includes('Team ID') && sheet.rows[0].includes('Extra'));
  assert.notEqual(sheet.rows[1][0], 'T1', 'column A no longer holds the team ID');
});

test('MasterRegistry (hub spreadsheet): records are the same from a shuffled sheet; a missing or repeated used header throws', () => {
  const c = weeklyFixture().c;
  const rows = [['Academic Year', 'Semester', 'TeamID', 'Guide Email', 'Title', 'Repo URL', 'Team Members', 'Approved Date', 'Approved By'],
    ['2025-26', 'Even', 'T9', 'g@x', 'OLD TITLE', 'https://github.com/o/r', '001, 002', '2026-01-01', 'r@x'],
    ['2026-27', 'Odd', 'T1', 'g@x', 'ANOTHER', '', '', '', '']];
  const normal = plain(c.masterRegistryRecords_(rows)), moved = plain(c.masterRegistryRecords_(shuffledRows(rows)));
  assert.deepEqual(moved, normal);
  assert.deepEqual(normal[0], {academicYear: '2025-26', semester: 'Even', teamId: 'T9', title: 'OLD TITLE'});
  assert.throws(() => c.masterRegistryRecords_([['Academic Year', 'Semester', 'Team ID', 'Title'], ['a', 'b', 'c', 'd']]), /Missing: TeamID/);
  assert.throws(() => c.masterRegistryRecords_([['Academic Year', 'Semester', 'TeamID', 'Title', 'title'], ['a', 'b', 'c', 'd', 'e']]), /Duplicate header in MasterRegistry: Title/);
  assert.deepEqual(plain(c.masterRegistryRecords_([['Title', 'TeamID', 'Semester', 'Academic Year']])), [], 'a registry with no rows is empty, not an error');
});
