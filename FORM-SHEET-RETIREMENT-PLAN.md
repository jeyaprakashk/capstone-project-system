# Form-bound sheet retirement: plan

Status: proposal. Nothing in this file has been applied, and AGENTS.md is not edited by it.

This plan retires every sheet that a Google Form fills, starting with `TeamIntakeRaw`. It comes **before**
[SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md), which leaves these sheets untouched. It does not repeat the
title work: the code removal is already in [TITLE-REVISION-PLAN.md](TITLE-REVISION-PLAN.md) and is referenced, not copied.
Where the two differ, the title plan wins until the changes in section 4 are applied to it.

**Position in the build order:** steps 2 to 5 run inside the cutover (item 10), so they come **before** the header-name migration (item 12); steps 7 to 9 are item 11 and **may overlap** the migration, because the migration leaves the retiring Form sheet untouched. The full order is in [BUILD-ORDER.md](BUILD-ORDER.md).

## 1. Owner decisions

1. The title plan's new sheets (`TitleLog`, `ActivityDependencies`) are defined and working first.
2. The data that is still needed is then copied out of `TeamIntakeRaw`.
3. `TeamIntakeRaw` is then **deleted**.
4. There is no other Form. The owner confirms the weekly Form mentioned in WEEKLY-PROGRESS.md was never created by them
   and its archive sheets do not exist. Section 2 checks the repository against this.
5. The intake Form is already **closed**, and the uploaded files have already been moved into the individual team folders
   under the shared drive; every eligible existing file was moved.
6. The guide dashboard's document-submission date comes from the Drive upload record, with "Date unavailable" for older
   files.
7. A values-only archive of the Form history is kept for one semester, as a `view` sheet.

## 2. Inventory (from the repository)

**The intake Form is the only Form that the code still depends on.**

