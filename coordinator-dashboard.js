/**
 * COORDINATOR DASHBOARD
 * Data for the coordinator dashboard (see coordinator-api.js for the DTOs the browser renders in
 * coordinator-view.js) and the System Status cards.
 */

function coordinatorRead_(operation, read) {
  const started = Date.now();
  let success = false;
  try {
    return withDashboardRead_(() => {
      const email = Session.getActiveUser().getEmail();
      if (!email) throw apiFail_('UNAUTHENTICATED', 'Coordinator access is required.');
      if (!activityIsCoordinator_(email)) throw apiFail_('UNAUTHORIZED', 'Coordinator access is required.');
      const result = read();
      success = true;
      return result;
    });
  } finally {
    console.log(JSON.stringify({event:'coordinator_request', operation, durationMs:Date.now() - started, success}));
  }
}

function getCoordinatorRepositoryStatus_(repoUrl) {
  const ready = !!String(repoUrl || '').trim();
  return {repositoryOnly:true, ready, message:ready ? 'Repository URL recorded' : 'Repository URL missing'};
}

function getCoordinatorDashboardData_(deferAssessments, timings) {
  const measure = (phase, read) => {
    if (!timings) return read();
    const started = Date.now();
    let success = false;
    try { const result = read(); success = true; return result; }
    finally { timings.push({phase, durationMs:Date.now() - started, success}); }
  };
  const dataStarted = Date.now();
  const reviewTimings = timings ? [] : undefined;
  const repositoryTimings = timings ? [] : undefined;
  const TS = measure('status_columns', () => getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS));
  const TR = measure('roster_columns', () => getColumnMap_(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER));

  const statusRows = measure('status_rows', () => getSheetRows_(SHEET_NAMES.TEAM_STATUS)).filter(r => r[TS.TEAM_ID]);
  const rosterRows = measure('roster_rows', () => getSheetRows_(SHEET_NAMES.TEAM_ROSTER));
  const repoUrlMap = measure('repository_map', () => getRepoUrlMap_(repositoryTimings));
  const githubByTeam = Object.fromEntries(statusRows.map(row => {
    const id = normalizeText_(row[TS.TEAM_ID]);
    return [id, getCoordinatorRepositoryStatus_(repoUrlMap[id])];
  }));
  const logRows = deferAssessments ? [] : measure('historical_logs', () => readLogEntries_());

  const rosterByTeamId = groupBy_(rosterRows, r => r[TR.TEAM_ID]);
  const logsByTeam = groupBy_(logRows, r => r.teamId);

  // Stats
  const total = statusRows.length;
  const titleApproved = statusRows.filter(r => textEquals_(r[TS.REVIEWER_DECISION], 'Approved')).length;
  const reposReady = statusRows.filter(r => repoUrlMap[normalizeText_(r[TS.TEAM_ID])]).length;

  let schedule = null;
  try { schedule = measure('schedule', () => getProjectSchedule_()); } catch (err) { /* Configuration card provides recovery. */ }
  const clock = schedule ? getProjectClock_(schedule) : null;

  const guideEvaluation = deferAssessments ? {available:false,completed:0,teams:{}} : measure('guide_evaluation', () => guideCompletion_());
  // Review completion
  let reviewCompletion = {}, reviews = [];
  try { reviews = measure('review_definitions', () => getInternalReviews_()); if (!deferAssessments) reviewCompletion = measure('review_completion', () => getAllReviewCompletionStatus_(reviewTimings)); } catch (err) { /* Keep unrelated dashboard sections available. */ }
  const reviewStats = Object.fromEntries(reviews.map(review => [review.key, {
    completed:statusRows.filter(row => reviewCompletion[normalizeText_(row[TS.TEAM_ID])]?.[review.key]?.completed === true).length,
    unavailable:statusRows.filter(row => !reviewCompletion[normalizeText_(row[TS.TEAM_ID])]?.[review.key] || reviewCompletion[normalizeText_(row[TS.TEAM_ID])][review.key].available === false).length,
    total
  }]));
  const healthByTeam = Object.create(null);
  const logSummaryByTeam = Object.create(null);
  statusRows.forEach(r => {
    const id = normalizeText_(r[TS.TEAM_ID]);
    if (!deferAssessments && schedule && clock) logSummaryByTeam[id] = getTeamLogWeekSummary_(r, TS, logsByTeam[id] || [], schedule, clock);
    healthByTeam[id] = deferAssessments ? {health:'loading', severity:'low', issue:'', daysOverdue:0} : assessProjectTeam_(r, TS, repoUrlMap[id], logsByTeam[id] || [], reviewCompletion[id], schedule, clock, logSummaryByTeam[id], githubByTeam[id]);
  });
  const needsAttention = Object.values(healthByTeam).filter(h => h.health === 'attention').length;


  // Team tracker data
  const teamTrackerData = statusRows.map(r => {
    const teamId = normalizeText_(r[TS.TEAM_ID]);
    const teamReview =
      reviewCompletion[teamId] || {};
    const rosterRow = rosterByTeamId[normalizeText_(r[TS.TEAM_ID])] ? rosterByTeamId[normalizeText_(r[TS.TEAM_ID])][0] : null;
    const guide = rosterRow ? rosterRow[TR.GUIDE_NAME] : '—';

    return {
      teamId: r[TS.TEAM_ID],
      guide,
      emailRecipients:[...new Set(['GUIDE_EMAIL','S1_EMAIL','S2_EMAIL','S3_EMAIL','S4_EMAIL'].map(key => String((rosterRow && rosterRow[TR[key]]) || r[TS[key]] || '').trim().toLowerCase()).filter(email => /^[^\s@,;:?&#]+@[^\s@,;:?&#]+\.[^\s@,;:?&#]+$/.test(email)))],
      title: r[TS.TITLE],
      registerNumbers: [1,2,3,4].map(number => String(r[TS['S' + number + '_REGNO']] || '').trim()).filter(Boolean),
      titleStatus: getTeamStatus_(r),
      repoStatus: githubByTeam[teamId].ready ? 'ready' : 'pending',
      githubMessage: githubByTeam[teamId].message,
      githubTiming: '',
      repoUrl: repoUrlMap[normalizeText_(r[TS.TEAM_ID])],
      guideEvaluation:deferAssessments ? 'Loading…' : !guideEvaluation.available ? 'Unavailable' : guideEvaluation.teams[teamId] ? 'Completed' : 'Pending',
      reviews:Object.fromEntries(reviews.map(review => [review.key, deferAssessments ? 'Loading…' : !teamReview[review.key] || teamReview[review.key].available === false ? 'Unavailable' : teamReview[review.key].completed ? 'Completed' : 'Pending'])),
      health: healthByTeam[normalizeText_(r[TS.TEAM_ID])].health,
    };
  });

  const result = {
    stats: { loading:!!deferAssessments, total, titleApproved, reposReady, reviews:reviewStats, needsAttention, guideEvaluation },
    teamTrackerData
  };
  if (timings) {
    const measuredMs = timings.reduce((sum, item) => sum + item.durationMs, 0);
    timings.push({phase:'aggregation_and_other', durationMs:Math.max(0, Date.now() - dataStarted - measuredMs), success:true});
    timings.push(...reviewTimings, ...repositoryTimings);
  }
  return result;
}

function loadCoordinatorDrawerSection_(teamId, section) {
  return coordinatorRead_('drawer-' + section, () => {
    if (!['basic','progress','activity'].includes(section)) throw new Error('Unknown drawer section.');
    return getCoordinatorTeamDetails_(teamId, section);
  });
}

function getCoordinatorTeamDetails_(teamId, section) {
  teamId = String(teamId || '').trim();
  if (!teamId) throw new Error('Team ID is required.');

  const TS = getColumnMap_(
    SHEET_NAMES.TEAM_STATUS,
    FIELD_DEFINITIONS.TEAM_STATUS
  );

  const TR = section === 'progress' || section === 'activity' ? {} : getColumnMap_(
    SHEET_NAMES.TEAM_ROSTER,
    FIELD_DEFINITIONS.TEAM_ROSTER
  );

  const statusRows = getSheetRows_(SHEET_NAMES.TEAM_STATUS);
  const rosterRows = section === 'progress' || section === 'activity' ? [] : getSheetRows_(SHEET_NAMES.TEAM_ROSTER);

  const statusRow = statusRows.find(function(r) {
    return textEquals_(r[TS.TEAM_ID], teamId);
  });

  if (!statusRow) {
    throw new Error('Team ' + teamId + ' was not found.');
  }

  if (section === 'activity') {
    const context = weeklyActivityContext_();
    const activity = getTeamWeeklyActivity_(teamId, context)[normalizeText_(teamId)];
    return {weekLogs:activity.logs === null ? 'Unavailable' : activity.logs,
      weekCommits:activity.commits === null ? 'Unavailable' : activity.commits};
  }
  if (section === 'progress') {
    const reviews = getTeamReviewCompletionStatus_(teamId) || {};
    const context = weeklyActivityContext_();
    const logs = readLogEntries_(teamId);
    const progressRepoUrl = getRepoUrlForTeam_(teamId);
    const progressSetup = getCoordinatorRepositoryStatus_(progressRepoUrl);
    return {
      titleStatus:getTeamStatus_(statusRow), guideDecision:String(statusRow[TS.GUIDE_DECISION] || ''),
      reviewerDecision:String(statusRow[TS.REVIEWER_DECISION] || ''),
      repoStatus:progressSetup.message,
      health:assessProjectTeam_(statusRow, TS, progressRepoUrl, logs, reviews, context.schedule, context.clock, null, progressSetup).health,
      reviews:getInternalReviews_().map(review => ({label:review.label, available:!!reviews[review.key] && reviews[review.key].available !== false, completed:!!reviews[review.key]?.completed}))
    };
  }

  const rosterRow = rosterRows.find(function(r) {
    return textEquals_(r[TR.TEAM_ID], teamId);
  });

  const repoUrl = getRepoUrlForTeam_(teamId);
  const githubSetup = getCoordinatorRepositoryStatus_(repoUrl);

  // -----------------------------
  // Students
  // -----------------------------
  const students = [];

  for (let i = 1; i <= 4; i++) {
    const nameKey = 'S' + i + '_NAME';
    const regKey = 'S' + i + '_REGNO';
    const emailKey = 'S' + i + '_EMAIL';

    const name = rosterRow
      ? rosterRow[TR[nameKey]]
      : statusRow[TS[nameKey]];

    const regNo = rosterRow
      ? rosterRow[TR[regKey]]
      : statusRow[TS[regKey]];

    const email = rosterRow
      ? rosterRow[TR[emailKey]]
      : statusRow[TS[emailKey]];

    if (name || regNo || email) {
      students.push({
        name: String(name || '').trim(),
        regNo: String(regNo || '').trim(),
        email: String(email || '').trim()
      });
    }
  }

  // -----------------------------
  // Committee
  // -----------------------------
  const committeeNumber =
    statusRow[TS.COMMITTEE_NUMBER] ||
    (rosterRow ? rosterRow[TR.COMMITTEE_NUMBER] : '');

  const committeeInfo = getCommitteeInfo_(committeeNumber);

  const reviewers = [];

  if (committeeInfo) {
    for (let i = 1; i <= 4; i++) {
      const name = committeeInfo['reviewer' + i + 'Name'];
      const email = committeeInfo['reviewer' + i + 'Email'];

      if (name || email) {
        reviewers.push({
          name: String(name || '').trim(),
          email: String(email || '').trim()
        });
      }
    }
  }

  // -----------------------------
  // Review completion
  // -----------------------------
  const teamReview = section === 'basic' ? {} : getTeamReviewCompletionStatus_(teamId) || {};
  // -----------------------------
  // Weekly activity
  // -----------------------------
  const logs = section === 'basic' ? [] : readLogEntries_(teamId);
  const context = section === 'basic' ? {} : weeklyActivityContext_();
  const schedule = context.schedule, clock = context.clock;
  const activity = section === 'basic' ? {logs:null, commits:null} : getTeamWeeklyActivity_(teamId, context, logs)[normalizeText_(teamId)];
  const weekLogs = activity.logs === null ? 'Unavailable' : activity.logs;
  const weekCommits = activity.commits === null ? 'Unavailable' : activity.commits;

  const health = assessProjectTeam_(statusRow, TS, repoUrl, logs, teamReview, schedule, clock, null, githubSetup).health;

  return {
    teamId: teamId,

    title: String(statusRow[TS.TITLE] || '').trim(),
    problem: String(statusRow[TS.PROBLEM] || '').trim(),

    guideName: String(
      rosterRow
        ? rosterRow[TR.GUIDE_NAME]
        : statusRow[TS.GUIDE_NAME] || ''
    ).trim(),

    guideEmail: String(
      rosterRow
        ? rosterRow[TR.GUIDE_EMAIL]
        : statusRow[TS.GUIDE_EMAIL] || ''
    ).trim(),

    students: students,

    committeeNumber: String(committeeNumber || '').trim(),
    reviewers: reviewers,

    titleStatus: getTeamStatus_(statusRow),
    guideDecision: String(statusRow[TS.GUIDE_DECISION] || '').trim(),
    reviewerDecision: String(statusRow[TS.REVIEWER_DECISION] || '').trim(),

    repoUrl: repoUrl || '',
    repoStatus: githubSetup.message,

    weekLogs: weekLogs,
    weekCommits: weekCommits,

    reviews:(section === 'basic' ? [] : getInternalReviews_()).map(review => ({label:review.label, available:!!teamReview[review.key] && teamReview[review.key].available !== false, completed:!!teamReview[review.key]?.completed})),

    health: health
  };
}
// ===================================================================
// HELPER FUNCTIONS
// ===================================================================
/** Evaluate deadlines once per team; commits never substitute for required logs. */
function assessProjectTeam_(row, columns, repoUrl, logs, review, schedule, clock, logSummary, githubSetup) {
  if (!schedule || !clock) return {health:"monitor", severity:"low", issue:"Schedule unavailable; check configuration", daysOverdue:0};
  const issues = [];
  function overdue(due, complete, label) {
    if (!complete && clock.today > due) issues.push({ issue:label, daysOverdue:clock.today - due });
  }
  const hasMembers = ['S1_EMAIL','S2_EMAIL','S3_EMAIL','S4_EMAIL'].some(key => row[columns[key]]);
  overdue(schedule.formation, hasMembers, 'Team formation overdue');
  githubSetup = githubSetup || getTeamGithubSetup_(row[columns.TEAM_ID], { row, columns, repoUrl });
  const timing = githubSetup.repositoryOnly
    ? {state:githubSetup.ready ? 'recorded' : clock.today > schedule.formation ? 'overdue' : 'pending', text:githubSetup.message}
    : githubSubmissionTiming_(githubSetup, schedule, clock);
  overdue(schedule.formation, timing.state !== 'overdue', githubSetup.repositoryOnly ? 'Repository URL missing' : 'GitHub username submissions overdue');
  overdue(schedule.title, textEquals_(row[columns.REVIEWER_DECISION], 'Approved'), 'Title approval overdue');
  for (const {key,label,day} of schedule.reviews) {
    if (review && review[key] && review[key].available !== false) overdue(day, review[key].completed, label + ' marks overdue');
  }
  const weeks = logSummary || getTeamLogWeekSummary_(row, columns, logs, schedule, clock);
  if (weeks.missing) issues.push({ issue:weeks.missing + ' student weekly log(s) overdue', daysOverdue:clock.today - weeks.firstMissingDue });
  issues.sort((a,b) => b.daysOverdue - a.daysOverdue);
  if (issues.length) return { health:'attention', severity:issues[0].daysOverdue >= 14 ? 'high' : issues[0].daysOverdue >= 7 ? 'medium' : 'low',
    issue:issues.map(item => item.issue).join('; '), daysOverdue:issues[0].daysOverdue };
  const unavailable = schedule.reviews.some(({key}) => !review || !review[key] || review[key].available === false);
  const pending = unavailable || !githubSetup.ready || timing.state === 'unknown' || !textEquals_(row[columns.REVIEWER_DECISION], 'Approved') || (weeks.active && !weeks.currentLogged);
  return { health:pending ? 'monitor' : 'ontrack', severity:'low', issue:!githubSetup.ready ? githubSetup.message : timing.state === 'late' || timing.state === 'unknown' ? timing.text : '', daysOverdue:0 };
}


// ===================================================================
// CONTENT BUILDERS
// ===================================================================


function getCoordinatorCommitteeConfiguration_() {
  const email=Session.getActiveUser().getEmail();
  if(!email||(!emailsMatch_(email,getCoordinatorEmail_())&&!emailsMatch_(email,getConfig_('CELL_PD_EMAIL'))))throw new Error('Coordinator access is required.');
  return withDashboardRead_(()=>{
    const issues=[],links={},checkedAt=new Date().toISOString();let committees=[];
    try {
      const committeeSheet=getSheet_(SHEET_NAMES.REVIEW_COMMITTEE),teamSheet=getSheet_(SHEET_NAMES.TEAM_STATUS);
      for(const [key,sheet] of [['committees',committeeSheet],['assignments',teamSheet]])if(sheet)links[key]='https://docs.google.com/spreadsheets/d/'+getSpreadsheetId_()+'/edit#gid='+sheet.getSheetId();
      if(!committeeSheet)return {valid:false,state:'definitions-missing',summary:'Review committee configuration required',issues:[{message:'The ReviewCommittee tab is missing.'}],committees,links,checkedAt};
      const RC=getColumnMap_(SHEET_NAMES.REVIEW_COMMITTEE,FIELD_DEFINITIONS.REVIEW_COMMITTEE);
      const rows=getSheetRows_(SHEET_NAMES.REVIEW_COMMITTEE);
      const TS=getColumnMap_(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
      const teams=getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row=>row[TS.TEAM_ID]);
      committees=buildCommitteeData_(rows,teams,RC,TS);
      if(!committees.length)issues.push({message:'No review committees configured. Add committee numbers and reviewer email addresses in ReviewCommittee.'});
      committees.filter(c=>!c.members.some(m=>m.email.trim())).forEach(c=>issues.push({message:'Committee '+c.number+' has no reviewer email addresses.'}));
      const valid=!issues.length;
      return {valid,state:valid?'ready':committees.length?'invalid':'definitions-empty',summary:valid?'Review committees configured':committees.length?'Configuration needs attention':'Review committee configuration required',issues,committees,links,checkedAt};
    }catch(err){return {valid:false,state:'invalid',summary:'Configuration needs attention',issues:[{message:err.message}],committees,links,checkedAt};}
  });
}


function buildCommitteeData_(committeeRows, statusRows, RC, TS) {
  return committeeRows.filter(row => String(row[RC.COMMITTEE_NUMBER] || '').trim()).map(row => ({
      number:String(row[RC.COMMITTEE_NUMBER]).trim(),
      members:[1,2,3,4].map(index => ({name:String(row[RC['REVIEWER' + index + '_NAME']] || '').trim(), email:String(row[RC['REVIEWER' + index + '_EMAIL']] || '').trim()})).filter(member => member.name || member.email),
      teams:statusRows.filter(team => textEquals_(team[TS.COMMITTEE_NUMBER], row[RC.COMMITTEE_NUMBER])).map(team => String(team[TS.TEAM_ID]))
    })).sort((a,b) => a.number.localeCompare(b.number, undefined, {numeric:true}));
}


