# ActivityDependencies sheet: creation plan

Status: **built.** The text after the two summary sections below is the plan as it was written.

## What was planned

Create one sheet, `ActivityDependencies`, with the header row `Activity | Kind | Item | Label | Active` and no data rows, through `ensureSheet_` in setup mode:

- the name, headers and access mode (`edit`, a visible green tab) live in the sheet catalog, not in `SHEET_NAMES`, so the frozen schema snapshot is untouched;
- a small module with the setup function and first-creation formatting (plain-text columns, a frozen header row, a Yes/No list for `Active`);
- a temporary public `setupActivityDependencies`, removed once `setupTitleStorage` exists;
- no sheet protection; the coordinator enters the rows at cutover; setup never inserts rows;
- its own test file and entry in the guard test.

## What was implemented

`activity-dependencies-sheet.js` holds `ensureActivityDependenciesSheet_` (one `ensureSheet_` call in setup mode, with `onCreate` formatting) and `formatActivityDependenciesSheet_`. The sheet is defined in the catalog (`activityDependencies`, access `edit`). `setupTitleStorage` creates it together with `TitleLog`. `tests/activity-dependencies-sheet.test.cjs` covers the specification, the helper call, the formatting and its absence. The schema snapshot was not changed for it. The rule rows have not been entered: a check of the live sheet (2026-10-11) found it header-only, so no requirement is enforced yet (an empty sheet means "no rows allows"). The three release rows are listed in OWNER-CHECKLIST.md, section D.

### Differences from the plan, with the reason

| Plan | Implemented | Reason |
|---|---|---|
| A public `setupActivityDependencies` for the editor, removed later. | It does not exist in the final code. `setupTitleStorage` calls the private function directly. | This is the plan's own end state (decision 4). I found no trace of the temporary function in the final code or the entry-point guard. |
| Plain statement that the sheet is read "by header name from the start". | Done, and the engine's loader compares headers with `textEquals_`. | As planned. |
| Follow-up: the engine plan should say "every required header present (by name)". | The loader does exactly that (extra columns ignored; a missing or repeated required header is a misconfiguration). | As planned; the engine plan's wording was not edited. |

---

## The plan as it was written

The sheet is created through the shared helper `ensureSheet_`, specified in [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md).
This plan therefore only supplies the sheet's specification and its setup entry point. Creation, header checking, repair,
locking, tab colour and visibility are the helper's job and are not repeated here.

**Position in the build order:** item 4. It needs items 2 and 3 (`ensureSheet_` with repair enabled, and catalog v1) and enables the title plan's Phase 1. The full order is in [BUILD-ORDER.md](BUILD-ORDER.md).

## 1. Purpose

Create one sheet, `ActivityDependencies`, with a fixed header row and no data rows. The coordinator later fills it with
the requirements that gate student actions. This plan covers only the sheet's specification and the setup that creates it.
It does not read the sheet, validate its rows or enforce anything.

## 2. Why it is its own plan

- The header text and column order are the one part of the engine that is expensive to change. Once the coordinator has
  typed rows, a change means fixing every row.
- The title plan treats new sheets as a deliberate, reviewed schema change in its own commit, never inside a UI
  migration.
- Nothing else in the engine needs the sheet to exist. The parser takes plain rows and the sheet reader is injectable,
  so steps 2 to 6 can be built and tested without it.

## 3. The sheet

| Property | Value |
|---|---|
| Name | `ActivityDependencies` |
| Header row (row 1, columns A to E, in this order) | `Activity`, `Kind`, `Item`, `Label`, `Active` |
| Access mode | `edit`: visible, green tab (the coordinator types its rows) |
| Data rows | None. The coordinator enters the three release rows at cutover. Setup never inserts rows. |
| Read by | Header name, from the start, so extra columns are tolerated and a missing header is repaired by `ensureSheet_` at setup |

Column meanings and row validation are defined in section 4 of ACTIVITY-DEPENDENCIES-PLAN.md and are not repeated here.

