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
  const milestoneRows=runtime.milestoneRows || [['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'],...Object.keys(labels).map(key=>[key,labels[key],settings[key],'Not Applicable','']),...Array.from({length:settings.reviewCount},(_,i)=>['review'+(i+1),'Review '+(i+1),settings['review'+(i+1)],'Review Committee',10])];
  const milestones={getDataRange:()=>({getValues:()=>{reads++;return milestoneRows;}})};
  let reads = 0;
  const sheet = {getLastRow:()=>entries.length+1, getLastColumn:()=>2, getRange:(row,col,count,width)=>({
    getValues:()=>{ reads++; return entries.slice(row-2,row-2+count).map(r=>r.slice(col-1,col-1+width)); },
    setValue:value=>{entries[row-2][col-1]=value;}
  })};
  const properties = runtime.properties || new Map([['SHEET_ID','test-id'],['GITHUB_TOKEN','test-token']]);
  const c = createSheetReadContext({Date, console,
    CacheService:runtime.cache ? {getScriptCache:()=>runtime.cache} : undefined,
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>name==='Milestones'?milestones:sheet,getSpreadsheetTimeZone:()=> 'Asia/Kolkata'}),flush:()=>{}},
    Utilities:{getUuid:()=>require('node:crypto').randomUUID(),formatDate:(date,tz,pattern)=> {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
      if(pattern==='yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
      return new Intl.DateTimeFormat('en-GB',{timeZone:tz,day:'2-digit',month:'short',year:'numeric'}).format(date);
    }}
  });
  for(const file of ['lucide-icons.js','icon-renderer.js','common-constants.js','common-styles.js','common-helpers.js','milestone-config.js','rubric-config.js','weekly-activity.js','deadline-events.js','coordinator-dashboard.js','student-dashboard.js','guide-dashboard.js','reviewer-dashboard.js','reviewer-evaluation.js','reviewer-evaluation-client.js','review1-evaluation-client.js','logbook-tracker.js','dashboard-client-scripts.js','guide-evaluation-client.js','guide-evaluation.js','dashboard-router.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c,{filename:file});
  }
  const schedule = c.getProjectSchedule_();
  c.getTeamGithubSetup_=(id, options)=>({ready:!!options.repoUrl,usernamesComplete:!!options.repoUrl,message:'GitHub setup pending',verificationUnavailable:false});
  c.getTeamsGithubSetup_=(rows, columns, repos)=>Object.fromEntries(rows.map(row=>[c.normalizeText_(row[columns.TEAM_ID]),c.getTeamGithubSetup_(row[columns.TEAM_ID],{repoUrl:repos[c.normalizeText_(row[columns.TEAM_ID])]} )]));
  c.githubSubmissionTiming_=(setup, schedule, clock)=>({state:setup && !setup.usernamesComplete && clock.today>schedule.formation?'overdue':'on-time',text:'Submission timing'});
  const clock = day => c.getProjectClock_(schedule,new Date(day+'T12:00:00+05:30'));
  return {c,schedule,clock,entries,milestoneRows,properties,sheet,reads:()=>reads};
}

test('Milestones read once per execution independently of legacy Config values',()=>{
 const f=fixture();assert.equal(f.reads(),1);f.c.getProjectSchedule_();f.c.getInternalReviews_();assert.equal(f.reads(),1);
 f.c.getConfig=()=>{throw Error('Legacy Config must not be read');};assert.equal(f.c.getInternalReviewsCount_(),2);
});

