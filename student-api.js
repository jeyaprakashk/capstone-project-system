/**
 * STUDENT DASHBOARD API — JSON only. See DATA-CONTRACTS.md.
 * Same data, gating and authorization as the previous server-rendered dashboard.
 */
function studentGithubDto_(d, email) {
  const account = d.githubAccount || {};
  const connected = !!account.githubId;
  const members = (d.githubSetup || {}).members || [];
  const timing = githubSubmissionTiming_(d.githubSetup, d.schedule, d.clock);
  return {
    state:d.githubState,
    text:String(d.githubText || ''),
    connected,
    captureReady:!!d.githubCaptureReady,
    due:Number.isFinite(d.schedule.git) ? formatProjectDay_(d.schedule.git) : 'Date unavailable',
    statusText:d.githubNeedsUsername && !connected ? 'Waiting for GitHub account connection.' : timing.text,
    members:d.rosterSlots.filter(student => String(student.email || '').trim()).map(student => {
      const member = members.find(item => emailsMatch_(item.email, student.email));
      const missing = !member || !member.githubId;
      const joined = !missing && member.status === 'valid' && member.access === 'active';
      return {regno:String(student.regno || ''), status:missing ? 'missing' : joined ? 'joined' : 'pending', canConnect:missing && !connected && emailsMatch_(student.email, email)};
    }),
    repoUrl:String(d.repoUrl || '')
  };
}

function studentTitleDto_(d, teamId, githubDone, titleApproved) {
  const label = STUDENT_TITLE_LABEL[d.titleStatus];
  const active = label.state === 'active';
  return {
    locked:!githubDone,
    state:githubDone ? label.state : 'locked',
    statusText:label.text,
    currentTitle:String(d.title || ''),
    note:githubDone ? String(d.note || '') : '',
    intake:githubDone && active ? {url:buildTeamIntakeLink_(teamId), label:d.title ? 'Resubmit title' : 'Submit title'} : null,
    due:githubDone ? {date:formatProjectDay_(d.schedule.title), overdue:!titleApproved && d.clock.today > d.schedule.title} : null
  };
}

/** Pure DTO builder over getStudentDashboardData_(). */
function buildStudentDto_(email, teamId, d) {
  const githubDone = d.githubReady;
  const titleApproved = d.titleStatus === 'APPROVED';
  const label = STUDENT_TITLE_LABEL[d.titleStatus];
  const pendingSteps = [];
  if (!githubDone) pendingSteps.push('Step 1: ' + d.githubText);
  if (!titleApproved) {
    pendingSteps.push('Step 2: ' + label.text + '. ' + (!githubDone ? 'Finish GitHub setup first. ' : '') +
      (label.state === 'active' ? (d.title ? 'Your team must address the feedback below and resubmit the title.' : 'Your team must submit a project title for approval.') : 'Your team is waiting for approval; check the review status below.'));
  }
  const definitions = getAssessmentDefinitions_();
  const guideEvaluation = definitions.find(item => item.type === 'GUIDE_EVALUATION');
  return {
    teamId:String(teamId),
    roster:d.rosterSlots.map(s => ({name:String(s.name || ''), initials:initialsOf_(s.name), regno:String(s.regno || ''), isMe:emailsMatch_(s.email, email)})),
    titleApproved,
    setup:{complete:githubDone && titleApproved, pendingSteps},
    github:studentGithubDto_(d, email),
    title:studentTitleDto_(d, teamId, githubDone, titleApproved),
    assessments:{reviews:definitions.filter(item => item.type === 'REVIEW').map(item => ({key:String(item.key), label:String(item.label)})), guideEvaluationLabel:String((guideEvaluation || {}).label || 'Guide Evaluation')}
  };
}

function studentAccessOrThrow_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = getSheetRows_(SHEET_NAMES.TEAM_STATUS).find(r => r[TS.TEAM_ID] &&
    [r[TS.S1_EMAIL], r[TS.S2_EMAIL], r[TS.S3_EMAIL], r[TS.S4_EMAIL]].some(e => emailsMatch_(e, email)));
  if (!row) throw apiFail_('NOT_FOUND', 'Student team was not found.');
  return {email, teamId:row[TS.TEAM_ID], row};
}

function API_student_getDashboard() {
  return apiHandle_(() => withDashboardRead_(() => {
    const student = studentAccessOrThrow_();
    studentPerfReset_();
    return buildStudentDto_(student.email, student.teamId, getStudentDashboardData_(student.email, student.teamId, student.row));
  }));
}

/** Weekly progress: existing rules and messages; the browser module renders and saves through the bridge. */
function API_student_getWeekly() {
  return apiHandle_(() => loadStudentWeeklyProgress_());
}

function API_student_submitWeekly(input) {
  return apiHandle_(() => submitWeeklyProgress_(input));
}

/** Published results shown on the Student dashboard; the server decides what the student may see. */
function API_student_getReviewResult(key) {
  return apiHandle_(() => loadPublishedReviewEvaluation_(String(key || '')));
}

function API_student_getGuideResult() {
  return apiHandle_(() => loadPublishedGuideEvaluation_());
}

/** GitHub account connection: the existing functions resolve the account, bind it to the student and provision access. */
function API_student_previewGithub(profileUrl) { return apiHandle_(() => previewStudentGithubAccount_(String(profileUrl || ''))); }
function API_student_confirmGithub(token) { return apiHandle_(() => confirmStudentGithubAccount_(String(token || ''))); }
function API_student_completeGithubSetup() { return apiHandle_(() => completeStudentGithubSetup_()); }
