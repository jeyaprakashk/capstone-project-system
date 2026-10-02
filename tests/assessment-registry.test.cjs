const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
function setup(){
 const f=publishingFixture(),c=f.c;
 vm.runInContext(fs.readFileSync('rubric-config.js','utf8'),c);
 const headers=Array.from(vm.runInContext('ASSESSMENT_DEFINITION_HEADERS_',c));
 const rows=[headers,...['review1','review2','review3'].map((key,i)=>[key,'REVIEW','Review '+(i+1),i+1,20,'2024-01-01','2024-02-01',i?JSON.stringify([{assessmentId:'review'+i,condition:'RECORDED'}]):'[]','review-attendance-v1','Journal_'+key])];
 const rubrics=[['Assessment ID','Order','PI','Criterion','CO','Max Marks','Type',...Array.from({length:6},(_,i)=>'Level '+i)],...['review1','review2','review3'].flatMap((key,i)=>[[key,1,'PI1','Team','CO1',i===2?80:60,'Team',...Array(6).fill('Descriptor')],[key,2,'PI2','Individual','CO2',i===2?20:40,'Individual',...Array(6).fill('Descriptor')]])];
 const base=c.getSheet,extra={};
 const sheet=(data,name)=>({getName:()=>name,getSheetId:()=>42,getDataRange:()=>({getValues:()=>data.map(r=>r.slice())}),getLastRow:()=>data.findLastIndex(r=>r.some(v=>String(v??'')!==''))+1,getMaxRows:()=>1000,getRange:(r,col,n,w)=>({setValues:values=>values.forEach((row,i)=>data[r-1+i]=row.slice())})});
 extra.AssessmentDefinitions=sheet(rows,'AssessmentDefinitions');extra.Rubrics=sheet(rubrics,'Rubrics');
 c.getSheet=name=>extra[name]||base(name);
 c.getSpreadsheet=()=>({getSpreadsheetTimeZone:()=> 'UTC',getSheets:()=>Object.values(extra),insertSheet:name=>extra[name]=sheet(f.tables[name]=[],name)});
 // Use the real production resolvers, replacing only fixture stubs.
 const source=fs.readFileSync('assessment-registry.js','utf8');
 for(const name of ['getAssessmentDefinitions_','requireAssessmentDefinitions_','assessmentRubric_']){const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start)+2;vm.runInContext(source.slice(start,end),c);}
 return {...f,rows,rubrics,extra,sheet};
}

