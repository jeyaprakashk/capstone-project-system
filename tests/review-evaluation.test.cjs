const {test}=require('node:test');
const { Sync } = require('./sync-promise.cjs');
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
  const reviews=[{key:'review1',type:'REVIEW',label:'Review 1',day:20007,weight:20,rubric:criteria},{key:'review2',type:'REVIEW',label:'Review 2',day:20030,weight:30,rubric:criteria}];
  const tables={},sheets={};
  function sheet(name,data) {
    tables[name]=data;
    return sheets[name]={getName:()=>name,getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),getLastRow:()=>data.length,getMaxRows:()=>1000,
      getRange:(r,col,n,w)=>({setValues(values){values.forEach((row,i)=>{data[r-1+i]||=[];row.forEach((v,j)=>data[r-1+i][col-1+j]=v);});}})};
  }
  const normalize=v=>String(v??'').trim().toLowerCase();
  const c=vm.createContext({console,Date,Set,Map,Session:{getActiveUser:()=>({getEmail:()=>actor})},activityIsCoordinator_:v=>v==='coord@x',
    normalizeText_:normalize,normalizeReviewKey_:normalize,normalizeEmail_:normalize,textEquals_:(a,b)=>normalize(a)===normalize(b),emailsMatch_:(a,b)=>normalize(a)===normalize(b),
    SHEET_NAMES:{TEAM_STATUS:'teams'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},getColumnMap_:()=>TS,getSheetRows_:()=>[row],getStudentsFromTeamStatusRow_:()=>students,
    getCommitteeNumbersForReviewer_:email=>['reviewer@x','second@x'].includes(email)?['C1']:[],getCommitteeInfo_:()=>({reviewer1Name:'Reviewer'}),getReviewDefinitions_:()=>reviews,
    getSheet_:name=>sheets[name]||null,getSpreadsheet_:()=>({getSpreadsheetTimeZone:()=> 'Asia/Kolkata',getSheets:()=>Object.values(sheets),insertSheet:name=>sheet(name,[])}),
    projectDay_:(date,timezone)=>{assert.equal(timezone,'Asia/Kolkata');return today;},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>crypto.createHash('sha256').update(text).digest(),base64EncodeWebSafe:buffer=>buffer.toString('base64url')},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(!allowLock)return false;locked=true;return true;},releaseLock:()=>locked=false})},SpreadsheetApp:{flush(){}},
    summarizeReviewCompletion_:registers=>({completed:false,totalStudents:registers.size,markedStudents:0})});
  for(const file of ['review-academic-policy.js','evaluation-lifecycle.js','publication-events.js','assessment-registry.js','guide-evaluation.js','review-evaluation.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  sheet('Review1Evaluations',[Array.from(vm.runInContext('REVIEW_JOURNAL_HEADERS_',c))]);
  sheet('Review2Evaluations',[Array.from(vm.runInContext('REVIEW_JOURNAL_HEADERS_',c))]);
  c.getAssessmentDefinitions_=()=>reviews.map((r,i)=>({...r,type:'REVIEW',sequence:i+1,opens:r.opens??r.day-7,academicPolicyVersion:r.academicPolicyVersion||'review-attendance-v1',journal:r.journal||'Review'+(i+1)+'Evaluations',prerequisites:r.prerequisites??(i?[{assessmentId:reviews[i-1].key,condition:'RECORDED'}]:[])}));
  c.assessmentRubric_=d=>reviews.find(r=>r.key===d.key).rubric;
  const load=()=>c.loadReviewEvaluation_('T1','review1');
  const input=(d=load())=>({team:'T1',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),teamScores:{T:{level:3,marks:48,remark:''}},
    students:students.map((s,i)=>({register:normalize(s.regNo),absence:{type:'NORMAL'},scores:{I:{level:3,marks:i?31:32,remark:''}}}))});
  const staffInput=(revision,reason)=>({team:'T1',revision,requestId:crypto.randomUUID(),reason});
  const progress=()=>c.reviewProgress_(row,TS,c.reviewRecords_('review1').records,c.reviewConfiguration_('review1'));
  return {c,TS,row,students,reviews,tables,sheets,load,input,staffInput,progress,actor:v=>actor=v,today:v=>today=v,lock:v=>allowLock=v,locked:()=>locked};
}

test('Review 1 accepts Level 2 without feedback for both team and individual criteria',()=>{
 const f=fixture(),input=f.input();input.teamScores.T={level:2,marks:36,remark:''};
 input.students.forEach(s=>s.scores.I={level:2,marks:24,remark:''});
 assert.equal(f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}).status,'Submitted');
});

test('Level 2 feedback is optional and blank feedback does not block frontend submission',async ()=>{
 const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
 for(const field of f.fields()) {field.controls['[data-level]'].value='2';field.controls['[data-marks]'].value=field.dataset.owner==='team'?'36':'24';}
 f.events.input();assert(f.fields().every(field=>field.querySelector('[data-feedback-required]').hidden));
 await f.click('data-submit');assert.equal(f.requests[1].name,'submitReviewEvaluation_');
});

