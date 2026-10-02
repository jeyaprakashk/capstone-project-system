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
  for(const file of ['lucide-icons.js','icon-renderer.js','common-constants.js','common-styles.js','common-helpers.js','milestone-config.js','rubric-config.js','weekly-activity.js','deadline-events.js','coordinator-dashboard.js','student-dashboard.js','guide-dashboard.js','reviewer-dashboard.js','reviewer-evaluation.js','review-evaluation-client.js','logbook-tracker.js','dashboard-client-scripts.js','guide-evaluation-client.js','guide-weekly-client.js','review-academic-policy.js','evaluation-lifecycle.js','publication-events.js','assessment-registry.js','guide-evaluation.js','internal-assessment-publishing.js','internal-assessment-publishing-client.js','dashboard-router.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c,{filename:file});
  }
  const definitionRows=[Array.from(vm.runInContext('ASSESSMENT_DEFINITION_HEADERS_',c)),...Array.from({length:settings.reviewCount},(_,i)=>['review'+(i+1),'REVIEW','Review '+(i+1),i+1,10,settings.start,settings['review'+(i+1)],'','review-attendance-v1',''])];
  const getSheet=c.getSheet;
  c.getSheet=name=>name==='AssessmentDefinitions'?{getDataRange:()=>({getValues:()=>definitionRows})}:getSheet(name);
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
 f.c.getConfig=()=>{throw Error('Legacy Config must not be read');};assert.equal(f.c.getInternalReviewsCount_(),2);
});