function coordinatorStorageSetup(){
 const f=setup(),c=f.c;
 const rosterReader=c.getStudentsFromTeamStatusRow_;
 f.extra.Milestones=f.sheet([['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'],['formation','Formation','2024-01-01','Not Applicable','']],'Milestones');
 for(const file of ['milestone-config.js','marks-tracker.js','review-configuration.js','assessment-storage-setup.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.getStudentsFromTeamStatusRow_=rosterReader;
 c.getInternalReviews_=()=>c.getAssessmentDefinitions_().filter(d=>d.type==='REVIEW');
 c.getCoordinatorEmail=()=> 'coord@x';c.getConfig=()=>'';c.SHEET_ID='main';
 c.SpreadsheetApp.openById=()=>{throw Error('Assessment setup must not open an external file');};
 return f;
}

test('Coordinator setup initializes configured journals and supports generic evaluation',()=>{
 const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');
 const before=JSON.stringify(f.tables),readiness=c.getCoordinatorReviewConfiguration();
 assert.equal(readiness.valid,true);assert.equal(readiness.ready,false);assert.equal(readiness.state,'storage-missing');assert.deepEqual(Array.from(readiness.storage,s=>s.state),['MISSING','MISSING','MISSING']);assert.equal(JSON.stringify(f.tables),before);
 f.actor('reviewer@x');assert.throws(()=>c.loadReviewEvaluation('g18',' REVIEW1 '),/Error in Initialization/);assert.equal(JSON.stringify(f.tables),before);
 f.actor('coord@x');const result=c.prepareReviewAssessmentStorage([]);assert.equal(result.journals.length,3);assert(result.journals.every(j=>j.created));
 assert(c.getCoordinatorReviewConfiguration().storage.every(s=>s.state==='READY'));assert.equal(c.getCoordinatorReviewConfiguration().ready,true);
 for(const key of ['review1','review2','review3']){
  f.actor('reviewer@x');const d=c.loadReviewEvaluation('g18',key.toUpperCase());assert.equal(d.config.key,key);
  const input={assessmentId:key,team:'g18',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),teamScores:{PI1:{level:3,marks:d.config.criteria[0].maxMarks*.8,remark:''}},students:d.roster.students.map(s=>({register:s.register,absence:{type:'NORMAL'},scores:{PI2:{level:3,marks:d.config.criteria[1].maxMarks*.8,remark:''}}}))};
  const other=Object.fromEntries(Object.entries(f.tables).filter(([name])=>name!=='Journal_'+key).map(([name,data])=>[name,JSON.stringify(data)]));
  const draft=c.saveReviewEvaluationDraft(input);assert.equal(draft.status,'Draft');
  const current=c.loadReviewEvaluation('g18',key);c.submitReviewEvaluation({...input,revision:current.revision,token:current.token,requestId:crypto.randomUUID()});
  assert.equal(f.tables['Journal_'+key].length,1+d.roster.students.length*2);
  assert(f.tables['Journal_'+key].slice(1).every(row=>row[0]===key));
  for(const [name,snapshot] of Object.entries(other))assert.equal(JSON.stringify(f.tables[name]),snapshot);
 }
 const saved=JSON.stringify(f.tables);f.actor('coord@x');assert(c.prepareReviewAssessmentStorage([]).journals.every(j=>!j.created&&!j.initialized));assert.equal(JSON.stringify(f.tables),saved);
 const progress=c.getReviewerReviewProgress_([f.row]);assert(progress.reviews.every(d=>d.type==='REVIEW'));assert(Object.values(progress.teams.g18).every(s=>s.available));
});

test('missing registry definitions and unconfigured milestone reviews cannot activate legacy marking',()=>{
 for(const empty of [true,false]){
  const f=coordinatorStorageSetup();
  if(empty)f.rows.splice(1);
  else f.extra.Milestones=f.sheet([['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'],['unconfigured','Old Review','2024-02-01','Review Committee',10]],'Milestones');
  f.actor('coord@x');const before=JSON.stringify(f.tables);
  assert.equal(f.c.getCoordinatorReviewConfiguration().valid,false);
  assert.throws(()=>f.c.prepareReviewAssessmentStorage(),/AssessmentDefinitions/);
  assert.equal(JSON.stringify(f.tables),before);
 }
});

test('Coordinator System Status stays available when registry discovery is missing or invalid',()=>{
 for(const state of ['missing','empty','invalid']){
  const f=coordinatorStorageSetup(),c=f.c;
  if(state==='missing')delete f.extra.AssessmentDefinitions;
  if(state==='empty')f.rows.splice(1);
  if(state==='invalid')f.rows[1][8]='unsupported';
  vm.runInContext(fs.readFileSync('coordinator-dashboard.js','utf8'),c);
  c.coordinatorRead_=(_,read)=>read();c.getColumnMap=()=>({});c.getSheetRows=()=>[];
  c.getRepoUrlMap=()=>({});c.getConfig=()=>'';c.buildGithubAccessSection=()=>'';c.renderLucideIcon_=()=>'';
  c.buildTeamPagination_=()=>'';
  const html=c.loadCoordinatorSystemStatus();
  assert.match(html,/id="reviewConfigurationCard"/);
  assert.match(html,/id="createAssessmentDefinitionsButton"/);
  assert.match(html,/id="reviewDefinitionsLink"/);
  assert.match(html,/id="initializeAssessmentStorageButton" disabled/);
  if(state==='invalid')assert.match(html,/Assessment configuration needs attention/);
 }
});

test('empty configured journal initializes once; populated journals and unrelated sheets remain unchanged',()=>{
 const f=coordinatorStorageSetup(),c=f.c;
 f.extra.Journal_review1=f.sheet(f.tables.Journal_review1=[[]],'Journal_review1');
 f.actor('coord@x');assert.equal(c.getCoordinatorReviewConfiguration().storage[0].state,'EMPTY');
 f.actor('reviewer@x');assert.throws(()=>c.loadReviewEvaluation('g18','review1'),/Error in Initialization/);
 f.actor('coord@x');const result=c.prepareReviewAssessmentStorage([]);assert.equal(result.journals[0].initialized,true);assert.equal(result.journals[0].created,false);
 const before=JSON.stringify(f.tables);c.prepareReviewAssessmentStorage([]);assert.equal(JSON.stringify(f.tables),before);
});

test('default journal discovers existing assessment history by identity without a Review-number mapping',()=>{
 const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');c.prepareReviewAssessmentStorage([]);
 f.actor('reviewer@x');const d=c.loadReviewEvaluation('g18','review1');
 c.saveReviewEvaluationDraft({assessmentId:'review1',team:'g18',revision:0,token:d.token,requestId:crypto.randomUUID(),teamScores:{},students:d.roster.students.map(s=>({register:s.register,absence:{type:'NORMAL'},scores:{}}))});
 const data=f.tables.Journal_review1;delete f.extra.Journal_review1;f.extra.ArchivedAssessment=f.sheet(data,'ArchivedAssessment');f.rows[1][9]='';
 const before=JSON.stringify(data),storage=c.assessmentJournal_(c.assessmentDefinition_('review1'));
 assert.equal(storage.name,'ArchivedAssessment');assert.equal(c.loadReviewEvaluation('g18','review1').revision,1);
 f.actor('coord@x');const result=c.prepareReviewAssessmentStorage([]);assert.equal(result.journals[0].journal,'ArchivedAssessment');assert.equal(result.journals[0].created,false);assert.equal(f.extra.Assessment_review1,undefined);assert.equal(JSON.stringify(data),before);
});

test('conflicting bindings, foreign data and ambiguous history fail before creating any journal',()=>{
 for(const kind of ['binding','foreign','ambiguous','headers']){
  const f=coordinatorStorageSetup(),c=f.c,headers=Array.from(vm.runInContext('REVIEW_JOURNAL_HEADERS_',c));
  if(kind==='headers')f.extra.Journal_review3=f.sheet([['Do not overwrite']],'Journal_review3');
  else if(kind==='foreign')f.extra.Journal_review3=f.sheet([headers,['another_assessment','g18','s1',1]],'Journal_review3');
  else {f.extra.OldHistory=f.sheet([headers,['review3','g18','s1',1]],'OldHistory');if(kind==='ambiguous'){f.rows[3][9]='';f.extra.OtherHistory=f.sheet([headers,['review3','g18','s1',1]],'OtherHistory');}}
  f.actor('coord@x');const before=JSON.stringify(f.tables),names=Object.keys(f.extra),readiness=c.getCoordinatorReviewConfiguration();
  assert.equal(readiness.valid,false);assert.equal(readiness.ready,false);assert.equal(readiness.storage.find(s=>s.assessment==='review3').state,'ERROR');
  assert.throws(()=>c.prepareReviewAssessmentStorage([]),/Incompatible|another assessment|Existing history|Multiple journals/);assert.deepEqual(Object.keys(f.extra),names);assert.equal(JSON.stringify(f.tables),before);
 }
});

test('configured journal resolves existing case and whitespace variants without creating a duplicate',()=>{
 const f=coordinatorStorageSetup(),c=f.c,headers=Array.from(vm.runInContext('REVIEW_JOURNAL_HEADERS_',c));
 const existing=f.sheet([headers],' journal_REVIEW1 ');f.extra[' journal_REVIEW1 ']=existing;
 const source=fs.readFileSync('common-helpers.js','utf8'),start=source.indexOf('function getNamedSheet_('),end=source.indexOf('\n}',start)+2;
 vm.runInContext(source.slice(start,end),c);
 const original=c.getSheet;
 c.getSheet=name=>c.getNamedSheet_({getSheetByName:key=>f.extra[key],getSheets:()=>Object.values(f.extra)},name)||original(name);
 f.actor('coord@x');const result=c.prepareReviewAssessmentStorage([]);
 assert.equal(result.journals[0].created,false);assert.equal(result.journals[0].initialized,false);
 assert.equal(f.extra.Journal_review1,undefined);assert.equal(c.assessmentJournal_(c.assessmentDefinition_('review1')).sheet,existing);
});

test('blank-looking formula cells are preserved and block initialization before any writes',()=>{
 const f=coordinatorStorageSetup();
 f.extra.Journal_review3={...f.sheet([['']],'Journal_review3'),getLastRow:()=>1};
 f.actor('coord@x');const names=Object.keys(f.extra),before=JSON.stringify(f.tables);
 assert.throws(()=>f.c.prepareReviewAssessmentStorage([]),/blank-valued cells or formulas/);
 assert.deepEqual(Object.keys(f.extra),names);assert.equal(JSON.stringify(f.tables),before);
});

test('future arbitrary REVIEW IDs use definition-derived default storage through the same setup action',()=>{
 const f=coordinatorStorageSetup();f.rows[3][0]='design_gate';f.rubrics.slice(1).filter(r=>r[0]==='review3').forEach(r=>r[0]='design_gate');f.rows[3][2]='Design Gate';f.rows[3][7]='[]';f.rows[3][9]='';f.actor('coord@x');
 const result=f.c.prepareReviewAssessmentStorage([]);assert(result.journals.some(j=>j.assessment==='design_gate'&&j.journal==='Assessment_design_gate'&&j.created));
 f.actor('reviewer@x');const d=f.c.loadReviewEvaluation('g18','design_gate'),input={assessmentId:'design_gate',team:'g18',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),teamScores:{PI1:{level:3,marks:64,remark:''}},students:d.roster.students.map(s=>({register:s.register,absence:{type:'NORMAL'},scores:{PI2:{level:3,marks:16,remark:''}}}))};
 f.c.saveReviewEvaluationDraft(input);const current=f.c.loadReviewEvaluation('g18','design_gate');f.c.submitReviewEvaluation({...input,revision:current.revision,token:current.token,requestId:crypto.randomUUID()});
 assert(f.tables.Assessment_design_gate.slice(1).every(row=>row[0]==='design_gate'));assert.equal(f.tables.Assessment_design_gate.length,7);assert.equal(f.tables.Journal_review1.length,1);
});
test('spreadsheet Review 3 provisions, evaluates, reopens and reloads with a distinct rubric and configured prerequisite',()=>{
 const f=setup(),c=f.c;f.actor('coord@x');const created=c.provisionAssessmentJournals();assert.equal(created.length,3);assert(created.every(x=>x.created));assert(c.provisionAssessmentJournals().every(x=>!x.created));
 f.actor('reviewer@x');assert.throws(()=>c.loadReviewEvaluation('G18','review3'),/Submit Review 2/);
 for(const id of ['review1','review2','review3']){
  const d=c.loadReviewEvaluation('G18',id),input={assessmentId:id,team:'G18',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),teamScores:{PI1:{level:3,marks:d.config.criteria[0].maxMarks*.8,remark:''}},students:d.roster.students.map(s=>({register:s.register,absence:{type:'REVIEW_DAY_ABSENCE',approved:true},scores:{}}))};
  c.submitReviewEvaluation(input);assert.equal(c.loadReviewEvaluation('G18',id).evaluation.students[0].assessment.status,'MAKEUP_PENDING');
 }
 const d=c.loadReviewEvaluation('G18','review3');assert.equal(d.config.criteria[0].maxMarks,80);assert.equal(d.config.criteria[1].maxMarks,20);
 c.submitReviewMakeup({assessmentId:'review3',team:'G18',student:'s1',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),scores:{PI2:{level:3,marks:16,remark:''}}});
 assert.equal(c.loadReviewEvaluation('G18','review3').evaluation.students[0].total,80);
 f.actor('coord@x');c.reopenReviewEvaluation({assessmentId:'review3',team:'G18',revision:2,requestId:crypto.randomUUID(),reason:'Correction'});f.actor('reviewer@x');assert.equal(c.loadReviewEvaluation('G18','review3').evaluation.students[0].total,80);
 assert.equal(f.tables.Journal_review1.length,4);assert.equal(f.tables.Journal_review3.length,10);
});
test('registry rejects duplicates, cycles, unknown prerequisites, unsupported policy and missing explicit opening',()=>{
 for(const mutate of [r=>r.push(r[1].slice()),r=>r[1][7]='[{"assessmentId":"review3","condition":"RECORDED"}]',r=>r[2][7]='[{"assessmentId":"missing","condition":"RECORDED"}]',r=>r[1][8]='unsupported',r=>r[1][5]='',r=>r[2][9]=r[1][9]]){const f=setup();mutate(f.rows);assert.throws(()=>f.c.getAssessmentDefinitions_());}
});
test('journal provisioning is coordinator-only and never overwrites incompatible existing data',()=>{
 const f=setup();assert.throws(()=>f.c.provisionAssessmentJournals(),/Coordinator/);f.rows[1][9]='Review1Evaluations';f.tables.Review1Evaluations[0][0]='Bad';f.actor('coord@x');const before=JSON.stringify(f.tables);assert.throws(()=>f.c.provisionAssessmentJournals(),/Incompatible/);assert.equal(JSON.stringify(f.tables),before);
});

