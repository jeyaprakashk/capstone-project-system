// The pure rules of the template-document submission (document-service.js) and the file checks (document-files.js).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const {byteUtilities, office, makeZip, signed} = require('./zip-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  const context = vm.createContext({console, normalizeText_: value => String(value === null || value === undefined ? '' : value).trim().toLowerCase(), Utilities: byteUtilities(crypto),
    apiFail_: (code, message) => Object.assign(new Error(message), {apiCode: code})});
  ['document-service.js', 'document-files.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return context;
}
const c = load();
const row = (revision, action) => ({revision, action});
const roles = (...names) => ({roles: Object.fromEntries(names.map(name => [name, true]))});

test('the status of a document follows its rows, with the project vocabulary', () => {
  const status = rows => plain(c.documentStateFromRows_(rows)).status;
  assert.equal(status([]), 'NOT_SUBMITTED');
  assert.equal(status([row(1, 'SUBMIT')]), 'NEEDS_REVIEW');
  assert.equal(status([row(1, 'SUBMIT'), row(2, 'APPROVE')]), 'APPROVED');
  assert.equal(status([row(1, 'SUBMIT'), row(2, 'RETURN')]), 'RETURNED');
  assert.equal(status([row(1, 'SUBMIT'), row(2, 'APPROVE'), row(3, 'REOPEN')]), 'REOPENED');
  assert.equal(status([row(1, 'SUBMIT'), row(2, 'APPROVE'), row(3, 'REOPEN'), row(4, 'SUBMIT'), row(5, 'RETURN'), row(6, 'SUBMIT')]), 'NEEDS_REVIEW');
  assert.equal(status([row(1, 'REOPEN')]), 'REOPENED', 'a history that starts with a REOPEN (from before hand-placed files were retired) stays readable');
  assert.ok(!Object.values(plain(vm.runInContext('DOCUMENT_STATUS_AFTER_', c))).includes('REJECTED'), 'REJECTED is an error code, never a status');
});

test('a history that breaks the rules makes only that document UNAVAILABLE', () => {
  for (const rows of [[row(2, 'SUBMIT')], [row(1, 'SUBMIT'), row(1, 'APPROVE')], [row(1, 'SUBMIT'), row(3, 'APPROVE')], [row(1, 'APPROVE')], [row(1, 'SUBMIT'), row(2, 'SUBMIT')],
    [row(1, 'SUBMIT'), row(2, 'REOPEN')], [row(1, 'SUBMIT'), row(2, 'LOOK')]]) {
    const state = plain(c.documentStateFromRows_(rows));
    assert.equal(state.status, 'UNAVAILABLE', JSON.stringify(rows));
    assert.ok(state.errors.length);
  }
});

test('a document with no row is not submitted, whatever stands in the team folder', () => {
  assert.deepEqual(plain(c.documentStateFromRows_([])), {status: 'NOT_SUBMITTED', revision: 0, last: null, errors: []});
  assert.equal(vm.runInContext('typeof documentStateFor_', c), 'undefined', 'the file count no longer decides a status');
  assert.equal('existing' in plain(c.documentStateFromRows_([row(1, 'SUBMIT')])), false);
  assert.equal(c.documentCanDo_({status: 'NOT_SUBMITTED'}, 'reopen', roles('coordinator')).allowed, false, 'a reopen needs an approved document, so no new first-row REOPEN can be written');
});

