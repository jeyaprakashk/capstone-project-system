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
    SHEET_NAMES: { TEAM_STATUS: 'teams', GITHUB_USERNAME_RAW: 'usernames' },
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
  vm.runInContext(fs.readFileSync('student-github.js','utf8'),c);
  vm.runInContext(fs.readFileSync('team-github-setup.js','utf8'),c);
  const roster = [{email:team[1],regno:'R1'}, {email:team[2],regno:'R2'}];
  return { c, rows, team, calls, roster, response: value => {response=value;}, user: value => {user=value;},
    state: repo => c.getStudentGithubState_(user,'T1',roster,repo || ''), writes: () => writes, locked: () => locked };
}

test('invalid syntax, missing users, organizations and API failures never write', () => {
  const f=fixture();
  for (const username of ['', 'https://github.com/name', '-name', 'name-', 'a--b', '=formula', 'a'.repeat(40)]) {
    assert.equal(f.c.submitStudentGithubUsername(username).ok,false);
  }
  assert.equal(f.calls.length,0);
  assert.equal(f.c.submitStudentGithubUsername('missing').ok,false);
  f.response({status:200,body:{login:'org',type:'Organization'}});
  assert.equal(f.c.submitStudentGithubUsername('org').ok,false);
  for (const status of [401,403,429,500]) {
    f.response({status});
    assert.throws(()=>f.c.submitStudentGithubUsername('valid'),/try again shortly/);
  }
  assert.equal(f.writes(),0);
});

test('save uses server identity and rejects resubmissions without changing the timestamp', () => {
  const f=fixture();
  f.rows.push(['old','other@example.com','T2','other']);
  f.response({status:200,body:{login:'OctoCat',type:'User'}});
  assert.equal(f.c.submitStudentGithubUsername(' octocat ', 'forged@example.com', 'T2').ok,true);
  assert.deepEqual(Array.from(f.rows[2].slice(1)),['one@example.com','T1','OctoCat']);
  const originalTimestamp=f.rows[2][0];
  for (const name of ['octocat','different']) {
    const result=f.c.submitStudentGithubUsername(name);
    assert.equal(result.ok,false);
    assert.equal(result.alreadySubmitted,true);
    assert.equal(f.rows[2][0],originalTimestamp);
    assert.equal(f.rows[2][3],'OctoCat');
  }
  assert.equal(f.rows.length,3);
  assert.equal(f.rows[1][3],'other');
  assert.equal(f.locked(),false);
  f.user('outsider@example.com');
  assert.throws(()=>f.c.submitStudentGithubUsername('valid'),/Student team/);
  f.user('');
  assert.throws(()=>f.c.submitStudentGithubUsername('valid'),/sign in/);
  assert.equal(f.writes(),1);
});

test('saved submissions cannot be overwritten during GitHub outages; invalid entries can be corrected', () => {
  const f=fixture();
  f.rows.push(['original timestamp','one@example.com','T1','valid']);
  f.response({status:503});
  assert.throws(()=>f.c.submitStudentGithubUsername('different'),/try again shortly/);
  assert.equal(f.rows[1][0],'original timestamp');
  assert.equal(f.rows[1][3],'valid');
  assert.equal(f.writes(),0);
  assert.equal(f.locked(),false);
  f.response(null);
  f.rows[1][3]='missing';
  assert.equal(f.c.submitStudentGithubUsername('corrected').ok,true);
  assert.equal(f.rows[1][3],'corrected');
  assert.equal(f.writes(),1);
});

test('textbox stays available for absent or invalid usernames with and without a repo', () => {
  const f=fixture();
  for (const repo of ['', 'https://github.com/org/repo']) {
    assert.equal(f.state(repo).githubNeedsUsername,true);
    assert.equal(f.state(repo).githubState,'active');
  }
  f.rows.push(['','one@example.com','T1','missing']);
  assert.match(f.state().githubText,/invalid/);
  assert.equal(f.state('https://github.com/org/repo').githubNeedsUsername,true);
});

test('valid submission distinguishes missing, invalid and ready teammates', () => {
  const f=fixture();
  f.rows.push(['','one@example.com','T1','valid']);
  assert.equal(f.state().githubNeedsUsername,false);
  assert.match(f.state().githubText,/Waiting.*R2/);
  f.rows.push(['','two@example.com','T1','missing']);
  assert.match(f.state().githubText,/Waiting.*R2/);
  f.rows.push(['','two@example.com','T1','teammate']);
  assert.match(f.state().githubText,/All teammates.*awaiting creation/);
  assert.equal(f.state('https://github.com/org/repo').githubState,'done');
  assert.equal(f.state('https://github.com/org/repo').githubNeedsUsername,false);
});