test('spreadsheet-only Review 3 supports generic discovery, publication, correction and republication',()=>{
 const f=setup(),c=f.c;f.actor('coord@x');c.provisionAssessmentJournals();
 assert(c.publicationDefinitions_().some(d=>d.key==='review3'));
 assert.equal(c.internalPublishingConfig_('review3').publishMethod,'publishInternalAssessment');
 assert.match(c.buildInternalAssessmentPublishing_('review3'),/data-publishing="review3"/);
 for(const key of ['review1','review2','review3']){
  f.actor('reviewer@x');const d=c.loadReviewEvaluation('g18',key);
  c.submitReviewEvaluation({assessmentId:key,team:'g18',revision:0,token:d.token,requestId:crypto.randomUUID(),teamScores:{PI1:{level:3,marks:d.config.criteria[0].maxMarks*.8,remark:''}},students:d.roster.students.map(s=>({register:s.register,absence:{type:'NORMAL'},scores:{PI2:{level:3,marks:d.config.criteria[1].maxMarks*.8,remark:''}}}))});
 }
 f.actor('coord@x');c.publishInternalAssessment({assessmentId:'review3',team:'g18',revision:1,requestId:crypto.randomUUID()});
 f.actor('one@x');let published=c.loadPublishedReviewEvaluation('review3');assert.equal(published.scores.PI1.marks,64);assert.equal(published.scores.PI2.marks,16);assert.equal(published.publication.sourceRevision,1);
 f.actor('coord@x');c.reopenInternalAssessment({assessmentId:'review3',team:'g18',revision:2,requestId:crypto.randomUUID(),reason:'Correction'});
 f.actor('one@x');assert.equal(c.loadPublishedReviewEvaluation('review3').underCorrection,true);
 f.actor('reviewer@x');const d=c.loadReviewEvaluation('g18','review3');
 c.submitReviewEvaluation({assessmentId:'review3',team:'g18',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),teamScores:d.evaluation.teamScores,students:d.evaluation.students.map(s=>({register:s.register,absence:s.assessment.facts,scores:s.scores}))});
 f.actor('coord@x');c.publishInternalAssessment({assessmentId:'review3',team:'g18',student:'s1',revision:4,requestId:crypto.randomUUID()});
 const report=c.loadInternalAssessmentPublishing('review3');assert.equal(report.teams[0].students[0].underCorrection,false);assert.equal(report.teams[0].students[1].underCorrection,true);
});