test('one range write stores separate student rows with replicated team scores',()=>{
  const f=fixture(),sheet=f.sheets.Review1Evaluations,range=sheet.getRange,writes=[];
  sheet.getRange=(...args)=>{writes.push(args);return range(...args);};
  const input=f.input();f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});
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
  f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});assert.equal(writes.length,1);
});
test('incomplete, duplicate and inconsistent student revisions are rejected',()=>{
  for(const kind of ['missing','duplicate','team score','status']) {
    const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});const rows=f.tables.Review1Evaluations;
    if(kind==='missing') rows.pop();
    else if(kind==='duplicate') rows.push([...rows[1]]);
    else {const value=JSON.parse(rows[2][8]);if(kind==='team score')value.scores.T.marks=49;else value.status='Published';rows[2][8]=JSON.stringify(value);}
    assert.throws(()=>f.c.reviewRecords_('review1'),/Incomplete|Inconsistent/);
  }
});
test('seven calendar day opening is inclusive and is enforced on reads and writes',()=>{
  const f=fixture(),input=f.input();f.today(19999);
  assert.equal(f.progress().readable,false);assert.match(f.progress().reason,/Opens/);
  assert.throws(f.load,/Opens/);assert.throws(()=>f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'}),/Opens/);assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/Opens/);
  f.today(20000);assert.equal(f.load().availability.editable,true);f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});
  f.today(20007);f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});assert.equal(f.load().evaluation.late,false);
});
test('late team submissions are allowed and recorded',()=>{
  const f=fixture();f.today(20008);f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});assert.equal(f.load().evaluation.late,true);
});
test('due pill distinguishes upcoming, due today and overdue drafts',()=>{
  const f=fixture();assert.equal(f.load().availability.timing.label,'Upcoming');
  f.today(20007);assert.equal(f.load().availability.timing.tone,'warning');assert.equal(f.load().availability.timing.label,'Due today');
  f.today(20008);assert.equal(f.load().availability.timing.tone,'danger');assert.equal(f.load().availability.timing.label,'Overdue');
  assert.equal(f.c.saveReviewEvaluationDraft_({...(f.input()),assessmentId:'review1'}).timing.label,'Overdue');
});
test('submission timing stays fixed after the deadline, publication and date configuration changes',()=>{
  for(const [date,label,tone] of [[20006,'Submitted early','success'],[20007,'Submitted on time','success'],[20008,'Submitted late','danger']]){
    const f=fixture();f.today(date);const input=f.input(),saved=f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'});
    assert.equal(saved.timing.label,label);assert.equal(saved.timing.tone,tone);assert.equal(saved.submittedDay,date);
    f.today(20050);assert.equal(f.load().availability.timing.label,label);
    assert.equal(f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}).timing.label,label);
    f.reviews[0].day=20080;assert.equal(f.load().availability.timing.label,label);
    f.actor('coord@x');f.c.publishInternalAssessment_({...f.staffInput(1),assessmentId:'review1'});f.actor('reviewer@x');assert.equal(f.load().availability.timing.label,label);f.actor('coord@x');
    f.reviews[0].day=20007;f.c.reopenReviewEvaluation_({...(f.staffInput(2,'Correction')),assessmentId:'review1'});f.actor('reviewer@x');
    assert.equal(f.load().availability.timing.label,'Overdue');
  }
});
test('existing submission timestamps are used when submission day is absent',()=>{
  const f=fixture(),config=f.c.reviewConfiguration_('review1');
  f.c.projectDay_=(date,timezone)=>{assert.equal(timezone,'Asia/Kolkata');assert.equal(date.toISOString(),'2026-09-26T10:00:00.000Z');return config.due;};
  assert.equal(f.c.reviewTiming_(config,{status:'Published',config,submittedAt:'2026-09-26T10:00:00Z'}).label,'Submitted on time');
  assert.equal(f.c.reviewTiming_(config,{status:'Submitted',config}).tone,'neutral');
});
test('assigned committee authorization and replaceable title eligibility apply on every write',()=>{
  const f=fixture(),input=f.input();f.actor('outsider@x');assert.throws(f.load,/assigned reviewer/);assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/assigned reviewer/);
  f.actor('reviewer@x');f.row[3]='Revise';assert.throws(f.load,/Approve/);assert.throws(()=>f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'}),/Approve/);
  f.row[3]='Approved';f.row[2]='';assert.throws(f.load,/Approve/);assert.equal(f.tables.Review1Evaluations.length,1);
});
test('mixed scores share team criteria and compute individual totals and weights',()=>{
  const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});const d=f.load();
  assert.equal(d.status,'Submitted');assert.equal(d.availability.editable,false);assert.equal(d.evaluation.teamScores.T.marks,48);
  assert.deepEqual(Array.from(d.evaluation.students,s=>s.total),[80,79]);assert.deepEqual(Array.from(d.evaluation.students,s=>s.weighted),[16,15.8]);
  assert.equal(f.progress().completed,true);assert.equal(f.progress().markedStudents,2);
});
test('incomplete drafts persist but cannot complete or submit a team',()=>{
  const f=fixture(),input=f.input();input.teamScores={};input.students.forEach(s=>s.scores={});
  f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});assert.equal(f.load().status,'Draft');assert.equal(f.progress().completed,false);
  input.revision=1;input.requestId=crypto.randomUUID();assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/required/);
  assert.equal(f.tables.Review1Evaluations.length,3);
});
test('zero marks require feedback at submission and unknown or duplicated student criteria cannot bypass validation',()=>{
  const f=fixture(),input=f.input();input.teamScores.T={level:0,marks:0,remark:''};assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/remark/);
  input.teamScores.T.remark='Needs work';input.students.forEach(s=>s.scores.I={level:0,marks:0,remark:'Needs work'});
  f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'});assert.equal(f.load().evaluation.students[0].total,0);
  const other=fixture(),bad=other.input();bad.students[1].register=bad.students[0].register;assert.throws(()=>other.c.submitReviewEvaluation_({...(bad),assessmentId:'review1'}),/every registered/);
  const mixed=other.input();mixed.students[0].scores.T={level:5,marks:60,remark:''};assert.throws(()=>other.c.submitReviewEvaluation_({...(mixed),assessmentId:'review1'}),/Invalid criterion/);
});
test('exact mark bands, precision and zero validate through both scopes',()=>{
  const f=fixture(),config={academicPolicyVersion:'review-attendance-v1',criteria:[{pi:'T',maxMarks:100,type:'Team'},{pi:'I',maxMarks:100,type:'Individual'}],weight:.2};
  for(const [level,low,high] of [[0,0,40],[1,40,60],[2,60,75],[3,75,85],[4,85,95],[5,95,100]]){
    const input={teamScores:{T:{level,marks:low,remark:'feedback'}},students:[{register:'s',absence:{type:'NORMAL'},scores:{I:{level,marks:low,remark:'feedback'}}}]};
    assert.equal(f.c.reviewScore_(config,{students:[{register:'s'}]},input,true).students[0].total,low*2);
    input.teamScores.T.marks=high;
    if(level<5)assert.throws(()=>f.c.reviewScore_(config,{students:[{register:'s'}]},input,true),/outside/);
  }
  for(const marks of [-1,48.001,true,'NaN',Infinity]){const input=f.input();input.teamScores.T.marks=marks;assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/decimals|outside/);}
});
test('Review 1 accepts half marks and rejects other decimals in both scoring scopes',()=>{
  const f=fixture(),input=f.input();input.teamScores.T.marks=48.5;input.students[0].scores.I.marks=31.5;
  f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});assert.equal(f.load().evaluation.students[0].total,80);
  for(const scope of ['team','individual']){
    const invalid=f.input();if(scope==='team')invalid.teamScores.T.marks=48.25;else invalid.students[0].scores.I.marks=31.75;
    assert.throws(()=>f.c.saveReviewEvaluationDraft_({...(invalid),assessmentId:'review1'}),/whole or half/);
    assert.throws(()=>f.c.submitReviewEvaluation_({...(invalid),assessmentId:'review1'}),/whole or half/);
  }
});
test('shared drafts reject concurrent stale revisions and retries are idempotent',()=>{
  const f=fixture(),input=f.input();f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});f.c.saveReviewEvaluationDraft_({...(input),assessmentId:'review1'});assert.equal(f.tables.Review1Evaluations.length,3);
  assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/different data/);
  f.actor('second@x');assert.throws(()=>f.c.saveReviewEvaluationDraft_({...({...input,requestId:crypto.randomUUID()}),assessmentId:'review1'}),/changed/);
  f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});assert.equal(f.load().status,'Submitted');
  assert.throws(()=>f.c.saveReviewEvaluationDraft_({...(f.input()),assessmentId:'review1'}),/locked/);assert.equal(f.locked(),false);
});
test('changed roster, rubric and opening date invalidate previously opened drafts',()=>{
  const f=fixture(),input=f.input();f.students.push({regNo:'S3',name:'Three',email:'three@x'});assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/Roster or rubric/);f.students.pop();
  f.reviews[0].rubric[0].maxMarks=70;assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/Roster or rubric/);f.reviews[0].rubric[0].maxMarks=60;
  f.reviews[0].day++;assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/Opens/);assert.equal(f.tables.Review1Evaluations.length,1);
});
test('publication is coordinator-only and exposes only the signed-in student scores',()=>{
  const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});const op=f.staffInput(1);
  for(const method of ['publishInternalAssessment_','reopenReviewEvaluation_'])assert.throws(()=>f.c[method]({...op,assessmentId:'review1'}),/Coordinator/);
  f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_('review1'),null);assert.throws(f.load,/assigned reviewer/);
  f.actor('coord@x');f.c.publishInternalAssessment_({...(op),assessmentId:'review1'});f.c.publishInternalAssessment_({...(op),assessmentId:'review1'});
  f.actor('one@x');let published=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(published.total,80);assert.equal(published.students,undefined);assert.equal(published.scores.T.marks,48);
  f.actor('two@x');assert.equal(f.c.loadPublishedReviewEvaluation_('review1').total,79);
  f.actor('outsider@x');assert.throws(()=>f.c.loadPublishedReviewEvaluation_('review1'),/assignment/);
  assert.equal(f.tables.Review1Evaluations.length,4);
});
test('publication uses submitted rubric snapshot and rejects changed roster',()=>{
  const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});f.actor('coord@x');f.students[0].regNo='replacement';
  assert.throws(()=>f.c.publishInternalAssessment_({...(f.staffInput(1)),assessmentId:'review1'}),/Roster membership/);f.students[0].regNo='S1';
  f.reviews[0].rubric[0].maxMarks=90;f.c.publishInternalAssessment_({...(f.staffInput(1)),assessmentId:'review1'});f.actor('reviewer@x');assert.equal(f.load().config.criteria[0].maxMarks,60);
});
test('submitted evaluations stay readable when the opening date or eligibility changes',()=>{
  const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});f.today(19990);f.row[3]='Revise';assert.equal(f.load().availability.readable,true);assert.equal(f.load().availability.editable,false);
});
test('legacy save endpoint cannot overwrite Review 1 and legacy levels never complete history',()=>{
  const f=fixture();assert.equal(f.c.saveReviewerEvaluation,undefined);assert.equal(f.progress().completed,false);
  assert.equal(f.c.loadReviewEvaluation_('T1','review1').status,'Not started');
});
test('manually created storage headers are validated without overwriting',()=>{
  const f=fixture();f.actor('coord@x');assert.equal(f.c.setupReview1Evaluation,undefined);f.c.reviewRecords_('review1');assert.equal(f.tables.Review1Evaluations.length,1);
  f.tables.Review1Evaluations[0][0]='Wrong';assert.throws(()=>f.c.reviewRecords_('review1'),/Incompatible journal/);assert.equal(f.tables.Review1Evaluations[0][0],'Wrong');
});
test('missing storage, oversized payload and unavailable lock fail without revision writes',()=>{
  const f=fixture(),input=f.input();f.lock(false);assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/saving/);f.lock(true);
  delete f.sheets.Review1Evaluations;assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/Error in Initialization/);
  const big=fixture();big.reviews[0].rubric[0].descriptors=Array(6).fill('x'.repeat(10000));assert.throws(()=>big.c.submitReviewEvaluation_({...(big.input()),assessmentId:'review1'}),/too large/);assert.equal(big.tables.Review1Evaluations.length,1);
});
test('browser source is serializable and uses shared drawer layout',()=>{
  const c=vm.createContext({});vm.runInContext(fs.readFileSync('review-academic-policy.js','utf8'),c);vm.runInContext(fs.readFileSync('review-evaluation-client.js','utf8'),c);
  new vm.Script(c.getReviewEvaluationClientScript_());assert.match(c.getReviewEvaluationClientScript_(),/className='open review-drawer[^']*'/);
});

