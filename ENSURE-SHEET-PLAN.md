# `ensureSheet_`: common sheet-creation helper plan

Status: proposal. Nothing in this file has been applied, and AGENTS.md is not edited by it.

This is the shared helper that every setup path will use to create a sheet or bring it up to date. It is a building
block of [SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md), whose decision 6 and policy item 7 define its
repair rule, and it replaces the sheet-specific function in [ACTIVITY-DEPENDENCIES-SHEET-PLAN.md](ACTIVITY-DEPENDENCIES-SHEET-PLAN.md)
(section 11).

**Position in the build order:** items 1 and 2. It needs nothing and must be merged, with its second commit, before any sheet is created through it. The full order is in [BUILD-ORDER.md](BUILD-ORDER.md).

## 1. Purpose

One function that makes sure a sheet exists with the right headers:

- creates the sheet with its headers if it is absent;
- does nothing if the sheet exists and has every required header;
- adds missing headers to an existing sheet, silently, under safety rules (section 4);
- refuses, changing nothing, when something looks wrong;
- sets the tab colour and visibility of a **newly created** sheet from its access mode;
- never deletes, reorders or renames a column, and never writes a data row.

## 2. Decided

| Topic | Decision |
|---|---|
| Access modes | Three: `system`, `view`, `edit` (section 3) |
| Unknown header | An error when a header is also missing (possible typo); extra columns are tolerated when nothing is missing (section 4) |
| Positional sheets | There is no positional mode. A sheet uses this helper only once its code finds columns by header name (section 4) |
| Repair of an existing sheet | Owner decision: silently append missing headers, under the section 4 rules |
| Return value | Throw on every failure; return a result object on success (section 5) |
| Runtime code | Never repairs. Setup paths use the full helper. Runtime code may call it only in **runtime mode** (create an absent sheet, validate, never repair) and only for a sheet whose current code already creates it at runtime (section 4, "Runtime mode") |

## 3. Interface

```
ensureSheet_({
  name:       string,                          // sheet name
  headers:    string[],                        // required headers, in definition order
  access:     'system' | 'view' | 'edit',
  mode:       'setup' | 'runtime',            // REQUIRED, no default; 'runtime' also needs createAtRuntime: true
  createAtRuntime: boolean = false,            // part of the spec; `sheetSpec_` copies it from the catalog entry
  onCreate:   (sheet) => void = undefined      // optional, runs once, only when the sheet was just created
}) → { created: boolean, repaired: string[] }
```

The caller passes the specification, normally taken from the sheet catalog with `sheetSpec_(key)`
(`sheet-columns.js`, [SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md)). The helper itself keeps no registry,
and nothing is added to `SHEET_NAMES`.

### Access modes

| Mode | Meaning | Hidden | Tab colour |
|---|---|---|---|
| `system` | Used by code only | Yes | Red (`#d93025`) |
| `view` | Humans read, do not edit | No | Red (`#d93025`) |
| `edit` | Humans edit | No | Green (`#188038`) |

Colour and visibility are applied **only when the sheet is created**. An existing sheet keeps whatever colour,
visibility and formatting it has, including after a repair, so a coordinator's later changes are never overwritten.
The mode does not protect a sheet: `system` and `view` sheets get no sheet protection (decided, section 11).

## 4. Behaviour for an existing sheet

Headers are compared with `textEquals_` (trimmed, case-insensitive), as the rest of the project does. "Recognised"
means equal to one of the required headers under that comparison.

| Existing sheet | Outcome |
|---|---|
| Absent | Create it, write the complete header row in definition order, apply the mode (colour, visibility), run `onCreate`, return `{created: true, repaired: []}` |
| No rows at all (`getLastRow() === 0`) | Treated like a new sheet's contents: write the complete header row. Colour and visibility are left alone, because the sheet already existed |
| All required headers present, nothing unknown | Do nothing. Return `{created: false, repaired: []}` |
| Only required headers missing, and every existing header is recognised | Append the missing headers at the right end, in definition order, with one write. Return the list in `repaired` |
| A required header missing **and** an unrecognised header present | **Throw**, change nothing. It may be a typo; appending an empty column would hide the data under it |
| A required header appears twice | **Throw**, change nothing |
| A blank cell inside the header row, or content to the right of the last header cell | **Throw**, change nothing (unlabelled data must not get a header by accident) |
| Extra unrecognised columns, nothing missing | Do nothing. Return `{created: false, repaired: []}` |