test('guide evaluation button opens five calendar days before assessment in the schedule timezone',()=>{
 const {c,schedule}=fixture();
 c.getColumnMap=()=>({TEAM_ID:0});
 c.buildRepoLine=()=>'';
 const due=c.projectDay_('2026-10-12',schedule.timezone);
 const configured={...schedule,guide_eval:due};
 const render=(instant,plan=configured)=>c.buildTeamCard(['T1'],'NOT_SUBMITTED','',null,
   {schedule:plan,clock:c.getProjectClock_(plan,new Date(instant))});
 const before=render('2026-10-06T18:29:59Z');
 assert.match(before, /disabled title="Available from 07 Oct 2026/);
 assert.doesNotMatch(before, /onclick="GuideEvaluation.open/);
 for(const instant of ['2026-10-06T18:30:00Z','2026-10-12T12:00:00Z','2026-10-20T12:00:00Z']) {
   const html=render(instant);
   assert.match(html, /onclick="GuideEvaluation.open/);
   assert.doesNotMatch(html, /disabled/);
 }
 const missing=render('2026-10-07T12:00:00Z',schedule);
 assert.match(missing, /disabled title="Guide Eval assessment date is not configured/);
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
    f.c.getStudentAllReviewMarks=()=>({});
    const marks=f.c.loadStudentMarksSection();
    if(count>1) assert(marks.includes('Review '+count));
    assert(!marks.includes('Review 1')); // Published Review 1 has a separate authenticated result section.
    assert(!marks.includes('Review '+(count+1)));
    const stats=Object.fromEntries(reviews.map(r=>[r.key,{completed:1,total:2,pending:1}]));
    const html=f.c.buildCoordinatorHeaderStats({total:2,reviews:stats})+f.c.buildTeamCompletionProgress({...stats,setup:{completed:1,total:2},titleApproval:{completed:1,total:2}});
    assert(html.includes('Review '+count));assert(!html.includes('Review '+(count+1)));
    if(count===3) {
      const status={REVIEWER_DECISION:0,S1_EMAIL:1};
      const health=f.c.assessProjectTeam_(['Approved','a@example.com'],status,'repo',[],{review1:{completed:true},review2:{completed:true},review3:{completed:false}},f.schedule,f.clock('2026-12-01'));
      assert(health.issue.includes('Review 3 marks overdue'));
    }
  }
});

test('review count comes only from committee-graded milestone rows',()=>{
 const f=fixture({reviewCount:0});assert.equal(f.c.getInternalReviewsCount_(),0);
 assert.throws(()=>fixture({reviewCount:3}),/review3 Due Date/);
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
  assert(c.isCurrentProjectWeek_(new Date('2026-09-20T18:30:00Z'),s,after));
  assert(!c.isCurrentProjectWeek_(new Date('2026-09-20T18:30:01Z'),s,after));
  assert(!c.isCurrentProjectWeek_('bad',s,after));
  assert(!c.isCurrentProjectWeek_('2026-09-20T18:30:01Z',s,after));
});

test('missing logs use completed weeks, with duplicate logs counted once',()=>{
  const {c,schedule:s,clock}=fixture();
  assert.equal(c.getLogWeekSummary_([],s,clock('2026-09-27')).missing,0);
  assert.equal(c.getLogWeekSummary_([],s,clock('2026-09-28')).missing,1);
  const logs=[['2026-09-21'],['2026-09-21'],['2026-09-28'],['invalid'],['2026-10-20']];
  const result=c.getLogWeekSummary_(logs,s,clock('2026-10-05'));
  assert.equal(result.missing,0); assert.equal(result.currentLogged,false);
});

test('attention waits until the day after each configured deadline',()=>{
  const {c,schedule:s,clock}=fixture();
  const columns={S1_EMAIL:0,REVIEWER_DECISION:1};
  const review={review1:{completed:true},review2:{completed:true}};
  const health=(day,row=['student','Approved'],repo='url',r=review)=>c.assessProjectTeam_(row,columns,repo,[],r,s,clock(day));
  assert.equal(health('2026-09-11',['student',''],'').health,'monitor');
  assert(health('2026-09-12',['student',''],'').issue.includes('GitHub username submissions overdue'));
  assert(!health('2026-09-16',['student','']).issue.includes('Title'));
  assert(health('2026-09-17',['student','']).issue.includes('Title'));
  assert.equal(health('2026-09-27').health,'monitor');
  assert(health('2026-09-28').issue.includes('weekly log(s) overdue'));
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
  const stage={completed:0,total:1};
  const stages=Object.fromEntries(['setup','titleApproval','development1','review1','development2','review2','guideEval','see'].map(k=>[k,stage]));
  const html=c.buildTeamCompletionProgress(stages);
  assert(!html.includes('21 Jul'));
  assert(html.includes('Team Progress'));
  assert(!html.includes('Project Start:'));
  new vm.Script(c.getDashboardClientScript());
});


test('team health requires a log from every rostered student',()=>{
  const {c,schedule:s,clock}=fixture();
  const columns={S1_EMAIL:0,S2_EMAIL:1};
  const row=['ONE@example.com','two@example.com'];
  const logs=[['2026-09-21','one@example.com'],['2026-09-22','one@example.com']];
  const during=c.getTeamLogWeekSummary_(row,columns,logs,s,clock('2026-09-23'));
  assert.equal(during.loggedStudents,1); assert.equal(during.currentLogged,false); assert.equal(during.missing,0);
  const closed=c.getTeamLogWeekSummary_(row,columns,logs,s,clock('2026-09-28'));
  assert.equal(closed.missing,1);
});


test('student cards follow scheduled weeks and approval, not rolling inactivity',()=>{
  const {c,schedule:s,clock}=fixture();

  c.buildTeamIntakeLink=()=> 'https://example.com/title';
  c.buildWeeklyLogLink=()=> 'https://example.com/log';
  function render(day,approved=true,logs=[]) {
    const current=clock(day);
    c.getStudentDashboardData=()=>({repoUrl:'https://example.com/repo',githubReady:true,githubState:'done',titleStatus:approved?'APPROVED':'AWAITING_REVIEWER',title:'Project',rosterSlots:[],schedule:s,clock:current,logWeeks:c.getLogWeekSummary_(logs,s,current)});
    return c.buildStudentContent('student@example.com','T1');
  }
  assert(render('2026-09-20').includes('Week 1 starts on 21 Sept 2026'));
  assert(render('2026-09-21').includes('Weekly progress log · Week 1'));
  assert(render('2026-09-21',false).includes('must be approved'));
  assert(render('2026-09-23',true,[['2026-09-22']]).includes('Your log for this week is recorded'));
  assert(render('2026-11-23').includes('logging period ended'));
});

test('student locks depend on team readiness while preserving repository and recorded work',()=>{
  const {c,schedule,clock}=fixture();
  const data={repoUrl:'https://github.com/org/repo',githubReady:false,githubCanRetry:true,githubState:'waiting',githubText:'Waiting for teammate R2',
    titleStatus:'APPROVED',title:'Existing title',rosterSlots:[],schedule,clock:clock('2026-09-23'),logWeeks:{missing:0,currentLogged:true}};
  c.getStudentDashboardData=()=>data;
  c.buildWeeklyLogLink=()=> 'https://example.com/log';
  let html=c.buildStudentContent('student@example.com','T1');
  assert(html.includes('https://github.com/org/repo'));
  assert(html.includes('Current title:</strong> Existing title'));
  assert(html.includes('Your existing log for this week is recorded.'));
  assert(html.includes('Retry GitHub setup'));
  assert(!html.includes('https://example.com/log'));
  assert(html.includes('1 of 3 milestones complete'));
  data.githubReady=true;data.githubCanRetry=false;data.githubState='done';
  html=c.buildStudentContent('student@example.com','T1');
  assert(html.includes('https://example.com/log'));
  assert(html.includes('2 of 3 milestones complete'));
});

test('coordinator statistics, attention list and tracker share one health result',()=>{
  const {c,clock}=fixture({COLLABORATOR_GITHUB_USERNAME:'coordinator',COLLABORATOR_REPOS_ACCESS:1});
  const definitions=vm.runInContext('FIELD_DEFINITIONS',c);
  const maps=Object.fromEntries(Object.entries(definitions).map(([name,fields])=>[name,Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]))]));
  c.getColumnMap=(name,fields)=> Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]));
  const ts=maps.TEAM_STATUS;
  const row=[];
  for(const [key,value] of Object.entries({TEAM_ID:'T1',TITLE:'Project',REVIEWER_DECISION:'Approved',S1_EMAIL:'one@example.com',S2_EMAIL:'two@example.com'})) row[ts[key]]=value;
  const sheetRows={TeamStatus:[row],TeamRoster:[],ReviewCommittee:[],Commits:[],RawLog:[['2026-09-21','one@example.com','T1'],['2026-09-28','one@example.com','T1']]};
  c.getSheetRows=name=>sheetRows[name]||[];
  c.readActivityRows_=name=>sheetRows[name]||[];
  c.getRepoUrlMap=()=>({t1:'https://example.com/repo'});
  c.getAllReviewCompletionStatus_=()=>({t1:{review1:{completed:false},review2:{completed:false}}});
  const now=clock('2026-09-28');
  c.getProjectClock_=()=>now;
  const data=c.getCoordinatorDashboardData_();
  assert.equal(data.stats.activeThisWeek,null);
  assert.equal(data.stats.needsAttention,1);
  assert.equal(data.needsAttentionTeams.length,1);
  assert.equal(data.teamTrackerData[0].health,'attention');
  assert.equal(data.teamTrackerData[0].weeklyActivity,null);
  assert.equal(data.needsAttentionTeams[0].daysOverdue,1);
  assert(data.needsAttentionTeams[0].issue.includes('1 student weekly log(s) overdue'));
  const originalGithub=c.getTeamGithubSetup_;
  c.getTeamGithubSetup_=()=>{throw Error('Coordinator must not inspect GitHub details');};
  c.getTeamsGithubSetup_=()=>{throw Error('Coordinator must not batch GitHub checks');};
  const incomplete=c.getCoordinatorDashboardData_();
  assert.equal(incomplete.stats.reposReady,1,'repository availability is counted separately');
  assert.equal(incomplete.stages.setup.completed,1);
  assert.equal(incomplete.teamTrackerData[0].repoStatus,'ready');
  assert.equal(incomplete.teamTrackerData[0].githubTiming,'');
  assert(!incomplete.needsAttentionTeams[0].issue.includes('GitHub username'));
  const originalRepoMap=c.getRepoUrlMap;
  c.getRepoUrlMap=()=>({});
  const missingRepo=c.getCoordinatorDashboardData_();
  assert.equal(missingRepo.stages.setup.completed,0);
  assert.equal(missingRepo.teamTrackerData[0].repoStatus,'pending');
  assert(missingRepo.needsAttentionTeams[0].issue.includes('Repository URL missing'));
  c.getRepoUrlMap=originalRepoMap;
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
  const html=c.buildCoordinatorContent(degraded);
  assert(!html.includes('reviewConfigurationCard'));assert(html.includes('trackerBody'));
  assert(!html.includes('id="createReviewerSheetsButton"'));
  c.getInternalReviews_=()=>{throw Error('Invalid review count');};
  assert(c.buildCoordinatorContent(c.getCoordinatorDashboardData_()).includes('trackerBody'));
});


