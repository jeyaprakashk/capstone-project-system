/**
 * TITLE HISTORY - the validation of one team's TitleLog rows (archive/plans/TITLE-REVISION-PLAN.md, section 4, rules 1 to 8).
 * Pure: it takes the parsed rows of one team and the current time and returns a list of problems (empty when valid).
 * A failure makes only that team UNAVAILABLE. With these rules titleGate_ and the eligibility calculation can never
 * disagree about whether or when a team was approved.
 */

/** Section 5: which statuses an action may start from, and the status it produces. */
const TITLE_TRANSITIONS_ = Object.freeze({
  SUBMIT: Object.freeze({from: ['NOT_SUBMITTED', 'RETURNED', 'REOPENED'], to: 'NEEDS_REVIEW'}),
  GUIDE_APPROVE: Object.freeze({from: ['NEEDS_REVIEW'], to: 'AWAITING_REVIEWER'}),
  RETURN: Object.freeze({from: ['NEEDS_REVIEW', 'AWAITING_REVIEWER'], to: 'RETURNED'}),
  REVIEWER_APPROVE: Object.freeze({from: ['AWAITING_REVIEWER'], to: 'APPROVED'}),
  REOPEN: Object.freeze({from: ['APPROVED'], to: 'REOPENED'}),
  CANCEL_REOPEN: Object.freeze({from: null, to: 'APPROVED'}) // from any status while a reopening is open
});
const TITLE_BASELINE_STATUSES_ = Object.freeze(['NOT_SUBMITTED', 'NEEDS_REVIEW', 'AWAITING_REVIEWER', 'RETURNED', 'APPROVED']);
const TITLE_HISTORY_MAX_ERRORS_ = 20;

function titleDateValid_(ms, nowMs) {
  return typeof ms === 'number' && Number.isFinite(ms) && ms <= nowMs;
}

