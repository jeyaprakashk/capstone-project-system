// The activity engine (activity-engine.js, activity-check-github.js, activity-check-drive.js, activity-requirements-api.js):
// the loader, the decision, both checks and the coordinator endpoint. GitHub and Drive are the Phase 0 stubs; nothing is called live.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { githubSetupStub, makeDriveContext } = require('./title-baseline/stubs.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const HEADERS = ['Activity', 'Kind', 'Item', 'Label', 'Active'];
const WORK = 'Step1_Work_Breakdown.docx', NEED = 'Step2_Need_Analysis.docx';
const FILES = ['common-constants.js', 'common-helpers.js', 'api-envelope.js', 'sheet-columns.js', 'activity-engine.js', 'activity-check-github.js',
  'activity-check-drive.js', 'activity-check-document.js', 'activity-check-title.js', 'activity-requirements-api.js', 'document-service.js', 'document-drive.js', 'team-files.js', 'github-identity.js', 'weekly-activity.js'];

/**
 * spec: rows (sheet rows below the header), headers, present, github (preset name or {preset, overrides} or 'throws'), drive (makeDriveContext spec),
 * teamRows (the TeamStatus roster for the endpoint), commits (the Commits tab rows: {authorId, username, message}), collection (the team's
 * CommitCollectionStatus: 'ok', 'error' or ''), commitsThrow (reading the Commits tab throws), title ('approved', 'unapproved' or 'throws'),
 * definitions (the AssessmentDefinitions rows, or 'throws').
 */
function setup(spec = {}) {
  const drive = makeDriveContext(spec.drive || {teams: {T1: {files: [{name: WORK}, {name: NEED}]}}});
  const c = drive.context;
  c.console = {error() {}, log() {}};
  c.PropertiesService = {getScriptProperties: () => ({getProperty: () => null})};
  c.SpreadsheetApp = {getActiveSpreadsheet: () => ({getId: () => 'book'})};
  FILES.forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), c, {filename: file}));
  const reads = {sheet: 0, github: 0};
  c.getAcademicYear_ = () => '2026-27';
  c.getSpreadsheetId_ = () => 'sheet-1';
  c.getSheet_ = () => spec.present === false ? null : {};
  c.readSheetRows_ = () => { reads.sheet++; return [spec.headers || HEADERS, ...(spec.rows || [])]; };
  const github = spec.github === undefined ? 'ready' : spec.github;
  const stub = githubSetupStub(typeof github === 'string' ? github : github.preset, typeof github === 'string' ? {} : github.overrides);
  c.getTeamGithubSetup_ = (teamId, options) => { reads.github++; return stub.fn(teamId, options); };
  c.githubStubCalls = stub.calls;
  c.readCollectedCommits_ = () => { if (spec.commitsThrow) throw new Error('Commits tab unreadable.'); return spec.commits || []; };
  c.readCommitCollectionStatus_ = () => spec.collection === undefined ? 'ok' : spec.collection;
  c.readTitleIndex_ = () => { if (spec.title === 'throws') throw new Error('Title log unreadable.'); return {index: true}; };
  c.titleGate_ = (teamId, index) => { if (!index || index.index !== true) throw new Error('titleGate_ needs the index.'); return {approved: spec.title !== 'unapproved'}; };
  c.getAssessmentDefinitions_ = () => { if (spec.definitions === 'throws') throw new Error('Definitions unreadable.'); return spec.definitions || []; };
  c.getColumnMap_ = () => ({TEAM_ID: 0, SEMESTER: 1});
  c.getSheetRows_ = () => spec.teamRows || [['T1', 'Odd'], ['T2', 'Odd']];
  c.coordinatorAccessOrThrow_ = () => {};
  return {c, reads, drive};
}

const RULE = {
  github: ['title.submit', 'github', 'READY', 'GitHub setup complete', 'Yes'],
  work: ['title.submit', 'drive', WORK, 'Work Breakdown document', 'Yes'],
  need: ['title.submit', 'drive', NEED, 'Need Analysis document', 'Yes']
};
const TEAM = {teamId: 'T1', semester: 'Odd'};
const decide = (spec, activity = 'title.submit', team = TEAM) => {
  const env = setup(spec);
  return {env, result: plain(env.c.activityPreconditions_(activity, team, env.c.activityContext_()))};
};
const parse = (rows, headers = HEADERS, present = true) => {
  const {c} = setup();
  return plain(c.parseActivityRules_({present, headers, rows}, c.activityChecks_()));
};

// ---- the registry and the loader -------------------------------------------------------------------------------------------

test('the registry has exactly the four kinds, each with the full contract', () => {
  const {c} = setup();
  const checks = c.activityChecks_();
  assert.deepEqual(Object.keys(checks).sort(), ['document', 'drive', 'github', 'title']);
  for (const check of Object.values(checks)) {
    assert.deepEqual(Object.keys(check).sort(), ['isMet', 'needsApprovedTitle', 'perStudent', 'validItem']);
  }
  assert.equal(checks.github.validItem('READY'), true);
  assert.equal(checks.github.validItem('ready'), false);
  for (const item of ['USERNAMES', 'REPOSITORY', 'COMMITS']) assert.equal(checks.github.validItem(item), true, item);
  for (const item of ['repository', 'COMMIT', '']) assert.equal(checks.github.validItem(item), false, item);
  assert.equal(checks.title.validItem('approved'), true);
  assert.equal(checks.title.validItem('APPROVED'), false);
  assert.equal(checks.drive.validItem(WORK), true);
  assert.equal(checks.drive.validItem('Other.docx'), false);
});

test('valid rows are grouped by activity; Active = No rows are validated but left out; blank rows are ignored', () => {
  const result = parse([RULE.github, RULE.work, ['title.submit', 'drive', NEED, 'Need', ' no '], ['', '', '', '', ''], ['  ', '', '', '', ''], ['title.resubmit', ' GitHub ', 'READY', ' Setup ', 'YES']]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rules['title.submit'], [{kind: 'github', item: 'READY', label: 'GitHub setup complete'}, {kind: 'drive', item: WORK, label: 'Work Breakdown document'}]);
  assert.deepEqual(result.rules['title.resubmit'], [{kind: 'github', item: 'READY', label: 'Setup'}]);
});

