/**
 * TITLE STORAGE - the editor-run setup of the title sheets and the coordinator's read-only check of the log
 * (archive/plans/TITLE-REVISION-PLAN.md, sections 10 and 11). Names, headers and access modes live in the sheet catalog (sheet-columns.js).
 */
const TITLE_REPORT_LIMIT_ = 200;

/** Editor-run. Creates TitleLog and ActivityDependencies when absent and appends missing headers. Never writes a data row. */
function setupTitleStorage() {
  requireTriggerOrOperator_();
  return {
    titleLog: ensureSheet_({...sheetSpec_('titleLog'), mode: 'setup', onCreate: formatTitleLogSheet_}),
    activityDependencies: ensureActivityDependenciesSheet_()
  };
}

/** Cosmetic, run once when the sheet is first created: a frozen header row. */
function formatTitleLogSheet_(sheet) {
  sheet.setFrozenRows(1);
}

/**
 * The report for the coordinator, from the parsed log rows and the roster's team IDs. It changes nothing.
 * A roster team without a row is information only (the team has not submitted yet).
 * Returns {ok, rows, rosterTeams, errors: [{kind, teamId, message}], information: [...], truncated}.
 */
function titleLogReport_(logRows, rosterTeamIds, nowMs) {
  const index = titleIndex_(logRows, nowMs);
  const roster = Object.create(null);
  rosterTeamIds.forEach(id => { const key = titleTeamKey_(id); if (key) roster[key] = String(id).trim(); });
  const errors = [], information = [];
  let truncated = false;
  const add = (list, item) => { if (list.length < TITLE_REPORT_LIMIT_) list.push(item); else truncated = true; };

  Object.keys(roster).sort().forEach(key => {
    if (index.teams[key]) return;
    add(information, {kind: 'NO_ROW', teamId: roster[key], message: 'Has not submitted a title yet.'});
  });
  Object.keys(index.teams).sort().forEach(key => {
    const team = index.teams[key];
    if (!roster[key]) add(errors, {kind: 'NOT_ON_ROSTER', teamId: team.teamId, message: 'In the log but not on the roster.'});
    team.errors.forEach(message => add(errors, {kind: 'INVALID_HISTORY', teamId: team.teamId, message}));
    team.rows.forEach(row => {
      if (row.action === 'BASELINE' && row.status === 'APPROVED' && (row.approvedAt === null || row.approvedAt === undefined || Number.isNaN(row.approvedAt))) {
        add(errors, {kind: 'APPROVED_WITHOUT_DATE', teamId: team.teamId, message: 'The approved baseline in row ' + row.row + ' has no Approved At.'});
      }
    });
  });
  return {ok: errors.length === 0, rows: logRows.length, rosterTeams: Object.keys(roster).length, errors, information, truncated};
}

function buildTitleLogReport_() {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rosterIds = getSheetRows_(SHEET_NAMES.TEAM_STATUS).map(row => row[TS.TEAM_ID]).filter(id => String(id || '').trim() !== '');
  return titleLogReport_(readTitleLog_().rows, rosterIds, Date.now());
}

/** Editor-run: the same report as API_coordinator_validateTitleLog, written to the execution log. */
function validateTitleLog() {
  requireTriggerOrOperator_();
  const report = buildTitleLogReport_();
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function API_coordinator_validateTitleLog() {
  return apiHandle_(() => { coordinatorAccessOrThrow_(); return buildTitleLogReport_(); });
}