test('fresh installation exposes schema-only bootstrap, then explicit empty configuration',()=>{
 const f=coordinatorStorageSetup(),c=f.c;delete f.extra.AssessmentDefinitions;f.actor('coord@x');
 const before=JSON.stringify(f.tables),names=Object.keys(f.extra);
 let readiness=c.getCoordinatorReviewConfiguration();
 assert.equal(readiness.registryState,'MISSING');assert.equal(readiness.state,'definitions-missing');assert.equal(readiness.canBootstrap,true);assert.equal(readiness.links.definitions,undefined);
 assert.throws(()=>c.prepareReviewAssessmentStorage(),/Create assessment definitions tab/);
 assert.throws(()=>c.provisionAssessmentJournals(),/AssessmentDefinitions is missing/);
 assert.equal(JSON.stringify(f.tables),before);
 assert.equal(c.createAssessmentDefinitions().created,true);
 const expected=['Assessment ID','Type','Label','Sequence','Weight (%)','Opening','Due Date','Prerequisites','Academic Policy Version','Journal'];
 assert.deepEqual(f.tables.AssessmentDefinitions.map(r=>Array.from(r)),[expected]);
 assert.deepEqual(Object.keys(f.extra),[...names,'AssessmentDefinitions']);
 assert.equal(c.getAssessmentDefinitions_().length,0);
 readiness=c.getCoordinatorReviewConfiguration();
 assert.equal(readiness.registryState,'EMPTY');assert.equal(readiness.state,'definitions-empty');assert.equal(readiness.canBootstrap,false);
 assert.match(readiness.links.definitions,/edit#gid=42$/);
 assert.throws(()=>c.prepareReviewAssessmentStorage(),/contains no graded assessments/);
 const after=JSON.stringify(f.tables);
 assert.equal(c.createAssessmentDefinitions().created,false);assert.equal(JSON.stringify(f.tables),after);
 assert.match(c.getReviewerReviewProgress_([f.row]).error,/no graded assessments/);
});

test('bootstrap rejects unauthorized actors and lock conflicts before creating tabs',()=>{
 const f=coordinatorStorageSetup(),c=f.c;delete f.extra.AssessmentDefinitions;
 for(const actor of ['reviewer@x','one@x','']){f.actor(actor);assert.throws(()=>c.createAssessmentDefinitions(),/Coordinator/);}
 assert.equal(f.extra.AssessmentDefinitions,undefined);
 let released=0;c.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock:()=>released++})};
 f.actor('coord@x');assert.throws(()=>c.createAssessmentDefinitions(),/Another setup/);assert.equal(released,0);
 c.getConfig=()=> 'pd@x';f.actor('PD@X');
 c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})};
 assert.equal(c.createAssessmentDefinitions().created,true);assert.equal(released,1);
});

