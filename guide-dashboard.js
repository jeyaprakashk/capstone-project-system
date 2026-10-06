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
    NEEDS_REVIEW: 0, NOT_SUBMITTED: 1, REJECTED_BY_GUIDE: 2,
    REVISE_AWAITING_STUDENT: 3, AWAITING_REVIEWER: 4, APPROVED: 5
  };

  const sharedLogReads = {};
  const teams = timedPhase_(timings, 'team_log_summaries', () => myRows.map(r => ({ row: r, status: getTeamStatus_(r), repoUrl: repoUrlMap[normalizeText_(r[TS.TEAM_ID])] || '', logWeeks:getTeamLogWeekSummary_(r, TS, logsByTeam[normalizeText_(r[TS.TEAM_ID])] || [], schedule, clock, sharedLogReads) }))
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]));

  const counts = { NOT_SUBMITTED: 0, NEEDS_REVIEW: 0, REVISE_AWAITING_STUDENT: 0, AWAITING_REVIEWER: 0, APPROVED: 0, REJECTED_BY_GUIDE: 0 };
  teams.forEach(t => counts[t.status]++);

  return { teams, counts, schedule, clock, windows:sharedLogReads.windows, ...readGuideRecordContext_(myRows, TS, timings) };
}

function guideRecordDate_(value) {
  const date=value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB',{timeZone:getSpreadsheet_().getSpreadsheetTimeZone(),day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
}

function readGuideRecordContext_(rows, TS, timings) {
  const approvals={},approvalTimes={},documentSubmissions={};
  const owned=new Map(rows.map(row=>[normalizeText_(row[TS.TEAM_ID]),row]));
  // The registry writer appends year, semester, team, guide, title, repo,
  // members, approval date and approving reviewer, in that order.
  try {
    timedPhase_(timings,'hub_registry',()=>readSheetRows_(getHubRegistrySheet_(),2)).forEach(record=>{
      const key=normalizeText_(record[2]),row=owned.get(key);
      if(!row || !textEquals_(record[0],getAcademicYear_()) || !textEquals_(record[1],row[TS.SEMESTER]) ||
        !emailsMatch_(record[3],row[TS.GUIDE_EMAIL]) || String(record[4])!==String(row[TS.TITLE]) ||
        !emailsMatch_(record[8],row[TS.TITLE_APPROVED_BY]))return;
      const date=guideRecordDate_(record[7]);if(date){approvals[key]=date;approvalTimes[key]=new Date(record[7]).getTime();}
    });
  } catch(error) { /* Approval stays authoritative even when its date cannot be read. */ }
  try {
    const sheet=getSheet_(SHEET_NAMES.TEAM_INTAKE_RAW);
    if(!sheet)throw new Error('Intake history unavailable');
    const headers=(readSheetRows_(sheet,1,1)[0] || []).map(normalizeText_);
    const column=name=>headers.indexOf(normalizeText_(name));
    const team=column('Team ID'),stamp=column('Timestamp'),work=column('Work Breakdown Document'),need=column('Need Analysis Report');
    if(team<0 || stamp<0 || (work<0 && need<0))throw new Error('Intake history columns unavailable');
    const latest={};
    timedPhase_(timings,'intake_history',()=>readSheetRows_(sheet,2)).forEach(record=>{
      const key=normalizeText_(record[team]),at=new Date(record[stamp]).getTime();
      if(!owned.has(key) || (!record[work] && !record[need]) || !Number.isFinite(at))return;
      if(!latest[key] || at>latest[key])latest[key]=at;
    });
    Object.keys(latest).forEach(key=>{documentSubmissions[key]=guideRecordDate_(latest[key]);});
  } catch(error) { owned.forEach((row,key)=>{documentSubmissions[key]='Date unavailable';}); }
  return {approvals,approvalTimes,documentSubmissions};
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
  return applyGuideDecision_(teamId, decision, notes, email, editedTitle);
}
