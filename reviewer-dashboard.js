/**
 * REVIEWER DASHBOARD
 * Reviewer data and title decisions. The browser receives DTOs from reviewer-api.js
 * and renders them in reviewer-view.js; this file builds no markup.
 */

function getReviewerDashboardData_(email) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(r => r[TS.TEAM_ID]);

  const myCommitteeNumbers = new Set(getCommitteeNumbersForReviewer_(email).map(normalizeText_));
  const myRows = rows.filter(r => myCommitteeNumbers.has(normalizeText_(r[TS.COMMITTEE_NUMBER])));

  const pending = myRows.filter(r => textEquals_(r[TS.GUIDE_DECISION], 'Approved') && !textEquals_(r[TS.REVIEWER_DECISION], 'Approved'));
  const approved = myRows.filter(r => textEquals_(r[TS.REVIEWER_DECISION], 'Approved'));
  const notYetGuideApproved = myRows.filter(r => !textEquals_(r[TS.GUIDE_DECISION], 'Approved'));

  return { pending, approved, notYetGuideApproved, assigned: myRows, total: myRows.length };
}

function submitReviewerDecision_(teamId, decision, notes) {
  // Release 0 (TITLE-REVISION-PLAN.md, section 11): the existing script lock now also rereads TITLE_CUTOVER under it.
  return withTitleWriteLock_(1000, 'Another decision is being saved. Try again.', () => {
    const context=reviewerTeamContext_(teamId);
    if (!['Approved','Revise'].includes(decision)) throw new Error('Invalid reviewer decision.');
    if (decision==='Revise' && !String(notes || '').trim()) throw new Error('Notes are required when requesting revision.');
    if (textEquals_(context.row[context.TS.REVIEWER_DECISION],'Approved')) return {ok:true,message:'Title already approved.'};
    if (!context.title.trim() || !textEquals_(context.row[context.TS.GUIDE_DECISION],'Approved')) throw new Error('The title must be submitted and approved by the guide first.');
    return applyReviewerDecision_(teamId,decision,notes,Session.getActiveUser().getEmail());
  });
}