test('Review 2 checks history on load and save, and reopening removes completion',()=>{
  const f=fixture();
  f.reviews[0].prerequisites=[];f.reviews[1].prerequisites=[{assessmentId:'review1',condition:'RECORDED'}];
  f.today(20030);
  assert.throws(()=>f.c.loadReviewEvaluation_('T1','review2'),/Submit Review 1/);
  f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});assert.equal(f.c.loadReviewEvaluation_('T1','review2').config.key,'review2');
  f.actor('coord@x');f.c.reopenReviewEvaluation_({...(f.staffInput(1,'Correction')),assessmentId:'review1'});f.actor('reviewer@x');
  assert.throws(()=>f.c.saveReviewEvaluationDraft_({...({...f.staffInput(0),token:'stale'}),assessmentId:'review2'}),/Submit Review 1/);
  assert.equal(f.c.saveReviewerEvaluation,undefined);
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
  const f=fixture();
  vm.runInContext(fs.readFileSync('reviewer-api.js','utf8'),f.c);
  const render=()=>f.c.reviewerReviewCellDto_(f.row,f.TS,f.reviews[0],{reviews:[f.reviews[0]],teams:{t1:{review1:f.progress()}}});
  f.today(19999);assert.equal(render().enabled,false);assert.match(render().note,/Opens/);
  f.today(20000);assert.equal(render().enabled,true);f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});assert.equal(render().actionLabel,'View marks');
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
        const nodes={'[data-exception-fields]':{},'[data-prolonged-fields]':{},'[data-approval-field]':{},['[data-effective="'+match[1]+'"]']:{}};
        const host={dataset:{absence:match[1]},controls,nodes,pills:[],querySelector(selector){const name=(selector.match(/data-fact="([^"]+)"/)||[])[1];return name?controls[name]:nodes[selector];},querySelectorAll:()=>host.pills};
        host.pills=Array.from(match[2].matchAll(/data-reason-suggestion="(\d+)"/g),m=>{
          const pill=button('data-reason-suggestion',m[1]);pill.closest=selector=>selector==='[data-absence]'?host:selector==='button'?pill:null;return pill;
        });
        const evidenceOptions=Array.from(match[2].matchAll(/<input type="checkbox" data-supporting-evidence value="([^"]+)"([^>]*)>/g),m=>({...control(m[1]),checked:m[2].includes('checked')}));
        const evidenceDetail=control((match[2].match(/<textarea data-other-evidence[^>]*>([\s\S]*?)<\/textarea>/)||[])[1]||'','textarea'),evidenceLabel={};
        nodes['[data-other-evidence]']=evidenceDetail;
        nodes['[data-absence-evidence]']={options:evidenceOptions,querySelector:selector=>selector==='[data-other-evidence]'?evidenceDetail:evidenceLabel,querySelectorAll:selector=>selector.includes(':checked')?evidenceOptions.filter(n=>n.checked):[...evidenceOptions,evidenceDetail]};
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
      if(selector==='[data-summary-unsaved]' || selector.startsWith('[data-summary-values='))return headerNodes[selector]||={};
      if(selector.startsWith('[data-footer-team=') || selector.startsWith('[data-footer-individual=') || selector.startsWith('[data-footer-total='))return headerNodes[selector]||={};
      if(selector==='[data-team-mark]' || selector.startsWith('[data-individual-mark=') || selector.startsWith('[data-assessment-status='))return headerNodes[selector]||=( {} );
      if(extended){
        const absence=selector.match(/^\[data-absence="(\d+)"\]$/);if(absence)return absenceNodes.get(absence[1]);
        const criterion=selector.match(/^\[data-index="(\d+)"\]\[data-owner="([^"]+)"\]$/);if(criterion)return fields.find(f=>f.dataset.index===criterion[1] && f.dataset.owner===criterion[2]);
        if(selector.startsWith('[data-decision-reason'))return {value:'Reviewed evidence'};
        if(selector.startsWith('[data-components'))return {value:'individual'};
        if(selector.startsWith('[data-decision='))return {value:'OTHER'};
        if(selector==='[data-review-actions]')return {set innerHTML(value){for(const m of value.matchAll(/(data-(?:target-draft|target-submit|reload|close))/g))buttons.push(button(m[1]));}};
      }
      if(selector==='[data-message]')return status;if(selector==='form')return form;if(selector.startsWith('[data-total='))return totals[Number(selector.match(/\d+/)[0])];return buttons.find(b=>b.hasAttribute(selector.slice(1,-1)));},
    querySelectorAll(selector){if(selector==='[data-index]')return fields;if(selector.startsWith('[data-absence]'))return [...absenceNodes.values()].flatMap(h=>Object.values(h.controls));const inputs=fields.flatMap(f=>Object.values(f.controls));return selector.includes('button')?[...buttons,...inputs,...fields.flatMap(f=>[...f.buttons,...f.querySelector('[data-feedback-options]').querySelectorAll('button')])]:inputs;}
  };
  const trigger={isConnected:true,focus(){focusCount++;}};
  function runner(success,failure){return new Proxy({},{get:(_,name)=>name==='withSuccessHandler'?fn=>runner(fn,failure):name==='withFailureHandler'?fn=>runner(success,fn):(...args)=>requests.push({name,args,success,failure})});}
  const c=vm.createContext({ReviewerView:{refresh:()=>Promise.resolve(true)},console,confirm:()=>discard,prompt:()=>extended?'Reviewed assessment':null,window:{crypto,addEventListener(){}},document:{createElement:()=>drawer,body:{appendChild(){},classList:{add(){},remove(){}}},getElementById:()=>null},DashboardUI:{ask:async ()=>discard,requestText:async ()=>extended?'Reviewed assessment':null,notify:async ()=>{},guideRun:()=>runner(),renderSkeleton:()=>'<p>Loading</p>',...(extended?{beginContentLoading(){loading.begun++;let settled=false;return()=>{if(!settled)loading.settled++;settled=true;};}}:{})}});
  vm.runInContext(fs.readFileSync('dashboard-client-scripts.js','utf8'),c);
  for(const file of ['assessment-history-view.js','lucide-icons.js','icon-renderer.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  c.DashboardUI.renderAssessmentHistory=c.renderAssessmentHistory_;
  c.DashboardUI.renderIcon=c.renderLucideIcon_;
  c.DashboardUI.renderExpandableText=c.renderExpandableText_;
  vm.runInContext(fs.readFileSync('review-academic-policy.js','utf8'),c);vm.runInContext(fs.readFileSync('review-evaluation-client.js','utf8'),c);const LEGACY={draft:'saveReviewEvaluationDraft_',submit:'submitReviewEvaluation_',absence:'recordReviewAbsence_',makeupDraft:'saveReviewMakeupDraft_',makeupSubmit:'submitReviewMakeup_'};
  const settle=(name,args)=>{const p=new Sync();requests.push({name,args,success:v=>p.resolve(v),failure:e=>p.reject(e)});return p;};
  const bridge={read:(readKey,method,args)=>settle('loadReviewEvaluation_',args),write:(method,args)=>settle(LEGACY[args[0]],[args[1]])};
  const api=c.reviewEvaluationBrowser_(key,bridge);
  const click=attr=>events.click({target:buttons.find(b=>b.hasAttribute(attr))});
  const data=JSON.parse(JSON.stringify(fixture().load()));
  return {api,drawer,requests,status,data,trigger,click,events,fields:()=>fields,discard:v=>discard=v,focus:()=>focusCount,absenceNodes:()=>absenceNodes,loading,context:c};
}

// Both configured reviews must obey the same policy without sharing records or rubric content.
function absenceFixture(key='review1') {
  const f=fixture();
  if(key==='review_extra'){f.reviews[1].key=key;f.reviews[1].label='Additional Review';}
  if(key!=='review1'){f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});f.today(20030);}
  const load=()=>f.c.getReviewEvaluation_('T1',key);
  const input=(data=load())=>f.input(data);
  const submit=value=>f.c.reviewWrite_('submit',value,key);
  const target=(extra={})=>({review:key,team:'T1',student:'s1',revision:load().revision,token:load().token,requestId:crypto.randomUUID(),reason:'Committee verified supporting evidence',...extra});
  const publish=student=>{const revision=load().revision;f.actor('coord@x');const result=f.c.reviewWrite_('publish',{...f.staffInput(revision),student},key);f.actor('reviewer@x');return result;};
  return {...f,key,load,input,submit,target,publish,student:()=>load().evaluation.students[0]};
}

const productionCases=[['present',{type:'NORMAL'},48,32],... [true,false].map(approved=>['ordinary-'+approved,{type:'REVIEW_DAY_ABSENCE',approved},48,approved?null:0]),... [true,false].flatMap(verifiedContribution=>[true,false].flatMap(approved=>[true,false].map(attended=>['long-'+[verifiedContribution,approved,attended],{type:'PROLONGED',verifiedContribution,approved,attended},verifiedContribution&&approved?48:0,attended?32:approved?null:0])))];
for(const key of ['review1','review2'])for(const [name,facts,team,individual] of productionCases)test(key+' production '+name+': submit, reload, preview and available actions',()=>{
  const f=absenceFixture(key),input=f.input();input.students[0].absence=facts;if(!facts.attended&&facts.type!=='NORMAL')input.students[0].scores={};
  const result=f.submit(input),saved=f.load().evaluation.students[0];
  assert.equal(saved.assessment.teamMark,team);assert.equal(saved.assessment.individualMark,individual);assert.equal(saved.total,individual===null?null:team+individual);
  assert.equal(saved.assessment.completed,individual!==null);assert.equal(saved.assessment.status,individual===null?'MAKEUP_PENDING':'COMPLETED');assert.equal(saved.assessment.nextActions.makeup,individual===null);
  assert.equal(saved.assessment.policyVersion,'review-attendance-v1');assert.equal(result.revision,1);assert.equal(f.progress().recorded,true);
  const browser=browserFixture(true,key);browser.api.open('T1',browser.trigger);browser.requests[0].success(JSON.parse(JSON.stringify(f.load())));
  assert.doesNotMatch(browser.drawer.innerHTML,/Record Academic Decision|Authorize Makeup|Team Mark Applicable|Alternative Assessment/);
  assert.equal(browser.drawer.innerHTML.includes('Conduct Makeup Assessment'),individual===null);
  const preview=browser.context.reviewPolicyCalculate_(f.load().config,input.teamScores,{register:'s1',scores:input.students[0].scores,assessment:{facts}});
  assert.equal(JSON.stringify(preview.assessment),JSON.stringify({...saved.assessment}));
});
for(const approved of [true,false])for(const verifiedContribution of [true,false])test('attended Long Absent requires Individual scores '+[approved,verifiedContribution],()=>{
 const f=fixture(),input=f.input();input.students[0].absence={type:'PROLONGED',approved,verifiedContribution,attended:true};input.students[0].scores={};
 assert.throws(()=>f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'}),/required/);assert.equal(f.tables.Review1Evaluations.length,1);
});
test('makeup is isolated, idempotent and survives copy-and-correct applicability transitions',()=>{
 const f=fixture(),input=f.input();input.students[0].absence={type:'PROLONGED',approved:true,verifiedContribution:false,attended:false};input.students[0].scores={};f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'});
 let d=f.load();const teammate=JSON.stringify(d.evaluation.students[1]),team=JSON.stringify(d.evaluation.teamScores);
 const command={assessmentId:'review1',team:'T1',student:'s1',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),scores:{I:{level:3,marks:32,remark:''}}};
 assert.throws(()=>f.c.submitReviewMakeup_({...command,teamScores:{}}),/only/);
 f.c.saveReviewMakeupDraft_(command);assert.equal(f.load().evaluation.students[0].total,null);
 d=f.load();const submit={...command,revision:d.revision,requestId:crypto.randomUUID()};f.c.submitReviewMakeup_(submit);const rows=f.tables.Review1Evaluations.length;f.c.submitReviewMakeup_(submit);assert.equal(f.tables.Review1Evaluations.length,rows);
 d=f.load();assert.equal(d.evaluation.students[0].total,32);assert.equal(d.evaluation.students[0].assessment.teamMark,0);assert.equal(JSON.stringify(d.evaluation.students[1]),teammate);assert.equal(JSON.stringify(d.evaluation.teamScores),team);
 const before=JSON.stringify(f.tables.Review1Evaluations),event=d.evaluation.students[0].assessment.makeup.eventId;
 f.actor('coord@x');f.c.reopenReviewEvaluation_({...(f.staffInput(d.revision,'Correct facts')),assessmentId:'review1'});f.actor('reviewer@x');
 assert.equal(JSON.stringify(f.tables.Review1Evaluations.slice(0,rows)),before);
 function correction(facts,scores={}){const data=f.load(),v=f.input(data);v.students=data.evaluation.students.map(s=>({register:s.register,absence:s.assessment.facts,scores:s.scores}));v.students[0].absence=facts;v.students[0].scores=scores;return v;}
 let v=correction({type:'PROLONGED',approved:true,verifiedContribution:false,attended:true});f.c.saveReviewEvaluationDraft_({...(v),assessmentId:'review1'});assert.equal(f.load().evaluation.students[0].total,null);assert.throws(()=>f.c.submitReviewEvaluation_({...(correction(v.students[0].absence)),assessmentId:'review1'}),/required/);
 v=correction({type:'PROLONGED',approved:false,verifiedContribution:false,attended:false});f.c.saveReviewEvaluationDraft_({...(v),assessmentId:'review1'});assert.equal(f.load().evaluation.students[0].total,0);
 v=correction({type:'PROLONGED',approved:true,verifiedContribution:false,attended:false});f.c.submitReviewEvaluation_({...(v),assessmentId:'review1'});d=f.load();assert.equal(d.evaluation.students[0].total,32);assert.equal(d.evaluation.students[0].assessment.makeup.eventId,event);assert.equal(d.evaluation.students[0].assessment.events.length,1);
});
test('reopening compares four dimensions and accepts display-only identity corrections',()=>{
 for(const [dimension,change] of [['rubric',f=>f.reviews[0].rubric[0].name='Changed'],['configuration',f=>f.reviews[0].weight=21],['roster',f=>f.students[0].regNo='replacement'],['policy',f=>f.reviews[0].academicPolicyVersion='future']]){
  const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});const before=JSON.stringify(f.tables);change(f);f.actor('coord@x');assert.throws(()=>f.c.reopenReviewEvaluation_({...(f.staffInput(1,'Correction')),assessmentId:'review1'}),e=>e.code==='REOPEN_INCOMPATIBLE'&&e.changes.some(c=>c.dimension===dimension));assert.equal(JSON.stringify(f.tables),before);
 }
 const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});const before=JSON.stringify(f.tables.Review1Evaluations);f.students[0].name='Corrected';f.students[0].email='corrected@x';f.students[0].regNo=' S1 ';f.students.reverse();f.actor('coord@x');f.c.reopenReviewEvaluation_({...(f.staffInput(1,'Identity display correction')),assessmentId:'review1'});f.actor('reviewer@x');const d=f.load();assert.equal(d.evaluation.students[0].scores.I.marks,32);assert.equal(d.evaluation.copiedFromRevision,1);assert.equal(JSON.stringify(f.tables.Review1Evaluations.slice(0,3)),before);
});
test('copy-and-correct rederives contribution and keeps previous finalized outcome frozen',()=>{
 const f=fixture(),v=f.input();v.students[0].absence={type:'PROLONGED',approved:true,verifiedContribution:true,attended:true};f.c.submitReviewEvaluation_({...(v),assessmentId:'review1'});const old=JSON.stringify(f.tables.Review1Evaluations);f.actor('coord@x');f.c.reopenReviewEvaluation_({...(f.staffInput(1,'Contribution correction')),assessmentId:'review1'});f.actor('reviewer@x');const next=f.input();next.students[0].absence={...v.students[0].absence,verifiedContribution:false};f.c.submitReviewEvaluation_({...(next),assessmentId:'review1'});assert.equal(f.load().evaluation.students[0].total,32);assert.equal(JSON.stringify(f.tables.Review1Evaluations.slice(0,3)),old);
 const snapshot=f.load().evaluation.students[0];f.c.reviewPolicyCalculate_=()=>{throw Error('must not recalculate finalized results');};assert.equal(f.load().evaluation.students[0].total,snapshot.total);
});
test('recorded pending Review permits configured successor; configured opening is authoritative',()=>{
 const f=fixture(),v=f.input();v.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true};v.students[0].scores={};f.c.submitReviewEvaluation_({...(v),assessmentId:'review1'});f.reviews[1].opens=20000;assert.equal(f.c.loadReviewEvaluation_('T1','review2').availability.editable,true);f.reviews[1].opens=20001;assert.throws(()=>f.c.loadReviewEvaluation_('T1','review2'),/Opens/);
});
const absence=(type,approved,verifiedContribution,attended)=>({type,approved,verifiedContribution,attended,reason:'Reviewer verified guide confirmation and review attendance',...(type==='PROLONGED'?{absenceReason:approved?'MEDICAL':null,supportingEvidence:[],contributionEvidence:verifiedContribution?['GUIDE_CONFIRMATION']:[],otherContributionEvidenceText:null}:{})});

