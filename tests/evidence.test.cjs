// The evidence sheets, the file rules and the Review gate (evidence.js, activity-engine.js; archive/plans/EVIDENCE-PLAN.md).
// The sheets are the in-memory fakes of the weekly fixture, so the real header-name code runs. The copy flow itself is tested end to end in document-api.test.cjs.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {weeklyFixture} = require('./weekly-progress-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const FOLDER_HEADERS = ['Evidence Folder', 'Document ID'];
const RULE_HEADERS = ['Activity ID', 'Evidence Folder', 'Minimum Files'];
const STATUS_HEADERS = ['Team ID', 'Document ID', 'Evidence Pending', 'Evidence Too Large', 'Checked At'];
const COPY_HEADERS = ['Team ID', 'Document ID', 'Evidence Folder', 'Path', 'Blob SHA', 'Size', 'Drive File ID', 'Committed At', 'First Committed At', 'Copied At'];
const FILES = ['github-provisioning.js', 'document-sheets.js', 'template-files.js', 'team-files.js', 'document-setup.js', 'evidence.js', 'activity-engine.js',
  'activity-check-github.js', 'activity-check-drive.js', 'activity-check-document.js', 'activity-check-title.js'];
const TEAM = {teamId: 'T1', semester: 'Odd'};
const SHEET = {folders: 'EvidenceFolders', rules: 'ActivityEvidences', copies: 'EvidenceCopies', status: 'EvidenceStatus'};

