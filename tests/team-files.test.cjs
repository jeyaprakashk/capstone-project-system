// Process B of archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md: the daily team-file scan and the TeamFileStatus sheet.
// GitHub is faked per repository (default branch, files, and the commits of each path); the sheets are the in-memory fakes of the weekly fixture.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {weeklyFixture} = require('./weekly-progress-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const HEADERS = ['Team ID', 'Document ID', 'Repo Blob SHA', 'Team Changed', 'Last Team Commit', 'Latest Commit', 'Checked At', 'Baseline Blob SHA'];
const TEMPLATE_HEADERS = ['Document ID', 'Folder', 'File Name', 'Extension', 'First Seen', 'Last Seen', 'Active', 'In Team Template', 'Name Conflict'];
const STEP1 = '1_Documents/Step1_Work_Breakdown.docx', STEP2 = '1_Documents/Step2_Need_Analysis.docx';
const BASE = {[STEP1]: '68fa810f28c67de66c97a0d0140e2b70c0dcf54f', [STEP2]: '4dd722ac'};
const commit = (sha, id) => ({sha, author: id === null ? null : {id}});
const ADMIN = 900, ANN = 101, BOB = 102;

function setup() {
  const f = weeklyFixture();
  ['github-provisioning.js', 'document-sheets.js', 'template-files.js', 'team-files.js', 'document-setup.js']
    .forEach(name => vm.runInContext(fs.readFileSync(name, 'utf8'), f.c, {filename: name}));
  f.c.requireTriggerOrOperator_ = () => {};
  f.c.setupDocumentStorage();
  const templateRows = f.sheets.get('TemplateFiles').rows;
  const addDocument = (id, path, extra = {}) => {
    const [folder, fileName] = path.split('/');
    const row = Object.assign({'Document ID': id, Folder: folder, 'File Name': fileName, Extension: fileName.split('.').pop(), 'First Seen': 't', 'Last Seen': 't', Active: 'Yes', 'In Team Template': 'Yes', 'Name Conflict': 'No'}, extra);
    templateRows.push(TEMPLATE_HEADERS.map(header => row[header]));
  };
  addDocument('doc-0001', STEP1);
  addDocument('doc-0002', STEP2);
  // GitHub: one entry per repository slug
  const github = {repos: {}, calls: [], failTree: null};
  github.repos['org/team'] = {branch: 'master', files: {}, commits: {}};
  f.c.makeGithubRequest_ = (method, path) => {
    github.calls.push(path);
    const slug = path.split('/').slice(2, 4).join('/'), repo = github.repos[slug];
    if (!repo) return {status: 404, body: null};
    if (path === '/repos/' + slug) return {status: 200, body: {default_branch: repo.branch}};
    if (path.includes('/git/trees/')) {
      if (github.failTree === slug) return {status: 502, body: null};
      return {status: 200, body: {truncated: !!repo.truncated, tree: Object.entries(repo.files).map(([file, sha]) => ({path: file, type: 'blob', sha}))}};
    }
    if (path.startsWith('/repos/' + slug + '/contents/')) {
      const file = decodeURIComponent(path.split('/contents/')[1].split('?')[0]), baseline = (repo.baselines && repo.baselines[file]) || 'tpl-' + file;
      return baseline ? {status: 200, body: {sha: baseline}} : {status: 404, body: null};
    }
    const url = new URL('https://x' + path), file = url.searchParams.get('path'), page = Number(url.searchParams.get('page'));
    if (repo.failCommits) return {status: 502, body: null};
    return {status: 200, body: (repo.commits[file] || []).slice((page - 1) * 100, page * 100)};
  };
  const sheet = () => f.sheets.get('TeamFileStatus');
  const table = () => sheet().rows.slice(1).map(row => Object.fromEntries(HEADERS.map((header, index) => [header, row[index]])));
  const result = (teamId, documentId) => table().find(row => row['Team ID'] === teamId && row['Document ID'] === documentId);
  return {f, github, sheet, table, result, addDocument, repo: github.repos['org/team']};
}

