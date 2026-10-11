const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');
const accountHeaders=['Timestamp','Email address','Team ID','GitHub Username'];
const commitHeaders=['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA'];
const sha=n=>String(n).padStart(40,'0');
const account=(id=101,login='canonical',name='Student')=>({status:200,body:{id,login,name,type:'User',html_url:'https://github.com/'+login,avatar_url:'https://avatars.githubusercontent.com/u/'+id}});
function fixture() {
  const f=weeklyFixture(),cache=new Map(),calls=[];
  for(const file of ['github-identity.js','student-github.js','team-github-setup.js','github-provisioning.js','weekly-activity.js'])vm.runInContext(fs.readFileSync(file,'utf8'),f.c);
  f.c.Logger={log(){}};
  f.config.CELL_PD_EMAIL='pd@example.com';
  f.c.getCommitteeNumbersForReviewer_=()=>[];
  f.c.getProjectSchedule_=()=>({});
  f.c.getProjectClock_=()=>({now:new f.c.Date()});
  f.c.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
  let response=(method,path)=>path.startsWith('/user')?account(path.endsWith('102')?102:101,path.endsWith('102')?'second':'canonical'):
    path.includes('/invitations?')?{status:200,body:[]}:
    path.includes('/permission')?{status:200,body:{permission:'write',user:{id:path.includes('/second/')?102:101}}}:
    {status:200,body:{html_url:'https://github.com/org/team'}};
  f.c.makeGithubRequest_=(...args)=>{calls.push(args);return response(...args);};
  const accounts=f.sheet('GitHubAccounts',[accountHeaders.concat('GitHub ID','GitHub Display Name','GitHub Profile URL')]),commits=f.sheet('Commits',[commitHeaders.concat('GitHub Author ID')]);
  f.user('one@example.com');
  const add=(id='101',email='one@example.com',login='old')=>accounts.rows.push(['2026-01-01T00:00:00Z',email,'T1',login,id,'Old Name','https://github.com/'+login]);
  const commit=(n,id='',extra={})=>commits.rows.push([extra.date||'2026-01-02T00:00:00Z','T1',extra.message||'Work','old','https://github.com/org/team',sha(n),id]);
  return {...f,accounts,commits,cache,calls,add,commit,response:fn=>response=fn};
}

test('IDs accept only positive decimal text or safe positive integers; blank IDs never match',()=>{
  const f=fixture();
  for(const value of ['',null,undefined,0,-1,'01','1e3',' 1','1.0',NaN,Number.MAX_SAFE_INTEGER+1])assert.equal(f.c.githubId_(value),'');
  assert.equal(f.c.githubId_(123),'123');assert.equal(f.c.githubId_('90071992547409930'),'90071992547409930');
  assert.equal(f.c.githubAuthorMatches_('',''),false);assert.equal(f.c.githubAuthorMatches_('101','102'),false);
});

test('profile preview canonicalizes metadata without saving; explicit confirmation saves and does not provision',()=>{
  const f=fixture();const preview=f.c.previewStudentGithubAccount_('https://github.com/TypedName/');
  assert.equal(f.accounts.rows.length,1);assert.equal(preview.account.username,'canonical');assert.equal(preview.account.githubId,'101');
  assert.match(f.calls[0][1],/users\/TypedName$/);
  const result=f.c.confirmStudentGithubAccount_(preview.token);
  assert(result.ok);assert.deepEqual(f.accounts.rows[1].slice(3),['canonical','101','Student','https://github.com/canonical']);
  assert.equal(f.calls.length,1);assert.throws(()=>f.c.confirmStudentGithubAccount_(preview.token),/expired/);
});

