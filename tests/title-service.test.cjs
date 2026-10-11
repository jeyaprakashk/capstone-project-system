// The title service rules (title-service.js): input rules, titleCanDo_, the row each action appends, fingerprints and similarity.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { HOUR, T0, NOW, history } = require('./title-fixtures.cjs');
const { HEADERS, makeTitleEnv } = require('./title-sheet-fixture.cjs');

const Utilities = {
  DigestAlgorithm: {SHA_256: 'SHA_256'}, Charset: {UTF_8: 'UTF_8'},
  // Apps Script returns signed bytes.
  computeDigest: (algorithm, text) => Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest(), byte => byte > 127 ? byte - 256 : byte)
};
const env = makeTitleEnv([HEADERS], {files: ['title-service.js'], globals: {Utilities}});
const c = env.context;
const plain = value => JSON.parse(JSON.stringify(value));
const stateOf = (rows, teamId = 'T1') => c.titleStateFromIndex_(c.titleIndex_(rows, NOW), teamId);
const throwsInput = (fn, pattern) => assert.throws(fn, error => error.apiCode === 'INVALID_INPUT' && pattern.test(error.message));

test('titles are normalized (trim, strip surrounding quotes, uppercase) and must not be empty or over 200 characters', () => {
  assert.equal(c.normalizeTitle_('  "Smart campus"  '), 'SMART CAMPUS');
  assert.equal(c.normalizeTitle_('‘Smart’ campus'), 'SMART’ CAMPUS', 'only surrounding quotes are stripped');
  assert.equal(c.normalizeTitle_("'Quoted'"), 'QUOTED');
  for (const empty of ['', '   ', '""', "'\"'", "' '", '" "', '“”', null, undefined]) {
    throwsInput(() => c.validateTitleText_(empty), /Enter a project title/);
  }
  assert.equal(c.validateTitleText_('a'.repeat(200)).length, 200);
  throwsInput(() => c.validateTitleText_('a'.repeat(201)), /200 characters or fewer/);
  throwsInput(() => c.validateTitleText_('"' + 'a'.repeat(201) + '"'), /200 characters/);
  assert.equal(c.validateTitleText_('"' + 'a'.repeat(200) + '"').length, 200, 'the limit applies after normalizing');
});

test('the problem statement is mandatory, trimmed, and at most 5000 characters', () => {
  assert.equal(c.validateProblemText_('  A problem  '), 'A problem');
  for (const empty of ['', '   ', '\n\t', null, undefined]) throwsInput(() => c.validateProblemText_(empty), /Enter the problem statement/);
  assert.equal(c.validateProblemText_('p'.repeat(5000)).length, 5000);
  throwsInput(() => c.validateProblemText_('p'.repeat(5001)), /5000 characters/);
});

test('inputs by action: submit needs both fields, a guide edit may be absent, a return needs notes, a reopening needs a reason of at most 500', () => {
  assert.deepEqual(plain(c.titleInputFor_('submit', {title: ' x ', problem: ' y '})), {title: 'X', problem: 'y'});
  throwsInput(() => c.titleInputFor_('submit', {title: 'x'}), /problem/);
  throwsInput(() => c.titleInputFor_('submit', {problem: 'y', title: '""'}), /project title/);
  assert.deepEqual(plain(c.titleInputFor_('guideApprove', {})), {editedTitle: '', notes: ''}, 'no edit and no notes is fine');
  assert.deepEqual(plain(c.titleInputFor_('guideApprove', {editedTitle: '   ', notes: ' ok '})), {editedTitle: '', notes: 'ok'}, 'an empty edit means no edit');
  assert.deepEqual(plain(c.titleInputFor_('guideApprove', {editedTitle: '"new one"'})), {editedTitle: 'NEW ONE', notes: ''});
  throwsInput(() => c.titleInputFor_('guideApprove', {editedTitle: 'a'.repeat(201)}), /200/);
  throwsInput(() => c.titleInputFor_('return', {notes: '   '}), /Notes is required/);
  assert.deepEqual(plain(c.titleInputFor_('return', {notes: ' fix it '})), {notes: 'fix it'});
  assert.deepEqual(plain(c.titleInputFor_('reviewerApprove', {})), {notes: ''});
  throwsInput(() => c.titleInputFor_('reopen', {reason: ''}), /reason is required/);
  throwsInput(() => c.titleInputFor_('cancelReopen', {reason: 'r'.repeat(501)}), /500 characters/);
  assert.equal(c.titleInputFor_('reopen', {reason: 'r'.repeat(500)}).reason.length, 500);
  throwsInput(() => c.titleInputFor_('explode', {}), /Unknown title action/);
});

