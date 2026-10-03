const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');

test('server identity, append revisions and immutable first timing; retries do not append',()=>{
 const f=weeklyFixture(),input=f.input();
 const first=f.c.submitWeeklyProgress(input);assert.equal(first.entryStatus,'SUBMITTED');assert.equal(first.timeliness,'ON_TIME');
 assert.equal(f.eligible(),'W1');assert.equal(f.entries()[0].regNo,'001');assert.equal(f.entries()[0].actor,'one@example.com');
 f.time('2026-01-05T18:00:00Z');const second=f.c.submitWeeklyProgress(f.input({workCompleted:'Revision'}));
 assert.equal(second.entryStatus,'REVISED');assert.equal(second.timeliness,'ON_TIME');assert.equal(second.firstSubmittedAt,first.firstSubmittedAt);
 assert.equal(f.entries().length,2);assert.equal(f.c.submitWeeklyProgress(input).entryId,first.entryId);assert.equal(f.entries().length,2);
 assert.throws(()=>f.c.submitWeeklyProgress({...input,blockers:'different'}),/different data/);
 assert.equal(f.c.getEffectiveLogEntries_(f.entries()).length,1);assert.equal(f.c.getEffectiveLogEntries_(f.entries())[0].workCompleted,'Revision');
 assert.equal(f.mails.length,0);assert.equal(f.locked(),false);
});

test('authentication and authoritative membership fail closed before appending',()=>{
 for(const mutate of [f=>f.user(''),f=>f.user('outsider@example.com'),f=>f.set('Student 1 Register No',''),f=>f.set('Student 2 Register No','001'),f=>f.set('Student 2 Email','one@example.com'),f=>f.set('Student 1 Register No','other')]) {
  const f=weeklyFixture();mutate(f);assert.throws(()=>f.c.submitWeeklyProgress(f.input()));assert.equal(f.entries().length,0);assert.equal(f.locked(),false);
 }
 for(const extra of [{email:'spoof'},{teamId:'T2'},{submittedAt:'2000-01-01'},{timeliness:'ON_TIME'},{repository:'https://evil.example'}]) {
  const f=weeklyFixture();assert.throws(()=>f.c.submitWeeklyProgress(f.input(extra)),/server-derived/);assert.equal(f.entries().length,0);
 }
});

test('individual eligibility is required and teammate readiness never moves or blocks it',()=>{
 const f=weeklyFixture();f.set('Reviewer Decision','');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/approved/);
 f.set('Reviewer Decision','Approved');f.setEligibility('');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/eligible/);assert.equal(f.eligible(),'');
 f.ready(true);f.c.loadStudentWeeklyProgress();assert.equal(f.eligible(),'');f.setEligibility('W1');
 f.c.getTeamGithubSetup_=()=>{throw Error('Team readiness must not be read');};
 f.time('2026-01-08T12:00:00Z');f.ready(false);const data=f.c.loadStudentWeeklyProgress();
 assert.equal(data.eligibleFrom,'W1');assert.equal(data.summary.missing,0);assert.equal(data.actions.length,2);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,0);
 f.time('2026-01-15T00:00:00Z');
 f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,2);assert(f.entries().every(r=>r.entryStatus==='MISSED'));
});

test('first applicable window excludes prior windows from expected, missed and reminder obligations',()=>{
 const f=weeklyFixture();f.setEligibility('W2');f.time('2026-01-08T12:00:00Z');f.c.loadStudentWeeklyProgress();
 assert.equal(f.eligible(),'W2');const data=f.c.loadStudentWeeklyProgress();assert.equal(data.summary.expectedWeeks,1);assert.equal(data.summary.missing,0);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,0);assert.equal(f.mails.length,0);
 const before=weeklyFixture();before.time('2025-12-20T00:00:00Z');before.c.loadStudentWeeklyProgress();assert.equal(before.eligible(),'W1');assert.equal(before.c.loadStudentWeeklyProgress().summary.expectedWeeks,0);
});