test('null display names stay blank; invalid and non-profile inputs never call GitHub',()=>{
  const f=fixture();
  for(const link of ['canonical','http://github.com/user','https://evil.example/u','https://github.com/u/r','https://github.com/settings','https://github.com/u?tab=repositories','https://github.com/u#x','https://user@github.com/u','https://github.com/u/issues'])assert.throws(()=>f.c.previewStudentGithubAccount_(link),/profile/);
  assert.equal(f.calls.length,0);f.response(()=>account(101,'canonical',null));
  f.c.confirmStudentGithubAccount_(f.c.previewStudentGithubAccount_('https://github.com/canonical').token);
  assert.equal(f.accounts.rows[1][5],'');
});

test('nonexistent, bot, organization, malformed and unavailable accounts never register',()=>{
  for(const response of [{status:404},{status:503},account(0),account(101,'canonical'),account(101,'canonical')]) {
    const f=fixture();if(response.body&&response.body.id===101)response.body.type='Organization';
    f.response(()=>response);assert.throws(()=>f.c.previewStudentGithubAccount_('https://github.com/canonical'));
    assert.equal(f.accounts.rows.length,1);
  }
  const f=fixture();const bot=account();bot.body.type='Bot';f.response(()=>bot);assert.throws(()=>f.c.previewStudentGithubAccount_('https://github.com/canonical'),/personal/);
});

test('confirmation tokens are student-bound, expire, and cannot bypass protected IDs or duplicate checks',()=>{
  const f=fixture(),p=f.c.previewStudentGithubAccount_('https://github.com/canonical');
  f.user('two@example.com');assert.throws(()=>f.c.confirmStudentGithubAccount_(p.token),/another student/);
  f.user('one@example.com');const cached=JSON.parse(f.cache.get('github-confirm:'+p.token));cached.expires=0;f.cache.set('github-confirm:'+p.token,JSON.stringify(cached));
  assert.throws(()=>f.c.confirmStudentGithubAccount_(p.token),/expired/);
  const q=f.c.previewStudentGithubAccount_('https://github.com/canonical');f.add('999');
  assert.throws(()=>f.c.confirmStudentGithubAccount_(q.token),/cannot be replaced/);assert.equal(f.accounts.rows[1][4],'999');
  f.accounts.rows.splice(1);f.add('101','two@example.com');assert.throws(()=>f.c.confirmStudentGithubAccount_(q.token),/another student/);
});

test('a competing save is rechecked; same-account confirmation preserves the timestamp; outages never erase IDs',()=>{
  const f=fixture(),p=f.c.previewStudentGithubAccount_('https://github.com/canonical'),q=f.c.previewStudentGithubAccount_('https://github.com/canonical');
  f.c.confirmStudentGithubAccount_(p.token);const timestamp=f.accounts.rows[1][0];f.c.confirmStudentGithubAccount_(q.token);
  assert.equal(f.accounts.rows.length,2);assert.equal(f.accounts.rows[1][0],timestamp);
  f.response(()=>({status:503}));assert.throws(()=>f.c.previewStudentGithubAccount_('https://github.com/other'));
  assert.equal(f.accounts.rows[1][4],'101');
});

test('durable ID resolution refreshes metadata without changing ID or timestamp, and caches per request',()=>{
  const f=fixture();f.add();const original=f.accounts.rows[1][0];const cache=new Map();
  const resolved=f.c.resolveGithubAccountId_('101',f.c.makeGithubRequest_,cache);f.c.resolveGithubAccountId_('101',f.c.makeGithubRequest_,cache);
  f.c.refreshGithubAccountMetadata_(f.accounts.rows[1],resolved);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0][1],'/user/101');assert.equal(f.accounts.rows[1][0],original);
  assert.deepEqual(f.accounts.rows[1].slice(3),['canonical','101','Student','https://github.com/canonical']);
  f.response(()=>({status:503}));assert.throws(()=>f.c.resolveGithubAccountId_('101'));
  assert.equal(f.accounts.rows[1][4],'101');assert(!f.calls.some(c=>c[1].startsWith('/users/')));
});

