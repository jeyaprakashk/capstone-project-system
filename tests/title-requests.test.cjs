// The request ID rules for title writes (title-requests.js): a retry of the same content keeps its ID, anything else gets a new one.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function make() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync('title-requests.js', 'utf8'), context);
  return vm.runInContext('(' + context.titleRequestsBrowser_.toString() + ')()', context);
}

test('the same content in the same scope keeps its request ID until the write succeeds', () => {
  const requests = make();
  const first = requests.idFor('student:T1', 'a|b');
  assert.match(first, /^\S{8,}$/);
  assert.equal(requests.idFor('student:T1', 'a|b'), first);
  requests.settle('student:T1');
  assert.notEqual(requests.idFor('student:T1', 'a|b'), first, 'a new write after success gets a new ID');
});

test('changed content or another scope gets another ID', () => {
  const requests = make();
  const first = requests.idFor('guide:T1', 'x');
  assert.notEqual(requests.idFor('guide:T1', 'y'), first);
  assert.notEqual(requests.idFor('guide:T2', 'x'), requests.idFor('guide:T1', 'y'));
  assert.equal(requests.idFor('guide:T2', 'x'), requests.idFor('guide:T2', 'x'));
});

test('the ID is kept after a failure that may have committed, and dropped after any other failure', () => {
  for (const code of ['TRANSPORT', 'TIMEOUT', 'BAD_RESPONSE', 'UNAVAILABLE']) {
    const requests = make();
    const id = requests.idFor('s', 'c');
    requests.settle('s', {code});
    assert.equal(requests.idFor('s', 'c'), id, code);
  }
  for (const code of ['UNAUTHORIZED', 'INVALID_INPUT', 'REJECTED', 'CONFLICT', 'INTERNAL', 'UNAUTHENTICATED', 'NOT_FOUND']) {
    const requests = make();
    const id = requests.idFor('s', 'c');
    requests.settle('s', {code});
    assert.notEqual(requests.idFor('s', 'c'), id, code);
  }
});

test('without crypto.randomUUID it still produces distinct IDs', () => {
  const requests = make();
  const ids = new Set(Array.from({length: 50}, (_, i) => requests.idFor('s' + i, 'c')));
  assert.equal(ids.size, 50);
});

test('the module has no side effects on load and no markup', () => {
  const text = fs.readFileSync('title-requests.js', 'utf8');
  assert.doesNotMatch(text, /document\.|innerHTML|google\.script/);
});
