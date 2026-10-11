// Release 0: the TITLE_CUTOVER write barrier (title-cutover.js) and the three old title writers that use it.
// Specified in TITLE-REVISION-PLAN.md, section 11 ("TITLE_CUTOVER" and the write barrier).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const PAUSED_MESSAGE = 'Title updates are paused. Reload the dashboard shortly.';
const LIVE_MESSAGE = 'Reload the dashboard.';
const BUSY_MESSAGE = 'Another decision is being saved. Try again.';

/** A fake script lock and script-properties store that record the order of every call. */
function makeEnv(initial = null) {
  const events = [];
  const store = new Map(initial === null ? [] : [['TITLE_CUTOVER', initial]]);
  const lock = {
    held: false, allow: true, onAcquire: null,
    hasLock() { events.push('hasLock'); return this.held; },
    tryLock(ms) { events.push('tryLock:' + ms); if (!this.allow) return false; if (this.onAcquire) this.onAcquire(); this.held = true; return true; },
    waitLock(ms) { events.push('waitLock:' + ms); if (!this.allow) throw new Error('Lock wait timed out'); if (this.onAcquire) this.onAcquire(); this.held = true; },
    releaseLock() { events.push('release'); this.held = false; }
  };
  const properties = {
    getProperty(key) { events.push('getProperty'); return store.has(key) ? store.get(key) : null; },
    setProperty(key, value) { events.push('setProperty:' + value); store.set(key, value); },
    deleteProperty(key) { events.push('deleteProperty'); store.delete(key); }
  };
  return {events, store, lock, properties};
}

function load(env, files, extra = {}) {
  const context = vm.createContext({
    console,
    PropertiesService: {getScriptProperties: () => env.properties},
    LockService: {getScriptLock: () => env.lock},
    getCoordinatorEmail_: () => 'coordinator@example.com', getAcademicYear_: () => '2026', getConfig_: () => '',
    ...extra
  });
  files.forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return context;
}
const barrier = (env, extra) => load(env, ['title-cutover.js'], extra);
const plain = value => JSON.parse(JSON.stringify(value));

test('old code works when TITLE_CUTOVER is unset, under the script lock, and releases the lock', () => {
  for (const unset of [null, '', '  ']) {
    const env = makeEnv(unset);
    const c = barrier(env);
    let ran = 0;
    assert.equal(c.withTitleWriteLock_(1000, BUSY_MESSAGE, () => { ran++; return 'done'; }), 'done');
    assert.equal(ran, 1);
    assert.deepEqual(env.events, ['hasLock', 'tryLock:1000', 'getProperty', 'release']);
  }
});

test('PAUSED, LIVE and any other value refuse with the plan messages and run nothing', () => {
  for (const [value, message] of [['PAUSED', PAUSED_MESSAGE], ['LIVE', LIVE_MESSAGE], ['paused-ish', PAUSED_MESSAGE], ['live', PAUSED_MESSAGE]]) {
    const env = makeEnv(value);
    const c = barrier(env);
    let ran = 0;
    assert.throws(() => c.withTitleWriteLock_(1000, BUSY_MESSAGE, () => { ran++; }), error => error.message === message, value);
    assert.equal(ran, 0);
    assert.equal(env.events.at(-1), 'release', 'the lock is released after a refusal');
  }
});

test('the property is read under the lock: a write that reaches the lock after PAUSED was set refuses and writes nothing', () => {
  const env = makeEnv(null);
  const c = barrier(env);
  // The writer passed any earlier check (the property was unset); PAUSED is set while it waits for the lock.
  env.lock.onAcquire = () => env.store.set('TITLE_CUTOVER', 'PAUSED');
  let ran = 0;
  assert.throws(() => c.withTitleWriteLock_(1000, BUSY_MESSAGE, () => { ran++; }), error => error.message === PAUSED_MESSAGE);
  assert.equal(ran, 0);
  assert.ok(env.events.indexOf('tryLock:1000') < env.events.indexOf('getProperty'), 'the lock is taken before the property is read');
});

