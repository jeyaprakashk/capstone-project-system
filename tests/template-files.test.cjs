// Process A of TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md: the daily template scan, the TemplateFiles sheet and the document setup.
// GitHub is faked; the sheet is the in-memory fake of the weekly fixture, so the real header-name code runs.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {weeklyFixture} = require('./weekly-progress-fixture.cjs');

const plain = value => JSON.parse(JSON.stringify(value));
const HEADERS = ['Document ID', 'Folder', 'File Name', 'Extension', 'First Seen', 'Last Seen', 'Active', 'In Team Template', 'Name Conflict'];
const file = name => ({type: 'file', name, path: name, sha: 'sha-' + name});

function setup(listings) {
  const f = weeklyFixture();
  ['document-sheets.js', 'template-files.js', 'team-files.js', 'document-setup.js', 'generated/github-template-manifest.js'].forEach(name => vm.runInContext(fs.readFileSync(name, 'utf8'), f.c, {filename: name}));
  f.c.requireTriggerOrOperator_ = () => {};
  f.c.Session.getEffectiveUser = () => ({getEmail: () => 'owner@example.com'});
  const github = {listings: listings || {'1_Documents': [file('Step1_Work_Breakdown.docx'), file('Brand_New.docx'), file('notes.md'), {type: 'dir', name: 'extra'}], '5_Presentations': [file('Review1_Presentation.pptx')]}, calls: [], fail: null};
  f.c.makeGithubRequest_ = (method, path) => {
    github.calls.push(path);
    const folder = decodeURIComponent(path.split('/contents/')[1]);
    if (github.fail && github.fail === folder) return {status: 502, body: null};
    return {status: 200, body: github.listings[folder]};
  };
  f.c.setupDocumentStorage();
  const sheet = () => f.sheets.get('TemplateFiles');
  const table = () => sheet().rows.slice(1).map(row => Object.fromEntries(HEADERS.map((header, index) => [header, row[index]])));
  return {f, github, sheet, table};
}

test('the catalog headers, the sheet and the code constants agree', () => {
  const {f, sheet} = setup();
  assert.deepEqual(plain(vm.runInContext('Object.values(TEMPLATE_FILES_FIELDS_)', f.c)), HEADERS);
  assert.deepEqual(plain(f.c.sheetSpec_('templateFiles').headers), HEADERS);
  assert.deepEqual(Array.from(sheet().rows[0]), HEADERS);
  assert.equal(f.c.sheetSpec_('templateFiles').access, 'view');
});

test('setupDocumentStorage creates the sheet once, visible, and a second run changes nothing', () => {
  const {f, sheet} = setup();
  assert.equal(sheet().hidden, undefined, 'a view sheet stays visible');
  const before = JSON.stringify(sheet().rows);
  const result = plain(f.c.setupDocumentStorage());
  assert.equal(result.templateFiles.created, false);
  assert.equal(JSON.stringify(sheet().rows), before);
});

test('the first scan lists the supported files only, with Document IDs, and flags what the teams received', () => {
  const {f, table} = setup();
  const result = plain(f.c.scanTemplateFiles());
  assert.deepEqual([result.ok, result.found, result.added, result.updated], [true, 3, 3, 0]);
  const rows = table();
  assert.deepEqual(rows.map(row => [row['Document ID'], row.Folder, row['File Name'], row.Extension]), [
    ['doc-0001', '1_Documents', 'Step1_Work_Breakdown.docx', 'docx'],
    ['doc-0002', '1_Documents', 'Brand_New.docx', 'docx'],
    ['doc-0003', '5_Presentations', 'Review1_Presentation.pptx', 'pptx']]);
  assert.deepEqual(rows.map(row => [row.Active, row['In Team Template'], row['Name Conflict']]), [['Yes', 'Yes', 'No'], ['Yes', 'No', 'No'], ['Yes', 'No', 'No']]);
  // the bundled manifest has no presentation, so the pptx is not in the team template and cannot be submitted yet
  assert.ok(rows.every(row => row['First Seen'] && row['First Seen'] === row['Last Seen']));
  assert.deepEqual(setup().github.calls.length, 0);
});

