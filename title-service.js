/**
 * TITLE SERVICE - the rules of the title workflow (archive/plans/TITLE-REVISION-PLAN.md, sections 5 and 6): input rules, who may do what in which
 * state, the row each action appends, the request fingerprint and the similarity check. These functions decide and build; they
 * do not read or write sheets (title-write.js does), so they can be tested without a spreadsheet.
 *
 * Actions: submit, guideApprove, return, reviewerApprove, reopen, cancelReopen. Each maps to one log action.
 */
const TITLE_LOG_ACTION_ = Object.freeze({
  submit: 'SUBMIT', guideApprove: 'GUIDE_APPROVE', return: 'RETURN', reviewerApprove: 'REVIEWER_APPROVE', reopen: 'REOPEN', cancelReopen: 'CANCEL_REOPEN'
});
const TITLE_TITLE_MAX_ = 200;
const TITLE_PROBLEM_MAX_ = 5000;
const TITLE_NOTES_MAX_ = 5000;
const TITLE_REASON_MAX_ = 500;
const TITLE_SIMILARITY_BLOCK_ = 0.75;
const TITLE_BLANK_PROBLEM_REASON_ = 'The problem statement is missing. Return the title so the team can resubmit it with one.';

function titleInvalid_(message) {
  return apiFail_('INVALID_INPUT', message);
}

