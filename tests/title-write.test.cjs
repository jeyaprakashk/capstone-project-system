// The title write path (title-write.js): order of checks, lock, duplicates, append recovery and mail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { HOUR, NOW } = require('./title-fixtures.cjs');
const { HEADERS, makeTitleEnv } = require('./title-sheet-fixture.cjs');

const Utilities = {
  DigestAlgorithm: {SHA_256: 'SHA_256'}, Charset: {UTF_8: 'UTF_8'},
  computeDigest: (algorithm, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest(), byte => byte > 127 ? byte - 256 : byte)
};
const plain = value => JSON.parse(JSON.stringify(value));

/** A fresh environment: a fake script lock and properties, and the real title modules. */
function setup({cutover = 'LIVE', lockFails = false, onLock = null} = {}) {
  const lockState = {held: false, waits: 0, releases: 0};
  const properties = {TITLE_CUTOVER: cutover};
  const LockService = {getScriptLock: () => ({
    hasLock: () => lockState.held,
    waitLock() { lockState.waits++; if (onLock) onLock(properties); if (lockFails) throw new Error('timeout'); lockState.held = true; },
    releaseLock() { lockState.releases++; lockState.held = false; }
  })};
  const PropertiesService = {getScriptProperties: () => ({getProperty: key => properties[key] === undefined ? null : properties[key]})};
  const env = makeTitleEnv([HEADERS], {files: ['title-cutover.js', 'title-service.js', 'title-write.js'], globals: {Utilities, LockService, PropertiesService}});
  env.context.similarity_ = () => 0;
  let tick = 0;
  env.next = () => env.setNow(NOW + (++tick) * HOUR);
  env.next();
  return {env, c: env.context, lockState, properties};
}

const ROLE = {student: {student: true}, guide: {guide: true}, reviewer: {reviewer: true}, coordinator: {coordinator: true}};
function depsFor(role, extra = {}) {
  return {
    authorize: () => ({actor: role + '@example.com', roles: ROLE[role]}),
    similarityContext: () => ({registryRows: [], academicYear: '2026-27', semester: 'Odd', others: []}),
    ...extra
  };
}
const request = (action, input, extra = {}) => ({action, teamId: 'T1', requestId: 'req-' + action, expectedRevision: 0, input, ...extra});
const SUBMIT = {title: 'Smart campus', problem: 'A real problem'};
const rowsOf = env => env.sheet.rows.slice(1);
const fails = (fn, code, pattern) => assert.throws(fn, error => error.apiCode === code && pattern.test(error.message), String(code) + ' ' + pattern);

test('a submit appends one complete row, flushes, and releases the lock', () => {
  const {env, c, lockState} = setup();
  const result = plain(c.titleWrite_(request('submit', SUBMIT), depsFor('student')));
  assert.deepEqual(result, {ok: true, revision: 1, status: 'NEEDS_REVIEW', message: 'Title submitted for guide review.'});
  assert.equal(rowsOf(env).length, 1);
  const log = c.readTitleLog_().rows[0];
  assert.deepEqual({t: log.title, p: log.problem, a: log.action, who: log.actor, id: log.requestId, rev: log.revision, st: log.status},
    {t: 'SMART CAMPUS', p: 'A real problem', a: 'SUBMIT', who: 'student@example.com', id: 'req-submit', rev: 1, st: 'NEEDS_REVIEW'});
  assert.equal(env.calls.flush, 1);
  assert.deepEqual([lockState.waits, lockState.releases, lockState.held], [1, 1, false]);
});

