const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
const id=()=>crypto.randomUUID(),plain=x=>JSON.parse(JSON.stringify(x));

function reopen(f,key='review1',student){const t=f.report().teams[0];return f.c.reopenInternalAssessment_({assessmentId:key,team:'g18',student,revision:student?t.students.find(s=>s.register===student).revision:t.revision,requestId:id(),reason:'Private correction reason'});}

test('publication is a minimal frozen release with a verified exact academic source, not duplicate evidence',()=>{
 const f=publishingFixture(),input=f.input();input.students[0].scores.I.remark='Released feedback';f.submit(input);
 const original=JSON.stringify(f.tables.Review1Evaluations.slice(1));f.publish('s1');
 assert.equal(JSON.stringify(f.tables.Review1Evaluations.slice(1,4)),original);
 const row=f.tables.Review1Evaluations.at(-1),event=JSON.parse(row[8]);
 assert.equal(event.kind,'PUBLICATION');assert.equal(event.sourceRevision,1);assert.equal(event.presentationVersion,1);assert.equal(event.releases.length,1);
 assert.equal(event.releases[0].snapshot.scores.I.remark,'Released feedback');
 assert.equal(event.sourceHash,f.c.evaluationHash_(f.c.reviewRecords_('review1').records.find(r=>r.revision===1)));
 assert.equal(event.releases[0].snapshotHash,f.c.evaluationHash_(event.releases[0].snapshot));
 assert.equal(event.policyVersion,'review-attendance-v1');assert(event.configurationHash);assert(event.rubricHash);
 for(const absent of ['facts','descriptors','teamScores','roster','makeupDraft','events','fingerprint'])assert(!Object.hasOwn(event.releases[0].snapshot,absent));
 assert(!JSON.stringify(event.releases).includes('s2'));assert(!JSON.stringify(event.releases).includes('approved'));
 assert.equal(event.config,undefined);assert.equal(event.students,undefined);
 f.actor('one@x');const released=plain(f.c.loadPublishedReviewEvaluation_('review1'));
 f.c.assessmentRubric_=()=>{throw Error('Current rubric unavailable');};
 assert.deepEqual(plain(f.c.loadPublishedReviewEvaluation_('review1')),released);
});

test('source, snapshot, duplicate publication and unsupported version corruption fail closed',()=>{
 for(const change of ['source','snapshot','duplicate','version']){
  const f=publishingFixture();f.submit();f.publish();const rows=f.tables.Review1Evaluations;
  if(change==='source'){for(let i=1;i<=3;i++){const p=JSON.parse(rows[i][8]);p.config.label='tampered';rows[i][8]=JSON.stringify(p);}}
  else if(change==='duplicate')rows.push(rows.at(-1).slice());
  else {const p=JSON.parse(rows.at(-1)[8]);if(change==='version')p.presentationVersion=99;else p.releases[0].snapshot.total=999;rows.at(-1)[8]=JSON.stringify(p);}
  f.actor('one@x');assert.throws(()=>f.c.loadPublishedReviewEvaluation_('review1'),/integrity|Conflicting|Unsupported/);
 }
});

test('Review correction preserves released data through draft and resubmission; republication is isolated',()=>{
 const f=publishingFixture();f.submit();f.publish();f.actor('one@x');const before=plain(f.c.loadPublishedReviewEvaluation_('review1'));
 reopen(f);f.actor('one@x');let visible=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(visible.total,80);assert(visible.underCorrection);assert(!JSON.stringify(visible).includes('Private correction'));
 f.actor('reviewer@x');let input=f.input();input.students[0].scores.I.marks=33;f.c.saveReviewEvaluationDraft_({...input,assessmentId:'review1'});
 f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_('review1').total,80);
 f.actor('reviewer@x');input=f.input();input.students[0].scores.I.marks=33;f.submit(input);
 f.actor('one@x');visible=f.c.loadPublishedReviewEvaluation_('review1');assert.deepEqual(plain(visible.scores),before.scores);assert(visible.underCorrection);
 f.publish('s1');f.actor('one@x');visible=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(visible.total,81);assert.equal(visible.underCorrection,false);
 f.actor('two@x');visible=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(visible.total,80);assert(visible.underCorrection);assert.equal(visible.publication.sourceRevision,1);
});

test('Guide correction retains old publication through changed draft and resubmission',()=>{
 const f=publishingFixture('guide_eval');f.guideSubmit('s1');f.report();f.c.publishInternalAssessment_({assessmentId:'guide_eval',team:'g18',student:'s1',revision:1,requestId:id()});
 reopen(f,'guide_eval','s1');f.actor('guide@x');let d=f.c.loadGuideEvaluation_('g18','s1');
 f.c.saveGuideEvaluationDraft_({team:'g18',student:'s1',revision:d.revision,token:d.token,requestId:id(),scores:{I:{level:3,marks:33,remark:''}}});
 f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation_().total,32);assert(f.c.loadPublishedGuideEvaluation_().underCorrection);
 f.actor('guide@x');d=f.c.loadGuideEvaluation_('g18','s1');f.c.submitGuideEvaluation_({team:'g18',student:'s1',revision:d.revision,token:d.token,requestId:id(),scores:{I:{level:3,marks:33,remark:''}}});
 f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation_().total,32);
 const t=f.report().teams[0];f.c.publishInternalAssessment_({assessmentId:'guide_eval',team:'g18',student:'s1',revision:t.students[0].revision,requestId:id()});
 f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation_().total,33);assert.equal(f.c.loadPublishedGuideEvaluation_().underCorrection,false);
});

