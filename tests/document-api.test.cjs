// The template-document endpoints end to end (document-api.js, document-write.js, document-journal.js, document-drive.js, document-github.js):
// the real code runs on the in-memory sheets of the weekly fixture, a faked GitHub, and a faked Drive (DriveApp folders and the v3 advanced service).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const {weeklyFixture} = require('./weekly-progress-fixture.cjs');
const {byteUtilities, office, signed} = require('./zip-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const STEP1 = '1_Documents/Step1_Work_Breakdown.docx', STEP2 = '1_Documents/Step2_Need_Analysis.docx';
const BASE1 = '68fa810f28c67de66c97a0d0140e2b70c0dcf54f';
const ANN = 101, BOB = 102, ADMIN = 900;
const TEMPLATE_HEADERS = ['Document ID', 'Folder', 'File Name', 'Extension', 'First Seen', 'Last Seen', 'Active', 'In Team Template', 'Name Conflict'];
const FILES = ['document-sheets.js', 'template-files.js', 'team-files.js', 'document-service.js', 'document-journal.js', 'document-files.js', 'document-github.js', 'document-drive.js',
  'document-write.js', 'document-api.js', 'document-setup.js', 'github-provisioning.js', 'api-envelope.js', 'student-api.js', 'title-api.js'];
const commit = (sha, id, login, date) => ({sha, author: id === null ? null : {id, login: login || 'user' + id}, commit: {author: {date: date || '2030-01-02T03:04:05Z'}}});

function setup() {
  const f = weeklyFixture();
  FILES.forEach(name => vm.runInContext(fs.readFileSync(name, 'utf8'), f.c, {filename: name}));
  Object.assign(f.c.Utilities, byteUtilities(crypto));
  f.c.requireTriggerOrOperator_ = () => {};
  f.c.setupDocumentStorage();
  f.set('Guide Email', 'guide@example.com');
  const templateRows = f.sheets.get('TemplateFiles').rows;
  [['doc-0001', STEP1], ['doc-0002', STEP2]].forEach(([id, path]) => {
    const [folder, fileName] = path.split('/');
    const values = {'Document ID': id, Folder: folder, 'File Name': fileName, Extension: 'docx', 'First Seen': 't', 'Last Seen': 't', Active: 'Yes', 'In Team Template': 'Yes', 'Name Conflict': 'No'};
    templateRows.push(TEMPLATE_HEADERS.map(header => values[header]));
  });
  // GitHub
  const github = {calls: [], down: false, repo: {branch: 'master', files: {}, commits: {}}};
  const blobs = new Map();
  f.c.makeGithubRequest_ = (method, path) => {
    github.calls.push(path);
    if (github.down) return {status: 502, body: null};
    const repo = github.repo, base = '/repos/org/team';
    if (path === base) return {status: 200, body: {default_branch: repo.branch}};
    if (path.startsWith(base + '/git/trees/')) return {status: 200, body: {truncated: false, tree: Object.entries(repo.files).map(([file, info]) => ({path: file, type: 'blob', sha: info.sha}))}};
    if (path.startsWith(base + '/git/blobs/')) {
      const found = blobs.get(decodeURIComponent(path.split('/git/blobs/')[1]));
      return found ? {status: 200, body: {content: found.toString('base64'), encoding: 'base64'}} : {status: 404, body: null};
    }
    if (path.startsWith(base + '/contents/')) {
      const file = decodeURIComponent(path.split('/contents/')[1].split('?')[0]), info = repo.files[file];
      return info ? {status: 200, body: {sha: info.sha, size: info.content.length}} : {status: 404, body: null};
    }
    if (path.startsWith(base + '/commits?')) {
      const url = new URL('https://x' + path), file = url.searchParams.get('path'), per = Number(url.searchParams.get('per_page') || 100), page = Number(url.searchParams.get('page') || 1);
      return {status: 200, body: (repo.commits[file] || []).slice((page - 1) * per, page * per)};
    }
    return {status: 404, body: null};
  };
  const setFile = (path, content, commits) => {
    const sha = crypto.createHash('sha1').update(content).digest('hex');
    github.repo.files[path] = {sha, content};
    blobs.set(sha, content);
    github.repo.commits[path] = commits;
  };
  // Drive
  const drive = {files: [], revisionsKept: [], folder: null, nextId: 1};
  const makeFile = (name, content, description) => {
    const file = {id: 'file' + drive.nextId++, name, content, description: description || '', revisions: [{keep: false}], trashed: false};
    file.getId = () => file.id; file.getUrl = () => 'https://drive.example/' + file.id; file.getDescription = () => file.description;
    drive.files.push(file);
    return file;
  };
  drive.folder = {getId: () => 'folder1', getName: () => 'team', getUrl: () => 'https://drive.example/folder1',
    getFilesByName: name => { const list = drive.files.filter(file => file.name === name && !file.trashed); let i = 0; return {hasNext: () => i < list.length, next: () => list[i++]}; }};
  f.c.findTeamFolder_ = () => drive.folder;
  f.c.Drive = {
    Files: {
      create: (resource, blob) => { const file = makeFile(resource.name, blob.bytes, resource.description); return {id: file.id}; },
      update: (resource, id, blob) => { const file = drive.files.find(candidate => candidate.id === id); if (resource.description !== undefined) file.description = resource.description; file.content = blob.bytes; file.revisions.push({keep: false}); return {id}; }
    },
    Revisions: {
      list: id => ({revisions: drive.files.find(file => file.id === id).revisions.map((_, index) => ({id: 'rev' + index}))}),
      update: (resource, id, revisionId) => { const file = drive.files.find(candidate => candidate.id === id); file.revisions[Number(revisionId.slice(3))].keep = !!resource.keepForever; drive.revisionsKept.push([id, revisionId]); }
    }
  };
  const journal = () => f.sheets.get('DocumentSubmissions');
  const rows = () => journal().rows.slice(1).map(row => Object.fromEntries(journal().rows[0].map((header, index) => [header, row[index]])));
  const call = (user, fn, ...args) => { f.user(user); return JSON.parse(f.c[fn](...args)); };
  const env = {f, github, drive, journal, rows, makeFile, setFile, call, counter: 0};
  env.id = () => 'request-' + (++env.counter) + '-' + 'x'.repeat(12);
  // a team change: both documents changed by Bob, the administrator committed on top of the first
  setFile(STEP1, office('docx'), [commit('c200002', ADMIN, 'admin'), commit('c100001', BOB, 'bob')]);
  setFile(STEP2, office('docx', {'word/extra.xml': 'x'}), [commit('d100001', ANN, 'alice')]);
  f.c.scanTeamFiles();
  return env;
}

const STUDENT = 'one@example.com', GUIDE = 'guide@example.com', COORD = 'coord@example.com', STRANGER = 'nobody@example.com';
const submit = (env, extra = {}) => env.call(STUDENT, 'API_student_submitDocument', Object.assign({requestId: env.id(), expectedRevision: 0, documentId: 'doc-0001', expectedCommit: 'c200002'}, extra));
const documents = (env, user, teamId) => env.call(user, 'API_documents_get', teamId);
const doc = (dto, id) => dto.data.documents.find(item => item.documentId === id);

test('preview shows the latest commit and who made it; the setup creates the journal sheet', () => {
  const env = setup();
  assert.deepEqual(Array.from(env.journal().rows[0]).slice(0, 6), ['Timestamp', 'Team ID', 'Document ID', 'File Name', 'Revision', 'Action']);
  const preview = env.call(STUDENT, 'API_student_previewDocument', {documentId: 'doc-0001'});
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.data.commit, {sha: 'c200002', shortSha: 'c200002', date: '2030-01-02T03:04:05Z', author: {name: null, login: 'admin', outsideMember: true}});
  assert.deepEqual(preview.data.lastTeamChange, {name: 'Two', login: 'bob', outsideMember: false});
});

