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
  const card = (label, value, color, note, icon, detail, ids, progressStat) => `<div class="card p-4" data-stat-card${progressStat ? ' data-progress-stat' : ''} data-completion-tone="${completionTone(value, color, note)}">
    <div>${label}</div>${renderLucideIcon_(icon)}
    <div><div data-stat-value${ids ? ' id="coordinatorActiveTeams"' : ''}>${value}</div><div class="stat-pct"${ids ? ' id="coordinatorActiveTeamsPct"' : ''}>${note}</div></div>
    <div>${detail}</div></div>`;
  const progress = (value, left, right) => `<div class="progress" aria-hidden="true"><span style="width:${pct(value)}%"></span></div><div><span>${left}</span><span>${right}</span></div>`;
  const repos = stats.reposReady || 0, approved = stats.titleApproved || 0;
  return `<div class="coordinator-stats-grid">
    ${card('Total Teams', stats.total, 'blue', 'Teams Roster', 'users', '<span>●</span> Teams registered')}
    ${card('Repositories Available', repos, 'purple', pct(repos) + '% linked', 'git-branch', progress(repos, repos + ' / ' + stats.total + ' recorded', Math.max(0, stats.total - repos) + ' missing'))}
    ${card('Title Approved', approved, 'green', pct(approved) + '% validated', 'tag', progress(approved, approved + ' approved', Math.max(0, stats.total - approved) + ' pending approval'))}
    ${card('Active This Week', skeleton('Loading activity'), 'orange', skeleton('Loading activity'), 'trending-up', 'Weekly repository activity', true)}
    ${reviews.map((review, index) => {
      const result = stats.reviews && stats.reviews[review.key];
      const value = stats.loading ? skeleton('Loading ' + review.label) : result ? result.completed : '—';
      const note = stats.loading ? '' : !result ? 'Unavailable' : result.unavailable ? result.unavailable + ' unavailable' : pct(result.completed) + '% (' + result.completed + '/' + stats.total + ')';
      return card(escapeHtml(review.label) + ' Completed', value, 'teal', note, ['clipboard-check', 'file-text', 'book-open'][index % 3], 'Team review completion', false, true);
    }).join('')}
    ${card('Guide Evaluation Completed', stats.loading ? skeleton('Loading guide evaluation') : stats.guideEvaluation && stats.guideEvaluation.available ? stats.guideEvaluation.completed : '—', 'teal', stats.loading ? '' : stats.guideEvaluation && stats.guideEvaluation.available ? pct(stats.guideEvaluation.completed) + '% evaluated' : 'Unavailable', 'graduation-cap', 'Guide assessment completion', false, true)}
    ${card('Need Attention', stats.loading ? skeleton('Loading attention count') : stats.needsAttention, 'red', stats.loading ? '' : pct(stats.needsAttention) + '% of cohort', 'triangle-alert', 'Teams with overdue requirements', false, true)}
  </div>`;
}

function getSeeProgressRows_() {
  try {return getAssessmentDefinitions_().filter(d=>d.type==='SEE').map(d=>({label:d.label,external:true}));}
  catch(err){return [];}
}

