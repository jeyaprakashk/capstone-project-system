// The one-time baseline of template files that stood in the team folders before document submission started (document-baseline.js).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const {byteUtilities} = require('./zip-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const DOCUMENTS = [{documentId: 'doc-0003', fileName: 'Step3.docx'}, {documentId: 'doc-0004', fileName: 'Step4.docx'}, {documentId: 'doc-0005', fileName: 'Step5.docx'}];

/** A fake world: teams -> {folder: bool, files: {fileName: count}}, journal rows by team|doc. */
function world({teams, rows = {}, throwOnRead = false}) {
  const appended = [], journal = {rows: [], rowsFor: (teamId, documentId) => rows[teamId + '|' + documentId] || []};
  const context = vm.createContext({
    console: {log() {}, error() {}}, Utilities: byteUtilities(crypto),
    normalizeText_: value => String(value === null || value === undefined ? '' : value).trim().toLowerCase(),
    apiFail_: (code, message) => Object.assign(new Error(message), {apiCode: code}),
    requireTriggerOrOperator_() {},
    SHEET_NAMES: {TEAM_STATUS: 'TeamStatus'}, FIELD_DEFINITIONS: {TEAM_STATUS: {}},
    getColumnMap_: () => ({TEAM_ID: 0, SEMESTER: 1}),
    getSheetRows_: () => Object.keys(teams).map(id => [id, 'Odd']),
    documentListed_: () => DOCUMENTS,
    readDocumentJournal_: () => { if (throwOnRead) throw new Error('journal unreadable'); return journal; },
    findTeamFolder_: teamId => (teams[teamId].folder === false ? null : {teamId}),
    documentDriveFiles_: (folder, fileName) => Array.from({length: teams[folder.teamId].files[fileName] || 0}, (_, n) => ({getId: () => folder.teamId + ':' + fileName + ':' + n})),
    appendDocumentRow_: (j, row) => { appended.push(plain(row)); const key = row.teamId + '|' + row.documentId; (rows[key] = rows[key] || []).push(row); },
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})}
  });
  ['document-service.js', 'document-baseline.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  vm.runInContext('const DOCUMENT_LOCK_WAIT_MS_ = 1;', context);
  return {context, appended, rows};
}

const outcomes = plan => Object.fromEntries(plain(plan).map(entry => [entry.teamId + ' ' + entry.documentId, entry.outcome]));

test('the plan has the five outcomes for the documents in scope and lists other files only as unbaselined', () => {
  const {context} = world({
    teams: {T1: {files: {'Step4.docx': 1, 'Step5.docx': 0, 'Step3.docx': 1}}, T2: {files: {'Step4.docx': 2, 'Step5.docx': 1}}, T3: {folder: false, files: {}}, T4: {files: {'Step4.docx': 1}}},
    rows: {'T4|doc-0004': [{revision: 1, action: 'SUBMIT'}]}
  });
  const sources = context.documentBaselineSources_();
  const plan = outcomes(context.documentBaselineRun_(sources));
  assert.deepEqual(plan, {
    'T1 doc-0003': 'unbaselined-file', 'T1 doc-0004': 'baseline', 'T1 doc-0005': 'skip-no-file',
    'T2 doc-0004': 'skip-ambiguous', 'T2 doc-0005': 'baseline',
    'T3 doc-0004': 'skip-no-folder', 'T3 doc-0005': 'skip-no-folder',
    'T4 doc-0004': 'skip-has-rows', 'T4 doc-0005': 'skip-no-file'
  });
});

test('a baselined document reads as approved at revision 2, with no commit facts and the Drive file ID', () => {
  const {context} = world({teams: {T1: {files: {'Step4.docx': 1}}}});
  const rows = plain(context.documentBaselineRows_({teamId: 'T1', documentId: 'doc-0004', fileName: 'Step4.docx', fileId: 'F9'}, Date.UTC(2026, 9, 13)));
  assert.deepEqual(rows.map(row => [row.revision, row.action, row.actor]), [[1, 'SUBMIT', 'baseline'], [2, 'APPROVE', 'baseline']]);
  assert.equal(rows[0].driveFileId, 'F9');
  assert.equal(rows[1].driveFileId, '');
  assert.deepEqual([rows[0].commitSha, rows[0].commitAuthor, rows[0].blobSha, rows[0].fingerprint], ['', '', '', '']);
  assert.notEqual(rows[0].requestId, rows[1].requestId);
  const state = plain(context.documentStateFromRows_(rows));
  assert.deepEqual([state.status, state.revision, state.errors], ['APPROVED', 2, []]);
});

test('preview writes nothing; apply writes the pairs once and a second run adds nothing', () => {
  const {context, appended, rows} = world({teams: {T1: {files: {'Step4.docx': 1, 'Step5.docx': 1}}, T2: {files: {'Step4.docx': 0, 'Step3.docx': 1}}}});
  const preview = plain(context.previewDocumentBaseline());
  assert.deepEqual(preview.wouldBaseline, ['T1 doc-0004', 'T1 doc-0005']);
  assert.deepEqual(preview.unbaselinedFiles, ['T2 doc-0003 Step3.docx']);
  assert.equal(appended.length, 0);
  const first = plain(context.applyDocumentBaseline());
  assert.equal(first.written, 2);
  assert.equal(appended.length, 4);
  assert.deepEqual(appended.map(row => row.teamId + ' ' + row.documentId + ' ' + row.action), ['T1 doc-0004 SUBMIT', 'T1 doc-0004 APPROVE', 'T1 doc-0005 SUBMIT', 'T1 doc-0005 APPROVE']);
  assert.equal(plain(context.documentStateFromRows_(rows['T1|doc-0004'])).status, 'APPROVED');
  const second = plain(context.applyDocumentBaseline());
  assert.equal(second.written, 0);
  assert.equal(appended.length, 4, 'nothing is added the second time');
});

test('a team with rows is untouched; a document that is not listed or a journal that cannot be read stops the run with nothing written', () => {
  const {context, appended} = world({teams: {T1: {files: {'Step4.docx': 1}}}, rows: {'T1|doc-0004': [{revision: 1, action: 'SUBMIT'}]}});
  assert.equal(plain(context.applyDocumentBaseline()).written, 0);
  assert.equal(appended.length, 0);
  const unreadable = world({teams: {T1: {files: {'Step4.docx': 1}}}, throwOnRead: true});
  assert.throws(() => unreadable.context.applyDocumentBaseline(), /journal unreadable/);
  assert.equal(unreadable.appended.length, 0);
  const unlisted = world({teams: {T1: {files: {'Step4.docx': 1}}}});
  unlisted.context.documentListed_ = () => [DOCUMENTS[0]];
  assert.throws(() => unlisted.context.applyDocumentBaseline(), /not in the TemplateFiles list/);
  assert.equal(unlisted.appended.length, 0);
});

test('an unreadable file lookup is not guessed: the run stops', () => {
  const {context, appended} = world({teams: {T1: {files: {'Step4.docx': 1}}}});
  context.documentDriveFiles_ = () => { throw new Error('Drive down'); };
  assert.throws(() => context.applyDocumentBaseline(), /Drive down/);
  assert.equal(appended.length, 0);
});