function setup() {
  const f = weeklyFixture();
  FILES.forEach(name => vm.runInContext(fs.readFileSync(name, 'utf8'), f.c, {filename: name}));
  f.c.requireTriggerOrOperator_ = () => {};
  f.c.getAssessmentDefinitions_ = () => [{key: 'review1', type: 'REVIEW', label: 'Review 1'}, {key: 'review2', type: 'REVIEW', label: 'Review 2'}];
  f.c.readActivityDependencyRows_ = () => ({present: true, headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'], rows: []});
  f.c.setupDocumentStorage();
  const env = {f};
  env.put = (key, headers, objects) => objects.forEach(object => f.sheets.get(SHEET[key]).rows.push(headers.map(header => object[header] === undefined ? '' : object[header])));
  env.folders = objects => env.put('folders', FOLDER_HEADERS, objects);
  env.rules = objects => env.put('rules', RULE_HEADERS, objects);
  env.copies = objects => env.put('copies', COPY_HEADERS, objects);
  env.status = objects => env.put('status', STATUS_HEADERS, objects);
  env.copy = (teamId, folder, name, extra = {}) => Object.assign({'Team ID': teamId, 'Document ID': 'doc-0001', 'Evidence Folder': folder, Path: '2_Evidence/' + folder + '/' + name,
    'Blob SHA': 'sha-' + name, Size: '10', 'Drive File ID': 'drive-' + name}, extra);
  env.gate = (activity, ctx) => f.c.activityPreconditions_(activity, TEAM, ctx || f.c.activityContext_());
  return env;
}

test('the catalog headers, the sheets and the code constants agree', () => {
  const {f} = setup();
  const constant = name => plain(vm.runInContext('Object.values(' + name + ')', f.c));
  assert.deepEqual(constant('EVIDENCE_FOLDERS_FIELDS_'), FOLDER_HEADERS);
  assert.deepEqual(constant('ACTIVITY_EVIDENCES_FIELDS_'), RULE_HEADERS);
  assert.deepEqual(constant('EVIDENCE_COPIES_FIELDS_'), COPY_HEADERS);
  assert.deepEqual(constant('EVIDENCE_STATUS_FIELDS_'), STATUS_HEADERS);
  for (const [key, name, headers, access] of [['evidenceFolders', 'EvidenceFolders', FOLDER_HEADERS, 'edit'], ['activityEvidences', 'ActivityEvidences', RULE_HEADERS, 'edit'],
    ['evidenceCopies', 'EvidenceCopies', COPY_HEADERS, 'view'], ['evidenceStatus', 'EvidenceStatus', STATUS_HEADERS, 'view']]) {
    assert.deepEqual(plain(f.c.sheetSpec_(key).headers), headers);
    assert.equal(f.c.sheetSpec_(key).access, access);
    assert.deepEqual(Array.from(f.sheets.get(name).rows[0]), headers);
  }
});

test('setupDocumentStorage creates the evidence sheets once, and a second run changes nothing', () => {
  const {f} = setup();
  const names = ['EvidenceFolders', 'ActivityEvidences', 'EvidenceCopies', 'EvidenceStatus'];
  const before = JSON.stringify(names.map(name => f.sheets.get(name).rows));
  const again = plain(f.c.setupDocumentStorage());
  assert.deepEqual([again.evidenceFolders.created, again.activityEvidences.created, again.evidenceCopies.created, again.evidenceStatus.created], [false, false, false, false]);
  assert.equal(JSON.stringify(names.map(name => f.sheets.get(name).rows)), before);
});

// ---- which files are evidence ----------------------------------------------------------------------------------------------

test('dot files, dot folders and README files are not evidence; everything else under a listed folder is, subfolders included', () => {
  const {f} = setup();
  const skipped = path => f.c.evidenceIsSkipped_(path);
  assert.deepEqual(['Req/.gitkeep', 'Req/.hidden/a.png', 'Req/README.md', 'Req/readme', 'Req/ReadMe.txt', 'Req/sub/README.MD'].map(skipped), [true, true, true, true, true, true]);
  assert.deepEqual(['Req/a.png', 'Req/readme-notes.pdf', 'Req/my.readme.md', 'Req/sub/b.docx'].map(skipped), [false, false, false, false]);
  const sizes = new Map(), blobs = new Map();
  [['2_Evidence/Requirements/a.png', 5], ['2_Evidence/Requirements/sub/b.pdf', 7], ['2_Evidence/Requirements/.gitkeep', 0], ['2_Evidence/Requirements/README.md', 3],
    ['2_Evidence/Testing/t.png', 9], ['2_Evidence/requirements-loose.png', 1], ['1_Documents/x.docx', 1], ['README.md', 1]].forEach(([path, size]) => { blobs.set(path, 'sha-' + path); sizes.set(path, size); });
  const found = f.c.evidenceListFiles_({blobs, sizes}, ['requirements']);
  assert.deepEqual(plain(found).map(file => [file.relative, file.folder, file.name, file.size]), [['Requirements/a.png', 'requirements', 'a.png', 5], ['Requirements/sub/b.pdf', 'requirements', 'b.pdf', 7]]);
});

test('a file is COPIED only when its copy is of this version; larger than 25 MB is TOO_LARGE', () => {
  const {f} = setup();
  const file = {path: '2_Evidence/R/a.png', sha: 's2', size: 10};
  const copied = rows => new Map(rows.map(record => [f.c.evidenceCopyKey_(record.teamId, record.path), {record}]));
  assert.equal(f.c.evidenceFileState_(file, copied([]), 'T1'), 'PENDING');
  assert.equal(f.c.evidenceFileState_(file, copied([{teamId: 'T1', path: file.path, blobSha: 's2', driveFileId: 'd'}]), 'T1'), 'COPIED');
  assert.equal(f.c.evidenceFileState_(file, copied([{teamId: 't1', path: file.path, blobSha: 's2', driveFileId: 'd'}]), 'T1'), 'COPIED', 'the team ID is compared without case');
  assert.equal(f.c.evidenceFileState_(file, copied([{teamId: 'T1', path: file.path, blobSha: 's1', driveFileId: 'd'}]), 'T1'), 'PENDING', 'a changed file is copied again');
  assert.equal(f.c.evidenceFileState_(file, copied([{teamId: 'T1', path: file.path, blobSha: 's2', driveFileId: ''}]), 'T1'), 'PENDING', 'a row without a Drive file is not a copy');
  assert.equal(f.c.evidenceFileState_(file, copied([{teamId: 'T2', path: file.path, blobSha: 's2', driveFileId: 'd'}]), 'T1'), 'PENDING', 'another team\'s copy is not this team\'s');
  assert.equal(f.c.evidenceFileState_({path: 'p', sha: 's', size: 25 * 1024 * 1024}, copied([]), 'T1'), 'PENDING');
  assert.equal(f.c.evidenceFileState_({path: 'p', sha: 's', size: 25 * 1024 * 1024 + 1}, copied([]), 'T1'), 'TOO_LARGE');
});

// ---- the sheets: header names, shuffled columns, missing and repeated headers -------------------------------------------------

const READERS = {
  folders: {sheet: 'EvidenceFolders', headers: FOLDER_HEADERS, read: c => c.readEvidenceFolders_()},
  rules: {sheet: 'ActivityEvidences', headers: RULE_HEADERS, read: c => c.readActivityEvidences_()},
  copies: {sheet: 'EvidenceCopies', headers: COPY_HEADERS, read: c => c.readEvidenceCopies_()},
  status: {sheet: 'EvidenceStatus', headers: STATUS_HEADERS, read: c => c.readEvidenceStatus_()}
};

test('each evidence sheet is read by header name: shuffled columns and an extra column give the same answer', () => {
  const env = setup(), {f} = env;
  env.folders([{'Evidence Folder': 'Requirements', 'Document ID': 'doc-0001'}, {'Evidence Folder': 'Testing', 'Document ID': 'doc-0002'}, {'Evidence Folder': 'Budget', 'Document ID': ''}]);
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '3'}]);
  env.copies([env.copy('T1', 'Requirements', 'a.png')]);
  env.status([{'Team ID': 'T1', 'Document ID': 'doc-0001', 'Evidence Pending': '2', 'Evidence Too Large': '0', 'Checked At': 't'}]);
  const answer = () => ({
    status: plain(READERS.status.read(f.c).records.map(item => item.record)),
    folders: plain(Array.from(READERS.folders.read(f.c).byDocument.entries())), rules: plain(READERS.rules.read(f.c)),
    copies: plain(READERS.copies.read(f.c).records.map(item => item.record))
  });
  const straight = answer();
  assert.deepEqual(straight.folders, [['doc-0001', ['Requirements']], ['doc-0002', ['Testing']]]);
  assert.deepEqual(straight.rules, {present: true, rows: [{rowNumber: 2, activityId: 'review1', folder: 'Requirements', minimum: 3}]});
  Object.values(READERS).forEach(({sheet}) => f.sheets.get(sheet).rows.forEach(row => { row.reverse(); row.splice(1, 0, 'extra'); }));
  assert.deepEqual(answer(), straight);
});

