const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function fixture(overrides = {}, runtime = {}) {
  const settings = { reviewCount:2, start:'09/09/2026', report:'22/11/2026', formation:'11/09/2026', title:'16/09/2026', review1:'12/10/2026', review2:'23/11/2026', ...overrides };
  const entries = Object.entries(settings);
  const labels={start:'Project Sem. Start',report:'Report Submission',formation:'Team & Git Repo',title:'Title Approval'};
  const milestoneRows=runtime.milestoneRows || [['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'],...Object.keys(labels).map(key=>[key,labels[key],settings[key],'Not Applicable',''])];
  const milestones={getDataRange:()=>({getValues:()=>{reads++;return milestoneRows;}})};
  let reads = 0;
  const sheet = {getLastRow:()=>entries.length+1, getLastColumn:()=>2, getRange:(row,col,count,width)=>({
    getValues:()=>{ reads++; return entries.slice(row-2,row-2+count).map(r=>r.slice(col-1,col-1+width)); },
    setValue:value=>{entries[row-2][col-1]=value;}
  })};
  const properties = runtime.properties || new Map([['SHEET_ID','test-id'],['GITHUB_TOKEN','test-token']]);
  const c = createSheetReadContext({Date, console,
    CacheService:runtime.cache ? {getScriptCache:()=>runtime.cache} : undefined,
    HtmlService:{createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(path.join(__dirname,'..',name+'.html'),'utf8')})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>name==='AssessmentDefinitions'?null:name==='Milestones'?milestones:sheet,getSheets:()=>[],getSpreadsheetTimeZone:()=> 'Asia/Kolkata'}),flush:()=>{}},
    Utilities:{getUuid:()=>require('node:crypto').randomUUID(),formatDate:(date,tz,pattern)=> {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
      if(pattern==='yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
      return new Intl.DateTimeFormat('en-GB',{timeZone:tz,day:'2-digit',month:'short',year:'numeric'}).format(date);
    }}
  });
  for(const file of ['lucide-icons.js','icon-renderer.js','common-constants.js','common-styles.js','common-helpers.js','milestone-config.js','rubric-config.js','weekly-activity.js','deadline-events.js','coordinator-dashboard.js','student-dashboard.js','guide-dashboard.js','reviewer-dashboard.js','api-envelope.js','guide-api.js','student-api.js','coordinator-api.js','data-bridge-client.js','reviewer-view.js','guide-view.js','student-view.js','coordinator-view.js','team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js','system-status-actions.js','student-github-actions.js','system-status-view.js','student-weekly-view.js','student-results-view.js','data-bridge-client.js','reviewer-view.js','reviewer-evaluation.js','review-evaluation-client.js','logbook-tracker.js','assessment-history-view.js','dashboard-client-scripts.js','guide-evaluation-client.js','guide-weekly-client.js','review-academic-policy.js','evaluation-lifecycle.js','publication-events.js','assessment-registry.js','guide-evaluation.js','internal-assessment-publishing.js','internal-assessment-publishing-client.js','dashboard-router.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c,{filename:file});
  }
  const definitionRows=[Array.from(vm.runInContext('ASSESSMENT_DEFINITION_HEADERS_',c)),...Array.from({length:settings.reviewCount},(_,i)=>['review'+(i+1),'REVIEW','Review '+(i+1),i+1,10,settings.start,settings['review'+(i+1)],'','review-attendance-v1',''])];
  const getSheet_=c.getSheet_;
  c.getSheet_=name=>name==='AssessmentDefinitions'?{getDataRange:()=>({getValues:()=>definitionRows})}:getSheet_(name);
  const schedule = c.getProjectSchedule_();
  c.getTeamGithubSetup_=(id, options)=>({ready:!!options.repoUrl,usernamesComplete:!!options.repoUrl,message:'GitHub setup pending',verificationUnavailable:false});
  c.getTeamsGithubSetup_=(rows, columns, repos)=>Object.fromEntries(rows.map(row=>[c.normalizeText_(row[columns.TEAM_ID]),c.getTeamGithubSetup_(row[columns.TEAM_ID],{repoUrl:repos[c.normalizeText_(row[columns.TEAM_ID])]} )]));
  c.githubSubmissionTiming_=(setup, schedule, clock)=>({state:setup && !setup.usernamesComplete && clock.today>schedule.formation?'overdue':'on-time',text:'Submission timing'});
  // Explicit Phase 1 windows in this project/timeline fixture; backend validation has dedicated tests.
  c.getWeeklySubmissionWindows_=()=>Array.from({length:9},(_,i)=>{
    const opens=Date.parse('2026-09-21T00:00:00+05:30')+i*7*86400000;
    return {weekId:'W'+(i+1),opens_at:opens,deadline_at:opens+7*86400000-1,late_until:opens+14*86400000-1};
  });
  c.readProgressEligibility_=()=>['R1','R2'].map(regNo=>({regNo,eligibleFrom:'W1',enforcedFrom:'W1'}));
  c.progressStudentEligibility_=(student,records)=>records.find(r=>r.regNo===student.regNo) || {eligibleFrom:'',enforcedFrom:''};
  c.readLogEntries_=()=>[];
  const clock = day => c.getProjectClock_(schedule,new Date(day+'T12:00:00+05:30'));
  return {c,schedule,clock,entries,milestoneRows,properties,sheet,reads:()=>reads};
}

test('Milestones read once per execution independently of legacy Config values',()=>{
 const f=fixture();assert.equal(f.reads(),1);f.c.getProjectSchedule_();f.c.getInternalReviews_();assert.equal(f.reads(),1);
 f.c.getConfig_=()=>{throw Error('Legacy Config must not be read');};assert.equal(f.c.getInternalReviews_().length,2);
});

test('guide evaluation tab uses configured opening in the schedule timezone',()=>{
 const {c,schedule}=fixture();
 const due=c.projectDay_('2026-10-12',schedule.timezone);
 const configured={...schedule,guide_eval:due,assessments:[...schedule.assessments,{key:'guide_eval',type:'GUIDE_EVALUATION',day:due,opens:due-5}]};
 const gate=(instant,plan=configured)=>c.guideEvaluationDto_(plan,c.getProjectClock_(plan,new Date(instant)));
 const before=gate('2026-10-06T18:29:59Z');
 assert.equal(before.enabled,false);
 assert.match(before.notice,/^Available from 07 Oct 2026/);
 for(const instant of ['2026-10-06T18:30:00Z','2026-10-12T12:00:00Z','2026-10-20T12:00:00Z']) assert.equal(gate(instant).enabled,true,instant);
 const missing=gate('2026-10-07T12:00:00Z',schedule);
 assert.equal(missing.enabled,false);
 assert.match(missing.notice,/Guide Evaluation is not configured in AssessmentDefinitions/);
});

