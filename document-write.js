/**
 * DOCUMENT WRITE - the one path every document action takes: submit, approve, return and reopen (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md,
 * decision 14 and section 6). The endpoints (document-api.js) say who the caller is and pass callbacks; this file owns the order of
 * the checks, the lock, the settlement of an interrupted write and the append. The rules are in document-service.js. It is built
 * like titleWrite_ (title-write.js), which it deliberately does not reuse.
 *
 *   request = {action, teamId, documentId, requestId, expectedRevision, input}
 *   deps    = {
 *     authorize(teamId)                -> {actor, roles: {student, guide, reviewer, coordinator}}   fresh every call; throws UNAUTHENTICATED/UNAUTHORIZED
 *     context(teamId, documentId)      -> {team: {teamId, semester}, document: {documentId, fileName, extension, folder, path}}   NOT_FOUND otherwise
 *     folder(ctx, required)            -> the team's Drive folder, or null when it is absent and not required (UNAVAILABLE when required)
 *     files(folder, fileName)          -> the live files of that exact name
 *     fileRecord(file)                 -> the submission record in the file's description, or null
 *     fileId(file)                     -> the Drive file ID
 *     prepareSubmit(ctx, input)        -> {live, blobSha, bytes}   the slow reads, outside the lock (submit only)
 *     confirmSubmit(ctx, prepared)     -> void   under the lock: the commit is still the latest (CONFLICT / UNAVAILABLE otherwise)
 *     writeFile(ctx, folder, files, prepared, record) -> the Drive file ID
 *   }
 * Returns {ok, revision, status, message}. A repeated request that already committed returns the stored result. No e-mail is sent.
 */
const DOCUMENT_LOCK_WAIT_MS_ = 10000;

function documentReadJournal_() {
  try { return readDocumentJournal_(); }
  catch (error) {
    console.error('Document journal could not be read: ' + (error && error.message || error));
    throw apiFail_('UNAVAILABLE', 'Documents cannot be used right now. Contact the coordinator.');
  }
}

/**
 * An interrupted submission is a Drive write whose journal row was never appended. If the file's description names a request that is not
 * in the journal and is the next revision of this document, its row is appended now. Returns true when a row was appended.
 */
function documentSettle_(journal, ctx, file, deps) {
  const record = deps.fileRecord(file);
  if (!record || journal.rows.some(row => row.requestId === record.requestId)) return false;
  if (!textEquals_(record.teamId, ctx.team.teamId) || record.documentId !== ctx.document.documentId) return false;
  const state = documentStateFromRows_(journal.rowsFor(ctx.team.teamId, ctx.document.documentId));
  if (state.status === 'UNAVAILABLE' || record.revision !== state.revision + 1) return false;
  appendDocumentRow_(journal, {
    timestamp: String(record.at || new Date().toISOString()), teamId: ctx.team.teamId, documentId: record.documentId, fileName: ctx.document.fileName,
    revision: record.revision, action: 'SUBMIT', actor: String(record.actor || ''), requestId: record.requestId, fingerprint: String(record.fingerprint || ''),
    commitSha: String(record.commitSha || ''), commitAuthor: String(record.commitAuthor || ''), commitAuthorId: String(record.commitAuthorId || ''),
    teamCommitSha: String(record.teamCommitSha || ''), teamCommitAuthor: String(record.teamCommitAuthor || ''), teamCommitAuthorId: String(record.teamCommitAuthorId || ''),
    blobSha: String(record.blobSha || ''), driveFileId: deps.fileId(file), notes: 'Recorded after an interruption.'
  });
  return true;
}

