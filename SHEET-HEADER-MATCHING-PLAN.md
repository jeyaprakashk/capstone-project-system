# Header-name matching for fixed-layout sheets: plan

Status: proposal. Nothing in this file has been applied.

**Sequencing (one gate).** The retirement of the form-bound sheets is planned first, in
[FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md), and that plan is agreed before anything here is built.
This migration, including its phase 0, **starts after the cutover is complete** (BUILD-ORDER.md item 10). It does **not**
wait for the retirement tail (item 11: the verification period, the deletion and the final snapshot commit), because the
retiring Form sheet is out of scope here and stays untouched until item 11 removes it. The two can therefore overlap
after the cutover.

**Approval boundary.** Sheet layouts stay frozen for the whole migration (phases 0 to 5): no header is renamed, no
column moves, no data is rewritten, and AGENTS.md is not edited. That is what AGENTS.md says today, and this migration
complies with it. Changing the *policy* is a separate decision, made only after the code and tests have shown order
independence (phase 6, section 3).

**Position in the build order:** catalog v1 is item 3, built before the title work; the migration itself is item 12 and starts only after the cutover (item 10). The policy decision is item 13. The full order is in [BUILD-ORDER.md](BUILD-ORDER.md).

## 1. Purpose

Today some server code finds a sheet value by its column number (`row[4]`, `getRange(row, 4)`, `appendRow([...])`).
This plan moves that code to find columns by **header name**, so the code no longer depends on column order. Behaviour,
header text and stored data stay exactly as they are.

