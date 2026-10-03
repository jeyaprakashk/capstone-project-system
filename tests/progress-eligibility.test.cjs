const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');

function fixture(){
 const f=weeklyFixture();f.setEligibility('');f.user('coord@example.com');
 f.set('Guide Email','guide@example.com');f.set('Semester','ODD');f.set('Title Approved By','reviewer@example.com');
 f.c.getAcademicYear=()=> '2026-27';
 const registry=f.sheet('MasterRegistry',[['Year','Semester','Team','Guide','Title','Repo','Members','Approved','Reviewer'],
  ['2026-27','ODD','T1','guide@example.com','Project','','',new Date('2026-01-01T00:00:00Z'),'reviewer@example.com']]);
 f.c.getHubRegistrySheet=()=>registry;
 const calls=[];let response;
 const commit=(id,at,sha='a'.repeat(40))=>({sha,author:{id:Number(id),login:id==='101'?'alice':'bob',type:'User'},commit:{message:'Implemented sensor acquisition',committer:{date:at}}});
 const normal=path=>{
  if(path.startsWith('/user/')){const id=path.split('/').at(-1);return {status:200,body:{id:Number(id),type:'User',login:id==='101'?'alice':'bob',html_url:'https://github.com/'+(id==='101'?'alice':'bob')}};}
  if(path.includes('/permission')){const id=path.includes('/alice/')?101:102;return {status:200,body:{permission:'write',user:{id}}};}
  if(path.includes('/commits'))return {status:200,body:[],headers:{}};
  throw Error('Unexpected path '+path);
 };
 response=normal;
 f.c.progressGithubGet_=path=>{assert.equal(f.locked(),false,'network outside script lock');calls.push(path);return response(path);};
 const record=reg=>f.c.readProgressEligibility_().find(r=>r.regNo===(reg||'001'));
 return {...f,registry,calls,commit,normal,record,respond:fn=>{response=fn;},run:()=>f.c.reconcileProgressEligibility()};
}

test('normal-deadline calculation is inclusive, never uses late cutoff, and handles absent future windows',()=>{
 const f=fixture(),windows=f.c.getWeeklySubmissionWindows_();
 for(const [at,expected] of [['2025-12-20T00:00:00Z','W1'],['2026-01-05T18:00:00Z','W1'],['2026-01-05T18:00:00.001Z','W2']]){
  const r=f.c.calculateProgressEligibility_({effectiveDate:at,titleDate:'2025-12-19T00:00:00Z',titleStatus:'APPROVED'},windows,new Date('2026-01-09'));
  assert.equal(r.eligibleFrom,expected);assert.equal(r.enforcedFrom,expected);assert.equal(r.fixingDate.toISOString(),new Date(at).toISOString());
 }
 const r=f.c.calculateProgressEligibility_({effectiveDate:'2026-02-01',titleDate:'2026-01-01',titleStatus:'APPROVED'},windows,new Date('2026-02-02'));
 assert.equal(r.status,'WAITING_WINDOW');assert.equal(r.eligibleFrom,undefined);
});

test('earliest reliable date wins and repository commit scans are shared without audit requests',()=>{
 const f=fixture();f.respond(p=>p.includes('/commits')?{status:200,body:[f.commit('101','2026-01-01T12:00:00Z'),f.commit('102','2026-01-01T13:00:00Z')]}:f.normal(p));
 const result=f.run();assert.equal(result.fixed,2);
 assert.equal(f.record().source,'FIRST_COMMIT');assert.equal(f.record().effectiveDate.toISOString(),'2026-01-01T12:00:00.000Z');
 assert(f.record().firstDetected);assert(JSON.parse(f.record().evidence).commit.sha);
 assert.equal(f.calls.filter(p=>p.includes('/audit-log')).length,0);assert.equal(f.calls.filter(p=>p.includes('/commits')).length,1);
});

test('unresolved students retain earlier established commit evidence after history changes',()=>{
  const f=fixture();f.registry.rows.splice(1);
  f.respond(p=>p.includes('/commits')?{status:200,body:[f.commit('101','2026-01-01')]}:f.normal(p));
  f.run();assert.equal(f.record().eligibleFrom,'');
  const reference=f.record().evidence;
  f.respond(p=>p.includes('/commits')?{status:200,body:[]}:f.normal(p));
  f.run();assert.equal(f.record().effectiveDate.toISOString(),'2026-01-01T00:00:00.000Z');
  assert.equal(f.record().evidence,reference);assert.equal(f.record().source,'FIRST_COMMIT');
});