function sharedCache() {
  const values=new Map();
  return {values,get:key=>values.get(key)||null,put:(key,value)=>values.set(key,value)};
}

test('coordinator endpoints authorize every request before reading protected data',()=>{
  const {c}=fixture();
  let email='', allowed=true, reads=0;
  const logs=[];
  c.console={log:value=>logs.push(JSON.parse(value))};
  c.Session={getActiveUser:()=>({getEmail:()=>email})};
  c.activityIsCoordinator_=()=>allowed;
  c.getCoordinatorDashboardData_=()=>{reads++;return {};};
  c.getCoordinatorTeamDetails_=()=>{reads++;return {};};
  c.buildCoordinatorContent=()=> 'rendered';
  c.buildCoordinatorAsyncShell_=()=>{reads++;return 'shell';};
  const endpoints=[()=>c.getCoordinatorDashboardData(),()=>c.getCoordinatorTeamDetails('T1'),()=>c.refreshCoordinatorContent()];
  for (const section of ['basic','progress','activity']) assert.throws(()=>c.loadCoordinatorDrawerSection('T1',section),/Coordinator access/);
  assert.throws(()=>c.loadCoordinatorSection('overview'),/Coordinator access/);
  assert.throws(()=>c.loadCoordinatorSection('progress'),/Coordinator access/);
  assert.throws(()=>c.loadCoordinatorSystemStatus(),/Coordinator access/);
  for(const endpoint of endpoints) assert.throws(endpoint,/Coordinator access/);
  assert.equal(reads,0);
  email='coord@example.com';
  endpoints.forEach(endpoint=>endpoint());
  assert.equal(reads,3);
  allowed=false;
  for(const endpoint of endpoints) assert.throws(endpoint,/Coordinator access/);
  assert.equal(reads,3);
  assert(logs.every(log=>Number.isFinite(log.durationMs)));
  assert.equal(logs.filter(log=>log.success).length,3);
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

test('drawer sections load independently, retry alone and ignore stale callbacks',()=>{
  const {c}=fixture();const requests=[];
  const element=()=>{const classes=new Set();return {innerHTML:'',children:[],setAttribute(){},querySelector(){return null;},appendChild(child){this.children.push(child);},addEventListener(event,fn){this[event]=fn;},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}};};
  const elements=Object.fromEntries(['teamDrawer','teamDrawerBackdrop','teamDrawerContent','teamDrawerTitle','drawerSection-basic','drawerSection-progress','drawerSection-activity'].map(id=>[id,element()]));
  const document={readyState:'loading',addEventListener(){},getElementById:id=>elements[id],createElement:element,body:element()};
  const script={get run(){const handlers={};const chain={withSuccessHandler(fn){handlers.success=fn;return chain;},withFailureHandler(fn){handlers.failure=fn;return chain;},loadCoordinatorDrawerSection(teamId,section){requests.push({...handlers,teamId,section});}};return chain;}};
  const browser=createSheetReadContext({window:{},performance:{now:()=>Date.now()},setTimeout,clearTimeout,document,google:{script},console});
  vm.runInContext(c.getDashboardClientScript(),browser);
  vm.runInContext("focusCoordinatorTeam('A'); focusCoordinatorTeam('B');",browser);
  assert.deepEqual(requests.map(r=>r.section),['basic','progress','activity','basic','progress','activity']);
  requests[3].success({title:'Team B project',students:[],reviewers:[]});
  assert(elements['drawerSection-basic'].innerHTML.includes('Team B project'));
  assert(!elements['drawerSection-basic'].innerHTML.includes('Overall Health'));
  requests[5].success({weekLogs:4,weekCommits:2});
  assert(elements['drawerSection-activity'].innerHTML.includes('This Week'));
  assert(!elements['drawerSection-activity'].innerHTML.includes('Project</div>'));
  requests[4].failure({message:'marks unavailable'});
  elements['drawerSection-progress'].children[0].children[0].click();
  assert.equal(requests.length,7);assert.equal(requests[6].section,'progress');
  requests[6].success({reviews:[],health:'ontrack'});
  assert(elements['drawerSection-progress'].innerHTML.includes('Overall Health'));
  const expected=elements['drawerSection-basic'].innerHTML;
  requests[0].success(null);requests[0].failure({message:'A response'});
  assert.equal(elements['drawerSection-basic'].innerHTML,expected);
  vm.runInContext('closeCoordinatorTeamDrawer()',browser);
  requests[3].success(null);
  assert.equal(elements['drawerSection-basic'].innerHTML,expected);
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
  c.getSheet=()=>({getDataRange:()=>({getValues:()=>{reads++;return [['header'],['value']];}})});
  c.withDashboardRead_(()=>{
    const first=c.getSheetRows('TeamStatus');
    assert.equal(c.getSheetRows('TeamStatus'),first);
    c.withDashboardRead_(()=>assert.equal(c.getSheetRows('TeamStatus'),first));
  });
  assert.equal(reads,1);
  c.getSheetRows('TeamStatus'); c.getSheetRows('TeamStatus');
  assert.equal(reads,3);
  assert.throws(()=>c.withDashboardRead_(()=>{c.getSheetRows('TeamStatus');throw Error('test failure')}));
  c.getSheetRows('TeamStatus'); assert.equal(reads,5);
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

test('role request shares authorization rows with rendering but rechecks the next request',()=>{
  const {c}=fixture(); let reads=0, rendered=0;
  let guideEmail='guide@example.com';
  c.Session={getActiveUser:()=>({getEmail:()=> 'guide@example.com'})};
  c.getColumnMap=()=>({TEAM_ID:0,GUIDE_EMAIL:1});
  c.getSheet=()=>({getDataRange:()=>({getValues:()=>{reads++;return [['team','guide'],['T1',guideEmail]];}})});
  c.getGuideDashboardData=()=>({rows:c.getSheetRows('TeamStatus')});
  c.buildDashboardContent=()=>{rendered++;return 'authorized content';};
  assert.equal(c.loadDashboardRoleContent('guide'),'authorized content');
  assert.equal(reads,1); assert.equal(rendered,1);
  guideEmail='replacement@example.com';
  assert.throws(()=>c.loadDashboardRoleContent('guide'),/do not have Guide access/);
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
      if(selector==='[data-role-panel].active')return {getAttribute:()=> 'guide'};
      if(selector.includes('data-role-content="guide"'))return guide;
      if(selector.includes('data-role-content="reviewer"'))return reviewer;
      return null;
    }};
  const script={get run(){
    const handlers={};
    const chain={withSuccessHandler(fn){handlers.success=fn;return chain;},withFailureHandler(fn){handlers.failure=fn;return chain;},
      loadSharedProjectTimeline(){requests.push({type:'timeline',...handlers});},
      loadDashboardRoleContent(role){requests.push({type:'role',role,...handlers});}};
    return chain;
  }};
  const browser=createSheetReadContext({window:{matchMedia:()=>({matches:false})},ResizeObserver:class {constructor(callback){this.callback=callback;} observe(){} disconnect(){}},performance:{now:()=>Date.now()},setTimeout,clearTimeout,document,google:{script},console});
  vm.runInContext(c.getDashboardClientScript(),browser);
  return {c,browser,requests,timeline,guide,reviewer,initialize:()=>initialize()};
}

test('timeline is single-flight and never blocks either role dashboard',async()=>{
  const f=timelineBrowser(); f.initialize();
  assert.deepEqual(f.requests.map(r=>r.type),['role','timeline']);
  const ready=vm.runInContext('DashboardSchedule.ready()',f.browser);
  assert.equal(f.requests.length,2);
  f.requests[0].success('Guide loaded while timeline pending');
  assert(f.guide.innerHTML.includes('Guide loaded'));
  vm.runInContext("showRoleTab('reviewer')",f.browser);
  assert.equal(f.requests[2].role,'reviewer');
  f.requests[2].success('Reviewer loaded');
  f.requests[1].success(JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_())));
  const result=await ready;
  assert(Object.isFrozen(result)); assert(Object.isFrozen(result.schedule)); assert(Object.isFrozen(result.milestones[0]));
  assert.equal(await vm.runInContext('DashboardSchedule.ready()',f.browser),result);
  assert.equal(f.requests.filter(r=>r.type==='timeline').length,1);
  assert(f.timeline.innerHTML.includes('timeline-track'));
  assert(!f.guide.innerHTML.includes('timeline-track'));
  assert.equal(f.timeline.attributes['aria-busy'],'false');
});

