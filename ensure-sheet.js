/**
 * ENSURE SHEET - the common helper that creates a sheet or checks its header row.
 * Specified in ENSURE-SHEET-PLAN.md; the sheet catalog that supplies specifications is in SHEET-HEADER-MATCHING-PLAN.md.
 *
 *   ensureSheet_({name, headers, access, mode, createAtRuntime, onCreate}) -> {created, repaired}
 *
 * mode 'setup'   - editor-run setup paths: create an absent sheet, or add missing headers to an existing one (repair).
 * mode 'runtime' - the one runtime creator (createAtRuntime sheets only): create an absent sheet, validate, never repair.
 * It never deletes, reorders or renames a column and never writes a data row. Every failure throws a plain Error.
 * Headers are read through readSheetRows_ only.
 */

// Repair (appending a missing header to an existing sheet) is permitted by AGENTS.md ("Creating and repairing sheets"). It is
// a switch so that it can be turned off: while false, a missing header on an existing sheet throws like a refusal.
const ENSURE_SHEET_REPAIR_ENABLED_ = true;
const ENSURE_SHEET_LOCK_WAIT_MS_ = 30000;
const ENSURE_SHEET_RED_ = '#d93025';
const ENSURE_SHEET_GREEN_ = '#188038';
const ENSURE_SHEET_ACCESS_ = Object.freeze({
  system: Object.freeze({hidden:true, color:ENSURE_SHEET_RED_}),
  view: Object.freeze({hidden:false, color:ENSURE_SHEET_RED_}),
  edit: Object.freeze({hidden:false, color:ENSURE_SHEET_GREEN_})
});

// Per-execution memo only: a sheet already checked or written in this execution is not read again.
let ensureSheetReady_ = Object.create(null);

function ensureSheet_(spec) {
  ensureSheetValidateSpec_(spec);
  const name = String(spec.name).trim();
  const key = JSON.stringify([spec.mode, normalizeText_(name), spec.headers.map(normalizeText_), spec.access]);
  if (ensureSheetReady_[key]) return {created:false, repaired:[]};
  // Fast path: no lock and no write when nothing has to change.
  if (ensureSheetCheck_(getSheet_(name), spec, name).action === 'none') {
    ensureSheetReady_[key] = true;
    return {created:false, repaired:[]};
  }
  const result = ensureSheetLocked_(() => {
    // Decide again on fresh data: another execution may have created or repaired the sheet while this one waited.
    const sheet = getNamedSheet_(getSpreadsheet_(), name);
    return ensureSheetApply_(sheet, ensureSheetCheck_(sheet, spec, name), spec, name);
  });
  ensureSheetReady_[key] = true;
  return result;
}

function ensureSheetValidateSpec_(spec) {
  if (!spec || typeof spec !== 'object') throw new Error("ensureSheet_ needs a specification and mode: 'setup' or 'runtime'.");
  if (spec.mode !== 'setup' && spec.mode !== 'runtime') throw new Error("ensureSheet_ needs mode: 'setup' or 'runtime'.");
  const name = String(spec.name == null ? '' : spec.name).trim();
  if (!name) throw new Error('ensureSheet_ needs a sheet name.');
  if (!Array.isArray(spec.headers) || !spec.headers.length) throw new Error('ensureSheet_ needs the required headers of ' + name + '.');
  spec.headers.forEach((header, index) => {
    if (typeof header !== 'string' || !header.trim()) throw new Error('ensureSheet_: a required header of ' + name + ' is blank.');
    if (spec.headers.some((other, otherIndex) => otherIndex < index && textEquals_(other, header))) {
      throw new Error('ensureSheet_: duplicate required header in ' + name + ': ' + header + '.');
    }
  });
  if (!Object.prototype.hasOwnProperty.call(ENSURE_SHEET_ACCESS_, spec.access)) throw new Error('ensureSheet_: access must be system, view or edit for ' + name + '.');
  if (spec.onCreate !== undefined && typeof spec.onCreate !== 'function') throw new Error('ensureSheet_: onCreate must be a function.');
  if (spec.mode === 'runtime') {
    if (spec.createAtRuntime !== true) throw new Error('Runtime creation is not allowed for ' + name + '.');
    if (spec.onCreate !== undefined) throw new Error('ensureSheet_: onCreate is not allowed in runtime mode (' + name + ').');
  }
}

