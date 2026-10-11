# Build order

The single, authoritative order in which the planned work is built and run. Every plan points here and states its own
position. If a plan and this page disagree about order, this page is corrected first, then the plan.

Nothing in the table has been built yet. "Needs" means the item cannot start, or cannot go live, until those are done.

| # | Work | Plan | Needs | Enables |
|---|---|---|---|---|
| 1 | `ensureSheet_`, first commit: the helper and its tests, repair branch **disabled** | [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md) | none | 2, 3 |
| 2 | `ensureSheet_`, second commit: the AGENTS.md items and repair **enabled**. Merged before any caller | ENSURE-SHEET-PLAN.md (sections 7, 10) | 1 | any caller (4, 6, 10) |
| 3 | **Catalog v1**: `sheet-columns.js` with the new sheets only, `sheetSpec_`, the catalog test, the `SHEETS.md` builder | [SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md) ("Sheet catalog", build order) | 1 | 4, 6, 10 |
| 4 | The `ActivityDependencies` sheet and the temporary `setupActivityDependencies` | [ACTIVITY-DEPENDENCIES-SHEET-PLAN.md](ACTIVITY-DEPENDENCIES-SHEET-PLAN.md) | 2, 3 | 6, 7 |
| 5 | Title plan **Phase 0** (golden masters) and **Release 0** (locks, `setTitleCutover`, `clearTitleCutover`). Independent of 1 to 4; Release 0 is deployed at least a day before the cutover. **5a Release 0: built** (`title-cutover.js`, the three old writers, `tests/title-cutover.test.cjs`; tagged `release-0`). **5b Phase 0: not yet built** (golden masters and the `getTeamGithubSetup_` / `findTeamFolder_` stubs) | [TITLE-REVISION-PLAN.md](TITLE-REVISION-PLAN.md) | none | 10 |
| 6 | Title plan **Phase 1**: `setupTitleStorage` (creates `TitleLog` and `ActivityDependencies` from the catalog), title service, `titleGate_`. Removes `setupActivityDependencies` | TITLE-REVISION-PLAN.md | 3, 4 | 7 |
| 7 | **Engine**: the title plan's Phase 2 (`activityPreconditions_`, the two checks, `API_coordinator_getRequirements`, the upload integration) | [ACTIVITY-DEPENDENCIES-PLAN.md](ACTIVITY-DEPENDENCIES-PLAN.md) (section 10) | 6 | 8 |
| 8 | Title plan **Phases 3 to 8**: downstream readers, the student, guide, reviewer and coordinator slices, old-reader removal and the removal check | TITLE-REVISION-PLAN.md | 7 | 9 |
| 9 | Title plan **Phase 9**: rehearsal on a copy of the spreadsheet, including a dry run of the archive steps and the three Apps Script behaviours to confirm | TITLE-REVISION-PLAN.md, [FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md) | 5, 8 | 10 |
| 10 | **Cutover** (owner steps 0 to 9), with retirement steps 2 to 5 (backup, preflight, archive copy, full verification) inside it | TITLE-REVISION-PLAN.md section 11, FORM-SHEET-RETIREMENT-PLAN.md, [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | 9, Release 0 deployed | 11, 12 |
| 11 | **Retirement tail:** rename `TeamIntakeRaw`, the verification period, unlink and delete, the final schema-snapshot commit | FORM-SHEET-RETIREMENT-PLAN.md (steps 7 to 9) | 10 | 13 |
| 12 | **Header-name migration**, phases 0 to 5. Phase 1 completes the catalog. The retiring Form sheet stays out of scope until step 11 removes it | SHEET-HEADER-MATCHING-PLAN.md | 10 | 13, 14 |
| 13 | The AGENTS.md **policy decision** about column layouts (migration phase 6) and dropping the transitional rules | SHEET-HEADER-MATCHING-PLAN.md | 11, 12 | none |
| 14 | **Student identity** work, later, rebased on the header-name `GitHubAccounts` | [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md) | 12 | none |

## Branching rule

All of this work is done on **one branch, `main`**, with one commit per item or sub-step. There is nothing to merge. The
owner pushes `main` to the remote when ready.

The cost of a single branch is that `main` will hold unfinished title code between Release 0 (item 5) and the cutover
(item 10), and `npm run push` pushes the working tree. So:

- **Tag Release 0.** When Release 0 is committed, it is tagged `release-0` (`git tag release-0`). The tag marks the code that
  is in production until the cutover.
- **No `npm run push` between Release 0 and cutover step 0**, except for a hotfix. Cutover step 0 is the first push of the
  new code.
- **A hotfix in that period** is made from the tag, not from `main`: check out `release-0` in a separate working copy,
  apply the fix, push from there, and apply the same fix to `main` afterwards.
- **Items 1 to 4 are safe on `main` and in any push**: they only add code that nothing calls yet, and repair is off until
  item 2's second commit.

## Reading the table

- **Parallel work.** Item 5 can run any time before item 10. Items 11 and 12 can overlap once item 10 is done, because the
  migration does not touch the retiring Form sheet.
- **The two commits of item 1 and 2 are separate** so that repair is never enabled before the AGENTS.md change is reviewed.
- **Inside item 7**, engine steps 2 to 6 need only the fakes and the catalog, so they can be built early; steps 7 and 8
  need the endpoint and the upload.
- **Production changes happen twice.** **Release 0 (item 5)** is a preparatory deployment, made at least a day before the
  cutover; it adds the locks and `setTitleCutover` / `clearTitleCutover` and changes no title behaviour for users. The
  **cutover (item 10)** is the first time the new flow, the new sheets and the live data are touched. Items 1 to 4 and 6 to 9
  are code, tests and a rehearsal on a copy, with nothing deployed to users.