test('late first submissions and revisions preserve timing; MISSED waits until the final cutoff',()=>{
 const f=weeklyFixture();f.setEligibility('W1');f.time('2026-01-08T12:00:00Z');
 f.c.processWeeklySubmissionSchedule();f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,0);
 const first=f.c.submitWeeklyProgress(f.input());assert.equal(first.entryStatus,'SUBMITTED');assert.equal(first.timeliness,'LATE');
 const original=JSON.stringify(f.entries()[0]);
 f.time('2026-01-14T23:59:59Z');const revision=f.c.submitWeeklyProgress(f.input());
 assert.equal(revision.entryStatus,'REVISED');assert.equal(revision.firstSubmittedAt,first.firstSubmittedAt);assert.equal(revision.timeliness,'LATE');
 assert.equal(JSON.stringify(f.entries()[0]),original);f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,2);
 f.time('2026-01-14T23:59:59.001Z');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/window/);
 f.c.processWeeklySubmissionSchedule();f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,3);
 const missed=f.entries()[2];assert.equal(missed.regNo,'002');assert.equal(missed.entryStatus,'MISSED');assert.equal(missed.firstSubmittedAt,'');assert.equal(missed.timeliness,'MISSED');
 f.user('two@example.com');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/window/);assert.equal(f.entries().length,3);
});

test('one Week ID selection validates OPEN and LATE boundaries and timezone offsets',()=>{
 const f=weeklyFixture(),windows=f.c.getWeeklySubmissionWindows_();
 const resolve=(at,week='W1')=>f.c.resolveWeeklySubmissionWindow_(windows,'W1',new Date(at),week);
 assert.throws(()=>resolve('2025-12-31T23:59:59Z'));
 assert.equal(resolve('2026-01-01T00:00:00Z').weekId,'W1');assert.equal(resolve('2026-01-07T23:59:59Z').weekId,'W1');
 assert.equal(resolve('2026-01-08T00:00:00Z','W2').weekId,'W2');assert.equal(resolve('2026-01-08T00:00:00Z','W1').weekId,'W1');
 assert.throws(()=>resolve('2026-01-07T23:59:59Z','W2'));assert.equal(resolve('2026-01-14T23:59:59Z','W1').weekId,'W1');assert.throws(()=>resolve('2026-01-15T00:00:00Z','W1'));
 f.time('2026-01-05T23:30:00+05:30');assert.equal(f.c.submitWeeklyProgress(f.input()).timeliness,'ON_TIME');
 const late=weeklyFixture();late.setEligibility('W1');late.time('2026-01-05T18:00:00.001Z');assert.equal(late.c.submitWeeklyProgress(late.input()).timeliness,'LATE');
});

test('four narratives only; removed evidence is rejected and formula text remains literal',()=>{
 const f=weeklyFixture();
 f.c.submitWeeklyProgress(f.input({workCompleted:'=SUM(1,2)'}));
 assert.equal(f.entries()[0].workCompleted,'=SUM(1,2)');
 assert.equal(f.sheets.get('LogEntries').rows[0].length,15);
 assert(!f.sheets.get('LogEntries').rows[0].includes('Evidence Links'));
 assert(f.sheets.get('LogEntries').rows[0].includes('Next Week Plan'));
 assert.throws(()=>f.c.submitWeeklyProgress(f.input({evidenceLinks:'https://example.com'})),/Unexpected/);
 for(const key of ['workCompleted','guideDiscussion','blockers','nextAction']) assert.throws(()=>f.c.submitWeeklyProgress(f.input({[key]:''})),/required/);
 assert.equal(f.entries().length,1);
});

test('one pre-deadline reminder only; actual submissions suppress it; no other weekly emails',()=>{
 const f=weeklyFixture();f.setEligibility('W1');
 f.time('2026-01-04T17:59:59Z');f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,0);
 f.time('2026-01-04T18:00:00Z');f.c.submitWeeklyProgress(f.input());f.c.processWeeklySubmissionSchedule();
 assert.equal(f.mails.length,1);assert.equal(f.mails[0][0],'two@example.com');
 f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,1);
 assert.equal(f.sheets.get('WeeklyReminders').rows.length,2);
 f.time('2026-01-05T18:00:00Z');f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,1);
 f.time('2026-01-08T00:00:00Z');f.c.processWeeklySubmissionSchedule();f.user('two@example.com');f.c.submitWeeklyProgress(f.input());assert.equal(f.mails.length,1);
 assert.equal((fs.readFileSync('logbook-tracker.js','utf8').match(/MailApp\.sendEmail/g)||[]).length,1);
});

test('mail failure retries without marking delivery; previously successful recipients remain deduplicated',()=>{
 const f=weeklyFixture();f.setEligibility('W1');f.time('2026-01-04T18:00:00Z');f.mailFails(true);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.sheets.get('WeeklyReminders').rows.length,1);assert.equal(f.errors.length,2);assert.equal(f.locked(),false);
 f.mailFails(false);f.c.processWeeklySubmissionSchedule();f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,2);
 assert.equal(f.sheets.get('WeeklyReminders').rows.length,3);
});