test('a missing or repeated header on any evidence sheet throws, naming the sheet and the header', () => {
  for (const [key, {sheet, headers, read}] of Object.entries(READERS)) {
    for (const header of headers) {
      const missing = setup();
      const at = headers.indexOf(header);
      missing.f.sheets.get(sheet).rows.forEach(row => row.splice(at, 1));
      assert.throws(() => read(missing.f.c), error => error.message.includes(sheet) && error.message.includes(header), key + ' without ' + header);
      const repeated = setup();
      repeated.f.sheets.get(sheet).rows.forEach(row => row.push(row[at]));
      assert.throws(() => read(repeated.f.c), error => error.message.includes(sheet) && error.message.includes(header), key + ' with ' + header + ' twice');
    }
  }
});

test('EvidenceFolders refuses a blank, repeated or path-like folder and a bad Document ID; a blank Document ID is allowed and never copied', () => {
  for (const [rows, pattern] of [
    [[{'Evidence Folder': '', 'Document ID': 'doc-0001'}], /blank/],
    [[{'Evidence Folder': 'A/B', 'Document ID': 'doc-0001'}], /one folder name/],
    [[{'Evidence Folder': 'Req', 'Document ID': 'doc-0001'}, {'Evidence Folder': ' req ', 'Document ID': 'doc-0002'}], /listed twice/],
    [[{'Evidence Folder': 'Req', 'Document ID': 'step1'}], /not a Document ID/]]) {
    const env = setup();
    env.folders(rows);
    assert.throws(() => env.f.c.readEvidenceFolders_(), pattern);
  }
  const env = setup();
  env.folders([{'Evidence Folder': 'Req', 'Document ID': ''}]);
  assert.equal(env.f.c.readEvidenceFolders_().byDocument.size, 0);
});

