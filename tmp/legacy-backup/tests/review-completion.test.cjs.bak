const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
function setup(){
 const f=publishingFixture(),roster=f.c.getStudentsFromTeamStatusRow_;
 for(const file of ['marks-tracker.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),f.c);
 f.c.getStudentsFromTeamStatusRow_=roster;
 f.c.SpreadsheetApp.openById=()=>{throw Error('Legacy marks access is forbidden');};return f;
}
test('Review discovery uses registry definitions only and never Milestone legacy fallback',()=>{
 const f=setup();f.c.getInternalReviews_=()=>{throw Error('Legacy discovery');};
 assert.deepEqual(Array.from(f.c.getReviewDefinitions_(),d=>d.key),['review1','review2']);
 f.c.getAssessmentDefinitions_=()=>[];assert.throws(()=>f.c.getReviewDefinitions_(),/No REVIEW assessments are configured/);
});
test('bulk and single-team completion agree using submitted academic revisions',()=>{
 const f=setup();f.submit();const all=f.c.getAllReviewCompletionStatus_(),one=f.c.getTeamReviewCompletionStatus_(' G18 ');
 assert.equal(JSON.stringify(all.g18),JSON.stringify(one));assert.equal(one.review1.completed,true);assert.equal(one.review2.completed,false);
 assert.equal(f.c.getTeamReviewCompletionStatus_('missing'),null);
});
test('draft and missing journals cannot falsely complete an assessment',()=>{
 const f=setup();f.c.saveReviewEvaluationDraft({...f.input(),assessmentId:'review1'});
 assert.equal(f.c.getTeamReviewCompletionStatus_('G18').review1.completed,false);
 const get=f.c.getSheet;f.c.getSheet=name=>name==='Review1Evaluations'?null:get(name);
 f.c.getSpreadsheet=()=>({getSheets:()=>[],getSpreadsheetTimeZone:()=> 'UTC'});
 const result=f.c.getTeamReviewCompletionStatus_('G18');assert.equal(result.review1.available,false);assert.equal(result.review2.available,true);
});
test('completion timing reports journal reads without changing results',()=>{
 const f=setup(),timings=[];assert.equal(JSON.stringify(f.c.getAllReviewCompletionStatus_(timings)),JSON.stringify(f.c.getAllReviewCompletionStatus_()));
 assert.equal(timings[0].phase,'review_journal_progress');assert.equal(timings[0].success,true);
});
test('valid zero scores complete a submitted Review through the academic strategy',()=>{
 const f=setup(),input=f.input();input.teamScores.T={level:0,marks:0,remark:'No evidence demonstrated'};
 input.students.forEach(student=>{student.scores.I={level:0,marks:0,remark:'No evidence demonstrated'};});
 f.submit(input);const result=f.c.getTeamReviewCompletionStatus_('G18');assert.equal(result.review1.completed,true);assert.equal(result.review1.markedStudents,3);
});
