// Every API_* endpoint re-checks authorization on the server. Coordinator endpoints are exercised against real
// guards; every other endpoint must either call a role guard itself or delegate to a function whose first
// statements identify the caller. A new endpoint fails here until it is classified.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { coordinatorFixture } = require('./coordinator-fixture.cjs');

const COORDINATOR_CALLS = {
  API_coordinator_getOverview: [], API_coordinator_getReviewProgress: ['review1'], API_coordinator_getGuideProgress: [], API_coordinator_getHealth: [],
  API_coordinator_getActivity: [], API_coordinator_getSystemStatus: [], API_coordinator_getWeeklySetup: [], API_coordinator_setupWeekly: ['storage'],
  API_coordinator_getCommitteeConfiguration: [], API_coordinator_getReviewConfiguration: [], API_coordinator_createDefinitions: [],
  API_coordinator_prepareStorage: [], API_coordinator_syncGithub: [], API_coordinator_resendInvitations: [''], API_coordinator_getTeamDrawer: ['T1', 'basic']
};
// Functions the endpoints delegate to for their effects; they must never run for an unauthorized caller.
const DELEGATES = ['getCoordinatorCommitteeConfiguration_', 'getCoordinatorReviewConfiguration_', 'createAssessmentDefinitions_', 'prepareReviewAssessmentStorage_',
  'syncCoordinatorGithubAccess_', 'resendExpiredStudentInvitations_'];

function stubbed() {
  const g = coordinatorFixture(), ran = [];
  for (const name of DELEGATES) g.c[name] = () => { ran.push(name); return {}; };
  return { g, ran };
}

test('every coordinator endpoint rejects signed-out and non-coordinator callers before doing any work', () => {
  for (const user of ['', 'guide@example.com', 'student@example.com']) {
    const { g, ran } = stubbed();
    g.f.user(user);
    for (const [name, args] of Object.entries(COORDINATOR_CALLS)) {
      const frame = JSON.parse(g.c[name](...args));
      assert.equal(frame.ok, false, name + ' as ' + JSON.stringify(user));
      assert(['UNAUTHENTICATED', 'UNAUTHORIZED'].includes(frame.error.code), name + ': ' + frame.error.code);
    }
    assert.deepEqual(ran, [], 'no delegated work ran for ' + JSON.stringify(user));
  }
});

test('the coordinator reaches the delegated functions of the card endpoints', () => {
  const { g, ran } = stubbed();
  g.f.user('coord@example.com');
  for (const name of ['API_coordinator_getCommitteeConfiguration', 'API_coordinator_getReviewConfiguration', 'API_coordinator_createDefinitions',
    'API_coordinator_prepareStorage', 'API_coordinator_syncGithub', 'API_coordinator_resendInvitations']) assert.equal(JSON.parse(g.c[name]('')).ok, true, name);
  assert.deepEqual(ran.sort(), DELEGATES.slice().sort());
});

// ---- every other endpoint: the guard it calls, or the function it delegates to
const WRAPPER_GUARDS = /coordinatorAccessOrThrow_|coordinatorRead_|guideAccessOrThrow_|reviewerEmailOrThrow_|studentAccessOrThrow_/;
const IDENTITY = /coordinatorRead_\(|guideActor_\(|getDashboardRoleViews_\(|authorizeWeeklyStudent_\(|authorizeStudentGithub_\(|Session\.getActiveUser\(\)|reviewContext_\(|reviewerTeamContext_\(/;
// Endpoints that delegate their check, mapped to the function that performs it first (or through a shared helper).
const DELEGATED = {
  API_coordinator_getTeamDrawer: 'loadCoordinatorDrawerSection_',
  API_shared_getTimeline: 'loadSharedProjectTimeline_', API_shared_getRubrics: 'loadSharedRubrics_',
  API_publishing_get: 'loadInternalAssessmentPublishing_', API_publishing_run: ['publishInternalAssessment_', 'reopenInternalAssessment_'],
  API_review_getEvaluation: 'getReviewEvaluation_', API_review_save: ['reviewWrite_'],
  API_student_getWeekly: 'loadStudentWeeklyProgress_', API_student_submitWeekly: 'submitWeeklyProgress_',
  API_student_getReviewResult: 'loadPublishedAssessment_', API_student_getGuideResult: 'loadPublishedAssessment_',
  API_student_previewGithub: 'previewStudentGithubAccount_', API_student_confirmGithub: 'confirmStudentGithubAccount_', API_student_completeGithubSetup: 'completeStudentGithubSetup_'
};
const files = fs.readdirSync('.').filter(name => name.endsWith('.js') && !name.startsWith('tailwind'));
const sources = files.map(file => fs.readFileSync(file, 'utf8'));
const bodyOf = (name, length) => {
  for (const source of sources) {
    const at = source.search(new RegExp('^function ' + name + '\\(', 'm'));
    if (at >= 0) return source.slice(at, at + length);
  }
  return null;
};

test('every endpoint either calls a role guard or delegates to a function that identifies the caller', () => {
  const endpoints = sources.flatMap(source => [...source.matchAll(/^function (API_[A-Za-z0-9_]+)\(/gm)].map(match => match[1]));
  assert(endpoints.length >= 38, 'endpoints found: ' + endpoints.length);
  for (const name of endpoints) {
    const wrapper = bodyOf(name, 700).split(/\n(?=function |\/\*\*)/)[0];
    if (WRAPPER_GUARDS.test(wrapper)) continue;
    const delegates = DELEGATED[name];
    assert(delegates, name + ' neither calls a role guard nor is classified in DELEGATED');
    for (const delegate of [].concat(delegates)) {
      const body = bodyOf(delegate, 900);
      assert(body && IDENTITY.test(body), name + ' -> ' + delegate + ' must identify the caller in its first statements');
    }
  }
});
