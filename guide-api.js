/**
 * GUIDE DASHBOARD API — JSON only. See DATA-CONTRACTS.md.
 * Same data, ordering, timing rules and authorization as the previous server-rendered
 * dashboard; the browser (guide-view.js) decides how to present it.
 */
function guideTimingExplanation_(state, timestamp, deadline, schedule, action) {
  let explanation = 'Timing cannot be verified from the recorded date and deadline.';
  if (schedule && Number.isFinite(deadline)) {
    const due = formatProjectDay_(deadline);
    explanation = 'Deadline: ' + due + '.';
    if ((state === 'late' || state === 'on-time') && Number.isFinite(timestamp)) {
      const day = projectDay_(new Date(timestamp), schedule.timezone), delay = day - deadline;
      explanation = action + ' ' + formatProjectDay_(day) + ', ' + (delay > 0 ? delay + ' day' + (delay === 1 ? '' : 's') + ' after the deadline' : 'on or before the deadline') + ' (' + due + ').';
    } else if (state === 'overdue') explanation = action + ' is overdue. Deadline: ' + due + '.';
    else if (state === 'unknown') explanation = 'Recorded date unavailable. Deadline: ' + due + '.';
  }
  return explanation;
}

/** Title approval timing: {state: on-time|late|overdue|pending|unknown, explanation}. */
function guideTitleTimingDto_(status, approvedAt, schedule, clock) {
  let state = 'unknown';
  if (schedule && clock) {
    if (status === 'APPROVED') {
      if (Number.isFinite(approvedAt) && approvedAt <= new Date(clock.now).getTime()) state = projectDay_(new Date(approvedAt), schedule.timezone) > schedule.title ? 'late' : 'on-time';
    } else state = clock.today > schedule.title ? 'overdue' : 'pending';
  }
  return {state, explanation:guideTimingExplanation_(state, approvedAt, schedule && schedule.title, schedule, 'Title approved')};
}

/** GitHub account submission timing for a joined student; null when it does not apply. */
function guideGithubTimingDto_(member, schedule, clock) {
  if (!member || !member.githubId || member.status !== 'valid' || member.access !== 'active') return null;
  if (!schedule || !clock || !Number.isFinite(schedule.git)) {
    return {state:'unknown', explanation:guideTimingExplanation_('unknown', null, null, schedule, 'GitHub account submitted'), date:'', daysLate:0};
  }
  const timestamp = member.submittedAt;
  let state = 'unknown';
  if (member.status === 'valid' && Number.isFinite(timestamp) && timestamp <= new Date(clock.now).getTime()) state = projectDay_(new Date(timestamp), schedule.timezone) > schedule.git ? 'late' : 'on-time';
  const date = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString('en-GB', {timeZone:schedule.timezone, day:'numeric', month:'short'}).replace(/\bSept\b/g, 'Sep') : '';
  const daysLate = state === 'late' && Number.isFinite(timestamp) ? projectDay_(new Date(timestamp), schedule.timezone) - schedule.git : 0;
  return {state, explanation:guideTimingExplanation_(state, timestamp, schedule.git, schedule, 'GitHub account submitted'), date, daysLate};
}

function guideGithubDto_(github, roster, repoUrl, data) {
  const tone = !github || github.verificationUnavailable || github.accessError || github.members.some(member => member.access === 'unavailable') ? 'gray'
    : github.members.some(member => !member.githubId) ? 'red'
    : github.members.length && github.members.every(member => member.status === 'valid' && member.access === 'active') ? 'green' : 'orange';
  if (!github) return null;
  return {
    tone,
    members:roster.filter(student => String(student.email || '').trim()).map(student => {
      const member = github.members.find(item => emailsMatch(item.email, student.email));
      const missing = !member || !member.githubId;
      const joined = !missing && member.status === 'valid' && member.access === 'active';
      return {name:String(student.name || ''), regno:String(student.regno || ''), state:missing ? 'missing' : joined ? 'joined' : 'pending', timing:guideGithubTimingDto_(member, data.schedule, data.clock)};
    })
  };
}

