/**
 * EVIDENCE - the evidence files of a team (archive/plans/EVIDENCE-PLAN.md). A team repository has a folder `2_Evidence` with topic subfolders; the
 * EvidenceFolders sheet says which template document each topic folder belongs to. Submitting a document, or the student's "Copy evidence" button,
 * copies the files of that document's folders from GitHub into `evidences/<path below 2_Evidence>` in the team's Drive folder and records each copy
 * in EvidenceCopies. A Review opens only when the team has copied at least Minimum Files from each folder the ActivityEvidences sheet names for it
 * (evidenceGateItems_, called by the activity engine). Evidence never gates a document's approval.
 * The Documents screen does not read GitHub: it reads EvidenceStatus (how many files are waiting), which the team-file scan, Copy evidence and Check for
 * new evidence keep up to date.
 *
 * A copy is idempotent: a file is copied only when it is new or its blob SHA changed, so a repeated click needs no request ID. Nothing in Drive or
 * EvidenceCopies is ever deleted: a file the team removes from GitHub keeps its Drive copy and its row.
 */
const EVIDENCE_ROOT_ = '2_Evidence';
const EVIDENCE_DRIVE_FOLDER_ = 'evidences';
const EVIDENCE_MAX_BYTES_ = 25 * 1024 * 1024;
const EVIDENCE_BATCH_FILES_ = 20;
const EVIDENCE_BATCH_BYTES_ = 60 * 1024 * 1024;
const EVIDENCE_BUDGET_MS_ = 240000;
const EVIDENCE_LOCK_WAIT_MS_ = 10000;
const EVIDENCE_HISTORY_PAGES_ = 5;
const EVIDENCE_MIME_ = Object.freeze({
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', zip: 'application/zip', mp4: 'video/mp4', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});

/** Field key -> header of each evidence sheet. A test keeps these equal to the catalog entries. */
const EVIDENCE_FOLDERS_FIELDS_ = Object.freeze({folder: 'Evidence Folder', documentId: 'Document ID'});
const ACTIVITY_EVIDENCES_FIELDS_ = Object.freeze({activityId: 'Activity ID', folder: 'Evidence Folder', minimum: 'Minimum Files'});
const EVIDENCE_STATUS_FIELDS_ = Object.freeze({teamId: 'Team ID', documentId: 'Document ID', pending: 'Evidence Pending', tooLarge: 'Evidence Too Large', checkedAt: 'Checked At'});
const EVIDENCE_COPIES_FIELDS_ = Object.freeze({
  teamId: 'Team ID', documentId: 'Document ID', folder: 'Evidence Folder', path: 'Path', blobSha: 'Blob SHA', size: 'Size', driveFileId: 'Drive File ID',
  committedAt: 'Committed At', firstCommittedAt: 'First Committed At', copiedAt: 'Copied At'
});

// ---- the sheets ------------------------------------------------------------------------------------------------------------

/**
 * The evidence folders of the documents: {byDocument: Map(Document ID -> [folder name]), byFolder: Map(normalized folder -> Document ID)}. A row with a
 * blank Document ID is never copied. A workbook without the sheet has none (the feature is off until setupDocumentStorage has run). Throws, naming the sheet, when a header is missing or repeated, a folder is blank, repeated, or has a slash, or a
 * Document ID is not valid: a folder belongs to one document.
 */
function readEvidenceFolders_() {
  if (!getSheet_(sheetSpec_('evidenceFolders').name)) return {byDocument: new Map(), byFolder: new Map()};
  const storage = documentSheetStorage_('evidenceFolders', EVIDENCE_FOLDERS_FIELDS_);
  const byDocument = new Map(), byFolder = new Map();
  documentSheetRecords_(storage).forEach(item => {
    const folder = item.record.folder, documentId = item.record.documentId, where = storage.name + ' row ' + item.rowNumber + ': ';
    if (!folder) throw new Error(where + 'the evidence folder is blank.');
    if (/[\\/]/.test(folder) || folder.startsWith('.')) throw new Error(where + 'the evidence folder must be one folder name, not a path.');
    if (byFolder.has(normalizeText_(folder))) throw new Error(where + 'the evidence folder ' + folder + ' is listed twice.');
    if (documentId && !/^doc-\d{4,}$/.test(documentId)) throw new Error(where + documentId + ' is not a Document ID.');
    byFolder.set(normalizeText_(folder), documentId);
    if (!documentId) return;
    if (!byDocument.has(documentId)) byDocument.set(documentId, []);
    byDocument.get(documentId).push(folder);
  });
  return {byDocument, byFolder};
}

/**
 * The rows of ActivityEvidences: {present, rows: [{rowNumber, activityId, folder, minimum (a positive integer, or 0 when the cell is not one)}]}.
 * A missing sheet is {present: false}: no Review has an evidence requirement until the sheet exists. A sheet whose header is missing or repeated throws.
 */
function readActivityEvidences_() {
  if (!getSheet_(sheetSpec_('activityEvidences').name)) return {present: false, rows: []};
  const storage = documentSheetStorage_('activityEvidences', ACTIVITY_EVIDENCES_FIELDS_);
  return {present: true, rows: documentSheetRecords_(storage).map(item => {
    const minimum = /^\d+$/.test(item.record.minimum) ? Number(item.record.minimum) : 0;
    return {rowNumber: item.rowNumber, activityId: item.record.activityId, folder: item.record.folder, minimum};
  })};
}

function evidenceCopyKey_(teamId, path) { return normalizeText_(teamId) + '|' + path; }

/**
 * EvidenceCopies as {records, index: Map(team|path -> {rowNumber, row, record}), conflicts: Map(team -> message)}. Two rows for one file are never guessed
 * between, and they must not hide every other team's evidence: the team that has them is left out of `records` and `index` and named in `conflicts`.
 * Nothing may read, gate or copy for that team until the sheet is fixed by hand (evidenceCopiesConflict_ says so), so no further row is appended for it.
 */
function readEvidenceCopies_() {
  const storage = documentSheetStorage_('evidenceCopies', EVIDENCE_COPIES_FIELDS_);
  const all = documentSheetRecords_(storage), seen = new Set(), conflicts = new Map();
  all.forEach(item => {
    const key = evidenceCopyKey_(item.record.teamId, item.record.path);
    if (!seen.has(key)) { seen.add(key); return; }
    const team = normalizeText_(item.record.teamId);
    if (conflicts.has(team)) return;
    const message = 'EvidenceCopies has two rows for ' + item.record.teamId + ' and ' + item.record.path + '. Nothing was changed.';
    conflicts.set(team, message);
    console.error(message);
  });
  const records = all.filter(item => !conflicts.has(normalizeText_(item.record.teamId))), index = new Map();
  records.forEach(item => index.set(evidenceCopyKey_(item.record.teamId, item.record.path), item));
  return Object.assign(storage, {records, index, conflicts});
}

/** The conflict message when EvidenceCopies has two rows for one file of this team, else ''. */
function evidenceCopiesConflict_(copies, teamId) {
  return copies && copies.conflicts && copies.conflicts.get(normalizeText_(teamId)) || '';
}

/** Writes one copy record: an existing row gets only the fields that changed; a new row is appended with every field. */
function evidenceWriteCopy_(storage, record) {
  const key = evidenceCopyKey_(record.teamId, record.path), found = storage.index.get(key);
  if (!found) {
    const full = Object.fromEntries(Object.keys(EVIDENCE_COPIES_FIELDS_).map(field => [field, record[field] === undefined ? '' : String(record[field])]));
    const rowNumber = documentSheetAppend_(storage, full);
    storage.index.set(key, {rowNumber, row: [], record: full});
    return;
  }
  const changed = {};
  Object.keys(EVIDENCE_COPIES_FIELDS_).forEach(field => {
    if (field !== 'teamId' && field !== 'path' && record[field] !== undefined && String(record[field]) !== found.record[field]) changed[field] = String(record[field]);
  });
  if (!Object.keys(changed).length) return;
  writeRecordSpan_(storage.sheet, found.rowNumber, storage.columns, changed, found.row);
  Object.assign(found.record, changed);
}

function evidenceStatusKey_(teamId, documentId) { return normalizeText_(teamId) + '|' + documentId; }

/** EvidenceStatus as {records, index: Map(team|document -> {rowNumber, row, record})}. Two rows for one team and document throw. */
function readEvidenceStatus_() {
  const storage = documentSheetStorage_('evidenceStatus', EVIDENCE_STATUS_FIELDS_);
  const records = documentSheetRecords_(storage), index = new Map();
  records.forEach(item => {
    const key = evidenceStatusKey_(item.record.teamId, item.record.documentId);
    if (index.has(key)) throw new Error('EvidenceStatus has two rows for ' + item.record.teamId + ' and ' + item.record.documentId + '. Nothing was changed.');
    index.set(key, item);
  });
  return Object.assign(storage, {records, index});
}

/** Writes one status record: an existing row gets only the fields that changed; a new row is appended with every field. */
function evidenceWriteStatus_(storage, record) {
  const key = evidenceStatusKey_(record.teamId, record.documentId), found = storage.index.get(key);
  if (!found) {
    const full = Object.fromEntries(Object.keys(EVIDENCE_STATUS_FIELDS_).map(field => [field, record[field] === undefined ? '' : String(record[field])]));
    const rowNumber = documentSheetAppend_(storage, full);
    storage.index.set(key, {rowNumber, row: [], record: full});
    return;
  }
  const changed = {};
  Object.keys(EVIDENCE_STATUS_FIELDS_).forEach(field => {
    if (field !== 'teamId' && field !== 'documentId' && record[field] !== undefined && String(record[field]) !== found.record[field]) changed[field] = String(record[field]);
  });
  if (!Object.keys(changed).length) return;
  writeRecordSpan_(storage.sheet, found.rowNumber, storage.columns, changed, found.row);
  Object.assign(found.record, changed);
}

/**
 * Saves status records under the script lock, reading the sheet fresh inside it (the scan, Copy evidence and Check for new evidence all write it).
 * Never throws: the status is only a cache of what the repository holds, so a failure is logged and the next run restores it. Returns true when saved.
 */
function evidenceSaveStatus_(records) {
  if (!records.length) return true;
  const lock = LockService.getScriptLock(), owned = lock.hasLock();
  if (!owned) {
    try { lock.waitLock(EVIDENCE_LOCK_WAIT_MS_); }
    catch (error) { console.error('Evidence status not saved: the lock was busy.'); return false; }
  }
  try {
    const storage = readEvidenceStatus_();
    records.forEach(record => evidenceWriteStatus_(storage, record));
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    console.error('Evidence status could not be saved: ' + (error && error.message || error));
    return false;
  } finally {
    if (!owned) lock.releaseLock();
  }
}

// ---- which files are evidence ----------------------------------------------------------------------------------------------

/** Dot files (and anything inside a dot folder) and README files are not evidence. `relative` is the path below 2_Evidence. */
function evidenceIsSkipped_(relative) {
  const parts = String(relative).split('/');
  return parts.some(part => part.startsWith('.')) || /^readme(\..*)?$/i.test(parts[parts.length - 1]);
}

/**
 * The evidence files of some folders in a repository tree (teamRepositoryTree_), sorted by path:
 * [{path (the repository path), relative (below 2_Evidence), folder (as the sheet spells it), name, sha, size}].
 */
function evidenceListFiles_(tree, folders) {
  const found = [];
  tree.blobs.forEach((sha, path) => {
    if (!path.startsWith(EVIDENCE_ROOT_ + '/')) return;
    const relative = path.slice(EVIDENCE_ROOT_.length + 1), parts = relative.split('/');
    if (parts.length < 2 || evidenceIsSkipped_(relative)) return;
    const folder = folders.find(name => textEquals_(name, parts[0]));
    if (!folder) return;
    found.push({path, relative, folder, name: parts[parts.length - 1], sha, size: tree.sizes ? Number(tree.sizes.get(path)) || 0 : 0});
  });
  return found.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** COPIED (the copy is of this version), PENDING (new or changed) or TOO_LARGE. `copied` is Map(team|path -> {record}). */
function evidenceFileState_(file, copied, teamId) {
  if (file.size > EVIDENCE_MAX_BYTES_) return 'TOO_LARGE';
  const kept = copied.get(evidenceCopyKey_(teamId, file.path));
  return kept && kept.record.driveFileId && kept.record.blobSha === file.sha ? 'COPIED' : 'PENDING';
}

// ---- GitHub and Drive ------------------------------------------------------------------------------------------------------

/** The date of the newest commit that touched the path, and of the oldest one read. Blank when GitHub cannot say; never throws. */
function evidenceCommitDates_(slug, branch, path) {
  let newest = '', oldest = '';
  for (let page = 1; page <= EVIDENCE_HISTORY_PAGES_; page++) {
    const response = makeGithubRequest_('GET', '/repos/' + slug + '/commits?sha=' + encodeURIComponent(branch) + '&path=' + encodeURIComponent(path) + '&per_page=100&page=' + page);
    if (response.status !== 200 || !Array.isArray(response.body)) return {committedAt: newest, firstCommittedAt: ''};
    if (page === 1 && response.body.length) newest = teamFileDate_(response.body[0]);
    if (response.body.length) oldest = teamFileDate_(response.body[response.body.length - 1]);
    if (response.body.length < 100) return {committedAt: newest, firstCommittedAt: oldest};
  }
  return {committedAt: newest, firstCommittedAt: oldest};
}

function evidenceBlobBytes_(slug, sha) {
  const blob = makeGithubRequest_('GET', '/repos/' + slug + '/git/blobs/' + encodeURIComponent(sha));
  if (blob.status !== 200 || !blob.body || typeof blob.body.content !== 'string') throw new Error('GitHub could not give the file (HTTP ' + blob.status + ').');
  return Utilities.base64Decode(blob.body.content.replace(/\s+/g, ''));
}

function evidenceFileUrl_(driveFileId) { return 'https://drive.google.com/file/d/' + encodeURIComponent(driveFileId) + '/view'; }

/** The subfolder with this name, created when absent. Two of the same name are refused: the copy would not know which one is meant. */
function evidenceSubfolder_(parent, name) {
  const iterator = parent.getFoldersByName(name), found = [];
  while (iterator.hasNext()) found.push(iterator.next());
  if (found.length > 1) throw new Error('There is more than one folder named ' + name + ' in the team folder.');
  return found.length ? found[0] : parent.createFolder(name);
}

/** Writes one file below `evidences` in the team folder, in place when a file of that name is already there. Returns the Drive file ID. */
function evidenceDriveWrite_(teamFolder, relative, bytes, description) {
  const parts = relative.split('/'), name = parts.pop();
  let folder = evidenceSubfolder_(teamFolder, EVIDENCE_DRIVE_FOLDER_);
  parts.forEach(part => { folder = evidenceSubfolder_(folder, part); });
  const dot = name.lastIndexOf('.'), mime = EVIDENCE_MIME_[dot < 0 ? '' : name.slice(dot + 1).toLowerCase()] || 'application/octet-stream';
  const blob = Utilities.newBlob(bytes, mime, name), existing = documentDriveFiles_(folder, name);
  if (existing.length > 1) throw new Error('There is more than one file named ' + name + ' in the team folder.');
  if (existing.length === 1) {
    const id = String(existing[0].getId());
    Drive.Files.update({description}, id, blob, {supportsAllDrives: true});
    return id;
  }
  return String(Drive.Files.create({name, mimeType: mime, parents: [String(folder.getId())], description}, blob, {supportsAllDrives: true}).id);
}

// ---- the copy --------------------------------------------------------------------------------------------------------------

function evidenceRepositorySlug_(team) {
  const slug = getGithubRepoSlug_(getRepoUrlMap_()[documentTeamKey_(team.teamId)] || '');
  if (!slug) throw apiFail_('REJECTED', 'This team does not have a repository yet.');
  return slug;
}

/** The evidence files of one document in one team repository, each with its state. Throws UNAVAILABLE when GitHub cannot be read. */
function evidenceLiveFiles_(team, folders, copies) {
  if (evidenceCopiesConflict_(copies, team.teamId)) throw apiFail_('UNAVAILABLE', 'The evidence records of this team need to be fixed by the coordinator. Try again later.');
  const slug = evidenceRepositorySlug_(team);
  let tree;
  try { tree = teamRepositoryTree_(slug); }
  catch (error) { console.error('Evidence check: ' + team.teamId + ': ' + (error && error.message || error)); throw apiFail_('UNAVAILABLE', 'Could not read the team repository. Try again later.'); }
  const files = evidenceListFiles_(tree, folders);
  files.forEach(file => { file.state = evidenceFileState_(file, copies.index, team.teamId); });
  return {slug, branch: tree.branch, files};
}

/**
 * Copies the new and changed evidence files of one document of one team into the team folder, within one batch (files, bytes, time). Each file is
 * copied under the script lock, which is released between files, and its row is written straight after it. Returns
 * {configured, copied, pending, tooLarge, failed: [{path, reason}], busy}; `pending` counts what is still to copy. A failure on one file never
 * stops the others and never undoes a copy. Throws UNAVAILABLE or REJECTED when the team folder or the repository cannot be used at all.
 */
function evidenceCopy_(team, document) {
  const folders = readEvidenceFolders_().byDocument.get(document.documentId) || [];
  const result = {configured: folders.length > 0, copied: 0, pending: 0, tooLarge: 0, failed: [], busy: false};
  if (!folders.length) return result;
  const live = evidenceLiveFiles_(team, folders, readEvidenceCopies_());
  result.tooLarge = live.files.filter(file => file.state === 'TOO_LARGE').length;
  const todo = live.files.filter(file => file.state === 'PENDING');
  result.pending = todo.length;
  if (!todo.length) { evidenceSaveStatus_([evidenceStatusRecord_(team, document, result.pending, result.tooLarge)]); return result; }
  const teamFolder = documentDriveFolder_(team);
  const deadline = Date.now() + EVIDENCE_BUDGET_MS_;
  let bytes = 0, attempted = 0;
  for (const file of todo) {
    if (attempted >= EVIDENCE_BATCH_FILES_ || (attempted > 0 && bytes + file.size > EVIDENCE_BATCH_BYTES_) || Date.now() >= deadline) break;
    attempted += 1; bytes += file.size;
    const lock = LockService.getScriptLock(), owned = lock.hasLock();
    if (!owned) {
      try { lock.waitLock(EVIDENCE_LOCK_WAIT_MS_); }
      catch (error) { result.busy = true; break; }
    }
    try {
      const copies = readEvidenceCopies_();
      if (evidenceCopiesConflict_(copies, team.teamId)) throw new Error(evidenceCopiesConflict_(copies, team.teamId));
      const kept = copies.index.get(evidenceCopyKey_(team.teamId, file.path));
      if (kept && kept.record.driveFileId && kept.record.blobSha === file.sha) { result.pending -= 1; continue; }
      const dates = evidenceCommitDates_(live.slug, live.branch, file.path);
      const driveFileId = evidenceDriveWrite_(teamFolder, file.relative, evidenceBlobBytes_(live.slug, file.sha), 'Evidence ' + file.path + ' @ ' + file.sha);
      evidenceWriteCopy_(copies, {
        teamId: team.teamId, documentId: document.documentId, folder: file.folder, path: file.path, blobSha: file.sha, size: file.size, driveFileId,
        committedAt: dates.committedAt || (kept && kept.record.committedAt) || '', firstCommittedAt: (kept && kept.record.firstCommittedAt) || dates.firstCommittedAt,
        copiedAt: new Date().toISOString()
      });
      SpreadsheetApp.flush();
      result.copied += 1; result.pending -= 1;
    } catch (error) {
      console.error('Evidence copy failed for ' + team.teamId + ' ' + file.path + ': ' + (error && error.message || error));
      result.failed.push({path: file.relative, reason: 'It could not be copied. Try again later.'});
    } finally {
      if (!owned) lock.releaseLock();
    }
  }
  evidenceSaveStatus_([evidenceStatusRecord_(team, document, result.pending, result.tooLarge)]);
  return result;
}

function evidenceStatusRecord_(team, document, pending, tooLarge) {
  return {teamId: team.teamId, documentId: document.documentId, pending, tooLarge, checkedAt: new Date().toISOString()};
}

/**
 * Check for new evidence: reads the repository now (the Documents screen does not) and returns the document's evidence view with its live files,
 * saving the counts to EvidenceStatus. Writes nothing else. Throws UNAVAILABLE or REJECTED when the repository cannot be read.
 */
function evidenceCheck_(team, document) {
  const folders = readEvidenceFolders_().byDocument.get(document.documentId) || [];
  if (!folders.length) return null;
  const copies = readEvidenceCopies_(), live = evidenceLiveFiles_(team, folders, copies);
  const pending = live.files.filter(file => file.state === 'PENDING').length, tooLarge = live.files.filter(file => file.state === 'TOO_LARGE').length;
  evidenceSaveStatus_([evidenceStatusRecord_(team, document, pending, tooLarge)]);
  let rules = null;
  try { rules = readActivityEvidences_(); } catch (error) { console.error('ActivityEvidences could not be read for the check: ' + (error && error.message || error)); }
  const requirements = evidenceRequirements_(rules, rules && rules.rows.length ? evidenceReviewLabels_() : new Map(), team, folders, copies);
  return evidenceBuildView_(team, document, folders, copies, live.files, {pending, tooLarge, checkedAt: new Date().toISOString()}, requirements);
}

/** One sentence about a copy for the person who started it. */
function evidenceMessage_(result) {
  if (!result.configured) return '';
  const parts = [];
  if (result.copied) parts.push(result.copied + ' evidence file' + (result.copied === 1 ? '' : 's') + ' copied');
  if (result.pending) parts.push(result.pending + ' still to copy: use Copy evidence');
  if (result.failed.length) parts.push(result.failed.length + ' could not be copied');
  if (result.tooLarge) parts.push(result.tooLarge + ' too large (over ' + Math.round(EVIDENCE_MAX_BYTES_ / 1048576) + ' MB) and not counted');
  return parts.length ? 'Evidence: ' + parts.join('; ') + '.' : 'Evidence is up to date.';
}

// ---- the scan --------------------------------------------------------------------------------------------------------------

/**
 * For the team-file scan (team-files.js): the evidence folders, read once per run, or null when there is nothing to record (no evidence folder is
 * mapped, or the EvidenceStatus sheet does not exist yet). Never throws.
 */
function evidenceScanContext_() {
  try {
    if (!getSheet_(sheetSpec_('evidenceStatus').name)) return null;
    const folders = readEvidenceFolders_();
    return folders.byDocument.size ? {folders} : null;
  } catch (error) {
    console.error('Evidence scan skipped: ' + (error && error.message || error));
    return null;
  }
}

/** The EvidenceStatus records of one team from the repository tree the scan already read: no GitHub call. Copies are read fresh for each team. */
function evidenceScanRecords_(scan, team, tree, nowIso) {
  if (!scan) return [];
  let copies;
  try { copies = readEvidenceCopies_(); }
  catch (error) { console.error('Evidence scan: EvidenceCopies could not be read: ' + (error && error.message || error)); return evidenceUnknownRecords_(scan, team, nowIso); }
  if (evidenceCopiesConflict_(copies, team.teamId)) return evidenceUnknownRecords_(scan, team, nowIso);
  return Array.from(scan.folders.byDocument.entries()).map(([documentId, folders]) => {
    const states = evidenceListFiles_(tree, folders).map(file => evidenceFileState_(file, copies.index, team.teamId));
    return {teamId: team.teamId, documentId, pending: states.filter(state => state === 'PENDING').length, tooLarge: states.filter(state => state === 'TOO_LARGE').length, checkedAt: nowIso};
  });
}

/** The repository could not be read: the counts are blank (unknown), never a left-over number. */
function evidenceUnknownRecords_(scan, team, nowIso) {
  if (!scan) return [];
  return Array.from(scan.folders.byDocument.keys()).map(documentId => ({teamId: team.teamId, documentId, pending: '', tooLarge: '', checkedAt: nowIso}));
}

// ---- the documents screen --------------------------------------------------------------------------------------------------

/**
 * What the Documents DTO needs, read once per request from sheets only (no GitHub): {folders, copies, status} or null when the evidence sheets
 * cannot be read. `status` (EvidenceStatus) is null when that sheet cannot be read: the counts are then unknown, not zero. `rules` (ActivityEvidences) is
 * null when it cannot be read, and `labels` maps a Review key to its label.
 */
function evidenceDtoSource_() {
  try {
    const folders = readEvidenceFolders_();
    if (!folders.byDocument.size) return {folders, copies: null, status: null, rules: null, labels: new Map()};
    const copies = readEvidenceCopies_();
    let status = null;
    try { status = readEvidenceStatus_(); }
    catch (error) { console.error('EvidenceStatus could not be read: ' + (error && error.message || error)); }
    let rules = null;
    try { rules = readActivityEvidences_(); }
    catch (error) { console.error('ActivityEvidences could not be read for the screen: ' + (error && error.message || error)); }
    return {folders, copies, status, rules, labels: rules && rules.rows.length ? evidenceReviewLabels_() : new Map()};
  } catch (error) {
    console.error('Evidence sheets could not be read: ' + (error && error.message || error));
    return null;
  }
}

/**
 * The evidence of one document, as the DTO carries it: {folders, files, copied, pending, tooLarge, checkedAt}. Files are {path (below 2_Evidence),
 * name, folder, size, state (COPIED|PENDING|TOO_LARGE), link ('' unless copied), committedAt}: the copied files, and when `liveFiles` (a repository
 * read) is given, the files that are waiting or too large too. `requirements` is evidenceRequirements_'s answer. `status` = {pending (a number, or null when unknown), tooLarge, checkedAt}.
 */
function evidenceBuildView_(team, document, folders, copies, liveFiles, status, requirements) {
  const byPath = new Map();
  copies.records.forEach(item => {
    const record = item.record;
    if (!textEquals_(record.teamId, team.teamId) || record.documentId !== document.documentId || !record.driveFileId) return;
    const relative = record.path.startsWith(EVIDENCE_ROOT_ + '/') ? record.path.slice(EVIDENCE_ROOT_.length + 1) : record.path;
    byPath.set(record.path, {path: relative, name: relative.split('/').pop(), folder: record.folder, size: Number(record.size) || 0, state: 'COPIED',
      link: evidenceFileUrl_(record.driveFileId), committedAt: record.committedAt});
  });
  (liveFiles || []).forEach(file => {
    if (file.state === 'COPIED') return;
    const old = byPath.get(file.path);
    byPath.set(file.path, {path: file.relative, name: file.name, folder: file.folder, size: file.size, state: file.state, link: file.state === 'PENDING' && old ? old.link : '', committedAt: old ? old.committedAt : ''});
  });
  const files = Array.from(byPath.values()).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return {folders, files, copied: files.filter(file => file.state === 'COPIED').length, pending: status.pending, tooLarge: status.tooLarge, checkedAt: status.checkedAt, requirements: requirements || []};
}

/** Review key -> label, for the requirement lines. A definitions sheet that cannot be read leaves the keys as they are. */
function evidenceReviewLabels_() {
  try { return new Map(getAssessmentDefinitions_().map(definition => [definition.key, String(definition.label || definition.key)])); }
  catch (error) { console.error('Review labels could not be read: ' + (error && error.message || error)); return new Map(); }
}

/**
 * The Review requirements that use this document's evidence folders, with how many files the team has copied: [{activity, label, folder, minimum, copied, met}].
 * It tells a student what a Review will ask for; the gate itself is evidenceGateItems_. `rules` is readActivityEvidences_'s answer, or null when it
 * could not be read (nothing is listed). Rows that are not valid for the gate (no folder, a minimum that is not a whole number above 0) are left out.
 */
function evidenceRequirements_(rules, labels, team, folders, copies) {
  if (!rules) return [];
  return rules.rows.filter(row => row.folder && row.minimum && !ACTIVITY_IDS_.includes(row.activityId) && folders.some(name => textEquals_(name, row.folder))).map(row => {
    const copied = copies.records.filter(item => textEquals_(item.record.teamId, team.teamId) && textEquals_(item.record.folder, row.folder) && item.record.driveFileId).length;
    return {activity: row.activityId, label: labels.get(row.activityId) || row.activityId, folder: row.folder, minimum: row.minimum, copied, met: copied >= row.minimum};
  }).sort((a, b) => a.activity < b.activity ? -1 : a.activity > b.activity ? 1 : a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0);
}

/** The evidence of one document for the DTO, or null when the document has no evidence folder. Counts come from EvidenceStatus; blank means unknown (null). */
function evidenceDtoFor_(source, team, document) {
  if (!source || !source.folders.byDocument.has(document.documentId)) return null;
  if (evidenceCopiesConflict_(source.copies, team.teamId)) return null;
  const kept = source.status ? source.status.index.get(evidenceStatusKey_(team.teamId, document.documentId)) : null;
  const whole = value => /^\d+$/.test(value) ? Number(value) : null;
  const status = kept ? {pending: whole(kept.record.pending), tooLarge: whole(kept.record.tooLarge) || 0, checkedAt: kept.record.checkedAt} : {pending: null, tooLarge: 0, checkedAt: ''};
  const folders = source.folders.byDocument.get(document.documentId);
  return evidenceBuildView_(team, document, folders, source.copies, null, status, evidenceRequirements_(source.rules, source.labels, team, folders, source.copies));
}

/** Who may press Copy evidence, and when. `evidence` is the view; `status` the document's status. Unknown counts (null) allow it: the copy finds out. */
function evidenceCanCopy_(status, roles, evidence) {
  const no = reason => ({allowed: false, reason, activity: null, requirements: []});
  if (!evidence) return no('');
  if (!roles.student) return no('Only a member of this team can copy its evidence.');
  if (status === 'UNAVAILABLE') return no('');
  if (status === 'NOT_SUBMITTED') return no('Submit the document first: its evidence is copied with it.');
  if (evidence.pending === 0) return no('All evidence files are copied.');
  return {allowed: true, reason: '', activity: null, requirements: []};
}

/** Who may press Check for new evidence (a live read of the repository): a member of the team, once the document has been submitted. */
function evidenceCanCheck_(status, roles, evidence) {
  const no = reason => ({allowed: false, reason, activity: null, requirements: []});
  if (!evidence) return no('');
  if (!roles.student) return no('Only a member of this team can check its evidence.');
  if (status === 'UNAVAILABLE') return no('');
  if (status === 'NOT_SUBMITTED') return no('Submit the document first: its evidence is copied with it.');
  return {allowed: true, reason: '', activity: null, requirements: []};
}

// ---- the Review gate -------------------------------------------------------------------------------------------------------

/**
 * The evidence requirements of an activity: [{label, met, reason, unverifiable?, diagnostic?}], read from ActivityEvidences and counted from
 * EvidenceCopies (files actually in Drive). The title activities have none. An activity with no row has none, and so has a workbook without the
 * ActivityEvidences sheet. A sheet that cannot be read, a row that is not valid for the activity it names, or an EvidenceCopies sheet that cannot be
 * read denies (misconfiguration) or is "could not verify". A row naming an activity that does not exist gates nothing.
 */
function evidenceGateItems_(activityId, team, ctx) {
  if (ACTIVITY_IDS_.includes(activityId)) return [];
  if (!ctx.evidence) {
    ctx.evidence = {};
    try { ctx.evidence.rules = readActivityEvidences_(); }
    catch (error) {
      console.error('ActivityEvidences could not be read: ' + (error && error.message || error));
      ctx.evidence.rules = null;
    }
  }
  if (!ctx.evidence.rules) return [{label: 'Evidence', met: false, reason: ACTIVITY_MISCONFIGURED_, diagnostic: 'EVIDENCE_RULES_UNREADABLE'}];
  const mine = ctx.evidence.rules.rows.filter(row => textEquals_(row.activityId, activityId));
  if (!mine.length) return [];
  if (ctx.evidence.copies === undefined) {
    try { ctx.evidence.copies = readEvidenceCopies_(); }
    catch (error) {
      console.error('EvidenceCopies could not be read: ' + (error && error.message || error));
      ctx.evidence.copies = null;
    }
  }
  return mine.map(row => {
    if (!row.folder || !row.minimum) return {label: 'Evidence', met: false, reason: ACTIVITY_MISCONFIGURED_, diagnostic: 'EVIDENCE_ROW_INVALID'};
    const label = 'Evidence: at least ' + row.minimum + ' file' + (row.minimum === 1 ? '' : 's') + ' in ' + row.folder;
    if (!ctx.evidence.copies) return {label, met: false, unverifiable: true, diagnostic: 'EVIDENCE_COPIES_UNREADABLE'};
    if (evidenceCopiesConflict_(ctx.evidence.copies, team.teamId)) return {label, met: false, unverifiable: true, diagnostic: 'EVIDENCE_COPIES_CONFLICT'};
    const count = ctx.evidence.copies.records.filter(item => textEquals_(item.record.teamId, team.teamId) && textEquals_(item.record.folder, row.folder) && item.record.driveFileId).length;
    if (count >= row.minimum) return {label, met: true, reason: ''};
    return {label, met: false, reason: count + ' of ' + row.minimum + ' copied. Add the files under ' + EVIDENCE_ROOT_ + '/' + row.folder + ' in your repository, then copy them from Documents.'};
  });
}