test('every kind of misconfiguration is reported with its row and the whole gate denies', () => {
  const bad = {
    'unknown activity': [['title.other', 'github', 'READY', 'L', 'Yes'], /unknown activity/],
    'activity not trimmed': [[' title.submit', 'github', 'READY', 'L', 'Yes'], /unknown activity/],
    'unknown kind': [['title.submit', 'weekly', 'READY', 'L', 'Yes'], /unknown kind/],
    'invalid github item': [['title.submit', 'github', 'REPO', 'L', 'Yes'], /invalid item/],
    'invalid title item': [['title.submit', 'title', 'confirmed', 'L', 'Yes'], /invalid item/],
    'item with a stray space': [['title.submit', 'drive', WORK + ' ', 'L', 'Yes'], /invalid item/],
    'drive item outside the upload names': [['title.submit', 'drive', 'Other.docx', 'L', 'Yes'], /invalid item/],
    'blank label': [['title.submit', 'github', 'READY', '  ', 'Yes'], /label is blank/],
    'blank Active': [['title.submit', 'github', 'READY', 'L', ''], /Active must be Yes or No/],
    'bad Active': [['title.submit', 'github', 'READY', 'L', 'maybe'], /Active must be Yes or No/],
    'partially filled row': [['title.submit', '', '', '', ''], /unknown kind/],
    'the removed document.upload activity': [['document.upload', 'github', 'READY', 'L', 'Yes'], /unknown activity/]
  };
  for (const [name, [row, pattern]] of Object.entries(bad)) {
    const result = parse([RULE.github, row]);
    assert.equal(result.errors.length, 1, name);
    assert.match(result.errors[0], /^Row 3: /, name);
    assert.match(result.errors[0], pattern, name);
  }
  const wrongInactive = parse([['title.submit', 'github', 'REPO', 'L', 'No']]);
  assert.equal(wrongInactive.errors.length, 1, 'an inactive row is still validated');
});

test('a Needs-approved-title check under a title activity is a misconfiguration', () => {
  const {c} = setup();
  const checks = c.activityChecks_();
  checks.later = {needsApprovedTitle: true, perStudent: false, validItem: () => true, isMet: () => ({met: true})};
  for (const activity of ['title.submit', 'title.resubmit']) {
    const result = plain(c.parseActivityRules_({present: true, headers: HEADERS, rows: [[activity, 'later', 'x', 'L', 'Yes']]}, checks));
    assert.match(result.errors[0], /needs an approved title/, activity);
  }
});

test('a missing sheet, a missing header, a duplicate header or an unreadable sheet deny; extra columns and order are fine', () => {
  assert.deepEqual(parse([], HEADERS, false).errors, ['The ActivityDependencies sheet is missing.']);
  assert.match(parse([], ['Activity', 'Kind', 'Item', 'Label']).errors[0], /header "Active" is missing/);
  assert.match(parse([], [...HEADERS, 'active']).errors[0], /header "Active" appears more than once/);
  const reordered = parse([['Yes', 'L', 'READY', 'github', 'title.submit', 'ignored']], ['Active', 'Label', 'Item', 'Kind', 'Activity', 'Notes']);
  assert.deepEqual(reordered.errors, []);
  assert.deepEqual(reordered.rules['title.submit'], [{kind: 'github', item: 'READY', label: 'L'}]);
  const env = setup({rows: [RULE.github]});
  env.c.readSheetRows_ = () => { throw new Error('boom'); };
  const result = plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_()));
  assert.deepEqual(result, {allowed: false, requirements: [], reason: 'Submission requirements are misconfigured. Contact the coordinator.'});
});

test('the sheet is read once per request and never cached between requests', () => {
  const env = setup({rows: [RULE.github, RULE.work]});
  const ctx = env.c.activityContext_();
  env.c.activityPreconditions_('title.submit', TEAM, ctx);
  env.c.activityPreconditions_('title.resubmit', TEAM, ctx);
  assert.equal(env.reads.sheet, 1);
  env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_());
  assert.equal(env.reads.sheet, 2, 'a new request reads again');
});

// ---- the decision ----------------------------------------------------------------------------------------------------------

test('no rows for an activity allows it, and any misconfiguration denies every activity', () => {
  assert.deepEqual(decide({rows: []}).result, {allowed: true, requirements: [], reason: ''});
  assert.deepEqual(decide({rows: [RULE.github]}, 'title.resubmit').result, {allowed: true, requirements: [], reason: ''}, 'rows of another activity do not apply');
  const denied = decide({rows: [RULE.github, ['title.submit', 'weekly', 'x', 'L', 'Yes']]}, 'title.resubmit').result;
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'Submission requirements are misconfigured. Contact the coordinator.');
  assert.deepEqual(denied.requirements, []);
});

test('all requirements met allows; every unmet one is listed, with nothing skipped', () => {
  const rows = [RULE.github, RULE.work, RULE.need];
  const ok = decide({rows}).result;
  assert.equal(ok.allowed, true);
  assert.deepEqual(ok.requirements.map(r => r.met), [true, true, true]);
  const none = decide({rows, github: 'missingUsername', drive: {teams: {T1: {files: []}}}}).result;
  assert.equal(none.allowed, false);
  assert.deepEqual(none.requirements.map(r => r.label), ['GitHub setup complete', 'Work Breakdown document', 'Need Analysis document']);
  assert.deepEqual(none.requirements.map(r => r.met), [false, false, false]);
  assert.match(none.requirements[0].reason, /Waiting for valid GitHub usernames from teammate\(s\): R002/);
  assert.equal(none.requirements[1].reason, 'Not uploaded yet.');
  assert.match(none.reason, /GitHub setup complete: Waiting.*Work Breakdown document: Not uploaded yet\. Need Analysis document: Not uploaded yet\./);
  const half = decide({rows, drive: {teams: {T1: {files: [{name: WORK}]}}}}).result;
  assert.deepEqual(half.requirements.map(r => r.met), [true, true, false]);
});

