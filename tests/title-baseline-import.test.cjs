// importTitleBaseline (title-baseline-import.js): cutover step 4. TeamStatus -> one BASELINE row per team in TitleLog.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { HEADERS, sheetRow, makeTitleEnv } = require('./title-sheet-fixture.cjs');
const { history, NOW, HOUR } = require('./title-fixtures.cjs');

const TS = {TEAM_ID: 0, SEMESTER: 1, GUIDE_EMAIL: 2, TITLE: 3, PROBLEM: 4, GUIDE_DECISION: 5, REVIEWER_DECISION: 6, GUIDE_NOTES: 7, REVIEWER_NOTES: 8, SIMILARITY_FLAG: 9, TITLE_APPROVED_BY: 10};
const team = (id, fields = {}) => {
  const row = Array(11).fill('');
  Object.assign(row, [id, 'Odd', 'guide@x.edu', '', '', '', '', '', '', '', '']);
  Object.entries(fields).forEach(([key, value]) => { row[TS[key]] = value; });
  return row;
};
const APPROVED_AT = new Date(NOW - 5 * 24 * HOUR);
const registry = id => ['2026-27', 'Odd', id, 'guide@x.edu', 'GOOD TITLE', '', '', APPROVED_AT, 'rev@x.edu'];

function setup({cutover = 'PAUSED', teams = [], registryRows = [], existing = []} = {}) {
  const lock = {held: false, releases: 0, waits: 0};
  const properties = {TITLE_CUTOVER: cutover};
  const env = makeTitleEnv([HEADERS, ...existing.map(sheetRow)], {
    files: ['title-cutover.js', 'title-baseline-import.js'],
    globals: {
      LockService: {getScriptLock: () => ({waitLock() { lock.waits++; lock.held = true; }, releaseLock() { lock.releases++; lock.held = false; }})},
      PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key] === undefined ? null : properties[key]})},
      Session: {getActiveUser: () => ({getEmail: () => 'coord@x.edu'})}
    }
  });
  const c = env.context;
  c.requireTriggerOrOperator_ = () => {};
  c.getColumnMap_ = () => TS;
  c.getSheetRows_ = () => teams;
  c.SHEET_NAMES = {TEAM_STATUS: 'TeamStatus'};
  c.FIELD_DEFINITIONS = {TEAM_STATUS: {}};
  const registrySheet = {};
  const realRead = c.readSheetRows_;
  c.getHubRegistrySheet_ = () => registrySheet;
  c.readSheetRows_ = (sheet, ...rest) => sheet === registrySheet ? registryRows : realRead(sheet, ...rest);
  c.getAcademicYear_ = () => '2026-27';
  return {env, c, lock, properties};
}

test('every roster team gets one BASELINE row with the status the old model gave it', () => {
  const teams = [
    team('T1'),
    team('T2', {TITLE: 'FIRST', PROBLEM: 'p2', SIMILARITY_FLAG: '60% similar to "X"'}),
    team('T3', {TITLE: 'SECOND', PROBLEM: 'p3', GUIDE_DECISION: 'Approved'}),
    team('T4', {TITLE: 'THIRD', PROBLEM: 'p4', GUIDE_DECISION: 'Rejected', GUIDE_NOTES: 'Too broad'}),
    team('T5', {TITLE: 'FOURTH', PROBLEM: 'p5', GUIDE_DECISION: 'Approved', REVIEWER_DECISION: 'Revise', REVIEWER_NOTES: 'Narrow it', GUIDE_NOTES: 'ignored'}),
    team('T6', {TITLE: 'GOOD TITLE', PROBLEM: 'p6', GUIDE_DECISION: 'Approved', REVIEWER_DECISION: 'Approved', TITLE_APPROVED_BY: 'rev@x.edu'})
  ];
  const { env, c, lock } = setup({teams, registryRows: [registry('T6')]});
  const report = JSON.parse(JSON.stringify(c.importTitleBaseline()));
  assert.deepEqual({written: report.written, skipped: report.skipped, problems: report.problems, invalid: report.invalid}, {written: 6, skipped: [], problems: [], invalid: []});
  const rows = c.readTitleLog_().rows;
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(r => [r.teamId, r.status]))), [['T1', 'NOT_SUBMITTED'], ['T2', 'NEEDS_REVIEW'], ['T3', 'AWAITING_REVIEWER'], ['T4', 'RETURNED'], ['T5', 'RETURNED'], ['T6', 'APPROVED']]);
  assert.ok(rows.every(r => r.action === 'BASELINE' && r.revision === 1 && r.actor === 'coord@x.edu' && r.requestId === 'baseline:' + r.teamId && r.fingerprint === '' && r.reopened === false));
  assert.deepEqual([rows[0].title, rows[0].problem], ['', '']);
  assert.deepEqual([rows[1].title, rows[1].problem, rows[1].similarityNote], ['FIRST', 'p2', '60% similar to "X"']);
  assert.equal(rows[3].notes, 'Too broad', 'a guide return keeps the guide\'s note');
  assert.equal(rows[4].notes, 'Narrow it', 'a reviewer return keeps the reviewer\'s note');
  assert.deepEqual([rows[5].approvedTitle, rows[5].approvedProblem, rows[5].approvedBy, rows[5].approvedAt], ['GOOD TITLE', 'p6', 'rev@x.edu', APPROVED_AT.getTime()]);
  assert.equal(c.titleGate_('T6', c.readTitleIndex_()).approved, true);
  assert.equal(c.titleGate_('T6', c.readTitleIndex_()).approvedAt.getTime(), APPROVED_AT.getTime());
  assert.equal(env.calls.setValues.length, 1, 'one batch');
  assert.deepEqual([lock.waits, lock.releases], [1, 1]);
});