test('fingerprints are stable SHA-256 hex and change with the action, the team and every field', () => {
  const base = c.titleFingerprint_('submit', 'T1', {title: 'A', problem: 'B'});
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(c.titleFingerprint_('submit', 't1 ', {title: 'A', problem: 'B'}), base, 'the team is matched like everywhere else');
  assert.notEqual(c.titleFingerprint_('submit', 'T2', {title: 'A', problem: 'B'}), base);
  assert.notEqual(c.titleFingerprint_('submit', 'T1', {title: 'A2', problem: 'B'}), base);
  assert.notEqual(c.titleFingerprint_('submit', 'T1', {title: 'A', problem: 'B2'}), base);
  assert.notEqual(c.titleFingerprint_('return', 'T1', {notes: 'A'}), c.titleFingerprint_('reviewerApprove', 'T1', {notes: 'A'}), 'the action is part of it');
  assert.notEqual(c.titleFingerprint_('guideApprove', 'T1', {editedTitle: '', notes: 'x'}), c.titleFingerprint_('guideApprove', 'T1', {editedTitle: 'x', notes: ''}));
  const expected = crypto.createHash('sha256').update(JSON.stringify(['SUBMIT', 't1', 'A', 'B']), 'utf8').digest('hex');
  assert.equal(base, expected, 'it is the SHA-256 of the action, the team key and the fields');
  assert.throws(() => c.titleFingerprint_('explode', 'T1', {}), /Unknown title action/);
});

const ALL = {student: true, guide: true, reviewer: true, coordinator: true};
const only = role => ({roles: {[role]: true}});
const can = (steps, action, user, options) => plain(c.titleCanDo_(stateOf(history(steps, options)), action, user));
const none = plain(c.titleCanDo_(c.titleStateFromIndex_(c.titleIndex_([], NOW), 'T1'), 'submit', only('student')));