test('first detection can precede a qualifying commit; either date alone is sufficient',()=>{
 const f=fixture();f.time('2026-01-10');
 for(const [record,source,date] of [
  [{firstDetected:'2026-01-01',firstCommit:'2026-01-02'},'FIRST_DETECTED','2026-01-01'],
  [{firstDetected:'2026-01-02',firstCommit:'2026-01-01'},'FIRST_COMMIT','2026-01-01'],
  [{firstDetected:'2026-01-01'},'FIRST_DETECTED','2026-01-01'],
  [{firstCommit:'2026-01-01'},'FIRST_COMMIT','2026-01-01']]){
   const result=f.c.progressSelectEvidenceDate_(record);assert.equal(result.source,source);assert.equal(result.effectiveDate.toISOString(),date+'T00:00:00.000Z');
 }
 assert.equal(f.c.progressSelectEvidenceDate_({firstDetected:'invalid',firstCommit:'2030-01-01'}).effectiveDate,'');
});

test('full-history commits use numeric authors and complete pagination before earliest selection',()=>{
 const f=fixture();
 f.respond(p=>{
  if(p.includes('/commits'))return p.includes('page=2')?{status:200,body:[f.commit('101','2025-12-01T00:00:00Z','b'.repeat(40)),f.commit('102','2025-12-02T00:00:00Z')],headers:{}}:
   {status:200,body:[f.commit('101','2026-01-01T00:00:00Z')],headers:{Link:'<https://api.github.com/repos/org/team/commits?per_page=100&page=2>; rel="next"'}};
  return f.normal(p);
 });
 const before=JSON.stringify(f.sheets.get('Commits').rows);f.run();
 assert.equal(f.record().source,'FIRST_COMMIT');assert.equal(f.record().firstCommit.toISOString(),'2025-12-01T00:00:00.000Z');
 assert.equal(f.record().fixingDate.toISOString(),'2026-01-01T00:00:00.000Z');
 assert.equal(f.calls.filter(p=>p.includes('/commits')).length,2);assert(!f.calls.some(p=>p.includes('since=')));assert.equal(JSON.stringify(f.sheets.get('Commits').rows),before);
});

test('commit fallback excludes bootstrap, bots, unknown identities, invalid records and username substitutes',()=>{
 const f=fixture();const good=f.commit('101','2026-01-01');
 const invalid=[{...good,author:{...good.author,id:102,login:'alice'}},{...good,author:null},{...good,sha:'bad'},
  {...good,author:{...good.author,type:'Bot'}},{...good,author:{...good.author,login:'system'}},
  {...good,commit:{message:'Initial commit: Capstone project for Team T1',committer:{date:'2026-01-01'}}},
  {...good,commit:{message:'Work',committer:{date:'invalid'}}}];
 assert.equal(f.c.progressCommitEvidence_(invalid,'org/team','101',Date.parse('2026-01-02')),null);
});

test('first detection is recorded once and never moves while waiting for title',()=>{
 const f=fixture();f.set('Reviewer Decision','');f.run();
 const first=f.record().firstDetected.toISOString();assert.equal(f.record().status,'WAITING_TITLE');assert.equal(f.record().eligibleFrom,'');
 f.time('2026-01-03T12:00:00Z');f.run();assert.equal(f.record().firstDetected.toISOString(),first);
 f.set('Reviewer Decision','Approved');f.run();assert.equal(f.record().source,'FIRST_DETECTED');assert.equal(f.record().eligibleFrom,'W1');
});

test('no collaborator or historical evidence leaves approved student unresolved; invitation is not access',()=>{
 const f=fixture();f.respond(p=>p.includes('/permission')?{status:404,body:{}}:f.normal(p));f.run();
 assert.equal(f.record().status,'WAITING_GITHUB');assert.equal(f.record().firstDetected,'');assert.equal(f.record().eligibleFrom,'');
});

test('two students in one team can have different start weeks',()=>{
 const f=fixture();f.time('2026-01-09T00:00:00Z');f.respond(p=>p.includes('/commits')?{status:200,body:[f.commit('101','2026-01-05T18:00:00Z'),f.commit('102','2026-01-05T18:00:00.001Z')]}:f.normal(p));
 f.run();assert.equal(f.record('001').eligibleFrom,'W1');assert.equal(f.record('002').eligibleFrom,'W2');
});