test('Active = No rows are not enforced', () => {
  const rows = [RULE.github, ['title.submit', 'drive', WORK, 'Work', 'No']];
  assert.equal(decide({rows, drive: {teams: {T1: {files: []}}}}).result.allowed, true);
});

test('a check that throws is "Could not verify: <label>." and the others still run', () => {
  const env = setup({rows: [RULE.github, RULE.work]});
  env.c.getTeamGithubSetup_ = () => { throw new Error('GitHub is down'); };
  const result = plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_()));
  assert.equal(result.allowed, false);
  assert.equal(result.requirements[0].reason, 'Could not verify: GitHub setup complete.');
  assert.equal(result.requirements[0].diagnostic, 'GITHUB_ERROR');
  assert.equal(result.requirements[1].met, true, 'the Drive check still ran');
});

test('studentRequirements_ drops the diagnostic and nothing else', () => {
  const result = decide({rows: [RULE.github], github: 'verificationUnavailable'}).result;
  assert.equal(result.requirements[0].diagnostic, 'GITHUB_MEMBER_UNVERIFIED');
  const env = setup();
  const student = plain(env.c.studentRequirements_(result));
  assert.deepEqual(student, {allowed: false, reason: result.reason, requirements: [{label: 'GitHub setup complete', met: false, reason: 'Could not verify: GitHub setup complete.'}]});
  assert.ok(!JSON.stringify(student).includes('diagnostic'));
});

test('activityUnmetMessages_ lists the unmet items, or the single misconfiguration message', () => {
  const env = setup();
  const unmet = decide({rows: [RULE.github, RULE.work], github: 'noRepository', drive: {teams: {T1: {files: [{name: WORK}]}}}}).result;
  assert.deepEqual(plain(env.c.activityUnmetMessages_(unmet)), ['GitHub setup complete (All teammates have submitted valid GitHub usernames. Your repository is awaiting creation.)']);
  assert.deepEqual(plain(env.c.activityUnmetMessages_({allowed: true, requirements: [], reason: ''})), []);
  assert.deepEqual(plain(env.c.activityUnmetMessages_({allowed: false, requirements: [], reason: 'Submission requirements are misconfigured. Contact the coordinator.'})), ['Submission requirements are misconfigured. Contact the coordinator.']);
});

// ---- the github check ------------------------------------------------------------------------------------------------------

test('github: ready and ready-with-pending-invitation are met, and the setup is requested read-only', () => {
  for (const preset of ['ready', 'readyWithPendingInvitation']) {
    const env = setup({rows: [RULE.github], github: preset});
    const result = plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_()));
    assert.equal(result.allowed, true, preset);
    assert.deepEqual(plain(env.c.githubStubCalls[0].options), {readOnly: true});
  }
});

test('github: each unmet cause shows the setup message, and returned-unavailable shapes say "Could not verify"', () => {
  const messages = {
    missingUsername: /Waiting for valid GitHub usernames/, invalidUsername: /Waiting for valid GitHub usernames/, noRepository: /awaiting creation/,
    missingAccess: /Repository access setup is pending/, templatePending: /template setup is incomplete/
  };
  for (const [preset, pattern] of Object.entries(messages)) {
    const item = decide({rows: [RULE.github], github: preset}).result.requirements[0];
    assert.equal(item.met, false, preset);
    assert.match(item.reason, pattern, preset);
    assert.equal(item.diagnostic, undefined, preset);
  }
  const shapes = {verificationUnavailable: 'GITHUB_MEMBER_UNVERIFIED', accessUnavailable: 'GITHUB_MEMBER_UNVERIFIED', repositoryUnverified: 'GITHUB_REPOSITORY_UNVERIFIED'};
  for (const [preset, diagnostic] of Object.entries(shapes)) {
    const item = decide({rows: [RULE.github], github: preset}).result.requirements[0];
    assert.equal(item.reason, 'Could not verify: GitHub setup complete.', preset);
    assert.equal(item.diagnostic, diagnostic, preset);
  }
});

test('github: the result is cached per team inside one request', () => {
  const env = setup({rows: [RULE.github, ['title.resubmit', 'github', 'READY', 'GitHub', 'Yes']]});
  const ctx = env.c.activityContext_();
  env.c.activityPreconditions_('title.submit', TEAM, ctx);
  env.c.activityPreconditions_('title.resubmit', TEAM, ctx);
  assert.equal(env.reads.github, 1);
});

test('github: getTeamGithubSetup_ with readOnly does not write the accounts sheet when stored metadata is stale', () => {
  const source = fs.readFileSync('team-github-setup.js', 'utf8');
  assert.match(source, /if \(stale && !options\.readOnly\) refreshGithubAccountMetadata_\(submission,check\);/);
});

// ---- the drive check -------------------------------------------------------------------------------------------------------

test('drive: one live file is met; none, a trashed file or duplicates are unmet', () => {
  const rule = [RULE.work];
  assert.equal(decide({rows: rule, drive: {teams: {T1: {files: [{name: WORK}]}}}}).result.allowed, true);
  assert.equal(decide({rows: rule, drive: {teams: {T1: {files: [{name: WORK}, {name: 'Other.docx'}]}}}}).result.allowed, true);
  assert.equal(decide({rows: rule, drive: {teams: {T1: {files: [{name: WORK}, {name: WORK, trashed: true}]}}}}).result.allowed, true, 'a trashed copy does not count against it');
  assert.equal(decide({rows: rule, drive: {teams: {T1: {files: []}}}}).result.requirements[0].reason, 'Not uploaded yet.');
  assert.equal(decide({rows: rule, drive: {teams: {T1: {files: [{name: WORK, trashed: true}]}}}}).result.requirements[0].reason, 'Not uploaded yet.');
  assert.match(decide({rows: rule, drive: {teams: {T1: {files: [{name: WORK}, {name: WORK}]}}}}).result.requirements[0].reason, /More than one file/);
  assert.equal(decide({rows: rule, drive: {teams: {T1: {files: [{name: 'work.docx'}]}}}}).result.allowed, false, 'the name must match exactly');
});

