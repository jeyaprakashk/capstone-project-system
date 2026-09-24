const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');

function fixture() {
  let actor='reviewer@x',today=20000,locked=false,allowLock=true;
  const TS={TEAM_ID:0,COMMITTEE_NUMBER:1,TITLE:2,REVIEWER_DECISION:3,PROBLEM:4,GUIDE_NAME:5,GUIDE_EMAIL:6};
  const row=['T1','C1','Project','Approved','Problem','Guide','guide@x'];
  const students=[{regNo:'S1',name:'One',email:'one@x'},{regNo:'S2',name:'Two',email:'two@x'}];
  const criteria=[{pi:'T',name:'Design',co:'CO1',maxMarks:60,type:'Team',descriptors:Array(6).fill('Descriptor')},{pi:'I',name:'Presentation',co:'CO2',maxMarks:40,type:'Individual',descriptors:Array(6).fill('Descriptor')}];
  const reviews=[{key:'review1',label:'Review 1',day:20007,weight:20,rubric:criteria},{key:'review2',label:'Review 2',day:20030,weight:30,rubric:criteria}];
  const tables={},sheets={};
  function sheet(name,data) {
    tables[name]=data;
    return sheets[name]={getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),getLastRow:()=>data.length,getMaxRows:()=>1000,
      getRange:(r,col,n,w)=>({setValues(values){values.forEach((row,i)=>{data[r-1+i]||=[];row.forEach((v,j)=>data[r-1+i][col-1+j]=v);});}})};
  }
  const normalize=v=>String(v??'').trim().toLowerCase();
  const c=vm.createContext({console,Date,Set,Map,Session:{getActiveUser:()=>({getEmail:()=>actor})},activityIsCoordinator_:v=>v==='coord@x',
    normalizeText_:normalize,normalizeReviewKey_:normalize,normalizeEmail:normalize,textEquals_:(a,b)=>normalize(a)===normalize(b),emailsMatch:(a,b)=>normalize(a)===normalize(b),
    SHEET_NAMES:{TEAM_STATUS:'teams'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},getColumnMap:()=>TS,getSheetRows:()=>[row],getStudentsFromTeamStatusRow_:()=>students,
    getCommitteeNumbersForReviewer:email=>['reviewer@x','second@x'].includes(email)?['C1']:[],getCommitteeInfo:()=>({marksSheetId:'marks',reviewer1Name:'Reviewer'}),getReviewDefinitions_:()=>reviews,
    getSheet:name=>sheets[name]||null,getSpreadsheet:()=>({getSpreadsheetTimeZone:()=> 'Asia/Kolkata',insertSheet:name=>sheet(name,[])}),
    projectDay_:(date,timezone)=>{assert.equal(timezone,'Asia/Kolkata');return today;},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>crypto.createHash('sha256').update(text).digest(),base64EncodeWebSafe:buffer=>buffer.toString('base64url')},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(!allowLock)return false;locked=true;return true;},releaseLock:()=>locked=false})},SpreadsheetApp:{flush(){}},
    summarizeReviewCompletion_:registers=>({completed:false,totalStudents:registers.size,markedStudents:0})});
  for(const file of ['guide-evaluation.js','review1-evaluation.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  sheet('Review1Evaluations',[Array.from(vm.runInContext('REVIEW1_HEADERS_',c))]);
  sheet('Review2Evaluations',[Array.from(vm.runInContext('REVIEW1_HEADERS_',c))]);
  const load=()=>c.getReview1Evaluation('T1');
  const input=(d=load())=>({team:'T1',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),teamScores:{T:{level:3,marks:48,remark:''}},
    students:students.map((s,i)=>({register:normalize(s.regNo),scores:{I:{level:3,marks:i?31:32,remark:''}}}))});
  const staffInput=(revision,reason)=>({team:'T1',revision,requestId:crypto.randomUUID(),reason});
  const progress=()=>c.review1Progress_(row,TS,c.review1Records_().records,c.review1Configuration_());
  return {c,TS,row,students,reviews,tables,sheets,load,input,staffInput,progress,actor:v=>actor=v,today:v=>today=v,lock:v=>allowLock=v,locked:()=>locked};
}

test('Review 1 accepts Level 2 without feedback for both team and individual criteria',()=>{
 const f=fixture(),input=f.input();input.teamScores.T={level:2,marks:36,remark:''};
 input.students.forEach(s=>s.scores.I={level:2,marks:24,remark:''});
 assert.equal(f.c.submitReview1Evaluation(input).status,'Submitted');
});

test('Level 2 feedback is optional and blank feedback does not block frontend submission',()=>{
 const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
 for(const field of f.fields()) {field.controls['[data-level]'].value='2';field.controls['[data-marks]'].value=field.dataset.owner==='team'?'36':'24';}
 f.events.input();assert(f.fields().every(field=>field.querySelector('[data-feedback-required]').hidden));
 f.click('data-submit');assert.equal(f.requests[1].name,'submitReview1Evaluation');
});

test('one range write stores separate student rows with replicated team scores',()=>{
  const f=fixture(),sheet=f.sheets.Review1Evaluations,range=sheet.getRange,writes=[];
  sheet.getRange=(...args)=>{writes.push(args);return range(...args);};
  const input=f.input();f.c.saveReview1EvaluationDraft(input);
  assert.deepEqual(writes,[[2,1,2,9]]);
  const rows=f.tables.Review1Evaluations;
  assert.deepEqual(rows[0],['Assessment','Team','Student','Revision','Action','Actor','At','Request ID','Payload']);
  assert.deepEqual(rows.slice(1).map(r=>r[2]),['s1','s2']);
  const first=JSON.parse(rows[1][8]),second=JSON.parse(rows[2][8]);
  assert.deepEqual(first.scores.T,second.scores.T);assert.equal(first.scores.T.marks,48);
  assert.equal(first.scores.I.marks,32);assert.equal(second.scores.I.marks,31);
  assert.equal(first.total,80);assert.equal(second.total,79);assert.equal(first.students,undefined);
  assert.equal(rows[1][3],rows[2][3]);assert.equal(rows[1][6],rows[2][6]);assert.equal(rows[1][7],rows[2][7]);
  const loaded=f.load();assert.equal(loaded.evaluation.teamScores.T.marks,48);
  assert.deepEqual(Array.from(loaded.evaluation.students,s=>s.scores.I.marks),[32,31]);
  f.c.saveReview1EvaluationDraft(input);assert.equal(writes.length,1);
});
test('incomplete, duplicate and inconsistent student revisions are rejected',()=>{
  for(const kind of ['missing','duplicate','team score','status']) {
    const f=fixture();f.c.submitReview1Evaluation(f.input());const rows=f.tables.Review1Evaluations;
    if(kind==='missing') rows.pop();
    else if(kind==='duplicate') rows.push([...rows[1]]);
    else {const value=JSON.parse(rows[2][8]);if(kind==='team score')value.scores.T.marks=49;else value.status='Published';rows[2][8]=JSON.stringify(value);}
    assert.throws(()=>f.c.review1Records_(),/Incomplete|Inconsistent/);
  }
});
test('publish and reopen append student-wise revisions without changing earlier scores',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());const submitted=JSON.stringify(f.tables.Review1Evaluations.slice(1));
  f.actor('coord@x');f.c.publishReview1Evaluation(f.staffInput(1));f.c.reopenReview1Evaluation(f.staffInput(2,'Correction'));
  const rows=f.tables.Review1Evaluations;assert.equal(rows.length,7);assert.equal(JSON.stringify(rows.slice(1,3)),submitted);
  assert(rows.slice(3,5).every(row=>JSON.parse(row[8]).status==='Published'));
  assert(rows.slice(5).every(row=>Object.keys(JSON.parse(row[8]).scores).length===0));
});
test('seven calendar day opening is inclusive and is enforced on reads and writes',()=>{
  const f=fixture(),input=f.input();f.today(19999);
  assert.equal(f.progress().readable,false);assert.match(f.progress().reason,/Opens/);
  assert.throws(f.load,/Opens/);assert.throws(()=>f.c.saveReview1EvaluationDraft(input),/Opens/);assert.throws(()=>f.c.submitReview1Evaluation(input),/Opens/);
  f.today(20000);assert.equal(f.load().availability.editable,true);f.c.saveReview1EvaluationDraft(input);
  f.today(20007);f.c.submitReview1Evaluation(f.input());assert.equal(f.load().evaluation.late,false);
});
test('late team submissions are allowed and recorded',()=>{
  const f=fixture();f.today(20008);f.c.submitReview1Evaluation(f.input());assert.equal(f.load().evaluation.late,true);
});
test('due pill distinguishes upcoming, due today and overdue drafts',()=>{
  const f=fixture();assert.equal(f.load().availability.timing.label,'Upcoming');
  f.today(20007);assert.equal(f.load().availability.timing.tone,'warning');assert.equal(f.load().availability.timing.label,'Due today');
  f.today(20008);assert.equal(f.load().availability.timing.tone,'danger');assert.equal(f.load().availability.timing.label,'Overdue');
  assert.equal(f.c.saveReview1EvaluationDraft(f.input()).timing.label,'Overdue');
});
test('submission timing stays fixed after the deadline, publication and date configuration changes',()=>{
  for(const [date,label,tone] of [[20006,'Submitted early','success'],[20007,'Submitted on time','success'],[20008,'Submitted late','danger']]){
    const f=fixture();f.today(date);const input=f.input(),saved=f.c.submitReview1Evaluation(input);
    assert.equal(saved.timing.label,label);assert.equal(saved.timing.tone,tone);assert.equal(saved.submittedDay,date);
    f.today(20050);assert.equal(f.load().availability.timing.label,label);
    assert.equal(f.c.submitReview1Evaluation(input).timing.label,label);
    f.reviews[0].day=20080;assert.equal(f.load().availability.timing.label,label);
    f.actor('coord@x');assert.equal(f.c.publishReview1Evaluation(f.staffInput(1)).timing.label,label);
    f.reviews[0].day=20007;f.c.reopenReview1Evaluation(f.staffInput(2,'Correction'));f.actor('reviewer@x');
    assert.equal(f.load().availability.timing.label,'Overdue');
  }
});
test('existing submission timestamps are used when submission day is absent',()=>{
  const f=fixture(),config=f.c.review1Configuration_();
  f.c.projectDay_=(date,timezone)=>{assert.equal(timezone,'Asia/Kolkata');assert.equal(date.toISOString(),'2026-09-26T10:00:00.000Z');return config.due;};
  assert.equal(f.c.review1Timing_(config,{status:'Published',config,submittedAt:'2026-09-26T10:00:00Z'}).label,'Submitted on time');
  assert.equal(f.c.review1Timing_(config,{status:'Submitted',config}).tone,'neutral');
});
test('assigned committee authorization and replaceable title eligibility apply on every write',()=>{
  const f=fixture(),input=f.input();f.actor('outsider@x');assert.throws(f.load,/assigned reviewer/);assert.throws(()=>f.c.submitReview1Evaluation(input),/assigned reviewer/);
  f.actor('reviewer@x');f.row[3]='Revise';assert.throws(f.load,/Approve/);assert.throws(()=>f.c.saveReview1EvaluationDraft(input),/Approve/);
  f.row[3]='Approved';f.row[2]='';assert.throws(f.load,/Approve/);assert.equal(f.tables.Review1Evaluations.length,1);
});
test('mixed scores share team criteria and compute individual totals and weights',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());const d=f.load();
  assert.equal(d.status,'Submitted');assert.equal(d.availability.editable,false);assert.equal(d.evaluation.teamScores.T.marks,48);
  assert.deepEqual(Array.from(d.evaluation.students,s=>s.total),[80,79]);assert.deepEqual(Array.from(d.evaluation.students,s=>s.weighted),[16,15.8]);
  assert.equal(f.progress().completed,true);assert.equal(f.progress().markedStudents,2);
});
test('incomplete drafts persist but cannot complete or submit a team',()=>{
  const f=fixture(),input=f.input();input.teamScores={};input.students.forEach(s=>s.scores={});
  f.c.saveReview1EvaluationDraft(input);assert.equal(f.load().status,'Draft');assert.equal(f.progress().completed,false);
  input.revision=1;input.requestId=crypto.randomUUID();assert.throws(()=>f.c.submitReview1Evaluation(input),/required/);
  assert.equal(f.tables.Review1Evaluations.length,3);
});
test('zero marks require feedback at submission and unknown or duplicated student criteria cannot bypass validation',()=>{
  const f=fixture(),input=f.input();input.teamScores.T={level:0,marks:0,remark:''};assert.throws(()=>f.c.submitReview1Evaluation(input),/remark/);
  input.teamScores.T.remark='Needs work';input.students.forEach(s=>s.scores.I={level:0,marks:0,remark:'Needs work'});
  f.c.submitReview1Evaluation(input);assert.equal(f.load().evaluation.students[0].total,0);
  const other=fixture(),bad=other.input();bad.students[1].register=bad.students[0].register;assert.throws(()=>other.c.submitReview1Evaluation(bad),/every registered/);
  const mixed=other.input();mixed.students[0].scores.T={level:5,marks:60,remark:''};assert.throws(()=>other.c.submitReview1Evaluation(mixed),/Invalid criterion/);
});
test('exact mark bands, precision and zero validate through both scopes',()=>{
  const f=fixture(),config={criteria:[{pi:'T',maxMarks:100,type:'Team'},{pi:'I',maxMarks:100,type:'Individual'}],weight:.2};
  for(const [level,low,high] of [[0,0,40],[1,40,60],[2,60,75],[3,75,85],[4,85,95],[5,95,100]]){
    const input={teamScores:{T:{level,marks:low,remark:'feedback'}},students:[{register:'s',scores:{I:{level,marks:low,remark:'feedback'}}}]};
    assert.equal(f.c.review1Score_(config,{students:[{register:'s'}]},input,true).students[0].total,low*2);
    input.teamScores.T.marks=high;
    if(level<5)assert.throws(()=>f.c.review1Score_(config,{students:[{register:'s'}]},input,true),/outside/);
  }
  for(const marks of [-1,48.001,true,'NaN',Infinity]){const input=f.input();input.teamScores.T.marks=marks;assert.throws(()=>f.c.submitReview1Evaluation(input),/decimals|outside/);}
});
test('Review 1 accepts half marks and rejects other decimals in both scoring scopes',()=>{
  const f=fixture(),input=f.input();input.teamScores.T.marks=48.5;input.students[0].scores.I.marks=31.5;
  f.c.saveReview1EvaluationDraft(input);assert.equal(f.load().evaluation.students[0].total,80);
  for(const scope of ['team','individual']){
    const invalid=f.input();if(scope==='team')invalid.teamScores.T.marks=48.25;else invalid.students[0].scores.I.marks=31.75;
    assert.throws(()=>f.c.saveReview1EvaluationDraft(invalid),/whole or half/);
    assert.throws(()=>f.c.submitReview1Evaluation(invalid),/whole or half/);
  }
});
test('shared drafts reject concurrent stale revisions and retries are idempotent',()=>{
  const f=fixture(),input=f.input();f.c.saveReview1EvaluationDraft(input);f.c.saveReview1EvaluationDraft(input);assert.equal(f.tables.Review1Evaluations.length,3);
  assert.throws(()=>f.c.submitReview1Evaluation(input),/different data/);
  f.actor('second@x');assert.throws(()=>f.c.saveReview1EvaluationDraft({...input,requestId:crypto.randomUUID()}),/changed/);
  f.c.submitReview1Evaluation(f.input());assert.equal(f.load().status,'Submitted');
  assert.throws(()=>f.c.saveReview1EvaluationDraft(f.input()),/locked/);assert.equal(f.locked(),false);
});
test('changed roster, rubric and opening date invalidate previously opened drafts',()=>{
  const f=fixture(),input=f.input();f.students.push({regNo:'S3',name:'Three',email:'three@x'});assert.throws(()=>f.c.submitReview1Evaluation(input),/Roster or rubric/);f.students.pop();
  f.reviews[0].rubric[0].maxMarks=70;assert.throws(()=>f.c.submitReview1Evaluation(input),/Roster or rubric/);f.reviews[0].rubric[0].maxMarks=60;
  f.reviews[0].day++;assert.throws(()=>f.c.submitReview1Evaluation(input),/Opens/);assert.equal(f.tables.Review1Evaluations.length,1);
});
test('publication is coordinator-only and exposes only the signed-in student scores',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());const op=f.staffInput(1);
  for(const method of ['publishReview1Evaluation','reopenReview1Evaluation','loadCoordinatorReview1Evaluations'])assert.throws(()=>f.c[method](op),/Coordinator/);
  f.actor('one@x');assert.equal(f.c.loadPublishedReview1Evaluation(),null);assert.throws(f.load,/assigned reviewer/);
  f.actor('coord@x');f.c.publishReview1Evaluation(op);f.c.publishReview1Evaluation(op);
  f.actor('one@x');let published=f.c.loadPublishedReview1Evaluation();assert.equal(published.total,80);assert.equal(published.students,undefined);assert.equal(published.scores.T.marks,48);
  f.actor('two@x');assert.equal(f.c.loadPublishedReview1Evaluation().total,79);
  f.actor('outsider@x');assert.throws(()=>f.c.loadPublishedReview1Evaluation(),/assignment/);
  assert.equal(f.tables.Review1Evaluations.length,5);
});
test('publication uses submitted rubric snapshot and rejects changed roster',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());f.actor('coord@x');f.students[0].name='Changed';
  assert.throws(()=>f.c.publishReview1Evaluation(f.staffInput(1)),/Roster changed/);f.students[0].name='One';
  f.reviews[0].rubric[0].maxMarks=90;f.c.publishReview1Evaluation(f.staffInput(1));f.actor('reviewer@x');assert.equal(f.load().config.criteria[0].maxMarks,60);
});
test('reopening requires a reason, clears scores, adopts current rubric and hides published results',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());f.actor('coord@x');f.c.publishReview1Evaluation(f.staffInput(1));
  assert.throws(()=>f.c.reopenReview1Evaluation(f.staffInput(2)),/reason/);f.reviews[0].rubric[0].maxMarks=70;
  f.c.reopenReview1Evaluation(f.staffInput(2,'Correction'));f.actor('reviewer@x');const d=f.load();
  assert.equal(d.status,'Draft');assert.equal(d.config.criteria[0].maxMarks,70);assert.equal(Object.keys(d.evaluation.teamScores).length,0);
  assert(d.evaluation.students.every(s=>Object.keys(s.scores).length===0));assert.equal(f.progress().completed,false);
  f.actor('one@x');assert.equal(f.c.loadPublishedReview1Evaluation(),null);assert.equal(f.tables.Review1Evaluations.length,7);
});
test('submitted evaluations stay readable when the opening date or eligibility changes',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());f.today(19990);f.row[3]='Revise';assert.equal(f.load().availability.readable,true);assert.equal(f.load().availability.editable,false);
});
test('legacy save endpoint cannot overwrite Review 1 and legacy levels never complete history',()=>{
  const f=fixture();assert.throws(()=>f.c.saveReviewerEvaluation('T1','review1',{}),/workflow/);assert.equal(f.progress().completed,false);
  assert.equal(f.c.getReviewerEvaluation('T1','review1').status,'Not started');
});
test('manually created storage headers are validated without overwriting',()=>{
  const f=fixture();f.actor('coord@x');assert.equal(f.c.setupReview1Evaluation,undefined);f.c.review1Records_();assert.equal(f.tables.Review1Evaluations.length,1);
  f.tables.Review1Evaluations[0][0]='Wrong';assert.throws(()=>f.c.review1Records_(),/headers/);assert.equal(f.tables.Review1Evaluations[0][0],'Wrong');
});
test('missing storage, oversized payload and unavailable lock fail without revision writes',()=>{
  const f=fixture(),input=f.input();f.lock(false);assert.throws(()=>f.c.submitReview1Evaluation(input),/saving/);f.lock(true);
  delete f.sheets.Review1Evaluations;assert.throws(()=>f.c.submitReview1Evaluation(input),/Create the tab manually/);
  const big=fixture();big.reviews[0].rubric[0].descriptors=Array(6).fill('x'.repeat(10000));assert.throws(()=>big.c.submitReview1Evaluation(big.input()),/too large/);assert.equal(big.tables.Review1Evaluations.length,1);
});
test('coordinator report lists team statuses and totals without requiring reviewer assignment',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());f.actor('coord@x');const report=f.c.loadCoordinatorReview1Evaluations();assert.equal(report.ready,true);assert.equal(report.teams[0].status,'Submitted');assert.equal(report.teams[0].students.length,2);
});
test('browser source is serializable and uses shared drawer layout',()=>{
  const c=vm.createContext({});vm.runInContext(fs.readFileSync('review1-evaluation-client.js','utf8'),c);
  new vm.Script(c.getReview1EvaluationClientScript_());assert.match(c.getReview1EvaluationClientScript_(),/team-drawer open review1-drawer/);
});

