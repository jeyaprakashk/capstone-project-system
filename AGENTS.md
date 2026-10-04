# Project conventions

The dashboards are being migrated to a data-first architecture with Tailwind CSS.
Migrate one dashboard at a time. Never change workflow behaviour, academic rules
or spreadsheet data while doing so.

## Frozen — do not change

- Spreadsheet sheet names, headers, column layouts and stored data
  (`SHEET_NAMES`, `FIELD_DEFINITIONS`, fixed-layout journals and logs).
- Academic rules: Review rubrics, attendance/makeup policy, eligibility,
  deadlines, publishing, weights and prerequisites.
- Role detection and server-side authorization.

`tests/invariants/` guards these. `npm run test:invariants` must stay green and its
snapshots must not be regenerated for a migration. Regenerate (`UPDATE_GOLDEN=1`)
only for a deliberate, reviewed rule or schema change made outside a migration.

## Layers

1. **Server (Apps Script).** Reads and writes sheets, GitHub and mail. Returns JSON
   only: no HTML, inline styles, CSS classes or layout knowledge. Every endpoint
   re-checks authorization. Column mapping never leaves the server.
2. **Client data bridge.** The only caller of `google.script.run`. Wraps calls in
   promises, validates the response envelope, and owns loading, error, timeout and
   stale-response handling.
3. **Views.** Render DTO fields with Tailwind utility classes. They never call the
   server directly and never see spreadsheet columns. Escape every interpolated
   value; use `data-*` attributes and event delegation, not inline handlers.

DTO shapes and the response envelope are defined in [DATA-CONTRACTS.md](DATA-CONTRACTS.md).
Change a DTO only by updating that file, the endpoint, its contract test and the view together.

## Migrating a dashboard

1. Capture a golden master of the current server output for fixed fixtures.
2. Add the DTO endpoint beside the existing one; keep the old one until verified.
3. Render the view from the DTO through the bridge. Behaviour must be identical.
4. Compare the DTO against the golden master and rewrite that dashboard's UI tests.
5. Remove the old server HTML builder for that dashboard.

Writes are not timed out or auto-retried by the bridge, because an Apps Script call
cannot be cancelled and a retry could submit twice.

## Styling

Tailwind is the only styling system, and it is utilities only. `scripts/tailwind-input.css` holds
design tokens in `@theme`, a small `@layer base` reset (page defaults, `[hidden]`, touch targets)
and the keyframes. There is no component layer: dialogs, drawers, tabs, tables, loading overlays,
responsive menus, `details` open states, `:empty` hiding and container queries are written as
utility variants (`group-open:`, `empty:hidden`, `max-[1200px]:`, `@max-[480px]/rubrics:`,
`[&::-webkit-details-marker]:hidden`). Classes a script adds at runtime are string constants in
the module, so the build still sees them. Hook classes (`review-*`, `role-panel`, `timeline-stop`,
...) only mark elements and carry no styles. `npm run build:tailwind` compiles the input plus every
utility used in the root `.js` files into the committed `tailwind-styles.html` (no runtime CDN);
`npm run check:tailwind` verifies it is current. Rebuild after adding
or removing any class. Do not add inline `<style>` blocks or hand-written CSS files.

- New views use Tailwind utilities directly, with theme tokens (`bg-primary`, `text-muted`,
  `rounded-card`, `border-edge`).
- Views, dialogs, drawers, tabs, tables and pagination all use utilities; there are no `btn`,
  `card`, `badge`, `table`, `modal` or `drawer` component classes. Repeated strings live in
  constants inside the module that renders them.
- Interaction uses delegated listeners and `data-*` hooks. Markup has no inline `on*` handlers and
  modules do not assign per-element `onclick`/`onchange`; each host gets one delegated listener.
  Tests should find elements through `data-*` hooks, not styling classes.
- Do not put a display utility (`flex`, `grid`, ...) on an element scripts toggle with `hidden`.
- No preflight: the base rules in the input file are the dashboard's reset.

Every dashboard, panel and card reads and writes through the bridge; no module calls
`google.script.run` directly. Endpoints and DTOs are listed in [DATA-CONTRACTS.md](DATA-CONTRACTS.md):
Reviewer, Guide, Student and Coordinator dashboards; the Review marking drawer; Guide
Evaluation; weekly progress; published results; the System Status frame, card actions and
weekly setup; publication cards; the student GitHub connection; the Timeline and Rubrics tabs;
and the team drawer. Shared pieces: `api-envelope.js` (server) and `data-bridge-client.js` (browser).

Browser modules are serialized into the shell by `getMigratedViewsClientScript_()` in
`data-bridge-client.js`; a new module must be registered there and its test file added to the
`test` and `test:migration` scripts in `package.json` (an unlisted test file never runs). `DashboardUI`
(`dashboard-client-scripts.js`) only owns role loading, the shell, the shared drawers and the loading
overlay; screens, card actions and flows live in their own module (for example `team-drawer-view.js`,
`shared-timeline-view.js`, `shared-rubrics-view.js`, `system-status-actions.js`,
`student-github-actions.js`, `assessment-history-view.js`).

## Public surface

Any top-level Apps Script function whose name does not end in `_` can be called by name from the
browser, whoever the user is. Name every server function with a trailing underscore. The only public
functions are `doGet`, the `API_*` endpoints, and the trigger or editor-run entry points listed in
`tests/entry-point-guard.test.cjs`; each of those starts with `requireTriggerOrOperator_()` or checks the
coordinator itself. That test fails when a new public function appears.

## Loading and refresh

Follow [LOADING-UI.md](LOADING-UI.md): preserve existing content on a failed
refresh and settle loading on every path. This lives in the bridge, not in views.

## Tests

`npm test` runs everything; `npm run test:migration` runs the bridge, view and DTO tests. All tests pass (the 7
`tests/team-github-setup.test.cjs` failures recorded at Version 127 no longer occur); no test may regress. A test file
that is not listed in the `test` script in `package.json` never runs.
