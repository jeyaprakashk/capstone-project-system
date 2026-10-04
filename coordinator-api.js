/**
 * COORDINATOR DASHBOARD API — JSON only. See DATA-CONTRACTS.md.
 * Same data, health rules and authorization as the previous server-rendered dashboard. The overview
 * (cheap) and progress (assessments, logs) stages share one DTO shape; `loading` marks the former.
 */
function coordinatorAccessOrThrow_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  if (!activityIsCoordinator_(email)) throw apiFail_('UNAUTHORIZED', 'Coordinator access is required.');
  return email;
}

function coordinatorTeamDto_(team, reviews) {
  return {
    teamId:String(team.teamId),
    guide:String(team.guide || ''),
    title:String(team.title || ''),
    titleStatus:String(team.titleStatus || ''),
    repoStatus:String(team.repoStatus || ''),
    githubMessage:String(team.githubMessage || ''),
    githubTiming:String(team.githubTiming || ''),
    repoUrl:String(team.repoUrl || ''),
    registerNumbers:(team.registerNumbers || []).map(String),
    emailRecipients:(team.emailRecipients || []).map(String),
    health:String(team.health || ''),
    pendingDeadlines:(team.pendingDeadlines || []).map(String),
    guideEvaluation:String(team.guideEvaluation || ''),
    reviews:Object.fromEntries(reviews.map(review => [review.key, String(team.reviews[review.key] || 'Unavailable')]))
  };
}

/** Pure DTO builder over getCoordinatorDashboardData_(). */
function buildCoordinatorDto_(data) {
  let reviews = [], reviewConfigurationError = false;
  try { reviews = getInternalReviews_(); } catch (err) { reviewConfigurationError = true; }
  const stats = data.stats, guide = stats.guideEvaluation;
  return {
    loading:!!stats.loading,
    stats:{
      total:stats.total, titleApproved:stats.titleApproved, reposReady:stats.reposReady, needsAttention:stats.needsAttention,
      guideEvaluation:guide ? {available:!!guide.available, completed:Number(guide.completed) || 0} : null,
      reviews:reviews.map(review => {
        const result = stats.reviews && stats.reviews[review.key];
        return {key:String(review.key), label:String(review.label), completed:result ? result.completed : null, unavailable:result ? result.unavailable : 0, known:!!result};
      })
    },
    reviewColumns:reviews.map(review => ({key:String(review.key), label:String(review.label)})),
    reviewConfigurationError,
    partial:Object.values(stats.reviews || {}).some(review => review.unavailable),
    teams:data.teamTrackerData.map(team => coordinatorTeamDto_(team, reviews)),
    deadlinePills:data.deadlinePills.map(pill => ({key:String(pill.key), label:String(pill.label), count:pill.count, due:formatProjectDay_(pill.due), overdue:!!pill.overdue}))
  };
}

function API_coordinator_getOverview() {
  return apiHandle_(() => coordinatorRead_('overview', () => { coordinatorAccessOrThrow_(); return buildCoordinatorDto_(getCoordinatorDashboardData_(true)); }));
}

/**
 * The progress stage as independent reads, so each card and tracker column settles (or fails) on its own and
 * the calls can run in parallel.
 */
function coordinatorTeamRows_() {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  return getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]).map(row => ({teamId:String(row[TS.TEAM_ID]), key:normalizeText_(row[TS.TEAM_ID])}));
}

function buildReviewProgressDto_(key) {
  const review = getInternalReviews_().find(item => item.key === key);
  if (!review) throw new Error('Unknown review.');
  const completion = getAllReviewCompletionStatus_(undefined, key), teams = {};
  let completed = 0, unavailable = 0;
  const rows = coordinatorTeamRows_();
  rows.forEach(row => {
    const result = completion[row.key] && completion[row.key][key];
    if (!result || result.available === false) { unavailable++; teams[row.teamId] = 'Unavailable'; }
    else { if (result.completed === true) completed++; teams[row.teamId] = result.completed ? 'Completed' : 'Pending'; }
  });
  return {key:String(key), label:String(review.label), total:rows.length, completed, unavailable, teams};
}

function API_coordinator_getReviewProgress(key) {
  return apiHandle_(() => coordinatorRead_('review-progress', () => { coordinatorAccessOrThrow_(); return buildReviewProgressDto_(normalizeText_(key)); }));
}

function buildGuideProgressDto_() {
  const guide = guideCompletion_(), teams = {};
  coordinatorTeamRows_().forEach(row => { teams[row.teamId] = !guide.available ? 'Unavailable' : guide.teams[row.key] ? 'Completed' : 'Pending'; });
  return {available:!!guide.available, completed:Number(guide.completed) || 0, teams};
}

