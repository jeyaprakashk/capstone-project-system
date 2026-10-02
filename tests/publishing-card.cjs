// The System Status publishing card is rendered by the real view; tests reuse it as their DOM shell.
const fs = require('node:fs');
const vm = require('node:vm');
function publishingCardMarkup(c, key) {
  if (!c.systemStatusViewBrowser_) vm.runInContext(fs.readFileSync('system-status-view.js', 'utf8'), c);
  const ui = { renderIcon: (name, label) => c.renderLucideIcon_(name, label), renderSkeleton: (variant, label) => c.getSkeletonMarkup_(variant, label) };
  const view = c.systemStatusViewBrowser_(null, () => ui, () => null);
  return view.publishingCard({ key, title: c.internalPublishingConfig_(key).title });
}
module.exports = { publishingCardMarkup };
