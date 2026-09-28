const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
function setup(){
 const f=publishingFixture(),c=f.c,roster=c.getStudentsFromTeamStatusRow_;
 for(const file of ['marks-tracker.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.getStudentsFromTeamStatusRow_=roster;
 c.getCommitteeNumbersForReviewer=email=>email==='reviewer@x'?['C1']:[];
 c.SpreadsheetApp.openById=()=>{throw Error('External file access is forbidden');};
 return f;
}
test('role authorization rejects outsiders before assessment access',()=>{
 const f=setup();f.actor('outsider@x');assert.throws(()=>f.c.reviewerTeamContext_('G18'),/not an assigned reviewer/);
 f.actor('reviewer@x');assert.equal(f.c.reviewerTeamContext_('G18').team,'G18');
});
test('generic Review load and save enforce title approval and reject unknown instances',()=>{
 const f=setup(),input=f.input();f.row[3]='';assert.throws(()=>f.c.loadReviewEvaluation('G18','review1'),/title|Approve/i);
 assert.throws(()=>f.c.submitReviewEvaluation({...input,assessmentId:'review1'}),/title|Approve/i);
 assert.throws(()=>f.c.loadReviewEvaluation('G18','unconfigured'),/Unknown assessment/);
});
test('reviewer progress reads only registry journals and isolates a missing journal',()=>{
 const f=setup(),getSheet=f.c.getSheet;
 f.c.getSheet=name=>name==='Review2Evaluations'?null:getSheet(name);
 f.c.getSpreadsheet=()=>({getSheets:()=>[],getSpreadsheetTimeZone:()=> 'UTC'});
 const progress=f.c.getReviewerReviewProgress_(f.rows);
 assert.equal(progress.teams.g18.review1.available,true);assert.equal(progress.teams.g18.review2.available,false);
 assert.match(progress.teams.g18.review2.error,/Create missing assessment storage/);
});
test('numbered endpoints and legacy level-sheet mutation endpoints are absent',()=>{
 const f=setup();
 for(const name of ['getReviewerEvaluation','saveReviewerEvaluation','reviewerEvaluationContext_','reviewerReviewRows_','getReview1Evaluation','getReview2Evaluation','saveReview1EvaluationDraft','submitReview2Evaluation','publishReview1Evaluation','reopenReview2Evaluation','loadPublishedReview1Evaluation'])assert.equal(f.c[name],undefined,name);
 assert.equal(fs.existsSync('reviewer-evaluation-client.js'),false);
});
