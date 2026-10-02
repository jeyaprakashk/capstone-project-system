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

function getCoordinatorDashboardData() {
  return coordinatorRead_('core', getCoordinatorDashboardData_);
}

function getCoordinatorRepositoryStatus_(repoUrl) {
  const ready = !!String(repoUrl || '').trim();
  return {repositoryOnly:true, ready, message:ready ? 'Repository URL recorded' : 'Repository URL missing'};
}

function getCoordinatorDashboardData_(deferAssessments, skipAccess, timings) {
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
  const TS = measure('status_columns', () => getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS));
  const TR = measure('roster_columns', () => getColumnMap(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER));
  const RC = skipAccess ? {} : measure('committee_columns', () => getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE));

  const statusRows = measure('status_rows', () => getSheetRows(SHEET_NAMES.TEAM_STATUS)).filter(r => r[TS.TEAM_ID]);
  const rosterRows = measure('roster_rows', () => getSheetRows(SHEET_NAMES.TEAM_ROSTER));
  const committeeRows = skipAccess ? [] : measure('committee_rows', () => getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE));
  const repoUrlMap = measure('repository_map', () => getRepoUrlMap(repositoryTimings));
  const githubByTeam = Object.fromEntries(statusRows.map(row => {
    const id = normalizeText_(row[TS.TEAM_ID]);
    return [id, getCoordinatorRepositoryStatus_(repoUrlMap[id])];
  }));
  const logRows = deferAssessments ? [] : measure('historical_logs', () => readLogEntries_());

  const rosterByTeamId = groupBy(rosterRows, r => r[TR.TEAM_ID]);
  const logsByTeam = groupBy(logRows, r => r.teamId);

  // Stats
  const total = statusRows.length;
  const titleApproved = statusRows.filter(r => textEquals_(r[TS.REVIEWER_DECISION], 'Approved')).length;
  const reposReady = statusRows.filter(r => repoUrlMap[normalizeText_(r[TS.TEAM_ID])]).length;

  let schedule = null;
  try { schedule = measure('schedule', () => getProjectSchedule_()); } catch (err) { /* Configuration card provides recovery. */ }
  const clock = schedule ? getProjectClock_(schedule) : null;
  const activeThisWeek = null; // Filled by the independent activity request.

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


  const stages = {
    setup:{completed:Object.values(githubByTeam).filter(setup => setup.ready).length,total}, titleApproval:{completed:titleApproved,total},
    ...reviewStats, guideEval:{completed:0,total}
  };
  const assessmentProgress = {
    ...Object.fromEntries(reviews.map(review => [review.key, {
      completed:reviewStats[review.key].completed, pending:total - reviewStats[review.key].completed - reviewStats[review.key].unavailable, unavailable:reviewStats[review.key].unavailable
    }])),
    guideEval:{completed:0,pending:total}
  };

  // Needs attention teams
  const needsAttentionTeams = statusRows
    .map(r => ({
      row: r,
      status: getTeamStatus(r),
      health: healthByTeam[normalizeText_(r[TS.TEAM_ID])].health,
      severity: healthByTeam[normalizeText_(r[TS.TEAM_ID])].severity,
      issue: healthByTeam[normalizeText_(r[TS.TEAM_ID])].issue,
      daysOverdue: healthByTeam[normalizeText_(r[TS.TEAM_ID])].daysOverdue,
      repoUrl: repoUrlMap[normalizeText_(r[TS.TEAM_ID])]
    }))
    .filter(t => t.health === 'attention')
    .sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

  // Team tracker data
  const teamTrackerData = statusRows.map(r => {
    const teamId = normalizeText_(r[TS.TEAM_ID]);
    const teamReview =
      reviewCompletion[teamId] || {};
    const rosterRow = rosterByTeamId[normalizeText_(r[TS.TEAM_ID])] ? rosterByTeamId[normalizeText_(r[TS.TEAM_ID])][0] : null;
    const guide = rosterRow ? rosterRow[TR.GUIDE_NAME] : '—';
    const committee = r[TS.COMMITTEE_NUMBER];
    const deadlineEvents = deferAssessments ? [] : getTeamDeadlineEvents_(r, TS, repoUrlMap[teamId], logsByTeam[teamId] || [], teamReview, schedule, clock, logSummaryByTeam[teamId], githubByTeam[teamId]);

    return {
      teamId: r[TS.TEAM_ID],
      guide,
      emailRecipients:[...new Set(['GUIDE_EMAIL','S1_EMAIL','S2_EMAIL','S3_EMAIL','S4_EMAIL'].map(key => String((rosterRow && rosterRow[TR[key]]) || r[TS[key]] || '').trim().toLowerCase()).filter(email => /^[^\s@,;:?&#]+@[^\s@,;:?&#]+\.[^\s@,;:?&#]+$/.test(email)))],
      title: r[TS.TITLE],
      registerNumbers: [1,2,3,4].map(number => String(r[TS['S' + number + '_REGNO']] || '').trim()).filter(Boolean),
      titleStatus: getTeamStatus(r),
      repoStatus: githubByTeam[teamId].ready ? 'ready' : 'pending',
      githubMessage: githubByTeam[teamId].message,
      githubTiming: '',
      repoUrl: repoUrlMap[normalizeText_(r[TS.TEAM_ID])],
      deadlineEvents,
      pendingDeadlines:deadlineEvents.filter(event => !event.complete && clock && clock.today >= event.due - DEADLINE_PILL_LEAD_DAYS_).map(event => event.key),
      weeklyActivity: null,
      guideEvaluation:deferAssessments ? 'Loading…' : !guideEvaluation.available ? 'Unavailable' : guideEvaluation.teams[teamId] ? 'Completed' : 'Pending',
      reviews:Object.fromEntries(reviews.map(review => [review.key, deferAssessments ? 'Loading…' : !teamReview[review.key] || teamReview[review.key].available === false ? 'Unavailable' : teamReview[review.key].completed ? 'Completed' : 'Pending'])),
      outcome: healthByTeam[normalizeText_(r[TS.TEAM_ID])].health,
      health: healthByTeam[normalizeText_(r[TS.TEAM_ID])].health,
      committee,
      row: r
    };
  });

  // GitHub coordinator access info
  const coordUsername = String(
    skipAccess ? '' : getConfig('COLLABORATOR_GITHUB_USERNAME')
  ).trim();

  const reposWithAccess = Number(
    skipAccess ? 0 : getConfig('COLLABORATOR_REPOS_ACCESS')
  ) || 0;

  const totalRepos = reposReady;

  const result = {
    stats: { loading:!!deferAssessments, total, titleApproved, reposReady, activeThisWeek, reviews:reviewStats, needsAttention, guideEvaluation },
    stages,
    assessmentProgress,
    needsAttentionTeams,
    teamTrackerData,
    deadlinePills:buildDeadlinePills_(teamTrackerData.map(team => team.deadlineEvents), clock ? clock.today : null),
    committees:buildCommitteeData_(committeeRows, statusRows, RC, TS),
    githubAccess: { coordUsername, reposWithAccess, totalRepos }
  };
  if (timings) {
    const measuredMs = timings.reduce((sum, item) => sum + item.durationMs, 0);
    timings.push({phase:'aggregation_and_other', durationMs:Math.max(0, Date.now() - dataStarted - measuredMs), success:true});
    timings.push(...reviewTimings, ...repositoryTimings);
  }
  return result;
}
function getCoordinatorTeamDetails(teamId) {
  return coordinatorRead_('team-details', () => getCoordinatorTeamDetails_(teamId));
}

function loadCoordinatorDrawerSection(teamId, section) {
  return coordinatorRead_('drawer-' + section, () => {
    if (!['basic','progress','activity'].includes(section)) throw new Error('Unknown drawer section.');
    return getCoordinatorTeamDetails_(teamId, section);
  });
}

function getCoordinatorTeamDetails_(teamId, section) {
  teamId = String(teamId || '').trim();
  if (!teamId) throw new Error('Team ID is required.');

  const TS = getColumnMap(
    SHEET_NAMES.TEAM_STATUS,
    FIELD_DEFINITIONS.TEAM_STATUS
  );

  const TR = section === 'progress' || section === 'activity' ? {} : getColumnMap(
    SHEET_NAMES.TEAM_ROSTER,
    FIELD_DEFINITIONS.TEAM_ROSTER
  );

  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const rosterRows = section === 'progress' || section === 'activity' ? [] : getSheetRows(SHEET_NAMES.TEAM_ROSTER);

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
    const progressRepoUrl = getRepoUrlForTeam(teamId);
    const progressSetup = getCoordinatorRepositoryStatus_(progressRepoUrl);
    return {
      titleStatus:getTeamStatus(statusRow), guideDecision:String(statusRow[TS.GUIDE_DECISION] || ''),
      reviewerDecision:String(statusRow[TS.REVIEWER_DECISION] || ''),
      repoStatus:progressSetup.message,
      health:assessProjectTeam_(statusRow, TS, progressRepoUrl, logs, reviews, context.schedule, context.clock, null, progressSetup).health,
      reviews:getInternalReviews_().map(review => ({label:review.label, available:!!reviews[review.key] && reviews[review.key].available !== false, completed:!!reviews[review.key]?.completed}))
    };
  }

  const rosterRow = rosterRows.find(function(r) {
    return textEquals_(r[TR.TEAM_ID], teamId);
  });

  const repoUrl = getRepoUrlForTeam(teamId);
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

  const committeeInfo = getCommitteeInfo(committeeNumber);

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

    titleStatus: getTeamStatus(statusRow),
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


function buildGithubAccessSection(githubAccess) {
  return `
    <div class="card">

      <div><div>
        <h3>
          GitHub Access for Coordinator
        </h3>
        <span>
          Configured
        </span></div>
      <button
        id="githubSyncButton"
        class="btn btn-primary"
        onclick="runGithubSync()">
        Run Sync
      </button>
      </div>

      <div>

        <div>
          <span>
            Coordinator GitHub Username
          </span>
          <span>
            ${escapeHtml(githubAccess.coordUsername)}
          </span>
        </div>

        <div>
          <span>
            Repositories with access
          </span>
          <span
            id="githubReposAccess"
           >
            ${githubAccess.reposWithAccess} / ${githubAccess.totalRepos}
          </span>
        </div>

      </div>

    </div>
  `;
}


function buildCommitteeDirectory_(committees) {
  const items = (committees || []).map(committee => {
    return `<details class="committee-item tile" data-committee-key="${escapeHtml(normalizeText_(committee.number))}">
      <summary><span>Committee ${escapeHtml(committee.number)}<small>${committee.members.length} reviewers · ${committee.teams.length} teams</small></span><span aria-hidden="true" class="committee-chevron">${renderLucideIcon_('chevron-down')}</span></summary>
      <div><ul>${committee.members.length ? committee.members.map((member, index) => `<li><span class="avatar avatar-${index % 3 + 1} " aria-hidden="true">${escapeHtml((member.name || member.email).slice(0,1).toUpperCase())}</span><div><strong>${escapeHtml(member.name || 'Name not provided')}</strong><span>${escapeHtml(member.email || 'Email not provided')}</span></div></li>`).join('') : '<li>No reviewers assigned.</li>'}</ul>
      <div><span>Assigned teams</span><div>${committee.teams.length ? committee.teams.map(team => `<span>${escapeHtml(team)}</span>`).join('') : 'No teams assigned'}</div></div></div>
    </details>`;
  }).join('');
  return `<div id="committeeReadinessGrid">${items}</div>`;
}

function buildCommitteeReadinessCard_() {
  return `<section id="committeeConfigurationCard" class="card" aria-labelledby="committeeConfigurationHeading" aria-busy="true">
    <div><div><h3 id="committeeConfigurationHeading">Review Committees</h3><span id="committeeConfigurationSummary" role="status" aria-live="polite">${getSkeletonMarkup_('inline','Checking review committees')}</span></div><button class="btn btn-sm btn-outline" id="committeeConfigurationRecheck" type="button" onclick="DashboardUI.recheckCommitteeConfiguration()">Recheck</button></div>
    <ul id="committeeConfigurationIssues" hidden></ul>
    <p>Select a committee to see reviewers and assigned teams.</p>
    <div id="committeeDirectoryContent"></div>
    <div><a id="committeeConfigLink" hidden target="_blank" rel="noopener">Review committees ${renderLucideIcon_('external-link')}</a><a id="committeeAssignmentsLink" hidden target="_blank" rel="noopener">Team assignments ${renderLucideIcon_('external-link')}</a><span id="committeeConfigurationCheckedAt"></span></div>
  </section>`;
}

function getCoordinatorCommitteeConfiguration() {
  const email=Session.getActiveUser().getEmail();
  if(!email||(!emailsMatch(email,getCoordinatorEmail())&&!emailsMatch(email,getConfig('CELL_PD_EMAIL'))))throw new Error('Coordinator access is required.');
  return withDashboardRead_(()=>{
    const issues=[],links={},checkedAt=new Date().toISOString();let committees=[];
    try {
      const committeeSheet=getSheet(SHEET_NAMES.REVIEW_COMMITTEE),teamSheet=getSheet(SHEET_NAMES.TEAM_STATUS);
      for(const [key,sheet] of [['committees',committeeSheet],['assignments',teamSheet]])if(sheet)links[key]='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit#gid='+sheet.getSheetId();
      if(!committeeSheet)return {valid:false,state:'definitions-missing',summary:'Review committee configuration required',issues:[{message:'The ReviewCommittee tab is missing.'}],committees,html:buildCommitteeDirectory_(committees),links,checkedAt};
      const RC=getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE,FIELD_DEFINITIONS.REVIEW_COMMITTEE);
      const rows=getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE);
      const TS=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
      const teams=getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row=>row[TS.TEAM_ID]);
      committees=buildCommitteeData_(rows,teams,RC,TS);
      if(!committees.length)issues.push({message:'No review committees configured. Add committee numbers and reviewer email addresses in ReviewCommittee.'});
      committees.filter(c=>!c.members.some(m=>m.email.trim())).forEach(c=>issues.push({message:'Committee '+c.number+' has no reviewer email addresses.'}));
      const valid=!issues.length;
      return {valid,state:valid?'ready':committees.length?'invalid':'definitions-empty',summary:valid?'Review committees configured':committees.length?'Configuration needs attention':'Review committee configuration required',issues,committees,html:buildCommitteeDirectory_(committees),links,checkedAt};
    }catch(err){return {valid:false,state:'invalid',summary:'Configuration needs attention',issues:[{message:err.message}],committees,html:buildCommitteeDirectory_(committees),links,checkedAt};}
  });
}