test('storage setup transfers legacy reminder receipts before removing properties',()=>{
 const f=weeklyFixture();f.properties.set('weekly-reminder:002:W1','2026-01-04T18:00:00.000Z');
 f.user('coord@example.com');f.c.setupWeeklySubmissionStorage();f.c.setupWeeklySubmissionStorage();
 assert.equal(f.properties.has('weekly-reminder:002:W1'),false);
 assert.equal(f.sheets.get('WeeklyReminders').rows.length,2);
 f.setEligibility('W1');f.time('2026-01-04T18:00:00Z');f.c.processWeeklySubmissionSchedule();
 assert.equal(f.mails.length,1);assert.equal(f.mails[0][0],'one@example.com');
});

test('missing or malformed reminder storage stops scheduling before mail',()=>{
 for(const mutate of [f=>f.sheets.delete('WeeklyReminders'),f=>f.sheets.get('WeeklyReminders').rows[0][1]='Wrong',
  f=>f.sheets.get('WeeklyReminders').rows.push(['001','W1','text'])]){
  const f=weeklyFixture();f.setEligibility('W1');f.time('2026-01-04T18:00:00Z');mutate(f);
  assert.throws(()=>f.c.processWeeklySubmissionSchedule(),/WeeklyReminders/);assert.equal(f.mails.length,0);
 }
});

test('sheet windows reject missing, empty, text dates, duplicate, overlapping and reversed rows',()=>{
 const missing=weeklyFixture();missing.sheets.delete('WeeklyWindows');assert.throws(()=>missing.c.getWeeklySubmissionWindows_(),/WeeklyWindows/);
 for(const mutate of [w=>w.splice(1),w=>w[2][0]=' w1 ',w=>w[2][1]=w[1][2],w=>w[1][2]=w[1][1],w=>w[1][3]=new Date('2020-01-01'),w=>w[1][1]='2026-01-01T00:00:00Z',w=>w[1][1]=new Date('invalid'),w=>w[1][1]=46000,w=>w[0].push('Week ID '),w=>w[0][1]='Wrong']) {
  const f=weeklyFixture();mutate(f.sheets.get('WeeklyWindows').rows);assert.throws(()=>f.c.getWeeklySubmissionWindows_());
 }
 const f=weeklyFixture();f.config.SUBMISSION_REMINDER_HOURS=0;assert.throws(()=>f.c.processWeeklySubmissionSchedule(),/positive/);
});

test('storage setup is authorized, nondestructive, repeatable and handles reordered headers',()=>{
 const f=weeklyFixture();assert.throws(()=>f.c.setupWeeklySubmissionStorage(),/Coordinator/);f.user('coord@example.com');
 f.c.setupWeeklySubmissionStorage();f.c.setupWeeklySubmissionStorage();const sheet=f.sheets.get('LogEntries');sheet.rows[0].reverse();
 f.user('one@example.com');f.c.submitWeeklyProgress(f.input());assert.equal(f.entries()[0].regNo,'001');
 f.user('coord@example.com');const before=JSON.stringify(sheet.rows);f.c.setupWeeklySubmissionStorage();assert.equal(JSON.stringify(sheet.rows),before);
});

test('WeeklyWindows uses shared case-insensitive trimmed sheet and header mapping',()=>{
 const f=weeklyFixture(),rows=f.sheets.get('WeeklyWindows').rows;
 f.sheets.delete('WeeklyWindows');
 rows.forEach(row=>row.reverse());rows[0]=rows[0].map(h=>' '+h.toLowerCase()+'  ');
 rows.push(['','','','']);f.sheet('weeklywindows  ',rows);
 const windows=f.c.getWeeklySubmissionWindows_();
 assert.equal(windows[0].weekId,'W1');assert.equal(windows[0].deadline_at,Date.parse('2026-01-05T18:00:00Z'));
 assert.equal(f.c.submitWeeklyProgress(f.input()).timeliness,'ON_TIME');
});

test('on-time reports freeze immediately after deadline, while retry remains idempotent',()=>{
 const f=weeklyFixture(),input=f.input();const first=f.c.submitWeeklyProgress(input);
 f.time('2026-01-05T18:00:00.001Z');const snapshot=JSON.stringify(f.entries());
 assert.throws(()=>f.c.submitWeeklyProgress(f.input({workCompleted:'Forbidden revision'})),/frozen/);
 assert.equal(f.c.submitWeeklyProgress(input).entryId,first.entryId);
 const data=f.c.loadStudentWeeklyProgress();assert.equal(data.weeks[0].state,'SUBMITTED ON TIME');assert.equal(data.weeks[0].editable,false);assert.equal(data.actions.length,0);
 f.c.processWeeklySubmissionSchedule();assert.equal(JSON.stringify(f.entries()),snapshot);
 f.time('2026-01-22T00:00:00Z');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/window/);
 assert.equal(f.c.submitWeeklyProgress(input).entryId,first.entryId);
});

