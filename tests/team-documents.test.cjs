// The read-only document status of a team (team-documents.js). Documents reach the team folder outside this system: nothing here uploads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { makeDriveContext } = require('./title-baseline/stubs.cjs');

const WORK = 'Step1_Work_Breakdown.docx', NEED = 'Step2_Need_Analysis.docx';
const plain = value => JSON.parse(JSON.stringify(value));
let ids = 1;
function fakeFile(name, {trashed = false, description = ''} = {}) {
  const file = {id: 'f' + ids++, name, trashed, description, getName: () => file.name, getId: () => file.id, isTrashed: () => file.trashed, getDescription: () => file.description};
  return file;
}

function setup(files = [], driveSpec = {}) {
  const drive = makeDriveContext({teams: {T1: {files: []}}, ...driveSpec});
  const c = drive.context;
  if (drive.folderOf.T1) files.forEach(file => drive.folderOf.T1[0].files.push(file));
  c.console = {error() {}, log() {}};
  ['activity-engine.js', 'activity-check-drive.js', 'team-documents.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), c, {filename: file}));
  return c;
}
const TEAM = {teamId: 'T1', semester: 'Odd'};

test('a document is present when exactly one live file has its fixed name; the uploader is shown only when asked', () => {
  const c = setup([fakeFile(WORK, {description: JSON.stringify({uploadedBy: 'ann@x.edu', uploadedAt: '2026-01-02T00:00:00.000Z'})}), fakeFile(NEED), fakeFile(NEED, {trashed: true})]);
  assert.deepEqual(plain(c.documentStatusList_(TEAM, true, c.activityContext_())), [
    {key: 'work', label: 'Work Breakdown document', present: true, uploadedBy: 'ann@x.edu', uploadedAt: '2026-01-02T00:00:00.000Z'},
    {key: 'need', label: 'Need Analysis document', present: true, uploadedBy: '', uploadedAt: null}
  ]);
  assert.deepEqual(plain(c.documentStatusList_(TEAM, false, c.activityContext_())).map(d => [d.key, d.present, d.uploadedBy, d.uploadedAt]), [['work', true, null, null], ['need', true, null, null]]);
});

test('no file, a trashed file or two live files are not present; an unreachable folder shows nothing present', () => {
  assert.deepEqual(plain(setup([]).documentStatusList_(TEAM, true, setup([]).activityContext_())).map(d => d.present), [false, false]);
  const trashed = setup([fakeFile(WORK, {trashed: true})]);
  assert.equal(trashed.documentStatusList_(TEAM, true, trashed.activityContext_())[0].present, false);
  const twice = setup([fakeFile(WORK), fakeFile(WORK)]);
  assert.equal(twice.documentStatusList_(TEAM, true, twice.activityContext_())[0].present, false);
  const unreadable = setup([], {unreadable: true, teams: {}});
  assert.deepEqual(plain(unreadable.documentStatusList_(TEAM, true, unreadable.activityContext_())).map(d => d.present), [false, false]);
});

test('source rules: nothing here writes to Drive or the sheets, and there is no public function', () => {
  const text = fs.readFileSync('team-documents.js', 'utf8');
  assert.doesNotMatch(text, /createFile|createFolder|setTrashed|setDescription|makeCopy|moveTo|setContent|SpreadsheetApp|LockService|MailApp/);
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
  assert.ok(!fs.existsSync('team-document-upload.js'));
});
