/**
 * REQUIREMENTS ENDPOINT - the coordinator's view of the activity rules (archive/plans/ACTIVITY-DEPENDENCIES-PLAN.md, section 8). Read-only.
 * Without a team it returns the parsed rules and the loader's errors; with a team it returns that team's checklist for each
 * activity, including the checks' diagnostics, which students never see (studentRequirements_ removes them).
 */
function activityRulesReport_(ctx) {
  const loaded = loadActivityRules_(ctx);
  const rules = {};
  ACTIVITY_IDS_.forEach(id => { rules[id] = (loaded.rules[id] || []).map(rule => ({kind: rule.kind, item: rule.item, label: rule.label})); });
  return {rules, errors: loaded.errors.slice()};
}

function buildRequirementsReport_(teamId) {
  const ctx = activityContext_();
  const report = activityRulesReport_(ctx);
  const wanted = String(teamId === null || teamId === undefined ? '' : teamId).trim();
  if (!wanted) return {...report, teamId: null, activities: null};
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = getSheetRows_(SHEET_NAMES.TEAM_STATUS).find(candidate => textEquals_(candidate[TS.TEAM_ID], wanted));
  if (!row) throw apiFail_('NOT_FOUND', 'Team not found.');
  const team = {teamId: String(row[TS.TEAM_ID]).trim(), semester: row[TS.SEMESTER]};
  const activities = {};
  ACTIVITY_IDS_.forEach(id => { activities[id] = activityPreconditions_(id, team, ctx); });
  return {...report, teamId: team.teamId, activities};
}

function API_coordinator_getRequirements(teamId) {
  return apiHandle_(() => { coordinatorAccessOrThrow_(); return buildRequirementsReport_(teamId); });
}