for(const key of ['review1','review2']) {
  test(key+': in-page attendance picker updates cards, closes with Escape and outside clicks, and locks while saving',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    const host=f.absenceNodes().get('0'),label={},summary={attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;},closest:()=>picker,hasAttribute:()=>false};
    const option={value:'NORMAL',checked:false,hasAttribute:a=>a==='data-attendance-option',closest:()=>host};
    const picker={open:true,hasAttribute:a=>a==='data-attendance-picker',querySelector:s=>s==='summary'?summary:label,querySelectorAll:()=>[option],closest:()=>host};
    host.nodes['[data-attendance-picker]']=picker;host.nodes['[data-attendance-picker] > summary']=summary;
    const all=f.drawer.querySelectorAll.bind(f.drawer);f.drawer.querySelectorAll=s=>s==='[data-attendance-picker]'?[picker]:all(s);
    f.events.change({target:option});
    assert.equal(host.controls.type.value,'NORMAL');assert.equal(label.textContent,'Present');assert.equal(option.checked,true);
    assert.equal(picker.open,false);assert.equal(summary.focused,true);assert.equal(f.fields()[1].hidden,false);
    picker.open=true;let prevented=false,stopped=false;
    f.events.keydown({target:summary,key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    assert.equal(picker.open,false);assert(prevented && stopped);assert.equal(f.drawer.open,true);
    picker.open=true;f.events.click({target:{closest:()=>null}});assert.equal(picker.open,false);
    f.click('data-draft');assert.equal(option.disabled,true);assert.equal(summary.attrs['aria-disabled'],'true');
    option.value='PROLONGED';f.events.change({target:option});assert.equal(host.controls.type.value,'NORMAL');
    f.requests[1].failure({message:'Offline'});assert.equal(option.disabled,false);assert.equal(label.textContent,'Present');
  });
  test(key+': makeup preview updates its total without resolving the saved pending result',async ()=>{
    const server=absenceFixture(key),input=server.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',true);input.students[0].scores={};server.submit(input);
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));await f.click('data-target');
    const field=f.fields().find(field=>field.dataset.owner==='0'),summary=f.drawer.querySelector('[data-summary-values="0"]');
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='32';f.events.input();
    assert.match(summary.innerHTML,/<dd[^>]*>80 \/ 100<\/dd>/);assert.match(summary.innerHTML,/<dd[^>]*>Completed<\/dd>/);
    field.controls['[data-marks]'].value='';f.events.input();
    assert.match(summary.innerHTML,/<dd[^>]*>Pending \/ 100<\/dd>/);assert.match(summary.innerHTML,/<dd[^>]*>Makeup Pending<\/dd>/);
    assert.equal(server.load().evaluation.students[0].assessment.status,'MAKEUP_PENDING');assert.equal(f.requests.length,1);
  });
  test(key+': unselected attendance survives a draft and cannot become an absent zero or submitted result',()=>{
    const server=absenceFixture(key),input=server.input();
    input.students[0].absence={type:'UNSELECTED'};input.students[0].scores={};
    server.c.reviewWrite_('draft',input,key);
    const saved=server.load().evaluation.students[0];
    assert.equal(saved.assessment.facts.type,'UNSELECTED');
    assert.equal(saved.assessment.individualState,'UNASSESSED');
    assert.equal(saved.assessment.individualMark,null);assert.equal(saved.total,null);
    assert.equal(saved.assessment.status,'INCOMPLETE');
    const next=server.input();next.students[0].absence={type:'UNSELECTED'};next.students[0].scores={};
    assert.throws(()=>server.submit(next),/Select attendance/);
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.equal(f.absenceNodes().get('0').controls.type.value,'');
    assert(f.fields().filter(field=>field.dataset.owner==='0').every(field=>field.hidden));
  });
  test(key+': attendance gates individual PI cards and each student retains their PI selection and marks',()=>{
    const f=browserFixture(true,key);
    f.data.config.criteria.push({...f.data.config.criteria[1],pi:'I2',name:'Second individual PI'});
    f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.match(f.drawer.innerHTML,/<option value="" selected>Select attendance<\/option><option value="NORMAL">Present<\/option>/);
    assert.match(f.drawer.innerHTML,/<select data-fact="type" hidden aria-hidden="true" tabindex="-1">/);
    const fields=f.fields().filter(field=>field.dataset.owner==='0');
    assert(fields.every(field=>field.hidden));assert(fields.every(field=>field.controls['[data-marks]'].disabled));
    f.absenceNodes().get('0').controls.type.value='NORMAL';f.events.input();
    assert.equal(fields[0].hidden,false);assert.equal(fields[1].hidden,true);
    fields[0].controls['[data-level]'].value='3';fields[0].controls['[data-marks]'].value='32';f.events.input();
    const select=(owner,index)=>{const button={dataset:{student:String(owner),selectIndividualPi:String(index)},hasAttribute:a=>a==='data-select-individual-pi',closest:()=>button};f.events.click({target:button});};
    select(0,Number(fields[1].dataset.index));assert.equal(fields[0].hidden,true);assert.equal(fields[1].hidden,false);
    f.absenceNodes().get('1').controls.type.value='NORMAL';f.events.input();select(1,1);
    assert.equal(fields[1].hidden,false);assert.equal(fields[0].controls['[data-marks]'].value,'32');
    f.absenceNodes().get('0').controls.type.value='';f.events.input();assert(fields.every(field=>field.hidden));
    assert.equal(f.requests.length,1);
  });
  test(key+': team PI cards switch singly and submission reveals a hidden missing PI',async ()=>{
    const f=browserFixture(true,key);
    f.data.config.criteria.push({...f.data.config.criteria[0],pi:'T2',name:'Second team criterion'});
    f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    for(const host of f.absenceNodes().values())host.controls.type.value='NORMAL';
    const teams=f.fields().filter(field=>field.dataset.owner==='team'),group={dataset:{criteriaGroup:'team'},querySelectorAll:()=>teams},query=f.drawer.querySelector.bind(f.drawer),all=f.drawer.querySelectorAll.bind(f.drawer);
    f.drawer.querySelector=s=>s==='[data-criteria-group="team"]'?group:query(s);
    f.drawer.querySelectorAll=s=>s==='[data-criteria-group]'?[group]:all(s);
    teams.forEach(field=>{field.closest=s=>s==='[data-index]'?field:s==='[data-criteria-group]'?group:null;field.scrollIntoView=()=>{};const marks=field.controls['[data-marks]'];marks.checkValidity=()=>!marks.validity;Object.defineProperty(marks,'validationMessage',{get:()=>marks.validity});});
    assert.equal(teams[0].hidden,false);assert.equal(teams[1].hidden,true);
    const click=index=>{const pill={dataset:{selectPi:teams[index].dataset.index},hasAttribute:a=>a==='data-select-pi',closest:s=>s==='button'?pill:null};f.events.click({target:pill});};
    teams[0].controls['[data-level]'].value='3';teams[0].controls['[data-marks]'].value='48';f.events.input();
    click(1);assert.equal(teams[0].hidden,true);assert.equal(teams[1].hidden,false);
    click(0);assert.equal(teams[0].controls['[data-marks]'].value,'48');assert.equal(teams[1].hidden,true);
    await f.click('data-submit');assert.equal(teams[1].hidden,false);assert.equal(teams[0].hidden,true);assert.match(f.status.textContent,/Select a proficiency level/);assert.equal(f.requests.length,1);
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
    const field=f.fields()[0],group={querySelectorAll:()=>[field]},content={scrollTop:120},query=f.drawer.querySelector.bind(f.drawer);
    f.drawer.querySelector=s=>s==='[data-criteria-group="team"]'?group:s==='[data-drawer-content]'?content:query(s);
    let scrolled=false;field.scrollIntoView=()=>{scrolled=true;};
    const marks=field.controls['[data-marks]'];marks.checkValidity=()=>!marks.validity;Object.defineProperty(marks,'validationMessage',{get:()=>marks.validity});
    const pill={dataset:{selectPi:'0'},hasAttribute:a=>a==='data-select-pi',closest:s=>s==='button'?pill:null};
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='59';
    f.events.click({target:pill});assert.equal(scrolled,false);assert.equal(content.scrollTop,120);assert.match(f.status.textContent,/outside/);
    field.controls['[data-marks]'].value='48';f.events.click({target:pill});assert.equal(scrolled,false);assert.equal(content.scrollTop,0);assert.equal(field.controls['[data-marks]'].value,'48');assert.equal(f.requests.length,1);
  });
  test(key+': tab progress counts valid grading and changes completion color',()=>{
    const f=browserFixture(true,key),row={},query=f.drawer.querySelector.bind(f.drawer);
    f.drawer.querySelector=selector=>selector==='[data-tab-progress]'?row:query(selector);
    f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    for(const host of f.absenceNodes().values())host.controls.type.value='NORMAL';
    assert.match(row.innerHTML,/Performance Indicators/);assert.match(row.innerHTML,/data-completion="empty"[^>]*>0 of 1 graded/);
    const team=f.fields()[0];team.controls['[data-level]'].value='3';team.controls['[data-marks]'].value='48';f.events.input();
    assert.match(row.innerHTML,/data-completion="complete"[^>]*>1 of 1 graded/);
    const tab={dataset:{criteriaTab:'individual'},hasAttribute:a=>a==='data-criteria-tab',closest:s=>s==='button'?tab:null};
    f.events.click({target:tab});assert.match(row.innerHTML,/Students/);assert.match(row.innerHTML,/0 of 2 graded/);
    const students=f.fields().filter(field=>field.dataset.owner!=='team');
    students[0].controls['[data-level]'].value='3';students[0].controls['[data-marks]'].value='32';f.events.input();
    assert.match(row.innerHTML,/data-completion="partial"[^>]*>1 of 2 graded/);
    students[1].controls['[data-level]'].value='3';students[1].controls['[data-marks]'].value='32';f.events.input();
    assert.match(row.innerHTML,/data-completion="complete"[^>]*>2 of 2 graded/);
    students[0].controls['[data-marks]'].value='99';f.events.input();
    assert.match(row.innerHTML,/data-completion="partial"[^>]*>1 of 2 graded/);
  });
  test(key+': component tabs switch without reload, preserve entries and support arrow navigation',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert(f.drawer.innerHTML.indexOf('review-project-title-row')<f.drawer.innerHTML.indexOf('role="tablist"'));
    assert.match(f.drawer.innerHTML,/Team Criteria<\/span><span>60 pts pool<\/span>/);assert.match(f.drawer.innerHTML,/Individual<\/span><span>40 pts weight<\/span>/);
    const panels=Object.fromEntries(['team','individual'].map(name=>[name,{hidden:name!=='team',open:name==='team',querySelectorAll:()=>[]}]));
    const tabs=Object.fromEntries(['team','individual'].map(name=>[name,{dataset:{criteriaTab:name},attrs:{},hasAttribute:attr=>attr==='data-criteria-tab',setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;},closest(selector){return selector==='button'?this:null;}}]));
    const chips={},query=f.drawer.querySelector.bind(f.drawer);
    f.drawer.querySelector=selector=>selector==='[data-review-students]'?chips:selector.startsWith('[data-criteria-group="')?panels[selector.match(/"([^"]+)"/)[1]]:selector.startsWith('[data-criteria-tab="')?tabs[selector.match(/"([^"]+)"/)[1]]:query(selector);
    f.fields()[0].controls['[data-marks]'].value='48';f.fields()[0].controls['[data-level]'].value='3';f.events.input();
    f.events.click({target:tabs.individual});assert.equal(panels.team.hidden,true);assert.equal(panels.individual.hidden,false);assert.equal(tabs.individual.attrs['aria-selected'],'true');assert.equal(chips.hidden,false);
    f.events.keydown({target:tabs.individual,key:'ArrowLeft',preventDefault(){}});assert.equal(panels.team.hidden,false);assert.equal(panels.individual.hidden,true);assert.equal(tabs.team.focused,true);assert.equal(chips.hidden,true);
    assert.equal(f.fields()[0].controls['[data-marks]'].value,'48');assert.equal(f.requests.length,1);
    f.click('data-draft');f.events.click({target:tabs.individual});assert.equal(panels.team.hidden,false);
  });
  test(key+': level ranges and slider values use configured marks; footer has actions only',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.doesNotMatch(f.drawer.innerHTML,/review-footer-table|data-footer-student/);
    assert.match(f.drawer.innerHTML,/data-draft/);assert.match(f.drawer.innerHTML,/data-submit/);
    assert.match(f.drawer.innerHTML,/<strong>L3<\/strong><small>45\u201350.5<\/small>/);
    const field=f.fields()[0],values={},query=field.querySelector.bind(field);
    field.querySelector=s=>s==='[data-slider-values]'?values:query(s);
    f.events.input();assert.equal(values.hidden,true);
    field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='48';f.events.input();
    assert.equal(values.hidden,false);assert.match(values.innerHTML,/<span>45<\/span>/);
    assert.match(values.innerHTML,/<span class="font-semibold text-primary">48<\/span>/);assert.match(values.innerHTML,/<span>50.5<\/span>/);
    field.controls['[data-level]'].value='5';field.controls['[data-marks]'].value='60';f.events.input();
    assert.match(values.innerHTML,/<span>57<\/span>/);assert.match(values.innerHTML,/<span class="font-semibold text-primary">60<\/span>/);
  });
  test(key+': compact student chips switch panels without RPC or losing unsaved entries',()=>{
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
    assert.match(f.drawer.innerHTML,/data-select-student="0" aria-pressed="true"/);
    assert.match(f.drawer.innerHTML,/data-select-student="1" aria-pressed="false"/);
    const panels=[0,1].map(i=>({dataset:{studentGroup:String(i)},open:i===0,hidden:i!==0}));
    const chips=[0,1].map(i=>({dataset:{selectStudent:String(i)},attrs:{},classList:{toggle(){}},hasAttribute:name=>name==='data-select-student',setAttribute(k,v){this.attrs[k]=v;},closest:selector=>selector==='button'?chips[i]:null}));
    const parent={open:false,closest:selector=>selector==='[data-criteria-group]'?parent:null};
    const query=f.drawer.querySelector.bind(f.drawer),all=f.drawer.querySelectorAll.bind(f.drawer);
    f.drawer.querySelector=selector=>selector==='[data-criteria-group="individual"]'?parent:selector.startsWith('[data-select-student="')?chips[Number(selector.match(/\d+/)[0])]:selector.startsWith('[data-student-group="')?panels[Number(selector.match(/\d+/)[0])]:query(selector);
    f.drawer.querySelectorAll=selector=>selector==='[data-criteria-group]'?[parent]:selector==='[data-student-group]'?panels:all(selector);
    const field=f.fields()[1];field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='32';field.controls['[data-remark]'].value='Unsaved feedback';f.events.input();
    f.events.click({target:chips[1]});assert.equal(panels[1].hidden,false);assert.equal(panels[0].hidden,true);assert.equal(parent.open,true);assert.equal(chips[1].attrs['aria-pressed'],'true');
    f.events.click({target:chips[0]});assert.equal(panels[0].hidden,false);assert.equal(field.controls['[data-marks]'].value,'32');assert.equal(field.controls['[data-remark]'].value,'Unsaved feedback');assert.equal(f.requests.length,1);
    f.click('data-draft');f.events.click({target:chips[1]});assert.equal(panels[0].hidden,false);
    f.requests[1].failure({message:'Offline'});f.events.click({target:chips[1]});assert.equal(panels[1].hidden,false);
    assert.match(f.drawer.innerHTML,/<small>s1<\/small>/);
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
  test(key+': pending absence hides individual controls until makeup is opened',async ()=>{
    const server=absenceFixture(key),input=server.input();input.students[0].absence=absence('PROLONGED',true,true,false);input.students[0].scores={};server.submit(input);
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.equal(f.fields()[1].hidden,true);
    await f.click('data-target');assert.equal(f.fields()[1].hidden,false);assert.equal(f.fields()[0].hidden,true);assert.equal(f.fields()[2].hidden,true);
    assert.equal(f.fields()[1].controls['[data-marks]'].disabled,false);
  });
}


test('Review 2 uses independent rubric, maximum, descriptors, date, weight and history; legacy Review 1 bytes stay untouched',()=>{
  const f=fixture();f.c.submitReviewEvaluation_({...(f.input()),assessmentId:'review1'});f.actor('coord@x');f.c.publishInternalAssessment_({...(f.staffInput(1)),assessmentId:'review1'});f.actor('reviewer@x');
  const before=JSON.stringify(f.tables.Review1Evaluations);
  f.reviews[1].rubric=[{pi:'R2T',type:'Team',name:'Implementation',maxMarks:80,co:'CO3',descriptors:Array(6).fill('Review 2 implementation')},{pi:'R2I',type:'Individual',name:'Defence',maxMarks:20,co:'CO4',descriptors:Array(6).fill('Review 2 defence')}];
  f.today(20022);assert.throws(()=>f.c.loadReviewEvaluation_('T1','review2'),/Opens/);f.today(20023);
  const d=f.c.loadReviewEvaluation_('T1','review2');assert.equal(d.config.weight,.3);assert.equal(d.config.criteria[0].pi,'R2T');assert.equal(d.config.criteria[0].descriptors[0],'Review 2 implementation');
  const input={...f.staffInput(0),token:d.token,teamScores:{R2T:{level:3,marks:64,remark:''}},students:f.students.map(s=>({register:s.regNo.toLowerCase(),absence:{type:'NORMAL'},scores:{R2I:{level:3,marks:16,remark:''}}}))};
  f.c.submitReviewEvaluation_({...(input),assessmentId:'review2'});assert.equal(f.c.loadReviewEvaluation_('T1','review2').evaluation.students[0].weighted,24);
  f.actor('coord@x');f.c.publishInternalAssessment_({...(f.staffInput(1)),assessmentId:'review2'});f.actor('one@x');
  assert.equal(f.c.loadPublishedReviewEvaluation_('review2').total,80);assert.equal(f.c.loadPublishedReviewEvaluation_('review1').weighted,16);
  assert.equal(JSON.stringify(f.tables.Review1Evaluations),before);
  assert.equal(f.tables.Review2Evaluations.length,4);
});

test('Review 2 setup validation is read-only and repeatable, and rejects wrong history headers',()=>{
  const f=absenceFixture('review2'),before=JSON.stringify(f.tables);
  f.load();f.load();assert.equal(JSON.stringify(f.tables),before);
  f.tables.Review2Evaluations[0][2]='Wrong';assert.throws(f.load,/Incompatible journal Review2Evaluations/);
  assert.equal(f.tables.Review2Evaluations[0][2],'Wrong');
});




for(const key of ['review1','review2']) {
}


test('completed Normal students have no absence correction or academic decision actions',()=>{
  for(const key of ['review1','review2'])for(const published of [false,true]){
    const server=absenceFixture(key);server.submit(server.input());if(published)server.publish();
    const f=browserFixture(true,key);f.api.open('T1',f.trigger);f.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.doesNotMatch(f.drawer.innerHTML,/data-edit-absence|data-record-absence|data-cancel-absence|data-decision=|data-components=|data-record-decision|data-target=/);
    assert(Object.entries(f.absenceNodes().get('0').controls).filter(([k])=>k!=='reason').every(([,c])=>c.disabled));
  }
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
}


for(const key of ['review2','review3','design_gate'])test(key+' browser passes its instance ID directly to generic RPCs',()=>{
  const f=browserFixture(true,key);f.api.open('T1',f.trigger);assert.equal(f.requests[0].name,'loadReviewEvaluation_');
  assert.deepEqual(Array.from(f.requests[0].args),['T1',key]);
  f.data.config.key=key;f.data.config.label='Configured Review';f.requests[0].success(f.data);
  assert.match(f.drawer.innerHTML,/Configured Review<\/span>/);
  f.click('data-draft');assert.equal(f.requests[1].name,'saveReviewEvaluationDraft_');assert.equal(f.requests[1].args[0].assessmentId,key);
});

test('shared engine requires an explicit assessment instead of silently selecting Review 1',()=>{
  const f=fixture();assert.throws(()=>f.c.reviewConfiguration_(),/Unknown assessment/);
  assert.throws(()=>f.c.loadReviewEvaluation_('T1'),/Unknown assessment/);
});

test('pending effective criterion marks remain null in published APIs, including policy zeros',()=>{
  for(const approved of [true,false]){
    const f=absenceFixture(),input=f.input();input.students[0].absence=absence('REVIEW_DAY_ABSENCE',approved);input.students[0].scores={};f.submit(input);f.publish();f.actor('one@x');
    const result=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(result.scores.I.marks,approved?null:0);assert.equal(result.scores.T.marks,48);
  }
});


test('review refresh retains entries on failure, deduplicates requests and settles loading on retry and close',async ()=>{
  const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  f.fields()[0].controls['[data-level]'].value='3';f.fields()[0].controls['[data-marks]'].value='48';f.events.input();
  const field=f.fields()[0];f.api.open('T1',f.trigger);f.api.open('T1',f.trigger);await f.click('data-draft');assert.equal(f.requests.length,2);
  assert.equal(f.loading.begun,1);f.requests[1].failure({message:'Offline'});assert.equal(f.loading.settled,1);
  assert.equal(f.fields()[0],field);assert.equal(field.controls['[data-marks]'].value,'48');assert.match(f.status.textContent,/retained/);
  f.api.open('T1',f.trigger);f.requests[2].success(f.data);assert.equal(f.loading.settled,2);
  f.api.open('T1',f.trigger);await f.click('data-close');assert.equal(f.loading.settled,3);
  f.requests[3].success(f.data);assert.equal(f.drawer.open,false);assert.equal(f.loading.settled,3);
});

test('drawer ignores stale responses after close and escapes project text',async ()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);await f.click('data-close');f.requests[0].success(f.data);assert.equal(f.drawer.open,false);assert(!f.drawer.innerHTML.includes('Team criteria'));
  f.api.open('T1',f.trigger);f.data.details.title='<script>bad</script>';f.requests[1].success(f.data);assert.match(f.drawer.innerHTML,/&lt;script&gt;/);assert.equal(f.fields().length,3);
});
test('criteria accordions start collapsed, open exclusively, and reveal missing entries',async ()=>{
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
  f.fields()[0].closest=()=>groups[0];await f.click('data-submit');assert.equal(groups[0].open,true);assert.equal(f.requests.length,1);
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

test('drawer retains failed entries, deduplicates saves and reuses retry request IDs',async ()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  await f.click('data-draft');await f.click('data-draft');await f.click('data-close');assert.equal(f.requests.length,2);assert.equal(f.drawer.open,true);
  const first=f.requests[1];first.failure({message:'Offline'});assert.match(f.status.textContent,/entries are retained/);
  await f.click('data-draft');assert.equal(f.requests[2].args[0].requestId,first.args[0].requestId);
  f.requests[2].success({revision:1,status:'Draft'});assert.match(f.status.textContent,/Draft saved/);
  await f.click('data-draft');assert.equal(f.requests[3].args[0].revision,1);assert.notEqual(f.requests[3].args[0].requestId,first.args[0].requestId);
});
test('drawer validates bands, requires complete submissions and locks after submit',async ()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);await f.click('data-submit');assert.equal(f.requests.length,1);
  for(const field of f.fields()){field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value=field.dataset.owner==='team'?'48':'32';}
  f.fields()[0].controls['[data-marks]'].value='51';f.events.input();await f.click('data-submit');assert.equal(f.requests.length,1);
  f.fields()[0].controls['[data-marks]'].value='48';f.events.input();await f.click('data-submit');assert.equal(f.requests[1].name,'submitReviewEvaluation_');
  f.requests[1].success({revision:1,status:'Submitted'});assert(f.fields().every(field=>Object.values(field.controls).every(c=>c.disabled)));assert.doesNotMatch(f.drawer.innerHTML,/data-submit/);
});
test('drawer warns before discarding unsaved edits and restores focus on close',async ()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);f.events.input();f.discard(false);await f.click('data-close');assert.equal(f.drawer.open,true);
  f.discard(true);await f.events.cancel({preventDefault(){}});assert.equal(f.drawer.open,false);assert(f.focus()>0);
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
test('level changes clear saved team and individual marks without assigning replacement scores',async ()=>{
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
  f.discard(false);await f.click('data-close');assert.equal(f.drawer.open,true);
  await f.click('data-submit');assert.equal(f.requests.length,1);
  await f.click('data-draft');const saved=f.requests[1].args[0];assert.equal(saved.teamScores.T.marks,null);assert.equal(saved.students[0].scores.I.marks,null);
  f.requests[1].success({revision:1,status:'Draft'});
  assert.equal(f.fields()[0].controls['[data-marks]'].value,'');
  f.data.evaluation=saved;f.api.open('T1',f.trigger);f.requests[2].success(f.data);
  assert.equal(f.fields()[0].controls['[data-marks]'].value,'');assert.equal(f.fields()[1].controls['[data-marks]'].value,'');
  await f.click('data-submit');assert.equal(f.requests.length,3);
});