test('provisioning starts from IDs and rejects collaborator/invitation ID mismatches',()=>{
  const f=fixture();f.add();f.add('102','two@example.com','old-second');
  const setup=f.c.getTeamGithubSetup_('T1');assert(setup.ready);assert.equal(setup.members[0].username,'canonical');
  assert(f.calls.some(c=>c[1].includes('/collaborators/canonical/permission')));
  f.response((method,path)=>path.startsWith('/user/')?account(Number(path.split('/').pop()),'current'):
    path.includes('/invitations?')?{status:200,body:[{invitee:{id:999,login:'current'},permissions:'write'}]}:
    path.includes('/permission')?{status:200,body:{permission:'write',user:{id:999}}}:{status:200,body:{}});
  assert.equal(f.c.getTeamGithubSetup_('T1').ready,false);
  assert.throws(()=>f.c.ensureGithubPermission_('org/team','current','push',[],'101'),/ID conflict/);
});

test('missing IDs and failed ID lookup never trigger username provisioning fallback',()=>{
  const f=fixture();f.add('');f.add('102','two@example.com');f.response(()=>({status:503}));
  const setup=f.c.getTeamGithubSetup_('T1');assert.equal(setup.ready,false);assert(setup.verificationUnavailable);
  assert(f.calls.every(c=>!c[1].startsWith('/users/')));
});

test('ID evidence ignores names and system labels: only a positive match counts',()=>{
  const f=fixture();f.add();f.add('102','two@example.com');f.collectionStatus('ok');
  f.commit(1,'101');f.commit(2,'102');f.commit(3,'999',{message:'Initial commit: Capstone project for Team T1'});f.commit(4,'101',{message:'System classification does not override matching ID'});
  f.commit(5,'');
  const student={email:'one@example.com',teamId:'T1',regNo:'001'};
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,2);
  f.accounts.rows[1][3]='renamed';f.commits.rows[1][3]='old-reassigned';
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,2);
  f.commit(6,'invalid');assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,null);
});

test('unregistered activity and evidence remain null until normal confirmed registration',()=>{
  const f=fixture();f.time('2026-01-02T12:00:00Z');f.collectionStatus('ok');f.commit(1,'101');f.commit(2,'999');
  const student=f.c.weeklyStudents_().find(s=>s.email==='one@example.com');
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,null);
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').state,'unavailable');
  f.c.confirmStudentGithubAccount_(f.c.previewStudentGithubAccount_('https://github.com/canonical').token);
  f.response((method,path)=>{if(path.startsWith('/users/'))throw Error('Legacy lookup forbidden');return account(101,'renamed');});
  const evidence=f.c.readWeeklyProgressEvidence_(student,'W1');assert.equal(evidence.state,'available');assert.equal(evidence.count,1);
});


test('account headers tolerate case and outer whitespace but require all ID metadata columns',()=>{
  const f=fixture();f.add();const before=JSON.stringify(f.accounts.rows[1]);
  f.accounts.rows[0][3]=' GitHuB Username ';
  assert.equal(f.c.githubAccountColumns_(f.accounts).ID,4);
  assert.equal(JSON.stringify(f.accounts.rows[1]),before);
  f.accounts.rows[0][3]='GitHub  Username';assert.throws(()=>f.c.githubAccountColumns_(f.accounts),/header mismatch/);
  f.accounts.rows[0][3]='GitHub Username';f.accounts.rows[0].pop();
  assert.throws(()=>f.c.githubAccountColumns_(f.accounts),/columns are missing/);
});
test('commit author IDs require no auxiliary sheet: blank is unlinked, invalid data is unavailable',()=>{
  const f=fixture();f.commit(1,'101');f.commit(2);f.commit(3,'invalid');
  assert.deepEqual(Array.from(f.c.readCollectedCommits_(),r=>r.authorResolution),['resolved','unlinked','unavailable']);
});
test('malformed returned author IDs fail collection without partial rows or false unlinked evidence',()=>{
  const f=fixture();
  f.response(()=>({status:200,body:[{sha:sha(1),author:{id:0},commit:{committer:{date:'2026-01-02'},message:'Work'}}]}));
  f.c.fetchAllCommits();assert.equal(f.commits.rows.length,1);
  assert.equal(f.c.readCommitCollectionStatus_('T1'),'error');
});

