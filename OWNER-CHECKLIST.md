# Owner checklist

What **you** do by hand, in order. Everything else is developer work and is not listed. The steps come from
[TITLE-REVISION-PLAN.md](TITLE-REVISION-PLAN.md) (section 11) and [FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md);
if they differ from this page, those plans win. Your steps belong to items 9 to 11 of [BUILD-ORDER.md](BUILD-ORDER.md); the order of the whole work is there. Nothing here applies until the code is built. Nothing has been built yet.

## A. Now: checks in the live spreadsheet (read-only, no changes)

1. **Tabs.** Look at every tab. Confirm that `TeamIntakeRaw` is the only tab a Google Form fills.
2. **Typed formulas.** In Sheets, press `Ctrl+F`, tick "Search within formulas", search for `=`. Note any formula, chart or
   pivot table that points at a column of a sheet the system reads.
3. **Duplicate headers.** On each sheet the system reads, check that no two column titles are the same.
4. **Shared drive.** Confirm no student is a member of the shared drive that holds `Team Documents`, directly or through a
   group.
5. **Triggers.** In Apps Script, open Triggers (under every account that installed any). Write down each time-driven
   trigger and confirm the old Form-submit trigger is **deleted**.
6. **Team folders.** Open each team folder and confirm it has `Step1_Work_Breakdown.docx` and `Step2_Need_Analysis.docx`.

### Results of the Section A check (Codex, read-only, 2026-10-11, two runs)

The second run was later the same day, after you removed two tabs and unlinked the Form: 21 tabs, no tab shows a linked Form
(`TeamIntakeRaw` included), no formulas in any tab (a Find for `=` also matched ordinary link text, so only the formula-value
scan counts), and the trigger list and team-folder exceptions are unchanged. The table shows the first run, with the later
state noted.

| # | Result | What it means, and what you do |
|---|---|---|
| 1 | **First run:** 23 tabs; linked Forms on `Announcements`, `TeamIntakeRaw` and `RawLog`. **Second run:** 21 tabs, `Announcements` and `RawLog` gone, no linked Form on any tab | Resolved by your removals; no code read either tab. Nothing to decide now (FORM-SHEET-RETIREMENT-PLAN.md, section 2a). `TeamIntakeRaw` is now an ordinary tab |
| 2 | **No formulas** in any of the 23 tabs; no named ranges or charts. Pivot tables and filter views were not established | Good for the migration's write rule (no formulas to flatten). **You glance** at each tab's menu for pivot tables and filter views |
| 3 | **Pass.** No duplicate or blank titles in row 1 of any tab | Nothing to do |
| 4 | **Pass, with a gap.** 2 direct users and 1 group on the shared drive; no direct student. The group's members were not inspected | **You confirm** the group is faculty only. A group that contains students is forbidden (TITLE-REVISION-PLAN.md, operator rule 6) |
| 5 | **Not as expected.** Six triggers; `onTeamIntakeSubmit` (form submit) is still installed | Deleted at cutover step 0. The two title-reading triggers to pause are `reconcileProgressEligibility` and `sendGuideReminderDigest`; the reviewer digest is not scheduled |
| 6 | **Not complete.** 62 team folders; 55 have both files. Missing both: `g8`, `g45`, `g35`, `g34`, `g32`, `g11`. Missing `Step2_Need_Analysis.docx`: `g46`. No duplicates | These seven teams cannot submit a title under the new flow until they upload the missing documents (the requirement rows). Cutover step 8 tells them. **You decide** whether to chase the documents before cutover |

## B. Before cutover

7. **Release 0.** After the developer pushes it, create the deployment version yourself. Do it **at least a day before**
   cutover so open pages reload.
8. **Rehearsal on a copy.** Make a copy of the spreadsheet and run the whole cutover on it (the developer prepares this).
   Confirm three things: editor-run functions use the pushed code, the web-app deployment stays on the old version, and
   triggers pick up the new code.
9. **Backup.** Make a full copy of the live spreadsheet. Write down the number of rows in `TeamIntakeRaw` and the number of
   rows per team.
