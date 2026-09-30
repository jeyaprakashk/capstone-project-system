const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {receiverFixture, push} = require('./github-webhook-fixture.cjs');
const workerPromise = import('../workers/github-webhook/worker.mjs').then(module => module.default);
const env = {GITHUB_WEBHOOK_SECRET: 'github-secret', APPS_SCRIPT_RELAY_SECRET: 'relay-secret',
  APPS_SCRIPT_WEBHOOK_URL: 'https://script.google.com/macros/s/test-deployment/exec/github-push'};
function request(body = JSON.stringify(push()), event = 'push', signature) {
  return new Request('https://relay.workers.dev/github/push', {method: 'POST', body, headers: {
    'Content-Type': 'application/json', 'X-GitHub-Event': event, 'X-GitHub-Delivery': 'delivery-1',
    'X-Hub-Signature-256': signature ?? 'sha256=' + crypto.createHmac('sha256', env.GITHUB_WEBHOOK_SECRET).update(body).digest('hex')
  }});
}
async function invoke(req, settings = env) {
  const waits = [];
  const response = await (await workerPromise).fetch(req, settings, {waitUntil: promise => waits.push(promise)});
  return {response, waits};
}

test('Worker verifies original Unicode bytes and sends an envelope accepted by Apps Script', async t => {
  const f = receiverFixture();
  f.time(new Date().toISOString());
  const payload = push();
  payload.commits[0].message = 'தமிழ் — work';
  const raw = JSON.stringify(payload, null, 2);
  let forwarded;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    forwarded = options;
    assert.equal(url, env.APPS_SCRIPT_WEBHOOK_URL);
    const envelope = JSON.parse(options.body);
    assert.equal(JSON.parse(envelope.message).payload, raw);
    assert.equal(options.redirect, 'follow');
    assert(!options.body.includes(env.APPS_SCRIPT_RELAY_SECRET));
    return Response.json(f.receive({pathInfo: 'github-push', postData: {contents: options.body}}));
  });
  const {response, waits} = await invoke(request(raw));
  assert.equal(response.status, 202);
  assert.equal(waits.length, 1);
  await Promise.all(waits);
  assert(forwarded);
  assert.equal(f.rows().length, 2);
});

test('Worker rejects invalid/missing signatures and malformed JSON without forwarding', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw Error('Must not forward'); });
  for (const signature of ['', 'sha1=abc', 'sha256=' + '0'.repeat(64), 'sha256=xyz']) {
    const result = await invoke(request(undefined, 'push', signature));
    assert.equal(result.response.status, 401);
    assert.equal(result.waits.length, 0);
  }
  const result = await invoke(request('{'));
  assert.equal(result.response.status, 400);
  assert.equal(fetch.mock.callCount(), 0);
});

test('Worker acknowledges authenticated ping and ignores non-push events', async () => {
  for (const [event, status] of [['ping', 200], ['issues', 204]]) {
    const result = await invoke(request('{}', event));
    assert.equal(result.response.status, status);
    assert.equal(result.waits.length, 0);
  }
  assert.equal((await invoke(request('{}', 'ping', 'bad'))).response.status, 401);
});

test('Worker acknowledges before background forwarding completes', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  t.mock.method(globalThis, 'fetch', () => pending);
  const result = await invoke(request());
  assert.equal(result.response.status, 202);
  finish(Response.json({ok: true}));
  await Promise.all(result.waits);
});

test('Worker logs sanitized HTTP, JSON, application and network failures without retries', async t => {
  const logs = [];
  t.mock.method(console, 'error', value => logs.push(JSON.parse(value)));
  let mode, calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (mode === 'network') throw Error('secret private upstream details');
    if (mode === 'http') return new Response('private', {status: 403});
    if (mode === 'json') return new Response('<html>Login</html>');
    return Response.json({ok: false, code: 'private details'});
  });
  for (mode of ['network', 'http', 'json', 'application']) {
    const result = await invoke(request());
    assert.equal(result.response.status, 202);
    await Promise.all(result.waits);
  }
  assert.equal(calls, 4);
  assert.deepEqual(logs.map(log => log.reason), ['forward_failed', 'http_403', 'invalid_response', 'receiver_rejected']);
  assert(logs.every(log => log.deliveryId === 'delivery-1'));
  assert(!JSON.stringify(logs).includes('private'));
});

test('Worker timeout logs once and clears its timer', async t => {
  let expire, cleared = false;
  const logs = [];
  t.mock.method(console, 'error', value => logs.push(JSON.parse(value)));
  t.mock.method(globalThis, 'setTimeout', (callback, milliseconds) => {
    assert.equal(milliseconds, 25000); expire = callback; return 123;
  });
  t.mock.method(globalThis, 'clearTimeout', timer => { assert.equal(timer, 123); cleared = true; });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    expire();
    assert.equal(options.signal.aborted, true);
    throw Error('Aborted');
  });
  const result = await invoke(request());
  await Promise.all(result.waits);
  assert.equal(logs[0].reason, 'timeout');
  assert.equal(cleared, true);
});

test('Worker restricts routes/methods and fails closed on missing configuration', async () => {
  assert.equal((await invoke(new Request('https://relay.workers.dev/'))).response.status, 404);
  assert.equal((await invoke(new Request('https://relay.workers.dev/github/push'))).response.status, 405);
  for (const key of Object.keys(env)) {
    const result = await invoke(request(), {...env, [key]: ''});
    assert.equal(result.response.status, 503);
    assert.equal(result.waits.length, 0);
  }
  assert.equal((await invoke(request(), {...env, APPS_SCRIPT_WEBHOOK_URL: 'https://untrusted.example/'})).response.status, 503);
});