test('fixed students are not checked, mutated, or dependent on GitHub availability on later runs',()=>{
 const f=fixture();f.run();const before=JSON.stringify(f.pe.rows),calls=f.calls.length;
 f.respond(()=>{throw Error('offline');});f.time('2026-01-09');const result=f.run();
 assert.equal(result.checked,0);assert.equal(f.calls.length,calls);assert.equal(JSON.stringify(f.pe.rows),before);
});

test('commit errors defer fixing and preserve positive first detection',()=>{
 for(const status of [401,403,404,429,500]){
  const f=fixture();f.respond(p=>p.includes('/commits')?{status,body:{}}:f.normal(p));f.run();
  assert.equal(f.record().eligibleFrom,'');assert.equal(f.record().status,'CHECK_ERROR');assert(f.record().firstDetected);
  assert(!f.calls.some(p=>p.includes('/audit-log')));
 }
});

test('retired audit configuration is ignored; steady state never uses account submission timestamps',()=>{
 const f=fixture();f.properties.set('PROGRESS_ELIGIBILITY_AUDIT_MODE','UNAVAILABLE');f.run();
 assert.equal(f.record().source,'FIRST_DETECTED');assert(!f.calls.some(p=>p.includes('/audit-log')));
 const invalid=fixture();invalid.properties.set('PROGRESS_ELIGIBILITY_AUDIT_MODE','disabled');
 invalid.sheets.get('GitHubAccounts').rows[1][0]=new Date('2025-12-01');invalid.run();
 assert.equal(invalid.record().source,'FIRST_DETECTED');assert.equal(invalid.record().effectiveDate.toISOString(),'2026-01-02T12:00:00.000Z');
});

test('failed commit pagination must not fall through to first detection',()=>{
 const f=fixture();f.respond(p=>p.includes('/commits')?(p.includes('page=2')?{status:503,body:{}}:{status:200,body:[f.commit('101','2025-12-01')],headers:{Link:'<https://api.github.com/repos/org/team/commits?per_page=100&page=2>; rel="next"'}}):f.normal(p));
 f.run();assert.equal(f.record().eligibleFrom,'');assert.equal(f.record().status,'CHECK_ERROR');assert(f.record().firstDetected);assert.equal(f.record().firstCommit,'');
});

test('time-budget, cyclic and foreign pagination failures are never evidence absence',()=>{
 const f=fixture();assert.throws(()=>f.c.progressGithubPages_('/repos/org/team/commits',()=>{throw Error('must not call');},0),/incomplete/);
 assert.throws(()=>f.c.progressGithubPages_('/repos/org/team/commits',()=>({status:200,body:[],headers:{link:'<https://evil.test/repos/org/team/commits?page=2>; rel="next"'}}),Infinity),/pagination/);
 assert.throws(()=>f.c.progressGithubPages_('/repos/org/team/commits',()=>({status:200,body:[],headers:{link:'<https://api.github.com/repos/org/team/commits>; rel="next"'}}),Infinity),/incomplete/);
});

test('missing and mismatched authoritative title dates do not become observation time',()=>{
 for(const change of [f=>f.registry.rows[1][7]='',f=>f.registry.rows[1][0]='2025-26',f=>f.registry.rows[1][4]='Different title',f=>f.registry.rows[1][8]='wrong@example.com']){
  const f=fixture();change(f);f.run();assert.equal(f.record().eligibleFrom,'');assert.equal(f.record().titleDate,'');assert.equal(f.record().status,'WAITING_TITLE');
 }
});

test('migration is isolated, idempotent, preserves history and never copies old team eligibility',()=>{
 const f=fixture();f.time('2026-01-09');f.ts.push('Progress Eligible From Week ID');f.status.rows[1].push('W1');
 const before=JSON.stringify(f.status.rows),logs=JSON.stringify(f.sheets.get('LogEntries').rows);
 const preview=f.c.previewProgressEligibilityMigration();assert.equal(preview.cutoverWeek,'W2');assert.equal(f.record().enforcedFrom,'');
 f.c.initializeProgressEligibilityMigration();f.time('2026-01-10');f.c.initializeProgressEligibilityMigration();
 assert.equal(f.record().eligibleFrom,'');assert.equal(f.record().enforcedFrom,'W2');
 f.sheets.get('GitHubAccounts').rows.slice(1).forEach(row=>row[0]=new Date('2026-01-01'));f.c.executeProgressEligibilityMigration();
 assert.equal(f.record().eligibleFrom,'W1');assert.equal(f.record().enforcedFrom,'W2');assert.equal(JSON.stringify(f.status.rows),before);assert.equal(JSON.stringify(f.sheets.get('LogEntries').rows),logs);
});

