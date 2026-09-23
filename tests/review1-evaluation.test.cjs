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
  assert.throws(()=>f.c.saveReviewerEvaluation('T1','review2',{}),/Complete Review 1/);
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

function browserFixture() {
  const requests=[],events={},status={},totals=[{},{}];let html='',fields=[],buttons=[],focusCount=0,discard=true;
  const control=(value='',kind='input')=>({value,kind,disabled:false,required:false,validity:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},focus(){focusCount++;},setCustomValidity(text){this.validity=text;},matches:()=>kind!=='button'});
  const button=(attr,value,field)=>({kind:'button',dataset:{[attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},attrs:{},setAttribute(k,v){this.attrs[k]=v;},disabled:false,hasAttribute:key=>key===attr,closest(selector){return selector==='[data-index]'?field:this;},focus(){focusCount++;},matches:()=>false});
  const form={addEventListener(){},reportValidity:()=>fields.every(field=>Object.values(field.controls).every(c=>!c.validity && (!c.required || c.value!=='')))};
  const drawer={open:false,dataset:{},setAttribute(){},addEventListener:(name,fn)=>events[name]=fn,showModal(){this.open=true;},close(){this.open=false;},
    set innerHTML(value){html=value;fields=[];buttons=[];
      for(const match of value.matchAll(/<button[^>]*(data-(?:close|draft|submit|reload))[^>]*>/g))buttons.push(button(match[1]));
      for(const match of value.matchAll(/<fieldset[^>]*data-index="(\d+)" data-owner="([^"]+)"[^>]*>([\s\S]*?)<\/fieldset>/g)){
        const controls={'[data-level]':control((match[3].match(/<option value="(\d+)" selected/)||[])[1]||'','select'),'[data-marks]':control((match[3].match(/step="0.5" value="([^"]*)"/)||[])[1]||''),'[data-remark]':control((match[3].match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)||[])[1]||'','textarea'),'[data-marks-slider]':control('0','range')};
        const nodes={'[data-range]':{},'[data-descriptor]':{},'[data-feedback-required]':{},'[data-marks-error]':{},'[data-awarded-total]':{}};
        const field={dataset:{index:match[1],owner:match[2]},controls,buttons:[],querySelector(selector){return controls[selector]||nodes[selector]||this.querySelectorAll(selector)[0];},querySelectorAll(selector){return this.buttons.filter(b=>b.hasAttribute(selector.slice(1,-1)));}};
        for(const m of match[3].matchAll(/data-(pick-level|step)="([^"]+)"/g))field.buttons.push(button('data-'+m[1],m[2],field));
        let suggestions='',feedback=[];
        nodes['[data-feedback-options]']={dataset:{},set innerHTML(v){suggestions=v;feedback=Array.from(v.matchAll(/data-feedback="(\d+)"/g),m=>button('data-feedback',m[1],field));},get innerHTML(){return suggestions;},querySelectorAll:()=>feedback};
        fields.push(field);
      }
    },get innerHTML(){return html;},
    querySelector(selector){if(selector==='[data-message]')return status;if(selector==='form')return form;if(selector.startsWith('[data-total='))return totals[Number(selector.match(/\d+/)[0])];return buttons.find(b=>b.hasAttribute(selector.slice(1,-1)));},
    querySelectorAll(selector){if(selector==='[data-index]')return fields;const inputs=fields.flatMap(f=>Object.values(f.controls));return selector.includes('button')?[...buttons,...inputs,...fields.flatMap(f=>[...f.buttons,...f.querySelector('[data-feedback-options]').querySelectorAll('button')])]:inputs;}
  };
  const trigger={isConnected:true,focus(){focusCount++;}};
  function runner(success,failure){return new Proxy({},{get:(_,name)=>name==='withSuccessHandler'?fn=>runner(fn,failure):name==='withFailureHandler'?fn=>runner(success,fn):(...args)=>requests.push({name,args,success,failure})});}
  const c=vm.createContext({console,confirm:()=>discard,prompt:()=>null,window:{crypto,addEventListener(){}},document:{createElement:()=>drawer,body:{appendChild(){},classList:{add(){},remove(){}}},getElementById:()=>null},DashboardUI:{guideRun:()=>runner(),renderSkeleton:()=>'<p>Loading</p>'}});
  vm.runInContext(fs.readFileSync('review1-evaluation-client.js','utf8'),c);const api=c.review1EvaluationBrowser_();
  const click=attr=>events.click({target:buttons.find(b=>b.hasAttribute(attr))});
  const data=JSON.parse(JSON.stringify(fixture().load()));
  return {api,drawer,requests,status,data,trigger,click,events,fields:()=>fields,discard:v=>discard=v,focus:()=>focusCount};
}
test('drawer ignores stale responses after close and escapes project text',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.click('data-close');f.requests[0].success(f.data);assert.equal(f.drawer.open,false);assert(!f.drawer.innerHTML.includes('Team criteria'));
  f.api.open('T1',f.trigger);f.data.details.title='<script>bad</script>';f.requests[1].success(f.data);assert.match(f.drawer.innerHTML,/&lt;script&gt;/);assert.equal(f.fields().length,3);
});
test('criteria accordions start collapsed, open exclusively, and reveal missing entries',()=>{
  const f=browserFixture();f.api.open('T1',f.trigger);f.requests[0].success(f.data);
  const markup=Array.from(f.drawer.innerHTML.matchAll(/<details[^>]*data-criteria-group[^>]*>/g),m=>m[0]);
  assert.equal(markup.length,2);assert(markup.every(tag=>!tag.includes(' open')));
  assert.match(f.drawer.innerHTML,/<strong>Team Criteria<\/strong>/);assert.match(f.drawer.innerHTML,/<strong>Individual Criteria<\/strong>/);
  assert.match(f.drawer.innerHTML,/common marks that apply to every team member/);assert.match(f.drawer.innerHTML,/separate marks for each student/);
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
  assert.equal(tags.length,2);assert(tags.every(tag=>!tag.includes(' open')));
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
  assert.equal(team.controls['[data-marks]'].value,'48');assert.match(progress.innerHTML,/3 \/ 3/);
  pick(team,3);assert.equal(team.controls['[data-marks]'].value,'48');assert.equal(team.controls['[data-remark]'].value,'Team feedback');
  pick(team,4);assert.equal(team.controls['[data-marks]'].value,'');assert.equal(team.controls['[data-remark]'].value,'');
  assert.equal(team.querySelector('[data-awarded-total]').textContent,'—/60');assert.equal(team.controls['[data-marks-slider]'].value,51);
  assert.equal(f.status.textContent,'Level changed. Enter marks for the selected level.');
  assert.deepEqual(scores.map(s=>s.textContent),['32 / 100','32 / 100']);assert.match(progress.innerHTML,/2 \/ 3/);
  student.controls['[data-level]'].value='0';student.controls['[data-marks]'].value='0';student.controls['[data-remark]'].value='Needs improvement';f.events.input();
  pick(student,0);assert.equal(student.controls['[data-marks]'].value,'0');
  pick(student,1);assert.equal(student.controls['[data-marks]'].value,'');assert.equal(student.controls['[data-remark]'].value,'');
  assert.equal(other.controls['[data-marks]'].value,'32');assert.equal(other.controls['[data-remark]'].value,'Individual feedback');
  assert.deepEqual(scores.map(s=>s.textContent),['— / 100','32 / 100']);assert.match(progress.innerHTML,/1 \/ 3/);
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