test('bootstrap preserves existing populated, invalid and blank tabs; never repairs or seeds',()=>{
 const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');
 let released=0;c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})};
 let before=JSON.stringify(f.rows);assert.equal(c.createAssessmentDefinitions().created,false);assert.equal(JSON.stringify(f.rows),before);
 f.rows[1][8]='unsupported';before=JSON.stringify(f.rows);
 assert.throws(()=>c.createAssessmentDefinitions(),/Unsupported academic policy/);assert.equal(JSON.stringify(f.rows),before);
 let readiness=c.getCoordinatorReviewConfiguration();assert.equal(readiness.registryState,'INVALID');assert.equal(readiness.canBootstrap,false);assert(readiness.links.definitions);
 f.rows.splice(0);before=JSON.stringify(f.rows);
 assert.throws(()=>c.createAssessmentDefinitions(),/requires exactly one/);assert.equal(JSON.stringify(f.rows),before);assert.equal(released,3);
 assert.equal(f.tables.Journal_review1,undefined);
});

test('readiness distinguishes empty journals and READY and never requires duplicate Review milestones',()=>{
 const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');
 for(const row of f.rows.slice(1))f.extra[row[9]]=f.sheet(f.tables[row[9]]=[],row[9]);
 let r=c.getCoordinatorReviewConfiguration();assert.equal(r.valid,true);assert.equal(r.state,'storage-empty');assert(r.storage.every(s=>s.state==='EMPTY'));
 c.prepareReviewAssessmentStorage();r=c.getCoordinatorReviewConfiguration();assert.equal(r.state,'ready');assert(r.storage.every(s=>s.state==='READY'));
 assert.deepEqual(Array.from(c.getMilestones_(),d=>d.key),['formation']);
 const review=c.getReviewDefinitions_()[2],definition=c.getAssessmentDefinitions_()[2];
 assert.equal(review.label,definition.label);assert.equal(review.opens,definition.opens);assert.equal(review.day,definition.day);assert.equal(review.weight,20);assert.equal(review.rubric[0].maxMarks,80);
 const timeline=c.composeProjectTimeline_(c.getMilestones_(),c.getAssessmentDefinitions_());assert.equal(timeline.length,4);
 assert.equal(timeline.filter(d=>d.key==='review3').length,1);
});