test('cutover excludes earlier obligations while permitting voluntary submissions with original timing',()=>{
 const f=fixture();f.time('2026-01-09');f.c.initializeProgressEligibilityMigration();
 f.sheets.get('GitHubAccounts').rows.slice(1).forEach(row=>row[0]=new Date('2026-01-01'));f.c.executeProgressEligibilityMigration();
 f.user('one@example.com');const data=f.c.loadStudentWeeklyProgress();assert.equal(data.summary.expectedWeeks,1);assert.equal(data.weeks[0].obligatory,false);
 assert.equal(f.c.submitWeeklyProgress(f.input()).timeliness,'LATE');
 f.time('2026-01-15');f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().filter(r=>r.entryStatus==='MISSED').length,0);assert.equal(f.c.loadStudentWeeklyProgress().summary.missing,0);
 f.time('2026-01-22');f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().filter(r=>r.entryStatus==='MISSED').length,2);assert(f.entries().filter(r=>r.entryStatus==='MISSED').every(r=>r.weekId==='W2'));
});

test('earlier individual weeks produce no reminders, and summaries ignore ineligible teammates',()=>{
 const f=fixture();f.setEligibility('W2','001');f.setEligibility('','002');f.time('2026-01-04T18:00:00Z');f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,0);
 f.time('2026-01-09');f.user('one@example.com');f.c.submitWeeklyProgress(f.input({weekId:'W2'}));
 const team=f.c.weeklyTeam_('T1');const summary=f.c.getTeamLogWeekSummary_(team.row,team.columns,f.entries(),null,{now:new Date('2026-01-09')});
 assert.equal(summary.expectedWeeks,1);assert.equal(summary.currentLogged,true);assert.equal(summary.loggedStudents,1);assert.equal(summary.missing,0);
});

test('storage setup validates without rewriting and trigger setup is coordinator-only and idempotent',()=>{
 const f=fixture();const old=JSON.stringify(f.pe.rows);f.c.setupProgressEligibilityStorage();assert.equal(JSON.stringify(f.pe.rows),old);
 for(const name of ['processWeeklySubmissionSchedule','fetchAllCommits','processWeeklyProgressAI'])f.triggers.push({getHandlerFunction:()=>name});
 f.c.setupProgressEligibilityTrigger();f.c.setupProgressEligibilityTrigger();assert.equal(f.triggers.length,4);
 const trigger=f.triggers.at(-1);assert.equal(trigger.hour,2);assert.equal(trigger.days,1);assert.equal(trigger.timezone,'Asia/Kolkata');
 f.properties.set('PROGRESS_ELIGIBILITY_TRIGGER_OWNER','other@example.com');assert.throws(()=>f.c.setupProgressEligibilityTrigger(),/another/);
 f.user('one@example.com');assert.throws(()=>f.c.setupProgressEligibilityStorage(),/Coordinator/);
});

test('duplicates, identity changes and no future cutover fail without fabricated boundaries',()=>{
 const f=fixture();f.pe.rows.push(f.pe.rows[1].slice());assert.throws(()=>f.run(),/duplicate/);
 const g=fixture();g.time('2026-03-01');assert.throws(()=>g.c.initializeProgressEligibilityMigration(),/No cutover/);assert.equal(g.properties.has('PROGRESS_ELIGIBILITY_MIGRATION'),false);
 const h=fixture();h.pe.rows[1][Object.keys(h.fields).indexOf('githubId')]='999';h.run();assert.equal(h.record().eligibleFrom,'');assert.match(h.record().error,/identity changed/);
});

test('production has no team eligibility fallback, mutation hooks or migration dependency',()=>{
 for(const file of ['logbook-tracker.js','common-helpers.js','intake-approval-workflow.js','github-provisioning.js','student-dashboard.js']){
  const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/WEEKLY_ELIGIBILITY_HEADER_|ensureWeeklyProgressEligibility_|recordWeeklyEligibilityIfConfigured_|team\.eligibleFrom|PROGRESS_ELIGIBILITY_MIGRATION/);
 }
 const f=weeklyFixture();f.c.getTeamGithubSetup_=()=>{throw Error('Team gate forbidden');};f.c.requireTeamGithubReady_=f.c.getTeamGithubSetup_;
 f.c.reconcileProgressEligibility=()=>{throw Error('Reconciliation forbidden');};f.c.loadStudentWeeklyProgress();f.c.submitWeeklyProgress(f.input());f.c.processWeeklySubmissionSchedule();
});

