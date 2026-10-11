// The Phase 0 GitHub and Drive stubs (tests/title-baseline/stubs.cjs): they must have the real shapes and messages, make no live
// call, and let every outcome of the submission requirements be scripted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { githubSetupResult, githubSetupStub, GITHUB_PRESETS, makeDriveContext } = require('./title-baseline/stubs.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const REAL_KEYS = ['accessError', 'accountsComplete', 'completedAt', 'members', 'message', 'outstandingMembers', 'repoUrl', 'repositoryAvailable',
  'ready', 'teamId', 'usernamesComplete', 'verificationUnavailable'].sort();

test('GitHub stub: every preset has the keys of the real getTeamGithubSetup_ result', () => {
  // The real function builds its result with exactly these keys (team-github-setup.js, getTeamGithubSetup_).
  const source = fs.readFileSync('team-github-setup.js', 'utf8');
  for (const key of REAL_KEYS) assert.ok(source.includes(key), key + ' is no longer part of getTeamGithubSetup_; update the stub');
  for (const preset of GITHUB_PRESETS) {
    const result = githubSetupResult(preset);
    assert.deepEqual(Object.keys(result).sort(), REAL_KEYS, preset);
    assert.equal(typeof result.message, 'string');
  }
});

test('GitHub stub: ready and not-ready presets give the real messages', () => {
  const messages = Object.fromEntries(GITHUB_PRESETS.map(preset => [preset, githubSetupResult(preset)]));
  assert.equal(messages.ready.ready, true);
  assert.equal(messages.ready.message, 'GitHub setup is complete. Every team member has repository access.');
  assert.equal(messages.readyWithPendingInvitation.ready, true);
  assert.match(messages.readyWithPendingInvitation.message, /pending invitations must accept/);
  assert.match(messages.missingUsername.message, /Waiting for valid GitHub usernames from teammate\(s\): R002/);
  assert.match(messages.invalidUsername.message, /Waiting for valid GitHub usernames/);
  assert.match(messages.noRepository.message, /awaiting creation/);
  assert.match(messages.verificationUnavailable.message, /GitHub could not verify/);
  assert.equal(messages.templatePending.message, 'Repository template setup is incomplete. Retry GitHub setup.');
  assert.equal(messages.repositoryUnverified.message, 'Repository could not be verified. Retry GitHub setup.');
  for (const preset of GITHUB_PRESETS.filter(name => name !== 'ready' && name !== 'readyWithPendingInvitation')) {
    assert.equal(messages[preset].ready, false, preset);
  }
});

test('GitHub stub: it records its calls, honours inspectAccess false, and can throw', () => {
  const stub = githubSetupStub('ready');
  const full = stub.fn('T1', {readOnly: true});
  assert.equal(full.ready, true);
  const shallow = stub.fn('T2', {inspectAccess: false});
  assert.equal(shallow.ready, false);
  assert.equal(shallow.repositoryAvailable, false);
  assert.ok(shallow.members.every(m => m.access === 'unchecked'));
  assert.deepEqual(plain(stub.calls), [{teamId: 'T1', options: {readOnly: true}}, {teamId: 'T2', options: {inspectAccess: false}}]);
  assert.throws(() => githubSetupStub('throws').fn('T1'), /GitHub setup unavailable/);
  assert.throws(() => githubSetupResult('nope'), /Unknown GitHub preset/);
  assert.equal(githubSetupResult('ready', {repoUrl: ''}).repoUrl, '');
});

const WORK = 'Step1_Work_Breakdown.docx', NEED = 'Step2_Need_Analysis.docx';

test('Drive stub: the real findTeamFolder_ finds one team folder and its files', () => {
  const d = makeDriveContext({teams: {T1: {files: [{name: WORK}, {name: NEED}]}}});
  const folder = d.context.findTeamFolder_('T1', 'Odd');
  assert.ok(folder);
  assert.equal(folder.getName(), d.context.teamFolderName_('2026-27', 'Odd', 'T1'));
  const files = folder.getFilesByName(WORK);
  assert.equal(files.hasNext(), true);
  assert.equal(files.next().getName(), WORK);
  assert.equal(d.context.findTeamFolder_('T2', 'Odd'), null, 'a team without a folder');
});

test('Drive stub: absence, duplicate Team Documents and duplicate team folders are told apart by the real helpers', () => {
  const absent = makeDriveContext({documentsFolders: 0});
  const base = absent.context.teamFoldersBase_();
  assert.equal(base.issue, '');
  const none = absent.context.teamDocumentsFolder_(base.folder, false);
  assert.deepEqual(plain({folder: none.folder, issue: none.issue}), {folder: null, issue: ''}, 'confirmed absence');

  const twoDocuments = makeDriveContext({documentsFolders: 2});
  const documents = twoDocuments.context.teamDocumentsFolder_(twoDocuments.context.teamFoldersBase_().folder, false);
  assert.equal(documents.folder, null);
  assert.match(documents.issue, /more than one folder named Team Documents/);

  const twoFolders = makeDriveContext({teams: {T1: {folders: 2}}});
  const found = twoFolders.context.teamFolderIn_(twoFolders.documents[0], 'T1', 'Odd');
  assert.equal(found.folder, null);
  assert.equal(found.count, 2, 'ambiguous: more than one team folder');
  assert.equal(twoFolders.context.findTeamFolder_('T1', 'Odd'), null, 'findTeamFolder_ cannot tell absent from ambiguous');
  const noTeams = makeDriveContext({});
  assert.equal(noTeams.context.teamFolderIn_(noTeams.documents[0], 'T1', 'Odd').count, 0, 'no folder for the team: confirmed absence');
});

test('Drive stub: the spreadsheet folder problems the real teamFoldersBase_ reports', () => {
  assert.match(makeDriveContext({parents: 0}).context.teamFoldersBase_().issue, /not inside a folder/);
  assert.match(makeDriveContext({parents: 2}).context.teamFoldersBase_().issue, /more than one folder/);
  assert.match(makeDriveContext({inRoot: true}).context.teamFoldersBase_().issue, /top level of My Drive/);
  assert.match(makeDriveContext({unreadable: true}).context.teamFoldersBase_().issue, /could not be read/);
  assert.equal(makeDriveContext({}).context.teamFoldersBase_().issue, '');
});

test('Drive stub: file lookups expose duplicates and trashed files, so a check can require exactly one live file', () => {
  const d = makeDriveContext({teams: {T1: {files: [{name: WORK}, {name: WORK, trashed: true}, {name: NEED}, {name: NEED}]}}});
  const folder = d.context.findTeamFolder_('T1', 'Odd');
  const live = name => { const found = []; const it = folder.getFilesByName(name); while (it.hasNext()) { const file = it.next(); if (!file.isTrashed()) found.push(file); } return found.length; };
  assert.equal(live(WORK), 1, 'one live file and one in the trash counts as one');
  assert.equal(live(NEED), 2, 'two live files with the same name is a duplicate');
  assert.equal(live('Other.docx'), 0);
});

test('the stubs never create anything and make no live call', () => {
  const d = makeDriveContext({teams: {T1: {}}});
  assert.throws(() => d.base.createFolder('x'), /does not create folders/);
  const text = fs.readFileSync('tests/title-baseline/stubs.cjs', 'utf8');
  assert.doesNotMatch(text, /UrlFetchApp|SpreadsheetApp|require\('node:https?'\)|fetch\(/);
});