test('deadline pills open exactly five days before, stay overdue, and count only eligible incomplete teams',()=>{
 const {c}=fixture();
 const events=[[{key:'custom-event',label:'Custom Pending',due:100,complete:false}],
   [{key:'custom-event',label:'Custom Pending',due:110,complete:false}],
   [{key:'custom-event',label:'Custom Pending',due:100,complete:true}]];
 assert.equal(c.buildDeadlinePills_(events,94).length,0);
 assert.equal(c.buildDeadlinePills_(events,95)[0].count,1);
 assert.equal(c.buildDeadlinePills_(events,100)[0].overdue,false);
 assert.equal(c.buildDeadlinePills_(events,101)[0].overdue,true);
 assert.equal(c.buildDeadlinePills_(events,105)[0].count,2);
 assert.equal(c.buildDeadlinePills_([[{key:'done',label:'Done',due:100,complete:true}]],105).length,0);
 assert.equal(c.buildDeadlinePills_([],105).length,0);
});

test('configured reviews automatically supply deadline pills in date order',()=>{
 const {c,schedule,clock}=fixture({reviewCount:3,review3:'30/11/2026'});
 const events=c.getTeamDeadlineEvents_([],{},'',[],{review1:{completed:false},review2:{completed:false},review3:{completed:false}},schedule,clock('2026-11-25'));
 const pills=c.buildDeadlinePills_([events],clock('2026-11-25').today);
 assert(pills.some(pill=>pill.key==='review3'));
 assert(pills.every((pill,i)=>i===0||pill.due>=pills[i-1].due));
});

test('one and three configured reviews drive timeline, student marks and coordinator UI',()=>{
  for (const count of [1,3]) {
    const f=fixture({reviewCount:count,review3:'30/11/2026'});
    const reviews=f.c.getInternalReviews_();
    assert.equal(reviews.length,count);assert(Object.isFrozen(reviews));
    const milestones=f.c.getSharedProjectTimelineData_().milestones.filter(m=>/^review/.test(m.key));
    assert.equal(milestones.length,count);
    f.c.Session={getActiveUser:()=>({getEmail:()=> 'student@example.com'})};
    assert.equal(f.c.loadStudentMarksSection,undefined); // Student results use authenticated publication snapshots only.
    const stats=Object.fromEntries(reviews.map(r=>[r.key,{completed:1,total:2,unavailable:0}]));
    const dto=f.c.buildCoordinatorDto_({stats:{total:2,reviews:stats,reposReady:0,titleApproved:0,needsAttention:0,guideEvaluation:null},teamTrackerData:[],deadlinePills:[]});
    assert.equal(dto.reviewColumns.length,count);assert(dto.reviewColumns.some(r=>r.label==='Review '+count));assert(!dto.reviewColumns.some(r=>r.label==='Review '+(count+1)));
    if(count===3) {
      const status={REVIEWER_DECISION:0,S1_EMAIL:1,S1_REGNO:2};
      const health=f.c.assessProjectTeam_(['Approved','a@example.com','R1'],status,'repo',[],{review1:{completed:true},review2:{completed:true},review3:{completed:false}},f.schedule,f.clock('2026-12-01'));
      assert(health.issue.includes('Review 3 marks overdue'));
    }
  }
});

test('review count comes only from registry REVIEW instances',()=>{
 const f=fixture({reviewCount:0});assert.equal(f.c.getInternalReviews_().length,0);
 assert.throws(()=>fixture({reviewCount:3}),/Opening and due date are required/);
 const three=fixture({reviewCount:3,review3:'30/11/2026'});assert.equal(three.schedule.reviews.length,3);
});

test('DD/MM parsing, Date cells, invalid dates and missing config',()=>{
  const {c,schedule:s}=fixture();
  assert.equal(c.formatProjectDay_(s.review1),'12 Oct 2026');
  assert.equal(c.projectDay_(new Date('2026-09-08T18:30:00Z'),'Asia/Kolkata'),s.start);
  assert.throws(()=>c.projectDay_('31/02/2026','UTC','TEST'),/invalid calendar/);
  assert.throws(()=>fixture({formation:''}),/formation Due Date/i);
  assert.throws(()=>fixture({report:'10/09/2026'}),/Milestones start/);
  assert(s.review2>s.end);
});

test('Monday strictly after title date, including a Monday title date',()=>{
  for(const [title,expected] of [['16/09/2026','21 Sept 2026'],['20/09/2026','21 Sept 2026'],['21/09/2026','28 Sept 2026']]) {
    const {c,schedule}=fixture({title:title});
    assert.equal(c.formatProjectDay_(schedule.week1),expected);
  }
});

test('weeks start Monday, close Sunday and stop at project end',()=>{
  const {clock}=fixture();
  assert.equal(clock('2026-09-20').week,0);
  assert.equal(clock('2026-09-21').week,1);
  assert.equal(clock('2026-09-27').completedWeeks,0);
  assert.equal(clock('2026-09-28').completedWeeks,1);
  assert.equal(clock('2026-11-22').week,9);
  assert.equal(clock('2026-11-22').completedWeeks,8);
  assert.equal(clock('2026-11-23').completedWeeks,9);
  assert.equal(clock('2026-11-23').active,false);
  const partial=fixture({report:'20/11/2026'});
  assert.equal(partial.clock('2026-11-21').completedWeeks,9);
});

test('timezone boundaries and future/invalid timestamps do not count',()=>{
  const {c,schedule:s}=fixture();
  const before=c.getProjectClock_(s,new Date('2026-09-20T18:29:59Z'));
  const after=c.getProjectClock_(s,new Date('2026-09-20T18:30:00Z'));
  assert.equal(before.active,false); assert.equal(after.week,1);
});

test('missing logs use configured closed windows and effective student revisions',()=>{
  const {c,clock}=fixture();
  assert.equal(c.getLogWeekSummary_([],'W1','R1',clock('2026-09-27').now).missing,0);
  assert.equal(c.getLogWeekSummary_([],'W1','R1',clock('2026-09-28').now).missing,0);
  assert.equal(c.getLogWeekSummary_([],'W1','R1',clock('2026-10-05').now).missing,1);
  const logs=[{regNo:'R1',weekId:'W1',entryStatus:'SUBMITTED'},{regNo:'R1',weekId:'W1',entryStatus:'REVISED'},{regNo:'R1',weekId:'W2',entryStatus:'SUBMITTED'}];
  const result=c.getLogWeekSummary_(logs,'W1','R1',clock('2026-10-05').now);
  assert.equal(result.missing,0);assert.equal(result.currentLogged,false);
});

