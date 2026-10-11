/**
 * TITLE DIGESTS - the reviewer reminder e-mail of the title workflow, read from TitleLog (TITLE-REVISION-PLAN.md, section 10):
 *  - sendReviewerApprovalDigest: to each reviewer, the guide-approved titles waiting for the reviewers (status AWAITING_REVIEWER).
 * A team whose title history is not valid is left out and logged. It is a trigger or editor-run entry point. (The guide reminder digest
 * was removed: the faculty now use the dashboard regularly.)
 */

/** Teams of the roster with their title state: [{row, state}]. Teams with an invalid history are logged and skipped. */
function titleDigestTeams_(TS, rows) {
  const index = readTitleIndex_();
  return rows.filter(row => row[TS.TEAM_ID]).map(row => {
    const read = titleTryState_(index, row[TS.TEAM_ID]);
    if (read.error) console.error('Title digest skipped team ' + row[TS.TEAM_ID] + ': ' + read.error);
    return {row, state: read.state || null};
  }).filter(team => team.state);
}

function sendReviewerApprovalDigest() {
  requireTriggerOrOperator_();
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const pending = titleDigestTeams_(TS, getSheetRows_(SHEET_NAMES.TEAM_STATUS)).filter(team => team.state.status === 'AWAITING_REVIEWER');
  if (pending.length === 0) return;

  const digestByReviewer = {};
  pending.forEach(({row, state}) => {
    const flag = state.similarityNote ? `  [FLAG: ${state.similarityNote}]` : '';
    const line = `Team ${row[TS.TEAM_ID]} (Guide: ${row[TS.GUIDE_EMAIL]}) — "${state.proposal.title}"${flag}`;
    const committee = getCommitteeInfo_(row[TS.COMMITTEE_NUMBER]);
    const reviewerEmails = committee
      ? [committee.reviewer1Email, committee.reviewer2Email, committee.reviewer3Email, committee.reviewer4Email]
      : [];
    reviewerEmails.filter(Boolean).forEach(reviewerEmail => {
      digestByReviewer[reviewerEmail] = digestByReviewer[reviewerEmail] || [];
      digestByReviewer[reviewerEmail].push(line);
    });
  });

  Object.entries(digestByReviewer).forEach(([reviewerEmail, lines]) => {
    MailApp.sendEmail(reviewerEmail, `Capstone Title Approvals — ${lines.length} pending`,
      `Guide-approved titles awaiting your decision:\n\n${lines.join('\n')}\n\nReview here: ${getDashboardUrl_()}`);
  });
}