The project already does this for part of the code. `getColumnMap_` and `buildColumnMap_`
([common-helpers.js:199](common-helpers.js#L199)) turn header names into column indexes and throw when a required
header is missing. README.md (lines 22 to 24) says the remaining "fixed-layout form, log, configuration, and marking
consumers" still use explicit positions. This plan removes that exception.

## 2. Scope and non-goals

**In scope:** for each sheet addressed by position today, its **creation, header validation, readers and writers**,
converted to header-name lookup, one unit of change at a time (section 4, principle 3).

**Not in scope:**

- Renaming a header, moving a column, adding a column, or rewriting any data in a live sheet.
- Changing workflow behaviour, academic rules, DTOs, endpoints or the client.
- The `ensureSheet_` helper itself, specified in [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md). It has no positional
  mode; it lands before phase 2.
- **Setup while sheets are still being migrated.** A sheet whose code still reads columns by position keeps its current
  creation and validation code at setup, unchanged, and does not use `ensureSheet_`. It switches to `ensureSheet_` in the
  same commit that migrates its readers and writers to header names. Setup therefore never repairs or tolerates a column
  on a sheet whose code depends on column order.
- **Form-bound sheets, which are being retired** (for example `TeamIntakeRaw`, filled by a Google Form whose headers are
  question text). They are not migrated and not moved to `ensureSheet_`. Their code is left exactly as it is until the
  sheet is removed (see "Retiring sheets" below).
- Actually reordering columns afterwards. The code will tolerate it; doing it is a separate, reviewed decision.

**Coordinator formulas.** The owner states that nothing has been typed into the sheets by hand, so there are no
coordinator formulas, charts or pivot tables that point at fixed columns. This is the owner's statement; the repository
cannot show it. The owner checks the live spreadsheet (search with "Search within formulas" ticked) in phase 0. Section 5,
rule W3 depends on it.

## 3. AGENTS.md policy change (separate decision, phase 6)

This plan **does not edit AGENTS.md**. During phases 0 to 5 the current policy applies unchanged, including the frozen
column layouts and the `tests/invariants/schema-guard.test.cjs` snapshot, which describes column definitions as frozen.
New column definitions live in `sheet-columns.js`, so no snapshot is regenerated.

After phase 5, a separate review decides whether to relax the policy, using the evidence from the shuffled-column and
trace-equivalence tests. If the decision is no, the code stays correct and the policy stays as it is. If yes, these are
the changes, applied in their own commit:

| # | Where in AGENTS.md | Current policy | Proposed policy |
|---|---|---|---|
| 1 | "Frozen", first bullet | "Spreadsheet sheet names, headers, column layouts and stored data (`SHEET_NAMES`, `FIELD_DEFINITIONS`, fixed-layout journals and logs)." | "Spreadsheet sheet names, header text and stored data (`SHEET_NAMES`, `FIELD_DEFINITIONS`, journals and logs). No migration renames a header, moves a column or rewrites data. Code finds columns by header name, so column order is not a dependency (see Sheet access)." |
| 2 | "Layers", item 1 | "Column mapping never leaves the server." | Keep, and add: "Server code reads and writes sheet fields through a column map built from header names." |
| 3 | New section "Sheet access" | None | The technical rules in section 5 (there are no exceptions) |
| 4 | "Migrating a dashboard" | Five steps for dashboards | Add a short "Migrating a sheet" procedure (section 7) |
| 5 | "Tests" | `npm test`, `npm run test:migration` | Add: each migrated sheet has shuffled-column and trace tests; the sheet-access audit passes |
| 6 | Invariants paragraph | Guards `SHEET_NAMES` and `FIELD_DEFINITIONS` | Unchanged |
| 7 | "Frozen", first bullet (headers and column layouts) | No code adds a header to an existing sheet | **Owner decision:** `ensureSheet_`, run at setup, may append a missing header to the right end of any existing sheet under the safety rules in decision 6. It never moves, renames or deletes a column or touches data. This item belongs to [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md) (sections 4, 7 and 10) and is approved there; it does not wait for phase 6 and is not performed by the migration commits |

Also updated in that commit: the `COMMITS` comment in [common-constants.js:35](common-constants.js#L35) ("Authoritative
six-column order") is reworded.

**README.md** describes the code as it is, so each migration commit updates the README lines it makes untrue
(lines 22 to 24 for the sheets it migrates). That is documentation of the code, not a policy change.

**Unchanged by anything here:** academic rules, role detection, server-side authorization, the response envelope, the
bridge, Tailwind rules, the public-surface rule, and "no test may regress".

## 4. Principles

1. **Behaviour is identical for the tested current layout,** including how a write fails and what a retry does, with the
   same limits as today (section 5, rules W1 and W2; the reminder email limitation in section 8).
2. **The sheets do not change.** Header text, column order and data stay as they are.
3. **Unit of change.** One sheet per commit. The one exception is the assessment journals, which are a single shared
   9-column layout read and written by several files; their reader and writer sides cannot be split, so they are one
   unit, migrated in one commit. Each commit passes the full suite and carries its own proof (section 7).
4. **Fail loudly.** A missing or duplicate required header throws, naming the sheet and the header.
5. **Nothing is deleted or reordered.**

## 5. Technical rules for migrated sheets (in force from phase 1)

If the policy change in section 3 is approved, these become the AGENTS.md "Sheet access" section.

**Reading and validating**

1. Server code reaches a sheet field through a column map built from header names. No numeric column position is used,
   except the listed exceptions.
2. A column map is built once per execution from the header row and cached, as `getColumnMap_` does.
3. A missing required header throws. A duplicate of a required header throws. Extra, unknown columns are ignored by
   readers and by validation.
   **Who may modify a sheet.** Runtime code (readers, validators, writers of data) never changes a sheet's header row:
   an existing sheet with a missing required header makes it throw, and nothing is appended, moved or changed. Creating
   a *new* sheet writes the complete header row, in definition order. The only code allowed to add a missing header to
   an existing sheet is `ensureSheet_`, at setup, under the rules in decision 6. That repair is the owner's decision and
   is a layout change to live sheets, so it is listed as policy item 7 in section 3.
4. Header comparison is `textEquals_` (trimmed, case-insensitive), as in the rest of the project.
5. **Creation and validation are part of the migration.** `commitCollectionStatusSheet_` and `weeklyReminderSheet_`
   ([logbook-tracker.js:143](logbook-tracker.js#L143), [logbook-tracker.js:495](logbook-tracker.js#L495)) today reject any
   header row whose length or order differs from the definition, before a reader runs. A migrated sheet replaces that with
   the required-header check above. New sheets are still created with the headers in definition order. This loosens a
   failure path on purpose: a shuffled or extended sheet is now accepted. Each migrated sheet's commit states this.

**Writing (rules W1 to W5)**

- **W1. One logical write stays one write call.** A write builds the values for the contiguous span from the leftmost to
  the rightmost mapped column and writes the span with one `setValues`; columns outside the span are never touched.
  Separate per-cell writes are not used for a value set that is one write today.
  **What this does and does not prove.** For the *tested current layout* (mapped columns contiguous and in today's
  order, no unmapped column in the span) the calls are identical to today's, and the trace test proves it. A single
  `setValues` call does not by itself prove equivalent failure behaviour, so no claim is made beyond the traced cases.
  For a *shuffled layout with unmapped columns inside the span*, the writer reads those cells and writes their values
  back. Even without formulas that can change cell behaviour or metadata (for example number formats or rich text on
  those cells). This is a separately tested case with its own tests; shuffled-column support for such a layout is
  claimed only as far as those tests go.
- **W2. Side-effect order is unchanged.** Wherever the current code writes, flushes and then acts (for example the
  reminder migration: `setValues`, `flush`, then delete the old properties), the migrated code does the same in the same
  order, including where the current code does not flush. "Retries behave as before" means equivalent to the existing
  behaviour, limitations included; it does not mean the existing behaviour is made safer.
- **W3. Precondition for the shuffled-with-unmapped-columns case: no formulas in unmapped cells inside a span,** because
  read-modify-write would turn a formula into its value. Phase 0 confirms this with the owner, and the writer test covers
  a sheet with an extra plain-value column. The precondition is necessary, not sufficient (see W1).
- **W4. Formatting calls move with the column.** Today's `setNumberFormat('@')` and the apostrophe prefix for values
  that start with `=`, `+`, `@` or `-` ([logbook-tracker.js:171](logbook-tracker.js#L171)) apply to the mapped column and
  run in the same order relative to the write.
- **W5. For the tested current layout the calls are identical.** When the mapped columns are contiguous and in today's
  order, the migrated code issues the same ranges and values as the old code. The trace test (section 8) asserts this.

**Other**

6. New column definitions live in the sheet catalog (`sheet-columns.js`), outside the snapshot-frozen
   `FIELD_DEFINITIONS`; frozen sheets are referenced from it, not copied. All assessment journals share one definition.
7. **No exceptions.** Every sheet is read by header name, `Config` included: its keys and values are found under their
   column headers. **Confirmed by the owner:** the live `Config` tab has headers `Key` (column A), `Value` (column B) and
   `Description` (column C). The code will find `Key` and `Value` by name and ignore `Description`, so no change to the
   live sheet is needed. Phase 0 re-checks the exact spelling before the definition is written.

## 6. Preliminary inventory

Built from a search of the source; phase 0 verifies and completes it.

| Sheet or group | Current access | Main files |
|---|---|---|
| `Config` (key and value) | `row[0]`, `row[1]`; migrated like the others; headers `Key`, `Value`, `Description` exist | common-helpers.js |
| `GitHubAccounts` | First four columns by position, the rest by header | github-identity.js, team-github-setup.js, student-github.js, weekly-activity.js |
| Assessment journals (9 columns: key, team, student, revision, action, actor, time, request ID, JSON) | `r[0]` to `r[8]` | guide-evaluation.js, review-evaluation.js, publication-events.js, evaluation-lifecycle.js, assessment-registry.js |
| `MasterRegistry` | `r[0]`, `r[1]`, `r[4]` | intake-approval-workflow.js |
| `WeeklyReminders`, `CommitCollectionStatus` | Creation and validation require exact order; readers use `row[0]` to `row[2]` | logbook-tracker.js |
| `Commits`, `LogEntries` | Definitions exist; some access positional | logbook-tracker.js and others |

About 45 positional reads in 14 files and about 94 sheet lookups in 31 files. Writers (`appendRow`, `getRange(row, n)`,
fixed-width `setValues`) are counted per sheet in phase 0, together with the order of every write, flush and dependent
action.

## 7. Building blocks and the per-sheet procedure

### Building blocks (phase 1)

- **The sheet catalog, `sheet-columns.js`:** one readable list of every sheet, its headers, mode, status and the code that
  uses it (see "Sheet catalog" below). Definitions of frozen sheets are referenced from `FIELD_DEFINITIONS`, not copied.
- **Required-header validation** with the duplicate check, applied to a migrated sheet only. `buildColumnMap_` today takes
  the last of two equal headers silently; the stricter check does not change any consumer until its sheet is migrated.
- **`ensureSheet_`** ([ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md)): creation and repair of header rows, used by every
  migrated sheet's creation path. It is built and merged first, with its repair branch enabled in its own policy commit.
- **Record writers** implementing rules W1 to W5: `appendRecord_(sheet, map, record)` and
  `writeRecords_(sheet, map, rowNumber, records)`. They keep the locking and flushing the callers already do.
- **Sheet-access audit**, driven by the catalog's `code` lists (section 8).

### Sheet catalog (`sheet-columns.js`)

One file a person opens to see **every sheet the code uses**, what it is for, who reads and writes it, its headers, its tab
mode and where it is in the migration. It replaces scattered header constants and the separate audit manifest, so there is
a single place to read, verify and change a sheet's definition.

**Build order (catalog v1, then completion).** The retirement plan and the title work run **before** this migration and need
`TitleLog`, `ActivityDependencies` and the Form archive to be created from a specification. So the catalog is built in two
stages, and the order is: `ensureSheet_` -> **catalog v1** -> the `ActivityDependencies` sheet -> the title work and the
retirement.

- **Catalog v1** is built right after `ensureSheet_` and before any sheet is created through it. It contains `sheetCatalog_()`,
  `sheetSpec_(key)`, the catalog test and the `SHEETS.md` builder, with entries for the **new** sheets only
  (`activityDependencies`, `titleLog`, the Form archive). Its completeness test is not yet switched on, because the existing
  sheets are not listed.
- **Completion** is migration phase 1: every existing sheet is added (existing ones with `status: 'positional'`), the
  completeness test is switched on, and the audit starts to read the `code` lists.

There is therefore no cycle: the early plans take their specifications from catalog v1, and the migration only extends it.

**Shape.** A function `sheetCatalog_()` returns a frozen object, built once per execution. It is a function and not a
top-level constant so that it does not depend on file load order (it reads `FIELD_DEFINITIONS` from
`common-constants.js` when called). Each entry:

```
activityDependencies: {
  name:    'ActivityDependencies',                         // tab name (or namePattern for generated names, such as journals)
  access:  'edit',                                         // system | view | edit  (ENSURE-SHEET-PLAN.md)
  headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'],   // or  headersFrom: 'FIELD_DEFINITIONS.TEAM_STATUS'
  status:  'migrated',                                     // new | migrated | positional | retiring
  purpose: 'Rules that gate student actions.',
  code: [                                                  // where the sheet is created, read and written
    { file: 'activity-dependencies-sheet.js', role: 'setup', functions: ['ensureActivityDependenciesSheet_'] }
    // the reader (activity-preconditions.js, role 'read') is added in the commit that creates it, not before
  ]
}

formArchive: {
  name:        'TitleFormArchive',
  access:      'view',
  headersFrom: 'runtime',     // no fixed list: the headers are the verified headers of the live Form sheet (see below)
  status:      'new',
  purpose:     'Values-only copy of the Form-period history, kept for one semester.'
}
```

- **An entry lists only code that exists.** `code` names files and functions that are implemented at that moment. A reader
  or writer is added to `code` in the commit that creates it, so catalog v1 never refers to code that is built later
  (for example the `ActivityDependencies` reader, which arrives in the title plan's Phase 2).
- **An entry can have `headersFrom: 'runtime'`.** The Form archive's headers cannot be fixed in advance: they are the
  headers of the live Form sheet, verified or made unique by the retirement preflight
  ([FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md), "Preflight"). For such an entry the catalog fixes the
  name, mode, status and purpose only, and the caller supplies the verified header list when it asks for the
  specification: `sheetSpec_('formArchive', verifiedHeaders)`. `ensureSheet_` then enforces the usual rules (no blank or
  duplicate header) on that list. `SHEETS.md` shows such an entry as "headers taken from the source Form sheet at archive
  time", and the verification report records the list actually used.

- **Frozen sheets are referenced, not copied.** An entry for an existing sheet uses `headersFrom` to point at its
  `FIELD_DEFINITIONS` entry, so there is no second copy of a frozen definition and `SHEET_NAMES` and `FIELD_DEFINITIONS`
  (and their snapshot) are never edited by the catalog.
- **New sheets** (`TitleLog`, `ActivityDependencies`) list their headers in the catalog itself, outside the
  snapshot-frozen constants. The Form archive is the exception that takes its headers at run time (above). Their setup code takes its specification from the catalog:
  `ensureSheet_({...sheetSpec_('activityDependencies'), mode: 'setup'})`, where `sheetSpec_(key)` returns
  `{name, headers, access, createAtRuntime}` and never `mode` (the call site sets `mode`; `access` is the tab mode).
- **Status** shows at a glance how far each sheet is: `new` (header-name access from the start), `migrated`, `positional`
  (not yet migrated), `retiring` (`TeamIntakeRaw` until step 9 of the retirement plan, then removed from the catalog).
- **`code`** lists the files and function names that touch the sheet, each with a `role`: `setup` (calls `ensureSheet_` in
  setup mode), `runtime-create` (calls it in runtime mode, only for a `createAtRuntime` sheet), `read` or `write`. It is both the documentation of who uses it and the
  input of the sheet-access audit (section 8), so there is one list, not two.
- **`createAtRuntime`** (default `false`) marks a sheet that current code creates during a runtime write, so the migration
  can keep that behaviour without moving creation into setup. Only `CommitCollectionStatus` has it today. Such a sheet is
  created through `ensureSheet_` in **runtime mode** (create if absent, validate, never repair); see
  [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md), "Runtime mode".
- Every sheet the code touches has an entry, including `Config`, the assessment journals (one entry with a `namePattern`),
  `Rubrics`, `Milestones`, `AssessmentDefinitions` and `ProgressEligibility`. Phase 0 completes the list.

**A generated reference, placed in the repository root as `SHEETS.md`.** The builder is `scripts/build-sheets-doc.cjs`,
run by `npm run build:sheets-doc`, and it writes `SHEETS.md` from the catalog: one table with the sheet, its tab
mode (hidden or visible, colour), its headers (resolved from `FIELD_DEFINITIONS` where referenced), status, purpose, and the
files that read and write it. `npm run check:sheets-doc` fails if `SHEETS.md` is out of date, the same pattern as
`check:tailwind` and `check:icons`. A reviewer, or someone who does not read code, can therefore open `SHEETS.md`; a
developer opens the catalog.

**Why the root and `scripts/`.** This follows what the repository already does:

- every project document is a flat, upper-case `*.md` file in the root (`DATA-CONTRACTS.md`, `ICONS.md`, `LOADING-UI.md`,
  `README.md`), so `SHEETS.md` sits beside them where people already look;
- every build-and-check tool lives in `scripts/` as a `.cjs` file with a `--check` mode and a pair of npm scripts
  (`build-icons.cjs`, `build-tailwind.cjs`), so `build-sheets-doc.cjs` does the same;
- `.claspignore` already excludes `*.md` and `scripts/**`, so neither the document nor the builder is pushed to Apps Script.
  No change to `.claspignore` is needed;
- the `generated/` folder is **not** used: it holds deployable Apps Script code (the GitHub template payloads), not
  documents.

The two npm scripts, `build:sheets-doc` and `check:sheets-doc`, are added to `package.json`, and the test file
`tests/sheet-catalog.test.cjs` is added to its `test` script.

**Changing a definition.** Edit the entry, run `npm run build:sheets-doc`, run the tests. For a frozen sheet the change
follows the AGENTS.md rules (a deliberate, reviewed schema change with its snapshot update); the catalog entry itself only
points at the constant.

**Catalog test (`tests/sheet-catalog.test.cjs`, listed in `package.json`).**

- keys are unique, and tab names are unique under `textEquals_`;
- each entry's headers are non-blank and unique under `textEquals_`, and `headersFrom` resolves to a real definition
  (an entry with `headersFrom: 'runtime'` has no list to check; its headers are validated by the preflight and by
  `ensureSheet_` when used);
- `access` and `status` are valid values;
- **completeness:** every sheet name that runtime code refers to (`SHEET_NAMES.X`, a literal in `getSheet_(...)` or
  `insertSheet(...)`) has a catalog entry, so a new sheet cannot be added without being listed;
- every file and function named in `code` exists and refers to that sheet. This holds in catalog v1 because an entry lists
  only code that exists; it is checked again each time a reader or writer is added;
- **`ensureSheet_` call sites:** every setup-mode call is inside a function with `role: 'setup'` that is an editor-run entry
  point or is called only from setup code and entry points, so a runtime path cannot reach repair (details in
  ENSURE-SHEET-PLAN.md, "Guarding setup mode");
- **`createAtRuntime`:** the flag is set on exactly the allow-listed entries (a fixed list in the test, today
  `commitCollectionStatus`), `sheetSpec_` copies it into the spec, and `mode: 'runtime'` appears in the source only in code
  listed under a flagged entry;
- `SHEETS.md` matches the catalog.

The catalog adds no behaviour: it is data and a lookup function, and it touches no sheet.

### Per-sheet procedure ("Migrating a sheet")

1. **Golden master and call trace.** For fixed fixtures, capture what every reader returns; for every writer, which value
   lands under which header; and the ordered sequence of sheet and side-effect calls (write, flush, delete property, send)
   with their ranges. All captured from the current code before any change.
2. **Define the map** in the catalog (`sheet-columns.js`), or point its `headersFrom` at the existing `FIELD_DEFINITIONS`
   entry.
3. **Convert the creation path, the header validation, the readers and the writers** for that sheet in one commit. A
   creation path that runs at runtime today (only `CommitCollectionStatus`) stays at runtime, through `ensureSheet_` in
   runtime mode; it is not moved to setup. A creation path that runs only in setup uses the setup mode. Same
   module; no old and new path side by side.
4. **Prove it:** the golden master and the trace pass unchanged for the current layout; the same fixtures pass with
   columns shuffled; a missing header and a duplicate header each throw; a write preserves an extra column; interruption
   tests pass (section 8).
5. **Update the catalog entry:** set `status: 'migrated'`, list the files and functions in `code`, and run
   `npm run build:sheets-doc`.
6. **Update the README lines** the commit makes untrue.
7. **Run the full suite.** `npm test`, `npm run test:migration`, `npm run test:invariants`, `npm run check:tailwind`.
   Invariants snapshots are not regenerated.

## 8. Tests

**Per sheet:** golden master, shuffled columns, missing header, duplicate header, extra unknown column accepted by
validation and preserved by a write, and creation of a missing sheet followed by a shuffled one.

**Call-trace equivalence.** A fake sheet records every call in order. For the current layout, the migrated code produces
the same sequence of writes, flushes and side effects, with the same ranges and values, as the old code.

**Interruption tests.** A fault is injected at each boundary and a retry is run; the end state must equal what the
current code reaches. The goal is equivalence to the existing behaviour, not an improvement on it. The boundaries are those the baseline trace in phase 0 records, at minimum:

- the commit-status upsert: before its single write, and after it;
- the reminder-property migration: before the write; after the write and before `flush`; after `flush` and before the
  first property is deleted; and part way through the deletions (the retry must not duplicate receipts);
- the reminder path ([logbook-tracker.js:572](logbook-tracker.js#L572)): the email is sent *before* its receipt is
  written, inside a `try` that only logs a failure. A failure between the send and the receipt write therefore leaves no
  receipt, and the next run sends the reminder again. **This is an existing limitation and is retained, not fixed:** the
  migrated code has the same order, and the test asserts the same duplicate on retry, so it documents the behaviour
  instead of promising single delivery. Fixing it (for example writing the receipt first) is a behaviour change outside
  this plan. The receipt write there has no flush, and the trace records that.

**Building-block tests:** duplicate detection, writer blank-fill and span width, W3 and W4 behaviour.

**Sheet-access audit (concrete design).** The existing source audit in
[tests/sheet-reads.test.cjs:91](tests/sheet-reads.test.cjs#L91) checks value-read *methods*; it does not know which sheet
an index belongs to. The new audit reads the catalog's `code` lists (section 7), which map each `migrated` sheet to the
files and named functions that read or write it:

1. For each listed function, extract its source text and fail on a numeric element index (`[0]`, `[3]`) and on a literal
   numeric column argument to `getRange` or similar.
2. Fail when a migrated sheet's name constant (`SHEET_NAMES.X` or its string literal) is referenced in a file the catalog
   does not list for that sheet, so new access cannot appear unaudited.
3. There are no exceptions: every sheet that the code reads is listed.

This is a text-level guard against reintroducing positional access, with known limits (it cannot see an index held in a
variable). The shuffled-column and trace tests are the real proof; the audit is only a tripwire.

Every new test file is listed in the `test` script in `package.json` (an unlisted file never runs).

## 9. Phases

| Phase | Work | Done when |
|---|---|---|
| 0 | **Verify the inventory.** List every creator, validator, reader and writer per sheet with the exact columns used, and record the order of every write, flush and dependent action. The owner confirms the live spreadsheet has no hand-typed formulas, charts or duplicate headers. Confirm which sheets are form-bound and retiring, and list them as out of scope | The checklist and the baseline traces are complete and reviewed |
| 1 | Building blocks and the **completion of the catalog** (catalog v1 already exists; every existing sheet is added with status `positional`, the completeness test is switched on) and the regenerated `SHEETS.md` | Blocks and catalog tests pass; nothing migrated |
| 2 | Pilot: `WeeklyReminders` (creation in setup mode) and `CommitCollectionStatus` (creation stays at runtime, as `ensureSheet_({...sheetSpec_('commitCollectionStatus'), mode: 'runtime'})`, so a missing sheet is still created on the first status write), **including their creation and header-validation paths** | Procedure proven on two sheets |
| 3 | `GitHubAccounts` (already hybrid, most consumers) | All consumers header-based |
| 4 | `MasterRegistry`, then `Commits` and `LogEntries`, then `Config` (read on every request, so last of the single-file sheets and with the strictest trace test) | Migrated and audited |
| 5 | Assessment journals, as one unit | Migrated and audited |
| 6 | **Policy decision (separate review).** Evidence from phases 2 to 5 is presented; if approved, apply section 3 in its own commit | Decision recorded; AGENTS.md matches it |

Each phase is one or more commits on the development branch and leaves the full suite green. Phases 0 to 5 do not depend
on phase 6.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A write fails differently from today (partial writes, retries) | Rules W1 and W2, the trace test and the interruption tests, claimed only for the tested layout |
| The reminder email can be sent twice after a failure between send and receipt | Existing behaviour, retained and documented by a test; not fixed here |
| Shuffled layout with unmapped columns in the span: read-modify-write may alter cell behaviour or metadata | Separately tested case, W3 precondition, claim limited to what the tests show |
| A writer silently depends on order (`appendRow`, fixed-width `setValues`) | Phase 0 lists every writer; the write test checks the target cell |
| Validation now accepts shuffled or extended sheets in the pilot | Intentional and stated in each commit; the missing and duplicate header errors remain |
| A live sheet has a duplicate or misspelt header | Owner checks in phase 0; the errors name the sheet and the header |
| A form-bound sheet (for example `TeamIntakeRaw`) takes headers from question text | Owner decision: all form-bound sheets are being retired, so they are not migrated. Their existing code stays unchanged until removal; see "Retiring sheets" |
| Journals are shared by many files and break together | They go last and as one unit |
| Overlap with the title plan and [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md), which touch `GitHubAccounts` | Decision 4: this migration goes first and the student-identity plan is rebased on it later; new sheets such as `TitleLog` use header-name access from the start |
| Read-modify-write turns a formula in an unmapped cell into a value | Rule W3 precondition, checked in phase 0 |

### Retiring sheets (form-bound)

Owner decision: every form-bound sheet will be retired. Until each one is removed:

- It is **not** migrated, **not** put on `ensureSheet_`, and has status `retiring` in the catalog and is not audited. Its readers and writers
  stay unchanged, so the retirement work is the only thing that touches them.
- Known today: `TeamIntakeRaw` (filled by the intake Form), read at
  [intake-approval-workflow.js:16](intake-approval-workflow.js#L16) (`onTeamIntakeSubmit`) and
  [guide-dashboard.js:60](guide-dashboard.js#L60). The title plan (Phase 4) removes `onTeamIntakeSubmit`; the other read
  goes when the sheet does. Phase 0 confirms the full list and whether any other sheet is Form-filled.
  `GitHubAccounts` is **not** form-bound: the owner confirms it no longer depends on a Form (students register through the
  dashboard), so it is application-owned and is migrated in phase 3.
- These are the only positional reads allowed to remain, and only until the sheet is removed. The "done" check for this
  plan lists them by name, so nothing positional survives silently.
- The retirement itself is separate work. Positional access inside a retiring sheet's code needs no header-name rewrite,
  because the code is deleted, not kept.

## 11. Open decisions

1. **Order.** Phases as above, journals last.
2. **Exceptions. Decided: none.** `Config` is migrated too (phase 4). Form-bound sheets are not an exception: the owner
   has decided to retire all of them, so they are out of scope (see "Retiring sheets"). No open case remains.
3. **Where definitions live. Decided: `sheet-columns.js`, as a catalog** that lists every sheet in one readable place,
   with a generated `SHEETS.md` for people who do not read code (see "Sheet catalog").
4. **GitHubAccounts timing. Decided: before the student-identity work.** The student-identity feature is large and may be
   implemented later, so phase 3 does not wait for it. The student-identity plan will be rebased on the header-name
   version of `GitHubAccounts` when it is taken up: any column it adds is then added by name (through `ensureSheet_`),
   not by position. [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md) has not been checked against this plan and needs
   that review at that time; nothing in it is changed now.
5. **Duplicate-header strictness. Decided: option A.** Throw only for a duplicate of a header the code requires. A
   duplicate of an extra or unknown header is ignored, like any other extra column. Header equality is `textEquals_`
   (trimmed, case-insensitive). Silently taking the first or last match is not allowed. Each consumer validates only the
   headers it needs, so a duplicate becomes an error at the moment code starts to depend on that header.
6. **`ensureSheet_` versus tolerant readers. Decided (owner; the helper is specified in
   [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md)):** setup tolerates extra columns on migrated sheets, so
   setup and the readers never disagree, and `ensureSheet_` repairs a missing header on **any** existing sheet by
   appending it silently ("silently" means no prompt and no error; it still reports what it did in its result and log).
   The cases:

   | Existing sheet | `ensureSheet_` outcome |
   |---|---|
   | Absent | Create it with the complete header row |
   | All required headers present | Do nothing |
   | Only required headers missing, and every existing header is recognised | Append the missing headers at the right end, in definition order |
   | A required header is missing **and** an unrecognised header is present | Throw, changing nothing: it may be a typo, and appending an empty column would hide the data under the typo |
   | A required header appears twice | Throw |
   | Extra recognised-or-unknown columns, nothing missing | Do nothing |

   There is no positional mode. A sheet uses `ensureSheet_` only once its code reads by header name (new sheets from the
   start; existing sheets in the commit that migrates them), so appending or tolerating a column never shifts anything
   the code depends on. Repair never moves, renames or deletes a column and never writes a data row. The migration's runtime code never repairs (rule 3). The AGENTS.md effect is policy item 7
   in section 3.
