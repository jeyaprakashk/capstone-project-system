// The title endpoints (title-api.js): who may act, what is mailed, what the DTO shows. The write path itself is tested in title-write.test.cjs.
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
const TS = {TEAM_ID: 0, SEMESTER: 1, GUIDE_EMAIL: 2, S1_EMAIL: 3, S2_EMAIL: 4, S3_EMAIL: 5, S4_EMAIL: 6, COMMITTEE_NUMBER: 7};
const TEAM_ROWS = [
  ['T1', 'Odd', 'guide@x.edu', 'ann@x.edu', 'bob@x.edu', '', '', 'C1'],
  ['T2', 'Odd', 'other.guide@x.edu', 'cat@x.edu', '', '', '', 'C2']
];

function setup({cutover = 'LIVE', registryFails = false, activity = null} = {}) {
  const lock = {held: false};
  const mails = [];
  const session = {email: 'ann@x.edu'};
  const properties = {TITLE_CUTOVER: cutover};
  const env = makeTitleEnv([HEADERS], {
    files: ['title-cutover.js', 'activity-engine.js', 'title-service.js', 'title-write.js', 'team-folders.js', 'team-documents.js', 'title-api.js'],
    globals: {
      Utilities, Session: {getActiveUser: () => ({getEmail: () => session.email})},
      MailApp: {sendEmail: (to, subject, body) => mails.push({to, subject, body})},
      LockService: {getScriptLock: () => ({hasLock: () => lock.held, waitLock() { lock.held = true; }, releaseLock() { lock.held = false; }})},
      PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key] === undefined ? null : properties[key]})}
    }
  });
  const c = env.context;
  c.similarity_ = () => 0;
  c.console = {error() {}, log() {}};
  c.getColumnMap_ = () => TS;
  c.getSheetRows_ = () => TEAM_ROWS;
  c.SHEET_NAMES = {TEAM_STATUS: 'TeamStatus'};
  c.FIELD_DEFINITIONS = {TEAM_STATUS: {}};
  c.getCommitteeInfo_ = number => number === 'C1' ? {reviewer1Email: 'rev1@x.edu', reviewer2Email: 'rev2@x.edu'} : number === 'C2' ? {reviewer1Email: 'rev3@x.edu'} : null;
  c.activityIsCoordinator_ = email => email === 'coord@x.edu';
  c.getCoordinatorEmail_ = () => 'coord@x.edu';
  c.getDashboardUrl_ = () => 'https://dash.example';
  c.getAcademicYear_ = () => '2026-27';
  c.getHubRegistrySheet_ = () => { if (registryFails) throw new Error('registry down'); return {getDataRange: () => ({getValues: () => [['y', 's', 't', 'g', 'title'], ['2025-26', 'Even', 'T9', 'g', 'OLD TITLE']]})}; };
  c.activityDriveFolder_ = () => ({absent: true});
  c.findTeamFolder_ =() => ({getUrl: () => 'https://drive.example/folder'});
  c.studentAccessOrThrow_ = () => {
    const row = TEAM_ROWS.find(r => [r[3], r[4], r[5], r[6]].includes(session.email));
    if (!row) throw c.apiFail_('NOT_FOUND', 'Student team was not found.');
    return {email: session.email, teamId: row[0], row};
  };
  // Requirements: scripted per test (no rows by default = unrestricted).
  let answer = activity || {allowed: true, requirements: [], reason: ''};
  c.activityPreconditions_ = (id, team) => { env.asked = (env.asked || []).concat([[id, team.teamId]]); return plain(answer); };
  env.setActivity = value => { answer = value; };
  let tick = 0;
  env.next = () => env.setNow(NOW + (++tick) * HOUR);
  env.next();
  return {env, c, mails, as: email => { session.email = email; }, rows: () => env.sheet.rows.slice(1)};
}

const call = (c, name, ...args) => JSON.parse(c[name](...args));
let counter = 0;
const rid = () => 'req-' + (++counter);
const SUBMIT = (extra = {}) => ({requestId: rid(), expectedRevision: 0, title: 'Smart campus', problem: 'A real problem', ...extra});

