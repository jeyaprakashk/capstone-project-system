const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');

test('server identity, append revisions and immutable first timing; retries do not append',()=>{
 const f=weeklyFixture(),input=f.input();
 const first=f.c.submitWeeklyProgress(input);assert.equal(first.entryStatus,'SUBMITTED');assert.equal(first.timeliness,'ON_TIME');
 assert.equal(f.eligible(),'W1');assert.equal(f.entries()[0].regNo,'001');assert.equal(f.entries()[0].actor,'one@example.com');
 f.time('2026-01-06T12:00:00Z');const second=f.c.submitWeeklyProgress(f.input({workCompleted:'Revision'}));
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
 for(const extra of [{email:'spoof'},{teamId:'T2'},{submittedAt:'2000-01-01'},{timeliness:'ON_TIME'},{weekId:'W1'},{repository:'https://evil.example'}]) {
  const f=weeklyFixture();assert.throws(()=>f.c.submitWeeklyProgress(f.input(extra)),/server-derived/);assert.equal(f.entries().length,0);
 }
});

test('title and readiness prerequisites; durable eligibility never moves after failure',()=>{
 const f=weeklyFixture();f.set('Reviewer Decision','');assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/approved/);
 f.set('Reviewer Decision','Approved');f.ready(false);assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/GitHub/);assert.equal(f.eligible(),'');
 f.ready(true);f.c.loadStudentWeeklyProgress();assert.equal(f.eligible(),'W1');
 f.time('2026-01-08T12:00:00Z');f.ready(false);const data=f.c.loadStudentWeeklyProgress();
 assert.equal(data.eligibleFrom,'W1');assert.equal(data.summary.missing,1);assert.equal(data.actions.length,0);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,2);assert(f.entries().every(r=>r.entryStatus==='MISSED'));
});

test('first applicable window excludes prior windows from expected, missed and reminder obligations',()=>{
 const f=weeklyFixture();f.time('2026-01-08T12:00:00Z');f.c.loadStudentWeeklyProgress();
 assert.equal(f.eligible(),'W2');const data=f.c.loadStudentWeeklyProgress();assert.equal(data.summary.expectedWeeks,1);assert.equal(data.summary.missing,0);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,0);assert.equal(f.mails.length,0);
 const before=weeklyFixture();before.time('2025-12-20T00:00:00Z');before.c.loadStudentWeeklyProgress();assert.equal(before.eligible(),'W1');assert.equal(before.c.loadStudentWeeklyProgress().summary.expectedWeeks,0);
});

test('MISSED append is unique and recovery/revision are late without altering system row',()=>{
 const f=weeklyFixture();f.set('Progress Eligible From Week ID','W1');f.time('2026-01-08T12:00:00Z');
 f.c.processWeeklySubmissionSchedule();f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,2);
 const missed=JSON.stringify(f.entries()[0]);assert.equal(f.entries()[0].firstSubmittedAt,'');assert.equal(f.entries()[0].timeliness,'MISSED');
 const first=f.c.submitWeeklyProgress(f.input({overdueWeekId:'W1'}));assert.equal(first.entryStatus,'SUBMITTED');assert.equal(first.timeliness,'LATE');
 f.time('2026-01-10T12:00:00Z');const revision=f.c.submitWeeklyProgress(f.input({overdueWeekId:'W1'}));
 assert.equal(revision.entryStatus,'REVISED');assert.equal(revision.firstSubmittedAt,first.firstSubmittedAt);assert.equal(revision.timeliness,'LATE');
 assert.equal(JSON.stringify(f.entries()[0]),missed);f.c.processWeeklySubmissionSchedule();assert.equal(f.entries().length,4);assert.equal(f.mails.length,0);
});

test('normal and explicit overdue boundary semantics and timezone offsets',()=>{
 const f=weeklyFixture(),windows=f.c.getWeeklySubmissionWindows_();
 const resolve=(at,overdue)=>f.c.resolveWeeklySubmissionWindow_(windows,'W1',new Date(at),overdue);
 assert.throws(()=>resolve('2025-12-31T23:59:59Z'));
 assert.equal(resolve('2026-01-01T00:00:00Z').weekId,'W1');assert.equal(resolve('2026-01-07T23:59:59Z').weekId,'W1');
 assert.equal(resolve('2026-01-08T00:00:00Z').weekId,'W2');assert.equal(resolve('2026-01-08T00:00:00Z','W1').weekId,'W1');
 assert.throws(()=>resolve('2026-01-07T23:59:59Z','W1'));assert.equal(resolve('2026-01-14T23:59:59Z','W1').weekId,'W1');assert.throws(()=>resolve('2026-01-15T00:00:00Z','W1'));
 f.time('2026-01-05T23:30:00+05:30');assert.equal(f.c.submitWeeklyProgress(f.input()).timeliness,'ON_TIME');
 const late=weeklyFixture();late.time('2026-01-05T18:00:00.001Z');assert.equal(late.c.submitWeeklyProgress(late.input()).timeliness,'LATE');
});