/** A second team T2 with its own repository and one linked student (GitHub ID 201). */
function addSecondTeam(env) {
  const {f, github} = env, ts = f.ts;
  const row = f.status.rows[1].slice();
  row[ts.indexOf('Team ID')] = 'T2';
  row[ts.indexOf('Repo URL')] = 'https://github.com/org/team2';
  f.status.rows.push(row);
  f.sheets.get('GitHubAccounts').rows.push(['', 'three@example.com', 'T2', 'cara', '201', '', 'https://github.com/cara']);
  github.repos['org/team2'] = {branch: 'main', files: {}, commits: {}};
  return github.repos['org/team2'];
}

test('the catalog headers and the code constants agree, and setupDocumentStorage creates the sheet', () => {
  const {f, sheet} = setup();
  assert.deepEqual(plain(vm.runInContext('Object.values(TEAM_FILE_STATUS_FIELDS_)', f.c)), HEADERS);
  assert.deepEqual(plain(f.c.sheetSpec_('teamFileStatus').headers), HEADERS);
  assert.deepEqual(Array.from(sheet().rows[0]), HEADERS);
});

test('absent and unchanged files are No, with no history call', () => {
  const env = setup();
  env.repo.files[STEP2] = BASE[STEP2];
  // STEP1 is absent from the repository; STEP2 equals what its first commit held
  env.repo.baselines = {[STEP2]: BASE[STEP2]};
  env.repo.commits[STEP2] = [commit('c0', ADMIN)];
  const outcome = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([outcome.ok, outcome.teams, outcome.remaining], [true, 1, 0]);
  assert.deepEqual([env.result('T1', 'doc-0001')['Team Changed'], env.result('T1', 'doc-0001')['Repo Blob SHA']], ['No', '']);
  assert.deepEqual([env.result('T1', 'doc-0002')['Team Changed'], env.result('T1', 'doc-0002')['Repo Blob SHA']], ['No', BASE[STEP2]]);
  assert.equal(env.github.calls.filter(call => call.includes('/commits?')).length, 1, 'the baseline is read from the first commit');
  assert.equal(env.result('T1', 'doc-0002')['Baseline Blob SHA'], BASE[STEP2]);
  env.github.calls.length = 0;
  env.f.c.scanTeamFiles();
  assert.equal(env.github.calls.filter(call => call.includes('/commits?') || call.includes('/contents/')).length, 0, 'a stored baseline is never read again');
});

test('a linked teammate commit makes it Yes, even when the administrator committed on top of it', () => {
  const env = setup();
  env.repo.files[STEP1] = 'changed-sha';
  env.repo.commits[STEP1] = [commit('c3', ADMIN), commit('c2', BOB), commit('c1', ADMIN)];
  env.f.c.scanTeamFiles();
  const row = env.result('T1', 'doc-0001');
  assert.deepEqual([row['Team Changed'], row['Last Team Commit'], row['Latest Commit'], row['Repo Blob SHA']], ['Yes', 'c2', 'c3', 'changed-sha']);
});

test('only the administrator, or only an unlinked account, is No', () => {
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.files[STEP2] = 'b';
  env.repo.commits[STEP1] = [commit('c2', ADMIN), commit('c1', ADMIN)];
  env.repo.commits[STEP2] = [commit('c4', 555), commit('c3', null)];
  env.f.c.scanTeamFiles();
  assert.deepEqual([env.result('T1', 'doc-0001')['Team Changed'], env.result('T1', 'doc-0001')['Latest Commit'], env.result('T1', 'doc-0001')['Last Team Commit']], ['No', 'c2', '']);
  assert.equal(env.result('T1', 'doc-0002')['Team Changed'], 'No');
});

