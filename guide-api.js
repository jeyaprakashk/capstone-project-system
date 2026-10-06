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

/** Title approval timing: {state: on-time|late|overdue|pending|unknown, explanation, days}; days is approval day minus deadline (negative = early), null unless approved. */
function guideTitleTimingDto_(status, approvedAt, schedule, clock) {
  let state = 'unknown', days = null;
  if (schedule && clock) {
    if (status === 'APPROVED') {
      if (Number.isFinite(approvedAt) && approvedAt <= new Date(clock.now).getTime()) {
        days = projectDay_(new Date(approvedAt), schedule.timezone) - schedule.title;
        state = days > 0 ? 'late' : 'on-time';
      }
    } else state = clock.today > schedule.title ? 'overdue' : 'pending';
  }
  return {state, explanation:guideTimingExplanation_(state, approvedAt, schedule && schedule.title, schedule, 'Title approved'), days};
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
  const days = state !== 'unknown' && Number.isFinite(timestamp) ? projectDay_(new Date(timestamp), schedule.timezone) - schedule.git : null;
  const daysLate = state === 'late' && days !== null ? days : 0;
  return {state, explanation:guideTimingExplanation_(state, timestamp, schedule.git, schedule, 'GitHub account submitted'), date, daysLate, days};
}

function guideGithubDto_(github, roster, repoUrl, data) {
  const tone = !github || github.verificationUnavailable || github.accessError || github.members.some(member => member.access === 'unavailable') ? 'gray'
    : github.members.some(member => !member.githubId) ? 'red'
    : github.members.length && github.members.every(member => member.status === 'valid' && member.access === 'active') ? 'green' : 'orange';
  if (!github) return null;
  return {
    tone,
    members:roster.filter(student => String(student.email || '').trim()).map(student => {
      const member = github.members.find(item => emailsMatch_(item.email, student.email));
      const missing = !member || !member.githubId;
      const joined = !missing && member.status === 'valid' && member.access === 'active';
      return {name:String(student.name || ''), regno:String(student.regno || ''), state:missing ? 'missing' : joined ? 'joined' : 'pending', timing:guideGithubTimingDto_(member, data.schedule, data.clock)};
    })
  };
}

function guideStatusRoster_(r, TS) {
  return [1, 2, 3, 4].map(n => ({email:r[TS['S' + n + '_EMAIL']], regno:r[TS['S' + n + '_REGNO']], name:r[TS['S' + n + '_NAME']]}));
}

function guideTeamDto_(t, TS, data) {
  const r = t.row, key = normalizeText_(r[TS.TEAM_ID]), status = t.status, label = STATUS_LABEL[status];
  const roster = guideStatusRoster_(r, TS);
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
    } : null
  };
}

/** Guide Evaluation opens on its configured day; the notice explains a locked tab. */
function guideEvaluationDto_(schedule, clock) {
  const definition = schedule.assessments.find(d => d.key === 'guide_eval' && d.type === 'GUIDE_EVALUATION');
  const opens = definition ? definition.opens : null;
  return {enabled:opens !== null && clock.today >= opens, notice:opens === null ? 'Guide Evaluation is not configured in AssessmentDefinitions.' : 'Available from ' + formatProjectDay_(opens) + '.'};
}

/** Pure DTO builder over getGuideDashboardData_(). */
function buildGuideDto_(data, timings) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const teams = data.teams;
  // GitHub status is live and slow; it is read by API_guide_getGithub after the dashboard has rendered.
  return {
    teams:teams.map(t => guideTeamDto_(t, TS, data)),
    githubDue:Number.isFinite(data.schedule && data.schedule.git) ? formatProjectDay_(data.schedule.git) : null,
    evaluation:guideEvaluationDto_(data.schedule, data.clock),
    weeks:teams.length ? timedPhase_(timings, 'weekly_windows', () => data.windows || getWeeklySubmissionWindows_()).map(w => ({weekId:w.weekId, opensAt:w.opens_at, deadlineAt:w.deadline_at})) : []
  };
}

function guideAccessOrThrow_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  if (!getSheetRows_(SHEET_NAMES.TEAM_STATUS).some(r => r[TS.TEAM_ID] && emailsMatch_(r[TS.GUIDE_EMAIL], email))) throw apiFail_('UNAUTHORIZED', 'You do not have Guide access.');
  return email;
}

/**
 * Live GitHub status for each of the guide's teams, keyed by team ID; null means the status could not be read.
 * A failed read never becomes an error: title review must not depend on GitHub being reachable.
 */
function buildGuideGithubDto_(email, timings) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(r => emailsMatch_(r[TS.GUIDE_EMAIL], email));
  const repoUrlMap = getRepoUrlMap_();
  const data = {schedule:getProjectSchedule_(), clock:null};
  data.clock = getProjectClock_(data.schedule);
  let githubByTeam = null;
  if (rows.length) {
    try {
      const repoUrls = Object.fromEntries(rows.map(r => [normalizeText_(r[TS.TEAM_ID]), repoUrlMap[normalizeText_(r[TS.TEAM_ID])] || '']));
      githubByTeam = timedPhase_(timings, 'github_setup', () => getTeamsGithubSetup_(rows, TS, repoUrls, getSheetRows_(SHEET_NAMES.GITHUB_ACCOUNTS)));
    } catch (error) { /* A failed status read must not imply missing accounts. */ }
  }
  const teams = {};
  rows.forEach(r => {
    const key = normalizeText_(r[TS.TEAM_ID]);
    teams[String(r[TS.TEAM_ID])] = guideGithubDto_(githubByTeam && githubByTeam[key], guideStatusRoster_(r, TS), repoUrlMap[key] || '', data);
  });
  return {teams};
}