test('four narratives only; removed evidence is rejected and formula text remains literal',()=>{
 const f=weeklyFixture();
 f.c.submitWeeklyProgress(f.input({workCompleted:'=SUM(1,2)'}));
 assert.equal(f.entries()[0].workCompleted,'=SUM(1,2)');
 assert.equal(f.sheets.get('LOG_ENTRIES').rows[0].length,15);
 assert(!f.sheets.get('LOG_ENTRIES').rows[0].includes('Evidence Links'));
 assert(f.sheets.get('LOG_ENTRIES').rows[0].includes('Next Week Plan'));
 assert.throws(()=>f.c.submitWeeklyProgress(f.input({evidenceLinks:'https://example.com'})),/Unexpected/);
 for(const key of ['workCompleted','guideDiscussion','blockers','nextAction']) assert.throws(()=>f.c.submitWeeklyProgress(f.input({[key]:''})),/required/);
 assert.equal(f.entries().length,1);
});

test('one pre-deadline reminder only; actual submissions suppress it; no other weekly emails',()=>{
 const f=weeklyFixture();f.set('Progress Eligible From Week ID','W1');
 f.time('2026-01-04T17:59:59Z');f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,0);
 f.time('2026-01-04T18:00:00Z');f.c.submitWeeklyProgress(f.input());f.c.processWeeklySubmissionSchedule();
 assert.equal(f.mails.length,1);assert.equal(f.mails[0][0],'two@example.com');
 f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,1);
 f.time('2026-01-05T18:00:00Z');f.properties.clear();f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,1);
 f.time('2026-01-08T00:00:00Z');f.c.processWeeklySubmissionSchedule();f.user('two@example.com');f.c.submitWeeklyProgress(f.input({overdueWeekId:'W1'}));assert.equal(f.mails.length,1);
 assert.equal((fs.readFileSync('logbook-tracker.js','utf8').match(/MailApp\.sendEmail/g)||[]).length,1);
});

test('mail failure retries without marking delivery; previously successful recipients remain deduplicated',()=>{
 const f=weeklyFixture();f.set('Progress Eligible From Week ID','W1');f.time('2026-01-04T18:00:00Z');f.mailFails(true);
 f.c.processWeeklySubmissionSchedule();assert.equal(f.properties.size,0);assert.equal(f.errors.length,2);assert.equal(f.locked(),false);
 f.mailFails(false);f.c.processWeeklySubmissionSchedule();f.c.processWeeklySubmissionSchedule();assert.equal(f.mails.length,2);
});

test('configuration rejects absent, malformed, duplicate, overlapping and reversed windows',()=>{
 const f=weeklyFixture(),original=f.config.WEEKLY_SUBMISSION_WINDOWS;
 for(const value of ['', '{}','[]','not json']) {f.config.WEEKLY_SUBMISSION_WINDOWS=value;assert.throws(()=>f.c.getWeeklySubmissionWindows_());}
 for(const mutate of [w=>w[1].week_id='W1',w=>w[1].opens_at=w[0].closes_at,w=>w[0].deadline_at=w[0].opens_at,w=>w[0].late_until='2020-01-01T00:00:00Z',w=>w[0].opens_at='2026-01-01',w=>w[0].opens_at='2026-02-30T00:00:00Z']) {
  const w=JSON.parse(original);mutate(w);f.config.WEEKLY_SUBMISSION_WINDOWS=JSON.stringify(w);assert.throws(()=>f.c.getWeeklySubmissionWindows_());
 }
 f.config.WEEKLY_SUBMISSION_WINDOWS=original;f.config.SUBMISSION_REMINDER_HOURS=0;assert.throws(()=>f.c.processWeeklySubmissionSchedule(),/positive/);
});

test('storage setup is authorized, nondestructive, repeatable and handles reordered headers',()=>{
 const f=weeklyFixture();assert.throws(()=>f.c.setupWeeklySubmissionStorage(),/Coordinator/);f.user('coord@example.com');
 f.c.setupWeeklySubmissionStorage();f.c.setupWeeklySubmissionStorage();const sheet=f.sheets.get('LOG_ENTRIES');sheet.rows[0].reverse();
 f.user('one@example.com');f.c.submitWeeklyProgress(f.input());assert.equal(f.entries()[0].regNo,'001');
 f.user('coord@example.com');const before=JSON.stringify(sheet.rows);f.c.setupWeeklySubmissionStorage();assert.equal(JSON.stringify(sheet.rows),before);
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
 f.c.appendWeeklyEntry_=()=>{throw Error('write failure');};assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/write failure/);assert.equal(f.locked(),false);
});


test('conflicting journal headers never permit a save or destructive setup',()=>{
 const f=weeklyFixture(),sheet=f.sheets.get('LOG_ENTRIES');
 sheet.rows[0].push('Reg No');const before=JSON.stringify(sheet.rows);
 assert.throws(()=>f.c.submitWeeklyProgress(f.input()),/exactly one/);
 f.user('coord@example.com');assert.throws(()=>f.c.setupWeeklySubmissionStorage(),/exactly one/);
 assert.equal(JSON.stringify(sheet.rows),before);
});


test('effective scoped history follows physical append order even if finder matches are unordered',()=>{
 const f=weeklyFixture();f.c.submitWeeklyProgress(f.input({workCompleted:'First'}));f.c.submitWeeklyProgress(f.input({workCompleted:'Latest'}));
 const sheet=f.sheets.get('LOG_ENTRIES'),range=sheet.getRange;
 sheet.getRange=(...args)=>{const value=range(...args),finder=value.createTextFinder;
  value.createTextFinder=pattern=>{const result=finder(pattern),all=result.findAll;result.findAll=()=>all().reverse();return result;};return value;};
 const effective=f.c.getEffectiveLogEntries_(f.c.readLogEntries_('T1','001'));
 assert.equal(effective[0].workCompleted,'Latest');
});