test('the whole workflow runs through the write path and every history stays valid', () => {
  const {env, c} = setup();
  let revision = 0;
  const step = (action, role, input) => {
    env.next();
    const result = c.titleWrite_(request(action, input, {requestId: 'r' + (revision + 1), expectedRevision: revision}), depsFor(role));
    revision = result.revision;
    return plain(result);
  };
  step('submit', 'student', SUBMIT);
  step('return', 'guide', {notes: 'Too broad'});
  step('submit', 'student', {title: 'Smart campus v2', problem: 'Narrower'});
  step('guideApprove', 'guide', {editedTitle: 'Smart campus attendance', notes: 'ok'});
  step('reviewerApprove', 'reviewer', {});
  step('reopen', 'coordinator', {reason: 'Scope change'});
  step('submit', 'student', {title: 'Another idea', problem: 'Other'});
  step('cancelReopen', 'coordinator', {reason: 'Not needed'});
  assert.equal(revision, 8);
  const gate = plain(c.titleGate_('T1', c.readTitleIndex_()));
  assert.equal(gate.approved, true);
  assert.equal(gate.title, 'SMART CAMPUS ATTENDANCE');
  assert.deepEqual(Array.from(c.validateTitleHistory_(c.readTitleLog_().rows, Date.now())), []);
});

test('while the cutover is not LIVE nothing is written, and the lock is not even requested', () => {
  for (const cutover of ['', 'PAUSED', 'bogus']) {
    const {env, c, lockState} = setup({cutover});
    fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('student')), 'UNAVAILABLE', /paused for a short update/);
    assert.equal(rowsOf(env).length, 0);
    assert.equal(lockState.waits, 0);
  }
});

test('the cutover is read again under the lock: a change after the early check stops the write', () => {
  const {env, c, lockState} = setup({onLock: properties => { properties.TITLE_CUTOVER = 'PAUSED'; }});
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('student')), 'UNAVAILABLE', /paused/);
  assert.equal(rowsOf(env).length, 0);
  assert.deepEqual([lockState.waits, lockState.releases], [1, 1], 'the lock is released on refusal');
});

test('authorization failures stop the write, before and under the lock', () => {
  const {env, c, lockState} = setup();
  const denied = () => { throw c.apiFail_('UNAUTHORIZED', 'Not your team.'); };
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('student', {authorize: denied})), 'UNAUTHORIZED', /Not your team/);
  assert.equal(lockState.waits, 0);
  let calls = 0;
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('student', {authorize: () => { if (++calls === 2) denied(); return {actor: 's@example.com', roles: ROLE.student}; }})), 'UNAUTHORIZED', /Not your team/);
  assert.equal(calls, 2, 'it is asked again under the lock');
  assert.equal(rowsOf(env).length, 0);
  assert.equal(lockState.releases, 1);
});

test('the role rules apply: wrong role is UNAUTHORIZED, wrong state is REJECTED, and nothing is written', () => {
  const {env, c} = setup();
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('guide')), 'UNAUTHORIZED', /member of this team/);
  fails(() => c.titleWrite_(request('guideApprove', {}), depsFor('guide')), 'REJECTED', /not waiting for the guide/);
  fails(() => c.titleWrite_(request('reopen', {reason: 'x'}), depsFor('coordinator')), 'REJECTED', /approved title/);
  assert.equal(rowsOf(env).length, 0);
});

test('bad input is INVALID_INPUT and takes no lock', () => {
  const {c, lockState} = setup();
  fails(() => c.titleWrite_(request('submit', {title: '""', problem: 'p'}), depsFor('student')), 'INVALID_INPUT', /project title/);
  fails(() => c.titleWrite_(request('submit', {title: 't', problem: ' '}), depsFor('student')), 'INVALID_INPUT', /problem statement/);
  fails(() => c.titleWrite_(request('explode', {}), depsFor('student')), 'INVALID_INPUT', /Unknown title action/);
  fails(() => c.titleWrite_(request('submit', SUBMIT, {teamId: ' '}), depsFor('student')), 'INVALID_INPUT', /Choose a team/);
  fails(() => c.titleWrite_(request('submit', SUBMIT, {requestId: ''}), depsFor('student')), 'INVALID_INPUT', /request ID/);
  fails(() => c.titleWrite_(request('submit', SUBMIT, {requestId: 'x'.repeat(101)}), depsFor('student')), 'INVALID_INPUT', /request ID/);
  for (const bad of [undefined, -1, 1.5, '0', null]) {
    fails(() => c.titleWrite_(request('submit', SUBMIT, {expectedRevision: bad}), depsFor('student')), 'INVALID_INPUT', /revision/);
  }
  assert.equal(lockState.waits, 0);
});

