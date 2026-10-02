// Golden-master helper. Run with UPDATE_GOLDEN=1 only for an intentional, reviewed change.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.join(__dirname, '..', '..');

function loadSources(files, globals = {}) {
  const context = vm.createContext({ console, ...globals });
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }));
  return context;
}
function expectGolden(name, actual) {
  const file = path.join(__dirname, 'snapshots', name + '.json');
  const text = JSON.stringify(actual, null, 2) + '\n';
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return;
  }
  assert.ok(fs.existsSync(file), 'Missing golden snapshot ' + name + '; run with UPDATE_GOLDEN=1 once.');
  assert.deepEqual(JSON.parse(text), JSON.parse(fs.readFileSync(file, 'utf8')), 'Snapshot ' + name + ' changed; spreadsheet layout or academic rules must not change.');
}
module.exports = { loadSources, expectGolden };
