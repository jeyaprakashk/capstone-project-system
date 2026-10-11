// TitleLog history validation (title-history.js): rules 1 to 8 of archive/plans/TITLE-REVISION-PLAN.md section 4, one broken case each.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { HOUR, T0, NOW, row, history } = require('./title-fixtures.cjs');

function load() {
  const context = vm.createContext({console});
  ['common-constants.js', 'common-helpers.js', 'api-envelope.js', 'sheet-columns.js', 'title-log.js', 'title-history.js']
    .forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return context;
}
const c = load();
const check = rows => Array.from(c.validateTitleHistory_(rows, NOW));
const mutate = (rows, index, change) => rows.map((r, i) => i === index ? {...r, ...change} : r);
const has = (errors, pattern) => errors.some(error => pattern.test(error));

test('valid histories pass: every path through the workflow', () => {
  const paths = [
    ['SUBMIT'],
    ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'],
    ['SUBMIT', 'RETURN', 'SUBMIT', 'GUIDE_APPROVE', 'RETURN', 'SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'],
    ['BASELINE'], ['BASELINE:NEEDS_REVIEW'], ['BASELINE:AWAITING_REVIEWER'], ['BASELINE:RETURNED'], ['BASELINE:APPROVED'],
    ['BASELINE:NOT_SUBMITTED', 'SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'],
    ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'],
    ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'CANCEL_REOPEN'],
    ['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT', 'RETURN', 'SUBMIT', 'CANCEL_REOPEN'],
    ['BASELINE:APPROVED', 'REOPEN', 'SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'],
    ['BASELINE:APPROVED', 'REOPEN', 'CANCEL_REOPEN']
  ];
  for (const steps of paths) assert.deepEqual(check(history(steps)), [], steps.join(' > '));
  assert.deepEqual(check([]), [], 'a team with no rows is NOT_SUBMITTED, not an error');
});

test('rule 1: revisions run 1 to n with no gaps or duplicates', () => {
  const good = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  assert.match(check([good[0], good[2]])[0], /1 to n/);
  assert.match(check([good[0], {...good[1], revision: 1}, good[2]])[0], /1 to n/);
  assert.match(check(mutate(good, 1, {revision: NaN}))[0], /not a whole number/);
  assert.match(check(mutate(good, 1, {revision: 0}))[0], /not a whole number/);
  assert.deepEqual(check([good[2], good[0], good[1]].map((r, i) => ({...r, row: 10 - i}))), [], 'physical order does not matter; revision order does');
});

test('rule 2: the first row, where a baseline may appear, and NOT_SUBMITTED', () => {
  const good = history(['SUBMIT', 'GUIDE_APPROVE']);
  assert.match(check(mutate(good, 0, {action: 'GUIDE_APPROVE', status: 'AWAITING_REVIEWER'}))[0], /first row must be a BASELINE or a SUBMIT/);
  assert.match(check(mutate(good, 0, {status: 'RETURNED'}))[0], /first SUBMIT must give NEEDS_REVIEW/);
  assert.match(check(mutate(good, 1, {action: 'BASELINE'}))[0], /Only the first row may be a BASELINE/);
  assert.ok(has(check(mutate(good, 1, {status: 'NOT_SUBMITTED'})), /appears only on a BASELINE/));
  assert.match(check(mutate(history(['BASELINE:APPROVED']), 0, {status: 'REOPENED', reopened: true}))[0], /baseline cannot have the status REOPENED/);
});