test('drive: a confirmed absence says "not created yet"; anything unresolved says "Could not verify" with its diagnostic', () => {
  const rule = [RULE.work];
  const item = spec => decide({rows: rule, drive: spec}).result.requirements[0];
  assert.equal(item({teams: {}}).reason, 'Team folder not created yet.', 'Team Documents exists, this team has no folder');
  assert.equal(item({documentsFolders: 0, teams: {}}).reason, 'Team folder not created yet.', 'Team Documents does not exist');
  assert.equal(item({teams: {T1: {folders: 0}}}).reason, 'Team folder not created yet.');
  const unresolved = {
    'more than one Team Documents': [{documentsFolders: 2, teams: {}}, 'TEAM_DOCUMENTS_UNRESOLVED'],
    'spreadsheet folder unreadable': [{unreadable: true, teams: {}}, 'TEAM_DOCUMENTS_UNRESOLVED'],
    'spreadsheet not in a folder': [{parents: 0, teams: {}}, 'TEAM_DOCUMENTS_UNRESOLVED'],
    'spreadsheet in several folders': [{parents: 2, teams: {}}, 'TEAM_DOCUMENTS_UNRESOLVED'],
    'spreadsheet at the top of My Drive': [{inRoot: true, teams: {}}, 'TEAM_DOCUMENTS_UNRESOLVED'],
    'duplicate team folders': [{teams: {T1: {folders: 2, files: [{name: WORK}]}}}, 'FOLDER_AMBIGUOUS']
  };
  for (const [name, [spec, diagnostic]] of Object.entries(unresolved)) {
    const answer = item(spec);
    assert.equal(answer.reason, 'Could not verify: Work Breakdown document.', name);
    assert.equal(answer.diagnostic, diagnostic, name);
    assert.doesNotMatch(answer.reason, /not created/, name);
  }
});

test('drive: a Drive error while listing files is unresolved, and the folder is looked up once per request', () => {
  const env = setup({rows: [RULE.work, RULE.need], drive: {teams: {T1: {files: [{name: WORK}, {name: NEED}]}}}});
  const folder = env.drive.folderOf.T1[0];
  let lookups = 0;
  const original = env.drive.documents[0].getFoldersByName.bind(env.drive.documents[0]);
  env.drive.documents[0].getFoldersByName = name => { lookups++; return original(name); };
  const ctx = env.c.activityContext_();
  const result = plain(env.c.activityPreconditions_('title.submit', TEAM, ctx));
  assert.equal(result.allowed, true);
  assert.equal(lookups, 1, 'both rows used one folder lookup');
  folder.getFilesByName = () => { throw new Error('Drive error'); };
  const failing = plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_()));
  assert.equal(failing.requirements[0].reason, 'Could not verify: Work Breakdown document.');
  assert.equal(failing.requirements[0].diagnostic, 'TEAM_DOCUMENTS_UNRESOLVED');
});

test('drive: the check never creates anything', () => {
  const text = fs.readFileSync('activity-check-drive.js', 'utf8');
  assert.doesNotMatch(text, /createFolder|createFile|setTrashed|makeCopy|moveTo|setContent/);
  assert.doesNotMatch(fs.readFileSync('activity-check-github.js', 'utf8'), /setValues|appendRow|PropertiesService/);
});

// ---- the coordinator endpoint -----------------------------------------------------------------------------------------------

test('API_coordinator_getRequirements without a team returns the parsed rules and the loader errors', () => {
  const env = setup({rows: [RULE.github, RULE.work]});
  const frame = JSON.parse(env.c.API_coordinator_getRequirements());
  assert.equal(frame.ok, true);
  assert.deepEqual(frame.data.rules['title.submit'].map(r => r.kind), ['github', 'drive']);
  assert.deepEqual(frame.data.rules['title.resubmit'], []);
  assert.deepEqual(frame.data.errors, []);
  assert.equal(frame.data.teamId, null);
  const broken = setup({rows: [['title.submit', 'weekly', 'x', 'L', 'Yes']]});
  const errors = JSON.parse(broken.c.API_coordinator_getRequirements()).data.errors;
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Row 2: unknown kind/);
});

test('API_coordinator_getRequirements with a team returns each activity\'s checklist including the diagnostics', () => {
  const env = setup({rows: [RULE.github, RULE.work], github: 'verificationUnavailable', drive: {teams: {T1: {files: []}}}});
  const data = JSON.parse(env.c.API_coordinator_getRequirements(' t1 ')).data;
  assert.equal(data.teamId, 'T1');
  assert.deepEqual(Object.keys(data.activities).sort(), ['title.resubmit', 'title.submit']);
  assert.equal(data.activities['title.submit'].allowed, false);
  assert.equal(data.activities['title.submit'].requirements[0].diagnostic, 'GITHUB_MEMBER_UNVERIFIED');
  assert.equal(data.activities['title.submit'].requirements[1].reason, 'Not uploaded yet.');
  assert.equal(env.reads.github, 1, 'GitHub is asked once for the whole report');
});

test('API_coordinator_getRequirements: an unknown team is NOT_FOUND and nothing is evaluated; a non-coordinator is refused first', () => {
  const env = setup({rows: [RULE.github]});
  const frame = JSON.parse(env.c.API_coordinator_getRequirements('T99'));
  assert.deepEqual(frame.error, {code: 'NOT_FOUND', message: 'Team not found.'});
  assert.equal(env.reads.github, 0);
  env.c.coordinatorAccessOrThrow_ = () => { throw env.c.apiFail_('UNAUTHORIZED', 'No.'); };
  const refused = setup({rows: [RULE.github]});
  refused.c.coordinatorAccessOrThrow_ = () => { throw refused.c.apiFail_('UNAUTHORIZED', 'No.'); };
  assert.equal(JSON.parse(refused.c.API_coordinator_getRequirements('T1')).error.code, 'UNAUTHORIZED');
  assert.equal(refused.reads.sheet, 0);
  assert.equal(refused.reads.github, 0);
});