test('who may do what in which status, with the project error codes', () => {
  const can = (status, action, user, extra) => plain(c.documentCanDo_({status}, action, user, extra));
  const yes = {allowed: true, reason: '', code: ''};
  const changed = {teamChanged: 'Yes', label: 'Step1.docx'};
  for (const status of ['NOT_SUBMITTED', 'RETURNED', 'REOPENED']) assert.deepEqual(can(status, 'submit', roles('student'), changed), yes, status);
  assert.deepEqual([can('NEEDS_REVIEW', 'submit', roles('student'), changed).code, can('APPROVED', 'submit', roles('student'), changed).code], ['REJECTED', 'REJECTED']);
  assert.equal(can('NOT_SUBMITTED', 'submit', roles('guide'), changed).code, 'UNAUTHORIZED');
  assert.equal(can('NOT_SUBMITTED', 'submit', roles('student'), {teamChanged: 'No'}).code, 'REJECTED');
  assert.equal(can('NOT_SUBMITTED', 'submit', roles('student'), {teamChanged: 'No'}).reason, 'No team member has changed this file yet.');
  const unchecked = can('NOT_SUBMITTED', 'submit', roles('student'), {teamChanged: ''});
  assert.deepEqual([unchecked.code, unchecked.reason], ['REJECTED', 'This file has not been checked yet.'], 'no scan record is not reported as "no change"');
  for (const status of ['NOT_SUBMITTED', 'RETURNED', 'REOPENED']) {
    for (const teamChanged of ['No', '', 'Unknown']) assert.deepEqual(can(status, 'check', roles('student'), {teamChanged}), yes, status + ' ' + teamChanged);
  }
  assert.equal(can('NOT_SUBMITTED', 'check', roles('student'), changed).code, 'REJECTED', 'nothing to check: Submit is offered');
  assert.equal(can('NEEDS_REVIEW', 'check', roles('student'), {teamChanged: 'No'}).code, 'REJECTED');
  assert.equal(can('APPROVED', 'check', roles('student'), {teamChanged: 'No'}).code, 'REJECTED');
  for (const role of ['guide', 'reviewer', 'coordinator']) assert.equal(can('NOT_SUBMITTED', 'check', roles(role), {teamChanged: 'No'}).code, 'UNAUTHORIZED', role);
  assert.equal(can('UNAVAILABLE', 'check', roles('student'), {teamChanged: 'No'}).code, 'UNAVAILABLE');
  const unknown = can('NOT_SUBMITTED', 'submit', roles('student'), {teamChanged: 'Unknown', label: 'Step1.docx'});
  assert.deepEqual([unknown.code, unknown.reason], ['UNAVAILABLE', 'Could not verify: Step1.docx. Try again later.']);
  for (const action of ['approve', 'return']) {
    assert.deepEqual(can('NEEDS_REVIEW', action, roles('guide')), yes);
    assert.equal(can('NEEDS_REVIEW', action, roles('student')).code, 'UNAUTHORIZED');
    assert.equal(can('NEEDS_REVIEW', action, roles('coordinator')).code, 'UNAUTHORIZED');
    assert.equal(can('APPROVED', action, roles('guide')).code, 'REJECTED');
  }
  assert.deepEqual(can('APPROVED', 'reopen', roles('coordinator')), yes);
  assert.equal(can('APPROVED', 'reopen', roles('guide')).code, 'UNAUTHORIZED');
  assert.equal(can('RETURNED', 'reopen', roles('coordinator')).code, 'REJECTED');
  assert.equal(can('UNAVAILABLE', 'submit', roles('student'), changed).code, 'UNAVAILABLE');
});

test('inputs are normalized, notes and reasons are required, and a bad commit is INVALID_INPUT', () => {
  const code = (action, input) => { try { c.documentInputFor_(action, input); return ''; } catch (error) { return error.apiCode; } };
  assert.deepEqual(plain(c.documentInputFor_('submit', {expectedCommit: ' ABCDEF1234 '})), {expectedCommit: 'abcdef1234'});
  assert.equal(code('submit', {}), 'INVALID_INPUT');
  assert.equal(code('submit', {expectedCommit: 'zzz'}), 'INVALID_INPUT');
  assert.deepEqual(plain(c.documentInputFor_('approve', {anything: 1})), {});
  assert.equal(code('return', {notes: '   '}), 'INVALID_INPUT');
  assert.equal(code('return', {notes: 'x'.repeat(2001)}), 'INVALID_INPUT');
  assert.deepEqual(plain(c.documentInputFor_('return', {notes: '  fix the table '})), {notes: 'fix the table'});
  assert.equal(code('reopen', {}), 'INVALID_INPUT');
  assert.deepEqual(plain(c.documentInputFor_('reopen', {reason: ' correction '})), {reason: 'correction'});
  assert.equal(code('nonsense', {}), 'INVALID_INPUT');
});

