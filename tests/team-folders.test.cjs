// Team folders: <spreadsheet folder>/Team Documents/<year>_<semester>_team_<teamid>, created only by the coordinator action.
// Drive is faked in memory; the server module is loaded as the script would see it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSources } = require('./invariants/golden.cjs');

const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };

/** An in-memory Drive: My Drive root > Base (holds the spreadsheet). */
function fixture({ teams = [['T1', 'Semester 7'], ['T2', 'Semester 7']], year = '2026-27', parents = ['base'], unreadable = false, failNames = [] } = {}) {
  let n = 0;
  const folders = {};
  const make = (name, parent) => { const f = { id: 'f' + (++n), name, kids: [], trashed: false }; folders[f.id] = f; if (parent) parent.kids.push(f); return f; };
  const root = make('My Drive', null), base = make('Base', root);
  const writes = [];
  const wrap = f => ({
    getId: () => f.id, getName: () => f.name, getUrl: () => 'https://drive.example/' + f.id,
    getFolders: () => iter(f.kids.filter(k => !k.trashed).map(wrap)),
    getFoldersByName: name => iter(f.kids.filter(k => !k.trashed && k.name === name).map(wrap)),
    createFolder: name => { if (failNames.includes(name)) throw new Error('Quota exceeded'); writes.push(name); return wrap(make(name, f)); }
  });
  const parentFolders = { base, root };
  const rows = { current: teams.map(([id, sem]) => [id, sem]) };
  const c = loadSources(['team-folders.js'], {
    getSpreadsheetId_: () => 'sheet1', SHEET_NAMES: { TEAM_STATUS: 'Team Status' }, FIELD_DEFINITIONS: { TEAM_STATUS: {} },
    getColumnMap_: () => ({ TEAM_ID: 0, SEMESTER: 1 }), getSheetRows_: () => rows.current, getAcademicYear_: () => year,
    normalizeText_: value => String(value === null || value === undefined ? '' : value).trim().toLowerCase(),
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFileById: id => { if (unreadable || id !== 'sheet1') throw new Error('No access'); return { getParents: () => iter(parents.map(p => wrap(parentFolders[p]))) }; },
      getRootFolder: () => wrap(root)
    }
  });
  const names = () => base.kids.filter(k => k.name === 'Team Documents').flatMap(d => d.kids.map(k => k.name));
  return { c, base, root, writes, rows, names, make, wrap,
    documents: () => base.kids.filter(k => k.name === 'Team Documents'),
    json: value => JSON.parse(JSON.stringify(value)) };
}

test('names are lowercase, other characters become one underscore, repeats collapse', () => {
  const { c } = fixture();
  assert.equal(c.teamFolderName_('2026-27', 'Semester 7', '12'), '2026_27_semester_7_team_12');
  assert.equal(c.teamFolderName_('2026-27', 'Semester  7', 'A/12'), '2026_27_semester_7_team_a_12');
  assert.equal(c.teamFolderName_('2026--27', '_Odd__Sem_', 'T.1'), '2026_27_odd_sem_team_t_1');
  assert.equal(c.teamFolderName_('2026-27', 'Odd', 'Tëam 1'), '2026_27_odd_team_t_am_1');
  for (const blank of [['', 'Odd', '1'], ['2026-27', '  ', '1'], ['2026-27', 'Odd', '--']]) assert.throws(() => c.teamFolderName_(...blank));
});

test('the read reports a missing Team Documents folder and never creates anything', () => {
  const f = fixture();
  const dto = f.json(f.c.buildTeamFoldersDto_());
  assert.deepEqual(dto, { configured: true, baseFolder: { name: 'Base', url: 'https://drive.example/' + f.base.id }, teamDocuments: { exists: false, url: null },
    total: 2, existing: 0, missing: ['T1', 'T2'], duplicates: [], collisions: [], issues: [], canCreate: true });
  assert.equal(f.documents().length, 0);
  assert.deepEqual(f.writes, []);
});

test('the read counts existing team folders and hides the button when nothing is missing', () => {
  const f = fixture();
  f.c.createTeamFolders_('');
  const dto = f.json(f.c.buildTeamFoldersDto_());
  assert.equal(dto.teamDocuments.exists, true);
  assert.equal(dto.existing, 2); assert.deepEqual(dto.missing, []); assert.equal(dto.canCreate, false);
  f.documents()[0].kids.pop();
  const partial = f.json(f.c.buildTeamFoldersDto_());
  assert.deepEqual([partial.existing, partial.missing, partial.canCreate], [1, ['T2'], true]);
});

test('creating makes Team Documents once, then the team folders, and is safe to repeat', () => {
  const f = fixture();
  const first = f.json(f.c.createTeamFolders_(''));
  assert.deepEqual([first.created, first.failed, first.remaining, first.nextCursor, first.teamDocuments.justCreated], [['T1', 'T2'], [], 0, null, true]);
  assert.deepEqual(f.names(), ['2026_27_semester_7_team_t1', '2026_27_semester_7_team_t2']);
  const second = f.json(f.c.createTeamFolders_(''));
  assert.deepEqual([second.created, second.teamDocuments.justCreated], [[], false]);
  assert.equal(f.documents().length, 1);
  assert.equal(f.names().length, 2);
});