function buildReviewConfigurationCard_() {
  return `<section id="reviewConfigurationCard" class="card" aria-labelledby="reviewConfigurationHeading" aria-busy="true">
    <div><div><h3 id="reviewConfigurationHeading">Assessment readiness</h3><span id="reviewConfigurationSummary" role="status" aria-live="polite">${getSkeletonMarkup_('inline', 'Checking assessment readiness')}</span></div><button class="btn btn-sm btn-outline" id="reviewConfigurationRecheck" type="button" onclick="recheckReviewConfiguration()">Recheck</button></div>
    <ul id="reviewConfigurationIssues" hidden></ul>
    <button class="btn btn-outline" type="button" id="createAssessmentDefinitionsButton" hidden disabled onclick="DashboardUI.bootstrapAssessmentDefinitions()">Create assessment definitions tab</button>
    <p>First create the definitions schema, then use Assessment definitions to enter the academic configuration. Setup never supplies assessment instances or policy choices.</p>
    <ul id="reviewAssessmentReadiness" aria-label="Readiness by assessment"></ul>
    <p>Storage readiness is separate from team entry availability, which also checks reviewer assignment, opening dates and prerequisites.</p>
    <div id="assessmentStorageSetup">
    <div>
      <p>Prepare configured assessment journals. Existing assessment data stays unchanged.</p>
      <button type="button" id="initializeAssessmentStorageButton" disabled aria-describedby="reviewConfigurationSummary" class="btn btn-primary" onclick="initializeAssessmentStorage()">Create missing assessment storage</button>
    </div>
    <p id="assessmentStorageStatus" role="status" aria-live="polite"></p><ul id="assessmentStorageResults"></ul>
    </div>
    <div id="weeklyPhase2Setup">
      <h4>Weekly progress setup</h4>
      <div data-weekly-setup-read>${getSkeletonMarkup_('status','Checking weekly progress setup')}</div>
      <p data-weekly-setup-status role="status" aria-live="polite"></p>
    </div>
    <div><a id="reviewDefinitionsLink" hidden target="_blank" rel="noopener">Assessment definitions ${renderLucideIcon_('external-link')}</a><a id="reviewConfigLink" hidden target="_blank" rel="noopener">Milestones ${renderLucideIcon_('external-link')}</a><a id="reviewRubricsLink" hidden target="_blank" rel="noopener">Rubric criteria ${renderLucideIcon_('external-link')}</a><span id="reviewConfigurationCheckedAt"></span></div>
  </section>`;
}


