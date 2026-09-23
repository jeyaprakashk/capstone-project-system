const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
function fixture(){
 let actor='guide@x',assigned='guide@x',locked=false,lockAllowed=true;
 const rows=[];const students=[{regNo:'S1',name:'One',email:'s1@x'},{regNo:'S2',name:'Two',email:'s2@x'}];
 const tables={};
 function sheet(name,data){tables[name]=data;return {getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),getLastRow:()=>data.length,getLastColumn:()=>Math.max(0,...data.map(row=>row.length)),getMaxRows:()=>1000,insertRowsAfter(){},getMaxColumns:()=>30,insertColumnsAfter(){},getRange:(r,col,n,w)=>({getValues:()=>data.slice(r-1,r-1+n).map(row=>row.slice(col-1,col-1+w)),setValues:values=>{values.forEach((row,i)=>{data[r-1+i]||=[];row.forEach((v,j)=>data[r-1+i][col-1+j]=v);});}})};}
 const sheets={};let c;
 const context={Date,console,Session:{getActiveUser:()=>({getEmail:()=>actor})},activityIsCoordinator_:email=>email==='coord@x',normalizeText_:v=>String(v??'').trim().toLowerCase(),normalizeEmail:v=>String(v??'').trim().toLowerCase(),emailsMatch:(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),textEquals_:(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),
  SHEET_NAMES:{TEAM_STATUS:'teams'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},getColumnMap:()=>({TEAM_ID:0,GUIDE_EMAIL:1}),getSheetRows:()=>[['T1',assigned]],getStudentsFromTeamStatusRow_:()=>students,
  getSheet:name=>sheets[name]||null,getNamedSheet_:(ss,name)=>sheets[name]||null,getSpreadsheet:()=>({getSpreadsheetTimeZone:()=> 'UTC',insertSheet:name=>(sheets[name]=sheet(name,[]))}),
  getInternalReviews_:()=>[{key:'review1'}],
  projectDay_:v=>{const d=new Date(v);if(!Number.isFinite(d.getTime()))throw Error('Invalid deadline');return Math.floor(d.getTime()/86400000);},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>crypto.createHash('sha256').update(text).digest(),base64EncodeWebSafe:buffer=>buffer.toString('base64url')},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(!lockAllowed)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},SpreadsheetApp:{flush(){}},escapeHtml:v=>String(v)
 };
 c=createSheetReadContext(context);for(const file of ['rubric-config.js','guide-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 sheets.Milestones=sheet('Milestones',[['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'],['guide_eval','Guide Eval','2020-01-01','Project Guide',20]]);
 vm.runInContext(fs.readFileSync('milestone-config.js','utf8'),c);
 c.getMilestones_=()=>c.parseMilestoneRows_(tables.Milestones,'UTC');
 const rubric=[['Milestone ID','Order','PI','Criterion','CO','Max Marks','Type',...Array.from({length:6},(_,i)=>'Level '+i)],...[15,30,20,15,20].map((max,i)=>['Example criterion '+(i+1),['CO5','CO3','CO5','CO4','CO6'][i],max,Array.from({length:6},(_,level)=>'Example descriptor '+level)]).map(([name,co,max,levels],i)=>['guide_eval',i+1,'PI'+(i+1),name,co,max,'Individual',...levels])];
 sheets.Rubrics=sheet('Rubrics',rubric);sheets.GuideEvaluations=sheet('GuideEvaluations',[...[]]);
 tables.GuideEvaluations.push(...[JSON.parse(vm.runInContext('JSON.stringify(GUIDE_EVAL_HEADERS_)',c))]);
 const load=()=>c.loadGuideEvaluation('T1','S1');
 const input=(d=load(),scores)=>({team:'T1',student:'S1',revision:d.revision,token:d.token,requestId:crypto.randomUUID().replace(/-/g,''),scores:scores||Object.fromEntries(d.config.criteria.map(x=>[x.pi,{level:3,marks:x.maxMarks*.8,remark:''}]))});
 return {c,tables,students,load,input,actor:v=>actor=v,assign:v=>assigned=v,lock:v=>lockAllowed=v,locked:()=>locked};
}
test('sheet-provided guide criteria preserve maxima, COs and descriptors',()=>{
 const f=fixture(),d=f.load();assert.deepEqual(Array.from(d.config.criteria,c=>c.maxMarks),[15,30,20,15,20]);assert.deepEqual(Array.from(d.config.criteria,c=>c.co),['CO5','CO3','CO5','CO4','CO6']);assert(d.config.criteria.every(c=>c.descriptors.length===6&&c.descriptors.every(Boolean)));
});
test('all band boundaries, precision, blank and zero are enforced',()=>{
 const f=fixture(),criteria=[{pi:'PI1',maxMarks:100}];const score=(level,marks,remark='reason',complete=true)=>f.c.guideScore_(criteria,{PI1:{level,marks,remark}},complete,.2);
 const bounds=[0,40,60,75,85,95,100];for(let i=0;i<6;i++){assert.equal(score(i,bounds[i]).total,bounds[i]);if(i<5)assert.throws(()=>score(i,bounds[i+1]),/outside/);if(i>0)assert.throws(()=>score(i,bounds[i]-.01),/outside/);}
 assert.equal(score(5,100).total,100);assert.throws(()=>score(5,100.001),/decimals/);assert.throws(()=>score(0,0,''),/remark/);assert.throws(()=>score(null,''),/required/);assert.equal(score(null,'','',false).scores.PI1.marks,null);assert.throws(()=>score(true,50),/level/);
});
test('Level 2 is the target: feedback is mandatory only below Level 2',()=>{
 const f=fixture(),criteria=[{pi:'PI1',maxMarks:100}];
 for(const [level,marks] of [[0,0],[1,40],[2,60],[3,75],[4,85],[5,95]]) {
  const run=()=>f.c.guideScore_(criteria,{PI1:{level,marks,remark:''}},true,.2);
  if(level<2)assert.throws(run,/below Level 2/);else assert.equal(run().total,marks);
 }
});

test('draft submit publish reopen preserve history and privacy',()=>{
 const f=fixture();let d=f.load();const draft=f.input(d);assert.equal(f.c.saveGuideEvaluationDraft(draft).status,'Draft');d=f.load();const submit=f.input(d);const result=f.c.submitGuideEvaluation(submit);assert.equal(result.total,80);assert.equal(result.weighted,16);assert(f.load().evaluation.late);
 assert.throws(()=>f.c.saveGuideEvaluationDraft(f.input()),/locked/);f.actor('s1@x');assert.equal(f.c.loadPublishedGuideEvaluation(),null);
 f.actor('coord@x');let op={team:'T1',student:'S1',revision:2,requestId:'publish_request_123'};f.c.publishGuideEvaluation(op);f.actor('s1@x');assert.equal(f.c.loadPublishedGuideEvaluation().weighted,16);f.actor('s2@x');assert.equal(f.c.loadPublishedGuideEvaluation(),null);
 f.actor('coord@x');assert.throws(()=>f.c.reopenGuideEvaluation({...op,revision:3,requestId:'reopen_request_123'}),/reason/);f.c.reopenGuideEvaluation({...op,revision:3,requestId:'reopen_request_123',reason:'Correction'});f.actor('s1@x');assert.equal(f.c.loadPublishedGuideEvaluation(),null);assert.equal(f.tables.GuideEvaluations.length,5);assert(!f.locked());
});
test('duplicate retries are idempotent, stale writes and request reuse rejected',()=>{
 const f=fixture(),input=f.input();f.c.saveGuideEvaluationDraft(input);f.c.saveGuideEvaluationDraft(input);assert.equal(f.tables.GuideEvaluations.length,2);
 assert.throws(()=>f.c.submitGuideEvaluation(input),/different data/);assert.throws(()=>f.c.saveGuideEvaluationDraft({...input,requestId:'another_request_123'}),/changed/);
 f.lock(false);assert.throws(()=>f.c.saveGuideEvaluationDraft(f.input()),/saving/);
});
test('assignment, rubric and roster changes reject stale saves',()=>{
 const f=fixture(),input=f.input();f.assign('other@x');assert.throws(()=>f.c.saveGuideEvaluationDraft(input),/assigned guide/);f.assign('guide@x');f.students.push({regNo:'S3',email:'s3@x'});assert.throws(()=>f.c.saveGuideEvaluationDraft(input),/Roster or rubric/);f.students.pop();f.tables.Rubrics[1][7]='Changed descriptor';assert.throws(()=>f.c.saveGuideEvaluationDraft(input),/Roster or rubric/);assert.equal(f.tables.GuideEvaluations.length,1);
});
test('coordinator-only actions cannot be called by guides or students',()=>{
 const f=fixture();for(const method of ['publishGuideEvaluation','reopenGuideEvaluation','loadCoordinatorGuideEvaluations'])assert.throws(()=>f.c[method](f.input()),/Coordinator/);f.actor('s1@x');assert.throws(()=>f.load(),/assigned guide/);
});
test('manual storage preserves existing rubric and records, and requires valid configuration',()=>{
 const f=fixture();f.actor('coord@x');const original=JSON.stringify(f.tables.Rubrics);assert.equal(f.c.setupGuideEvaluation,undefined);f.c.guideRecords_();f.c.guideRecords_();assert.equal(JSON.stringify(f.tables.Rubrics),original);assert.equal(f.tables.GuideEvaluations.length,1);
 f.tables.Milestones[1][2]='';assert.equal(f.c.loadCoordinatorGuideEvaluations().ready,false);f.tables.Milestones[1][2]='2020-01-01';f.tables.Rubrics[1][7]='';assert.equal(f.c.loadCoordinatorGuideEvaluations().ready,false);
});
test('guide completion requires every current student to submit',()=>{
 const f=fixture();f.c.submitGuideEvaluation(f.input());f.actor('coord@x');assert.equal(f.c.guideCompletion_().completed,0);f.students.pop();assert.equal(f.c.guideCompletion_().completed,1);
});
test('rubric parser accepts multiple explicitly registered milestone groups',()=>{
 const f=fixture();const h=f.tables.Rubrics[0];const rows=[h,['review1',1,'PI1','Review criterion','CO1',100,'Team'],...f.tables.Rubrics.slice(1)];assert.equal(f.c.parseRubricRows_(rows,[{key:'review1'},{key:'guide_eval'}]).review1.length,1);
});

test('marks use exact criterion band boundaries and server-side totals',()=>{
 const f=fixture(),criteria=[{pi:'PI1',maxMarks:15}];
 const score=marks=>f.c.guideScore_(criteria,{PI1:{level:3,marks,remark:''}},true,.2);
 assert.equal(score('11.25').total,11.25);assert.equal(score('12.74').total,12.74);
 assert.throws(()=>score('11.24'),/outside/);assert.throws(()=>score('12.75'),/outside/);
});
test('publication rejects changed assignments and reopening uses fresh rubric with blank scores',()=>{
 const f=fixture();f.c.submitGuideEvaluation(f.input());f.actor('coord@x');f.assign('new@x');
 assert.throws(()=>f.c.publishGuideEvaluation({team:'T1',student:'S1',revision:1,requestId:'publish_changed_123'}),/Roster changed/);
 f.tables.Rubrics[1][7]='New level zero descriptor';
 f.c.reopenGuideEvaluation({team:'T1',student:'S1',revision:1,requestId:'reopen_changed_123',reason:'Guide reassigned'});
 f.actor('new@x');const d=f.load();assert.equal(d.evaluation.config.criteria[0].descriptors[0],'New level zero descriptor');assert.equal(Object.keys(d.evaluation.scores).length,0);
});
test('validation never seeds missing rubric rows',()=>{
 const f=fixture();const review=['review1',1,'PI1','Existing','CO1',100,'Team'];
 f.tables.Rubrics.splice(1,f.tables.Rubrics.length-1,review);f.actor('coord@x');
 assert.throws(()=>f.c.guideConfiguration_(),/no criteria/);assert.equal(f.tables.Rubrics.length,2);
 assert.equal(f.c.guideSeedCriteria_,undefined);
});

test('browser module serializes as valid standalone script',()=>{
 const c=createSheetReadContext({});vm.runInContext(fs.readFileSync('guide-evaluation-client.js','utf8'),c);new vm.Script(c.getGuideEvaluationClientScript());
});

test('guide weight and criterion maxima come from sheets and changes reject stale edits',()=>{
 const f=fixture(),input=f.input();f.tables.Milestones[1][4]=30;
 assert.throws(()=>f.c.saveGuideEvaluationDraft(input),/Roster or rubric/);
 f.tables.Rubrics.splice(2);f.tables.Rubrics[1][5]=50;
 const d=f.load();assert.equal(d.config.maximum,50);assert.equal(d.config.weight,.3);
 const result=f.c.submitGuideEvaluation(f.input(d));assert.equal(result.total,40);assert.equal(result.weighted,24);
});
