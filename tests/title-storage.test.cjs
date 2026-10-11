// setupTitleStorage and the log report (title-storage.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { HOUR, T0, NOW, history } = require('./title-fixtures.cjs');
const { HEADERS, sheetRow, makeTitleEnv } = require('./title-sheet-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const env = makeTitleEnv([HEADERS], {files: ['title-cutover.js', 'activity-dependencies-sheet.js', 'title-storage.js']});
const c = env.context;
const report = (rows, roster, live = false) => plain(c.titleLogReport_(rows, roster, NOW, live));

test('setupTitleStorage calls the guard first, then creates TitleLog and ActivityDependencies in setup mode', () => {
  const order = [], specs = [];
  const loaded = makeTitleEnv([HEADERS], {files: ['activity-dependencies-sheet.js', 'title-storage.js']}).context;
  loaded.requireTriggerOrOperator_ = () => order.push('guard');
  loaded.ensureSheet_ = spec => { order.push('ensure ' + spec.name); specs.push(spec); return {created: true, repaired: []}; };
  const result = plain(loaded.setupTitleStorage());
  assert.deepEqual(order, ['guard', 'ensure TitleLog', 'ensure ActivityDependencies']);
  assert.deepEqual(result, {titleLog: {created: true, repaired: []}, activityDependencies: {created: true, repaired: []}});
  assert.deepEqual(specs.map(spec => spec.mode), ['setup', 'setup']);
  assert.deepEqual(plain(specs[0].headers), HEADERS);
  assert.equal(specs[0].access, 'view');
  assert.equal(specs[0].createAtRuntime, false);
  assert.equal(specs[0].onCreate, loaded.formatTitleLogSheet_);
  const denied = makeTitleEnv([HEADERS], {files: ['activity-dependencies-sheet.js', 'title-storage.js']}).context;
  denied.requireTriggerOrOperator_ = () => { throw new Error('Coordinator access is required.'); };
  denied.ensureSheet_ = () => { throw new Error('must not be reached'); };
  assert.throws(() => denied.setupTitleStorage(), /Coordinator access is required/);
});

test('the TitleLog sheet is created with a frozen header row', () => {
  const frozen = [];
  c.formatTitleLogSheet_({setFrozenRows: count => frozen.push(count)});
  assert.deepEqual(frozen, [1]);
});

test('a complete, valid log gives an ok report with no errors', () => {
  const rows = [...history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T1'}), ...history(['SUBMIT'], {teamId: 'T2'})];
  const result = report(rows, ['T1', 'T2'], true);
  assert.deepEqual(result, {ok: true, live: true, rows: 4, rosterTeams: 2, errors: [], information: [], truncated: false});
});

test('a roster team with no row is an error before LIVE and information after it', () => {
  const rows = history(['SUBMIT'], {teamId: 'T1'});
  const before = report(rows, ['T1', 'T2', ' t3 ']);
  assert.equal(before.ok, false);
  assert.deepEqual(before.errors.map(e => [e.kind, e.teamId]), [['NO_ROW', 'T2'], ['NO_ROW', 't3']]);
  assert.deepEqual(before.information, []);
  const after = report(rows, ['T1', 'T2'], true);
  assert.equal(after.ok, true);
  assert.deepEqual(after.information.map(e => [e.kind, e.teamId]), [['NO_ROW', 'T2']]);
});

test('a team in the log that is not on the roster is an error, matched ignoring case and spaces', () => {
  const rows = [...history(['SUBMIT'], {teamId: 'T1'}), ...history(['SUBMIT'], {teamId: 'T9'})];
  const result = report(rows, [' t1 ']);
  assert.deepEqual(result.errors.map(e => [e.kind, e.teamId]), [['NOT_ON_ROSTER', 'T9']]);
});

test('a team with an invalid history is reported with the reasons, and other teams are unaffected', () => {
  const bad = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T2'}).map(r => r.revision === 3 ? {...r, approvedBy: 'nobody@example.com'} : r);
  const rows = [...history(['SUBMIT'], {teamId: 'T1'}), ...bad];
  const result = report(rows, ['T1', 'T2'], true);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 1 && result.errors.every(e => e.kind === 'INVALID_HISTORY' && e.teamId === 'T2'));
});

test('an approved baseline without Approved At is reported', () => {
  const rows = history(['BASELINE:APPROVED'], {teamId: 'T1'}).map(r => ({...r, approvedAt: null}));
  const result = report(rows, ['T1'], true);
  assert.ok(result.errors.some(e => e.kind === 'APPROVED_WITHOUT_DATE' && e.teamId === 'T1' && /row 2/.test(e.message)));
});

test('each list is capped at 200 and truncated says so', () => {
  const roster = Array.from({length: 250}, (_, i) => 'R' + i);
  const result = report([], roster);
  assert.equal(result.errors.length, 200);
  assert.equal(result.truncated, true);
});

test('the report changes nothing: no writes, one read', () => {
  const rows = history(['SUBMIT'], {teamId: 'T1'});
  const sheetEnv = makeTitleEnv([HEADERS, ...rows.map(sheetRow)], {files: ['title-cutover.js', 'title-storage.js']});
  const result = plain(sheetEnv.context.titleLogReport_(sheetEnv.context.readTitleLog_().rows, ['T1'], NOW, true));
  assert.equal(result.ok, true);
  assert.equal(sheetEnv.calls.reads, 1);
  assert.equal(sheetEnv.calls.setValues.length, 0);
});

test('the endpoint is coordinator-only and reads the roster and the cutover', () => {
  const text = fs.readFileSync('title-storage.js', 'utf8');
  assert.match(text, /function API_coordinator_validateTitleLog\(\) \{\s*return apiHandle_\(\(\) => \{ coordinatorAccessOrThrow_\(\);/);
  const rows = history(['SUBMIT'], {teamId: 'T1'});
  const sheetEnv = makeTitleEnv([HEADERS, ...rows.map(sheetRow)], {files: ['title-cutover.js', 'title-storage.js']});
  const g = sheetEnv.context;
  g.coordinatorAccessOrThrow_ = () => {};
  g.getColumnMap_ = () => ({TEAM_ID: 0});
  g.getSheetRows_ = () => [['T1'], ['T2'], ['']];
  g.SHEET_NAMES = {TEAM_STATUS: 'TeamStatus'};
  g.FIELD_DEFINITIONS = {TEAM_STATUS: {}};
  g.readTitleCutover_ = () => 'LIVE';
  const frame = JSON.parse(g.API_coordinator_validateTitleLog());
  assert.equal(frame.ok, true);
  assert.deepEqual(frame.data.information.map(e => e.teamId), ['T2']);
  g.coordinatorAccessOrThrow_ = () => { throw g.apiFail_('UNAUTHORIZED', 'No.'); };
  assert.equal(JSON.parse(g.API_coordinator_validateTitleLog()).error.code, 'UNAUTHORIZED');
});

test('validateTitleLog is the editor-run twin of the endpoint: it logs the report and starts with the guard', () => {
  const text = fs.readFileSync('title-storage.js', 'utf8');
  const body = text.slice(text.indexOf('function validateTitleLog'));
  assert.equal(body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim(), 'requireTriggerOrOperator_();');
  const rows = history(['SUBMIT'], {teamId: 'T1'});
  const sheetEnv = makeTitleEnv([HEADERS, ...rows.map(sheetRow)], {files: ['title-cutover.js', 'title-storage.js']});
  const g = sheetEnv.context, logged = [];
  g.requireTriggerOrOperator_ = () => {};
  g.console = {log: line => logged.push(line), error() {}};
  g.getColumnMap_ = () => ({TEAM_ID: 0});
  g.getSheetRows_ = () => [['T1'], ['T2']];
  g.SHEET_NAMES = {TEAM_STATUS: 'TeamStatus'};
  g.FIELD_DEFINITIONS = {TEAM_STATUS: {}};
  g.readTitleCutover_ = () => '';
  const report = JSON.parse(JSON.stringify(g.validateTitleLog()));
  assert.equal(report.ok, false);
  assert.deepEqual(report.errors.map(e => [e.kind, e.teamId]), [['NO_ROW', 'T2']]);
  assert.deepEqual(JSON.parse(logged[0]), report);
});

test('source rules: the public functions are setupTitleStorage and validateTitleLog, and setup starts with the guard', () => {
  const text = fs.readFileSync('title-storage.js', 'utf8');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_') && !name.startsWith('API_'));
  assert.deepEqual(publicFunctions, ['setupTitleStorage', 'validateTitleLog']);
  const body = text.slice(text.indexOf('function setupTitleStorage'));
  assert.equal(body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim(), 'requireTriggerOrOperator_();');
});