test('source rules: the engine files add no public function except the endpoint and never write', () => {
  for (const file of ['activity-engine.js', 'activity-check-github.js', 'activity-check-drive.js', 'activity-requirements-api.js']) {
    const text = fs.readFileSync(file, 'utf8');
    const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
    assert.deepEqual(publicFunctions, file === 'activity-requirements-api.js' ? ['API_coordinator_getRequirements'] : [], file);
    assert.doesNotMatch(text, /setValues|appendRow|LockService|MailApp/, file);
  }
});

test('with no rows for an activity a title can be submitted whatever GitHub or Drive say (the release default)', () => {
  for (const spec of [{github: 'throws'}, {github: 'verificationUnavailable'}, {drive: {documentsFolders: 2, teams: {}}}, {drive: {unreadable: true, teams: {}}}]) {
    const result = decide({rows: [], ...spec}).result;
    assert.deepEqual(result, {allowed: true, requirements: [], reason: ''}, JSON.stringify(spec));
  }
  const env = setup({rows: [], github: 'throws'});
  env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_());
  assert.equal(env.reads.github, 0, 'GitHub is not even asked when nothing requires it');
});

// ---- the document check (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, Phase 5) ------------------------------------------------------

const DOC_ROW = ['title.submit', 'document', 'doc-0001', 'Work Breakdown approved', 'Yes'];
const listed = (overrides = {}) => ({record: Object.assign({documentId: 'doc-0001', folder: '1_Documents', fileName: WORK, active: 'Yes', inTeamTemplate: 'Yes', nameConflict: 'No'}, overrides)});
const journalRow = (revision, action, extra = {}) => Object.assign({teamId: 'T1', documentId: 'doc-0001', revision, action, requestId: 'r' + revision, rowNumber: revision + 1}, extra);
function documentDecide(spec = {}) {
  const env = setup({rows: [DOC_ROW], drive: spec.drive || {teams: {T1: {files: [{name: WORK}]}}}});
  const c = env.c, rows = spec.journal || [];
  c.readTemplateFiles_ = () => { if (spec.templateThrows) throw new Error('down'); return {records: spec.listed || [listed()]}; };
  c.readDocumentJournal_ = () => {
    if (spec.journalThrows) throw new Error('down');
    return {rows, rowsFor: (teamId, documentId) => rows.filter(row => row.teamId === teamId && row.documentId === documentId)};
  };
  const files = env.drive.folderOf.T1 ? env.drive.folderOf.T1[0].files : [];
  (spec.descriptions || []).forEach((description, index) => { files[index].getDescription = () => description; });
  files.forEach(file => { if (!file.getDescription) file.getDescription = () => ''; });
  return plain(c.activityPreconditions_('title.submit', TEAM, c.activityContext_()));
}
const reasonOf = result => result.requirements[0].reason;

