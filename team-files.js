/**
 * TEAM FILES - process B of TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md (section 5): a daily scan that records, for every team and every
 * listed template document, whether a team member has changed the file in the team's repository. The student screen reads this
 * record; Submit checks GitHub again at the moment of the click.
 *
 * Team Changed is Yes when the file is present on the default branch, differs from the file the team received (the bundled template
 * manifest), and at least one commit that touched the path was made by a team member's linked GitHub account. It is No when that is
 * definitely not so, and Unknown when it could not be established (GitHub failed, or the history was longer than the search limit):
 * Unknown is never treated as No and never allows a submission.
 */
const TEAM_FILE_STATUS_FIELDS_ = Object.freeze({
  teamId: 'Team ID', documentId: 'Document ID', repoBlobSha: 'Repo Blob SHA', teamChanged: 'Team Changed',
  lastTeamCommit: 'Last Team Commit', latestCommit: 'Latest Commit', checkedAt: 'Checked At'
});
const TEAM_FILE_HISTORY_PAGE_SIZE_ = 100;
const TEAM_FILE_HISTORY_PAGES_ = 10;
const TEAM_FILE_SCAN_BUDGET_MS_ = 240000;
const TEAM_FILE_SCAN_CURSOR_KEY_ = 'DOCUMENT_TEAM_SCAN_CURSOR';

/** The listed template documents: active, in the team template and without a name conflict. [{documentId, path}] */
function listedTemplateDocuments_(records) {
  return records
    .filter(item => item.record.active === 'Yes' && item.record.inTeamTemplate === 'Yes' && item.record.nameConflict === 'No')
    .map(item => ({documentId: item.record.documentId, folder: item.record.folder, fileName: item.record.fileName, path: item.record.folder + '/' + item.record.fileName}));
}

/** path -> the blob SHA the team's repository was created with (the bundled manifest). */
function teamFileBaselines_() {
  return new Map(githubTemplateManifest_().map(entry => [entry.path, entry.sha]));
}

/** Normalized Team ID -> Set of the GitHub numeric IDs linked by that team's students. */
function teamLinkedGithubIds_() {
  const sheet = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(sheet), byTeam = new Map();
  readSheetRows_(sheet, 2).forEach(row => {
    const id = githubId_(row[columns.ID]), key = normalizeText_(row[columns.TEAM_ID]);
    if (!id || !key) return;
    if (!byTeam.has(key)) byTeam.set(key, new Set());
    byTeam.get(key).add(id);
  });
  return byTeam;
}

