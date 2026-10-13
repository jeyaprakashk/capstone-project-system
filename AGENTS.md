# Project conventions

The dashboards are being migrated to a data-first architecture with Tailwind CSS.
Migrate one dashboard at a time. Never change workflow behaviour, academic rules
or spreadsheet data while doing so.

## Frozen — do not change

- Spreadsheet sheet names, header text and stored data
  (`SHEET_NAMES`, `FIELD_DEFINITIONS`, journals and logs). No work renames a header, deletes a column or rewrites
  data. Column order is not a dependency: code finds columns by header name (see "Sheet access"), so a column may be
  moved or added by hand. Editor-run `ensureSheet_` may initialize an empty existing sheet or append missing headers
  during setup, under the "Creating and repairing sheets" rules below.
- Academic rules: Review rubrics, attendance/makeup policy, eligibility,
  deadlines, publishing, weights and the order of entry (see "Review entry" below for the rules that were
  deliberately moved out of code).
- Role detection and server-side authorization.

`tests/invariants/` guards these. `npm run test:invariants` must stay green and its
snapshots must not be regenerated for a migration. Regenerate (`UPDATE_GOLDEN=1`)
only for a deliberate, reviewed rule or schema change made outside a migration.

## Review entry

Whether a team's marks can be entered for a Review is decided by three things, all reviewed and approved as deliberate rule changes
(October 2026), not by prerequisite JSON or a title check in code:

- **Order: `Sequence`.** A Review opens for a team only after every other non-SEE assessment with a lower `Sequence` in
  `AssessmentDefinitions` is Submitted or Published for that team (`assessmentSequenceBlock_`; staff are exempt, equal sequences do not
  block each other). The `Prerequisites` header stays (header text is frozen) but its cells are not read.
- **Requirements: `ActivityDependencies` rows.** Each `REVIEW` assessment is an activity named by its Assessment ID (`review1`, ...).
  The rows for it (`title` / `approved`, `document` / `doc-NNNN`, `github` items) must all be met; the project title is one such row, not
  a check in code. A Review with no `title` row has no title requirement, so a new Review gets its rows when it is added. The gate applies
  to reading and to every save (`reviewEligibility_`); a Submitted or Published evaluation stays readable.
- **Documents: no hand-placed files (October 2026, owner-approved rule change).** A `document` requirement is met only by a journal status of
  APPROVED or REOPENED. A file in a team folder with no `DocumentSubmissions` row is `NOT_SUBMITTED`, whatever Drive holds, and a submit may
  overwrite it. The files that stood in the folders at go-live were recorded once (October 2026, 111 documents) as an ordinary SUBMIT
  and APPROVE pair with actor `baseline`; that one-time code has been run and deleted (Versions 202 and 203 hold it). A journal that begins with a `REOPEN`
  row is `UNAVAILABLE` like any other broken history (the owner checked the sheet: none exists).

- **Evidence: `ActivityEvidences` rows (October 2026, owner-approved rule change; archive/plans/EVIDENCE-PLAN.md).** A Review also needs, for each row
  `Activity ID` / `Evidence Folder` / `Minimum Files` that names it, at least that many evidence files of the team copied to Drive in that folder (the
  `EvidenceCopies` rows with a Drive file; the whole semester, no date window). It is evaluated by the activity engine beside the other requirements, so it
  applies to reading and to every save like them (`reviewEligibility_`). A Review with no row, and a workbook without the sheet, has no evidence
  requirement; a row that is not valid for its Review, or a sheet that cannot be read, denies; the title activities are never affected. Evidence never
  gates a document's approval or Submit.

Changing these rows or the Sequence values is a configuration change by the coordinator. Changing how they are evaluated is a rule
change and follows the paragraph above.

## Creating and repairing sheets

`ensureSheet_` (`ensure-sheet.js`) creates new catalog sheets and manages headers for sheets whose readers and writers use
header names. A sheet whose creating code runs in an editor-run setup uses it; creating code reached from a dashboard request
(the assessment journals, `AssessmentDefinitions`, `GuideSignoff`, `AIProgressAnalysis`) keeps its own creation path, because
setup mode never runs on a request. Every call names its `mode`.

- `mode: 'setup'` runs only in editor-run setup paths. It creates an absent sheet, writes the header row of an existing sheet
  that has no rows, and may append a missing header at the right end of an existing sheet. It never moves, renames or
  deletes a column and never writes a data row. It refuses, and changes nothing, when a header is missing together with an
  unrecognised one (a possible typo), when a required header is duplicated, or when there is a blank header cell or
  unlabelled content to the right of the last header.
