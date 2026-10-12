/**
 * TEMPLATE FILES - process A of TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md (section 4): a daily scan that keeps the list of the Office and PDF
 * files in the capstone template repository. The list knows nothing about teams. It sets and changes no requirement, copies no file,
 * and submits nothing; it only writes the TemplateFiles sheet.
 *
 * The repository and its two folders are constants here (nothing is added to the Config tab). A scan reads both folders from GitHub
 * completely before it touches the sheet. It then writes record by record with writeRecordSpan_: there is no all-or-nothing
 * promise, but every run recomputes the whole state from GitHub and the sheet, so a run that stops part-way is finished by the next one.
 */
const TEMPLATE_REPOSITORY_ = 'ece-kalasalingam/capstone-team-template';
const TEMPLATE_FOLDERS_ = Object.freeze(['1_Documents', '5_Presentations']);
const TEMPLATE_EXTENSIONS_ = Object.freeze(['docx', 'pptx', 'pdf']);

/** Field key -> header of the TemplateFiles sheet. A test keeps this equal to the catalog entry. */
const TEMPLATE_FILES_FIELDS_ = Object.freeze({
  documentId: 'Document ID', folder: 'Folder', fileName: 'File Name', extension: 'Extension', firstSeen: 'First Seen', lastSeen: 'Last Seen',
  active: 'Active', inTeamTemplate: 'In Team Template', nameConflict: 'Name Conflict'
});
/** The fields a later scan may change on a row it already knows. */
const TEMPLATE_FILES_SCAN_FIELDS_ = Object.freeze(['lastSeen', 'active', 'inTeamTemplate', 'nameConflict']);

function templateExtension_(fileName) {
  const dot = String(fileName).lastIndexOf('.');
  return dot < 0 ? '' : String(fileName).slice(dot + 1).toLowerCase();
}

function templateDocumentId_(number) {
  return 'doc-' + String(number).padStart(4, '0');
}

/**
 * The listable files of the template folders: [{folder, fileName, extension}]. `responses` maps a folder to the body of GitHub's
 * contents listing. Only regular files with a supported extension are kept; subfolders and everything else are ignored.
 */
function templateFilesFound_(responses) {
  const found = [];
  TEMPLATE_FOLDERS_.forEach(folder => {
    (responses[folder] || []).forEach(entry => {
      if (!entry || entry.type !== 'file' || typeof entry.name !== 'string') return;
      const extension = templateExtension_(entry.name);
      if (TEMPLATE_EXTENSIONS_.includes(extension)) found.push({folder, fileName: entry.name, extension});
    });
  });
  return found;
}

/**
 * The new state of the sheet, computed without touching it (pure). `existing` = [{rowNumber, row, record}], `found` from
 * templateFilesFound_, `manifestPaths` = the paths in the bundled template. Returns {writes: [{rowNumber|null, record}]}: a changed
 * row carries only the fields that changed; a new row carries everything and rowNumber null. Throws, changing nothing, when two rows
 * share a folder and filename or a Document ID is not valid or repeats.
 */