test('it runs only while the cutover is PAUSED and writes nothing otherwise', () => {
  for (const cutover of ['', 'LIVE', 'bogus']) {
    const { env, c, lock } = setup({cutover, teams: [team('T1')]});
    assert.throws(() => c.importTitleBaseline(), /setTitleCutover\('PAUSED'\) first/);
    assert.equal(env.calls.setValues.length, 0);
    assert.equal(lock.releases, 1, 'the lock is released');
  }
  assert.throws(() => setup({cutover: 'LIVE', teams: []}).c.importTitleBaseline(), /already LIVE/);
});

test('a team that already has rows is skipped, so the import can be run again', () => {
  const { env, c } = setup({teams: [team('T1'), team('T2', {TITLE: 'X', PROBLEM: 'p'})], existing: history(['BASELINE:NEEDS_REVIEW'], {teamId: 't1 ', start: NOW - 10 * HOUR})});
  const report = JSON.parse(JSON.stringify(c.importTitleBaseline()));
  assert.deepEqual([report.written, report.skipped], [1, ['T1']]);
  assert.equal(c.readTitleLog_().rows.length, 2);
  const again = JSON.parse(JSON.stringify(c.importTitleBaseline()));
  assert.deepEqual([again.written, again.skipped], [0, ['T1', 'T2']]);
  assert.equal(env.calls.setValues.length, 1);
});

test('an approved team without a matching registry date, or without an approver, is reported and not written', () => {
  const approved = id => team(id, {TITLE: 'GOOD TITLE', PROBLEM: 'p', GUIDE_DECISION: 'Approved', REVIEWER_DECISION: 'Approved', TITLE_APPROVED_BY: 'rev@x.edu'});
  const { c } = setup({
    teams: [approved('T1'), approved('T2'), {...approved('T3'), 10: ''}, approved('T4'), team('T5', {TITLE: 'N', PROBLEM: 'p'})],
    registryRows: [registry('T1'), ['2025-26', 'Odd', 'T2', 'guide@x.edu', 'GOOD TITLE', '', '', APPROVED_AT, 'rev@x.edu'], registry('T3'), ['2026-27', 'Odd', 'T4', 'guide@x.edu', 'GOOD TITLE', '', '', new Date(NOW + 10 * HOUR), 'rev@x.edu']]
  });
  const report = JSON.parse(JSON.stringify(c.importTitleBaseline()));
  assert.equal(report.written, 2);
  assert.deepEqual(report.problems.map(p => p.teamId), ['T2', 'T3', 'T4']);
  assert.match(report.problems[0].message, /no matching approval date/);
  assert.match(report.problems[1].message, /approving reviewer is not recorded|no matching approval date/);
  assert.match(report.problems[2].message, /in the future/);
  assert.deepEqual(JSON.parse(JSON.stringify(c.readTitleLog_().rows.map(r => r.teamId))), ['T1', 'T5']);
});

test('a team listed twice is reported once and written once; a blank Team ID is ignored', () => {
  const { c } = setup({teams: [team('T1'), team(' t1'), team('')]});
  const report = JSON.parse(JSON.stringify(c.importTitleBaseline()));
  assert.equal(report.written, 1);
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0].message, /more than once/);
});

test('the registry date needs the year, semester and team; the guide, title and approver are checked and reported when they differ', () => {
  const approved = team('T1', {TITLE: 'GOOD TITLE', PROBLEM: 'p', GUIDE_DECISION: 'Approved', REVIEWER_DECISION: 'Approved', TITLE_APPROVED_BY: 'rev@x.edu'});
  const base = registry('T1');
  // The year, the semester and the team must match: a different one is a different registry row, so there is no date.
  for (const [at, value] of [[0, '2025-26'], [1, 'Even'], [2, 'T9']]) {
    const record = base.slice(); record[at] = value;
    const { c } = setup({teams: [approved], registryRows: [record]});
    assert.equal(JSON.parse(JSON.stringify(c.importTitleBaseline())).problems.length, 1, 'column ' + at);
  }
  // The guide, the title and the approver may differ in text: the date is used and the team is listed to be checked.
  for (const [at, value] of [[3, 'other@x.edu'], [4, 'OTHER TITLE'], [8, 'other@x.edu']]) {
    const record = base.slice(); record[at] = value;
    const { c } = setup({teams: [approved], registryRows: [record]});
    const report = JSON.parse(JSON.stringify(c.importTitleBaseline()));
    assert.deepEqual([report.written, report.problems.length, report.relaxed], [1, 0, ['T1']], 'column ' + at);
  }
  // Case and surrounding spaces in the title are not a difference at all.
  const spaced = base.slice(); spaced[4] = '  good title ';
  const spacedRun = setup({teams: [approved], registryRows: [spaced]});
  assert.deepEqual(JSON.parse(JSON.stringify(spacedRun.c.importTitleBaseline())).relaxed, []);
  const later = base.slice(); later[7] = new Date(NOW - 2 * 24 * HOUR);
  const { c } = setup({teams: [approved], registryRows: [base, later]});
  c.importTitleBaseline();
  assert.equal(c.readTitleLog_().rows[0].approvedAt, later[7].getTime(), 'the last matching registry row wins, as the old eligibility code did');
});

test('source rules: it is the only runtime reader of the old columns, starts with the guard, and writes only to TitleLog', () => {
  const text = fs.readFileSync('title-baseline-import.js', 'utf8');
  const body = text.slice(text.indexOf('function importTitleBaseline'));
  assert.equal(body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim(), 'requireTriggerOrOperator_();');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, ['importTitleBaseline']);
  assert.doesNotMatch(text, /MailApp|setRepoUrl|updateTeamStatus|setStatusFields_|appendRow/);
});
