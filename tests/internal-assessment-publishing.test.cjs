const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function browser(){const c=vm.createContext({Map,Set,window:{crypto},document:{},setTimeout,clearTimeout});for(const file of ['assessment-history-view.js','lucide-icons.js','icon-renderer.js','shared-table.js','internal-assessment-publishing-client.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);c.DashboardUI={renderIcon:c.renderLucideIcon_,renderAssessmentHistory:c.renderAssessmentHistory_};return c.internalAssessmentPublishingBrowser_(null,c.sharedTableBrowser_());}
const view=()=>({query:'',filter:'all',open:new Set(),outcomes:new Map()});

function historyRenderer(){const c=vm.createContext({});vm.runInContext(fs.readFileSync('assessment-history-view.js','utf8'),c);return c.renderAssessmentHistory_;}
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
  assert.match(html,/Assessment history <span[^>]*>4<\/span>/);assert.match(html,/Updated &lt;date&gt; &amp; evidence\nSecond line/);assert.match(html,/&lt;reviewer&gt;/);
  assert.doesNotMatch(html,/source facts|recorded as unapproved|Absence details recorded|Invalid Date/);
  assert.match(html,/datetime="2026-09-24T23:05:12.872Z"/);assert.match(html,/Awaiting makeup/);assert.match(html,/Completed after makeup/);
  assert(html.indexOf('Assessment completed')<html.indexOf('Absence details updated'));
  assert.equal(render([]),'');assert.equal(render(null),'');assert.equal(render(undefined),'');
});
test('shared history preserves all drawer labels and fallback behavior',()=>{
  const render=historyRenderer();
  const actions={exception:'Absence details updated',targetSubmit:'Assessment completed',targetDraft:'Assessment draft saved',MAKEUP_ALTERNATIVE_ASSESSMENT:'Assessment authorized',DEFERRED_ASSESSMENT:'Assessment deferred',TEAM_MARK_APPLICABLE:'Team mark approved',TEAM_MARK_NOT_APPLICABLE:'Team mark not applicable',OTHER:'Academic decision recorded',unknown:'Assessment updated'};
  for(const [decision,label] of Object.entries(actions))assert(render([{decision}]).includes('>'+label+'</strong>'));
  const statuses={COMPLETED:'Completed',MAKEUP_PENDING:'Awaiting makeup',COMPLETED_AFTER_MAKEUP:'Completed after makeup',ABSENT_UNAPPROVED:'Unapproved absence',ACADEMIC_DECISION_PENDING:'Awaiting academic decision',NON_PARTICIPATION:'Non-participation',INCOMPLETE:'Incomplete'};
  for(const [status,label] of Object.entries(statuses))assert(render([{previousStatus:status,resultingStatus:status}]).includes(label+' <span class="text-muted">changed to</span> '+label));
  assert.match(render([{decision:'unknown',at:'bad'}]),/Not assessed <span[^>]*>changed to<\/span> Updated/);
  assert.doesNotMatch(render([{at:'bad'}]),/<time/);
  const one=render([{decision:'targetSubmit',previousStatus:'INCOMPLETE',resultingStatus:'COMPLETED',reason:'Updated date.',reviewer:'reviewer@example.test'}]);
  for(const part of ['Assessment completed','Incomplete','changed to','Completed','Updated date.','reviewer@example.test'])assert(one.includes(part),part);
  assert.doesNotMatch(one,/\sstyle=|\son[a-z]+=/);
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
  assert.doesNotMatch(browser().markup(report,view()),/Assessment history|review-history/);assert.equal(JSON.stringify(f.tables),before);
  const source=fs.readFileSync('review-evaluation-client.js','utf8');assert.doesNotMatch(source,/const automaticReasons=|ACADEMIC_DECISION_PENDING/);
});

for(const key of ['review1','review2','guide_eval'])test(key+': current roster provides counts and names before any evaluation',()=>{
  const f=publishingFixture(key),report=f.report(),team=report.teams[0];
  assert.equal(team.totalStudents,3);assert.equal(team.students.length,3);assert.equal(team.students[0].name,'Alex One');assert.equal(team.students[0].register,'s1');
  assert.equal(team.publicationState,'AWAITING_EVALUATION');assert.equal(team.canPublishTeam,false);
  assert.equal(team.students[0].publicationStatus,'NOT_PUBLISHED');
  const html=browser().markup(report,view());assert.match(html,/Alex One \(s1\)/);assert.match(html,/>Guide<\/th><th scope="col" class="[^"]*">Result<\/th>/);assert.match(html,/Team, register number or name/);assert.match(html,/>Permission<\/th>/);
});

for(const key of ['review1','review2'])for(const scenario of ['COMPLETED','MAKEUP_PENDING'])test(key+': '+scenario+' retains native and individual publication policy',()=>{
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

for(const key of ['review1','review2'])test(key+': makeup republication keeps old snapshots until individual publish; reopen retains snapshots',()=>{
  const f=publishingFixture(key),input=f.input();input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,reason:'Documented'};input.students[0].scores={};f.submit(input);f.publish();
  f.actor('reviewer@x');const d=f.c.getReviewEvaluation_('G18',key);
  f.c.submitReviewMakeup_({assessmentId:key,team:'G18',student:'s1',revision:d.revision,token:d.token,requestId:crypto.randomUUID(),submit:true,reason:'Makeup completed',scores:{I:{level:3,marks:33,remark:''}}});
  const team=f.report().teams[0];assert.equal(team.students[0].assessmentStatus,'COMPLETED');assert.equal(team.students[0].publicationStatus,'UPDATE_PENDING');assert.equal(team.students[0].publicationPermission,'ALLOWED');assert.equal(team.students[1].publicationStatus,'PUBLISHED');
  f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,null);f.publish('s1');f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,81);
  const latest=f.report().teams[0];f.c.reviewWrite_('reopen',{team:'G18',revision:latest.revision,requestId:crypto.randomUUID(),reason:'Correction'},key);
  assert.equal(f.report().teams[0].publicationState,'PARTIALLY_PUBLISHED');f.actor('one@x');assert.equal(f.c.loadPublishedReviewEvaluation_(key).total,81);assert.equal(f.c.loadPublishedReviewEvaluation_(key).underCorrection,true);
});