test('the search goes as far back as it needs to: page 5 is found, a short history ends in No, the page limit is Unknown', () => {
  const long = (count, teammateAt) => Array.from({length: count}, (_, index) => commit('k' + index, index === teammateAt ? ANN : ADMIN));
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.files[STEP2] = 'b';
  env.repo.commits[STEP1] = long(450, 420);
  env.repo.commits[STEP2] = long(150, -1);
  env.f.c.scanTeamFiles();
  assert.deepEqual([env.result('T1', 'doc-0001')['Team Changed'], env.result('T1', 'doc-0001')['Last Team Commit']], ['Yes', 'k420']);
  assert.equal(env.github.calls.filter(call => call.includes('/commits?') && call.includes('Step1')).length, 10, 'five pages for the baseline, five for the search');
  assert.equal(env.result('T1', 'doc-0002')['Team Changed'], 'No');
  const limit = setup();
  limit.repo.files[STEP1] = 'a';
  limit.repo.commits[STEP1] = long(1200, -1);
  limit.f.c.scanTeamFiles();
  assert.equal(limit.result('T1', 'doc-0001')['Team Changed'], 'Unknown');
  assert.equal(limit.github.calls.filter(call => call.includes('/commits?')).length, 10);
  const failing = setup();
  failing.repo.files[STEP1] = 'a'; failing.repo.commits[STEP1] = long(10, 3); failing.repo.failCommits = true;
  failing.f.c.scanTeamFiles();
  assert.equal(failing.result('T1', 'doc-0001')['Team Changed'], 'Unknown');
});

test('a team with no linked GitHub account is No without any history call', () => {
  const env = setup();
  env.f.sheets.get('GitHubAccounts').rows.splice(1);
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  env.f.c.scanTeamFiles();
  assert.equal(env.result('T1', 'doc-0001')['Team Changed'], 'No');
  assert.equal(env.github.calls.filter(call => call.includes('/commits?')).length, 0);
});

test('documents that are not listed are never evaluated', () => {
  const env = setup();
  env.addDocument('doc-0003', '1_Documents/Not_In_Team.docx', {'In Team Template': 'No'});
  env.addDocument('doc-0004', '1_Documents/Gone.docx', {Active: 'No'});
  env.addDocument('doc-0005', '1_Documents/Clash.docx', {'Name Conflict': 'Yes'});
  env.repo.files[STEP1] = 'a';
  env.f.c.scanTeamFiles();
  assert.deepEqual(env.table().map(row => row['Document ID']).sort(), ['doc-0001', 'doc-0002']);
});

test('GitHub failing for one team writes Unknown over an old Yes, and the other teams are still scanned', () => {
  const env = setup();
  const second = addSecondTeam(env);
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  second.files[STEP1] = 'z'; second.commits[STEP1] = [commit('d1', 201)];
  env.f.c.scanTeamFiles();
  assert.deepEqual([env.result('T1', 'doc-0001')['Team Changed'], env.result('T2', 'doc-0001')['Team Changed']], ['Yes', 'Yes']);
  env.github.failTree = 'org/team';
  env.f.time('2031-01-01T00:00:00Z');
  const outcome = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([outcome.ok, outcome.unreadable, outcome.teams], [true, 1, 2]);
  assert.deepEqual([env.result('T1', 'doc-0001')['Team Changed'], env.result('T1', 'doc-0002')['Team Changed']], ['Unknown', 'Unknown']);
  assert.equal(env.result('T2', 'doc-0001')['Team Changed'], 'Yes');
  env.github.failTree = null;
  env.f.c.scanTeamFiles();
  assert.equal(env.result('T1', 'doc-0001')['Team Changed'], 'Yes', 'the next good scan restores the value');
});

test('a truncated repository listing is Unknown, not No', () => {
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.truncated = true;
  env.f.c.scanTeamFiles();
  assert.equal(env.result('T1', 'doc-0001')['Team Changed'], 'Unknown');
});