test('a student submits: the row is written for the session team and nobody is mailed', () => {
  const {c, mails, rows, env} = setup();
  const frame = call(c, 'API_student_submitTitle', SUBMIT());
  assert.deepEqual(frame.data, {ok: true, revision: 1, status: 'NEEDS_REVIEW', message: 'Title submitted for guide review.'});
  assert.equal(rows().length, 1);
  assert.equal(c.readTitleLog_().rows[0].teamId, 'T1');
  assert.equal(c.readTitleLog_().rows[0].actor, 'ann@x.edu');
  assert.equal(mails.length, 0);
  assert.deepEqual(env.asked, [['title.submit', 'T1']]);
});

test('the team comes from the session: a team ID in the input is ignored', () => {
  const {c, rows} = setup();
  call(c, 'API_student_submitTitle', SUBMIT({teamId: 'T2'}));
  assert.equal(c.readTitleLog_().rows[0].teamId, 'T1');
  assert.equal(rows().length, 1);
});

test('someone who is not on any team cannot submit', () => {
  const {c, as, rows} = setup();
  as('stranger@x.edu');
  assert.equal(call(c, 'API_student_submitTitle', SUBMIT()).error.code, 'NOT_FOUND');
  assert.equal(rows().length, 0);
});

test('unmet requirements refuse with the items listed, and nothing is saved or mailed', () => {
  const {c, rows, mails, env} = setup();
  env.setActivity({allowed: false, reason: 'x', requirements: [{label: 'GitHub setup complete', met: false, reason: 'Waiting for teammates.'}]});
  const frame = call(c, 'API_student_submitTitle', SUBMIT());
  assert.equal(frame.error.code, 'REJECTED');
  assert.match(frame.error.message, /GitHub setup complete \(Waiting for teammates\.\)/);
  assert.equal(rows().length, 0);
  assert.equal(mails.length, 0);
});

test('a reopened title is checked against title.resubmit', () => {
  const {c, as, env} = setup();
  let revision = 0;
  const act = (email, name, input) => { as(email); env.next(); const frame = call(c, name, {requestId: rid(), expectedRevision: revision, ...input}); revision = frame.data ? frame.data.revision : revision; return frame; };
  act('ann@x.edu', 'API_student_submitTitle', {title: 'First', problem: 'P'});
  act('guide@x.edu', 'API_guide_decideTitle', {teamId: 'T1', decision: 'approve'});
  act('rev1@x.edu', 'API_reviewer_decideTitle', {teamId: 'T1', decision: 'approve'});
  act('coord@x.edu', 'API_coordinator_reopenTitle', {teamId: 'T1', reason: 'Change of scope'});
  env.asked = [];
  const again = act('ann@x.edu', 'API_student_submitTitle', {title: 'Second', problem: 'P2'});
  assert.equal(again.ok, true);
  assert.deepEqual(env.asked, [['title.resubmit', 'T1']]);
});

test('the whole workflow through the endpoints, and it sends no e-mail', () => {
  const {c, as, env, mails} = setup();
  let revision = 0;
  const act = (email, name, input) => { as(email); env.next(); const frame = call(c, name, {requestId: rid(), expectedRevision: revision, ...input}); assert.equal(frame.ok, true, name + ': ' + JSON.stringify(frame.error)); revision = frame.data.revision; return frame.data; };
  act('ann@x.edu', 'API_student_submitTitle', {title: 'First', problem: 'P'});
  act('guide@x.edu', 'API_guide_decideTitle', {teamId: 'T1', decision: 'return', notes: 'Too broad'});
  act('bob@x.edu', 'API_student_submitTitle', {title: 'Second', problem: 'P2'});
  act('guide@x.edu', 'API_guide_decideTitle', {teamId: 'T1', decision: 'approve', editedTitle: 'Second edited', notes: 'ok'});
  act('rev2@x.edu', 'API_reviewer_decideTitle', {teamId: 'T1', decision: 'return', notes: 'Revise scope'});
  act('ann@x.edu', 'API_student_submitTitle', {title: 'Third', problem: 'P3'});
  act('guide@x.edu', 'API_guide_decideTitle', {teamId: 'T1', decision: 'approve'});
  const final = act('rev1@x.edu', 'API_reviewer_decideTitle', {teamId: 'T1', decision: 'approve'});
  assert.equal(final.status, 'APPROVED');
  act('coord@x.edu', 'API_coordinator_reopenTitle', {teamId: 'T1', reason: 'Scope change'});
  act('coord@x.edu', 'API_coordinator_cancelReopen', {teamId: 'T1', reason: 'No change'});
  assert.equal(revision, 10);
  assert.equal(mails.length, 0, 'the workflow sends no e-mail');
  assert.deepEqual(Array.from(c.validateTitleHistory_(c.readTitleLog_().rows, Date.now())), []);
});

