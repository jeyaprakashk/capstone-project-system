/**
 * TITLE BASELINE IMPORT - cutover step 4 (TITLE-REVISION-PLAN.md, section 11). One editor-run function copies the title state that
 * TeamStatus holds into TitleLog, one BASELINE row per team, so the new workflow starts from where the Form-based one stopped.
 * It is the only code that still reads the old title columns, and it is deleted after the cutover (the removal check excludes it by name).
 *
 *  - Runs only while TITLE_CUTOVER is PAUSED, so no old writer can change a decision while it copies (cutover step 2).
 *  - Idempotent: a team that already has rows in TitleLog is left alone; run it again after fixing a reported team.
 *  - An approved team needs its approval date, read from the master registry by year, semester and team. The guide, title (ignoring case
 *    and spaces) and approver should match too; when only the team matches, the date is used and the team is listed under `relaxed` to
 *    check. A team with no registry row at all is reported and not written, and the coordinator enters its row by hand.
 *  - It writes nothing but TitleLog rows, in one batch, and then checks every team it wrote with the history rules.
 */
const TITLE_BASELINE_LOCK_WAIT_MS_ = 30000;

/** What the old model called the team's status: the same order of checks the old dashboards used. */
function legacyTitleStatus_(row, TS) {
  if (!String(row[TS.TITLE] || '').trim()) return 'NOT_SUBMITTED';
  if (textEquals_(row[TS.REVIEWER_DECISION], 'Approved')) return 'APPROVED';
  if (textEquals_(row[TS.REVIEWER_DECISION], 'Revise') || textEquals_(row[TS.GUIDE_DECISION], 'Rejected')) return 'RETURNED';
  if (textEquals_(row[TS.GUIDE_DECISION], 'Approved')) return 'AWAITING_REVIEWER';
  return 'NEEDS_REVIEW';
}

/** The approval date of an approved team from the registry rows, or null: year, semester, team, guide, title and approver must all match. */
function legacyApprovalDate_(registryRows, row, TS, academicYear) {
  const sameTeam = registryRows.filter(record => textEquals_(record[0], academicYear) && textEquals_(record[1], row[TS.SEMESTER]) && textEquals_(record[2], row[TS.TEAM_ID]));
  const sameText = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
  // Exact: the guide, the title (ignoring case and surrounding spaces) and the approver all match, as the old eligibility code required.
  const exact = sameTeam.filter(record => emailsMatch_(record[3], row[TS.GUIDE_EMAIL]) && sameText(record[4], row[TS.TITLE]) && emailsMatch_(record[8], row[TS.TITLE_APPROVED_BY]));
  const pick = list => { const ms = titleDateMs_(list[list.length - 1][7]); return Number.isFinite(ms) ? ms : null; };
  if (exact.length) { const at = pick(exact); return at === null ? null : {at, relaxed: false}; }
  // Relaxed: the registry has the team for this year and semester but its guide, title or approver text differs (a title edited since,
  // a trailing space). The date is still that team's approval; the report lists it so the coordinator can check it.
  if (sameTeam.length) { const at = pick(sameTeam); return at === null ? null : {at, relaxed: true}; }
  return null;
}

/**
 * The BASELINE row objects for the roster teams without rows, and the teams that cannot be written yet.
 * Pure: it takes plain data. `existing` is a map of normalized Team IDs that already have rows.
 */