test('guide evaluation tab uses configured opening in the schedule timezone',()=>{
 const {c,schedule}=fixture();
 c.getColumnMap=()=>({TEAM_ID:0});
 c.buildRepoLine=()=>'';
 const due=c.projectDay_('2026-10-12',schedule.timezone);
 const configured={...schedule,guide_eval:due,assessments:[...schedule.assessments,{key:'guide_eval',type:'GUIDE_EVALUATION',day:due,opens:due-5}]};
 const render=(instant,plan=configured)=>c.buildGuideEvaluationTab_(plan,c.getProjectClock_(plan,new Date(instant)));
 const before=render('2026-10-06T18:29:59Z');
 assert.match(before, /disabled title="Available from 07 Oct 2026/);
 assert.doesNotMatch(before, /onclick="GuideWeekly.selectView/);
 for(const instant of ['2026-10-06T18:30:00Z','2026-10-12T12:00:00Z','2026-10-20T12:00:00Z']) {
   const html=render(instant);
   assert.match(html, /onclick="GuideWeekly.selectView/);
   assert.doesNotMatch(html, /disabled/);
 }
 const missing=render('2026-10-07T12:00:00Z',schedule);
 assert.match(missing, /disabled title="Guide Evaluation is not configured in AssessmentDefinitions/);
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
    const stats=Object.fromEntries(reviews.map(r=>[r.key,{completed:1,total:2,pending:1}]));
    const html=f.c.buildCoordinatorHeaderStats({total:2,reviews:stats})+f.c.buildTeamCompletionProgress({...stats,setup:{completed:1,total:2},titleApproval:{completed:1,total:2}});
    assert(html.includes('Review '+count));assert(!html.includes('Review '+(count+1)));
    if(count===3) {
      const status={REVIEWER_DECISION:0,S1_EMAIL:1,S1_REGNO:2};
      const health=f.c.assessProjectTeam_(['Approved','a@example.com','R1'],status,'repo',[],{review1:{completed:true},review2:{completed:true},review3:{completed:false}},f.schedule,f.clock('2026-12-01'));
      assert(health.issue.includes('Review 3 marks overdue'));
    }
  }
});

test('review count comes only from registry REVIEW instances',()=>{
 const f=fixture({reviewCount:0});assert.equal(f.c.getInternalReviewsCount_(),0);
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
  assert(c.isCurrentProjectWeek_(new Date('2026-09-20T18:30:00Z'),s,after));
  assert(!c.isCurrentProjectWeek_(new Date('2026-09-20T18:30:01Z'),s,after));
  assert(!c.isCurrentProjectWeek_('bad',s,after));
  assert(!c.isCurrentProjectWeek_('2026-09-20T18:30:01Z',s,after));
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
  const columns={S1_EMAIL:0,S2_EMAIL:1,S1_REGNO:2,S2_REGNO:3};
  const row=['ONE@example.com','two@example.com','R1','R2'];row[40]='W1';
  const logs=[{regNo:'R1',weekId:'W1',entryStatus:'SUBMITTED'},{regNo:'R1',weekId:'W1',entryStatus:'REVISED'}];
  const during=c.getTeamLogWeekSummary_(row,columns,logs,s,clock('2026-09-23'));
  assert.equal(during.loggedStudents,1); assert.equal(during.currentLogged,false); assert.equal(during.missing,0);
  const closed=c.getTeamLogWeekSummary_(row,columns,logs,s,clock('2026-10-05'));
  assert.equal(closed.missing,1);
});


test('student card hides weekly component until title approval and keeps the title action',()=>{
  const {c,schedule,clock}=fixture();
  c.buildTeamIntakeLink=()=> 'https://example.com/title';
  c.getStudentDashboardData=()=>({repoUrl:'https://example.com/repo',githubReady:true,githubState:'done',titleStatus:'NOT_SUBMITTED',title:'',rosterSlots:[],schedule,clock:clock('2026-09-23')});
  c.getAssessmentDefinitions_=()=>[];
  const html=c.buildStudentContent('student@example.com','T1');
  assert.doesNotMatch(html,/id="studentWeeklyProgress"|data-weekly-form/);
  assert.match(html,/https:\/\/example.com\/title/);assert.doesNotMatch(html,/forms.gle|buildWeeklyLogLink/);
});

test('student setup gates weekly UI for every title state and keeps incomplete steps expanded',()=>{
 const {parseHTML}=require('linkedom');const {c,schedule,clock}=fixture();
 c.buildTeamIntakeLink=()=> 'https://example.test/title';
 c.getAssessmentDefinitions_=()=>[];
 for(const githubReady of [false,true])for(const titleStatus of ['NOT_SUBMITTED','NEEDS_REVIEW','REVISE_AWAITING_STUDENT','AWAITING_REVIEWER','APPROVED','REJECTED_BY_GUIDE']) {
  c.getStudentDashboardData=()=>({githubReady,githubCaptureReady:true,titleStatus,githubState:githubReady?'done':'active',githubText:'Team member must accept the invitation.',githubNeedsUsername:!githubReady,githubCanRetry:!githubReady,githubSetup:{},schedule,clock:clock('2026-09-23'),rosterSlots:[],title:titleStatus==='NOT_SUBMITTED'?'':'A title',note:'Existing review feedback'});
  const {document}=parseHTML(c.buildStudentContent('me@example.test','T1')),setup=document.querySelector('.student-project-setup');
  const complete=githubReady&&titleStatus==='APPROVED';
  assert.equal(!!document.getElementById('studentWeeklyProgress'),titleStatus==='APPROVED');
  assert.equal(setup.tagName,complete?'DETAILS':'SECTION');assert.equal(setup.hasAttribute('open'),false);
  assert.equal(setup.querySelectorAll('[data-step-row]').length,2);
  if(complete){assert.match(setup.querySelector('summary').textContent,/✓ CompleteViewHide/);setup.setAttribute('open','');assert(setup.hasAttribute('open'));setup.removeAttribute('open');}
  else {assert(setup.querySelector('[data-setup-pending]'));if(!githubReady)assert.match(setup.textContent,/Step 1: Team member must accept/);if(titleStatus!=='APPROVED')assert.match(setup.textContent,/Step 2:/);}
  assert.equal(document.querySelectorAll('#studentGithubProfile').length,1); // No student ID in this fixture, independent of team readiness.
 }
});

test('unregistered student card offers only account connection and hides repository retry',()=>{
  const {parseHTML}=require('linkedom');const {c,schedule,clock}=fixture();
  c.getAssessmentDefinitions_=()=>[];
  const data={githubReady:false,githubCaptureReady:true,githubNeedsUsername:true,githubCanRetry:true,githubAccount:{},
    githubState:'active',githubText:'Waiting for GitHub account connection.',githubSetup:{},
    titleStatus:'NOT_SUBMITTED',title:'',rosterSlots:[],schedule,clock:clock('2026-09-23')};
  c.getStudentDashboardData=()=>data;
  const {document}=parseHTML(c.buildStudentContent('student@example.com','T1'));
  const card=document.querySelector('[data-step-row]');
  assert.match(card.textContent,/Waiting for GitHub account connection/);
  assert.doesNotMatch(card.textContent,/valid username|Retry GitHub setup|could not verify/i);
  assert.match(card.textContent,/Submit GitHub Account/);
  assert.equal(card.querySelector('button[type="submit"]').textContent,'Continue');
  assert.equal(card.querySelectorAll('button.btn-primary').length,1);
  data.githubNeedsUsername=false;data.githubAccount={githubId:'101',username:'student'};
  data.githubText='GitHub could not verify all teammates right now. Please try again shortly.';
  const connected=c.buildStudentContent('student@example.com','T1');
  assert.doesNotMatch(connected,/Retry GitHub setup/);
});

test('GitHub status rows use existing icons without a table; connected students have no secondary actions',()=>{
  const {parseHTML}=require('linkedom');const {c,schedule,clock}=fixture();
  c.getAssessmentDefinitions_=()=>[];
  const mine={email:'student@example.com',githubId:'101',status:'valid',access:'invited'};
  const other={email:'other@example.com',githubId:'102',status:'valid',access:'active'};
  const missing={email:'missing@example.com',githubId:'',status:'missing',access:'unchecked'};
  const data={repoUrl:'https://github.com/org/repo',githubReady:false,githubCaptureReady:true,githubNeedsUsername:false,
    githubCanRetry:true,githubAccount:{githubId:'101',username:'student'},githubSetup:{members:[other,mine,missing,{email:'staff@example.com',githubId:'999'}]},
    githubState:'waiting',githubText:'Team setup pending.',titleStatus:'NOT_SUBMITTED',title:'',
    rosterSlots:[{email:mine.email,regno:'R1'},{email:other.email,regno:'R2'},{email:missing.email,regno:'R3'},{email:'',regno:''}],schedule,clock:clock('2026-09-23')};
  c.getStudentDashboardData=()=>data;
  const card=()=>parseHTML(c.buildStudentContent('student@example.com','T1')).document.querySelector('[data-step-row]');
  let rendered=card();
  assert.equal(rendered.querySelector('table'),null);
  assert.deepEqual([...rendered.querySelectorAll('[data-member-status]')].map(row=>[row.querySelector('[data-member-register]').textContent,row.querySelector('[data-member-state]').textContent]),[
    ['R1','Accept Invitation Email'],['R2','Repository joined'],['R3','Submit GitHub Account']]);
  assert(rendered.querySelector('[data-member-status] .lucide-clock'));
  assert(rendered.querySelector('[data-member-status="joined"] .lucide-check'));
  assert(rendered.querySelector('[data-member-status="missing"] .lucide-triangle-alert'));
  assert.doesNotMatch(rendered.textContent,/Action required:|No action required:/);
  assert.equal((rendered.textContent.match(/GitHub setup due/g)||[]).length,1);
  const noActions=card=>{
    assert.equal(card.querySelectorAll('form,button,input,[data-github-confirmation],#githubSubmitStatus').length,0);
    assert.equal(card.querySelectorAll('a').length,1);
    assert.deepEqual([...card.querySelector('[data-step-card]').children].map(node=>node.hasAttribute('data-step-header')?'step-header':node.hasAttribute('data-step-body')?'step-body':node.tagName),['step-header','step-body']);
    assert.doesNotMatch(card.innerHTML,/retryGithubSetup|\/invitations|Your GitHub setup is complete/);
  };
  noActions(rendered);
  assert.equal(rendered.querySelector('.github-team-repository a').getAttribute('href'),'https://github.com/org/repo');
  mine.access='active';other.access='invited';rendered=card();
  assert.equal(rendered.querySelector('[data-member-state]').textContent,'Repository joined');
  noActions(rendered);
  assert.equal(rendered.querySelector('a.btn-primary'),null);assert.equal(rendered.querySelector('form'),null);
  assert.doesNotMatch(rendered.textContent,/Retry GitHub setup/);
  // A teammate joining cannot supply this student's personal access status.
  mine.access='unchecked';other.access='active';rendered=card();
  assert.equal(rendered.querySelector('[data-member-state]').textContent,'Accept Invitation Email');
  noActions(rendered);
  data.repoUrl='';rendered=card();assert.match(rendered.querySelector('.github-team-repository').textContent,/Not available yet/);
  assert.equal(rendered.querySelectorAll('[data-member-status]').length,3);
  data.githubAccount={};mine.githubId='';rendered=card();
  const jump=rendered.querySelector('[data-github-form-jump]');
  assert.equal(jump.textContent,'Submit GitHub Account');
  assert.equal(jump.getAttribute('type'),'button');
  assert.equal(jump.getAttribute('onclick'),'DashboardUI.focusGithubAccountForm(this)');
  assert.equal(jump.hasAttribute('href'),false);
  assert(rendered.querySelector('#studentGithubProfile'));
  assert.equal(rendered.querySelectorAll('[data-github-form-jump]').length,1);
});

test('weekly panel is independent of teammate setup while preserving repository and recorded work',()=>{
  const {c,schedule,clock}=fixture();
  const data={repoUrl:'https://github.com/org/repo',githubAccount:{githubId:'101',username:'student'},githubReady:false,githubCanRetry:true,githubState:'waiting',githubText:'Waiting for teammate R2',
    titleStatus:'APPROVED',title:'Existing title',rosterSlots:[],schedule,clock:clock('2026-09-23'),logWeeks:{missing:0,currentLogged:true}};
  c.getStudentDashboardData=()=>data;
  let html=(c.getAssessmentDefinitions_=()=>[],c.buildStudentContent)('student@example.com','T1');
  assert(html.includes('https://github.com/org/repo'));
  assert(html.includes('Current title:</strong> Existing title'));
  assert(html.includes('studentWeeklyProgress'));
  assert(!html.includes('Retry GitHub setup'));
  assert(!html.includes('https://example.com/log'));
  assert(!html.includes('milestones complete'));
  data.githubReady=true;data.githubCanRetry=false;data.githubState='done';
  html=(c.getAssessmentDefinitions_=()=>[],c.buildStudentContent)('student@example.com','T1');
  assert(html.includes('data-weekly-form'));
  assert(!html.includes('milestones complete'));
});

test('coordinator statistics, attention list and tracker share one health result',()=>{
  const {c,clock}=fixture({COLLABORATOR_GITHUB_USERNAME:'coordinator',COLLABORATOR_REPOS_ACCESS:1});
  const definitions=vm.runInContext('FIELD_DEFINITIONS',c);
  const maps=Object.fromEntries(Object.entries(definitions).map(([name,fields])=>[name,Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]))]));
  c.getColumnMap=(name,fields)=> Object.fromEntries(Object.keys(fields).map((key,i)=>[key,i]));
  const ts=maps.TEAM_STATUS;
  const row=[];
  for(const [key,value] of Object.entries({TEAM_ID:'T1',TITLE:'Project',REVIEWER_DECISION:'Approved',S1_EMAIL:'one@example.com',S2_EMAIL:'two@example.com',S1_REGNO:'R1',S2_REGNO:'R2'})) row[ts[key]]=value;
  row[40]='W1';
  c.readLogEntries_=()=>[{regNo:'R1',teamId:'T1',weekId:'W1',entryStatus:'SUBMITTED'},{regNo:'R1',teamId:'T1',weekId:'W2',entryStatus:'SUBMITTED'}];
  const sheetRows={TeamStatus:[row],TeamRoster:[],ReviewCommittee:[],Commits:[],RawLog:[['2026-09-21','one@example.com','T1'],['2026-09-28','one@example.com','T1']]};
  c.getSheetRows=name=>sheetRows[name]||[];
  c.readActivityRows_=name=>sheetRows[name]||[];
  c.getRepoUrlMap=()=>({t1:'https://example.com/repo'});
  c.getAllReviewCompletionStatus_=()=>({t1:{review1:{completed:false},review2:{completed:false}}});
  const now=clock('2026-10-05');
  c.getProjectClock_=()=>now;
  const data=c.getCoordinatorDashboardData_();
  assert.equal(data.stats.activeThisWeek,null);
  assert.equal(data.stats.needsAttention,1);
  assert.equal(data.needsAttentionTeams.length,1);
  assert.equal(data.teamTrackerData[0].health,'attention');
  assert.equal(data.teamTrackerData[0].weeklyActivity,null);
  assert.equal(data.needsAttentionTeams[0].daysOverdue,8);
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
  assert(!html.includes('id="initializeAssessmentStorageButton"'));
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
  const element=()=>{const classes=new Set();return {innerHTML:'',children:[],dataset:{},setAttribute(){},querySelector(){return null;},appendChild(child){this.children.push(child);},addEventListener(event,fn){this[event]=fn;},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)}};};
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
      if(selector==='[data-role-panel]:not([hidden])')return {getAttribute:()=> 'guide'};
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
  assert.match(f.timeline.innerHTML,/title="Opens .*; due /);
  assert(!f.guide.innerHTML.includes('timeline-track'));
  assert.equal(f.timeline.attributes['aria-busy'],'false');
});