test('a student submits: the file lands in the team folder with its record, and the journal row says who and which commit', () => {
  const env = setup();
  const result = submit(env);
  assert.deepEqual(plain(result), {ok: true, data: {ok: true, revision: 1, status: 'NEEDS_REVIEW', message: 'Document submitted for guide review.'}, generatedAt: result.generatedAt});
  assert.equal(env.drive.files.length, 1);
  const file = env.drive.files[0];
  assert.equal(file.name, 'Step1_Work_Breakdown.docx');
  assert.deepEqual(file.content, signed(office('docx')));
  const record = JSON.parse(file.description);
  assert.deepEqual([record.v, record.teamId, record.documentId, record.revision, record.commitSha, record.commitAuthor, record.teamCommitSha, record.teamCommitAuthor, record.actor],
    [1, 'T1', 'doc-0001', 1, 'c200002', 'admin', 'c100001', 'bob', STUDENT]);
  const [row] = env.rows();
  assert.deepEqual([row['Team ID'], row['Document ID'], String(row.Revision), row.Action, row.Actor, row['Commit SHA'], row['Commit Author'], row['Commit Author ID'], row['Team Commit SHA'], row['Team Commit Author ID'], row['Drive File ID']],
    ['T1', 'doc-0001', '1', 'SUBMIT', STUDENT, 'c200002', 'admin', '900', 'c100001', '102', file.id]);
  assert.match(row.Fingerprint, /^[0-9a-f]{64}$/);
});