test('a decision needs approve or return, and only a guide approval may edit the title', () => {
  const {c, as, env} = setup();
  call(c, 'API_student_submitTitle', SUBMIT());
  as('guide@x.edu'); env.next();
  assert.equal(call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'maybe'}).error.code, 'INVALID_INPUT');
  assert.equal(call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1'}).error.code, 'INVALID_INPUT');
  const withEdit = call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'return', notes: 'n', editedTitle: 'x'});
  assert.equal(withEdit.error.code, 'INVALID_INPUT');
  assert.match(withEdit.error.message, /Only a guide approval/);
  assert.equal(call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'return'}).error.code, 'INVALID_INPUT', 'a return needs notes');
});

test('the wrong person is refused and nothing is saved or mailed', () => {
  const {c, as, mails, rows, env} = setup();
  call(c, 'API_student_submitTitle', SUBMIT());
  const mailsBefore = mails.length;
  const attempts = [
    ['other.guide@x.edu', 'API_guide_decideTitle', {decision: 'approve'}, /not the recorded guide/],
    ['rev3@x.edu', 'API_reviewer_decideTitle', {decision: 'approve'}, /not an assigned reviewer/],
    ['ann@x.edu', 'API_coordinator_reopenTitle', {reason: 'x'}, /Coordinator access/],
    ['coord@x.edu', 'API_guide_decideTitle', {decision: 'approve'}, /not the recorded guide/]
  ];
  for (const [email, name, input, pattern] of attempts) {
    as(email); env.next();
    const frame = call(c, name, {requestId: rid(), expectedRevision: 1, teamId: 'T1', ...input});
    assert.equal(frame.error.code, 'UNAUTHORIZED', name + ' as ' + email);
    assert.match(frame.error.message, pattern);
  }
  assert.equal(rows().length, 1);
  assert.equal(mails.length, mailsBefore, 'a refused attempt sends no report either');
  as('guide@x.edu'); env.next();
  assert.equal(call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T2', decision: 'approve'}).error.code, 'UNAUTHORIZED', 'a team of another guide');
});

test('the role must match the stage: a guide cannot return at the reviewer stage, a reviewer cannot approve at the guide stage', () => {
  const {c, as, env} = setup();
  call(c, 'API_student_submitTitle', SUBMIT());
  as('rev1@x.edu'); env.next();
  assert.equal(call(c, 'API_reviewer_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'approve'}).error.code, 'REJECTED');
  as('guide@x.edu'); env.next();
  call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'approve'});
  env.next();
  const late = call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 2, teamId: 'T1', decision: 'return', notes: 'n'});
  assert.equal(late.error.code, 'UNAUTHORIZED');
});

test('an unknown team does not reveal which IDs exist, except to a coordinator', () => {
  const {c, as} = setup();
  as('guide@x.edu');
  assert.equal(call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 0, teamId: 'T99', decision: 'approve'}).error.code, 'UNAUTHORIZED');
  assert.equal(call(c, 'API_title_get', 'T99').error.code, 'UNAUTHORIZED');
  as('coord@x.edu');
  assert.equal(call(c, 'API_coordinator_reopenTitle', {requestId: rid(), expectedRevision: 0, teamId: 'T99', reason: 'x'}).error.code, 'NOT_FOUND');
  as('');
  assert.equal(call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 0, teamId: 'T1', decision: 'approve'}).error.code, 'UNAUTHENTICATED');
});