test('pending and policy-zero snapshots exclude inactive evidence and keep null distinct from zero',()=>{
 const f=publishingFixture(),input=f.input();input.students[0].absence={type:'PROLONGED',verifiedContribution:false,approved:true,attended:false};input.students[0].scores={};input.students[1].absence={type:'PROLONGED',verifiedContribution:false,approved:false,attended:false};input.students[1].scores={};f.submit(input);f.publish();
 f.actor('one@x');let p=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(p.total,null);assert.equal(p.assessment.teamMark,0);assert.equal(p.scores.T.source,'policy');assert.equal(p.scores.T.level,null);assert.equal(p.scores.I.marks,null);
 f.actor('two@x');p=f.c.loadPublishedReviewEvaluation_('review1');assert.equal(p.total,0);assert.equal(p.assessment.completed,true);
});

test('publication membership guard permits metadata but rejects changes and ambiguous access',()=>{
 for(const key of ['review1','guide_eval']){
  const f=publishingFixture(key);if(key==='review1')f.submit();else f.guideSubmit('s1');
  f.students[0].name='Corrected';f.students[0].email='corrected@x';let report=f.report();assert.equal(report.teams[0].students[0].publicationPermission,'ALLOWED');
  f.c.publishInternalAssessment_({assessmentId:key,team:'g18',...(key==='guide_eval'?{student:'s1'}:{}),revision:1,requestId:id()});
  f.actor('one@x');assert.throws(()=>f.c.loadPublishedAssessment_(key),/assignment/);f.actor('corrected@x');assert.equal(f.c.loadPublishedAssessment_(key).identity.name,'Corrected');
  f.students[1].email='corrected@x';assert.throws(()=>f.c.loadPublishedAssessment_(key),/ambiguous/);
 }
 const f=publishingFixture();f.submit();f.students.pop();assert.equal(f.report().teams[0].canPublishTeam,false);assert.equal(f.report().teams[0].canReopen,false);
 assert.throws(()=>f.c.publishInternalAssessment_({assessmentId:'review1',team:'g18',revision:1,requestId:id()}),/membership/);
});

test('draft sources are never publishable; confirmed requests remain discoverable after later commands',()=>{
 const f=publishingFixture();f.c.saveReviewEvaluationDraft_({...f.input(),assessmentId:'review1'});f.report();assert.throws(()=>f.c.publishInternalAssessment_({assessmentId:'review1',team:'g18',revision:1,requestId:id()}),/not available/);
 f.submit();const request={assessmentId:'review1',team:'g18',revision:2,requestId:id()};f.report();f.c.publishInternalAssessment_(request);reopen(f);
 const report=f.report();assert(report.teams[0].operations.some(op=>op.requestId===request.requestId));
 const length=f.tables.Review1Evaluations.length;assert.equal(f.c.publishInternalAssessment_(request).revision,3);assert.equal(f.tables.Review1Evaluations.length,length);
});

test('correction before initial publication stays private and oversized releases append nothing',()=>{
 const f=publishingFixture();f.submit();reopen(f);f.actor('one@x');assert.equal(f.c.loadPublishedAssessment_('review1'),null);
 const other=publishingFixture();other.submit();
 // Large released feedback would exceed the existing single-cell journal limit.
 for(let i=1;i<=3;i++){const data=JSON.parse(other.tables.Review1Evaluations[i][8]);data.scores.I.remark='x'.repeat(20000);other.tables.Review1Evaluations[i][8]=JSON.stringify(data);}
 other.report();const before=JSON.stringify(other.tables);
 assert.throws(()=>other.c.publishInternalAssessment_({assessmentId:'review1',team:'g18',revision:1,requestId:id()}),/too large/);
 assert.equal(JSON.stringify(other.tables),before);
});

test('Review reopening capability identifies all four incompatible dimensions',()=>{
 const f=publishingFixture();f.submit();const original=f.c.getAssessmentDefinitions_;f.c.getAssessmentDefinitions_=()=>original().map(d=>({...d,label:'Renamed',academicPolicyVersion:'future'}));
 const rubric=f.c.assessmentRubric_;f.c.assessmentRubric_=d=>rubric(d).map(c=>({...c,name:'Changed'}));f.students.pop();
 const t=f.report().teams[0];assert.equal(t.canReopen,false);assert.deepEqual(Array.from(t.reopenChanges,c=>c.dimension),['rubric','configuration','roster','policy']);
});