test('only a member of the team can submit, and a stranger learns nothing, even with a used request ID', () => {
  const env = setup();
  const first = submit(env, {requestId: 'shared-request-id'});
  assert.equal(first.ok, true);
  for (const user of [STRANGER, GUIDE, COORD]) {
    const refused = env.call(user, 'API_student_submitDocument', {requestId: 'shared-request-id', expectedRevision: 0, documentId: 'doc-0001', expectedCommit: 'c200002'});
    assert.deepEqual([refused.ok, refused.error.code], [false, 'NOT_FOUND'], user);
  }
  assert.equal(env.call('', 'API_student_submitDocument', {}).error.code, 'UNAUTHENTICATED');
  assert.equal(env.rows().length, 1);
});

test('a repeated request returns the stored result without touching GitHub or Drive; a different input with the same ID is a CONFLICT', () => {
  const env = setup();
  const requestId = 'repeat-request-1234';
  const first = submit(env, {requestId});
  env.github.calls.length = 0; env.github.down = true;
  const again = submit(env, {requestId});
  assert.deepEqual(plain(again.data), plain(first.data));
  assert.equal(env.github.calls.length, 0, 'the stored result needs no GitHub call');
  assert.equal(env.drive.files[0].revisions.length, 1);
  const other = submit(env, {requestId, expectedCommit: 'c900009'});
  assert.deepEqual([other.ok, other.error.code], [false, 'CONFLICT']);
  assert.equal(env.rows().length, 1);
});

test('a newer commit, an unchanged file, a file that is not in the repository and GitHub failing are each refused with their code and write nothing', () => {
  const env = setup();
  const stale = submit(env, {expectedCommit: 'c100001'});
  assert.deepEqual([stale.error.code, stale.error.message], ['CONFLICT', 'A newer version was committed. Review it and submit again.']);
  // the team never changed STEP2: its first commit is the administrator's and holds the same content
  env.github.repo.commits[STEP2] = [commit('d100001', ADMIN, 'admin'), commit('d000001', ADMIN, 'admin')];
  assert.equal(submit(env, {documentId: 'doc-0002', expectedCommit: 'd100001'}).error.code, 'REJECTED');
  delete env.github.repo.files[STEP2];
  assert.match(submit(env, {documentId: 'doc-0002', expectedCommit: 'd100001'}).error.message, /not in your team repository/);
  env.github.down = true;
  const down = submit(env);
  assert.deepEqual([down.error.code, down.error.message], ['UNAVAILABLE', 'Could not verify: Step1_Work_Breakdown.docx. Try again later.']);
  assert.equal(env.rows().length, 0);
  assert.equal(env.drive.files.length, 0);
});

test('a file that is not a genuine document of its kind is INVALID_INPUT and writes nothing', () => {
  for (const [name, content, pattern] of [['not a zip', Buffer.from('plain text'), /could not be opened/], ['a PowerPoint renamed', office('pptx'), /contents are of another kind/],
    ['macros', office('docx', {'word/vbaProject.bin': 'x'}), /macros/], ['empty', Buffer.alloc(0), /empty/]]) {
    const env = setup();
    env.setFile(STEP1, content, [commit('c200002', BOB, 'bob')]);
    env.f.c.scanTeamFiles();
    const refused = submit(env);
    assert.deepEqual([refused.ok, refused.error.code], [false, 'INVALID_INPUT'], name);
    assert.match(refused.error.message, pattern, name);
    assert.equal(env.rows().length + env.drive.files.length, 0, name);
  }
});

