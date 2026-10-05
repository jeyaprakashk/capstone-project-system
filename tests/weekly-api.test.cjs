// Weekly progress endpoints: envelope, access and unchanged rule messages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { weeklyFixture } = require('./weekly-progress-fixture.cjs');

function setup() {
  const f = weeklyFixture();
  for (const file of ['api-envelope.js', 'student-api.js', 'guide-api.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), f.c, { filename: file });
  f.c.console.log = () => {};
  return f;
}

test('student weekly read returns the existing progress data in the envelope', () => {
  const f = setup(); f.time('2026-01-02T12:00:00Z'); f.user('one@example.com');
  const frame = JSON.parse(f.c.API_student_getWeekly());
  assert.equal(frame.ok, true);
  for (const key of ['checkedAt', 'ready', 'weeks', 'actions', 'history', 'evidence', 'timezone']) assert(key in frame.data, key);
  assert.doesNotMatch(JSON.stringify(frame.data), /<(div|td|tr|span|button)\b|class=|onclick=/);
});

test('student weekly endpoints keep rule messages and reject outsiders', () => {
  const f = setup(); f.time('2026-01-02T12:00:00Z'); f.user('stranger@example.com');
  const read = JSON.parse(f.c.API_student_getWeekly());
  assert.equal(read.ok, false); assert.equal(read.error.code, 'REJECTED'); assert.match(read.error.message, /./);
  const save = JSON.parse(f.c.API_student_submitWeekly({ requestId: 'r1', weekId: 'W1', workCompleted: 'x', guideDiscussion: 'x', blockers: 'x', nextAction: 'x' }));
  assert.equal(save.ok, false);
  f.user('');
  assert.equal(JSON.parse(f.c.API_student_getWeekly()).ok, false);
});

test('student weekly save never leaks engine errors', () => {
  const f = setup(); f.user('one@example.com');
  f.c.submitWeeklyProgress_ = () => { throw new TypeError('column 7 undefined'); };
  const frame = JSON.parse(f.c.API_student_submitWeekly({}));
  assert.deepEqual(frame, { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
});

test('guide weekly endpoints require guide access and convert workflow rejections', () => {
  const f = setup();
  f.c.getColumnMap_ = () => ({ TEAM_ID: 0, GUIDE_EMAIL: 1 });
  f.c.getSheetRows_ = () => [['T1', 'guide@example.com']];
  f.c.loadGuideWeeklyProgress_ = () => ({ checkedAt: 'now', weeks: [], entries: [] });
  f.c.submitWeeklyGuideSignoff_ = (entryId, status) => entryId === 'bad' ? { ok: false, message: 'Entry not found.' } : { ok: true, entryId, status, message: 'Guide confirmation saved. Student revisions are now frozen.' };
  f.user('stranger@example.com');
  assert.equal(JSON.parse(f.c.API_guide_getWeekly()).error.code, 'UNAUTHORIZED');
  assert.equal(JSON.parse(f.c.API_guide_signWeekly('e1', 'DISCUSSED')).error.code, 'UNAUTHORIZED');
  f.user('guide@example.com');
  assert.deepEqual(JSON.parse(f.c.API_guide_getWeekly()).data.entries, []);
  assert.deepEqual(JSON.parse(f.c.API_guide_signWeekly('bad', 'DISCUSSED')).error, { code: 'REJECTED', message: 'Entry not found.' });
  const saved = JSON.parse(f.c.API_guide_signWeekly('e1', 'DISCUSSED')).data;
  assert.equal(saved.status, 'DISCUSSED'); // the browser module updates the card from this
  assert.match(saved.message, /Guide confirmation saved/);
});

test('guide evaluation endpoints require guide access and keep the existing rule messages', () => {
  const f = setup();
  f.c.getColumnMap_ = () => ({ TEAM_ID: 0, GUIDE_EMAIL: 1 });
  f.c.getSheetRows_ = () => [['T1', 'guide@example.com']];
  const seen = [];
  f.c.loadGuideEvaluation_ = (team, register) => { seen.push(['load', team, register]); return { roster: { team }, student: { register } }; };
  f.c.saveGuideEvaluationDraft_ = input => { seen.push(['draft', input.requestId]); return { status: 'Draft' }; };
  f.c.submitGuideEvaluation_ = input => { if (input.scores === 'bad') throw new Error('Scores are outside the permitted band.'); return { status: 'Submitted', total: 40 }; };
  f.user('stranger@example.com');
  for (const call of [() => f.c.API_guide_getEvaluation('T1', 'S1'), () => f.c.API_guide_saveEvaluationDraft({}), () => f.c.API_guide_submitEvaluation({})]) assert.equal(JSON.parse(call()).error.code, 'UNAUTHORIZED');
  assert.equal(seen.length, 0);
  f.user('guide@example.com');
  assert.deepEqual(JSON.parse(f.c.API_guide_getEvaluation('T1', 'S1')).data.student, { register: 'S1' });
  assert.deepEqual(JSON.parse(JSON.stringify(seen[0])), ['load', 'T1', 'S1']);
  assert.equal(JSON.parse(f.c.API_guide_saveEvaluationDraft({ requestId: 'r1' })).data.status, 'Draft');
  assert.deepEqual(JSON.parse(f.c.API_guide_submitEvaluation({ scores: 'bad' })).error, { code: 'REJECTED', message: 'Scores are outside the permitted band.' });
  assert.equal(JSON.parse(f.c.API_guide_submitEvaluation({})).data.total, 40);
});

test('published result endpoints return null when nothing is published and keep rule messages otherwise', () => {
  const f = setup(); f.user('one@example.com');
  const asked = [];
  f.c.loadPublishedReviewEvaluation_ = key => { asked.push(key); return key === 'review1' ? { config: { label: 'Review 1' } } : null; };
  f.c.loadPublishedGuideEvaluation_ = () => { throw new Error('Not a current student.'); };
  assert.equal(JSON.parse(f.c.API_student_getReviewResult('review1')).data.config.label, 'Review 1');
  assert.deepEqual(JSON.parse(f.c.API_student_getReviewResult('review2')), JSON.parse(JSON.stringify({ ok: true, data: null, generatedAt: JSON.parse(f.c.API_student_getReviewResult('review2')).generatedAt })));
  assert.deepEqual(JSON.parse(JSON.stringify(asked)), ['review1', 'review2', 'review2']);
  assert.deepEqual(JSON.parse(f.c.API_student_getGuideResult()).error, { code: 'REJECTED', message: 'Not a current student.' });
});

test('the weekly read gets the same answer while reading the roster and the weekly windows once per request', () => {
  const f = setup(); f.time('2026-01-02T12:00:00Z'); f.user('one@example.com');
  const baseline = f.c.loadStudentWeeklyProgress_();
  const counts = { students: 0, windows: 0 };
  const students = f.c.weeklyStudents_, windows = f.c.getWeeklySubmissionWindows_;
  f.c.weeklyStudents_ = (...args) => { counts.students++; return students(...args); };
  f.c.getWeeklySubmissionWindows_ = (...args) => { counts.windows++; return windows(...args); };
  const again = f.c.loadStudentWeeklyProgress_();
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(baseline)));
  assert.deepEqual(counts, { students: 1, windows: 1 });
});
