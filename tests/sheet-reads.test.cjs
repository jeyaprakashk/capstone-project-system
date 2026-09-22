const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const root = path.join(__dirname, '..');

function fixture(data) {
  const calls = [];
  const sheet = {
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(0, ...data.map(row => row.length)),
    getRange: (row, column, count, width) => {
      calls.push([row, column, count, width]);
      return { getValues: () => data.slice(row - 1, row - 1 + count)
        .map(values => Array.from({ length:width }, (_,i) => values[column - 1 + i] ?? '')) };
    }
  };
  const c = createSheetReadContext({
    PropertiesService:{ getScriptProperties:() => ({ getProperty:() => '' }) }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'common-helpers.js'), 'utf8'), c);
  return { c, sheet, calls };
}

test('full-row reads preserve header gaps, trailing fields and requested row bounds', () => {
  const f = fixture([['Notes','','Team ID','Decision'], ['feedback','','G4','Revise'], ['','','G5','Approved']]);
  const map = f.c.buildColumnMap(f.sheet, { TEAM_ID:'Team ID', DECISION:'Decision' });
  const rows = f.c.readSheetRows_(f.sheet, 2, 1);
  assert.equal(rows[0][map.TEAM_ID], 'G4');
  assert.equal(rows[0][map.DECISION], 'Revise');
  assert.deepEqual(f.calls, [[1,1,1,4], [2,1,1,4]]);
  assert.equal(f.c.findTeamStatusRow(f.sheet, 'g5', map), 3);
  assert.deepEqual(f.calls[2], [2,1,2,4]);
});

test('empty, header-only and zero-count reads avoid invalid spreadsheet ranges', () => {
  for (const data of [[], [['Header']]]) {
    const f = fixture(data);
    assert.equal(f.c.readSheetRows_(f.sheet, 2).length, 0);
    assert.equal(f.c.findTeamStatusRow(f.sheet, 'G4', { TEAM_ID:0 }), -1);
    assert.equal(f.c.readSheetRows_(f.sheet, 1, 0).length, 0);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture([]);
  assert.equal(f.c.readSheetRows_(f.sheet, 1, 1).length, 0);
  for (const args of [[0,1], [1,-1], [1,1.5], [NaN,1]]) {
    assert.throws(() => f.c.readSheetRows_(f.sheet, ...args), /Invalid/);
  }
  assert.throws(() => f.c.readSheetRows_(null), /missing sheet/);
});

test('matched reads retain trailing fields and match order in one value read', () => {
  const f = fixture([['ID','Extra'], ['G1','first'], ['G2','unmatched'], ['G4','last']]);
  const matches = [4,2].map(row => ({ getRow:() => row }));
  const rows = f.c.readMatchedRows_(f.sheet, matches);
  assert.equal(JSON.stringify(rows), JSON.stringify([['G4','last'], ['G1','first']]));
  assert.deepEqual(f.calls, [[2,1,3,2]]);
  assert.equal(f.c.readMatchedRows_(f.sheet, []).length, 0);
  assert.equal(f.calls.length, 1);
});

test('reader observes newly added columns on subsequent calls', () => {
  const data = [['ID'], ['G4']];
  const f = fixture(data);
  assert.equal(f.c.readSheetRows_(f.sheet, 2)[0].length, 1);
  data[0].push('Decision'); data[1].push('Revise');
  assert.equal(f.c.readSheetRows_(f.sheet, 2)[0][1], 'Revise');
});

test('activity reads include all columns for both full and matched scopes', () => {
  const f = fixture([['Date','Email','Team','Extra'], [1,'a@x','G4','retained']]);
  const getRange = f.sheet.getRange;
  f.sheet.getRange = (...args) => {
    const range = getRange(...args);
    range.createTextFinder = () => {
      const finder = { useRegularExpression:() => finder, matchEntireCell:() => finder,
        matchCase:() => finder, findAll:() => [{ getRow:() => 2 }] };
      return finder;
    };
    return range;
  };
  f.c.getSheet = () => f.sheet;
  vm.runInContext(fs.readFileSync(path.join(root, 'weekly-activity.js'), 'utf8'), f.c);
  assert.equal(f.c.readActivityRows_('Logs', null, null)[0][3], 'retained');
  assert.equal(f.c.readActivityRows_('Logs', 3, 'G4')[0][3], 'retained');
  assert.deepEqual(f.calls, [[2,1,1,4], [2,3,1,1], [2,1,1,4]]);
});

test('production value reads use the shared reader or the complete data range', () => {
  function audit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
      if (['node_modules','.git','tests','.codex','.agents'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { audit(file); continue; }
      if (!/\.(js|gs|cjs|html)$/.test(entry.name) || file === path.join(root, 'sheet-reads.js')) continue;
      const source = fs.readFileSync(file, 'utf8');
      // Full data-range reads already include all headers. All other value reads
      // must go through the shared full-width reader, including range variables.
      const remaining = source.replace(/\.getDataRange\(\)\s*\.getValues\(\)/g, '');
      assert.doesNotMatch(remaining, /\.(?:getValue|getValues|getDisplayValue|getDisplayValues|getFormula|getFormulas)\s*\(/,
        path.relative(root, file) + ': use readSheetRows_ for complete records');
    }
  }
  audit(root);
});
