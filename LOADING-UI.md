# Loading and refresh behavior

Use the shared loading lifecycle for asynchronous reads throughout the project.
This applies to dashboards, cards, tables, drawers, evaluation results, and status
checks. Keep descriptive loading text in the loading state’s accessible label.

## Initial reads

Every loading state is the same spinner (the `getSkeletonMarkup_` name is historical). Variants only
set the room it holds; do not add shimmer bars, skeleton lines or a second animation.
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
with the shared spinner, retains the content's height and event handlers, sets
`aria-busy`, and makes the covered children inert. Short content uses the inline
spinner. A zero-height target (such as a hidden tab being preloaded) uses the panel
spinner, so revealing the tab never leaves a tiny spinner in a large area.
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
action and result messages, shown with the same spinner. Their subsequent data reads follow this convention.

## One shared helper: `DashboardUI.busy`

`busy-state.js` is the only place pages handle "in progress". Views get it through
`getUi().busy` (or `DashboardUI.busy` in plain modules); do not write your own
spinner, `aria-busy` toggling or "Saving…" text.

- `busy.read(target, label, options)` is `beginContentLoading` for reads. Returns `finish()`.
- `busy.write(statusElement, label, triggersToDisable)` is for saves, submits, publishes and setup
  actions. It shows the spinner and label, disables the triggers and returns `done(text)`, which
  restores them and replaces the spinner with the result text (`done()` just clears it). The helper
  keeps no state: each page keeps its own double-submit guard.
- `busy.mark(element, boolean)` is the only code that sets `aria-busy`.

`tests/busy-state.test.cjs` fails when another file sets `aria-busy` or writes its own in-progress text.

Verify success, failure, retry, and duplicate-request behavior when changing a
loader. Run `npm test` and check keyboard interaction when a browser preview is available.
