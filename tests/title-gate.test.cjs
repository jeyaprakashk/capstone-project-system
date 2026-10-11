// titleGate_ and the per-team state (title-gate.js): the one answer "does this team have an approved title?".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { HOUR, T0, NOW, history } = require('./title-fixtures.cjs');
const { HEADERS, sheetRow, makeTitleEnv } = require('./title-sheet-fixture.cjs');

const env = makeTitleEnv([HEADERS]);
const c = env.context;
const plain = value => JSON.parse(JSON.stringify(value));
const indexOf = (...histories) => c.titleIndex_(histories.flat(), NOW);
const gate = (steps, options) => plain(c.titleGate_('T1', indexOf(history(steps, options))));

test('a team with no rows is NOT_SUBMITTED, with an empty pair and no approval', () => {
  assert.deepEqual(plain(c.titleGate_('T1', indexOf([]))), {approved: false, title: '', problem: '', approvedAt: null});
  const state = plain(c.titleStateFromIndex_(indexOf([]), 'T1'));
  assert.equal(state.status, 'NOT_SUBMITTED');
  assert.equal(state.revision, 0);
  assert.equal(state.approved.value, false);
  assert.equal(state.reopen, null);
});

test('before approval the gate shows the current proposal and approved is false', () => {
  for (const steps of [['SUBMIT'], ['SUBMIT', 'GUIDE_APPROVE'], ['SUBMIT', 'RETURN'], ['BASELINE:NEEDS_REVIEW'], ['BASELINE:AWAITING_REVIEWER'], ['BASELINE:RETURNED']]) {
    const result = gate(steps);
    assert.equal(result.approved, false, steps.join(' > '));
    assert.equal(result.approvedAt, null);
    assert.ok(result.title.length > 0 && result.problem.length > 0);
  }
  assert.equal(gate(['SUBMIT', {action: 'GUIDE_APPROVE', title: 'GUIDE EDITED'}]).title, 'GUIDE EDITED', 'the pair follows the proposal, including a guide edit');
  assert.equal(gate(['BASELINE']).title, '');
});

test('after the first final approval the gate shows the approved pair and its date', () => {
  const rows = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  const result = plain(c.titleGate_('T1', indexOf(rows)));
  assert.deepEqual(result, {approved: true, title: 'A TITLE', problem: 'A problem statement', approvedAt: new Date(T0 + 2 * HOUR).toISOString()});
  assert.ok(c.titleGate_('T1', indexOf(rows)).approvedAt instanceof Object);
  assert.equal(c.titleGate_('T1', indexOf(rows)).approvedAt.getTime(), T0 + 2 * HOUR);
});

test('reopening keeps approved true and keeps the approved pair in effect, with the same date', () => {
  const steps = ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', {action: 'SUBMIT', title: 'A NEW IDEA', problem: 'A new problem'}, 'GUIDE_APPROVE'];
  const approvedDate = new Date(T0 + 2 * HOUR).toISOString();
  for (const take of [4, 5, 6]) {
    const result = gate(steps.slice(0, take));
    assert.equal(result.approved, true, 'rows ' + take);
    assert.equal(result.title, 'A TITLE', 'the effective title is the approved one during a reopening');
    assert.equal(result.problem, 'A problem statement');
    assert.equal(result.approvedAt, approvedDate, 'reopening can never shift the date');
  }
  const state = plain(c.titleStateFromIndex_(indexOf(history(steps.slice(0, 5))), 'T1'));
  assert.equal(state.status, 'NEEDS_REVIEW');
  assert.equal(state.reopened, true);
  assert.equal(state.proposal.title, 'A NEW IDEA', 'the title panel can still show the proposal');
  assert.equal(state.approved.title, 'A TITLE');
  assert.deepEqual(state.reopen, {reason: 'Reopened for a change.', by: 'coordinator@example.com', at: T0 + 3 * HOUR});
});

test('a new approval replaces the title and problem but never the date; a cancelled reopening restores the pair', () => {
  const replaced = gate(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', {action: 'SUBMIT', title: 'SECOND TITLE', problem: 'Second problem'}, 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  assert.equal(replaced.title, 'SECOND TITLE');
  assert.equal(replaced.problem, 'Second problem');
  assert.equal(replaced.approvedAt, new Date(T0 + 2 * HOUR).toISOString());
  const cancelled = gate(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', {action: 'SUBMIT', title: 'OTHER', problem: 'Other'}, 'CANCEL_REOPEN']);
  assert.equal(cancelled.title, 'A TITLE');
  assert.equal(cancelled.approved, true);
  const state = plain(c.titleStateFromIndex_(indexOf(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'CANCEL_REOPEN'])), 'T1'));
  assert.equal(state.reopened, false);
  assert.equal(state.reopen, null);
  assert.equal(state.status, 'APPROVED');
});