test('timeline moves the highlight past Today and Tomorrow and handles the final milestone',()=>{
  for (const offsets of [[-2,0,1,5,9],[-2,1,5],[-2,0],[-2,5,9],[-3,-2]]) {
    const f=timelineBrowser(); f.initialize();
    const data=JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_()));
    data.active=true;
    data.milestones=offsets.map((offset,index)=>({key:'m'+index,label:'Milestone '+index,day:data.today+offset,date:'Date '+index}));
    f.requests[1].success(data);
    const items=[...f.timeline.innerHTML.matchAll(/<li class="([^"]+)"[^>]*>(.*?)<\/li>/g)];
    const imminent=offsets.some(offset=>offset===0||offset===1);
    const highlighted=offsets.findIndex(offset=>offset>(imminent?1:-1));
    items.forEach((item,index)=>{
      const offset=offsets[index];
      assert.equal(item[1].includes('timeline-current'),index===highlighted);
      assert.equal(item[1].includes('timeline-upcoming'),imminent&&index===highlighted);
      assert.equal(item[1].includes('timeline-imminent'),offset===0||offset===1);
      assert.equal(item[2].includes('timeline-node-core'),index===highlighted);
      const label=offset===0?'Today':offset===1?'Tomorrow':index===highlighted?'Up Next':null;
      if(label) assert(item[2].includes('class="timeline-state">'+label+'</span>'));
      else assert(!item[2].includes('timeline-state'));
    });
  }
});

