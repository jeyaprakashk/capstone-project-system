// No server code reaches a sheet cell by a number. Sheets are read and written by header name (AGENTS.md, "Sheet access"), so a
// column can move without the code noticing. This is the project-wide search of archive/plans/SHEET-HEADER-MATCHING-PLAN.md section 8, run over every
// root module. It is a text-level tripwire, with known limits (it cannot see a number held in a variable); the shuffled-column
// tests in tests/shuffled-columns.test.cjs and in each sheet's own tests are the proof.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// A number used as an index on a name that stands for a sheet row, or as the column argument of getRange. Allowed without an exception:
//   - values[0]: the header row of a block that was read whole;
//   - getRange(1, ...): writing a header row when a sheet is created;
//   - getRange(n, 1, 1, row.length): a whole row written from column A that was built from the column map.
const POSITION = /\b(?:row|r|rec|record|item|item\.row|saved|submission|existingRow|cells|values)\[\s*\d+\s*\]|getRange\((?!1\s*,)(?![^,()]+,\s*1\s*,\s*1\s*,\s*\w+\.length\s*\))[^,()]+,\s*\d+\s*[,)]/g;
const HEADER_ROW = /^values\[\s*0\s*\]$/;

// Each exception names its reason. An exception that no longer matches anything fails, so the list cannot go stale.
const EXCEPTIONS = {
  'sheet-reads.js': 'the shared reader reads whole rows from column A; it picks no column',
  'review-evaluation-client.js': 'a list of [pattern, label] pairs in the browser, not a sheet'
};

const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const files = fs.readdirSync('.').filter(name => name.endsWith('.js') && !name.startsWith('tailwind') && !/^(lucide|icon)/.test(name));

function findings() {
  const found = [];
  for (const file of files) {
    stripComments(fs.readFileSync(file, 'utf8')).split(/\r?\n/).forEach((line, index) => {
      for (const match of line.matchAll(POSITION)) {
        if (HEADER_ROW.test(match[0])) continue;
        found.push({file, where: file + ':' + (index + 1) + ' ' + match[0]});
      }
    });
  }
  return found;
}

test('no server module reaches a sheet cell by a literal number, except the listed exceptions', () => {
  const unexpected = findings().filter(item => !EXCEPTIONS[item.file]).map(item => item.where);
  assert.deepEqual(unexpected, []);
});

test('every exception still matches something', () => {
  const used = new Set(findings().map(item => item.file));
  const stale = Object.keys(EXCEPTIONS).filter(file => !used.has(file));
  assert.deepEqual(stale, []);
});

test('the search itself finds what it is meant to find', () => {
  const sample = ['row[3]', 'r[0]', 'item.row[2]', "sheet.getRange(rowNumber, 4).setValue(x)", 'sheet.getRange(n, 3, 1, 2)'];
  sample.forEach(text => assert.ok(text.match(POSITION), text));
  const allowed = ['values[0]', 'sheet.getRange(1, 1, 1, headers.length)', 'sheet.getRange(next, 1, 1, values.length)', 'row[columns.TEAM_ID]'];
  allowed.forEach(text => assert.ok(!text.match(POSITION) || HEADER_ROW.test(text.match(POSITION)[0]), text));
});
