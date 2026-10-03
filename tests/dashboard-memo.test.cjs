const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

function context() {
  const c = vm.createContext({});
  vm.runInContext('let dashboardReadSnapshot_ = null;', c);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'assessment-registry.js'), 'utf8'), c);
  return c;
}

test('dashboardMemo_ computes once per snapshot, caches errors, and never caches outside one', () => {
  const c = context();
  let calls = 0;
  c.compute = () => ++calls;
  c.fail = () => { calls++; throw new Error('boom'); };
  vm.runInContext('dashboardReadSnapshot_ = Object.create(null);', c);
  assert.equal(vm.runInContext("dashboardMemo_('a', compute) + dashboardMemo_('a', compute)", c), 2);
  assert.equal(calls, 1);
  assert.throws(() => vm.runInContext("dashboardMemo_('e', fail)", c), /boom/);
  assert.throws(() => vm.runInContext("dashboardMemo_('e', fail)", c), /boom/);
  assert.equal(calls, 2);
  vm.runInContext('dashboardReadSnapshot_ = null;', c);
  vm.runInContext("dashboardMemo_('a', compute); dashboardMemo_('a', compute)", c);
  assert.equal(calls, 4);
});