test('feedback pills toggle repeatedly without duplicate text and retain stable controls',()=>{
  const f=feedbackFixture(),pill=f.pills()[1];f.toggle(1);const suggestion=f.remark.value;
  assert.match(pill.innerHTML,/lucide-check/);assert(pill.innerHTML.endsWith(' '+suggestion));assert.equal(pill.title,'Remove this feedback');
  for(let i=0;i<10;i++){f.toggle(1);assert.equal(f.remark.value,'');f.toggle(1);assert.equal(f.remark.value,suggestion);}
  assert.equal(f.pills()[1],pill);assert.equal(pill.disabled,false);
  f.toggle(1);assert.match(pill.innerHTML,/lucide-plus/);assert(pill.innerHTML.endsWith(' '+suggestion));assert.equal(pill.title,'Add this feedback');
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
test('deselecting the last required feedback prevents submission until feedback is restored',async ()=>{
  const f=feedbackFixture();f.pick(1);f.field.controls['[data-marks]'].value='30';
  for(const field of f.fields().slice(1)){field.controls['[data-level]'].value='3';field.controls['[data-marks]'].value='32';}
  f.toggle(1);f.toggle(1);await f.click('data-submit');assert.equal(f.requests.length,1);
  f.toggle(1);await f.click('data-submit');assert.equal(f.requests[1].name,'submitReviewEvaluation_');
});


test('approval hides only when irrelevant and returns when attendance or contribution changes',()=>{
 const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
 const host=f.absenceNodes().get('0');
 host.controls.type.value='PROLONGED';host.controls.contribution.value='no';host.controls.attended.value='yes';host.controls.approved.value='';f.events.input();
 assert.equal(host.nodes['[data-approval-field]'].hidden,true);assert.equal(host.controls.approved.disabled,true);
 host.controls.contribution.value='yes';f.events.input();assert.equal(host.nodes['[data-approval-field]'].hidden,false);assert.equal(host.controls.approved.disabled,false);
 host.controls.contribution.value='no';host.controls.attended.value='no';f.events.input();assert.equal(host.nodes['[data-approval-field]'].hidden,false);
 host.controls.type.value='REVIEW_DAY_ABSENCE';f.events.input();assert.equal(host.nodes['[data-approval-field]'].hidden,false);
});

test('review submission accepts irrelevant blank approval and retains individual marks',()=>{
 const f=fixture(),input=f.input();input.students[0].absence={type:'PROLONGED',verifiedContribution:false,attended:true,approved:null};
 f.c.submitReviewEvaluation_({...input,assessmentId:'review1'});
 const student=f.load().evaluation.students[0];assert.equal(student.assessment.teamMark,0);assert.equal(student.assessment.individualMark,32);assert.equal(student.assessment.completed,true);
});

for(const key of ['review1','review2'])test(key+' approved absence evidence survives submission and reload',()=>{
 const f=absenceFixture(key),input=f.input();
 input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,supportingEvidence:['MEDICAL_DOCUMENT','OTHER'],otherEvidenceText:' Hospital confirmation '};input.students[0].scores={};
 f.submit(input);const student=f.student();
 assert.deepEqual(Array.from(student.assessment.facts.supportingEvidence),['MEDICAL_DOCUMENT','OTHER']);assert.equal(student.assessment.facts.otherEvidenceText,'Hospital confirmation');assert.equal(student.assessment.status,'MAKEUP_PENDING');
 const b=browserFixture(true,key);b.api.open('T1',b.trigger);b.requests[0].success(JSON.parse(JSON.stringify(f.load())));
 const evidence=b.absenceNodes().get('0').nodes['[data-absence-evidence]'];assert.equal(evidence.hidden,false);assert.deepEqual(evidence.options.filter(n=>n.checked).map(n=>n.value),['MEDICAL_DOCUMENT','OTHER']);assert.equal(evidence.querySelector('[data-other-evidence]').value,'Hospital confirmation');
});
test('other absence evidence needs a description on submission',()=>{
 const f=fixture(),input=f.input();input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,supportingEvidence:['OTHER'],otherEvidenceText:'  '};input.students[0].scores={};
 assert.throws(()=>f.c.submitReviewEvaluation_({...input,assessmentId:'review1'}),/Describe the other supporting absence evidence/);assert.equal(f.load().revision,0);
});
test('absence evidence appears for approved absences and hides when irrelevant',()=>{
 const f=browserFixture(true);f.api.open('T1',f.trigger);f.requests[0].success(f.data);
 const host=f.absenceNodes().get('0'),evidence=host.nodes['[data-absence-evidence]'];
 host.controls.type.value='REVIEW_DAY_ABSENCE';host.controls.approved.value='yes';f.events.input();assert.equal(evidence.hidden,false);
 evidence.options[2].checked=true;f.events.input();assert.equal(evidence.querySelector('[data-other-evidence-label]').hidden,false);
 host.controls.approved.value='no';f.events.input();assert.equal(evidence.hidden,true);assert(evidence.options.every(n=>n.disabled));
 host.controls.type.value='PROLONGED';host.controls.approved.value='yes';host.controls.contribution.value='no';host.controls.attended.value='yes';f.events.input();assert.equal(evidence.hidden,true);
 host.controls.attended.value='no';f.events.input();assert.equal(evidence.hidden,false);
});


