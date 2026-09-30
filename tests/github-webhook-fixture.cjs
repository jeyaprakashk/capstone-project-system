const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {weeklyFixture} = require('./weekly-progress-fixture.cjs');
const sha = n => n.toString(16).padStart(40, '0');
const restCommit = n => ({sha: sha(n), author: {id: 101, login: 'alice'},
  commit: {message: 'Work ' + n + '\nDetails', committer: {date: '2026-01-01T12:00:00Z'}}});
const push = (ids = [1]) => ({repository: {full_name: 'ece-kalasalingam/team.repo', name: 'team.repo', owner: {login: 'ece-kalasalingam'}},
  ref: 'refs/heads/main', deleted: false, commits: ids.map(n => ({id: sha(n), message: 'Work ' + n,
    timestamp: '2025-12-31T12:00:00Z', author: {name: 'Git name', email: 'private@example.com', username: 'alice'}})),
  sender: {id: 999}, pusher: {name: 'someone-else'}});
function receiverFixture() {
  const f = weeklyFixture(), calls = [], logs = [];
  f.sheet('Commits', [f.sheets.get('Commits').rows[0].slice()]);
  f.set('Repo URL', 'https://github.com/ECE-KALASALINGAM/team.repo.git');
  f.properties.set('APPS_SCRIPT_RELAY_SECRET', 'relay-secret');
  f.properties.set('GITHUB_ADMIN_TOKEN', 'existing-admin-token');
  f.c.Logger = {log: value => logs.push(value)};
  f.c.Utilities.Charset = {UTF_8: 'UTF-8'};
  f.c.Utilities.computeHmacSha256Signature = (message, secret) =>
    Array.from(crypto.createHmac('sha256', secret).update(message).digest(), byte => byte > 127 ? byte - 256 : byte);
  f.c.ContentService = {MimeType: {JSON: 'application/json'}, createTextOutput: text => ({text, setMimeType() { return this; }})};
  for (const file of ['github-provisioning.js', 'github-webhook.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), f.c, {filename: file});
  let response = url => ({status: 200, body: url.includes('/commits?') ? [restCommit(1)] : restCommit(parseInt(url.split('/').at(-1), 16))});
  f.c.UrlFetchApp = {fetch(url, options) {
    assert.equal(f.locked(), false, 'GitHub API must run outside script lock');
    calls.push({url, options});
    const result = response(url);
    return {getResponseCode: () => result.status, getContentText: () => JSON.stringify(result.body)};
  }};
  function request(payload = push(), overrides = {}, secret = 'relay-secret') {
    const message = JSON.stringify({version: 1, event: 'push', deliveryId: 'delivery-1', sentAt: f.c.Date.now(), payload: JSON.stringify(payload), ...overrides});
    return {pathInfo: 'github-push', postData: {contents: JSON.stringify({message,
      signature: crypto.createHmac('sha256', secret).update(message).digest('hex')})}};
  }
  return {...f, calls, logs, request, response: fn => { response = fn; },
    receive: event => JSON.parse(f.c.doPost(event || request()).text), rows: () => f.sheets.get('Commits').rows};
}
module.exports = {receiverFixture, push, restCommit, sha};
