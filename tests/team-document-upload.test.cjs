// The document upload (team-document-upload.js): input rules, the fixed name, duplicate and replacement handling, the lock and the checks
// made under it. Drive is the Phase 0 fake with file creation, descriptions and trash added here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { makeDriveContext } = require('./title-baseline/stubs.cjs');
const { HEADERS, sheetRow } = require('./title-sheet-fixture.cjs');
const { history, NOW } = require('./title-fixtures.cjs');

const WORK = 'Step1_Work_Breakdown.docx', NEED = 'Step2_Need_Analysis.docx';
const plain = value => JSON.parse(JSON.stringify(value));
const hex = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const DOCX = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.from('word document content')]);
const b64 = buffer => buffer.toString('base64');

let ids = 1000;
function fakeFile(name, {trashed = false, description = ''} = {}) {
  const file = {id: 'f' + ids++, name, trashed, description,
    getName: () => file.name, getId: () => file.id, isTrashed: () => file.trashed,
    getDescription: () => file.description, setDescription: value => { file.description = value; return file; },
    setTrashed: value => { file.trashed = value; return file; }};
  return file;
}

function setup({files = [], cutover = 'LIVE', titleRows = [], gate = {allowed: true, requirements: [], reason: ''}, trashFails = false, createFails = false} = {}) {
  const drive = makeDriveContext({teams: {T1: {files: []}}});
  const c = drive.context;
  const folder = drive.folderOf.T1[0];
  files.forEach(file => folder.files.push(file));
  const created = [];
  folder.createFile = blob => {
    if (createFails) throw new Error('Drive down');
    const file = fakeFile(blob.name); file.blob = blob; folder.files.push(file); created.push(file); return file;
  };
  const lock = {held: false, waits: 0, releases: 0, busy: false};
  const properties = {TITLE_CUTOVER: cutover};
  const session = {email: 'ann@x.edu'};
  Object.assign(c, {
    console: {error() {}, log() {}},
    Utilities: {
      DigestAlgorithm: {SHA_256: 'SHA_256'}, Charset: {UTF_8: 'UTF_8'},
      computeDigest: (algorithm, input) => Array.from(crypto.createHash('sha256').update(typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input)).digest(), b => b > 127 ? b - 256 : b),
      base64Decode: text => { if (/[^A-Za-z0-9+/=]/.test(text)) throw new Error('bad'); return Array.from(Buffer.from(text, 'base64'), b => b > 127 ? b - 256 : b); },
      newBlob: (bytes, mimeType, name) => ({bytes, mimeType, name})
    },
    LockService: {getScriptLock: () => ({hasLock: () => lock.held, waitLock() { lock.waits++; if (lock.busy) throw new Error('timeout'); lock.held = true; }, releaseLock() { lock.releases++; lock.held = false; }})},
    PropertiesService: {getScriptProperties: () => ({getProperty: key => properties[key] === undefined ? null : properties[key]})},
    Session: {getActiveUser: () => ({getEmail: () => session.email})},
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getId: () => 'book', getSheetByName: () => sheet}), flush() {}},
  });
  // The title log sheet for the "under review" check.
  const sheetRows = [HEADERS, ...titleRows.map(sheetRow)];
  const sheet = {getName: () => 'TitleLog', getLastRow: () => sheetRows.length, getLastColumn: () => HEADERS.length, getMaxRows: () => 1000,
    getRange: (row, column, numRows, numColumns) => ({getValues: () => Array.from({length: numRows}, (_, r) => Array.from({length: numColumns}, (_, k) => (sheetRows[row - 1 + r] || [])[column - 1 + k] ?? ''))})};
  ['common-constants.js', 'sheet-reads.js', 'common-helpers.js', 'api-envelope.js', 'sheet-columns.js', 'title-cutover.js', 'title-log.js', 'title-history.js', 'title-gate.js',
    'activity-engine.js', 'activity-check-drive.js', 'activity-check-github.js', 'title-service.js', 'title-write.js', 'team-document-upload.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), c, {filename: file}));
  c.getColumnMap_ = () => ({TEAM_ID: 0, SEMESTER: 1});
  c.getSheetRows_ = () => [['T1', 'Odd']];
  c.getAcademicYear_ = () => '2026-27';
  c.getSpreadsheetId_ = () => 'sheet-1';
  c.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } };
  c.studentAccessOrThrow_ = () => {
    if (!session.email) throw c.apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
    if (session.email !== 'ann@x.edu') throw c.apiFail_('NOT_FOUND', 'Student team was not found.');
    return {email: session.email, teamId: 'T1', row: ['T1', 'Odd']};
  };
  let currentGate = gate;
  c.activityPreconditions_ = () => plain(currentGate);
  return {c, folder, created, lock, properties, session, setGate: value => { currentGate = value; }, live: name => folder.files.filter(f => f.name === name && !f.trashed)};
}