function guideTeamDto_(t, TS, data, githubByTeam, timingTeam) {
  const r = t.row, key = normalizeText_(r[TS.TEAM_ID]), status = t.status, label = STATUS_LABEL[status];
  const roster = [1, 2, 3, 4].map(n => ({email:r[TS['S' + n + '_EMAIL']], regno:r[TS['S' + n + '_REGNO']], name:r[TS['S' + n + '_NAME']]}));
  const documents = [
    {label:'Work Breakdown', url:r[TS.WORK_BREAKDOWN_LINK]},
    {label:'Need Analysis', url:r[TS.NEED_ANALYSIS_LINK]},
    {label:'Chapter 1 (LaTeX)', url:r[TS.CHAPTER1_LATEX_LINK]}
  ].filter(d => d.url).map(d => ({label:d.label, url:String(d.url)}));
  const approvedAt = data.approvalTimes && data.approvalTimes[key];
  return {
    teamId:String(r[TS.TEAM_ID]),
    title:String(r[TS.TITLE] || ''),
    status:{key:status, text:label.text, tone:label.cls},
    members:roster.filter(s => s.name).map(s => ({name:String(s.name), regno:String(s.regno || '')})),
    memberEmails:roster.map(s => s.email).filter(Boolean).map(String),
    registerNumbers:roster.map(s => s.regno).filter(Boolean).map(String),
    repoUrl:t.repoUrl || '',
    problem:String(r[TS.PROBLEM] || ''),
    documents,
    lastDocumentSubmission:String(data.documentSubmissions && data.documentSubmissions[key] || ''),
    overdueLogs:t.logWeeks && t.logWeeks.missing ? t.logWeeks.missing : 0,
    titleDue:status === 'APPROVED' ? null : {date:formatProjectDay_(data.schedule.title), overdue:data.clock.today > data.schedule.title},
    titleTiming:status === 'APPROVED' ? null : guideTitleTimingDto_(status, approvedAt, data.schedule, data.clock),
    similarityFlag:String(r[TS.SIMILARITY_FLAG] || ''),
    guideNotes:String(r[TS.GUIDE_NOTES] || ''),
    reviewerNotes:String(r[TS.REVIEWER_NOTES] || ''),
    approval:status === 'APPROVED' ? {
      approvedBy:String(r[TS.TITLE_APPROVED_BY] || ''),
      approvedOn:String(data.approvals && data.approvals[key] || ''),
      timing:guideTitleTimingDto_('APPROVED', approvedAt, data.schedule, data.clock)
    } : null,
    github:guideGithubDto_(githubByTeam && githubByTeam[key], roster, t.repoUrl || '', data)
  };
}

/** Guide Evaluation opens on its configured day; the notice explains a locked tab. */
function guideEvaluationDto_(schedule, clock) {
  const definition = schedule.assessments.find(d => d.key === 'guide_eval' && d.type === 'GUIDE_EVALUATION');
  const opens = definition ? definition.opens : null;
  return {enabled:opens !== null && clock.today >= opens, notice:opens === null ? 'Guide Evaluation is not configured in AssessmentDefinitions.' : 'Available from ' + formatProjectDay_(opens) + '.'};
}

/** Pure DTO builder over getGuideDashboardData(). */
function buildGuideDto_(data) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const teams = data.teams;
  let githubByTeam = null;
  if (teams.length) {
    try {
      const repoUrls = Object.fromEntries(teams.map(t => [normalizeText_(t.row[TS.TEAM_ID]), t.repoUrl || '']));
      githubByTeam = getTeamsGithubSetup_(teams.map(t => t.row), TS, repoUrls, getSheetRows(SHEET_NAMES.GITHUB_ACCOUNTS));
    } catch (error) { /* A failed status read must not block title review or imply missing accounts. */ }
  }
  return {
    teams:teams.map(t => guideTeamDto_(t, TS, data, githubByTeam)),
    githubDue:Number.isFinite(data.schedule && data.schedule.git) ? formatProjectDay_(data.schedule.git) : null,
    evaluation:guideEvaluationDto_(data.schedule, data.clock),
    weeks:teams.length ? getWeeklySubmissionWindows_().map(w => ({weekId:w.weekId, opensAt:w.opens_at, deadlineAt:w.deadline_at})) : []
  };
}

function guideAccessOrThrow_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  if (!getSheetRows(SHEET_NAMES.TEAM_STATUS).some(r => r[TS.TEAM_ID] && emailsMatch(r[TS.GUIDE_EMAIL], email))) throw apiFail_('UNAUTHORIZED', 'You do not have Guide access.');
  return email;
}

function API_guide_getDashboard() {
  return apiHandle_(() => withDashboardRead_(() => buildGuideDto_(getGuideDashboardData(guideAccessOrThrow_()))));
}

function API_guide_submitDecision(teamId, decision, notes, editedTitle) {
  return apiHandle_(() => {
    guideAccessOrThrow_();
    return apiWorkflowResult_(submitGuideDecision(String(teamId || ''), String(decision || ''), String(notes || ''), String(editedTitle || '')), 'Decision saved.');
  });
}