test('rule 3: every later row is a legal transition with the right resulting status', () => {
  const good = history(['SUBMIT', 'RETURN']);
  assert.ok(has(check([...good, row({row: 4, revision: 3, action: 'GUIDE_APPROVE', status: 'AWAITING_REVIEWER', timestamp: T0 + 5 * HOUR})]), /GUIDE_APPROVE cannot follow the status RETURNED/));
  assert.ok(has(check(mutate(good, 1, {status: 'APPROVED'})), /RETURN must give the status RETURNED/));
  const noReopening = history(['SUBMIT', 'GUIDE_APPROVE']).concat(row({row: 4, revision: 3, action: 'CANCEL_REOPEN', status: 'APPROVED', timestamp: T0 + 5 * HOUR}));
  assert.ok(has(check(noReopening), /needs an open reopening/));
  const misplaced = mutate(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']), 2, {action: 'REOPEN', status: 'REOPENED', reopened: true});
  assert.ok(has(check(misplaced), /REOPEN cannot follow the status AWAITING_REVIEWER/));
});

test('rule 4: the Reopened flag is set by REOPEN, kept by SUBMIT, GUIDE_APPROVE and RETURN, cleared by REVIEWER_APPROVE and CANCEL_REOPEN', () => {
  const reopened = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT', 'GUIDE_APPROVE']);
  assert.ok(has(check(mutate(reopened, 3, {reopened: false})), /Reopened flag should be Yes/));
  assert.ok(has(check(mutate(reopened, 4, {reopened: false})), /should be Yes/));
  assert.ok(has(check(mutate(reopened, 5, {reopened: false})), /should be Yes/));
  const closed = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'CANCEL_REOPEN']);
  assert.ok(has(check(mutate(closed, 4, {reopened: true})), /should be blank/));
  assert.ok(has(check(mutate(history(['SUBMIT']), 0, {reopened: true})), /should be blank/));
  assert.ok(has(check(mutate(history(['SUBMIT']), 0, {reopened: null})), /Yes or blank/));
});

test('rule 5: approved fields are copied forward, set or blank together, and a proposal is complete', () => {
  const approved = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT']);
  assert.ok(has(check(mutate(approved, 3, {approvedTitle: 'CHANGED'})), /copied forward unchanged/));
  assert.ok(has(check(mutate(approved, 4, {approvedBy: 'someone@example.com'})), /copied forward unchanged/));
  assert.ok(check(mutate(approved, 4, {approvedAt: T0 + 99 * HOUR})).length > 0);
  assert.ok(has(check(mutate(approved, 2, {approvedBy: ''})), /Approved By is required/));
  assert.ok(has(check(mutate(approved, 2, {approvedTitle: ''})), /Approved Title is required/));
  assert.ok(has(check(mutate(approved, 2, {approvedAt: null})), /Approved At is required/));
  assert.ok(has(check(mutate(approved, 2, {approvedProblem: ''})), /Approved Problem is required/), 'a non-baseline approval must have a problem');
  assert.ok(has(check(mutate(approved, 1, {approvedTitle: 'TOO EARLY'})), /blank until the team is first approved/));
  const plain = history(['SUBMIT', 'GUIDE_APPROVE']);
  assert.ok(has(check(mutate(plain, 0, {problem: ''})), /needs a Proposed Title and a Proposed Problem/));
  assert.ok(has(check(mutate(plain, 1, {title: ' '})), /GUIDE_APPROVE needs a Proposed Title/));
});

test('rule 5 exception: an APPROVED legacy baseline with a blank problem is valid until the next REVIEWER_APPROVE', () => {
  assert.deepEqual(check(history(['BASELINE:APPROVED'], {baselineProblem: ''})), []);
  assert.deepEqual(check(history(['BASELINE:APPROVED', 'REOPEN', 'CANCEL_REOPEN'], {baselineProblem: ''})), [], 'cancel restores the blank problem and validates');
  const replaced = history(['BASELINE:APPROVED', 'REOPEN', 'SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE'], {baselineProblem: ''});
  assert.deepEqual(check(replaced), [], 'a re-approval replaces it');
  assert.ok(check(mutate(replaced, 4, {approvedProblem: '', problem: ''})).length > 0, 'the new approval must carry a problem');
  assert.deepEqual(check(history(['BASELINE:NEEDS_REVIEW'], {baselineProblem: ''})), [], 'a pending baseline with a blank problem is stored as it is; approval is refused elsewhere');
});