test('the guide approves or returns (with notes); a return can be submitted again; a stale revision is a CONFLICT', () => {
  const env = setup();
  submit(env);
  const decide = (extra, user = GUIDE) => env.call(user, 'API_guide_decideDocument', Object.assign({requestId: env.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 1, decision: 'return', notes: 'Fix the table.'}, extra));
  assert.deepEqual([decide({notes: ' '}).ok, decide({notes: ' '}).error.code], [false, 'INVALID_INPUT']);
  assert.equal(decide({decision: 'accept'}).error.code, 'INVALID_INPUT');
  assert.equal(decide({}, STUDENT).error.code, 'UNAUTHORIZED');
  assert.equal(decide({expectedRevision: 0}).error.code, 'CONFLICT');
  const returned = decide({});
  assert.equal(returned.data.status, 'RETURNED');
  assert.equal(doc(documents(env, STUDENT), 'doc-0001').returnedNotes, 'Fix the table.');
  assert.equal(doc(documents(env, STUDENT), 'doc-0001').can.submit.allowed, true);
  env.setFile(STEP1, office('docx', {'word/more.xml': 'y'}), [commit('c300003', ANN, 'alice'), commit('c200002', ADMIN, 'admin'), commit('c100001', BOB, 'bob')]);
  env.f.c.scanTeamFiles();
  const again = submit(env, {expectedRevision: 2, expectedCommit: 'c300003'});
  assert.deepEqual([again.data.revision, again.data.status], [3, 'NEEDS_REVIEW']);
  assert.equal(env.drive.files.length, 1, 'one file, updated in place');
  assert.equal(env.drive.files[0].revisions.length, 2);
  assert.equal(env.drive.files[0].revisions[0].keep, true, 'the earlier content is kept forever');
  const approved = decide({expectedRevision: 3, decision: 'approve', notes: ''});
  assert.equal(approved.data.status, 'APPROVED');
  assert.deepEqual(env.rows().map(row => row.Action), ['SUBMIT', 'RETURN', 'SUBMIT', 'APPROVE']);
  assert.equal(decide({expectedRevision: 4, decision: 'approve'}).error.code, 'REJECTED');
});

test('a file with no row is not submitted; a submit overwrites it in place and keeps the earlier content', () => {
  const env = setup();
  const placed = env.makeFile('Step1_Work_Breakdown.docx', signed(Buffer.from('placed earlier')), '');
  const before = doc(documents(env, STUDENT), 'doc-0001');
  assert.deepEqual([before.status, 'existing' in before, before.link, before.revision], ['NOT_SUBMITTED', false, 'https://drive.example/' + placed.id, 0]);
  assert.equal(doc(documents(env, COORD, 'T1'), 'doc-0001').link, '', 'the coordinator sees no link until the content is approved');
  const reopen = env.call(COORD, 'API_coordinator_reopenDocument', {requestId: env.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 0, reason: 'New version needed'});
  assert.equal(reopen.error.code, 'REJECTED', 'only an approved document can be reopened');
  const next = submit(env);
  assert.deepEqual([next.data.revision, next.data.status], [1, 'NEEDS_REVIEW']);
  assert.equal(env.drive.files.length, 1);
  assert.equal(env.drive.files[0].id, placed.id, 'the file is updated in place');
  assert.equal(env.drive.files[0].revisions[0].keep, true);
});

test('two files of the same name in the team folder stop every action with UNAVAILABLE', () => {
  const env = setup();
  env.makeFile('Step1_Work_Breakdown.docx', [1], ''); env.makeFile('Step1_Work_Breakdown.docx', [2], '');
  const refused = submit(env);
  assert.deepEqual([refused.error.code, /more than one file/.test(refused.error.message)], ['UNAVAILABLE', true]);
  assert.equal(doc(documents(env, STUDENT), 'doc-0001').status, 'NOT_SUBMITTED');
});

// ---- interruption and settlement -------------------------------------------------------------------------------------------

function failNextAppend(env) {
  const sheet = env.journal(), getRange = sheet.getRange;
  let armed = true;
  sheet.getRange = (...args) => {
    const range = getRange(...args), setValues = range.setValues;
    return Object.assign(range, {setValues: values => { if (armed) { armed = false; throw new Error('Service error'); } return setValues.call(range, values); }});
  };
  return () => { sheet.getRange = getRange; };
}

test('a stop between the Drive write and the journal row is settled by the retry with the same request ID, and Drive is written once', () => {
  const env = setup();
  const restore = failNextAppend(env);
  const requestId = 'interrupted-request-1';
  const failed = submit(env, {requestId});
  assert.deepEqual([failed.ok, failed.error.code], [false, 'UNAVAILABLE']);
  assert.equal(env.rows().length, 0);
  assert.equal(env.drive.files.length, 1);
  restore();
  const retry = submit(env, {requestId});
  assert.deepEqual([retry.ok, retry.data.revision, retry.data.status], [true, 1, 'NEEDS_REVIEW']);
  assert.equal(env.drive.files.length, 1);
  assert.equal(env.drive.files[0].revisions.length, 1, 'no second write');
  assert.deepEqual(env.rows().map(row => [row.Action, row['Request ID'], row.Notes]), [['SUBMIT', requestId, 'Recorded after an interruption.']]);
});

