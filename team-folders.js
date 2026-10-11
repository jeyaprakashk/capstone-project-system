/**
 * TEAM FOLDERS — server only; JSON in, JSON out. See DATA-CONTRACTS.md (TeamFolders).
 * Layout in Drive: <the spreadsheet's folder>/Team Documents/<year>_<semester>_team_<teamid>.
 * Spreadsheet data is never touched: whether a team has a folder is answered from Drive by exact folder name.
 * Reads never create anything; only createTeamFolders_ does. findTeamFolder_ is the shared lookup the
 * upload feature reuses, so the naming rule exists once and folders are only ever created from System Status.
 */
const TEAM_DOCUMENTS_FOLDER_NAME_ = 'Team Documents';
const TEAM_FOLDER_BATCH_ = 25;
/** Fixed file names inside a team folder; the upload feature uses the same names. */
const TEAM_DOCUMENT_FILE_NAMES_ = Object.freeze({work: 'Step1_Work_Breakdown.docx', need: 'Step2_Need_Analysis.docx'});

/** Lowercase; each run of characters other than a-z, 0-9 and _ becomes one _; repeated _ collapse; ends trimmed. */
function teamFolderPart_(value) {
  return String(value === null || value === undefined ? '' : value).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function teamFolderName_(academicYear, semester, teamId) {
  const parts = [academicYear, semester, teamId].map(teamFolderPart_);
  if (parts.some(part => !part)) throw new Error('Academic year, semester and Team ID are required for team folder names.');
  return parts[0] + '_' + parts[1] + '_team_' + parts[2];
}

function folderSummary_(folder) {
  return {name: String(folder.getName()), url: String(folder.getUrl())};
}

/** The spreadsheet's own folder. Exactly one parent that is not the Drive root, otherwise an issue and nothing is created. */
function teamFoldersBase_() {
  let parents;
  try {
    const iterator = DriveApp.getFileById(getSpreadsheetId_()).getParents();
    parents = [];
    while (iterator.hasNext()) parents.push(iterator.next());
  } catch (error) {
    return {folder: null, issue: 'The spreadsheet folder could not be read. Check that the deploying account can open it.'};
  }
  if (!parents.length) return {folder: null, issue: 'The spreadsheet is not inside a folder. Move it into a Drive folder first.'};
  if (parents.length > 1) return {folder: null, issue: 'The spreadsheet is in more than one folder. Keep it in a single folder.'};
  if (parents[0].getId() === DriveApp.getRootFolder().getId()) return {folder: null, issue: 'The spreadsheet is in the top level of My Drive. Move it into a folder first.'};
  return {folder: parents[0], issue: ''};
}

/** Finds Team Documents by exact name (trashed folders are ignored); creates it only when asked. */
function teamDocumentsFolder_(base, create) {
  const found = [], iterator = base.getFoldersByName(TEAM_DOCUMENTS_FOLDER_NAME_);
  while (iterator.hasNext()) found.push(iterator.next());
  if (found.length > 1) return {folder: null, issue: 'There is more than one folder named ' + TEAM_DOCUMENTS_FOLDER_NAME_ + ' next to the spreadsheet. Remove or rename the extra ones.'};
  if (found.length === 1) return {folder: found[0], issue: ''};
  return {folder: create ? base.createFolder(TEAM_DOCUMENTS_FOLDER_NAME_) : null, issue: ''};
}

/** Folder count per exact name inside Team Documents, from one listing. */
function teamFolderCounts_(documents) {
  const counts = Object.create(null), iterator = documents.getFolders();
  while (iterator.hasNext()) { const name = iterator.next().getName(); counts[name] = (counts[name] || 0) + 1; }
  return counts;
}

/**
 * Every team with its expected folder name. Teams whose name cannot be built (blank semester) are listed as
 * issues; teams whose names clean to the same text are collisions and are never created or counted.
 */
function teamFolderPlan_() {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const year = getAcademicYear_(), seen = Object.create(null), issues = [], named = [];
  getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]).forEach(row => {
    const key = normalizeText_(row[TS.TEAM_ID]);
    if (seen[key]) return;
    seen[key] = true;
    const teamId = String(row[TS.TEAM_ID]);
    try { named.push({teamId, key, name: teamFolderName_(year, row[TS.SEMESTER], teamId)}); }
    catch (error) { issues.push('Team ' + teamId + ' has no semester or Team ID that can be used in a folder name.'); }
  });
  const byName = Object.create(null);
  named.forEach(team => { (byName[team.name] = byName[team.name] || []).push(team); });
  const collisions = [], teams = [];
  named.forEach(team => { if (byName[team.name].length > 1) collisions.push(team.teamId); else teams.push(team); });
  teams.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  if (collisions.length) issues.push('These teams would share a folder name and are skipped: ' + collisions.join(', ') + '.');
  return {teams, collisions, issues};
}