/** The default branch and the blob SHA of every file of a team repository. Throws when GitHub cannot give a complete answer. */
function teamRepositoryTree_(slug) {
  const repo = makeGithubRequest_('GET', '/repos/' + slug);
  if (repo.status !== 200 || !repo.body || !repo.body.default_branch) throw new Error('The repository could not be read (HTTP ' + repo.status + ').');
  const branch = String(repo.body.default_branch);
  const tree = makeGithubRequest_('GET', '/repos/' + slug + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1');
  if (tree.status !== 200 || !tree.body || !Array.isArray(tree.body.tree) || tree.body.truncated) throw new Error('The repository files could not be listed completely (HTTP ' + tree.status + ').');
  const blobs = new Map();
  tree.body.tree.forEach(entry => { if (entry.type === 'blob') blobs.set(entry.path, String(entry.sha)); });
  return {branch, blobs};
}

/**
 * Reads the commits that touched one path, newest first, page by page, and stops at the first of: a commit by a linked team member
 * (Yes); the end of the history (No); the page limit or a GitHub failure (Unknown). Returns {teamChanged, latestCommit, lastTeamCommit}.
 */
function teamFileHistory_(slug, branch, path, linkedIds) {
  let latest = '';
  for (let page = 1; page <= TEAM_FILE_HISTORY_PAGES_; page++) {
    const response = makeGithubRequest_('GET', '/repos/' + slug + '/commits?sha=' + encodeURIComponent(branch) + '&path=' + encodeURIComponent(path) +
      '&per_page=' + TEAM_FILE_HISTORY_PAGE_SIZE_ + '&page=' + page);
    if (response.status !== 200 || !Array.isArray(response.body)) return {teamChanged: 'Unknown', latestCommit: latest, lastTeamCommit: ''};
    if (page === 1 && response.body.length) latest = String(response.body[0].sha);
    for (const commit of response.body) {
      if (commit.author && linkedIds.has(githubId_(commit.author.id))) return {teamChanged: 'Yes', latestCommit: latest, lastTeamCommit: String(commit.sha)};
    }
    if (response.body.length < TEAM_FILE_HISTORY_PAGE_SIZE_) return {teamChanged: 'No', latestCommit: latest, lastTeamCommit: ''};
  }
  return {teamChanged: 'Unknown', latestCommit: latest, lastTeamCommit: ''};
}

/** The TeamFileStatus records of one team for every listed document. `tree` comes from teamRepositoryTree_. */
function teamFileRecords_(teamId, slug, documents, tree, baselines, linkedIds, nowIso) {
  return documents.map(document => {
    const base = {teamId, documentId: document.documentId, checkedAt: nowIso};
    const sha = tree.blobs.get(document.path);
    if (!sha) return Object.assign(base, {repoBlobSha: '', teamChanged: 'No', lastTeamCommit: '', latestCommit: ''});
    if (sha === baselines.get(document.path) || !linkedIds.size) return Object.assign(base, {repoBlobSha: sha, teamChanged: 'No', lastTeamCommit: '', latestCommit: ''});
    return Object.assign(base, {repoBlobSha: sha}, teamFileHistory_(slug, tree.branch, document.path, linkedIds));
  });
}

function readTeamFileStatus_() {
  const storage = documentSheetStorage_('teamFileStatus', TEAM_FILE_STATUS_FIELDS_);
  const records = documentSheetRecords_(storage), index = new Map();
  records.forEach(item => {
    const key = normalizeText_(item.record.teamId) + '|' + item.record.documentId;
    if (index.has(key)) throw new Error('TeamFileStatus has two rows for ' + item.record.teamId + ' and ' + item.record.documentId + '. Nothing was changed.');
    index.set(key, item);
  });
  return Object.assign(storage, {records, index});
}

/** Writes one record: an existing row gets only the fields that changed; a new row is appended with every field. */
function writeTeamFileStatus_(storage, record) {
  const key = normalizeText_(record.teamId) + '|' + record.documentId, found = storage.index.get(key);
  if (!found) {
    const full = Object.fromEntries(Object.keys(TEAM_FILE_STATUS_FIELDS_).map(field => [field, record[field] === undefined ? '' : record[field]]));
    const rowNumber = documentSheetAppend_(storage, full);
    storage.index.set(key, {rowNumber, row: [], record: full});
    return;
  }
  const changed = {};
  Object.keys(record).forEach(field => { if (field !== 'teamId' && field !== 'documentId' && record[field] !== found.record[field]) changed[field] = record[field]; });
  if (!Object.keys(changed).length) return;
  writeRecordSpan_(storage.sheet, found.rowNumber, storage.columns, changed, found.row);
  Object.assign(found.record, changed);
}

/** Daily trigger. Works through the teams in batches inside a time budget and remembers where it stopped. */
function scanTeamFiles() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (error) { console.error('Team file scan skipped: another job holds the lock.'); return {ok: false, reason: 'busy'}; }
  const properties = PropertiesService.getScriptProperties();
  try {
    const documents = listedTemplateDocuments_(readTemplateFiles_().records);
    if (!documents.length) return {ok: true, teams: 0, remaining: 0};
    const status = readTeamFileStatus_(), baselines = teamFileBaselines_(), accounts = teamLinkedGithubIds_(), repoUrls = getRepoUrlMap_();
    const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const teams = [];
    getSheetRows_(SHEET_NAMES.TEAM_STATUS).forEach(row => {
      const teamId = String(row[TS.TEAM_ID] || '').trim(), key = normalizeText_(teamId);
      if (teamId && !teams.some(team => team.key === key)) teams.push({teamId, key, slug: getGithubRepoSlug_(repoUrls[key] || '')});
    });
    teams.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const cursor = properties.getProperty(TEAM_FILE_SCAN_CURSOR_KEY_) || '';
    const pending = teams.filter(team => team.slug && (!cursor || team.key > cursor));
    const deadline = Date.now() + TEAM_FILE_SCAN_BUDGET_MS_, nowIso = new Date().toISOString();
    let last = cursor, scanned = 0, failed = 0;
    for (const team of pending) {
      if (Date.now() >= deadline) break;
      last = team.key;
      scanned += 1;
      let records;
      try {
        records = teamFileRecords_(team.teamId, team.slug, documents, teamRepositoryTree_(team.slug), baselines, accounts.get(team.key) || new Set(), nowIso);
      } catch (error) {
        // GitHub could not be read for this team: its rows say Unknown, never a left-over Yes.
        failed += 1;
        console.error('Team file scan: ' + team.teamId + ': ' + (error && error.message || error));
        records = documents.map(document => ({teamId: team.teamId, documentId: document.documentId, teamChanged: 'Unknown', checkedAt: nowIso}));
      }
      records.forEach(record => writeTeamFileStatus_(status, record));
    }
    SpreadsheetApp.flush();
    const remaining = pending.filter(team => team.key > last).length;
    if (remaining) properties.setProperty(TEAM_FILE_SCAN_CURSOR_KEY_, last); else properties.deleteProperty(TEAM_FILE_SCAN_CURSOR_KEY_);
    console.log('Team file scan: ' + scanned + ' teams, ' + failed + ' unreadable, ' + remaining + ' remaining.');
    return {ok: true, teams: scanned, unreadable: failed, remaining};
  } catch (error) {
    console.error('Team file scan failed: ' + (error && error.message || error));
    return {ok: false, reason: 'failed', message: String(error && error.message || error)};
  } finally {
    lock.releaseLock();
  }
}
