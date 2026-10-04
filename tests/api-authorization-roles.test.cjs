// Behavioural authorization check for the Student, Guide, Reviewer, Review, publishing and shared endpoints:
// callers outside the endpoint's role are rejected with an access error (never an internal failure, which would
// mean a stub is missing and the check was not reached), and nothing is written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { studentFixture } = require('./student-fixture.cjs');

function context() {
  const { f, c } = studentFixture('approved');
  const fixtureConfig = c.getConfig_;
  c.getConfig_ = key => { try { return ({ ACADEMIC_YEAR: '2026', CELL_PD_EMAIL: 'pd@example.com' })[key] ?? fixtureConfig(key); } catch (error) { return ''; } };
  for (const file of ['evaluation-lifecycle.js', 'review-academic-policy.js', 'marks-tracker.js', 'review-evaluation.js', 'reviewer-evaluation.js', 'guide-evaluation.js', 'publication-events.js',
    'internal-assessment-publishing.js', 'review-configuration.js', 'reviewer-dashboard.js', 'reviewer-api.js', 'guide-dashboard.js', 'guide-api.js', 'intake-approval-workflow.js', 'dashboard-router.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: file });
  }
  // Only the student (one@) and the guide (guide@) are in the roster; nobody sits on a Review committee.
  c.Utilities = { ...(c.Utilities || {}), DigestAlgorithm: { SHA_256: 'sha256' }, getUuid: () => crypto.randomUUID(),
    computeDigest: (algorithm, value) => Array.from(crypto.createHash(algorithm).update(value).digest()), base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url') };
  c.getCommitteeNumbersForReviewer_ = () => [];
  c.getTeamDeadlineEvents_ = () => [];
  return { f, c };
}

const ACCESS = /sign in|identify|access|membership|not found|assigned|Student|Guide|Reviewer|Coordinator|Dashboard|permission|Student team/i;
const TEAM = 'T1';
const REQUEST = { requestId: 'request_123456789', revision: 0, team: TEAM, student: '001', assessmentId: 'review1' };

// endpoint -> [arguments, users that must be rejected]
const OUTSIDER = ['', 'outsider@example.com'];
const ENDPOINTS = {
  API_student_getDashboard: [[], [...OUTSIDER, 'guide@example.com']],
  API_student_getWeekly: [[], [...OUTSIDER, 'guide@example.com']],
  API_student_submitWeekly: [[{ requestId: 'request_123456789', weekId: 'W1', workCompleted: 'x', guideDiscussion: 'x', blockers: 'x', nextAction: 'x' }], [...OUTSIDER, 'guide@example.com']],
  API_student_getReviewResult: [['review1'], [...OUTSIDER, 'guide@example.com']],
  API_student_getGuideResult: [[], [...OUTSIDER, 'guide@example.com']],
  API_student_previewGithub: [['https://github.com/someone'], [...OUTSIDER, 'guide@example.com']],
  API_student_confirmGithub: [['abcdefghijklmnopqrstuvwxyz'], [...OUTSIDER, 'guide@example.com']],
  API_student_completeGithubSetup: [[], [...OUTSIDER, 'guide@example.com']],
  API_guide_getDashboard: [[], [...OUTSIDER, 'one@example.com']],
  API_guide_submitDecision: [[TEAM, 'Approved', '', ''], [...OUTSIDER, 'one@example.com']],
  API_guide_getWeekly: [[], [...OUTSIDER, 'one@example.com']],
  API_guide_signWeekly: [['entry-1', 'DISCUSSED'], [...OUTSIDER, 'one@example.com']],
  API_guide_getEvaluation: [[TEAM, '001'], [...OUTSIDER, 'one@example.com']],
  API_guide_saveEvaluationDraft: [[{ ...REQUEST, token: 'x', scores: {} }], [...OUTSIDER, 'one@example.com']],
  API_guide_submitEvaluation: [[{ ...REQUEST, token: 'x', scores: {} }], [...OUTSIDER, 'one@example.com']],
  API_reviewer_getDashboard: [[], [...OUTSIDER, 'one@example.com', 'guide@example.com']],
  API_reviewer_submitDecision: [[TEAM, 'Approved', ''], [...OUTSIDER, 'one@example.com', 'guide@example.com']],
  API_review_getEvaluation: [[TEAM, 'review1'], ['outsider@example.com', 'one@example.com']],
  API_review_save: [['draft', { ...REQUEST, scores: {} }], ['outsider@example.com', 'one@example.com']],
  API_publishing_get: [['review1'], [...OUTSIDER, 'one@example.com', 'guide@example.com']],
  API_publishing_run: [['publishInternalAssessment_', { ...REQUEST }], [...OUTSIDER, 'one@example.com', 'guide@example.com']],
  API_shared_getTimeline: [[], OUTSIDER],
  API_shared_getRubrics: [[], OUTSIDER]
};

test('callers outside an endpoint\'s role are rejected with an access error and nothing is written', () => {
  for (const [name, [args, denied]] of Object.entries(ENDPOINTS)) {
    for (const user of denied) {
      const { f, c } = context();
      f.user(user);
      const before = JSON.stringify([...f.sheets].map(([sheet, value]) => [sheet, value.rows]));
      const frame = JSON.parse(c[name](...args));
      const label = name + ' as ' + (JSON.stringify(user) || 'signed out');
      assert.equal(frame.ok, false, label);
      assert.notEqual(frame.error.code, 'INTERNAL', label + ': an internal failure means the check was not reached (' + frame.error.message + ')');
      assert.match(frame.error.message, ACCESS, label + ': ' + frame.error.message);
      assert.equal(JSON.stringify([...f.sheets].map(([sheet, value]) => [sheet, value.rows])), before, label + ' changed a sheet');
    }
  }
});

test('the role matrix covers every non-coordinator endpoint', () => {
  const sources = fs.readdirSync('.').filter(file => file.endsWith('.js') && !file.startsWith('tailwind')).map(file => fs.readFileSync(file, 'utf8'));
  const all = sources.flatMap(source => [...source.matchAll(/^function (API_[A-Za-z0-9_]+)\(/gm)].map(match => match[1])).filter(name => !name.startsWith('API_coordinator_'));
  assert.deepEqual(all.filter(name => !ENDPOINTS[name]), []);
});
