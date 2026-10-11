/**
 * SHEET CATALOG - one readable list of the sheets the code uses: tab name, access mode, headers, status and purpose.
 * Specified in SHEET-HEADER-MATCHING-PLAN.md ("Sheet catalog"); the generated reference is SHEETS.md
 * (npm run build:sheets-doc). Catalog v1 lists the NEW sheets only; existing sheets are added when the header-name
 * migration completes the catalog.
 *
 * - Frozen sheets are referenced with headersFrom: 'FIELD_DEFINITIONS.<NAME>', never copied.
 * - headersFrom: 'runtime' means the headers are supplied when the specification is requested (the Form archive).
 * - `code` lists only code that exists: { file, role, functions }, role = setup | runtime-create | read | write.
 * - createAtRuntime marks a sheet that runtime code may create (ensureSheet_ mode 'runtime'); see ENSURE-SHEET-PLAN.md.
 * It is a function, not a top-level constant, so it does not depend on file load order.
 */
let sheetCatalogMemo_ = null;

function sheetCatalog_() {
  if (!sheetCatalogMemo_) {
    sheetCatalogMemo_ = sheetCatalogFreeze_({
      activityDependencies: {
        name: 'ActivityDependencies',
        access: 'edit',
        headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'],
        status: 'new',
        purpose: 'Rules that gate student actions. The coordinator fills the rows.',
        createAtRuntime: false,
        code: [
          {file: 'activity-dependencies-sheet.js', role: 'setup', functions: ['setupActivityDependencies', 'ensureActivityDependenciesSheet_']}
        ]
      },
      titleLog: {
        name: 'TitleLog',
        access: 'view',
        headers: ['Timestamp', 'Team ID', 'Revision', 'Action', 'Actor', 'Request ID', 'Fingerprint', 'Status',
          'Proposed Title', 'Proposed Problem', 'Notes', 'Similarity Note', 'Reopened',
          'Approved Title', 'Approved Problem', 'Approved At', 'Approved By'],
        status: 'new',
        purpose: 'Append-only title history; the latest row of a team is its current title state.',
        createAtRuntime: false,
        code: []
      },
      formArchive: {
        name: 'TitleFormArchive',
        access: 'view',
        headersFrom: 'runtime',
        status: 'new',
        purpose: 'Values-only copy of the Form-period history, kept for one semester.',
        createAtRuntime: false,
        code: []
      }
    });
  }
  return sheetCatalogMemo_;
}

function sheetCatalogFreeze_(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(sheetCatalogFreeze_);
    Object.freeze(value);
  }
  return value;
}

/** The header list of an entry, or null when it is supplied at run time. */
function sheetCatalogHeaders_(entry) {
  if (entry.headersFrom === 'runtime') return null;
  if (entry.headersFrom) {
    const match = /^FIELD_DEFINITIONS\.([A-Za-z0-9_]+)$/.exec(entry.headersFrom);
    const definition = match && FIELD_DEFINITIONS[match[1]];
    if (!definition) throw new Error('Unknown header definition in the sheet catalog: ' + entry.headersFrom);
    return Object.values(definition);
  }
  return entry.headers.slice();
}

/**
 * The specification ensureSheet_ needs: {name, headers, access, createAtRuntime}. Never `mode`: the call site sets that.
 * runtimeHeaders is required for, and only allowed on, an entry with headersFrom: 'runtime'.
 */
function sheetSpec_(key, runtimeHeaders) {
  const entry = sheetCatalog_()[key];
  if (!entry) throw new Error('Unknown sheet in the catalog: ' + key);
  let headers;
  if (entry.headersFrom === 'runtime') {
    if (!Array.isArray(runtimeHeaders) || !runtimeHeaders.length) throw new Error('The headers of ' + entry.name + ' must be supplied when its specification is requested.');
    headers = runtimeHeaders.slice();
  } else {
    if (runtimeHeaders !== undefined) throw new Error('The headers of ' + entry.name + ' are fixed in the catalog and cannot be supplied.');
    headers = sheetCatalogHeaders_(entry);
  }
  return {name: entry.name, headers, access: entry.access, createAtRuntime: entry.createAtRuntime === true};
}