test('timeline centers the nearest event once and shows larger short dates with full-date context',()=>{
  const f=timelineBrowser(); f.initialize();
  const scroll=f.timeline.querySelector('.timeline-scroll');
  scroll.querySelector('[aria-current="step"]').getBoundingClientRect=()=>({left:600,width:132});
  const data=JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_()));
  data.active=true;
  data.milestones=[{key:'next',label:'Next event',day:data.today+1,date:'30 Sep 2026'}];
  f.requests[1].success(data);
  assert.equal(scroll.scrollLeft,466);
  assert(f.timeline.innerHTML.includes('title="30 Sep 2026" aria-label="30 Sep 2026">30 Sep</span>'));
  scroll.scrollLeft=100;
  f.timeline.timelineResizeObserver.callback();
  assert.equal(scroll.scrollLeft,100,'resizing must not reset manual scrolling');
  assert(!scroll.focused,'initial positioning must not steal keyboard focus');
});

test('timeline supports captured dragging, clamps at edges, and leaves touch swiping native',()=>{
  const f=timelineBrowser(); f.initialize();
  f.requests[1].success(JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_())));
  const scroll=f.timeline.querySelector('.timeline-scroll');
  let prevented=0;
  const pointer={pointerId:1,pointerType:'mouse',button:0,clientX:200,preventDefault(){prevented++;}};
  scroll.scrollLeft=100;
  scroll.listeners.pointerdown(pointer);
  assert.equal(scroll.capturedPointer,1);
  scroll.listeners.pointermove({...pointer,clientX:80});
  assert.equal(scroll.scrollLeft,220);
  scroll.listeners.pointermove({...pointer,clientX:-900});
  assert.equal(scroll.scrollLeft,600);
  assert.equal(f.timeline.querySelector('.timeline-forward').disabled,true);
  scroll.listeners.pointercancel(pointer);
  assert.equal(scroll.capturedPointer,null);
  assert.equal(scroll.attributes['data-dragging'],'false');
  scroll.listeners.pointermove({...pointer,clientX:500});
  assert.equal(scroll.scrollLeft,600);
  const before=prevented;
  scroll.listeners.pointerdown({...pointer,pointerType:'touch'});
  scroll.listeners.pointermove({...pointer,pointerType:'touch',clientX:10});
  assert.equal(prevented,before,'touch must retain native gesture handling');
  assert.equal(scroll.capturedPointer,null);
  scroll.listeners.pointerdown(pointer);
  scroll.listeners.pointermove({...pointer,clientX:2000});
  assert.equal(scroll.scrollLeft,0);
  scroll.listeners.pointerup(pointer);
  assert.equal(scroll.attributes['data-dragging'],'false');
});

test('timeline arrows track overflow, scroll position and reduced motion',()=>{
  const f=timelineBrowser(); f.initialize();
  f.requests[1].success(JSON.parse(JSON.stringify(f.c.getSharedProjectTimelineData_())));
  const scroll=f.timeline.querySelector('.timeline-scroll');
  const navigation=f.timeline.querySelector('.timeline-navigation');
  const previous=f.timeline.querySelector('.timeline-prev');
  const forward=f.timeline.querySelector('.timeline-forward');
  assert.equal(navigation.hidden,false);
  assert.equal(previous.disabled,true);
  assert.equal(forward.disabled,false);
  forward.listeners.click();
  assert.equal(scroll.lastScroll.left,300);
  assert.equal(scroll.lastScroll.behavior,'smooth');
  scroll.scrollLeft=600;
  scroll.listeners.scroll();
  assert.equal(previous.disabled,false);
  assert.equal(forward.disabled,true);
  f.browser.window.matchMedia=()=>({matches:true});
  previous.listeners.click();
  assert.equal(scroll.lastScroll.left,-300);
  assert.equal(scroll.lastScroll.behavior,'auto');
  scroll.scrollLeft=0;
  scroll.scrollWidth=400;
  f.timeline.timelineResizeObserver.callback();
  assert.equal(navigation.hidden,true);
  scroll.scrollWidth=1000;
  f.timeline.timelineResizeObserver.callback();
  assert.equal(navigation.hidden,false);
  assert.equal(f.requests.filter(r=>r.type==='timeline').length,1);
});

test('timeline errors are isolated and a subsequent retry succeeds',async()=>{
  const f=timelineBrowser(); f.initialize();
  const pending=vm.runInContext('DashboardSchedule.ready()',f.browser);
  const rejected=assert.rejects(pending,/offline/);
  f.requests[1].failure(new Error('offline'));
  await rejected;
  assert(f.timeline.innerHTML.includes('Schedule unavailable'));
  f.requests[0].success('Guide still works');
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
  assert.throws(()=>c.loadSharedProjectTimeline(),/Dashboard access/);
  c.getDashboardRoleViews_=()=>[{key:'guide'}];
  assert.equal(c.loadSharedProjectTimeline().milestones.length,7);
});