test('attention waits until the day after each configured deadline',()=>{
  const {c,schedule:s,clock}=fixture();
  const columns={S1_EMAIL:0,REVIEWER_DECISION:1,S1_REGNO:2};
  const review={review1:{completed:true},review2:{completed:true}};
  const health=(day,row=['student','Approved'],repo='url',r=review)=>{row[2]='R1';row[40]='W1';return c.assessProjectTeam_(row,columns,repo,[],r,s,clock(day));};
  assert.equal(health('2026-09-11',['student',''],'').health,'monitor');
  assert(health('2026-09-12',['student',''],'').issue.includes('GitHub username submissions overdue'));
  assert(!health('2026-09-16',['student','']).issue.includes('Title'));
  assert(health('2026-09-17',['student','']).issue.includes('Title'));
  assert.equal(health('2026-09-27').health,'monitor');
  assert(!health('2026-09-28').issue.includes('weekly log(s) overdue'));
  assert(health('2026-10-05').issue.includes('weekly log(s) overdue'));
  const pending={review1:{completed:false},review2:{completed:false}};
  assert(!health('2026-10-12',undefined,undefined,pending).issue.includes('Review 1'));
  assert(health('2026-10-13',undefined,undefined,pending).issue.includes('Review 1'));
  assert(!health('2026-11-23',undefined,undefined,pending).issue.includes('Review 2'));
  assert(health('2026-11-24',undefined,undefined,pending).issue.includes('Review 2'));
});

test('shared timeline uses Milestones dates while coordinator keeps completion counts',()=>{
  const {c}=fixture();
  const data=c.getSharedProjectTimelineData_();
  assert.equal(data.milestones.find(m=>m.key==='week1').date,'21 Sept 2026');
  assert.equal(data.totalWeeks,9);
  assert.doesNotThrow(()=>JSON.stringify(data));
  new vm.Script(c.getDashboardClientScript_());
});


test('team health requires a log from every rostered student',()=>{
  const {c,schedule:s,clock}=fixture();
  const columns={S1_EMAIL:0,S2_EMAIL:1,S1_REGNO:2,S2_REGNO:3};
  const row=['ONE@example.com','two@example.com','R1','R2'];row[40]='W1';
  const logs=[{regNo:'R1',weekId:'W1',entryStatus:'SUBMITTED'},{regNo:'R1',weekId:'W1',entryStatus:'REVISED'}];
  const during=c.getTeamLogWeekSummary_(row,columns,logs,s,clock('2026-09-23'));
  assert.equal(during.loggedStudents,1); assert.equal(during.currentLogged,false); assert.equal(during.missing,0);
  const closed=c.getTeamLogWeekSummary_(row,columns,logs,s,clock('2026-10-05'));
  assert.equal(closed.missing,1);
});


test('coordinator statistics, attention list and tracker share one health result',()=>{
  const {c,clock}=fixture({COLLABORATOR_GITHUB_USERNAME:'coordinator',COLLABORATOR_REPOS_ACCESS:1});
  const definitions=vm.runInContext('FIELD_DEFINITIONS',c);
  const maps=Object.fromEntries(Object.entries(definitions).map(([name,fields])=>[name,Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]))]));
  c.getColumnMap_=(name,fields)=> Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]));
  const ts=maps.TEAM_STATUS;
  const row=[];
  for(const [key,value] of Object.entries({TEAM_ID:'T1',TITLE:'Project',REVIEWER_DECISION:'Approved',S1_EMAIL:'one@example.com',S2_EMAIL:'two@example.com',S1_REGNO:'R1',S2_REGNO:'R2'})) row[ts[key]]=value;
  row[40]='W1';
  c.readLogEntries_=()=>[{regNo:'R1',teamId:'T1',weekId:'W1',entryStatus:'SUBMITTED'},{regNo:'R1',teamId:'T1',weekId:'W2',entryStatus:'SUBMITTED'}];
  const sheetRows={TeamStatus:[row],TeamRoster:[],ReviewCommittee:[],Commits:[],RawLog:[['2026-09-21','one@example.com','T1'],['2026-09-28','one@example.com','T1']]};
  c.getSheetRows_=name=>sheetRows[name]||[];
  c.readActivityRows_=name=>sheetRows[name]||[];
  c.getRepoUrlMap_=()=>({t1:'https://example.com/repo'});
  c.getAllReviewCompletionStatus_=()=>({t1:{review1:{completed:false},review2:{completed:false}}});
  const now=clock('2026-10-05');
  c.getProjectClock_=()=>now;
  const assessed=[],assess=c.assessProjectTeam_;
  c.assessProjectTeam_=(...args)=>{const result=assess(...args);assessed.push(result);return result;};
  const data=c.getCoordinatorDashboardData_();
  assert.equal(data.stats.needsAttention,1);
  assert.equal(data.teamTrackerData[0].health,'attention');
  assert.equal(assessed.at(-1).daysOverdue,8);
  assert(assessed.at(-1).issue.includes('1 student weekly log(s) overdue'));
  const originalGithub=c.getTeamGithubSetup_;
  c.getTeamGithubSetup_=()=>{throw Error('Coordinator must not inspect GitHub details');};
  c.getTeamsGithubSetup_=()=>{throw Error('Coordinator must not batch GitHub checks');};
  const incomplete=c.getCoordinatorDashboardData_();
  assert.equal(incomplete.stats.reposReady,1,'repository availability is counted separately');
  assert.equal(incomplete.teamTrackerData[0].repoStatus,'ready');
  assert.equal(incomplete.teamTrackerData[0].githubTiming,'');
  assert(!assessed.at(-1).issue.includes('GitHub username'));
  const originalRepoMap=c.getRepoUrlMap_;
  c.getRepoUrlMap_=()=>({});
  const missingRepo=c.getCoordinatorDashboardData_();
  assert.equal(missingRepo.teamTrackerData[0].repoStatus,'pending');
  assert(assessed.at(-1).issue.includes('Repository URL missing'));
  c.getRepoUrlMap_=originalRepoMap;
  c.getTeamGithubSetup_=originalGithub;
  const readActivity=c.readActivityRows_, readReviews=c.getAllReviewCompletionStatus_;
  c.readActivityRows_=()=>{throw Error('Overview must not read historical logs');};
  let overviewMarksReads=0;
  c.getAllReviewCompletionStatus_=()=>{overviewMarksReads++;throw Error('Overview must not read marks');};
  const overview=c.getCoordinatorDashboardData_(true);
  assert.equal(overviewMarksReads,0);
  assert.equal(overview.stats.loading,true);
  assert.equal(overview.stats.total,1);
  assert.equal(overview.teamTrackerData[0].health,'loading');
  assert.equal(overview.teamTrackerData[0].reviews.review1,'Loading…');
  assert.equal(overview.teamTrackerData[0].deadlineEvents.length,0);
  c.readActivityRows_=readActivity;c.getAllReviewCompletionStatus_=readReviews;
  c.getProjectSchedule_=()=>{throw Error('Missing review2');};
  c.getAllReviewCompletionStatus_=()=>{throw Error('Missing rubrics');};
  const degraded=c.getCoordinatorDashboardData_();
  assert.equal(degraded.stats.total,1);
  const dto=c.buildCoordinatorDto_(degraded);
  assert.equal(dto.teams.length,1);assert.equal(dto.stats.total,1);
  c.getInternalReviews_=()=>{throw Error('Invalid review count');};
  const noReviews=c.buildCoordinatorDto_(c.getCoordinatorDashboardData_());
  assert.equal(noReviews.teams.length,1);assert.equal(noReviews.reviewConfigurationError,true);assert.deepEqual(Array.from(noReviews.reviewColumns),[]);
});