function correctionInput(f,absence,extra={}) {
  const data=f.load();
  return {assessmentId:f.key,team:'T1',student:'s1',revision:data.revision,token:data.token,requestId:crypto.randomUUID(),absence,...extra};
}
function submittedAbsence(key='review1',facts={type:'REVIEW_DAY_ABSENCE',approved:true}) {
  const f=absenceFixture(key),input=f.input();input.students[0].absence=facts;
  if(!facts.attended)input.students[0].scores={};
  f.submit(input);return f;
}
for(const key of ['review1','review2','review_extra']) {
  test(key+' absence correction appends an isolated audited revision and supports exact retry',()=>{
    const f=submittedAbsence(key),before=f.load().evaluation,request=correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:false});
    const result=f.c.recordReviewAbsence_(request),after=f.load().evaluation;
    assert.equal(result.revision,before.revision+1);assert.equal(result.status,'Submitted');
    assert.equal(after.students[0].total,48);assert.equal(after.students[0].needsPublication,true);
    for(const field of ['teamScores','submittedAt','submittedDay','late','config','roster'])assert.equal(JSON.stringify(after[field]),JSON.stringify(before[field]));
    assert.equal(JSON.stringify(after.students[1]),JSON.stringify(before.students[1]));
    assert.equal(JSON.stringify(after.students[0].scores),JSON.stringify(before.students[0].scores));
    const event=after.students[0].assessment.events.at(-1);
    assert.equal(event.action,'absenceCorrection');assert.equal(event.actor,'reviewer@x');assert.equal(event.requestId,request.requestId);assert(event.at);
    assert.equal(event.before.facts.approved,true);assert.equal(event.after.facts.approved,false);
    assert.equal(event.before.outcome.total,null);assert.equal(event.after.outcome.total,48);assert.equal(event.reason,undefined);
    assert.equal(f.c.recordReviewAbsence_(request).revision,after.revision);assert.equal(f.load().revision,after.revision);
    assert.throws(()=>f.c.recordReviewAbsence_({...request,absence:{type:'REVIEW_DAY_ABSENCE',approved:true}}),/different data/);
  });
  test(key+' absence correction keeps published results frozen until republication',()=>{
    const f=submittedAbsence(key,{type:'REVIEW_DAY_ABSENCE',approved:false});f.publish();
    f.actor('one@x');const released=f.c.loadPublishedReviewEvaluation_(key);f.actor('reviewer@x');
    const before=f.load().evaluation;
    f.c.recordReviewAbsence_(correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:true}));
    assert.equal(JSON.stringify(f.load().evaluation.students[1]),JSON.stringify(before.students[1]));
    f.actor('one@x');const waiting=f.c.loadPublishedReviewEvaluation_(key);
    assert.equal(waiting.total,released.total);assert.equal(waiting.publication.sourceRevision,released.publication.sourceRevision);assert.equal(waiting.updatePending,true);
    f.actor('two@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).updatePending,false);f.actor('reviewer@x');
    const sourceRevision=f.load().revision;f.publish('s1');f.actor('one@x');
    const updated=f.c.loadPublishedReviewEvaluation_(key);assert.equal(updated.total,null);assert.equal(updated.publication.sourceRevision,sourceRevision);assert.equal(updated.updatePending,false);
  });
  test(key+' absence correction UI saves, retries, cancels and preserves refresh failures',async()=>{
    const server=submittedAbsence(key),b=browserFixture(true,key);b.api.open('T1',b.trigger);b.requests[0].success(JSON.parse(JSON.stringify(server.load())));
    assert.match(b.drawer.innerHTML,/Edit absence details/);await b.click('data-edit-absence');
    assert.equal(b.drawer.innerHTML.includes('Conduct Makeup Assessment'),false);
    let host=b.absenceNodes().get('0');assert.equal(host.controls.approved.disabled,false);
    assert(b.fields().every(field=>field.controls['[data-marks]'].disabled));
    host.controls.approved.value='no';b.events.input();assert.equal(b.drawer.querySelector('[data-summary-unsaved]').hidden,false);
    assert.match(b.drawer.querySelector('[data-summary-values="0"]').innerHTML,/48/);
    await b.click('data-record-absence');const first=b.requests[1];assert.equal(first.name,'recordReviewAbsence_');assert.equal(first.args[0].assessmentId,key);assert.equal(first.args[0].reason,undefined);
    await b.click('data-record-absence');assert.equal(b.requests.length,2);
    first.failure({message:'Offline'});assert.equal(host.controls.approved.value,'no');assert.equal(host.controls.approved.disabled,false);
    await b.click('data-record-absence');assert.equal(b.requests[2].args[0].requestId,first.args[0].requestId);
    b.requests[2].success(server.c.recordReviewAbsence_(first.args[0]));assert.match(b.drawer.innerHTML,/Edit absence details/);
    assert.equal(b.absenceNodes().get('0').controls.approved.disabled,true);
    await b.click('data-edit-absence');host=b.absenceNodes().get('0');host.controls.approved.value='yes';b.events.input();
    b.discard(false);await b.click('data-cancel-absence');assert.equal(host.controls.approved.value,'yes');await b.click('data-close');assert.equal(b.drawer.open,true);
    b.discard(true);await b.click('data-reload');b.requests.at(-1).failure({message:'Unavailable'});
    assert.equal(b.absenceNodes().get('0').controls.approved.value,'yes');assert.equal(host.controls.approved.disabled,false);assert.equal(b.loading.begun,b.loading.settled);
    await b.click('data-cancel-absence');assert.equal(b.absenceNodes().get('0').controls.approved.value,'no');
  });
}
test('absence correction enforces authorization, eligibility, concurrency and payload boundaries',()=>{
  const f=submittedAbsence(),request=correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:false}),revision=f.load().revision;
  for(const actor of ['coord@x','guide@x','outsider@x']){f.actor(actor);assert.throws(()=>f.c.recordReviewAbsence_(request),/assigned reviewer/);}
  f.actor('reviewer@x');
  for(const extra of [{student:'s2'},{student:'missing'},{revision:0},{token:'stale'},{scores:{}},{teamScores:{}},{makeup:{}},{decision:'OTHER'},{absence:{type:'UNSELECTED'}},{absence:{type:'REVIEW_DAY_ABSENCE',approved:true,supportingEvidence:['OTHER'],otherEvidenceText:''}}])assert.throws(()=>f.c.recordReviewAbsence_({...request,...extra}));
  f.lock(false);assert.throws(()=>f.c.recordReviewAbsence_(request),/saving/);f.lock(true);
  f.reviews[0].weight++;assert.throws(()=>f.c.recordReviewAbsence_(request),/CONFIGURATION_CHANGED/);f.reviews[0].weight--;
  f.students.push({regNo:'s3',name:'Three',email:'three@x'});assert.throws(()=>f.c.recordReviewAbsence_(request),/ROSTER_CHANGED/);f.students.pop();
  assert.equal(f.load().revision,revision);assert.equal(f.locked(),false);
  const draft=absenceFixture();assert.throws(()=>draft.c.recordReviewAbsence_(correctionInput(draft,{type:'REVIEW_DAY_ABSENCE',approved:true})),/Submit the evaluation/);
});
for(const key of ['review1','review2','review_extra'])test(key+' corrected approved absence shows submitted makeup criteria after reload',async()=>{
  const server=submittedAbsence(key,{type:'REVIEW_DAY_ABSENCE',approved:false});
  const before=server.load().evaluation;
  server.c.recordReviewAbsence_(correctionInput(server,{type:'REVIEW_DAY_ABSENCE',approved:true}));
  const scores={I:{level:3,marks:32,remark:'Makeup viva completed'}};
  server.c.submitReviewMakeup_({...correctionInput(server,{}),absence:undefined,scores});
  const b=browserFixture(true,key);b.api.open('T1',b.trigger);
  b.requests[0].success(JSON.parse(JSON.stringify(server.load())));
  const check=()=>{
    const field=b.fields().find(f=>f.dataset.owner==='0');
    assert.equal(field.hidden,false);
    assert.equal(field.controls['[data-level]'].value,'3');
    assert.equal(field.controls['[data-marks]'].value,'32');
    assert.equal(field.controls['[data-remark]'].value,scores.I.remark);
    assert.equal(field.controls['[data-marks]'].disabled,true);
    assert.equal(field.controls['[data-level]'].disabled,true);
    assert.doesNotMatch(b.drawer.innerHTML,/data-target="0"/);
  };
  check();await b.click('data-reload');b.requests.at(-1).success(JSON.parse(JSON.stringify(server.load())));check();
  assert.equal(JSON.stringify(server.student().scores),JSON.stringify(before.students[0].scores));
  assert.equal(JSON.stringify(server.load().evaluation.teamScores),JSON.stringify(before.teamScores));
  assert.equal(JSON.stringify(server.load().evaluation.students[1]),JSON.stringify(before.students[1]));
  server.c.recordReviewAbsence_(correctionInput(server,{type:'REVIEW_DAY_ABSENCE',approved:false}));
  await b.click('data-reload');b.requests.at(-1).success(JSON.parse(JSON.stringify(server.load())));
  assert.equal(b.fields().find(f=>f.dataset.owner==='0').hidden,true);
  assert.equal(server.student().assessment.individualMark,0);
});