const input = (extra = {}) => ({requestId: 'req-1', documentKey: 'work', fileName: 'My Work.DOCX', mimeType: '', dataBase64: b64(DOCX), ...extra});
const call = (env, payload) => JSON.parse(env.c.API_student_uploadDocument(payload));

test('an upload creates the file with the fixed name, a description of the request, and returns who and when', () => {
  const env = setup();
  const frame = call(env, input());
  assert.equal(frame.ok, true, JSON.stringify(frame.error));
  assert.deepEqual({k: frame.data.documentKey, p: frame.data.present, by: frame.data.uploadedBy, r: frame.data.replaced, m: frame.data.message},
    {k: 'work', p: true, by: 'ann@x.edu', r: false, m: 'Work Breakdown document uploaded.'});
  assert.equal(env.created.length, 1);
  assert.equal(env.created[0].name, WORK, 'the stored name is fixed, whatever the file was called');
  assert.equal(env.created[0].blob.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const record = JSON.parse(env.created[0].description);
  assert.deepEqual(Object.keys(record).sort(), ['fingerprint', 'requestId', 'uploadedAt', 'uploadedBy']);
  assert.equal(record.requestId, 'req-1');
  assert.equal(record.uploadedBy, 'ann@x.edu');
  assert.equal(record.fingerprint, hex(Buffer.from('work' + hex(DOCX))), 'the fingerprint is SHA-256(key + SHA-256(bytes))');
  assert.equal(env.live(WORK).length, 1);
  assert.deepEqual([env.lock.waits, env.lock.releases], [1, 1]);
});

test('input rules: key, .docx name, MIME type, zip signature, size and an empty or undecodable file', () => {
  const env = setup();
  const bad = {
    'unknown key': [{documentKey: 'other'}, /Choose which document/],
    'missing key': [{documentKey: undefined}, /Choose which document/],
    'a name that is not a property of the table': [{documentKey: 'hasOwnProperty'}, /Choose which document/],
    'not .docx': [{fileName: 'a.pdf'}, /Word document/],
    'a .docx.exe': [{fileName: 'a.docx.exe'}, /Word document/],
    'wrong MIME': [{mimeType: 'application/pdf'}, /Word document/],
    'empty': [{dataBase64: ''}, /empty/],
    'not base64': [{dataBase64: '!!!'}, /could not be read/],
    'not a zip': [{dataBase64: b64(Buffer.from('plain text file'))}, /not a valid Word document/],
    'a single byte': [{dataBase64: b64(Buffer.from('P'))}, /not a valid Word document/],
    'too large': [{dataBase64: b64(Buffer.concat([Buffer.from('PK'), Buffer.alloc(10 * 1024 * 1024)]))}, /larger than 10 MB/],
    'no request ID': [{requestId: ' '}, /request ID/]
  };
  for (const [name, [patch, pattern]] of Object.entries(bad)) {
    const frame = call(env, input(patch));
    assert.equal(frame.error && frame.error.code, 'INVALID_INPUT', name);
    assert.match(frame.error.message, pattern, name);
  }
  assert.equal(env.created.length, 0);
  for (const mimeType of ['', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
    assert.equal(call(setup(), input({mimeType})).ok, true, mimeType);
  }
  assert.equal(call(setup(), input({documentKey: 'need'})).data.message, 'Need Analysis document uploaded.');
});

test('a second upload replaces the first: the old live file goes to the trash and exactly one live file remains', () => {
  const old = fakeFile(WORK, {description: JSON.stringify({requestId: 'old', fingerprint: 'x', uploadedBy: 'bob@x.edu', uploadedAt: '2026-01-01T00:00:00.000Z'})});
  const env = setup({files: [old, fakeFile('Other.docx')]});
  assert.equal(call(env, input({requestId: 'new'})).ok, true);
  assert.equal(old.trashed, true);
  assert.equal(env.live(WORK).length, 1);
  assert.equal(env.live(WORK)[0].name, WORK);
  assert.equal(env.live('Other.docx').length, 1, 'unrelated files are untouched');
});

test('a retry of a finished upload returns its stored result without evaluating the requirements or creating anything', () => {
  const env = setup();
  const first = call(env, input());
  env.setGate({allowed: false, requirements: [{label: 'x', met: false, reason: 'r'}], reason: 'r'});
  env.c.activityPreconditions_ = () => { throw new Error('requirements must not be evaluated for a finished request'); };
  const again = call(env, input());
  assert.deepEqual(again.data, first.data);
  assert.equal(env.created.length, 1);
});

test('a retry whose file a newer upload has replaced reports replaced and changes no file', () => {
  const env = setup();
  call(env, input({requestId: 'r1'}));
  call(env, input({requestId: 'r2', dataBase64: b64(Buffer.concat([DOCX, Buffer.from('v2')]))}));
  const [first, second] = env.created;
  assert.equal(first.trashed, true);
  const retry = call(env, input({requestId: 'r1'}));
  assert.equal(retry.ok, true);
  assert.equal(retry.data.replaced, true);
  assert.match(retry.data.message, /newer upload has since replaced it/);
  assert.equal(second.trashed, false, 'the newer file is never trashed');
  assert.equal(env.created.length, 2);
});

test('the same request ID with different content is a CONFLICT and changes nothing', () => {
  const env = setup();
  call(env, input());
  const frame = call(env, input({dataBase64: b64(Buffer.concat([DOCX, Buffer.from('different')]))}));
  assert.equal(frame.error.code, 'CONFLICT');
  assert.equal(env.created.length, 1);
  assert.equal(call(env, input({documentKey: 'need'})).error.code, 'CONFLICT', 'a different document under the same ID');
});

test('an incomplete earlier attempt (the file is live but another live copy remains) is finished by the retry', () => {
  const mine = fakeFile(WORK);
  const env = setup({files: [fakeFile(WORK)]});
  const fingerprint = hex(Buffer.from('work' + hex(DOCX)));
  mine.description = JSON.stringify({requestId: 'req-1', fingerprint, uploadedBy: 'ann@x.edu', uploadedAt: '2026-01-02T00:00:00.000Z'});
  env.folder.files.push(mine);
  env.c.activityPreconditions_ = () => { throw new Error('skipped for an incomplete request'); };
  const frame = call(env, input());
  assert.equal(frame.ok, true);
  assert.equal(env.created.length, 0, 'no second upload');
  assert.deepEqual(env.live(WORK).map(f => f.id), [mine.id]);
});

test('document.upload requirements refuse with the unmet items, outside the lock, and a rule that is met allows', () => {
  const env = setup({gate: {allowed: false, reason: 'x', requirements: [{label: 'GitHub setup complete', met: false, reason: 'Waiting for teammates.'}]}});
  const frame = call(env, input());
  assert.equal(frame.error.code, 'REJECTED');
  assert.match(frame.error.message, /GitHub setup complete \(Waiting for teammates\.\)/);
  assert.equal(env.lock.waits, 0);
  assert.equal(env.created.length, 0);
  env.setGate({allowed: true, requirements: [], reason: ''});
  assert.equal(call(env, input()).ok, true);
});

test('while the title is under review no document can change; before submission and after a return it can', () => {
  for (const steps of [['SUBMIT'], ['SUBMIT', 'GUIDE_APPROVE']]) {
    const env = setup({titleRows: history(steps, {teamId: 'T1', start: NOW - 100 * 3600000})});
    const frame = call(env, input());
    assert.equal(frame.error.code, 'REJECTED', steps.join());
    assert.match(frame.error.message, /under review/);
    assert.equal(env.created.length, 0);
  }
  for (const steps of [[], ['SUBMIT', 'RETURN'], ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']]) {
    const env = setup({titleRows: history(steps, {teamId: 'T1', start: NOW - 100 * 3600000})});
    assert.equal(call(env, input()).ok, true, steps.join());
  }
});

test('the status is checked again under the lock: a title submitted while the upload waited stops it', () => {
  const env = setup();
  const original = env.c.activityPreconditions_;
  env.c.activityPreconditions_ = (...args) => {
    // The title submission "commits" after the requirements were checked and before the lock is taken.
    env.c.readTitleLog_ = () => ({rows: history(['SUBMIT'], {teamId: 'T1', start: NOW - 3600000}).map(r => ({...r, row: 2})), columns: {}, sheet: {}});
    return original(...args);
  };
  const frame = call(env, input());
  assert.equal(frame.error.code, 'REJECTED');
  assert.match(frame.error.message, /under review/);
  assert.equal(env.created.length, 0);
  assert.equal(env.lock.releases, env.lock.waits);
});

test('the cutover must be LIVE, before and under the lock', () => {
  for (const cutover of ['', 'PAUSED']) {
    const env = setup({cutover});
    assert.equal(call(env, input()).error.code, 'UNAVAILABLE', cutover);
    assert.equal(env.created.length, 0);
  }
  const env = setup();
  const original = env.c.activityPreconditions_;
  env.c.activityPreconditions_ = (...args) => { env.properties.TITLE_CUTOVER = 'PAUSED'; return original(...args); };
  const frame = call(env, input());
  assert.equal(frame.error.code, 'UNAVAILABLE');
  assert.equal(env.created.length, 0);
  assert.equal(env.lock.releases, env.lock.waits);
});

test('the team folder must already exist and be unambiguous; it is never created here', () => {
  const none = setup();
  none.c.activityDriveFolder_ = () => ({absent: true});
  const absent = call(none, input());
  assert.equal(absent.error.code, 'REJECTED');
  assert.match(absent.error.message, /folder has not been created yet/);
  const unclear = setup();
  unclear.c.activityDriveFolder_ = () => ({unresolved: 'FOLDER_AMBIGUOUS'});
  const unresolved = call(unclear, input());
  assert.equal(unresolved.error.code, 'UNAVAILABLE');
  assert.doesNotMatch(unresolved.error.message, /FOLDER_AMBIGUOUS/, 'no diagnostic reaches the student');
  assert.doesNotMatch(fs.readFileSync('team-document-upload.js', 'utf8'), /createFolder/);
});

test('a busy lock is UNAVAILABLE, a Drive failure while creating is raised, and cleanup failure is UNAVAILABLE for a retry to finish', () => {
  const busy = setup();
  busy.lock.busy = true;
  assert.deepEqual(call(busy, input()).error, {code: 'UNAVAILABLE', message: 'Busy, try again.'});
  assert.equal(busy.created.length, 0);
  const failing = setup({createFails: true});
  assert.equal(call(failing, input()).ok, false);
  assert.equal(failing.lock.releases, failing.lock.waits, 'the lock is released on every path');
  const old = fakeFile(WORK, {description: '{}'});
  old.setTrashed = () => { throw new Error('trash failed'); };
  const stuck = setup({files: [old]});
  const frame = call(stuck, input({requestId: 'n'}));
  assert.equal(frame.error.code, 'UNAVAILABLE');
  assert.equal(stuck.created.length, 1, 'the new file exists; a retry finishes the cleanup');
  old.setTrashed = value => { old.trashed = value; return old; };
  assert.equal(call(stuck, input({requestId: 'n'})).ok, true);
  assert.equal(stuck.created.length, 1);
  assert.equal(stuck.live(WORK).length, 1);
});

test('who may upload: only a student of the team, and the team comes from the session', () => {
  const env = setup();
  env.session.email = 'guide@x.edu';
  assert.equal(call(env, input()).error.code, 'NOT_FOUND');
  env.session.email = '';
  assert.equal(call(env, input()).error.code, 'UNAUTHENTICATED');
  env.session.email = 'ann@x.edu';
  const ok = call(env, input({teamId: 'T2', folderId: 'other'}));
  assert.equal(ok.ok, true);
  assert.equal(env.created.length, 1, 'the target is the session team folder, not anything in the request');
  assert.doesNotMatch(fs.readFileSync('team-document-upload.js', 'utf8'), /input\.(teamId|folder)/);
});

test('the document list: present when exactly one live file exists; the uploader is shown only for the own team; a hand-placed file has no uploader', () => {
  const env = setup({files: [fakeFile(WORK, {description: JSON.stringify({requestId: 'r', fingerprint: 'f', uploadedBy: 'ann@x.edu', uploadedAt: '2026-01-02T00:00:00.000Z'})}), fakeFile(NEED), fakeFile(NEED, {trashed: true})]});
  const team = {teamId: 'T1', semester: 'Odd'};
  const own = plain(env.c.documentStatusList_(team, true, env.c.activityContext_()));
  assert.deepEqual(own, [
    {key: 'work', label: 'Work Breakdown document', present: true, uploadedBy: 'ann@x.edu', uploadedAt: '2026-01-02T00:00:00.000Z'},
    {key: 'need', label: 'Need Analysis document', present: true, uploadedBy: '', uploadedAt: null}
  ]);
  const staff = plain(env.c.documentStatusList_(team, false, env.c.activityContext_()));
  assert.deepEqual(staff.map(d => [d.key, d.present, d.uploadedBy, d.uploadedAt]), [['work', true, null, null], ['need', true, null, null]]);
  const duplicates = setup({files: [fakeFile(WORK), fakeFile(WORK)]});
  assert.equal(duplicates.c.documentStatusList_(team, true, duplicates.c.activityContext_())[0].present, false, 'two live files do not count as present');
  const missing = setup();
  missing.c.activityDriveFolder_ = () => ({absent: true});
  assert.deepEqual(plain(missing.c.documentStatusList_(team, true, missing.c.activityContext_())).map(d => d.present), [false, false]);
});

test('the upload capability: students only, not under review, folder present, requirements from document.upload', () => {
  const env = setup();
  const team = {teamId: 'T1', semester: 'Odd'};
  const state = status => ({status});
  const cap = (roles, status) => plain(env.c.documentUploadCapability_(state(status), roles, team, env.c.activityContext_()));
  assert.equal(cap({student: true}, 'NOT_SUBMITTED').allowed, true);
  assert.equal(cap({student: true}, 'RETURNED').allowed, true);
  assert.match(cap({guide: true}, 'NOT_SUBMITTED').reason, /member of this team/);
  assert.match(cap({student: true}, 'NEEDS_REVIEW').reason, /under review/);
  env.setGate({allowed: false, reason: 'GitHub: waiting', requirements: [{label: 'GitHub', met: false, reason: 'waiting', diagnostic: 'GITHUB_ERROR'}]});
  const gated = cap({student: true}, 'NOT_SUBMITTED');
  assert.equal(gated.allowed, false);
  assert.equal(gated.activity, 'document.upload');
  assert.ok(!JSON.stringify(gated).includes('diagnostic'));
});

test('source rules: one public function, and the file only touches the team folder through the shared lookup', () => {
  const text = fs.readFileSync('team-document-upload.js', 'utf8');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, ['API_student_uploadDocument']);
  assert.doesNotMatch(text, /DriveApp\.|SpreadsheetApp|MailApp|setValues/);
});