test('storage errors and missing individual rows never fall back to a legacy team value',()=>{
 const f=weeklyFixture();f.ts.push('Progress Eligible From Week ID');f.status.rows[1].push('W1');f.pe.rows.splice(1);
 assert.equal(f.c.loadStudentWeeklyProgress().eligibleFrom,'');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/eligible/);
 const g=weeklyFixture();g.sheets.delete('ProgressEligibility');assert.throws(()=>g.c.loadStudentWeeklyProgress(),/Initialize ProgressEligibility/);
 assert.throws(()=>g.c.processWeeklySubmissionSchedule(),/Initialize ProgressEligibility/);
});

test('existing historical MISSED entries are preserved and excluded before the enforcement floor',()=>{
 const f=fixture();f.time('2026-01-09');f.c.initializeProgressEligibilityMigration();
 f.c.appendWeeklyEntry_({id:'historical-missed',regNo:'001',teamId:'T1',weekId:'W1',entryStatus:'MISSED',timeliness:'MISSED',recordedAt:new Date('2026-01-08')});
 const before=JSON.stringify(f.sheets.get('LogEntries').rows);f.c.executeProgressEligibilityMigration();f.user('one@example.com');
 assert.equal(f.c.loadStudentWeeklyProgress().summary.missing,0);assert.equal(JSON.stringify(f.sheets.get('LogEntries').rows),before);
});

test('unresolved migration rows have no expected, missed or reminder obligations',()=>{
 const f=fixture();f.time('2026-01-09');f.c.initializeProgressEligibilityMigration();f.time('2026-01-22');
 f.user('one@example.com');const data=f.c.loadStudentWeeklyProgress();assert.equal(data.summary.expectedWeeks,0);assert.equal(data.summary.missing,0);assert.equal(data.actions.length,0);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,0);assert.equal(f.mails.length,0);
});

test('migration resumes interrupted writes using its original cohort and cutover',()=>{
 const f=fixture();f.time('2026-01-09');const write=f.c.writeProgressEligibility_;let fail=true;
 f.c.writeProgressEligibility_=r=>{if(r.regNo==='002'&&fail)throw Error('storage error');return write(r);};
 assert.throws(()=>f.c.initializeProgressEligibilityMigration(),/storage error/);assert.equal(f.record().enforcedFrom,'W2');
 f.time('2026-01-11');fail=false;f.c.initializeProgressEligibilityMigration();
 assert.equal(f.record('002').enforcedFrom,'W2');assert.equal(f.c.previewProgressEligibilityMigration().cutover,'2026-01-09T00:00:00.000Z');
});

test('student web callers cannot use coordinator effective identity for setup or reconciliation',()=>{
 const f=fixture();f.c.Session.getEffectiveUser=()=>({getEmail:()=> 'coord@example.com'});f.user('one@example.com');
 for(const action of [()=>f.run(),()=>f.c.setupProgressEligibilityStorage(),()=>f.c.setupProgressEligibilityTrigger(),()=>f.c.initializeProgressEligibilityMigration()])assert.throws(action,/Coordinator/);
});

test('concurrent fixed rows are not overwritten and one failed write does not prevent other students',()=>{
 const f=fixture();const write=f.c.writeProgressEligibility_;f.c.writeProgressEligibility_=r=>{if(r.regNo==='001')throw Error('temporary sheet failure');return write(r);};
 const result=f.run();assert.equal(result.writeErrors,1);assert.equal(f.record('001').eligibleFrom,'');assert.equal(f.record('002').eligibleFrom,'W1');
 const g=fixture();let injected=false;g.respond(p=>{if(!injected && p.includes('/commits')){injected=true;g.setEligibility('W2','001');}return g.normal(p);});
 g.run();assert.equal(g.record('001').eligibleFrom,'W2');
});

test('active read access counts as collaboration but none or wrong numeric identity does not',()=>{
 const f=fixture();f.respond(p=>p.includes('/permission')?{status:200,body:{permission:'read',user:{id:p.includes('/alice/')?101:102}}}:f.normal(p));f.run();assert.equal(f.record().source,'FIRST_DETECTED');
 const g=fixture();g.respond(p=>p.includes('/permission')?{status:200,body:{permission:'admin',user:{id:999}}}:g.normal(p));g.run();assert.equal(g.record().eligibleFrom,'');assert.equal(g.record().firstDetected,'');
});