test('normalization handles whitespace, case, numeric IDs and literal search metacharacters',()=>{
  const {c}=fixture();
  assert(c.textEquals_(' T1\t','t1')); assert(c.textEquals_(1,' 1 '));
  assert(c.emailsMatch(' User@Example.com ','user@example.com'));
  for(const value of ['a+b@example.com','team[1]','x.y','a\\b','a(b)','x$^']) {
    const pattern=new RegExp(c.normalizedTextPattern_(value),'i');
    assert(pattern.test('  '+value.toUpperCase()+' '));
    assert(!pattern.test('prefix'+value));
  }
  const grouped=c.groupBy([{id:' T1 '},{id:'t1'}],r=>r.id);
  assert.equal(grouped.t1.length,2);
  const sheet={getLastRow:()=>3,getLastColumn:()=>1,getRange:()=>({getValues:()=>[[' T1 '],[2]]})};
  assert.equal(c.findTeamStatusRow(sheet,'t1',{TEAM_ID:0}),2);
  assert.equal(c.findTeamStatusRow(sheet,' 2 ',{TEAM_ID:0}),3);
});

test('Config keys ignore case and spaces while values remain unchanged',()=>{
  const f=fixture({' Custom_Id ':'AbC_DeF'});
  assert.equal(f.c.getConfig(' CUSTOM_ID '),'AbC_DeF');
  f.c.setConfig(' custom_ID ','MiXeD');
  assert.equal(f.c.getConfig('CUSTOM_id'),'MiXeD');
  assert.throws(()=>fixture({' CUSTOM_ID ':'one',custom_id:'two'}).c.getConfig('custom_id'),/Duplicate Config key/);
});

test('approval status and committee access tolerate case and surrounding spaces',()=>{
  const {c}=fixture();
  c.getColumnMap=()=>({TEAM_ID:0,TITLE:0,GUIDE_DECISION:1,REVIEWER_DECISION:2,COMMITTEE_NUMBER:3});
  assert.equal(c.getTeamStatus(['Title',' approved ',' APPROVED ']),'APPROVED');
  assert.equal(c.getTeamStatus(['Title','',' revise ']),'REVISE_AWAITING_STUDENT');
  c.getSheetRows=()=>[['Title',' APPROVED ',' pending ',' C1 ']];
  c.getCommitteeNumbersForReviewer=()=>['c1'];
  c.getCommitteeInfo=()=>({marksSheetId:'CaseSensitiveID'});
  const data=c.getReviewerDashboardData('Reviewer@example.com');
  assert.equal(data.pending.length,1);assert.equal(data.assigned.length,1);assert.equal(data.assigned[0][3],' C1 ');
});

test('sheet-label fallback ignores case and spacing without changing the sheet',()=>{
  const {c}=fixture();
  const sheet={getName:()=> ' Committee A - Review 1 '};
  assert.equal(c.getNamedSheet_({getSheetByName:()=>null,getSheets:()=>[sheet]},'committee a - review 1'),sheet);
});

test('roster synchronization does not duplicate mixed-case or numeric IDs or flag false orphans',()=>{
  const {c}=fixture();
  c.getCoordinatorEmail=()=> 'coordinator@example.com';c.getAcademicYear=()=> '2026';c.getConfig=key=>key==='reviewCount'?2:'caseSensitiveID';
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','intake-approval-workflow.js'),'utf8'),c);
  const messages=[];let appended=0,updated=0;
  c.Logger={log:message=>messages.push(message)};
  c.getColumnMap=()=>({TEAM_ID:0});
  c.getSheetRows=name=>name==='TeamRoster'?[[' t1 '],[2]]:[['T1'],['2']];
  c.getSheet=()=>({getLastColumn:()=>1,getRange:()=>({getValues:()=>[['T1']],setValues:()=>{updated++;}}),appendRow:()=>{appended++;}});
  c.syncTeamStatusFromRoster();
  assert.equal(appended,0);assert.equal(updated,2);
  assert(messages.includes('Orphaned: (none)'));
});

test('coordinator role returns a shell without building dashboard data',()=>{
  const {c}=fixture();
  c.Session={getActiveUser:()=>({getEmail:()=> 'coord@example.com'})};
  c.getCoordinatorEmail=()=> 'coord@example.com';
  c.getConfig=()=> '';
  c.getCoordinatorDashboardData=()=>{throw Error('No data on shell path');};
  c.getCoordinatorDashboardData_=()=>{throw Error('No data on shell path');};
  const html=c.loadDashboardRoleContent('coord');
  for(const id of ['coordinatorStats','coordinatorTracker','teamDrawer']) assert(html.includes('id="'+id+'"'));
});

function coordinatorAsyncBrowser(fonts) {
  const {c}=fixture();const requests=[];
  const element=()=>({innerHTML:'',textContent:'',attributes:{'aria-busy':'true'},children:[],getAttribute(key){return this.attributes[key];},setAttribute(key,value){this.attributes[key]=value;},appendChild(child){this.children.push(child);},addEventListener(event,fn){this[event]=fn;}});
  const ids=['coordinatorAsyncRoot','coordinatorOverviewStatus','coordinatorProgressStatus','coordinatorStats','coordinatorTracker','coordinatorCompletion','coordinatorGithub','coordinatorCommittees'];
  const elements=Object.fromEntries(ids.map(id=>[id,element()]));
  const document={fonts,readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[],createElement:element};
  const script={get run(){const handlers={};const chain={withSuccessHandler(fn){handlers.success=fn;return chain;},withFailureHandler(fn){handlers.failure=fn;return chain;},loadCoordinatorSection(section){requests.push({...handlers,section});},loadAllTeamsWeeklyActivity(){requests.push({...handlers,section:'activity'});}};return chain;}};
  const browser=createSheetReadContext({window:{},performance:{now:()=>Date.now()},setTimeout,clearTimeout,document,google:{script},console:{log(){}}});
  vm.runInContext(c.getDashboardClientScript(),browser);
  vm.runInContext('DashboardUI.initializeCoordinatorAsync()',browser);
  return {browser,requests,elements,element};
}