function renderedTimeline(offsets,extra=[]) {
 const {parseHTML}=require('linkedom');
 const {document}=parseHTML('<section id="timeline"></section>');
 const target=document.querySelector('section');
 const source=fs.readFileSync('dashboard-client-scripts.js','utf8');
 const c=vm.createContext({escapeClientHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),renderLucideIcon_:()=>'<svg></svg>'});
 vm.runInContext(source.slice(source.indexOf('  function renderSharedTimeline('),source.indexOf('  function loadSharedTimeline()')),c);
 const data={today:100,todayLabel:'29 Sep 2026',milestones:offsets.map((offset,i)=>({key:'m'+i,label:'Milestone '+i,day:100+offset,date:'30 Sep 2026',openingDate:'20 Sep 2026'})).concat(extra)};
 const before=JSON.stringify(data);c.renderSharedTimeline(data,target);assert.equal(JSON.stringify(data),before);
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
 const css=fixture().c.getFunctionalStyles_();
 assert.match(css,/\.timeline-track:not\(\.timeline-full\) \.timeline-stop\[data-timeline-mobile="false"\] \{ display:none/);
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
 const {c}=fixture();const css=c.getFunctionalStyles_();
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(css,/\.timeline-current \{|timeline-nav|animation:/);
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
  c.getCommitteeInfo=()=>({});
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
  const body={children:rows.slice(),closest:()=>null,querySelectorAll:()=>rows,replaceChildren(...children){this.children=children;}};
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
  let logReads=0;c.readLogEntries_=()=>{logReads++;return [];};
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
 const {parseHTML}=require('linkedom');
 assert(!parseHTML(c.buildDashboardShell('user',[view('guide')])).document.querySelector('button[data-role-tab="system-status"]'));
 assert(parseHTML(c.buildDashboardShell('user',[view('coord')])).document.querySelector('button[data-role-tab="system-status"]'));
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
 assert(html.includes('initializeAssessmentStorageButton'));
});

test('Coordinator tracking uses small cards without a separate progress panel',()=>{
 const {c}=fixture();
 const html=c.buildCoordinatorHeaderStats({total:62,titleApproved:6,reposReady:50,needsAttention:56,reviews:{review1:{completed:0,unavailable:4},review2:{completed:3}}});
 assert.equal((html.match(/data-stat-card/g)||[]).length,8);
 for(const label of ['Total Teams','Title Approved','Repositories Available','Active This Week','Review 1 Completed','Review 2 Completed','Need Attention']) assert(html.includes(label));
 assert(html.includes('4 unavailable'));
 const shell=c.buildCoordinatorAsyncShell_();
 assert(!shell.includes('coordinatorCompletion'));assert(!shell.includes('coordinatorAssessment'));
 assert.equal((shell.match(/coordinator-stat-placeholder/g)||[]).length,8);
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