**No positional mode; which sheets use the helper.** The helper assumes every reader and writer of the sheet finds
columns by header name, because only then is appending a header, or tolerating an extra column, harmless. So:

- A **new** sheet uses the helper from its first commit, and its code reads by header name from the start.
- An **existing** sheet whose code still reads columns by position does **not** use the helper yet. Its current creation
  and validation code (strict, unchanged) keeps running at setup, so setup never adds or tolerates a column on a sheet
  whose code depends on column order.
- That sheet switches to the helper in the **same commit** that migrates its readers and writers to header names
  (SHEET-HEADER-MATCHING-PLAN.md). The migration's audit manifest lists each migrated sheet, so a sheet is on the helper
  exactly when it is on the manifest.

**Repair writes only header cells.** It adds columns at the right end if the sheet has no room (`insertColumnsAfter`),
and writes one header range. No data row, format or other cell is touched.

**Why repair is allowed at setup only.** It is a layout change to a live sheet. It runs in an editor-run setup path under
the script lock, reports what it did, and is never called from a dashboard or any request path. A request path only
validates and throws if a header is missing (SHEET-HEADER-MATCHING-PLAN section 5, rule 3).

### Runtime mode

The planned calls, for reference. Every call names its `mode`:

```
// editor-run setup (ActivityDependencies, TitleLog, the Form archive)
ensureSheet_({ ...sheetSpec_('activityDependencies'), mode: 'setup', onCreate: formatActivityDependenciesSheet_ })

// runtime write (CommitCollectionStatus only)
ensureSheet_({ ...sheetSpec_('commitCollectionStatus'), mode: 'runtime' })
```

`sheetSpec_(key)` returns `{name, headers, access, createAtRuntime}`. It never returns `mode`, because `mode` describes the
call site, not the sheet. In this plan `access` (`system`, `view`, `edit`) is the tab mode and `mode` is the call mode
(`setup`, `runtime`); the two are unrelated.