function buildCommitteeData_(committeeRows, statusRows, RC, TS) {
  return committeeRows.filter(row => String(row[RC.COMMITTEE_NUMBER] || '').trim()).map(row => ({
      number:String(row[RC.COMMITTEE_NUMBER]).trim(),
      members:[1,2,3,4].map(index => ({name:String(row[RC['REVIEWER' + index + '_NAME']] || '').trim(), email:String(row[RC['REVIEWER' + index + '_EMAIL']] || '').trim()})).filter(member => member.name || member.email),
      teams:statusRows.filter(team => textEquals_(team[TS.COMMITTEE_NUMBER], row[RC.COMMITTEE_NUMBER])).map(team => String(team[TS.TEAM_ID]))
    })).sort((a,b) => a.number.localeCompare(b.number, undefined, {numeric:true}));
}

function buildRubricsStatusCard_() {
  const status = getRubricsStatus_();
  const count = (status.assessments || []).length;
  return `<section class="rubrics-status-card card" aria-labelledby="rubricsStatusHeading">
    <div><div><h3 id="rubricsStatusHeading">Rubrics</h3>
      <span data-configured="${status.configured}" role="status">${status.configured?'Configured':'Not configured'}</span></div></div>
    ${count ? '<p>'+count+' '+(count===1?'assessment':'assessments')+'</p>' : ''}
    ${status.configured ? '' : '<p>'+escapeHtml(status.detail)+'</p>'}
    ${(status.assessments || []).length ? '<dl>'+status.assessments.map(item=>'<div><dt>'+escapeHtml(item.label)+'</dt><dd>'+escapeHtml(item.summary)+'</dd></div>').join('')+'</dl>' : ''}
  </section>`;
}

