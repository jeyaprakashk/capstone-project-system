const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function browser(){const c=vm.createContext({Map,Set,window:{crypto},document:{},setTimeout,clearTimeout});for(const file of ['common-helpers.js','lucide-icons.js','icon-renderer.js','internal-assessment-publishing-client.js'])vm.runInContext(file==='common-helpers.js'?fs.readFileSync(file,'utf8').slice(fs.readFileSync(file,'utf8').indexOf('function renderAssessmentHistory_')):fs.readFileSync(file,'utf8'),c);c.DashboardUI={renderIcon:c.renderLucideIcon_,renderAssessmentHistory:c.renderAssessmentHistory_};return c.internalAssessmentPublishingBrowser_();}
const view=()=>({query:'',filter:'all',open:new Set(),outcomes:new Map()});

function historyRenderer(){const c=vm.createContext({});vm.runInContext(fs.readFileSync('common-helpers.js','utf8').slice(fs.readFileSync('common-helpers.js','utf8').indexOf('function renderAssessmentHistory_')),c);return c.renderAssessmentHistory_;}
test('shared history is immutable, escaped, newest first and preserves note suppression and dates',()=>{
  const render=historyRenderer();
  const decisions=Object.freeze([
    Object.freeze({decision:'exception',at:'2026-09-24T23:04:44.087Z',reason:'Prolonged absence source facts updated.',previousStatus:'ABSENT_UNAPPROVED',resultingStatus:'INCOMPLETE'}),
    Object.freeze({decision:'exception',at:'invalid',reason:'Review-day absence recorded as unapproved.'}),
    Object.freeze({decision:'exception',reason:'Absence details recorded: internal source facts'}),
    Object.freeze({decision:'targetSubmit',at:'2026-09-24T23:05:12.872Z',reason:'Updated <date> & evidence\nSecond line',reviewer:'<reviewer>',previousStatus:'MAKEUP_PENDING',resultingStatus:'COMPLETED_AFTER_MAKEUP'})
  ]);
  const before=JSON.stringify(decisions),html=render(decisions);
  assert.equal(JSON.stringify(decisions),before);assert.equal(render(decisions),html);
  assert.match(html,/Assessment history <span>4<\/span>/);assert.match(html,/Updated &lt;date&gt; &amp; evidence\nSecond line/);assert.match(html,/&lt;reviewer&gt;/);
  assert.doesNotMatch(html,/source facts|recorded as unapproved|Absence details recorded|Invalid Date/);
  assert.match(html,/datetime="2026-09-24T23:05:12.872Z"/);assert.match(html,/Awaiting makeup/);assert.match(html,/Completed after makeup/);
  assert(html.indexOf('Assessment completed')<html.indexOf('Absence details updated'));
  assert.equal(render([]),'');assert.equal(render(null),'');assert.equal(render(undefined),'');
});
test('shared history preserves all drawer labels and fallback behavior',()=>{
  const render=historyRenderer();
  const actions={exception:'Absence details updated',targetSubmit:'Assessment completed',targetDraft:'Assessment draft saved',MAKEUP_ALTERNATIVE_ASSESSMENT:'Assessment authorized',DEFERRED_ASSESSMENT:'Assessment deferred',TEAM_MARK_APPLICABLE:'Team mark approved',TEAM_MARK_NOT_APPLICABLE:'Team mark not applicable',OTHER:'Academic decision recorded',unknown:'Assessment updated'};
  for(const [decision,label] of Object.entries(actions))assert(render([{decision}]).includes('<strong>'+label+'</strong>'));
  const statuses={COMPLETED:'Completed',MAKEUP_PENDING:'Awaiting makeup',COMPLETED_AFTER_MAKEUP:'Completed after makeup',ABSENT_UNAPPROVED:'Unapproved absence',ACADEMIC_DECISION_PENDING:'Awaiting academic decision',NON_PARTICIPATION:'Non-participation',INCOMPLETE:'Incomplete'};
  for(const [status,label] of Object.entries(statuses))assert(render([{previousStatus:status,resultingStatus:status}]).includes(label+' <span aria-label="changed to">→</span> '+label));
  assert.match(render([{decision:'unknown',at:'bad'}]),/Not assessed <span aria-label="changed to">→<\/span> Updated/);
  assert.doesNotMatch(render([{at:'bad'}]),/<time/);
  assert.equal(render([{decision:'targetSubmit',previousStatus:'INCOMPLETE',resultingStatus:'COMPLETED',reason:'Updated date.',reviewer:'reviewer@example.test'}]),'<details class="review1-history"><summary>Assessment history <span>1</span></summary><ol><li><div class="review1-history-heading"><strong>Assessment completed</strong></div><div class="review1-history-status">Incomplete <span aria-label="changed to">→</span> Completed</div><p>Updated date.</p><small>reviewer@example.test</small></li></ol></details>');
});
test('Review publishing uses the exact shared history output and Guide does not gain history',()=>{
  for(const key of ['review1','review2']){
    const f=publishingFixture(key);f.submit();const report=f.report();
    report.teams[0].students[0].decisions=[{decision:'targetSubmit',reason:'Reviewed evidence',previousStatus:'ACADEMIC_DECISION_PENDING',resultingStatus:'COMPLETED'}];
    const before=JSON.stringify(report),html=browser().markup(report,view());
    assert(html.includes(historyRenderer()(report.teams[0].students[0].decisions)));assert.equal(JSON.stringify(report),before);
    assert.match(html,/publishing-history-context/);
  }
  const f=publishingFixture('guide_eval');f.students.forEach(s=>f.guideSubmit(s.regNo));const report=f.report(),before=JSON.stringify(f.tables);
  assert.doesNotMatch(browser().markup(report,view()),/Assessment history|review1-history/);assert.equal(JSON.stringify(f.tables),before);
  const source=fs.readFileSync('review1-evaluation-client.js','utf8');assert.match(source,/return DashboardUI.renderAssessmentHistory\(decisions\)/);assert.doesNotMatch(source,/const automaticReasons=/);
});