test('Review stale revisions, duplicate IDs, changed roster and authorization remain enforced',()=>{
  const f=publishingFixture();f.submit();const team=f.report().teams[0],input={team:team.team,revision:team.revision,requestId:crypto.randomUUID()};
  const first=f.c.publishInternalAssessment_({...(input),assessmentId:'review1'}),length=f.tables.Review1Evaluations.length;
  assert.equal(f.c.publishInternalAssessment_({...(input),assessmentId:'review1'}).revision,first.revision);assert.equal(f.tables.Review1Evaluations.length,length);
  assert.throws(()=>f.c.publishInternalAssessment_({...({...input,requestId:crypto.randomUUID()}),assessmentId:'review1'}),/changed/);
  assert.throws(()=>f.c.publishInternalAssessment_({...({...input,student:'s1'}),assessmentId:'review1'}),/Request ID/);
  f.actor('one@x');assert.throws(()=>f.c.loadInternalAssessmentPublishing_('review1'),/Coordinator/);
  const changed=publishingFixture();changed.submit();changed.students[0].name='Updated';const model=changed.report().teams[0];
  assert.equal(model.canPublishTeam,true);assert.equal(model.canReopen,true);assert.equal(model.publicationState,'READY_TO_PUBLISH');changed.students[0].regNo='replacement';
  assert.throws(()=>changed.c.publishInternalAssessment_({...({team:'G18',revision:1,requestId:crypto.randomUUID()}),assessmentId:'review1'}),/Roster/);
});