**Formatting, applied only when the sheet is first created** (passed to the helper as `onCreate`, so it never overwrites
a coordinator's later changes; none of it changes stored data):

- Columns A to E are set to plain text, so Sheets does not convert an item such as a file name or a value such as `Yes`.
- Row 1 is frozen.
- Column E (`Active`) gets a dropdown of `Yes` and `No` for rows 2 and below. This reduces typing mistakes. It is a
  convenience only; the parser still rejects any other value, because a pasted value can bypass a dropdown. The sheet is
  correct without `onCreate` (ENSURE-SHEET-PLAN section 6, item 7).

## 4. Constants

The name, header and mode live in the **sheet catalog**, `sheet-columns.js` ([SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md),
"Sheet catalog"), not in `SHEET_NAMES`:

```
activityDependencies: {
  name: 'ActivityDependencies',
  access: 'edit',
  headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'],
  status: 'new',
  purpose: 'Rules that gate student actions.'
}
```

A small module (for example `activity-dependencies-sheet.js`) holds only the setup and formatting functions.

**Reason.** `tests/invariants/schema-guard.test.cjs` snapshots `SHEET_NAMES` and `FIELD_DEFINITIONS`. Adding a name to
`SHEET_NAMES` would change `tests/invariants/snapshots/schema.json`, which AGENTS.md allows only for a deliberate,
reviewed schema change made outside a migration. Keeping the definition in the catalog leaves the frozen snapshot
untouched and still pins the new sheet with the catalog test and its own test (section 6). The catalog also appears in the
generated `SHEETS.md`, so the sheet can be read and checked in one place.

## 5. Setup

```
ensureActivityDependenciesSheet_() → { created: boolean, repaired: string[] }
```

A private function (trailing underscore). It is one call:

```
ensureSheet_({
  ...sheetSpec_('activityDependencies'),           // name, headers, access and createAtRuntime, all from the catalog
  mode: 'setup',                                   // required: this is an editor-run setup path
  onCreate: formatActivityDependenciesSheet_       // plain text, frozen row, Yes/No dropdown
})
```

What happens in each case (absent, correct, a header missing, a typo, a duplicate) is defined by the helper's table in
ENSURE-SHEET-PLAN.md section 4. In summary for this sheet: it is created if absent; nothing happens if the five headers
are present; a missing header is appended silently once repair is enabled; a possible typo, a duplicate or a stray cell
outside the header row throws and changes nothing. It never deletes or reorders a column and never writes a data row.

The helper's repair is enabled (BUILD-ORDER.md item 2, `eb643b2`), so a missing header on an existing sheet is appended at
setup. **Built** as build order item 4: `activity-dependencies-sheet.js` and `tests/activity-dependencies-sheet.test.cjs`.

### Who can run it

Apps Script's editor can run only functions whose names do not end in `_`, so the private function needs a public caller:

```
setupActivityDependencies()      // editor-run
```

- It starts with `requireTriggerOrOperator_()` ([common-helpers.js:254](common-helpers.js#L254)) and then calls
  `ensureActivityDependenciesSheet_()`, returning its result so the person running it sees what was created or repaired.
- It is a new public function, so it is added to `tests/entry-point-guard.test.cjs`, which fails when an unlisted public
  function appears.
- In Phase 1, `setupTitleStorage()` calls `ensureActivityDependenciesSheet_()` directly, as the title plan states
  (section 4, "Setup"). `setupActivityDependencies` is then redundant and is removed in that same change, together with
  its guard-test entry.

### Protection

None. This follows the helper's decision (ENSURE-SHEET-PLAN section 11): no sheet here uses `.protect()` today, and only
coordinators can open the spreadsheet. The title plan's word "protected" is satisfied by that access control, not by
sheet protection; the title plan should say so when it is next revised.

## 6. Tests

A new test file, `tests/activity-dependencies-sheet.test.cjs`, listed in the `test` and `test:migration` scripts in
`package.json`. It uses a fake `ensureSheet_`. The helper's own behaviour (every existing-sheet case, locking, caches,
colours) is tested once, in `tests/ensure-sheet.test.cjs` from ENSURE-SHEET-PLAN section 9, and is not repeated here.

| Case | Expectation |
|---|---|
| Catalog entry | `sheetSpec_('activityDependencies')` returns the name, the five headers in order and `access: 'edit'` from section 3 (pins the layout against accidental edits; this is also covered by the catalog test) |
| Call to the helper | `ensureActivityDependenciesSheet_` calls `ensureSheet_` once with the `sheetSpec_('activityDependencies')` result plus `mode: 'setup'` and an `onCreate`, and nothing else; it defines no name or header of its own |
| `onCreate` formatting | On a fake sheet: columns A to E are plain text, row 1 is frozen, column E has a `Yes` / `No` list from row 2; no data row is written |
| `onCreate` not required | With `onCreate` stubbed out, the sheet is still correct |
| Result | The helper's result (`created`, `repaired`) is returned unchanged |
| `setupActivityDependencies` | Calls `requireTriggerOrOperator_()` first; rejects a non-coordinator caller; calls the ensure function; returns its result |
| Entry-point guard | Lists `setupActivityDependencies` and nothing else new; the whole guard test passes |
| Invariants | `npm run test:invariants` passes without `UPDATE_GOLDEN`; `schema.json` is unchanged |

The full suite (`npm test`, `npm run test:migration`, `npm run test:invariants`, `npm run check:tailwind`) passes before
the commit.

## 7. What this plan does not do

- Read the sheet, parse or validate rows, or enforce anything (steps 2 to 8 of the engine plan).
- Insert any data rows, including the three release rows.
- Implement `ensureSheet_`; that is ENSURE-SHEET-PLAN.md and lands first.
- Create `TitleLog` or implement `setupTitleStorage`.
- Edit `SHEET_NAMES`, `FIELD_DEFINITIONS`, any existing sheet, or the invariants snapshots.
- Add the sheet to the weekly, review or reporting code paths.

## 8. Commit and rollout

- **Order.** `ensureSheet_` (ENSURE-SHEET-PLAN commits 1 and 2) is merged first, then **catalog v1**
  ([SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md), "Sheet catalog", build order), which holds this sheet's
  definition. This plan is built after both.
- One commit containing the new module, the new test file, the `package.json` script entries and the entry-point guard
  entry. No other source file changes.
- To use it, the deployer runs `setupActivityDependencies` once in the editor. The check that it worked is a green,
  visible sheet with one header row, and `{created: true, repaired: []}` returned.
- Rolling back is deleting the sheet by hand and reverting the commit. No existing data depends on it.

## 9. Decisions

1. **Where the name and headers live.** Decided: the sheet catalog, `sheet-columns.js` (section 4), so the frozen
   `schema.json` snapshot is not touched. The setup module holds only the setup and formatting functions. The
   alternative, adding `ACTIVITY_DEPENDENCIES` to `SHEET_NAMES`, changes the snapshot and needs the reviewed
   schema-change path.
2. **Sheet protection.** Decided: none (section 5).
3. **The Active dropdown and plain-text formatting.** Decided: yes, through `onCreate` only.
4. **A temporary public function.** Decided: `setupActivityDependencies` now, removed when `setupTitleStorage` exists.
5. **Header comparison.** Decided: `textEquals_` (trimmed, case-insensitive), done by the helper, matching the existing
   sheets. The engine's loader uses the same comparison.

## 10. Follow-ups in other plans

- **ACTIVITY-DEPENDENCIES-PLAN.md** section 6 says the parser checks "sheet present and headers correct" and section 4
  says the layout is frozen. With header-name reading and silent repair, "headers correct" should mean "every required
  header present (by name)", and extra columns are ignored. That plan needs a one-line change; it is not made here.
- **TITLE-REVISION-PLAN.md** section 4 says setup "creates `TitleLog` and `ActivityDependencies` with headers if they are
  absent". It will call `ensureSheet_` for both. Not changed here.
