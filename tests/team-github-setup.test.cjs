const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function fixture() {
  const columns={TEAM_ID:0,SEMESTER:1,TITLE:2,S1_EMAIL:3,S2_EMAIL:4,S3_EMAIL:5,S4_EMAIL:6,S1_REGNO:8,S2_REGNO:9,
    GUIDE_EMAIL:10,REVIEWER_NOTES:11,GUIDE_DECISION:12,REVIEWER_DECISION:13};
  const team=['T1','Odd','','one@example.com','two@example.com','','','https://github.com/org/capstone-odd-team-T1','R1','R2','guide@example.com'];
  const usernames=[[new Date('2026-09-01T10:00:00Z'),'one@example.com','T1','one'],[new Date('2026-09-02T10:00:00Z'),'two@example.com','T1','two']];
  const invitations=[], calls=[], writes=[], mails=[], logs=[];
  const permissions=new Map([['one','write'],['two','write']]);
  let repository=true, outage='', failWrite=false, apiFailure=0;
  const norm=value=>String(value||'').trim().toLowerCase();
  const c=vm.createContext({console,Date,
    SHEET_NAMES:{TEAM_STATUS:'teams',TEAM_ROSTER:'roster',GITHUB_USERNAME_RAW:'users',TEAM_INTAKE_RAW:'intake',RAW_LOG:'logs'},
    FIELD_DEFINITIONS:{TEAM_STATUS:{},TEAM_ROSTER:{}},
    getColumnMap:()=>columns,getSheetRows:name=>name==='teams'?[team]:name==='users'?usernames:[],
    getRepoUrlForTeam:()=>team[7],getOptionalHeaderIndex_:()=>7,
    normalizeEmail:norm,normalizeText_:norm,textEquals_:(a,b)=>norm(a)===norm(b),emailsMatch:(a,b)=>norm(a)===norm(b),
    Session:{getActiveUser:()=>({getEmail:()=>team[3]})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{flush(){}},
    getConfig:key=>key==='GITHUB_ORG_NAME'?'org':key==='GUIDE_REPO_PERMISSION'?'push':key==='COLLABORATOR_REPO_PERMISSION'?'maintain':'',
    getCoordinatorEmail:()=> 'coord@example.com',getAcademicYear:()=> '2026',Logger:{log(){}},
    MailApp:{sendEmail:(...args)=>mails.push(args)},driveFileUrl:x=>x,findTeamStatusRow:()=>2,
    getDashboardUrl:()=> 'https://dashboard',getHubRegistrySheet:()=>({getDataRange:()=>({getValues:()=>[[]]})}),
    setStatusFields:(sheet,row,fields)=>writes.push(fields),
    getSheet:name=>name==='logs'?{appendRow:row=>logs.push(row)}:{getDataRange:()=>({getValues:()=>[[],team]}),getRange:()=>({getValues:()=>[team],getValue:()=>team[10]})},
    projectDay_:(date,tz)=>{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
      return Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)/86400000;
    }
  });
  for(const file of ['student-github.js','team-github-setup.js','github-provisioning.js','intake-approval-workflow.js','logbook-tracker.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  c.updateTeamStatusRepoUrl_=(id,url)=>{if(failWrite)throw Error('Sheet write failed');team[7]=url;writes.push({id,url});};
  c.setReadmeHeading=()=>calls.push({method:'README'});
  c.makeGithubRequest=(method,path,payload)=>{
    calls.push({method,path,payload});
    if(outage && path.includes(outage))return {status:503};
    if(path.startsWith('/users/')) {
      const name=path.split('/').pop();
      return name==='invalid'?{status:404}:{status:200,body:{login:name,type:'User'}};
    }
    if(method==='POST'){repository=true;return {status:201,body:{html_url:'https://github.com/org/capstone-odd-team-T1'}};}
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
        invitations.push({id:invitations.length+1,invitee:{login:name},permissions:'write'});
        return {status:201};
      }
      return permissions.has(name)?{status:200,body:{permission:permissions.get(name)}}:{status:404};
    }
    return repository?{status:200,body:{html_url:'https://github.com/org/capstone-odd-team-T1'}}:{status:404};
  };
  return {c,team,usernames,invitations,permissions,calls,writes,mails,logs,
    state:()=>c.getTeamGithubSetup_('T1'),repair:()=>c.repairTeamGithubSetup_('T1'),
    outage:value=>{outage=value;},repository:value=>{repository=value;},failWrite:value=>{failWrite=value;},apiFailure:value=>{apiFailure=value;}};
}

test('an existing repository never bypasses missing, invalid or unverifiable team usernames',()=>{
  const f=fixture();
  f.usernames.pop();
  assert.equal(f.state().ready,false);
  assert.deepEqual(Array.from(f.state().outstandingMembers),['R2']);
  assert.equal(f.repair().usernamesComplete,false);
  assert.equal(f.writes.length,0);
  f.usernames.push([new Date(),'two@example.com','T1','invalid']);
  assert.equal(f.repair().ready,false);
  f.usernames[1][3]='two';f.outage('/users/two');
  assert.equal(f.repair().verificationUnavailable,true);
  assert.equal(f.calls.some(call=>['POST','PUT','PATCH'].includes(call.method)),false);
});

