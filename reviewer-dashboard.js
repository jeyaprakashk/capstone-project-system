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

  // The title state of each team comes from TitleLog, read once. A team whose history is not valid has an error instead of a state
  // and is counted in none of the three groups.
  const index = readTitleIndex_();
  const titles = Object.create(null);
  myRows.forEach(r => { titles[normalizeText_(r[TS.TEAM_ID])] = titleTryState_(index, r[TS.TEAM_ID]); });
  const statusOf = r => { const title = titles[normalizeText_(r[TS.TEAM_ID])]; return title.state ? title.state.status : ''; };
  const pending = myRows.filter(r => statusOf(r) === 'AWAITING_REVIEWER');
  const approved = myRows.filter(r => statusOf(r) === 'APPROVED' || statusOf(r) === 'REOPENED');
  const notYetGuideApproved = myRows.filter(r => ['NOT_SUBMITTED', 'NEEDS_REVIEW', 'RETURNED'].includes(statusOf(r)));

  return { pending, approved, notYetGuideApproved, assigned: myRows, total: myRows.length, titles };
}