test('a stale revision is a CONFLICT and writes nothing', () => {
  const {env, c} = setup();
  c.titleWrite_(request('submit', SUBMIT), depsFor('student'));
  env.next();
  fails(() => c.titleWrite_(request('return', {notes: 'n'}, {expectedRevision: 0, requestId: 'other'}), depsFor('guide')), 'CONFLICT', /changed since you opened it/);
  assert.equal(rowsOf(env).length, 1);
});

test('a repeated request returns the stored result and writes nothing more', () => {
  const {env, c} = setup();
  const deps = depsFor('student');
  const first = plain(c.titleWrite_(request('submit', SUBMIT), deps));
  env.next();
  const again = plain(c.titleWrite_(request('submit', SUBMIT), deps));
  assert.deepEqual(again, first);
  assert.equal(rowsOf(env).length, 1);
  fails(() => c.titleWrite_(request('submit', {title: 'Different', problem: 'p'}), deps), 'CONFLICT', /different request/);
  fails(() => c.titleWrite_(request('submit', SUBMIT, {teamId: 'T2'}), deps), 'CONFLICT', /different request/);
});

test('a concurrent copy that commits while requirements are checked is not written twice', () => {
  const racing = setup();
  let wrote = false;
  const deps = depsFor('student', {unmetRequirements: () => {
    if (!wrote) { wrote = true; racing.c.titleWrite_(request('submit', SUBMIT), depsFor('student')); }
    return [];
  }});
  const result = plain(racing.c.titleWrite_(request('submit', SUBMIT), deps));
  assert.equal(rowsOf(racing.env).length, 1, 'one row, not two');
  assert.equal(result.revision, 1);
});

test('unmet requirements refuse with every item listed, outside the lock, unless a committed copy exists', () => {
  const {env, c, lockState} = setup();
  const unmet = depsFor('student', {unmetRequirements: () => ['Upload the abstract', 'Connect GitHub']});
  fails(() => c.titleWrite_(request('submit', SUBMIT), unmet), 'REJECTED', /Upload the abstract; Connect GitHub/);
  assert.equal(lockState.waits, 0);
  assert.equal(rowsOf(env).length, 0);
  // Committed while the requirements were being checked: the stored result wins over the refusal.
  const racing = setup();
  const copy = depsFor('student', {unmetRequirements: () => { racing.c.titleWrite_(request('submit', SUBMIT), depsFor('student')); return ['Gone now']; }});
  assert.equal(racing.c.titleWrite_(request('submit', SUBMIT), copy).revision, 1);
  assert.equal(rowsOf(racing.env).length, 1);
});

test('requirements are only checked for a submit that the built-in rules allow', () => {
  const {c} = setup();
  let asked = 0;
  const check = () => { asked++; return ['x']; };
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('guide', {unmetRequirements: check})), 'UNAUTHORIZED', /member of this team/);
  assert.equal(asked, 0);
  const student = setup();
  student.c.titleWrite_(request('submit', SUBMIT), depsFor('student'));
  student.env.next();
  fails(() => student.c.titleWrite_(request('submit', SUBMIT, {requestId: 'b', expectedRevision: 1}), depsFor('student', {unmetRequirements: check})), 'REJECTED', /under review/);
  assert.equal(asked, 0);
});

test('a busy lock is UNAVAILABLE "Busy, try again." and writes nothing', () => {
  const {env, c, lockState} = setup({lockFails: true});
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('student')), 'UNAVAILABLE', /Busy, try again/);
  assert.equal(rowsOf(env).length, 0);
  assert.equal(lockState.releases, 0, 'a lock never taken is not released');
});

