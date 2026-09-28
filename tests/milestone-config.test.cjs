const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const header=['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'];
function fixture(rows) {
 let reads=0;
 const c=vm.createContext({Date,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})}});
 for(const file of ['common-helpers.js','milestone-config.js','rubric-config.js','assessment-registry.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.getConfig=()=>{throw Error('No Config fallback');};
 c.getSpreadsheet=()=>({getSpreadsheetTimeZone:()=> 'UTC'});
 c.getSheet=name=>name==='Milestones'&&rows?{getDataRange:()=>({getValues:()=>{reads++;return rows;}})}:null;
 return {c,reads:()=>reads};
}
test('Milestones has no assessment storage mapping or review discovery fallback',()=>{
 const {c}=fixture([header,['review1','Old review','2026-10-12','Review Committee',25]]);
 assert.equal(c.committeeReviewTabName_,undefined);
 assert.equal(vm.runInContext('typeof EVALUATION_SHEET_NAMES_',c),'undefined');
 assert.equal(c.getInternalReviewsCount_(),0);
 assert.throws(()=>c.getMilestones_(),/AssessmentDefinitions/);
});
test('non-assessment events retain labels, dates and chronological order, read once',()=>{
 const {c,reads}=fixture([header,['report','Report','2026-11-20','Not Applicable',0],['formation','Team & Git Repo','2026-09-01','Not Applicable','']]);
 assert.deepEqual(Array.from(c.getMilestones_(),r=>r.key),['formation','report']);
 assert.equal(c.getMilestones_()[0].label,'Team & Git Repo');assert.equal(reads(),1);
 assert(c.getMilestones_().every(d=>d.weight===0));
});
test('missing Milestones and obsolete Config headers fail without fallback',()=>{
 assert.throws(()=>fixture(null).c.getMilestones_(),/Milestones tab/);
 assert.throws(()=>fixture([['Key','Value'],['INTERNAL_REVIEWS_COUNT',2]]).c.getMilestones_(),/Milestone ID/);
});
test('lifecycle validation rejects ambiguous IDs, dates, graders and weights',()=>{
 const valid=['design_meeting','Design meeting','2026-10-12','Not Applicable',0];
 for(const [column,value] of [[0,'bad id'],[0,'week1'],[1,''],[2,'2026-02-30'],[3,'Anyone'],[4,-1],[4,101],[4,'25%']]){
  const row=valid.slice();row[column]=value;assert.throws(()=>fixture([header,row]).c.getMilestones_());
 }
 assert.throws(()=>fixture([header,valid,valid]).c.getMilestones_(),/Duplicate/);
 assert.throws(()=>fixture([[...header,'Milestone ID'],valid]).c.getMilestones_(),/exactly one/);
 for(const role of ['Review Committee','Project Guide','SEE Committee'])assert.throws(()=>fixture([header,['assessment','Assessment','2026-10-12',role,25]]).c.getMilestones_(),/AssessmentDefinitions/);
});
test('rubric references are registry-owned and do not require matching milestone IDs',()=>{
 const {c}=fixture([header,['formation','Formation','2026-10-01','Not Applicable',0]]);
 c.requireAssessmentDefinitions_=()=>[{key:'design_gate',rubricReference:'design_rubric'}];
 const h=['Milestone ID','Order','PI','Criterion','CO','Max Marks','Type'];
 const row=['design_rubric',1,'PI1','Reasoning','CO1',40,'Individual'];
 assert.equal(c.parseRubricRows_([h,row]).design_rubric[0].maxMarks,40);
 assert.throws(()=>c.parseRubricRows_([['Review',...h.slice(1)],row]),/Milestone ID/);
 assert.throws(()=>c.parseRubricRows_([h,['formation',...row.slice(1)]]),/rubric reference/);
});
test('date errors identify missing values and exact cells with reordered columns',()=>{
 assert.throws(()=>fixture([header,['formation','Team & Git Repo','','Not Applicable','']]).c.getMilestones_(),/row 2: formation Due Date at C2 is blank/);
 const reordered=['Due Date','Milestone ID','Milestone Name','Graded By','Weight (%)'];
 assert.throws(()=>fixture([reordered,['TBD','formation','Team & Git Repo','Not Applicable','']]).c.getMilestones_(),/formation Due Date at A2.*Received: "TBD"/);
 const {c}=fixture([header,['formation','Team & Git Repo','02/09/2026','Not Applicable','']]);
 assert.equal(c.getMilestones_()[0].day,new Date('2026-09-02T00:00:00Z').getTime()/86400000);
});