test('rule 6: approved fields are set exactly when the team has been approved', () => {
  const blank = {approvedTitle: '', approvedProblem: '', approvedBy: '', approvedAt: null};
  assert.ok(check(mutate(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']), 2, blank)).length > 0);
  assert.ok(has(check(mutate(history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN']), 3, blank)), /approved or reopened must carry approved fields|required from the first approval/));
  assert.ok(check(mutate(history(['BASELINE:APPROVED']), 0, blank)).length > 0);
  assert.ok(has(check(mutate(history(['BASELINE:NEEDS_REVIEW']), 0, {approvedTitle: 'X', approvedProblem: 'Y', approvedBy: 'z', approvedAt: T0 - HOUR})), /blank until the team is first approved/));
});

test('rule 7: the approver row carries the proposal, the actor, and the first approval date', () => {
  const approved = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  assert.ok(has(check(mutate(approved, 2, {approvedTitle: 'OTHER'})), /must equal the proposal/));
  assert.ok(has(check(mutate(approved, 2, {approvedProblem: 'other'})), /must equal the proposal/));
  assert.ok(has(check(mutate(approved, 2, {approvedBy: 'someone@example.com'})), /Approved By must equal the Actor/));
  assert.ok(has(check(mutate(approved, 2, {approvedAt: T0 + HOUR})), /Approved At must equal the Timestamp/));
  const second = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  assert.deepEqual(check(second), []);
  assert.equal(second[6].approvedAt, second[2].approvedAt, 'the date of the first approval never moves');
  assert.ok(has(check(mutate(second, 6, {approvedAt: second[6].timestamp})), /never changes once set/));
  const cancel = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE', 'REOPEN', 'CANCEL_REOPEN']);
  assert.ok(has(check(mutate(cancel, 4, {title: 'SOMETHING ELSE'})), /restores the approved title and problem/));
});

test('rule 8: dates are real, not in the future, in order, and Approved At is not later than its row', () => {
  const approved = history(['SUBMIT', 'GUIDE_APPROVE', 'REVIEWER_APPROVE']);
  assert.ok(has(check(mutate(approved, 0, {timestamp: NOW + HOUR})), /not in the future/));
  assert.ok(has(check(mutate(approved, 0, {timestamp: NaN})), /real date/));
  assert.ok(has(check(mutate(approved, 0, {timestamp: null})), /real date/));
  assert.ok(has(check(mutate(approved, 1, {timestamp: T0 - HOUR})), /must not decrease/));
  assert.ok(has(check(mutate(approved, 2, {approvedAt: NaN})), /Approved At must be a real date/));
  assert.ok(check(mutate(approved, 2, {approvedAt: NOW + HOUR, timestamp: NOW + HOUR})).length > 0);
  const baseline = history(['BASELINE:APPROVED']);
  assert.ok(has(check(mutate(baseline, 0, {approvedAt: baseline[0].timestamp + HOUR})), /later than the row that first carries it/));
  assert.deepEqual(check(history(['BASELINE:APPROVED'], {approvedAtOffset: -400 * HOUR})), [], 'a baseline may carry an approval date long before it');
});

test('unknown actions and statuses are reported, and the report is capped', () => {
  const good = history(['SUBMIT', 'GUIDE_APPROVE']);
  assert.ok(has(check(mutate(good, 1, {action: 'HACK'})), /Unknown action/));
  assert.ok(has(check(mutate(good, 1, {status: 'DONE'})), /Unknown status/));
  const many = Array.from({length: 40}, (_, i) => row({row: i + 2, revision: i + 1, action: 'SUBMIT', status: 'APPROVED', timestamp: T0 + i * HOUR, reopened: true}));
  assert.ok(check(many).length <= 20);
});

test('source rules: no sheet or service calls in the history rules, no public function', () => {
  const text = fs.readFileSync('title-history.js', 'utf8');
  assert.doesNotMatch(text, /SpreadsheetApp|getSheet_|LockService|PropertiesService|MailApp|new Date\(\)|Date\.now/);
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
});