test('a repeated scan adds no row, keeps every Document ID and refreshes Last Seen', () => {
  const {f, table} = setup();
  f.c.scanTemplateFiles();
  const first = table();
  f.time('2030-01-01T00:00:00Z');
  const result = plain(f.c.scanTemplateFiles());
  assert.deepEqual([result.added, result.updated], [0, 3]);
  const second = table();
  assert.deepEqual(second.map(row => row['Document ID']), first.map(row => row['Document ID']));
  assert.deepEqual(second.map(row => row['First Seen']), first.map(row => row['First Seen']));
  assert.ok(second.every(row => row['Last Seen'] !== first[0]['Last Seen']));
});

test('a file that disappears becomes inactive, keeps its row and ID, and a new file gets the next ID', () => {
  const {f, github, table} = setup();
  f.c.scanTemplateFiles();
  github.listings['1_Documents'] = [file('Step1_Work_Breakdown.docx'), file('Added_Later.docx')];
  f.c.scanTemplateFiles();
  const rows = table();
  assert.equal(rows.length, 4);
  const gone = rows.find(row => row['File Name'] === 'Brand_New.docx');
  assert.deepEqual([gone['Document ID'], gone.Active], ['doc-0002', 'No']);
  assert.equal(rows.find(row => row['File Name'] === 'Added_Later.docx')['Document ID'], 'doc-0004');
  github.listings['1_Documents'].push(file('Brand_New.docx'));
  f.c.scanTemplateFiles();
  const back = table().find(row => row['File Name'] === 'Brand_New.docx');
  assert.deepEqual([back['Document ID'], back.Active, table().length], ['doc-0002', 'Yes', 4]);
});

test('two active files with the same name in different folders are both marked, until one goes', () => {
  const {f, github, table} = setup();
  github.listings['5_Presentations'].push(file('step1_work_breakdown.DOCX'));
  f.c.scanTemplateFiles();
  const conflict = table().filter(row => row['Name Conflict'] === 'Yes').map(row => row['File Name']).sort();
  assert.deepEqual(conflict, ['Step1_Work_Breakdown.docx', 'step1_work_breakdown.DOCX']);
  github.listings['5_Presentations'].pop();
  f.c.scanTemplateFiles();
  assert.ok(table().every(row => row['Name Conflict'] === 'No'));
});

test('a failure reading either folder leaves the sheet untouched', () => {
  const {f, github, sheet} = setup();
  f.c.scanTemplateFiles();
  const before = JSON.stringify(sheet().rows);
  github.listings['5_Presentations'] = [file('Other.pptx')];
  for (const folder of ['1_Documents', '5_Presentations']) {
    github.fail = folder;
    const result = plain(f.c.scanTemplateFiles());
    assert.deepEqual([result.ok, result.reason], [false, 'failed']);
    assert.match(result.message, new RegExp('template folder ' + folder));
    assert.equal(JSON.stringify(sheet().rows), before);
  }
  assert.ok(f.errors.length >= 2, 'the failure is logged');
});

test('two rows for one file, or a bad or repeated Document ID, stop the scan before anything is written', () => {
  const {f, sheet} = setup();
  f.c.scanTemplateFiles();
  for (const change of [rows => rows.push(rows[1].slice()), rows => { rows[1][0] = 'x-1'; }, rows => { rows[2][0] = rows[1][0]; }]) {
    const copy = JSON.parse(JSON.stringify(sheet().rows));
    change(sheet().rows);
    const before = JSON.stringify(sheet().rows);
    const result = plain(f.c.scanTemplateFiles());
    assert.equal(result.ok, false);
    assert.match(result.message, /Nothing was changed/);
    assert.equal(JSON.stringify(sheet().rows), before);
    sheet().rows.splice(0, Infinity, ...copy);
  }
});

test('shuffled columns and an extra column are read and written by header name', () => {
  const {f, github, sheet, table} = setup();
  f.c.scanTemplateFiles();
  sheet().rows.forEach((row, index) => { row.reverse(); row.splice(3, 0, index ? 'keep me' : 'Notes'); });
  github.listings['1_Documents'].pop();
  github.listings['1_Documents'].push(file('Late.docx'));
  const result = plain(f.c.scanTemplateFiles());
  assert.equal(result.ok, true);
  const header = sheet().rows[0], at = (row, name) => row[header.indexOf(name)];
  const rows = sheet().rows.slice(1);
  assert.equal(rows.length, 4);
  assert.ok(rows.slice(0, 3).every(row => at(row, 'Notes') === 'keep me'), 'the extra column is kept');
  assert.equal(at(rows[3], 'Document ID'), 'doc-0004');
  assert.equal(at(rows[3], 'File Name'), 'Late.docx');
  assert.equal(at(rows.find(row => at(row, 'File Name') === 'Brand_New.docx'), 'Active'), 'Yes');
});