function sharedCache() {
  const values=new Map();
  return {values,get:key=>values.get(key)||null,put:(key,value)=>values.set(key,value)};
}

test('coordinator endpoints authorize every request before reading protected data',()=>{
  const {c}=fixture();
  let email='', allowed=true, reads=0;
  const logs=[];
  c.console={log:value=>{try{logs.push(JSON.parse(value));}catch(e){}},error(){}};
  c.Session={getActiveUser:()=>({getEmail:()=>email})};
  c.activityIsCoordinator_=()=>allowed;
  c.getCoordinatorDashboardData_=()=>{reads++;return {stats:{total:0,reviews:{},guideEvaluation:null},teamTrackerData:[],deadlinePills:[]};};
  c.getCoordinatorTeamDetails_=()=>{reads++;return {};};
  c.loadAllTeamsWeeklyActivity_=()=>{reads++;return {state:'active',teams:{}};};
  c.buildSystemStatusDto_=()=>{reads++;return {github:{},publishing:{configured:false,items:[]}};};
  const api=[()=>c.API_coordinator_getOverview(),()=>c.API_coordinator_getActivity(),()=>c.API_coordinator_getSystemStatus()];
  const sections=[()=>c.API_coordinator_getReviewProgress('review1'),()=>c.API_coordinator_getGuideProgress(),()=>c.API_coordinator_getHealth()];
  for (const section of ['basic','progress','activity']) assert.throws(()=>c.loadCoordinatorDrawerSection_('T1',section),/Coordinator access/);
  for(const endpoint of api.concat(sections)) assert.equal(JSON.parse(endpoint()).error.code,'UNAUTHENTICATED');
  assert.equal(reads,0);
  email='coord@example.com';
  api.forEach(endpoint=>assert.equal(JSON.parse(endpoint()).ok,true));
  assert.equal(reads,3);
  allowed=false;
  for(const endpoint of api.concat(sections)) assert.deepEqual(JSON.parse(endpoint()).error,{code:'UNAUTHORIZED',message:'Coordinator access is required.'});
  assert.equal(reads,3);
  assert(logs.filter(log=>log.event==='coordinator_request').every(log=>Number.isFinite(log.durationMs)));
  assert.equal(vm.runInContext('dashboardReadSnapshot_',c),null);
});

test('unavailable reviews do not produce overdue review alerts or on-track health',()=>{
  const {c,schedule,clock}=fixture();
  const reviews={review1:{available:false,completed:false},review2:{available:true,completed:true}};
  const row=['Approved'];const columns={REVIEWER_DECISION:0};
  const now=clock('2026-12-01');
  c.getTeamLogWeekSummary_=()=>({missing:0,currentLogged:true});
  const health=c.assessProjectTeam_(row,columns,'repo',[],reviews,schedule,now);
  assert(!health.issue.includes('marks overdue'));
  const events=c.getTeamDeadlineEvents_(row,columns,'repo',[],reviews,schedule,now);
  assert(!events.some(event=>event.key==='review1'));
  row[1]='student@example.com';columns.S1_EMAIL=1;
  assert.equal(c.assessProjectTeam_(row,columns,'repo',[],reviews,schedule,now).health,'monitor');
});

