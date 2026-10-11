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

/**
 * Compares a result of the TitleLog readers with a golden master captured from the old model. `translate(entry, id)` rewrites each
 * recorded entry into the form the new readers produce (for example the old status text into "approved or not"), so the comparison is
 * still against what the old code did, and the snapshot file itself is never regenerated.
 */
function expectBaselineAs(name, actual, translate) {
  const file = snapshotPath(name);
  assert.ok(fs.existsSync(file), 'Missing title baseline ' + name);
  const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
  const expected = Object.fromEntries(Object.entries(recorded).map(([id, entry]) => [id, translate(entry, id)]));
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, 'Title baseline ' + name + ': the TitleLog readers must give the old downstream result.');
}

module.exports = {expectBaseline, expectBaselineAs, snapshotPath};
