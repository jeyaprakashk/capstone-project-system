/**
 * REVIEWER DASHBOARD API — JSON only. See DATA-CONTRACTS.md.
 * Same data, authorization and rules as the previous server-rendered dashboard.
 */
function reviewerTitleStatus_(row, TS) {
  const decision = row[TS.REVIEWER_DECISION];
  if (!String(row[TS.TITLE] || '').trim()) return {tone:'neutral', label:'Not submitted'};
  if (textEquals_(decision, 'Approved')) return {tone:'success', label:'Approved'};
  if (textEquals_(decision, 'Revise')) return {tone:'warning', label:'Revision requested'};
  if (textEquals_(row[TS.GUIDE_DECISION], 'Approved')) return {tone:'warning', label:'Pending review'};
  return {tone:'neutral', label:'Awaiting guide'};
}

function reviewerReviewCellDto_(row, TS, review, progress) {
  const state = (progress.teams[normalizeReviewKey_(row[TS.TEAM_ID])] || {})[review.key];
  const titleApproved = !!String(row[TS.TITLE] || '').trim() && textEquals_(row[TS.REVIEWER_DECISION], 'Approved');
  const available = !!(state && state.available);
  const enabled = available && !!state.readable && titleApproved && !state.prerequisiteReason;
  const hint = !available ? ((state && state.error) || 'Marks unavailable.') : (state.reason || state.status);
  const completed = !!(state && state.completed);
  return {
    key:review.key,
    enabled,
    actionLabel:state && ['Submitted', 'Published'].includes(state.status) ? 'View marks' : completed ? 'Edit marks' : 'Enter marks',
    note:hint ? String(hint) : completed ? 'Completed' : (state.markedStudents + '/' + state.totalStudents + ' students marked')
  };
}

function reviewerTeamDto_(row, TS, progress) {
  const title = String(row[TS.TITLE] || '').trim();
  const canDecide = !!title && textEquals_(row[TS.GUIDE_DECISION], 'Approved') && !textEquals_(row[TS.REVIEWER_DECISION], 'Approved');
  const documents = [
    {label:'WBS', url:row[TS.WORK_BREAKDOWN_LINK]},
    {label:'Need Analysis', url:row[TS.NEED_ANALYSIS_LINK]},
    {label:'Ch.1 LaTeX', url:row[TS.CHAPTER1_LATEX_LINK]}
  ].filter(d => d.url).map(d => ({label:d.label, url:String(d.url)}));
  const status = reviewerTitleStatus_(row, TS);
  return {
    teamId:String(row[TS.TEAM_ID]),
    guideName:String(row[TS.GUIDE_NAME] || ''),
    registerNumbers:[1, 2, 3, 4].map(n => String(row[TS['S' + n + '_REGNO']] || '').trim()).filter(Boolean),
    title,
    committee:String(row[TS.COMMITTEE_NUMBER] || ''),
    titleApproval:{
      status,
      canDecide,
      submittedTitle:String(row[TS.TITLE] || ''),
      similarityFlag:String(row[TS.SIMILARITY_FLAG] || ''),
      documents,
      reviewerNotes:String(row[TS.REVIEWER_NOTES] || '')
    },
    reviews:progress.reviews.map(review => reviewerReviewCellDto_(row, TS, review, progress))
  };
}

/** Pure DTO builder over getReviewerDashboardData(); no sheet or layout knowledge leaves it. */
function buildReviewerDto_(data) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const progress = getReviewerReviewProgress_(data.assigned);
  return {
    summary:{pending:data.pending.length, approved:data.approved.length, awaitingGuide:data.notYetGuideApproved.length, total:data.total},
    reviews:progress.reviews.map(review => ({key:review.key, label:String(review.label)})),
    reviewError:progress.error ? String(progress.error) : null,
    teams:data.assigned.map(row => reviewerTeamDto_(row, TS, progress))
  };
}

function reviewerEmailOrThrow_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  if (!getCommitteeNumbersForReviewer(email).length) throw apiFail_('UNAUTHORIZED', 'You do not have Reviewer access.');
  return email;
}

function API_reviewer_getDashboard() {
  return apiHandle_(() => withDashboardRead_(() => buildReviewerDto_(getReviewerDashboardData(reviewerEmailOrThrow_()))));
}

function API_reviewer_submitDecision(teamId, decision, notes) {
  return apiHandle_(() => {
    reviewerEmailOrThrow_();
    return apiWorkflowResult_(submitReviewerDecision(String(teamId || ''), String(decision || ''), String(notes || '')), 'Decision saved.');
  });
}

/** Review marking: the rules code authorizes (assigned reviewer, or staff) and keeps its messages; the drawer reads and saves through the bridge. */
const REVIEW_SAVE_KINDS_ = {draft:'saveReviewEvaluationDraft', submit:'submitReviewEvaluation', absence:'recordReviewAbsence', makeupDraft:'saveReviewMakeupDraft', makeupSubmit:'submitReviewMakeup'};

function API_review_getEvaluation(teamId, assessmentId) {
  return apiHandle_(() => loadReviewEvaluation(String(teamId || ''), String(assessmentId || '')));
}

/** kind is one of draft, submit, absence, makeupDraft, makeupSubmit; the rules function validates the input. */
function API_review_save(kind, input) {
  return apiHandle_(() => {
    const method = REVIEW_SAVE_KINDS_[String(kind)];
    if (!method) throw apiFail_('INVALID_INPUT', 'Unknown save request.');
    const result = globalThis[method](input);
    if (result && result.ok === false) throw apiFail_('REJECTED', result.message || 'The request was not accepted.');
    return result;
  });
}
  