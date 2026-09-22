const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(guideDecision = '', reviewerDecision = 'Revise') {
  // Actual workbook order: Reviewer Notes is Y, Reviewer Decision is Z.
  const TS = { TEAM_ID:0, GUIDE_EMAIL:3, S1_EMAIL:6, S2_EMAIL:9,
    S3_EMAIL:12, S4_EMAIL:15, TITLE:17, PROBLEM:18,
    WORK_BREAKDOWN_LINK:19, NEED_ANALYSIS_LINK:20, SIMILARITY_FLAG:21,
    GUIDE_DECISION:22, GUIDE_NOTES:23, REVIEWER_NOTES:24, REVIEWER_DECISION:25 };
  const row = Array(28).fill('');
  Object.entries({ TEAM_ID:'G4', GUIDE_EMAIL:'guide@example.com', S1_EMAIL:'student@example.com',
    TITLE:'OLD TITLE', GUIDE_DECISION:guideDecision, REVIEWER_DECISION:reviewerDecision,
    REVIEWER_NOTES:'Add numerical background data.' }).forEach(([key, value]) => row[TS[key]] = value);
  const emails = [], writes = [];
  const sheet = {
    getLastColumn:() => row.length,
    getRange:(_r, col, _n = 1, width = 1) => ({
      getValues:() => [row.slice(col - 1, col - 1 + width)],
      getValue:() => row[col - 1],
      setValue:value => { row[col - 1] = value; writes.push(value); }
    }),
    getDataRange:() => ({ getValues:() => [[], row.slice()] })
  };
  const c = createSheetReadContext({
    getCoordinatorEmail:() => 'coordinator@example.com', getAcademicYear:() => '2026', getConfig:() => '',
    SHEET_NAMES:{ TEAM_INTAKE_RAW:'TeamIntakeRaw', TEAM_STATUS:'TeamStatus' },
    FIELD_DEFINITIONS:{ TEAM_STATUS:{} }, getColumnMap:() => TS,
    textEquals_:(a,b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(),
    normalizeEmail:s => String(s).trim().toLowerCase(), driveFileUrl:s => s,
    requireTeamGithubReady_:() => {}, getSheet:() => sheet, findTeamStatusRow:() => 2,
    MailApp:{ sendEmail:(...args) => emails.push(args) },
    getHubRegistrySheet:() => ({ getDataRange:() => ({ getValues:() => [[]] }) }),
    setStatusFields:(_sheet, _row, fields) => {
      writes.push(fields);
      Object.entries(fields).forEach(([key,value]) => row[TS[key]] = value);
    }, getDashboardUrl:() => 'https://example.com/dashboard'
  });
  for (const file of ['intake-approval-workflow.js', 'guide-dashboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), c);
  }
  const submit = () => c.onTeamIntakeSubmit({
    range:{ getSheet:() => ({ getName:() => 'TeamIntakeRaw' }) },
    namedValues:{ 'Email Address':['student@example.com'], 'Team ID':['G4'], 'Project Title':['Revised title'] }
  });
  return { c, row, TS, emails, writes, submit };
}

function setupGuideEdit(registryTitles = []) {
  const f = setup();
  const helpers = vm.createContext({
    PropertiesService:{ getScriptProperties:() => ({ getProperty:() => '' }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'common-helpers.js'), 'utf8'), helpers);
  f.c.similarity = helpers.similarity;
  f.c.emailsMatch = helpers.emailsMatch;
  f.c.getHubRegistrySheet = () => ({ getDataRange:() => ({ getValues:() => [
    [], ...registryTitles.map(title => ['2025', '7', 'T1', 'other@example.com', title])
  ] }) });
  return f;
}

for (const [title, percent] of [
  ['Smart Campus Monitoring', 75],
  ['Smart Campus Monitoring System', 100]
]) {
  test(`guide title edit at ${percent}% registry similarity is rejected before any changes`, () => {
    const f = setupGuideEdit(['Smart Campus Monitoring System']);
    const before = f.row.slice();
    const result = f.c.applyGuideDecision('G4', 'Approved', 'Approved notes', 'guide@example.com', title);
    assert.equal(result.ok, false);
    assert.match(result.message, new RegExp(`${percent}% similar`));
    assert.match(result.message, /Smart Campus Monitoring System/);
    assert.deepEqual(f.row, before);
    assert.equal(f.writes.length, 0);
    assert.equal(f.emails.length, 0);
  });
}

test('guide title edit below 75% saves the title, warning and decision', () => {
  const f = setupGuideEdit(['Smart Campus Monitoring System']);
  const result = f.c.applyGuideDecision('G4', 'Approved', 'Approved notes', 'guide@example.com', 'Smart Campus Monitoring Platform');
  assert.equal(result.ok, true);
  assert.equal(f.row[f.TS.TITLE], 'SMART CAMPUS MONITORING PLATFORM');
  assert.match(f.row[f.TS.SIMILARITY_FLAG], /^60% similar/);
  assert.equal(f.row[f.TS.GUIDE_DECISION], 'Approved');
  assert.equal(f.emails.length, 2);
});

test('guide title edit cannot bypass registry validation when the registry is unavailable', () => {
  const f = setupGuideEdit();
  f.c.getHubRegistrySheet = () => { throw new Error('Unavailable'); };
  const result = f.c.applyGuideDecision('G4', 'Approved', '', 'guide@example.com', 'New title');
  assert.equal(result.ok, false);
  assert.match(result.message, /Could not check the master registry/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.emails.length, 0);
});

test('reviewer revision after Reviewer Notes accepts resubmission and returns to guide review', () => {
  const f = setup();
  assert.equal(f.c.getTeamStatus(f.row), 'REVISE_AWAITING_STUDENT');
  f.submit();
  assert.equal(f.row[f.TS.TITLE], 'REVISED TITLE');
  assert.equal(f.row[f.TS.REVIEWER_DECISION], '');
  assert.equal(f.c.getTeamStatus(f.row), 'NEEDS_REVIEW');
  assert.equal(f.emails.length, 1);
  assert.equal(f.emails[0][0], 'guide@example.com');
  assert.match(f.emails[0][1], /New\/Updated Title Submission/);
});

test('pending guide review still prevents overwriting a submitted title', () => {
  const f = setup('', '');
  f.submit();
  assert.equal(f.writes.length, 0);
  assert.match(f.emails[0][2], /awaiting your guide's review/);
});

test('final approval after Reviewer Notes is read and protected', () => {
  const f = setup('', 'Approved');
  f.submit();
  assert.equal(f.writes.length, 0);
  assert.match(f.emails[0][2], /fully approved/);
});

test('guide rejection still permits a revised submission', () => {
  const f = setup('Rejected', '');
  f.submit();
  assert.equal(f.row[f.TS.TITLE], 'REVISED TITLE');
  assert.equal(f.c.getTeamStatus(f.row), 'NEEDS_REVIEW');
});

for (const decision of ['Revise', 'Approved']) {
  test('reviewer ' + decision + ' reads fields placed after Title Approved By', () => {
    const f = setup('Approved', '');
    f.TS.TITLE_APPROVED_BY = 1;
    f.TS.SEMESTER = 2;
    f.TS.COMMITTEE_NUMBER = 27;
    f.row[2] = '7';
    f.row[27] = '1';
    const registry = [];
    f.c.getCommitteeInfo = number => number === '1' ? { reviewer1Email:'reviewer@example.com' } : null;
    f.c.getRepoUrlForTeam = () => 'https://example.com/repo';
    f.c.getHubRegistrySheet = () => ({ appendRow:row => registry.push(row) });
    f.c.buildTeamMembersField = row => row[f.TS.S1_EMAIL];
    const result = f.c.applyReviewerDecision('G4', decision, 'Reviewer feedback', 'reviewer@example.com');
    assert.equal(result.ok, true);
    assert.equal(f.row[f.TS.REVIEWER_DECISION], decision);
    assert.equal(f.row[f.TS.REVIEWER_NOTES], 'Reviewer feedback');
    assert.match(f.emails[0][2], /OLD TITLE/);
    if (decision === 'Revise') {
      assert.equal(f.row[f.TS.GUIDE_DECISION], '');
      assert.equal(f.emails[0][0], 'guide@example.com');
      assert.equal(f.emails[1][0], 'student@example.com');
    } else {
      assert.equal(f.row[f.TS.TITLE_APPROVED_BY], 'reviewer@example.com');
      assert.equal(f.emails[0][0], 'guide@example.com,student@example.com');
      assert.equal(registry[0][1], '7');
      assert.equal(registry[0][4], 'OLD TITLE');
      assert.equal(registry[0][6], 'student@example.com');
    }
  });
}