function API_coordinator_getGuideProgress() {
  return apiHandle_(() => coordinatorRead_('guide-progress', () => { coordinatorAccessOrThrow_(); return buildGuideProgressDto_(); }));
}

/** Health needs the logs, review completion and deadlines together, so it is its own (heaviest) read. */
function buildHealthDto_(data) {
  const dto = buildCoordinatorDto_(data);
  return {
    needsAttention:dto.stats.needsAttention,
    partial:dto.partial,
    teams:Object.fromEntries(dto.teams.map(team => [team.teamId, {health:team.health, pendingDeadlines:team.pendingDeadlines}])),
    deadlinePills:dto.deadlinePills
  };
}

function API_coordinator_getHealth() {
  return apiHandle_(() => coordinatorRead_('health', () => {
    coordinatorAccessOrThrow_();
    const timings = [], data = getCoordinatorDashboardData_(false, timings);
    console.log(JSON.stringify({event:'coordinator_phases', section:'health', timings}));
    return buildHealthDto_(data);
  }));
}

function API_coordinator_getActivity() {
  return apiHandle_(() => { coordinatorAccessOrThrow_(); return loadAllTeamsWeeklyActivity_(); });
}

/** System Status frame data; every card's own readiness checks load separately. */
function buildSystemStatusDto_() {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]);
  const repos = getRepoUrlMap_();
  let publishing = {configured:true, items:[]};
  try { publishing.items = publicationDefinitions_().map(d => ({key:String(d.key), title:String(internalPublishingConfig_(d.key).title)})); }
  catch (err) { publishing = {configured:false, items:[]}; }
  return {
    github:{coordUsername:String(getConfig_('COLLABORATOR_GITHUB_USERNAME') || '').trim(), reposWithAccess:Number(getConfig_('COLLABORATOR_REPOS_ACCESS')) || 0,
      totalRepos:rows.filter(row => repos[normalizeText_(row[TS.TEAM_ID])]).length},
    publishing
  };
}

function API_coordinator_getSystemStatus() {
  return apiHandle_(() => coordinatorRead_('system-status', () => { coordinatorAccessOrThrow_(); return buildSystemStatusDto_(); }));
}

/** Team folders card: the read never creates anything; the write creates Team Documents and the missing team folders in batches. */
function API_coordinator_getTeamFolders() {
  return apiHandle_(() => coordinatorRead_('team-folders', () => { coordinatorAccessOrThrow_(); return buildTeamFoldersDto_(); }));
}

function API_coordinator_createTeamFolders(cursor) {
  return apiHandle_(() => { coordinatorAccessOrThrow_(); return createTeamFolders_(cursor === undefined || cursor === null ? '' : String(cursor)); });
}

/** Weekly progress setup card: the existing readiness check and one-time setup actions. */
function API_coordinator_getWeeklySetup() {
  return apiHandle_(() => { coordinatorAccessOrThrow_(); return getWeeklyProgressPhase2Readiness_(); });
}

/** kind is storage or triggers; the existing setup functions keep their rules and messages. */
function API_coordinator_setupWeekly(kind) {
  return apiHandle_(() => {
    coordinatorAccessOrThrow_();
    if (kind === 'storage') return setupWeeklyProgressPhase2Storage();
    if (kind === 'triggers') return setupWeeklyProgressPhase2Triggers();
    throw apiFail_('INVALID_INPUT', 'Unknown setup request.');
  });
}

/** System Status card actions. The existing functions authorize the coordinator, validate and keep their rules and messages. */
function API_coordinator_getCommitteeConfiguration() { return apiHandle_(() => { coordinatorAccessOrThrow_(); return getCoordinatorCommitteeConfiguration_(); }); }
function API_coordinator_getReviewConfiguration() { return apiHandle_(() => { coordinatorAccessOrThrow_(); return getCoordinatorReviewConfiguration_(); }); }
function API_coordinator_createDefinitions() { return apiHandle_(() => { coordinatorAccessOrThrow_(); return createAssessmentDefinitions_(); }); }
function API_coordinator_prepareStorage() { return apiHandle_(() => { coordinatorAccessOrThrow_(); return prepareReviewAssessmentStorage_(); }); }
function API_coordinator_syncGithub() { return apiHandle_(() => { coordinatorAccessOrThrow_(); return syncCoordinatorGithubAccess_(); }); }
function API_coordinator_resendInvitations(cursor) { return apiHandle_(() => { coordinatorAccessOrThrow_(); return resendExpiredStudentInvitations_(cursor === undefined || cursor === null ? '' : String(cursor)); }); }

/** Team drawer sections (basic, progress, activity): the existing read, which authorizes and validates the section. */
function API_coordinator_getTeamDrawer(teamId, section) { return apiHandle_(() => loadCoordinatorDrawerSection_(String(teamId || ''), String(section || ''))); }
