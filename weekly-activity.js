/** Independent scoped readers; shared aggregation. No persistent activity cache or locks. */
function readActivityRows_(sheetName, column, value, width) {
  const sheet = getSheet(sheetName);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  if (column === null) return sheet.getRange(2, 1, last - 1, width).getValues();
  const matches = sheet.getRange(2, column, last - 1, 1)
    .createTextFinder(normalizedTextPattern_(String(value))).useRegularExpression(true)
    .matchEntireCell(true).matchCase(false).findAll();
  return readMatchedRows_(sheet, matches, 1, width);
}

function weeklyActivityContext_() {
  try {
    const schedule = getProjectSchedule_(), clock = getProjectClock_(schedule);
    return {schedule, clock, state:clock.active ? 'active' : clock.today < schedule.week1 ? 'not-started' : 'ended'};
  } catch (err) { return {state:'unavailable'}; }
}

function aggregateWeeklyActivity_(teamIds, logs, commits, context, student) {
  const teams = Object.create(null);
  teamIds.forEach(id => { teams[normalizeText_(id)] = {logs:0, commits:student && !student.username ? null : 0}; });
  if (context.state !== 'active') {
    Object.values(teams).forEach(value => { value.logs = null; value.commits = null; });
    return teams;
  }
  logs.forEach(row => {
    const value = teams[normalizeText_(row[2])];
    if (value && (!student || emailsMatch(row[1], student.email)) && isCurrentProjectWeek_(row[0], context.schedule, context.clock)) value.logs++;
  });
  commits.forEach(row => {
    const value = teams[normalizeText_(row[1])];
    if (value && (!student || (student.username && textEquals_(row[3], student.username))) && isCurrentProjectWeek_(row[0], context.schedule, context.clock)) value.commits++;
  });
  return teams;
}

function activityResponse_(context, teams) {
  return {state:context.state, week:context.clock ? context.clock.week : null, checkedAt:new Date().toISOString(), teams};
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
      active ? readActivityRows_(SHEET_NAMES.RAW_LOG, null, null, 3) : [],
      active ? readActivityRows_(SHEET_NAMES.COMMITS, null, null, 4) : [], context);
    return {...activityResponse_(context, teams), totalTeams:Object.keys(teams).length,
      activeTeams:active ? Object.values(teams).filter(value => value.logs > 0 || value.commits > 0).length : null};
  });
}

function loadTeamWeeklyActivity(teamId) {
  return withDashboardRead_(() => {
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const sheet = getSheet(SHEET_NAMES.TEAM_STATUS);
    const rows = readActivityRows_(SHEET_NAMES.TEAM_STATUS, columns.TEAM_ID + 1, teamId, sheet.getLastColumn());
    if (rows.length !== 1) throw new Error('Team not found or duplicated.');
    authorizeActivityTeam_(Session.getActiveUser().getEmail(), rows[0], columns);
    const context = weeklyActivityContext_();
    return activityResponse_(context, getTeamWeeklyActivity_(teamId, context));
  });
}

function getTeamWeeklyActivity_(teamId, context, logs) {
  const active = context.state === 'active';
  return aggregateWeeklyActivity_([teamId],
    active ? (logs || readActivityRows_(SHEET_NAMES.RAW_LOG, 3, teamId, 3)) : [],
    active ? readActivityRows_(SHEET_NAMES.COMMITS, 2, teamId, 4) : [], context);
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
      readActivityRows_(SHEET_NAMES.GITHUB_USERNAME_RAW, 3, teamId, 4).forEach(item => mappings.set(normalizeEmail(item[1]), normalizeText_(item[3])));
      const candidate = mappings.get(studentEmail);
      if (candidate && /^[a-z\d](?:[a-z\d-]{0,38})$/.test(candidate) && [...mappings.values()].filter(value => value === candidate).length === 1) username = candidate;
      logs = readActivityRows_(SHEET_NAMES.RAW_LOG, 2, studentEmail, 3);
      if (username) commits = readActivityRows_(SHEET_NAMES.COMMITS, 2, teamId, 4);
    }
    return {...activityResponse_(context, aggregateWeeklyActivity_([teamId], logs, commits, context, {email:studentEmail, username})),
      studentEmail, commitAttribution:username ? 'mapped' : 'unavailable'};
  });
}
