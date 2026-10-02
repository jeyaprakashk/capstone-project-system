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

Tailwind is the only styling system. `scripts/tailwind-input.css` is the single source:
design tokens in `@theme` (colours, type scale, radii, shadows), shared components in
`@layer components`, and the functional rules the dashboard scripts rely on (visibility
toggles, loading overlay, drawers). `npm run build:tailwind` compiles it, plus every
utility used in the root `.js` files, into the committed `tailwind-styles.html`
(no runtime CDN); `npm run check:tailwind` verifies it is current. Rebuild after adding
or removing any class. Do not add inline `<style>` blocks or hand-written CSS files.

- New views use Tailwind utilities directly, with theme tokens (`bg-primary`, `text-muted`,
  `rounded-card`, `border-edge`).
- Remaining server-built markup (Student, Coordinator, announcements, drawers) still uses
  the shared component classes (`btn`, `card`, `badge`, `table`, ...); inline them as
  utilities when that dashboard moves to a DTO view.
- Do not put a display utility (`flex`, `grid`, ...) on an element scripts toggle with `hidden`.
- No preflight: the base rules in the input file are the dashboard's reset.

Migrated so far: **Coordinator dashboard tab** (`coordinator-api.js`, `coordinator-view.js`) and **System Status frame** (`system-status-view.js`; the cards' own checks and the team drawer
are still driven by their legacy modules), **Reviewer** (`reviewer-api.js`, `reviewer-view.js`), **Student**
(`student-api.js`, `student-view.js`; its weekly-progress, assessment and GitHub-connection modules are
still legacy and attach to placeholders) and **Guide**
(`guide-api.js`, `guide-view.js`; the weekly-progress and evaluation panels inside it are
still legacy modules and attach to the view through its `data-guide-*` markup). Shared pieces:
`api-envelope.js` (server) and `data-bridge-client.js` (browser).

## Loading and refresh

Follow [LOADING-UI.md](LOADING-UI.md): preserve existing content on a failed
refresh and settle loading on every path. This lives in the bridge, not in views.

## Tests

`npm test` runs everything; `npm run test:migration` runs the bridge, view and DTO tests. Known baseline failures at Version 127, unrelated to
this migration: 7 tests in `tests/team-github-setup.test.cjs`. Do not hide them;
fix them separately. No other test may regress.