One existing path creates a sheet during a runtime write: `writeCommitCollectionStatus_`
([logbook-tracker.js:175](logbook-tracker.js#L175)) calls `commitCollectionStatusSheet_(true)` under the script lock, so
the first status write creates `CommitCollectionStatus` if it is missing. (The other creator, `weeklyReminderSheet_(true)`,
is called only from `setupWeeklySubmissionStorage`, an editor-run setup; Phase 0 confirms there is no other.) The
migration must keep that behaviour, so the helper has a narrow mode for it. Moving creation into setup instead would change
what a missing sheet does at runtime (an error instead of an automatic creation), which the migration may not do.

- **Who may use it, and how that is enforced.** Only a sheet whose catalog entry has `createAtRuntime: true` (default
  false). Today that is `CommitCollectionStatus` alone, and the flag is shown in `SHEETS.md`. The helper keeps no registry
  and does not read the catalog, so the restriction is enforced in two places:
  1. **In the helper, by a validated argument.** `sheetSpec_(key)` copies `createAtRuntime` from the catalog entry into the
     spec. When `mode` is `'runtime'` and the spec does not carry `createAtRuntime: true`, the helper throws "Runtime
     creation is not allowed for <Sheet>" before reading or writing anything. A caller therefore cannot reach runtime mode
     by accident; it has to pass a spec that says so.
  2. **In the catalog test, against forging.** The test holds a fixed allow-list of flagged entries (today
     `commitCollectionStatus`) and fails if any other entry carries the flag; it also fails if `mode: 'runtime'` appears in
     the source anywhere except in code listed under a flagged entry. A new runtime creator therefore needs a reviewed
     change to that allow-list, not just a flag in a spec.
- **What `mode: 'runtime'` does.** If the sheet is absent: create it with the complete header row and apply the access mode
  (the same as setup), under the lock (reused if the execution already holds it, as `writeCommitCollectionStatus_`
  does). If the sheet exists: validate the required headers by name and **throw on a missing or duplicated required
  header**; extra columns are ignored.
- **What it never does.** It never appends, repairs, reorders or deletes anything on an existing sheet, and it does not run
  `onCreate` formatting beyond what creation itself needs. Repair stays in setup mode and is therefore never reached from
  a runtime write.
- **Behaviour change, stated.** Today the writer rejects any header row that differs in length or order. In runtime mode a
  shuffled or extended sheet is accepted, and a missing header still throws (SHEET-HEADER-MATCHING-PLAN.md section 5, rule
  5). A missing sheet is still created on the first write, exactly as now.

### Guarding setup mode

Setup mode can append a header to a live sheet, so a runtime caller must never reach it, including by leaving `mode` out.

- **`mode` has no default.** A call without `mode`, or with a value other than `'setup'` or `'runtime'`, throws "ensureSheet_
  needs mode: 'setup' or 'runtime'" before reading or writing anything. Omitting it can no longer fall into setup mode.
- **Setup-mode call sites are restricted by an audit.** In the catalog test (SHEET-HEADER-MATCHING-PLAN.md, "Sheet
  catalog"), a source check requires that every `ensureSheet_(` call with `mode: 'setup'` is inside a function listed in the
  catalog under `role: 'setup'`, and that every such function is either
  1. an **editor-run entry point**: a public function listed in `tests/entry-point-guard.test.cjs` whose first statement is
     `requireTriggerOrOperator_()` (for example `setupTitleStorage`, `setupActivityDependencies`, and the retirement
     functions), or
  2. a private function whose every call site in the source is inside another `setup` function or an editor-run entry point.
- **Runtime-mode call sites** are restricted the same way, to functions listed under `role: 'runtime-create'` for a sheet
  with `createAtRuntime: true`.
- **Limits.** This is a text-level check of call sites, like the sheet-access audit: it cannot see a call through a stored
  function reference, so call sites must name `ensureSheet_` directly (the audit also fails on any other reference to the
  name). The runtime guard above is the backstop; the audit is the tripwire.

## 5. Result and errors

- **Success:** `{created, repaired}`. `repaired` lists the headers appended, so a setup function can report them. They are
  also written to the server log (the sheet name and the header names, no cell values).
- **Failure:** the helper throws a plain `Error`, the project's standard (for example `Commits header mismatch ...` in
  [logbook-tracker.js:61](logbook-tracker.js#L61)). API endpoints already turn that into the envelope error. Messages
  name the sheet and say that nothing was changed:
  - `<Sheet> header mismatch. Missing: <a, b>. Unrecognised: <x>. Fix the header row by hand; nothing was changed.`
  - `Duplicate header in <Sheet>: <h>. Nothing was changed.`
  - `<Sheet> has content outside its header row. Nothing was changed.`
  - `Another setup is running. Try again shortly.`
  - `<Sheet> could not be hidden because it would be the only visible sheet.`
- **Why not true/false.** A boolean tells the caller that something failed but not why, so it cannot show a useful
  message or decide whether to retry. The project already throws plain errors and returns objects like `{created:false}`
  from its setup functions, so this follows existing practice.

## 6. Design for speed and safety

1. **Fast path, no lock, no writes.** Resolve the sheet with `getSheet_` (cached per execution), read the header row once
   with `readSheetRows_(sheet, 1, 1)`, compare in memory, and return. The shared reader is required: the source audit in
   `tests/sheet-reads.test.cjs` rejects raw value reads elsewhere. A per-execution memo keyed by name, headers and mode
   makes repeat calls free.
2. **Write path only when something must change.** Take the script lock, **re-read under the lock** (another execution may
   have created or repaired the sheet meanwhile), decide again, then write.
3. **Locking.** If this execution already holds the script lock (`lock.hasLock()`), use it and do not take it again, so a
   caller inside a locked section cannot deadlock. Otherwise take it with `waitLock(30000)` and release it in `finally`.
   This is the project's existing pattern (`weeklyLock_` in [logbook-tracker.js:268](logbook-tracker.js#L268) and the
   identity lock in [github-identity.js:71](github-identity.js#L71)): reuse an owned lock, otherwise wait up to 30
   seconds. The helper takes no other lock, so it is always the innermost lock and cannot create a lock-order cycle with
   any current or future caller. If the wait times out it throws "Another setup is running. Try again shortly.".
4. **Few calls.** One `insertSheet`, one `setValues` for all headers, one `setTabColor`, at most one `hideSheet`, and one
   `flush` at the end of a write. No per-cell calls.
5. **Hidden sheet.** Count visible sheets first; if hiding would leave none, throw before changing anything.
6. **Cache invalidation after any write.** Clear this sheet's entry in `sheetExecutionHandles_`, the matching
   `_columnMapCache` entries (they include the header map, which has just changed), and any `dashboardReadSnapshot_` or
   `dashboardHeaderSnapshot_` entry for it in [common-helpers.js](common-helpers.js). A small `invalidateSheetCaches_(name)`
   in that file does this, so no caller reaches into those variables.
7. **`onCreate` runs once, only on creation, inside the lock.** It is for cosmetic setup such as plain-text columns or a
   dropdown. If it throws, the error propagates with the note that the sheet was created; the next run sees a complete
   header row and does not run `onCreate` again, so a sheet's correctness must never depend on it.
8. **Not public.** The name ends in `_`, so there is no new public function and the entry-point guard is unaffected.

## 7. Policy and AGENTS.md effect

This plan changes no AGENTS.md text itself. It depends on, and is gated by, these items:

| # | Item | Where decided |
|---|---|---|
| 1 | Policy item 7 of SHEET-HEADER-MATCHING-PLAN section 3: `ensureSheet_` may append a missing header to an existing sheet, never move, rename or delete a column | Owner decision recorded there; AGENTS.md edit made with this helper's commit |
| 2 | Proposed new rule for AGENTS.md: "New sheets are created through `ensureSheet_`; setup may repair a missing header, request paths may not" | Proposed here, approved with item 1 |

Until item 1 is applied to AGENTS.md, the helper's repair branch stays **disabled** and throws like the "refuses" rows
(the constant `ENSURE_SHEET_REPAIR_ENABLED_` is `false`), so the code never contradicts the written policy. Tab colour and visibility apply only to new
sheets and conflict with no existing rule.

The invariants snapshots are not regenerated. The helper adds no entry to `SHEET_NAMES` or `FIELD_DEFINITIONS`.

## 8. Relation to the other plans

- **ACTIVITY-DEPENDENCIES-SHEET-PLAN.md:** its sheet becomes
  `ensureSheet_({...sheetSpec_('activityDependencies'), mode: 'setup', onCreate})`, with the dropdown and
  plain-text formatting in `onCreate`, called from setup. Its own `ensureActivityDependenciesSheet_`, header comparison
  and `setupActivityDependencies` wording are replaced. That plan must be updated when this one is approved.
- **SHEET-HEADER-MATCHING-PLAN.md:** each migrated sheet's creation path calls `ensureSheet_`. This helper therefore
  lands before the pilot (phase 2) and is part of its phase 1 building blocks. The existing creators
  (`insertSheet` in logbook-tracker.js, weekly-progress-phase2.js, assessment-registry.js, assessment-storage-setup.js and
  progress-eligibility.js) are converted one sheet at a time as part of that migration, not here.
- **TITLE-REVISION-PLAN.md:** `TitleLog` is created through this helper (call mode `setup`) with access `view` (visible, red tab, no sheet
  protection), because the coordinator enters its baseline rows by hand before cutover and does not edit it afterwards.
  The title plan states the same.

## 9. Tests

A new test file, `tests/ensure-sheet.test.cjs`, listed in the `test` and `test:migration` scripts in `package.json`.
It uses a fake spreadsheet and a fake lock; there are no live calls.

| Case | Expectation |
|---|---|
| Absent, each mode | Created with the full header row; `system` is hidden and red, `view` visible and red, `edit` visible and green; `{created: true}` |
| Absent, `onCreate` | Runs once, after the headers, inside the lock; not run on a later call |
| `onCreate` throws | The error propagates and mentions the sheet was created; a rerun does not run it again |
| Empty existing sheet | Header row written; colour and visibility untouched |
| All headers present | No writes, no lock taken, `{created: false, repaired: []}` |
| Headers differ in case or spacing | Accepted; nothing rewritten |
| Existing sheet, colour or visibility changed by hand | Left as it is, also after a repair |
| Only required headers missing, all others recognised | The missing ones appended at the right end in definition order; `repaired` lists them; no data cell changed |
| Missing plus an unrecognised header | Throws; nothing written (typo case) |
| Duplicate required header | Throws; nothing written |
| Blank header cell, or content right of the last header | Throws; nothing written |
| Extra columns, nothing missing | Does nothing; no write |
| Missing headers in the middle of the definition order | Appended at the right end in definition order (readers find them by name) |
| No room for new columns | Columns inserted, then headers written |
| Repair branch disabled | Throws as in the "refuses" rows, writes nothing |
| Hiding the last visible sheet | Throws before any change |
| Lock busy | Throws "Another setup is running"; nothing written |
| Lock already held by this execution | Not taken again; no deadlock |
| Lock released | After success and after an error |
| Re-read under the lock | If another execution created or repaired the sheet meanwhile, this call does nothing more |
| Repeat call in one execution | Memo hit; no reads or writes |
| Cache invalidation | After a repair, `getColumnMap_` sees the new header; stale handles and snapshots are cleared |
| Never deletes | No test path calls a delete, clear or reorder method on the fake sheet |
| Runtime mode, sheet absent | Created with the full header row and the access mode, under the lock; reuses an owned lock |
| Runtime mode, sheet present | Validated by required headers; a missing or duplicated required header throws; nothing is written |
| Runtime mode, header missing | Throws; **never** appends (repair is not reachable from runtime mode) |
| Runtime mode, spec without `createAtRuntime: true` | Throws "Runtime creation is not allowed for <Sheet>" before any read or write |
| `mode` omitted or invalid | Throws "ensureSheet_ needs mode: 'setup' or 'runtime'" before any read or write; repair is not reached |
| Audit: setup-mode call outside a `setup` function | The catalog test fails |
| Audit: a `setup` function reachable from a runtime path (not an entry point and not called only from setup code) | The catalog test fails |
| Audit: `ensureSheet_` referenced other than by a direct call | The catalog test fails |
| Source audit | The helper reads headers only through `readSheetRows_` |
| Entry-point guard | Unchanged; the whole guard test passes |
| Invariants | `npm run test:invariants` passes without `UPDATE_GOLDEN`; `schema.json` unchanged |

The full suite (`npm test`, `npm run test:migration`, `npm run test:invariants`, `npm run check:tailwind`) passes before
the commit.

## 10. Commit and rollout

- One commit: the helper (a new file such as `ensure-sheet.js`), `invalidateSheetCaches_` in `common-helpers.js`, the new
  test file, and the `package.json` script entries. No sheet is created or changed by this commit, because no caller uses
  the helper yet.
- A second, separate commit applies the AGENTS.md items in section 7 and sets `ENSURE_SHEET_REPAIR_ENABLED_` to `true`.
  Until then repair stays off. It is merged before any caller adopts the helper.
- Callers adopt it one at a time, after **catalog v1** (SHEET-HEADER-MATCHING-PLAN.md, "Sheet catalog", build order) is
  built: first `ActivityDependencies`, then `TitleLog` and the Form archive, then each sheet in the migration.
- Rolling back is reverting the commits. No data depends on the helper.

## 11. Decisions

All decided.

1. **Sheet protection: none** for `system` and `view` sheets. No sheet here uses `.protect()` today, and only coordinators
   can open the spreadsheet. Revisit only if a reason is shown.
2. **Lock wait: `waitLock(30000)`, reusing an owned lock.** Every setup and write path in the project that waits uses
   30 seconds (logbook-tracker.js, github-provisioning.js, student-github.js, team-folders.js, github-identity.js), and the
   `hasLock()` reuse pattern is the project's way to nest safely. The 1-second and 5-second `tryLock` calls are on
   user-facing request paths that must fail fast; this helper is never called from one. Choosing 30 seconds means it works
   inside or beside every existing locked section, and because it takes no other lock it cannot deadlock a future one.
3. **Colours: hex** (`#d93025` red, `#188038` green). Hex is the unambiguous CSS form that `setTabColor` accepts and
   needs no lookup table; named colours depend on the platform's name list. Both values are single constants in the
   helper.
4. **Repair reporting: return value and server log only.** The helper returns `repaired` and logs the sheet and header
   names. It does not write to coordinator health, because that would couple a data helper to a dashboard DTO, which
   AGENTS.md layering keeps separate, and a repair is a one-time event seen by the person running setup. A setup function
   may include `repaired` in its own result. Revisit if setup is ever run from a UI.
5. **When to enable repair: in the AGENTS.md commit, before any caller adopts the helper.** The repair branch is built and
   tested in the first commit but disabled. The second commit (policy items plus `ENSURE_SHEET_REPAIR_ENABLED_ = true`) is
   merged before the first caller, so every caller behaves identically from day one and no per-caller switch exists.
   Enabling it earlier changes nothing (no caller exists); enabling it later would make the first callers differ from
   later ones.