/** Problems found in one team's rows, in revision order. `nowMs` is the current time in milliseconds. */
function validateTitleHistory_(rows, nowMs) {
  const errors = [];
  const fail = (row, message) => { if (errors.length < TITLE_HISTORY_MAX_ERRORS_) errors.push((row ? 'Revision ' + row.revision + ': ' : '') + message); };
  if (!rows.length) return errors;
  if (rows.some(row => !Number.isInteger(row.revision) || row.revision < 1)) {
    fail(null, 'A revision is missing or is not a whole number of 1 or more.');
    return errors;
  }
  const ordered = rows.slice().sort((a, b) => (a.revision - b.revision) || (a.row - b.row));
  // Rule 1.
  if (ordered.some((row, index) => row.revision !== index + 1)) {
    fail(null, 'Revisions must run 1 to n with no gaps or duplicates.');
    return errors;
  }
  let previous = null;
  let approvedSeen = false;
  ordered.forEach((row, index) => {
    if (!TITLE_ACTIONS_.includes(row.action)) { fail(row, 'Unknown action.'); previous = row; return; }
    if (!TITLE_STATUSES_.includes(row.status)) { fail(row, 'Unknown status.'); previous = row; return; }
    if (row.reopened === null) fail(row, 'The Reopened flag must be Yes or blank.');
    const baseline = index === 0 && row.action === 'BASELINE';
    // Rule 2.
    if (index === 0) {
      if (row.action !== 'BASELINE' && row.action !== 'SUBMIT') fail(row, 'The first row must be a BASELINE or a SUBMIT.');
      else if (row.action === 'BASELINE' && !TITLE_BASELINE_STATUSES_.includes(row.status)) fail(row, 'A baseline cannot have the status ' + row.status + '.');
      else if (row.action === 'SUBMIT' && row.status !== 'NEEDS_REVIEW') fail(row, 'A first SUBMIT must give NEEDS_REVIEW.');
    } else {
      if (row.action === 'BASELINE') fail(row, 'Only the first row may be a BASELINE.');
      if (row.status === 'NOT_SUBMITTED') fail(row, 'NOT_SUBMITTED appears only on a BASELINE.');
    }
    // Rule 3.
    if (index > 0 && row.action !== 'BASELINE') {
      const transition = TITLE_TRANSITIONS_[row.action];
      if (row.action === 'CANCEL_REOPEN') {
        if (!previous.reopened) fail(row, 'CANCEL_REOPEN needs an open reopening.');
      } else if (!transition.from.includes(previous.status)) {
        fail(row, row.action + ' cannot follow the status ' + previous.status + '.');
      }
      if (row.status !== transition.to) fail(row, row.action + ' must give the status ' + transition.to + '.');
    }
    // Rule 4.
    if (row.reopened !== null) {
      let expected;
      if (index === 0) expected = false;
      else if (row.action === 'REOPEN') expected = true;
      else if (row.action === 'REVIEWER_APPROVE' || row.action === 'CANCEL_REOPEN') expected = false;
      else expected = previous.reopened === true;
      if (row.reopened !== expected) fail(row, 'The Reopened flag should be ' + (expected ? 'Yes' : 'blank') + ' here.');
    }
    // Rules 5 and 6: the approved fields.
    const approver = row.action === 'REVIEWER_APPROVE';
    const baselineApproved = baseline && row.status === 'APPROVED';
    const approvedNow = approvedSeen || approver || baselineApproved;
    const anyApproved = row.approvedTitle !== '' || row.approvedProblem !== '' || row.approvedBy !== '' || (row.approvedAt !== null && row.approvedAt !== undefined);
    if (approvedNow) {
      if (row.approvedTitle === '') fail(row, 'Approved Title is required from the first approval onward.');
      if (row.approvedBy === '') fail(row, 'Approved By is required from the first approval onward.');
      if (row.approvedAt === null || row.approvedAt === undefined) fail(row, 'Approved At is required from the first approval onward.');
      const blankProblemAllowed = !approver && (baselineApproved || (previous && previous.approvedProblem === ''));
      if (row.approvedProblem === '' && !blankProblemAllowed) fail(row, 'Approved Problem is required from the first approval onward.');
    } else if (anyApproved) {
      fail(row, 'The approved fields must be blank until the team is first approved.');
    }
    if ((row.status === 'APPROVED' || row.status === 'REOPENED' || row.reopened === true) && !approvedNow) fail(row, 'A team that is approved or reopened must carry approved fields.');
    if (approvedSeen && !approver && previous) {
      if (row.approvedTitle !== previous.approvedTitle || row.approvedProblem !== previous.approvedProblem || row.approvedBy !== previous.approvedBy ||
          row.approvedAt !== previous.approvedAt) fail(row, 'The approved fields must be copied forward unchanged.');
    }
    if (['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'].includes(row.action) && (row.title.trim() === '' || row.problem.trim() === '')) {
      fail(row, row.action + ' needs a Proposed Title and a Proposed Problem.');
    }
    // Rule 7.
    if (approver) {
      if (row.approvedTitle !== row.title || row.approvedProblem !== row.problem) fail(row, 'The approved title and problem must equal the proposal.');
      if (row.approvedBy !== row.actor) fail(row, 'Approved By must equal the Actor.');
      if (!approvedSeen) {
        if (row.approvedAt !== row.timestamp) fail(row, 'On the first approval, Approved At must equal the Timestamp.');
      } else if (row.approvedAt !== previous.approvedAt) fail(row, 'Approved At never changes once set.');
    }
    if (row.action === 'CANCEL_REOPEN' && (row.title !== row.approvedTitle || row.problem !== row.approvedProblem)) {
      fail(row, 'A cancelled reopening restores the approved title and problem.');
    }
    // Rule 8.
    if (!titleDateValid_(row.timestamp, nowMs)) fail(row, 'The Timestamp must be a real date that is not in the future.');
    else if (previous && titleDateValid_(previous.timestamp, nowMs) && row.timestamp < previous.timestamp) fail(row, 'Timestamps must not decrease.');
    if (row.approvedAt !== null && row.approvedAt !== undefined) {
      if (!titleDateValid_(row.approvedAt, nowMs)) fail(row, 'Approved At must be a real date that is not in the future.');
      else if (!approvedSeen && titleDateValid_(row.timestamp, nowMs) && row.approvedAt > row.timestamp) fail(row, 'Approved At cannot be later than the row that first carries it.');
    }
    if (approvedNow) approvedSeen = true;
    previous = row;
  });
  return errors;
}