test('genuine zero roster, duplicate members, removed and new members surface data issues',()=>{
  for(const mutate of [f=>f.students.splice(0),f=>f.students.push({...f.students[0]}),f=>f.rows.push(f.row.slice())]){
    const f=publishingFixture();mutate(f);const team=f.report().teams[0];assert(team.issues.length);assert.equal(team.canPublishTeam,false);assert.equal(team.publicationState,'PARTIAL_OR_EXCEPTION');
  }
  const f=publishingFixture();f.submit();f.students.splice(0,1,{regNo:'NEW',name:'New member',email:'new@x'});const team=f.report().teams[0];assert.equal(team.totalStudents,3);assert.equal(team.students[0].register,'new');assert(team.issues.some(issue=>issue.includes('outside')));assert(team.issues.some(issue=>issue.includes('no matching')));
});

test('Guide sequential publication uses real individual revisions/history and reports partial failures',async()=>{
  const f=publishingFixture('guide_eval');f.students.forEach(s=>f.guideSubmit(s.regNo));const report=f.report(),api=browser();assert.equal(report.teams[0].publicationState,'READY_TO_PUBLISH');
  const jobs=report.teams[0].students.map(s=>({method:report.config.publishMethod,input:{assessmentId:'guide_eval',team:'g18',student:s.register,revision:s.revision,requestId:crypto.randomUUID()}}));
  let calls=0,inFlight=0,max=0;
  const results=await api.runSequence(jobs,async(method,[input])=>{inFlight++;max=Math.max(max,inFlight);await Promise.resolve();inFlight--;calls++;if(input.student==='s2')throw Error('This evaluation changed. Reload before saving.');return f.c[method](input);});
  assert.equal(calls,3);assert.equal(max,1);assert.deepEqual(Array.from(results,r=>r.outcome),['success','failed','success']);assert.equal(f.report().teams[0].publicationState,'PARTIALLY_PUBLISHED');
  assert.equal(f.tables.GuideEvaluations.length,6);const retry=await api.runSequence(results.filter(r=>r.outcome!=='success'),async(method,[input])=>f.c[method](input));assert.equal(retry[0].outcome,'success');assert.equal(f.report().teams[0].publicationState,'PUBLISHED');
  const length=f.tables.GuideEvaluations.length;await api.runSequence(jobs,async(method,[input])=>f.c[method](input));assert.equal(f.tables.GuideEvaluations.length,length);
});

test('Guide sequential all-success, unknown response and same-ID retry do not duplicate writes',async()=>{
  const f=publishingFixture('guide_eval');f.students.forEach(s=>f.guideSubmit(s.regNo));const report=f.report(),api=browser();
  const jobs=report.teams[0].students.map(s=>({method:'publishInternalAssessment_',input:{assessmentId:'guide_eval',team:'g18',student:s.register,revision:s.revision,requestId:crypto.randomUUID()}}));
  const results=await api.runSequence(jobs,async(method,[input])=>{const result=f.c[method](input);if(input.student==='s2')throw Error('Connection lost');return result;});
  assert.deepEqual(Array.from(results,r=>r.outcome),['success','uncertain','success']);const refreshed=f.report();assert.equal(refreshed.teams[0].publicationState,'PUBLISHED');assert.equal(refreshed.teams[0].students[1].publishedRequestId,jobs[1].input.requestId);
  const length=f.tables.GuideEvaluations.length;const retried=await api.runSequence(results.filter(r=>r.outcome!=='success'),async(method,[input])=>f.c[method](input));assert.equal(retried[0].outcome,'success');assert.equal(f.tables.GuideEvaluations.length,length);
  const fresh=publishingFixture('guide_eval');fresh.students.forEach(s=>fresh.guideSubmit(s.regNo));fresh.report();const all=await api.runSequence(jobs,async(method,[input])=>fresh.c[method](input));assert(all.every(r=>r.outcome==='success'));assert.equal(fresh.report().teams[0].publishedStudents,3);
});