test('drawer sections load independently, retry alone and ignore stale callbacks',async()=>{
  const {parseHTML}=require('linkedom');
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const {c}=fixture();const requests=[];
  const {document,window}=parseHTML('<html><body><div id="teamDrawerBackdrop" hidden></div><aside id="teamDrawer" hidden aria-hidden="true"><button type="button" data-drawer-close></button><h2 id="teamDrawerTitle"></h2><div id="teamDrawerContent"></div></aside></body></html>');
  const script={get run(){const handlers={};const chain={withSuccessHandler(fn){handlers.success=fn;return chain;},withFailureHandler(fn){handlers.failure=fn;return chain;},API_coordinator_getTeamDrawer(teamId,section){const {success}=handlers;requests.push({...handlers,success:data=>success(JSON.stringify({ok:true,data})),teamId,section});}};return chain;}};
  const browser=createSheetReadContext({window:{},performance:{now:()=>Date.now()},setTimeout,clearTimeout,document,google:{script},console});
  for(const file of ['data-bridge-client.js','reviewer-view.js','guide-view.js','student-view.js','coordinator-view.js','team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js','system-status-actions.js','student-github-actions.js','system-status-view.js','student-weekly-view.js','student-results-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),browser);vm.runInContext(browser.getMigratedViewsClientScript_(),browser);vm.runInContext(c.getDashboardClientScript_(),browser);
  const section=name=>document.querySelector('[data-drawer-section="'+name+'"]');
  vm.runInContext("DashboardUI.focusCoordinatorTeam('A'); DashboardUI.focusCoordinatorTeam('B');",browser);
  assert.deepEqual(requests.map(r=>r.section),['basic','progress','activity','basic','progress','activity']);
  requests[3].success({title:'Team B project',students:[],reviewers:[]});await settle();
  assert(section('basic').textContent.includes('Team B project'));
  assert(!section('basic').textContent.includes('Overall Health'));
  requests[5].success({weekLogs:4,weekCommits:2});await settle();
  assert(section('activity').textContent.includes('This Week'));
  assert(!section('activity').textContent.includes('Project'));
  requests[4].failure({message:'marks unavailable'});await settle();
  assert(section('progress').textContent.includes('Unable to load progress: marks unavailable'));
  section('progress').querySelector('[data-action="drawer-retry"]').dispatchEvent(new window.Event('click',{bubbles:true}));await settle();
  assert.equal(requests.length,7);assert.equal(requests[6].section,'progress');
  requests[6].success({reviews:[],health:'ontrack'});await settle();
  assert(section('progress').textContent.includes('Overall Health'));
  const expected=section('basic').innerHTML;
  requests[0].success(null);await settle();requests[0].failure({message:'A response'});await settle();
  assert.equal(section('basic').innerHTML,expected);
  vm.runInContext('DashboardUI.closeCoordinatorTeamDrawer()',browser);
  requests[3].success(null);await settle();
  assert.equal(section('basic').innerHTML,expected);
  // Release every held read so the bridge leaves no timers behind.
  requests.forEach(request=>request.success(null));await settle();
});

test('each schedule request reads live Milestones without accessing shared caches',()=>{
  const cache={get(){throw Error('No cache reads');},put(){throw Error('No cache writes');}};
  const first=fixture({}, {cache});
  first.milestoneRows.find(row=>row[0]==='title')[2]='21/09/2026';
  const next=fixture({}, {cache,properties:first.properties,milestoneRows:first.milestoneRows});
  assert.equal(first.reads(),1);assert.equal(next.reads(),1);
  assert.equal(next.c.formatProjectDay_(next.schedule.week1),'28 Sept 2026');
  next.c.getProjectSchedule_();assert.equal(next.reads(),1);
});

test('read-only dashboard snapshots reuse rows and are released after success or failure',()=>{
  const {c}=fixture();
  let reads=0;
  c.getSheet_=()=>({getDataRange:()=>({getValues:()=>{reads++;return [['header'],['value']];}})});
  c.withDashboardRead_(()=>{
    const first=c.getSheetRows_('TeamStatus');
    assert.equal(c.getSheetRows_('TeamStatus'),first);
    c.withDashboardRead_(()=>assert.equal(c.getSheetRows_('TeamStatus'),first));
  });
  assert.equal(reads,1);
  c.getSheetRows_('TeamStatus'); c.getSheetRows_('TeamStatus');
  assert.equal(reads,3);
  assert.throws(()=>c.withDashboardRead_(()=>{c.getSheetRows_('TeamStatus');throw Error('test failure')}));
  c.getSheetRows_('TeamStatus'); assert.equal(reads,5);
});


test('matched student records use one read and exclude nonmatching rows',()=>{
  const {c}=fixture(); let reads=0;
  const sheet={getLastColumn:()=>3,getRange:(row,column,count,width)=>{
    reads++; assert.deepEqual([row,column,count,width],[3,1,6,3]);
    return {getValues:()=>Array.from({length:6},(_,i)=>[i+3,'email','team'])};
  }};
  const cells=[3,8,5].map(row=>({getRow:()=>row}));
  assert.equal(JSON.stringify(c.readMatchedRows_(sheet,cells)),JSON.stringify([[3,'email','team'],[8,'email','team'],[5,'email','team']]));
  assert.equal(reads,1);
  assert.equal(c.readMatchedRows_(sheet,[]).length,0);
  assert.equal(reads,1);
});

test('guide request shares authorization rows with rendering but rechecks the next request',()=>{
  const {c}=fixture(); let reads=0, rendered=0;
  let guideEmail='guide@example.com';
  c.Session={getActiveUser:()=>({getEmail:()=> 'guide@example.com'})};
  c.getColumnMap_=()=>({TEAM_ID:0,GUIDE_EMAIL:1});
  c.getSheet_=()=>({getDataRange:()=>({getValues:()=>{reads++;return [['team','guide'],['T1',guideEmail]];}})});
  c.getGuideDashboardData_=()=>({rows:c.getSheetRows_('TeamStatus')});
  c.buildGuideDto_=()=>{rendered++;return {teams:[]};};
  assert.deepEqual(JSON.parse(c.API_guide_getDashboard()).data,{teams:[]});
  assert.equal(reads,1); assert.equal(rendered,1);
  guideEmail='replacement@example.com';
  assert.deepEqual(JSON.parse(c.API_guide_getDashboard()).error,{code:'UNAUTHORIZED',message:'You do not have Guide access.'});
  assert.equal(reads,2); assert.equal(rendered,1);
});


function timelineBrowser() {
  const {c}=fixture();
  const requests=[];
  const target=()=>({innerHTML:'',children:[],appendChild(){},remove(){},classList:{add(){},remove(){}},attributes:{},nodes:{},listeners:{},scrollLeft:0,scrollWidth:1000,clientWidth:400,
    getBoundingClientRect(){return {left:0,width:132};},
    setPointerCapture(id){this.capturedPointer=id;},
    hasPointerCapture(id){return this.capturedPointer===id;},
    releasePointerCapture(){this.capturedPointer=null;},
    setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(event,fn){this.listeners[event]=fn;},
    querySelector(selector){return this.nodes[selector] ||= target();},
    querySelectorAll(){return [{offsetLeft:0},{offsetLeft:208}];},
    scrollBy(options){this.lastScroll=options;},focus(){this.focused=true;}});
  const timeline=target(), guide=target(), reviewer=target();
  let initialize;
  const document={body:target(),createElement:target,readyState:'loading',addEventListener:(event,callback)=>{initialize=callback;},
    getElementById:id=>id==='sharedProjectTimeline'?timeline:null,
    querySelectorAll:()=>[],querySelector:selector=>{
      if(selector==='[data-role-panel]:not([hidden])')return {getAttribute:()=> 'guide'};
      if(selector.includes('data-role-content="guide"'))return guide;
      if(selector.includes('data-role-content="reviewer"'))return reviewer;
      return null;
    }};
  const script={get run(){
    const handlers={};
    const chain={withSuccessHandler(fn){handlers.success=fn;return chain;},withFailureHandler(fn){handlers.failure=fn;return chain;},
      API_shared_getTimeline(){const {success}=handlers;requests.push({type:'timeline',...handlers,success:data=>success(JSON.stringify({ok:true,data}))});},
      loadDashboardRoleContent(role){requests.push({type:'role',role,...handlers});},
      // Migrated reviewer role answers through the data bridge with a response envelope.
      API_reviewer_getDashboard(){const {success}=handlers;requests.push({type:'role',role:'reviewer',...handlers,success:html=>success(JSON.stringify({ok:true,data:{html}}))});},
      API_guide_getDashboard(){const {success}=handlers;requests.push({type:'role',role:'guide',...handlers,success:html=>success(JSON.stringify({ok:true,data:{html}}))});},
      API_student_getDashboard(){const {success}=handlers;requests.push({type:'role',role:'student',...handlers,success:html=>success(JSON.stringify({ok:true,data:{html}}))});},
      API_coordinator_getOverview(){const {success}=handlers;requests.push({type:'role',role:'coord',...handlers,success:html=>success(JSON.stringify({ok:true,data:{html}}))});}};
    return chain;
  }};
  const browser=createSheetReadContext({window:{matchMedia:()=>({matches:false})},ResizeObserver:class {constructor(callback){this.callback=callback;} observe(){} disconnect(){}},performance:{now:()=>Date.now()},setTimeout,clearTimeout,document,google:{script},console});
  for(const file of ['data-bridge-client.js','reviewer-view.js','guide-view.js','student-view.js','coordinator-view.js','team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js','system-status-actions.js','student-github-actions.js','system-status-view.js','student-weekly-view.js','student-results-view.js','coordinator-view.js','team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js','system-status-actions.js','student-github-actions.js'])vm.runInContext(fs.readFileSync(file,'utf8'),browser);vm.runInContext(browser.getMigratedViewsClientScript_(),browser);vm.runInContext('ReviewerView.render=GuideView.render=StudentView.render=CoordinatorView.render=SystemStatusView.render=(host,dto)=>{host.innerHTML=dto.html;}',browser);vm.runInContext(c.getDashboardClientScript_(),browser);
  return {c,browser,requests,timeline,guide,reviewer,initialize:()=>initialize()};
}

test('timeline is single-flight and never blocks either role dashboard',async()=>{
  const f=timelineBrowser(); f.initialize();
  assert.deepEqual(f.requests.map(r=>r.type),['role','timeline']);
  const ready=vm.runInContext('DashboardSchedule.ready()',f.browser);
  assert.equal(f.requests.length,2);
  f.requests[0].success('Guide loaded while timeline pending');
  await new Promise(resolve => setImmediate(resolve));
  assert(f.guide.innerHTML.includes('Guide loaded'));
  vm.runInContext("DashboardUI.showRoleTab('reviewer')",f.browser);
  assert.equal(f.requests[2].role,'reviewer');
  f.requests[2].success('Reviewer loaded');
  f.requests[1].success(JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_())));
  const result=await ready;
  assert(Object.isFrozen(result)); assert(Object.isFrozen(result.schedule)); assert(Object.isFrozen(result.milestones[0]));
  assert.equal(await vm.runInContext('DashboardSchedule.ready()',f.browser),result);
  assert.equal(f.requests.filter(r=>r.type==='timeline').length,1);
  assert(f.timeline.innerHTML.includes('timeline-track'));
  assert.match(f.timeline.innerHTML,/title="Opens .*; due /);
  assert(!f.guide.innerHTML.includes('timeline-track'));
  assert.equal(f.timeline.attributes['aria-busy'],'false');
});

function renderedTimeline(offsets,extra=[]) {
 const {parseHTML}=require('linkedom');
 const {document}=parseHTML('<section id="timeline"></section>');
 const target=document.querySelector('section');
 const c=vm.createContext({});
 vm.runInContext(fs.readFileSync('shared-timeline-view.js','utf8'),c);
 const view=c.sharedTimelineViewBrowser_(()=>({renderIcon:()=>'<svg></svg>'}));
 const data={today:100,todayLabel:'29 Sep 2026',milestones:offsets.map((offset,i)=>({key:'m'+i,label:'Milestone '+i,day:100+offset,date:'30 Sep 2026',openingDate:'20 Sep 2026'})).concat(extra)};
 const before=JSON.stringify(data);view.render(target,data);assert.equal(JSON.stringify(data),before);
 return {target,visible:()=>Array.from(target.querySelectorAll('[data-timeline-stop]')).filter(el=>!el.hidden)};
}

test('compact timeline shows two past dates, nearest due milestone and two upcoming milestones',()=>{
 const f=renderedTimeline([-9,-6,-3,0,1,5,9]);
 assert.deepEqual(f.visible().map(el=>el.querySelector('strong').textContent),['Milestone 1','Milestone 2','Milestone 3','Milestone 4','Milestone 5']);
 const current=f.target.querySelector('[aria-current="step"]');
 assert.match(current.textContent,/Milestone 3.*CURRENT · Due today/);
 assert.equal(f.target.querySelectorAll('[data-timeline-state="current"]').length,1);
 assert.equal(f.target.querySelectorAll('[data-timeline-state="past"] svg').length,3);
 assert.equal(f.visible()[0].querySelector('[data-timeline-timing]'),null);
 assert.doesNotMatch(f.target.textContent,/Date passed|Current phase:/);
 assert(f.target.querySelector('[data-timeline-toggle]'));
 assert.doesNotMatch(f.target.innerHTML,/Tomorrow|Up Next|timeline-navigation|timeline-scroll|milestones complete/);
 assert.match(current.querySelector('[data-timeline-date]').title,/Opens 20 Sep 2026; due 30 Sep 2026/);
});

test('mobile timeline selects previous current and next without shrinking desktop context',()=>{
 for(const [offsets,expected] of [[[-9,-6,-3,0,1,5,9],[2,3,4]],[[1,5,9],[0,1]],[[-9,-6,-3],[1,2]],[[],[]]]) {
  const f=renderedTimeline(offsets);
  assert.deepEqual(Array.from(f.target.querySelectorAll('[data-timeline-mobile="true"]')).map(el=>el.querySelector('strong').textContent),expected.map(i=>'Milestone '+i));
 }
 const f=renderedTimeline([-9,-6,-3,0,1,5,9]);
 const hidden=Array.from(f.target.querySelectorAll('[data-timeline-stop]')).filter(el=>el.getAttribute('class').includes('max-[760px]:hidden'));
 assert.equal(hidden.length,f.target.querySelectorAll('[data-timeline-mobile="false"]').length);
 assert(hidden.every(el=>el.dataset.timelineMobile==='false'));
 assert(require('./compiled-css.cjs').compiled('max-[760px]:hidden'));
});

test('current timeline handles tomorrow, before start, same-day dates, after end and empty lifecycle',()=>{
 for(const offsets of [[1,5,9],[0,0,5],[-2,0],[-3,-2],[]]) {
  const f=renderedTimeline(offsets),next=offsets.findIndex(n=>n>=0),current=f.target.querySelector('[aria-current="step"]');
  assert.equal(!!current,next>=0);
  if(current){assert.equal(current.querySelector('strong').textContent,'Milestone '+next);assert.match(current.textContent,offsets[next]===0?/CURRENT · Due today/:/CURRENT · Due tomorrow/);}
  else if(!offsets.length) assert.match(f.target.textContent,/No project milestones scheduled/);
 }
});

test('full timeline disclosure reveals lifecycle without mutating schedule or displaying weekly boundaries',()=>{
 const f=renderedTimeline([-10,-8,-5,-2,2,5,8,10],[{key:'week1',label:'Weekly logging starts',day:100,date:'29 Sep'},{key:'end',label:'Weekly logging ends',day:120,date:'19 Oct'}]);
 const button=f.target.querySelector('[data-timeline-toggle]');assert.equal(f.visible().length,5);
 assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(button.textContent,'View full timeline');
 button.click();assert.equal(f.visible().length,8);assert.equal(button.getAttribute('aria-expanded'),'true');
 assert(f.target.querySelector('[data-timeline-track]').classList.contains('timeline-full'));
 assert.doesNotMatch(f.target.textContent,/Weekly logging/);
 button.click();assert.equal(f.visible().length,5);assert.equal(button.getAttribute('aria-expanded'),'false');
});

test('timeline has no carousel or animation styles',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','tailwind-styles.html'),'utf8');
 assert.match(css,/@media (\((max-width:760px|width<=760px|width<760px)\)|not all and \(min-width:760px\))/);
 assert.doesNotMatch(css,/\.timeline-current\{|timeline-nav|\.timeline[^{}]*\{[^}]*animation/);
});

test('timeline errors are isolated and a subsequent retry succeeds',async()=>{
  const f=timelineBrowser(); f.initialize();
  const pending=vm.runInContext('DashboardSchedule.ready()',f.browser);
  const rejected=assert.rejects(pending,/offline/);
  f.requests[1].failure(new Error('offline'));
  await rejected;
  assert(f.timeline.innerHTML.includes('Schedule unavailable'));
  f.requests[0].success('Guide still works');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.guide.innerHTML,'Guide still works');
  const retry=vm.runInContext('DashboardSchedule.ready()',f.browser);
  assert.equal(f.requests[2].type,'timeline');
  f.requests[2].success(JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_())));
  await retry;
});