function buildTitleBaseline_(statusRows, TS, registryRows, existing, context) {
  const rows = [], skipped = [], problems = [], relaxed = [];
  const seen = Object.create(null);
  statusRows.forEach(source => {
    const teamId = String(source[TS.TEAM_ID] || '').trim();
    if (!teamId) return;
    const key = titleTeamKey_(teamId);
    if (seen[key]) { problems.push({teamId, message: 'The team appears more than once on the roster.'}); return; }
    seen[key] = true;
    if (existing[key]) { skipped.push(teamId); return; }
    const status = legacyTitleStatus_(source, TS);
    const title = status === 'NOT_SUBMITTED' ? '' : String(source[TS.TITLE] || '').trim();
    const problem = status === 'NOT_SUBMITTED' ? '' : String(source[TS.PROBLEM] || '').trim();
    const returnedByReviewer = textEquals_(source[TS.REVIEWER_DECISION], 'Revise');
    const row = {
      timestamp: context.now, teamId, revision: 1, action: 'BASELINE', actor: context.actor, requestId: 'baseline:' + teamId, fingerprint: '', status,
      title, problem, notes: status === 'RETURNED' ? String(source[returnedByReviewer ? TS.REVIEWER_NOTES : TS.GUIDE_NOTES] || '').trim() : '',
      similarityNote: status === 'NOT_SUBMITTED' ? '' : String(source[TS.SIMILARITY_FLAG] || '').trim(), reopened: false,
      approvedTitle: '', approvedProblem: '', approvedAt: null, approvedBy: ''
    };
    if (status === 'APPROVED') {
      const found = legacyApprovalDate_(registryRows, source, TS, context.academicYear);
      const approvedAt = found ? found.at : null;
      if (found && found.relaxed) relaxed.push(teamId);
      if (approvedAt === null) { problems.push({teamId, message: 'Approved, but no matching approval date was found in the master registry. Enter its TitleLog row by hand.'}); return; }
      if (approvedAt > context.now) { problems.push({teamId, message: 'The approval date in the master registry is in the future.'}); return; }
      Object.assign(row, {approvedTitle: title, approvedProblem: problem, approvedAt, approvedBy: String(source[TS.TITLE_APPROVED_BY] || '').trim()});
      if (!row.approvedBy) { problems.push({teamId, message: 'Approved, but the approving reviewer is not recorded.'}); return; }
    }
    rows.push(row);
  });
  return {rows, skipped, problems, relaxed: relaxed.filter(id => rows.some(row => row.teamId === id))};
}

/** Editor-run. See the header. Returns {written, skipped, problems, invalid}. */
function importTitleBaseline() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(TITLE_BASELINE_LOCK_WAIT_MS_); }
  catch (error) { throw new Error('Another change is running. Run this again shortly.'); }
  try {
    const cutover = readTitleCutover_();
    if (cutover !== 'PAUSED') throw new Error("Run setTitleCutover('PAUSED') first" + (cutover === 'LIVE' ? '; the cutover is already LIVE, and the baseline is imported before it.' : '.'));
    const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const statusRows = getSheetRows_(SHEET_NAMES.TEAM_STATUS);
    const log = readTitleLog_();
    const existing = Object.create(null);
    log.rows.forEach(row => { existing[titleTeamKey_(row.teamId)] = true; });
    const registryRows = readSheetRows_(getHubRegistrySheet_(), 2);
    const plan = buildTitleBaseline_(statusRows, TS, registryRows, existing, {now: Date.now(), actor: Session.getActiveUser().getEmail(), academicYear: getAcademicYear_()});
    if (plan.rows.length) {
      const values = plan.rows.map(row => titleLogValues_(row, log.columns));
      const target = log.sheet.getLastRow() + 1, last = target + values.length - 1;
      if (last > log.sheet.getMaxRows()) log.sheet.insertRowsAfter(log.sheet.getMaxRows(), last - log.sheet.getMaxRows());
      log.sheet.getRange(target, 1, values.length, values[0].length).setValues(values);
      SpreadsheetApp.flush();
    }
    // Check what is there now with the same rules every read applies; a team that fails is reported, never hidden.
    const index = titleIndex_(readTitleLog_().rows, Date.now());
    const invalid = plan.rows.map(row => ({teamId: row.teamId, errors: (index.teams[titleTeamKey_(row.teamId)] || {errors: ['The row was not found after writing.']}).errors}))
      .filter(item => item.errors.length);
    return {written: plan.rows.length, skipped: plan.skipped, problems: plan.problems, relaxed: plan.relaxed, invalid};
  } finally {
    lock.releaseLock();
  }
}