test('membership comes from TeamStatus and latest matching team/email submission only',()=>{
  const f=fixture();
  f.usernames.push([new Date(),'two@example.com','OTHER','invalid']);
  assert.equal(f.state().ready,true);
  f.team[4]='new@example.com';
  assert.equal(f.state().ready,false);
  f.usernames.push([new Date(),'new@example.com','T1','new']);f.permissions.set('new','admin');
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
  const f=fixture();f.permissions.set('two','read');f.invitations.push({id:15,invitee:{login:'two'},permissions:'read'});
  assert.equal(f.state().ready,false);
  f.apiFailure(403);assert.throws(()=>f.repair(),/Could not grant/);assert.equal(f.state().ready,false);
  f.apiFailure(0);assert.equal(f.repair().ready,true);
  assert.equal(f.invitations[0].id,15);assert.equal(f.invitations[0].permissions,'write');
  assert.equal(f.calls.some(call=>call.method==='PUT'),false);
});

test('final valid member enables new creation; failed sheet write recovers existing repo on retry',()=>{
  const f=fixture();f.team[7]='';f.repository(false);f.usernames.pop();
  assert.equal(f.repair().ready,false);assert.equal(f.calls.some(call=>call.method==='POST'),false);
  f.usernames.push([new Date(),'two@example.com','T1','two']);f.failWrite(true);
  assert.throws(()=>f.repair(),/Sheet write failed/);
  f.failWrite(false);assert.equal(f.repair().ready,true);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  assert.equal(f.team[7],'https://github.com/org/capstone-odd-team-T1');
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
  const original=f.c.makeGithubRequest;
  const pages=[];
  f.permissions.delete('two');
  f.c.makeGithubRequest=(method,path,payload)=>{
    if(path.includes('/invitations?')) {
      pages.push(path);
      return {status:200,body:path.endsWith('page=1')?Array.from({length:100},(_,id)=>({id,invitee:{login:'unrelated'+id},permissions:'write'})):[{id:101,invitee:{login:'two'},permissions:'write'}]};
    }
    return original(method,path,payload);
  };
  assert.equal(f.state().ready,true);assert.equal(pages.length,2);
  f.c.makeGithubRequest=original;
  f.invitations.push({id:101,invitee:{login:'two'},permissions:'write',expired:true});
  assert.equal(f.state().ready,false);
});

test('timeliness uses all valid member timestamps, local deadline date, and reports unknown separately',()=>{
  const f=fixture();const schedule={formation:Date.parse('2026-09-02T00:00:00Z')/86400000,timezone:'Asia/Kolkata'};
  const clock={today:schedule.formation+2};
  const timing=()=>f.c.githubSubmissionTiming_(f.state(),schedule,clock).state;
  assert.equal(timing(),'on-time');
  f.usernames[1][0]=new Date('2026-09-02T19:00:00Z');assert.equal(timing(),'late');
  f.usernames[1][0]='';assert.equal(timing(),'unknown');
  f.usernames.pop();assert.equal(timing(),'overdue');
  f.outage('/users/');assert.equal(timing(),'unknown');
});

test('bookmarked title/log forms are rejected while locked and do not mutate earlier records',()=>{
  const f=fixture();f.usernames.pop();f.team[2]='Existing title';f.team[13]='Approved';
  const old=JSON.stringify(f.team);
  f.c.onTeamIntakeSubmit({range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['Replacement']}});
  f.c.onFormSubmit({range:{getSheet:()=>({getName:()=> 'Form Responses 1'})},values:[new Date(),'one@example.com','T1','notes',1,0,'']});
  assert.equal(JSON.stringify(f.team),old);assert.equal(f.writes.length,0);assert.equal(f.logs.length,0);
  assert.equal(f.mails.length,2);assert(f.mails.every(mail=>mail[2].includes('Complete the GitHub step')));
});

test('ready teams can submit title and log; nonmembers cannot bypass the form guards',()=>{
  const f=fixture();
  const intake={range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['New project']}};
  f.c.onTeamIntakeSubmit(intake);
  assert.equal(f.writes[0].TITLE,'NEW PROJECT');
  const log={range:{getSheet:()=>({getName:()=> 'Form Responses 1'})},values:[new Date(),'one@example.com','T1','notes',1,0,'']};
  f.c.onFormSubmit(log);assert.equal(f.logs.length,1);
  log.values[1]='outsider@example.com';f.c.onFormSubmit(log);assert.equal(f.logs.length,1);
  assert.match(f.mails.at(-1)[2],/not a current member/);
});

test('strict intake emails the team for each prerequisite failure without modifying records',()=>{
  const cases=[
    [f=>f.usernames.pop(),/valid GitHub usernames/],
    [f=>{f.usernames[1][3]='invalid';},/valid GitHub usernames/],
    [f=>{f.team[7]='';},/repository URL/],
    [f=>f.repository(false),/Repository could not be verified/],
    [f=>f.permissions.set('two','read'),/write access is missing/],
    [f=>{f.permissions.delete('two');f.invitations.push({invitee:{login:'two'},permissions:'write'});},/invitations must be accepted/],
    [f=>f.outage('/users/two'),/could not verify/],
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
  const f=fixture();f.permissions.delete('two');f.invitations.push({invitee:{login:'two'},permissions:'write'});
  assert.equal(f.state().ready,true);
  const intake={range:{getSheet:()=>({getName:()=> 'intake'})},namedValues:{'Email Address':['one@example.com'],'Team ID':['T1'],'Project Title':['New project']}};
  f.c.onTeamIntakeSubmit(intake);assert.equal(f.writes.length,0);
  intake.namedValues['Email Address']=['outsider@example.com'];f.c.onTeamIntakeSubmit(intake);
  assert.equal(f.writes.length,0);assert.equal(f.mails.at(-1)[0],'outsider@example.com');
  intake.namedValues['Email Address']=['one@example.com'];f.permissions.set('two','write');f.invitations.length=0;
  f.c.onTeamIntakeSubmit(intake);assert.equal(f.writes[0].TITLE,'NEW PROJECT');
});