test('a workbook without the evidence sheets has no folders and no rules: the feature is off', () => {
  const {f} = setup();
  ['EvidenceFolders', 'ActivityEvidences'].forEach(name => { f.sheets.delete(name); f.c.invalidateSheetCaches_(name); });
  assert.equal(f.c.readEvidenceFolders_().byDocument.size, 0);
  assert.deepEqual(plain(f.c.readActivityEvidences_()), {present: false, rows: []});
});

test('two EvidenceCopies rows for one file leave out that team only; the other teams are read as before', () => {
  const env = setup();
  env.copies([env.copy('T1', 'R', 'a.png'), env.copy('t1', 'R', 'a.png'), env.copy('T2', 'R', 'b.png')]);
  const copies = env.f.c.readEvidenceCopies_();
  assert.deepEqual([copies.records.length, copies.index.size], [1, 1]);
  assert.match(env.f.c.evidenceCopiesConflict_(copies, 'T1'), /two rows for t1 and .*a\.png/);
  assert.equal(env.f.c.evidenceCopiesConflict_(copies, 'T2'), '');
  assert.ok(env.f.errors.some(line => /two rows for/.test(line)), 'logged');
});

test('a team with two rows for one file cannot be gated or copied (nothing is appended); a Review of another team is unaffected', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'R', 'Minimum Files': '1'}]);
  env.copies([env.copy('T1', 'R', 'a.png'), env.copy('T1', 'R', 'a.png')]);
  const result = env.gate('review1');
  assert.deepEqual([result.allowed, result.requirements[0].diagnostic], [false, 'EVIDENCE_COPIES_CONFLICT']);
  const rows = env.f.sheets.get('EvidenceCopies').rows.length;
  assert.throws(() => env.f.c.evidenceLiveFiles_({teamId: 'T1'}, [], env.f.c.readEvidenceCopies_()), /fixed by the coordinator/);
  assert.equal(env.f.sheets.get('EvidenceCopies').rows.length, rows);
});

test('a copy is written over its mapped columns only: an extra column and its value stay, a changed file updates its row, First Committed At never changes', () => {
  const env = setup(), {f} = env;
  const first = {teamId: 'T1', documentId: 'doc-0001', folder: 'R', path: '2_Evidence/R/a.png', blobSha: 's1', size: 5, driveFileId: 'd1', committedAt: 'c1', firstCommittedAt: 'f1', copiedAt: 't1'};
  f.c.evidenceWriteCopy_(f.c.readEvidenceCopies_(), first);
  f.c.evidenceWriteCopy_(f.c.readEvidenceCopies_(), Object.assign({}, first, {teamId: 'T9', path: '2_Evidence/R/other.png'}));
  const sheet = f.sheets.get('EvidenceCopies');
  sheet.rows.forEach((row, index) => row.push(index ? 'keep' : 'My note'));
  // a later version of the first file: only the changed fields are written, and the First Committed At given now is ignored
  f.c.evidenceWriteCopy_(f.c.readEvidenceCopies_(), {teamId: 'T1', path: '2_Evidence/R/a.png', blobSha: 's2', committedAt: 'c2', copiedAt: 't2', driveFileId: 'd1'});
  const header = sheet.rows[0], updated = sheet.rows[1];
  assert.deepEqual([updated[header.indexOf('Blob SHA')], updated[header.indexOf('Committed At')], updated[header.indexOf('First Committed At')], updated[header.indexOf('Copied At')]], ['s2', 'c2', 'f1', 't2']);
  assert.equal(updated[header.indexOf('My note')], 'keep', 'the extra column keeps its value');
  assert.equal(sheet.rows.length, 3, 'no row was added by the update');
  assert.equal(sheet.rows[2][header.indexOf('Team ID')], 'T9', 'the other row was not touched');
});