function buildTeamCompletionProgress(stages) {
  let reviews = [];
  let configurationUnavailable = false;
  try { reviews = getInternalReviews_(); } catch (err) { configurationUnavailable = true; }
  const rows = [{label:'GitHub Setup', stage:stages.setup},
    {label:'Title Approval', stage:stages.titleApproval},
    ...reviews.map(review => ({label:review.label, stage:stages[review.key]})),
    {label:'Guide Evaluation', untracked:true}, ...getSeeProgressRows_()];
  return `<section class="card" aria-labelledby="teamProgressHeading">
    <h3 id="teamProgressHeading">Team Progress</h3>
    ${configurationUnavailable ? '<p role="status">Review configuration unavailable. Check System Status.</p>' : ''}
    ${rows.map(({label, stage, untracked, external}) => {
      const name = escapeHtml(label);
      if (external) return `<div><span>${name}</span><span>Evaluated outside this app</span></div>`;
      if (untracked) return `<div><span>${name}</span><span>Not tracked</span></div>`;
      if (!stage) return `<div><span>${name}</span><span>Unavailable</span></div>`;
      const completed = stage.completed || 0, total = stage.total || 0;
      const percent = total ? Math.round(completed / total * 100) : 0;
      const partial = stage.unavailable > 0;
      const note = partial ? stage.unavailable + ' unavailable · partial data' : total ? percent + '%' : 'No teams';
      return `<div><span>${name}</span>
        <div><div class="progress" role="progressbar" aria-label="${name}: ${escapeHtml(note)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
        <span>${note}</span></div><span>${completed} / ${total}</span></div>`;
    }).join('')}
  </section>`;
}
function buildNeedsAttentionTable(teams) {
  if (teams.length === 0) return `<div><div>Needs Attention (0 teams)</div><div class="table-empty">All teams are on track.</div></div>`;

  const rows = teams.slice(0, 11).map((t, idx) => {
    const sev = t.severity === 'high' ? 'high' : t.severity === 'medium' ? 'medium' : 'low';
    const ts = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    return `<tr><td>${idx + 1}</td><td><span class=" ${sev}">${sev.toUpperCase()}</span></td><td>${escapeHtml(t.row[ts.TEAM_ID])}</td><td class="col-issue">${escapeHtml(t.issue)}</td><td class="col-since">${t.daysOverdue} days</td><td>${escapeHtml(t.row[ts.GUIDE_NAME])}</td><td class="col-action"><button type="button" class="action-link btn btn-sm btn-outline" onclick="focusCoordinatorTeam('${escapeHtml(String(t.row[ts.TEAM_ID]))}')">View</button></td></tr>`;
  }).join('');

  return `<div><div>Needs Attention (${teams.length} teams) <button type="button" class="view-all btn btn-sm btn-outline" onclick="showAllCoordinatorTeams()">View all ${renderLucideIcon_('arrow-right')}</button></div><div class="tracker-table-scroll table-wrap" data-tooltip-boundary role="region" aria-label="Teams needing attention, scroll horizontally for more columns" tabindex="0"><table class="table table--compact"><thead><tr><th>#</th><th>Severity</th><th>Team</th><th>Issue</th><th>Overdue</th><th>Guide</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function buildAssessmentProgress(assessmentProgress) {
  let configuredReviews = [];
  try { configuredReviews = getInternalReviews_(); } catch (err) { /* See configuration card. */ }
  const bar = (c, p) => { const pct = c + p > 0 ? Math.round((c / (c + p)) * 100) : 0; return `<div><div class="progress"><span style="width:${pct}%"></span></div><span>${pct}%</span></div>`; };

  return `<div class="card"><h3>Assessment Progress</h3>
    ${configuredReviews.map(review => {
      const progress = assessmentProgress[review.key];
      return `<div><div>${escapeHtml(review.label)}</div>${progress.unavailable ? "<span>Partial data: " + progress.unavailable + " unavailable</span>" : bar(progress.completed, progress.pending)}<div>${progress.completed} / ${progress.completed + progress.pending + (progress.unavailable || 0)}</div></div>`;
    }).join('')}
    <div><div>Guide Evaluation</div>${bar(assessmentProgress.guideEval.completed, assessmentProgress.guideEval.pending)}<div>${assessmentProgress.guideEval.completed} / ${assessmentProgress.guideEval.completed + assessmentProgress.guideEval.pending}</div></div>
    ${getSeeProgressRows_().map(item=>`<div><div>${escapeHtml(item.label)}</div><span>Evaluated outside this app</span></div>`).join('')}
  </div>`;
}

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

function buildCoordinatorTeamActions_(team) {
  const eye = renderLucideIcon_('eye');
  const mail = renderLucideIcon_('mail');
  const label = escapeHtml(String(team.teamId));
  const recipients = team.emailRecipients || [];
  const email = recipients.length
    ? `<a class="btn btn-sm btn-outline" href="${escapeHtml('mailto:' + recipients.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent('Capstone — Team ' + team.teamId))}" aria-label="Email guide and members of team ${label}" title="Email guide and team members">${mail}</a>`
    : `<button type="button" class="btn btn-sm btn-outline" disabled aria-label="No email addresses available for team ${label}" title="No email addresses available">${mail}</button>`;
  return `<div><button type="button" class="btn btn-sm btn-outline" onclick="focusCoordinatorTeam(this.closest('tr').getAttribute('data-team-id'))" aria-label="View team ${label}" title="View team details">${eye}</button>${email}</div>`;
}

function buildCompletionIndicator_(status) {
  if (status === 'Completed') return '<span class="badge badge--success">Completed</span>';
  if (status === 'Pending') return '<span class="badge badge--warning">Pending</span>';
  if (/^loading/i.test(status || '')) return getSkeletonMarkup_('inline', 'Loading assessment');
  return '<span class="badge badge--danger">' + escapeHtml(status || 'Unavailable') + '</span>';
}

function buildTeamTrackerTable(teamData, deadlinePills) {
  deadlinePills = deadlinePills || [];
  let configuredReviews = [];
  try { configuredReviews = getInternalReviews_(); } catch (err) { /* See configuration card. */ }
  const attentionCount = teamData.filter(t => t.health === 'attention').length;
  const onTrackCount = teamData.filter(t => t.health === 'ontrack').length;
  const rows = teamData.map(t => {
    const titleBadge = t.titleStatus === 'APPROVED' ? '<span class="badge badge--success">Approved</span>' : t.titleStatus === 'NEEDS_REVIEW' ? '<span class="badge badge--warning">Review</span>' : t.titleStatus === 'REJECTED_BY_GUIDE' ? '<span class="badge badge--danger">Rejected</span>' : '<span class="badge badge--info">Pending</span>';
    const repoLabel = escapeHtml([t.repoStatus === 'ready' ? 'Repository URL recorded' : 'Pending', t.githubMessage, t.githubTiming, t.repoUrl ? 'Repository available' : ''].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' ? '));
    const repoBadge = t.repoStatus === 'loading' ? getSkeletonMarkup_('inline', 'Checking GitHub setup') : `<span class="badge badge--${t.repoStatus === 'ready' ? 'success' : 'danger'}" tabindex="0" aria-label="${repoLabel}" title="${repoLabel}">${t.repoStatus === 'ready' ? 'Ready' : 'Pending'}</span>`;
    const health = t.health === 'ontrack' ? {color:'green', label:'On track', icon:'check'} : t.health === 'monitor' ? {color:'orange', label:'Monitor', icon:'clock'} : {color:'red', label:'Needs attention', icon:'triangle-alert'};
    const healthBadge = t.health === 'loading' ? getSkeletonMarkup_('inline', 'Loading health') : `<span class="badge badge--${health.color === 'green' ? 'success' : health.color === 'orange' ? 'warning' : 'danger'}" tabindex="0" aria-label="${health.label}" title="${health.label}">${health.label}</span>`;
    const registers = t.registerNumbers || [];

    return `<tr data-team-id="${escapeHtml(String(t.teamId))}" data-search="${escapeHtml([t.teamId, t.guide, ...registers].join(' ').toLowerCase())}" data-deadlines="${escapeHtml((t.pendingDeadlines || []).join(' '))}" data-health="${escapeHtml(t.health)}" data-title-status="${escapeHtml(t.titleStatus)}" data-repo-status="${escapeHtml(t.repoStatus)}"><td data-sort-value="${escapeHtml(String(t.teamId))}"><strong>${escapeHtml(t.teamId)}</strong><div>${registers.length ? registers.map(value => escapeHtml(value)).join(', ') : '—'}</div></td><td>${escapeHtml(t.guide)}</td><td class="col-repo" data-sort-value="${escapeHtml(String(t.repoStatus || 'Unavailable'))}">${repoBadge}</td><td class="col-status" data-sort-value="${escapeHtml(String(t.titleStatus || 'Unavailable'))}">${titleBadge}</td><td data-col="activity">${getSkeletonMarkup_('inline', 'Loading weekly activity')}</td>${configuredReviews.map(review => `<td class="col-review" data-col="review" data-sort-value="${escapeHtml(String(t.health === 'loading' ? 'loading' : t.reviews[review.key] || 'Unavailable'))}">${t.health === 'loading' ? getSkeletonMarkup_('inline', 'Loading ' + review.label) : buildCompletionIndicator_(t.reviews[review.key])}</td>`).join('')}<td class="col-guide-evaluation" data-col="guide-evaluation" data-sort-value="${escapeHtml(String(t.guideEvaluation || 'Unavailable'))}">${buildCompletionIndicator_(t.guideEvaluation)}</td><td data-col="health" data-sort-value="${escapeHtml(String(t.health || 'Unavailable'))}">${healthBadge}</td><td class="col-action">${buildCoordinatorTeamActions_(t)}</td></tr>`;
  }).join('');

  return `<div class="card" data-team-tracker="coordinator"><div class="tracker-header"><h3>Team Tracker (${teamData.length} teams)</h3></div>
    <div class="segmented" data-tracker-filters>
      <button class="active" data-filter="all" aria-pressed="true" onclick="filterTeamTracker(this, 'all')">All (${teamData.length})</button>
      <button data-filter="attention" aria-pressed="false" ${teamData.some(t => t.health === "loading") ? "disabled" : ""} onclick="filterTeamTracker(this, 'attention')">Attention (${teamData.some(t => t.health === 'loading') ? getSkeletonMarkup_('inline', 'Loading attention count') : attentionCount})</button>
      <button data-filter="ontrack" aria-pressed="false" ${teamData.some(t => t.health === "loading") ? "disabled" : ""} onclick="filterTeamTracker(this, 'ontrack')">On Track (${teamData.some(t => t.health === 'loading') ? getSkeletonMarkup_('inline', 'Loading on-track count') : onTrackCount})</button>
      ${deadlinePills.map(pill => `<button class="deadline-pill${pill.overdue ? ' deadline-overdue' : ''}" data-filter="deadline:${escapeHtml(pill.key)}" aria-pressed="false" title="Due ${escapeHtml(formatProjectDay_(pill.due))}" onclick="filterTeamTracker(this, this.getAttribute('data-filter'))">${escapeHtml(pill.label)} (${pill.count})${pill.overdue ? ' <span class="badge badge--danger">Overdue</span>' : ''}</button>`).join('')}
    </div>
    <button class="btn btn-outline" type="button" id="weeklyActivityRetry" onclick="loadCoordinatorWeeklyActivity()" hidden>Retry activity</button>
    <div><input type="text" id="trackerSearch" aria-label="Search teams by team ID, register number, or guide" placeholder="Search team, register number, or guide…" oninput="filterTrackerSearch()"><button class="btn btn-outline" onclick="resetTrackerFilters()">Reset</button></div>
    <div class="tracker-table-scroll table-wrap" data-tooltip-boundary role="region" aria-label="Team tracker table, scroll horizontally for more columns" tabindex="0"><table class="table table--compact"><thead><tr><th data-sort-type="text">Team</th><th data-sort-type="text">Guide</th><th data-sort-type="text">Repo</th><th data-sort-type="text">Title</th><th data-sort-type="pair" title="Sort by logs, then commit records">Weekly Activity</th>${configuredReviews.map(review => `<th data-sort-type="text" class="col-review" title="${escapeHtml(review.label)}">${escapeHtml(review.label.replace(/^Review\s+(\d+)$/i, 'R$1'))}</th>`).join('')}<th data-sort-type="text">Guide Eval</th><th data-sort-type="text">Health</th><th>Actions</th></tr></thead><tbody id="trackerBody">${rows}</tbody></table></div>
    ${buildTeamPagination_('tracker', 'coord', teamData.length)}
  </div>`;
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

function buildCoordinatorContent(data) {
  return `
    <div>
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
      class="team-drawer-backdrop drawer-scrim" hidden>
    </div>

    <aside
      id="teamDrawer"
      class="drawer" data-tooltip-boundary
      role="dialog" aria-modal="true" aria-labelledby="teamDrawerTitle"
      aria-hidden="true" inert hidden>

      <div class="drawer-header">
        <div>
          <div>TEAM DETAILS</div>
          <div
            id="teamDrawerTitle"
           >
            Team
          </div>
        </div>

        <button
          type="button"
          class="btn btn-sm btn-outline" data-drawer-close
          onclick="closeCoordinatorTeamDrawer()"
          aria-label="Close">
          ${renderLucideIcon_('x')}
        </button>
      </div>

      <div
        id="teamDrawerContent"
        class="team-drawer-content drawer-body" data-drawer-content>
      </div>

      <div class="drawer-footer" hidden></div>

    </aside>
  `;
}

/** Small authorized shell; no marks, roster or historical activity reads. */
function buildCoordinatorAsyncShell_() {
  const placeholder = (id, label) => {
    if (id === 'coordinatorStats') {
      let reviews = [];
      try { reviews = getInternalReviews_(); } catch (err) { /* See System Status. */ }
      return `<div id="${id}Placeholder" class="coordinator-stats-grid" aria-label="Loading summary cards">${Array.from({length:6 + reviews.length}, () => `<div class="coordinator-stat-placeholder">${getSkeletonMarkup_('panel', label)}</div>`).join('')}</div>`;
    }
    return `<div id="${id}Placeholder" class="coordinator-card-placeholder card">${getSkeletonMarkup_('panel', label)}</div>`;
  };
  const panel = (id, label) => id === 'coordinatorTracker'
    ? `<div id="${id}" aria-busy="true">${getSkeletonMarkup_('panel', label)}</div>`
    : `${placeholder(id, label)}<div id="${id}" hidden aria-busy="true"></div>`;
  return `${buildDashboardContainerHeader_('Coordinator Dashboard', 'coord')}<div id="coordinatorAsyncRoot">
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