test('absence corrections preserve makeup drafts and completed provenance as applicability changes',()=>{
  const f=submittedAbsence(),scores={I:{level:3,marks:32,remark:''}};
  f.c.saveReviewMakeupDraft_({...correctionInput(f,{}),absence:undefined,scores});
  const draft=JSON.stringify(f.student().assessment.makeupDraft);
  f.c.recordReviewAbsence_(correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:false}));assert.equal(JSON.stringify(f.student().assessment.makeupDraft),draft);
  f.c.recordReviewAbsence_(correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:true}));
  f.c.submitReviewMakeup_({...correctionInput(f,{}),absence:undefined,scores});
  const makeup=JSON.stringify(f.student().assessment.makeup),events=JSON.stringify(f.student().assessment.events);
  f.c.recordReviewAbsence_(correctionInput(f,{type:'PROLONGED',approved:true,verifiedContribution:false,attended:false}));assert.equal(f.student().total,32);
  f.c.recordReviewAbsence_(correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:false}));assert.equal(f.student().total,48);
  f.c.recordReviewAbsence_(correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:true,supportingEvidence:['OTHER'],otherEvidenceText:'Permission checked'}));assert.equal(f.student().total,80);
  assert.equal(JSON.stringify(f.student().assessment.makeup),makeup);assert.equal(JSON.stringify(f.student().assessment.events.slice(0,JSON.parse(events).length)),events);
  assert.throws(()=>f.c.recordReviewAbsence_(correctionInput(f,{type:'NORMAL'})),/coordinator to reopen/);
  assert.throws(()=>f.c.recordReviewAbsence_(correctionInput(f,{type:'PROLONGED',approved:true,verifiedContribution:true,attended:true})),/coordinator to reopen/);
});
test('attended absence can become normal using existing normal scores; evidence-only edits retain outcomes',()=>{
  const f=submittedAbsence('review1',{type:'PROLONGED',approved:true,verifiedContribution:true,attended:true}),before=f.student();
  f.c.recordReviewAbsence_(correctionInput(f,{...before.assessment.facts,supportingEvidence:['MEDICAL_DOCUMENT']}));assert.equal(f.student().total,before.total);
  f.c.recordReviewAbsence_(correctionInput(f,{type:'NORMAL'}));assert.equal(f.student().total,80);assert.equal(JSON.stringify(f.student().scores),JSON.stringify(before.scores));
  assert.throws(()=>f.c.recordReviewAbsence_(correctionInput(f,{type:'REVIEW_DAY_ABSENCE',approved:true})),/existing absences/);
});


