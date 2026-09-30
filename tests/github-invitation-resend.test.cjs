const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');

function fixture(count=1) {
  const teams=Array.from({length:count},(_,i)=>['T'+i,'a'+i+'@x','b'+i+'@x']);
  const accounts=teams.flatMap((t,i)=>t.slice(1).map((email,j)=>['date',email,t[0],'old',String(i*2+j+1)]));
  const students=accounts.map(a=>({email:a[1],teamId:a[2],regNo:a[4]}));
  const invites=[],calls=[],active=new Set();let authorized=true,released=0,hook;
  const norm=x=>String(x||'').toLowerCase();
  const c=vm.createContext({console,Map,Set,Error,
    Session:{getActiveUser:()=>({getEmail:()=> 'coord@x'})},getDashboardRoleViews_:()=>authorized?[{key:'coord'}]:[],
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){released++;}})},
    SHEET_NAMES:{TEAM_STATUS:'teams',GITHUB_ACCOUNTS:'accounts'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},
    getColumnMap:()=>({TEAM_ID:0,S1_EMAIL:1,S2_EMAIL:2}),getSheetRows:name=>name==='teams'?teams:accounts,
    getSheet:()=>({}),readSheetRows_:()=>[['Timestamp','Email address','Team ID','GitHub Username','GitHub ID','GitHub Display Name','GitHub Profile URL']],
    weeklyStudents_:()=>students,normalizeText_:norm,emailsMatch:(a,b)=>norm(a)===norm(b),textEquals_:(a,b)=>norm(a)===norm(b),
    getRepoUrlMap:()=>Object.fromEntries(teams.map(t=>[norm(t[0]),'https://github.com/org/'+t[0]])),
    getGithubRepoSlug_:url=>url.replace('https://github.com/',''),
    makeGithubRequest(method,path,payload) {
      calls.push({method,path,payload}); const override=hook?.(method,path,payload);if(override)return override;
      if(path.startsWith('/user/')) { const id=Number(path.split('/').pop());return {status:200,body:{id,login:'user'+id,type:'User',html_url:'https://github.com/user'+id}}; }
      if(path.includes('/invitations?'))return {status:200,body:invites.slice()};
      if(method==='DELETE'){const index=invites.findIndex(i=>String(i.id)===path.split('/').pop());if(index>=0)invites.splice(index,1);return {status:204};}
      if(path.includes('/collaborators/')) {
        const id=Number(path.split('/collaborators/user')[1].split('/')[0]);
        if(method==='PUT'){const body={id:100+id,invitee:{id},permissions:'write',expired:false};invites.push(body);return {status:201,body};}
        return active.has(id)?{status:200,body:{permission:'write',user:{id}}}:{status:404};
      }
      return {status:200};
    }
  });
  for(const file of ['github-identity.js','team-github-setup.js','github-invitation-resend.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  return {c,teams,accounts,students,invites,calls,active,run:cursor=>c.resendExpiredStudentInvitations(cursor),setHook:value=>hook=value,deny:()=>authorized=false,released:()=>released};
}
test('replaces expired invitations, resolves renamed users by ID, preserves registrations and is repeatable',()=>{
  const f=fixture();f.invites.push({id:7,invitee:{id:1},permissions:'write',expired:true});f.active.add(2);
  const before=JSON.stringify(f.accounts),r=f.run();
  assert.deepEqual(Array.from(r.results,x=>x.status),['invited','already joined']);
  assert.equal(f.calls.filter(x=>x.method==='DELETE').length,1);
  assert.equal(f.calls.find(x=>x.method==='PUT').path,'/repos/org/T0/collaborators/user1');
  assert.equal(JSON.stringify(f.accounts),before);assert.equal(f.released(),1);
  assert.equal(f.run().results[0].status,'pending');assert.equal(f.calls.filter(x=>x.method==='PUT').length,1);
});
test('missing registration does not block teammate and conflicting identities are skipped',()=>{
  const f=fixture();f.accounts.shift();let r=f.run();assert.equal(r.results[0].status,'skipped');assert.equal(r.results[1].status,'invited');
  const g=fixture();g.accounts[1][4]='1';r=g.run();assert.ok(r.results.every(x=>x.status==='skipped'));assert.ok(!g.calls.some(x=>x.method==='PUT'));
});
test('authorization is checked on every batch and continuation handles five teams',()=>{
  const f=fixture(6),first=f.run();assert.equal(first.results.length,10);assert.equal(first.nextCursor,'t4');
  const last=f.run(first.nextCursor);assert.equal(last.results.length,2);assert.equal(last.nextCursor,null);
  f.deny();const calls=f.calls.length;assert.throws(()=>f.run('t4'),/Coordinator/);assert.equal(f.calls.length,calls);
});
test('pagination finds expired invitation after first page',()=>{
  const f=fixture();f.setHook((method,path)=>path.includes('/invitations?')?{status:200,body:path.endsWith('page=1')?Array.from({length:100},(_,i)=>({id:i,invitee:{id:900+i}})):[{id:999,invitee:{id:1},expired:true}]}:null);
  f.run();assert.ok(f.calls.some(x=>x.method==='DELETE'&&x.path.endsWith('/999')));
});
test('delete and creation failures remain failures but other students continue',()=>{
  const f=fixture();f.invites.push({id:7,invitee:{id:1},expired:true});f.setHook(method=>method==='DELETE'?{status:500}:null);
  const r=f.run();assert.equal(r.results[0].status,'failed');assert.equal(r.results[1].status,'invited');
  assert.ok(!f.calls.some(x=>x.method==='PUT'&&x.path.endsWith('user1')));
  const g=fixture();g.setHook((method)=>method==='PUT'?{status:201,body:{invitee:{id:999},permissions:'write'}}:null);
  assert.ok(g.run().results.every(x=>x.status==='failed'));
});
test('rate limit stops immediately and retry rechecks partially completed team',()=>{
  const f=fixture();f.setHook((method,path)=>path==='/user/2'?{status:429}:null);
  const first=f.run();assert.equal(first.stopped,true);assert.equal(first.nextCursor,'');assert.equal(first.results[0].status,'invited');
  f.setHook(null);const retry=f.run(first.nextCursor);assert.equal(retry.results[0].status,'pending');assert.equal(retry.results[1].status,'invited');
  assert.equal(f.calls.filter(x=>x.method==='PUT'&&x.path.endsWith('user1')).length,1);
});
test('repository failure and mismatched collaborator IDs never cause writes',()=>{
  const f=fixture();f.setHook(()=>({status:404}));assert.ok(f.run().results.every(x=>x.status==='failed'));assert.ok(f.calls.every(x=>x.method==='GET'));
  const g=fixture();g.setHook((method,path)=>path.endsWith('/permission')?{status:200,body:{permission:'write',user:{id:999}}}:null);
  assert.ok(g.run().results.every(x=>x.status==='failed'));assert.ok(g.calls.every(x=>x.method==='GET'));
});
test('204 responses require verified identity and write access',()=>{
  const f=fixture();f.setHook((method,path)=>{if(method==='PUT'){f.active.add(Number(path.split('user')[1]));return {status:204};}});
  assert.ok(f.run().results.every(x=>x.status==='already joined'));
  const g=fixture();g.setHook(method=>method==='PUT'?{status:204}:null);assert.ok(g.run().results.every(x=>x.status==='failed'));
});

function browser() {
  const markup=fs.readFileSync('coordinator-dashboard.js','utf8').match(/<section class="system-status-card" id="studentInvitationResend">[\s\S]*?<\/section>/)[0];
  const helper=fs.readFileSync('common-helpers.js','utf8');
  const helperContext=vm.createContext({escapeHtml:x=>x});
  vm.runInContext(helper.slice(helper.indexOf('function buildTeamPagination_('),helper.indexOf('/** Presentation only:',helper.indexOf('function buildTeamPagination_('))),helperContext);
  const {document}=parseHTML('<html><body>'+markup.replace(/\$\{buildTeamPagination_.*?\}/,helperContext.buildTeamPagination_('studentInvitations','invitations',0,'students'))+'</body></html>');
  const requests=[];const c=vm.createContext({document,Map,escapeClientHtml:x=>String(x).replaceAll('<','&lt;'),dashboardRun(){const r={};requests.push(r);return {withSuccessHandler(fn){r.success=fn;return this;},withFailureHandler(fn){r.failure=fn;return this;},resendExpiredStudentInvitations(cursor){r.cursor=cursor;}};}});
  const source=fs.readFileSync('dashboard-client-scripts.js','utf8');
  c.byId=id=>document.getElementById(id);c.renderLucideIcon_=()=>'';
  // linkedom lacks the browser select.value setter used by the shared helper.
  Object.defineProperty(document.getElementById('studentInvitationsPageSize'),'value',{value:'10',writable:true});
  vm.runInContext(source.slice(source.indexOf('  function renderTeamPagination('),source.indexOf('  function applyCoordinatorFilters(')),c);
  vm.runInContext(source.slice(source.indexOf('  let studentInvitationResendBusy'),source.indexOf('  const weeklyFields')),c);
  return {document,requests,run:()=>c.runStudentInvitationResend(),resize:value=>c.changeTeamPageSize('invitations',value),host:document.getElementById('studentInvitationResend')};
}
test('browser blocks duplicate clicks, accumulates batches, preserves results on failure and retries cursor',()=>{
  const f=browser();f.run();f.run();assert.equal(f.requests.length,1);
  const row={teamId:'T0',email:'a@x',student:'<student>',username:'user1',status:'invited',reason:'Created'};
  f.requests[0].success({results:[row],nextCursor:'t4',stopped:false});assert.equal(f.requests.length,2);
  f.requests[1].failure(Error('Offline'));assert.match(f.host.textContent,/Offline/);assert.match(f.host.textContent,/<student>/);assert.equal(f.host.querySelector('student'),null);
  assert.equal(f.host.querySelector('button').disabled,false);f.run();assert.equal(f.requests[2].cursor,'t4');
  f.requests[2].success({results:[],nextCursor:null,stopped:false});assert.match(f.host.textContent,/complete/);assert.equal(f.host.getAttribute('aria-busy'),'false');
});
test('browser stops on rate limits and replaces previous result when retried',()=>{
  const f=browser();f.run();const row={teamId:'T0',email:'a',student:'A',status:'failed',reason:'Rate limit'};
  f.requests[0].success({results:[row],nextCursor:'',stopped:true});assert.equal(f.requests.length,1);f.run();
  f.requests[1].success({results:[{...row,status:'invited'}],nextCursor:null,stopped:false});assert.equal(f.host.querySelectorAll('tbody tr').length,1);assert.match(f.host.textContent,/1 invited/);
});

test('invitation log starts collapsed, uses shared pages and preserves expansion through updates',()=>{
  const f=browser(),log=f.host.querySelector('details');assert.equal(log.hasAttribute('open'),false);assert.equal(log.hidden,true);
  const rows=Array.from({length:27},(_,i)=>({teamId:'T'+i,email:'a'+i,student:'Student '+i,status:'invited',reason:'Created'}));
  f.run();f.requests[0].success({results:rows,nextCursor:'t4',stopped:false});
  assert.equal(log.hidden,false);assert.equal(log.hasAttribute('open'),false);assert.equal(f.host.querySelectorAll('tbody tr').length,10);
  assert.match(f.host.textContent,/Showing 1 - 10 of 27 students/);
  log.setAttribute('open','');
  Array.from(f.host.querySelectorAll('.pagination-buttons button')).find(b=>b.textContent==='Next').click();
  assert.match(f.host.textContent,/Showing 11 - 20 of 27 students/);
  f.requests[1].success({results:[],nextCursor:null,stopped:false});assert.equal(log.hasAttribute('open'),true);assert.match(f.host.textContent,/Showing 11 - 20/);
  f.resize('25');assert.equal(f.host.querySelectorAll('tbody tr').length,25);assert.match(f.host.textContent,/Showing 1 - 25/);
  f.resize('all');assert.equal(f.host.querySelectorAll('tbody tr').length,27);
});
