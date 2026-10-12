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
  'activity-check-drive.js', 'activity-check-document.js', 'activity-requirements-api.js', 'document-service.js', 'document-drive.js', 'team-files.js'];

/**
 * spec: rows (sheet rows below the header), headers, present, github (preset name or {preset, overrides} or 'throws'), drive (makeDriveContext spec),
 * teamRows (the TeamStatus roster for the endpoint).
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

test('the registry has exactly the three kinds, each with the full contract', () => {
  const {c} = setup();
  const checks = c.activityChecks_();
  assert.deepEqual(Object.keys(checks).sort(), ['document', 'drive', 'github']);
  for (const check of Object.values(checks)) {
    assert.deepEqual(Object.keys(check).sort(), ['isMet', 'needsApprovedTitle', 'perStudent', 'validItem']);
  }
  assert.equal(checks.github.validItem('READY'), true);
  assert.equal(checks.github.validItem('ready'), false);
  assert.equal(checks.github.validItem('REPOSITORY'), false);
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

// ---- the document check (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, Phase 5) ------------------------------------------------------

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

test('document: approved and reopened content with one live file is met; a hand-placed file with no row is met', () => {
  assert.equal(documentDecide({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE')]}).allowed, true);
  assert.equal(documentDecide({journal: [journalRow(1, 'SUBMIT'), journalRow(2, 'APPROVE'), journalRow(3, 'REOPEN')]}).allowed, true);
  assert.equal(documentDecide({journal: []}).allowed, true, 'an existing file counts as approved');
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