// ---- the Review gate -------------------------------------------------------------------------------------------------------

test('no ActivityEvidences sheet, or no row for the Review: no evidence requirement', () => {
  const env = setup();
  assert.deepEqual(plain(env.gate('review1')), {allowed: true, requirements: [], reason: ''});
  env.rules([{'Activity ID': 'review2', 'Evidence Folder': 'Requirements', 'Minimum Files': '2'}]);
  assert.equal(env.gate('review1').allowed, true);
  env.f.sheets.delete('ActivityEvidences');
  env.f.c.invalidateSheetCaches_('ActivityEvidences');
  assert.deepEqual(plain(env.gate('review1')), {allowed: true, requirements: [], reason: ''});
});

test('a Review opens when every folder it names has enough copied files; only the team\'s own copies with a Drive file count, whatever the case of the folder', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '2'}, {'Activity ID': 'review1', 'Evidence Folder': 'Testing', 'Minimum Files': '1'}]);
  env.copies([env.copy('T1', 'Requirements', 'a.png'), env.copy('T2', 'Requirements', 'b.png'), env.copy('T1', 'Requirements', 'c.png', {'Drive File ID': ''})]);
  const denied = env.gate('review1');
  assert.equal(denied.allowed, false);
  assert.deepEqual(plain(denied.requirements.map(item => [item.label, item.met])), [['Evidence: at least 2 files in Requirements', false], ['Evidence: at least 1 file in Testing', false]]);
  assert.match(denied.requirements[0].reason, /1 of 2 copied\. Add the files under 2_Evidence\/Requirements in your repository, then copy them from Documents\./);
  env.copies([env.copy('T1', 'requirements', 'd.png'), env.copy('T1', 'Testing', 't.png')]);
  const open = env.gate('review1');
  assert.deepEqual([open.allowed, open.requirements.every(item => item.met), open.reason], [true, true, '']);
});

test('one folder can serve several Reviews with their own minimums, and a Review needs all of its rows', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '1'}, {'Activity ID': 'review2', 'Evidence Folder': 'Requirements', 'Minimum Files': '3'}]);
  env.copies([env.copy('T1', 'Requirements', 'a.png'), env.copy('T1', 'Requirements', 'b.png')]);
  assert.deepEqual([env.gate('review1').allowed, env.gate('review2').allowed], [true, false]);
});

test('the title activities have no evidence requirement and the sheets are not even read for them', () => {
  const env = setup();
  env.rules([{'Activity ID': 'title.submit', 'Evidence Folder': 'Requirements', 'Minimum Files': '9'}]);
  let reads = 0;
  const read = env.f.c.readActivityEvidences_;
  env.f.c.readActivityEvidences_ = () => { reads++; return read(); };
  assert.equal(env.gate('title.submit').allowed, true);
  assert.equal(env.gate('title.resubmit').allowed, true);
  assert.equal(reads, 0);
});

