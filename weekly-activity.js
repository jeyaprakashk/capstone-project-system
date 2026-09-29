/** Independent scoped readers; shared aggregation. No persistent activity cache or locks. */
function readActivityRows_(sheetName, column, value) {
  const sheet = getSheet(sheetName);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  if (column === null) return readSheetRows_(sheet, 2, last - 1);
  const matches = sheet.getRange(2, column, last - 1, 1)
    .createTextFinder(normalizedTextPattern_(String(value))).useRegularExpression(true)
    .matchEntireCell(true).matchCase(false).findAll().sort((a,b)=>a.getRow()-b.getRow());
  return readMatchedRows_(sheet, matches);
}

function weeklyActivityContext_() {
  try {
    const schedule = getProjectSchedule_(), clock = getProjectClock_(schedule);
    const windows = getWeeklySubmissionWindows_(), now = clock.now || new Date();
    const window = windows.find(w=>now.getTime() >= w.opens_at && now.getTime() <= w.closes_at);
    return {schedule, clock, window, state:window ? 'active' : now.getTime() < windows[0].opens_at ? 'not-started' : 'ended'};
  } catch (err) { return {state:'unavailable'}; }
}

function aggregateWeeklyActivity_(teamIds, logs, commits, context, student) {
  const teams = Object.create(null);
  teamIds.forEach(id => { teams[normalizeText_(id)] = {logs:0, commits:student && !student.username ? null : 0}; });
  if (context.state !== 'active') {
    Object.values(teams).forEach(value => { value.logs = null; value.commits = null; });
    return teams;
  }
  getEffectiveLogEntries_(logs).forEach(row => {
    const value = teams[normalizeText_(row.teamId)];
    if (value && row.entryStatus !== 'MISSED' && row.weekId === context.window.weekId &&
        (!student || textEquals_(row.regNo,student.regNo))) value.logs++;
  });
  commits.forEach(row => {
    const value = teams[normalizeText_(row.teamId)];
    if (value && (!student || (student.username && textEquals_(row.username, student.username))) && isCurrentProjectWeek_(row.timestamp, context.schedule, context.clock)) value.commits++;
  });
  return teams;
}

function activityResponse_(context, teams) {
  return {state:context.state, week:context.window ? context.window.weekId : null, checkedAt:new Date().toISOString(), teams};
}

function activityIsCoordinator_(email) {
  return emailsMatch(email, getCoordinatorEmail()) || emailsMatch(email, getConfig('CELL_PD_EMAIL'));
}

function authorizeActivityTeam_(email, row, columns, studentEmail) {
  if (!email || !row) throw new Error('Activity access denied.');
  if (activityIsCoordinator_(email) || emailsMatch(row[columns.GUIDE_EMAIL], email) ||
      getCommitteeNumbersForReviewer(email).some(number => textEquals_(number, row[columns.COMMITTEE_NUMBER]))) return;
  const member = [1,2,3,4].some(number => emailsMatch(row[columns['S' + number + '_EMAIL']], email));
  if (!member || (studentEmail && !emailsMatch(email, studentEmail))) throw new Error('Activity access denied.');
}

function loadAllTeamsWeeklyActivity() {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const ids = getSheetRows(SHEET_NAMES.TEAM_STATUS).map(row => row[columns.TEAM_ID]).filter(Boolean);
    const context = weeklyActivityContext_();
    const active = context.state === 'active';
    const teams = aggregateWeeklyActivity_(ids,
      active ? readLogEntries_() : [],
      active ? readCollectedCommits_() : [], context);
    return {...activityResponse_(context, teams), totalTeams:Object.keys(teams).length,
      activeTeams:active ? Object.values(teams).filter(value => value.logs > 0 || value.commits > 0).length : null};
  });
}

function loadTeamWeeklyActivity(teamId) {
  return withDashboardRead_(() => {
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = readActivityRows_(SHEET_NAMES.TEAM_STATUS, columns.TEAM_ID + 1, teamId);
    if (rows.length !== 1) throw new Error('Team not found or duplicated.');
    authorizeActivityTeam_(Session.getActiveUser().getEmail(), rows[0], columns);
    const context = weeklyActivityContext_();
    return activityResponse_(context, getTeamWeeklyActivity_(teamId, context));
  });
}

function getTeamWeeklyActivity_(teamId, context, logs) {
  const active = context.state === 'active';
  return aggregateWeeklyActivity_([teamId],
    active ? (logs || readLogEntries_(teamId)) : [],
    active ? readCollectedCommits_(teamId) : [], context);
}

function loadStudentWeeklyActivity(studentEmail) {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    studentEmail = normalizeEmail(studentEmail || email);
    if (!email || !studentEmail) throw new Error('Activity access denied.');
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const matches = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => [1,2,3,4].some(number => emailsMatch(row[columns['S' + number + '_EMAIL']], studentEmail)));
    if (matches.length !== 1) throw new Error('Student team not found or ambiguous.');
    const row = matches[0], teamId = row[columns.TEAM_ID];
    authorizeActivityTeam_(email, row, columns, studentEmail);
    const context = weeklyActivityContext_();
    let username = null, logs = [], commits = [];
    if (context.state === 'active') {
      // Latest submission per email; a username claimed by multiple people is ambiguous.
      const mappings = new Map();
      readActivityRows_(SHEET_NAMES.GITHUB_USERNAME_RAW, 3, teamId).forEach(item => mappings.set(normalizeEmail(item[1]), normalizeText_(item[3])));
      const candidate = mappings.get(studentEmail);
      if (candidate && /^[a-z\d](?:[a-z\d-]{0,38})$/.test(candidate) && [...mappings.values()].filter(value => value === candidate).length === 1) username = candidate;
      const slot = [1,2,3,4].find(n=>emailsMatch(row[columns['S'+n+'_EMAIL']],studentEmail));
      logs = readLogEntries_(teamId,row[columns['S'+slot+'_REGNO']]);
      if (username) commits = readCollectedCommits_(teamId);
    }
    return {...activityResponse_(context, aggregateWeeklyActivity_([teamId], logs, commits, context, {email:studentEmail, username,regNo:row[columns['S'+[1,2,3,4].find(n=>emailsMatch(row[columns['S'+n+'_EMAIL']],studentEmail))+'_REGNO']]})),
      studentEmail, commitAttribution:username ? 'mapped' : 'unavailable'};
  });
}
