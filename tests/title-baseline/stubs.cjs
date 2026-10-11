// Phase 0 stubs (TITLE-REVISION-PLAN.md) for the GitHub and Drive layers that the submission requirements will check
// (ACTIVITY-DEPENDENCIES-PLAN.md). They answer from a script and make no live call, so the engine's tests can cover every
// outcome, including "GitHub is down" and an ambiguous folder, which a live service cannot be told to produce.
//
//   githubSetupStub(preset, overrides)  - a getTeamGithubSetup_ stand-in with the real result shape and the real message text
//   makeDriveContext(spec)              - a vm context where the real team-folders.js helpers run on a scripted fake DriveApp
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---- GitHub -------------------------------------------------------------------------------------------------------------

/** The real message function, so the stub's `message` is exactly what getTeamGithubSetup_ would produce. */
const githubContext = vm.createContext({});
vm.runInContext(source('team-github-setup.js'), githubContext, {filename: 'team-github-setup.js'});

const REPO_URL = 'https://github.com/org/capstone-team-T1';
const member = (n, status = 'valid', access = 'active') => ({
  email: 'student' + n + '@example.com', label: 'R00' + n, username: status === 'missing' ? '' : 'student' + n, status,
  submittedAt: status === 'missing' ? null : Date.parse('2026-01-02T00:00:00Z'), access, githubId: status === 'valid' ? '10' + n : ''
});

const PRESETS = {
  ready: {},
  readyWithPendingInvitation: {members: [member(1), member(2, 'valid', 'invited')]},
  missingUsername: {members: [member(1), member(2, 'missing', 'unchecked')], usernamesComplete: false, outstandingMembers: ['R002'], repositoryAvailable: false, ready: false},
  invalidUsername: {members: [member(1), member(2, 'invalid', 'unchecked')], usernamesComplete: false, outstandingMembers: ['R002'], repositoryAvailable: false, ready: false},
  noRepository: {repoUrl: '', repositoryAvailable: false, ready: false, members: [member(1, 'valid', 'unchecked'), member(2, 'valid', 'unchecked')]},
  missingAccess: {members: [member(1), member(2, 'valid', 'missing')], ready: false},
  templatePending: {ready: false, accessError: 'Repository template setup is incomplete. Retry GitHub setup.'},
  verificationUnavailable: {members: [member(1), member(2, 'unavailable', 'unchecked')], usernamesComplete: false, verificationUnavailable: true, repositoryAvailable: false, ready: false},
  repositoryUnverified: {repositoryAvailable: false, ready: false, accessError: 'Repository could not be verified. Retry GitHub setup.', members: [member(1, 'valid', 'unchecked'), member(2, 'valid', 'unchecked')]},
  accessUnavailable: {members: [member(1), member(2, 'valid', 'unavailable')], ready: false}
};

/** A result shaped like getTeamGithubSetup_: same keys, same `message` text. */
function githubSetupResult(preset = 'ready', overrides = {}, teamId = 'T1') {
  if (!PRESETS[preset]) throw new Error('Unknown GitHub preset: ' + preset);
  const members = [member(1), member(2)];
  const result = {
    teamId, repoUrl: REPO_URL, members, usernamesComplete: true, outstandingMembers: [], verificationUnavailable: false,
    repositoryAvailable: true, ready: true, completedAt: Date.parse('2026-01-02T00:00:00Z'), accessError: '',
    ...PRESETS[preset], ...overrides
  };
  result.accountsComplete = result.usernamesComplete;
  result.message = githubContext.githubSetupMessage_(result);
  return JSON.parse(JSON.stringify(result));
}

/**
 * A stand-in for getTeamGithubSetup_(teamId, options). `calls` records every call, so a test can assert what was passed
 * (for example that a read path asked for the read-only mode). With `inspectAccess: false` it behaves like the real function:
 * the repository and access are not inspected, so the team is not ready.
 */