test('correction UI validates facts and evidence without sending invalid saves',async()=>{
  const server=submittedAbsence(),b=browserFixture(true);b.api.open('T1',b.trigger);b.requests[0].success(JSON.parse(JSON.stringify(server.load())));await b.click('data-edit-absence');
  const host=b.absenceNodes().get('0');
  for(const type of ['','NORMAL']){host.controls.type.value=type;b.events.input();await b.click('data-record-absence');assert.equal(b.requests.length,1);}
  host.controls.type.value='REVIEW_DAY_ABSENCE';const evidence=host.nodes['[data-absence-evidence]'];evidence.options.find(n=>n.value==='OTHER').checked=true;b.events.input();await b.click('data-record-absence');assert.equal(b.requests.length,1);assert.match(b.status.textContent,/Describe/);
  evidence.querySelector('[data-other-evidence]').value='Reviewed permission';b.events.input();await b.click('data-record-absence');assert.equal(b.requests.length,2);
  assert.deepEqual(Array.from(b.requests[1].args[0].absence.supportingEvidence),['OTHER']);
});
test('completed absence remains accessible alongside pending makeup; student switching confirms discard',async()=>{
  // A finalized fixture with one pending and one completed absence.
  const f=absenceFixture(),data=f.input();data.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true};data.students[0].scores={};data.students[1].absence={type:'REVIEW_DAY_ABSENCE',approved:false};data.students[1].scores={};f.submit(data);
  const b=browserFixture(true);b.api.open('T1',b.trigger);b.requests[0].success(JSON.parse(JSON.stringify(f.load())));
  assert.match(b.drawer.innerHTML,/<li><button[^>]*data-select-student="1"/);
  const switchStudent=()=>{const button={dataset:{selectStudent:'1'},hasAttribute:k=>k==='data-select-student',closest:selector=>selector==='button'?button:null};return b.events.click({target:button});};
  await b.click('data-edit-absence');b.absenceNodes().get('0').controls.approved.value='no';b.events.input();
  b.discard(false);await switchStudent();assert.match(b.drawer.innerHTML,/data-record-absence="0"/);assert.equal(b.absenceNodes().get('0').controls.approved.value,'no');
  b.discard(true);await switchStudent();assert.equal(b.drawer.innerHTML.includes('data-record-absence'),false);assert.equal(b.absenceNodes().get('0').controls.approved.value,'yes');
  assert.match(b.drawer.innerHTML,/data-select-student="1" aria-pressed="true"/);
});

test('the drawer reads and saves through the bridge, and its markup uses only compiled Tailwind utilities', () => {
  const { missingClasses } = require('./compiled-css.cjs');
  const src = fs.readFileSync('review-evaluation-client.js', 'utf8');
  assert.doesNotMatch(src, /google\.script\.run|guideRun|rpc\(/);
  assert.match(src, /bridge\.read\('review-evaluation:'\+reviewKey,'API_review_getEvaluation'/);
  assert.match(src, /bridge\.write\('API_review_save'/);
  assert.match(src, /ReviewAssessmentBrowser\(key,DataBridge\)/);
  const names = [...src.matchAll(/\b(?:SMALL|BUTTON|PRIMARY|SEGMENTED|PILL|LEVEL|TAB|CHIP|FIELD|LABEL)='([^']+)'/g)].flatMap(m => m[1].split(/\s+/));
  assert.deepEqual(missingClasses(names), []);
  const f = browserFixture(true, 'review1'); f.api.open('T1', f.trigger); f.requests[0].success(f.data);
  const html = f.drawer.innerHTML;
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(html, /class="(?:btn|tile|tab|card|segmented|avatar)\b/);
  const used = [...html.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)).filter(c => c && !/^(review-|team-drawer|lucide)/.test(c));
  assert.deepEqual(missingClasses(used), []);
});

// Student names, rubric text and reviewer remarks all reach the Review drawer; none may become markup.
const EVIL='<img src=x onerror=PWN>"\'&';
function assertInert(html,label){
  assert(!/<img/i.test(html),label+': a tag from data became markup');
  assert(!/PWN>/i.test(html),label+': an unescaped payload reached the page');
  assert(/&lt;img src=x onerror=PWN&gt;/i.test(html),label+': the hostile text should be displayed, escaped');
  {const rest=html.replace(/&lt;img[^&]*&gt;/gi,''),hit=rest.match(/.{40}\son(?:error|click|load)=.{40}/i);assert(!hit,label+': an event-handler attribute appeared: '+(hit&&hit[0]));}
}
test('hostile names, rubric text and reviewer details never become markup in the Review drawer',()=>{
  const f=browserFixture(true,'review1'),data=f.data;
  Object.assign(data.details,{team:EVIL,title:EVIL,problem:EVIL,committee:EVIL,guideName:EVIL,guideEmail:EVIL});
  data.details.reviewers=[{name:EVIL,email:EVIL}];
  data.roster.students.forEach(student=>{student.name=EVIL;student.email=EVIL;});
  data.config.label=EVIL;
  data.config.criteria.forEach(criterion=>{criterion.name=EVIL;criterion.co=EVIL;criterion.descriptors=criterion.descriptors.map(()=>EVIL);});
  f.api.open('T1',f.trigger);f.requests[0].success(data);
  assertInert(f.drawer.innerHTML,'loaded evaluation');
});
test('hostile remarks and the reopening reason are escaped when a saved evaluation is shown',()=>{
  const f=fixture(),input=f.input();
  input.teamScores.T={level:3,marks:48,remark:EVIL};
  input.students.forEach(student=>{student.scores.I={level:3,marks:30,remark:EVIL};});
  f.c.submitReviewEvaluation_({...(input),assessmentId:'review1'});
  const saved=JSON.parse(JSON.stringify(f.c.getReviewEvaluation_('T1','review1')));
  if(saved.evaluation)saved.evaluation.reason=EVIL;
  const browser=browserFixture(true,'review1');browser.api.open('T1',browser.trigger);browser.requests[0].success(saved);
  assertInert(browser.drawer.innerHTML,'saved evaluation');
});