test('Review 2 checks history on load and save, and reopening removes completion',()=>{
  const f=fixture();
  f.c.SpreadsheetApp.openById=()=>({});
  f.c.reviewerReviewRows_=()=>({sheet:{},rows:f.students.map(s=>[1,'T1',s.regNo,s.name,'C1',0,'',0,0])});
  f.reviews.reverse(); // Milestone date/order changes cannot bypass the named prerequisite.
  assert.throws(()=>f.c.reviewerEvaluationContext_('T1','review2'),/Complete Review 1/);
  f.c.submitReview1Evaluation(f.input());assert.equal(f.c.reviewerEvaluationContext_('T1','review2').review.key,'review2');
  f.actor('coord@x');f.c.reopenReview1Evaluation(f.staffInput(1,'Correction'));f.actor('reviewer@x');
  assert.throws(()=>f.c.saveReview2EvaluationDraft({...f.staffInput(0),token:'stale'}),/Complete Review 1/);
  assert.throws(()=>f.c.saveReviewerEvaluation('T1','review2',{}),/draft and submission workflow/);
});
test('spreadsheet timezone midnight drives the exact seven-day boundary',()=>{
  const clock=vm.createContext({Date,PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},Utilities:{formatDate:(date,timezone)=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }}});
  vm.runInContext(fs.readFileSync('common-helpers.js','utf8'),clock);
  const f=fixture();f.reviews[0].day=clock.projectDay_('2026-10-12','Asia/Kolkata');
  f.today(clock.projectDay_(new Date('2026-10-04T18:29:59Z'),'Asia/Kolkata'));assert.equal(f.progress().readable,false);
  f.today(clock.projectDay_(new Date('2026-10-04T18:30:00Z'),'Asia/Kolkata'));assert.equal(f.progress().readable,true);
});
test('reviewer dashboard shows opening reason and read-only action after submission',()=>{
  const f=fixture();f.c.escapeHtml=v=>String(v);f.c.renderLucideIcon_=name=>name;
  vm.runInContext(fs.readFileSync('reviewer-dashboard.js','utf8'),f.c);
  const render=()=>f.c.buildReviewerReviewCells_(f.row,f.TS,{reviews:[f.reviews[0]],teams:{t1:{review1:f.progress()}}});
  f.today(19999);assert.match(render(),/disabled/);assert.match(render(),/Opens/);
  f.today(20000);assert.doesNotMatch(render(),/disabled/);f.c.submitReview1Evaluation(f.input());assert.match(render(),/View marks/);
});