function githubSetupStub(preset = 'ready', overrides = {}) {
  const calls = [];
  const fn = (teamId, options) => {
    calls.push({teamId, options: options ? {...options} : options});
    if (preset === 'throws') throw new Error('GitHub setup unavailable.');
    const result = githubSetupResult(preset, overrides, teamId);
    if (options && options.inspectAccess === false) {
      result.members.forEach(m => { m.access = 'unchecked'; });
      Object.assign(result, {repositoryAvailable: false, ready: false, accessError: ''});
      result.message = githubContext.githubSetupMessage_(result);
    }
    return result;
  };
  return {fn, calls};
}

// ---- Drive --------------------------------------------------------------------------------------------------------------

let nextId = 1;
const iterator = items => { let i = 0; return {hasNext: () => i < items.length, next: () => items[i++]}; };

class FakeFile {
  constructor(name, trashed = false) { this.name = name; this.trashed = trashed; this.id = 'file' + nextId++; }
  getName() { return this.name; }
  isTrashed() { return this.trashed; }
  getId() { return this.id; }
}

class FakeFolder {
  constructor(name) { this.name = name; this.id = 'folder' + nextId++; this.folders = []; this.files = []; }
  getName() { return this.name; }
  getId() { return this.id; }
  getUrl() { return 'https://drive.example.com/' + this.id; }
  getFolders() { return iterator(this.folders); }
  getFoldersByName(name) { return iterator(this.folders.filter(folder => folder.name === name)); }
  getFilesByName(name) { return iterator(this.files.filter(file => file.name === name)); }
  createFolder() { throw new Error('The fake Drive does not create folders; reads must never create anything.'); }
}

/**
 * spec (all optional):
 *   parents:          how many folders contain the spreadsheet (1 = normal, 0 = none, 2 = more than one)
 *   inRoot:           the single parent is the top level of My Drive
 *   unreadable:       reading the spreadsheet's folder throws
 *   documentsFolders: how many "Team Documents" folders sit next to the spreadsheet (1 = normal, 0 = absent, 2 = ambiguous)
 *   teams:            { T1: { folders: 1, files: [{name, trashed}] } } - team folders inside the first Team Documents folder
 *   semester, academicYear: used for the team folder name (default Odd / 2026-27)
 */
function makeDriveContext(spec = {}) {
  const {parents = 1, inRoot = false, unreadable = false, documentsFolders = 1, teams = {}, semester = 'Odd', academicYear = '2026-27'} = spec;
  const rootFolder = new FakeFolder('My Drive');
  const base = new FakeFolder('Capstone');
  const parentList = parents === 0 ? [] : parents === 1 ? [inRoot ? rootFolder : base] : [base, new FakeFolder('Other')];
  const documents = Array.from({length: documentsFolders}, () => new FakeFolder('Team Documents'));
  base.folders.push(...documents);
  const context = vm.createContext({
    getSpreadsheetId_: () => 'sheet-1',
    getAcademicYear_: () => academicYear,
    DriveApp: {
      getRootFolder: () => rootFolder,
      getFileById: () => {
        if (unreadable) throw new Error('Spreadsheet folder is unreadable.');
        return {getParents: () => iterator(parentList)};
      }
    }
  });
  vm.runInContext(source('team-folders.js'), context, {filename: 'team-folders.js'});
  const folderOf = {};
  Object.entries(teams).forEach(([teamId, team]) => {
    const name = context.teamFolderName_(academicYear, semester, teamId);
    const folders = Array.from({length: team.folders === undefined ? 1 : team.folders}, () => new FakeFolder(name));
    folders.forEach(folder => (team.files || []).forEach(file => folder.files.push(new FakeFile(file.name, !!file.trashed))));
    if (documents[0]) documents[0].folders.push(...folders);
    folderOf[teamId] = folders;
  });
  return {context, base, documents, folderOf, semester, academicYear};
}

module.exports = {githubSetupResult, githubSetupStub, GITHUB_PRESETS: Object.keys(PRESETS), makeDriveContext};