function API_guide_getGithub() {
  const started = Date.now(), timings = [];
  try {
    return apiHandle_(() => withDashboardRead_(() => {
      const email = timedPhase_(timings, 'access', () => guideAccessOrThrow_());
      return buildGuideGithubDto_(email, timings);
    }));
  } finally { logPhases_('guide_phases', 'github', timings, started); }
}

function API_guide_getDashboard() {
  const started = Date.now(), timings = [];
  try {
    return apiHandle_(() => withDashboardRead_(() => {
      const email = timedPhase_(timings, 'access', () => guideAccessOrThrow_());
      const data = getGuideDashboardData_(email, timings);
      const dto = timedPhase_(timings, 'dto_total', () => buildGuideDto_(data, timings));
      timings.push({phase:'teams', durationMs:0, success:true, count:data.teams ? data.teams.length : 0});
      return dto;
    }));
  } finally { logPhases_('guide_phases', 'dashboard', timings, started); }
}

/** Commits per mapped member, read from the collected-commit log (all time, template bootstrap excluded). */
function buildGuideCommitsDto_(teamId, setup, collected, collectionOk) {
  const repo = weeklyEvidenceRepo_(setup.repoUrl);
  if (!repo || !collectionOk) return {teamId, state:'unavailable', message:'Commit history is not available yet.', members:[]};
  const own = collected.filter(row => weeklyStudentCommit_(row) && textEquals_(row.teamId, teamId) && String(weeklyEvidenceRepo_(row.repositoryUrl) || '').toLowerCase() === repo.toLowerCase() && commitIdentity_(row.sha));
  return {teamId, state:'available', message:'', repositoryUrl:repo, members:setup.members.map(m => {
    if (m.status !== 'valid' || !githubId_(m.githubId)) return {regno:m.label, username:m.username, count:null, commits:[]};
    const mine = own.filter(row => githubAuthorMatches_(m.githubId, row.authorId)).sort((x, y) => new Date(y.timestamp) - new Date(x.timestamp));
    return {regno:m.label, username:m.username, count:mine.length, commits:mine.slice(0, 3).map(row => {
      const sha = commitIdentity_(row.sha);
      return {sha, shortSha:sha.slice(0, 7), message:String(row.message || ''), timestamp:new Date(row.timestamp).toISOString(), url:repo + '/commit/' + sha};
    })};
  })};
}

function API_guide_getCommits(teamId) {
  return apiHandle_(() => {
    const email = guideAccessOrThrow_(), id = String(teamId || '');
    const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    if (!getSheetRows_(SHEET_NAMES.TEAM_STATUS).some(r => textEquals_(r[TS.TEAM_ID], id) && emailsMatch_(r[TS.GUIDE_EMAIL], email))) throw apiFail_('UNAUTHORIZED', 'You do not have access to this team.');
    return buildGuideCommitsDto_(id, weeklyStoredGithubMapping_(id), readCollectedCommits_(id), readCommitCollectionStatus_(id) === 'ok');
  });
}

function API_guide_submitDecision(teamId, decision, notes, editedTitle) {
  return apiHandle_(() => {
    guideAccessOrThrow_();
    return apiWorkflowResult_(submitGuideDecision_(String(teamId || ''), String(decision || ''), String(notes || ''), String(editedTitle || '')), 'Decision saved.');
  });
}

/** Weekly progress for the guide's teams; the browser module renders and saves through the bridge. */
function API_guide_getWeekly() {
  const started = Date.now(), timings = [];
  try {
    return apiHandle_(() => withDashboardRead_(() => { timedPhase_(timings, 'access', () => guideAccessOrThrow_()); return loadGuideWeeklyProgress_(timings); }));
  } finally { logPhases_('guide_phases', 'weekly', timings, started); }
}

function API_guide_signWeekly(entryId, status) {
  return apiHandle_(() => { guideAccessOrThrow_(); const result = submitWeeklyGuideSignoff_(String(entryId || ''), String(status || '')); if (result && result.ok === false) throw apiFail_('REJECTED', result.message || 'The confirmation was not accepted.'); return result; });
}

/** Guide Evaluation: existing rules and messages; the browser module renders and saves through the bridge. */
function API_guide_getEvaluation(teamId, register) {
  const started = Date.now(), timings = [];
  try {
    return apiHandle_(() => { timedPhase_(timings, 'access', () => guideAccessOrThrow_()); return timedPhase_(timings, 'evaluation_load', () => loadGuideEvaluation_(String(teamId || ''), String(register || ''))); });
  } finally { logPhases_('guide_phases', 'evaluation', timings, started); }
}

function API_guide_saveEvaluationDraft(input) {
  return apiHandle_(() => { guideAccessOrThrow_(); return saveGuideEvaluationDraft_(input); });
}

function API_guide_submitEvaluation(input) {
  return apiHandle_(() => { guideAccessOrThrow_(); return submitGuideEvaluation_(input); });
}