test('an approved legacy baseline with a blank problem gives a blank problem and its own date', () => {
  const result = gate(['BASELINE:APPROVED'], {baselineProblem: ''});
  assert.equal(result.approved, true);
  assert.equal(result.title, 'BASE TITLE');
  assert.equal(result.problem, '');
  assert.equal(result.approvedAt, new Date(T0 - HOUR).toISOString());
});

test('a team whose history is not valid is UNAVAILABLE, only that team, and the report is logged', () => {
  const good = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T1'});
  const bad = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T2'}).map(r => r.revision === 3 ? {...r, approvedBy: 'nobody@example.com'} : r);
  const index = indexOf(good, bad);
  assert.equal(c.titleGate_('T1', index).approved, true, 'one bad team does not affect the others');
  const logged = [];
  const quiet = makeTitleEnv([HEADERS], {console: {error: m => logged.push(m), log() {}}});
  const qIndex = quiet.context.titleIndex_([...good, ...bad], NOW);
  assert.throws(() => quiet.context.titleGate_('T2', qIndex), error => error.apiCode === 'UNAVAILABLE' && /history of team T2 is unavailable/.test(error.message));
  assert.match(logged.join(' '), /Title history for team T2 is not valid/);
  const tried = plain(c.titleTryState_(index, 'T2'));
  assert.match(tried.error, /unavailable/);
  assert.equal(plain(c.titleTryState_(index, 'T1')).state.status, 'APPROVED');
});

test('teams are matched ignoring case and surrounding spaces', () => {
  const index = indexOf(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T1'}));
  assert.equal(c.titleGate_(' t1 ', index).approved, true);
  assert.equal(c.titleGate_('T10', index).approved, false);
});

test('reading: one read of the sheet, and the index gives every team without another read', () => {
  const rows = [...history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T1'}), ...history(['SUBMIT'], {teamId: 'T2'})];
  const sheetEnv = makeTitleEnv([HEADERS, ...rows.map(sheetRow)]);
  const index = sheetEnv.context.readTitleIndex_();
  assert.equal(sheetEnv.calls.reads, 1);
  assert.equal(sheetEnv.context.titleGate_('T1', index).approved, true);
  assert.equal(sheetEnv.context.titleGate_('T2', index).approved, false);
  assert.equal(sheetEnv.context.titleGate_('T3', index).approved, false);
  assert.equal(sheetEnv.calls.reads, 1, 'no further reads');
  assert.equal(sheetEnv.context.titleGate_('T1').approved, true, 'without an index it reads the log once itself');
  assert.equal(sheetEnv.calls.reads, 2);
});

test('the clock is read when the log is read: a row dated in the future makes that team UNAVAILABLE', () => {
  const rows = history(['SUBMIT'], {teamId: 'T1', start: NOW + 5 * HOUR});
  const sheetEnv = makeTitleEnv([HEADERS, ...rows.map(sheetRow)]);
  assert.throws(() => sheetEnv.context.titleGate_('T1'), error => error.apiCode === 'UNAVAILABLE');
  sheetEnv.setNow(NOW + 10 * HOUR);
  assert.equal(sheetEnv.context.titleGate_('T1').title, 'A TITLE');
});

test('the four states that mean the same in both models answer as the old status mapping did', () => {
  // Phase 0 baseline: NOT_SUBMITTED, NEEDS_REVIEW, AWAITING_REVIEWER and APPROVED (tests/title-baseline/snapshots/status.json).
  const baseline = JSON.parse(fs.readFileSync('tests/title-baseline/snapshots/status.json', 'utf8'));
  assert.equal(baseline['title=no guide=- reviewer=-'], 'NOT_SUBMITTED');
  assert.equal(baseline['title=yes guide=- reviewer=-'], 'NEEDS_REVIEW');
  assert.equal(baseline['title=yes guide=Approved reviewer=-'], 'AWAITING_REVIEWER');
  assert.equal(baseline['title=yes guide=- reviewer=Approved'], 'APPROVED');
  const answers = {
    NOT_SUBMITTED: c.titleGate_('T1', indexOf([])).approved,
    NEEDS_REVIEW: gate(['SUBMIT']).approved,
    AWAITING_REVIEWER: gate(['SUBMIT', 'GUIDE_APPROVE']).approved,
    APPROVED: gate(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']).approved
  };
  assert.deepEqual(answers, {NOT_SUBMITTED: false, NEEDS_REVIEW: false, AWAITING_REVIEWER: false, APPROVED: true});
});

test('source rules: the gate never writes and has no public function', () => {
  const text = fs.readFileSync('title-gate.js', 'utf8');
  assert.doesNotMatch(text, /setValues|appendRow|LockService|MailApp|SpreadsheetApp/);
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
});
