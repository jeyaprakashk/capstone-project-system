// Translates the old TeamStatus title state (a title, a Guide Decision, a Reviewer Decision) into the TitleLog rows that mean the same,
// so fixtures built for the old model drive the new readers. The mapping mirrors getTeamStatus_, which decides in this order:
// no title = NOT_SUBMITTED; Reviewer Approved = APPROVED; Reviewer Revise = returned by the reviewer; Guide Rejected = returned by the guide;
// Guide Approved = AWAITING_REVIEWER; otherwise NEEDS_REVIEW.
const { history, T0 } = require('../title-fixtures.cjs');

function legacySteps(title, guide, reviewer) {
  const text = value => String(value || '').trim().toLowerCase();
  if (!String(title || '').trim()) return [];
  if (text(reviewer) === 'approved') return ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'];
  if (text(reviewer) === 'revise') return ['SUBMIT', 'GUIDE_APPROVE', 'RETURN'];
  if (text(guide) === 'rejected') return ['SUBMIT', 'RETURN'];
  if (text(guide) === 'approved') return ['SUBMIT', 'GUIDE_APPROVE'];
  return ['SUBMIT'];
}

/** TitleLog row objects for a team in the given old state. Rows are dated well before the fixtures' clocks. */
function titleRowsFor({teamId = 'T1', title, guide, reviewer, problem = 'A problem statement', guideNotes = '', reviewerNotes = '', similarityNote = '', start = Date.parse('2025-12-01T00:00:00Z')}) {
  const steps = legacySteps(title, guide, reviewer).map(action => {
    if (action === 'SUBMIT') return {action, title: String(title).trim().toUpperCase(), problem, similarityNote};
    if (action === 'RETURN') {
      const byReviewer = String(reviewer).toLowerCase() === 'revise';
      return {action, actor: byReviewer ? 'reviewer@example.com' : 'guide@example.com', notes: byReviewer ? reviewerNotes || 'Please revise.' : guideNotes || 'Please revise.'};
    }
    return action;
  });
  const rows = history(steps, {teamId, start});
  return rows;
}

module.exports = {titleRowsFor, legacySteps};
