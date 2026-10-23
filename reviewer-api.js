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

function reviewerReviewCellDto_(row, TS, review, progress) {
  const state = (progress.teams[normalizeReviewKey_(row[TS.TEAM_ID])] || {})[review.key];
  const available = !!(state && state.available);
  const enabled = available && !!state.readable && !state.sequenceReason;
  // A condition that is not met (a requirement row, an earlier assessment) is only said to be unmet: the details are on the coordinator's report.
  const hint = !available ? ((state && state.error) || 'Marks unavailable.') : state.notEligible ? 'Not Eligible' : (state.reason || state.status);
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
    students:[1, 2, 3, 4].map(n => ({name:String(row[TS['S' + n + '_NAME']] || '').trim(), regNo:String(row[TS['S' + n + '_REGNO']] || '').trim()})).filter(student => student.regNo),
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
    reviews:progress.reviews.map(review => reviewerReviewCellDto_(row, TS, review, progress))
  };
}

/** Pure DTO builder over getReviewerDashboardData_(); no sheet or layout knowledge leaves it. */
function buildReviewerDto_(data, timings) {
  const time = (phase, run) => { if (!timings) return run(); const at = Date.now(); try { return run(); } finally { timings.push({phase, durationMs:Date.now() - at}); } };
  const TS = time('build:column_map', () => getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS));
  // Only the cheap rows (the title) gate a cell on first paint; the documents and GitHub are read per team by API_reviewer_getTeamRequirements.
  const progress = time('build:progress', () => getReviewerReviewProgress_(data.assigned, undefined, ['title'], undefined, timings));
  const folders = time('build:folder_links', () => teamFolderUrls_(data.assigned.map(row => ({teamId:row[TS.TEAM_ID], semester:row[TS.SEMESTER]}))));
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
  const started = Date.now(), timings = [];
  try {
    return apiHandle_(() => withDashboardRead_(() => {
      const email = timedPhase_(timings, 'auth', () => reviewerEmailOrThrow_());
      const data = timedPhase_(timings, 'dashboard_data', () => getReviewerDashboardData_(email));
      return timedPhase_(timings, 'build_dto', () => buildReviewerDto_(data, timings));
    }));
  } finally { logPhases_('reviewer_request', 'getDashboard', timings, started); }
}

/**
 * One assigned team's review cells with the ActivityDependencies requirements evaluated as a label (`hint`): a document is answered from the
 * DocumentSubmissions journal with no Drive read. The dashboard asks per team after first paint and replaces the cells it showed. The entry
 * itself is read the same way (loadReviewEvaluation_); every save still runs the full gate, Drive included, and refuses what the label allowed.
 */
function API_reviewer_getTeamRequirements(teamId) {
  const started = Date.now(), timings = [];
  try { return apiHandle_(() => withDashboardRead_(() => {
    const email = reviewerEmailOrThrow_(), TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const wanted = normalizeText_(teamId), mine = new Set(getCommitteeNumbersForReviewer_(email).map(normalizeText_));
    const row = wanted && getSheetRows_(SHEET_NAMES.TEAM_STATUS).find(r => normalizeText_(r[TS.TEAM_ID]) === wanted && mine.has(normalizeText_(r[TS.COMMITTEE_NUMBER])));
    if (!row) throw apiFail_('NOT_FOUND', 'Team not found.');
    const progress = timedPhase_(timings, 'progress_and_rows', () => getReviewerReviewProgress_([row], undefined, true, true, timings));
    return {teamId:String(row[TS.TEAM_ID]), reviews:progress.error ? [] : progress.reviews.map(review => reviewerReviewCellDto_(row, TS, review, progress))};
  })); } finally { logPhases_('reviewer_request', 'getTeamRequirements', timings, started); }
}

/** Review marking: the rules code authorizes (assigned reviewer, or staff) and keeps its messages; the drawer reads and saves through the bridge. */
const REVIEW_SAVE_KINDS_ = {draft:'saveReviewEvaluationDraft_', submit:'submitReviewEvaluation_', absence:'recordReviewAbsence_', makeupDraft:'saveReviewMakeupDraft_', makeupSubmit:'submitReviewMakeup_'};

function API_review_getEvaluation(teamId, assessmentId) {
  const started = Date.now(), timings = [];
  try { return apiHandle_(() => withDashboardRead_(() => timedPhase_(timings, 'load_evaluation', () => loadReviewEvaluation_(String(teamId || ''), String(assessmentId || ''), timings)))); }
  finally { logPhases_('reviewer_request', 'getEvaluation', timings, started); }
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
  