const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
function setup(){
 const f=publishingFixture(),c=f.c,roster=c.getStudentsFromTeamStatusRow_;
 for(const file of ['marks-tracker.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.getStudentsFromTeamStatusRow_=roster;
 c.getCommitteeNumbersForReviewer_=email=>email==='reviewer@x'?['C1']:[];
 c.SpreadsheetApp.openById=()=>{throw Error('External file access is forbidden');};
 return f;
}
test('role authorization rejects outsiders before assessment access',()=>{
 const f=setup();f.actor('outsider@x');assert.throws(()=>f.c.reviewerTeamContext_('G18'),/not an assigned reviewer/);
 f.actor('reviewer@x');assert.equal(f.c.reviewerTeamContext_('G18').team,'G18');
});
test('generic Review load and save enforce title approval and reject unknown instances',()=>{
 const f=setup(),input=f.input();f.row[3]='';assert.throws(()=>f.c.loadReviewEvaluation_('G18','review1'),/title|Approve/i);
 assert.throws(()=>f.c.submitReviewEvaluation_({...input,assessmentId:'review1'}),/title|Approve/i);
 assert.throws(()=>f.c.loadReviewEvaluation_('G18','unconfigured'),/Unknown assessment/);
});
test('reviewer progress reads only registry journals and isolates a missing journal',()=>{
 const f=setup(),getSheet_=f.c.getSheet_;
 f.c.getSheet_=name=>name==='Review2Evaluations'?null:getSheet_(name);
 f.c.getSpreadsheet_=()=>({getSheets:()=>[],getSpreadsheetTimeZone:()=> 'UTC'});
 const progress=f.c.getReviewerReviewProgress_(f.rows);
 assert.equal(progress.teams.g18.review1.available,true);assert.equal(progress.teams.g18.review2.available,false);
 assert.match(progress.teams.g18.review2.error,/Error in Initialization/);
});
test('progress for one Review matches the full result and reads each journal once, not once per team',()=>{
 const f=setup(),c=f.c,reads={};
 const records=c.reviewRecords_;c.reviewRecords_=key=>{reads[key]=(reads[key]||0)+1;return records(key);};
 const full=c.getReviewerReviewProgress_(f.rows),before={...reads};
 assert(Object.values(before).every(n=>n===1),'every journal is read once for the whole cohort: '+JSON.stringify(before));
 for(const key of Object.keys(before))delete reads[key];
 const one=c.getReviewerReviewProgress_(f.rows,'review1');
 for(const team of Object.keys(full.teams))assert.equal(JSON.stringify(one.teams[team]),JSON.stringify({review1:full.teams[team].review1}));
 assert.equal(reads.review2,undefined,'an unrelated Review journal is not read');
});
test('numbered endpoints and legacy level-sheet mutation endpoints are absent',()=>{
 const f=setup();
 for(const name of ['getReviewerEvaluation','saveReviewerEvaluation','reviewerEvaluationContext_','reviewerReviewRows_','getReview1Evaluation','getReview2Evaluation','saveReview1EvaluationDraft','submitReview2Evaluation','publishReview1Evaluation','reopenReview2Evaluation','loadPublishedReview1Evaluation'])assert.equal(f.c[name],undefined,name);
 assert.equal(fs.existsSync('reviewer-evaluation-client.js'),false);
});