test('migration chooses the earliest of registration, commit and first detection then the later title date',()=>{
 const f=fixture();f.time('2026-01-10');const windows=f.c.getWeeklySubmissionWindows_();
 for(const [registration,commit,detection,source] of [
  ['2025-12-01','2026-01-02','2026-01-03','MIGRATION_REGISTRATION'],
  ['2026-01-03','2025-12-01','2026-01-02','FIRST_COMMIT'],
  ['2026-01-03','2026-01-02','2025-12-01','FIRST_DETECTED']]){
  const record={firstCommit:commit,firstDetected:detection,titleDate:'2026-01-01',titleStatus:'APPROVED'};
  const result=f.c.calculateProgressEligibilityMigration_(record,{date:registration},windows,'W2',new Date('2026-01-10'));
  assert.equal(result.source,source);assert.equal(result.effectiveDate.toISOString(),'2025-12-01T00:00:00.000Z');
  assert.equal(result.fixingDate.toISOString(),'2026-01-01T00:00:00.000Z');assert.equal(result.eligibleFrom,'W1');assert.equal(result.enforcedFrom,'W2');
 }
 const later=f.c.calculateProgressEligibilityMigration_({firstCommit:'2026-01-09',titleDate:'2026-01-01',titleStatus:'APPROVED'},null,windows,'W1',new Date('2026-01-10'));
 assert.equal(later.enforcedFrom,'W2');
});

test('migration registration accepts only valid matching historical submission records',()=>{
 const f=fixture(),student=f.c.weeklyStudents_()[0],sheet=f.sheets.get('GitHubAccounts'),cols=f.c.githubAccountColumns_(sheet);
 const base=sheet.rows[1].slice();base[0]=new Date('2025-12-20');
 const wrongId=base.slice();wrongId[0]=new Date('2025-01-01');wrongId[4]='999';
 const wrongTeam=base.slice();wrongTeam[2]='other';const wrongEmail=base.slice();wrongEmail[1]='other@example.com';
 const future=base.slice();future[0]=new Date('2030-01-01');const invalid=base.slice();invalid[0]='invalid';
 const earlier=base.slice();earlier[0]=new Date('2025-12-01');
 const r=f.c.progressMigrationRegistration_(student,'101',[base,wrongId,wrongTeam,wrongEmail,future,invalid,earlier],cols,new Date('2026-01-02'));
 assert.equal(r.date.toISOString(),'2025-12-01T00:00:00.000Z');assert.equal(r.row,8);
 assert.equal(f.c.progressMigrationRegistration_(student,'101',[wrongId,wrongTeam,wrongEmail,future,invalid],cols,new Date('2026-01-02')),null);
});

test('migration evidence preview is read-only and registration alone may qualify existing students',()=>{
 const f=fixture();f.time('2026-01-09');f.sheets.get('GitHubAccounts').rows.slice(1).forEach(row=>row[0]=new Date('2026-01-01'));
 f.respond(p=>p.includes('/permission')?{status:404,body:{}}:f.normal(p));
 const before=JSON.stringify(f.pe.rows),props=JSON.stringify([...f.properties]);
 const preview=f.c.previewProgressEligibilityMigrationEvidence();assert.equal(preview.unresolved,0);
 assert.equal(preview.results[0].record.source,'MIGRATION_REGISTRATION');assert.equal(preview.results[0].record.eligibleFrom,'W1');
 assert.equal(JSON.stringify(f.pe.rows),before);assert.equal(JSON.stringify([...f.properties]),props);
 f.c.initializeProgressEligibilityMigration();const result=f.c.executeProgressEligibilityMigration();assert.equal(result.complete,true);assert.equal(result.fixed,2);
 assert.equal(f.record().source,'MIGRATION_REGISTRATION');const calls=f.calls.length;const fixed=JSON.stringify(f.pe.rows);
 f.c.executeProgressEligibilityMigration();f.run();assert.equal(f.calls.length,calls);assert.equal(JSON.stringify(f.pe.rows),fixed);
});