test('collector writes rows and author IDs together; null authors stay unlinked without auxiliary storage',()=>{
  const f=fixture(),writes=[],formats=[];const getRange=f.commits.getRange;
  f.commits.getRange=(r,c,n=1,w=1)=>{
    const range=getRange(r,c,n,w),write=range.setValues,format=range.setNumberFormat;
    range.setValues=values=>{writes.push({r,c,n,w,values});return write.call(range,values);};
    range.setNumberFormat=value=>{formats.push({c,value});return format.call(range,value);};return range;
  };
  const commits=[{id:101,login:'renamed'},null,{login:'unlinked',id:null}].map((author,i)=>({sha:sha(i+1),author,
    commit:{committer:{date:'2026-01-02T00:00:00Z'},message:'Preserved '+i+'\nMore detail'}}));
  f.response(()=>({status:200,body:commits}));
  assert.equal(f.c.fetchAllCommits()[0].count,3);assert.equal(f.c.fetchAllCommits()[0].count,0);
  assert.equal(writes.length,1);assert.equal(writes[0].w,7);
  assert.deepEqual(formats,[{c:7,value:'@'}]);
  assert.deepEqual(f.commits.rows.slice(1).map(row=>row[6]),['101','','']);
  assert.deepEqual(Array.from(f.c.readCollectedCommits_(),row=>row.authorResolution),['resolved','unlinked','unlinked']);
  assert.equal(f.commits.rows[1][2],'Preserved 0');
});

test('both permanent schemas normalize only case and outer whitespace and never rewrite headers',()=>{
  for(const type of ['accounts','commits']) {
    const f=fixture(),sheet=f[type],read=()=>type==='accounts'?f.c.githubAccountColumns_(sheet):f.c.commitColumns_(sheet);
    sheet.rows[0]=sheet.rows[0].map(header=>' '+header.toUpperCase()+' ');sheet.rows[0][3]=' GitHuB Username ';
    const before=JSON.stringify(sheet.rows);read();assert.equal(JSON.stringify(sheet.rows),before);
    sheet.rows[0][3]='GitHub  Username';assert.throws(read,/header mismatch/);
    sheet.rows[0][3]='GitHub Username';[sheet.rows[0][0],sheet.rows[0][1]]=[sheet.rows[0][1],sheet.rows[0][0]];
    // Both sheets are found by header name, so a swapped pair is accepted and the map follows the new order.
    if(type==='accounts')assert.equal(read().EMAIL,0);else assert.equal(read().TEAM_ID,0);
    [sheet.rows[0][0],sheet.rows[0][1]]=[sheet.rows[0][1],sheet.rows[0][0]];
    sheet.rows[0].push(type==='accounts'?'GitHub ID':'GitHub Author ID');assert.throws(read,/Duplicate/);
  }
});

// GitHubAccounts is found by header name (archive/plans/SHEET-HEADER-MATCHING-PLAN.md, phase 3).
function shuffleAccounts(f){
  const order=[6,3,0,5,1,4,2]; // URL, Username, Timestamp, Name, Email, ID, Team ID
  f.accounts.rows.splice(0,Infinity,...f.accounts.rows.map(row=>order.map(i=>row[i])));
  f.accounts.rows.forEach(row=>row.splice(3,0,'')); // an unmapped column inside the span
  f.accounts.rows[0][3]='Notes';
  return f;
}