function browserFixture(extended=false,key='review1') {
  const headerNodes={};
  const requests=[],events={},status={},totals=[{},{}];let html='',fields=[],buttons=[],focusCount=0,discard=true;
  const loading={begun:0,settled:0};
  let absenceNodes=new Map();
  const control=(value='',kind='input')=>({value,kind,disabled:false,required:false,validity:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){focusCount++;},setCustomValidity(text){this.validity=text;},matches:()=>kind!=='button'});
  const button=(attr,value,field)=>({kind:'button',dataset:{[attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},attrs:{},setAttribute(k,v){this.attrs[k]=v;},disabled:false,hasAttribute:key=>key===attr,closest(selector){return selector==='[data-index]'?field:this;},focus(){focusCount++;},matches:()=>false});
  const form={addEventListener(){},reportValidity:()=>fields.every(field=>Object.values(field.controls).every(c=>!c.validity && (!c.required || c.value!=='')))};
  const drawer={open:false,dataset:{},setAttribute(){},addEventListener:(name,fn)=>events[name]=fn,showModal(){this.open=true;},close(){this.open=false;},
    set innerHTML(value){html=value;fields=[];buttons=[];absenceNodes=new Map();
      for(const match of value.matchAll(/<button[^>]*(data-(?:close|draft|submit|reload|edit-absence|cancel-absence|record-absence|record-decision|target-draft|target-submit|target))(?:="([^"]*)")?[^>]*>/g))buttons.push(button(match[1],match[2]));
      if(extended)for(const match of value.matchAll(/data-absence="(\d+)"[^>]*>([\s\S]*?)<div data-effective="\d+"><\/div>/g)){
        const controls={};
        for(const m of match[2].matchAll(/<select data-fact="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))controls[m[1]]=control((m[2].match(/value="([^"]*)" selected/)||[])[1]||'','select');
        controls.reason=control((match[2].match(/<textarea data-fact="reason"[^>]*>([\s\S]*?)<\/textarea>/)||[])[1]||'','textarea');
        const nodes={'[data-exception-fields]':{},'[data-prolonged-fields]':{},['[data-effective="'+match[1]+'"]']:{}};
        const host={dataset:{absence:match[1]},controls,nodes,pills:[],querySelector(selector){const name=(selector.match(/data-fact="([^"]+)"/)||[])[1];return name?controls[name]:nodes[selector];},querySelectorAll:()=>host.pills};
        host.pills=Array.from(match[2].matchAll(/data-reason-suggestion="(\d+)"/g),m=>{
          const pill=button('data-reason-suggestion',m[1]);pill.closest=selector=>selector==='[data-absence]'?host:selector==='button'?pill:null;return pill;
        });
        absenceNodes.set(match[1],host);
      }
      for(const match of value.matchAll(/<fieldset[^>]*data-index="(\d+)" data-owner="([^"]+)"[^>]*>([\s\S]*?)<\/fieldset>/g)){
        const controls={'[data-level]':control((match[3].match(/<option value="(\d+)" selected/)||[])[1]||'','select'),'[data-marks]':control((match[3].match(/step="0.5" value="([^"]*)"/)||[])[1]||''),'[data-remark]':control((match[3].match(/<textarea data-remark[^>]*>([\s\S]*?)<\/textarea>/)||[])[1]||'','textarea'),'[data-marks-slider]':control('0','range')};
        const nodes={'[data-range]':{},'[data-descriptor]':{},'[data-feedback-required]':{},'[data-marks-error]':{},'[data-awarded-total]':{}};
        const field={dataset:{index:match[1],owner:match[2]},controls,buttons:[],querySelector(selector){return controls[selector]||nodes[selector]||this.querySelectorAll(selector)[0];},querySelectorAll(selector){return this.buttons.filter(b=>b.hasAttribute(selector.slice(1,-1)));}};
        for(const m of match[3].matchAll(/data-(pick-level|step)="([^"]+)"/g))field.buttons.push(button('data-'+m[1],m[2],field));
        let suggestions='',feedback=[];
        nodes['[data-feedback-options]']={dataset:{},set innerHTML(v){suggestions=v;feedback=Array.from(v.matchAll(/data-feedback="(\d+)"/g),m=>button('data-feedback',m[1],field));},get innerHTML(){return suggestions;},querySelectorAll:()=>feedback};
        fields.push(field);
      }
    },get innerHTML(){return html;},
    querySelector(selector){
      if(selector.startsWith('[data-footer-team=') || selector.startsWith('[data-footer-individual=') || selector.startsWith('[data-footer-total='))return headerNodes[selector]||={};
      if(selector==='[data-team-mark]' || selector.startsWith('[data-individual-mark=') || selector.startsWith('[data-assessment-status='))return headerNodes[selector]||=( {} );
      if(extended){
        const absence=selector.match(/^\[data-absence="(\d+)"\]$/);if(absence)return absenceNodes.get(absence[1]);
        const criterion=selector.match(/^\[data-index="(\d+)"\]\[data-owner="([^"]+)"\]$/);if(criterion)return fields.find(f=>f.dataset.index===criterion[1] && f.dataset.owner===criterion[2]);
        if(selector.startsWith('[data-decision-reason'))return {value:'Reviewed evidence'};
        if(selector.startsWith('[data-components'))return {value:'individual'};
        if(selector.startsWith('[data-decision='))return {value:'OTHER'};
        if(selector==='.review1-actions')return {set innerHTML(value){for(const m of value.matchAll(/(data-(?:target-draft|target-submit|reload|close))/g))buttons.push(button(m[1]));}};
      }
      if(selector==='[data-message]')return status;if(selector==='form')return form;if(selector.startsWith('[data-total='))return totals[Number(selector.match(/\d+/)[0])];return buttons.find(b=>b.hasAttribute(selector.slice(1,-1)));},
    querySelectorAll(selector){if(selector==='[data-index]')return fields;if(selector.startsWith('[data-absence]'))return [...absenceNodes.values()].flatMap(h=>Object.values(h.controls));const inputs=fields.flatMap(f=>Object.values(f.controls));return selector.includes('button')?[...buttons,...inputs,...fields.flatMap(f=>[...f.buttons,...f.querySelector('[data-feedback-options]').querySelectorAll('button')])]:inputs;}
  };
  const trigger={isConnected:true,focus(){focusCount++;}};
  function runner(success,failure){return new Proxy({},{get:(_,name)=>name==='withSuccessHandler'?fn=>runner(fn,failure):name==='withFailureHandler'?fn=>runner(success,fn):(...args)=>requests.push({name,args,success,failure})});}
  const c=vm.createContext({console,confirm:()=>discard,prompt:()=>extended?'Reviewed assessment':null,window:{crypto,addEventListener(){}},document:{createElement:()=>drawer,body:{appendChild(){},classList:{add(){},remove(){}}},getElementById:()=>null},DashboardUI:{guideRun:()=>runner(),renderSkeleton:()=>'<p>Loading</p>',...(extended?{beginContentLoading(){loading.begun++;let settled=false;return()=>{if(!settled)loading.settled++;settled=true;};}}:{})}});
  vm.runInContext(fs.readFileSync('dashboard-client-scripts.js','utf8'),c);
  for(const file of ['lucide-icons.js','icon-renderer.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  c.DashboardUI.renderIcon=c.renderLucideIcon_;
  c.DashboardUI.renderExpandableText=c.renderExpandableText_;
  vm.runInContext(fs.readFileSync('review1-evaluation-client.js','utf8'),c);const api=c.review1EvaluationBrowser_(key);
  const click=attr=>events.click({target:buttons.find(b=>b.hasAttribute(attr))});
  const data=JSON.parse(JSON.stringify(fixture().load()));
  return {api,drawer,requests,status,data,trigger,click,events,fields:()=>fields,discard:v=>discard=v,focus:()=>focusCount,absenceNodes:()=>absenceNodes,loading,context:c};
}

// Both configured reviews must obey the same policy without sharing records or rubric content.
function absenceFixture(key='review1') {
  const f=fixture();
  if(key==='review2'){f.c.submitReview1Evaluation(f.input());f.today(20030);}
  const load=()=>f.c.getReviewEvaluation_('T1',key);
  const input=(data=load())=>f.input(data);
  const submit=value=>f.c.review1Write_('submit',value,key);
  const target=(extra={})=>({review:key,team:'T1',student:'s1',revision:load().revision,token:load().token,requestId:crypto.randomUUID(),reason:'Committee verified supporting evidence',...extra});
  const publish=student=>{const revision=load().revision;f.actor('coord@x');const result=f.c.review1Write_('publish',{...f.staffInput(revision),student},key);f.actor('reviewer@x');return result;};
  return {...f,key,load,input,submit,target,publish,student:()=>load().evaluation.students[0]};
}
const absence=(type,approved,verifiedContribution,attended)=>({type,approved,verifiedContribution,attended,reason:'Reviewer verified guide confirmation and review attendance',...(type==='PROLONGED'?{absenceReason:approved?'MEDICAL':null,supportingEvidence:[],contributionEvidence:verifiedContribution?['GUIDE_CONFIRMATION']:[],otherContributionEvidenceText:null}:{})});

for(const key of ['review1','review2']) {
  test(key+': team PI cards switch singly and submission reveals a hidden missing PI',()=>{
    const f=browserFixture(true,key);
    f.data.config.criteria.push({...f.data.config.criteria[0],pi:'T2',name:'Second team criterion'});
    f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    const teams=f.fields().filter(field=>field.dataset.owner==='team'),group={dataset:{criteriaGroup:'team'},querySelectorAll:()=>teams},query=f.drawer.querySelector.bind(f.drawer),all=f.drawer.querySelectorAll.bind(f.drawer);
    f.drawer.querySelector=s=>s==='[data-criteria-group="team"]'?group:query(s);
    f.drawer.querySelectorAll=s=>s==='[data-criteria-group]'?[group]:all(s);
    teams.forEach(field=>{field.closest=s=>s==='[data-index]'?field:s==='[data-criteria-group]'?group:null;field.scrollIntoView=()=>{};const marks=field.controls['[data-marks]'];marks.checkValidity=()=>!marks.validity;Object.defineProperty(marks,'validationMessage',{get:()=>marks.validity});});
    assert.equal(teams[0].hidden,false);assert.equal(teams[1].hidden,true);
    const click=index=>{const pill={dataset:{selectPi:teams[index].dataset.index},hasAttribute:a=>a==='data-select-pi',closest:s=>s==='button'?pill:null};f.events.click({target:pill});};
    teams[0].controls['[data-level]'].value='3';teams[0].controls['[data-marks]'].value='48';f.events.input();
    click(1);assert.equal(teams[0].hidden,true);assert.equal(teams[1].hidden,false);
    click(0);assert.equal(teams[0].controls['[data-marks]'].value,'48');assert.equal(teams[1].hidden,true);
    f.click('data-submit');assert.equal(teams[1].hidden,false);assert.equal(teams[0].hidden,true);assert.match(f.status.textContent,/Select a proficiency level/);assert.equal(f.requests.length,1);
  });
  test(key+': Other remarks shows only custom text while selected feedback stays in pills',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    const field=f.fields()[0],query=field.querySelector.bind(field),label={},custom={value:'',setCustomValidity(v){this.error=v;},focus(){},hasAttribute:a=>a==='data-custom-feedback',closest:()=>field},other={attrs:{},hasAttribute:a=>a==='data-other-feedback',setAttribute(k,v){this.attrs[k]=v;},closest:s=>s==='button'?other:s==='[data-index]'?field:null};
    field.querySelector=s=>s==='[data-custom-feedback]'?custom:s==='[data-custom-feedback-label]'?label:s==='[data-other-feedback]'?other:query(s);
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='48';f.events.input();
    assert.equal(label.hidden,true);
    const pill=field.querySelector('[data-feedback-options]').querySelectorAll('button')[0];f.events.click({target:pill});
    const selected=field.controls['[data-remark]'].value;assert(selected);assert.equal(custom.value,'');assert.equal(label.hidden,true);
    f.events.click({target:other});assert.equal(label.hidden,false);assert.equal(other.attrs['aria-pressed'],'true');
    custom.value='Additional reviewer observation.';f.events.input({target:custom});
    assert.equal(field.controls['[data-remark]'].value,selected+'\nAdditional reviewer observation.');assert.equal(custom.value,'Additional reviewer observation.');
    f.events.click({target:pill});assert.equal(custom.value,'Additional reviewer observation.');
    f.events.click({target:other});assert.equal(label.hidden,true);assert.equal(field.controls['[data-remark]'].value,'');
    field.controls['[data-remark]'].value=selected+'\nHistorical custom feedback.';f.events.input();
    assert.equal(label.hidden,false);assert.equal(custom.value,'Historical custom feedback.');
    f.click('data-draft');assert.equal(f.requests[1].args[0].teamScores.T.remark,selected+'\nHistorical custom feedback.');
  });
  test(key+': team PI navigation blocks invalid marks and preserves valid entries',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.match(f.drawer.innerHTML,/data-team-pills/);assert.match(f.drawer.innerHTML,/data-select-pi="0"/);
    const field=f.fields()[0],group={querySelectorAll:()=>[field]},query=f.drawer.querySelector.bind(f.drawer);
    f.drawer.querySelector=s=>s==='[data-criteria-group="team"]'?group:query(s);
    let scrolled=false;field.scrollIntoView=()=>{scrolled=true;};
    const marks=field.controls['[data-marks]'];marks.checkValidity=()=>!marks.validity;Object.defineProperty(marks,'validationMessage',{get:()=>marks.validity});
    const pill={dataset:{selectPi:'0'},hasAttribute:a=>a==='data-select-pi',closest:s=>s==='button'?pill:null};
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='59';
    f.events.click({target:pill});assert.equal(scrolled,false);assert.match(f.status.textContent,/outside/);
    field.controls['[data-marks]'].value='48';f.events.click({target:pill});assert.equal(scrolled,true);assert.equal(field.controls['[data-marks]'].value,'48');assert.equal(f.requests.length,1);
  });
  test(key+': tab progress counts valid grading and changes completion color',()=>{
    const f=browserFixture(true,key),row={},query=f.drawer.querySelector.bind(f.drawer);
    f.drawer.querySelector=selector=>selector==='[data-tab-progress]'?row:query(selector);
    f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.match(row.innerHTML,/Performance Indicators/);assert.match(row.innerHTML,/data-completion="empty">0 of 1 graded/);
    const team=f.fields()[0];team.controls['[data-level]'].value='3';team.controls['[data-marks]'].value='48';f.events.input();
    assert.match(row.innerHTML,/data-completion="complete">1 of 1 graded/);
    const tab={dataset:{criteriaTab:'individual'},hasAttribute:a=>a==='data-criteria-tab',closest:s=>s==='button'?tab:null};
    f.events.click({target:tab});assert.match(row.innerHTML,/Students/);assert.match(row.innerHTML,/0 of 2 graded/);
    const students=f.fields().filter(field=>field.dataset.owner!=='team');
    students[0].controls['[data-level]'].value='3';students[0].controls['[data-marks]'].value='32';f.events.input();
    assert.match(row.innerHTML,/data-completion="partial">1 of 2 graded/);
    students[1].controls['[data-level]'].value='3';students[1].controls['[data-marks]'].value='32';f.events.input();
    assert.match(row.innerHTML,/data-completion="complete">2 of 2 graded/);
    students[0].controls['[data-marks]'].value='99';f.events.input();
    assert.match(row.innerHTML,/data-completion="partial">1 of 2 graded/);
  });
  test(key+': component tabs switch without reload, preserve entries and support arrow navigation',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert(f.drawer.innerHTML.indexOf('review1-project-title-row')<f.drawer.innerHTML.indexOf('role="tablist"'));
    assert.match(f.drawer.innerHTML,/Team Criteria<\/span><span class="review1-tab-caption">60 pts pool<\/span>/);assert.match(f.drawer.innerHTML,/Individual<\/span><span class="review1-tab-caption">40 pts weight<\/span>/);
    const panels=Object.fromEntries(['team','individual'].map(name=>[name,{hidden:name!=='team',open:name==='team',querySelectorAll:()=>[]}]));
    const tabs=Object.fromEntries(['team','individual'].map(name=>[name,{dataset:{criteriaTab:name},attrs:{},hasAttribute:attr=>attr==='data-criteria-tab',setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;},closest(selector){return selector==='button'?this:null;}}]));
    const chips={},query=f.drawer.querySelector.bind(f.drawer);
    f.drawer.querySelector=selector=>selector==='.review1-header-students'?chips:selector.startsWith('[data-criteria-group="')?panels[selector.match(/"([^"]+)"/)[1]]:selector.startsWith('[data-criteria-tab="')?tabs[selector.match(/"([^"]+)"/)[1]]:query(selector);
    f.fields()[0].controls['[data-marks]'].value='48';f.fields()[0].controls['[data-level]'].value='3';f.events.input();
    f.events.click({target:tabs.individual});assert.equal(panels.team.hidden,true);assert.equal(panels.individual.hidden,false);assert.equal(tabs.individual.attrs['aria-selected'],'true');assert.equal(chips.hidden,false);
    f.events.keydown({target:tabs.individual,key:'ArrowLeft',preventDefault(){}});assert.equal(panels.team.hidden,false);assert.equal(panels.individual.hidden,true);assert.equal(tabs.team.focused,true);assert.equal(chips.hidden,true);
    assert.equal(f.fields()[0].controls['[data-marks]'].value,'48');assert.equal(f.requests.length,1);
    f.click('data-draft');f.events.click({target:tabs.individual});assert.equal(panels.team.hidden,false);
  });
  test(key+': level ranges and slider values use configured marks; footer has actions only',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.doesNotMatch(f.drawer.innerHTML,/review1-footer-table|data-footer-student/);
    assert.match(f.drawer.innerHTML,/data-draft/);assert.match(f.drawer.innerHTML,/data-submit/);
    assert.match(f.drawer.innerHTML,/<strong>L3<\/strong><small>45\u201350.5<\/small>/);
    const field=f.fields()[0],values={},query=field.querySelector.bind(field);
    field.querySelector=s=>s==='[data-slider-values]'?values:query(s);
    f.events.input();assert.equal(values.hidden,true);
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='48';f.events.input();
    assert.equal(values.hidden,false);assert.match(values.innerHTML,/<span>45<\/span>/);
    assert.match(values.innerHTML,/<span class="is-selected">48<\/span>/);assert.match(values.innerHTML,/<span>50.5<\/span>/);
    field.controls['[data-level]'].value='5';field.controls['[data-marks]'].value='60';f.events.input();
    assert.match(values.innerHTML,/<span>57<\/span>/);assert.match(values.innerHTML,/<span class="is-selected">60<\/span>/);
  });
  test(key+': team and student headers show marks and assessment status without a separate breakdown',()=>{
    for(const [facts,individual,status] of [
      [null,'32 / 40','Completed'],
      [absence('REVIEW_DAY_ABSENCE',true),'Pending / 40','Makeup Pending'],
      [absence('REVIEW_DAY_ABSENCE',false),'0 / 40','Absent Unapproved'],
      [absence('PROLONGED',true,false,false),'Pending / 40','Academic Decision Pending'],
      [absence('PROLONGED',false,false,false),'0 / 40','Non Participation']
    ]) {
      const server=absenceFixture(key),input=server.input();
      if(facts){input.students[0].absence=facts;input.students[0].scores={};}server.submit(input);
      const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
      assert.equal(f.drawer.querySelector('[data-team-mark]').textContent,'48 / 60');
      assert.equal(f.drawer.querySelector('[data-individual-mark="0"]').textContent,individual);
      assert.equal(f.drawer.querySelector('[data-assessment-status="0"]').textContent,'Assessment status: '+status);
      assert.doesNotMatch(f.drawer.innerHTML,/View breakdown|review1-score-badge/);
      assert.match(f.drawer.innerHTML,/<strong>Team Criteria<\/strong><span class="review1-header-mark" data-team-mark/);
      assert.match(f.drawer.innerHTML,/<strong>One<\/strong><span class="review1-header-mark" data-individual-mark="0"/);
    }
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.equal(f.drawer.querySelector('[data-team-mark]').textContent,'Unassessed / 60');
    assert.equal(f.drawer.querySelector('[data-individual-mark="0"]').textContent,'Unassessed / 40');
    f.fields()[0].controls['[data-level]'].value='3';f.fields()[0].controls['[data-marks]'].value='48';
    f.fields()[1].controls['[data-level]'].value='3';f.fields()[1].controls['[data-marks]'].value='32';f.events.input();
    assert.equal(f.drawer.querySelector('[data-team-mark]').textContent,'48 / 60');
    assert.equal(f.drawer.querySelector('[data-individual-mark="0"]').textContent,'32 / 40');
    assert.equal(f.drawer.querySelector('[data-assessment-status="0"]').textContent,'Assessment status: Completed');
  });
  test(key+': compact student chips switch panels without RPC or losing unsaved entries',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.match(f.drawer.innerHTML,/data-select-student="0" aria-pressed="true"/);
    assert.match(f.drawer.innerHTML,/data-select-student="1" aria-pressed="false"/);
    const panels=[0,1].map(i=>({dataset:{studentGroup:String(i)},open:i===0,hidden:i!==0}));
    const chips=[0,1].map(i=>({dataset:{selectStudent:String(i)},attrs:{},hasAttribute:name=>name==='data-select-student',setAttribute(k,v){this.attrs[k]=v;},closest:selector=>selector==='button'?chips[i]:null}));
    const parent={open:false,closest:selector=>selector==='[data-criteria-group]'?parent:null};
    const query=f.drawer.querySelector.bind(f.drawer),all=f.drawer.querySelectorAll.bind(f.drawer);
    f.drawer.querySelector=selector=>selector==='[data-criteria-group="individual"]'?parent:selector.startsWith('[data-select-student="')?chips[Number(selector.match(/\d+/)[0])]:selector.startsWith('[data-student-group="')?panels[Number(selector.match(/\d+/)[0])]:query(selector);
    f.drawer.querySelectorAll=selector=>selector==='[data-criteria-group]'?[parent]:selector==='[data-student-group]'?panels:all(selector);
    const field=f.fields()[1];field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='32';field.controls['[data-remark]'].value='Unsaved feedback';f.events.input();
    f.events.click({target:chips[1]});assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);assert.equal(parent.open,true);assert.equal(chips[1].attrs['aria-pressed'],'true');
    f.events.click({target:chips[0]});assert.equal(panels[0].hidden,false);assert.equal(field.controls['[data-marks]'].value,'32');assert.equal(field.controls['[data-remark]'].value,'Unsaved feedback');assert.equal(f.requests.length,1);
    f.click('data-draft');f.events.click({target:chips[1]});assert.equal(panels[0].hidden,false);
    f.requests[1].failure({message:'Offline'});f.events.click({target:chips[1]});assert.equal(panels[1].hidden,false);
    assert.match(f.context.getReview1EvaluationStyles_(),/\.review1-header-students \{ display:grid;/);
    assert.match(f.drawer.innerHTML,/class="review1-student-register">s1<\/small>/);
  });
  test(key+': individual rubric visibility follows attendance and preserves unsaved entries',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    const host=f.absenceNodes().get('0'),field=f.fields()[1];
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='32';
    for(const approved of ['yes','no']) {
      host.controls.approved.value=approved;host.controls.type.value='REVIEW_DAY_ABSENCE';f.events.input();
      assert.equal(field.hidden,true);assert.equal(field.controls['[data-marks]'].disabled,true);
      host.controls.type.value='PROLONGED';
      for(const contribution of ['yes','no']) {
        host.controls.contribution.value=contribution;host.controls.attended.value='no';f.events.input();assert.equal(field.hidden,true);
        host.controls.attended.value='yes';f.events.input();assert.equal(field.hidden,false);assert.equal(field.controls['[data-marks]'].disabled,false);
        assert.equal(field.controls['[data-marks]'].value,'32');
      }
    }
    host.controls.type.value='NORMAL';f.events.input();assert.equal(field.hidden,false);
    assert.equal(f.fields()[0].hidden,false);
  });
  test(key+': pending absence hides individual controls until makeup is opened',()=>{
    const server=absenceFixture(key),input=server.input();input.students[0].absence=absence('PROLONGED',true,true,false);input.students[0].scores={};server.submit(input);
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.equal(f.fields()[1].hidden,true);
    f.click('data-target');assert.equal(f.fields()[1].hidden,false);assert.equal(f.fields()[0].hidden,true);assert.equal(f.fields()[2].hidden,true);
    assert.equal(f.fields()[1].controls['[data-marks]'].disabled,false);
  });
  test(key+': prolonged approval, contribution and attendance controls remain independent',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    const host=f.absenceNodes().get('0'),query=host.querySelector.bind(host),all=host.querySelectorAll.bind(host);
    const nodes=Object.fromEntries(['review-day-fields','legacy-evidence','other-reason-label','other-evidence-label','contribution-fields','other-contribution-label','absence-reason-label','absence-evidence-label','other-evidence-option','other-evidence-title'].map(name=>['[data-'+name+']',{}]));
    for(const name of ['other-reason','other-evidence','other-contribution'])nodes['[data-'+name+']']={value:''};
    const reason={value:'MEDICAL',checked:true,hasAttribute:name=>name==='data-primary-reason'};
    const contribution=['GUIDE_CONFIRMATION','OTHER'].map(value=>({value,checked:false,setCustomValidity(value){this.error=value;}}));
    host.querySelector=selector=>selector==='[data-primary-reason]:checked'?(reason.checked?reason:null):selector==='[data-contribution-evidence][value="OTHER"]:checked'?(contribution[1].checked?contribution[1]:null):nodes[selector]||query(selector);
    host.querySelectorAll=selector=>selector==='[data-primary-reason],[data-supporting-evidence]'?[reason]:selector==='[data-supporting-evidence]:checked'?[]:selector==='[data-contribution-evidence]'?contribution:selector==='[data-contribution-evidence]:checked'?contribution.filter(e=>e.checked):all(selector);
    host.controls.type.value='PROLONGED';host.controls.approved.value='no';host.controls.contribution.value='yes';host.controls.attended.value='yes';f.events.input();
    assert.equal(nodes['[data-review-day-fields]'].hidden,true);assert.equal(nodes['[data-contribution-fields]'].hidden,false);
    assert.match(contribution[0].error,/at least one/);assert.equal(host.controls.attended.value,'yes');assert.equal(host.controls.approved.value,'no');
    contribution[0].checked=true;f.events.input();assert.equal(contribution[0].error,'');
    f.click('data-draft');let payload=f.requests.at(-1).args[0].students[0].absence;
    assert.equal(payload.absenceReason,null);assert.deepEqual(Array.from(payload.contributionEvidence),['GUIDE_CONFIRMATION']);assert.equal(payload.verifiedContribution,true);assert.equal(payload.attended,true);
    f.requests.at(-1).failure({message:'Offline'});
    host.controls.approved.value='yes';reason.checked=true;contribution[1].checked=true;f.events.input();
    assert.equal(nodes['[data-review-day-fields]'].hidden,false);assert.equal(nodes['[data-other-contribution-label]'].hidden,false);assert.equal(nodes['[data-other-contribution]'].required,true);
    assert.equal(nodes['[data-absence-reason-label]'].textContent,'Reason for approved absence *');assert.equal(nodes['[data-other-evidence-option]'].textContent,'Other supporting absence evidence');
    nodes['[data-other-contribution]'].value='Prototype demonstration';host.controls.attended.value='no';f.events.input();
    f.click('data-draft');payload=f.requests.at(-1).args[0].students[0].absence;
    assert.equal(payload.absenceReason,'MEDICAL');assert.equal(payload.otherContributionEvidenceText,'Prototype demonstration');assert.equal(payload.attended,false);
    f.requests.at(-1).failure({message:'Offline'});
    host.controls.contribution.value='no';f.events.input();assert.equal(nodes['[data-contribution-fields]'].hidden,true);assert.equal(reason.checked,true);assert.equal(host.controls.approved.value,'yes');
    f.click('data-draft');payload=f.requests.at(-1).args[0].students[0].absence;
    assert.equal(payload.contributionEvidence.length,0);assert.equal(payload.otherContributionEvidenceText,null);
    assert.doesNotMatch(f.drawer.innerHTML,/Select suggestions or add your own details|data-reason-suggestion/);
    assert(f.drawer.innerHTML.indexOf('data-review-day-fields')<f.drawer.innerHTML.indexOf('data-fact="contribution"'));
    assert(f.drawer.innerHTML.indexOf('data-fact="attended"')<f.drawer.innerHTML.indexOf('data-fact="contribution"'));
  });
  for(const approved of [true,false])for(const contributed of [true,false])for(const attended of [true,false]) {
    test(`${key}: prolonged matrix approval=${approved} contribution=${contributed} attendance=${attended}`,()=>{
      const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',approved,contributed,attended);
      if(!attended)input.students[0].scores={};
      f.submit(input);const student=f.student(),a=student.assessment;
      const team=contributed?48:approved?null:0,individual=attended?32:approved?null:0;
      const status=!contributed?(approved?'ACADEMIC_DECISION_PENDING':'NON_PARTICIPATION'):attended?'COMPLETED':approved?'MAKEUP_PENDING':'ABSENT_UNAPPROVED';
      assert.equal(a.teamMark,team);assert.equal(a.individualMark,individual);assert.equal(a.status,status);
      assert.equal(a.teamState,team===null?'PENDING':'RESOLVED');assert.equal(a.individualState,individual===null?'PENDING':'RESOLVED');
      assert.equal(student.total,team===null || individual===null?null:team+individual);
      assert.equal(a.completed,student.total!==null);
      assert.deepEqual(Array.from(a.nextActions.assessmentComponents),approved && contributed && !attended?['individual']:[]);
      assert.equal(a.nextActions.academicDecision,approved && !contributed || !approved && !attended);
      assert.equal(f.load().evaluation.teamScores.T.marks,48);assert.equal(f.load().evaluation.students[1].total,79);
      const browser=browserFixture(true,key);browser.api.open('T1',browser.trigger);browser.requests[0].success(JSON.parse(JSON.stringify(f.load())));
      assert.equal(browser.drawer.innerHTML.includes('data-target="0"'),approved && contributed && !attended);
      assert.equal(browser.drawer.innerHTML.includes('data-record-decision="0"'),a.nextActions.academicDecision);
      if(approved && contributed && !attended){
        f.c.saveReviewTargetedAssessment(f.target({submit:true,scores:{I:{level:3,marks:33,remark:''}}}));
        assert.equal(f.student().assessment.status,'COMPLETED_AFTER_MAKEUP');assert.equal(f.student().total,81);
      }
    });
  }
  test(key+': common rubric unavailable is unassessed, distinct from academic-policy pending',()=>{
    const f=absenceFixture(key),config=f.load().config;
    config.criteria[0].maxMarks=85;config.criteria[1].maxMarks=15;
    const common={T:{level:5,marks:82.5,remark:''}},scores={I:{level:3,marks:12,remark:''}};
    const evaluate=(facts,team=common,individual=scores)=>f.c.reviewEffectiveStudent_(config,team,{register:'s1',scores:individual,assessment:{facts}});
    const present=absence('PROLONGED',false,true,true),complete=evaluate(present);
    assert.equal(complete.assessment.teamMark,82.5);assert.equal(complete.total,94.5);assert.equal(complete.assessment.status,'COMPLETED');
    const missingTeam=evaluate(present,{});assert.equal(missingTeam.assessment.teamState,'UNASSESSED');assert.equal(missingTeam.assessment.status,'INCOMPLETE');assert.equal(missingTeam.assessment.nextActions.academicDecision,false);
    for(const approved of [true,false]){
      const incomplete=evaluate(absence('PROLONGED',approved,true,true),common,{});
      assert.equal(incomplete.assessment.individualMark,null);assert.equal(incomplete.assessment.individualState,'UNASSESSED');assert.equal(incomplete.assessment.status,'INCOMPLETE');assert.equal(incomplete.assessment.completed,false);
      assert.equal(incomplete.assessment.nextActions.assessmentComponents.length,0);assert.equal(incomplete.assessment.nextActions.academicDecision,false);
    }
    const pending=evaluate(absence('PROLONGED',true,false,true),common,{});
    assert.equal(pending.assessment.teamState,'PENDING');assert.equal(pending.assessment.individualState,'UNASSESSED');assert.equal(pending.assessment.status,'ACADEMIC_DECISION_PENDING');
    const prior=evaluate(absence('PROLONGED',false,false,false));assert.equal(prior.assessment.teamMark,0);assert.equal(prior.assessment.individualMark,12);assert.equal(prior.total,12);
    const zero=evaluate(absence('PROLONGED',false,false,true),common,{I:{level:0,marks:0,remark:'No assessable evidence'}});
    assert.equal(zero.total,0);assert.equal(zero.assessment.completed,true);assert.equal(zero.assessment.individualState,'RESOLVED');
  });
  test(key+': prolonged structured validation rejects missing or contradictory verification data and preserves legacy history',()=>{
    const f=absenceFixture(key),valid=absence('PROLONGED',true,true,true);
    for(const bad of [{approved:null},{attended:null},{verifiedContribution:null},{contributionEvidence:[]},{contributionEvidence:['INVALID']},{contributionEvidence:['PROJECT_LOG','PROJECT_LOG']},{contributionEvidence:['OTHER']},{verifiedContribution:false},{absenceReason:null},{approved:false},{absenceReason:'OTHER_APPROVED'},{supportingEvidence:['OTHER']}]) {
      assert.throws(()=>f.c.reviewAbsenceFacts_({...valid,...bad},true));
    }
    const other=f.c.reviewAbsenceFacts_({...valid,contributionEvidence:['OTHER'],otherContributionEvidenceText:'Reviewed prototype'},true);assert.equal(other.otherContributionEvidenceText,'Reviewed prototype');
    const legacy={type:'PROLONGED',approved:true,verifiedContribution:true,attended:false,reason:'Guide confirmation. Medical reasons.'};
    assert.equal(f.c.reviewAbsenceFacts_(legacy).reason,legacy.reason);
    assert.throws(()=>f.c.reviewAbsenceFacts_(legacy,true),/contribution evidence/);
    const input=f.input();input.students[0].absence=valid;f.submit(input);
    const rows=f.tables[key==='review1'?'Review1Evaluations':'Review2Evaluations'];
    for(const row of rows.slice(1))if(row[2]==='s1'){const p=JSON.parse(row[8]);p.assessment.facts=legacy;row[8]=JSON.stringify(p);}
    const snapshot=JSON.stringify(rows),count=rows.length;
    f.load();assert.equal(JSON.stringify(rows),snapshot);
    f.c.recordReviewAbsence(f.target({reason:'',absence:{...valid,reason:''}}));
    assert.equal(f.student().assessment.facts.reason,legacy.reason);assert.equal(JSON.stringify(rows.slice(0,count)),snapshot);
  });
  test(key+': approval toggles preserve prior evidence revisions and unapproved absence needs no justification',()=>{
    const f=absenceFixture(key),input=f.input();
    input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:false};input.students[0].scores={};f.submit(input);
    assert.equal(f.student().assessment.teamMark,48);assert.equal(f.student().assessment.individualMark,0);assert.equal(f.student().total,48);
    assert.equal(f.student().assessment.status,'ABSENT_UNAPPROVED');
    assert.throws(()=>f.c.recordReviewAbsence(f.target({reason:'',absence:{type:'REVIEW_DAY_ABSENCE',approved:true,absenceReason:null}})),/reason/i);
    const approved={type:'REVIEW_DAY_ABSENCE',approved:true,absenceReason:'OTHER_APPROVED',otherReasonText:'Approved travel',supportingEvidence:['OTHER'],otherEvidenceText:'Permission letter'};
    f.c.recordReviewAbsence(f.target({reason:'',absence:approved}));
    assert.equal(f.student().assessment.teamMark,48);assert.equal(f.student().assessment.individualMark,null);assert.equal(f.student().total,null);
    const rows=f.tables[key==='review1'?'Review1Evaluations':'Review2Evaluations'],snapshot=JSON.stringify(rows),count=rows.length;
    f.c.recordReviewAbsence(f.target({reason:'',absence:{...approved,approved:false,otherReasonText:'',otherEvidenceText:'',reason:'x'.repeat(3000)}}));
    assert.equal(JSON.stringify(rows.slice(0,count)),snapshot);
    assert.equal(f.student().assessment.facts.absenceReason,null);assert.equal(f.student().assessment.facts.otherReasonText,null);assert.equal(f.student().assessment.facts.otherEvidenceText,null);
    assert.equal(f.student().assessment.facts.supportingEvidence.length,0);assert.equal(f.student().assessment.facts.reason,undefined);
    assert.equal(f.student().assessment.teamMark,48);assert.equal(f.student().total,48);assert.equal(f.student().assessment.status,'ABSENT_UNAPPROVED');
    assert.equal(f.student().assessment.decisions.at(-1).reason,'Review-day absence recorded as unapproved.');
  });
  test(key+': review-day controls serialize separate selections and conditionally require Other details',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    const host=f.absenceNodes().get('0'),query=host.querySelector.bind(host),all=host.querySelectorAll.bind(host);
    const nodes={'[data-review-day-fields]':{},'[data-legacy-evidence]':{},'[data-other-reason-label]':{},'[data-other-evidence-label]':{},'[data-other-reason]':{value:''},'[data-other-evidence]':{value:''}};
    const reason={value:'MEDICAL',checked:true,hasAttribute:name=>name==='data-primary-reason'};
    const evidence=['MEDICAL_DOCUMENT','APPROVAL_DOCUMENT','OTHER'].map(value=>({value,checked:value!=='OTHER',hasAttribute:()=>false}));
    host.querySelector=selector=>selector==='[data-primary-reason]:checked'?(reason.checked?reason:null):nodes[selector]||query(selector);
    host.querySelectorAll=selector=>selector==='[data-primary-reason],[data-supporting-evidence]'?[reason,...evidence]:selector==='[data-supporting-evidence]:checked'?evidence.filter(e=>e.checked):all(selector);
    host.controls.type.value='REVIEW_DAY_ABSENCE';host.controls.approved.value='yes';f.events.input();
    assert.equal(nodes['[data-legacy-evidence]'].hidden,true);
    assert.equal(nodes['[data-other-reason-label]'].hidden,true);assert.equal(nodes['[data-other-evidence-label]'].hidden,true);
    assert.equal(nodes['[data-other-reason]'].required,false);assert.equal(reason.required,true);
    f.click('data-draft');const payload=f.requests[1].args[0].students[0].absence;
    assert.equal(payload.absenceReason,'MEDICAL');assert.equal(payload.reason,'');
    assert.deepEqual(Array.from(payload.supportingEvidence),['MEDICAL_DOCUMENT','APPROVAL_DOCUMENT']);
    f.requests[1].failure({message:'Offline'});
    reason.value='OTHER_APPROVED';evidence[2].checked=true;f.events.input();
    assert.equal(nodes['[data-other-reason-label]'].hidden,false);assert.equal(nodes['[data-other-evidence-label]'].hidden,false);
    assert.equal(nodes['[data-other-reason]'].required,true);assert.equal(nodes['[data-other-evidence]'].required,true);
    reason.value='MEDICAL';evidence[2].checked=false;f.events.input();
    assert.equal(nodes['[data-other-reason]'].disabled,true);assert.equal(nodes['[data-other-evidence]'].disabled,true);
    assert.match(f.drawer.innerHTML,/Official approval\/permission provided/);
    host.controls.approved.value='no';f.events.input();
    assert.equal(evidence[1].disabled,true);assert.equal(evidence[1].checked,false);
    assert.equal(evidence[0].disabled,true);assert.equal(reason.required,false);assert.equal(reason.checked,false);
    assert.equal(nodes['[data-review-day-fields]'].hidden,true);
    host.controls.approved.value='';f.events.input();assert.equal(evidence[1].disabled,true);
    host.controls.approved.value='yes';f.events.input();assert.equal(evidence[1].disabled,false);assert.equal(evidence[1].checked,false);
    assert.equal(nodes['[data-review-day-fields]'].hidden,false);assert.equal(reason.required,true);assert.equal(reason.checked,false);
  });
  test(key+': structured absence reason validates independently of optional evidence and preserves history',()=>{
    const f=absenceFixture(key),input=f.input();
    const facts={type:'REVIEW_DAY_ABSENCE',approved:true,absenceReason:'MEDICAL',supportingEvidence:['MEDICAL_DOCUMENT','APPROVAL_DOCUMENT'],otherReasonText:null,otherEvidenceText:null};
    input.students[0].absence=facts;input.students[0].scores={};f.submit(input);
    assert.equal(f.student().assessment.status,'MAKEUP_PENDING');
    assert.equal(f.student().assessment.facts.reason,undefined);
    assert.deepEqual(Array.from(f.student().assessment.facts.supportingEvidence),facts.supportingEvidence);
    for(const bad of [{absenceReason:null},{absenceReason:['MEDICAL','PERSONAL_FAMILY']},{absenceReason:'APPROVAL_DOCUMENT'},{supportingEvidence:['INVALID']},{supportingEvidence:['MEDICAL_DOCUMENT','MEDICAL_DOCUMENT']},{absenceReason:'OTHER_APPROVED'},{supportingEvidence:['OTHER']}]) {
      assert.throws(()=>f.c.reviewAbsenceFacts_({...facts,...bad}),/reason|evidence/i);
    }
    const other=f.c.reviewAbsenceFacts_({...facts,absenceReason:'OTHER_APPROVED',otherReasonText:'Approved travel',supportingEvidence:['OTHER'],otherEvidenceText:'Travel letter'});
    assert.equal(other.otherReasonText,'Approved travel');assert.equal(other.otherEvidenceText,'Travel letter');
    assert.equal(f.c.reviewAbsenceFacts_({...facts,supportingEvidence:[]}).supportingEvidence.length,0);
    f.c.recordReviewAbsence(f.target({reason:'',absence:{...facts,approved:false}}));
    assert.equal(f.student().assessment.status,'ABSENT_UNAPPROVED');assert.equal(f.student().assessment.teamMark,48);assert.equal(f.student().total,48);
    assert.equal(f.student().assessment.facts.absenceReason,null);assert.equal(f.student().assessment.facts.supportingEvidence.length,0);
    const unapproved=absenceFixture(key),request=unapproved.input();request.students[0].absence={...facts,approved:false};request.students[0].scores={};
    unapproved.submit(request);assert.equal(unapproved.student().total,48);
    f.c.recordReviewAbsence(f.target({reason:'',absence:{...facts,absenceReason:'PERSONAL_FAMILY'}}));
    assert.equal(f.student().assessment.facts.absenceReason,'PERSONAL_FAMILY');
    f.c.saveReviewTargetedAssessment(f.target({submit:true,scores:{I:{level:3,marks:33,remark:''}}}));
    assert.equal(f.student().assessment.status,'COMPLETED_AFTER_MAKEUP');
    const legacy=absenceFixture(key),old=legacy.input();old.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);old.students[0].scores={};legacy.submit(old);
    const text=legacy.student().assessment.facts.reason;
    legacy.c.recordReviewAbsence(legacy.target({absence:{...facts,reason:'Replacement text'}}));
    assert.equal(legacy.student().assessment.facts.reason,text);
    assert.equal(legacy.student().assessment.facts.absenceReason,'MEDICAL');
  });
  test(key+': empty saved authorization retains policy makeup and individual-only targeted completion',()=>{
    const server=absenceFixture(key),input=server.input();
    input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);
    input.students[0].absence.reason='Assigned task evidence provided.';
    input.students[0].scores={};server.submit(input);
    // Legacy/corrected records may contain an empty list rather than an omitted property.
    for(const row of server.tables[key==='review1'?'Review1Evaluations':'Review2Evaluations'].slice(1)) {
      if(row[2]!=='s1')continue;
      const payload=JSON.parse(row[8]);payload.assessment.authorized=[];row[8]=JSON.stringify(payload);
    }
    server.publish();
    const before=server.load(),team=JSON.stringify(before.evaluation.teamScores),other=JSON.stringify(before.evaluation.students[1]);
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(before)));
    assert.match(f.drawer.innerHTML,/data-target="0">Conduct Makeup Assessment<\/button>/);
    assert(f.drawer.innerHTML.indexOf('data-target="0"')<f.drawer.innerHTML.indexOf('data-edit-absence="0"'));
    assert.doesNotMatch(f.drawer.innerHTML,/data-record-decision|data-components=/);
    assert.match(f.drawer.innerHTML,/Assigned task evidence provided\./);
    assert.doesNotMatch(f.drawer.innerHTML,/data-reason-suggestion/);
    f.click('data-target');
    assert.match(f.drawer.innerHTML,/data-criteria-group="team"[^>]* hidden/);
    assert(f.fields().filter(field=>field.dataset.owner!=='0').every(field=>field.controls['[data-marks]'].disabled));
    f.fields()[1].controls['[data-level]'].value='3';f.fields()[1].controls['[data-marks]'].value='33';f.events.input();
    f.click('data-target-submit');const request=f.requests[1];
    assert.equal(request.args[0].teamScores,undefined);
    assert.throws(()=>server.c.saveReviewTargetedAssessment({...request.args[0],scores:{I:{level:3,marks:99,remark:''}}}),/marks|range|Marks/);
    request.success(server.c.saveReviewTargetedAssessment(request.args[0]));
    const result=server.student();
    assert.equal(result.assessment.status,'COMPLETED_AFTER_MAKEUP');assert.equal(result.total,81);
    assert.equal(result.assessment.facts.reason,'Assigned task evidence provided.');
    assert.equal(JSON.stringify(server.load().evaluation.teamScores),team);
    assert.equal(JSON.stringify(server.load().evaluation.students[1]),other);
    assert.equal(result.needsPublication,true);
    assert.equal(result.assessment.decisions.at(-1).decision,'targetSubmit');
    assert.doesNotMatch(f.drawer.innerHTML,/data-target="0"/);
    server.publish('s1');assert.equal(server.student().needsPublication,false);
  });
  test(key+': seven absence cases derive effective marks and retain one common team score',()=>{
    const cases=[
      [null,48,32,'COMPLETED'],
      [absence('REVIEW_DAY_ABSENCE',true),48,null,'MAKEUP_PENDING'],
      [absence('REVIEW_DAY_ABSENCE',false),48,0,'ABSENT_UNAPPROVED'],
      [absence('PROLONGED',true,true,false),48,null,'MAKEUP_PENDING'],
      [absence('PROLONGED',true,false,false),null,null,'ACADEMIC_DECISION_PENDING'],
      [absence('PROLONGED',false,true,false),48,0,'ABSENT_UNAPPROVED'],
      [absence('PROLONGED',false,false,false),0,0,'NON_PARTICIPATION']
    ];
    for(const [facts,team,individual,status] of cases){
      const f=absenceFixture(key),input=f.input();
      if(facts){input.students[0].absence=facts;input.students[0].scores={};}
      f.submit(input);const s=f.student(),a=s.assessment;
      assert.equal(a.teamMark,team);assert.equal(a.individualMark,individual);assert.equal(a.status,status);
      assert.equal(s.total,team===null||individual===null?null:team+individual);
      if(s.total===null)assert.equal(s.weighted,null);
      assert.equal(f.load().evaluation.teamScores.T.marks,48);
      assert.equal(f.load().evaluation.students[1].total,79);
      assert.equal(a.effectiveScores.T.marks,team);assert.equal(a.effectiveScores.I.marks,individual);
      assert.equal(a.facts.type,facts?facts.type:'NORMAL');
    }
  });
  test(key+': prolonged attendance enables assessment; later classification preserves legitimate individual evidence',()=>{
    for(const approved of [true,false])for(const contribution of [true,false]){
      const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',approved,contribution,true);
      f.submit(input);assert.equal(f.student().assessment.individualMark,32);
      const before=JSON.stringify(f.student().scores);
      f.c.recordReviewAbsence(f.target({absence:absence('PROLONGED',false,false,false)}));
      assert.equal(f.student().assessment.teamMark,0);assert.equal(f.student().assessment.individualMark,32);
      assert.equal(JSON.stringify(f.student().scores),before);assert.equal(f.student().total,32);
      assert.equal(f.student().assessment.status,'NON_PARTICIPATION');
    }
  });
  test(key+': documentary-only entries, missing exception notes and manual assessability cannot override attendance',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);
    input.students[0].individualAssessability=true;
    assert.throws(()=>f.submit(input),/Absent students/);
    input.students[0].scores={};input.students[0].absence.reason='';assert.throws(()=>f.submit(input),/reason/);
    input.students[0].absence=absence('PROLONGED',true,true,undefined);assert.throws(()=>f.submit(input),/attendance/);
    input.students[0].absence=absence('REVIEW_DAY_ABSENCE',false);input.students[0].total=100;input.students[0].assessment={individualMark:99};
    f.submit(input);assert.equal(f.student().assessment.individualMark,0);assert.equal(f.student().individualAssessability,undefined);
  });
  test(key+': approved makeup drafts remain pending and completed makeup only changes its student',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};f.submit(input);
    const before=JSON.stringify(f.load().evaluation.students[1]),team=JSON.stringify(f.load().evaluation.teamScores);
    const draft=f.target({scores:{I:{level:3,marks:33,remark:''}},submit:false});
    f.c.saveReviewTargetedAssessment(draft);assert.equal(f.student().total,null);
    assert.equal(f.student().assessment.targetDraft.individual.I.marks,33);
    const rows=f.tables[key==='review1'?'Review1Evaluations':'Review2Evaluations'].length;
    f.c.saveReviewTargetedAssessment(draft);assert.equal(f.tables[key==='review1'?'Review1Evaluations':'Review2Evaluations'].length,rows);
    f.c.saveReviewTargetedAssessment(f.target({scores:{I:{level:3,marks:33,remark:''}},submit:true}));
    assert.equal(f.student().assessment.status,'COMPLETED_AFTER_MAKEUP');assert.equal(f.student().total,81);
    assert.equal(JSON.stringify(f.load().evaluation.students[1]),before);assert.equal(JSON.stringify(f.load().evaluation.teamScores),team);
    assert.throws(()=>f.c.saveReviewTargetedAssessment(f.target({scores:{I:{level:3,marks:32,remark:''}},submit:true})),/authorized/);
    const audit=f.student().assessment.decisions.at(-1);assert.equal(audit.reviewer,'reviewer@x');assert.equal(audit.previousStatus,'MAKEUP_PENDING');assert.equal(audit.resultingStatus,'COMPLETED_AFTER_MAKEUP');assert(Number.isFinite(Date.parse(audit.at)));
  });
  test(key+': academic team decisions, deferment, other decisions and alternative assessment retain pending semantics',()=>{
    for(const decision of ['TEAM_MARK_APPLICABLE','TEAM_MARK_NOT_APPLICABLE']){
      const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',true,false,true);f.submit(input);
      assert.equal(f.student().total,null);
      assert.throws(()=>f.c.recordReviewAcademicDecision(f.target({decision,reason:''})),/reason/);
      f.c.recordReviewAcademicDecision(f.target({decision}));
      assert.equal(f.student().assessment.teamMark,decision==='TEAM_MARK_APPLICABLE'?48:0);
      assert.equal(f.student().assessment.individualMark,32);assert.equal(f.load().evaluation.teamScores.T.marks,48);
    }
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',true,false,false);input.students[0].scores={};f.submit(input);
    for(const decision of ['OTHER','DEFERRED_ASSESSMENT']){f.c.recordReviewAcademicDecision(f.target({decision}));assert.equal(f.student().total,null);}
    assert.throws(()=>f.c.saveReviewTargetedAssessment(f.target({submit:true,scores:{}})),/authorized/);
    f.c.recordReviewAcademicDecision(f.target({decision:'MAKEUP_ALTERNATIVE_ASSESSMENT',components:['team','individual']}));
    f.c.saveReviewTargetedAssessment(f.target({submit:true,teamScores:{T:{level:2,marks:40,remark:''}},scores:{I:{level:2,marks:26,remark:''}}}));
    assert.equal(f.student().total,66);assert.equal(f.student().assessment.status,'COMPLETED_AFTER_MAKEUP');assert.equal(f.load().evaluation.teamScores.T.marks,48);
    assert.equal(f.student().assessment.effectiveScores.T.marks,40);
  });
  test(key+': unapproved absence has no automatic makeup and cannot rewrite the common team score',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',false);input.students[0].scores={};f.submit(input);
    assert.throws(()=>f.c.saveReviewTargetedAssessment(f.target({submit:true,scores:{I:{level:3,marks:32,remark:''}}})),/authorized/);
    assert.throws(()=>f.c.recordReviewAcademicDecision(f.target({decision:'TEAM_MARK_NOT_APPLICABLE'})),/pending team/);
    f.c.recordReviewAcademicDecision(f.target({decision:'MAKEUP_ALTERNATIVE_ASSESSMENT',components:['individual']}));
    assert.equal(f.student().assessment.individualMark,null);
    assert.throws(()=>f.c.saveReviewTargetedAssessment(f.target({submit:true,teamScores:{T:{level:0,marks:0,remark:'x'}},scores:{I:{level:3,marks:32,remark:''}}})),/authorized components/);
  });
  test(key+': academic writes reject coordinator and unrelated users, stale versions and roster changes',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};f.submit(input);
    const request=f.target({submit:true,scores:{I:{level:3,marks:32,remark:''}}});
    for(const actor of ['coord@x','one@x','outsider@x']){f.actor(actor);assert.throws(()=>f.c.saveReviewTargetedAssessment(request),/assigned reviewer/);assert.throws(()=>f.c.recordReviewAcademicDecision({...request,decision:'OTHER'}),/assigned reviewer/);}
    f.actor('reviewer@x');f.c.recordReviewAcademicDecision(f.target({decision:'OTHER'}));assert.throws(()=>f.c.saveReviewTargetedAssessment(request),/changed/);
    const current=f.target({submit:true,scores:request.scores});f.students[0].name='Changed';assert.throws(()=>f.c.saveReviewTargetedAssessment(current),/Roster|Complete Review 1/);
  });
  test(key+': targeted publication retains prior student snapshots and all unaffected results',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};f.submit(input);f.publish();
    f.actor('two@x');const other=JSON.stringify(f.c.loadPublishedReviewEvaluation_(key));f.actor('reviewer@x');
    f.c.saveReviewTargetedAssessment(f.target({submit:true,scores:{I:{level:3,marks:33,remark:''}}}));
    f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,null);
    f.actor('two@x');assert.equal(JSON.stringify(f.c.loadPublishedReviewEvaluation_(key)),other);f.actor('reviewer@x');
    f.publish('s1');f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,81);
    f.actor('two@x');assert.equal(JSON.stringify(f.c.loadPublishedReviewEvaluation_(key)),other);
    f.actor('coord@x');const revision=f.c.review1Latest_(f.c.review1Records_(key).records,'T1').revision;f.c.review1Write_('reopen',f.staffInput(revision,'Explicit administrative reopen'),key);
    f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key),null);
  });
  test(key+': reason-only corrections preserve resolved team decisions, history and teammates',()=>{
    for(const decision of ['TEAM_MARK_APPLICABLE','TEAM_MARK_NOT_APPLICABLE']){
      const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',true,false,true);f.submit(input);
      f.c.recordReviewAcademicDecision(f.target({decision}));f.publish();
      const before=JSON.parse(JSON.stringify(f.student())),teammate=JSON.stringify(f.load().evaluation.students[1]);
      const table=f.tables[key==='review1'?'Review1Evaluations':'Review2Evaluations'],history=JSON.stringify(table);
      const request=f.target({absence:{...before.assessment.facts,supportingEvidence:['OTHER'],otherEvidenceText:'Updated evidence note only'}});
      f.c.recordReviewAbsence(request);const after=f.student();
      assert.equal(after.total,before.total);assert.equal(after.weighted,before.weighted);assert.equal(after.assessment.status,before.assessment.status);
      assert.equal(after.assessment.teamDecision,decision);assert.equal(after.assessment.teamMark,before.assessment.teamMark);
      assert.equal(JSON.stringify(after.scores),JSON.stringify(before.scores));assert.equal(JSON.stringify(f.load().evaluation.students[1]),teammate);
      assert.equal(JSON.stringify(table.slice(0,-2)),history);assert.equal(after.assessment.decisions.length,before.assessment.decisions.length+1);
      assert.equal(after.assessment.facts.reason,before.assessment.facts.reason);assert.equal(after.assessment.facts.otherEvidenceText,'Updated evidence note only');assert.equal(after.needsPublication,true);
      const rows=table.length;f.c.recordReviewAbsence(request);assert.equal(table.length,rows);
      f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,before.total);
    }
  });
  test(key+': corrections retain deferment, authorizations, draft evidence and completed alternative assessments',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',true,false,false);input.students[0].scores={};f.submit(input);
    const correct=()=>f.c.recordReviewAbsence(f.target({absence:{...f.student().assessment.facts,reason:'Additional supporting evidence'}}));
    f.c.recordReviewAcademicDecision(f.target({decision:'DEFERRED_ASSESSMENT'}));correct();
    assert.equal(f.student().total,null);assert.equal(f.student().assessment.authorized.length,0);assert.equal(f.student().assessment.individualPending,true);
    assert.throws(()=>f.c.saveReviewTargetedAssessment(f.target({submit:true,scores:{I:{level:3,marks:32,remark:''}}})),/authorized/);
    f.c.recordReviewAcademicDecision(f.target({decision:'MAKEUP_ALTERNATIVE_ASSESSMENT',components:['team','individual']}));
    const scores={teamScores:{T:{level:2,marks:40,remark:''}},scores:{I:{level:2,marks:26,remark:''}}};
    f.c.saveReviewTargetedAssessment(f.target({...scores,submit:false}));const draft=JSON.stringify(f.student().assessment.targetDraft);correct();
    assert.equal(JSON.stringify(f.student().assessment.targetDraft),draft);assert.deepEqual(Array.from(f.student().assessment.authorized),['team','individual']);assert.equal(f.student().total,null);
    f.c.saveReviewTargetedAssessment(f.target({...scores,submit:true}));const before=JSON.parse(JSON.stringify(f.student()));correct();
    assert.equal(f.student().total,66);assert.equal(f.student().assessment.status,'COMPLETED_AFTER_MAKEUP');assert.equal(f.student().assessment.makeupCompleted,true);
    assert.equal(JSON.stringify(f.student().assessment.alternativeTeamScores),JSON.stringify(before.assessment.alternativeTeamScores));assert.equal(JSON.stringify(f.student().scores),JSON.stringify(before.scores));
  });
  test(key+': conflicting fact corrections cannot silently replace an academic team decision',()=>{
    const f=absenceFixture(key),input=f.input();input.students[0].absence=absence('PROLONGED',true,false,true);f.submit(input);
    f.c.recordReviewAcademicDecision(f.target({decision:'TEAM_MARK_NOT_APPLICABLE'}));const before=JSON.stringify(f.tables);
    assert.throws(()=>f.c.recordReviewAbsence(f.target({absence:absence('REVIEW_DAY_ABSENCE',true)})),/conflict.*existing team assessment decision/);
    assert.equal(JSON.stringify(f.tables),before);assert.equal(f.student().assessment.teamMark,0);
  });
}