test('another request settles an outstanding write first and is then refused as stale; a guide decision settles first too', () => {
  const env = setup();
  const restore = failNextAppend(env);
  submit(env, {requestId: 'first-interrupted-1'});
  restore();
  const other = submit(env, {requestId: 'someone-else-12345'});
  assert.deepEqual([other.ok, other.error.code], [false, 'CONFLICT']);
  assert.deepEqual(env.rows().map(row => row['Request ID']), ['first-interrupted-1'], 'the interrupted submission is on the journal and the file still matches it');
  assert.equal(env.drive.files[0].revisions.length, 1);
  const again = setup();
  const undo = failNextAppend(again);
  submit(again, {requestId: 'interrupted-two-123'});
  undo();
  const decision = again.call(GUIDE, 'API_guide_decideDocument', {requestId: again.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 1, decision: 'approve'});
  assert.equal(decision.data.status, 'APPROVED');
  assert.deepEqual(again.rows().map(row => row.Action), ['SUBMIT', 'APPROVE']);
});

test('a description that is empty, hand-edited or belongs to another document settles nothing', () => {
  for (const description of ['', 'not json', JSON.stringify({v: 1, requestId: 'x-req', teamId: 'T1', documentId: 'doc-0002', revision: 1}), JSON.stringify({v: 1, requestId: 'x-req', teamId: 'T1', documentId: 'doc-0001', revision: 5})]) {
    const env = setup();
    env.makeFile('Step1_Work_Breakdown.docx', [1], description);
    const dto = doc(documents(env, STUDENT), 'doc-0001');
    assert.equal(dto.status, 'NOT_SUBMITTED', description);
    assert.deepEqual(env.rows(), [], description);
  }
});

test('a failing keep-forever step stops before the file is written', () => {
  const env = setup();
  const placed = env.makeFile('Step1_Work_Breakdown.docx', [7], '');
  env.f.c.Drive.Revisions.update = () => { throw new Error('Drive down'); };
  const refused = submit(env);
  assert.equal(refused.ok, false);
  assert.deepEqual(placed.content, [7]);
  assert.deepEqual(env.rows(), []);
});

// ---- reading -----------------------------------------------------------------------------------------------------------------

test('the statuses, links and lines each viewer sees', () => {
  const env = setup();
  submit(env);
  const asStudent = doc(documents(env, STUDENT), 'doc-0001'), asGuide = doc(documents(env, GUIDE, 'T1'), 'doc-0001'), asCoordinator = doc(documents(env, COORD, 'T1'), 'doc-0001');
  assert.deepEqual([asStudent.status, asStudent.state, asStudent.statusText], ['NEEDS_REVIEW', 'waiting', 'Submitted — awaiting the guide']);
  assert.ok(asStudent.link && asGuide.link, 'a student and the guide see the file while it waits');
  assert.equal(asCoordinator.link, '', 'the coordinator sees no link while the content is not approved');
  assert.deepEqual(asStudent.submittedBy, {name: 'One', at: asStudent.submittedBy.at});
  assert.equal(asGuide.submittedBy.email, STUDENT);
  assert.deepEqual(asGuide.commit.committedBy, {name: null, login: 'admin', outsideMember: true});
  assert.deepEqual(asGuide.commit.lastTeamChange, {name: 'Two', login: 'bob', outsideMember: false});
  assert.equal(JSON.stringify(asStudent).includes('@'), false, 'a student sees names and no e-mail address');
  assert.equal(asStudent.history.length, 0);
  assert.equal(asGuide.history.length, 1);
  assert.equal(asGuide.can.approve.allowed, true);
  assert.equal(asStudent.can.approve.allowed, false);
  env.call(GUIDE, 'API_guide_decideDocument', {requestId: env.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 1, decision: 'approve'});
  const reviewer = env.f.c.titleRolesFor_;
  env.f.c.titleRolesFor_ = (email, row, TS) => Object.assign(reviewer(email, row, TS), email === 'rev@example.com' ? {reviewer: true} : {});
  const asReviewer = doc(documents(env, 'rev@example.com', 'T1'), 'doc-0001');
  assert.ok(asReviewer.link, 'once approved, reviewers and the coordinator see the link');
  assert.ok(doc(documents(env, COORD, 'T1'), 'doc-0001').link);
  assert.equal(asReviewer.history.length, 0);
  assert.equal(JSON.stringify(asReviewer).includes('guide@example.com') || JSON.stringify(asReviewer).includes(STUDENT), false);
});