test('API unavailability is not reported as an invalid saved username', () => {
  const f=fixture();
  f.rows.push(['','one@example.com','T1','valid']);
  f.response({status:503});
  const state=f.state();
  assert.equal(state.githubState,'waiting');
  assert.equal(state.githubNeedsUsername,false);
  assert.match(state.githubText,/could not verify/);
  assert.doesNotMatch(state.githubText,/invalid/);
});

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
    getColumnMap:()=>({TEAM_ID:0,SEMESTER:1}),
    getSheetRows:name=>{assert.equal(name,'teams');return [['T1','Odd'],['T2','Odd'],['T3','Odd']];},
    getRepoUrlMap:()=>({t2:'https://github.com/org/keep'}),
    getAllGithubOrgRepos_:()=>[
      {name:'capstone-even-team-T1',html_url:'wrong semester'},
      {name:'capstone-odd-team-T1',html_url:'correct'},
      {name:'capstone-odd-team-T99',html_url:'unknown team'}
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

function browserFixture() {
  const requests=[];
  const status={textContent:''};
  const panel={innerHTML:''};
  const button={disabled:false};
  const input={value:'octocat',disabled:false,focus(){this.focused=true;}};
  const summary={textContent:'Enter your GitHub username.'};
  const detail={hidden:false};
  const badge={textContent:'Action needed',classList:{add(){},remove(){}}};
  const refreshButton={hidden:true,disabled:false};
  const card={classList:{add(){},remove(){}},querySelector:selector=>selector==='.step-body'?{querySelector:()=>summary,querySelectorAll:()=>[detail]}:badge};
  const form={hidden:false,elements:{username:input},reportValidity:()=>true,querySelectorAll:()=>[button],closest:()=>card};
  function runner(success,failure) {
    return new Proxy({}, {get:(_,key)=>key==='withSuccessHandler'?fn=>runner(fn,failure):key==='withFailureHandler'?fn=>runner(success,fn):(...args)=>requests.push({key,args,success,failure})});
  }
  const c=createSheetReadContext({
    console,window:{},performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){},
    document:{hidden:false,readyState:'loading',addEventListener(){},getElementById:id=>id==='githubSubmitStatus'?status:id==='githubStatusRefresh'?refreshButton:null,
      querySelector:()=>panel,querySelectorAll:()=>[]},
    google:{script:{run:runner()}},getSkeletonMarkup_:()=>''
  });
  for(const file of ['lucide-icons.js','icon-renderer.js','dashboard-client-scripts.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  vm.runInContext(c.getDashboardClientScript(),c);
  c.form=form;
  return {requests,status,panel,button,input,form,summary,badge,detail,refreshButton,
    refresh:()=>vm.runInContext('DashboardUI.refreshGithubStatus()',c),
    submit:()=>vm.runInContext('DashboardUI.submitGithubUsername({preventDefault(){}},form)',c)};
}

test('browser prevents duplicate submissions and restores textbox after validation or network errors', () => {
  const f=browserFixture();
  f.submit();f.submit();
  assert.equal(f.requests.length,1);
  assert.equal(f.button.disabled,true);
  f.requests[0].success({ok:false,message:'Username not found'});
  assert.equal(f.form.hidden,false);
  assert.equal(f.input.disabled,false);
  assert.equal(f.input.focused,true);
  assert.equal(f.status.textContent,'Username not found');
  f.submit();f.requests[1].failure(new Error('GitHub unavailable'));
  assert.equal(f.button.disabled,false);
  assert.equal(f.status.textContent,'GitHub unavailable');
});

test('a stale browser hides the textbox when the server reports an existing valid submission', () => {
  const f=browserFixture();
  f.submit();
  f.requests[0].success({ok:false,alreadySubmitted:true,message:'Resubmission is not allowed.'});
  assert.equal(f.form.hidden,true);
  assert.equal(f.requests[1].key,'loadDashboardRoleContent');
  assert.equal(f.requests.some(r=>r.key==='completeStudentGithubSetup'),false);
  f.requests[1].success('Saved username');
  assert.equal(f.status.textContent,'Resubmission is not allowed.');
});

test('browser hides textbox only after saving and refreshes after provisioning without resaving', () => {
  const f=browserFixture();
  f.submit();
  assert.equal(f.form.hidden,false);
  f.requests[0].success({ok:true,message:'Saved'});
  assert.equal(f.form.hidden,true);
  assert.equal(f.requests[1].key,'completeStudentGithubSetup');
  f.requests[1].failure(new Error('Provisioning offline'));
  assert.equal(f.requests[2].key,'loadDashboardRoleContent');
  f.requests[2].success('Updated student dashboard');
  assert.equal(f.panel.innerHTML,'Updated student dashboard');
  assert.match(f.status.textContent,/valid username is saved/);
  assert.equal(f.requests.filter(r=>r.key==='submitStudentGithubUsername').length,1);
});

test('setup and refresh failures preserve saved state, show actual errors and offer a read-only retry',()=>{
  const f=browserFixture();f.submit();
  f.requests[0].success({ok:true,message:'Saved'});
  assert.match(f.summary.textContent,/valid GitHub username is saved/);
  assert.equal(f.badge.textContent,'Waiting');assert.equal(f.detail.hidden,true);
  f.requests[1].failure(new Error('Missing header Guide GitHub Username'));
  f.requests[2].failure(new Error('Dashboard unavailable'));
  assert.equal(f.form.hidden,true);
  assert.equal(f.refreshButton.hidden,false);assert.equal(f.refreshButton.disabled,false);
  assert.match(f.status.textContent,/Missing header Guide GitHub Username/);
  assert.match(f.status.textContent,/Dashboard refresh failed: Dashboard unavailable/);
  assert.doesNotMatch(f.summary.textContent,/Enter your/);
  f.refresh();assert.equal(f.requests[3].key,'loadDashboardRoleContent');
  f.requests[3].success('Current team status');
  assert.equal(f.panel.innerHTML,'Current team status');
  assert.equal(f.requests.filter(r=>r.key==='submitStudentGithubUsername').length,1);
});
