const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture() {
  const columns={TEAM_ID:0,SEMESTER:1,TITLE:2,S1_EMAIL:3,S2_EMAIL:4,S3_EMAIL:5,S4_EMAIL:6,S1_REGNO:8,S2_REGNO:9,
    GUIDE_EMAIL:10,REVIEWER_NOTES:11,GUIDE_DECISION:12,REVIEWER_DECISION:13};
  const team=['T1','Odd','','one@example.com','two@example.com','','','https://github.com/org/capstone-2026-27-odd-team-T1','R1','R2','guide@example.com'];
  const usernames=[[new Date('2026-09-01T10:00:00Z'),'one@example.com','T1','one','101','','https://github.com/one'],[new Date('2026-09-02T10:00:00Z'),'two@example.com','T1','two','102','','https://github.com/two']];
  const invitations=[], calls=[], writes=[], mails=[], logs=[];
  const permissions=new Map([['one','write'],['two','write']]);
  let repository=true, outage='', failWrite=false, apiFailure=0;
  const norm=value=>String(value||'').trim().toLowerCase();
  const properties=new Map();
  const c=createSheetReadContext({console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.has(key)?properties.get(key):null,setProperty:(key,value)=>properties.set(key,value),deleteProperty:key=>properties.delete(key)})},
    SHEET_NAMES:{TEAM_STATUS:'teams',TEAM_ROSTER:'roster',GITHUB_ACCOUNTS:'users',TEAM_INTAKE_RAW:'intake',RAW_LOG:'logs'},
    FIELD_DEFINITIONS:{TEAM_STATUS:{},TEAM_ROSTER:{}},
    getColumnMap_:()=>columns,getSheetRows_:name=>name==='teams'?[team]:name==='users'?usernames:[],
    getRepoUrlForTeam_:()=>team[7],getOptionalHeaderIndex_:()=>7,
    normalizeEmail_:norm,normalizeText_:norm,textEquals_:(a,b)=>norm(a)===norm(b),emailsMatch_:(a,b)=>norm(a)===norm(b),
    Session:{getActiveUser:()=>({getEmail:()=>team[3]})},
    LockService:{getScriptLock:()=>({hasLock:()=>true,waitLock(){},releaseLock(){}})},SpreadsheetApp:{flush(){}},
    getConfig_:key=>key==='GITHUB_ORG_NAME'?'org':key==='GUIDE_REPO_PERMISSION'?'push':key==='COLLABORATOR_REPO_PERMISSION'?'maintain':'',
    getCoordinatorEmail_:()=> 'coord@example.com',getAcademicYear_:()=> '2026-27',Logger:{log(){}},
    MailApp:{sendEmail:(...args)=>mails.push(args)},driveFileUrl_:x=>x,findTeamStatusRow_:()=>2,
    getDashboardUrl_:()=> 'https://dashboard',getHubRegistrySheet_:()=>({getDataRange:()=>({getValues:()=>[[]]})}),
    setStatusFields_:(sheet,row,fields)=>writes.push(fields),
    getSheet_:name=>name==='logs'?{appendRow:row=>logs.push(row)}:{getLastColumn:()=>team.length,getDataRange:()=>({getValues:()=>[[],team]}),getRange:()=>({getValues:()=>[team],getValue:()=>team[10]})},
    projectDay_:(date,tz)=>{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
      return Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)/86400000;
    }
  });
  const originalSheet=c.getSheet_;
  c.getSheet_=name=>name==='users'?{getLastColumn:()=>7,getLastRow:()=>usernames.length+1,getRange:(r,c,n)=>({getValues:()=>r===1?[['Timestamp','Email address','Team ID','GitHub Username','GitHub ID','GitHub Display Name','GitHub Profile URL']]:usernames})}:originalSheet(name);
  for(const file of ['github-identity.js','student-github.js','team-github-setup.js','github-template.js','github-provisioning.js','intake-approval-workflow.js','logbook-tracker.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  c.installGithubTemplate_=()=>({verified:true}); // Template installation has its own tests; setup only resumes it.
  c.weeklyStudents_=()=>[1,2].filter(n=>team[n+2]).map(n=>({teamId:team[0],email:team[n+2],regNo:team[n+7]}));
  c.refreshGithubAccountMetadata_=()=>{}; // Metadata persistence is exercised by account integration tests.
  c.updateTeamStatusRepoUrl_=(id,url)=>{if(failWrite)throw Error('Sheet write failed');team[7]=url;writes.push({id,url});};
  c.setReadmeHeading=()=>calls.push({method:'README'});
  c.makeGithubRequest_=(method,path,payload)=>{
    calls.push({method,path,payload});
    if(outage && path.includes(outage))return {status:503};
    if(path.startsWith('/user/')) {
      const id=Number(path.split('/').pop()), name=id===101?'one':id===102?'two':'new';
      return id===999?{status:404}:{status:200,body:{id,login:name,type:'User',name:null,html_url:'https://github.com/'+name}};
    }
    if(method==='POST'){repository=true;return {status:201,body:{html_url:'https://github.com/org/capstone-2026-27-odd-team-T1'}};}
    if(path.includes('/invitations?')) return {status:200,body:invitations};
    if(method==='PATCH') {
      if(apiFailure)return {status:apiFailure};
      invitations.find(i=>String(i.id)===path.split('/').pop()).permissions=payload.permissions;
      return {status:200};
    }
    if(path.includes('/collaborators/')) {
      const name=path.split('/collaborators/')[1].split('/')[0];
      if(method==='PUT') {
        if(apiFailure)return {status:apiFailure};
        invitations.push({id:invitations.length+1,invitee:{login:name,id:name==='one'?101:name==='two'?102:103},permissions:'write'});
        return {status:201};
      }
      return permissions.has(name)?{status:200,body:{permission:permissions.get(name),user:{id:name==='one'?101:name==='two'?102:103}}}:{status:404};
    }
    return repository?{status:200,body:{html_url:'https://github.com/org/capstone-2026-27-odd-team-T1'}}:{status:404};
  };
  return {c,team,usernames,invitations,permissions,calls,writes,mails,logs,
    state:()=>c.getTeamGithubSetup_('T1'),repair:()=>c.repairTeamGithubSetup_('T1'),
    outage:value=>{outage=value;},repository:value=>{repository=value;},failWrite:value=>{failWrite=value;},apiFailure:value=>{apiFailure=value;}};
}

test('bulk readiness batches 62 teams and preserves live access decisions',()=>{
  const f=fixture(), batches=[];
  const live=f.c.makeGithubRequest_;
  f.c.PropertiesService={getScriptProperties:()=>({getProperty:key=>key==='GITHUB_ADMIN_TOKEN'?'test-token':null})};
  f.c.UrlFetchApp={fetchAll:requests=>{
    batches.push(requests.length);
    return requests.map(request=>{
      const result=live('GET',request.url.replace('https://api.github.com',''));
      return {getResponseCode:()=>result.status,getContentText:()=>JSON.stringify(result.body || {})};
    });
  }};
  f.c.makeGithubRequest_=()=>{throw Error('Serial GitHub request is forbidden');};
  const rows=[],users=[],repos={};
  for(let n=1;n<=62;n++) {
    const row=[...f.team];row[0]='T'+n;rows.push(row);repos['t'+n]='https://github.com/org/team-'+n;
    f.usernames.forEach(user=>{const copy=[...user];copy[2]=row[0];users.push(copy);});
  }
  f.c.weeklyStudents_=()=>rows.flatMap(row=>[1,2].map(n=>({teamId:row[0],email:row[n+2],regNo:row[n+7]})));
  const read=()=>f.c.getTeamsGithubSetup_(rows,f.c.getColumnMap_(),repos,users);
  const result=read();
  assert.equal(Object.keys(result).length,62);
  assert(Object.values(result).every(setup=>setup.ready));
  assert.equal(batches.length,6); // Two usernames, then 248 repository/access reads in chunks of 50.
  assert(batches.every(size=>size<=50));
  f.permissions.set('two','read');
  assert(Object.values(read()).every(setup=>!setup.ready));
  f.c.UrlFetchApp.fetchAll=()=>{throw Error('GitHub unavailable');};
  assert(Object.values(read()).every(setup=>!setup.ready && setup.verificationUnavailable));
  assert.equal(f.writes.length,0);
});

test('an existing repository never bypasses missing, invalid or unverifiable team usernames',()=>{
  const f=fixture();
  f.usernames.pop();
  assert.equal(f.state().ready,false);
  assert.deepEqual(Array.from(f.state().outstandingMembers),['R2']);
  assert.equal(f.repair().usernamesComplete,false);
  assert.equal(f.writes.length,0);
  f.usernames.push([new Date(),'two@example.com','T1','invalid','999','','']);
  assert.equal(f.repair().ready,false);
  f.usernames[1][3]='two';f.usernames[1][4]='102';f.outage('/user/102');
  assert.equal(f.repair().verificationUnavailable,true);
  assert.equal(f.calls.some(call=>['POST','PUT','PATCH'].includes(call.method)),false);
});

test('membership comes from TeamStatus and latest matching team/email submission only',()=>{
  const f=fixture();
  f.usernames.push([new Date(),'two@example.com','OTHER','invalid']);
  assert.equal(f.state().ready,true);
  f.team[4]='new@example.com';
  assert.equal(f.state().ready,false);
  f.usernames.push([new Date(),'new@example.com','T1','new','103','','https://github.com/new']);f.permissions.set('new','admin');
  assert.equal(f.state().ready,true);
  f.usernames.push([new Date(),'new@example.com','T1','invalid']);
  assert.equal(f.state().ready,false);
  f.team[3]='';f.team[4]='';assert.equal(f.state().ready,false);
});

test('repair reuses existing contents, preserves stronger access and accepts pending write invitations',()=>{
  const f=fixture();f.permissions.set('one','admin');f.permissions.delete('two');
  assert.equal(f.state().ready,false);
  assert.equal(f.repair().ready,true);
  assert.equal(f.state().members[1].access,'invited');
  const grants=f.calls.filter(call=>call.method==='PUT');
  assert.equal(grants.length,1);assert.match(grants[0].path,/two$/);
  f.repair();
  assert.equal(f.calls.filter(call=>call.method==='PUT').length,1);
  assert.equal(f.calls.some(call=>['POST','README','DELETE'].includes(call.method)),false);
  assert.equal(f.permissions.get('one'),'admin');
});

test('read-only invitations are upgraded without replacing invitations; failed grants remain locked',()=>{
  const f=fixture();f.permissions.set('two','read');f.invitations.push({id:15,invitee:{login:'two',id:102},permissions:'read'});
  assert.equal(f.state().ready,false);
  f.apiFailure(403);assert.throws(()=>f.repair(),/Could not grant/);assert.equal(f.state().ready,false);
  f.apiFailure(0);assert.equal(f.repair().ready,true);
  assert.equal(f.invitations[0].id,15);assert.equal(f.invitations[0].permissions,'write');
  assert.equal(f.calls.some(call=>call.method==='PUT'),false);
});

test('final valid member enables new creation; failed sheet write recovers existing repo on retry',()=>{
  const f=fixture();f.team[7]='';f.repository(false);f.usernames.pop();
  assert.equal(f.repair().ready,false);assert.equal(f.calls.some(call=>call.method==='POST'),false);
  f.usernames.push([new Date(),'two@example.com','T1','two','102','','https://github.com/two']);f.failWrite(true);
  assert.throws(()=>f.repair(),/Sheet write failed/);
  f.failWrite(false);assert.equal(f.repair().ready,true);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  assert.equal(f.team[7],'https://github.com/org/capstone-2026-27-odd-team-T1');
});

test('repository and invitation API failures fail closed without creating replacement repos',()=>{
  const f=fixture();f.outage('/repos/');assert.equal(f.state().ready,false);
  assert.throws(()=>f.repair(),/lookup or creation failed/);
  assert.equal(f.calls.some(call=>call.method==='POST'),false);
  f.outage('/invitations');assert.equal(f.state().ready,false);
  f.outage('/collaborators/two');assert.equal(f.state().members[1].access,'unavailable');
});

test('invitation inspection follows pagination and rejects expired invitations',()=>{
  const f=fixture();
  const original=f.c.makeGithubRequest_;
  const pages=[];
  f.permissions.delete('two');
  f.c.makeGithubRequest_=(method,path,payload)=>{
    if(path.includes('/invitations?')) {
      pages.push(path);
      return {status:200,body:path.endsWith('page=1')?Array.from({length:100},(_,id)=>({id,invitee:{login:'unrelated'+id},permissions:'write'})):[{id:101,invitee:{login:'two',id:102},permissions:'write'}]};
    }
    return original(method,path,payload);
  };
  assert.equal(f.state().ready,true);assert.equal(pages.length,2);
  f.c.makeGithubRequest_=original;
  f.invitations.push({id:101,invitee:{login:'two',id:102},permissions:'write',expired:true});
  assert.equal(f.state().ready,false);
});

test('timeliness uses all valid member timestamps, local deadline date, and reports unknown separately',()=>{
  const f=fixture();const schedule={git:Date.parse('2026-09-02T00:00:00Z')/86400000,formation:Date.parse('2026-08-20T00:00:00Z')/86400000,timezone:'Asia/Kolkata'};
  const clock={today:schedule.git+2};
  const timing=()=>f.c.githubSubmissionTiming_(f.state(),schedule,clock).state;
  assert.equal(timing(),'on-time');
  assert.equal(f.c.githubSubmissionTiming_(f.state(),{formation:schedule.formation},clock).state,'unknown');
  f.usernames[1][0]=new Date('2026-09-02T19:00:00Z');assert.equal(timing(),'late');
  f.usernames[1][0]='';assert.equal(timing(),'unknown');
  f.usernames.pop();assert.equal(timing(),'overdue');
  f.outage('/user/');assert.equal(timing(),'unknown');
});

test('bookmarked title form remains guarded; weekly Form ingestion is retired',()=>{
  const f=fixture();f.usernames.pop();f.team[2]='Existing title';f.team[13]='Approved';
  const old=JSON.stringify(f.team);
  f.c.onTeamIntakeSubmit({range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['Replacement']}});
  assert.equal(f.c.onFormSubmit,undefined);
  assert.equal(JSON.stringify(f.team),old);assert.equal(f.writes.length,0);assert.equal(f.logs.length,0);
  assert.equal(f.mails.length,1);assert(f.mails.every(mail=>mail[2].includes('Complete the GitHub step')));
});

