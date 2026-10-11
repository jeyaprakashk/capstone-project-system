/**
 * GUIDE DASHBOARD
 *
 * Guide data retrieval and decisions. The browser receives DTOs from guide-api.js
 * and renders them in guide-view.js; this file builds no markup.
 */

function getGuideDashboardData_(email, timings) {
  const TS = timedPhase_(timings, 'team_status_read', () => { const map = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS); getSheetRows_(SHEET_NAMES.TEAM_STATUS); return map; });
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS);
  const myRows = rows.filter(r => emailsMatch_(r[TS.GUIDE_EMAIL], email));
  const repoUrlMap = timedPhase_(timings, 'repository_map', () => getRepoUrlMap_());
  const schedule = timedPhase_(timings, 'schedule', () => getProjectSchedule_()), clock = getProjectClock_(schedule);
  const logsByTeam = timedPhase_(timings, 'log_entries_read', () => groupBy_(readLogEntries_(), row => row.teamId));

  const STATUS_PRIORITY = {
    NEEDS_REVIEW: 0, NOT_SUBMITTED: 1, RETURNED: 2, REOPENED: 3, AWAITING_REVIEWER: 4, APPROVED: 5, UNAVAILABLE: 6
  };
  // Each team's title state comes from TitleLog, read once. A team whose history is not valid is UNAVAILABLE and nothing else.
  const titleIndex = timedPhase_(timings, 'title_log_read', () => readTitleIndex_());

  const sharedLogReads = {timings};
  const teams = timedPhase_(timings, 'team_log_summaries', () => myRows.map(r => { const title = titleTryState_(titleIndex, r[TS.TEAM_ID]); return { row: r, title, status: title.state ? title.state.status : 'UNAVAILABLE', repoUrl: repoUrlMap[normalizeText_(r[TS.TEAM_ID])] || '', logWeeks:getTeamLogWeekSummary_(r, TS, logsByTeam[normalizeText_(r[TS.TEAM_ID])] || [], schedule, clock, sharedLogReads) }; })
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]));

  const counts = { NOT_SUBMITTED: 0, NEEDS_REVIEW: 0, RETURNED: 0, AWAITING_REVIEWER: 0, APPROVED: 0, REOPENED: 0, UNAVAILABLE: 0 };
  teams.forEach(t => counts[t.status]++);

  return { teams, counts, schedule, clock, windows:sharedLogReads.windows };
}

function guideRecordDate_(value) {
  const date=value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB',{timeZone:getSpreadsheet_().getSpreadsheetTimeZone(),day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
}

function getTeamStatus_(r) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  if (!r[TS.TITLE]) return 'NOT_SUBMITTED';
  if (textEquals_(r[TS.REVIEWER_DECISION], 'Approved')) return 'APPROVED';
  if (textEquals_(r[TS.REVIEWER_DECISION], 'Revise')) return 'REVISE_AWAITING_STUDENT';
  if (textEquals_(r[TS.GUIDE_DECISION], 'Rejected')) return 'REJECTED_BY_GUIDE';
  if (textEquals_(r[TS.GUIDE_DECISION], 'Approved')) return 'AWAITING_REVIEWER';
  return 'NEEDS_REVIEW';
}

function submitGuideDecision_(teamId, decision, notes, editedTitle) {
  const email = Session.getActiveUser().getEmail();
  // Release 0 (TITLE-REVISION-PLAN.md, section 11): the write takes the script lock and rereads TITLE_CUTOVER under it.
  return withTitleWriteLock_(1000, 'Another decision is being saved. Try again.', () => applyGuideDecision_(teamId, decision, notes, email, editedTitle));
}