test('the time budget stops a run with a cursor, and the next run finishes without repeating teams', () => {
  const env = setup();
  const second = addSecondTeam(env);
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  second.files[STEP1] = 'z'; second.commits[STEP1] = [commit('d1', 201)];
  const request = env.f.c.makeGithubRequest_;
  let clock = Date.parse('2031-02-01T00:00:00Z');
  env.f.time('2031-02-01T00:00:00Z');
  env.f.c.makeGithubRequest_ = (method, path) => { if (path.includes('/git/trees/')) { clock += 300000; env.f.time(new Date(clock).toISOString()); } return request(method, path); };
  const first = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([first.teams, first.remaining], [1, 1]);
  assert.equal(env.f.properties.get('DOCUMENT_TEAM_SCAN_CURSOR'), 't1');
  assert.deepEqual(env.table().map(row => row['Team ID']), ['T1', 'T1']);
  const next = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([next.teams, next.remaining], [1, 0]);
  assert.equal(env.f.properties.has('DOCUMENT_TEAM_SCAN_CURSOR'), false);
  assert.deepEqual(env.table().map(row => row['Team ID']), ['T1', 'T1', 'T2', 'T2']);
});

test('a repeated scan with nothing new writes nothing and adds no row', () => {
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  env.f.c.scanTeamFiles();
  const before = JSON.stringify(env.sheet().rows);
  let writes = 0;
  const getRange = env.sheet().getRange;
  env.sheet().getRange = (...args) => { const range = getRange(...args), setValues = range.setValues; return Object.assign(range, {setValues: values => { writes++; return setValues.call(range, values); }}); };
  env.f.c.scanTeamFiles();
  env.sheet().getRange = getRange;
  assert.equal(writes, 0);
  assert.equal(JSON.stringify(env.sheet().rows), before);
});

test('shuffled columns and an extra column are kept; two rows for one team and document stop the scan', () => {
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  env.f.c.scanTeamFiles();
  env.sheet().rows.forEach((row, index) => { row.reverse(); row.splice(2, 0, index ? 'keep me' : 'Notes'); });
  env.repo.commits[STEP1] = [commit('c9', BOB), commit('c1', ANN)];
  env.f.time('2032-01-01T00:00:00Z');
  assert.equal(plain(env.f.c.scanTeamFiles()).ok, true);
  const header = env.sheet().rows[0], at = (row, name) => row[header.indexOf(name)];
  assert.ok(env.sheet().rows.slice(1).every(row => at(row, 'Notes') === 'keep me'));
  const first = env.sheet().rows.slice(1).find(row => at(row, 'Document ID') === 'doc-0001');
  assert.deepEqual([at(first, 'Latest Commit'), at(first, 'Last Team Commit')], ['c9', 'c9']);
  env.sheet().rows.push(env.sheet().rows[1].slice());
  const before = JSON.stringify(env.sheet().rows);
  const outcome = plain(env.f.c.scanTeamFiles());
  assert.equal(outcome.ok, false);
  assert.match(outcome.message, /Nothing was changed/);
  assert.equal(JSON.stringify(env.sheet().rows), before);
});

test("GitHub is read without the script lock; the lock is held only for each team's sheet writes", () => {
  const env = setup();
  const second = addSecondTeam(env);
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  second.files[STEP1] = 'z'; second.commits[STEP1] = [commit('d1', 201)];
  const lock = env.f.c.LockService.getScriptLock(), held = [], waits = [];
  const request = env.f.c.makeGithubRequest_, waitLock = lock.waitLock;
  env.f.c.makeGithubRequest_ = (method, path) => { held.push(lock.hasLock()); return request(method, path); };
  lock.waitLock = ms => { waits.push(ms); return waitLock(ms); };
  const outcome = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([outcome.ok, outcome.teams], [true, 2]);
  assert.ok(held.length > 0 && held.every(value => value === false), 'no GitHub call is made under the lock');
  assert.equal(waits.length, 3, 'one short lock to start the run, then one per team');
  assert.equal(lock.hasLock(), false);
  assert.equal(env.f.properties.has('DOCUMENT_TEAM_SCAN_RUNNING'), false, 'the run marker is cleared');
});

