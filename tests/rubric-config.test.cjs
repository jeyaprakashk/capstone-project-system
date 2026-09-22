const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(shared=new Map()) {
 let rows=null, reads=0;
 const sheet={getDataRange:()=>({getValues:()=>{reads++;return rows;}})};
 const c=vm.createContext({SHEET_ID:'test',getSheet:()=>rows?sheet:null,
  CacheService:{getScriptCache:()=>({get:key=>shared.get(key)||null,put:(key,value)=>shared.set(key,value)})}});
require('./milestone-fixture.cjs').install(c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','rubric-config.js'),'utf8'),c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','review-configuration.js'),'utf8'),c);
 function populate() {
  rows=[['Milestone ID','Order','PI','Criterion','CO','Max Marks','Type'],
   ...['review1','review2'].flatMap(review=>Array.from({length:7},(_,i)=>
    [review,i+1,'PI'+(i+1),'Test criterion '+(i+1),'CO1',i===6?10:15,'Team']))];
 }
 return {c,shared,populate,get rows(){return rows;},metrics:()=>({reads})};
}
test('loader returns immutable review criteria from the sheet',()=>{
 const f=fixture();f.populate();
 const rubric=f.c.getRubricStructure_();
 for(const key of ['review1','review2']) {
  assert.equal(rubric[key].length,7);
  assert.equal(rubric[key].reduce((sum,p)=>sum+p.maxMarks,0),100);
  assert(Object.isFrozen(rubric[key]));assert(Object.isFrozen(rubric[key][0]));
 }
 assert(Object.isFrozen(rubric));
});

test('shared rubrics preserve weights and independently validate every graded assessment',()=>{
 const f=fixture();f.populate();
 f.c.definitions[0].weight=12.5;
 f.c.definitions.push({key:'see',label:'SEE',weight:40,gradedBy:'SEE Committee'},
  {key:'formation',label:'Formation',weight:0,gradedBy:'Not Applicable'});
 f.rows[1][3]='<script>example</script>';
 f.rows.find(row=>row[0]==='review2')[5]=-1;
 const data=f.c.getSharedRubricsData_();
 assert.equal(data.assessments.length,3);
 assert.equal(data.assessments[0].weight,12.5);
 assert.equal(data.assessments[0].totalMarks,100);
 assert.equal(data.assessments[0].criteria[0].name,'<script>example</script>');
 assert.equal(data.assessments[0].criteria[0].pi,'PI1');
 assert.equal(data.assessments[1].available,false);
 assert.equal(data.assessments[2].status,'Rubric not configured');
 assert.equal(f.metrics().reads,1);
});

test('shared rubrics handle missing sheets, headers and guide descriptors',()=>{
 const f=fixture();assert(f.c.getSharedRubricsData_().assessments.every(a=>!a.available));f.populate();
 f.c.definitions.push({key:'guide_eval',label:'Guide Eval',weight:20,gradedBy:'Project Guide'});
 f.rows.push(['guide_eval',1,'PI1','Guide criterion','CO1',100,'Individual']);
 assert.equal(f.c.getSharedRubricsData_().assessments.at(-1).available,false);
 f.rows[0].push(...Array.from({length:6},(_,i)=>'Level '+i));f.rows.at(-1).push(...Array(6).fill('Descriptor'));
 assert.equal(f.c.getSharedRubricsData_().assessments.at(-1).criteria[0].descriptors.length,6);
 f.rows[0][0]='Invalid';assert(f.c.getSharedRubricsData_().assessments.every(a=>!a.available));
});

test('shared endpoint authorizes every dashboard role before reading definitions',()=>{
 const f=fixture();f.populate();let email='user@example.com', roles=[];
 f.c.Session={getActiveUser:()=>({getEmail:()=>email})};f.c.withDashboardRead_=fn=>fn();
 f.c.getDashboardRoleViews_=()=>roles;
 for(const role of ['student','guide','reviewer','coord']) {roles=[{key:role}];assert.equal(f.c.loadSharedRubrics().assessments.length,2);}
 roles=[];assert.throws(()=>f.c.loadSharedRubrics(),/Dashboard access/);
 email='';roles=[{key:'student'}];assert.throws(()=>f.c.loadSharedRubrics(),/Dashboard access/);
 assert.equal(f.metrics().reads,4);
});

test('milestone-defined review IDs control requirements',()=>{
 const f=fixture();f.populate();f.c.setReviews(3);
 assert.throws(()=>f.c.getRubricStructure_(),/review3/);
 f.rows.push(...f.rows.filter(row=>row[0]==='review2').map(row=>['review3',...row.slice(1)]));
 assert.equal(Object.keys(f.c.getRubricStructure_()).length,3);
});
test('preflight uses Milestones headers, arbitrary IDs, and live rubric data',()=>{
 const f=fixture();f.populate();
 const milestones=[['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'],['review1','Design review','2026-10-12','Review Committee',25],['review2','Final review','2026-11-23','Review Committee',25]];
 assert.equal(f.c.validateReviewConfigurationRows_(milestones,f.rows,'UTC').valid,true);
 assert.match(f.c.validateReviewConfigurationRows_([...milestones,milestones[1]],f.rows,'UTC').issues[0].message,/Duplicate/);
 milestones[1][2]='invalid';assert.match(f.c.validateReviewConfigurationRows_(milestones,f.rows,'UTC').issues[0].message,/Due Date/);
 milestones[1][2]='2026-10-12';f.rows[1][5]=-1;
 assert.match(f.c.validateReviewConfigurationRows_(milestones,f.rows,'UTC').issues[0].message,/Max Marks/);
});