test('a missing or repeated header stops the scan and names it', () => {
  const {f, sheet} = setup();
  sheet().rows[0][2] = 'Name';
  assert.match(plain(f.c.scanTemplateFiles()).message, /requires exactly one File Name column/);
  sheet().rows[0][2] = 'File Name';
  sheet().rows[0].push('folder');
  assert.match(plain(f.c.scanTemplateFiles()).message, /requires exactly one Folder column/);
});

test('a write that fails part-way leaves valid rows, and the next scan converges with no duplicates', () => {
  const start = {'1_Documents': [file('A.docx'), file('B.docx')], '5_Presentations': [file('C.pptx')]};
  const next = () => ({'1_Documents': [file('A.docx'), file('D.docx'), file('E.docx')], '5_Presentations': [file('C.pptx'), file('F.pdf')]});
  const expected = (() => {
    const e = setup(JSON.parse(JSON.stringify(start))); e.f.c.scanTemplateFiles();
    e.github.listings = next(); e.f.c.scanTemplateFiles();
    return e.table().map(row => [row['Document ID'], row['File Name'], row.Active]);
  })();
  let writes = 0;
  for (let k = 1; k <= 12; k++) {
    const e = setup(JSON.parse(JSON.stringify(start)));
    e.f.c.scanTemplateFiles();
    e.github.listings = next();
    const getRange = e.sheet().getRange;
    let count = 0;
    e.sheet().getRange = (...args) => {
      const range = getRange(...args), setValues = range.setValues;
      return Object.assign(range, {setValues: values => { count++; if (count === k) throw new Error('Service error'); return setValues.call(range, values); }});
    };
    const failed = plain(e.f.c.scanTemplateFiles());
    e.sheet().getRange = getRange;
    if (failed.ok) { writes = k - 1; break; }
    const mid = e.table();
    assert.equal(new Set(mid.map(row => row['Document ID'])).size, mid.length, 'no repeated ID after a stop at write ' + k);
    assert.equal(plain(e.f.c.scanTemplateFiles()).ok, true);
    assert.deepEqual(e.table().map(row => [row['Document ID'], row['File Name'], row.Active]), expected, 'converged after a stop at write ' + k);
  }
  assert.ok(writes >= 4, 'the scan makes several separate record writes (' + writes + ')');
});

test('setupDocumentTriggers installs the two daily scans once each, for one owner', () => {
  const {f} = setup();
  const first = plain(f.c.setupDocumentTriggers());
  assert.deepEqual([first.created, first.owner], [['scanTemplateFiles', 'scanTeamFiles'], 'owner@example.com']);
  assert.equal(f.triggers.filter(trigger => trigger.getHandlerFunction() === 'scanTemplateFiles').length, 1);
  assert.deepEqual([f.triggers[0].days, f.triggers[0].hour], [1, 2]);
  assert.deepEqual([f.triggers[1].days, f.triggers[1].hour], [1, 3]);
  assert.deepEqual(plain(f.c.setupDocumentTriggers()).created, []);
  assert.equal(f.triggers.length, 2);
  f.c.Session.getEffectiveUser = () => ({getEmail: () => 'someone.else@example.com'});
  assert.throws(() => f.c.setupDocumentTriggers(), /belong to owner@example\.com/);
});

test('the entry points are guarded, and no module reads the Config tab for the template repository', () => {
  for (const name of ['setupDocumentStorage', 'setupDocumentTriggers', 'scanTemplateFiles', 'scanTeamFiles']) {
    const source = fs.readFileSync(name === 'scanTemplateFiles' ? 'template-files.js' : name === 'scanTeamFiles' ? 'team-files.js' : 'document-setup.js', 'utf8');
    const body = source.slice(source.indexOf('function ' + name + '('));
    assert.equal(body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim(), 'requireTriggerOrOperator_();', name);
  }
  assert.doesNotMatch(fs.readFileSync('template-files.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), /getConfig_/);
});
