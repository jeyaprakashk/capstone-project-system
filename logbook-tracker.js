/**
 * LOGBOOK TRACKER
 * Weekly progress logging, GitHub commit analysis
 * Uses common-helpers, common-constants
 */

// ===================================================================
// FORM SUBMISSION HANDLER
// ===================================================================
function onFormSubmit(e) {
  if (!textEquals_(e.range.getSheet().getName(), 'Form Responses 1')) return;

  const [timestamp, email, teamId, weeklyNotes, hoursSpent, commits, blockers] = e.values.slice(0, 7);

  const RAW_LOG = getColumnMap(SHEET_NAMES.RAW_LOG, {
    TIMESTAMP: 'Timestamp', EMAIL: 'Email', TEAM_ID: 'Team ID',
    WEEKLY_NOTES: 'Weekly Notes', HOURS_SPENT: 'Hours Spent',
    COMMITS: 'Recent Commits', BLOCKERS: 'Blockers'
  });

  const logSheet = getSheet(SHEET_NAMES.RAW_LOG);
  logSheet.appendRow([timestamp, email, teamId, weeklyNotes, hoursSpent, commits, blockers]);

  MailApp.sendEmail(email, `Weekly log recorded — Team ${teamId}`,
    `Your progress for the week has been recorded.\n\nNotes: ${weeklyNotes}\nHours: ${hoursSpent}`);
}

// ===================================================================
// GITHUB COMMIT FETCHING
// ===================================================================
function fetchCommitsForTeam(repoOwner, repoName, weeks) {
  weeks = weeks || 4;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 7 * weeks);
  const isoSince = sinceDate.toISOString();

  const url = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/commits?since=${isoSince}`;
  const options = {
    method: 'GET',
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    Logger.log(`GitHub API error for ${repoOwner}/${repoName}: ${response.getResponseCode()}`);
    return [];
  }

  return JSON.parse(response.getContentText());
}

function fetchAllCommits() {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const commitSheet = getSheet(SHEET_NAMES.COMMITS);
  const repoMap = getRepoUrlMap();

  const processed = [];
  statusRows.forEach(row => {
    const teamId = row[TS.TEAM_ID];
    const repoUrl = repoMap[normalizeText_(teamId)];
    if (!repoUrl) return;

    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s.]+)/);
    if (!match) return;
    const [, owner, repo] = match;

    try {
      const commits = fetchCommitsForTeam(owner, repo, 4);
      const csvLines = commits.map(c => [
        new Date(c.commit.committer.date),
        teamId,
        c.commit.message.split('\n')[0],
        c.author ? c.author.login : '(unknown)',
        repoUrl
      ]);
      if (csvLines.length > 0) commitSheet.appendRows(csvLines);
      processed.push({ teamId, count: commits.length });
    } catch (err) {
      Logger.log(`Error fetching commits for ${teamId}: ${err.message}`);
    }
  });

  Logger.log(`Fetched commits for ${processed.length} teams`);
  return processed;
}

// ===================================================================
// WEEKLY ANALYSIS & PRIORITY LIST
// ===================================================================
function weeklyAnalysis() {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r => r[TS.TEAM_ID]);
  const logRows = getSheetRows(SHEET_NAMES.RAW_LOG);
  const commitRows = getSheetRows(SHEET_NAMES.COMMITS);

  const schedule = getProjectSchedule_();
  const clock = getProjectClock_(schedule);
  const logsThisWeek = logRows.filter(r => isCurrentProjectWeek_(r[0], schedule, clock));
  const logsThisWeekByTeam = groupBy(logsThisWeek, r => r[2]);
  const weeklyCounts = aggregateWeeklyActivity_(statusRows.map(row => row[TS.TEAM_ID]), logRows, commitRows, {schedule, clock, state:clock.active ? 'active' : clock.today < schedule.week1 ? 'not-started' : 'ended'});
  const allLogsByTeam = groupBy(logRows, r => r[2]);

  const analysis = statusRows.map(r => {
    const teamId = r[TS.TEAM_ID];
    const activity = {
      logs: weeklyCounts[normalizeText_(teamId)].logs,
      commits: weeklyCounts[normalizeText_(teamId)].commits,
      lastLog: logsThisWeekByTeam[normalizeText_(teamId)]
        ? new Date(Math.max(...logsThisWeekByTeam[normalizeText_(teamId)].map(row => new Date(row[0]).getTime())))
        : null
    };
    const logWeeks = getTeamLogWeekSummary_(r, TS, allLogsByTeam[normalizeText_(teamId)] || [], schedule, clock);
    return { team: r, activity, logWeeks };
  });

  const inactive = analysis.filter(a => a.logWeeks.missing > 0);
  return { analysis, inactive };
}

function getReviewPriorityList() {
  const { analysis, inactive } = weeklyAnalysis();
  return analysis
    .sort((a, b) => {
      const scoreA = (a.activity.commits * 0.4 + a.activity.logs * 0.6);
      const scoreB = (b.activity.commits * 0.4 + b.activity.logs * 0.6);
      return scoreB - scoreA;
    })
    .map((a, rank) => ({
      rank: rank + 1, team: a.team[0], score: a.activity.commits * 0.4 + a.activity.logs * 0.6,
      commits: a.activity.commits, logs: a.activity.logs
    }));
}

function sendWeeklyAnalysisDigest() {
  const { inactive } = weeklyAnalysis();
  if (inactive.length === 0) return;

  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const lines = inactive.map(a => `Team ${a.team[TS.TEAM_ID]}: ${a.logWeeks.missing} student weekly log(s) overdue`).join('\n');
  MailApp.sendEmail(getCoordinatorEmail(), `Weekly Analysis — ${inactive.length} team(s) missing weekly logs`,
    `These teams have missing logs for completed project weeks:\n\n${lines}`);
}

// ===================================================================
// TRIGGER SETUP
// ===================================================================
function setupLogbookTriggers() {
  ScriptApp.newTrigger('fetchAllCommits').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(6).create();
  ScriptApp.newTrigger('sendWeeklyAnalysisDigest').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(9).create();
}