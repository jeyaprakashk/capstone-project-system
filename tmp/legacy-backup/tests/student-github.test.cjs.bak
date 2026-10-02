const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const rows = [['Timestamp', 'Email address', 'Team ID', 'GitHub Username']];
  const columns = { TEAM_ID: 0, S1_EMAIL: 1, S2_EMAIL: 2, S3_EMAIL: 3, S4_EMAIL: 4, S1_REGNO:6, S2_REGNO:7 };
  const team = ['T1', 'one@example.com', 'two@example.com', '', '', '', 'R1', 'R2'];
  let user = 'one@example.com';
  let response = null;
  let writes = 0;
  let locked = false;
  const calls = [];
  const sheet = {
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map(row => row.length)),
    appendRow: row => { assert(locked); writes++; rows.push(row); },
    getRange: (row, col, count, width) => ({
      getValues: () => rows.slice(row - 1, row - 1 + count).map(r => r.slice(col - 1, col - 1 + width)),
      setValues: values => { assert(locked); writes++; rows[row - 1] = values[0]; }
    })
  };
  const c = createSheetReadContext({
    console,
    SHEET_NAMES: { TEAM_STATUS: 'teams', GITHUB_ACCOUNTS: 'usernames' },
    FIELD_DEFINITIONS: { TEAM_STATUS: {} },
    Session: { getActiveUser: () => ({ getEmail: () => user }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { locked = true; }, releaseLock: () => { locked = false; } }) },
    SpreadsheetApp: { flush() {} },
    getColumnMap: () => columns,
    getSheet: name => name === 'usernames' ? sheet : {},
    getSheetRows: name => name === 'usernames' ? rows.slice(1) : [team],
    getOptionalHeaderIndex_: () => 5,
    getRepoUrlForTeam:()=>team[5],
    getCollaboratorPermission_:()=>({status:200,body:{permission:'write'}}),
    normalizeEmail: v => String(v || '').trim().toLowerCase(),
    emailsMatch: (a,b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(),
    textEquals_: (a,b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(),
    makeGithubRequest: (method,path) => {
      calls.push({ method,path });
      if (response instanceof Error) throw response;
      if (!response && path.startsWith('/repos/')) return {status:200,body:path.includes('/invitations?')?[]:{html_url:'https://github.com/org/repo'}};
      const name = path.split('/').pop();
      return response || (name === 'missing' ? {status:404} : {status:200,body:{login:name,type:'User'}});
    },
    provisionTeamRepos_: teamId => { calls.push({teamId}); return {failed:[],waiting:[],success:[{message:'Team checked'}]}; },
    getGithubRepoSlug_: () => 'org/repo',
    addCollaborator: (slug, username) => { calls.push({slug, username}); return {status:201}; }
  });
  vm.runInContext(fs.readFileSync('github-identity.js','utf8'),c);
  c.weeklyStudents_=()=>[];
  vm.runInContext(fs.readFileSync('student-github.js','utf8'),c);
  vm.runInContext(fs.readFileSync('team-github-setup.js','utf8'),c);
  const roster = [{email:team[1],regno:'R1'}, {email:team[2],regno:'R2'}];
  return { c, rows, team, calls, roster, response: value => {response=value;}, user: value => {user=value;},
    state: repo => c.getStudentGithubState_(user,'T1',roster,repo || ''), writes: () => writes, locked: () => locked };
}

test('setup uses the shared team workflow even for existing repositories', () => {
  const f=fixture();
  f.c.completeStudentGithubSetup();
  assert.deepEqual(f.calls[0],{teamId:'T1'});
  f.rows.push(['','one@example.com','T1','valid']);
  f.team[5]='https://github.com/org/repo';
  assert.equal(f.c.completeStudentGithubSetup().message,'Team checked');
  assert.deepEqual(f.calls.at(-1),{teamId:'T1'});
  assert.equal(f.locked(),false);
  f.user('outsider@example.com');
  assert.throws(()=>f.c.completeStudentGithubSetup(),/Student team/);
});