/** Trim, strip surrounding quotes, uppercase. One normalization for student and guide titles. */
function normalizeTitle_(raw) {
  return String(raw === null || raw === undefined ? '' : raw).replace(/^[\s'"‘’“”]+|[\s'"‘’“”]+$/g, '').toUpperCase();
}

/** The normalized title, or INVALID_INPUT. Whitespace-only and quote-only titles are empty after normalizing. */
function validateTitleText_(raw) {
  const title = normalizeTitle_(raw);
  if (!title) throw titleInvalid_('Enter a project title.');
  if (title.length > TITLE_TITLE_MAX_) throw titleInvalid_('The title must be ' + TITLE_TITLE_MAX_ + ' characters or fewer.');
  return title;
}

function validateProblemText_(raw) {
  const problem = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!problem) throw titleInvalid_('Enter the problem statement.');
  if (problem.length > TITLE_PROBLEM_MAX_) throw titleInvalid_('The problem statement must be ' + TITLE_PROBLEM_MAX_ + ' characters or fewer.');
  return problem;
}

function validateTitleNotes_(raw, required, max, label) {
  const notes = String(raw === null || raw === undefined ? '' : raw).trim();
  if (required && !notes) throw titleInvalid_(label + ' is required.');
  if (notes.length > max) throw titleInvalid_(label + ' must be ' + max + ' characters or fewer.');
  return notes;
}

/** The normalized input for an action, or INVALID_INPUT. Checked on the server before similarity. */
function titleInputFor_(action, input) {
  input = input || {};
  if (action === 'submit') return {title: validateTitleText_(input.title), problem: validateProblemText_(input.problem)};
  if (action === 'guideApprove') {
    // An empty editedTitle means "no edit", never "clear the title".
    const edited = String(input.editedTitle === null || input.editedTitle === undefined ? '' : input.editedTitle);
    return {editedTitle: normalizeTitle_(edited) === '' ? '' : validateTitleText_(edited), notes: validateTitleNotes_(input.notes, false, TITLE_NOTES_MAX_, 'The notes')};
  }
  if (action === 'return') return {notes: validateTitleNotes_(input.notes, true, TITLE_NOTES_MAX_, 'Notes')};
  if (action === 'reviewerApprove') return {notes: validateTitleNotes_(input.notes, false, TITLE_NOTES_MAX_, 'The notes')};
  if (action === 'reopen' || action === 'cancelReopen') return {reason: validateTitleNotes_(input.reason, true, TITLE_REASON_MAX_, 'A reason')};
  throw titleInvalid_('Unknown title action.');
}

/** SHA-256 of the action, the team and the normalized input, as hex. The same request always gives the same value. */
function titleFingerprint_(action, teamId, normalizedInput) {
  const fields = {
    submit: ['title', 'problem'], guideApprove: ['editedTitle', 'notes'], return: ['notes'], reviewerApprove: ['notes'], reopen: ['reason'], cancelReopen: ['reason']
  }[action];
  if (!fields) throw titleInvalid_('Unknown title action.');
  const text = JSON.stringify([TITLE_LOG_ACTION_[action], titleTeamKey_(teamId), ...fields.map(field => String(normalizedInput[field] || ''))]);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(value => ('0' + ((value + 256) % 256).toString(16)).slice(-2)).join('');
}

function titleDenied_(code, reason) {
  return {allowed: false, reason, code};
}

/**
 * Who may do what, in which state. `user.roles` says what the signed-in person is for THIS team:
 * {student, guide, reviewer, coordinator}. The code is UNAUTHORIZED for a wrong role and REJECTED for a wrong state.
 */
function titleCanDo_(state, action, user) {
  const roles = (user && user.roles) || {};
  const status = state.status;
  const blankProblem = String(state.proposal.problem || '').trim() === '';
  if (action === 'submit') {
    if (!roles.student) return titleDenied_('UNAUTHORIZED', 'Only a member of this team can submit its title.');
    if (status === 'NEEDS_REVIEW' || status === 'AWAITING_REVIEWER') return titleDenied_('REJECTED', 'The title is under review and cannot be changed now.');
    if (status === 'APPROVED') return titleDenied_('REJECTED', 'The title is approved. Ask the coordinator to reopen it to change it.');
  } else if (action === 'guideApprove') {
    if (!roles.guide) return titleDenied_('UNAUTHORIZED', "Only the team's guide can approve a title at this stage.");
    if (status !== 'NEEDS_REVIEW') return titleDenied_('REJECTED', 'This title is not waiting for the guide.');
    if (blankProblem) return titleDenied_('REJECTED', TITLE_BLANK_PROBLEM_REASON_);
  } else if (action === 'return') {
    if (status === 'NEEDS_REVIEW') {
      if (!roles.guide) return titleDenied_('UNAUTHORIZED', "Only the team's guide can return a title at this stage.");
    } else if (status === 'AWAITING_REVIEWER') {
      if (!roles.reviewer) return titleDenied_('UNAUTHORIZED', 'Only an assigned reviewer can return a title at this stage.');
    } else return titleDenied_('REJECTED', 'This title is not under review.');
  } else if (action === 'reviewerApprove') {
    if (!roles.reviewer) return titleDenied_('UNAUTHORIZED', 'Only an assigned reviewer can approve a title at this stage.');
    if (status !== 'AWAITING_REVIEWER') return titleDenied_('REJECTED', 'This title is not waiting for the reviewers.');
    if (blankProblem) return titleDenied_('REJECTED', TITLE_BLANK_PROBLEM_REASON_);
  } else if (action === 'reopen') {
    if (!roles.coordinator) return titleDenied_('UNAUTHORIZED', 'Only the coordinator can reopen a title.');
    if (status !== 'APPROVED') return titleDenied_('REJECTED', 'Only an approved title can be reopened.');
  } else if (action === 'cancelReopen') {
    if (!roles.coordinator) return titleDenied_('UNAUTHORIZED', 'Only the coordinator can cancel a reopening.');
    if (!state.reopened) return titleDenied_('REJECTED', 'There is no open reopening to cancel.');
  } else {
    return titleDenied_('REJECTED', 'Unknown title action.');
  }
  return {allowed: true, reason: '', code: ''};
}

/**
 * The row an action appends: the team's complete state after it. `context` = {teamId, now (ms), actor, requestId, fingerprint,
 * similarityNote (the note for a new or edited title)}. `input` is the normalized input from titleInputFor_.
 */
function titleNextRow_(state, action, input, context) {
  const next = {
    timestamp: context.now, teamId: context.teamId, revision: state.revision + 1, action: TITLE_LOG_ACTION_[action], actor: context.actor,
    requestId: context.requestId, fingerprint: context.fingerprint, status: state.status, title: state.proposal.title, problem: state.proposal.problem,
    notes: '', similarityNote: state.similarityNote, reopened: state.reopened,
    approvedTitle: state.approved.title, approvedProblem: state.approved.problem, approvedAt: state.approved.at, approvedBy: state.approved.by
  };
  if (action === 'submit') {
    next.status = 'NEEDS_REVIEW'; next.title = input.title; next.problem = input.problem; next.similarityNote = context.similarityNote || '';
  } else if (action === 'guideApprove') {
    next.status = 'AWAITING_REVIEWER'; next.notes = input.notes;
    if (input.editedTitle) { next.title = input.editedTitle; next.similarityNote = context.similarityNote || ''; }
  } else if (action === 'return') {
    next.status = 'RETURNED'; next.notes = input.notes;
  } else if (action === 'reviewerApprove') {
    next.status = 'APPROVED'; next.reopened = false; next.notes = input.notes;
    next.approvedTitle = state.proposal.title; next.approvedProblem = state.proposal.problem; next.approvedBy = context.actor;
    next.approvedAt = state.approved.at === null ? context.now : state.approved.at;
  } else if (action === 'reopen') {
    next.status = 'REOPENED'; next.reopened = true; next.notes = input.reason;
  } else if (action === 'cancelReopen') {
    next.status = 'APPROVED'; next.reopened = false; next.notes = input.reason;
    next.title = state.approved.title; next.problem = state.approved.problem; next.similarityNote = '';
  } else {
    throw titleInvalid_('Unknown title action.');
  }
  return next;
}

/**
 * Titles of the other teams this semester: each team's approved title and its current proposal. `index` is the validated title
 * index; a team whose history is not valid is skipped here (it is reported elsewhere).
 */
function titleOtherTeamTitles_(index, teamId) {
  const own = titleTeamKey_(teamId), others = [];
  Object.keys(index.teams).forEach(key => {
    if (key === own || index.teams[key].errors.length) return;
    const latest = index.teams[key].rows[index.teams[key].rows.length - 1];
    if (latest.approvedTitle) others.push({teamId: index.teams[key].teamId, title: latest.approvedTitle});
    if (latest.title && latest.title !== latest.approvedTitle) others.push({teamId: index.teams[key].teamId, title: latest.title});
  });
  return others;
}

/**
 * The similarity check for a normalized title (a submission or a guide edit). `context` = {registryRows, academicYear, semester,
 * others: [{teamId, title}]}. A registry match of 75% or more blocks the save (REJECTED, naming the match); the team's own registry
 * rows are excluded. The best match overall becomes the Similarity Note and never blocks. Returns the note ('' when none).
 */
function titleSimilarity_(title, teamId, context) {
  let best = {score: 0, title: '', context: ''};
  (context.registryRows || []).forEach(record => {
    if (textEquals_(record.academicYear, context.academicYear) && textEquals_(record.semester, context.semester) && textEquals_(record.teamId, teamId)) return;
    const score = similarity_(title, record.title);
    if (score > best.score) best = {score, title: record.title, context: record.academicYear + ' - ' + record.semester};
  });
  if (best.score >= TITLE_SIMILARITY_BLOCK_) {
    throw apiFail_('REJECTED', 'The title is ' + Math.round(best.score * 100) + '% similar to: "' + best.title + '" (' + best.context + '). Please revise the title.');
  }
  (context.others || []).forEach(other => {
    const score = similarity_(title, other.title);
    if (score > best.score) best = {score, title: other.title, context: 'Team ' + other.teamId + ', this semester'};
  });
  return best.score > 0 ? Math.round(best.score * 100) + '% similar to "' + best.title + '" (' + best.context + ')' : '';
}