test('OPEN, LATE, SUBMITTED LATE and MISSED share permission-aware dashboard states',()=>{
 const f=weeklyFixture();let data=f.c.loadStudentWeeklyProgress();assert.equal(data.weeks[0].state,'OPEN');assert.equal(data.actions.length,1);
 f.time('2026-01-08T00:00:00Z');data=f.c.loadStudentWeeklyProgress();
 assert.deepEqual(Array.from(data.weeks,w=>w.state),['LATE','OPEN']);assert.equal(data.actions.length,2);
 f.c.submitWeeklyProgress(f.input());data=f.c.loadStudentWeeklyProgress();assert.equal(data.weeks[0].state,'SUBMITTED LATE');assert.equal(data.weeks[0].editable,true);
 f.time('2026-01-15T00:00:00Z');data=f.c.loadStudentWeeklyProgress();assert.equal(data.weeks[0].editable,false);assert.equal(data.weeks[1].state,'LATE');assert.equal(data.summary.missing,0);
 f.time('2026-01-22T00:00:00Z');data=f.c.loadStudentWeeklyProgress();assert.equal(data.weeks[1].state,'MISSED');assert.equal(data.summary.missing,1);assert.equal(data.actions.length,0);
});

test('Week ID is required and validated against eligibility, dates and request identity',()=>{
 for(const extra of [{weekId:undefined},{weekId:'unknown'},{weekId:'W2'}]) {
  const f=weeklyFixture();assert.throws(()=>f.c.submitWeeklyProgress(f.input(extra)));assert.equal(f.entries().length,0);
 }
 const f=weeklyFixture();f.setEligibility('W2');f.time('2026-01-08T12:00:00Z');
 assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/eligible/);
 const input=f.input({weekId:'W2'});f.c.submitWeeklyProgress(input);
 assert.throws(()=>f.c.submitWeeklyProgress({...input,weekId:'W1'}),/different data/);assert.equal(f.entries().length,1);
});

test('trigger setup removes only old weekly mechanisms and installs one hourly handler',()=>{
 const f=weeklyFixture();f.user('coord@example.com');
 for(const name of ['onFormSubmit','sendWeeklyLogReminders','sendWeeklyAnalysisDigest','onTeamIntakeSubmit','sendGuideReminderDigest','fetchAllCommits'])f.triggers.push({getHandlerFunction:()=>name});
 f.c.setupWeeklySubmissionTriggers();f.c.setupWeeklySubmissionTriggers();
 assert.deepEqual(f.triggers.map(t=>t.getHandlerFunction()),['onTeamIntakeSubmit','sendGuideReminderDigest','fetchAllCommits','processWeeklySubmissionSchedule']);
 assert.equal(f.triggers.at(-1).hours,1);assert.equal(f.c.onFormSubmit,undefined);assert.equal(f.c.sendWeeklyAnalysisDigest,undefined);
});

test('submission and scheduled appends serialize and release locks after failures',()=>{
 const f=weeklyFixture();const append=f.c.appendWeeklyEntry_;f.c.appendWeeklyEntry_=r=>{assert.equal(f.locked(),true);return append(r);};
 f.c.submitWeeklyProgress(f.input());f.time('2026-01-08T12:00:00Z');f.c.processWeeklySubmissionSchedule();
 assert.equal(f.entries().filter(r=>r.regNo==='001' && r.entryStatus==='MISSED').length,0);
 f.c.appendWeeklyEntry_=()=>{throw Error('write failure');};assert.throws(()=>f.c.submitWeeklyProgress(f.input({weekId:'W2'})),/write failure/);assert.equal(f.locked(),false);
});


test('conflicting journal headers never permit a save or destructive setup',()=>{
 const f=weeklyFixture(),sheet=f.sheets.get('LogEntries');
 sheet.rows[0].push('Reg No');const before=JSON.stringify(sheet.rows);
 assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/exactly one/);
 f.user('coord@example.com');assert.throws(()=>f.c.setupWeeklySubmissionStorage(),/exactly one/);
 assert.equal(JSON.stringify(sheet.rows),before);
});