test('ready teams retain title Form submission without weekly Form ingestion',()=>{
  const f=fixture();
  const intake={range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['New project']}};
  f.c.onTeamIntakeSubmit(intake);
  assert.equal(f.writes[0].TITLE,'NEW PROJECT');
  assert.equal(f.c.onFormSubmit,undefined);assert.equal(f.logs.length,0);
});

test('strict intake emails the team for each prerequisite failure without modifying records',()=>{
  const cases=[
    [f=>f.usernames.pop(),/valid GitHub usernames/],
    [f=>{f.usernames[1][4]='999';},/could not verify/],
    [f=>{f.team[7]='';},/repository URL/],
    [f=>f.repository(false),/Repository could not be verified/],
    [f=>f.permissions.set('two','read'),/write access is missing/],
    [f=>{f.permissions.delete('two');f.invitations.push({invitee:{login:'two',id:102},permissions:'write'});},/invitations must be accepted/],
    [f=>f.outage('/user/102'),/could not verify/],
    [f=>f.outage('/collaborators/two'),/could not be verified/],
    [f=>f.outage('/invitations'),/could not be verified/]
  ];
  for(const [arrange,message] of cases){
    const f=fixture();arrange(f);const before=JSON.stringify([f.team,f.usernames]);
    f.c.onTeamIntakeSubmit({range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['New project']}});
    assert.equal(f.writes.length,0);assert.equal(JSON.stringify([f.team,f.usernames]),before);
    assert.equal(f.mails.length,1);assert.equal(f.mails[0][0],'one@example.com,two@example.com');assert.match(f.mails[0][2],message);
    assert.equal(f.calls.some(call=>['POST','PUT','PATCH','DELETE'].includes(call.method)),false);
  }
});

test('strict intake unlocks after acceptance; outsiders cannot email the team',()=>{
  const f=fixture();f.permissions.delete('two');f.invitations.push({invitee:{login:'two',id:102},permissions:'write'});
  assert.equal(f.state().ready,true);
  const intake={range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['New project']}};
  f.c.onTeamIntakeSubmit(intake);assert.equal(f.writes.length,0);
  intake.namedValues['Email Address']=['outsider@example.com'];f.c.onTeamIntakeSubmit(intake);
  assert.equal(f.writes.length,0);assert.equal(f.mails.at(-1)[0],'outsider@example.com');
  intake.namedValues['Email Address']=['one@example.com'];f.permissions.set('two','write');f.invitations.length=0;
  f.c.onTeamIntakeSubmit(intake);assert.equal(f.writes[0].TITLE,'NEW PROJECT');
});