test('a title too similar to the registry is REJECTED, and nothing is written', () => {
  const {env, c, lockState} = setup();
  c.similarity_ = () => 0.9;
  const deps = depsFor('student', {similarityContext: () => ({registryRows: [['2025-26', 'Even', 'T9', 'g', 'OLD TITLE']], academicYear: '2026-27', semester: 'Odd', others: []})});
  fails(() => c.titleWrite_(request('submit', SUBMIT), deps), 'REJECTED', /90% similar to: "OLD TITLE"/);
  assert.equal(rowsOf(env).length, 0);
  assert.equal(lockState.releases, 1);
});

test('the similarity note of a submit is stored, and an unedited guide approval is not checked', () => {
  const {env, c} = setup();
  c.similarity_ = () => 0.4;
  let contexts = 0;
  const student = depsFor('student', {similarityContext: () => { contexts++; return {registryRows: [], academicYear: 'y', semester: 's', others: [{teamId: 'T2', title: 'OTHER'}]}; }});
  c.titleWrite_(request('submit', SUBMIT), student);
  assert.match(c.readTitleLog_().rows[0].similarityNote, /40% similar to "OTHER" \(Team T2, this semester\)/);
  env.next();
  c.titleWrite_(request('guideApprove', {}, {expectedRevision: 1, requestId: 'g'}), depsFor('guide', {similarityContext: () => { contexts++; return {}; }}));
  assert.equal(contexts, 1, 'no edit, no similarity check');
});

test('if the append throws but the row was written, the write counts as successful', () => {
  const {env, c} = setup();
  const original = env.sheet.getRange;
  env.sheet.getRange = (...args) => {
    const range = original(...args);
    return {...range, setValues: values => { range.setValues(values); throw new Error('Service error'); }};
  };
  c.console = {error() {}, log() {}};
  const result = plain(c.titleWrite_(request('submit', SUBMIT), depsFor('student')));
  assert.equal(result.ok, true);
  assert.equal(rowsOf(env).length, 1);
});

test('if the append throws and the row is not there, the answer is UNAVAILABLE and a manual retry works', () => {
  const {env, c, lockState} = setup();
  const original = env.sheet.getRange;
  c.console = {error() {}, log() {}};
  let failNext = false;
  env.sheet.getRange = (...args) => {
    if (failNext && args[2] === 1 && args[0] > 1) throw new Error('Service error');
    return original(...args);
  };
  failNext = true;
  fails(() => c.titleWrite_(request('submit', SUBMIT), depsFor('student')), 'UNAVAILABLE', /could not be saved/);
  assert.equal(lockState.releases, 1);
  failNext = false;
  assert.equal(c.titleWrite_(request('submit', SUBMIT), depsFor('student')).revision, 1, 'the same request ID can be retried');
  assert.equal(rowsOf(env).length, 1);
});

test('no e-mail is sent and there is no notification callback or warning', () => {
  const { c } = setup();
  const result = plain(c.titleWrite_(request('submit', SUBMIT), depsFor('student', {notify: () => { throw new Error('must not be called'); }})));
  assert.equal(result.ok, true);
  assert.equal(result.warning, undefined);
  const text = fs.readFileSync('title-write.js', 'utf8');
  assert.doesNotMatch(text, /MailApp|deps\.notify|warning/);
});

test('a team whose history is invalid is UNAVAILABLE and nothing is added to it', () => {
  const {env, c} = setup();
  c.titleWrite_(request('submit', SUBMIT), depsFor('student'));
  env.sheet.rows[1][HEADERS.indexOf('Approved By')] = 'tampered@example.com';
  env.next();
  c.console = {error() {}, log() {}};
  const before = rowsOf(env).length;
  fails(() => c.titleWrite_(request('return', {notes: 'n'}, {expectedRevision: 1, requestId: 'g'}), depsFor('guide')), 'UNAVAILABLE', /unavailable/);
  assert.equal(rowsOf(env).length, before);
});

test('source rules: title-write.js has no public function and does not touch sheets directly', () => {
  const text = fs.readFileSync('title-write.js', 'utf8');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
  assert.doesNotMatch(text, /SpreadsheetApp\.|getRange|MailApp/);
});