test('effective scoped history follows physical append order even if finder matches are unordered',()=>{
 const f=weeklyFixture();f.c.submitWeeklyProgress(f.input({workCompleted:'First'}));f.c.submitWeeklyProgress(f.input({workCompleted:'Latest'}));
 const sheet=f.sheets.get('LogEntries'),range=sheet.getRange;
 sheet.getRange=(...args)=>{const value=range(...args),finder=value.createTextFinder;
  value.createTextFinder=pattern=>{const result=finder(pattern),all=result.findAll;result.findAll=()=>all().reverse();return result;};return value;};
 const effective=f.c.getEffectiveLogEntries_(f.c.readLogEntries_('T1','001'));
 assert.equal(effective[0].workCompleted,'Latest');
});

test('commit gate rejects direct saves with zero own evidence in OPEN and LATE without appending',()=>{
 for(const now of ['2026-01-02T12:00:00Z','2026-01-08T12:00:00Z']) {
  const f=weeklyFixture();f.setEligibility('W1');f.time(now);f.sheets.get('Commits').rows.splice(1);
  assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/No GitHub activity found for you this week/);
  assert.equal(f.entries().length,0);assert.equal(f.locked(),false);
  const data=f.c.loadStudentWeeklyProgress();assert.equal(data.evidence[0].state,'available');assert.equal(data.evidence[0].count,0);
  assert.equal(data.weeks[0].state,now.includes('01-02')?'OPEN':'LATE');
 }
});

test('commit gate requires the authenticated student, team, repository and original deadline interval',()=>{
 for(const change of [row=>row[0]=new Date('2025-12-31T23:59:59.999Z'),row=>row[0]=new Date('2026-01-05T18:00:00.001Z'),
   row=>row[1]='T2',row=>row[4]='https://github.com/org/other',row=>row[6]='102',row=>row[3]='(unknown)',
   row=>row[3]='System',row=>row[3]='github-actions[bot]',row=>row[2]='Initial commit: Capstone project for Team T1']) {
  const f=weeklyFixture(),rows=f.sheets.get('Commits').rows;rows.splice(2);change(rows[1]);
  f.setEligibility('W1');f.time('2026-01-08T12:00:00Z');
  const before=JSON.stringify(rows);assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/No GitHub activity found/);
  assert.equal(f.entries().length,0);assert.equal(JSON.stringify(rows),before);
 }
});

test('both inclusive evidence boundaries qualify for ON_TIME and LATE saves and revisions',()=>{
 for(const date of ['2026-01-01T00:00:00Z','2026-01-05T18:00:00Z'])for(const now of ['2026-01-05T18:00:00Z','2026-01-08T12:00:00Z']) {
  const f=weeklyFixture(),rows=f.sheets.get('Commits').rows;rows.splice(2);rows[1][0]=new Date(date);
  f.setEligibility('W1');f.time(now);
  const first=f.c.submitWeeklyProgress(f.input()),revision=f.c.submitWeeklyProgress(f.input({workCompleted:'Updated'}));
  assert.equal(first.timeliness,now.includes('01-08')?'LATE':'ON_TIME');assert.equal(revision.entryStatus,'REVISED');
  assert.equal(revision.firstSubmittedAt,first.firstSubmittedAt);assert.equal(revision.timeliness,first.timeliness);
 }
});

test('unavailable mapping and failed collection block new saves without reporting zero',()=>{
 for(const change of [f=>f.sheets.get('GitHubAccounts').rows.splice(1,1),f=>f.sheets.get('GitHubAccounts').rows[1][4]='',f=>f.sheets.get('GitHubAccounts').rows[1][3]='',
   f=>f.sheets.get('GitHubAccounts').rows[2][4]='101',f=>f.collectionStatus('error'),f=>f.sheets.get('Commits').rows[0][0]='Broken']) {
  const f=weeklyFixture();change(f);const evidence=f.c.loadStudentWeeklyProgress().evidence[0];
  assert.equal(evidence.state,'unavailable');assert.equal(evidence.count,null);
  assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/mapping|unavailable/);assert.equal(f.entries().length,0);
 }
});

test('revisions recheck commits while identical retries remain idempotent',()=>{
 const f=weeklyFixture(),input=f.input(),first=f.c.submitWeeklyProgress(input),original=JSON.stringify(f.entries());
 f.sheets.get('Commits').rows.splice(1);
 assert.throws(()=>f.c.submitWeeklyProgress(f.input({workCompleted:'No evidence revision'})),/No GitHub activity found/);
 assert.equal(f.c.submitWeeklyProgress(input).entryId,first.entryId);assert.equal(JSON.stringify(f.entries()),original);
});