test('titleCanDo_ follows the workflow table: who, from which status', () => {
  const allowed = {allowed: true, reason: '', code: ''};
  assert.deepEqual(none, allowed, 'a team with no rows can submit');
  assert.deepEqual(can(['SUBMIT', 'RETURN'], 'submit', only('student')), allowed);
  assert.deepEqual(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN'], 'submit', only('student')), allowed);
  assert.deepEqual(can(['SUBMIT'], 'guideApprove', only('guide')), allowed);
  assert.deepEqual(can(['SUBMIT'], 'return', only('guide')), allowed);
  assert.deepEqual(can(['SUBMIT', 'GUIDE_APPROVE'], 'return', only('reviewer')), allowed);
  assert.deepEqual(can(['SUBMIT', 'GUIDE_APPROVE'], 'reviewerApprove', only('reviewer')), allowed);
  assert.deepEqual(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], 'reopen', only('coordinator')), allowed);
  assert.deepEqual(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN'], 'cancelReopen', only('coordinator')), allowed);
  assert.deepEqual(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT', 'RETURN'], 'cancelReopen', only('coordinator')), allowed, 'a reopening can be cancelled in any status');
});

test('titleCanDo_ refuses a wrong role with UNAUTHORIZED and a wrong state with REJECTED, with a reason', () => {
  const expectRefusal = (result, code, pattern) => { assert.equal(result.allowed, false); assert.equal(result.code, code); assert.match(result.reason, pattern); };
  expectRefusal(can(['SUBMIT'], 'submit', only('guide')), 'UNAUTHORIZED', /member of this team/);
  expectRefusal(can(['SUBMIT'], 'submit', only('student')), 'REJECTED', /under review/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE'], 'submit', only('student')), 'REJECTED', /under review/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], 'submit', only('student')), 'REJECTED', /reopen/);
  expectRefusal(can(['SUBMIT'], 'guideApprove', only('student')), 'UNAUTHORIZED', /guide/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE'], 'guideApprove', only('guide')), 'REJECTED', /not waiting for the guide/);
  expectRefusal(can(['SUBMIT'], 'return', only('reviewer')), 'UNAUTHORIZED', /guide can return/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE'], 'return', only('guide')), 'UNAUTHORIZED', /reviewer can return/);
  expectRefusal(can(['SUBMIT', 'RETURN'], 'return', ALL && {roles: ALL}), 'REJECTED', /not under review/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE'], 'reviewerApprove', only('guide')), 'UNAUTHORIZED', /reviewer can approve/);
  expectRefusal(can(['SUBMIT'], 'reviewerApprove', only('reviewer')), 'REJECTED', /not waiting for the reviewers/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], 'reopen', only('guide')), 'UNAUTHORIZED', /coordinator can reopen/);
  expectRefusal(can(['SUBMIT'], 'reopen', only('coordinator')), 'REJECTED', /approved title can be reopened/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN'], 'reopen', only('coordinator')), 'REJECTED', /approved title can be reopened/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], 'cancelReopen', only('coordinator')), 'REJECTED', /no open reopening/);
  expectRefusal(can(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN'], 'cancelReopen', only('student')), 'UNAUTHORIZED', /coordinator can cancel/);
  expectRefusal(can(['SUBMIT'], 'explode', only('guide')), 'REJECTED', /Unknown/);
  expectRefusal(plain(c.titleCanDo_(stateOf(history(['SUBMIT'])), 'submit', undefined)), 'UNAUTHORIZED', /member of this team/);
});

test('legacy baselines with a blank problem cannot be approved at either stage, but can be returned', () => {
  const reason = 'The problem statement is missing. Return the title so the team can resubmit it with one.';
  const pending = {baselineProblem: ''};
  assert.deepEqual(can(['BASELINE:NEEDS_REVIEW'], 'guideApprove', only('guide'), pending), {allowed: false, reason, code: 'REJECTED'});
  assert.deepEqual(can(['BASELINE:AWAITING_REVIEWER'], 'reviewerApprove', only('reviewer'), pending), {allowed: false, reason, code: 'REJECTED'});
  assert.equal(can(['BASELINE:NEEDS_REVIEW'], 'return', only('guide'), pending).allowed, true);
  assert.equal(can(['BASELINE:AWAITING_REVIEWER'], 'return', only('reviewer'), pending).allowed, true);
  assert.equal(can(['BASELINE:RETURNED'], 'submit', only('student'), pending).allowed, true, 'the team can resubmit, and the input rules then require a problem');
});

const ctx = (extra = {}) => ({teamId: 'T1', now: T0 + 50 * HOUR, actor: 'someone@example.com', requestId: 'req-x', fingerprint: 'fp-x', similarityNote: '', ...extra});

test('each action appends the complete next state', () => {
  const approved = stateOf(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']));
  const submit = plain(c.titleNextRow_(stateOf([]), 'submit', {title: 'NEW', problem: 'P'}, ctx({similarityNote: '40% similar'})));
  assert.deepEqual({s: submit.status, r: submit.revision, a: submit.action, t: submit.title, p: submit.problem, n: submit.notes, sim: submit.similarityNote, re: submit.reopened}, {s: 'NEEDS_REVIEW', r: 1, a: 'SUBMIT', t: 'NEW', p: 'P', n: '', sim: '40% similar', re: false});
  const waiting = stateOf(history(['SUBMIT']));
  const guide = plain(c.titleNextRow_(waiting, 'guideApprove', {editedTitle: 'EDITED', notes: 'good'}, ctx({similarityNote: '10% similar'})));
  assert.deepEqual({s: guide.status, t: guide.title, p: guide.problem, n: guide.notes, sim: guide.similarityNote}, {s: 'AWAITING_REVIEWER', t: 'EDITED', p: 'A problem statement', n: 'good', sim: '10% similar'});
  const unedited = plain(c.titleNextRow_(waiting, 'guideApprove', {editedTitle: '', notes: ''}, ctx({similarityNote: 'ignored'})));
  assert.equal(unedited.title, 'A TITLE');
  assert.equal(unedited.similarityNote, '', 'no edit keeps the previous similarity note');
  const returned = plain(c.titleNextRow_(waiting, 'return', {notes: 'revise it'}, ctx()));
  assert.deepEqual({s: returned.status, n: returned.notes, t: returned.title}, {s: 'RETURNED', n: 'revise it', t: 'A TITLE'});
  const awaiting = stateOf(history(['SUBMIT', 'GUIDE_APPROVE']));
  const approve = plain(c.titleNextRow_(awaiting, 'reviewerApprove', {notes: ''}, ctx({actor: 'rev@example.com', now: T0 + 60 * HOUR})));
  assert.deepEqual({s: approve.status, at: approve.approvedAt, by: approve.approvedBy, t: approve.approvedTitle, p: approve.approvedProblem, re: approve.reopened}, {s: 'APPROVED', at: T0 + 60 * HOUR, by: 'rev@example.com', t: 'A TITLE', p: 'A problem statement', re: false});
  const reopen = plain(c.titleNextRow_(approved, 'reopen', {reason: 'Scope change'}, ctx()));
  assert.deepEqual({s: reopen.status, re: reopen.reopened, n: reopen.notes, t: reopen.approvedTitle, at: reopen.approvedAt}, {s: 'REOPENED', re: true, n: 'Scope change', t: 'A TITLE', at: T0 + 2 * HOUR});
  const reopened = stateOf(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', {action: 'SUBMIT', title: 'DIFFERENT', problem: 'Other'}]));
  const cancel = plain(c.titleNextRow_(reopened, 'cancelReopen', {reason: 'No change after all'}, ctx()));
  assert.deepEqual({s: cancel.status, re: cancel.reopened, t: cancel.title, p: cancel.problem, n: cancel.notes, sim: cancel.similarityNote}, {s: 'APPROVED', re: false, t: 'A TITLE', p: 'A problem statement', n: 'No change after all', sim: ''});
  const second = plain(c.titleNextRow_(stateOf(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT', 'GUIDE_APPROVE'])), 'reviewerApprove', {notes: ''}, ctx({now: T0 + 90 * HOUR})));
  assert.equal(second.approvedAt, T0 + 2 * HOUR, 'a later approval keeps the first date');
  assert.throws(() => c.titleNextRow_(waiting, 'explode', {}, ctx()), error => error.apiCode === 'INVALID_INPUT');
});

// A small deterministic generator, so the walk below is repeatable.
function prng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test('every row the service builds passes the history rules, whatever legal path is taken (random walks)', () => {
  const ACTIONS = ['submit', 'guideApprove', 'return', 'reviewerApprove', 'reopen', 'cancelReopen'];
  const random = prng(2026);
  let approvals = 0, reopenings = 0, cancels = 0, returns = 0;
  for (let walk = 0; walk < 400; walk++) {
    let rows = random() < 0.25 ? history(['BASELINE:' + ['NEEDS_REVIEW', 'AWAITING_REVIEWER', 'RETURNED', 'APPROVED', 'NOT_SUBMITTED'][Math.floor(random() * 5)]]) : [];
    let previousGate = null;
    for (let step = 0; step < 14; step++) {
      const state = stateOf(rows);
      const candidates = ACTIONS.filter(action => c.titleCanDo_(state, action, {roles: ALL}).allowed);
      if (!candidates.length) break;
      const action = candidates[Math.floor(random() * candidates.length)];
      const n = rows.length + 1;
      const input = c.titleInputFor_(action, {title: 'Title ' + walk + '-' + n, problem: 'Problem ' + n, editedTitle: random() < 0.4 ? 'Edited ' + n : '', notes: 'notes ' + n, reason: 'reason ' + n});
      const now = (rows.length ? rows[rows.length - 1].timestamp : T0) + HOUR;
      const row = {...c.titleNextRow_(state, action, input, ctx({now, requestId: 'r' + n, fingerprint: 'f' + n, similarityNote: random() < 0.5 ? '12% similar' : '', actor: action + '@example.com'})), row: n + 1};
      rows = rows.concat([plain(row)]);
      const problems = Array.from(c.validateTitleHistory_(rows, NOW));
      assert.deepEqual(problems, [], 'walk ' + walk + ' step ' + step + ' after ' + action);
      const gate = plain(c.titleGate_('T1', c.titleIndex_(rows, NOW)));
      if (previousGate && previousGate.approved) {
        assert.equal(gate.approved, true, 'approved never turns back to false');
        assert.equal(gate.approvedAt, previousGate.approvedAt, 'the first approval date never moves');
      }
      previousGate = gate;
      if (action === 'reviewerApprove') approvals++; else if (action === 'reopen') reopenings++; else if (action === 'cancelReopen') cancels++; else if (action === 'return') returns++;
    }
  }
  assert.ok(approvals > 100 && reopenings > 50 && cancels > 20 && returns > 100, 'the walks must cover the interesting paths: ' + [approvals, reopenings, cancels, returns]);
});

const registry = [
  ['2026-27', 'Odd', 'T9', 'g@x', 'SMART IRRIGATION SYSTEM', '', '', '', ''],
  ['2026-27', 'Odd', 'T1', 'g@x', 'THE TEAMS OWN OLD ROW', '', '', '', ''],
  ['2025-26', 'Even', 'T7', 'g@x', 'WATER QUALITY MONITOR', '', '', '', '']
];
const similarityContext = (extra = {}) => ({registryRows: registry, academicYear: '2026-27', semester: 'Odd', others: [], ...extra});

test('similarity: a registry match of 75% or more blocks and names the match and its context', () => {
  const scores = {'SMART IRRIGATION SYSTEM': 0.8, 'THE TEAMS OWN OLD ROW': 1, 'WATER QUALITY MONITOR': 0.74};
  c.similarity_ = (a, b) => scores[b] === undefined ? 0 : scores[b];
  assert.throws(() => c.titleSimilarity_('X', 'T1', similarityContext()), error => error.apiCode === 'REJECTED' && /80% similar to: "SMART IRRIGATION SYSTEM" \(2026-27 - Odd\)/.test(error.message));
  scores['SMART IRRIGATION SYSTEM'] = 0.75;
  assert.throws(() => c.titleSimilarity_('X', 'T1', similarityContext()), error => error.apiCode === 'REJECTED', 'exactly 75% blocks');
  scores['SMART IRRIGATION SYSTEM'] = 0.749;
  assert.doesNotThrow(() => c.titleSimilarity_('X', 'T1', similarityContext()), 'just under 75% does not');
});

test('similarity: the team\'s own registry rows are excluded by year, semester and team ID, and only then', () => {
  c.similarity_ = (a, b) => b === 'THE TEAMS OWN OLD ROW' ? 1 : 0;
  assert.equal(c.titleSimilarity_('X', 'T1', similarityContext()), '', 'its own row is ignored');
  assert.throws(() => c.titleSimilarity_('X', 'T2', similarityContext()), error => error.apiCode === 'REJECTED', 'another team is blocked by that row');
  assert.throws(() => c.titleSimilarity_('X', 'T1', similarityContext({semester: 'Even'})), error => error.apiCode === 'REJECTED', 'a different semester is not its own');
  assert.throws(() => c.titleSimilarity_('X', 'T1', similarityContext({academicYear: '2025-26'})), error => error.apiCode === 'REJECTED', 'a different year is not its own');
});

test('similarity: other teams only produce a note, the best match overall, and never block', () => {
  c.similarity_ = (a, b) => ({'SOLAR TRACKER': 0.9, 'WATER QUALITY MONITOR': 0.5, 'SMART IRRIGATION SYSTEM': 0.3}[b] || 0);
  const note = c.titleSimilarity_('X', 'T1', similarityContext({others: [{teamId: 'T4', title: 'SOLAR TRACKER'}]}));
  assert.equal(note, '90% similar to "SOLAR TRACKER" (Team T4, this semester)');
  assert.equal(c.titleSimilarity_('X', 'T1', similarityContext()), '50% similar to "WATER QUALITY MONITOR" (2025-26 - Even)', 'a registry match below the threshold can be the note');
  c.similarity_ = () => 0;
  assert.equal(c.titleSimilarity_('X', 'T1', similarityContext()), '');
});

test('the other teams\' titles are their approved title and their current proposal; own and unavailable teams are left out', () => {
  const t2 = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', {action: 'SUBMIT', title: 'NEW IDEA', problem: 'Next'}], {teamId: 'T2'});
  const t3 = history(['SUBMIT'], {teamId: 'T3', }).map(r => ({...r, approvedBy: 'broken'}));
  const t1 = history(['SUBMIT'], {teamId: 'T1'});
  const index = c.titleIndex_([...t1, ...t2, ...t3], NOW);
  const others = plain(c.titleOtherTeamTitles_(index, 'T1'));
  assert.deepEqual(others.map(o => o.title).sort(), ['A TITLE', 'NEW IDEA']);
  assert.ok(others.every(o => o.teamId === 'T2'), 'team T3 has an invalid history and is skipped; T1 is the team itself');
  assert.equal(plain(c.titleOtherTeamTitles_(index, 'T2')).filter(o => o.teamId === 'T2').length, 0);
});

test('source rules: the service never reads or writes a sheet, never sends mail, and has no public function', () => {
  const text = fs.readFileSync('title-service.js', 'utf8');
  assert.doesNotMatch(text, /SpreadsheetApp|getSheet_|LockService|PropertiesService|MailApp|setValues|readSheetRows_/);
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
});