for(const key of ['review1','review2','guide_eval'])test(key+': current roster provides counts and names before any evaluation',()=>{
  const f=publishingFixture(key),report=f.report(),team=report.teams[0];
  assert.equal(team.totalStudents,3);assert.equal(team.students.length,3);assert.equal(team.students[0].name,'Alex One');assert.equal(team.students[0].register,'s1');
  assert.equal(team.publicationState,'AWAITING_EVALUATION');assert.equal(team.canPublishTeam,false);
  assert.equal(team.students[0].publicationStatus,'NOT_PUBLISHED');
  const html=browser().markup(report,view());assert.match(html,/Alex One \(s1\)/);assert.match(html,/<th scope="col">Students<\/th><th scope="col">Result<\/th>/);assert.match(html,/Team, register number or name/);assert.match(html,/<th scope="col">Permission<\/th>/);
});

for(const key of ['review1','review2'])for(const scenario of ['COMPLETED','MAKEUP_PENDING','ACADEMIC_DECISION_PENDING','ABSENT_UNAPPROVED','NON_PARTICIPATION'])test(key+': '+scenario+' retains native and individual publication policy',()=>{
  const f=publishingFixture(key),input=f.input();
  if(scenario!=='COMPLETED'){
    input.students[0].scores={};
    input.students[0].absence=scenario==='MAKEUP_PENDING'?{type:'REVIEW_DAY_ABSENCE',approved:true,reason:'Documented'}:scenario==='ABSENT_UNAPPROVED'?{type:'REVIEW_DAY_ABSENCE',approved:false}: {type:'PROLONGED',approved:scenario==='ACADEMIC_DECISION_PENDING',attended:false,verifiedContribution:false,reason:'Documented'};
  }
  if(scenario==='ACADEMIC_DECISION_PENDING')input.students[0].absence.absenceReason='MEDICAL';
  f.submit(input);let report=f.report(),team=report.teams[0];
  assert.equal(team.students[0].assessmentStatus,scenario);assert.equal(team.students[0].publicationPermission,'ALLOWED');assert.equal(team.students[0].publicationStatus,'NOT_PUBLISHED');
  assert.equal(team.publicationState,'READY_TO_PUBLISH');assert.equal(team.canPublishTeam,true);
  const html=browser().markup(report,view());assert.match(html,/Ready to publish/);assert.match(html,/Publish Team/);assert.doesNotMatch(html,/data-state="PARTIAL_OR_EXCEPTION"/);
  f.publish('s1');team=f.report().teams[0];assert.equal(team.publicationState,'PARTIALLY_PUBLISHED');assert.equal(team.students[0].hasPublishedSnapshot,true);assert.equal(team.students[1].hasPublishedSnapshot,false);
  f.actor('one@x');const snapshot=f.c.loadPublishedReviewEvaluation_(key);assert(snapshot);assert.equal(snapshot.assessment.status,scenario);
  if(['MAKEUP_PENDING','ACADEMIC_DECISION_PENDING'].includes(scenario))assert.equal(snapshot.total,null);
  f.publish();team=f.report().teams[0];assert.equal(team.publicationState,'PUBLISHED');assert.equal(team.publishedStudents,3);
});

