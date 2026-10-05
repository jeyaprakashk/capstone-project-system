const fs = require('node:fs');
const vm = require('node:vm');
// The real shared in-progress helper (busy-state.js) for tests that mock DashboardUI.
module.exports = function busyFixture(renderSkeleton, beginContentLoading) {
  const factory = vm.runInNewContext(fs.readFileSync('busy-state.js', 'utf8') + ';busyStateBrowser_');
  return factory(renderSkeleton || ((variant, label) => '<span data-skeleton>' + label + '</span>'), beginContentLoading || (() => () => {}));
};