- `mode: 'runtime'` is only for a sheet whose catalog entry has `createAtRuntime: true`. It creates an absent sheet (or writes
  the header row of an empty one) and validates the headers; it never repairs.
- Request paths never repair a header.
- New sheets are defined in the catalog (`sheet-columns.js`), not in `SHEET_NAMES` or `FIELD_DEFINITIONS`. `SHEETS.md` is
  generated from it with `npm run build:sheets-doc`.

## Sheet access

Every sheet is read and written by header name, so column order does not matter and an extra column is harmless. This includes
the master registry of the hub spreadsheet (`readMasterRegistry_`), which is read only.

- Reach a sheet field through a column map built from the header row (`getColumnMap_`, `buildColumnMap_`, or the sheet's own
  `...Columns_` function). Never use a number as a row index or a `getRange` column. Header comparison is `textEquals_`
  (trimmed, case-insensitive).
- A missing required header throws, and so does a repeated one; the error names the sheet and the header. Extra columns are
  ignored. A request never repairs, adds or moves a header (see "Creating and repairing sheets").
- One logical write is one write call over the span from the leftmost to the rightmost mapped column (`writeRecordSpan_`);
  columns outside the span are never touched. A cell inside the span that the code does not map keeps its value, so a formula
  typed into such a cell would be turned into its value: do not put formulas in unmapped cells of a written row.