function ensureSheetMismatch_(name, missing, unknown) {
  return new Error(name + ' header mismatch. Missing: ' + missing.join(', ') + '.' +
    (unknown.length ? ' Unrecognised: ' + unknown.join(', ') + '.' : '') + ' Fix the header row by hand; nothing was changed.');
}

/** Read-only decision: {action: 'none' | 'create' | 'write-header' | 'append', missing, width}. Throws when the sheet must be left alone. */
function ensureSheetCheck_(sheet, spec, name) {
  if (!sheet) return {action:'create'};
  if (!sheet.getLastRow()) return {action:'write-header'};
  const header = (readSheetRows_(sheet, 1, 1)[0] || []).map(cell => String(cell == null ? '' : cell).trim());
  spec.headers.forEach(required => {
    if (header.filter(cell => textEquals_(cell, required)).length > 1) throw new Error('Duplicate header in ' + name + ': ' + required + '. Nothing was changed.');
  });
  const missing = spec.headers.filter(required => !header.some(cell => textEquals_(cell, required)));
  const unknown = header.filter(cell => cell && !spec.headers.some(required => textEquals_(cell, required)));
  if (spec.mode === 'runtime') {
    if (missing.length) throw ensureSheetMismatch_(name, missing, unknown);
    return {action:'none'};
  }
  if (header.some(cell => cell === '')) throw new Error(name + ' has content outside its header row. Nothing was changed.');
  if (!missing.length) return {action:'none'};
  if (unknown.length || !ENSURE_SHEET_REPAIR_ENABLED_) throw ensureSheetMismatch_(name, missing, unknown);
  return {action:'append', missing, width:header.length};
}

function ensureSheetLocked_(run) {
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned) {
    try { lock.waitLock(ENSURE_SHEET_LOCK_WAIT_MS_); }
    catch (error) { throw new Error('Another setup is running. Try again shortly.'); }
  }
  try { return run(); } finally { if (!owned) lock.releaseLock(); }
}

function ensureSheetColumns_(sheet, needed) {
  const max = sheet.getMaxColumns();
  if (needed > max) sheet.insertColumnsAfter(max, needed - max);
}

function ensureSheetApply_(sheet, plan, spec, name) {
  if (plan.action === 'none') return {created:false, repaired:[]};
  try {
    if (plan.action === 'create') return ensureSheetCreate_(spec, name);
    if (plan.action === 'write-header') {
      // An existing sheet with no rows: write the complete header row. Colour and visibility stay as they are.
      ensureSheetColumns_(sheet, spec.headers.length);
      sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
      return {created:false, repaired:spec.headers.slice()};
    }
    // Repair: append only the missing header cells at the right end.
    ensureSheetColumns_(sheet, plan.width + plan.missing.length);
    sheet.getRange(1, plan.width + 1, 1, plan.missing.length).setValues([plan.missing]);
    if (typeof console !== 'undefined') console.log(JSON.stringify({event:'ensureSheet_repair', sheet:name, headers:plan.missing}));
    return {created:false, repaired:plan.missing.slice()};
  } finally {
    SpreadsheetApp.flush();
    invalidateSheetCaches_(name);
  }
}

function ensureSheetCreate_(spec, name) {
  const access = ENSURE_SHEET_ACCESS_[spec.access];
  const spreadsheet = getSpreadsheet_();
  if (access.hidden && !spreadsheet.getSheets().some(existing => !existing.isSheetHidden())) {
    throw new Error(name + ' could not be hidden because it would be the only visible sheet.');
  }
  const created = spreadsheet.insertSheet(name);
  ensureSheetColumns_(created, spec.headers.length);
  created.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
  created.setTabColor(access.color);
  if (access.hidden) created.hideSheet();
  if (spec.onCreate) {
    // Formatting is cosmetic: the sheet is already correct, and a rerun does not run onCreate again.
    try { spec.onCreate(created); }
    catch (error) { throw new Error(name + ' was created, but its setup formatting failed: ' + (error && error.message || error)); }
  }
  return {created:true, repaired:[]};
}