test('a scan that is already running makes a second one skip; a marker left by a stopped run is ignored', () => {
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  env.f.time('2031-03-01T00:00:00Z');
  env.f.properties.set('DOCUMENT_TEAM_SCAN_RUNNING', String(Date.parse('2031-02-28T23:58:00Z')));
  assert.deepEqual(plain(env.f.c.scanTeamFiles()), {ok: false, reason: 'busy'});
  assert.equal(env.table().length, 0);
  assert.equal(env.f.properties.get('DOCUMENT_TEAM_SCAN_RUNNING'), String(Date.parse('2031-02-28T23:58:00Z')), 'the other run keeps its marker');
  env.f.properties.set('DOCUMENT_TEAM_SCAN_RUNNING', String(Date.parse('2031-02-28T23:50:00Z')));
  assert.equal(plain(env.f.c.scanTeamFiles()).ok, true);
  assert.equal(env.result('T1', 'doc-0001')['Team Changed'], 'Yes');
  assert.equal(env.f.properties.has('DOCUMENT_TEAM_SCAN_RUNNING'), false);
});

test("when the lock is busy at a team's write, the run stops before that team and the next run starts there", () => {
  const env = setup();
  const second = addSecondTeam(env);
  env.repo.files[STEP1] = 'a'; env.repo.commits[STEP1] = [commit('c1', ANN)];
  second.files[STEP1] = 'z'; second.commits[STEP1] = [commit('d1', 201)];
  const lock = env.f.c.LockService.getScriptLock(), waitLock = lock.waitLock;
  let calls = 0;
  lock.waitLock = ms => { calls += 1; if (calls === 3) throw new Error('Lock timeout'); return waitLock(ms); };
  const first = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([first.ok, first.teams, first.remaining], [true, 1, 1]);
  assert.deepEqual(env.table().map(row => row['Team ID']), ['T1', 'T1']);
  assert.equal(env.f.properties.get('DOCUMENT_TEAM_SCAN_CURSOR'), 't1');
  lock.waitLock = waitLock;
  const next = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([next.teams, next.remaining], [1, 0]);
  assert.equal(env.result('T2', 'doc-0001')['Team Changed'], 'Yes');
});

test('the scan is a guarded entry point and a missing sheet is reported', () => {
  const env = setup();
  env.f.sheets.delete('TeamFileStatus');
  const outcome = plain(env.f.c.scanTeamFiles());
  assert.deepEqual([outcome.ok, outcome.reason], [false, 'failed']);
  assert.match(outcome.message, /TeamFileStatus does not exist/);
});

test('the baseline is the content of the first commit: a file a teammate created has none, and an unreadable first commit is Unknown', () => {
  const env = setup();
  env.repo.files[STEP1] = 'a'; env.repo.files[STEP2] = 'b';
  env.repo.commits[STEP1] = [commit('c2', ADMIN), commit('c1', BOB)];
  env.repo.commits[STEP2] = [commit('d2', BOB), commit('d1', ADMIN)];
  env.repo.baselines = {[STEP1]: 'x'};
  env.f.c.scanTeamFiles();
  const one = env.result('T1', 'doc-0001'), two = env.result('T1', 'doc-0002');
  assert.deepEqual([one['Team Changed'], one['Baseline Blob SHA']], ['Yes', ''], 'created by a teammate: no baseline, changed by the team');
  assert.deepEqual([two['Team Changed'], two['Baseline Blob SHA']], ['Yes', 'tpl-' + STEP2]);
  const broken = setup();
  broken.repo.files[STEP1] = 'a';
  broken.repo.commits[STEP1] = [commit('c1', ADMIN)];
  broken.repo.baselines = {};
  broken.f.c.makeGithubRequest_ = ((original) => (method, path) => path.includes('/contents/') ? {status: 502, body: null} : original(method, path))(broken.f.c.makeGithubRequest_);
  broken.f.c.scanTeamFiles();
  assert.deepEqual([broken.result('T1', 'doc-0001')['Team Changed'], broken.result('T1', 'doc-0001')['Baseline Blob SHA']], ['Unknown', '']);
});
