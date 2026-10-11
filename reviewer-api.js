/**
 * REVIEWER DASHBOARD API — JSON only. See DATA-CONTRACTS.md.
 * Same data, authorization and rules as the previous server-rendered dashboard.
 */
const REVIEWER_TITLE_STATUS_ = Object.freeze({
  NOT_SUBMITTED: {tone:'neutral', label:'Not submitted'}, NEEDS_REVIEW: {tone:'neutral', label:'Awaiting guide'},
  AWAITING_REVIEWER: {tone:'warning', label:'Pending review'}, RETURNED: {tone:'warning', label:'Returned for revision'},
  APPROVED: {tone:'success', label:'Approved'}, REOPENED: {tone:'warning', label:'Reopened'}
});

/** The status chip for a team's title. `title` is {state} or {error} from titleTryState_. */
function reviewerTitleStatus_(title) {
  return title.state ? {...REVIEWER_TITLE_STATUS_[title.state.status]} : {tone:'warning', label:'Unavailable'};
}

function reviewerReviewCellDto_(row, TS, review, progress, title) {
  const state = (progress.teams[normalizeReviewKey_(row[TS.TEAM_ID])] || {})[review.key];
  const titleApproved = !!(title.state && title.state.approved.value);
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

function reviewerTeamDto_(row, TS, progress, title, folderUrl) {
  const summary = title.state ? titleSummaryFromState_(title.state) : null;
  // The reviewer can act on a title that is waiting for the reviewers: return it, and approve it unless a rule refuses (a blank problem
  // statement can only be returned).
  const approve = title.state ? titleCanDo_(title.state, 'reviewerApprove', {roles:{reviewer:true}}) : {allowed:false, reason:''};
  const giveBack = title.state ? titleCanDo_(title.state, 'return', {roles:{reviewer:true}}) : {allowed:false};
  const canDecide = approve.allowed || giveBack.allowed;
  const status = reviewerTitleStatus_(title);
  return {
    teamId:String(row[TS.TEAM_ID]),
    guideName:String(row[TS.GUIDE_NAME] || ''),
    registerNumbers:[1, 2, 3, 4].map(n => String(row[TS['S' + n + '_REGNO']] || '').trim()).filter(Boolean),
    title:summary ? summary.title : '',
    committee:String(row[TS.COMMITTEE_NUMBER] || ''),
    titleApproval:{
      status,
      canDecide,
      canApprove:approve.allowed,
      approveBlockedReason:title.state && title.state.status === 'AWAITING_REVIEWER' && !approve.allowed ? String(approve.reason || '') : '',
      revision:summary ? summary.revision : 0,
      submittedTitle:summary ? summary.proposal.title : '',
      problem:summary ? summary.proposal.problem : '',
      similarityFlag:summary ? summary.similarityNote : '',
      folderUrl:String(folderUrl || ''),
      notes:summary ? summary.notes : ''
    },
    reviews:progress.reviews.map(review => reviewerReviewCellDto_(row, TS, review, progress, title))
  };
}

/** Pure DTO builder over getReviewerDashboardData_(); no sheet or layout knowledge leaves it. */
function buildReviewerDto_(data) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const progress = getReviewerReviewProgress_(data.assigned);
  const folders = teamFolderUrls_(data.assigned.map(row => ({teamId:row[TS.TEAM_ID], semester:row[TS.SEMESTER]})));
  return {
    summary:{pending:data.pending.length, approved:data.approved.length, awaitingGuide:data.notYetGuideApproved.length, total:data.total},
    reviews:progress.reviews.map(review => ({key:review.key, label:String(review.label)})),
    reviewError:progress.error ? String(progress.error) : null,
    teams:data.assigned.map(row => reviewerTeamDto_(row, TS, progress, data.titles[normalizeText_(row[TS.TEAM_ID])], folders[normalizeText_(row[TS.TEAM_ID])]))
  };
}

function reviewerEmailOrThrow_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  if (!getCommitteeNumbersForReviewer_(email).length) throw apiFail_('UNAUTHORIZED', 'You do not have Reviewer access.');
  return email;
}

function API_reviewer_getDashboard() {
  return apiHandle_(() => withDashboardRead_(() => buildReviewerDto_(getReviewerDashboardData_(reviewerEmailOrThrow_()))));
}

/** Review marking: the rules code authorizes (assigned reviewer, or staff) and keeps its messages; the drawer reads and saves through the bridge. */
const REVIEW_SAVE_KINDS_ = {draft:'saveReviewEvaluationDraft_', submit:'submitReviewEvaluation_', absence:'recordReviewAbsence_', makeupDraft:'saveReviewMakeupDraft_', makeupSubmit:'submitReviewMakeup_'};

function API_review_getEvaluation(teamId, assessmentId) {
  return apiHandle_(() => withDashboardRead_(() => loadReviewEvaluation_(String(teamId || ''), String(assessmentId || ''))));
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
  