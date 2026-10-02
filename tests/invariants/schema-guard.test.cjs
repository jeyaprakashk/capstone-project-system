// Protects the existing spreadsheet: sheet names, headers and column definitions are frozen.
const { test } = require('node:test');
const { loadSources, expectGolden } = require('./golden.cjs');

test('spreadsheet sheet names, headers and field definitions are unchanged', () => {
  const c = loadSources(['common-constants.js', 'assessment-registry.js', 'milestone-config.js']);
  expectGolden('schema', require('node:vm').runInContext(
    '({SHEET_NAMES, FIELD_DEFINITIONS, ASSESSMENT_DEFINITION_HEADERS_, MILESTONE_HEADERS_})', c));
});
