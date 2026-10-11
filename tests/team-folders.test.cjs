// Team folders: <spreadsheet folder>/Team Documents/<year>_<semester>_team_<teamid>, created only by the coordinator action.
// Drive is faked in memory; the server module is loaded as the script would see it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSources } = require('./invariants/golden.cjs');

const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };

/** An in-memory Drive: My Drive root > Base (holds the spreadsheet). */
function fixture({ teams = [['T1', 'Semester 7'], ['T2', 'Semester 7']], year = '2026-27', parents = ['base'], unreadable = false, failNames = [], failShare = [], listFails = false } = {}) {
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
  const rows = { current: teams.map(row => row.slice()) };
  // Drive's advanced service: permissions per folder id, and every create call with its arguments.
  const permissions = {}, shares = [], clock = { t: 1000000, perShare: 0 };
  const properties = new Map();
  const c = loadSources(['team-folders.js'], {
    getSpreadsheetId_: () => 'sheet1', SHEET_NAMES: { TEAM_STATUS: 'Team Status' }, FIELD_DEFINITIONS: { TEAM_STATUS: {} },
    getColumnMap_: () => ({ TEAM_ID: 0, SEMESTER: 1, S1_EMAIL: 2, S2_EMAIL: 3, S3_EMAIL: 4, S4_EMAIL: 5 }), getSheetRows_: () => rows.current, getAcademicYear_: () => year,
    normalizeText_: value => String(value === null || value === undefined ? '' : value).trim().toLowerCase(),
    normalizeEmail_: value => String(value === null || value === undefined ? '' : value).trim().toLowerCase(),
    requireTriggerOrOperator_: () => {}, console: { log() {}, error() {} },
    Date: { now: () => clock.t },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.has(key) ? properties.get(key) : null, setProperty: (key, value) => properties.set(key, value), deleteProperty: key => properties.delete(key) }) },
    Drive: { Permissions: {
      list: (id) => { if (listFails) throw new Error('Drive unavailable'); return { permissions: (permissions[id] || []).slice() }; },
      create: (resource, id, options) => {
        clock.t += clock.perShare;
        if (failShare.includes(resource.emailAddress)) throw new Error('Cannot share with ' + resource.emailAddress);
        shares.push({ resource, id, options });
        (permissions[id] = permissions[id] || []).push({ id: 'p' + shares.length, type: 'user', role: 'reader', emailAddress: resource.emailAddress });
        return { id: 'p' + shares.length };
      } } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFileById: id => { if (unreadable || id !== 'sheet1') throw new Error('No access'); return { getParents: () => iter(parents.map(p => wrap(parentFolders[p]))) }; },
      getRootFolder: () => wrap(root)
    }
  });
  const names = () => base.kids.filter(k => k.name === 'Team Documents').flatMap(d => d.kids.map(k => k.name));
  return { c, base, root, writes, rows, names, make, wrap, permissions, shares, clock, properties,
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

// ---- students are given viewer access to their own team's folder (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, Phase 0) ----

const ANN = 'ann@x.edu', BOB = 'bob@x.edu', CAT = 'cat@x.edu';
const withStudents = () => [['T1', 'Semester 7', ANN, ' BOB@x.edu ', '', ANN], ['T2', 'Semester 7', CAT]];

test('a new folder gives its distinct students viewer access, with no notification e-mail', () => {
  const f = fixture({ teams: withStudents() });
  const result = f.json(f.c.createTeamFolders_(''));
  assert.deepEqual(result.created, ['T1', 'T2']);
  assert.deepEqual(result.notShared, []);
  const folders = f.documents()[0].kids;
  const t1 = folders.find(k => k.name.endsWith('_t1')), t2 = folders.find(k => k.name.endsWith('_t2'));
  assert.deepEqual(f.permissions[t1.id].map(p => p.emailAddress).sort(), [ANN, BOB]);
  assert.deepEqual(f.permissions[t2.id].map(p => p.emailAddress), [CAT]);
  assert.equal(f.shares.length, 3, 'a repeated e-mail on a team is added once');
  f.shares.forEach(share => {
    assert.deepEqual(f.json(share.resource), { type: 'user', role: 'reader', emailAddress: share.resource.emailAddress });
    assert.deepEqual(f.json(share.options), { supportsAllDrives: true, sendNotificationEmail: false });
  });
});

test('a student who cannot be added is listed, and the folder still stands', () => {
  const f = fixture({ teams: withStudents(), failShare: [BOB] });
  const result = f.json(f.c.createTeamFolders_(''));
  assert.deepEqual(result.created, ['T1', 'T2']);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.notShared, [{ teamId: 'T1', reason: 'Students not added: ' + BOB + ' (Cannot share with ' + BOB + ')' }]);
  const folder = f.documents()[0].kids.find(k => k.name.endsWith('_t1'));
  assert.deepEqual(f.permissions[folder.id].map(p => p.emailAddress), [ANN]);
});