for(const key of ['review1','review2'])test(key+': makeup republication keeps old snapshots until individual publish; reopen withdraws snapshots',()=>{
  const f=publishingFixture(key),input=f.input();input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,reason:'Documented'};input.students[0].scores={};f.submit(input);f.publish();
  f.actor('reviewer@x');const d=f.c.getReviewEvaluation_('G18',key);
  f.c.saveReviewTargetedAssessment({review:key,team:'G18',student:'s1',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),submit:true,reason:'Makeup completed',scores:{I:{level:3,marks:33,remark:''}}});
  const team=f.report().teams[0];assert.equal(team.students[0].assessmentStatus,'COMPLETED_AFTER_MAKEUP');assert.equal(team.students[0].publicationStatus,'UPDATE_PENDING');assert.equal(team.students[0].publicationPermission,'ALLOWED');assert.equal(team.students[1].publicationStatus,'PUBLISHED');
  f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,null);f.publish('s1');f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,81);
  const latest=f.report().teams[0];f.c.review1Write_('reopen',{team:'G18',revision:latest.revision,requestId:crypto.randomUUID(),reason:'Correction'},key);
  assert.equal(f.report().teams[0].publicationState,'AWAITING_EVALUATION');f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key),null);
});

test('Review stale revisions, duplicate IDs, changed roster and authorization remain enforced',()=>{
  const f=publishingFixture();f.submit();const team=f.report().teams[0],input={team:team.team,revision:team.revision,requestId:crypto.randomUUID()};
  const first=f.c.publishReview1Evaluation(input),length=f.tables.Review1Evaluations.length;
  assert.equal(f.c.publishReview1Evaluation(input).revision,first.revision);assert.equal(f.tables.Review1Evaluations.length,length);
  assert.throws(()=>f.c.publishReview1Evaluation({...input,requestId:crypto.randomUUID()}),/changed/);
  assert.throws(()=>f.c.publishReview1Evaluation({...input,student:'s1'}),/Request ID/);
  f.actor('one@x');assert.throws(()=>f.c.loadInternalAssessmentPublishing('review1'),/Coordinator/);
  const changed=publishingFixture();changed.submit();changed.students[0].name='Updated';const model=changed.report().teams[0];
  assert.equal(model.canPublishTeam,false);assert.equal(model.canReopen,true);assert.equal(model.publicationState,'PARTIAL_OR_EXCEPTION');assert.match(model.students[0].blockingReason,/Roster/);
  assert.throws(()=>changed.c.publishReview1Evaluation({team:'G18',revision:1,requestId:crypto.randomUUID()}),/Roster/);
});

test('genuine zero roster, duplicate members, removed and new members surface data issues',()=>{
  for(const mutate of [f=>f.students.splice(0),f=>f.students.push({...f.students[0]}),f=>f.rows.push(f.row.slice())]){
    const f=publishingFixture();mutate(f);const team=f.report().teams[0];assert(team.issues.length);assert.equal(team.canPublishTeam,false);assert.equal(team.publicationState,'PARTIAL_OR_EXCEPTION');
  }
  const f=publishingFixture();f.submit();f.students.splice(0,1,{regNo:'NEW',name:'New member',email:'new@x'});const team=f.report().teams[0];assert.equal(team.totalStudents,3);assert.equal(team.students[0].register,'new');assert(team.issues.some(issue=>issue.includes('outside')));assert(team.issues.some(issue=>issue.includes('no matching')));
});

test('Guide sequential publication uses real individual revisions/history and reports partial failures',async()=>{
  const f=publishingFixture('guide_eval');f.students.forEach(s=>f.guideSubmit(s.regNo));const report=f.report(),api=browser();assert.equal(report.teams[0].publicationState,'READY_TO_PUBLISH');
  const jobs=report.teams[0].students.map(s=>({method:report.config.publishMethod,input:{team:'g18',student:s.register,revision:s.revision,requestId:crypto.randomUUID()}}));
  let calls=0,inFlight=0,max=0;
  const results=await api.runSequence(jobs,async(method,[input])=>{inFlight++;max=Math.max(max,inFlight);await Promise.resolve();inFlight--;calls++;if(input.student==='s2')throw Error('This evaluation changed. Reload before saving.');return f.c[method](input);});
  assert.equal(calls,3);assert.equal(max,1);assert.deepEqual(Array.from(results,r=>r.outcome),['success','failed','success']);assert.equal(f.report().teams[0].publicationState,'PARTIALLY_PUBLISHED');
  assert.equal(f.tables.GuideEvaluations.length,6);const retry=await api.runSequence(results.filter(r=>r.outcome!=='success'),async(method,[input])=>f.c[method](input));assert.equal(retry[0].outcome,'success');assert.equal(f.report().teams[0].publicationState,'PUBLISHED');
  const length=f.tables.GuideEvaluations.length;await api.runSequence(jobs,async(method,[input])=>f.c[method](input));assert.equal(f.tables.GuideEvaluations.length,length);
});

