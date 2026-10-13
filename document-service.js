/**
 * DOCUMENT SERVICE - the rules of the template-document submission (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, sections 6 to 9 and 14). Pure:
 * no sheet, GitHub or Drive. It decides the status of a document from its journal rows, who may do what, how an input is normalized,
 * what the fingerprint of a request is, and the next journal row. documentWrite_ (document-write.js) owns the order of the checks, the
 * lock and the append; the endpoints (document-api.js) say who the caller is.
 *
 * Statuses use the words of the title workflow: NOT_SUBMITTED, NEEDS_REVIEW (submitted, awaiting the guide), APPROVED, RETURNED,
 * REOPENED, and UNAVAILABLE when the document's history cannot be trusted. REJECTED is an error code, never a status.
 */
const DOCUMENT_ACTION_ = Object.freeze({submit: 'SUBMIT', approve: 'APPROVE', return: 'RETURN', reopen: 'REOPEN'});
const DOCUMENT_STATUS_AFTER_ = Object.freeze({SUBMIT: 'NEEDS_REVIEW', APPROVE: 'APPROVED', RETURN: 'RETURNED', REOPEN: 'REOPENED'});
/** Which statuses each action may start from. A document with no row is NOT_SUBMITTED, whatever stands in the team folder. */
const DOCUMENT_FROM_ = Object.freeze({
  SUBMIT: ['NOT_SUBMITTED', 'RETURNED', 'REOPENED'], APPROVE: ['NEEDS_REVIEW'], RETURN: ['NEEDS_REVIEW'], REOPEN: ['APPROVED']
});
const DOCUMENT_TONE_ = Object.freeze({NOT_SUBMITTED: 'active', NEEDS_REVIEW: 'waiting', APPROVED: 'done', RETURNED: 'active', REOPENED: 'active', UNAVAILABLE: 'waiting'});
const DOCUMENT_STATUS_TEXT_ = Object.freeze({
  NOT_SUBMITTED: 'Not submitted yet', NEEDS_REVIEW: 'Submitted — awaiting the guide', APPROVED: 'Approved', RETURNED: 'Returned by the guide — change it and submit again',
  REOPENED: 'Reopened by the coordinator — you may submit a new version', UNAVAILABLE: 'This document cannot be shown right now — contact the coordinator'
});
const DOCUMENT_NOTES_MAX_ = 2000;
const DOCUMENT_REQUEST_ID_MAX_ = 100;

function documentInvalid_(message) { return apiFail_('INVALID_INPUT', message); }
function documentTeamKey_(teamId) { return normalizeText_(teamId); }

/**
 * The input of an action, normalized. submit: {expectedCommit}; approve: {}; return: {notes} (required); reopen: {reason} (required).
 * Throws INVALID_INPUT with a plain message.
 */
function documentInputFor_(action, input) {
  const source = input && typeof input === 'object' ? input : {};
  const text = value => String(value === null || value === undefined ? '' : value).trim();
  if (action === 'submit') {
    const commit = text(source.expectedCommit).toLowerCase();
    if (!/^[0-9a-f]{7,64}$/.test(commit)) throw documentInvalid_('The request is missing the version you reviewed. Reload the page and try again.');
    return {expectedCommit: commit};
  }
  if (action === 'approve') return {};
  if (action === 'return') {
    const notes = text(source.notes);
    if (!notes) throw documentInvalid_('Say what the team should change: notes are required when a document is returned.');
    if (notes.length > DOCUMENT_NOTES_MAX_) throw documentInvalid_('The notes are too long (at most ' + DOCUMENT_NOTES_MAX_ + ' characters).');
    return {notes};
  }
  if (action === 'reopen') {
    const reason = text(source.reason);
    if (!reason) throw documentInvalid_('A reason is required to reopen a document.');
    if (reason.length > DOCUMENT_NOTES_MAX_) throw documentInvalid_('The reason is too long (at most ' + DOCUMENT_NOTES_MAX_ + ' characters).');
    return {reason};
  }
  throw documentInvalid_('Unknown document action.');
}