test('Guide eligibility and reopen retain individual scope, roster guards and snapshot visibility',()=>{
  const f=publishingFixture('guide_eval');f.guideSubmit('S1');let report=f.report();assert.equal(report.teams[0].publicationState,'PARTIAL_OR_EXCEPTION');assert.equal(report.teams[0].students[1].publicationPermission,'BLOCKED');
  const input={team:'g18',student:'s1',revision:1,requestId:crypto.randomUUID()};f.c.publishInternalAssessment_({...input,assessmentId:'guide_eval'});f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation_().total,32);
  f.actor('two@x');assert.equal(f.c.loadPublishedGuideEvaluation_(),null);f.report();assert.throws(()=>f.c.publishInternalAssessment_({...{...input,requestId:crypto.randomUUID()},assessmentId:'guide_eval'}),/changed/);
  f.c.reopenGuideEvaluation_({...input,revision:2,requestId:crypto.randomUUID(),reason:'Correction'});f.actor('one@x');assert.equal(f.c.loadPublishedGuideEvaluation_().underCorrection,true);
  f.guideSubmit('S2');f.students[1].regNo='replacement';report=f.report();assert.equal(report.teams[0].students[1].publicationPermission,'BLOCKED');assert.equal(report.teams[0].students[1].canReopen,false);
  assert.throws(()=>f.c.publishInternalAssessment_({...{team:'g18',student:'replacement',revision:0,requestId:crypto.randomUUID()},assessmentId:'guide_eval'}),/not available/);
  assert(!report.teams[0].students.some(s=>/MAKEUP|ACADEMIC/.test(s.assessmentStatus)));
});

test('Guide academic completion is independent of publication status',()=>{
  const f=publishingFixture('guide_eval');f.guideSubmit('S1');let student=f.report().teams[0].students[0];
  assert.equal(student.assessmentStatus,'COMPLETED');assert.equal(student.publicationPermission,'ALLOWED');assert.equal(student.publicationStatus,'NOT_PUBLISHED');
  f.c.publishInternalAssessment_({...{team:'g18',student:'s1',revision:1,requestId:crypto.randomUUID()},assessmentId:'guide_eval'});student=f.report().teams[0].students[0];
  assert.equal(student.assessmentStatus,'COMPLETED');assert.equal(student.publicationPermission,'BLOCKED');assert.equal(student.publicationStatus,'PUBLISHED');
});

test('normalization never writes assessment or publication history',()=>{
  for(const key of ['review1','review2','guide_eval']){
    const f=publishingFixture(key);if(key==='guide_eval')f.guideSubmit('S1');else {f.submit();f.publish('s1');}
    const before=JSON.stringify(f.tables);f.report();f.report();assert.equal(JSON.stringify(f.tables),before);
  }
});

