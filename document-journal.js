/**
 * DOCUMENT JOURNAL - the append-only DocumentSubmissions sheet (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, section 3). One row per event
 * (SUBMIT, APPROVE, RETURN, REOPEN); the latest row of a team and document gives its status. Read and written by header name through
 * the shared document-sheet helpers. A row is appended and never edited.
 */
const DOCUMENT_SUBMISSIONS_FIELDS_ = Object.freeze({
  timestamp: 'Timestamp', teamId: 'Team ID', documentId: 'Document ID', fileName: 'File Name', revision: 'Revision', action: 'Action', actor: 'Actor',
  requestId: 'Request ID', fingerprint: 'Fingerprint', commitSha: 'Commit SHA', commitAuthor: 'Commit Author', commitAuthorId: 'Commit Author ID',
  teamCommitSha: 'Team Commit SHA', teamCommitAuthor: 'Team Commit Author', teamCommitAuthorId: 'Team Commit Author ID',
  blobSha: 'Blob SHA', driveFileId: 'Drive File ID', notes: 'Notes'
});
const DOCUMENT_ACTION_KEY_ = Object.freeze({SUBMIT: 'submit', APPROVE: 'approve', RETURN: 'return', REOPEN: 'reopen'});

function documentJournalKey_(teamId, documentId) { return documentTeamKey_(teamId) + '|' + documentId; }

/** The journal as rows (revision as a number) plus a per-document index. Reads once; appendDocumentRow_ keeps it current. */
function readDocumentJournal_() {
  const storage = documentSheetStorage_('documentSubmissions', DOCUMENT_SUBMISSIONS_FIELDS_);
  const rows = documentSheetRecords_(storage).map(item => Object.assign({}, item.record, {revision: Number(item.record.revision), rowNumber: item.rowNumber}));
  const journal = {storage, rows, groups: new Map()};
  rows.forEach(row => journal.groups.set(documentJournalKey_(row.teamId, row.documentId), []));
  rows.forEach(row => journal.groups.get(documentJournalKey_(row.teamId, row.documentId)).push(row));
  journal.groups.forEach(group => group.sort((a, b) => (a.revision - b.revision) || (a.rowNumber - b.rowNumber)));
  journal.rowsFor = (teamId, documentId) => journal.groups.get(documentJournalKey_(teamId, documentId)) || [];
  return journal;
}

/** Appends one row (flushed) and adds it to the journal read in memory. */
function appendDocumentRow_(journal, row) {
  const rowNumber = documentSheetAppend_(journal.storage, row);
  SpreadsheetApp.flush();
  const stored = Object.assign({}, row, {revision: Number(row.revision), rowNumber});
  journal.rows.push(stored);
  const key = documentJournalKey_(row.teamId, row.documentId);
  if (!journal.groups.has(key)) journal.groups.set(key, []);
  journal.groups.get(key).push(stored);
  return stored;
}

/** The stored result of a request that already committed, null when it has not, CONFLICT when the ID was used for something else. */
function documentCommittedResult_(rows, requestId, fingerprint) {
  const found = rows.find(row => row.requestId === requestId);
  if (!found) return null;
  if (found.fingerprint !== fingerprint) throw apiFail_('CONFLICT', 'This request ID was already used for a different request.');
  return documentWriteResult_(DOCUMENT_ACTION_KEY_[found.action] || 'submit', found);
}