test('accounts: a shuffled sheet with an extra column is read and written by header name',()=>{
  const f=fixture(),preview=f.c.previewStudentGithubAccount_('https://github.com/canonical');
  shuffleAccounts(f);
  const columns=JSON.parse(JSON.stringify(f.c.githubAccountColumns_(f.accounts)));
  assert.deepEqual(columns,{TIMESTAMP:2,EMAIL:5,TEAM_ID:7,USERNAME:1,ID:6,NAME:4,URL:0});
  f.c.confirmStudentGithubAccount_(preview.token);
  const header=f.accounts.rows[0],row=f.accounts.rows[1];
  const at=name=>row[header.indexOf(name)];
  assert.equal(f.accounts.rows.length,2);
  assert.equal(at('Email address'),'one@example.com');assert.equal(at('Team ID'),'T1');assert.equal(at('GitHub Username'),'canonical');
  assert.equal(at('GitHub ID'),'101');assert.equal(at('GitHub Display Name'),'Student');assert.equal(at('GitHub Profile URL'),'https://github.com/canonical');
  assert.ok(at('Timestamp'));assert.equal(at('Notes'),'');
  assert.equal(f.c.weeklyStoredGithubMapping_('T1',[{email:'one@example.com',teamId:'T1',regNo:'001'}],'https://github.com/org/team').members[0].username,'canonical');
});

test('accounts: a metadata refresh in a shuffled sheet changes only the stale cells and keeps the extra column',()=>{
  const f=fixture();f.add('101','one@example.com','old');shuffleAccounts(f);
  const header=f.accounts.rows[0];f.accounts.rows[1][header.indexOf('Notes')]='keep me';
  const columns=f.c.githubAccountColumns_(f.accounts);
  f.c.refreshGithubAccountMetadata_(f.accounts.rows[1],{githubId:'101',username:'renamed',displayName:'New Name',profileUrl:'https://github.com/renamed'});
  const row=f.accounts.rows[1];
  assert.equal(row[columns.USERNAME],'renamed');assert.equal(row[columns.NAME],'New Name');assert.equal(row[columns.URL],'https://github.com/renamed');
  assert.equal(row[header.indexOf('Notes')],'keep me');assert.equal(row[columns.ID],'101');
});

test('accounts: a missing or repeated required header throws, naming it, and changes nothing',()=>{
  const f=fixture(),before=JSON.stringify(f.accounts.rows);
  f.accounts.rows[0][2]='Team';assert.throws(()=>f.c.githubAccountColumns_(f.accounts),/header mismatch/);
  f.accounts.rows[0][2]='Team ID';f.accounts.rows[0].push('timestamp');assert.throws(()=>f.c.githubAccountColumns_(f.accounts),/Duplicate header: Timestamp/);
  f.accounts.rows[0].pop();f.accounts.rows[0][5]='Name';assert.throws(()=>f.c.githubAccountColumns_(f.accounts),/required account columns are missing/);
  f.accounts.rows[0][5]='GitHub Display Name';assert.equal(JSON.stringify(f.accounts.rows),before);
});

test('GitHub connection endpoints delegate to the existing functions and keep their messages',()=>{
  const f=fixture();vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);vm.runInContext(fs.readFileSync('student-api.js','utf8'),f.c);
  const preview=JSON.parse(f.c.API_student_previewGithub('https://github.com/TypedName/'));
  assert.equal(preview.ok,true);assert.equal(preview.data.account.username,'canonical');assert.ok(preview.data.token);const before=f.accounts.rows.length;assert.equal(f.accounts.rows.length,before);
  const confirmed=JSON.parse(f.c.API_student_confirmGithub(preview.data.token));assert.equal(confirmed.ok,true);assert.equal(f.accounts.rows.length,before+1);
  const again=JSON.parse(f.c.API_student_confirmGithub(preview.data.token));assert.equal(again.ok,false);assert.equal(again.error.code,'REJECTED');assert.match(again.error.message,/expired/);
  const bad=JSON.parse(f.c.API_student_previewGithub('https://evil.example/u'));assert.equal(bad.ok,false);assert.equal(bad.error.code,'REJECTED');
  assert.equal(typeof f.c.API_student_completeGithubSetup,'function');
});