test('migration failures and missing title defer fixing without losing immutable detection',()=>{
 const f=fixture();f.sheets.get('GitHubAccounts').rows[1][0]=new Date('2026-01-01');f.c.initializeProgressEligibilityMigration();
 f.respond(p=>p.includes('/commits')?{status:503,body:{}}:f.normal(p));
 assert.equal(f.c.executeProgressEligibilityMigration().complete,false);assert.equal(f.record().eligibleFrom,'');assert(f.record().firstDetected);
 const detected=f.record().firstDetected.toISOString();f.respond(f.normal);f.registry.rows.splice(1);f.time('2026-01-03');
 f.c.executeProgressEligibilityMigration();assert.equal(f.record().status,'WAITING_TITLE');assert.equal(f.record().firstDetected.toISOString(),detected);
});

test('migration snapshot excludes later arrivals and historical registration references cannot affect steady state',()=>{
 const f=fixture();f.c.initializeProgressEligibilityMigration();const plan=f.c.readProgressEligibilityMigration_();assert.equal(plan.students.length,2);
 const student={regNo:'003',teamId:'T1',email:'three@example.com'};
 const roster=f.c.weeklyStudents_;f.c.weeklyStudents_=()=>[...roster(),student];
 assert.equal(f.c.previewProgressEligibilityMigrationEvidence().results.length,2);
 const result=f.c.progressSelectEvidenceDate_({firstDetected:'2026-01-02',effectiveDate:'2025-01-01',source:'MIGRATION_REGISTRATION',evidence:JSON.stringify({migrationRegistration:{date:'2025-01-01'}})});
 assert.equal(result.source,'FIRST_DETECTED');assert.equal(result.effectiveDate.toISOString(),'2026-01-02T00:00:00.000Z');
});

test('temporary migration property cleanup requires a fixed cohort and coordinator',()=>{
 const f=fixture();f.c.initializeProgressEligibilityMigration();
 const before=JSON.stringify([...f.properties]);
 assert.throws(()=>f.c.cleanupProgressEligibilityMigrationProperties(),/2 cohort students remain unresolved/);
 assert.equal(JSON.stringify([...f.properties]),before);
 f.user('one@example.com');
 assert.throws(()=>f.c.cleanupProgressEligibilityMigrationProperties(),/Coordinator access is required/);
 f.user('coord@example.com');f.setEligibility('W1');
 f.properties.set('PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS','["001"]');
 const result=f.c.cleanupProgressEligibilityMigrationProperties();
 assert.equal(result.students,2);assert.equal(result.chunksDeleted,1);
 assert.equal(f.properties.has('PROGRESS_ELIGIBILITY_MIGRATION'),false);
 assert.equal(f.properties.has('PROGRESS_ELIGIBILITY_MIGRATION_COHORT_0'),false);
 assert.equal(f.properties.get('PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS'),'["001"]');
});

test('production contains no audit policy, migration calculation or registration timestamp source',()=>{
 const text=fs.readFileSync('progress-eligibility.js','utf8');
 assert.doesNotMatch(text,/audit-log|AUDIT_LOG|AUDIT_MODE|progressAuditEvidence_|migrationRegistration|MIGRATION_|cutover|accountRows\[[^\]]+\]\[0\]/);
 assert.equal(Object.values(fixture().fields).includes('Audit Check Status'),false);
});

test('later commits do not displace an earlier positive detection when title is finally approved',()=>{
 const f=fixture();f.set('Reviewer Decision','');f.run();const detected=f.record().firstDetected.toISOString();
 f.time('2026-01-09');f.respond(p=>p.includes('/commits')?{status:200,body:[f.commit('101','2026-01-08')]}:f.normal(p));
 f.set('Reviewer Decision','Approved');f.run();assert.equal(f.record().source,'FIRST_DETECTED');
 assert.equal(f.record().effectiveDate.toISOString(),detected);assert.equal(f.record().firstCommit.toISOString(),'2026-01-08T00:00:00.000Z');
 assert.equal(f.record().eligibleFrom,'W1');
});

test('migration execution revalidates changed identities and resumes failed student writes',()=>{
 const f=fixture();f.time('2026-01-09');f.c.initializeProgressEligibilityMigration();
 const write=f.c.writeProgressEligibility_;let fail=true;
 f.c.writeProgressEligibility_=record=>{if(record.regNo==='002'&&fail)throw Error('write failed');return write(record);};
 assert.throws(()=>f.c.executeProgressEligibilityMigration(),/write failed/);const first=JSON.stringify(f.pe.rows[1]);
 fail=false;assert.equal(f.c.executeProgressEligibilityMigration().complete,true);assert.equal(JSON.stringify(f.pe.rows[1]),first);
 const g=fixture();g.c.initializeProgressEligibilityMigration();const preview=g.c.previewProgressEligibilityMigrationEvidence;
 g.c.previewProgressEligibilityMigrationEvidence=()=>{const result=preview();g.sheets.get('GitHubAccounts').rows[1][4]='999';return result;};
 assert.throws(()=>g.c.executeProgressEligibilityMigration(),/identity changed/);assert.equal(g.record().eligibleFrom,'');
});