test('a row that is not valid for its Review denies it with the misconfiguration sentence, and a student never sees the diagnostic', () => {
  for (const row of [{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': 'many'}, {'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '0'},
    {'Activity ID': 'review1', 'Evidence Folder': '', 'Minimum Files': '2'}]) {
    const env = setup();
    env.rules([row]);
    const result = env.gate('review1');
    assert.deepEqual([result.allowed, result.reason], [false, 'Evidence: Submission requirements are misconfigured. Contact the coordinator.']);
    assert.equal(result.requirements[0].diagnostic, 'EVIDENCE_ROW_INVALID');
    assert.equal('diagnostic' in env.f.c.studentRequirements_(result).requirements[0], false);
  }
});

test('a row naming an activity that does not exist gates nothing, even next to a valid row', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review9', 'Evidence Folder': 'Requirements', 'Minimum Files': 'x'}, {'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '1'}]);
  env.copies([env.copy('T1', 'Requirements', 'a.png')]);
  assert.equal(env.gate('review1').allowed, true);
});

test('an unreadable ActivityEvidences sheet denies a Review; an unreadable EvidenceCopies sheet is "Could not verify"', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '1'}]);
  env.f.sheets.get('ActivityEvidences').rows.forEach(row => row.splice(2, 1));
  const unreadable = env.gate('review1');
  assert.deepEqual([unreadable.allowed, unreadable.reason, unreadable.requirements[0].diagnostic], [false, 'Evidence: Submission requirements are misconfigured. Contact the coordinator.', 'EVIDENCE_RULES_UNREADABLE']);
  assert.ok(env.f.errors.some(line => /ActivityEvidences could not be read/.test(line)), 'logged');
  const second = setup();
  second.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '1'}]);
  second.f.sheets.delete('EvidenceCopies');
  second.f.c.invalidateSheetCaches_('EvidenceCopies');
  const unverified = second.gate('review1');
  assert.deepEqual([unverified.allowed, unverified.requirements[0].reason, unverified.requirements[0].diagnostic], [false, 'Could not verify: Evidence: at least 1 file in Requirements.', 'EVIDENCE_COPIES_UNREADABLE']);
});

test('the evidence sheets are read once per request', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '1'}, {'Activity ID': 'review1', 'Evidence Folder': 'Testing', 'Minimum Files': '1'}]);
  let rules = 0, copies = 0;
  const readRules = env.f.c.readActivityEvidences_, readCopies = env.f.c.readEvidenceCopies_;
  env.f.c.readActivityEvidences_ = () => { rules++; return readRules(); };
  env.f.c.readEvidenceCopies_ = () => { copies++; return readCopies(); };
  const ctx = env.f.c.activityContext_();
  env.gate('review1', ctx); env.gate('review2', ctx); env.gate('review1', ctx);
  assert.deepEqual([rules, copies], [1, 1]);
});