test('a busy lock gives the writer\'s own message and runs nothing; a lock held already is reused and left held', () => {
  const busy = makeEnv(null);
  busy.lock.allow = false;
  assert.throws(() => barrier(busy).withTitleWriteLock_(1000, BUSY_MESSAGE, () => assert.fail('must not run')), error => error.message === BUSY_MESSAGE);
  assert.ok(!busy.events.includes('release'), 'a lock never taken is not released');
  assert.ok(!busy.events.includes('getProperty'));

  const owned = makeEnv(null);
  owned.lock.held = true;
  barrier(owned).withTitleWriteLock_(1000, BUSY_MESSAGE, () => 'ok');
  assert.ok(!owned.events.some(event => event.startsWith('tryLock')));
  assert.ok(!owned.events.includes('release'));
  assert.equal(owned.lock.held, true);
});

test('a write that throws still releases the lock', () => {
  const env = makeEnv(null);
  assert.throws(() => barrier(env).withTitleWriteLock_(1000, BUSY_MESSAGE, () => { throw new Error('write failed'); }), /write failed/);
  assert.equal(env.events.at(-1), 'release');
});

test('setTitleCutover accepts only PAUSED or LIVE, calls the guard first, and sets the property while holding the lock', () => {
  const env = makeEnv(null);
  const order = [];
  const c = barrier(env, {requireTriggerOrOperator_: () => order.push('guard')});
  for (const bad of [undefined, null, '', 'paused', 'OPEN', 'live ', 0]) {
    assert.throws(() => c.setTitleCutover(bad), /accepts only 'PAUSED' or 'LIVE'/, String(bad));
  }
  assert.equal(env.store.has('TITLE_CUTOVER'), false);
  assert.deepEqual(plain(c.setTitleCutover('PAUSED')), {ok: true, value: 'PAUSED'});
  assert.equal(env.store.get('TITLE_CUTOVER'), 'PAUSED');
  assert.equal(order[0], 'guard');
  assert.deepEqual(env.events.filter(event => event !== 'hasLock'), ['waitLock:30000', 'setProperty:PAUSED', 'release']);
  assert.deepEqual(plain(c.setTitleCutover(' LIVE ')), {ok: true, value: 'LIVE'}, 'trimmed');
  assert.equal(env.store.get('TITLE_CUTOVER'), 'LIVE');
});

test('setTitleCutover waits for a writer that holds the lock, and tells the coordinator to retry if it times out', () => {
  const env = makeEnv(null);
  env.lock.allow = false;
  const c = barrier(env, {requireTriggerOrOperator_: () => {}});
  assert.throws(() => c.setTitleCutover('PAUSED'), /still running\. Run this again shortly/);
  assert.equal(env.store.has('TITLE_CUTOVER'), false, 'nothing is set when the lock was not obtained');
  assert.ok(!env.events.includes('release'));
});

test('clearTitleCutover is the rollback: it removes PAUSED or an unset property, and refuses LIVE or an unknown value', () => {
  const guard = [];
  for (const [initial, expectedWas] of [['PAUSED', 'PAUSED'], [null, 'unset']]) {
    const env = makeEnv(initial);
    const c = barrier(env, {requireTriggerOrOperator_: () => guard.push('guard')});
    assert.deepEqual(plain(c.clearTitleCutover()), {ok: true, was: expectedWas});
    assert.equal(env.store.has('TITLE_CUTOVER'), false);
    assert.deepEqual(env.events.filter(event => event !== 'hasLock'), ['waitLock:30000', 'getProperty', 'deleteProperty', 'release']);
  }
  const live = makeEnv('LIVE');
  assert.throws(() => barrier(live, {requireTriggerOrOperator_: () => {}}).clearTitleCutover(), /Cutover is LIVE; fix forward\./);
  assert.equal(live.store.get('TITLE_CUTOVER'), 'LIVE', 'LIVE is left untouched');
  assert.equal(live.events.at(-1), 'release');
  const odd = makeEnv('PAUSD');
  assert.throws(() => barrier(odd, {requireTriggerOrOperator_: () => {}}).clearTitleCutover(), /unrecognised value\. Run setTitleCutover\('PAUSED'\) first/);
  assert.equal(odd.store.get('TITLE_CUTOVER'), 'PAUSD');
  assert.equal(guard.length, 2, 'the guard runs first each time');
});