test('common markup uses compact rows, escapes data, separates permission, and exposes secondary reopening',()=>{
  const f=publishingFixture();f.submit();const report=f.report();report.teams[0].students[0].name='<img src=x>';const api=browser(),s=view(),html=api.markup(report,s);
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);assert.match(html,/data-detail-row hidden/);assert.match(html,/Reopen assessment/);assert.match(html,/Allowed under current policy/);
  assert.equal((html.match(/data-team="/g)||[]).length,1);assert.match(html,/aria-expanded="false"/);
  s.open.add('g18');assert.match(api.markup(report,s),/aria-expanded="true"/);
  s.outcomes.set('g18',[{input:{team:'g18'},outcome:'uncertain',error:'Offline'}]);assert.match(api.markup(report,s),/data-state="PARTIAL_OR_EXCEPTION"/);
});

test('publication endpoints delegate to the existing functions, keep their rules and reject unknown methods',()=>{
  const f=publishingFixture();f.submit();vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  f.report();const read=JSON.parse(f.c.API_publishing_get('review1'));assert.equal(read.ok,true);assert.deepEqual(plain(read.data),plain(f.report()));
  const team=f.report().teams[0],input={assessmentId:'review1',team:team.team,revision:team.revision,requestId:crypto.randomUUID()};
  const published=JSON.parse(f.c.API_publishing_run('publishInternalAssessment_',input));assert.equal(published.ok,true);
  const stale=JSON.parse(f.c.API_publishing_run('publishInternalAssessment_',{...input,requestId:crypto.randomUUID()}));
  assert.equal(stale.ok,false);assert.equal(stale.error.code,'REJECTED');assert.match(stale.error.message,/changed/);
  for(const name of ['constructor','toString'])assert.equal(JSON.parse(f.c.API_publishing_run(name,input)).error.code,'INVALID_INPUT');
  f.actor('one@x');assert.match(JSON.parse(f.c.API_publishing_get('review1')).error.message,/Coordinator/);
});

test('the results download is read-only, coordinator-only, sorted by register number and published results only',()=>{
  const f=publishingFixture('review1');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  const read=()=>JSON.parse(f.c.API_publishing_export('review1'));
  f.actor('one@x');assert.match(read().error.message,/Coordinator/);
  f.actor('coord@x');
  let data=read().data;
  assert.deepEqual(plain(data.criteria.map(c=>c.pi)),['T','I']);
  assert.deepEqual(plain(data.rows.map(r=>r.register)),['s1','s2','s3'],'sorted by register number');
  assert(data.rows.every(r=>r.total==='NA'&&r.scores.T==='NA'&&r.scores.I==='NA'),'nothing is published yet');
  const input=f.input();input.students[0].scores={};input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,reason:'Documented'};
  f.submit(input);f.actor('coord@x');
  assert(read().data.rows.every(r=>r.total==='NP'&&r.scores.T==='NP'),'submitted but not published is NP');
  const before=JSON.stringify(f.tables);
  f.publish();
  data=read().data;
  const by=Object.fromEntries(data.rows.map(r=>[r.register,r]));
  assert.deepEqual(plain(by.s1),{register:'s1',name:'Alex One',team:'G18',scores:{T:'A',I:'A'},total:'A',comments:'Absence: Review-day absence, approved.'},'absent without a makeup is A everywhere');
  assert.equal(by.s2.scores.T,48);assert.equal(by.s2.scores.I,32);assert.equal(by.s2.total,80);
  assert.notEqual(JSON.stringify(f.tables),before,'publishing changed the journal, reading it does not');
  const after=JSON.stringify(f.tables);read();assert.equal(JSON.stringify(f.tables),after);
});

test('the results download marks a roster that cannot be read as ERR and an unapproved absence as A',()=>{
  const f=publishingFixture('review1');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);f.actor('coord@x');
  const input=f.input();input.students[0].scores={};input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:false};
  f.submit(input);f.publish();
  const rows=JSON.parse(f.c.API_publishing_export('review1')).data.rows;
  assert.equal(rows.find(r=>r.register==='s1').total,'A');
  const real=f.c.publicationRoster_;f.c.publicationRoster_=()=>{throw new Error('Team is missing or ambiguous.');};
  assert(JSON.parse(f.c.API_publishing_export('review1')).data.rows.every(r=>r.total==='ERR'&&r.scores.I==='ERR'));
  f.c.publicationRoster_=real;
});

test('the results download separates a team that is not eligible yet (NE) from an eligible team with nothing published (NA), and names the team',()=>{
  const f=publishingFixture('review2');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  const definitions=f.c.getAssessmentDefinitions_().map(d=>d.key==='review2'?{...d,sequence:2}:d);
  f.c.getAssessmentDefinitions_=()=>definitions;f.c.requireAssessmentDefinitions_=()=>definitions;
  f.actor('coord@x');
  let rows=JSON.parse(f.c.API_publishing_export('review2')).data.rows;
  assert(rows.every(r=>r.team==='G18'&&r.total==='NE'&&r.scores.T==='NE'&&r.scores.I==='NE'),'Review 1 is not recorded, so Review 2 is not open for the team');
  // Recording Review 1 for the team opens Review 2.
  f.c.reviewWrite_('submit',(()=>{const loaded=f.c.getReviewEvaluation_('G18','review1');return {team:'G18',revision:loaded.revision,token:loaded.token,requestId:'11111111-1111-4111-8111-111111111111',teamScores:{T:{level:3,marks:48,remark:''}},students:f.students.map(s=>({register:s.regNo.toLowerCase(),absence:{type:'NORMAL'},scores:{I:{level:3,marks:32,remark:''}}}))};})(),'review1');
  f.actor('coord@x');
  rows=JSON.parse(f.c.API_publishing_export('review2')).data.rows;
  assert(rows.every(r=>r.total==='NA'),'eligible, nothing published');
});

