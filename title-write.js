/**
 * TITLE WRITE - the one path every title change takes (TITLE-REVISION-PLAN.md, section 6). The endpoints of the later phases call
 * titleWrite_ with the action and a few callbacks; this file owns the order of checks, the lock, the append and the duplicate rules.
 *
 *   request = {action, teamId, requestId, expectedRevision, input}
 *   deps    = {
 *     authorize(teamId)                 -> {actor, roles: {student, guide, reviewer, coordinator}}; throws apiFail_ UNAUTHENTICATED/UNAUTHORIZED.
 *                                          Called before and again under the lock, so it must read the roster and committee fresh.
 *     unmetRequirements(state, user)    -> [string]   optional; submit only; runs outside the lock (GitHub and Drive calls).
 *     similarityContext(teamId, index)  -> {registryRows, academicYear, semester, others}   required for submit and a guide edit.
 *     notify(event)                     -> void       optional; runs after the lock is released. event = {action, teamId, actor, state, row}.
 *   }
 * Returns {ok, revision, status, message, warning?}. A repeated request that already committed returns the stored result and sends no mail.
 */
const TITLE_REQUEST_ID_MAX_ = 100;
const TITLE_LOCK_WAIT_MS_ = 10000;
const TITLE_WRITE_MESSAGES_ = Object.freeze({
  submit: 'Title submitted for guide review.', guideApprove: 'Title approved and sent to the reviewers.', return: 'Title returned to the team.',
  reviewerApprove: 'Title approved.', reopen: 'Title reopened.', cancelReopen: 'Reopening cancelled.'
});

function titleWriteResult_(action, row) {
  return {ok: true, revision: row.revision, status: row.status, message: TITLE_WRITE_MESSAGES_[action]};
}

/** The stored result of a request that already committed, null when it has not, CONFLICT when the ID was used for something else. */
function titleCommittedResult_(rows, request, fingerprint) {
  const found = rows.find(row => row.requestId === request.requestId);
  if (!found) return null;
  if (found.fingerprint !== fingerprint) throw apiFail_('CONFLICT', 'This request ID was already used for a different request.');
  return titleWriteResult_(request.action, found);
}

function titleRequireLive_() {
  if (readTitleCutover_() !== 'LIVE') throw apiFail_('UNAVAILABLE', 'Title updates are paused for a short update.');
}

function titleWrite_(request, deps) {
  const action = request && request.action;
  if (!TITLE_LOG_ACTION_[action]) throw apiFail_('INVALID_INPUT', 'Unknown title action.');
  const teamId = String(request.teamId === null || request.teamId === undefined ? '' : request.teamId).trim();
  if (!teamId) throw apiFail_('INVALID_INPUT', 'Choose a team.');

  // 1. Authenticate and authorize.
  let user = deps.authorize(teamId);
  const requestId = String(request.requestId === null || request.requestId === undefined ? '' : request.requestId).trim();
  if (!requestId || requestId.length > TITLE_REQUEST_ID_MAX_) throw apiFail_('INVALID_INPUT', 'The request is missing its request ID.');
  const expected = request.expectedRevision;
  if (!Number.isInteger(expected) || expected < 0) throw apiFail_('INVALID_INPUT', 'The request is missing the revision it was made from.');
  const input = titleInputFor_(action, request.input);
  const fingerprint = titleFingerprint_(action, teamId, input);
  const call = {action, requestId};

  // 2. Early answer while the cutover is not LIVE. The binding check is under the lock.
  titleRequireLive_();

  // 3. A request that already committed returns its stored result before anything else.
  const early = readTitleLog_();
  const committed = titleCommittedResult_(early.rows, call, fingerprint);
  if (committed) return committed;

  // 4-5. Requirements, outside the lock. If they are unmet, look for a committed copy before refusing.
  if (action === 'submit' && deps.unmetRequirements) {
    const index = titleIndex_(early.rows, Date.now());
    const state = titleStateFromIndex_(index, teamId);
    if (titleCanDo_(state, action, user).allowed) {
      const unmet = deps.unmetRequirements(state, user) || [];
      if (unmet.length) {
        const again = titleCommittedResult_(readTitleLog_().rows, call, fingerprint);
        if (again) return again;
        throw apiFail_('REJECTED', 'These requirements are not met yet: ' + unmet.join('; ') + '.');
      }
    }
  }

  // 6. The lock.
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned) {
    try { lock.waitLock(TITLE_LOCK_WAIT_MS_); }
    catch (error) { throw apiFail_('UNAVAILABLE', 'Busy, try again.'); }
  }
  let row, result, state;
  try {
    // 7. Nothing read before the lock decides anything from here on.
    titleRequireLive_();
    const log = readTitleLog_();
    const index = titleIndex_(log.rows, Date.now());
    // 8. Fresh authorization, the committed request, and the revision.
    user = deps.authorize(teamId);
    const stored = titleCommittedResult_(log.rows, call, fingerprint);
    if (stored) return stored;
    state = titleStateFromIndex_(index, teamId);
    if (state.revision !== expected) throw apiFail_('CONFLICT', 'This title changed since you opened it.');
    // 9. The rules, the similarity check, and one appended row.
    const decision = titleCanDo_(state, action, user);
    if (!decision.allowed) throw apiFail_(decision.code, decision.reason);
    let similarityNote = '';
    const checked = action === 'submit' ? input.title : action === 'guideApprove' ? input.editedTitle : '';
    if (checked) similarityNote = titleSimilarity_(checked, teamId, deps.similarityContext(teamId, index));
    row = titleNextRow_(state, action, input, {teamId: state.teamId || teamId, now: Date.now(), actor: user.actor, requestId, fingerprint, similarityNote});
    try {
      appendTitleLogRow_(log, row);
    } catch (error) {
      // 10. The append threw: the row may still have been written.
      console.error('Title append failed for ' + teamId + ' (' + requestId + '): ' + (error && error.stack || error));
      let found = null;
      try { found = readTitleLog_().rows.find(candidate => candidate.requestId === requestId && candidate.fingerprint === fingerprint) || null; }
      catch (readError) { console.error('Title reread failed: ' + (readError && readError.message || readError)); }
      if (!found) throw apiFail_('UNAVAILABLE', 'The title could not be saved. Try again.');
      row = found;
    }
    result = titleWriteResult_(action, row);
  } finally {
    if (!owned) lock.releaseLock();
  }

  // 11. Mail goes after the lock is released; a mail failure never undoes the save.
  if (deps.notify) {
    try { deps.notify({action, teamId: state.teamId || teamId, actor: user.actor, state, row}); }
    catch (error) {
      console.error('Title notification failed for ' + teamId + ': ' + (error && error.stack || error));
      result.warning = 'The title was saved, but the notification email could not be sent.';
    }
  }
  return result;
}