test('valid Review 1 submission with documented pending exceptions permits Review 2 but not individual completion',()=>{
  for(const facts of [absence('REVIEW_DAY_ABSENCE',true),absence('PROLONGED',true,false,false)]){
    const f=absenceFixture(),input=f.input();input.students[0].absence=facts;input.students[0].scores={};f.submit(input);
    assert.equal(f.progress().recorded,true);assert.equal(f.progress().completed,false);assert.equal(f.progress().markedStudents,1);
    f.today(20030);const r2=f.c.getReview2Evaluation('T1');assert.equal(r2.config.key,'review2');
    f.c.submitReview2Evaluation(f.input(r2));
    assert.equal(f.progress().markedStudents,1);assert.equal(f.student().total,null);
  }
  const f=fixture(),input=f.input();input.students[0].scores={};f.c.saveReview1EvaluationDraft(input);f.today(20030);
  assert.throws(()=>f.c.getReview2Evaluation('T1'),/Complete Review 1/);
  input.revision=1;input.requestId=crypto.randomUUID();assert.throws(()=>f.c.submitReview1Evaluation(input),/required/);
});

test('Review 2 uses independent rubric, maximum, descriptors, date, weight and history; legacy Review 1 bytes stay untouched',()=>{
  const f=fixture();f.c.submitReview1Evaluation(f.input());f.actor('coord@x');f.c.publishReview1Evaluation(f.staffInput(1));f.actor('reviewer@x');
  // Model genuine pre-feature rows, with no absence or publication metadata.
  f.tables.Review1Evaluations.slice(1).forEach(row=>{const p=JSON.parse(row[8]);delete p.assessment;delete p.needsPublication;delete p.publishedStudents;row[8]=JSON.stringify(p);});
  const before=JSON.stringify(f.tables.Review1Evaluations),loaded=f.load();assert.equal(loaded.evaluation.students[0].assessment.classification,'NORMAL');
  f.reviews[1].rubric=[{pi:'R2T',type:'Team',name:'Implementation',maxMarks:80,co:'CO3',descriptors:Array(6).fill('Review 2 implementation')},{pi:'R2I',type:'Individual',name:'Defence',maxMarks:20,co:'CO4',descriptors:Array(6).fill('Review 2 defence')}];
  f.today(20022);assert.throws(()=>f.c.getReview2Evaluation('T1'),/Opens/);f.today(20023);
  const d=f.c.getReview2Evaluation('T1');assert.equal(d.config.weight,.3);assert.equal(d.config.criteria[0].pi,'R2T');assert.equal(d.config.criteria[0].descriptors[0],'Review 2 implementation');
  const input={...f.staffInput(0),token:d.token,teamScores:{R2T:{level:3,marks:64,remark:''}},students:f.students.map(s=>({register:s.regNo.toLowerCase(),scores:{R2I:{level:3,marks:16,remark:''}}}))};
  f.c.submitReview2Evaluation(input);assert.equal(f.c.getReview2Evaluation('T1').evaluation.students[0].weighted,24);
  f.actor('coord@x');f.c.publishReview2Evaluation(f.staffInput(1));f.actor('one@x');
  assert.equal(f.c.loadPublishedReview2Evaluation().total,80);assert.equal(f.c.loadPublishedReview1Evaluation().weighted,16);
  assert.equal(JSON.stringify(f.tables.Review1Evaluations),before);
  assert.equal(f.tables.Review2Evaluations.length,5);
});