test('coordinator sections start independently and late overview cannot overwrite progress',()=>{
  const f=coordinatorAsyncBrowser();
  assert.deepEqual(f.requests.map(r=>r.section),['overview','progress','activity']);
  vm.runInContext("DashboardUI.loadCoordinatorSectionAsync('progress')",f.browser);
  assert.equal(f.requests.length,3);
  f.requests[1].success({panels:{coordinatorStats:'complete stats',coordinatorTracker:'complete tracker',coordinatorCompletion:'assessment'},partial:false});
  f.requests[0].success({panels:{coordinatorStats:'loading stats',coordinatorTracker:'loading tracker',coordinatorGithub:'github'},partial:false});
  assert.equal(f.elements.coordinatorStats.innerHTML,'complete stats');
  assert.equal(f.elements.coordinatorTracker.innerHTML,'complete tracker');
  assert.equal(f.elements.coordinatorGithub.innerHTML,'github');
  assert.equal(f.requests.filter(r=>r.section==='activity').length,1);
});

test('coordinator section failures can retry without reloading successful sections',()=>{
  const f=coordinatorAsyncBrowser();
  f.requests[0].success({panels:{coordinatorStats:'overview',coordinatorGithub:'github'},partial:false});
  f.requests[1].failure({message:'service unavailable'});
  assert(f.elements.coordinatorProgressStatus.textContent.includes('Unable to load progress'));
  assert.equal(f.elements.coordinatorGithub.innerHTML,'github');
  f.elements.coordinatorProgressStatus.children[0].click();
  assert.deepEqual(f.requests.map(r=>r.section),['overview','progress','activity','progress']);
  f.requests[3].success({panels:{coordinatorCompletion:'recovered'},partial:true});
  assert.equal(f.elements.coordinatorCompletion.innerHTML,'recovered');
  assert(f.elements.coordinatorProgressStatus.textContent.includes('Counts are partial'));
});

test('coordinator callbacks from a replaced shell are ignored',()=>{
  const f=coordinatorAsyncBrowser();
  f.elements.coordinatorAsyncRoot=f.element();
  f.requests[0].success({panels:{coordinatorStats:'stale'}});
  f.requests[1].failure({message:'stale error'});
  assert.equal(f.elements.coordinatorStats.innerHTML,'');
  assert(!f.elements.coordinatorProgressStatus.textContent.includes('stale error'));
});

test('tracker only attaches its current page and activity updates detached rows',()=>{
  const f=coordinatorAsyncBrowser();
  const rows=Array.from({length:25},(_,i)=>({attributes:{'data-search':'team '+i,'data-team-id':'T'+i},cell:{},getAttribute(key){return this.attributes[key];},querySelector(){return this.cell;}}));
  const body={children:rows.slice(),querySelectorAll:()=>rows,replaceChildren(...children){this.children=children;}};
  f.elements.trackerBody=body;
  f.elements.trackerSearch={value:''};
  vm.runInContext('DashboardUI.initializeCoordinatorTracker()',f.browser);
  assert.equal(body.children.length,10);
  assert.equal(body.children[0],rows[0]);
  f.requests[2].success({state:'active',teams:Object.fromEntries(rows.map((_,i)=>['t'+i,{logs:i,commits:2}])),activeTeams:25,totalTeams:25,checkedAt:'2026-09-22T12:00:00Z'});
  assert.equal(rows[24].cell.textContent,'24/2');
  f.elements.trackerSearch.value='team 24';
  vm.runInContext('filterTrackerSearch()',f.browser);
  assert.equal(body.children.length,1);
  assert.equal(body.children[0],rows[24]);
  f.elements.trackerSearch.value='';
  vm.runInContext('filterTrackerSearch()',f.browser);
  assert.equal(body.children.length,10);
});

test('activity result arriving before overview is reused without another RPC',()=>{
  const f=coordinatorAsyncBrowser();
  f.requests[2].success({state:'active',teams:{},activeTeams:7,totalTeams:10,checkedAt:'2026-09-22T12:00:00Z'});
  f.elements.coordinatorActiveTeams=f.element();
  f.elements.coordinatorActiveTeamsPct=f.element();
  f.requests[0].success({panels:{coordinatorStats:'stats'},partial:false});
  assert.equal(f.elements.coordinatorActiveTeams.textContent,7);
  assert.equal(f.elements.coordinatorActiveTeamsPct.textContent,'(70%)');
  assert.equal(f.requests.length,3);
});

test('non-tracker cards wait for their data and fonts before being revealed',async()=>{
  let resolveFonts;
  const f=coordinatorAsyncBrowser({ready:new Promise(resolve=>{resolveFonts=resolve;})});
  for(const id of ['coordinatorStats','coordinatorGithub','coordinatorCompletion']) f.elements[id].hidden=true;
  f.requests[0].success({panels:{coordinatorStats:'overview',coordinatorGithub:'github',coordinatorTracker:'teams'},partial:false});
  assert.equal(f.elements.coordinatorGithub.hidden,true);
  assert.equal(f.elements.coordinatorTracker.innerHTML,'teams');
  resolveFonts();await Promise.resolve();
  assert.equal(f.elements.coordinatorGithub.hidden,true); // System cards are no longer revealed by dashboard state.
  assert.equal(f.elements.coordinatorStats.hidden,false);
  f.requests[1].success({panels:{coordinatorStats:'complete stats',coordinatorCompletion:'completion'},partial:false});
  assert.equal(f.elements.coordinatorStats.hidden,false);
  f.requests[2].success({state:'active',teams:{},activeTeams:0,totalTeams:0,checkedAt:'2026-09-22T12:00:00Z'});
  assert.equal(f.elements.coordinatorStats.hidden,false);
});