function loadCoordinatorSystemStatus() {
  return coordinatorRead_('system-status', () => {
    const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]);
    const repos = getRepoUrlMap();
    const access = {coordUsername:String(getConfig('COLLABORATOR_GITHUB_USERNAME') || '').trim(),
      reposWithAccess:Number(getConfig('COLLABORATOR_REPOS_ACCESS')) || 0,
      totalRepos:rows.filter(row => repos[normalizeText_(row[TS.TEAM_ID])]).length};
    let publishing;
    try {publishing=publicationDefinitions_().map(d=>buildInternalAssessmentPublishing_(d.key)).join('');}
    catch(err){publishing='<p role="status">Assessment configuration needs attention. Use Assessment readiness below.</p>';}
    return `<div data-status-cards>
      <div data-status-primary>${buildGithubAccessSection(access)}
      <section class="card" id="studentInvitationResend">
        <h3>Student GitHub invitations</h3>
        <p>Renew expired or missing invitations for students in existing team repositories. Joined students and pending invitations are skipped.</p>
        <button type="button" class="btn btn-primary" onclick="DashboardUI.runStudentInvitationResend()">Resend expired student invitations</button>
        <p data-resend-status role="status" aria-live="polite"></p>
        <details data-resend-log hidden>
          <summary>View student invitation log</summary>
          <div data-resend-results data-tooltip-boundary class="tracker-table-scroll table-wrap" role="region" aria-label="Student invitation results" tabindex="0"></div>
          ${buildTeamPagination_('studentInvitations', 'invitations', 0, 'students')}
        </details>
      </section>
      </div>
      ${publishing}
      ${buildCommitteeReadinessCard_()}
      ${buildReviewConfigurationCard_()}
      </div>`;
  });
}