test('Review 2 setup validation is read-only and repeatable, and rejects wrong history headers',()=>{
  const f=absenceFixture('review2'),before=JSON.stringify(f.tables);
  f.load();f.load();assert.equal(JSON.stringify(f.tables),before);
  f.tables.Review2Evaluations[0][2]='Wrong';assert.throws(f.load,/Review2Evaluations headers/);
  assert.equal(f.tables.Review2Evaluations[0][2],'Wrong');
});

test('blank legacy marks display pending and never imply absence or mutate historical zero totals',()=>{
  const f=fixture(),input=f.input();input.students[0].scores={};f.c.saveReview1EvaluationDraft(input);
  f.tables.Review1Evaluations.slice(1).forEach(row=>{const p=JSON.parse(row[8]);delete p.assessment;delete p.needsPublication;if(row[2]==='s1'){p.total=0;p.weighted=0;}row[8]=JSON.stringify(p);});
  const before=JSON.stringify(f.tables.Review1Evaluations),s=f.load().evaluation.students[0];
  assert.equal(s.total,null);assert.equal(s.weighted,null);assert.equal(s.assessment.classification,'NORMAL');assert.equal(s.assessment.individualMark,null);
  assert.equal(JSON.stringify(f.tables.Review1Evaluations),before);
});