function documentWrite_(request, deps) {
  const action = request && request.action;
  if (!DOCUMENT_ACTION_[action]) throw apiFail_('INVALID_INPUT', 'Unknown document action.');
  const text = value => String(value === null || value === undefined ? '' : value).trim();
  const teamId = text(request.teamId), documentId = text(request.documentId);
  if (!teamId) throw apiFail_('INVALID_INPUT', 'Choose a team.');
  if (!/^doc-\d{4,}$/.test(documentId)) throw apiFail_('INVALID_INPUT', 'Choose a document.');

  // 1. Authenticate and authorize, before anything is read or changed.
  let user = deps.authorize(teamId);
  const requestId = text(request.requestId);
  if (!requestId || requestId.length > DOCUMENT_REQUEST_ID_MAX_) throw apiFail_('INVALID_INPUT', 'The request is missing its request ID.');
  const expected = request.expectedRevision;
  if (!Number.isInteger(expected) || expected < 0) throw apiFail_('INVALID_INPUT', 'The request is missing the revision it was made from.');

  // 2. The input and its fingerprint.
  const input = documentInputFor_(action, request.input);
  const fingerprint = documentFingerprint_(action, teamId, documentId, input);

  // 3. A request that already committed returns its stored result before any GitHub or Drive call.
  let journal = documentReadJournal_();
  const early = documentCommittedResult_(journal.rows, requestId, fingerprint);
  if (early) return early;
  const ctx = deps.context(teamId, documentId);

  // 4. The slow reads, outside the lock (submit only), when the journal alone does not already forbid a submission.
  let prepared = null;
  if (action === 'submit') {
    const status = documentStateFromRows_(journal.rowsFor(ctx.team.teamId, documentId)).status;
    if (status === 'UNAVAILABLE') throw apiFail_('UNAVAILABLE', 'This document cannot be used right now. Contact the coordinator.');
    if (DOCUMENT_FROM_.SUBMIT.includes(status)) prepared = deps.prepareSubmit(ctx, input);
  }

  // 5. The lock, a second look for the request, and the settlement of an interrupted write.
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned) {
    try { lock.waitLock(DOCUMENT_LOCK_WAIT_MS_); }
    catch (error) { throw apiFail_('UNAVAILABLE', 'Busy, try again.'); }
  }
  let result;
  try {
    user = deps.authorize(teamId);
    journal = documentReadJournal_();
    let stored = documentCommittedResult_(journal.rows, requestId, fingerprint);
    if (stored) return stored;
    const folder = deps.folder(ctx, action === 'submit');
    const files = folder ? deps.files(folder, ctx.document.fileName) : [];
    if (files.length > 1) throw apiFail_('UNAVAILABLE', 'There is more than one file named ' + ctx.document.fileName + ' in the team folder. Contact the coordinator.');
    if (files.length === 1 && documentSettle_(journal, ctx, files[0], deps)) {
      stored = documentCommittedResult_(journal.rows, requestId, fingerprint);
      if (stored) return stored;
    }

    // 6. The revision and the rules.
    const state = documentStateFor_(journal.rowsFor(ctx.team.teamId, documentId), files.length);
    if (state.status === 'UNAVAILABLE') throw apiFail_('UNAVAILABLE', 'This document cannot be used right now. Contact the coordinator.');
    if (state.revision !== expected) throw apiFail_('CONFLICT', 'This document changed since you opened it. Reload and try again.');
    const decision = documentCanDo_(state, action, user, {teamChanged: prepared ? prepared.live.teamChanged : '', label: ctx.document.fileName});
    if (!decision.allowed) throw apiFail_(decision.code, decision.reason);
    if (action === 'submit' && !prepared) throw apiFail_('CONFLICT', 'This document changed since you opened it. Reload and try again.');

    // 7. Submit: the version is still the latest, then Drive, then the row.
    const facts = {teamId: ctx.team.teamId, documentId, fileName: ctx.document.fileName, now: Date.now(), actor: user.actor, requestId, fingerprint};
    if (action === 'submit') {
      deps.confirmSubmit(ctx, prepared);
      const live = prepared.live;
      Object.assign(facts, {
        commitSha: live.latestCommit, commitAuthor: live.latestAuthor.login, commitAuthorId: live.latestAuthor.id,
        teamCommitSha: live.lastTeamCommit, teamCommitAuthor: live.teamAuthor.login, teamCommitAuthorId: live.teamAuthor.id, blobSha: prepared.blobSha
      });
      const record = {
        v: 1, requestId, fingerprint, actor: user.actor, teamId: ctx.team.teamId, documentId, revision: state.revision + 1,
        commitSha: facts.commitSha, commitAuthor: facts.commitAuthor, commitAuthorId: facts.commitAuthorId,
        teamCommitSha: facts.teamCommitSha, teamCommitAuthor: facts.teamCommitAuthor, teamCommitAuthorId: facts.teamCommitAuthorId,
        blobSha: facts.blobSha, at: new Date(facts.now).toISOString()
      };
      facts.driveFileId = deps.writeFile(ctx, folder, files, prepared, record);
    }
    let row = documentNextRow_(state, action, input, facts);
    try {
      appendDocumentRow_(journal, row);
    } catch (error) {
      // The append threw: the row may still have been written.
      console.error('Document append failed for ' + teamId + ' (' + requestId + '): ' + (error && error.stack || error));
      let found = null;
      try { found = readDocumentJournal_().rows.find(candidate => candidate.requestId === requestId && candidate.fingerprint === fingerprint) || null; }
      catch (readError) { console.error('Document reread failed: ' + (readError && readError.message || readError)); }
      if (!found) throw apiFail_('UNAVAILABLE', 'The document could not be saved. Try again.');
      row = found;
    }
    result = documentWriteResult_(action, row);
  } finally {
    if (!owned) lock.releaseLock();
  }
  return result;
}