test('Guide is explicit registry configuration and never falls back to Milestones',()=>{
 const f=coordinatorStorageSetup(),c=f.c;
 c.getMilestones_=()=>[{key:'guide_eval',gradedBy:'Project Guide',weight:20,day:20000}];
 assert(!c.publicationDefinitions_().some(d=>d.key==='guide_eval'));
 // Restore real Guide configuration instead of the publishing fixture stub.
 const source=fs.readFileSync('guide-evaluation.js','utf8'),start=source.indexOf('function guideConfiguration_('),end=source.indexOf('\n}',start)+2;
 vm.runInContext(source.slice(start,end),c);
 assert.throws(()=>c.guideConfiguration_(),/Configure guide_eval in AssessmentDefinitions/);
 assert.throws(()=>c.guideJournalName_(),/Configure guide_eval in AssessmentDefinitions/);
 f.rows.push(['guide_eval','GUIDE_EVALUATION','Guide Evaluation',4,20,'2024-01-01','2024-02-01','','guide-bands-v3-target-level-2','']);
 f.rubrics.push(['guide_eval',1,'PI1','Guide criterion','CO1',100,'Individual',...Array(6).fill('Descriptor')]);
 f.actor('coord@x');const result=c.prepareReviewAssessmentStorage();
 assert(result.journals.some(j=>j.assessment==='guide_eval'&&j.journal==='Assessment_guide_eval'&&j.created));
 assert.equal(c.guideConfiguration_().criteria[0].maxMarks,100);assert.equal(c.guideConfiguration_().weight,.2);assert.equal(c.guideJournalName_(),'Assessment_guide_eval');
 assert(c.publicationDefinitions_().some(d=>d.key==='guide_eval'));
});

test('Reviewer dashboard shows configuration-required message for missing, empty and invalid registry',()=>{
 for(const state of ['missing','empty','invalid']){
  const f=coordinatorStorageSetup(),c=f.c;
  if(state==='missing')delete f.extra.AssessmentDefinitions;
  if(state==='empty')f.rows.splice(1);
  if(state==='invalid')f.rows[1][8]='unsupported';
  vm.runInContext(fs.readFileSync('reviewer-api.js','utf8'),c);
  const dto=c.buildReviewerDto_({pending:[],approved:[],notYetGuideApproved:[],total:0,assigned:[]});
  assert.match(dto.reviewError,/AssessmentDefinitions/i);assert.deepEqual(Array.from(dto.reviews),[]);assert.equal(dto.teams.length,0);
 }
});


test('direct assessment IDs survive reordered headers and normalized values without a rubric reference',()=>{
 const f=coordinatorStorageSetup(),c=f.c;
 f.rows[1][0]=' REVIEW1 ';
 f.rows.forEach(row=>row.reverse());
 f.rubrics.slice(1).forEach(row=>row[0]=' '+row[0].toUpperCase()+' ');
 f.rubrics.forEach(row=>row.reverse());
 const definition=c.assessmentDefinition_(' Review1 ');
 assert.equal(definition.key,'review1');assert.equal(definition.weight,20);
 assert.equal(Object.hasOwn(definition,'rubricReference'),false);
 assert.equal(c.assessmentRubric_(definition)[0].maxMarks,60);
 assert.equal(Object.hasOwn(c.reviewConfiguration_('review1'),'rubricReference'),false);
 f.actor('coord@x');assert.equal(c.getCoordinatorReviewConfiguration().valid,true);
});

test('rubric lookup and readiness reject legacy headers and missing assessment criteria',()=>{
 for(const mode of ['legacy','missing','unknown']){
  const f=coordinatorStorageSetup(),c=f.c;
  if(mode==='legacy')f.rubrics[0][0]='Milestone ID';
  else f.rubrics.slice(1).filter(row=>row[0]==='review1').forEach(row=>row[0]=mode==='unknown'?'unconfigured':'review2');
  assert.throws(()=>c.assessmentRubric_(c.assessmentDefinition_('review1')),mode==='legacy'?/Assessment ID column/:/no criteria for review1/);
  f.actor('coord@x');assert.equal(c.getCoordinatorReviewConfiguration().valid,false);
 }
});


function seeSetup(only=false){
 const f=coordinatorStorageSetup();
 const source=fs.readFileSync('common-helpers.js','utf8'),start=source.indexOf('function projectDay_('),end=source.indexOf('\n}',start)+2;vm.runInContext('const PROJECT_DAY_MS_=86400000;'+source.slice(start,end),f.c);
 if(only){f.rows.splice(1);f.rubrics.splice(1);}
 f.rows.push([' SEE ',' see ','End Review (SEE)',4,40,'2024-03-01','2024-03-01','','','']);
 f.rubrics.push(['see',1,'PI1','External team assessment','CO1',60,'Team',...Array(6).fill('Descriptor')],[' SEE ',2,'PI2','External individual assessment','CO2',40,'Individual',...Array(6).fill('Descriptor')]);
 return f;
}

test('SEE configuration is display-only, normalized and shares the overall weight total',()=>{
 const f=seeSetup(),d=f.c.assessmentDefinition_('SEE');
 assert.equal(d.type,'SEE');assert.equal(d.key,'see');assert.equal(d.journal,'');assert.equal(d.academicPolicyVersion,'');
 assert.equal(d.gradedBy,'SEE Committee (includes external members)');
 assert.equal(f.c.getAssessmentDefinitions_().reduce((sum,d)=>sum+d.weight,0),100);
 assert.deepEqual(Array.from(f.c.assessmentRubric_(d),c=>c.type),['Team','Individual']);
 const rubric=f.c.getSharedRubricsData_().assessments.find(d=>d.key==='see');
 assert.equal(rubric.available,true);assert.equal(rubric.totalMarks,100);assert.equal(rubric.evaluationNotice,'Evaluated outside this app');assert.equal(rubric.evaluator,d.gradedBy);
 assert(f.c.composeProjectTimeline_(f.c.getMilestones_(),f.c.getAssessmentDefinitions_()).some(d=>d.key==='see'));
 assert(!f.c.getInternalReviews_().some(d=>d.key==='see'));assert(!f.c.publicationDefinitions_().some(d=>d.key==='see'));
});

