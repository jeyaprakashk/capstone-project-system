// The publishing card is rendered by the real Coordinator view; tests reuse it as their DOM shell.
const fs = require('node:fs');
const vm = require('node:vm');
function publishingCardMarkup(c, key) {
  if (!c.coordinatorViewBrowser_) for (const file of ['shared-table.js', 'coordinator-view.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  const ui = { renderIcon: (name, label, extra) => c.renderLucideIcon_(name, label, extra), renderSkeleton: (variant, label) => c.getSkeletonMarkup_(variant, label) };
  const view = c.coordinatorViewBrowser_(null, () => ui, () => null, () => null, c.sharedTableBrowser_(), () => null);
  return view.publishingCard({ key, title: c.internalPublishingConfig_(key).title });
}
module.exports = { publishingCardMarkup };