10. **Check the live script is attached to the live spreadsheet** before the release that contains the spreadsheet-resolution
    change (BUILD-ORDER.md item 5c). Open the live spreadsheet, choose Extensions, Apps Script, and confirm the project is the
    one in `.clasp.json`. Then compare the spreadsheet's own ID (in its address) with the `SHEET_ID` script property: they
    must be the same. If they differ, stop and tell the developer: the new code would switch to the attached spreadsheet.
    On the rehearsal copy no `SHEET_ID` is needed, because the copy uses itself.

### Rehearsal log (copy "Branch of Capstone Tracker - Batch 2023-27", 2026-10-11)

Code on the copy: `main` at `e20ade9` (Release 0 plus the spreadsheet-resolution change), pushed with `clasp push`.

| Check | Result |
|---|---|
| `setupActivityDependencies` created the `ActivityDependencies` tab in the **copy**: five headers in order, first row frozen, Yes/No list in column E from row 2, green visible tab, no data rows | **Pass** (screenshot) |
| The live spreadsheet did **not** get the tab (the copy resolved itself, not the original) | **Pass** (owner checked) |
| A second `setupActivityDependencies` run changed nothing and made no second copy of the tab | **Pass** (owner checked) |
| `setTitleCutover('PAUSED')` returned `{"ok":true,"value":"PAUSED"}` and the property read `PAUSED` | **Pass** |
| `clearTitleCutover()` returned `{"ok":true,"was":"PAUSED"}` and the property was unset | **Pass** |
| `setTitleCutover('LIVE')` returned `{"ok":true,"value":"LIVE"}` | **Pass** |
| `clearTitleCutover()` while `LIVE` refused with "Cutover is LIVE; fix forward." and left `LIVE` unchanged | **Pass** |
| `setTitleCutover('PAUSED')` from `LIVE` was allowed; then `clearTitleCutover()` unset it | **Pass** |
| `setTitleCutover('banana')` refused with "setTitleCutover accepts only 'PAUSED' or 'LIVE'." and changed nothing | **Pass** |
| Final state: `TITLE_CUTOVER` unset | **Pass** |
| **Web app on the copy** (Part 2): with `TITLE_CUTOVER` = `PAUSED`, Approve on the dummy team `ZZTEST` in the Guide dashboard refused with "Title updates are paused. Reload the dashboard shortly." and the team stayed "Needs Your Review" | **Pass** (screenshot) |
| With `TITLE_CUTOVER` = `LIVE`, Approve refused with "Reload the dashboard." and the team stayed "Needs Your Review" | **Pass** (screenshot) |
| With `TITLE_CUTOVER` unset, Approve worked as before: the team moved to "Awaiting Reviewer" with "You approved — awaiting Reviewer." | **Pass** (screenshot) |
| The deployed web app of the copy showed the dummy team that exists only in the copy, and the copy has **no** `SHEET_ID` property (owner confirmed), so `getActiveSpreadsheet()` works from a deployed web app of the bound script | **Pass** |
| The Guide Decision cell for the dummy team became `Approved` (screenshot) | **Pass** |
| The "Guide-Approved Title" email to `COORDINATOR_EMAIL` | **Accepted as sent, not seen.** The owner had not changed `COORDINATOR_EMAIL` on the copy, so the message went to the original coordinator address, not to the owner. The dashboard reported success, which means the send did not throw. It was not read in a mailbox |

What this confirms on real Google, beyond the local tests: editor-run functions use the pushed code; `ensureSheet_` creates a
sheet with the right tab colour, header row and formatting; `getActiveSpreadsheet()` resolves the copy for an editor run; the
script lock and script properties behave as the barrier assumes for `setTitleCutover` and `clearTitleCutover`.

**Not yet rehearsed:**
- the reviewer decision path under `PAUSED`, `LIVE` and unset (it uses the same barrier code and has its own tests; optional on the copy);
- the Form handler (cannot be exercised: the Form is unlinked);
- `getActiveSpreadsheet()` from a time-driven trigger (the property fallback covers it if it fails);
- the manifest comparison for the live project (answer **N** to the overwrite prompt there until compared);
- the cutover steps themselves (step 0 to 9), pushed code versus deployed version, and trigger pickup of new code.

## C. Cutover day

Follow the order. Stop and ask if any step does not behave as written.