test('the results download tells NA (not assessed), NS (draft), NP (submitted) apart, and carries the definitions',()=>{
  const f=publishingFixture('review1');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  const read=()=>{f.actor('coord@x');return JSON.parse(f.c.API_publishing_export('review1')).data;};
  let data=read();
  assert(data.rows.every(r=>r.total==='NA'),'eligible, not assessed');
  assert.deepEqual(plain(data.legend.map(item=>item.code)),['A','NE','NA','NS','NP','ERR']);
  assert(data.legend.every(item=>item.meaning.length>10));
  f.actor('reviewer@x');f.c.reviewWrite_('draft',f.input(),'review1');
  data=read();assert(data.rows.every(r=>r.total==='NS'&&r.scores.I==='NS'),'a saved draft is NS');
  f.submit();
  data=read();assert(data.rows.every(r=>r.total==='NP'),'submitted, not published is NP');
  f.publish();
  data=read();assert(data.rows.every(r=>r.total===80),'published shows the marks');
});

test('the results download lists every remark of the team and of the student in one comments cell, one line per PI',()=>{
  const f=publishingFixture('review1');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  const input=f.input();
  input.teamScores.T.remark='Strong design.';
  input.students[0].scores.I.remark='Presented well.';
  input.students[1].scores.I.remark='  ';
  f.submit(input);f.publish();f.actor('coord@x');
  const by=Object.fromEntries(JSON.parse(f.c.API_publishing_export('review1')).data.rows.map(r=>[r.register,r]));
  assert.equal(by.s1.comments,'T: Strong design.\nI: Presented well.');
  assert.equal(by.s2.comments,'T: Strong design.','a blank remark adds nothing, the team remark is shared');
  assert.equal(by.s3.comments,'T: Strong design.');
});

test('an absent student with no makeup gets the absence details, not the team remarks',()=>{
  const f=publishingFixture('review1');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  const input=f.input();input.teamScores.T.remark='Strong design.';
  input.students[0].scores={};input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,reason:'Documented'};
  f.submit(input);f.publish();f.actor('coord@x');
  const by=Object.fromEntries(JSON.parse(f.c.API_publishing_export('review1')).data.rows.map(r=>[r.register,r]));
  assert.equal(by.s1.total,'A');assert.equal(by.s1.comments,'Absence: Review-day absence, approved.');
  assert.equal(by.s2.comments,'T: Strong design.');
});

test('absence details say the kind, approval, contribution and supporting evidence in words',()=>{
  const f=publishingFixture('review1');vm.runInContext(fs.readFileSync('api-envelope.js','utf8'),f.c);
  const input=f.input();
  input.students[0].scores={};input.students[0].absence={type:'REVIEW_DAY_ABSENCE',approved:true,supportingEvidence:['MEDICAL_DOCUMENT','OTHER'],otherEvidenceText:'Hospital letter'};
  input.students[1].scores={};input.students[1].absence={type:'REVIEW_DAY_ABSENCE',approved:false};
  f.submit(input);f.publish();f.actor('coord@x');
  const by=Object.fromEntries(JSON.parse(f.c.API_publishing_export('review1')).data.rows.map(r=>[r.register,r]));
  assert.equal(by.s1.comments,'Absence: Review-day absence, approved. Supporting evidence: Medical document; Other: Hospital letter.');
  assert.equal(by.s2.comments,'Absence: Review-day absence, not approved.');
  assert.equal(by.s3.comments,'');
  assert.equal(f.c.publicationAbsenceNote_({assessment:{facts:{type:'PROLONGED',approved:true,verifiedContribution:true,attended:false}}}),'Absence: Prolonged absence, approved, contribution established.');
  assert.equal(f.c.publicationAbsenceNote_({assessment:{facts:{type:'PROLONGED',approved:null,verifiedContribution:false,attended:true}}}),'','a prolonged absence that still attended the Review is not an absence');
});