test('configuration status endpoint rejects unauthorized callers before reading sheets',()=>{
 const f=fixture();
 f.c.Session={getActiveUser:()=>({getEmail:()=> 'outsider@example.com'})};
 f.c.getCoordinatorEmail=()=> 'coordinator@example.com';f.c.getConfig=()=> 'pd@example.com';
 f.c.emailsMatch=(a,b)=>a===b;
 assert.throws(()=>f.c.getCoordinatorReviewConfiguration(),/Coordinator access/);
 assert.equal(f.metrics().reads,0);
});
test('rubrics reuse only within execution and read live data in new requests',()=>{
 const f=fixture();f.populate();f.c.getRubricStructure_();f.c.getRubricStructure_();assert.equal(f.metrics().reads,1);
 assert.equal(f.shared.size,0);
 const next=fixture(f.shared);next.populate();next.rows[1][3]='Updated criterion';
 assert.equal(next.c.getRubricStructure_().review1[0].name,'Updated criterion');
 assert.equal(next.metrics().reads,1);
 assert.throws(()=>fixture(f.shared).c.getRubricStructure_(),/not found/);
});

test('header mapping and explicit ordering support row and column rearrangement',()=>{
 const f=fixture();f.populate();const rows=[f.rows[0],...f.rows.slice(1).reverse()].map(row=>[...row].reverse());
 assert.equal(f.c.parseRubricRows_(rows).review1[0].pi,'PI1');
});
test('invalid or missing definitions fail clearly',()=>{
 const f=fixture();assert.throws(()=>f.c.getRubricStructure_(),/not found/);f.populate();
 for(const [column,value] of [[0,'review3'],[1,0],[2,'wrong'],[3,''],[4,'wrong'],[5,-1],[6,'Other']]){
  const rows=f.rows.map(row=>[...row]);rows[1][column]=value;assert.throws(()=>f.c.parseRubricRows_(rows),/row 2/);
 }
 const duplicate=f.rows.map(row=>[...row]);duplicate[2][2]='PI1';assert.throws(()=>f.c.parseRubricRows_(duplicate),/Duplicate/);
 assert.throws(()=>f.c.parseRubricRows_(f.rows.slice(0,8)),/review2/);
});

test('rubric labels are normalized while criterion wording is preserved',()=>{
 const f=fixture();f.populate();
 f.rows[1][0]=' Review1 ';f.rows[1][2]=' pi1 ';f.rows[1][3]='My Custom TITLE';f.rows[1][4]=' co1 ';f.rows[1][6]=' TEAM ';
 const pi=f.c.parseRubricRows_(f.rows).review1[0];
 assert.equal(pi.pi,'PI1');assert.equal(pi.co,'CO1');assert.equal(pi.type,'Team');assert.equal(pi.name,'My Custom TITLE');
});

test('read-only status requires rubric coverage for every graded assessment',()=>{
 const f=fixture();assert.equal(f.c.getRubricsStatus_().configured,false);f.populate();
 assert.equal(f.c.getRubricsStatus_().configured,true);
 f.c.definitions.push({key:'see',label:'SEE',gradedBy:'SEE Committee'});
 assert.match(f.c.getRubricsStatus_().detail,/Missing rubrics: SEE/);
 f.rows.push(['see',1,'PI1','Example SEE criterion','CO1',100,'Individual']);
 assert.equal(f.c.getRubricsStatus_().configured,true);
 f.rows.at(-1)[5]=-1;assert.equal(f.c.getRubricsStatus_().configured,false);
 f.rows.splice(1);assert.match(f.c.getRubricsStatus_().detail,/no criteria/);
});
test('status ignores ungraded milestones and rejects missing guide descriptors',()=>{
 const f=fixture();f.populate();f.c.definitions.push({key:'formation',gradedBy:'Not Applicable'});
 assert.equal(f.c.getRubricsStatus_().configured,true);
 f.c.definitions.push({key:'guide_eval',label:'Guide Eval',gradedBy:'Project Guide'});
 f.rows.push(['guide_eval',1,'PI1','Example criterion','CO1',100,'Individual']);
 assert.match(f.c.getRubricsStatus_().detail,/Level 0–5/);
 f.rows[0].push(...Array.from({length:6},(_,i)=>'Level '+i));f.rows.at(-1).push(...Array(6).fill('Example descriptor'));
 assert.equal(f.c.getRubricsStatus_().configured,true);
 f.c.definitions=[];assert.equal(f.c.getRubricsStatus_().configured,false);
});
