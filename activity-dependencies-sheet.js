/**
 * ACTIVITY DEPENDENCIES SHEET - setup entry point and first-creation formatting.
 * Specified in ACTIVITY-DEPENDENCIES-SHEET-PLAN.md. The name, headers and access mode live in the sheet catalog
 * (sheet-columns.js), not here. Reading and validating the rows is the engine's job (ACTIVITY-DEPENDENCIES-PLAN.md).
 * Setup creates the sheet empty; the coordinator enters the rows at cutover. Temporary: setupTitleStorage replaces
 * setupActivityDependencies in the title plan's Phase 1.
 */

/** Editor-run. Creates the ActivityDependencies sheet if needed and returns what was created or repaired. */
function setupActivityDependencies() {
  requireTriggerOrOperator_();
  return ensureActivityDependenciesSheet_();
}

function ensureActivityDependenciesSheet_() {
  return ensureSheet_({...sheetSpec_('activityDependencies'), mode: 'setup', onCreate: formatActivityDependenciesSheet_});
}

/**
 * Cosmetic, run once when the sheet is first created: plain-text columns, a frozen header row and a Yes/No list for Active.
 * The sheet is correct without it, and the parser still rejects any other Active value (a pasted value can bypass a list).
 */
function formatActivityDependenciesSheet_(sheet) {
  const headers = sheetSpec_('activityDependencies').headers;
  const activeColumn = headers.indexOf('Active') + 1;
  const rows = sheet.getMaxRows();
  sheet.getRange(1, 1, rows, headers.length).setNumberFormat('@');
  sheet.setFrozenRows(1);
  const yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(false).build();
  sheet.getRange(2, activeColumn, rows - 1, 1).setDataValidation(yesNo);
}