test('absence controls reveal facts conditionally and submit pending without individual rubric entries',()=>{
  const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const first=f.absenceNodes().get('0');assert.equal(first.nodes['[data-exception-fields]'].hidden,true);
  for(const field of f.fields()){field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value=field.dataset.owner==='team'?'48':'32';}
  first.controls.type.value='REVIEW_DAY_ABSENCE';first.controls.approved.value='yes';first.controls.reason.value='Approved absence';f.events.input();
  assert.equal(first.nodes['[data-exception-fields]'].hidden,false);assert.equal(first.nodes['[data-prolonged-fields]'].hidden,true);
  assert(f.fields()[1].controls['[data-marks]'].disabled);
  assert.equal(f.drawer.querySelector('[data-individual-mark="0"]').textContent,'Pending / 40');
  f.click('data-submit');const request=f.requests[1];assert.equal(request.name,'submitReview1Evaluation');
  assert.equal(request.args[0].students[0].absence.type,'REVIEW_DAY_ABSENCE');assert.deepEqual(Object.keys(request.args[0].students[0].scores),[]);
  assert.doesNotMatch(JSON.stringify(request.args[0]),/assessability|CanBeIndividuallyAssessed/);
  request.failure({message:'Offline'});assert.equal(first.controls.type.disabled,false);
  first.controls.type.value='PROLONGED';first.controls.contribution.value='yes';first.controls.attended.value='yes';f.events.input();
  assert.equal(first.nodes['[data-prolonged-fields]'].hidden,false);assert.equal(f.fields()[1].controls['[data-marks]'].disabled,false);
});

for(const key of ['review1','review2'])test(key+': blank approved-absence rubric shows pending and permits valid team submission',()=>{
  const server=absenceFixture(key),f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
  const host=f.absenceNodes().get('0'),field=f.fields()[1];
  host.controls.type.value='REVIEW_DAY_ABSENCE';host.controls.approved.value='yes';host.controls.reason.value='Medical reasons.';f.events.input();
  assert.equal(field.querySelector('[data-descriptor]').textContent,'Individual assessment pending makeup.');
  assert.equal(field.querySelector('[data-range]').textContent,'Pending');
  assert.equal(field.querySelector('[data-awarded-total]').textContent,'Pending');
  assert.doesNotMatch(field.querySelector('[data-feedback-options]').innerHTML,/Select a level/);
  assert.equal(field.controls['[data-level]'].disabled,true);
  host.controls.type.value='NORMAL';f.events.input();
  assert.equal(field.querySelector('[data-descriptor]').textContent,'Choose a level to see its rubric descriptor.');
  assert.match(field.querySelector('[data-feedback-options]').innerHTML,/Select a level/);
  assert.equal(field.controls['[data-level]'].disabled,false);
  host.controls.type.value='REVIEW_DAY_ABSENCE';f.events.input();
  f.click('data-submit');assert.equal(f.requests.length,1); // The common team rubric is still required.
  f.fields()[0].controls['[data-level]'].value='3';f.fields()[0].controls['[data-marks]'].value='48';
  f.click('data-submit');assert.equal(f.requests.length,1); // The normal teammate still needs an assessment.
  f.fields()[2].controls['[data-level]'].value='3';f.fields()[2].controls['[data-marks]'].value='32';
  f.click('data-submit');assert.equal(f.requests.length,2);
  assert.equal(f.requests[1].name,key==='review1'?'submitReview1Evaluation':'submitReview2Evaluation');
  const result=server.submit(f.requests[1].args[0]);f.requests[1].success(result);
  assert.equal(server.student().assessment.individualMark,null);assert.equal(server.student().total,null);
  assert.equal(server.student().assessment.status,'MAKEUP_PENDING');assert.equal(server.student().assessment.teamMark,48);
  assert.equal(server.load().evaluation.students[1].total,80);
  assert.equal(f.fields()[1].querySelector('[data-descriptor]').textContent,'Individual assessment pending makeup.');
  f.click('data-target');
  assert.equal(f.fields()[1].controls['[data-level]'].disabled,false);
  assert.equal(f.fields()[1].querySelector('[data-descriptor]').textContent,'Choose a level to see its rubric descriptor.');
  assert.match(f.fields()[1].querySelector('[data-feedback-options]').innerHTML,/Select a level/);
});

for(const key of ['review1','review2']) {
  test(key+': saved absence displays stored facts and separate configured assessment values',()=>{
    const server=absenceFixture(key),input=server.input();
    input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);
    input.students[0].absence.reason='Medical document\nApproved <record>';
    input.students[0].scores={};server.submit(input);
    const data=JSON.parse(JSON.stringify(server.load()));
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(data);
    assert.match(f.drawer.innerHTML,/<div data-absence-editor hidden>/);
    assert.match(f.drawer.innerHTML,/<dt>Absence type<\/dt><dd>Review-Day Absence<\/dd>/);
    assert.match(f.drawer.innerHTML,/<dt>Approval status<\/dt><dd>Approved<\/dd>/);
    assert.match(f.drawer.innerHTML,/Medical document\nApproved &lt;record&gt;/);
    assert.match(f.drawer.innerHTML,/>Edit absence details<\/button>/);
    assert.match(f.drawer.innerHTML,/>Conduct Makeup Assessment<\/button>/);
    assert.doesNotMatch(f.drawer.innerHTML,/data-record-decision|data-components=/);
    const a=data.evaluation.students[0].assessment;
    const maxima=type=>data.config.criteria.filter(c=>c.type===type).reduce((sum,c)=>sum+c.maxMarks,0);
    assert.equal(f.drawer.querySelector('[data-team-mark]').textContent,a.teamMark+' / '+maxima('Team'));
    assert.equal(f.drawer.querySelector('[data-individual-mark="0"]').textContent,'Pending / '+maxima('Individual'));
    assert.equal(f.drawer.querySelector('[data-assessment-status="0"]').textContent,'Assessment status: Makeup Pending');
    f.click('data-edit-absence');
    assert.match(f.drawer.innerHTML,/<div data-absence-editor>/);
    assert.doesNotMatch(f.drawer.innerHTML,/data-target="0"/);
    f.click('data-cancel-absence');assert.match(f.drawer.innerHTML,/<div data-absence-editor hidden>/);
  });
}

test('submitted and published absence details require explicit correction editing; cancel discards changes',()=>{
  for(const key of ['review1','review2'])for(const published of [false,true]){
    const server=absenceFixture(key),input=server.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};server.submit(input);if(published)server.publish();
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    let host=f.absenceNodes().get('0');assert(Object.values(host.controls).every(c=>c.disabled));assert(host.pills.every(p=>p.disabled));
    const reason=host.controls.reason.value;
    assert.doesNotMatch(f.drawer.innerHTML,/data-record-absence|data-cancel-absence/);assert.equal(f.requests.length,1);
    f.click('data-edit-absence');host=f.absenceNodes().get('0');assert(Object.values(host.controls).every(c=>!c.disabled));assert(host.pills.filter(p=>!p.hidden).every(p=>!p.disabled));
    assert(Object.values(f.absenceNodes().get('1').controls).every(c=>c.disabled));assert(f.fields().every(field=>field.controls['[data-marks]'].disabled));
    host.controls.reason.value='Unsaved correction';f.events.input();f.discard(false);f.click('data-cancel-absence');assert.equal(f.absenceNodes().get('0').controls.reason.value,'Unsaved correction');
    f.discard(true);f.click('data-cancel-absence');host=f.absenceNodes().get('0');assert.equal(host.controls.reason.value,reason);assert(host.pills.every(p=>p.disabled));assert(Object.values(host.controls).every(c=>c.disabled));assert.equal(f.requests.length,1);
  }
});

test('completed Normal students have no absence correction or academic decision actions',()=>{
  for(const key of ['review1','review2'])for(const published of [false,true]){
    const server=absenceFixture(key);server.submit(server.input());if(published)server.publish();
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.doesNotMatch(f.drawer.innerHTML,/data-edit-absence|data-record-absence|data-cancel-absence|data-decision=|data-components=|data-record-decision|data-target=/);
    assert(Object.values(f.absenceNodes().get('0').controls).every(c=>c.disabled));
  }
});

test('absence correction actions render only the active edit or save/cancel controls',()=>{
  const server=absenceFixture(),input=server.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};server.submit(input);
  const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
  assert.match(f.drawer.innerHTML,/data-edit-absence="0"/);assert.doesNotMatch(f.drawer.innerHTML,/data-record-absence|data-cancel-absence/);
  f.click('data-edit-absence');assert.doesNotMatch(f.drawer.innerHTML,/data-edit-absence/);assert.match(f.drawer.innerHTML,/data-record-absence="0"/);assert.match(f.drawer.innerHTML,/data-cancel-absence="0"/);
  f.click('data-cancel-absence');assert.match(f.drawer.innerHTML,/data-edit-absence="0"/);assert.doesNotMatch(f.drawer.innerHTML,/data-record-absence|data-cancel-absence/);
  assert.match(f.context.getReview1EvaluationStyles_(),/\.review1-drawer \[hidden\] \{ display:none !important; \}/);
});

test('absence correction saves relock the fields and failed saves preserve edit mode and retry identity',()=>{
  const server=absenceFixture(),input=server.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};server.submit(input);
  const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));f.click('data-edit-absence');
  const host=f.absenceNodes().get('0');host.controls.reason.value='Updated medical evidence';f.events.input();
  assert.doesNotMatch(f.drawer.innerHTML,/data-record-decision/);
  f.click('data-record-absence');assert.equal(f.requests[1].name,'recordReviewAbsence');assert(Object.values(host.controls).every(c=>c.disabled));
  f.requests[1].failure({message:'Offline'});assert.equal(host.controls.reason.value,'Updated medical evidence');assert(Object.values(host.controls).every(c=>!c.disabled));
  f.click('data-record-absence');assert.equal(f.requests[2].args[0].requestId,f.requests[1].args[0].requestId);
  f.requests[2].success(server.c.recordReviewAbsence(f.requests[2].args[0]));
  const saved=f.absenceNodes().get('0');assert.equal(saved.controls.reason.value,'Updated medical evidence');assert(Object.values(saved.controls).every(c=>c.disabled));assert(saved.pills.every(p=>p.disabled));
});

test('submitted pending reviews immediately hide completed students and locked criteria',()=>{
  for(const key of ['review1','review2'])for(const index of [0,1]) {
    const server=absenceFixture(key),input=server.input();
    input.students[index].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[index].scores={};server.submit(input);
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.match(f.drawer.innerHTML,/data-criteria-group="team"[^>]* hidden/);
    assert.match(f.drawer.innerHTML,new RegExp('data-student-group="'+index+'"[^>]* open'));
    assert.match(f.drawer.innerHTML,new RegExp('data-student-group="'+(1-index)+'"[^>]* hidden'));
    assert.match(f.drawer.innerHTML,new RegExp('<li hidden>[^]*?data-student-score="'+(1-index)+'"'));
    assert.match(f.drawer.innerHTML,/data-owner="team" hidden/);
    assert.match(f.drawer.innerHTML,new RegExp('data-owner="'+index+'" hidden'));
    assert.match(f.drawer.innerHTML,new RegExp('data-target="'+index+'"'));
    assert.doesNotMatch(f.drawer.innerHTML,new RegExp('data-absence="'+index+'" hidden'));
  }
});