test('a registry that cannot be read refuses the save', () => {
  const {c, rows} = setup({registryFails: true});
  const frame = call(c, 'API_student_submitTitle', SUBMIT());
  assert.equal(frame.error.code, 'UNAVAILABLE');
  assert.match(frame.error.message, /master registry/);
  assert.equal(rows().length, 0);
});

test('a title like a registry title is refused and names the match', () => {
  const {c, rows} = setup();
  c.similarity_ = (a, b) => b === 'OLD TITLE' ? 0.8 : 0;
  const frame = call(c, 'API_student_submitTitle', SUBMIT());
  assert.equal(frame.error.code, 'REJECTED');
  assert.match(frame.error.message, /80% similar to: "OLD TITLE" \(2025-26 - Even\)/);
  assert.equal(rows().length, 0);
});

test('while the cutover is not LIVE every write is refused as UNAVAILABLE', () => {
  const {c, rows} = setup({cutover: ''});
  const frame = call(c, 'API_student_submitTitle', SUBMIT());
  assert.equal(frame.error.code, 'UNAVAILABLE');
  assert.equal(rows().length, 0);
});

// ---- the DTO -------------------------------------------------------------------------------------------------------------

test('the student DTO: own team, proposal, the submit capability with its checklist, no history, no diagnostics', () => {
  const {c, env} = setup();
  env.setActivity({allowed: false, reason: 'GitHub setup complete: Waiting.', requirements: [{label: 'GitHub setup complete', met: false, reason: 'Waiting.', diagnostic: 'GITHUB_ERROR'}]});
  const frame = call(c, 'API_title_get');
  assert.equal(frame.ok, true);
  const dto = frame.data;
  assert.equal(dto.teamId, 'T1');
  assert.equal(dto.status, 'NOT_SUBMITTED');
  assert.equal(dto.revision, 0);
  assert.equal(dto.folderUrl, 'https://drive.example/folder');
  assert.deepEqual(dto.history, []);
  assert.deepEqual(dto.can.submit, {allowed: false, reason: 'GitHub setup complete: Waiting.', activity: 'title.submit', requirements: [{label: 'GitHub setup complete', met: false, reason: 'Waiting.'}]});
  assert.equal(dto.can.approve.allowed, false);
  assert.equal(dto.can.reopen.allowed, false);
  assert.ok(!JSON.stringify(frame).includes('diagnostic'));
});

test('the student DTO allows submit when the checklist is met and not while the title is under review', () => {
  const {c, env} = setup();
  assert.equal(call(c, 'API_title_get').data.can.submit.allowed, true);
  call(c, 'API_student_submitTitle', SUBMIT());
  env.asked = [];
  const after = call(c, 'API_title_get').data;
  assert.equal(after.status, 'NEEDS_REVIEW');
  assert.equal(after.can.submit.allowed, false);
  assert.match(after.can.submit.reason, /under review/);
  assert.deepEqual(after.can.submit.requirements, []);
  assert.deepEqual(env.asked, [], 'the checklist is not evaluated when the built-in rules already refuse');
});

test('a guide sees what it may do at its stage, a reviewer at its stage, and neither sees the history', () => {
  const {c, as, env} = setup();
  call(c, 'API_student_submitTitle', SUBMIT());
  as('guide@x.edu');
  let dto = call(c, 'API_title_get', 'T1').data;
  assert.equal(dto.can.approve.allowed, true);
  assert.equal(dto.can.return.allowed, true);
  assert.equal(dto.can.submit.allowed, false);
  assert.deepEqual(dto.history, []);
  as('rev1@x.edu');
  dto = call(c, 'API_title_get', 'T1').data;
  assert.equal(dto.can.approve.allowed, false, 'not yet at the reviewer stage');
  as('guide@x.edu'); env.next();
  call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'approve'});
  as('rev1@x.edu');
  dto = call(c, 'API_title_get', 'T1').data;
  assert.equal(dto.can.approve.allowed, true);
  assert.equal(dto.can.return.allowed, true);
});

