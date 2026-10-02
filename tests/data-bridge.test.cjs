const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadSources } = require('./invariants/golden.cjs');
const vm = require('node:vm');

function bridge() {
  const c = loadSources(['data-bridge-client.js'], { setTimeout, clearTimeout, Promise, JSON });
  return vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
}
const ok = data => JSON.stringify({ ok: true, data, generatedAt: '2026-01-01T00:00:00.000Z' });
const fail = (code, message) => JSON.stringify({ ok: false, error: { code, message } });

test('bridge unwraps successful envelopes and surfaces coded errors', async () => {
  const b = bridge();
  b.useTransport(async method => method === 'good' ? ok({ n: 1 }) : fail('UNAUTHORIZED', 'No access'));
  assert.deepEqual(JSON.parse(JSON.stringify(await b.call('good'))), { n: 1 });
  await assert.rejects(b.call('bad'), e => e.code === 'UNAUTHORIZED' && e.message === 'No access');
});

test('bridge rejects malformed responses instead of guessing', async () => {
  const b = bridge();
  for (const raw of ['not json', '{"ok":"yes"}', 'null', '[]', '{"data":1}']) {
    b.useTransport(async () => raw);
    await assert.rejects(b.call('x'), e => e.code === 'BAD_RESPONSE', raw);
  }
});

test('reads time out client-side; writes are never timed out', async () => {
  const b = bridge();
  b.useTransport(() => new Promise(resolve => setTimeout(() => resolve(ok('late')), 40)));
  await assert.rejects(b.call('slow', [], { timeoutMs: 5 }), e => e.code === 'TIMEOUT');
  assert.equal(await b.call('slow', [], { write: true, timeoutMs: 5 }), 'late');
  assert.equal(await b.write('slow', []), 'late');
});

test('a newer read of the same key supersedes the older response', async () => {
  const b = bridge(), resolvers = [];
  b.useTransport(() => new Promise(resolve => resolvers.push(resolve)));
  const first = b.read('view', 'm', []), second = b.read('view', 'm', []);
  resolvers[1](ok('new')); resolvers[0](ok('old'));
  await assert.rejects(first, e => e.superseded === true && e.code === 'SUPERSEDED');
  assert.equal(await second, 'new');
  const other = b.read('other', 'm', []);
  resolvers[2](ok('independent'));
  assert.equal(await other, 'independent');
});

test('a superseded read that fails is also reported as superseded, not as an error', async () => {
  const b = bridge(), resolvers = [];
  b.useTransport(() => new Promise(resolve => resolvers.push(resolve)));
  const first = b.read('view', 'm', []);
  b.read('view', 'm', []).catch(() => {});
  resolvers[0](fail('INTERNAL', 'boom'));
  await assert.rejects(first, e => e.superseded === true);
});

test('identical in-flight writes are sent once; different or later writes are sent again', async () => {
  const b = bridge(), sent = [], resolvers = [];
  b.useTransport((method, args) => new Promise(resolve => { sent.push([method, args]); resolvers.push(resolve); }));
  const a = b.write('save', ['T1', 'Approved']), same = b.write('save', ['T1', 'Approved']), other = b.write('save', ['T2', 'Approved']);
  assert.equal(a, same);
  assert.equal(sent.length, 2);
  resolvers[0](ok(1)); resolvers[1](ok(2));
  assert.deepEqual([await a, await other], [1, 2]);
  const again = b.write('save', ['T1', 'Approved']);
  resolvers[2](ok(3));
  assert.equal(await again, 3);
  assert.equal(sent.length, 3);
});

test('a failed write can be retried (in-flight record is cleared)', async () => {
  const b = bridge();
  let n = 0;
  b.useTransport(async () => ++n === 1 ? fail('UNAVAILABLE', 'try later') : ok('saved'));
  await assert.rejects(b.write('save', ['x']), e => e.code === 'UNAVAILABLE');
  assert.equal(await b.write('save', ['x']), 'saved');
});

test('the default transport uses the instrumented runner and reports transport failures', async () => {
  const b = bridge(), calls = [];
  const runner = () => {
    const chain = {};
    const proxy = new Proxy(chain, { get: (t, key) => key === 'withSuccessHandler' ? fn => { t.s = fn; return proxy; } : key === 'withFailureHandler' ? fn => { t.f = fn; return proxy; }
      : (...args) => { calls.push([key, args]); key === 'works' ? t.s(ok('fine')) : t.f({ message: 'RPC down' }); } });
    return proxy;
  };
  b.useRunner(runner);
  assert.equal(await b.call('works', ['a']), 'fine');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['works', ['a']]]);
  await assert.rejects(b.call('broken'), e => e.code === 'TRANSPORT' && e.message === 'RPC down');
});

test('fixture transport serves DTOs and function fixtures without a server', async () => {
  const b = bridge();
  b.useFixtures({ list: { teams: [] }, echo: x => ({ x }) });
  assert.deepEqual(JSON.parse(JSON.stringify(await b.call('list'))), { teams: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(await b.call('echo', [7]))), { x: 7 });
  await assert.rejects(b.call('missing'), e => /No fixture/.test(e.message));
});