/** The read. Never creates anything. */
function buildTeamFoldersDto_() {
  const plan = teamFolderPlan_(), issues = plan.issues.slice();
  const dto = {configured: false, baseFolder: null, teamDocuments: {exists: false, url: null}, total: plan.teams.length, existing: 0,
    missing: [], duplicates: [], collisions: plan.collisions, issues, canCreate: false};
  const base = teamFoldersBase_();
  if (base.issue) { issues.unshift(base.issue); return dto; }
  dto.configured = true;
  dto.baseFolder = folderSummary_(base.folder);
  const documents = teamDocumentsFolder_(base.folder, false);
  if (documents.issue) { issues.unshift(documents.issue); return dto; }
  const counts = documents.folder ? teamFolderCounts_(documents.folder) : Object.create(null);
  dto.teamDocuments = documents.folder ? {exists: true, url: String(documents.folder.getUrl())} : {exists: false, url: null};
  plan.teams.forEach(team => {
    const count = counts[team.name] || 0;
    if (count) dto.existing++; else dto.missing.push(team.teamId);
    if (count > 1) dto.duplicates.push(team.teamId);
  });
  if (dto.duplicates.length) issues.push('These teams have more than one folder with the same name. Nothing was changed: ' + dto.duplicates.join(', ') + '.');
  dto.canCreate = !documents.folder || dto.missing.length > 0;
  return dto;
}

/**
 * The write. Safe to run again: it re-reads Drive under a lock and skips folders that exist. A failed team is
 * reported and the batch continues. cursor is the last Team ID key handled by the previous batch.
 */
function createTeamFolders_(cursor) {
  if (cursor !== null && cursor !== undefined && typeof cursor !== 'string') throw new Error('Invalid continuation cursor.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const base = teamFoldersBase_();
    if (base.issue) throw new Error(base.issue);
    const existed = !!teamDocumentsFolder_(base.folder, false).folder;
    const documents = teamDocumentsFolder_(base.folder, true);
    if (documents.issue) throw new Error(documents.issue);
    const counts = teamFolderCounts_(documents.folder);
    const pending = teamFolderPlan_().teams.filter(team => !counts[team.name]);
    const batch = pending.filter(team => !cursor || team.key > cursor).slice(0, TEAM_FOLDER_BATCH_);
    const created = [], failed = [];
    batch.forEach(team => {
      try { documents.folder.createFolder(team.name); created.push(team.teamId); }
      catch (error) { failed.push({teamId: team.teamId, reason: String(error && error.message || 'Folder could not be created.')}); }
    });
    const last = batch.length ? batch[batch.length - 1].key : cursor || '';
    const remaining = pending.filter(team => team.key > last).length;
    return {teamDocuments: {url: String(documents.folder.getUrl()), justCreated: !existed}, created, failed, remaining, nextCursor: remaining ? last : null};
  } finally {
    lock.releaseLock();
  }
}

/** Team Documents when it exists exactly once next to the spreadsheet, otherwise null. Never creates anything. */
function teamDocumentsFolderOrNull_() {
  const base = teamFoldersBase_();
  return base.issue ? null : teamDocumentsFolder_(base.folder, false).folder;
}

/** The folders named for one team inside Team Documents: {folder} when exactly one exists, plus how many were found. */
function teamFolderIn_(documents, teamId, semester) {
  const found = [], iterator = documents.getFoldersByName(teamFolderName_(getAcademicYear_(), semester, teamId));
  while (iterator.hasNext()) found.push(iterator.next());
  return {folder: found.length === 1 ? found[0] : null, count: found.length};
}

/**
 * The folder of one team, or null when Team Documents or the team folder does not exist (or is ambiguous).
 * Never creates anything. Callers must authorize the user for this team first.
 */
function findTeamFolder_(teamId, semester) {
  const documents = teamDocumentsFolderOrNull_();
  return documents ? teamFolderIn_(documents, teamId, semester).folder : null;
}
