const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const header=['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'];
function fixture(rows) {
 let reads=0;
 const c=vm.createContext({Date,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test'})},
  CacheService:{getScriptCache:()=>{throw Error('No persistent cache');}}
 });
 for(const file of ['common-helpers.js','milestone-config.js','rubric-config.js','review-configuration.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.getConfig=()=>{throw Error('No legacy Config lookup');};
 c.getSpreadsheet=()=>({getSpreadsheetTimeZone:()=> 'UTC'});
 c.getSheet=()=>rows ? {getDataRange:()=>({getValues:()=>{reads++;return rows;}})} : null;
 return {c,reads:()=>reads};
}
test('arbitrary IDs, labels and chronological order define committee reviews only',()=>{
 const rows=[header,['final_demo','Final Demonstration','2026-11-20','Review Committee',30],['formation','Team & Git Repo','2026-09-01','Not Applicable',''],['design_gate','Design Check','2026-10-12',' review committee ',25],['guide_eval','Guide Eval','2026-11-21','Project Guide',20],['see','SEE','2026-11-22','SEE Committee',25]];
 const {c,reads}=fixture(rows);
 assert.equal(c.getInternalReviewsCount_(),2);
 assert.deepEqual(Array.from(c.getInternalReviews_(),r=>r.key),['design_gate','final_demo']);
 assert.equal(c.getInternalReviews_()[0].label,'Design Check');
 assert.equal(c.committeeReviewTabName_('1',c.getInternalReviews_()[0]),'Committee 1 - design_gate');
 assert.equal(reads(),1);
 rows[3][1]='Renamed Design';
 const next=fixture(rows);assert.equal(next.c.getInternalReviews_()[0].label,'Renamed Design');
 assert.equal(next.c.committeeReviewTabName_('1',next.c.getInternalReviews_()[0]),'Committee 1 - design_gate');
});
test('missing Milestones and old Config headers fail without fallback',()=>{
 assert.throws(()=>fixture(null).c.getInternalReviewsCount_(),/Milestones tab/);
 assert.throws(()=>fixture([['Key','Value'],['INTERNAL_REVIEWS_COUNT',2]]).c.getInternalReviews_(),/Milestone ID/);
});
test('milestone validation rejects ambiguous IDs, dates, graders and weights',()=>{
 const valid=['design','Design Check','2026-10-12','Review Committee',25];
 for(const [column,value] of [[0,'bad id'],[0,'week1'],[1,''],[2,'2026-02-30'],[3,'Anyone'],[4,''],[4,-1],[4,101],[4,'25%']]){
  const row=valid.slice();row[column]=value;assert.throws(()=>fixture([header,row]).c.getMilestones_());
 }
 assert.throws(()=>fixture([header,valid,valid]).c.getMilestones_(),/Duplicate/);
 assert.throws(()=>fixture([[...header,'Milestone ID'],valid]).c.getMilestones_(),/exactly one/);
 assert.throws(()=>fixture([header,valid,['other','Other','2026-10-15','Review Committee',80]]).c.getMilestones_(),/100%/);
 assert.throws(()=>fixture([header,['formation','Formation','2026-09-01','Not Applicable',20]]).c.getMilestones_(),/blank or zero/);
});
test('new rubric schema has no legacy Review header or unregistered groups',()=>{
 const {c}=fixture([header,['design','Design Check','2026-10-12','Review Committee',25]]);
 const h=['Milestone ID','Order','PI','Criterion','CO','Max Marks','Type'];
 const row=['design',1,'PI1','Reasoning','CO1',40,'Individual'];
 assert.equal(c.parseRubricRows_([h,row]).design[0].maxMarks,40);
 assert.throws(()=>c.parseRubricRows_([['Review',...h.slice(1)],row]),/Milestone ID/);
 assert.throws(()=>c.parseRubricRows_([h,['review1',...row.slice(1)]]),/graded row/);
});

test('date errors identify missing values and exact cells even with reordered columns',()=>{
 const missing=fixture([header,['formation','Team & Git Repo','','Not Applicable','']]);
 assert.throws(()=>missing.c.getMilestones_(),/row 2: formation Due Date at C2 is blank/);
 const reordered=['Due Date','Milestone ID','Milestone Name','Graded By','Weight (%)'];
 const invalid=fixture([reordered,['TBD','formation','Team & Git Repo','Not Applicable','']]);
 assert.throws(()=>invalid.c.getMilestones_(),/formation Due Date at A2.*Received: "TBD"/);
 const valid=fixture([header,['formation','Team & Git Repo','02/09/2026','Not Applicable','']]);
 assert.equal(valid.c.getMilestones_()[0].day,new Date('2026-09-02T00:00:00Z').getTime()/86400000);
});

test('SEE remains a graded assessment with an optional date',()=>{
 const {c}=fixture([header,['final_exam','SEE','','SEE Committee',30],['design','Design','2026-10-12','Review Committee',25]]);
 const milestones=c.getMilestones_();assert.equal(milestones[1].key,'final_exam');assert.equal(milestones[1].day,null);assert.equal(milestones[1].weight,30);
 assert.throws(()=>fixture([header,['design','Design','','Review Committee',25]]).c.getMilestones_(),/is blank/);
 assert.throws(()=>fixture([header,['final_exam','SEE','invalid','SEE Committee',30]]).c.getMilestones_(),/Received/);
});