for(const key of ['review1','review2']) {
  test(key+': absence actions follow policy and offer only eligible decision components',()=>{
    for(const [facts,makeup,decision,components] of [
      [absence('REVIEW_DAY_ABSENCE',true),true,false,false],
      [absence('PROLONGED',true,true,false),true,false,false],
      [absence('REVIEW_DAY_ABSENCE',false),false,true,false],
      [absence('PROLONGED',true,false,false),false,true,true],
      [absence('PROLONGED',true,false,true),false,true,false]
    ]) {
      const server=absenceFixture(key),input=server.input();input.students[0].absence=facts;
      if(!facts.attended)input.students[0].scores={};server.submit(input);
      const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
      const html=f.drawer.innerHTML;
      assert.equal(html.includes('Conduct Makeup Assessment'),makeup);
      assert.equal(html.includes('data-record-decision='),decision);
      assert.equal(html.includes('data-components='),components);
      assert.equal(html.includes('TEAM_MARK_APPLICABLE'),facts.type==='PROLONGED' && !facts.verifiedContribution);
      if(components){
        const choice={hidden:false},query=f.drawer.querySelector.bind(f.drawer);
        f.drawer.querySelector=selector=>selector==='[data-component-choice="0"]'?choice:query(selector);
        const target={hasAttribute:name=>name==='data-decision',dataset:{decision:'0'},value:'TEAM_MARK_APPLICABLE'};
        f.events.change({target});assert.equal(choice.hidden,true);
        target.value='MAKEUP_ALTERNATIVE_ASSESSMENT';f.events.change({target});assert.equal(choice.hidden,false);
      }
      if(decision && !components){
        const query=f.drawer.querySelector.bind(f.drawer);
        f.drawer.querySelector=selector=>selector==='[data-decision="0"]'?{value:'MAKEUP_ALTERNATIVE_ASSESSMENT'}:selector==='[data-components="0"]'?null:query(selector);
        f.click('data-record-decision');
        assert.deepEqual(Array.from(f.requests[1].args[0].components),facts.attended?['team']:['individual']);
      }
    }
  });
}

test('targeted browser assessment enables only its authorized student and preserves failed entries for retry',()=>{
  const server=absenceFixture(),input=server.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};server.submit(input);
  const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
  assert(f.fields().every(field=>field.controls['[data-marks]'].disabled));f.click('data-target');
  assert(f.fields()[0].controls['[data-marks]'].disabled);assert.equal(f.fields()[1].controls['[data-marks]'].disabled,false);assert(f.fields()[2].controls['[data-marks]'].disabled);
  assert.match(f.drawer.innerHTML,/data-criteria-group="team"[^>]* hidden/);
  assert.match(f.drawer.innerHTML,/data-criteria-group="individual"[^>]* open/);
  assert.match(f.drawer.innerHTML,/data-student-group="1"[^>]* hidden/);
  assert.match(f.drawer.innerHTML,/data-absence="0" hidden/);
  assert.match(f.drawer.innerHTML,/Pending Assessment/);
  f.fields()[1].controls['[data-level]'].value='3';f.fields()[1].controls['[data-marks]'].value='33';f.events.input();
  f.click('data-target-submit');assert.equal(f.requests[1].name,'saveReviewTargetedAssessment');
  assert.equal(f.requests[1].args[0].student,'s1');assert.equal(f.requests[1].args[0].teamScores,undefined);
  f.requests[1].failure({message:'Offline'});assert.equal(f.fields()[1].controls['[data-marks]'].value,'33');assert.equal(f.fields()[1].controls['[data-marks]'].disabled,false);
  f.click('data-target-submit');assert.equal(f.requests[2].args[0].requestId,f.requests[1].args[0].requestId);
  f.requests[2].success(server.c.saveReviewTargetedAssessment(f.requests[2].args[0]));
  assert.equal(server.student().total,81);assert.match(f.status.textContent,/saved/);
});

test('Review 2 browser selects its own endpoints and labels',()=>{
  const f=browserFixture(true,'review2');f.api.open('T1',f.trigger);assert.equal(f.requests[0].name,'getReview2Evaluation');
  f.data.config.key='review2';f.data.config.label='Review 2';f.requests[0].success(f.data);
  assert.match(f.drawer.innerHTML,/<span class="review1-header-review">Review 2<\/span>/);f.click('data-draft');assert.equal(f.requests[1].name,'saveReview2EvaluationDraft');
});

test('pending effective criterion marks remain null in published APIs, including policy zeros',()=>{
  for(const approved of [true,false]){
    const f=absenceFixture(),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',approved);input.students[0].scores={};f.submit(input);f.publish();f.actor('one@x');
    const result=f.c.loadPublishedReview1Evaluation();assert.equal(result.scores.I.marks,approved?null:0);assert.equal(result.scores.T.marks,48);
  }
});

test('documented approved absence without contribution can preserve unresolved individual assessment even if present',()=>{
  const f=absenceFixture(),input=f.input();input.students[0].absence=absence('PROLONGED',true,false,true);input.students[0].scores={};f.submit(input);
  assert.equal(f.student().assessment.status,'ACADEMIC_DECISION_PENDING');assert.equal(f.student().total,null);assert.equal(f.progress().recorded,true);
});

test('review refresh retains entries on failure, deduplicates requests and settles loading on retry and close',()=>{
  const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  f.fields()[0].controls['[data-level]'].value='3';f.fields()[0].controls['[data-marks]'].value='48';f.events.input();
  const field=f.fields()[0];f.api.open('T1',f.trigger);f.api.open('T1',f.trigger);f.click('data-draft');assert.equal(f.requests.length,2);
  assert.equal(f.loading.begun,1);f.requests[1].failure({message:'Offline'});assert.equal(f.loading.settled,1);
  assert.equal(f.fields()[0],field);assert.equal(field.controls['[data-marks]'].value,'48');assert.match(f.status.textContent,/retained/);
  f.api.open('T1',f.trigger);f.requests[2].success(f.data);assert.equal(f.loading.settled,2);
  f.api.open('T1',f.trigger);f.click('data-close');assert.equal(f.loading.settled,3);
  f.requests[3].success(f.data);assert.equal(f.drawer.open,false);assert.equal(f.loading.settled,3);
});

test('student result refresh preserves published content on failure and renders pending without zero coercion',()=>{
  const f=browserFixture(true),host={innerHTML:'Existing published result',children:[],appendChild(node){this.children.push(node);}};
  f.context.document.getElementById=id=>id==='studentReview1Evaluation'?host:null;
  f.context.document.createElement=()=>({children:[],appendChild(node){this.children.push(node);},remove(){host.children=host.children.filter(n=>n!==this);}});
  f.api.student();f.api.student();assert.equal(f.requests.length,1);assert.equal(f.loading.begun,1);
  f.requests[0].failure({message:'Offline'});assert.equal(host.innerHTML,'Existing published result');assert.equal(f.loading.settled,1);
  host.children[0].children[0].onclick();assert.equal(f.requests.length,2);
  f.requests[1].success({config:{label:'Review 1',maximum:100,weight:.2,criteria:[]},total:null,weighted:null,assessment:{teamMark:48,individualMark:null,status:'MAKEUP_PENDING'}});
  assert.equal(f.loading.settled,2);assert.match(host.innerHTML,/Individual Mark: Pending/);assert.match(host.innerHTML,/Review Total: Pending/);assert.doesNotMatch(host.innerHTML,/Review Total: 0/);
});
test('drawer ignores stale responses after close and escapes project text',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.click('data-close');f.requests[0].success(f.data);assert.equal(f.drawer.open,false);assert(!f.drawer.innerHTML.includes('Team criteria'));
  f.api.open('T1',f.trigger);f.data.details.title='<script>bad</script>';f.requests[1].success(f.data);assert.match(f.drawer.innerHTML,/&lt;script&gt;/);assert.equal(f.fields().length,3);
});
test('criteria accordions start collapsed, open exclusively, and reveal missing entries',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const markup=Array.from(f.drawer.innerHTML.matchAll(/<details[^>]*data-criteria-group[^>]*>/g),m=>m[0]);
  assert.equal(markup.length,2);assert(markup.every(tag=>!tag.includes(' open')));
  assert.match(f.drawer.innerHTML,/<strong>Team Criteria<\/strong>/);assert.match(f.drawer.innerHTML,/<strong>Individual Criteria<\/strong>/);
  assert.doesNotMatch(f.drawer.innerHTML,/common marks that apply to every team member|separate marks for each student/);
  const groups=[0,1].map(()=>({open:false,hasAttribute:name=>name==='data-criteria-group'}));
  const query=f.drawer.querySelectorAll.bind(f.drawer);
  f.drawer.querySelectorAll=selector=>selector==='[data-criteria-group]'?groups:query(selector);
  groups[0].open=true;f.events.toggle({target:groups[0]});assert.equal(groups[1].open,false);
  groups[1].open=true;f.events.toggle({target:groups[1]});assert.equal(groups[0].open,false);
  groups[1].open=false;f.events.toggle({target:groups[1]});assert(groups.every(g=>!g.open));
  f.fields()[0].closest=()=>groups[0];f.click('data-submit');assert.equal(groups[0].open,true);assert.equal(f.requests.length,1);
  f.events.invalid({target:{closest:()=>groups[1]}});assert.equal(groups[1].open,true);assert.equal(groups[0].open,false);
  f.events.toggle({target:{open:true,hasAttribute:()=>false}});assert.equal(groups[1].open,true);
});

test('accordion collapse and switching require valid section entries, while drafts remain saveable',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const field=f.fields()[0],marks=field.controls['[data-marks]'],remark=field.controls['[data-remark]'];
  marks.checkValidity=()=>!marks.validity;Object.defineProperty(marks,'validationMessage',{get:()=>marks.validity});
  const groups=[0,1].map((_,i)=>({open:i===0,hasAttribute:n=>n==='data-criteria-group',querySelectorAll:()=>i===0?[field]:[]}));
  const query=f.drawer.querySelectorAll.bind(f.drawer);f.drawer.querySelectorAll=s=>s==='[data-criteria-group]'?groups:query(s);
  const click=i=>f.events.click({preventDefault(){},target:{closest:()=>({parentElement:groups[i]})}});
  click(0);assert.equal(groups[0].open,false);
  click(0);field.controls['[data-level]'].value='2';click(1);assert.equal(groups[1].open,true);
  click(0);
  marks.value='60';click(1);assert.match(f.status.textContent,/outside/);assert.equal(groups[0].open,true);
  marks.value='40';click(0);assert.equal(groups[0].open,false);
  click(0);remark.value='   ';click(0);assert.equal(groups[0].open,false);
  click(0);
  remark.value='Needs more evidence.';click(1);assert.equal(groups[0].open,false);assert.equal(groups[1].open,true);
  click(1);assert(groups.every(g=>!g.open));
  click(0);marks.value='';marks.required=true;click(0);assert.equal(groups[0].open,false);
  f.click('data-draft');assert.equal(f.requests[1].args[0].teamScores.T.marks,null);
  f.requests[1].failure({message:'Offline'});
  f.data.availability.editable=false;f.api.open('T1',f.trigger);f.requests[2].success(f.data);
  click(0);click(0);assert.equal(groups[0].open,false);
});

test('student accordions switch exclusively, allow blanks, and reveal nested validation errors',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const tags=Array.from(f.drawer.innerHTML.matchAll(/<details[^>]*data-student-group[^>]*>/g),m=>m[0]);
  assert.equal(tags.length,2);assert(tags[0].includes(' open'));assert(tags[1].includes(' hidden'));
  const fields=f.fields().slice(1),parent={open:true},students=fields.map(field=>({open:false,hasAttribute:n=>n==='data-student-group',querySelectorAll:()=>[field]}));
  fields.forEach((field,i)=>{field.closest=s=>s==='[data-student-group]'?students[i]:parent;const marks=field.controls['[data-marks]'];marks.checkValidity=()=>!marks.validity;Object.defineProperty(marks,'validationMessage',{get:()=>marks.validity});});
  const query=f.drawer.querySelectorAll.bind(f.drawer);f.drawer.querySelectorAll=s=>s==='[data-student-group]'?students:s==='[data-criteria-group]'?[parent]:query(s);
  const click=i=>f.events.click({preventDefault(){},target:{closest:()=>({parentElement:students[i]})}});
  click(0);assert.equal(students[0].open,true);click(1);assert.equal(students[0].open,false);assert.equal(students[1].open,true);
  const marks=fields[1].controls['[data-marks]'];fields[1].controls['[data-level]'].value='3';marks.value='40';
  click(0);assert.equal(students[1].open,true);assert.equal(students[0].open,false);assert.match(f.status.textContent,/outside/);
  marks.value='32.25';click(1);assert.equal(students[1].open,true);assert.match(f.status.textContent,/increments/);
  marks.value='32';click(0);assert.equal(students[0].open,true);assert.equal(students[1].open,false);
  click(0);assert(students.every(s=>!s.open));
  parent.open=false;f.events.invalid({target:fields[1]});assert.equal(parent.open,true);assert.equal(students[1].open,true);
  f.data.availability.editable=false;f.api.open('T1',f.trigger);f.requests[1].success(f.data);
  marks.value='40';click(1);assert.equal(students[1].open,false);
});

test('drawer retains failed entries, deduplicates saves and reuses retry request IDs',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  f.click('data-draft');f.click('data-draft');f.click('data-close');assert.equal(f.requests.length,2);assert.equal(f.drawer.open,true);
  const first=f.requests[1];first.failure({message:'Offline'});assert.match(f.status.textContent,/entries are retained/);
  f.click('data-draft');assert.equal(f.requests[2].args[0].requestId,first.args[0].requestId);
  f.requests[2].success({revision:1,status:'Draft'});assert.match(f.status.textContent,/Draft saved/);
  f.click('data-draft');assert.equal(f.requests[3].args[0].revision,1);assert.notEqual(f.requests[3].args[0].requestId,first.args[0].requestId);
});
test('drawer validates bands, requires complete submissions and locks after submit',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);f.click('data-submit');assert.equal(f.requests.length,1);
  for(const field of f.fields()){field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value=field.dataset.owner==='team'?'48':'32';}
  f.fields()[0].controls['[data-marks]'].value='51';f.events.input();f.click('data-submit');assert.equal(f.requests.length,1);
  f.fields()[0].controls['[data-marks]'].value='48';f.events.input();f.click('data-submit');assert.equal(f.requests[1].name,'submitReview1Evaluation');
  f.requests[1].success({revision:1,status:'Submitted'});assert(f.fields().every(field=>Object.values(field.controls).every(c=>c.disabled)));assert.doesNotMatch(f.drawer.innerHTML,/data-submit/);
});
test('drawer warns before discarding unsaved edits and restores focus on close',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);f.events.input();f.discard(false);f.click('data-close');assert.equal(f.drawer.open,true);
  f.discard(true);f.events.cancel({preventDefault(){}});assert.equal(f.drawer.open,false);assert(f.focus()>0);
});
test('level buttons update descriptors and clear previous feedback',()=>{
  const f=browserFixture();f.data.config.criteria[0].name='Literature and gap analysis';f.data.config.criteria[0].descriptors[2]='Partial comparison';
  f.api.open('T1',f.trigger);f.requests[0].success(f.data);const field=f.fields()[0],remark=field.controls['[data-remark]'];
  assert.match(field.querySelector('[data-feedback-options]').innerHTML,/Select a level/);
  remark.value='Faculty observation.';
  const pick=n=>f.events.click({target:field.querySelectorAll('[data-pick-level]')[n]});
  pick(2);assert.equal(field.controls['[data-level]'].value,'2');assert.equal(field.querySelector('[data-descriptor]').textContent,'Level 2: Partial comparison');
  assert.equal(remark.value,'');remark.value='Faculty observation.';
  assert.match(field.querySelector('[data-feedback-options]').innerHTML,/Compare relevant recent sources/);
  const chip=field.querySelector('[data-feedback-options]').querySelectorAll('button')[1];
  f.events.click({target:chip});assert.equal(remark.value,'Faculty observation.\nCompare relevant recent sources and existing solutions.');
  assert.equal(chip.attrs['aria-pressed'],'true');assert.equal(chip.disabled,false);
  f.events.click({target:chip});assert.equal(remark.value,'Faculty observation.');assert.equal(chip.attrs['aria-pressed'],'false');
  pick(4);assert.equal(remark.value,'');assert.match(field.querySelector('[data-feedback-options]').innerHTML,/compared clearly/);
  assert.match(field.querySelector('[data-feedback-required]').textContent,/Optional/);
  assert.equal(field.querySelectorAll('[data-pick-level]')[4].attrs['aria-pressed'],'true');
});
test('feedback length and read-only evaluations prevent unintended changes',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);const field=f.fields()[0];
  f.events.click({target:field.querySelectorAll('[data-pick-level]')[1]});
  const remark=field.controls['[data-remark]'];remark.value='x'.repeat(1999);
  f.events.click({target:field.querySelector('[data-feedback-options]').querySelectorAll('button')[0]});
  assert.equal(remark.value.length,1999);assert.match(f.status.textContent,/2000 characters/);
  f.data.availability.editable=false;f.data.status='Submitted';f.api.open('T1',f.trigger);f.requests[1].success(f.data);
  const locked=f.fields()[0];assert(locked.querySelectorAll('[data-pick-level]').every(b=>b.disabled));
  f.events.click({target:locked.querySelectorAll('[data-pick-level]')[5]});assert.equal(locked.controls['[data-level]'].value,'');
});
test('saved draft out-of-range marks show a distinct range warning and clear after correction',()=>{
  const f=browserFixture();f.data.config.criteria[0].maxMarks=20;
  const pi=f.data.config.criteria[0].pi;
  f.data.status='Draft';f.data.evaluation={teamScores:{[pi]:{level:4,marks:20,remark:''}},students:[]};
  f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const field=f.fields()[0],marks=field.controls['[data-marks]'],warning=field.querySelector('[data-marks-error]');
  assert.match(marks.validity,/outside.*17–18.5 pts/);assert.doesNotMatch(marks.validity,/increments/);
  assert.equal(warning.hidden,false);assert.equal(marks.attrs['aria-invalid'],'true');
  f.click('data-draft');assert.equal(f.requests.length,1);
  marks.value='19';f.events.input();assert.match(marks.validity,/outside/);
  marks.value='16.5';f.events.input();assert.match(marks.validity,/outside/);
  marks.value='17.25';f.events.input();assert.match(marks.validity,/increments of 0.5/);
  for(const value of ['17','18.5','']) {marks.value=value;f.events.input();assert.equal(marks.validity,'');assert.equal(warning.hidden,true);assert.equal(marks.attrs['aria-invalid'],'false');}
});

