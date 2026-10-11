// The TITLE_CUTOVER write barrier (title-cutover.js): the property is changed only by the two editor-run functions, under the script lock.
// Specified in TITLE-REVISION-PLAN.md, section 11 ("TITLE_CUTOVER" and the write barrier). The old writers that Release 0 guarded with it
// (tag release-0) are gone; the new write path reads the property under the lock (tests/title-write.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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

test('the guard is the first statement of both editor-run functions', () => {
  const first = (file, name) => {
    const text = fs.readFileSync(file, 'utf8');
    const body = text.slice(text.search(new RegExp('^function ' + name + '\\(', 'm')));
    return body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim();
  };
  for (const [file, name] of [['title-cutover.js', 'setTitleCutover'], ['title-cutover.js', 'clearTitleCutover']]) {
    assert.equal(first(file, name), 'requireTriggerOrOperator_();', name);
  }
});


test('source rules: the barrier file adds only the two editor-run functions and reads no sheet', () => {
  const barrierSource = fs.readFileSync('title-cutover.js', 'utf8');
  const publicFunctions = [...barrierSource.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, ['setTitleCutover', 'clearTitleCutover']);
  assert.doesNotMatch(barrierSource, /\.(?:getValue|getValues|getDisplayValue|getDisplayValues|getFormula|getFormulas)\s*\(/);
  assert.doesNotMatch(barrierSource, /withTitleWriteLock_/, 'the old writers and their lock helper are gone');
});