test('timeline endpoint rejects users without dashboard access',()=>{
  const {c}=fixture();
  c.Session={getActiveUser:()=>({getEmail:()=> 'outsider@example.com'})};
  c.getDashboardRoleViews_=()=>[];
  assert.throws(()=>c.loadSharedProjectTimeline_(),/Dashboard access/);
  c.getDashboardRoleViews_=()=>[{key:'guide'}];
  assert.equal(c.loadSharedProjectTimeline_().milestones.length,7);
});

test('shared timeline, rubrics and drawer endpoints return the existing data with the existing access messages',()=>{
  const {c}=fixture();
  c.Session={getActiveUser:()=>({getEmail:()=> 'outsider@example.com'})};
  c.getDashboardRoleViews_=()=>[];
  assert.deepEqual(JSON.parse(c.API_shared_getTimeline()).error,{code:'REJECTED',message:'Dashboard access is required.'});
  c.getDashboardRoleViews_=()=>[{key:'guide'}];
  assert.equal(JSON.parse(c.API_shared_getTimeline()).data.milestones.length,7);
  c.loadSharedRubrics_=()=>({assessments:[]});
  assert.deepEqual(JSON.parse(c.API_shared_getRubrics()).data,{assessments:[]});
  c.loadCoordinatorDrawerSection_=(team,section)=>({team,section});
  assert.deepEqual(JSON.parse(c.API_coordinator_getTeamDrawer('T1','basic')).data,{team:'T1',section:'basic'});
});