| Item | Where | Notes |
|---|---|---|
| Sheet constant | `TEAM_INTAKE_RAW: 'TeamIntakeRaw'` in [common-constants.js:14](common-constants.js#L14); pinned by `tests/invariants/snapshots/schema.json` | Removing it is a deliberate schema change (section 4, item 3) |
| Form-submit handler | `onTeamIntakeSubmit(e)` in [intake-approval-workflow.js:14](intake-approval-workflow.js#L14), the only function that reads `e.range` or `e.namedValues` | Removed in title plan Phase 4 |
| Form link | `buildTeamIntakeLink_` ([common-helpers.js:483](common-helpers.js#L483)); config keys `TEAM_INTAKE_FORM_URL_BASE`, `TEAM_INTAKE_TEAMID_ENTRY`; used in [student-api.js:36](student-api.js#L36) | Removed in title plan Phase 4 |
| Reader of the sheet | `readGuideRecordContext_` in [guide-dashboard.js:60](guide-dashboard.js#L60): reads `Team ID`, `Timestamp`, `Work Breakdown Document`, `Need Analysis Report` by header name to show each team's latest document-submission date | Replaced under the title plan's Guide phase; see section 3 |
| Columns the Form wrote | `Timestamp`, `Email Address`, `Team ID`, `Project Title`, `Problem Statement`, `Work Breakdown Document`, `Need Analysis Report` | From the handler's `nv(...)` calls |
| Uploaded files | Drive files created by the Form's file-upload questions; `TeamIntakeRaw` holds their links | The title plan copies them into each team folder at cutover (its section 11, step 3) |
| Tests | `tests/title-intake.test.cjs`, intake cases in `tests/team-github-setup.test.cjs`, fixtures in `tests/guide-weekly-browser.test.cjs` and `tests/student-fixture.cjs` | Removed or updated with the code |

**What I did not find:** any `FormApp`, any other form-submit handler, any other form URL or form ID in the source,
any other `e.namedValues` use, or any other config key for a Form. `GitHubAccounts` is application-owned (owner
confirmed).

**Not provable from the repository, so the owner must check the live spreadsheet and Drive:**

- **The weekly Google Form in WEEKLY-PROGRESS.md.** That document (lines 98 to 99 and 161 to 163) refers to a retired weekly
  Form, "its historical responses and RawLog". The owner confirms that Form was never created and those sheets do not
  exist, so nothing here applies to them; the wording in that document describes an environment this spreadsheet never
  had (section 4, item 4).
- Any response sheet with a default name such as `Form Responses 1`: the owner should glance at the sheet tabs once
  during step 2 to confirm none other than `TeamIntakeRaw` is Form-filled.
- The intake Form's trigger: the owner states the Form is closed, but the plan records no statement that its trigger was
  deleted. Step 3 below checks it.

## 3. What data is still needed, and where it goes

`TeamIntakeRaw` holds the Form-period history. The code needs only one piece of it: the guide dashboard's per-team
"latest document-submission date". Everything else is an audit record.

| Piece of data | Needed by | Recommendation |
|---|---|---|
| Current title and problem per team | The title baseline | Already in `TeamStatus`; copied into `TitleLog` as the baseline row (title plan section 11). Nothing more is needed from `TeamIntakeRaw` |
| Per-team latest document-submission date | Guide dashboard | **Decided:** read from the Drive upload record in the team folder (what the title plan defines); "Date unavailable" for files uploaded before the dashboard recorded them. Nothing is copied for this |
| Full submission history (who, when, title, problem, links) | Audit only | **Decided:** a values-only archive sheet, access `view`, kept for one semester (decision 2 below) |
| The uploaded files | Students, guides, reviewers | **Already done:** every eligible existing file was moved into the individual team folders under the shared drive. Files stay in Drive; they are not deleted with the sheet |

## 4. Changes this plan requires elsewhere

| # | Where | Change |
|---|---|---|
| 1 | TITLE-REVISION-PLAN.md, section 13, rule 3 ("Keep `TeamIntakeRaw` ... they are the record of the Form period") | Reword: the Form-period record is copied (open decision 2) and `TeamIntakeRaw` is then deleted. The TeamStatus title columns are unaffected |
| 2 | TITLE-REVISION-PLAN.md, section 9 removal table and Phase 8 | Add the deletion of the sheet as a step after the verification period (section 5, step 8), and the removal of the `TeamIntakeRaw` document-date reader as already listed |
| 3 | AGENTS.md "Frozen" bullet (sheet names) and the invariants snapshot | **Policy item.** Removing `TEAM_INTAKE_RAW` from `SHEET_NAMES` changes `tests/invariants/snapshots/schema.json`. AGENTS.md allows `UPDATE_GOLDEN=1` only for a deliberate, reviewed change made outside a migration, so this is its own reviewed commit (section 5, step 9). AGENTS.md text itself needs no edit: the frozen rule already allows a deliberate, reviewed schema change |
| 4 | WEEKLY-PROGRESS.md | Lines 98 to 99 and 161 to 163 describe a retired weekly Form and archives that this spreadsheet never had. Reword or delete those lines so the documentation matches the environment. Documentation only |
| 5 | SHEET-HEADER-MATCHING-PLAN.md | Already says retirement comes first. After this plan runs, the "Retiring sheets" section there shrinks to a note that none remain |

## 5. Procedure and order

Code removal follows the title plan's phases (R0, Phase 4, Guide phase, Phase 8). This plan adds the data and sheet steps
around them.

**Code availability.** The preflight (3a), the archive copy (4) and the verification (5) run as editor-run functions
(`requireTriggerOrOperator_()`, listed in the entry-point guard) in a temporary module. They are not in Release 0. They
become available when the new code is pushed without a new deployment, as set out in
[TITLE-REVISION-PLAN.md](TITLE-REVISION-PLAN.md) section 11 ("Code availability before the web app is deployed", step 0),
and run before step 5 of that cutover (the new web-app deployment). During that interval users still run the Release 0
deployed version, which no longer matters to these functions: they only read `TeamIntakeRaw` and write the archive.
The functions are removed in step 9 of this plan, which needs one more push; no deployment is needed to remove them,
because users never ran them.

| Step | When | Work |
|---|---|---|
| 1 | Title plan Phases 1 to 2 | `TitleLog` and `ActivityDependencies` exist (through `ensureSheet_`) and are tested. Nothing reads them yet |
| 2 | Before cutover | **Back up** the whole spreadsheet (a full copy). Record the row count of `TeamIntakeRaw` and a per-team count of rows |
| 3 | Cutover (title plan section 11) | The Form is already closed and the uploads are already in the team folders (owner confirmed), so those two actions are done. **Remaining:** confirm the Form's trigger is deleted (Apps Script, Triggers), and check each team folder for the two fixed file names, as the title plan's cutover step requires |
| 3a | Cutover | **Preflight (read-only).** Check the live source before anything is created, as set out in "Preflight" below. If the source headers are not acceptable, stop; nothing has been changed |
| 4 | Cutover | **Copy.** Create the archive sheet with `ensureSheet_({...sheetSpec_('formArchive', verifiedHeaders), mode: 'setup'})` (access `view`; the
preflight's header row, the source's own or the recorded de-duplicated one, is the `verifiedHeaders` argument), because the archive's catalog entry has `headersFrom: 'runtime'` and no fixed
header list, then copy the data with the **native range paste of values only** (data rows only: `source.getRange(2, 1, rows - 1, columns).copyTo(archive.getRange(2, 1), PASTE_VALUES)`; row 1 is never pasted, because `ensureSheet_` has already written the archive's header row, which may differ from the source's), not by building strings in code. A native paste keeps each cell's type, so a text cell stays text, a date stays a date, and a string that starts with `=`, `+`, `-` or `@` is not re-parsed as a formula. No cell is written one at a time. See "Copy and verification" below |
| 5 | Cutover | **Verify every row and every field** before anything is deleted, as set out in "Copy and verification" below. One mismatch stops the process. Keep the verification report |
| 6 | After cutover | Title plan **Phases 4 to 8** are complete: the handler, the Form link and the guide dashboard's reader of `TeamIntakeRaw` are removed (Phases 4 and 5), and Phase 8 removes the remaining old readers and adds the removal-check test. **The removal check must pass before step 7 starts**, so the rename cannot be the only thing standing between a reader and the sheet |
| 7 | Rename test and verification period | Starts only after step 6, including Phase 8's removal check. **Rename `TeamIntakeRaw` to `TeamIntakeRaw_retired`** (reversible, no data lost) and then run the live system for the period in open decision 4. A reader that still looks the sheet up by its old name now finds nothing. The sheet is stale: the Form is closed, no row is added, and the live system runs on `TitleLog`, `ActivityDependencies` and the team folders. See "Why a rename and not just a wait" below |
| 8 | End of verification | **Unlink the Form from its response sheet** (Form, Responses tab) so the sheet is not recreated, then **delete `TeamIntakeRaw_retired`**. Verify the unlink behaviour in the live Form before relying on it. The Form itself stays closed and unlinked; its Drive folder is left alone, since the files were already moved |
| 9 | After deletion | One reviewed commit removes `TEAM_INTAKE_RAW` from `SHEET_NAMES`, regenerates `schema.json` with `UPDATE_GOLDEN=1`, removes the Form config keys from the Config tab and the remaining tests, and extends the removal-check test so no runtime reference remains |

### Preflight (step 3a)

`ensureSheet_` rejects a blank header cell and a duplicate header (compared with `textEquals_`: trimmed, case-insensitive).
A Form's headers are its question texts, so they may be blank or may repeat. The preflight, run before the archive is
created and without changing the source, checks the live `TeamIntakeRaw`:

- row 1 is the header row and the sheet has data rows below it;
- no header cell is blank, and no two headers are equal under `textEquals_`;
- the archive name is not already used by another sheet;
- the sheet is the only form-bound sheet (a glance at the tabs, as in step 2).

It returns a report: the header list, any blank or duplicate headers by column position, and whether the sheet is acceptable.

**If the headers are acceptable,** the archive uses the source header row as it is.

**If they are not (stop path).** Nothing is created and the source is not touched. The owner chooses one of:

1. **De-duplicated archive headers (recommended).** The archive's row 1 uses the source headers, with a blank header
   replaced by `Column <letter>` and a repeat made unique by appending ` (2)`, ` (3)`. A generated name can itself collide
   with another header (a real header already called `Column B`, or `Question (2)`), so the **final archive header list
   must be unique under `textEquals_` before `ensureSheet_` is called**: each generated name is checked against every other
   header in the final list, source or generated, and is adjusted (the suffix is incremented, or `Column <letter>` becomes
   `Column <letter> (2)`) until no two entries are equal. The check is repeated on the finished list, and if it still
   contains a duplicate the process stops. The renaming applies to the archive only, and the mapping from archive header to
   source column position is written into the verification report. The full
   comparison (below) then compares by column position, so the data still has to match cell for cell.
2. **Stop and decide otherwise,** for example to archive by a native sheet copy outside `ensureSheet_`.

The source sheet is never edited to make the headers acceptable.

### Copy and verification

**Copy method (step 4).** The archive's header row is the preflight's header row, so the archive carries the Form's own
column names (or the recorded de-duplicated ones), written by `ensureSheet_`. The **data rows, from row 2 down,** are
pasted values-only by the native range copy, so the paste can never overwrite a de-duplicated archive header. A one-off,
editor-run function does this and the check below. It starts with `requireTriggerOrOperator_()`, is listed in the entry-point guard, lives in a temporary module, and is
removed in step 9 with its guard entry. It reads through the shared reader (`readSheetRows_`), so the existing source audit
still passes.

**Verification (step 5) compares everything, not a sample.** For every source row and every column, the archive's value
must equal the source's value in **type and content**:

- the number of rows and the number of columns match;
- **row 1 (headers):** if the preflight accepted the source headers, the archive's row 1 equals the source's row 1
  exactly. If the preflight recorded a de-duplicated header row, each archive header must equal the recorded mapping for
  its column position, and the mapping is shown in the report. The two header rows are not required to be identical in
  that case;
- **no formula anywhere:** after every copy, on both the plain values-only path and the rich-text fallback path, every
  cell of the archive is checked and none holds a formula (see the audit exemption below);
- every cell matches, compared as typed values (a string against a string, a date against a date by timestamp, a number
  against a number), so a link or text that the copy changed cannot pass;
- the two document-link columns (`Work Breakdown Document`, `Need Analysis Report`) are compared exactly, including cells
  that hold several links, and every such cell is non-empty in the archive if it was non-empty in the source;
- every source string that begins with `=`, `+`, `-` or `@` is found in the archive as the identical string. If the
  paste had turned one into a formula, the archive would return a computed value or an error and the comparison fails;
- any source cell that holds a rich-text hyperlink whose visible text differs from its URL is reported, because a
  values-only paste would keep the text and lose the URL. If any exist, the **fallback** applies (below);
- the report lists the counts and each mismatch by row number and column header, with no cell values in the log.

Zero mismatches is required. The report is kept with the step 2 backup. Step 8 does not start without it.

**Fallback for rich-text links.** A native sheet copy is not used, because it can carry formulas into a sheet that must be
values-only. Instead, after the values-only paste, the source's rich-text values are applied to the archive range for the
affected cells only (`getRichTextValues` on the source, then `setRichTextValues` on the same cells of the archive). That
restores each link's URL and text without writing a formula. The archive stays values-only, and the **same full
comparison, including the no-formula check, is run again on the result**, with one addition: for every rich-text cell the
archive's link URLs equal the source's, in order. If any check fails, the process stops before step 8.

The no-formula check, which runs after every copy, needs `getFormulas`, which the existing source audit in
`tests/sheet-reads.test.cjs` rejects outside the shared reader. The temporary module is therefore added to that audit's exemption for `getFormulas` in the same commit
as step 4, and the exemption is removed in step 9 with the module. This is a deliberate, temporary, reviewed test change.

### Why a rename and not just a wait

Waiting does not prove that nothing depends on the sheet: a reader that was missed keeps working for as long as the sheet
exists, and fails only after it is deleted. The evidence that no reader remains is therefore the removal-check test (a
search for the sheet's name and constant in the runtime files) **plus the rename in step 7**, which turns a hidden
dependency into a failure while the data and the backup still exist. Two limits apply: a reader that catches its own error
can degrade quietly (the current guide dashboard shows "Date unavailable"), so during the period the guide, student,
reviewer and coordinator dashboards, the weekly submission, and the digests must each be exercised and checked for degraded
output; and a code path that runs only at a particular time can stay hidden until it runs. The rename is undone by
renaming the sheet back.

**Why this order.** The sheet is deleted last, after the readers are gone and after a period with nothing depending on
it. The constant is removed after the sheet, so the code never refers to a sheet that exists nowhere while still
expecting it. The guide dashboard's existing `try` falls back to "Date unavailable" if the sheet is missing, so a
premature deletion degrades one date and does not break the dashboard, but the order above avoids it anyway.

**Rollback.** Before step 8, nothing is lost: the sheet and the backup exist, and the step 7 rename is undone by renaming
back. After step 8, restore from the step 2 backup
(copy the sheet back into the live spreadsheet) and revert the step 9 commit. Step 9 is the only step that cannot be undone
by restoring a sheet alone, which is why it is separate and comes last.

## 6. Tests and checks

- **Copy verification** (step 5) is an operator checklist with recorded counts, not a unit test.
- **Removal check:** the title plan's grep test is extended with `TEAM_INTAKE_RAW`, `TeamIntakeRaw`,
  `buildTeamIntakeLink_`, `onTeamIntakeSubmit`, `TEAM_INTAKE_FORM_URL_BASE` and `TEAM_INTAKE_TEAMID_ENTRY`. After step 9
  it allows no match in runtime files; the exclusion list is the title plan's (documentation and golden fixtures only).
- **Guide dashboard:** its test for the document-submission date is rewritten against the Drive upload record, including
  the "Date unavailable" case for older files.
- **Invariants:** `npm run test:invariants` fails until step 9 regenerates `schema.json`, and only step 9 may do so.
- The full suite (`npm test`, `npm run test:migration`, `npm run test:invariants`, `npm run check:tailwind`) passes at each
  commit.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The copy loses or changes a value | Step 5 compares every cell by type and content, including document links and formula-like text; one mismatch stops the process; the step 2 backup remains |
| A values-only copy drops a hyperlink | The verification reports rich-text links with differing text; the rich-text fallback restores them without formulas and the full comparison, link URLs and a no-formula check run again |
| The Form's headers are blank or repeat, so `ensureSheet_` would reject them | The step 3a preflight finds this before anything is created; the archive uses recorded de-duplicated headers or the process stops; the source is never edited |
| The Form recreates a response sheet | The Form is already closed (owner); step 3 confirms its trigger is deleted; step 8 unlinks it before deleting the sheet |
| Uploaded files are lost with the Form | Files live in Drive, not in the sheet; they are already in the team folders; the Form's folder is left alone |
| A forgotten second Form or response sheet | The owner confirms there is none; step 2 includes a glance at the sheet tabs |
| A trigger on the closed Form still exists | Step 3 checks the trigger list |
| A reader is missed and breaks after deletion | The removal check plus the step 7 rename, which makes a missed reader fail while the sheet still exists; the period is only the time in which to exercise it; the backup remains |
| The stale sheet is mistaken for live data during the verification period | Only coordinators can open the spreadsheet; the archive copy is clearly named; the sheet is deleted at the end of the period |
| Removing the constant changes the frozen snapshot | Done only in step 9, as a deliberate reviewed commit |

## 8. Decisions

Decided by the owner (or delegated and recorded):

1. **Guide document-submission date:** from the Drive upload record, "Date unavailable" for older files. (Delegated to the
   assistant's recommendation.)
2. **Form-period record:** a values-only archive, kept for one semester, as a `view` sheet created through `ensureSheet_`
   (for example `TitleFormArchive`). After a semester it can be deleted.
3. **Weekly archive sheets:** none exist. Nothing to do.
5. **The Form and its Drive folder:** already closed, with the files moved. Left closed and unlinked.

4. **Verification period (step 7). Decided: 14 days, or until both a weekly submission deadline has passed and one reviewer
   decision has been made, whichever is later.** During it, each dashboard (student, guide, reviewer, coordinator) is
   opened at least once and checked for "unavailable" or blank values where data used to appear; the weekly submission and
   the digests must also have run against the renamed sheet. The rationale follows. This is the wait between "the new flow is live" and "delete `TeamIntakeRaw`".
   - **State during the wait.** The sheet exists, renamed `TeamIntakeRaw_retired`, and is stale: no new rows, no readers,
     and the live system works entirely on the new sheets and folders. Its cost is one unused tab that only coordinators
     can see.
   - **Purpose.** The wait itself proves nothing, because a missed reader would keep working while the sheet exists. What
     exposes a missed reader is the rename, and the period is the time in which the dashboards, the weekly submission and
     the digests are exercised against the renamed sheet, so a failure appears while the data and the backup both still
     exist and the fix is a code change and not a restore.
   - **Not shortened.** The archive copy (step 4, fully verified in step 5) and the backup (step 2) already preserve the
     data, and the rename and wait guard against a reader that the tests and the removal-check grep missed. The period
     is the decided minimum, so there is no shortening option. It may be **extended** (for example if a dashboard or job
     was not exercised), and nothing is deleted before it ends.
   - **Length.** Fixed as above: the 14-day floor plus the two events that read team and title data most (a weekly
     deadline and a reviewer decision), then delete. In practice about two to three weeks.
