# Loading and refresh behavior

Use the shared loading lifecycle for asynchronous reads throughout the project.
This applies to dashboards, cards, tables, drawers, evaluation results, and status
checks. Keep descriptive loading text in the loading state’s accessible label.

## Initial reads

Render `getSkeletonMarkup_(variant, label)` on the server, or
`DashboardUI.renderSkeleton(variant, label)` in browser modules. Use `panel` for
content, `drawer` for drawers, `inline` for small values/buttons/status checks,
and `timeline` for the shared timeline. Retry states must show a skeleton again.
Use `status` for a compact, left-aligned two-line readiness section. For its
refresh, pass `{compact:true, variant:'status'}` to `beginContentLoading` to
avoid retaining empty space from setup actions.

## Refreshing existing content

For tabs with a refresh action, the view renders its own header with a
`data-refresh-button` and a `data-action="refresh"` (the System Status header is part of the
static shell and uses `data-shell-refresh`). Update the timestamp only after a successful read.

Use `DashboardUI.beginContentLoading(element, label)`. It covers the existing DOM
with the shared skeleton, retains the content's height and event handlers, sets
`aria-busy`, and makes the covered children inert. Short content uses an inline
skeleton. A zero-height target (such as a hidden tab being preloaded) uses a panel
skeleton, so revealing the tab never leaves a single inline bar in a large area.
The returned cleanup function is safe to call more than once.

For reviewer and student dashboard refreshes (including the read after GitHub username submission), and student assessment reads, pass `{compact:true}` as the third
argument to use the initial panel skeleton height. This temporarily removes the
covered children from layout while retaining their DOM and event handlers;
cleanup restores them on failure or before replacing the content on success.

```js
if (busy) return;
busy = true;
const finishLoading = DashboardUI.beginContentLoading(host, 'Refreshing results');
rpc('loadResults', [], result => {
  finishLoading();
  busy = false;
  renderResults(result);
}, error => {
  finishLoading();
  busy = false;
  // Keep existing results and show an error with a retry action nearby.
  showRefreshError(error);
});
```

Finish loading on both success and failure, before replacing the host's content.
Guard duplicate requests and ignore responses for a superseded screen. Disable
the refresh trigger while pending and restore its label and enabled state when
settled. Keep successful content on refresh failure; show a readable error and
retry path. Do not overwrite unsaved form input as part of a background refresh.

The loading state’s presentation lives in the Tailwind source (`scripts/tailwind-input.css`).

Mutation actions such as Save, Submit, Publish, and Sync retain their explicit
action and result messages. Their subsequent data reads follow this convention.

Verify success, failure, retry, and duplicate-request behavior when changing a
loader. Run `npm test` and check keyboard interaction when a browser preview is available.