test('a kinds-limited context skips the evidence rows; a hint context runs them, after the dearer rows and only while none is definitely unmet', () => {
  const env = setup();
  env.rules([{'Activity ID': 'review1', 'Evidence Folder': 'Requirements', 'Minimum Files': '1'}]);
  const limited = env.f.c.activityContext_();
  limited.kinds = ['title'];
  assert.equal(env.gate('review1', limited).allowed, true);
  const kinds = env.f.c.activityContext_();
  kinds.kinds = ['evidence'];
  assert.equal(env.gate('review1', kinds).allowed, false);
  const hint = env.f.c.activityContext_();
  hint.hint = true;
  assert.equal(env.gate('review1', hint).allowed, false);
  // a definitely unmet row stops a hint run before the evidence is looked at
  env.f.c.readActivityDependencyRows_ = () => ({present: true, headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'], rows: [['review1', 'title', 'approved', 'Title approved', 'Yes']]});
  env.f.c.activityChecks_ = () => ({title: {validItem: () => true, isMet: () => ({met: false, reason: 'No title.'})}});
  const stopped = env.f.c.activityContext_();
  stopped.hint = true;
  const stoppedResult = env.gate('review1', stopped);
  assert.deepEqual(plain(stoppedResult.requirements.map(item => item.label)), ['Title approved']);
  const strict = env.gate('review1');
  assert.deepEqual(plain(strict.requirements.map(item => item.label)), ['Title approved', 'Evidence: at least 1 file in Requirements']);
});

test('evidence modules add no public function except the endpoint, and the gate never writes', () => {
  const text = fs.readFileSync('evidence.js', 'utf8');
  assert.deepEqual([...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_')), []);
  const gate = text.slice(text.indexOf('function evidenceGateItems_'));
  assert.doesNotMatch(gate, /setValues|appendRow|LockService|MailApp|writeRecordSpan_|documentSheetAppend_/);
});

test('two EvidenceStatus rows for one team and document stop the read', () => {
  const env = setup();
  env.status([{'Team ID': 'T1', 'Document ID': 'doc-0001'}, {'Team ID': 't1', 'Document ID': 'doc-0001'}]);
  assert.throws(() => env.f.c.readEvidenceStatus_(), /two rows for/);
});

test('a status is written over its mapped columns only, an unknown count is blank, and a changed row is updated in place', () => {
  const env = setup(), {f} = env;
  f.c.evidenceWriteStatus_(f.c.readEvidenceStatus_(), {teamId: 'T1', documentId: 'doc-0001', pending: 2, tooLarge: 0, checkedAt: 't1'});
  f.c.evidenceWriteStatus_(f.c.readEvidenceStatus_(), {teamId: 'T1', documentId: 'doc-0002', pending: '', tooLarge: '', checkedAt: 't1'});
  const sheet = f.sheets.get('EvidenceStatus');
  sheet.rows.forEach((row, index) => row.push(index ? 'keep' : 'My note'));
  f.c.evidenceWriteStatus_(f.c.readEvidenceStatus_(), {teamId: 'T1', documentId: 'doc-0001', pending: 0, tooLarge: 1, checkedAt: 't2'});
  assert.deepEqual(plain(sheet.rows.slice(1)), [['T1', 'doc-0001', '0', '1', 't2', 'keep'], ['T1', 'doc-0002', '', '', 't1', 'keep']]);
});

test('saving a status needs the lock, never throws, and says whether it saved', () => {
  const env = setup(), {f} = env;
  const record = {teamId: 'T1', documentId: 'doc-0001', pending: 1, tooLarge: 0, checkedAt: 't'};
  assert.equal(f.c.evidenceSaveStatus_([]), true);
  assert.equal(f.c.evidenceSaveStatus_([record]), true);
  assert.equal(f.sheets.get('EvidenceStatus').rows.length, 2);
  f.c.LockService = {getScriptLock: () => ({hasLock: () => false, waitLock() { throw new Error('busy'); }, releaseLock() {}})};
  assert.equal(f.c.evidenceSaveStatus_([Object.assign({}, record, {pending: 5})]), false);
  assert.equal(f.sheets.get('EvidenceStatus').rows[1][2], '1', 'nothing was written');
  f.c.LockService = {getScriptLock: () => ({hasLock: () => true, waitLock() {}, releaseLock() {}})};
  f.sheets.delete('EvidenceStatus');
  f.c.invalidateSheetCaches_('EvidenceStatus');
  assert.equal(f.c.evidenceSaveStatus_([record]), false, 'a missing sheet is logged, not thrown');
});

test('the scan context exists only when a folder is mapped and the status sheet is there', () => {
  const env = setup(), {f} = env;
  assert.equal(f.c.evidenceScanContext_(), null);
  env.folders([{'Evidence Folder': 'Requirements', 'Document ID': 'doc-0001'}]);
  assert.equal(f.c.evidenceScanContext_().folders.byDocument.size, 1);
  f.sheets.delete('EvidenceStatus');
  f.c.invalidateSheetCaches_('EvidenceStatus');
  assert.equal(f.c.evidenceScanContext_(), null);
});