test('normalization handles whitespace, case, numeric IDs and literal search metacharacters',()=>{
  const {c}=fixture();
  assert(c.textEquals_(' T1\t','t1')); assert(c.textEquals_(1,' 1 '));
  assert(c.emailsMatch_(' User@Example.com ','user@example.com'));
  for(const value of ['a+b@example.com','team[1]','x.y','a\\b','a(b)','x$^']) {
    const pattern=new RegExp(c.normalizedTextPattern_(value),'i');
    assert(pattern.test('  '+value.toUpperCase()+' '));
    assert(!pattern.test('prefix'+value));
  }
  const grouped=c.groupBy_([{id:' T1 '},{id:'t1'}],r=>r.id);
  assert.equal(grouped.t1.length,2);
  const sheet={getLastRow:()=>3,getLastColumn:()=>1,getRange:()=>({getValues:()=>[[' T1 '],[2]]})};
  assert.equal(c.findTeamStatusRow_(sheet,'t1',{TEAM_ID:0}),2);
  assert.equal(c.findTeamStatusRow_(sheet,' 2 ',{TEAM_ID:0}),3);
});

test('Config keys ignore case and spaces while values remain unchanged',()=>{
  const f=fixture({' Custom_Id ':'AbC_DeF'});
  assert.equal(f.c.getConfig_(' CUSTOM_ID '),'AbC_DeF');
  f.c.setConfig_(' custom_ID ','MiXeD');
  assert.equal(f.c.getConfig_('CUSTOM_id'),'MiXeD');
  assert.throws(()=>fixture({' CUSTOM_ID ':'one',custom_id:'two'}).c.getConfig_('custom_id'),/Duplicate Config key/);
});

test('approval status and committee access tolerate case and surrounding spaces',()=>{
  const {c}=fixture();
  c.getColumnMap_=()=>({TEAM_ID:0,TITLE:0,GUIDE_DECISION:1,REVIEWER_DECISION:2,COMMITTEE_NUMBER:3});
  assert.equal(c.getTeamStatus_(['Title',' approved ',' APPROVED ']),'APPROVED');
  assert.equal(c.getTeamStatus_(['Title','',' revise ']),'REVISE_AWAITING_STUDENT');
  c.getSheetRows_=()=>[['Title',' APPROVED ',' pending ',' C1 ']];
  c.getCommitteeNumbersForReviewer_=()=>['c1'];
  c.getCommitteeInfo_=()=>({});
  const data=c.getReviewerDashboardData_('Reviewer@example.com');
  assert.equal(data.pending.length,1);assert.equal(data.assigned.length,1);assert.equal(data.assigned[0][3],' C1 ');
});

test('sheet-label fallback ignores case and spacing without changing the sheet',()=>{
  const {c}=fixture();
  const sheet={getName:()=> ' Committee A - Review 1 '};
  assert.equal(c.getNamedSheet_({getSheetByName:()=>null,getSheets:()=>[sheet]},'committee a - review 1'),sheet);
});

test('the legacy role route is gone; the overview endpoint reads no marks or logs',()=>{
  const {c}=fixture();
  c.Session={getActiveUser:()=>({getEmail:()=> 'coord@example.com'})};
  c.getCoordinatorEmail_=()=> 'coord@example.com';
  c.getConfig_=()=> '';
  assert.equal(typeof c.loadDashboardRoleContent,'undefined');
  c.activityIsCoordinator_=()=>true;
  c.console={log(){},error(){}};
  c.getCoordinatorDashboardData_=(defer)=>{if(!defer)throw Error('Overview must not aggregate progress');return {stats:{loading:true,total:0,reviews:{},guideEvaluation:null},teamTrackerData:[],deadlinePills:[]};};
  assert.equal(JSON.parse(c.API_coordinator_getOverview()).data.loading,true);
});

test('drawer basic and activity avoid marks; progress avoids roster and commit reads',()=>{
  const {c,schedule,clock}=fixture();
  const reads=[];
  c.getColumnMap_=()=>({TEAM_ID:0,TITLE:1,COMMITTEE_NUMBER:2});
  c.getSheetRows_=name=>{reads.push(name);return [['T1','Project','1']];};
  c.getRepoUrlForTeam_=()=> 'https://github.com/example/project';
  c.getCommitteeInfo_=()=>null;c.getTeamStatus_=()=> 'APPROVED';
  c.getTeamReviewCompletionStatus_=()=>{throw Error('marks must not be read');};
  c.readActivityRows_=()=>{throw Error('logs must not be read');};
  c.weeklyActivityContext_=()=>{throw Error('schedule must not be read');};
  assert.equal(c.getCoordinatorTeamDetails_('T1','basic').title,'Project');
  c.weeklyActivityContext_=()=>({schedule,clock:clock('2026-09-22'),state:'active'});
  c.getTeamWeeklyActivity_=()=>({t1:{logs:3,commits:7}});
  reads.length=0;
  assert.equal(c.getCoordinatorTeamDetails_('T1','activity').weekCommits,7);
  assert(!reads.includes('TeamRoster'));
  c.getTeamWeeklyActivity_=()=>{throw Error('progress must not read commits');};
  c.getTeamReviewCompletionStatus_=()=>({review1:{available:true,completed:true},review2:{available:false,completed:false}});
  let logReads=0;c.readLogEntries_=()=>{logReads++;return [];};
  reads.length=0;
  const progress=c.getCoordinatorTeamDetails_('T1','progress');
  assert.equal(progress.reviews[1].available,false);
  assert.equal(logReads,1);assert(!reads.includes('TeamRoster'));
  assert.throws(()=>c.getCoordinatorTeamDetails_('missing','activity'),/not found/);
});

