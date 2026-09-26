/**
 * COORDINATOR DASHBOARD — PRODUCTION GRADE
 * Comprehensive oversight of all teams, semester progress, assessment tracking
 * Features: Stats, pipeline, needs attention, assessment progress, team tracker, team detail panel
 * Shared deployment via guide-dashboard.gs doGet()
 */

function coordinatorRead_(operation, read) {
  const started = Date.now();
  let success = false;
  try {
    return withDashboardRead_(() => {
      const email = Session.getActiveUser().getEmail();
      if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
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
  const logRows = deferAssessments ? [] : measure('historical_logs', () => readActivityRows_(SHEET_NAMES.RAW_LOG, null, null, 3));

  const rosterByTeamId = groupBy(rosterRows, r => r[TR.TEAM_ID]);
  const logsByTeam = groupBy(logRows, r => r[2]);

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
    ...reviewStats, guideEval:{completed:0,total}, see:{completed:0,total}
  };
  const assessmentProgress = {
    ...Object.fromEntries(reviews.map(review => [review.key, {
      completed:reviewStats[review.key].completed, pending:total - reviewStats[review.key].completed - reviewStats[review.key].unavailable, unavailable:reviewStats[review.key].unavailable
    }])),
    guideEval:{completed:0,pending:total}, see:{completed:0,pending:total}
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
    const logs = readActivityRows_(SHEET_NAMES.RAW_LOG, 3, teamId, 3);
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
  const logs = section === 'basic' ? [] : readActivityRows_(SHEET_NAMES.RAW_LOG, 3, teamId, 3);
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
  const pending = unavailable || !githubSetup.ready || timing.state === 'unknown' || !textEquals_(row[columns.REVIEWER_DECISION], 'Approved') || (clock.active && !weeks.currentLogged);
  return { health:pending ? 'monitor' : 'ontrack', severity:'low', issue:!githubSetup.ready ? githubSetup.message : timing.state === 'late' || timing.state === 'unknown' ? timing.text : '', daysOverdue:0 };
}

function refreshCoordinatorContent() {
  return coordinatorRead_('refresh', buildCoordinatorAsyncShell_);
}

// ===================================================================
// CONTENT BUILDERS
// ===================================================================
function buildCoordinatorHeaderStats(stats) {
  let reviews = [];
  try { reviews = getInternalReviews_(); } catch (err) { /* System Status reports configuration problems. */ }
  const pct = n => stats.total > 0 ? Math.round(n / stats.total * 100) : 0;
  const skeleton = label => getSkeletonMarkup_('inline', label);
  const completionTone = (value, color, note) => {
    if (!stats.total || typeof value !== 'number' || /unavailable/i.test(note)) return 'neutral';
    const remaining = color === 'red' ? value : stats.total - value;
    return remaining <= 0 ? 'complete' : remaining / stats.total >= .6 ? 'danger' : remaining / stats.total >= .3 ? 'warning' : 'neutral';
  };
  const card = (label, value, color, note, icon, detail, ids) => `<div class="stat-card stat-card-${color}" data-completion-tone="${completionTone(value, color, note)}">
    <div class="stat-label">${label}</div>${renderLucideIcon_(icon, '', 'stat-icon')}
    <div class="stat-header"><div class="stat-num"${ids ? ' id="coordinatorActiveTeams"' : ''}>${value}</div><div class="stat-pct"${ids ? ' id="coordinatorActiveTeamsPct"' : ''}>${note}</div></div>
    <div class="stat-detail">${detail}</div></div>`;
  const progress = (value, color, left, right) => `<div class="stat-track" aria-hidden="true"><span style="width:${pct(value)}%;background:var(--color-success,${color})"></span></div><div class="stat-detail-row"><span>${left}</span><span${value < stats.total ? ' class="stat-outstanding"' : ''}>${right}</span></div>`;
  const repos = stats.reposReady || 0, approved = stats.titleApproved || 0;
  return `<div class="coord-stats coordinator-stats-grid">
    ${card('Total Teams', stats.total, 'blue', 'Teams Roster', 'users', '<span class="stat-registered">●</span> Teams registered')}
    ${card('Repositories Available', repos, 'purple', pct(repos) + '% linked', 'git-branch', progress(repos, '#4338ca', repos + ' / ' + stats.total + ' recorded', Math.max(0, stats.total - repos) + ' missing'))}
    ${card('Title Approved', approved, 'green', pct(approved) + '% validated', 'tag', progress(approved, '#059669', approved + ' approved', Math.max(0, stats.total - approved) + ' pending approval'))}
    ${card('Active This Week', skeleton('Loading activity'), 'orange', skeleton('Loading activity'), 'trending-up', 'Weekly repository activity', true)}
    ${reviews.map((review, index) => {
      const result = stats.reviews && stats.reviews[review.key];
      const value = stats.loading ? skeleton('Loading ' + review.label) : result ? result.completed : '—';
      const note = stats.loading ? '' : !result ? 'Unavailable' : result.unavailable ? result.unavailable + ' unavailable' : pct(result.completed) + '% (' + result.completed + '/' + stats.total + ')';
      return card(escapeHtml(review.label) + ' Completed', value, 'teal', note, ['clipboard-check', 'file-text', 'book-open'][index % 3], 'Team review completion');
    }).join('')}
    ${card('Guide Evaluation Completed', stats.loading ? skeleton('Loading guide evaluation') : stats.guideEvaluation && stats.guideEvaluation.available ? stats.guideEvaluation.completed : '—', 'teal', stats.loading ? '' : stats.guideEvaluation && stats.guideEvaluation.available ? pct(stats.guideEvaluation.completed) + '% evaluated' : 'Unavailable', 'graduation-cap', 'Guide assessment completion')}
    ${card('Need Attention', stats.loading ? skeleton('Loading attention count') : stats.needsAttention, 'red', stats.loading ? '' : pct(stats.needsAttention) + '% of cohort', 'triangle-alert', 'Teams with overdue requirements')}
  </div>`;
}

function buildTeamCompletionProgress(stages) {
  let reviews = [];
  let configurationUnavailable = false;
  try { reviews = getInternalReviews_(); } catch (err) { configurationUnavailable = true; }
  const rows = [{label:'GitHub Setup', stage:stages.setup},
    {label:'Title Approval', stage:stages.titleApproval},
    ...reviews.map(review => ({label:review.label, stage:stages[review.key]})),
    {label:'Guide Evaluation', untracked:true}, {label:'SEE', untracked:true}];
  return `<section class="assessment-section team-progress" aria-labelledby="teamProgressHeading">
    <h2 id="teamProgressHeading" class="assessment-title">Team Progress</h2>
    ${configurationUnavailable ? '<p role="status">Review configuration unavailable. Check System Status.</p>' : ''}
    ${rows.map(({label, stage, untracked}) => {
      const name = escapeHtml(label);
      if (untracked) return `<div class="team-progress-row"><span>${name}</span><span class="team-progress-note">Not tracked</span></div>`;
      if (!stage) return `<div class="team-progress-row"><span>${name}</span><span class="team-progress-note">Unavailable</span></div>`;
      const completed = stage.completed || 0, total = stage.total || 0;
      const percent = total ? Math.round(completed / total * 100) : 0;
      const partial = stage.unavailable > 0;
      const note = partial ? stage.unavailable + ' unavailable · partial data' : total ? percent + '%' : 'No teams';
      return `<div class="team-progress-row"><span>${name}</span>
        <div class="team-progress-detail"><div class="team-progress-track" role="progressbar" aria-label="${name}: ${escapeHtml(note)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div style="width:${percent}%"></div></div>
        <span class="team-progress-note">${note}</span></div><span class="team-progress-count">${completed} / ${total}</span></div>`;
    }).join('')}
  </section>`;
}
function buildNeedsAttentionTable(teams) {
  if (teams.length === 0) return `<div class="needs-attention"><div class="table-title">Needs Attention (0 teams)</div><div class="table-empty">All teams are on track.</div></div>`;

  const rows = teams.slice(0, 11).map((t, idx) => {
    const sev = t.severity === 'high' ? 'high' : t.severity === 'medium' ? 'medium' : 'low';
    const ts = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    return `<tr><td class="col-index">${idx + 1}</td><td class="col-severity"><span class="severity-badge ${sev}">${sev.toUpperCase()}</span></td><td class="col-team">${escapeHtml(t.row[ts.TEAM_ID])}</td><td class="col-issue">${escapeHtml(t.issue)}</td><td class="col-since">${t.daysOverdue} days</td><td class="col-guide">${escapeHtml(t.row[ts.GUIDE_NAME])}</td><td class="col-action"><button type="button" class="link-button action-link" onclick="focusCoordinatorTeam('${escapeHtml(String(t.row[ts.TEAM_ID]))}')">View</button></td></tr>`;
  }).join('');

  return `<div class="needs-attention"><div class="table-title">Needs Attention (${teams.length} teams) <button type="button" class="link-button view-all" onclick="showAllCoordinatorTeams()">View all ${renderLucideIcon_('arrow-right')}</button></div><div class="tracker-table-scroll" role="region" aria-label="Teams needing attention, scroll horizontally for more columns" tabindex="0"><table class="attention-table"><thead><tr><th>#</th><th>Severity</th><th>Team</th><th>Issue</th><th>Overdue</th><th>Guide</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function buildAssessmentProgress(assessmentProgress) {
  let configuredReviews = [];
  try { configuredReviews = getInternalReviews_(); } catch (err) { /* See configuration card. */ }
  const bar = (c, p) => { const pct = c + p > 0 ? Math.round((c / (c + p)) * 100) : 0; return `<div class="assessment-bar"><div class="assessment-bar-inner"><div class="assessment-fill" style="width:${pct}%"></div></div><span class="assessment-pct">${pct}%</span></div>`; };

  return `<div class="assessment-section"><div class="assessment-title">Assessment Progress</div>
    ${configuredReviews.map(review => {
      const progress = assessmentProgress[review.key];
      return `<div class="assessment-row"><div class="assessment-label">${escapeHtml(review.label)}</div>${progress.unavailable ? "<span>Partial data: " + progress.unavailable + " unavailable</span>" : bar(progress.completed, progress.pending)}<div class="assessment-stat">${progress.completed} / ${progress.completed + progress.pending + (progress.unavailable || 0)}</div></div>`;
    }).join('')}
    <div class="assessment-row"><div class="assessment-label">Guide Evaluation</div>${bar(assessmentProgress.guideEval.completed, assessmentProgress.guideEval.pending)}<div class="assessment-stat">${assessmentProgress.guideEval.completed} / ${assessmentProgress.guideEval.completed + assessmentProgress.guideEval.pending}</div></div>
    <div class="assessment-row"><div class="assessment-label">SEE</div>${bar(assessmentProgress.see.completed, assessmentProgress.see.pending)}<div class="assessment-stat">${assessmentProgress.see.completed} / ${assessmentProgress.see.completed + assessmentProgress.see.pending}</div></div>
  </div>`;
}

function buildGithubAccessSection(githubAccess) {
  return `
    <div class="github-section system-status-card">

      <div class="github-header">
        <div class="github-title">
          GitHub Access for Coordinator
        </div>
        <span class="github-status configured">
          Configured
        </span>
      </div>

      <div class="github-info">

        <div class="github-row">
          <span class="github-label">
            Coordinator GitHub Username
          </span>
          <span class="github-value">
            ${escapeHtml(githubAccess.coordUsername)}
          </span>
        </div>

        <div class="github-row">
          <span class="github-label">
            Repositories with access
          </span>
          <span
            id="githubReposAccess"
            class="github-value">
            ${githubAccess.reposWithAccess} / ${githubAccess.totalRepos}
          </span>
        </div>

      </div>

      <button
        class="run-sync-btn"
        onclick="runGithubSync()">
        Run Sync
      </button>

    </div>
  `;
}

function buildCoordinatorTeamActions_(team) {
  const eye = renderLucideIcon_('eye');
  const mail = renderLucideIcon_('mail');
  const label = escapeHtml(String(team.teamId));
  const recipients = team.emailRecipients || [];
  const email = recipients.length
    ? `<a class="team-action-icon" href="${escapeHtml('mailto:' + recipients.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent('Capstone — Team ' + team.teamId))}" aria-label="Email guide and members of team ${label}" title="Email guide and team members">${mail}</a>`
    : `<button type="button" class="team-action-icon" disabled aria-label="No email addresses available for team ${label}" title="No email addresses available">${mail}</button>`;
  return `<div class="team-action-controls"><button type="button" class="team-action-icon" onclick="focusCoordinatorTeam(this.closest('tr').getAttribute('data-team-id'))" aria-label="View team ${label}" title="View team details">${eye}</button>${email}</div>`;
}

function buildCompletionIndicator_(status) {
  if (status === 'Completed') return renderLucideIcon_('check', 'Completed');
  if (status === 'Pending') return renderLucideIcon_('clock', 'Pending');
  if (/^loading/i.test(status || '')) return getSkeletonMarkup_('inline', 'Loading assessment');
  return renderLucideIcon_('triangle-alert', status || 'Unavailable');
}

function buildTeamTrackerTable(teamData, deadlinePills) {
  deadlinePills = deadlinePills || [];
  let configuredReviews = [];
  try { configuredReviews = getInternalReviews_(); } catch (err) { /* See configuration card. */ }
  const attentionCount = teamData.filter(t => t.health === 'attention').length;
  const onTrackCount = teamData.filter(t => t.health === 'ontrack').length;
  const rows = teamData.map(t => {
    const titleBadge = t.titleStatus === 'APPROVED' ? `<span class="status-badge green">${renderLucideIcon_('check', 'Title approved')}</span>` : t.titleStatus === 'NEEDS_REVIEW' ? `<span class="status-badge orange">${renderLucideIcon_('clock', 'Title needs review')}</span>` : t.titleStatus === 'REJECTED_BY_GUIDE' ? `<span class="status-badge red">${renderLucideIcon_('x', 'Title rejected by guide')}</span>` : `<span class="status-badge gray">${renderLucideIcon_('clock', 'Title pending')}</span>`;
    const repoLabel = escapeHtml([t.repoStatus === 'ready' ? 'Repository URL recorded' : 'Pending', t.githubMessage, t.githubTiming, t.repoUrl ? 'Repository available' : ''].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' ? '));
    const repoBadge = t.repoStatus === 'loading' ? getSkeletonMarkup_('inline', 'Checking GitHub setup') : `<span class="status-badge ${t.repoStatus === 'ready' ? 'green' : 'red'}" tabindex="0" role="img" aria-label="${repoLabel}" title="${repoLabel}">${renderLucideIcon_(t.repoStatus === 'ready' ? 'check' : 'x')}</span>`;
    const health = t.health === 'ontrack' ? {color:'green', label:'On track', icon:'check'} : t.health === 'monitor' ? {color:'orange', label:'Monitor', icon:'clock'} : {color:'red', label:'Needs attention', icon:'triangle-alert'};
    const healthBadge = t.health === 'loading' ? getSkeletonMarkup_('inline', 'Loading health') : `<span class="tracker-health ${health.color}" tabindex="0" role="img" aria-label="${health.label}" title="${health.label}">${renderLucideIcon_(health.icon)}</span>`;
    const registers = t.registerNumbers || [];

    return `<tr data-team-id="${escapeHtml(String(t.teamId))}" data-search="${escapeHtml([t.teamId, t.guide, ...registers].join(' ').toLowerCase())}" data-deadlines="${escapeHtml((t.pendingDeadlines || []).join(' '))}" data-health="${escapeHtml(t.health)}" data-title-status="${escapeHtml(t.titleStatus)}" data-repo-status="${escapeHtml(t.repoStatus)}"><td class="col-team"><strong>${escapeHtml(t.teamId)}</strong><div class="tracker-registers">${registers.length ? registers.map(value => escapeHtml(value)).join(', ') : '—'}</div></td><td class="col-guide">${escapeHtml(t.guide)}</td><td class="col-repo">${repoBadge}</td><td class="col-status">${titleBadge}</td><td class="col-activity">${getSkeletonMarkup_('inline', 'Loading weekly activity')}</td>${configuredReviews.map(review => `<td class="col-review">${t.health === 'loading' ? getSkeletonMarkup_('inline', 'Loading ' + review.label) : buildCompletionIndicator_(t.reviews[review.key])}</td>`).join('')}<td class="col-guide-evaluation">${buildCompletionIndicator_(t.guideEvaluation)}</td><td class="col-health">${healthBadge}</td><td class="col-action">${buildCoordinatorTeamActions_(t)}</td></tr>`;
  }).join('');

  return `<div class="team-tracker-section"><div class="tracker-header"><h3 class="assessment-title tracker-title">Team Tracker (${teamData.length} teams)</h3></div>
    <div class="tracker-tabs">
      <button class="tab active" data-filter="all" onclick="filterTeamTracker(this, 'all')">All (${teamData.length})</button>
      <button class="tab" data-filter="attention" ${teamData.some(t => t.health === "loading") ? "disabled" : ""} onclick="filterTeamTracker(this, 'attention')">Attention (${teamData.some(t => t.health === 'loading') ? getSkeletonMarkup_('inline', 'Loading attention count') : attentionCount})</button>
      <button class="tab" data-filter="ontrack" ${teamData.some(t => t.health === "loading") ? "disabled" : ""} onclick="filterTeamTracker(this, 'ontrack')">On Track (${teamData.some(t => t.health === 'loading') ? getSkeletonMarkup_('inline', 'Loading on-track count') : onTrackCount})</button>
      ${deadlinePills.map(pill => `<button class="tab deadline-pill${pill.overdue ? ' deadline-overdue' : ''}" data-filter="deadline:${escapeHtml(pill.key)}" title="Due ${escapeHtml(formatProjectDay_(pill.due))}" onclick="filterTeamTracker(this, this.getAttribute('data-filter'))">${escapeHtml(pill.label)} (${pill.count})</button>`).join('')}
    </div>
    <button type="button" id="weeklyActivityRetry" onclick="loadCoordinatorWeeklyActivity()" hidden>Retry activity</button>
    <div class="tracker-search"><input type="text" id="trackerSearch" aria-label="Search teams by team ID, register number, or guide" placeholder="Search team, register number, or guide…" oninput="filterTrackerSearch()"><button class="reset-btn" onclick="resetTrackerFilters()">Reset</button></div>
    <div class="tracker-table-scroll" role="region" aria-label="Team tracker table, scroll horizontally for more columns" tabindex="0"><table class="team-tracker-table"><thead><tr><th>Team</th><th>Guide</th><th>Repo</th><th>Title</th><th>Weekly Activity</th>${configuredReviews.map(review => `<th class="col-review" title="${escapeHtml(review.label)}">${escapeHtml(review.label.replace(/^Review\s+(\d+)$/i, 'R$1'))}</th>`).join('')}<th>Guide Eval</th><th>Health</th><th>Actions</th></tr></thead><tbody id="trackerBody">${rows}</tbody></table></div>
    ${buildTeamPagination_('tracker', 'coord', teamData.length)}
  </div>`;
}

function buildCommitteeDirectory_(committees) {
  const items = (committees || []).map(committee => {
    const linked = /^[a-zA-Z0-9_-]+$/.test(committee.sheetId);
    return `<details class="committee-item" data-committee-key="${escapeHtml(normalizeText_(committee.number))}">
      <summary><span class="committee-summary-name">Committee ${escapeHtml(committee.number)}<small>${committee.members.length} reviewers · ${committee.teams.length} teams</small></span><span class="committee-sheet-status ${linked ? 'linked' : ''}">${linked ? 'Sheet linked' : 'Not created'}</span><span aria-hidden="true" class="committee-chevron">${renderLucideIcon_('chevron-down')}</span></summary>
      <div class="committee-body"><ul class="committee-members">${committee.members.length ? committee.members.map(member => `<li><span class="committee-avatar" aria-hidden="true">${escapeHtml((member.name || member.email).slice(0,1).toUpperCase())}</span><div><strong>${escapeHtml(member.name || 'Name not provided')}</strong><span class="committee-email">${escapeHtml(member.email || 'Email not provided')}</span></div></li>`).join('') : '<li>No reviewers assigned.</li>'}</ul>
      <div class="committee-teams"><span>Assigned teams</span><div>${committee.teams.length ? committee.teams.map(team => `<span class="committee-team-chip">${escapeHtml(team)}</span>`).join('') : 'No teams assigned'}</div></div>
      <div class="committee-sheet-link">${linked ? `<a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(committee.sheetId)}/edit" target="_blank" rel="noopener">Open marking spreadsheet ${renderLucideIcon_('external-link', '', 'icon-trailing')}</a>` : '<span>Create the marking spreadsheet using the setup button below.</span>'}</div></div>
    </details>`;
  }).join('');
  return `<div class="committee-directory"><div class="committee-directory-heading"><h4>Review committees <span>(${(committees || []).length})</span></h4><span>Select a committee to see reviewers and its marking sheet</span></div><div class="committee-grid">${items || '<p>No review committees configured.</p>'}</div></div>`;
}

function buildReviewConfigurationCard_() {
  return `<section id="reviewConfigurationCard" class="review-config-card" aria-labelledby="reviewConfigurationHeading" aria-busy="true">
    <div class="review-config-heading"><h4 id="reviewConfigurationHeading">Assessment readiness</h4><span id="reviewConfigurationSummary" class="review-config-pill" role="status" aria-live="polite">${getSkeletonMarkup_('inline', 'Checking assessment readiness')}</span><button id="reviewConfigurationRecheck" type="button" onclick="recheckReviewConfiguration()">Recheck</button></div>
    <ul id="reviewConfigurationIssues" hidden></ul>
    <div class="review-config-footer"><a id="reviewConfigLink" hidden target="_blank" rel="noopener">Milestones ${renderLucideIcon_('external-link', '', 'icon-trailing')}</a><a id="reviewRubricsLink" hidden target="_blank" rel="noopener">Rubric criteria ${renderLucideIcon_('external-link', '', 'icon-trailing')}</a><span id="reviewConfigurationCheckedAt"></span></div>
  </section>`;
}

function buildCoordinatorContent(data) {
  return `
    <div class="coordinator-container">
      ${Object.values(data.stats.reviews).some(review => review.unavailable) ? '<p role="status">Some assessment data is unavailable. Completion counts are partial; unavailable reviews are excluded from overdue alerts. Reload the dashboard to retry.</p>' : ''}
      ${buildCoordinatorHeaderStats(data.stats)}

      ${buildTeamTrackerTable(data.teamTrackerData, data.deadlinePills)}
      </div>
    </div>

    ${buildCoordinatorDrawer_()}
  `;
}

function buildCoordinatorDrawer_() {
  return `
    <!-- Team details drawer -->
    <div
      id="teamDrawerBackdrop"
      class="team-drawer-backdrop"
      onclick="closeCoordinatorTeamDrawer()">
    </div>

    <aside
      id="teamDrawer"
      class="team-drawer"
      aria-hidden="true">

      <div class="team-drawer-header">
        <div>
          <div class="team-drawer-eyebrow">TEAM DETAILS</div>
          <div
            id="teamDrawerTitle"
            class="team-drawer-title">
            Team
          </div>
        </div>

        <button
          type="button"
          class="team-drawer-close"
          onclick="closeCoordinatorTeamDrawer()"
          aria-label="Close">
          ${renderLucideIcon_('x')}
        </button>
      </div>

      <div
        id="teamDrawerContent"
        class="team-drawer-content">
      </div>

    </aside>
  `;
}

/** Small authorized shell; no marks, roster or historical activity reads. */
function buildCoordinatorAsyncShell_() {
  const placeholder = (id, label) => {
    if (id === 'coordinatorStats') {
      let reviews = [];
      try { reviews = getInternalReviews_(); } catch (err) { /* See System Status. */ }
      return `<div id="${id}Placeholder" class="coord-stats coordinator-stats-grid" aria-label="Loading summary cards">${Array.from({length:6 + reviews.length}, () => `<div class="stat-card coordinator-stat-placeholder">${getSkeletonMarkup_('panel', label)}</div>`).join('')}</div>`;
    }
    return `<div id="${id}Placeholder" class="coordinator-card-placeholder">${getSkeletonMarkup_('panel', label)}</div>`;
  };
  const panel = (id, label) => id === 'coordinatorTracker'
    ? `<div id="${id}" aria-busy="true">${getSkeletonMarkup_('panel', label)}</div>`
    : `${placeholder(id, label)}<div id="${id}" hidden aria-busy="true"></div>`;
  return `${buildDashboardContainerHeader_('Coordinator Dashboard', 'coord')}<div class="coordinator-container" id="coordinatorAsyncRoot">
    <div id="coordinatorOverviewStatus" role="status"></div>
    ${panel('coordinatorStats', 'Loading team summary')}
    <div id="coordinatorProgressStatus" role="status"></div>
    ${panel('coordinatorTracker', 'Loading teams')}
  </div>${buildCoordinatorDrawer_()}`;
}

/** Related cards share one read; the expensive progress request runs independently. */
function loadCoordinatorSection(section) {
  return coordinatorRead_('section-' + section, () => {
    if (section !== 'overview' && section !== 'progress') throw new Error('Unknown coordinator section.');
    const timings = [];
    const data = getCoordinatorDashboardData_(section === 'overview', true, timings);
    const renderStarted = Date.now();
    const panels = {
      coordinatorStats:buildCoordinatorHeaderStats(data.stats),
      coordinatorTracker:buildTeamTrackerTable(data.teamTrackerData, data.deadlinePills)
    };
    timings.push({phase:'render_panels', durationMs:Date.now() - renderStarted, success:true});
    console.log(JSON.stringify({event:'coordinator_phases', section, timings}));
    return {panels, timings, partial:section === 'progress' && Object.values(data.stats.reviews).some(review => review.unavailable)};
  });
}

function getCoordinatorStyles() {
  return `
.team-progress-row { display:grid; grid-template-columns:150px minmax(0,1fr) 70px; align-items:center; gap:16px; padding:12px 0; border-bottom:1px solid #eef0f3; font-size:13px; }
.team-progress-row:last-child { border-bottom:0; }
.team-progress-track { height:8px; border-radius:8px; background:#e9edf3; overflow:hidden; }
.team-progress-track > div { height:100%; background:#2684eb; border-radius:8px; }
.team-progress-note { color:#64748b; font-size:12px; display:block; margin-top:4px; }
.team-progress-count { text-align:right; color:#475569; }
.team-progress .assessment-title { margin:0 0 8px; }
@media (max-width:600px) { .team-progress-row { grid-template-columns:minmax(0,1fr) auto; gap:8px; } .team-progress-detail { grid-column:1 / -1; grid-row:2; } }
#coordinatorAsyncRoot [hidden], #systemStatusContent [hidden] { display:none !important; }
.guide-eval-criterion { border:1px solid #dcdfe4; border-radius:8px; padding:16px; margin:16px 0; }
.guide-eval-criterion textarea { display:block; width:100%; min-height:65px; box-sizing:border-box; }
.guide-eval-criterion input, .guide-eval-criterion select { padding:8px; max-width:100%; }
.guide-admin-row { display:flex; flex-wrap:wrap; gap:10px; padding:10px 0; border-bottom:1px solid #eee; }
.system-status-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.system-status-heading button { padding:9px 18px; border:1px solid #dcdfe4; border-radius:8px; background:#fff; cursor:pointer; }
.system-status-heading button:disabled { opacity:.6; cursor:wait; }
#systemStatusMessage { color:#6b7280; font-size:13px; }
.coordinator-card-placeholder { background:#fff; border:1px solid #e5e7eb; border-radius:16px; margin-bottom:24px; overflow:hidden; min-height:200px; box-shadow:0 2px 8px rgba(15,23,42,.04); }
.coordinator-stat-placeholder .app-skeleton { min-height:110px; padding:8px 0; }
.coordinator-stat-placeholder .app-skeleton-title { width:45%; margin-bottom:18px; }
.coordinator-stat-placeholder .app-skeleton-lines { gap:10px; }
.coordinator-stat-placeholder .app-skeleton-lines > :last-child { display:none; }
#coordinatorCommitteeCardPlaceholder { min-height:280px; }
#coordinatorCompletionPlaceholder { min-height:220px; }
${getBaseStyles()}${getStatusBadgeStyles()}${getTableStyles()}${getFilterTabStyles()}${getCollapsibleStyles()}
body { max-width: 1400px; margin: 0 auto; padding: 20px 16px; }
.coordinator-container { display: flex; flex-direction: column; gap: 15px; }
.reviewer-setup { min-width:0; }
.committee-directory { margin:0; padding:0; }
.committee-directory-heading { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
.committee-directory-heading h4 { margin:0; font-size:13px; }
.committee-directory-heading > span,.committee-directory-heading h4 span { font-size:12px; color:#64748b; font-weight:400; }
.committee-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr)); gap:10px; align-items:start; }
.committee-item { min-width:0; border:1px solid #e2e8f0; border-radius:10px; background:#fff; overflow:hidden; }
.committee-item summary { display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer; list-style:none; }
.committee-item summary::-webkit-details-marker { display:none; }
.committee-item summary:focus-visible { outline:2px solid #6366f1; outline-offset:-3px; }
.committee-summary-name { flex:1; min-width:0; overflow-wrap:anywhere; font-size:13px; font-weight:600; }
.committee-summary-name small { display:block; margin-top:4px; color:#64748b; font-weight:400; font-size:11px; }
.committee-sheet-status { font-size:11px; padding:4px 7px; border-radius:6px; color:#92400e; background:#fffbeb; white-space:nowrap; }
.committee-sheet-status.linked { color:#166534; background:#f0fdf4; }
.committee-item[open] .committee-chevron { transform:rotate(180deg); }
.committee-body { padding:0 14px 14px; border-top:1px solid #f1f5f9; }
.committee-members { list-style:none; padding:0; margin:12px 0; display:grid; gap:10px; }
.committee-members li { display:flex; align-items:center; gap:9px; min-width:0; }
.committee-members li > div { min-width:0; }
.committee-members strong { font-size:12px; font-weight:600; overflow-wrap:anywhere; }
.committee-avatar { flex:none; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:#eef2ff; color:#4338ca; font-size:12px; }
.committee-email { display:block; color:#64748b; font-size:12px; overflow-wrap:anywhere; }
.committee-teams { font-size:12px; color:#64748b; }
.committee-teams > div { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
.committee-team-chip { background:#f1f5f9; color:#334155; border-radius:5px; padding:3px 7px; overflow-wrap:anywhere; }
.committee-sheet-link { margin-top:12px; font-size:12px; color:#64748b; }
.committee-sheet-link a { color:#4338ca; font-weight:600; }
.reviewer-setup > .assessment-title { margin-top:0; margin-bottom:8px; }
.reviewer-setup-intro { margin:0 0 16px; color:#64748b; font-size:13px; line-height:1.5; }
.system-status-primary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:stretch; margin-bottom:16px; }
.system-status-primary > * { min-width:0; margin:0; }

.rubrics-status-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
.rubrics-status-title { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; }
.rubrics-status-count { color:#64748b; font-size:11px; font-weight:400; }
.rubrics-status-heading .assessment-title { margin:0; font-size:14px; }
.rubrics-status-pill { padding:4px 10px; border-radius:999px; font-size:11px; font-weight:600; line-height:1.5; }
.rubrics-status-pill[data-configured="true"] { color:#166534; background:#dcfce7; }
.rubrics-status-pill[data-configured="false"] { color:#9a3412; background:#ffedd5; }
.rubrics-status-detail { margin:12px 0 0; color:#64748b; font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
.rubrics-assessment-list { margin:10px 0 0; font-size:12px; }
.rubrics-assessment-list > div { display:flex; justify-content:space-between; flex-wrap:wrap; gap:3px 12px; padding:6px 0; border-top:1px solid #eef0f5; }
.rubrics-assessment-list > div:last-child { padding-bottom:0; }
.rubrics-assessment-list dt { color:#1f2937; font-weight:600; overflow-wrap:anywhere; }
.rubrics-assessment-list dd { margin:0; color:#64748b; font-variant-numeric:tabular-nums; }
@media(max-width:900px) { .system-status-primary { grid-template-columns:minmax(0,1fr); } }
.review-config-card { padding:10px 12px; margin-bottom:14px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; color:#0f172a; }
.reviewer-setup-panels { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:16px; align-items:stretch; }
.reviewer-setup-panels .review-config-card { min-width:0; margin:0; padding:14px; }
.reviewer-setup-action { display:flex; flex-direction:column; align-items:flex-start; gap:12px; min-width:0; padding:14px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; }
.reviewer-setup-action > div { min-width:0; }
.marking-sheets-heading { display:flex; align-items:center; flex-wrap:wrap; gap:8px; width:100%; }
.reviewer-setup-action .marking-sheets-heading h4 { margin:0; }
@media (max-width:760px) { .reviewer-setup-panels { grid-template-columns:minmax(0,1fr); } }
.reviewer-setup-action h4 { margin:0 0 6px; font-size:13px; font-weight:600; }
.reviewer-setup-action p { margin:0; font-size:13px; line-height:1.6; color:#475569; }
.reviewer-setup-action p.reviewer-setup-note { margin-top:4px; font-size:12px; color:#64748b; }
.reviewer-setup #createReviewerSheetsButton { width:auto; max-width:100%; margin:0 0 0 auto; padding:4px 10px; border:1px solid #1f2430; border-radius:6px; font-size:12px; white-space:normal; }
.reviewer-setup [hidden] { display:none !important; }
#reviewerSheetsStatus:empty,#reviewerSheetsResults:empty { display:none; }
.review-config-pill { display:inline-flex; padding:4px 9px; border-radius:999px; background:#f1f5f9; color:#475569; font-size:11px; font-weight:600; line-height:1.4; }
.review-config-card[data-state="ready"] .review-config-pill { color:#166534; background:#dcfce7; }
.review-config-card[data-state="invalid"] .review-config-pill { color:#92400e; background:#fef3c7; }
.review-config-heading,.review-config-footer { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.review-config-heading { gap:8px; }
.review-config-heading button { margin-left:auto; }
.review-config-heading h4 { margin:0; font-size:13px; font-weight:600; }
.review-config-heading button { border:1px solid #94a3b8; border-radius:6px; padding:4px 10px; background:white; color:#0f172a; cursor:pointer; }
.review-config-footer { margin-top:8px; gap:6px 14px; font-size:11px; color:#64748b; }
#reviewConfigurationIssues { margin:10px 0 0; padding-left:18px; font-size:12px; }
.review-config-card li { margin:8px 0; }
.review-config-card p { margin:8px 0; font-size:13px; line-height:1.5; }
#createReviewerSheetsButton:disabled { opacity:.55; cursor:not-allowed; }
.coord-stats.coordinator-stats-grid { display:grid; width:100%; grid-template-columns:repeat(4,minmax(0,1fr)); grid-auto-rows:1fr; gap:12px; margin-bottom:24px; }
.coordinator-stats-grid .stat-card { position:relative; display:flex; flex-direction:column; gap:8px; min-width:0; min-height:114px; box-sizing:border-box; padding:13px; background:#fff; border:1px solid #f0edf8; border-radius:7px; box-shadow:0 1px 1px rgba(15,23,42,.02); }
.coordinator-stats-grid .stat-label { min-height:22px; padding-right:29px; font-size:9px; color:#64748b; font-weight:500; letter-spacing:.45px; text-transform:uppercase; line-height:1.4; }
.coordinator-stats-grid .lucide-icon.stat-icon { position:absolute; top:12px; right:12px; width:18px; height:18px; padding:6px; box-sizing:content-box; border-radius:4px; background:#e0e7ff; }
.coordinator-stats-grid .stat-header { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px; min-height:26px; }
.coordinator-stats-grid .stat-card .stat-num { font-size:25px; font-weight:750; color:#0f172a; line-height:1; font-variant-numeric:tabular-nums; }
.coordinator-stats-grid .stat-pct { padding:2px 4px; background:#eef2ff; font-size:9px; color:#64748b; font-weight:400; line-height:1.3; }
.coordinator-stats-grid .stat-pct:empty { display:none; }
.coordinator-stats-grid .stat-detail { margin-top:auto; color:#475569; font-size:10px; line-height:1.4; }
.coordinator-stats-grid .stat-detail-row { display:flex; justify-content:space-between; gap:8px; font-size:9px; }
.coordinator-stats-grid .stat-detail-row > span { flex:1; }
.coordinator-stats-grid .stat-detail-row .stat-outstanding { color:#dc2626; font-weight:700; font-size:10px; }
.coordinator-stats-grid .stat-track { height:4px; border-radius:4px; background:#e9eaff; overflow:hidden; margin-bottom:4px; }
.coordinator-stats-grid .stat-track > span { display:block; height:100%; border-radius:inherit; }
.coordinator-stats-grid .stat-registered { color:#059669; }
.coordinator-stats-grid .stat-card-blue .stat-pct { background:transparent; padding:0; }
.coordinator-stats-grid .stat-card-purple .stat-pct,.coordinator-stats-grid .stat-card-green .stat-pct { background:#d1fae5; color:#047857; }
.coordinator-stats-grid .stat-card-green .stat-icon { background:#a7f3d0; }
.coordinator-stats-grid .stat-card-orange .stat-icon { background:#ffedd5; }
.coordinator-stats-grid .stat-card-red { background:#fff5f7; }
.coordinator-stats-grid .stat-card-red .stat-label,.coordinator-stats-grid .stat-card-red .stat-num { color:#dc2626; }
.coordinator-stats-grid .stat-card-red .stat-pct { background:#ffe4e6; color:#be123c; }
.coordinator-stats-grid .stat-card-red .stat-icon { background:#dc2626; color:#fff; }
/* Completion tones override the decorative card palette, including unknown data. */
.coordinator-stats-grid .stat-card[data-completion-tone] { --stat-tone:#4f46e5; --stat-tint:#eef2ff; background:#fff; }
.coordinator-stats-grid .stat-card[data-completion-tone="complete"] { --stat-tone:#047857; --stat-tint:#d1fae5; }
.coordinator-stats-grid .stat-card[data-completion-tone="warning"] { --stat-tone:#b45309; --stat-tint:#fef3c7; }
.coordinator-stats-grid .stat-card[data-completion-tone="danger"] { --stat-tone:#dc2626; --stat-tint:#fee2e2; }
.coordinator-stats-grid .stat-card[data-completion-tone] .stat-icon,
.coordinator-stats-grid .stat-card[data-completion-tone] .stat-pct { color:var(--stat-tone); background:var(--stat-tint); }
.coordinator-stats-grid .stat-card[data-completion-tone] .stat-num { color:var(--stat-tone); }
.coordinator-stats-grid .stat-card[data-completion-tone] .stat-label { color:#64748b; }
.coordinator-stats-grid .stat-card[data-completion-tone] .stat-track > span { background:var(--stat-tone) !important; }
.coordinator-stats-grid .coordinator-stat-placeholder { display:block; }
.coordinator-stats-grid .coordinator-stat-placeholder .app-skeleton { min-height:86px; box-sizing:border-box; }
@media (max-width:760px) { .coord-stats.coordinator-stats-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } }
@media (max-width:340px) { .coord-stats.coordinator-stats-grid { grid-template-columns:minmax(0,1fr); } }
.stat-card-blue .stat-icon { color: #3b82f6; }
.stat-card-blue .stat-num { color: #3b82f6; }
.stat-card-green .stat-icon { color: #16a34a; }
.stat-card-green .stat-num { color: #16a34a; }
.stat-card-purple .stat-icon { color: #8b5cf6; }
.stat-card-purple .stat-num { color: #8b5cf6; }
.stat-card-orange .stat-icon { color: #f97316; }
.stat-card-orange .stat-num { color: #f97316; }
.stat-card-teal .stat-icon { color: #06b6d4; }
.stat-card-teal .stat-num { color: #06b6d4; }
.stat-card-gray .stat-icon { color: #9ca3af; }
.stat-card-gray .stat-num { color: #9ca3af; }
.stat-card-red .stat-icon { color: #dc2626; }
.stat-card-red .stat-num { color: #dc2626; }
/* =========================================================
   SEMESTER PROGRESS
   ========================================================= */

.pipeline-section {
  background: #ffffff;
  border: 1px solid #e7edf4;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(15,23,42,0.05);
}


/* ---------- Heading ---------- */

.pipeline-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.pipeline-title {
  font-size: 16px;
  font-weight: 700;
  color: #172554;
}

.semester-dates {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11.5px;
  color: #64748b;
  white-space: nowrap;
}

.semester-dates strong {
  font-weight: 600;
}

.date-divider {
  width: 1px;
  height: 16px;
  background: #cbd5e1;
}


/* ---------- Pipeline ---------- */

.pipeline-track {
  display: flex;
  align-items: stretch;
  gap: 0;

  overflow-x: auto;

  padding: 1px 0 8px;

  scrollbar-width: thin;
}


/* ---------- Individual stage ---------- */

.pipeline-stage {
  flex: 1 0 126px;

  min-width: 126px;
  min-height: 132px;

  padding: 14px 13px 11px;

  border: 1px solid #dfe7f0;
  border-radius: 8px;

  background: #ffffff;

  box-sizing: border-box;

  text-align: left;
}


/* ---------- Stage header ---------- */

.stage-header {
  display: flex;
  align-items: flex-start;

  gap: 8px;

  min-height: 42px;
}

.stage-name-wrap {
  min-width: 0;
}

.stage-label {
  font-size: 12px;
  line-height: 1.18;

  font-weight: 700;

  color: #334155;
}

.stage-subtitle {
  margin-top: 3px;

  font-size: 9.5px;
  line-height: 1.18;

  color: #94a3b8;
}


/* ---------- Stage icons ---------- */

.stage-icon {
  width: 20px;
  height: 20px;

  flex: 0 0 20px;

  margin-top: 1px;

  border-radius: 50%;

  display: inline-flex;

  align-items: center;
  justify-content: center;

  box-sizing: border-box;

  font-size: 12px;
  font-weight: 800;
}


/* Completed */

.stage-icon.completed {
  background: #1683e8;
  color: #ffffff;
}


/* Pending */

.stage-icon.pending {
  border: 2px solid #94a3b8;
  background: #ffffff;
}


/* Development */

.stage-icon.development {
  border-radius: 0;

  color: #64748b;

  background: transparent;

  font-size: 18px;
}


/* ---------- Count ---------- */

.stage-count {
  margin-top: 7px;

  min-height: 17px;

  font-size: 11.5px;

  color: #64748b;

  font-weight: 600;
}


/* ---------- Progress bar ---------- */

.progress-bar {
  height: 9px;

  margin-top: 7px;

  background: #d8e0e9;

  border-radius: 999px;

  overflow: hidden;
}

.progress-fill {
  height: 100%;

  border-radius: 999px;
}

.progress-fill.blue {
  background: #1683e8;
}

.progress-fill.green {
  background: #16b364;
}

.progress-fill.gray {
  background: #94a3b8;
}


/* ---------- Percentage ---------- */

.stage-percent {
  min-height: 16px;

  margin-top: 7px;

  font-size: 11.5px;

  color: #64748b;

  font-weight: 600;
}


/* ---------- Arrow ---------- */

.stage-arrow {
  flex: 0 0 24px;

  width: 24px;

  display: flex;

  align-items: center;
  justify-content: center;

  color: #526b88;

  font-size: 23px;
}


/* ---------- Development explanation ---------- */

.development-legend {
  display: flex;
  flex-wrap: wrap;

  align-items: center;

  gap: 8px;

  margin-top: 7px;

  padding: 0 2px;

  font-size: 10.5px;

  color: #64748b;
}

.development-legend strong {
  color: #475569;
}

.legend-separator {
  color: #cbd5e1;
}


/* ---------- Smaller screens ---------- */

@media (max-width: 900px) {

  .pipeline-heading {
    align-items: flex-start;

    flex-direction: column;

    gap: 7px;
  }

  .semester-dates {
    white-space: normal;
  }

  .pipeline-stage {
    flex-basis: 130px;
    min-width: 130px;
  }
}
.needs-attention { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.table-title { font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; margin-bottom: 14px; }
.view-all { color: #3b5bdb; font-size: 13px; }
.attention-table { width: 100%; border-collapse: collapse; }
.attention-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #8b8f99; padding: 10px 12px; border-bottom: 1px solid #eef0f3; }
.attention-table td { padding: 12px; border-bottom: 1px solid #f2f3f5; font-size: 13px; }
.col-index { width: 30px; text-align: center; }
.col-severity { width: 80px; }
.col-team { font-weight: 600; }
.severity-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.severity-badge.high { background: #fee2e2; color: #991b1b; }
.severity-badge.medium { background: #fed7aa; color: #92400e; }
.severity-badge.low { background: #dbeafe; color: #1e40af; }
.action-link { color: #3b5bdb; font-size: 13px; }
.two-column-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 1024px) { .two-column-layout { grid-template-columns: 1fr; } }
.assessment-section { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.assessment-title { font-size: 14px; font-weight: 700; margin-bottom: 16px; }
.assessment-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.assessment-label { width: 120px; font-size: 13px; font-weight: 600; }
.assessment-bar { flex: 1; display: flex; align-items: center; gap: 8px; }
.assessment-bar-inner { flex: 1; height: 8px; background: #eef0f3; border-radius: 4px; overflow: hidden; }
.assessment-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); }
.assessment-pct { font-size: 12px; font-weight: 600; min-width: 35px; }
.assessment-stat { font-size: 12px; color: #6b7280; min-width: 60px; text-align: right; }
.github-section { background: #fff; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.github-header { display: flex; justify-content: space-between; align-items: center; flex-wrap:wrap; gap:8px; margin-bottom: 8px; }
.github-title { font-size: 14px; font-weight: 700; }
.github-status { display: inline-block; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; line-height:1.5; }
.github-status.configured { background: #dcfce7; color: #15803d; }
.github-row { display: flex; justify-content: space-between; flex-wrap:wrap; gap:3px 12px; padding: 6px 0; border-bottom: 1px solid #f2f3f5; font-size: 12px; }
.github-row > span { overflow-wrap:anywhere; min-width:0; }
.github-value { font-weight: 600; font-family: 'Courier New', monospace; }
.run-sync-btn { padding: 10px 16px; border-radius: 8px; background: #1f2430; color: #fff; border: none; font-weight: 600; font-size: 13px; cursor: pointer; width: 100%; margin-top: 12px; }
.run-sync-btn:hover { background: #333a4a; }
/* Shared presentation for the two primary System Status cards. */
.system-status-primary > .system-status-card { display:flex; flex-direction:column; align-self:stretch; box-sizing:border-box; margin:0; padding:16px 18px; border:0; border-radius:12px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.05); font-family:inherit; font-size:12px; line-height:1.5; }
.system-status-card .github-header, .system-status-card .rubrics-status-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin:0 0 10px; }
.system-status-card .github-title, .system-status-card .assessment-title { margin:0; font-family:inherit; font-size:14px; font-weight:700; line-height:1.5; }
.system-status-card .github-status, .system-status-card .rubrics-status-pill { display:inline-block; padding:4px 10px; border-radius:999px; font-family:inherit; font-size:11px; font-weight:600; line-height:1.5; }
.system-status-card .github-status.configured, .system-status-card .rubrics-status-pill[data-configured="true"] { color:#166534; background:#dcfce7; }
.system-status-card .github-info, .system-status-card .rubrics-assessment-list { margin:0; }
.system-status-card .github-row, .system-status-card .rubrics-assessment-list > div { display:flex; justify-content:space-between; flex-wrap:wrap; gap:3px 12px; padding:6px 0; border:0; border-top:1px solid #eef0f5; font-size:12px; line-height:1.5; }
.system-status-card .github-label, .system-status-card .rubrics-assessment-list dt { color:#1f2937; font-weight:600; }
.system-status-card .github-value, .system-status-card .rubrics-assessment-list dd { margin:0; color:#64748b; font-family:inherit; font-size:12px; font-weight:400; font-variant-numeric:tabular-nums; }
.system-status-card .rubrics-status-detail { margin:0 0 10px; }
.system-status-card .run-sync-btn { margin-top:auto; padding:7px 12px; min-height:32px; border-radius:6px; font-family:inherit; font-size:12px; line-height:1.5; }
.system-status-card .github-info { margin-bottom:10px; }
@media(min-width:901px) {
  .system-status-primary { grid-auto-rows:1fr; }
  .system-status-primary > .system-status-card { height:100%; }
}
.team-tracker-section { min-width:0; max-width:100%; box-sizing:border-box; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.tracker-title { margin-top:0; }
#weeklyActivityRetry[hidden] { display:none !important; }
.tracker-table-scroll { width:100%; max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; }
.tracker-table-scroll:focus-visible { outline:2px solid #6366f1; outline-offset:2px; }
.team-tracker-table .col-team { width:100px; min-width:100px; max-width:160px; white-space:normal; }
.team-tracker-table .tracker-registers { margin-top:5px; max-width:220px; white-space:normal; overflow-wrap:anywhere; font-size:11px; font-weight:400; line-height:1.5; color:#64748b; font-variant-numeric:tabular-nums; }
.team-tracker-table .col-guide { min-width:170px; max-width:220px; overflow-wrap:anywhere; }
.team-tracker-table .col-health { width:36px; text-align:center; }
.tracker-health { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; }
.tracker-health.green { background:#dcfce7; color:#166534; }
.tracker-health.orange { background:#fef3c7; color:#92400e; }
.tracker-health.red { background:#fee2e2; color:#991b1b; }
.team-tracker-section .pagination { flex-wrap:wrap; gap:12px; }
.team-tracker-section .pagination-buttons { flex-wrap:wrap; }
.tracker-search input { min-width:0; width:100%; box-sizing:border-box; }
@media (max-width:600px) {
  .team-tracker-section { padding:14px; }
  .team-tracker-table th,.team-tracker-table td { padding:9px 8px; }
  .tracker-tabs .tab { padding:6px 10px; }
}
.tracker-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.tab { padding: 7px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid #dcdfe4; background: #fff; color: #6b7280; cursor: pointer; }
.tab.active { background: #1f2430; color: #fff; border-color: #1f2430; }
.tracker-search { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.tracker-search #trackerSearch,.tracker-search .reset-btn { height:40px; box-sizing:border-box; margin:0; padding:0 14px; font-size:13px; line-height:normal; }
.tracker-search #trackerSearch { flex:1; min-width:0; }
.tracker-search .reset-btn { flex:none; display:inline-flex; align-items:center; justify-content:center; }
.tracker-tabs .tab[data-filter="attention"] { color:#991b1b; border-color:#fecaca; background:#fff7f7; }
.tracker-tabs .tab[data-filter="ontrack"] { color:#166534; border-color:#bbf7d0; background:#f0fdf4; }
.tracker-tabs .deadline-pill { color:#92400e; border-color:#fde68a; background:#fffbeb; }
.tracker-tabs .deadline-pill.deadline-overdue { color:#991b1b; border-color:#fecaca; background:#fff7f7; }
.tracker-tabs .tab.active { background:#1f2430; color:#fff; border-color:#1f2430; }
.tracker-tabs .tab:focus-visible,.tracker-search .reset-btn:focus-visible { outline:2px solid #6366f1; outline-offset:2px; }
.tracker-tabs .tab:hover:not(.active) { border-color:currentColor; }
#trackerSearch { flex: 1; padding: 10px 14px; border: 1px solid #dcdfe4; border-radius: 8px; font-size: 13px; }
.reset-btn { padding: 10px 16px; border-radius: 8px; background: #f3f4f6; border: 1px solid #dcdfe4; font-weight: 600; font-size: 13px; cursor: pointer; }
.team-tracker-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.team-tracker-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #8b8f99; padding: 10px 12px; border-bottom: 1px solid #eef0f3; }
.team-tracker-table td { padding: 7px 12px; border-bottom: 1px solid #f2f3f5; }
.team-tracker-table th:first-child,.team-tracker-table td.col-team { padding-right:6px; }
.team-tracker-table th:nth-child(2),.team-tracker-table td.col-guide { padding-left:6px; }
.team-tracker-table th:nth-child(5),.team-tracker-table td.col-activity { width:76px; padding-right:6px; }
.team-tracker-table th:nth-child(6),.team-tracker-table td.col-activity + td { padding-left:6px; }
.col-title { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.health-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.health-badge.green { background: #dcfce7; color: #15803d; }
.health-badge.orange { background: #fed7aa; color: #92400e; }
.health-badge.red { background: #fee2e2; color: #991b1b; }
.view-link { color: #3b5bdb; }
.team-action-controls { display:flex; align-items:center; gap:8px; }
.team-action-icon { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border:1px solid #dce3ee; border-radius:9px; background:#fff; color:#3b5bdb; cursor:pointer; text-decoration:none; padding:0; }
.team-action-icon:hover { background:#eef2ff; border-color:#a5b4fc; }
.team-action-icon:focus-visible { outline:2px solid #3b5bdb; outline-offset:3px; }
.team-action-icon:disabled { opacity:.4; cursor:not-allowed; }
.link-button { border: 0; background: transparent; padding: 0; cursor: pointer; font: inherit; }
.pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: 13px; }
.pagination-buttons { display: flex; gap: 4px; }
.pagination-buttons button { padding: 6px 10px; border: 1px solid #dcdfe4; border-radius: 6px; background: #fff; font-size: 12px; cursor: pointer; }
.pagination-buttons button.active { background: #1f2430; color: #fff; border-color: #1f2430; }
.pagination-buttons button:disabled { opacity: 0.45; cursor: not-allowed; }
.pagination-ellipsis { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; color: #6b7280; }
.team-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.28);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.22s ease, visibility 0.22s ease;
  z-index: 9998;
}

.team-drawer-backdrop.open {
  opacity: 1;
  visibility: visible;
}

.team-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: min(520px, 92vw);
  height: 100vh;
  background: #ffffff;
  box-shadow: -8px 0 30px rgba(15, 23, 42, 0.14);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  z-index: 9999;
  display: flex;
  flex-direction: column;
}

.team-drawer.open {
  transform: translateX(0);
}

.team-drawer-header {
  min-height: 74px;
  padding: 18px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.team-drawer-eyebrow {
  font-size: 10px;
  font-weight: 700;
  color: #8b8f99;
  letter-spacing: 0.9px;
}

.team-drawer-title {
  margin-top: 3px;
  font-family: inherit;
  font-size: 16px;
  line-height: 1.4;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  color: #1f2430;
}

.team-drawer-close {
  width: 36px;
  height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #4b5563;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  cursor: pointer;
}

.team-drawer-close:hover {
  background: #f3f4f6;
}

.team-drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.drawer-error {
  padding: 40px 10px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

.drawer-error {
  color: #b91c1c;
}

.drawer-section {
  margin-bottom: 22px;
}

.drawer-section-title {
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid #eef0f3;
  color: #8b8f99;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}

.drawer-project-title {
  font-size: 16px;
  line-height: 1.5;
  font-weight: 650;
  color: #1f2937;
}

.drawer-problem {
  margin-top: 10px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.55;
}

.drawer-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.drawer-info-card {
  padding: 12px;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fafbfc;
}

.drawer-info-label {
  margin-bottom: 4px;
  color: #8b8f99;
  font-size: 10px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.drawer-info-value {
  color: #1f2937;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.drawer-person {
  padding: 10px 0;
  border-bottom: 1px solid #f2f3f5;
}

.drawer-person:last-child {
  border-bottom: 0;
}

.drawer-person-name {
  color: #1f2937;
  font-size: 13px;
  font-weight: 650;
}

.drawer-person-meta {
  margin-top: 3px;
  color: #8b8f99;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.drawer-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f2f3f5;
  font-size: 13px;
}

.drawer-status-row:last-child {
  border-bottom: 0;
}

.drawer-status-label {
  color: #6b7280;
}

.drawer-status-value {
  color: #1f2937;
  font-weight: 650;
  text-align: right;
}

.drawer-status-good {
  color: #15803d;
}

.drawer-status-warn {
  color: #b45309;
}

.drawer-status-bad {
  color: #b91c1c;
}

.drawer-repo-link {
  color: #3b5bdb;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.drawer-repo-link:hover {
  text-decoration: underline;
}

body.team-drawer-open {
  overflow: hidden;
}

@media (max-width: 600px) {
  .team-drawer {
    width: 100%;
  }

  .drawer-info-grid {
    grid-template-columns: 1fr;
  }
}
`;
}

function buildCoordinatorPage(data) {
  return buildSingleRoleDashboardPage(
    getCoordinatorEmail(),
    'coord',
    'Coordinator',
    'coordinatorContent',
    buildCoordinatorContent(data)
  );
}



function buildCommitteeData_(committeeRows, statusRows, RC, TS) {
  return committeeRows.filter(row => String(row[RC.COMMITTEE_NUMBER] || '').trim()).map(row => ({
      number:String(row[RC.COMMITTEE_NUMBER]).trim(),
      sheetId:String(row[RC.MARKS_SHEET_ID] || '').trim(),
      members:[1,2,3,4].map(index => ({name:String(row[RC['REVIEWER' + index + '_NAME']] || '').trim(), email:String(row[RC['REVIEWER' + index + '_EMAIL']] || '').trim()})).filter(member => member.name || member.email),
      teams:statusRows.filter(team => textEquals_(team[TS.COMMITTEE_NUMBER], row[RC.COMMITTEE_NUMBER])).map(team => String(team[TS.TEAM_ID]))
    })).sort((a,b) => a.number.localeCompare(b.number, undefined, {numeric:true}));
}

function buildRubricsStatusCard_() {
  const status = getRubricsStatus_();
  const count = (status.assessments || []).length;
  return `<section class="assessment-section rubrics-status-card system-status-card" aria-labelledby="rubricsStatusHeading">
    <div class="rubrics-status-heading"><div class="rubrics-status-title"><h3 class="assessment-title" id="rubricsStatusHeading">Rubrics</h3>${count ? '<span class="rubrics-status-count">'+count+' '+(count===1?'assessment':'assessments')+'</span>' : ''}</div>
      <span class="rubrics-status-pill" data-configured="${status.configured}" role="status">${status.configured?'Configured':'Not configured'}</span></div>
    ${status.configured ? '' : '<p class="rubrics-status-detail">'+escapeHtml(status.detail)+'</p>'}
    ${(status.assessments || []).length ? '<dl class="rubrics-assessment-list">'+status.assessments.map(item=>'<div><dt>'+escapeHtml(item.label)+'</dt><dd>'+escapeHtml(item.summary)+'</dd></div>').join('')+'</dl>' : ''}
  </section>`;
}

function loadCoordinatorSystemStatus() {
  return coordinatorRead_('system-status', () => {
    const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const RC = getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);
    const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]);
    const repos = getRepoUrlMap();
    const committees = buildCommitteeData_(getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE), rows, RC, TS);
    const access = {coordUsername:String(getConfig('COLLABORATOR_GITHUB_USERNAME') || '').trim(),
      reposWithAccess:Number(getConfig('COLLABORATOR_REPOS_ACCESS')) || 0,
      totalRepos:rows.filter(row => repos[normalizeText_(row[TS.TEAM_ID])]).length};
    return `<div class="coordinator-container">
      <div class="system-status-primary">${buildGithubAccessSection(access)}</div>
      ${buildGuideEvaluationAdmin_()}
      ${buildInternalAssessmentPublishing_('review1')}
      ${buildInternalAssessmentPublishing_('review2')}
      <section class="assessment-section reviewer-setup" aria-label="Review committees and marking sheets">
        ${buildCommitteeDirectory_(committees)}
        <div class="reviewer-setup-panels">${buildReviewConfigurationCard_()}
          <div class="reviewer-setup-action"><div class="marking-sheets-heading"><h4>Committee marking sheets</h4>
          <button type="button" id="createReviewerSheetsButton" disabled aria-describedby="reviewConfigurationSummary" class="run-sync-btn" onclick="createReviewerSheets()">Create missing sheets</button></div>
          <p>Create only missing sheets. Existing sheets stay unchanged.</p></div></div>
        <p id="reviewerSheetsStatus" role="status" aria-live="polite"></p><ul id="reviewerSheetsResults"></ul>
      </section></div>`;
  });
}