test('unreadable folder sharing lists every student of the team and nothing is created for them', () => {
  const f = fixture({ teams: withStudents(), listFails: true });
  const result = f.json(f.c.createTeamFolders_(''));
  assert.equal(result.created.length, 2);
  assert.equal(result.notShared.length, 2);
  assert.match(result.notShared[0].reason, /sharing could not be read: Drive unavailable/);
  assert.equal(f.shares.length, 0);
});

test('a team with no student e-mail in its row is created without any sharing call', () => {
  const f = fixture();
  const result = f.json(f.c.createTeamFolders_(''));
  assert.deepEqual([result.created, result.notShared, f.shares.length], [['T1', 'T2'], [], 0]);
});

test('grantExistingTeamFolderAccess adds only the missing students and is safe to run twice', () => {
  const f = fixture({ teams: withStudents() });
  f.c.createTeamFolders_('');
  const t1 = f.documents()[0].kids.find(k => k.name.endsWith('_t1'));
  f.permissions[t1.id] = f.permissions[t1.id].filter(p => p.emailAddress !== BOB);
  f.shares.length = 0;
  const first = f.json(f.c.grantExistingTeamFolderAccess());
  assert.deepEqual(first.added, [{ teamId: 'T1', email: BOB }]);
  assert.deepEqual(first.skipped.map(item => item.email).sort(), [ANN, CAT]);
  assert.deepEqual([first.failed, first.remaining], [[], 0]);
  assert.equal(f.shares.length, 1);
  const second = f.json(f.c.grantExistingTeamFolderAccess());
  assert.deepEqual([second.added, second.remaining, f.shares.length], [[], 0, 1]);
  assert.equal(f.properties.has('TEAM_FOLDER_GRANT_CURSOR'), false);
});

test('grantExistingTeamFolderAccess reports a failure, skips teams without a folder and stops at its time budget with a cursor', () => {
  const f = fixture({ teams: [['T1', 'Semester 7', ANN], ['T2', 'Semester 7', BOB], ['T3', 'Semester 7', CAT], ['T4', 'Semester 7', 'dee@x.edu']], failShare: [BOB] });
  f.c.createTeamFolders_('');
  const docs = f.documents()[0];
  docs.kids.find(k => k.name.endsWith('_t4')).trashed = true;
  Object.keys(f.permissions).forEach(id => delete f.permissions[id]);
  const report = f.json(f.c.grantExistingTeamFolderAccess());
  assert.deepEqual(report.added.map(item => item.teamId), ['T1', 'T3']);
  assert.deepEqual(report.failed, [{ teamId: 'T2', email: BOB, reason: 'Cannot share with ' + BOB }]);
  assert.equal(report.remaining, 0);
  // the budget: every share advances the clock past it, so the run stops and remembers where it was
  const slow = fixture({ teams: [['T1', 'Semester 7', ANN], ['T2', 'Semester 7', BOB], ['T3', 'Semester 7', CAT]] });
  slow.c.createTeamFolders_('');
  Object.keys(slow.permissions).forEach(id => delete slow.permissions[id]);
  slow.clock.perShare = 200000;
  const part = slow.json(slow.c.grantExistingTeamFolderAccess());
  assert.deepEqual(part.added.map(item => item.teamId), ['T1', 'T2']);
  assert.equal(part.remaining, 1);
  assert.equal(slow.properties.get('TEAM_FOLDER_GRANT_CURSOR'), 't2');
  slow.clock.perShare = 0;
  const rest = slow.json(slow.c.grantExistingTeamFolderAccess());
  assert.deepEqual(rest.added.map(item => item.teamId), ['T3']);
  assert.equal(slow.properties.has('TEAM_FOLDER_GRANT_CURSOR'), false);
});

test('grantExistingTeamFolderAccess refuses when Team Documents is missing', () => {
  const f = fixture({ teams: withStudents() });
  assert.throws(() => f.c.grantExistingTeamFolderAccess(), /Team Documents was not found/);
});