function templateFilesPlan_(existing, found, nowIso) {
  const keyOf = (folder, fileName) => folder + '/' + fileName;
  const byKey = new Map(), ids = new Set();
  let highest = 0;
  existing.forEach(item => {
    const key = keyOf(item.record.folder, item.record.fileName);
    if (byKey.has(key)) throw new Error('TemplateFiles has two rows for ' + key + '. Nothing was changed.');
    byKey.set(key, item);
    const match = /^doc-(\d{4,})$/.exec(item.record.documentId);
    if (!match) throw new Error('TemplateFiles row ' + item.rowNumber + ' has no valid Document ID. Nothing was changed.');
    if (ids.has(item.record.documentId)) throw new Error('TemplateFiles repeats the Document ID ' + item.record.documentId + '. Nothing was changed.');
    ids.add(item.record.documentId);
    highest = Math.max(highest, Number(match[1]));
  });
  const foundKeys = new Set(found.map(file => keyOf(file.folder, file.fileName)));
  const rows = existing.map(item => ({item, record: Object.assign({}, item.record)}));
  found.forEach(file => {
    if (byKey.has(keyOf(file.folder, file.fileName))) return;
    highest += 1;
    rows.push({item: null, record: {
      documentId: templateDocumentId_(highest), folder: file.folder, fileName: file.fileName, extension: file.extension,
      firstSeen: nowIso, lastSeen: nowIso, active: 'Yes', inTeamTemplate: 'Yes', nameConflict: 'No'
    }});
  });
  rows.forEach(row => {
    const key = keyOf(row.record.folder, row.record.fileName);
    if (foundKeys.has(key)) { row.record.lastSeen = nowIso; row.record.active = 'Yes'; row.record.inTeamTemplate = 'Yes'; } else row.record.active = 'No';
  });
  const counts = Object.create(null);
  rows.filter(row => row.record.active === 'Yes').forEach(row => {
    const name = row.record.fileName.toLowerCase();
    counts[name] = (counts[name] || 0) + 1;
  });
  rows.forEach(row => { row.record.nameConflict = row.record.active === 'Yes' && counts[row.record.fileName.toLowerCase()] > 1 ? 'Yes' : 'No'; });
  const writes = [];
  rows.forEach(row => {
    if (!row.item) { writes.push({rowNumber: null, record: row.record}); return; }
    const changed = {};
    TEMPLATE_FILES_SCAN_FIELDS_.forEach(field => { if (row.record[field] !== row.item.record[field]) changed[field] = row.record[field]; });
    if (Object.keys(changed).length) writes.push({rowNumber: row.item.rowNumber, record: changed, row: row.item.row});
  });
  return {writes};
}


/** Reads the template folders from GitHub. Throws on any failure so the sheet is left alone. */
function templateRepositoryResponses_() {
  const responses = {};
  TEMPLATE_FOLDERS_.forEach(folder => {
    const response = makeGithubRequest_('GET', '/repos/' + TEMPLATE_REPOSITORY_ + '/contents/' + encodeURIComponent(folder));
    if (response.status !== 200 || !Array.isArray(response.body)) {
      throw new Error('The template folder ' + folder + ' could not be read (HTTP ' + response.status + ').');
    }
    responses[folder] = response.body;
  });
  return responses;
}

function readTemplateFiles_() {
  const storage = documentSheetStorage_('templateFiles', TEMPLATE_FILES_FIELDS_);
  return Object.assign(storage, {records: documentSheetRecords_(storage)});
}

function writeTemplateFiles_(storage, writes) {
  writes.forEach(write => {
    if (write.rowNumber) writeRecordSpan_(storage.sheet, write.rowNumber, storage.columns, write.record, write.row);
    else documentSheetAppend_(storage, write.record);
  });
  SpreadsheetApp.flush();
}

/** Daily trigger. Never throws: a failure is logged and the sheet stays as it was (or is finished by the next run). */
function scanTemplateFiles() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (error) { console.error('Template scan skipped: another job holds the lock.'); return {ok: false, reason: 'busy'}; }
  try {
    const found = templateFilesFound_(templateRepositoryResponses_());
    const storage = readTemplateFiles_();
    const plan = templateFilesPlan_(storage.records, found, new Date().toISOString());
    writeTemplateFiles_(storage, plan.writes);
    const added = plan.writes.filter(write => !write.rowNumber).length;
    console.log('Template scan: ' + found.length + ' files found, ' + added + ' added, ' + (plan.writes.length - added) + ' rows updated.');
    return {ok: true, found: found.length, added, updated: plan.writes.length - added};
  } catch (error) {
    console.error('Template scan failed: ' + (error && error.message || error));
    return {ok: false, reason: 'failed', message: String(error && error.message || error)};
  } finally {
    lock.releaseLock();
  }
}