test('Coordinator phase timings preserve data and report swallowed review failures',()=>{
  const {c}=fixture();
  c.getColumnMap_=(name,fields)=>Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]));
  c.getSheetRows_=()=>[];
  c.readActivityRows_=()=>[];
  c.getRepoUrlMap_=()=>({});
  c.getAllReviewCompletionStatus_=()=>({});
  const expected=c.getCoordinatorDashboardData_(false);
  const timings=[];
  const actual=c.getCoordinatorDashboardData_(false,timings);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  for(const phase of ['status_rows','roster_rows','historical_logs','review_completion','aggregation_and_other']) {
    assert(timings.some(item=>item.phase===phase && item.durationMs>=0),phase);
  }
  c.getAllReviewCompletionStatus_=()=>{throw Error('unavailable');};
  const failed=[];
  c.getCoordinatorDashboardData_(false,failed);
  assert(failed.some(item=>item.phase==='review_completion'&&!item.success));
});

test('dashboard headers, rows and repository map share one TeamStatus read',()=>{
  const {c}=fixture();
  const names=vm.runInContext('SHEET_NAMES',c);
  let reads=0;
  c.getSheet_=name=>({getName:()=>name,getDataRange:()=>({getValues:()=>{
    assert.equal(name,names.TEAM_STATUS,'repository lookups must not read a second registry');
    if(name===names.TEAM_STATUS) { reads++;return [['Team ID','Repo URL'],['T1','https://example.com/repo']]; }
    return [[]];
  }}),getRange:()=>{throw Error('Unexpected extra range read');}});
  c.withDashboardRead_(()=>{
    assert.equal(c.getColumnMap_(names.TEAM_STATUS,{TEAM_ID:'Team ID'}).TEAM_ID,0);
    assert.equal(c.getSheetRows_(names.TEAM_STATUS).length,1);
    const timings=[];
    assert.equal(c.getRepoUrlMap_(timings).t1,'https://example.com/repo');
    assert(timings.some(t=>t.phase==='repository_detail_total'&&t.success&&t.calls===1));
    assert(!timings.some(t=>t.phase.includes('fallback')));
    assert.equal(reads,1);
  });
  c.withDashboardRead_(()=>c.getSheetRows_(names.TEAM_STATUS));
  assert.equal(reads,2,'new request reads fresh rows');
});

test('System Status is coordinator-only and its endpoint avoids marks and dashboard aggregation',()=>{
 const {c}=fixture();
 const view=key=>({key,label:key,contentId:key+'Content'});
 const {parseHTML}=require('linkedom');
 assert(!parseHTML(c.buildDashboardShell_('user',[view('guide')])).document.querySelector('button[data-role-tab="system-status"]'));
 assert(parseHTML(c.buildDashboardShell_('user',[view('coord')])).document.querySelector('button[data-role-tab="system-status"]'));
 c.console={log(){},error(){}};
 c.Session={getActiveUser:()=>({getEmail:()=> 'coordinator'})};
 c.activityIsCoordinator_=()=>false;
 c.getColumnMap_=()=>{throw Error('must authorize first');};
 assert.deepEqual(JSON.parse(c.API_coordinator_getSystemStatus()).error,{code:'UNAUTHORIZED',message:'Coordinator access is required.'});
 c.activityIsCoordinator_=()=>true;
 c.getConfig_=(key)=>key==='COLLABORATOR_REPOS_ACCESS'?'2':key==='COLLABORATOR_GITHUB_USERNAME'?'coord-gh':'';
 c.getColumnMap_=()=>({TEAM_ID:0,COMMITTEE_NUMBER:1});c.getSheetRows_=()=>[['T1'],['T2']];c.getRepoUrlMap_=()=>({t1:'https://github.com/org/t1'});
 c.getCoordinatorDashboardData_=()=>{throw Error('must not aggregate progress');};
 c.getAllReviewCompletionStatus_=()=>{throw Error('must not read marks');};
 const dto=JSON.parse(c.API_coordinator_getSystemStatus()).data;
 assert.deepEqual(dto.github,{coordUsername:'coord-gh',reposWithAccess:2,totalRepos:1});
 assert(Array.isArray(dto.publishing.items));
 // The cards themselves come from the view; each keeps the hooks its dashboard module attaches to.
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','system-status-view.js'),'utf8'),c);
 const target=parseHTML('<div id="t"></div>').document.getElementById('t');
 c.systemStatusViewBrowser_(null,()=>({renderIcon:()=>'',renderSkeleton:()=>''}),()=>null).render(target,JSON.parse(JSON.stringify(dto)));
 for(const id of ['githubReposAccess','reviewConfigurationCard','initializeAssessmentStorageButton','committeeConfigurationCard','studentInvitationResend','githubSyncButton','weeklyPhase2Setup']) assert(target.querySelector('#'+id),id);
 assert.equal(target.querySelector('#githubReposAccess').textContent,'2 / 1');
});

test('timeline composes lifecycle events and configured assessments without overrides',()=>{
 const {c,schedule}=fixture();
 const timeline=c.getSharedProjectTimelineData_().milestones;
 assert.equal(timeline.filter(d=>d.key==='review1').length,1);
 assert(!schedule.milestones.some(d=>d.key==='review1'));
 const review=timeline.find(d=>d.key==='review1');
 assert.equal(review.opens,schedule.assessments[0].opens);
 assert.equal(review.sequence,1);
 assert.equal(review.openingDate,c.formatProjectDay_(review.opens));
 assert.throws(()=>c.composeProjectTimeline_([...schedule.milestones,{key:'review1'}],schedule.assessments),/distinct/);
});


test('SEE appears on the shared timeline without extending logging or internal review discovery',()=>{
 const {c,schedule}=fixture();
 const end=schedule.end;
 const see={key:'see',type:'SEE',label:'End Review (SEE)',sequence:4,weight:40,opens:end+7,day:end+7};
 c.getAssessmentDefinitions_=()=>[...schedule.assessments,see];
 vm.runInContext('projectScheduleExecution_=null;',c);
 const updated=c.getProjectSchedule_();
 assert.equal(updated.end,end);assert.equal(updated.reviews.length,schedule.reviews.length);
 const timeline=c.getSharedProjectTimelineData_().milestones;
 assert.equal(timeline.filter(d=>d.key==='see').length,1);assert.equal(timeline.find(d=>d.key==='see').day,end+7);
});