- Side-effect order (write, flush, delete a property, send) is the same as before a sheet was migrated.
- A new sheet gets its headers in definition order, from the catalog.
- Proof, not just search: each sheet has tests that run the real code on shuffled columns (`tests/shuffled-columns.test.cjs`
  and the sheet's own tests), a missing-header test and a duplicate-header test. `tests/sheet-position-guard.test.cjs` searches
  every module for a number used as a sheet index, and the catalog audit in `tests/sheet-catalog.test.cjs` checks the functions
  listed for each `migrated` sheet in `sheet-columns.js`. The search cannot see a number held in a variable; the shuffled
  tests do.
- Renaming a header is still a code change, reviewed like a schema change, with its snapshot update.

## Project titles

The project title and problem statement are not stored in TeamStatus any more. They live in the `TitleLog` sheet, an append-only
history (one row per change, the latest row of a team is its state). Specified in [TITLE-REVISION-PLAN.md](archive/plans/TITLE-REVISION-PLAN.md).

- **Read** a team's title only through `titleGate_(teamId)` (approved or not, and the title and problem in effect), or
  `titleSummary_` / `titleStateFromIndex_` when a screen needs the workflow state. Read the log once with `readTitleIndex_()` and pass
  the index for a list of teams. Never read the old title columns; `tests/title-removal.test.cjs` fails when a runtime module does.
- **Write** only through `titleWrite_` (`title-write.js`): one path, one lock, a request ID and the
  revision the user saw. Endpoints (`title-api.js`) resolve who the caller is and pass callbacks; the rules are
  in `title-service.js` and the history validation in `title-history.js`. A row is appended and never edited.
- **Requirements** that gate a student action come from the `ActivityDependencies` sheet through the engine (`activity-engine.js`, the
  `github`, `drive`, `document` and `title` checks; `document` takes a Document ID from the scanned template list as its item). Misconfiguration denies; nothing is cached between requests; a student never sees a check's `diagnostic`.
- **Students and Drive.** The team folders live in a shared drive that students are **not members of**. Each team's students are given
  viewer access to **their own team's folder only** (`createTeamFolders_` adds them; nothing else does). Nothing in a team folder may be
  hidden from them: what the app chooses to link cannot limit what a folder viewer sees in Drive. **Evidence** (October 2026): the files of `2_Evidence/<folder>` of the team repository (never dot files or README files, at most 25 MB each) are
  copied by Submit, or by the student's *Copy evidence* button, into `evidences/<path>` in the team's Drive folder (`evidence.js`); a file is copied only when
  new or changed, a copy is never deleted, and the Documents DTO links each copied file individually. Which folder belongs to which document is the
  `EvidenceFolders` sheet. The Documents screen reads no GitHub for evidence: its counts come from `EvidenceStatus`, kept by the team-file scan, Copy
  evidence and Check for new evidence. The app never shows a student a folder
  link: no student DTO or student view carries `folderUrl`. The template-document submission (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md) has shipped: the Documents DTO (`API_documents_get`) may carry the
  link of a file of the student's own team, and nothing else; every other student DTO carries no Drive link. Guides, reviewers and the coordinator get `folderUrl`.
  `tests/student-title.test.cjs` and `tests/student-migration.test.cjs` fail if a student receives a link they may not have.
- The browser sends title writes with a request ID from `TitleRequests` (`title-requests.js`) and the `revision` its DTO carried.
- There is no cutover switch any more: the `TITLE_CUTOVER` property and its editor functions were retired after the migration, and nothing
  reads it. A maintenance mode, when it is built, will be a separate feature. The one-time import of the old title columns into `TitleLog`
  has been run and its code deleted, so nothing reads the old columns any more.

## Layers

1. **Server (Apps Script).** Reads and writes sheets, GitHub and mail. Returns JSON
   only: no HTML, inline styles, CSS classes or layout knowledge. Every endpoint
   re-checks authorization. Column mapping never leaves the server, and server code reaches sheet fields through a column map
   built from header names (see "Sheet access").
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
- Workspace tab strips (Guide and Reviewer) come from `SharedTabs` (`shared-tabs.js`): its markup, classes,
  More sheet and WAI-ARIA Tabs keyboard handling. Views pass tab data and their own `data-*` hooks; they
  keep no tab classes or key handling of their own. Selection is `aria-selected`, never a class.
- No preflight: the base rules in the input file are the dashboard's reset.

Every dashboard, panel and card reads and writes through the bridge; no module calls
`google.script.run` directly. Endpoints and DTOs are listed in [DATA-CONTRACTS.md](DATA-CONTRACTS.md):
Reviewer, Guide, Student and Coordinator dashboards; the Review marking drawer; Guide
Evaluation; weekly progress; published results; the System Status frame, card actions and
weekly setup; publication cards; the student GitHub connection; the Timeline and Rubrics tabs;
and the team drawer. Shared pieces: `api-envelope.js` (server) and `data-bridge-client.js` (browser).

Browser modules are serialized into the shell by `getMigratedViewsClientScript_()` in
`data-bridge-client.js`, and `getDashboardPageScript_()` assembles the page script; a new module must be
registered there under the role that uses it (see Role bundles) and its test file added to the
`test` and `test:migration` scripts in `package.json` (an unlisted test file never runs). `DashboardUI`
(`dashboard-client-scripts.js`) only owns role loading, the shell, the shared drawers and the loading
overlay; screens, card actions and flows live in their own module (for example `team-drawer-view.js`,
`shared-timeline-view.js`, `shared-rubrics-view.js`, `system-status-actions.js`,
`student-github-actions.js`, `student-title.js`, `assessment-history-view.js`).

## Role bundles

Each page ships only the browser modules of the roles `doGet` detected for that user. A student-only
page is about 43 KB compressed instead of about 113 KB for all roles; on slow mobile data that saved
about 0.44 s per load (measured at Regular 3G).

- `getDashboardPageScript_(roles)` assembles the page: the shared modules (bridge, `SharedTabs`,
  `DashboardUI`, Timeline, Rubrics), each included role's modules, then `getDashboardStartScript_(roles)`, which
  registers only those roles and starts the dashboard last. Roles come from the server's role
  detection, never from the browser.
- `DashboardUI` owns generic UI interactions and never names a role's module. Role tabs register with
  `registerRole(key, {load, render, activate?})`; System Status registers with
  `registerUtility(key, {endpoints, load, render, rendered?})`, whose endpoints use the utility lane.
- Views receive their role's actions through their constructor (an object, or a getter for a module
  serialized later); `getUi()` supplies only shared UI services. Do not guard a required module with
  `typeof`: a missing module must fail, not silently disable a feature.
- A new browser module goes under the role that uses it in `getMigratedViewsClientScript_` or
  `getDashboardPageScript_`, and into `ROLE_MODULES` in `tests/page-assembly.test.cjs`, which builds all
  15 role combinations and checks each role's modules ship exactly when that role does.

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
that is not listed in the `test` script in `package.json` never runs. A change to how a sheet is read or written comes with a
shuffled-column test, a missing-header test and a duplicate-header test for that sheet. `npm run check:sheets-doc` must also pass
(`SHEETS.md` is generated from the catalog).