test('batch and student collaborator repair share team readiness without skipping existing repos', () => {
  const f=fixture();
  vm.runInContext(fs.readFileSync('github-provisioning.js','utf8'),f.c);
  const visited=[];
  Object.assign(f.c, {
    SHEET_NAMES:{TEAM_STATUS:'teams',TEAM_ROSTER:'roster'},
    getSheetRows:name=>name==='teams'?[['T1'],['T2']]:[],
    getColumnMap:()=>({TEAM_ID:0}),
    recordWeeklyEligibilityIfConfigured_:()=>{},
    repairTeamGithubSetup_:id=>{visited.push(id);return {ready:id==='T2',usernamesComplete:id==='T2',message:'Waiting',repoUrl:'https://github.com/org/repo',members:[]};},
    getConfig:()=>'', Logger:{log(){}}
  });
  const first=f.c.provisionTeamRepos_('T1');
  assert.equal(first.waiting.length,1);
  assert.deepEqual(visited,['T1']);
  visited.length=0;
  const bulk=f.c.provisionAllTeamRepos({triggerUid:'timer'});
  assert.deepEqual(visited,['T1','T2']);
  assert.equal(bulk.success.length,1);
  visited.length=0;
  f.c.backfillMissingStudentCollaborators();
  assert.deepEqual(visited,['T1','T2']);
  assert.equal(f.locked(),false);
});

test('repository backfill writes only exact current-team matches to TeamStatus', () => {
  const f=fixture();
  vm.runInContext(fs.readFileSync('github-provisioning.js','utf8'),f.c);
  const saved=[];
  Object.assign(f.c,{
    getAcademicYear:()=> '2026-27',
    getColumnMap:()=>({TEAM_ID:0,SEMESTER:1}),
    getSheetRows:name=>{assert.equal(name,'teams');return [['T1','Odd'],['T2','Odd'],['T3','Odd']];},
    getRepoUrlMap:()=>({t2:'https://github.com/org/keep'}),
    getAllGithubOrgRepos_:()=>[
      {name:'capstone-2025-26-odd-team-T1',html_url:'wrong year'},
      {name:'capstone-odd-team-T1',html_url:'old name'},
      {name:'capstone-2026-27-even-team-T1',html_url:'wrong semester'},
      {name:'capstone-2026-27-odd-team-T1',html_url:'correct'},
      {name:'capstone-2026-27-odd-team-T99',html_url:'unknown team'}
    ],
    normalizeText_:value=>String(value).toLowerCase(),
    updateTeamStatusRepoUrl_:(id,url)=>saved.push([id,url]),Logger:{log(){}}
  });
  const result=f.c.backfillExistingRepos();
  assert.deepEqual(saved,[['T1','correct']]);
  assert.equal(result.added.length,1);
  assert.equal(result.skipped.length,2);
  assert.equal(f.locked(),false);
});

test('coordinator access sync reads and deduplicates TeamStatus repository URLs', () => {
  const f=fixture();
  vm.runInContext(fs.readFileSync('github-provisioning.js','utf8'),f.c);
  const checked=[];
  Object.assign(f.c,{
    getConfig:key=>key==='COLLABORATOR_GITHUB_USERNAME'?'coordinator':'maintain',
    getRepoUrlMap:()=>({t1:'https://github.com/org/one',t2:'https://github.com/org/one',t3:'https://github.com/org/two'}),
    getSheetRows:()=>{throw Error('Sync must use the TeamStatus repository map');},
    getCollaboratorPermission_:slug=>{checked.push(slug);return {status:200};},
    setConfig(){},Logger:{log(){}}
  });
  f.c.syncCoordinatorGithubAccess();
  assert.deepEqual(checked,['org/one','org/two']);
  assert.equal(f.locked(),false);
});

test('shared GitHub status renderer keeps Guide read-only and Student form shortcut explicit',()=>{
  const c=vm.createContext({emailsMatch:(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),renderLucideIcon_:name=>'<svg data-icon="'+name+'"></svg>'});
  vm.runInContext(fs.readFileSync('student-dashboard.js','utf8'),c);
  const roster=[{email:'a',regno:'R1'},{email:'b',regno:'R2'},{email:'c',regno:'R3'}];
  const members=[{email:'b',githubId:'2',status:'valid',access:'pending'},{email:'c',githubId:'3',status:'valid',access:'active'}];
  const html=c.buildGithubMemberRows_(roster,members,'');
  assert.match(html,/Submit GitHub Account/);assert.match(html,/Accept Invitation Email/);assert.match(html,/Repository joined/);
  assert.doesNotMatch(html,/<button|<input|<form|onclick=/);
  assert.match(c.buildGithubMemberRows_(roster,members,'a'),/focusGithubAccountForm/);
  assert.match(c.buildGithubRepositoryLine_('https://github.com/org/team'),/target="_blank" rel="noopener"/);
});