| Step | You do |
|---|---|
| 0 | **You pause and delete first**, on the Triggers page, under every account that installed one. **Pause** `reconcileProgressEligibility` and `sendGuideReminderDigest` (the two installed triggers that read title state; the other time-driven ones keep running). **Delete** the `onTeamIntakeSubmit` form-submit trigger. Write down each paused trigger's handler, schedule and owner, then reopen the Triggers page and confirm the two are not active and the Form trigger is gone. **Only then** does the developer run `npm run push` (no new deployment) |
| 1 | In the editor, run `setupTitleStorage`. Type the three `ActivityDependencies` rows with `Active = Yes` (the developer gives you the exact rows) |
| 2 | Run `setTitleCutover('PAUSED')` and wait for it to return |
| 3 | Run the archive **preflight**. If it reports bad headers, stop and decide with the developer |
| 4 | Run the archive **copy**, then the **verification**. It must report **zero mismatches**. Keep the report |
| 5 | Copy the baseline into `TitleLog` from `TeamStatus` as it stands |
| 6 | **Deploy the new version** (new deployment version of the web app) |
| 7 | Run `API_coordinator_validateTitleLog` and check the requirements card until both are clean. Then **restore the triggers** you paused in step 0 (they stay paused until now) |
| 8 | Check the requirement list of teams at `NOT_SUBMITTED` or `RETURNED` and tell teams that are not ready |
| 9 | Open each role's dashboard read-only, then run `setTitleCutover('LIVE')` and announce |

**If something goes wrong before step 9, do this in order** (the barrier stays on until the old version is back):
1. Leave `TITLE_CUTOVER` at `PAUSED`.
2. Redeploy the previous web-app version.
3. Have the developer push the previous code again.
4. Check that the deployment and the saved code are both the previous ones.
5. Run `clearTitleCutover()`. Never delete the property by hand; it refuses once the value is `LIVE`.
6. **If you had paused triggers in step 0 and not yet restored them (before step 7 of the cutover), restore them now,**
   from your record of each trigger's handler, schedule and owner, and reopen the Triggers page to check. Do this only
   after step 4 confirmed that the previous version is back. Otherwise the weekly jobs and digests stay stopped. After step 9 the fix goes forward; there is no easy rollback.

## D. After cutover

10. **Rename the old sheet.** When the developer says the old-reader removal check has passed, rename `TeamIntakeRaw` to
    `TeamIntakeRaw_retired`.
11. **Wait.** At least **14 days**, and until **a weekly submission deadline has passed** and **one reviewer decision has been
    made**, whichever is later. During that time, with the sheet renamed:
    - open the student, guide, reviewer and coordinator dashboards at least once and look for "unavailable" or blank values
      that used to show data;
    - make a **weekly submission** (and a revision) from the student dashboard and confirm it saves;
    - confirm the **weekly job** has run (the weekly schedule trigger) and the **guide and reviewer digests** have run, and
      that none of them reported an error in the Apps Script execution log.
12. **Delete.** If all is normal: unlink the Form from its response sheet (Form, Responses tab), then delete
    `TeamIntakeRaw_retired`. The developer then makes the final code change.
13. **Config.** Remove the old Form settings (`TEAM_INTAKE_FORM_URL_BASE`, `TEAM_INTAKE_TEAMID_ENTRY`) from the `Config` tab.
14. **Archive.** Keep the Form archive sheet for one semester, then delete it.

## E. Rules to keep

- Everything is committed on `main`; there is nothing to merge. After Release 0 is deployed, **do not run `npm run push`**
  until cutover step 0, except for a hotfix made from the `release-0` tag (see [BUILD-ORDER.md](BUILD-ORDER.md), "Branching
  rule"). `main` holds unfinished title code in that period.

- Do not edit `TitleLog` after cutover.
- Never edit the `TITLE_CUTOVER` property by hand; only `setTitleCutover(...)` and `clearTitleCutover()` change it. To pause title writes later, run
  `setTitleCutover('PAUSED')`, then `setTitleCutover('LIVE')`.
- Never add students, or a group that contains students, to the shared drive.
- Before starting the next semester's spreadsheet, run the registry export on this one.
- Do not move, rename or delete columns on the sheets. The code will tolerate it later, but that is a separate decision.

## F. Questions that are still open

- Whether to accept the migration phase order (journals last) and the fake GitHub and Drive test layers. Say "accept".