test('the coordinator sees the history and the reopen capabilities; approved fields are ISO dates', () => {
  const {c, as, env} = setup();
  let revision = 0;
  const act = (email, name, input) => { as(email); env.next(); revision = call(c, name, {requestId: rid(), expectedRevision: revision, ...input}).data.revision; };
  act('ann@x.edu', 'API_student_submitTitle', {title: 'T', problem: 'P'});
  act('guide@x.edu', 'API_guide_decideTitle', {teamId: 'T1', decision: 'approve'});
  act('rev1@x.edu', 'API_reviewer_decideTitle', {teamId: 'T1', decision: 'approve'});
  as('coord@x.edu');
  let dto = call(c, 'API_title_get', 'T1').data;
  assert.deepEqual(dto.history.map(h => h.action), ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  assert.equal(dto.approved.value, true);
  assert.match(dto.approved.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(dto.approved.by, 'rev1@x.edu');
  assert.equal(dto.can.reopen.allowed, true);
  assert.equal(dto.can.cancel.allowed, false);
  act('coord@x.edu', 'API_coordinator_reopenTitle', {teamId: 'T1', reason: 'Scope'});
  dto = call(c, 'API_title_get', 'T1').data;
  assert.equal(dto.status, 'REOPENED');
  assert.equal(dto.reopened, true);
  assert.deepEqual({reason: dto.reopen.reason, by: dto.reopen.by}, {reason: 'Scope', by: 'coord@x.edu'});
  assert.equal(dto.can.cancel.allowed, true);
  assert.equal(dto.can.reopen.allowed, false);
});

test('a person with no role on the team cannot read its title, and a student cannot read another team', () => {
  const {c, as} = setup();
  as('stranger@x.edu');
  assert.equal(call(c, 'API_title_get', 'T1').error.code, 'UNAUTHORIZED');
  as('cat@x.edu');
  assert.equal(call(c, 'API_title_get', 'T1').error.code, 'UNAUTHORIZED');
  assert.equal(call(c, 'API_title_get').data.teamId, 'T2');
});

test('a team whose history is invalid shows UNAVAILABLE and does not affect another team', () => {
  const { sheetRow } = require('./title-sheet-fixture.cjs');
  const { history } = require('./title-fixtures.cjs');
  const rows = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {teamId: 'T1'}).map(r => r.revision === 3 ? {...r, approvedBy: 'nobody@example.com'} : r);
  const {c, env, as} = setup();
  rows.forEach(r => env.sheet.rows.push(sheetRow(r)));
  as('ann@x.edu');
  assert.equal(call(c, 'API_title_get').error.code, 'UNAVAILABLE');
  as('cat@x.edu');
  assert.equal(call(c, 'API_title_get').data.status, 'NOT_SUBMITTED');
});

test('source rules: the only public functions are the title endpoints', () => {
  const text = fs.readFileSync('title-api.js', 'utf8');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions.sort(), ['API_coordinator_cancelReopen', 'API_coordinator_reopenTitle', 'API_guide_decideTitle', 'API_reviewer_decideTitle', 'API_student_submitTitle', 'API_title_get']);
  assert.doesNotMatch(text, /setValues|appendRow|SpreadsheetApp/);
});

test('an endpoint acts only in its own role: a guide who also sits on the committee cannot return at the reviewer stage through the guide endpoint', () => {
  const {c, as, env} = setup();
  c.getCommitteeInfo_ = number => number === 'C1' ? {reviewer1Email: 'guide@x.edu'} : null;
  call(c, 'API_student_submitTitle', SUBMIT());
  as('guide@x.edu'); env.next();
  call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 1, teamId: 'T1', decision: 'approve'});
  env.next();
  const asGuide = call(c, 'API_guide_decideTitle', {requestId: rid(), expectedRevision: 2, teamId: 'T1', decision: 'return', notes: 'n'});
  assert.equal(asGuide.error.code, 'UNAUTHORIZED');
  const asReviewer = call(c, 'API_reviewer_decideTitle', {requestId: rid(), expectedRevision: 2, teamId: 'T1', decision: 'return', notes: 'n'});
  assert.equal(asReviewer.ok, true);
});