test('migration batches cap unresolved work and resume unchecked students before prior exceptions',()=>{
 const f=fixture(),base=f.c.weeklyStudents_();
 f.c.weeklyStudents_=()=>[...base,...Array.from({length:23},(_,i)=>({regNo:'extra'+i,teamId:'T1',email:'extra'+i+'@example.com'}))];
 f.c.initializeProgressEligibilityMigration();
 const preview=f.c.previewProgressEligibilityMigrationEvidence();assert.equal(preview.deferred,5);
 const first=f.c.executeProgressEligibilityMigration();assert.equal(first.deferred,5);
 assert.equal(f.c.readProgressEligibility_().filter(r=>r.checkedAt).length,20);
 f.time('2026-01-03');f.c.executeProgressEligibilityMigration();
 assert.equal(f.c.readProgressEligibility_().filter(r=>r.checkedAt).length,25);
});

test('held migration exceptions remain untouched by daily reconciliation and resolve manually with original benefit',()=>{
 const f=fixture();f.time('2026-01-09');f.c.initializeProgressEligibilityMigration();
 f.sheets.get('GitHubAccounts').rows.slice(1).forEach(row=>row[0]=new Date('2026-01-01'));
 f.set('Reviewer Decision','');f.c.executeProgressEligibilityMigration();
 const plan=f.properties.get('PROGRESS_ELIGIBILITY_MIGRATION');
 assert.equal(f.c.holdProgressEligibilityMigrationExceptions().held,2);
 const before=JSON.stringify(f.pe.rows),calls=f.calls.length;
 f.set('Reviewer Decision','Approved');const daily=f.run();
 assert.equal(daily.held,2);assert.equal(daily.checked,0);assert.equal(f.calls.length,calls);assert.equal(JSON.stringify(f.pe.rows),before);
 assert.equal(f.c.executeProgressEligibilityMigration().complete,true);
 assert.equal(f.record().eligibleFrom,'W1');assert.equal(f.record().enforcedFrom,'W2');assert.equal(f.record().source,'MIGRATION_REGISTRATION');
 assert.equal(f.properties.get('PROGRESS_ELIGIBILITY_MIGRATION'),plan);assert.equal(f.run().held,0);
});

test('persisted enforcement floors protect unresolved students even before explicit holds are installed',()=>{
 const f=fixture();f.time('2026-01-09');f.c.initializeProgressEligibilityMigration();
 const before=JSON.stringify(f.pe.rows);assert.equal(f.run().held,2);assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.pe.rows),before);
});

test('holds preserve unrelated students and fail closed on malformed configuration',()=>{
 const f=fixture();f.properties.set('PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS',JSON.stringify(['001']));
 assert.equal(f.run().fixed,1);assert.equal(f.record().eligibleFrom,'');assert.equal(f.record('002').eligibleFrom,'W1');
 const g=fixture();g.properties.set('PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS','{}');assert.throws(()=>g.run(),/Invalid eligibility/);assert.equal(g.calls.length,0);
});

test('a hold added during evidence reads prevents an automated boundary write',()=>{
 const f=fixture();f.respond(path=>{f.properties.set('PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS',JSON.stringify(['001','002']));return f.normal(path);});
 const before=JSON.stringify(f.pe.rows);assert.equal(f.run().fixed,0);assert.equal(JSON.stringify(f.pe.rows),before);
});

test('fixed cohort validation reuses a window snapshot without weakening boundary validation',()=>{
 const f=fixture();f.run();const records=f.c.readProgressEligibility_(),windows=f.c.getWeeklySubmissionWindows_();
 f.c.getWeeklySubmissionWindows_=()=>{throw Error('redundant read');};
 assert.equal(f.c.progressStudentEligibility_({regNo:'001',teamId:'T1'},records,windows).eligibleFrom,'W1');
 assert.throws(()=>f.c.progressStudentEligibility_({regNo:'001',teamId:'T1'},records,[]),/Invalid fixed/);
 assert.throws(()=>f.c.progressStudentEligibility_({regNo:'001',teamId:'T1'},records),/redundant read/);
});
