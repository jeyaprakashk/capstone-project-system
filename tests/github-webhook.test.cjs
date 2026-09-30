const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {receiverFixture, push, restCommit, sha} = require('./github-webhook-fixture.cjs');

test('registered push hydrates absent author ID and preserves existing schema and normalization', () => {
  const f = receiverFixture(), headers = f.rows()[0].slice();
  f.response(() => ({status: 200, body: {...restCommit(1), commit: {...restCommit(1).commit, message: '=formula\nsecond line'}}}));
  const result = f.receive();
  assert.equal(result.count, 1);
  assert.deepEqual(f.rows()[0], headers);
  const row = f.rows()[1];
  assert.equal(row.length, 7);
  assert.equal(row[0].toISOString(), '2026-01-01T12:00:00.000Z');
  assert.deepEqual(row.slice(1), ['T1', '=formula', 'alice', 'https://github.com/ECE-KALASALINGAM/team.repo.git', sha(1), '101']);
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /\/repos\/ece-kalasalingam\/team\.repo\/commits\/[0-9a-f]{40}$/);
  assert.equal(f.calls[0].options.headers.Authorization, 'token existing-admin-token');
  assert.equal(f.locked(), false);
});

test('unlinked authors require REST confirmation and preserve unknown/blank attribution', () => {
  const f = receiverFixture();
  f.response(() => ({status: 200, body: {...restCommit(1), author: null}}));
  assert.equal(f.receive().count, 1);
  assert.equal(f.rows()[1][3], '(unknown)');
  assert.equal(f.rows()[1][6], '');
});

test('relay rejects bad secrets, tampering, malformed envelopes and expired/future timestamps before I/O', () => {
  const f = receiverFixture();
  for (const event of [f.request(push(), {}, 'wrong'), f.request(push(), {event: 'ping'}),
    f.request(push(), {version: 2}), f.request(push(), {sentAt: f.c.Date.now() - 300001}),
    f.request(push(), {sentAt: f.c.Date.now() + 60001}), f.request(push(), {payload: '{'}),
    {pathInfo: 'github-push', postData: {contents: '{'}}, {pathInfo: 'other'}, undefined]) {
    const value = JSON.parse(f.c.doPost(event).text);
    assert.equal(value.ok, false);
  }
  const event = f.request(), envelope = JSON.parse(event.postData.contents);
  envelope.message += ' ';
  event.postData.contents = JSON.stringify(envelope);
  assert.equal(f.receive(event).code, 'UNAUTHORIZED');
  f.properties.delete('APPS_SCRIPT_RELAY_SECRET');
  assert.equal(f.receive().code, 'RELAY_NOT_CONFIGURED');
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows().length, 1);
});

test('unrelated organization repositories and other owners are silently ignored', () => {
  const f = receiverFixture();
  for (const [owner, name] of [['ece-kalasalingam', 'unrelated'], ['other-org', 'team.repo']]) {
    const payload = push();
    payload.repository = {full_name: owner + '/' + name, name, owner: {login: owner}};
    assert.deepEqual(f.receive(f.request(payload)), {ok: true, status: 'ignored'});
  }
  assert.equal(f.logs.length, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows().length, 1);
});

test('duplicate repository rows and conflicting duplicate team mappings fail closed', () => {
  for (const kind of ['same-team', 'different-team', 'different-repository']) {
    const f = receiverFixture(), duplicate = f.status.rows[1].slice();
    if (kind === 'different-team') duplicate[f.ts.indexOf('Team ID')] = 'T2';
    if (kind === 'different-repository') duplicate[f.ts.indexOf('Repo URL')] = 'https://github.com/ece-kalasalingam/other';
    f.status.rows.push(duplicate);
    assert.equal(f.receive().code, 'AMBIGUOUS_REGISTRATION');
    assert.equal(f.calls.length, 0);
    assert.equal(f.rows().length, 1);
    assert(f.logs.some(log => log.includes('AMBIGUOUS_REGISTRATION')));
  }
});

test('empty/deletion pushes do nothing; malformed pushes fail before API or append', () => {
  const f = receiverFixture();
  assert.equal(f.receive(f.request(push([]))).status, 'noop');
  assert.equal(f.receive(f.request({...push([]), deleted: true})).status, 'noop');
  for (const payload of [null, {}, {...push(), commits: null}, {...push(), deleted: 'false'},
    {...push(), commits: [{id: 'bad', message: 'x'}]}, {...push(), commits: [{id: sha(1)}]}, {...push(), ref: 'main'}]) {
    assert.equal(f.receive(f.request(payload)).code, 'INVALID_PUSH');
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.rows().length, 1);
});

test('redelivery and duplicate payload SHAs do not hydrate or append twice', () => {
  const f = receiverFixture();
  assert.equal(f.receive(f.request(push([1, 1]))).count, 1);
  assert.equal(f.receive().count, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.rows().length, 2);
});

test('webhook and daily fetch deduplicate in either order without altering collection status on push', () => {
  for (const webhookFirst of [true, false]) {
    const f = receiverFixture(), status = JSON.stringify(f.sheets.get('CommitCollectionStatus').rows);
    if (webhookFirst) {
      assert.equal(f.receive().count, 1);
      assert.equal(JSON.stringify(f.sheets.get('CommitCollectionStatus').rows), status);
      assert.equal(f.c.fetchAllCommits()[0].count, 0);
    } else {
      assert.equal(f.c.fetchAllCommits()[0].count, 1);
      const calls = f.calls.length;
      assert.equal(f.receive().count, 0);
      assert.equal(f.calls.length, calls);
    }
    assert.equal(f.rows().length, 2);
  }
});

test('competing append after hydration is seen by the unchanged locked writer', () => {
  const f = receiverFixture();
  let held = false;
  f.c.LockService = {getScriptLock: () => ({waitLock() {
    held = true;
    f.rows().push([new Date(), 'T1', 'concurrent', 'alice', 'https://github.com/ece-kalasalingam/team.repo', sha(1), '101']);
  }, releaseLock() { held = false; }})};
  assert.equal(f.receive().count, 0);
  assert.equal(f.rows().length, 2);
  assert.equal(held, false);
});

test('API failure, missing identity, mismatched SHA or invalid commit data never partially append', () => {
  for (const invalid of [{status: 403, body: {}}, {status: 200, body: restCommit(3)},
    {status: 200, body: {...restCommit(2), author: undefined}}, {status: 200, body: {...restCommit(2), author: {login: 'alice'}}},
    {status: 200, body: {...restCommit(2), commit: {message: 'x', committer: {date: 'bad'}}}}]) {
    const f = receiverFixture();
    f.response(url => url.endsWith(sha(1)) ? {status: 200, body: restCommit(1)} : invalid);
    assert.equal(f.receive(f.request(push([1, 2]))).ok, false);
    assert.equal(f.rows().length, 1);
    assert.equal(f.locked(), false);
  }
});

test('POST module leaves the existing GET entrypoint intact', () => {
  const f = receiverFixture();
  vm.runInContext(fs.readFileSync('dashboard-router.js', 'utf8'), f.c);
  const doGet = f.c.doGet;
  vm.runInContext(fs.readFileSync('github-webhook.js', 'utf8'), f.c);
  assert.equal(f.c.doGet, doGet);
  const event = {parameter: {role: 'student'}};
  f.c.withDashboardRead_ = run => run();
  f.c.buildDashboardResponse_ = value => value;
  assert.equal(f.c.doGet(event), event);
});