/** SHA-256 (hex) of the action, the team, the Document ID and the action's own input: a repeated request ID must carry the same value. */
function documentFingerprint_(action, teamId, documentId, input) {
  const fields = {submit: ['expectedCommit'], approve: [], return: ['notes'], reopen: ['reason']}[action];
  if (!fields) throw documentInvalid_('Unknown document action.');
  const text = JSON.stringify([DOCUMENT_ACTION_[action], documentTeamKey_(teamId), String(documentId), ...fields.map(field => String(input[field] || ''))]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(value => ('0' + ((value + 256) % 256).toString(16)).slice(-2)).join('');
}

/**
 * The status of one document from its journal rows (sorted by revision). Returns {status, revision, last, errors}. A history that breaks
 * the rules is UNAVAILABLE with the reasons in errors.
 */
function documentStateFromRows_(rows) {
  const errors = [];
  let status = 'NOT_SUBMITTED', previousRevision = 0, last = null;
  rows.forEach(row => {
    if (row.revision !== previousRevision + 1) errors.push('revision ' + row.revision + ' follows ' + previousRevision);
    const allowed = DOCUMENT_FROM_[row.action];
    if (!allowed) errors.push('unknown action ' + row.action);
    else if (!allowed.includes(status)) errors.push(row.action + ' is not allowed after ' + status);
    if (DOCUMENT_STATUS_AFTER_[row.action]) status = DOCUMENT_STATUS_AFTER_[row.action];
    previousRevision = row.revision;
    last = row;
  });
  if (errors.length) return {status: 'UNAVAILABLE', revision: previousRevision, last, errors};
  return {status, revision: previousRevision, last, errors: []};
}

function documentDenied_(code, reason) { return {allowed: false, reason, code}; }

/**
 * Who may do what, in which status. user.roles = {student, guide, reviewer, coordinator} for THIS team. The code is UNAUTHORIZED for a
 * wrong role and REJECTED for a wrong status. extra.teamChanged ('Yes'|'No'|'Unknown'|'') applies to submit and check only; '' means the
 * team scan has no record of the file yet. check is a student asking GitHub now (the live preview) when the scan's record does not allow
 * a submission: the record is at most one scan old, and the live answer is the one Submit uses.
 */
function documentCanDo_(state, action, user, extra) {
  const roles = (user && user.roles) || {};
  const status = state.status;
  if (status === 'UNAVAILABLE') return documentDenied_('UNAVAILABLE', 'This document cannot be used right now. Contact the coordinator.');
  if (action === 'submit') {
    if (!roles.student) return documentDenied_('UNAUTHORIZED', 'Only a member of this team can submit its documents.');
    if (status === 'NEEDS_REVIEW') return documentDenied_('REJECTED', 'This document is waiting for the guide and cannot be changed now.');
    if (status === 'APPROVED') return documentDenied_('REJECTED', 'This document is approved. Ask the coordinator to reopen it to submit a new version.');
    const changed = extra && extra.teamChanged;
    if (changed === 'Unknown') return documentDenied_('UNAVAILABLE', 'Could not verify: ' + ((extra && extra.label) || 'this document') + '. Try again later.');
    if (changed === 'No') return documentDenied_('REJECTED', 'No team member has changed this file yet.');
    if (changed !== 'Yes') return documentDenied_('REJECTED', 'This file has not been checked yet.');
    return {allowed: true, reason: '', code: ''};
  }
  if (action === 'check') {
    if (!roles.student) return documentDenied_('UNAUTHORIZED', 'Only a member of this team can check its documents.');
    if (!DOCUMENT_FROM_.SUBMIT.includes(status)) return documentDenied_('REJECTED', 'This document cannot be submitted now.');
    if (extra && extra.teamChanged === 'Yes') return documentDenied_('REJECTED', 'This file is already known to be changed by the team.');
    return {allowed: true, reason: '', code: ''};
  }
  if (action === 'approve' || action === 'return') {
    if (!roles.guide) return documentDenied_('UNAUTHORIZED', "Only the team's guide can " + action + ' a document.');
    if (status !== 'NEEDS_REVIEW') return documentDenied_('REJECTED', 'This document is not waiting for the guide.');
    return {allowed: true, reason: '', code: ''};
  }
  if (action === 'reopen') {
    if (!roles.coordinator) return documentDenied_('UNAUTHORIZED', 'Coordinator access is required.');
    if (status !== 'APPROVED') return documentDenied_('REJECTED', 'Only an approved document can be reopened.');
    return {allowed: true, reason: '', code: ''};
  }
  return documentDenied_('INVALID_INPUT', 'Unknown document action.');
}

/** The journal row an action appends. facts = {teamId, documentId, fileName, now (ms), actor, requestId, fingerprint} plus, for SUBMIT, the commit facts. */
function documentNextRow_(state, action, input, facts) {
  const code = DOCUMENT_ACTION_[action];
  const row = {
    timestamp: new Date(facts.now).toISOString(), teamId: facts.teamId, documentId: facts.documentId, fileName: facts.fileName,
    revision: state.revision + 1, action: code, actor: facts.actor, requestId: facts.requestId, fingerprint: facts.fingerprint,
    commitSha: '', commitAuthor: '', commitAuthorId: '', teamCommitSha: '', teamCommitAuthor: '', teamCommitAuthorId: '', blobSha: '', driveFileId: '',
    notes: action === 'return' ? input.notes : action === 'reopen' ? input.reason : ''
  };
  if (action === 'submit') {
    ['commitSha', 'commitAuthor', 'commitAuthorId', 'teamCommitSha', 'teamCommitAuthor', 'teamCommitAuthorId', 'blobSha', 'driveFileId']
      .forEach(field => { row[field] = String(facts[field] === undefined || facts[field] === null ? '' : facts[field]); });
    if (facts.notes) row.notes = facts.notes;
  }
  return row;
}

const DOCUMENT_WRITE_MESSAGES_ = Object.freeze({
  submit: 'Document submitted for guide review.', approve: 'Document approved.', return: 'Document returned to the team.', reopen: 'Document reopened.'
});

function documentWriteResult_(action, row) {
  return {ok: true, revision: row.revision, status: DOCUMENT_STATUS_AFTER_[row.action], message: DOCUMENT_WRITE_MESSAGES_[action]};
}

/** Short form of a commit SHA for people. */
function documentShortSha_(sha) { return String(sha || '').slice(0, 7); }