test('Guide sequential all-success, unknown response and same-ID retry do not duplicate writes',async()=>{
  const f=publishingFixture('guide_eval');f.students.forEach(s=>f.guideSubmit(s.regNo));const report=f.report(),api=browser();
  const jobs=report.teams[0].students.map(s=>({method:'publishGuideEvaluation',input:{team:'g18',student:s.register,revision:s.revision,requestId:crypto.randomUUID()}}));
  const results=await api.runSequence(jobs,async(method,[input])=>{const result=f.c[method](input);if(input.student==='s2')throw Error('Connection lost');return result;});
  assert.deepEqual(Array.from(results,r=>r.outcome),['success','uncertain','success']);const refreshed=f.report();assert.equal(refreshed.teams[0].publicationState,'PUBLISHED');assert.equal(refreshed.teams[0].students[1].publishedRequestId,jobs[1].input.requestId);
  const length=f.tables.GuideEvaluations.length;const retried=await api.runSequence(results.filter(r=>r.outcome!=='success'),async(method,[input])=>f.c[method](input));assert.equal(retried[0].outcome,'success');assert.equal(f.tables.GuideEvaluations.length,length);
  const fresh=publishingFixture('guide_eval');fresh.students.forEach(s=>fresh.guideSubmit(s.regNo));fresh.report();const all=await api.runSequence(jobs,async(method,[input])=>fresh.c[method](input));assert(all.every(r=>r.outcome==='success'));assert.equal(fresh.report().teams[0].publishedStudents,3);
});

test('Guide eligibility and reopen retain individual scope, roster guards and snapshot visibility',()=>{
  const f=publishingFixture('guide_eval');f.guideSubmit('S1');let report=f.report();assert.equal(report.teams[0].publicationState,'PARTIAL_OR_EXCEPTION');assert.equal(report.teams[0].students[1].publicationPermission,'BLOCKED');
  const input={team:'g18',student:'s1',revision:1,requestId:crypto.randomUUID()};f.c.publishGuideEvaluation(input);f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation().total,32);
  f.actor('two@x');assert.equal(f.c.loadPublishedGuideEvaluation(),null);f.report();assert.throws(()=>f.c.publishGuideEvaluation({...input,requestId:crypto.randomUUID()}),/changed/);
  f.c.reopenGuideEvaluation({...input,revision:2,requestId:crypto.randomUUID(),reason:'Correction'});f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation(),null);
  f.guideSubmit('S2');f.students[1].name='Changed';report=f.report();assert.match(report.teams[0].students[1].blockingReason,/Roster/);assert.equal(report.teams[0].students[1].canReopen,true);
  assert.throws(()=>f.c.publishGuideEvaluation({team:'g18',student:'s2',revision:1,requestId:crypto.randomUUID()}),/Roster/);
  assert(!report.teams[0].students.some(s=>/MAKEUP|ACADEMIC/.test(s.assessmentStatus)));
});

test('Guide academic completion is independent of publication status',()=>{
  const f=publishingFixture('guide_eval');f.guideSubmit('S1');let student=f.report().teams[0].students[0];
  assert.equal(student.assessmentStatus,'Complete');assert.equal(student.publicationPermission,'ALLOWED');assert.equal(student.publicationStatus,'NOT_PUBLISHED');
  f.c.publishGuideEvaluation({team:'g18',student:'s1',revision:1,requestId:crypto.randomUUID()});student=f.report().teams[0].students[0];
  assert.equal(student.assessmentStatus,'Complete');assert.equal(student.publicationPermission,'BLOCKED');assert.equal(student.publicationStatus,'PUBLISHED');
});

test('normalization never writes assessment or publication history',()=>{
  for(const key of ['review1','review2','guide_eval']){
    const f=publishingFixture(key);if(key==='guide_eval')f.guideSubmit('S1');else {f.submit();f.publish('s1');}
    const before=JSON.stringify(f.tables);f.report();f.report();assert.equal(JSON.stringify(f.tables),before);
  }
});

test('common markup uses compact rows, escapes data, separates permission, and exposes secondary reopening',()=>{
  const f=publishingFixture();f.submit();const report=f.report();report.teams[0].students[0].name='<img src=x>';const api=browser(),s=view(),html=api.markup(report,s);
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);assert.match(html,/data-detail-row hidden/);assert.match(html,/Reopen full review/);assert.match(html,/Allowed under current policy/);
  assert.equal((html.match(/data-team="/g)||[]).length,1);assert.match(html,/aria-expanded="false"/);
  s.open.add('g18');assert.match(api.markup(report,s),/aria-expanded="true"/);
  s.outcomes.set('g18',[{input:{team:'g18'},outcome:'uncertain',error:'Offline'}]);assert.match(api.markup(report,s),/data-state="PARTIAL_OR_EXCEPTION"/);
});