test('SEE rejects unsupported identity, policy, storage, prerequisites, dates and total weights',()=>{
 const mutations=[
  [r=>r[4][0]='external',/reserved for SEE/],
  [r=>r[4][1]='REVIEW',/reserved for SEE/],
  [r=>r[4][8]='review-attendance-v1',/Policy Version must be blank/],
  [r=>r[4][9]='Assessment_see',/Journal must be blank/],
  [r=>r[4][7]='[{"assessmentId":"review1","condition":"RECORDED"}]',/SEE Prerequisites/],
  [r=>r[1][7]='[{"assessmentId":"see","condition":"RECORDED"}]',/SEE cannot be a RECORDED prerequisite/],
  [r=>r[4][4]=41,/weights exceed/],
  [r=>r[4][4]=0,/Weight must/],
  [r=>r[4][5]='',/Opening and due date/],
  [r=>r[4][6]='',/Opening and due date/],
  [r=>r[4][5]='2024-03-02',/Opening must not follow/]
 ];
 for(const [mutate,error] of mutations){const f=seeSetup();mutate(f.rows);assert.throws(()=>f.c.getAssessmentDefinitions_(),error);}
 const f=seeSetup();f.rows[4][7]='[]';assert.equal(f.c.assessmentDefinition_('see').prerequisites.length,0);
});

test('mixed and SEE-only readiness validates rubrics without resolving or provisioning SEE storage',()=>{
 for(const only of [false,true]){
  const f=seeSetup(only),c=f.c;f.actor('coord@x');
  const resolve=c.assessmentJournal_;let resolved=[];
  c.assessmentJournal_=d=>{resolved.push(d.key);assert.notEqual(d.type,'SEE');return resolve(d);};
  let r=c.getCoordinatorReviewConfiguration();assert.equal(r.valid,true);
  assert.equal(r.storage.find(s=>s.assessment==='see').state,'NOT_REQUIRED');assert.equal(r.canInitializeStorage,!only);
  assert.equal(r.ready,only);
  const result=c.prepareReviewAssessmentStorage();assert.equal(result.journals.length,only?0:3);
  assert.equal(c.provisionAssessmentJournals().length,only?0:3);
  assert(!resolved.includes('see'));assert.equal(f.extra.Assessment_see,undefined);
  assert.equal(c.getCoordinatorReviewConfiguration().ready,true);
  f.rubrics.splice(f.rubrics.findIndex(row=>row[0]==='see'),1);
  assert.equal(c.getCoordinatorReviewConfiguration().valid,false);
 }
});

test('SEE rejects all Review marking and publication requests without modifying records',()=>{
 const f=seeSetup(),c=f.c,before=JSON.stringify(f.tables);
 assert.throws(()=>c.assessmentJournal_(c.assessmentDefinition_('see')),/outside this app/);
 assert.throws(()=>c.loadReviewEvaluation('g18','see'),/Expected REVIEW/);
 const input={assessmentId:'see',team:'g18',student:'s1',revision:0,requestId:crypto.randomUUID(),reason:'Correction',teamScores:{},students:[]};
 for(const method of ['saveReviewEvaluationDraft','submitReviewEvaluation','saveReviewMakeupDraft','submitReviewMakeup'])assert.throws(()=>c[method](input),/outside this app/);
 f.actor('coord@x');
 assert.throws(()=>c.reopenReviewEvaluation(input),/outside this app/);
 for(const method of ['publishInternalAssessment','reopenInternalAssessment'])assert.throws(()=>c[method](input),/Unknown assessment/);
 assert.throws(()=>c.loadPublishedReviewEvaluation('see'),/Unknown assessment/);
 assert.equal(JSON.stringify(f.tables),before);assert.equal(f.extra.Assessment_see,undefined);
});


test('rubric and storage readiness are independent and errors preserve original sheet rows',()=>{
 const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');c.prepareReviewAssessmentStorage();
 // The invalid criterion is on actual sheet row 5, despite belonging to Review 2.
 f.rubrics[4][5]=-1;
 delete f.extra.Journal_review3;
 const before=JSON.stringify(f.tables),names=Object.keys(f.extra),r=c.getCoordinatorReviewConfiguration();
 const [one,two,three]=r.storage;
 assert.equal(one.rubric.state,'READY');assert.equal(one.rubric.criterionCount,2);assert.equal(one.rubric.maximumMarks,100);assert.equal(one.ready,true);
 assert.equal(two.state,'READY');assert.equal(two.rubric.state,'INVALID');assert.equal(two.ready,false);assert.match(two.rubric.error,/row 5: Max Marks/);
 assert.equal(three.rubric.state,'READY');assert.equal(three.state,'MISSING');assert.equal(three.ready,false);
 assert.equal(r.valid,false);assert.equal(r.ready,false);assert.equal(r.canInitializeStorage,false);assert(r.summary.startsWith('1 / 3 assessments ready'));
 assert.throws(()=>c.prepareReviewAssessmentStorage(),/Max Marks/);
 assert.equal(JSON.stringify(f.tables),before);assert.deepEqual(Object.keys(f.extra),names);
 f.rubrics[4][5]=40;c.prepareReviewAssessmentStorage();assert.equal(c.getCoordinatorReviewConfiguration().ready,true);
});