test('Submit is unavailable until a team member has changed the file, and the reason says so', () => {
  const env = setup();
  env.setFile(STEP2, office('docx'), [commit('d100001', ADMIN, 'admin')]);
  env.f.c.scanTeamFiles();
  const second = doc(documents(env, STUDENT), 'doc-0002');
  assert.deepEqual([second.teamChanged, second.can.submit.allowed, second.can.submit.reason], ['No', false, 'No team member has changed this file yet.']);
  assert.equal(doc(documents(env, STUDENT), 'doc-0001').can.submit.allowed, true);
  assert.deepEqual([second.can.submit.activity, second.can.submit.requirements], [null, []]);
  assert.deepEqual([second.can.check.allowed, doc(documents(env, STUDENT), 'doc-0001').can.check.allowed], [true, false], 'a live check is offered only while the scan says no');
  assert.equal(doc(documents(env, GUIDE, 'T1'), 'doc-0002').can.check.allowed, false);
});

test('a file the scan has not reached yet says "not checked yet", not "no change", and offers the live check', () => {
  const env = setup();
  env.f.sheets.get('TeamFileStatus').rows.splice(1);
  const second = doc(documents(env, STUDENT), 'doc-0002');
  assert.deepEqual([second.teamChanged, second.checkedAt, second.can.submit.allowed, second.can.submit.reason, second.can.check.allowed],
    ['', '', false, 'This file has not been checked yet.', true]);
});

test('a document whose history breaks the rules is UNAVAILABLE with can null, and the others still work', () => {
  const env = setup();
  submit(env);
  env.journal().rows.push(env.journal().rows[1].map((cell, index) => index === 4 ? '5' : cell));
  const dto = documents(env, STUDENT);
  assert.deepEqual([doc(dto, 'doc-0001').status, doc(dto, 'doc-0001').can, doc(dto, 'doc-0001').link, doc(dto, 'doc-0001').statusText],
    ['UNAVAILABLE', null, '', 'This document cannot be shown right now — contact the coordinator']);
  assert.equal(doc(dto, 'doc-0002').status, 'NOT_SUBMITTED');
  const refused = submit(env, {expectedRevision: 1});
  assert.equal(refused.error.code, 'UNAVAILABLE');
});

test('a student sees only their own team; a stranger is refused; an unreadable sheet is UNAVAILABLE', () => {
  const env = setup();
  assert.equal(documents(env, STUDENT).data.teamId, 'T1');
  assert.equal(documents(env, STUDENT, 'T2').error.code, 'UNAUTHORIZED', 'a student cannot ask for another team');
  assert.equal(documents(env, STRANGER).error.code, 'NOT_FOUND');
  assert.equal(documents(env, STRANGER, 'T1').error.code, 'UNAUTHORIZED');
  env.f.sheets.delete('TemplateFiles');
  env.f.c.invalidateSheetCaches_('TemplateFiles');
  assert.equal(documents(env, STUDENT).error.code, 'UNAVAILABLE');
});

test('the journal tolerates shuffled columns and an extra column', () => {
  const env = setup();
  submit(env);
  env.journal().rows.forEach((row, index) => { row.reverse(); row.splice(3, 0, index ? 'keep me' : 'Notes extra'); });
  const next = env.call(GUIDE, 'API_guide_decideDocument', {requestId: env.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 1, decision: 'return', notes: 'again'});
  assert.equal(next.data.status, 'RETURNED');
  assert.equal(doc(documents(env, STUDENT), 'doc-0001').returnedNotes, 'again');
  const header = env.journal().rows[0];
  assert.equal(env.journal().rows[1][header.indexOf('Notes extra')], 'keep me');
});

test('no document endpoint lets a student or a guide act as another role', () => {
  const env = setup();
  submit(env);
  const guideAsCoordinator = env.call(GUIDE, 'API_coordinator_reopenDocument', {requestId: env.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 1, reason: 'x'});
  assert.equal(guideAsCoordinator.error.code, 'UNAUTHORIZED');
  const studentAsGuide = env.call(STUDENT, 'API_guide_decideDocument', {requestId: env.id(), teamId: 'T1', documentId: 'doc-0001', expectedRevision: 1, decision: 'approve'});
  assert.equal(studentAsGuide.error.code, 'UNAUTHORIZED');
  assert.equal(env.rows().length, 1);
});