test('large cohorts are created in batches that follow the cursor', () => {
  const teams = Array.from({ length: 30 }, (_, i) => ['T' + String(i + 1).padStart(2, '0'), 'Odd']);
  const f = fixture({ teams });
  const first = f.json(f.c.createTeamFolders_(''));
  assert.equal(first.created.length, 25); assert.equal(first.remaining, 5); assert.equal(first.nextCursor, 't25');
  const second = f.json(f.c.createTeamFolders_(first.nextCursor));
  assert.equal(second.created.length, 5); assert.equal(second.nextCursor, null);
  assert.equal(f.names().length, 30);
  assert.equal(new Set(f.names()).size, 30);
});

test('one failing team is reported and the rest are still created', () => {
  const f = fixture({ failNames: ['2026_27_semester_7_team_t1'] });
  const result = f.json(f.c.createTeamFolders_(''));
  assert.deepEqual(result.created, ['T2']);
  assert.deepEqual(result.failed, [{ teamId: 'T1', reason: 'Quota exceeded' }]);
  assert.equal(result.nextCursor, null);
});

test('an unusable spreadsheet folder blocks the card and creates nothing', () => {
  for (const [options, pattern] of [[{ parents: ['root'] }, /top level of My Drive/], [{ parents: [] }, /not inside a folder/], [{ parents: ['base', 'root'] }, /more than one folder/], [{ unreadable: true }, /could not be read/]]) {
    const f = fixture(options);
    const dto = f.json(f.c.buildTeamFoldersDto_());
    assert.equal(dto.configured, false); assert.equal(dto.canCreate, false); assert.equal(dto.baseFolder, null);
    assert.match(dto.issues[0], pattern);
    assert.throws(() => f.c.createTeamFolders_(''), pattern);
    assert.deepEqual(f.writes, []);
  }
});

test('two Team Documents folders block creation; a trashed one is ignored', () => {
  const f = fixture();
  f.make('Team Documents', f.base); f.make('Team Documents', f.base);
  const dto = f.json(f.c.buildTeamFoldersDto_());
  assert.equal(dto.canCreate, false); assert.match(dto.issues[0], /more than one folder named Team Documents/);
  assert.throws(() => f.c.createTeamFolders_(''), /more than one folder named Team Documents/);
  assert.deepEqual(f.writes, []);
  const trashed = fixture();
  trashed.make('Team Documents', trashed.base).trashed = true;
  assert.equal(trashed.json(trashed.c.buildTeamFoldersDto_()).teamDocuments.exists, false);
  trashed.c.createTeamFolders_('');
  assert.equal(trashed.base.kids.filter(k => !k.trashed && k.name === 'Team Documents').length, 1);
  const wrongCase = fixture();
  wrongCase.make('team documents', wrongCase.base);
  assert.equal(wrongCase.json(wrongCase.c.buildTeamFoldersDto_()).teamDocuments.exists, false);
});

test('duplicate team folders only warn; nothing is merged or removed', () => {
  const f = fixture();
  f.c.createTeamFolders_('');
  const docs = f.documents()[0];
  f.make('2026_27_semester_7_team_t1', docs);
  const dto = f.json(f.c.buildTeamFoldersDto_());
  assert.deepEqual(dto.duplicates, ['T1']); assert.equal(dto.existing, 2);
  assert.match(dto.issues.join(' '), /more than one folder with the same name/);
  assert.equal(docs.kids.length, 3);
  f.c.createTeamFolders_('');
  assert.equal(docs.kids.length, 3);
});

test('teams that clean to the same name are skipped, and teams without a semester are reported', () => {
  const f = fixture({ teams: [['A-1', 'Odd'], ['A/1', 'Odd'], ['B1', 'Odd'], ['C1', '']] });
  const dto = f.json(f.c.buildTeamFoldersDto_());
  assert.deepEqual(dto.collisions, ['A-1', 'A/1']);
  assert.equal(dto.total, 1); assert.deepEqual(dto.missing, ['B1']);
  assert.match(dto.issues.join(' '), /A-1, A\/1/); assert.match(dto.issues.join(' '), /Team C1/);
  assert.deepEqual(f.json(f.c.createTeamFolders_('')).created, ['B1']);
  assert.deepEqual(f.names(), ['2026_27_odd_team_b1']);
});

test('findTeamFolder_ returns the team folder or nothing, and never creates', () => {
  const f = fixture();
  assert.equal(f.c.findTeamFolder_('T1', 'Semester 7'), null);
  assert.equal(f.documents().length, 0);
  f.c.createTeamFolders_('');
  const found = f.c.findTeamFolder_('T1', 'Semester 7');
  assert.equal(found.getName(), '2026_27_semester_7_team_t1');
  assert.equal(f.c.findTeamFolder_('T9', 'Semester 7'), null);
  f.make('2026_27_semester_7_team_t1', f.documents()[0]);
  assert.equal(f.c.findTeamFolder_('T1', 'Semester 7'), null);
  const writes = f.writes.length;
  f.c.findTeamFolder_('T9', 'Semester 7');
  assert.equal(f.writes.length, writes);
});

test('an invalid cursor is rejected', () => {
  assert.throws(() => fixture().c.createTeamFolders_(5), /Invalid continuation cursor/);
});