test('missing and malformed rubrics report per-assessment states while preserving journal states',()=>{
 for(const mode of ['missing-tab','empty-tab','header-only','missing-group','bad-header','duplicate-header','duplicate-level','unknown-id','empty-id']){
  const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');c.prepareReviewAssessmentStorage();
  if(mode==='missing-tab')delete f.extra.Rubrics;
  if(mode==='empty-tab')f.rubrics.splice(0);
  if(mode==='header-only')f.rubrics.splice(1);
  if(mode==='missing-group')f.rubrics.splice(3,2);
  if(mode==='bad-header')f.rubrics[0][0]='Milestone ID';
  if(mode==='duplicate-header')f.rubrics[0].push('Assessment ID');
  if(mode==='duplicate-level')f.rubrics[0].push('Level 0');
  if(mode==='unknown-id'||mode==='empty-id')f.rubrics.push([mode==='unknown-id'?'unknown':'',1,'PI1','Extra','CO1',100,'Team']);
  const r=c.getCoordinatorReviewConfiguration();assert.equal(r.valid,false,mode);assert.equal(r.canInitializeStorage,false,mode);assert(r.storage.every(item=>item.state==='READY'),mode);
  if(mode==='missing-group'){
   assert.deepEqual(Array.from(r.storage,item=>item.rubric.state),['READY','MISSING','READY']);
   assert.equal(r.storage[0].ready,true);assert.equal(r.storage[1].ready,false);
  }else if(mode==='unknown-id'||mode==='empty-id'){
   assert(r.storage.every(item=>item.rubric.state==='READY'));assert(r.issues.some(issue=>/row 8: Assessment ID/.test(issue.message)));
  }else{
   const state=['bad-header','duplicate-header','duplicate-level'].includes(mode)?'INVALID':'MISSING';
   assert(r.storage.every(item=>item.rubric.state===state),mode);
  }
 }
});

test('SEE rubric errors affect readiness without storage and Guide restrictions stay assessment-specific',()=>{
 const f=seeSetup(),c=f.c;f.actor('coord@x');
 f.rows.forEach((row,i)=>{if(i)row[4]=10;});
 f.rows.push(['guide_eval','GUIDE_EVALUATION','Guide Evaluation',5,10,'2024-01-01','2024-02-01','','guide-bands-v3-target-level-2','']);
 f.rubrics.push(['guide_eval',1,'PI1','Guide criterion','CO1',100,'Individual',...Array(6).fill('Descriptor')]);
 c.prepareReviewAssessmentStorage();
 f.rubrics.at(-1)[7]='';f.rubrics[7][5]=-1;
 let r=c.getCoordinatorReviewConfiguration(),see=r.storage.find(item=>item.assessment==='see'),guide=r.storage.find(item=>item.assessment==='guide_eval');
 assert.equal(see.state,'NOT_REQUIRED');assert.equal(see.rubric.state,'INVALID');assert.equal(see.ready,false);
 assert.equal(guide.state,'READY');assert.equal(guide.rubric.state,'INVALID');assert.match(guide.rubric.error,/individual criteria and all Level/);
 assert(r.storage.filter(item=>item.assessment.startsWith('review')).every(item=>item.ready));
 f.rubrics.at(-1)[7]='Descriptor';f.rubrics[7][5]=60;
 assert.equal(c.getCoordinatorReviewConfiguration().ready,true);
 const only=seeSetup(true);only.actor('coord@x');only.rubrics.splice(1);
 r=only.c.getCoordinatorReviewConfiguration();assert.equal(r.ready,false);assert.equal(r.storage[0].state,'NOT_REQUIRED');assert.equal(r.storage[0].rubric.state,'MISSING');assert.equal(r.canInitializeStorage,false);
});


test('storage setup visibility follows journals even when rubrics are invalid',()=>{
 const f=coordinatorStorageSetup(),c=f.c;f.actor('coord@x');
 let r=c.getCoordinatorReviewConfiguration();assert.equal(r.storageComplete,false);assert.equal(r.canInitializeStorage,true);
 c.prepareReviewAssessmentStorage();r=c.getCoordinatorReviewConfiguration();assert.equal(r.storageComplete,true);assert.equal(r.canInitializeStorage,false);
 f.rubrics[1][5]=-1;r=c.getCoordinatorReviewConfiguration();assert.equal(r.valid,false);assert.equal(r.storageComplete,true);assert.equal(r.canInitializeStorage,false);
 delete f.extra.Journal_review1;r=c.getCoordinatorReviewConfiguration();assert.equal(r.storageComplete,false);assert.equal(r.canInitializeStorage,false);
 const only=seeSetup(true);only.actor('coord@x');r=only.c.getCoordinatorReviewConfiguration();assert.equal(r.storageComplete,true);assert.equal(r.canInitializeStorage,false);
});