test('mark steppers and slider retain configured exclusive band boundaries',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);const field=f.fields()[0],marks=field.controls['[data-marks]'];
  f.events.click({target:field.querySelectorAll('[data-pick-level]')[2]});
  const [minus,plus]=field.querySelectorAll('[data-step]');
  f.events.click({target:plus});assert.equal(marks.value,'36');
  marks.value='44.50';f.events.click({target:plus});assert.equal(marks.value,'44.5');
  marks.value='36';f.events.click({target:minus});assert.equal(marks.value,'36');
  const slider=field.controls['[data-marks-slider]'];assert.equal(slider.min,36);assert.equal(slider.max,44.5);
  assert.equal(marks.step,'0.5');assert.equal(marks.min,36);assert.equal(marks.max,44.5);
  marks.value='40.25';f.events.input();assert.match(marks.validity,/whole or half/);
  slider.value='40.5';slider.hasAttribute=name=>name==='data-marks-slider';slider.closest=()=>field;f.events.input({target:slider});assert.equal(marks.value,'40.5');
  f.events.click({target:field.querySelectorAll('[data-pick-level]')[5]});assert.equal(marks.value,'');assert.equal(marks.validity,'');assert.equal(slider.value,57);
  assert.equal(slider.max,60);
});
test('half-mark bounds round fractional band limits inward and disable empty bands',()=>{
  const f=browserFixture();f.data.config.criteria[0].maxMarks=15;
  f.api.open('T1',f.trigger);f.requests[0].success(f.data);const field=f.fields()[0];
  f.events.click({target:field.querySelectorAll('[data-pick-level]')[3]});
  assert.equal(field.controls['[data-marks]'].min,11.5);assert.equal(field.controls['[data-marks]'].max,12.5);
  f.data.config.criteria[0].maxMarks=1;f.api.open('T1',f.trigger);f.requests[1].success(f.data);const small=f.fields()[0];
  f.events.click({target:small.querySelectorAll('[data-pick-level]')[4]});
  assert.equal(small.controls['[data-marks-slider]'].disabled,true);assert.match(small.querySelector('[data-range]').textContent,/No whole or half/);
});
test('selected feedback survives a draft save and remains student-specific',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);const student=f.fields()[1];
  f.events.click({target:student.querySelectorAll('[data-pick-level]')[3]});
  f.events.click({target:student.querySelector('[data-feedback-options]').querySelectorAll('button')[1]});
  const text=student.controls['[data-remark]'].value;assert.match(text,/explanation is clear/);
  f.click('data-draft');assert.equal(f.requests[1].args[0].students[0].scores.I.remark,text);assert.equal(f.requests[1].args[0].students[1].scores.I.remark,'');
  f.requests[1].success({revision:1,status:'Draft'});assert.equal(f.fields()[1].controls['[data-remark]'].value,text);
  assert.equal(f.fields()[1].querySelector('[data-feedback-options]').querySelectorAll('button')[1].attrs['aria-pressed'],'true');
});

function feedbackFixture() {
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const field=f.fields()[0],remark=field.controls['[data-remark]'];
  const pick=n=>f.events.click({target:field.querySelectorAll('[data-pick-level]')[n]});
  pick(2);
  const pills=()=>field.querySelector('[data-feedback-options]').querySelectorAll('button');
  const toggle=i=>f.events.click({target:pills()[i]});
  const edit=value=>{remark.value=value;f.events.input();};
  return {...f,field,remark,pick,pills,toggle,edit};
}
test('header student scores update independently with shared marks and normalize to 100',()=>{
  const f=browserFixture(),scores=[{},{}],query=f.drawer.querySelector.bind(f.drawer);
  f.drawer.querySelector=selector=>selector.startsWith('[data-student-score=')?scores[Number(selector.match(/\d+/)[0])]:query(selector);
  f.data.config.maximum=50;f.data.config.criteria[0].maxMarks=30;f.data.config.criteria[1].maxMarks=20;
  f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  assert.deepEqual(scores.map(s=>s.textContent),['— / 100','— / 100']);
  f.fields().forEach((field,i)=>{field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value=['24','16','15.5'][i];});f.events.input();
  assert.deepEqual(scores.map(s=>s.textContent),['80 / 100','79 / 100']);
  assert.equal(scores[0].title,'Score out of 100');
  f.fields()[0].controls['[data-level]'].value='0';f.fields()[0].controls['[data-marks]'].value='0';f.events.input();
  assert.deepEqual(scores.map(s=>s.textContent),['32 / 100','31 / 100']);
  f.fields()[1].controls['[data-marks]'].value='';f.events.input();assert.equal(scores[0].textContent,'0 / 100');assert.equal(scores[0].title,'Score so far out of 100');
  f.fields()[0].controls['[data-marks]'].value='';f.events.input();assert.equal(scores[0].textContent,'— / 100');
});
test('level changes clear saved team and individual marks without assigning replacement scores',()=>{
  const f=browserFixture(),scores=[{},{}],progress={},query=f.drawer.querySelector.bind(f.drawer);
  f.drawer.querySelector=selector=>selector==='[data-evaluation-progress]'?progress:selector.startsWith('[data-student-score=')?scores[Number(selector.match(/\d+/)[0])]:query(selector);
  f.data.status='Draft';
  f.data.evaluation={teamScores:{T:{level:3,marks:48,remark:'Team feedback'}},students:f.data.roster.students.map(s=>({register:s.register,scores:{I:{level:3,marks:32,remark:'Individual feedback'}}}))};
  f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const [team,student,other]=f.fields(),pick=(field,n)=>f.events.click({target:field.querySelectorAll('[data-pick-level]')[n]});
  assert.equal(team.controls['[data-marks]'].value,'48');assert.match(progress.innerHTML,/3 of 3<\/strong> criteria evaluated/);
  pick(team,3);assert.equal(team.controls['[data-marks]'].value,'48');assert.equal(team.controls['[data-remark]'].value,'Team feedback');
  pick(team,4);assert.equal(team.controls['[data-marks]'].value,'');assert.equal(team.controls['[data-remark]'].value,'');
  assert.equal(team.querySelector('[data-awarded-total]').textContent,'—/60');assert.equal(team.controls['[data-marks-slider]'].value,51);
  assert.equal(f.status.textContent,'Level changed. Enter marks for the selected level.');
  assert.deepEqual(scores.map(s=>s.textContent),['32 / 100','32 / 100']);assert.match(progress.innerHTML,/2 of 3<\/strong> criteria evaluated/);
  student.controls['[data-level]'].value='0';student.controls['[data-marks]'].value='0';student.controls['[data-remark]'].value='Needs improvement';f.events.input();
  pick(student,0);assert.equal(student.controls['[data-marks]'].value,'0');
  pick(student,1);assert.equal(student.controls['[data-marks]'].value,'');assert.equal(student.controls['[data-remark]'].value,'');
  assert.equal(other.controls['[data-marks]'].value,'32');assert.equal(other.controls['[data-remark]'].value,'Individual feedback');
  assert.deepEqual(scores.map(s=>s.textContent),['— / 100','32 / 100']);assert.match(progress.innerHTML,/1 of 3<\/strong> criteria evaluated/);
  f.discard(false);f.click('data-close');assert.equal(f.drawer.open,true);
  f.click('data-submit');assert.equal(f.requests.length,1);
  f.click('data-draft');const saved=f.requests[1].args[0];assert.equal(saved.teamScores.T.marks,null);assert.equal(saved.students[0].scores.I.marks,null);
  f.requests[1].success({revision:1,status:'Draft'});
  assert.equal(f.fields()[0].controls['[data-marks]'].value,'');
  f.data.evaluation=saved;f.api.open('T1',f.trigger);f.requests[2].success(f.data);
  assert.equal(f.fields()[0].controls['[data-marks]'].value,'');assert.equal(f.fields()[1].controls['[data-marks]'].value,'');
  f.click('data-submit');assert.equal(f.requests.length,3);
});

test('feedback pills toggle repeatedly without duplicate text and retain stable controls',()=>{
  const f=feedbackFixture(),pill=f.pills()[1];f.toggle(1);const suggestion=f.remark.value;
  assert.equal(pill.textContent,'✓ '+suggestion);assert.equal(pill.title,'Remove this feedback');
  for(let i=0;i<10;i++){f.toggle(1);assert.equal(f.remark.value,'');f.toggle(1);assert.equal(f.remark.value,suggestion);}
  assert.equal(f.pills()[1],pill);assert.equal(pill.disabled,false);
  f.toggle(1);assert.equal(pill.textContent,'+ '+suggestion);assert.equal(pill.title,'Add this feedback');
});
test('manual deletion and undo resynchronize pill selection without rebuilding buttons',()=>{
  const f=feedbackFixture();f.toggle(0);f.toggle(1);const both=f.remark.value,first=both.split('\n')[0],pill=f.pills()[1];
  f.edit(first);assert.equal(pill.attrs['aria-pressed'],'false');assert.equal(pill.disabled,false);
  f.edit(both);assert.equal(pill.attrs['aria-pressed'],'true');
  f.edit('');assert(f.pills().every(p=>p.attrs['aria-pressed']==='false'));
  f.toggle(1);assert.equal(f.remark.value,both.split('\n')[1]);assert.equal(f.pills()[1],pill);
});
test('deselect removes exact suggestion lines, including pasted duplicates, preserving custom text',()=>{
  const f=feedbackFixture();f.toggle(1);const suggestion=f.remark.value;
  f.edit('  Keep leading spaces.  \n'+suggestion+'\nManual middle.\n  '+suggestion+'  \nKeep trailing spaces.  ');
  f.toggle(1);assert.equal(f.remark.value,'  Keep leading spaces.  \nManual middle.\nKeep trailing spaces.  ');
  f.edit(suggestion+'\r\nCustom CRLF.\r\n'+suggestion);f.toggle(1);assert.equal(f.remark.value,'Custom CRLF.');
  f.edit(suggestion+'\rCustom CR.');f.toggle(1);assert.equal(f.remark.value,'Custom CR.');
});
test('editing or merging a suggestion into prose keeps that prose when the pill is toggled',()=>{
  const f=feedbackFixture();f.toggle(1);const suggestion=f.remark.value;
  const prose='My note: '+suggestion+' More context.';f.edit(prose);
  assert.equal(f.pills()[1].attrs['aria-pressed'],'false');f.toggle(1);assert.equal(f.remark.value,prose+'\n'+suggestion);
  f.toggle(1);assert.equal(f.remark.value,prose);
  f.edit(suggestion.slice(0,-1)+' with further evidence.');const edited=f.remark.value;
  f.toggle(1);f.toggle(1);assert.equal(f.remark.value,edited);
});
test('level changes clear manual and suggested feedback only for that criterion',()=>{
  const f=feedbackFixture();f.toggle(1);const suggestion=f.remark.value;
  f.fields()[1].controls['[data-remark]'].value='Student-specific feedback.';
  f.pick(2);assert.equal(f.remark.value,suggestion);assert.equal(f.pills()[1].attrs['aria-pressed'],'true');
  f.pick(1);assert.equal(f.remark.value,'');assert(f.pills().every(p=>p.attrs['aria-pressed']==='false'));
  f.edit('Manual feedback.');f.pick(4);assert.equal(f.remark.value,'');
  f.pick(2);assert.equal(f.remark.value,'');assert.equal(f.pills()[1].attrs['aria-pressed'],'false');
  assert.equal(f.fields()[1].controls['[data-remark]'].value,'Student-specific feedback.');
  f.click('data-draft');assert.equal(f.requests[1].args[0].teamScores.T.remark,'');
});
test('feedback character limit permits exact fits and always allows deselection',()=>{
  const f=feedbackFixture();f.toggle(1);const suggestion=f.remark.value;f.toggle(1);
  const prefix='x'.repeat(1999-suggestion.length);f.edit(prefix);f.toggle(1);assert.equal(f.remark.value.length,2000);
  assert.equal(f.pills()[1].attrs['aria-pressed'],'true');f.toggle(1);assert.equal(f.remark.value,prefix);
  f.edit(prefix+'x');f.toggle(1);assert.equal(f.remark.value,prefix+'x');assert.equal(f.pills()[1].attrs['aria-pressed'],'false');assert.match(f.status.textContent,/2000/);
  f.edit('x'.repeat(2001)+'\n'+suggestion);f.toggle(1);assert.equal(f.remark.value,'x'.repeat(2001));
});
test('save locks feedback toggles and failed save restores selected pills without losing text',()=>{
  const f=feedbackFixture();f.toggle(1);const text=f.remark.value;f.click('data-draft');assert.equal(f.pills()[1].disabled,true);
  f.toggle(1);assert.equal(f.remark.value,text);assert.equal(f.requests.length,2);
  f.requests[1].failure({message:'Offline'});assert.equal(f.pills()[1].disabled,false);assert.equal(f.pills()[1].attrs['aria-pressed'],'true');
  f.toggle(1);assert.equal(f.remark.value,'');f.click('data-draft');assert.notEqual(f.requests[1].args[0].requestId,f.requests[2].args[0].requestId);
});
test('submitted and published evaluations show selected pills without enabling toggles',()=>{
  for(const status of ['Submitted','Published']) {
    const f=feedbackFixture();f.toggle(1);const text=f.remark.value;
    f.data.status=status;f.data.availability.editable=false;
    f.data.evaluation={teamScores:{T:{level:2,marks:40,remark:text}},students:[]};
    f.api.open('T1',f.trigger);f.requests[1].success(f.data);
    const field=f.fields()[0],pill=field.querySelector('[data-feedback-options]').querySelectorAll('button')[1];
    assert.equal(pill.attrs['aria-pressed'],'true');assert.equal(pill.disabled,true);
    f.events.click({target:pill});assert.equal(field.controls['[data-remark]'].value,text);
  }
});
test('deselecting the last required feedback prevents submission until feedback is restored',()=>{
  const f=feedbackFixture();f.pick(1);f.field.controls['[data-marks]'].value='30';
  for(const field of f.fields().slice(1)){field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='32';}
  f.toggle(1);f.toggle(1);f.click('data-submit');assert.equal(f.requests.length,1);
  f.toggle(1);f.click('data-submit');assert.equal(f.requests[1].name,'submitReview1Evaluation');
});
