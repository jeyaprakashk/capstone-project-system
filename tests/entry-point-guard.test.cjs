// Public Apps Script functions are callable by name through google.script.run, whoever the signed-in user is.
// Only API_* endpoints, doGet and the trigger/editor entry points below may be public, and the latter reject
// every signed-in user who is neither the deployer (trigger or editor run) nor a coordinator.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const GUARDED = ['processWeeklySubmissionSchedule', 'fetchAllCommits', 'auditCommitHistory', 'onTeamIntakeSubmit', 'sendGuideReminderDigest', 'sendReviewerApprovalDigest',
  'processWeeklyProgressAI', 'provisionAllTeamRepos', 'addMissingGuideCollaborators', 'backfillExistingRepos', 'backfillMissingStudentCollaborators', 'setupActivityDependencies'];
// These check the coordinator themselves (coordinator-only setup and the daily reconciliation).
const SELF_CHECKED = ['setupWeeklySubmissionStorage', 'setupProgressEligibilityStorage', 'setupWeeklyProgressPhase2Storage', 'setupWeeklyProgressPhase2Triggers', 'reconcileProgressEligibility'];
const files = fs.readdirSync('.').filter(name => name.endsWith('.js') && !name.startsWith('tailwind'));

test('the only public functions are API endpoints, doGet and the listed entry points', () => {
  const allowed = new Set(['doGet', ...GUARDED, ...SELF_CHECKED]);
  const unexpected = [];
  for (const file of files) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)) {
      const name = match[1];
      if (!name.endsWith('_') && !name.startsWith('API_') && !allowed.has(name)) unexpected.push(file + ':' + name);
    }
  }
  assert.deepEqual(unexpected, []);
});

test('every guarded entry point rejects other signed-in users before doing anything', () => {
  for (const name of GUARDED) {
    const file = files.find(candidate => new RegExp('^function ' + name + '\\(', 'm').test(fs.readFileSync(candidate, 'utf8')));
    assert(file, name);
    const source = fs.readFileSync(file, 'utf8');
    const body = source.slice(source.search(new RegExp('^function ' + name + '\\(', 'm')));
    const firstStatement = body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim();
    assert.equal(firstStatement, 'requireTriggerOrOperator_();', name + ' must call the guard first');
  }
});

function guardContext(active, effective, coordinators = ['coord@x']) {
  const c = vm.createContext({
    Session: { getActiveUser: () => ({ getEmail: () => active }), ...(effective === undefined ? {} : { getEffectiveUser: () => ({ getEmail: () => effective }) }) },
    normalizeEmail_: value => String(value || '').trim().toLowerCase(),
    activityIsCoordinator_: email => coordinators.includes(email)
  });
  const source = fs.readFileSync('common-helpers.js', 'utf8');
  // Windows checkouts use CRLF, so match the closing brace with either line ending.
  vm.runInContext(source.match(/^function requireTriggerOrOperator_\([\s\S]*?\r?\n\}\r?\n/m)[0], c);
  return c;
}

test('triggers and editor runs pass; coordinators pass; any other signed-in user is rejected', () => {
  assert.doesNotThrow(() => guardContext('', 'deployer@x').requireTriggerOrOperator_(), 'a trigger may expose no user');
  assert.doesNotThrow(() => guardContext('Deployer@X', 'deployer@x').requireTriggerOrOperator_(), 'an editor run or trigger runs as its owner');
  assert.doesNotThrow(() => guardContext('coord@x', 'deployer@x').requireTriggerOrOperator_(), 'a coordinator may run it');
  assert.doesNotThrow(() => guardContext('student@x', undefined).requireTriggerOrOperator_(), 'no effective user to compare with');
  assert.throws(() => guardContext('student@x', 'deployer@x').requireTriggerOrOperator_(), /Coordinator access is required/);
  assert.throws(() => guardContext('guide@x', 'deployer@x').requireTriggerOrOperator_(), /Coordinator access is required/);
});
