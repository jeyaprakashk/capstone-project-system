// Golden masters for Phase 0. They record what today's code does for every title state, so that later phases (the TitleLog gate) can
// be compared with them. Regenerate only for a deliberate, reviewed change to a rule that is meant to differ:
//   UPDATE_TITLE_BASELINE=1 node --test tests/title-baseline.test.cjs
// Never regenerate to make a migration pass; that is what the snapshots exist to catch. (tests/invariants has its own snapshots.)
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function snapshotPath(name) { return path.join(__dirname, 'snapshots', name + '.json'); }

function expectBaseline(name, actual) {
  const file = snapshotPath(name);
  const text = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_TITLE_BASELINE === '1') {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
    return;
  }
  assert.ok(fs.existsSync(file), 'Missing title baseline ' + name + '; capture it once with UPDATE_TITLE_BASELINE=1 from the unchanged code.');
  assert.deepEqual(JSON.parse(text), JSON.parse(fs.readFileSync(file, 'utf8')), 'Title baseline ' + name + ' changed; the downstream result for a title state must not change.');
}

module.exports = {expectBaseline, snapshotPath};