test('drawer basic and activity avoid marks; progress avoids roster and commit reads',()=>{
  const {c,schedule,clock}=fixture();
  const reads=[];
  c.getColumnMap=()=>({TEAM_ID:0,TITLE:1,COMMITTEE_NUMBER:2});
  c.getSheetRows=name=>{reads.push(name);return [['T1','Project','1']];};
  c.getRepoUrlForTeam=()=> 'https://github.com/example/project';
  c.getCommitteeInfo=()=>null;c.getTeamStatus=()=> 'APPROVED';
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
  let logReads=0;c.readActivityRows_=()=>{logReads++;return [];};
  reads.length=0;
  const progress=c.getCoordinatorTeamDetails_('T1','progress');
  assert.equal(progress.reviews[1].available,false);
  assert.equal(logReads,1);assert(!reads.includes('TeamRoster'));
  assert.throws(()=>c.getCoordinatorTeamDetails_('missing','activity'),/not found/);
});

test('Coordinator phase timings preserve data and report swallowed review failures',()=>{
  const {c}=fixture();
  c.getColumnMap=(name,fields)=>Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]));
  c.getSheetRows=()=>[];
  c.readActivityRows_=()=>[];
  c.getRepoUrlMap=()=>({});
  c.getAllReviewCompletionStatus_=()=>({});
  const expected=c.getCoordinatorDashboardData_(false,true);
  const timings=[];
  const actual=c.getCoordinatorDashboardData_(false,true,timings);
  assert.equal(JSON.stringify(actual),JSON.stringify(expected));
  for(const phase of ['status_rows','roster_rows','historical_logs','review_completion','aggregation_and_other']) {
    assert(timings.some(item=>item.phase===phase && item.durationMs>=0),phase);
  }
  c.getAllReviewCompletionStatus_=()=>{throw Error('unavailable');};
  const failed=[];
  c.getCoordinatorDashboardData_(false,true,failed);
  assert(failed.some(item=>item.phase==='review_completion'&&!item.success));
});

test('dashboard headers, rows and repository map share one TeamStatus read',()=>{
  const {c}=fixture();
  const names=vm.runInContext('SHEET_NAMES',c);
  let reads=0;
  c.getSheet=name=>({getName:()=>name,getDataRange:()=>({getValues:()=>{
    assert.equal(name,names.TEAM_STATUS,'repository lookups must not read a second registry');
    if(name===names.TEAM_STATUS) { reads++;return [['Team ID','Repo URL'],['T1','https://example.com/repo']]; }
    return [[]];
  }}),getRange:()=>{throw Error('Unexpected extra range read');}});
  c.withDashboardRead_(()=>{
    assert.equal(c.getColumnMap(names.TEAM_STATUS,{TEAM_ID:'Team ID'}).TEAM_ID,0);
    assert.equal(c.getSheetRows(names.TEAM_STATUS).length,1);
    const timings=[];
    assert.equal(c.getRepoUrlMap(timings).t1,'https://example.com/repo');
    assert(timings.some(t=>t.phase==='repository_detail_total'&&t.success&&t.calls===1));
    assert(!timings.some(t=>t.phase.includes('fallback')));
    assert.equal(reads,1);
  });
  c.withDashboardRead_(()=>c.getSheetRows(names.TEAM_STATUS));
  assert.equal(reads,2,'new request reads fresh rows');
});

test('System Status is coordinator-only and its endpoint avoids marks and dashboard aggregation',()=>{
 const {c}=fixture();
 const view=key=>({key,label:key,contentId:key+'Content'});
 assert(!c.buildDashboardShell('user',[view('guide')]).includes('data-role-tab="system-status"'));
 assert(c.buildDashboardShell('user',[view('coord')]).includes('data-role-tab="system-status"'));
 const shell=c.buildCoordinatorAsyncShell_();
 assert(!shell.includes('coordinatorGithub'));assert(!shell.includes('reviewConfigurationCard'));
 c.Session={getActiveUser:()=>({getEmail:()=> 'coordinator'})};
 c.activityIsCoordinator_=()=>false;
 c.getColumnMap=()=>{throw Error('must authorize first');};
 assert.throws(()=>c.loadCoordinatorSystemStatus(),/Coordinator access/);
 c.activityIsCoordinator_=()=>true;
 c.getConfig=()=>'';
 c.getColumnMap=()=>({TEAM_ID:0,COMMITTEE_NUMBER:1});c.getSheetRows=()=>[];c.getRepoUrlMap=()=>({});
 c.getCoordinatorDashboardData_=()=>{throw Error('must not aggregate progress');};
 c.getAllReviewCompletionStatus_=()=>{throw Error('must not read marks');};
 const html=c.loadCoordinatorSystemStatus();
 assert(html.includes('githubReposAccess'));assert(html.includes('reviewConfigurationCard'));
 assert(html.includes('createReviewerSheetsButton'));
});

test('Coordinator tracking uses small cards without a separate progress panel',()=>{
 const {c}=fixture();
 const html=c.buildCoordinatorHeaderStats({total:62,titleApproved:6,reposReady:50,needsAttention:56,reviews:{review1:{completed:0,unavailable:4},review2:{completed:3}}});
 assert.equal((html.match(/class="stat-card stat-card-/g)||[]).length,8);
 for(const label of ['Total Teams','Title Approved','Repositories Available','Active This Week','Review 1 Completed','Review 2 Completed','Need Attention']) assert(html.includes(label));
 assert(html.includes('4 unavailable'));
 const shell=c.buildCoordinatorAsyncShell_();
 assert(!shell.includes('coordinatorCompletion'));assert(!shell.includes('coordinatorAssessment'));
 assert.equal((shell.match(/coordinator-stat-placeholder/g)||[]).length,8);
});

test('timeline excludes SEE with or without a scheduled date and preserves other milestones',()=>{
 for(const day of [null,21000]) {
  const {c,schedule}=fixture();
  c.getProjectSchedule_=()=>({...schedule,milestones:[...schedule.milestones,{key:'final_exam',label:'SEE',day,gradedBy:'SEE Committee',weight:30}]});
  const result=c.getSharedProjectTimelineData_();
  assert(!result.milestones.some(m=>m.key==='final_exam'));
  assert(result.milestones.some(m=>m.key==='report'));
  assert(result.milestones.some(m=>m.key==='week1'));
  assert(result.schedule.milestones.some(m=>m.key==='final_exam'));
 }
});
