// Writes SHEETS.md from the sheet catalog (sheet-columns.js). `--check` fails if SHEETS.md is out of date.
// Same pattern as build-icons.cjs and build-tailwind.cjs.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const target = path.join(root, 'SHEETS.md');

const TAB = {
  system: 'Hidden, red tab (`system`)',
  view: 'Visible, red tab (`view`)',
  edit: 'Visible, green tab (`edit`)'
};

function loadCatalog() {
  const context = vm.createContext({console});
  ['common-constants.js', 'sheet-columns.js'].forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file}));
  return JSON.parse(JSON.stringify(Object.entries(vm.runInContext('sheetCatalog_()', context)).map(([key, entry]) => ({
    key, ...entry, resolvedHeaders: vm.runInContext('sheetCatalogHeaders_', context)(entry)
  }))));
}

const cell = text => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function render() {
  const rows = loadCatalog().map(entry => {
    const headers = entry.resolvedHeaders ? entry.resolvedHeaders.map(h => '`' + cell(h) + '`').join(', ') : 'Taken from the source Form sheet at archive time (recorded in the verification report)';
    const code = entry.code && entry.code.length
      ? entry.code.map(item => '`' + item.file + '` (' + item.role + '): ' + item.functions.map(fn => '`' + fn + '`').join(', ')).join('<br>')
      : 'None yet';
    return '| `' + entry.key + '` | `' + cell(entry.name || entry.namePattern) + '` | ' + TAB[entry.access] + ' | ' + headers + ' | ' + entry.status +
      ' | ' + (entry.createAtRuntime ? 'Yes' : 'No') + ' | ' + cell(entry.purpose) + ' | ' + code + ' |';
  });
  return [
    '# Sheets',
    '',
    'Generated from `sheet-columns.js` by `npm run build:sheets-doc`. Do not edit by hand: change the catalog, run the build, and',
    'commit both. `npm run check:sheets-doc` fails when this file is out of date. Design: SHEET-HEADER-MATCHING-PLAN.md ("Sheet catalog").',
    '',
    'Catalog v1 lists the **new** sheets only. Existing sheets are added when the header-name migration completes the catalog.',
    '',
    '- **Tab** shows the access mode: it decides the tab colour and whether the sheet is hidden, when the sheet is first created.',
    '- **Status:** `new` (header-name access from the start), `migrated`, `positional` (not yet migrated), `retiring`.',
    '- **Created at runtime:** only a sheet with this flag may be created by a runtime write (ENSURE-SHEET-PLAN.md, "Runtime mode").',
    '',
    '| Key | Sheet | Tab | Headers | Status | Created at runtime | Purpose | Code |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    ''
  ].join('\n');
}

module.exports = {render};

if (require.main === module) {
  const expected = render();
  if (process.argv.includes('--check')) {
    const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (actual !== expected) {
      console.error('SHEETS.md is out of date. Run npm run build:sheets-doc and commit the result.');
      process.exit(1);
    }
    console.log('SHEETS.md verified.');
  } else {
    fs.writeFileSync(target, expected);
    console.log('SHEETS.md written.');
  }
}
