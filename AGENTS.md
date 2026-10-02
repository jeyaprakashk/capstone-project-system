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
5. Remove the old server HTML builder and legacy styles for that dashboard.

Writes are not timed out or auto-retried by the bridge, because an Apps Script call
cannot be cancelled and a retry could submit twice.

## Loading and refresh

Follow [LOADING-UI.md](LOADING-UI.md): preserve existing content on a failed
refresh and settle loading on every path. This lives in the bridge, not in views.

## Legacy (until each dashboard is migrated)

[UI-STYLING.md](UI-STYLING.md), [STYLE-MIGRATION-EXCEPTIONS.md](STYLE-MIGRATION-EXCEPTIONS.md)
and `app-styles.html` still describe the not-yet-migrated dashboards. Do not use them
for migrated ones, and do not extend them. They are deleted in the final phase.

## Tests

`npm test` runs everything. Known baseline failures at Version 127, unrelated to
this migration: 7 tests in `tests/team-github-setup.test.cjs`. Do not hide them;
fix them separately. No other test may regress.
