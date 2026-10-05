/**
 * STUDENT DASHBOARD
 * Student data retrieval. The browser receives a DTO from student-api.js and renders it in
 * student-view.js; this file builds no markup.
 */

let STUDENT_PERF_ = null;

function studentPerfReset_() {
  STUDENT_PERF_ = { measurements: [], startedAt: Date.now() };
}

function studentPerfLog_(label, startMs) {
  const now = Date.now();
  const ms = now - startMs;
  if (STUDENT_PERF_) STUDENT_PERF_.measurements.push({ label: label, ms: ms });
  console.log('[STUDENT PERF] ' + label + ': ' + ms + ' ms');
  return now;
}

/**
 * Sheet-only part of the dashboard: title status, repository URL and roster. It makes no GitHub,
 * schedule or clock calls, so the Weeks and Assessments screens never wait for them.
 */
function getStudentBaseData_(teamId, teamStatusRow) {
  const perfStart = Date.now();
  let perfLap = perfStart;
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);

  // Reuse the TeamStatus row already read during authorization when available.
  // This is request-local data only; nothing is persisted between requests.
  let r = teamStatusRow;
  if (!r) {
    const statusSheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
    const statusRow = findTeamStatusRow_(statusSheet, teamId, TS);
    if (statusRow < 2) throw new Error('Student team was not found.');
    r = readSheetRows_(statusSheet, statusRow, 1)[0];
  }

  perfLap = studentPerfLog_('TeamStatus row + column map', perfLap);

  const titleStatus = getTeamStatus_(r);
  const note = textEquals_(r[TS.REVIEWER_DECISION], 'Revise') ? r[TS.REVIEWER_NOTES]
    : textEquals_(r[TS.GUIDE_DECISION], 'Rejected') ? r[TS.GUIDE_NOTES]
    : '';

  const statusSheetForRepo = getSheet_(SHEET_NAMES.TEAM_STATUS);
  const repoCol = getOptionalHeaderIndex_(statusSheetForRepo, 'Repo URL');
  const repoUrl = repoCol >= 0 ? String(r[repoCol] || '').trim() : '';
  perfLap = studentPerfLog_('Repository URL lookup', perfLap);

  const rosterSlots = [
    { name: r[TS.S1_NAME], email: r[TS.S1_EMAIL], regno: r[TS.S1_REGNO] },
    { name: r[TS.S2_NAME], email: r[TS.S2_EMAIL], regno: r[TS.S2_REGNO] },
    { name: r[TS.S3_NAME], email: r[TS.S3_EMAIL], regno: r[TS.S3_REGNO] },
    { name: r[TS.S4_NAME], email: r[TS.S4_EMAIL], regno: r[TS.S4_REGNO] },
  ].filter(s => s.email);
  perfLap = studentPerfLog_('Roster and title state', perfLap);

  studentPerfLog_('getStudentBaseData_ TOTAL', perfStart);
  return { teamId, title: r[TS.TITLE], problem: r[TS.PROBLEM], titleStatus, note, repoUrl, rosterSlots };
}

function getStudentDashboardData_(email, teamId, teamStatusRow) {
  const perfStart = Date.now();
  let perfLap = perfStart;
  const base = getStudentBaseData_(teamId, teamStatusRow);

  const github = getStudentGithubState_(email, teamId, base.rosterSlots, base.repoUrl);
  perfLap = studentPerfLog_('GitHub state (getStudentGithubState_)', perfLap);
  const { githubAccount, githubCaptureReady, githubState, githubText, githubUsername, githubNeedsUsername, githubReady, githubCanRetry, githubSetup } = github;

  const schedule = getProjectSchedule_();
  const clock = getProjectClock_(schedule);
  perfLap = studentPerfLog_('Schedule and clock', perfLap);

  studentPerfLog_('getStudentDashboardData_ TOTAL', perfStart);

  return {
    teamId, title: base.title, problem: base.problem,
    titleStatus: base.titleStatus, note: base.note,
    githubAccount, githubCaptureReady, githubState, githubText, githubUsername, githubNeedsUsername, githubReady, githubCanRetry, githubSetup, repoUrl: base.repoUrl,
    rosterSlots: base.rosterSlots, schedule, clock
  };
}

function initialsOf_(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