test('document: the item must be a Document ID, and an unlisted ID is a misconfiguration', () => {
  const {c} = setup();
  const check = c.activityChecks_().document;
  assert.equal(check.validItem('doc-0001'), true);
  assert.equal(check.validItem('doc-1'), false);
  assert.equal(check.validItem(WORK), false);
  for (const overrides of [{active: 'No'}, {inTeamTemplate: 'No'}, {nameConflict: 'Yes'}, {documentId: 'doc-0002'}]) {
    const result = documentDecide({listed: [listed(overrides)], journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')]});
    assert.equal(result.allowed, false, JSON.stringify(overrides));
    assert.equal(reasonOf(result), 'Submission requirements are misconfigured. Contact the coordinator.');
  }
});

test('document: approved and reopened content with one live file is met; a file with no row is not', () => {
  assert.equal(documentDecide({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')]}).allowed, true);
  assert.equal(documentDecide({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE'), journalRow(3, 'REOPEN')]}).allowed, true);
  const placed = documentDecide({journal: []});
  assert.equal(placed.allowed, false, 'a file with no journal row is not submitted');
  assert.equal(reasonOf(placed), 'Not approved yet.');
});

test('document: not submitted, waiting for the guide and returned are unmet with their own sentence', () => {
  const none = documentDecide({journal: [], drive: {teams: {T1: {files: []}}}});
  assert.equal(none.allowed, false);
  assert.equal(reasonOf(none), 'Not approved yet.');
  assert.equal(reasonOf(documentDecide({journal: [journalRow(1, 'SUBMIT')]})), 'Waiting for the guide to approve it.');
  assert.equal(reasonOf(documentDecide({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'RETURN')]})), 'Returned by the guide. Submit it again.');
});

test('document: an approved document whose file is gone, trashed or duplicated is unmet', () => {
  const approved = [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')];
  assert.match(reasonOf(documentDecide({journal: approved, drive: {teams: {T1: {files: []}}}})), /missing/);
  assert.match(reasonOf(documentDecide({journal: approved, drive: {teams: {T1: {files: [{name: WORK, trashed: true}]}}}})), /missing/);
  assert.match(reasonOf(documentDecide({journal: approved, drive: {teams: {T1: {files: [{name: WORK}, {name: WORK}]}}}})), /More than one/);
  assert.match(reasonOf(documentDecide({journal: approved, drive: {teams: {}}})), /Team folder not created/);
});

test('document: unreadable sources and an invalid journal are Could not verify, and the engine hides the diagnostic from the reason', () => {
  const approved = [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')];
  for (const spec of [{templateThrows: true}, {journalThrows: true}, {journal: [journalRow(2, 'SUBMIT')]}, {drive: {unreadable: true, teams: {}}}]) {
    const result = documentDecide(Object.assign({journal: approved}, spec));
    assert.equal(result.allowed, false, JSON.stringify(spec));
    assert.equal(reasonOf(result), 'Could not verify: Work Breakdown approved.', JSON.stringify(spec));
  }
});

test('document: a Drive write whose journal row is missing is unmet until it is settled', () => {
  const approved = [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')];
  const pending = documentDecide({journal: approved, descriptions: [JSON.stringify({v: 1, requestId: 'not-in-journal', teamId: 'T1', documentId: 'doc-0001', revision: 3})]});
  assert.equal(pending.allowed, false);
  assert.match(reasonOf(pending), /still being recorded/);
  const settled = documentDecide({journal: approved, descriptions: [JSON.stringify({v: 1, requestId: 'r1', teamId: 'T1', documentId: 'doc-0001', revision: 1})]});
  assert.equal(settled.allowed, true);
});

test('document: the existing drive kind is unchanged by a pending or returned submission', () => {
  const result = decide({rows: [RULE.work], drive: {teams: {T1: {files: [{name: WORK}]}}}}).result;
  assert.equal(result.allowed, true);
});

// ---- the github items, the title kind and the review activities ------------------------------------------------------------------

const ITEM = (item, activity = 'title.submit') => [activity, 'github', item, item + ' label', 'Yes'];
const REVIEW_DEFINITIONS = [{key: 'review1', type: 'REVIEW'}, {key: 'review2', type: 'REVIEW'}, {key: 'guide_eval', type: 'GUIDE_EVALUATION'}, {key: 'see', type: 'SEE'}];
const only = (spec, item) => decide({...spec, rows: [ITEM(item)]}).result.requirements[0];
const commitBy = (authorId, extra = {}) => ({authorId, username: 'user' + authorId, message: 'Add the parser', ...extra});

test('github USERNAMES: met when every username is valid, unmet with the setup message, unverifiable when GitHub cannot say', () => {
  assert.equal(only({github: 'noRepository'}, 'USERNAMES').met, true, 'a missing repository does not matter to this item');
  for (const preset of ['missingUsername', 'invalidUsername']) {
    const answer = only({github: preset}, 'USERNAMES');
    assert.equal(answer.met, false, preset);
    assert.match(answer.reason, /Waiting for valid GitHub usernames/, preset);
  }
  const unavailable = only({github: 'verificationUnavailable'}, 'USERNAMES');
  assert.equal(unavailable.reason, 'Could not verify: USERNAMES label.');
  assert.equal(unavailable.diagnostic, 'GITHUB_MEMBER_UNVERIFIED');
  assert.equal(only({github: 'throws'}, 'USERNAMES').diagnostic, 'GITHUB_ERROR');
});

test('github REPOSITORY: met when the repository is saved and verified, whatever the members\' access', () => {
  assert.equal(only({github: 'ready'}, 'REPOSITORY').met, true);
  assert.equal(only({github: 'missingAccess'}, 'REPOSITORY').met, true, 'access is not this item');
  assert.match(only({github: 'noRepository'}, 'REPOSITORY').reason, /has not been created yet/);
  assert.match(only({github: 'missingUsername'}, 'REPOSITORY').reason, /once every teammate has a valid GitHub username/);
  assert.equal(only({github: 'repositoryUnverified'}, 'REPOSITORY').diagnostic, 'GITHUB_REPOSITORY_UNVERIFIED');
  assert.equal(only({github: 'verificationUnavailable'}, 'REPOSITORY').diagnostic, 'GITHUB_MEMBER_UNVERIFIED');
});

test('github COMMITS: every member needs a commit of their own that the weekly rule would count', () => {
  const both = [commitBy('101'), commitBy('102')];
  assert.equal(only({commits: both}, 'COMMITS').met, true);
  assert.equal(only({commits: [commitBy('101'), commitBy(102)]}, 'COMMITS').met, true, 'the author ID may be a number');
  assert.equal(only({commits: [commitBy('101')]}, 'COMMITS').reason, 'No commit yet from: R002.');
  assert.equal(only({commits: []}, 'COMMITS').reason, 'No commit yet from: R001, R002.');
  const notCounted = {
    'a bot': commitBy('102', {username: 'dependabot[bot]'}),
    'an unknown author': commitBy('102', {username: '(unknown)'}),
    'the template\'s first commit': commitBy('102', {message: 'Initial commit: Capstone project for Team T1'}),
    'an unlinked author': commitBy('', {username: 'student2'}),
    'another member\'s ID': commitBy('101', {username: 'student2'})
  };
  for (const [name, row] of Object.entries(notCounted)) {
    const answer = only({commits: [commitBy('101'), row]}, 'COMMITS');
    assert.equal(answer.met, false, name);
    assert.equal(answer.reason, 'No commit yet from: R002.', name);
  }
});

test('github COMMITS: a missing commit is "Could not verify" while the collection failed or has not run; found commits still count', () => {
  const missingOne = [commitBy('101')];
  assert.equal(only({commits: missingOne, collection: 'error'}, 'COMMITS').diagnostic, 'COMMITS_COLLECTION_FAILED');
  assert.equal(only({commits: missingOne, collection: ''}, 'COMMITS').diagnostic, 'COMMITS_NOT_COLLECTED');
  assert.equal(only({commits: missingOne, collection: 'error'}, 'COMMITS').reason, 'Could not verify: COMMITS label.');
  assert.equal(only({commits: [commitBy('101'), commitBy('102')], collection: 'error'}, 'COMMITS').met, true, 'every member is already proven');
  assert.equal(only({commits: [commitBy('101'), commitBy('102')], commitsThrow: true}, 'COMMITS').diagnostic, 'COMMITS_UNREADABLE');
  assert.equal(only({commitsThrow: true}, 'COMMITS').diagnostic, 'COMMITS_UNREADABLE');
});

test('github COMMITS: without every valid username it says so, and the Commits tab is not read', () => {
  const env = setup({rows: [ITEM('COMMITS')], github: 'missingUsername'});
  let reads = 0;
  env.c.readCollectedCommits_ = () => { reads++; return []; };
  const result = plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_()));
  assert.match(result.requirements[0].reason, /Waiting for valid GitHub usernames/);
  assert.equal(reads, 0);
  assert.equal(only({github: 'verificationUnavailable'}, 'COMMITS').diagnostic, 'GITHUB_MEMBER_UNVERIFIED');
  assert.equal(only({github: 'throws'}, 'COMMITS').diagnostic, 'GITHUB_ERROR');
});

test('github: READY is unchanged, and all four items share one setup read per request', () => {
  const env = setup({rows: ['USERNAMES', 'REPOSITORY', 'COMMITS', 'READY'].map(item => ITEM(item)), commits: [commitBy('101'), commitBy('102')]});
  const result = plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_()));
  assert.equal(result.allowed, true);
  assert.equal(env.reads.github, 1);
  assert.equal(result.requirements.length, 4);
});

test('title: met once the title is approved, unmet before, "Could not verify" when the history cannot be read', () => {
  const rule = [['review1', 'title', 'approved', 'Project title approved', 'Yes']];
  const decideReview = spec => decide({rows: rule, definitions: REVIEW_DEFINITIONS, ...spec}, 'review1').result;
  assert.equal(decideReview({title: 'approved'}).allowed, true);
  const unmet = decideReview({title: 'unapproved'});
  assert.equal(unmet.allowed, false);
  assert.equal(unmet.requirements[0].reason, 'The project title has not been approved yet.');
  const unreadable = decideReview({title: 'throws'});
  assert.equal(unreadable.requirements[0].reason, 'Could not verify: Project title approved.');
  assert.equal(unreadable.requirements[0].diagnostic, 'TITLE_HISTORY_UNAVAILABLE');
});

test('title: the title index is read once per request and a title row is refused under title.submit and title.resubmit', () => {
  const env = setup({rows: [['review1', 'title', 'approved', 'A', 'Yes'], ['review1', 'title', 'approved', 'B', 'Yes']], definitions: REVIEW_DEFINITIONS});
  let reads = 0;
  const original = env.c.readTitleIndex_;
  env.c.readTitleIndex_ = () => { reads++; return original(); };
  assert.equal(plain(env.c.activityPreconditions_('review1', TEAM, env.c.activityContext_())).allowed, true);
  assert.equal(reads, 1);
  for (const activity of ['title.submit', 'title.resubmit']) {
    const errors = parse([[activity, 'title', 'approved', 'L', 'Yes']]).errors;
    assert.match(errors[0], /needs an approved title/, activity);
  }
});

test('review activities: each REVIEW assessment is an activity; the guide evaluation, SEE and unknown keys are not', () => {
  const ids = spec => setup(spec).c.activityIds_();
  assert.deepEqual(plain(ids({definitions: REVIEW_DEFINITIONS})), ['title.submit', 'title.resubmit', 'review1', 'review2']);
  assert.deepEqual(plain(ids({definitions: 'throws'})), ['title.submit', 'title.resubmit'], 'unreadable definitions leave the title activities');
  assert.deepEqual(plain(ids({})), ['title.submit', 'title.resubmit']);
  const {c} = setup({definitions: REVIEW_DEFINITIONS});
  const rows = [['review1', 'github', 'READY', 'L', 'Yes'], ['review2', 'title', 'approved', 'L', 'Yes']];
  const good = plain(c.parseActivityRules_({present: true, headers: HEADERS, rows}, c.activityChecks_()));
  assert.deepEqual(good.errors, []);
  assert.deepEqual(Object.keys(good.rules), ['review1', 'review2']);
  for (const activity of ['guide_eval', 'see', 'review3', 'Review1']) {
    const bad = plain(c.parseActivityRules_({present: true, headers: HEADERS, rows: [[activity, 'github', 'READY', 'L', 'Yes']]}, c.activityChecks_()));
    assert.match(bad.errors[0], /unknown activity/, activity);
  }
});

test('review activities: a later review needs only rows, and the report lists each review', () => {
  const env = setup({rows: [['review3', 'title', 'approved', 'Title', 'Yes']], definitions: [...REVIEW_DEFINITIONS, {key: 'review3', type: 'REVIEW'}]});
  assert.equal(plain(env.c.activityPreconditions_('review3', TEAM, env.c.activityContext_())).allowed, true);
  const frame = JSON.parse(env.c.API_coordinator_getRequirements('T1'));
  assert.deepEqual(frame.data.errors, []);
  assert.deepEqual(Object.keys(frame.data.rules), ['title.submit', 'title.resubmit', 'review1', 'review2', 'review3']);
  assert.deepEqual(Object.keys(frame.data.activities), ['title.submit', 'title.resubmit', 'review1', 'review2', 'review3']);
  assert.equal(frame.data.rules.review3.length, 1);
});

test('review activities: the review rows decide the review, the title activities are unaffected, and unmet items are all listed', () => {
  const rows = [['review1', 'title', 'approved', 'Project title approved', 'Yes'], ['review1', 'github', 'COMMITS', 'Every member has committed', 'Yes'], RULE.github];
  const env = setup({rows, definitions: REVIEW_DEFINITIONS, title: 'unapproved', commits: [commitBy('101')]});
  const review = plain(env.c.activityPreconditions_('review1', TEAM, env.c.activityContext_()));
  assert.equal(review.allowed, false);
  assert.deepEqual(review.requirements.map(item => item.met), [false, false]);
  assert.equal(review.reason, 'Project title approved: The project title has not been approved yet. Every member has committed: No commit yet from: R002.');
  assert.equal(plain(env.c.activityPreconditions_('title.submit', TEAM, env.c.activityContext_())).allowed, true, 'only its own rows apply');
  assert.equal(plain(env.c.activityPreconditions_('review2', TEAM, env.c.activityContext_())).allowed, true, 'no rows allows');
});

test('source rules: the new check files add no public function and never write', () => {
  for (const file of ['activity-check-title.js', 'activity-check-github.js']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.deepEqual([...text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_')), [], file);
    assert.doesNotMatch(text, /setValues|appendRow|LockService|MailApp|setProperty/, file);
  }
});

test('a context that lists kinds evaluates only those rows; the others are skipped, not met', () => {
  const rows = [['review1', 'title', 'approved', 'Title', 'Yes'], ['review1', 'github', 'COMMITS', 'Commits', 'Yes'], ['review1', 'drive', WORK, 'Work', 'Yes']];
  const env = setup({rows, definitions: REVIEW_DEFINITIONS, title: 'unapproved', commits: []});
  const run = kinds => { const ctx = env.c.activityContext_(); if (kinds) ctx.kinds = kinds; return plain(env.c.activityPreconditions_('review1', TEAM, ctx)); };
  assert.deepEqual(run(['title']).requirements.map(item => item.label), ['Title'], 'only the title row ran');
  assert.equal(run(['title']).allowed, false);
  assert.equal(env.reads.github, 0, 'GitHub was not asked');
  assert.deepEqual(run().requirements.map(item => item.label), ['Title', 'Commits', 'Work'], 'no list means every kind');
  assert.deepEqual(run(['document']), {allowed: true, requirements: [], reason: ''}, 'no row of that kind means nothing to meet');
  assert.deepEqual(run([]).requirements, []);
});

// ---- a hint context: a yes-or-no label, cheapest rows first, stop at the first unmet, documents from the journal ----------------------------------

function hintRun(spec = {}) {
  const env = setup({rows: spec.rows || [DOC_ROW], drive: spec.drive || {teams: {T1: {files: [{name: WORK}]}}}, github: spec.github, title: spec.title, definitions: REVIEW_DEFINITIONS, commits: spec.commits});
  const c = env.c, journal = spec.journal || [];
  c.readTemplateFiles_ = () => ({records: [listed()]});
  c.readDocumentJournal_ = () => ({rows: journal, rowsFor: (teamId, documentId) => journal.filter(row => row.teamId === teamId && row.documentId === documentId)});
  const drive = {folders: 0, files: 0};
  const folders = env.drive.documents[0];
  const lookup = folders.getFoldersByName.bind(folders);
  folders.getFoldersByName = name => { drive.folders++; return lookup(name); };
  (env.drive.folderOf.T1 || []).forEach(folder => {
    const byName = folder.getFilesByName.bind(folder);
    folder.getFilesByName = name => { drive.files++; return byName(name); };
    folder.files.forEach(file => { file.getDescription = () => ''; });
  });
  const ctx = c.activityContext_();
  if (spec.hint !== false) ctx.hint = true;
  const activity = spec.activity || 'title.submit';
  return {result: plain(c.activityPreconditions_(activity, TEAM, ctx)), drive, env};
}

test('hint: a document with a journal row is answered from the journal, with no Drive read', () => {
  const approved = hintRun({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')]});
  assert.equal(approved.result.allowed, true);
  assert.deepEqual(approved.drive, {folders: 0, files: 0});
  const reopened = hintRun({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE'), journalRow(3, 'REOPEN')]});
  assert.equal(reopened.result.allowed, true);
  const waiting = hintRun({journal: [journalRow(1, 'SUBMIT')]});
  assert.equal(waiting.result.requirements[0].reason, 'Waiting for the guide to approve it.');
  const returned = hintRun({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'RETURN')]});
  assert.equal(returned.result.requirements[0].reason, 'Returned by the guide. Submit it again.');
  assert.deepEqual(waiting.drive, {folders: 0, files: 0});
  assert.deepEqual(returned.drive, {folders: 0, files: 0});
});

test('hint: a document with no row is unmet with no Drive read; an invalid journal falls through to the strict answer', () => {
  const placed = hintRun({journal: []});
  assert.equal(placed.result.allowed, false, 'a file with no row is not submitted');
  assert.equal(placed.result.requirements[0].reason, 'Not approved yet.');
  assert.deepEqual(placed.drive, {folders: 0, files: 0}, 'Drive was not asked');
  const none = hintRun({journal: [], drive: {teams: {T1: {files: []}}}});
  assert.equal(none.result.requirements[0].reason, 'Not approved yet.');
  assert.equal(none.result.allowed, false);
  const broken = hintRun({journal: [journalRow(1, 'APPROVE')]});
  assert.equal(broken.result.requirements[0].diagnostic, 'DOCUMENT_JOURNAL_INVALID', 'a journal that cannot be read in order is not trusted');
});

test('hint: the strict gate is unchanged: an approved row still needs its one file in the folder', () => {
  const approvedRows = [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')];
  const strict = hintRun({hint: false, journal: approvedRows, drive: {teams: {T1: {files: []}}}});
  assert.equal(strict.result.requirements[0].reason, 'The approved file is missing from the team folder.');
  const hint = hintRun({journal: approvedRows, drive: {teams: {T1: {files: []}}}});
  assert.equal(hint.result.allowed, true, 'the hint trusts the journal');
});

test('hint: rows run cheapest first and stop at the first one definitely unmet', () => {
  const rows = [['review1', 'github', 'COMMITS', 'Commits', 'Yes'], ['review1', 'document', 'doc-0001', 'Doc', 'Yes'], ['review1', 'title', 'approved', 'Title', 'Yes']];
  const stops = hintRun({rows, activity: 'review1', title: 'unapproved'});
  assert.deepEqual(stops.result.requirements.map(item => item.label), ['Title'], 'the title is cheapest and unmet, so nothing else ran');
  assert.equal(stops.env.reads.github, 0, 'GitHub was not asked');
  assert.deepEqual(stops.drive, {folders: 0, files: 0}, 'Drive was not asked');
  const next = hintRun({rows, activity: 'review1', title: 'approved', journal: [journalRow(1, 'SUBMIT')]});
  assert.deepEqual(next.result.requirements.map(item => item.label), ['Title', 'Doc'], 'order is title, then documents, then GitHub');
  assert.equal(next.env.reads.github, 0);
  assert.equal(next.result.allowed, false);
  const all = hintRun({rows, activity: 'review1', title: 'approved', journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')], commits: [commitBy('101'), commitBy('102')]});
  assert.deepEqual(all.result.requirements.map(item => item.label), ['Title', 'Doc', 'Commits']);
  assert.equal(all.result.allowed, true);
});

test('hint: a row that could not be verified does not stop the run, and without the hint every row runs in sheet order', () => {
  const rows = [['review1', 'document', 'doc-0001', 'Doc', 'Yes'], ['review1', 'title', 'approved', 'Title', 'Yes']];
  const unverifiable = hintRun({rows, activity: 'review1', title: 'throws', journal: [journalRow(1, 'SUBMIT')]});
  assert.deepEqual(unverifiable.result.requirements.map(item => item.label), ['Title', 'Doc'], 'an unreadable title is not a definite failure, so the next row ran');
  const strict = hintRun({rows, activity: 'review1', hint: false, title: 'unapproved', journal: [journalRow(1, 'SUBMIT')]});
  assert.deepEqual(strict.result.requirements.map(item => item.label), ['Doc', 'Title'], 'the gate runs every row, in the sheet\'s order');
});