test('the guard is the first statement of both editor-run functions and of the Form handler', () => {
  const first = (file, name) => {
    const text = fs.readFileSync(file, 'utf8');
    const body = text.slice(text.search(new RegExp('^function ' + name + '\\(', 'm')));
    return body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim();
  };
  for (const [file, name] of [['title-cutover.js', 'setTitleCutover'], ['title-cutover.js', 'clearTitleCutover'], ['intake-approval-workflow.js', 'onTeamIntakeSubmit']]) {
    assert.equal(first(file, name), 'requireTriggerOrOperator_();', name);
  }
});

// ---- the three old writers --------------------------------------------------------------------------------------------------

function reviewerEnv(initial) {
  const env = makeEnv(initial);
  const calls = [];
  const c = load(env, ['title-cutover.js', 'reviewer-dashboard.js'], {
    textEquals_: (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(),
    Session: {getActiveUser: () => ({getEmail: () => 'reviewer@example.com'})},
    reviewerTeamContext_: () => { env.events.push('context'); return {title: 'A TITLE', TS: {REVIEWER_DECISION: 0, GUIDE_DECISION: 1}, row: ['', 'Approved']}; },
    applyReviewerDecision_: (...args) => { env.events.push('apply'); calls.push(args); return {ok: true, message: 'Decision recorded.'}; }
  });
  return {env, c, calls};
}

test('reviewer decision: the existing lock now rereads TITLE_CUTOVER before reading or writing anything', () => {
  const open = reviewerEnv(null);
  assert.deepEqual(plain(open.c.submitReviewerDecision_('T1', 'Approved', '')), {ok: true, message: 'Decision recorded.'});
  assert.deepEqual(open.env.events.filter(event => event !== 'hasLock'), ['tryLock:1000', 'getProperty', 'context', 'apply', 'release']);
  assert.deepEqual(plain(open.calls), [['T1', 'Approved', '', 'reviewer@example.com']]);
  for (const [value, message] of [['PAUSED', PAUSED_MESSAGE], ['LIVE', LIVE_MESSAGE]]) {
    const refused = reviewerEnv(value);
    assert.throws(() => refused.c.submitReviewerDecision_('T1', 'Approved', ''), error => error.message === message);
    assert.equal(refused.calls.length, 0);
    assert.ok(!refused.env.events.includes('context'), 'nothing is read after a refusal');
  }
  const busy = reviewerEnv(null);
  busy.env.lock.allow = false;
  assert.throws(() => busy.c.submitReviewerDecision_('T1', 'Approved', ''), error => error.message === BUSY_MESSAGE);
});

function guideEnv(initial) {
  const env = makeEnv(initial);
  const calls = [];
  const c = load(env, ['title-cutover.js', 'guide-dashboard.js'], {
    Session: {getActiveUser: () => ({getEmail: () => 'guide@example.com'})},
    applyGuideDecision_: (...args) => { env.events.push('apply'); calls.push(args); return {ok: true, message: 'Decision recorded for Team T1.'}; }
  });
  return {env, c, calls};
}

test('guide decision: now takes the script lock and rereads TITLE_CUTOVER under it; PAUSED and LIVE refuse and write nothing', () => {
  const open = guideEnv(null);
  assert.deepEqual(plain(open.c.submitGuideDecision_('T1', 'Approved', 'Good', 'New title')), {ok: true, message: 'Decision recorded for Team T1.'});
  assert.deepEqual(open.env.events.filter(event => event !== 'hasLock'), ['tryLock:1000', 'getProperty', 'apply', 'release']);
  assert.deepEqual(plain(open.calls), [['T1', 'Approved', 'Good', 'guide@example.com', 'New title']]);
  for (const [value, message] of [['PAUSED', PAUSED_MESSAGE], ['LIVE', LIVE_MESSAGE]]) {
    const refused = guideEnv(value);
    assert.throws(() => refused.c.submitGuideDecision_('T1', 'Approved', '', ''), error => error.message === message);
    assert.equal(refused.calls.length, 0);
    assert.equal(refused.env.events.at(-1), 'release');
  }
  const busy = guideEnv(null);
  busy.env.lock.allow = false;
  assert.throws(() => busy.c.submitGuideDecision_('T1', 'Approved', '', ''), error => error.message === BUSY_MESSAGE);
  assert.equal(busy.calls.length, 0);
});

function formEnv(initial) {
  const env = makeEnv(initial);
  const applied = [];
  const order = [];
  const c = load(env, ['title-cutover.js', 'intake-approval-workflow.js'], {
    SHEET_NAMES: {TEAM_INTAKE_RAW: 'TeamIntakeRaw'},
    textEquals_: (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
  });
  c.requireTriggerOrOperator_ = () => order.push('guard');
  c.applyTeamIntakeSubmission_ = event => { env.events.push('apply'); applied.push(event); return 'applied'; };
  const submit = sheetName => c.onTeamIntakeSubmit({range: {getSheet: () => ({getName: () => sheetName})}, namedValues: {}});
  return {env, c, applied, order, submit};
}

test('Form handler: guard first, other sheets ignored, then the lock and TITLE_CUTOVER before the submission is applied', () => {
  const open = formEnv(null);
  assert.equal(open.submit('TeamIntakeRaw'), 'applied');
  assert.deepEqual(open.order, ['guard']);
  assert.deepEqual(open.env.events.filter(event => event !== 'hasLock'), ['tryLock:30000', 'getProperty', 'apply', 'release']);
  assert.equal(open.applied.length, 1);

  const other = formEnv(null);
  assert.equal(other.submit('SomeOtherSheet'), undefined);
  assert.deepEqual(other.env.events, [], 'a response sheet that is not TeamIntakeRaw touches neither the lock nor the property');
  assert.equal(other.applied.length, 0);

  for (const [value, message] of [['PAUSED', PAUSED_MESSAGE], ['LIVE', LIVE_MESSAGE]]) {
    const refused = formEnv(value);
    assert.throws(() => refused.submit('TeamIntakeRaw'), error => error.message === message);
    assert.equal(refused.applied.length, 0);
    assert.equal(refused.env.events.at(-1), 'release');
  }
});

test('source rules: the old writers go through withTitleWriteLock_ and the barrier file adds only the two editor-run functions', () => {
  const reviewer = fs.readFileSync('reviewer-dashboard.js', 'utf8');
  assert.ok(!/LockService/.test(reviewer), 'the reviewer path no longer takes its own lock');
  assert.match(reviewer, /withTitleWriteLock_\(1000,/);
  assert.match(fs.readFileSync('guide-dashboard.js', 'utf8'), /withTitleWriteLock_\(1000,/);
  assert.match(fs.readFileSync('intake-approval-workflow.js', 'utf8'), /withTitleWriteLock_\(30000,/);
  const barrierSource = fs.readFileSync('title-cutover.js', 'utf8');
  const publicFunctions = [...barrierSource.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, ['setTitleCutover', 'clearTitleCutover']);
  assert.doesNotMatch(barrierSource, /\.(?:getValue|getValues|getDisplayValue|getDisplayValues|getFormula|getFormulas)\s*\(/);
  assert.ok(barrierSource.includes('Title updates are paused. Reload the dashboard shortly.') && barrierSource.includes("'Reload the dashboard.'"));
});
