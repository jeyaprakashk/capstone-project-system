/**
 * DOCUMENT BASELINE - the one-time, editor-run record of the template files that stood in the team folders before the document
 * submission went live. A file with its exact name in a team folder and no journal row used to count as approved (a "hand-placed"
 * file); that rule is retired, so each such file is written into the journal first, as the two ordinary rows a submitted and approved
 * document has (SUBMIT revision 1, APPROVE revision 2, actor `baseline`, no commit facts, the Drive file ID). No new action, header or
 * rule: documentStateFromRows_ reads them like any other history.
 *
 *   previewDocumentBaseline  writes nothing; reports what applyDocumentBaseline would do, and every other listed document that has a file but no row
 *   applyDocumentBaseline    appends the rows under the script lock; running it again adds nothing
 *
 * A document with no file, with several files of its name, or in a team without a folder gets no row. Both start with requireTriggerOrOperator_().
 */
const DOCUMENT_BASELINE_IDS_ = Object.freeze(['doc-0004', 'doc-0005']);
const DOCUMENT_BASELINE_ACTOR_ = 'baseline';
const DOCUMENT_BASELINE_NOTE_ = 'Baseline: the file was already in the team folder before document submission started.';

/**
 * Pure apart from the callbacks. input = {teams: [{teamId, semester}], documents: [{documentId, fileName}], inScope: [documentId],
 * rowsFor(teamId, documentId) -> journal rows, folderFor(team) -> folder or null, filesFor(folder, fileName) -> files, fileId(file) -> ID}.
 * Returns [{teamId, documentId, fileName, outcome, fileId?}]. outcome (for an in-scope document): baseline, skip-has-rows, skip-no-file,
 * skip-ambiguous, skip-no-folder. An out-of-scope document is listed only as unbaselined-file: one file, no row.
 * A Drive read that throws is not caught for a file lookup: nothing is decided on a guess.
 */
function documentBaselinePlan_(input) {
  const plan = [], scope = new Set(input.inScope);
  input.teams.forEach(team => {
    let folder, folderRead = false;
    const folderOf = () => {
      if (!folderRead) {
        folderRead = true;
        try { folder = input.folderFor(team) || null; } catch (error) { console.error('Team folder lookup failed for ' + team.teamId + ': ' + (error && error.message || error)); folder = null; }
      }
      return folder;
    };
    input.documents.forEach(document => {
      const entry = {teamId: team.teamId, documentId: document.documentId, fileName: document.fileName};
      const inScope = scope.has(document.documentId);
      if (input.rowsFor(team.teamId, document.documentId).length) {
        if (inScope) plan.push({...entry, outcome: 'skip-has-rows'});
        return;
      }
      const found = folderOf();
      if (!found) {
        if (inScope) plan.push({...entry, outcome: 'skip-no-folder'});
        return;
      }
      const files = input.filesFor(found, document.fileName);
      if (files.length === 1) plan.push(inScope ? {...entry, outcome: 'baseline', fileId: input.fileId(files[0])} : {...entry, outcome: 'unbaselined-file'});
      else if (inScope) plan.push({...entry, outcome: files.length ? 'skip-ambiguous' : 'skip-no-file'});
    });
  });
  return plan;
}

/** The two journal rows of one baselined document. Throws when they would not read as APPROVED. */
function documentBaselineRows_(entry, nowMs) {
  const facts = {teamId: entry.teamId, documentId: entry.documentId, fileName: entry.fileName, now: nowMs, actor: DOCUMENT_BASELINE_ACTOR_,
    fingerprint: '', driveFileId: entry.fileId, notes: DOCUMENT_BASELINE_NOTE_};
  const key = 'baseline-' + documentTeamKey_(entry.teamId) + '-' + entry.documentId;
  const submit = documentNextRow_(documentStateFromRows_([]), 'submit', {}, {...facts, requestId: key + '-submit'});
  const approve = documentNextRow_(documentStateFromRows_([submit]), 'approve', {}, {...facts, requestId: key + '-approve'});
  if (documentStateFromRows_([submit, approve]).status !== 'APPROVED') throw new Error('The baseline rows for ' + entry.teamId + ' ' + entry.documentId + ' do not read as approved. Nothing was written for it.');
  return [submit, approve];
}

function documentBaselineCounts_(plan) {
  const counts = {};
  plan.forEach(entry => { counts[entry.outcome] = (counts[entry.outcome] || 0) + 1; });
  return counts;
}

/** The sources of a run: every team, the listed documents and the journal. Throws when any of them cannot be read. */
function documentBaselineSources_() {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const teams = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]).map(row => ({teamId: String(row[TS.TEAM_ID]).trim(), semester: row[TS.SEMESTER]}));
  const documents = documentListed_();
  const missing = DOCUMENT_BASELINE_IDS_.filter(id => !documents.some(document => document.documentId === id));
  if (missing.length) throw new Error('These documents are not in the TemplateFiles list: ' + missing.join(', ') + '. Nothing was changed.');
  return {teams, documents, journal: readDocumentJournal_()};
}

function documentBaselineRun_(sources) {
  return documentBaselinePlan_({
    teams: sources.teams, documents: sources.documents, inScope: DOCUMENT_BASELINE_IDS_,
    rowsFor: (teamId, documentId) => sources.journal.rowsFor(teamId, documentId),
    folderFor: team => findTeamFolder_(team.teamId, team.semester),
    filesFor: documentDriveFiles_,
    fileId: file => String(file.getId())
  });
}

function previewDocumentBaseline() {
  requireTriggerOrOperator_();
  const plan = documentBaselineRun_(documentBaselineSources_());
  const result = {counts: documentBaselineCounts_(plan), wouldBaseline: plan.filter(e => e.outcome === 'baseline').map(e => e.teamId + ' ' + e.documentId),
    needAttention: plan.filter(e => ['skip-ambiguous', 'skip-no-folder'].includes(e.outcome)).map(e => e.teamId + ' ' + e.documentId + ' (' + e.outcome + ')'),
    unbaselinedFiles: plan.filter(e => e.outcome === 'unbaselined-file').map(e => e.teamId + ' ' + e.documentId + ' ' + e.fileName)};
  console.log(JSON.stringify(result));
  return result;
}

function applyDocumentBaseline() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(DOCUMENT_LOCK_WAIT_MS_); } catch (error) { throw new Error('Busy. Try again in a moment.'); }
  try {
    const sources = documentBaselineSources_();
    const plan = documentBaselineRun_(sources), todo = plan.filter(entry => entry.outcome === 'baseline');
    // Every pair is built and checked before the first row is written, so a problem stops the run with nothing appended.
    const now = Date.now(), rows = todo.map(entry => documentBaselineRows_(entry, now));
    rows.forEach(pair => pair.forEach(row => appendDocumentRow_(sources.journal, row)));
    const result = {written: todo.length, counts: documentBaselineCounts_(plan), baselined: todo.map(e => e.teamId + ' ' + e.documentId)};
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