test('the fingerprint covers the action, team, document and the action\'s own input', () => {
  const f = (action, team, doc, input) => c.documentFingerprint_(action, team, doc, input);
  const base = f('return', 'T1', 'doc-0001', {notes: 'a'});
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(f('return', ' t1 ', 'doc-0001', {notes: 'a'}), base, 'the team is compared as the project compares teams');
  assert.notEqual(f('return', 'T1', 'doc-0001', {notes: 'b'}), base);
  assert.notEqual(f('return', 'T1', 'doc-0002', {notes: 'a'}), base);
  assert.notEqual(f('return', 'T2', 'doc-0001', {notes: 'a'}), base);
  assert.notEqual(f('reopen', 'T1', 'doc-0001', {reason: 'a'}), base);
  assert.notEqual(f('submit', 'T1', 'doc-0001', {expectedCommit: 'abc1234'}), f('submit', 'T1', 'doc-0001', {expectedCommit: 'abc1235'}));
  assert.notEqual(f('approve', 'T1', 'doc-0001', {}), f('return', 'T1', 'doc-0001', {notes: ''}));
});

test('the next row carries the revision, the action and, for a submission, the commit facts', () => {
  const facts = {teamId: 'T1', documentId: 'doc-0001', fileName: 'A.docx', now: Date.parse('2030-01-01T00:00:00Z'), actor: 'a@x', requestId: 'r1', fingerprint: 'f1',
    commitSha: 'c1', commitAuthor: 'bob', commitAuthorId: '102', teamCommitSha: 'c0', teamCommitAuthor: 'ann', teamCommitAuthorId: '101', blobSha: 'b1', driveFileId: 'file1'};
  const submit = plain(c.documentNextRow_({revision: 0}, 'submit', {expectedCommit: 'c1'}, facts));
  assert.deepEqual([submit.revision, submit.action, submit.commitSha, submit.teamCommitAuthor, submit.driveFileId, submit.notes], [1, 'SUBMIT', 'c1', 'ann', 'file1', '']);
  const returned = plain(c.documentNextRow_({revision: 1}, 'return', {notes: 'fix'}, facts));
  assert.deepEqual([returned.revision, returned.action, returned.notes, returned.commitSha], [2, 'RETURN', 'fix', '']);
  assert.equal(plain(c.documentNextRow_({revision: 2}, 'reopen', {reason: 'why'}, facts)).notes, 'why');
  assert.equal(plain(c.documentWriteResult_('return', returned)).status, 'RETURNED');
});

// ---- the file checks -------------------------------------------------------------------------------------------------------

const bytes = buffer => signed(buffer);
const problem = (buffer, extension) => c.documentFileProblem_(bytes(buffer), extension);

test('a valid Word, PowerPoint or PDF file passes', () => {
  assert.equal(problem(office('docx'), 'docx'), '');
  assert.equal(problem(office('pptx'), 'pptx'), '');
  assert.equal(problem(Buffer.from('%PDF-1.7\nbody\n%%EOF\n'), 'pdf'), '');
});

test('an empty file, a file of another kind, or a file that is not an Office package is refused with a plain sentence', () => {
  assert.equal(c.documentFileProblem_([], 'docx'), 'The file is empty.');
  assert.match(problem(Buffer.from('plain text'), 'docx'), /could not be opened/);
  assert.match(problem(office('pptx'), 'docx'), /contents are of another kind/);
  assert.match(problem(office('docx'), 'pptx'), /contents are of another kind/);
  assert.match(problem(makeZip({'a.txt': 'x'}), 'docx'), /contents are of another kind/);
  assert.match(c.documentFileProblem_([1], 'exe'), /cannot be submitted/);
});

test('macros, too many parts and a size above the limit are refused', () => {
  assert.match(problem(office('docx', {'word/vbaProject.bin': 'x'}), 'docx'), /macros/);
  assert.match(problem(makeZip({'[Content_Types].xml': '<Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>', 'word/document.xml': '<d/>'}), 'docx'), /macros/);
  const many = Object.fromEntries(Array.from({length: 2001}, (_, index) => ['part' + index + '.xml', 'x']));
  assert.match(problem(makeZip(Object.assign({'[Content_Types].xml': '<T/>', 'word/document.xml': '<d/>'}, many)), 'docx'), /too many parts/);
  assert.match(c.documentFileProblem_(new Array(10 * 1024 * 1024 + 1).fill(1), 'pdf'), /larger than 10 MB/);
});

test('a PDF must start properly, end properly and not be password protected', () => {
  assert.match(problem(Buffer.from('not a pdf at all'), 'pdf'), /not a valid PDF/);
  assert.match(problem(Buffer.from('%PDF-1.4\nbody without an end'), 'pdf'), /incomplete/);
  assert.match(problem(Buffer.from('%PDF-1.4\n<< /Encrypt 5 0 R >>\n%%EOF'), 'pdf'), /password/);
});
