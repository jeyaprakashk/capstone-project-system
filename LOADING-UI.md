# Loading and refresh behavior

Use the shared skeleton treatment for asynchronous reads throughout the project.
This applies to dashboards, cards, tables, drawers, evaluation results, and status
checks. Do not introduce visible “Loading…” / “Refreshing…” text or a separate
spinner design. Keep descriptive loading text in the skeleton's accessible label.

## Initial reads

Render `getSkeletonMarkup_(variant, label)` on the server, or
`DashboardUI.renderSkeleton(variant, label)` in browser modules. Use `panel` for
content, `drawer` for drawers, `inline` for small values/buttons/status checks,
and `timeline` for the shared timeline. Retry states must show a skeleton again.
Use `status` for a compact, left-aligned two-line readiness section. For its
refresh, pass `{compact:true, variant:'status'}` to `beginContentLoading` to
avoid retaining empty space from setup actions.

## Refreshing existing content

For tabs with a refresh action, render the header with
`buildTabHeader_(title, key, action, updated)`; role dashboards use
`buildDashboardContainerHeader_(title, key)`. The shared `tab-header` and
`tab-refresh-btn` styles provide the heading, timestamp beneath it, text Refresh
button on the same row, and bottom divider. Keep button text, size, colors, and
spacing in these common styles rather than adding tab-specific overrides. Pass
the tab's own refresh action and update its timestamp only after a successful read.
Refresh buttons use `app-btn btn-sm btn-secondary` from [BUTTON-UI.md](BUTTON-UI.md).

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

Loading styles belong in `getLoadingStyles_()` in `common-styles.js`. Reuse the
same animation and reduced-motion handling; use `--loading-surface` and existing
`--skeleton-*` variables for themed surfaces. Do not add feature-specific overlays.

Mutation actions such as Save, Submit, Publish, and Sync retain their explicit
action and result messages. Their subsequent data reads follow this convention.

Verify success, failure, retry, and duplicate-request behavior when changing a
loader. Run `npm test`; visually check preserved dimensions, keyboard interaction,
and reduced motion when a browser preview is available.
