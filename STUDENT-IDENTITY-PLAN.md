# Student identity: implementation plan

Status: **plan, not implemented.** Nothing described here exists in the code yet.

## Status and next steps

As of 2026-10-07.

| Item | State |
|---|---|
| Plan | Revision 14. All 21 decisions are settled, except the written academic sign-off, which Phase 0 requires. |
| Independent review (Codex) | Reviewed through Revision 3, and again on Revision 6 (four findings). Revisions 4 and 5 addressed the first findings; Revision 7 addresses the Revision 6 findings. An internal review of Revision 7 against the code, a check against DATA-CONTRACTS.md, a check against the existing tests and snapshots, and a conflict check against the plan, the code and `AMBIGUTIES-TO-BE-RESOLVED.md` (none by Codex) are addressed in Revisions 8 to 12. Codex also gave three findings on Revision 10, addressed in Revision 11. **Revisions 4 to 14 have not been re-reviewed by Codex.** |
| Implementation | Not started. No code, sheet or setting has changed for this plan. |
| Backup | An earlier backup of the live spreadsheet has been taken. It is an extra copy only; rollback uses the fresh backup taken in the Phase 5 window. |

**Next steps, in order**

1. Optionally, have Revisions 4 to 14 reviewed before implementation.
2. Phase 0:
   - approve this as a reviewed change to frozen items
   - get written academic sign-off on Decisions 15 to 18 ([Sign-off](#decisions))
   - confirm that only the coordinator can edit the spreadsheet
   - prepare the `Students` tab with Student IDs, Student ID and Register Number columns as plain text
   - add the `Student n Student ID` columns to `TeamRoster` and fill every slot with a Student ID
   - reconcile `TeamRoster` with `TeamStatus`
   - check the live `Semester` values and add the `SEMESTER` Config row (the drain uses the published
     6-minute limit)
3. Phase 1 onwards, one phase at a time, each with `npm test` green.
4. After Phase 1, before Phase 5: the [journal gate](#gate-after-phase-1-inspect-the-live-journals).
   Inspect the result journals with the Phase 1 report and record their content fingerprint.
5. Before the Phase 5 window: choose the [pilot users](#pilot-users), at least one student with an open
   week, one guide and one reviewer, and make sure they are available at that time.

**Continuing in a new session:** start by asking the assistant to read this file and AGENTS.md, then
name the step you are on. Code line links in this plan may drift as the code changes; search for the
named function before relying on a line number.

This plan introduces a `Students` tab and a **Student ID** that every part of the system uses as the
student key. The Student ID holds a student's credits: logs, marks and results. The `Students` row says
which person currently holds that ID, and after the semester is complete the coordinator can move an ID to
another person.

This is a deliberate change to frozen items in [AGENTS.md](AGENTS.md): sheet layout, stored data and
role detection. It is not a dashboard migration, so it follows the reviewed route in Phase 0.

Revision 14 simplifies the plan. A change of person on a Student ID now happens **only after the semester
is complete**, so everything that existed to protect a live reassignment is removed: the page context
tokens, the team-binding scan, the `PrivacyTerms` tab, the stored commit credit and freeze step, the
held GitHub rework, the baseline idea and the second sign-off. Maintenance mode stays, but only for the
one-time cut-over. Earlier revisions added, in order: the `Students` tab and Student ID (Revision 1);
roster slots that hold the Student ID (Revision 6); a coordinator-first access gate; maintenance mode with
a recorded 6-minute drain, *Close* then *Release*, and pilot users; per-sheet migration checkpoints with a
crash-safe result reset and rollback; DTO and test alignment with `DATA-CONTRACTS.md` and the existing
tests; and `PROGRESS_ELIGIBILITY_FIELDS_` listed with the cut-over changes. The earlier text is in git
history.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | `TeamRoster` link to students | Student slots hold the **Student ID**, in new `Student n Student ID` columns. The old `Student n Register No` columns are read only until the cut-over, for the Phase 0 reconcile, and are retired in Phase 6. |
| 2 | Team details | Team ID, semester, guide details, committee and membership come from **`TeamRoster`**, not `TeamStatus`. |
| 3 | Student in `Students` but on no team | Out of scope: no student role. The student role needs **both** a valid `Students` row (found by email) and a valid `TeamRoster` slot holding that row's Student ID. |
| 4 | Student ID format | `<academic year>-<semester>-stud-<4 digits>`, for example `2026-27-odd-stud-0001`. |
| 5 | Who creates Student IDs | **Whoever prepares the sheet.** IDs are already in the `Students` tab and are entered in the `TeamRoster` slots. The app only reads and validates them; it never creates, assigns or changes one. |
| 6 | Cut-over | The **live system** is migrated. |
| 7 | Existing results | Believed to be **dummy data**. Clearing them is a separate decision, taken after the live sheets are inspected at the [journal gate](#gate-after-phase-1-inspect-the-live-journals). |
| 8 | AI model | The [privacy filter](#weekly-log-privacy-filter) **removes known identifiers** from text sent to the AI model: current students and guides, and GitHub details. It does not promise that no personal detail is sent: it cannot recognise a nickname, a misspelling or a name that is on no list. |
| 9 | `MasterRegistry` | Not a student record; unchanged. |
| 10 | Class Number | Stored now, for a future **Class Coordinator** role that is not part of this plan. |
| 11 | Redo | A student does a project once. A redo is in a later semester's spreadsheet, with a new Student ID. |
| 12 | One spreadsheet per semester | Each semester gets a new spreadsheet with the code copied in. No two spreadsheets ever run the same semester. |
| 13 | Semester values | The `SEMESTER` setting, and the semester part of a Student ID, are **`Odd` or `Even` only**. Existing `Semester` values in the sheets are left as they are ([Validation](#validation-and-normalization)). |
| 14 | Notification emails | Go to **`Students.Email`**, with two stated exceptions, both form-sender replies ([Notification emails](#notification-emails)). |
| 15 | Moving credits to another person | Changing the person on a Student ID moves **all of that ID's credits** (logs, reminders, eligibility, marks, evaluations, published results) to the new person. It is done only after the semester is complete ([Changing the person on a Student ID](#changing-the-person-on-a-student-id)). **Needs written academic sign-off in Phase 0** (below the table). |
| 16 | Published results | Protected by a hash that includes the **Student ID**. Name and register number are shown from the current `Students` row. An old published result therefore shows the current holder's name. Needs the same sign-off. |
| 17 | GitHub accounts | A GitHub account stays with the **person who linked it**, but each account row is tagged with the **Student ID** it was linked under, and commit credit follows that ID. After a change of person nothing is done on GitHub: the earlier commits stay in the team repository and are shown as the new holder's credit, and the account itself is not transferred. No new commits happen after the change ([GitHub accounts](#github-accounts)). The cut-over tags each existing row with its Student ID. Needs the same sign-off. |
| 18 | History of reassignments | **No reassignment log.** The app does not record when an ID moves to another person, or who held it before. Former-holder details already inside existing records stay there: `Actor` columns, log narratives, GitHub rows and evaluation payloads. Needs the same sign-off. |
| 19 | Title submission | The Google Form will be **replaced by an in-app title submission**, designed separately to the department's needs. It is not part of this plan. Until it ships, the form path follows the rules in [Title submission](#title-submission). |
| 20 | When a person change happens | **Only after the semester is complete and the cut-over is released.** Never during the live semester, so no maintenance window, drain or page token is needed for it. After the cut-over, name, email, class and register-number typo corrections for the same person can be made in `Students` at any time; before it they follow the rule in [Which `Students` edits need special care](#which-students-edits-need-special-care). |
| 21 | Switch-over testing | **Everything on the live system.** No rehearsal copy, no test GitHub organisation, no hub copy, no tester accounts. Checks are the automated tests, the read-only dry run, the integrity and verification reports, and **pilot users** in the live window ([Run order](#run-order-live)). A backup has already been taken; a fresh one is still taken in the window for rollback. |

**Sign-off (Phase 0).** The person who owns academic results records in writing that they accept:
(a) credits and published results follow the Student ID (Decisions 15 and 16); (b) no reassignment log is
kept, so the system cannot reconstruct who held an ID (Decision 18); and (c) GitHub accounts stay with their person, while the commits made through them are credited to the Student ID and so
to its next holder (Decision 17). If they do not accept (a) or (b),
stop and revisit Decision 18 (a reassignment log): it is hard to add after the cut-over.

## Target model

### What each tab owns

| Tab | Owns | Student key |
|---|---|---|
| `Students` (new) | Who currently holds each Student ID: Student ID, Register Number, Student Name, Email, Class Number | **Student ID** (primary key) |
| `TeamRoster` | Team ID, Semester, Guide Name/Email/GitHub, Review Committee Number, student slots | **Student ID**, the join to `Students` |
| `TeamStatus` | Workflow state only: Title, Problem Statement, Similarity Flag, decisions and notes, Title Approved By, document links, Repo URL | none; keyed by Team ID |
| Logs, reminders, eligibility, GitHub accounts, evaluation and publication journals | Each student's work and credits | **Student ID** |
| `MasterRegistry` (hub spreadsheet) | Approved titles across years | none. Its members field is descriptive text (comma-joined register numbers), not a key. |

`Students` headers, in order:

```
Student ID | Register Number | Student Name | Email | Class Number
```

### Join path

```
login email ──► Students.Email ──► Student ID + person
                                        │
                  Students.Student ID ◄── TeamRoster slot n Student ID
                                        │
                                        ▼
                         team (teamId, guide, committee, slot n)
```

The roster names the ID, not the person. Who holds the ID is answered only by `Students`, so changing
the person never touches `TeamRoster`. The register number is just an attribute of the person.

### Identity and membership are separate

Two objects, built by two modules, with no circular dependency:

```js
// Student — identity only, from the Students tab (students.js)
{ studentId, registerNumber, name, email, classNumber }

// Membership — from TeamRoster joined to Students (teams.js)
{ student /* Student */, teamId, slot /* 1–4 */ }

// Team — from TeamRoster (teams.js)
{ teamId, semester, committeeNumber,
  guide: { name, email, githubUsername },
  members: [Membership, ...] /* slot order */ }
```

Both are rebuilt for each server request. Nothing is kept between requests, and a sign-in does not
create a stored session object.

## Server modules

Every function name ends in `_` (see *Public surface* in AGENTS.md).

### `students.js`: the only reader of the `Students` tab

| Function | Purpose |
|---|---|
| `studentDirectory_()` | Reads `Students` and validates every row ([Validation](#validation-and-normalization)). Returns `{valid: Map<studentId, Student>, byEmail, byRegister, problems: [...]}`. Invalid rows go to `problems`, not into the lookups, and **do not stop valid rows from working**. Throws only when the tab or its headers are unusable. |
| `isStudentId_(value)` | Checks a value against the [Student ID format](#student-id-format) and this spreadsheet's prefix. Used by the directory, the integrity check and every endpoint that receives a `studentId`. |
| `studentIdPrefix_()` | Builds `<ACADEMIC_YEAR>-<semester>-stud-` from the settings. Throws if either setting is missing or invalid. |
| `studentById_(id)`, `studentByEmail_(email)`, `studentByRegister_(regNo)` | Return a valid `Student`, or `null`. |

### `teams.js`: the only reader of team details

| Function | Purpose |
|---|---|
| `teamDirectory_()` | Reads `TeamRoster` and resolves each slot through `studentDirectory_()`. A team with any problem goes into `problems`: an unknown Student ID, a member listed twice, a member whose `Students` row is invalid, a blank Semester or one that differs from the other teams (or from the setting, when the values are `Odd`/`Even`), a duplicate Team ID, or no `TeamStatus` row for the team (its workflow state is missing). Other teams keep working. |
| `teamById_(teamId)` | A valid team, or `null`. |
| `teamsForGuide_(email)`, `teamsForCommittee_(numbers)` | Every team assigned to the guide or committee, read from team-level columns only. Each team is marked valid or unavailable. |
| `membershipFor_(studentId)` | The team and slot that hold the student's ID, or `null` when no roster slot holds it. A team with a problem is **returned marked unavailable**, not hidden, so its student keeps the role and sees "contact the coordinator" ([Failing safely](#failing-safely)). |
| `currentStudent_()` | Session email → `Student` → `membershipFor_`. Returns `{student, membership}` (the membership may be marked unavailable) or `null` when the email is not in `Students` or no slot holds the ID (Decision 3). |
| `requireCurrentStudent_()` | Replaces `studentAccessOrThrow_` ([student-api.js:71](student-api.js#L71)) and `authorizeStudentGithub_` ([student-github.js:23](student-github.js#L23)). Throws `apiFail_` codes. |

### Failing safely

- **Coordinator access never depends on the directories.** Coordinator and Cell PD detection run first
  and use only the settings. The coordinator can always open System Status and see the integrity check,
  however broken `Students` or `TeamRoster` is. **This is not true today:** `getDashboardRoleViews_`
  reads `TeamStatus` before it checks the coordinator, and three other places use it as an access gate:
  `github-invitation-resend.js:4` (as its coordinator check), `dashboard-router.js:179` (shared timeline)
  and `rubric-config.js:7` (shared rubrics). Phase 2 reorders `getDashboardRoleViews_` so the coordinator
  check comes first, and switches `github-invitation-resend.js` to `activityIsCoordinator_`. The shared
  endpoints keep using the role list, which still works for guides, reviewers and students whose team is
  marked unavailable.
- **Local isolation starts in Phase 4.** `weeklyStudents_` throws for the whole cohort on any duplicate,
  ambiguity or roster-versus-`TeamStatus` difference ([logbook-tracker.js:298-314](logbook-tracker.js#L298))
  and stays unchanged until Phase 4, so until then one bad team still breaks every student's weekly calls.
  The guarantee below applies from Phase 4.
- **Problems stay local.** A problem row blocks only the students and team it involves, with a clear
  "contact the coordinator" message. Everyone else continues.
- **Team-level actions fail closed.** Evaluations, publication and team GitHub setup need the whole team,
  so they refuse to run while any member of that team has a problem.
- **Staff roles never depend on `Students`.** Guide and reviewer roles are detected from `TeamRoster`'s
  team-level columns (guide email, committee number) without resolving members. A team whose members
  cannot be resolved still appears to its guide and reviewers, marked "unavailable: contact the
  coordinator", and every member-dependent action on it is blocked.
- **Unusable tab:** if `Students` is missing or its headers are wrong, every student is blocked.
  Guides and reviewers still sign in and see their teams as unavailable. The coordinator is unaffected.

### Reading and caching

- Read-only dashboard endpoints run inside `withDashboardRead_`. There, `getSheetRows_` caches each tab
  for that one request, and the directories reuse the cached rows.
- Writes read live data. A write that takes a lock takes it **first** (the paths that take none today are
  listed in [Maintenance mode](#what-it-blocks); this plan does not change their behaviour), then:
  1. checks the maintenance flag with a **fresh, uncached** read, `maintenanceOn_({fresh:true})`
     ([Maintenance mode](#maintenance-mode)), bypassing the per-execution memo
  2. resolves the student and team from fresh reads
  3. writes
- The new directories keep **no cache of their own** beyond the request. The existing code does have
  module-level memos that are never reset per request: `_columnMapCache` (`getColumnMap_`,
  [common-helpers.js:220](common-helpers.js#L220)), `_rcColumnsCache` and `_committeeRowsCache`. Whether
  a warm instance keeps them between requests is not settled (`AMBIGUTIES-TO-BE-RESOLVED.md`, E2), so
  the plan does not depend on it, and **code that changes headers must not use them**: the migration reads
  column positions from each sheet's live header row, never from `getColumnMap_`, because its memo would
  be stale after a rename. After any header change the new release is redeployed before it is used.
- The script lock coordinates only the app's own code. It does **not** stop the coordinator editing the
  sheet directly, and a fresh read cannot detect an edit made after it. Changes of person are made only
  after the semester is complete, when no save is in flight.

### Membership fingerprint

The stored membership fingerprint (`evaluationMembership_`,
[evaluation-lifecycle.js:8](evaluation-lifecycle.js#L8)) becomes `{teamId, studentIds: [sorted]}`. A
changed Student ID in a slot is a roster change; a name, email or class change is not, and neither is a
change of person on an ID (see [Changing the person on a Student ID](#changing-the-person-on-a-student-id)).

There are no page context tokens. A person change happens only after the semester is complete, when no
student, guide or reviewer page is open to save, so no stale page can write under a new holder.

## Student ID format

```
<academic year>-<semester>-stud-<sequence>
2026-27-odd-stud-0001
```

| Part | Rule |
|---|---|
| Academic year | `YYYY-YY`. The two-digit part must be the first year + 1 (`2026-27` passes; `2026-29` fails). It must equal the `ACADEMIC_YEAR` setting. |
| Semester | `odd` or `even`, lowercase in the ID. It must equal the `SEMESTER` setting, compared case-insensitively (`Odd`, `ODD` and `odd` are the same). |
| Literal | `stud` |
| Sequence | Exactly 4 digits, `0001`–`9999`. `0000` is invalid. |

```
^(\d{4})-(\d{2})-(odd|even)-stud-(\d{4})$     plus the year-pair, range and prefix checks above
```

Why 4 fixed digits:
- **One spelling per ID:** a plain text comparison is always right.
- **Sorting works:** text order equals numeric order.
- **No typos slip through:** a missing or extra digit fails validation.

Because one spreadsheet runs one semester and no two run the same semester (Decision 12), the prefix
makes IDs unique across spreadsheets.

Whoever maintains the sheet assigns IDs (Decision 5). Two rules for them:
- An ID is **never deleted or reused**. A deleted ID orphans its records; the integrity check reports
  orphans.
- Moving an ID to another person is allowed **only** after the semester is complete, through the
  [procedure](#procedure).

## Validation and normalization

| Item | Rule |
|---|---|
| Headers | Exactly one of each of the five headers, compared after trimming, case-insensitive. A missing or duplicate header makes the tab unusable. |
| Blank rows | A row with all five cells empty is ignored. A partly filled row is a problem row. |
| Student ID | Trimmed and lowercased. Must pass `isStudentId_`. Unique. |
| Register Number | Trimmed text, compared with `normalizeText_` as today. Unique. Must be **stored as text**: a numeric cell is a problem, because Sheets has already lost any leading zeros and the app cannot recover them. |
| Email | `normalizeEmail_`. Unique. Required. |
| Student Name, Class Number | Trimmed. Name required. Class Number optional for now. |
| Duplicates | Every row involved in a duplicate is a problem row. The app never picks one of them. |
| `TeamRoster.Semester` | Must be non-empty and **the same on every team** (one spreadsheet runs one semester). If the live values are `Odd` or `Even` in any letter case, they must also equal the `SEMESTER` setting, compared case-insensitively. If they are another form (for example `7` or `Semester 7`), they are kept as they are and **not** compared with the setting: the Student ID's semester part comes only from the setting. Phase 0 records which case applies. |
| `TeamRoster` Student ID slots | Trimmed and lowercased. Must pass `isStudentId_` and exist in `Students`. A slot may be empty (fewer than four members); a filled slot may appear only once across the whole roster. |

The Student ID and Register Number columns in `Students`, and every Student ID column the app writes
or the sheet holds (including the `TeamRoster` slots), use plain-text format (`setNumberFormat('@')`).

## Maintenance mode

Used for the one-time cut-over (Phase 5) only.

### The flag

- Stored in **Script Properties** as `MAINTENANCE` (`on` / absent), **not** in the Config tab.
  `getConfig_` reads the whole Config tab once and caches it for the rest of the execution
  ([common-helpers.js:16](common-helpers.js#L16)), so a later check in the same execution would still see
  the old value.
- Read only through `maintenanceOn_()`, which reads the property from Script Properties, never from the
  Config cache or the dashboard row snapshot. To stay inside the daily Script Properties read quota
  (published as 50,000 per day for consumer accounts; to be confirmed for this project's account), it
  reads **once per execution** on read-only paths (`doGet`, read endpoints, trigger handlers), and that
  first read is memoized for the rest of the execution. The check **after taking a lock on a write is
  always a fresh, uncached read** (`maintenanceOn_({fresh:true})`), because a memoized value could not
  catch maintenance starting while the write waited for the lock. It is not read on every helper call.
  The quota figure is checked in Phase 0.
- Turned on and off by coordinator actions. **Turning it on starts from the normal System Status
  screen**, not from the maintenance page (which exists only once the flag is on): a *Maintenance* card
  with a "Start maintenance" button, calling `API_coordinator_startMaintenance()`. As a fallback for a
  broken dashboard there is a guarded editor-run entry point, `startMaintenance()`, in `SELF_CHECKED`
  (it checks the coordinator itself). Both are coordinator-only and idempotent. While maintenance is on,
  the same card appears on the maintenance page with the release actions. Each action records who
  changed the flag and when, in Script Properties.

### What it blocks

The check lives in **a few central places**, not in each function:
- `doGet`
- `apiHandle_` ([api-envelope.js:29](api-envelope.js#L29)), which every browser-facing `API_*` endpoint
  already goes through (verified for every current endpoint). It takes only the endpoint body today, so
  the named maintenance operations pass an explicit allow option; no other endpoint can
- `requireTriggerOrOperator_(operation)`, the first statement of every guarded trigger and editor-run
  entry point ([common-helpers.js:254](common-helpers.js#L254)). The existing entry-point-guard test
  requires it to be the **exact first statement** of each; it is extended to accept the optional
  `operation` argument. **During maintenance the helper does not throw: it returns `true` ("paused")**,
  and every handler's first statement becomes `if (requireTriggerOrOperator_(…)) return <its existing
  skip value>;` (for example `[]` for `fetchAllCommits`, `{skipped:true}` for `processWeeklyProgressAI`).
  A throw would end the run as a **failed execution**, which the Apps Script executions list records and
  which can send daily failure emails. Outside maintenance the helper behaves as today (throws for a
  non-coordinator, returns `false` otherwise). The helper pauses **unless** `operation` is on a short
  allow-list of exactly two names: `'maintenance-reply'` (used only by `onTeamIntakeSubmit`, which must
  send the maintenance reply) and `'migration'` (used only by `migrateStudentKeys()`, which must run
  while maintenance is on). Every other trigger and editor entry point passes no operation and stays
  blocked. The test covers both exceptions and asserts that each other guarded function is refused
- the **five self-checked entry points** in `tests/entry-point-guard.test.cjs`, which do not use that
  helper: `setupWeeklySubmissionStorage`, `setupProgressEligibilityStorage`,
  `setupWeeklyProgressPhase2Storage`, `setupWeeklyProgressPhase2Triggers` and
  `reconcileProgressEligibility`. The last is a **daily trigger handler**, so it must pause like the
  others. Each gets the maintenance check as its first statement after its own coordinator check, except
  `startMaintenance()`, which is itself a maintenance action and must run whether the flag is on or off

Each calls `maintenanceOn_()` first. A write that takes a lock calls it again after taking the lock. The
guard test is extended: every `API_*` function body must contain `apiHandle_(`; every public function
other than `doGet` must be in `GUARDED` (helper) or `SELF_CHECKED` (own check plus the maintenance
check); and `migrateStudentKeys()` and any new editor-run function are added to one of those lists. A
new entry point therefore cannot skip the check.

| Entry point | During maintenance |
|---|---|
| `doGet` for anyone except the coordinator / Cell PD and pilot users | "The dashboard is being updated. Please try again later." |
| `doGet` for the coordinator / Cell PD, **whether or not listed as a pilot** | The [maintenance page](#the-maintenance-page). A coordinator never sees another role's dashboard during maintenance. |
| `doGet` and `API_*` for a **pilot user who is not the coordinator / Cell PD** | The normal dashboard for that user's own roles ([Pilot users](#pilot-users)) |
| `API_*` endpoints, for everyone else | Refused, except the named operations of the maintenance page |
| Time-based trigger handlers | **Return at once with their existing skip value, doing nothing and throwing nothing** (the helper returns `true`, the handler returns). Triggers stay installed. An operator running one by hand during maintenance is paused the same way, with a log line saying so. |
| Title form handler (`onTeamIntakeSubmit`) | Runs only to send the maintenance reply, through the `'maintenance-reply'` exception ([Title submission](#title-submission)) |
| Editor-run entry points | Refused, except `migrateStudentKeys()` (operation `'migration'`) and the maintenance actions |

**Triggers are never removed.** Each trigger handler's first statement pauses it when the flag is on (see
above). That avoids three problems:
- recording and recreating triggers: Apps Script can list only the current user's triggers, and
  doesn't expose their schedules
- a missing form handler that can't send the maintenance reply
- users being let back in before jobs are restored

**Writes that take no lock today.** Not every write takes the script lock. The guide's title decision
(`submitGuideDecision_` → `applyGuideDecision_`, [guide-dashboard.js:87](guide-dashboard.js#L87)) takes none.
`AMBIGUTIES-TO-BE-RESOLVED.md` (L1, L8) lists more: `setConfig_`, `updateTeamStatusRepoUrl_` (locked by
some callers only), `onTeamIntakeSubmit`, the similarity flag, and the progress-eligibility writes (safe
only if every caller uses `weeklyLock_`). The write-path audit starts from that list.
Others take a lock but behave differently: weekly saves wait up to 30 s, evaluation saves give up after
5 s, and the reviewer decision after 1 s. This plan does **not** add locks to them, because workflow
behaviour is frozen. The release gate therefore does not rely on locks ([The maintenance page](#the-maintenance-page)).
Phase 1 lists every write path and its lock behaviour as an audit, so the gap is known and documented.

A run skipped during maintenance is picked up by that job's next scheduled run. An automated test
covers this for each job: weekly reminders, eligibility, commit collection, AI analysis and the
digests. After the window, the coordinator checks each job's first run in the Apps Script executions
list.

**Choosing the window.** Skipping a run is not always harmless, so pick the window with these in mind:
- `reconcileProgressEligibility` records `firstDetected` as the time it runs
  ([progress-eligibility.js:183](progress-eligibility.js#L183)). A pause across a weekly boundary delays
  that record and can move a student's start week. Do not open a window across the daily reconcile run
  near a window boundary; after the window, confirm no `firstDetected` was delayed past a boundary.
- Reminders are sent only between `deadline − SUBMISSION_REMINDER_HOURS` and the deadline
  ([logbook-tracker.js:566](logbook-tracker.js#L566)). A window that covers that whole span loses the
  reminder for that week; it is not sent later. Do not schedule a window over a reminder span.
- The plan makes no change to eligibility rules (AGENTS.md); this is about not changing outcomes by
  accident.

### Pilot users

Real people who use the live app while maintenance is still on, to check it before everyone returns.

- The coordinator enters their emails on the maintenance page. The list is kept in Script Properties as
  `MAINTENANCE_PILOTS` and is cleared by *Close* (and in any case by *Release*).
- A pilot user gets exactly their normal roles and access. The list grants nothing extra: every endpoint
  still checks authorization as usual.
- The list applies only to a signed-in person using the dashboard. **Trigger handlers stay blocked,
  whoever owns them**, so a pilot coordinator's background jobs don't run.
- *Close* ends pilot access ([The maintenance page](#the-maintenance-page)), so the coordinator tells
  pilot users to stop saving before running it.
- Pilot users' saves are real data. If the switch-over is rolled back, those saves are lost with
  everything else since the backup, and the pilot users redo them.

### The maintenance page

What the coordinator / Cell PD see from `doGet` while the flag is on. It shows only:
- the Students integrity card
- the verification report ([Phase 5](#phase-5-cut-over-one-release-one-maintenance-window))
- the pilot-user list
- the Maintenance card with the release actions (*Close* and *Release*) and the drain countdown

Each of its endpoints checks coordinator authorization itself, as every endpoint does now. The exemption
is by **operation**, not by person: a trigger owned by the coordinator still runs as the coordinator, so
a person-based exemption would let background jobs through.

***Release* is refused** while the integrity card shows a problem: problem rows, orphans or
`GitHubAccounts` rows without a Student ID. The page lists what has to be fixed
first.

**The release gate closes, drains, then scans, in separate executions.** Pilot users save real data while
maintenance is on, so a scan that runs beside a save could pass and then be invalidated. A lock cannot
prevent that, because not every write takes the script lock ([What it blocks](#what-it-blocks)). A single
Apps Script execution cannot also wait out the drain: the wait is as long as the execution limit, so it
would time out before scanning. The release is therefore **two coordinator actions**, with the wait
recorded in Script Properties between them:
1. **Close** (`API_coordinator_closeMaintenance()`). Clear the pilot list (`MAINTENANCE_PILOTS`), so
   no new pilot save can start, and record `MAINTENANCE_DRAIN_UNTIL` = now + the [drain](#drain) time.
   It returns at once. The coordinator tells pilot users to stop before this step.
2. **Wait.** The page shows the drain deadline. Any save that started before step 1 finishes by then,
   with a lock or without one.
3. **Release** (`API_coordinator_releaseMaintenance()`), in a **later execution**. It uses
   `coordinatorAccessOrThrow_` and reads live rows, not `coordinatorRead_`, whose `withDashboardRead_`
   wrapper snapshots rows for the request. It refuses until
   `MAINTENANCE_DRAIN_UNTIL` has passed. Then it runs a **fresh scan** (no request cache, no snapshot
   from an earlier view; nobody can write while it runs). If the scan is clean, it turns the flag off.

**When no pilot user was active** (for example after a rollback), the pilot list is already
empty and nobody could have written since the turn-on drain, so *Close* is not needed. *Release* may run
as soon as the turn-on drain deadline has passed.

If the scan finds a problem, the flag stays on and the page lists it. The coordinator fixes it and runs
*Release* again; pilot access stays closed until the coordinator re-adds the pilot users. The script lock
still protects the app's own writes against each other, but it is not what this gate depends on. A direct
sheet edit is not covered by any of this, which is why maintenance exists.

### Drain

The drain is a **recorded deadline**, not a sleep inside a request. Turning the flag on records
`MAINTENANCE_DRAIN_UNTIL` = now + **6 minutes**, and *Close* in the release gate records a new one. Until
the deadline has passed, `migrateStudentKeys()` and *Release* refuse, and the page shows the countdown.
Six minutes is the published Apps Script per-execution quota; Google's documents mention 30 minutes for
some Workspace accounts, so the account type alone does not establish a longer limit. The plan uses 6
minutes everywhere. If the coordinator later confirms a longer limit for this script, they can record it
in a setting (`MAINTENANCE_DRAIN_MINUTES`) and the deadline uses that. The flag (or the closed pilot
list), not the wait, stops new work from starting.

## Changing the person on a Student ID

This moves a Student ID, and everything attached to it, to another person. Keep it simple:

- **Only after the semester is complete, and after the cut-over.** Nothing should then be in flight: no
  logs, saves, evaluations or scheduled jobs. The coordinator checks this before starting (step 0). So there is no maintenance window, drain, page token or freeze
  step for it. Until the cut-over is released, logs and journals are still keyed by register number, so a
  person change would move no credits.
- **No person change, and no emptied or moved roster slot, before the cut-over.** A Student ID is **never
  retired, deleted or reused**: it keeps its slot and its `Students` row from Phase 0. A student who
  leaves early stays on the roster until the semester is complete.
- **Only the coordinator can change it.** The spreadsheet is editable by the coordinator alone, checked in
  Phase 0 (below). The app adds no check or switch for this. Do not move an ID's roster slot to another
  team once it has records.

### Procedure

0. **Stop the scheduled jobs at semester end.** The coordinator removes the time-based triggers in Apps
   Script's Triggers page (weekly reminders and missed-entry handling, eligibility reconcile, commit
   collection, the hourly AI analysis, the title digests) once the last weekly deadline has passed.
   Nothing needs to run for a completed semester, and a new semester is a new spreadsheet with its own
   triggers (Decision 12). Then set the Config row `SEMESTER_COMPLETE` to `Yes`. That row stops only the
   `GitHubAccounts` writes; removing the triggers is what stops the jobs. This is a coordinator
   procedure, not a new mechanism.
1. In the ID's `Students` row, set the new person's Register Number, Student Name, Email and Class Number.
   **All four change together.** `TeamRoster` is not touched: it holds the ID, so the new person joins the
   team automatically.
2. Open System Status and get the Students integrity card clean.
3. Do nothing on GitHub: the `GitHubAccounts` row and repository access stay as they are
   ([GitHub accounts](#github-accounts)).

### What follows the ID

- **Logs, reminders, eligibility, marks, evaluations and published results go to the new person**
  (Decision 15). A published result is protected by a hash that includes the Student ID and shows the name
  and register number from the current `Students` row, so no re-publication is needed (Decision 16).
- **Commit credit does, the GitHub account does not.** The account stays with its original person and is
  not transferred. The former holder's earlier commits stay in the team's repository and are shown as the
  new holder's credit, because the account row is tagged with the Student ID and commits are credited
  through that row. No new commits happen after the change, so nothing more is needed.
- **No reassignment log** (Decision 18). Existing `Actor` columns and log text keep the former holder's
  details; nothing new is recorded.

### Example

`2026-27-odd-stud-0001` is held by register number `9923005001`, in Team A. After the semester, to give
its credits to `9923005002`, change that row to `9923005002` and that person's name, email and class. Team
A's roster slot already says `2026-27-odd-stud-0001` and stays as it is. `9923005002` then signs in and
sees all of `stud-0001`'s logs, marks and results, in Team A. `9923005001` no longer sees them.

### Which `Students` edits need special care

**After the cut-over,** name, email, class number and register-number typo fixes for the **same person**
can be made in `Students` alone, at any time. The roster and every stored record hold the Student ID, so
nothing else depends on them.

**Before the cut-over** the old code still keys logs, reminders and eligibility by register number, and
still cross-checks the roster's old columns with `TeamStatus`. Changing only `Students` would leave
records that `studentByRegister_` cannot resolve during the migration, and would break the Phase 0
reconcile. So a correction made before Phase 5 is made **everywhere the old value lives, together**:
`Students`, the roster's old `Register No`, name and email columns, the `TeamStatus` student columns,
(for an email) the `Email address` cell of the student's `GitHubAccounts` row, which the migration matches
by email + Team ID, and (for a register number) the register cells of `LogEntries`, `WeeklyReminders` and
ProgressEligibility.
Then re-run the Phase 0 reconcile and get the integrity card clean. If that is more than a few rows, the
correction can be **deferred past the cut-over**, but only in this order: **leave the old (wrong) register
number in `Students` and in every old record through the migration**, so each record still resolves; the
dry run stops on any register number with no `Students` row, so it must find none. Then, after
*Release*, correct the register number in `Students` alone. If `Students` has **already** been
corrected, the old register-keyed records must be updated to match **before the dry run**, because the
dry run stops on any it cannot resolve.

*Example (before the cut-over).* Anita's email was typed as `anita@old.com` and should be
`anita@new.com`. It is changed in `Students`, the roster, `TeamStatus` **and** the `Email address` cell of
her `GitHubAccounts` row. If the `GitHubAccounts` row kept the old email, the migration would look for a
row with `anita@new.com` in her team, find none, report her account as unowned, and block the release.
After the cut-over the row is found by her Student ID, so the same fix needs only `Students`.

Whether an edit is a typo fix or a change of person is the coordinator's call; when unsure, treat it as a
change of person and wait for the semester to end.

### Who can edit the sheet

Phase 0 checks the spreadsheet's sharing list: only the coordinator can edit; everyone else is view-only or
has no access. If anyone else can edit, this plan's controls do not hold and it must be revisited. An
accidental valid edit by the coordinator is not detected by the app; the risk is accepted.

## Notification emails

Every email to a student goes to the current `Students.Email` of the student's ID. Guide emails go to
the guide email in `TeamRoster`.

| Email | Where | Recipient after the change |
|---|---|---|
| Guide updated the title; title rejected by guide | [intake-approval-workflow.js:174](intake-approval-workflow.js#L174), [:191](intake-approval-workflow.js#L191) | Each member's `Students.Email` |
| Title approved | [intake-approval-workflow.js:233](intake-approval-workflow.js#L233) | `TeamRoster` guide email + each member's `Students.Email` |
| Reviewer requested revision | [intake-approval-workflow.js:237](intake-approval-workflow.js#L237), [:239](intake-approval-workflow.js#L239) | `TeamRoster` guide email; each member's `Students.Email` |
| Weekly progress reminder | [logbook-tracker.js:572](logbook-tracker.js#L572) | `Students.Email` |
| Intake replies to a known member (already approved, under review, too similar) | [intake-approval-workflow.js:57-81](intake-approval-workflow.js#L57-L81) | That member's `Students.Email` |
| Intake "mismatch attempt" alert to the guide ([intake-approval-workflow.js:51](intake-approval-workflow.js#L51)) | the same handler, when a non-member submits | `TeamRoster` guide email (a guide address, not a student's) |
| Intake replies to an unknown sender (Team ID not recognized, not a member) | [intake-approval-workflow.js:38](intake-approval-workflow.js#L38), [:49](intake-approval-workflow.js#L49) | **Exception:** the form's sender address, because the sender has no `Students` row |
| Intake reply during maintenance | new | **Exception:** the form's sender address, because the directories are not consulted during maintenance |

Rule: a student's recipient address is taken only from `Students`, never from `TeamStatus`,
`TeamRoster`, `GitHubAccounts`, the browser or a form response. The only exceptions are the two
form-sender replies in the last two rows. Both disappear when the in-app title submission replaces the
form (Decision 19), because an in-app submitter is always a signed-in student.

## Title submission

The Google Form path stays only until the in-app title submission replaces it (Decision 19). Until then:

- The form handler `onTeamIntakeSubmit` uses `Students` and `TeamRoster` for the membership check, as
  in the table above.
- **During maintenance** it changes nothing in the workflow: no `TeamStatus` update, no guide email.
  Google has already stored the form response in `TeamIntakeRaw`; that row stays as it is. The handler
  replies to the form's sender: "The dashboard is being updated. Please resubmit your title after the
  update." Nothing is resubmitted automatically.
- The in-app replacement is designed separately. It must use `requireCurrentStudent_()` and the
  maintenance check like every other student write.

## GitHub accounts

`GitHubAccounts` keeps its first four columns (`Timestamp`, `Email address`, `Team ID`,
`GitHub Username`), which [github-identity.js:17](github-identity.js#L17) checks, and gains a
**`Student ID`** column.

**Ownership rule.** A GitHub account stays with the **person who linked it** and is never transferred.
Each row is tagged with the **Student ID** it was linked under, and that tag is how every path finds the
row. Commit credit follows the ID, because commits are credited through the row. After the cut-over every
path below keys on it:

| Path | Today | After |
|---|---|---|
| Preview token | email + Team ID ([student-github.js:39](student-github.js#L39)) | `studentId` |
| Confirmation and "cannot be replaced" check | rows matched by email + Team ID ([student-github.js:45-70](student-github.js#L45-L70)) | rows matched by Student ID |
| Duplicate-owner check | owners resolved by email + Team ID ([github-identity.js:101](github-identity.js#L101)) | owners resolved by Student ID |
| Team setup, provisioning, invitation resend, weekly evidence | email + label (register number) | Student ID |

- **Commit evidence is unchanged in rule:** commits are still credited by matching the commit's
  `GitHub Author ID` to the student's account row. Only the way the row is found changes.
- **Existing rows:** the migration fills `Student ID` once, by email + Team ID. A row it cannot resolve
  stays blank and is reported.
- **New rows:** written only by the app, when a student confirms an account
  ([student-github.js:72](student-github.js#L72)), with the Student ID of the signed-in holder. No form
  writes to this tab.
- **Rows without a Student ID** after the cut-over are ignored for ownership and reported by the integrity
  card. Their GitHub numeric IDs **still count in the duplicate check**, so linking an account that
  appears in such a row is refused until the coordinator repairs or removes it.
- **A change of person** (after the semester) leaves the row exactly as it is. The former holder's
  earlier commits therefore stay credited to the Student ID and show as the new holder's credit, the
  account itself stays with its original person, and no new commits happen after the change.
  - **Retention rule:** historical commit credit depends on this row.
    - **During the semester** the app may append a row when a student confirms an account, and may
      refresh an existing row's username, display name and profile URL, as it does today when the setup
      screen reads account details ([team-github-setup.js:93](team-github-setup.js#L93)). It never
      deletes a row and never changes a row's `Student ID` or `GitHub ID`. The one exception is a row
      **without** a Student ID, which the coordinator may repair or remove (see above).
    - **From semester completion the app writes nothing to this sheet.** The coordinator sets the Config
      row `SEMESTER_COMPLETE` to `Yes` (added in Phase 0 with the value `No`). While it is `Yes`, the
      metadata refresh and the account-linking write are skipped, so viewing a historical credit,
      including by the new holder, makes no write. Only after it is `Yes` is a change of person made.
  - **Integrity check (missing links only):** the integrity card lists, per team, collected non-bot
    commits whose author ID matches **no** `GitHubAccounts` row of that team, so a deleted row, or a
    changed `GitHub ID`, shows up. It is a warning, not a *Release* blocker: a person who committed
    without ever linking an account is listed too, and the coordinator reads the list. It does **not**
    detect a row whose `Student ID` was changed while its `GitHub ID` stayed the same, so it is not full
    protection of historical credit; the retention rule and the coordinator-only sheet access are.
  - **Accepted limit:** the new holder cannot link a GitHub account of their own to that ID, because the
    ID already has one (the "cannot be replaced" and duplicate-owner checks). The semester is over, so
    nothing needs linking.
- **Addresses and screens:** a row keeps the email of whoever linked it. The app never mails or displays
  that email. A screen shows the **person** (name, register number) from the current `Students` holder, and
  the GitHub username from the row only as the **account that made the credited commits**, never as
  that person's own account. After a change of person the screen must not say the account belongs to the
  new holder.

## Weekly-log privacy filter

`weeklyAIIdentifiers_()` ([weekly-progress-phase2.js:160](weekly-progress-phase2.js#L160)) builds the
list of names and identifiers replaced with `[identity removed]` before log text goes to the AI model.
Today it takes team IDs, guide names and emails, and student names, emails and register numbers from
`TeamRoster` and `TeamStatus`, plus GitHub account details and commit usernames.

- **Add** every `Students` row: Student ID, Register Number, Student Name and Email.
- **Keep** every existing source: team IDs, guide details, GitHub metadata, commit usernames.
- Literal replacement removes known identifiers only. A nickname or other personal detail typed into a
  log cannot be recognized, so the filter is best-effort. That is true today and remains so.
- The list covers **every** team, not only the author's: a log that names a student of another team is
  scrubbed too. This stays.
- A person change happens only after the semester, when no log is waiting for AI analysis, so no list of
  former holders is kept.

## Where student identity is used today

### Code that builds or matches students

| Today | Where | After |
|---|---|---|
| `weeklyStudents_()`: `{email, regNo, teamId}`, cross-checks `TeamRoster` and `TeamStatus` | [logbook-tracker.js:289](logbook-tracker.js#L289), about 12 callers | `teamDirectory_()` |
| `getStudentsFromTeamStatusRow_()` | [marks-tracker.js:27](marks-tracker.js#L27), 12 callers | `teamById_(id).members` |
| `rosterSlots` | [student-dashboard.js:52](student-dashboard.js#L52) | `teamById_(id).members` |
| Student role and student access checks | [dashboard-router.js:45](dashboard-router.js#L45), [student-api.js:71](student-api.js#L71), [student-github.js:23](student-github.js#L23) | `currentStudent_()` / `requireCurrentStudent_()` |
| Guide role and guide access | [dashboard-router.js:52](dashboard-router.js#L52), [guide-api.js:123](guide-api.js#L123), [guide-api.js:221](guide-api.js#L221) | `teamsForGuide_()` |
| Reviewer role | [dashboard-router.js:57](dashboard-router.js#L57), reviewer API and evaluation | `teamsForCommittee_()` |
| Display name | [dashboard-router.js:79](dashboard-router.js#L79) | `Student.name`, then guide name from `TeamRoster`, then ReviewCommittee |
| Intake membership check | [intake-approval-workflow.js:45](intake-approval-workflow.js#L45) | `studentByEmail_()` + membership of the submitted team |
| Publication actor match | [publication-events.js:116](publication-events.js#L116) | `currentStudent_()` |
| Evaluation roster fingerprint | [evaluation-lifecycle.js:8](evaluation-lifecycle.js#L8) | Fingerprint of Team ID + Student IDs. A change of person keeps the IDs, so it does not count as a roster change. |
| Prerequisite completion | [assessment-registry.js:73](assessment-registry.js#L73) | Guide records looked up by Student ID |
| Publication team list and matching | [internal-assessment-publishing.js:25-52](internal-assessment-publishing.js#L25-L52) | Student ID |
| Weekly activity and evidence | [weekly-activity.js:32](weekly-activity.js#L32), [:96](weekly-activity.js#L96), [:121-151](weekly-activity.js#L121-L151) | Student ID |
| Team weekly summary | [common-helpers.js:583](common-helpers.js#L583) | `teamById_(id).members` |
| Registry members field | [common-helpers.js:345](common-helpers.js#L345) | Register numbers of the roster's Student IDs, read from `Students`; same text as now |

Files that read `TeamStatus` team-detail columns and move to `teams.js`:

`common-helpers.js`, `coordinator-dashboard.js`, `dashboard-router.js`, `github-invitation-resend.js`,
`github-provisioning.js`, `guide-api.js`, `guide-dashboard.js`, `guide-evaluation.js`,
`intake-approval-workflow.js`, `logbook-tracker.js`, `marks-tracker.js`, `progress-eligibility.js`,
`publication-events.js`, `review-evaluation.js`, `reviewer-api.js`, `reviewer-dashboard.js`,
`reviewer-evaluation.js`, `student-api.js`, `student-dashboard.js`, `student-github.js`,
`team-folders.js`, `team-github-setup.js`, `weekly-progress-phase2.js`.

Before implementation, run a fresh search for `REGNO`, `regNo`, `register`, `S1_`–`S4_`, `GUIDE_EMAIL`
and `COMMITTEE_NUMBER` to confirm the list. It is a starting point, not a guarantee.

### Stored student keys

| Sheet | Column today | After the cut-over |
|---|---|---|
| `LogEntries` | `Reg No` | `Student ID`, same column position |
| `WeeklyReminders` | `Reg No` | `Student ID`. Reminder de-duplication is by (Student ID, week). |
| ProgressEligibility | `Register Number`, `Student Name` | `Student ID`; name is derived |
| Committee mark tabs (`COMMITTEE_TAB`) | `Student Register No`, `Student Name`, `Student Email` | **Not converted, and none exist.** No code reads or writes them (the definition in `common-constants.js` is referenced nowhere else), and the live sheet has no such tabs (confirmed). The definition stays in `FIELD_DEFINITIONS` because `schema.json` freezes it. Any mark tab introduced later must be keyed by Student ID from the start. |
| `GitHubAccounts` | `Email address` + `Team ID` | new `Student ID` column, authoritative |
| Review journals | `Student` = register number | `Student` = Student ID |
| Guide evaluation journal | `Student` = register number | `Student` = Student ID |
| Publication events | `Student` = register number; payload `releases[].student`, `snapshot.identity.register` | Student ID. Snapshot identity is `{team, studentId}` and the hash covers it. Name and register number are shown from `Students`. |

Journals are found by `assessmentJournal_` ([assessment-registry.js:80](assessment-registry.js#L80)).
The migration discovers them through it, not by assuming sheet names.

## Phases

### Phase 0: approval, sign-off and sheet preparation

1. **Approve** this as a reviewed change to frozen items. Each phase that changes `SHEET_NAMES` or
   `FIELD_DEFINITIONS` regenerates `tests/invariants/snapshots/schema.json` with `UPDATE_GOLDEN=1` in
   its own reviewed commit. The DTO snapshots need **no** regeneration: `student-legacy-facts.json`,
   `guide-legacy-facts.json` and `coordinator-legacy-facts.json` store facts derived by the tests' own
   `dtoFacts` functions, which pick named display fields, so adding `studentId` to a DTO does not change
   them; `reviewer-dto.json` and `reviewer-legacy-facts.json` hold fields that stay display-only. All of
   these, and `academic-review-policy.json`, must stay **byte-for-byte unchanged**: they are the proof that
   display fields and academic rules did not move. A snapshot is regenerated only if its test is
   deliberately extended to include `studentId`, in the same reviewed commit. Only `schema.json` is
   expected to change. Record the rules in AGENTS.md.
2. **Prepare the `Students` tab:** IDs assigned by whoever maintains the sheet, Student ID and Register
   Number columns formatted as plain text.
3. **Fill the `TeamRoster` slots with Student IDs.** Add `Student 1`–`Student 4 Student ID` columns
   (plain text) and enter each member's ID. This is a change to a frozen sheet layout under the
   approval in step 1; the matching `FIELD_DEFINITIONS.TEAM_ROSTER` entries are added in Phase 1. The
   existing `Register No` columns stay for now.
4. **Reconcile `TeamRoster` and `TeamStatus`:** same teams, members, guides and committees, comparing
   each roster Student ID, resolved through `Students`, with the register numbers in `TeamStatus` and
   in the roster's old `Register No` columns. Phase 2 switches the source, so they must agree first.
5. **Check the live facts and settings** that the plan assumes:
   - **`Semester` values.** Read every `Semester` value in `TeamRoster`, `TeamStatus` and the
     `MasterRegistry`. The repository's own tests use `Odd`, `ODD`, `Semester 7` and `7` for it, so the
     live form is not known. The value also feeds repository names, team folder names and registry
     matching, so **it is not changed by this plan**. Record which case applies
     ([Validation](#validation-and-normalization)): either `Odd`/`Even` in any letter case, or another
     form that is kept as it is.
   - **Config rows.** `getConfig_` throws on a missing or blank key, so add the `SEMESTER` row (`Odd` or
     `Even`) and the `SEMESTER_COMPLETE` row (`No`) next to `ACADEMIC_YEAR` now, before Phase 1 code
     reads them.
   - **Properties quota.** Confirm the daily Script Properties read quota for this project's account,
     because `maintenanceOn_()` reads it once per execution and again after each write's lock.
   - **Sheet access.** Confirm that only the coordinator can edit the spreadsheet; everyone else is
     view-only or has no access ([Who can edit the sheet](#who-can-edit-the-sheet)).
   - **Execution limit.** The plan uses the published 6-minute Apps Script quota for the
     [drain](#drain) deadline. Only if a longer limit is confirmed for this script is it recorded, in
     `MAINTENANCE_DRAIN_MINUTES`.
6. **Record the academic sign-off** ([Decisions](#decisions)): Decisions 15 to 18. Nothing is migrated
   without it.

The journal inspection is **not** part of Phase 0: its report is built in Phase 1, so it comes next.

### Phase 1: foundations (no behaviour change)

- Read the `SEMESTER` setting (`Odd` / `Even`), whose Config row was added in Phase 0, next to
  `ACADEMIC_YEAR`. Read `SEMESTER_COMPLETE` too, and make the `GitHubAccounts` metadata refresh
  (`refreshGithubAccountMetadata_`) and the account-linking write skip when it is `Yes`.
- Add `SHEET_NAMES.STUDENTS` and `FIELD_DEFINITIONS.STUDENTS`.
- Add the `Student 1`–`Student 4 Student ID` columns to `FIELD_DEFINITIONS.TEAM_ROSTER`, matching the
  headers added to the sheet in Phase 0. The old `Register No` columns stay defined until Phase 6.
- Add `students.js` and `teams.js` with tests, listed in the `test` script in `package.json`. No
  role dashboard calls them yet; only the integrity card and the maintenance page do.
- Add the **Students integrity** card to System Status (coordinator only). It reports:
  - unusable headers, problem rows and their reasons
  - IDs with the wrong format or prefix
  - numeric-formatted Student ID or Register Number cells
  - `TeamRoster` Student IDs not in `Students`, and IDs listed twice
  - before the cut-over, roster slots whose old `Register No` differs from the `Students` register
    number of that slot's ID. No person change is allowed before the cut-over, so a mismatch there is a
    **problem** (the Phase 0 reconcile no longer holds) and must be zero before Phase 5. After the
    cut-over the old `Register No` columns are no longer read or compared, so this check stops.
  - Semester values that are blank, differ between teams, or (when they are `Odd`/`Even`) differ from
    the setting
  - teams in `TeamRoster` with no `TeamStatus` row, and differences between the two
  - after the cut-over:
    - stored records whose Student ID is not in `Students` (orphans)
    - `GitHubAccounts` rows without a Student ID
    - warning only: collected commits whose author ID matches no `GitHubAccounts` row of the team (a
      removed row loses its commit credit)
- Add [maintenance mode](#maintenance-mode), shipped with the flag off:
  - the `MAINTENANCE` script property and `maintenanceOn_()`
  - the check in the central places (`doGet`, `apiHandle_`, `requireTriggerOrOperator_()`), and again
    after the lock in every write that takes one
  - the extended entry-point-guard test ([What it blocks](#what-it-blocks)), including the five
    self-checked entry points, one of which (`reconcileProgressEligibility`) is a daily trigger
  - `tests/api-authorization.test.cjs`: add the new coordinator endpoints to its `COORDINATOR_CALLS`
  - the **Maintenance card on the normal System Status screen** with `API_coordinator_startMaintenance()`,
    and the guarded editor entry point `startMaintenance()` as a fallback
  - the maintenance page with its operations, including the [pilot-user](#pilot-users) list
  - the refusal to release maintenance while the integrity card has problems, and the recorded-deadline
    sequence of the release: *Close*, wait, *Release* in a later execution
    ([The maintenance page](#the-maintenance-page))
  - the `operation` argument of `requireTriggerOrOperator_` and its two allow-listed exceptions
  - the **write-path audit**: a list of every write endpoint with its lock behaviour (script lock, wait or
    give-up time, or none), kept with the tests. It documents the gap; it does not change any write
- Add the new **coordinator endpoints**, named with the `API_coordinator_*` prefix (for example the
  integrity card, maintenance start, close and release, the pilot list, the verification report and the journal
  inspection report). Each is added to [DATA-CONTRACTS.md](DATA-CONTRACTS.md) with its request, `data`
  shape and a contract test, goes through `apiHandle_`, checks coordinator authorization itself, and is
  listed in `tests/entry-point-guard.test.cjs` where that test requires it.
- Add the **coordinator browser modules** for the integrity card and the maintenance page. They are
  registered under the coordinator role in `getMigratedViewsClientScript_` / `getDashboardPageScript_`
  and in `ROLE_MODULES` (its `coord` list) in `tests/page-assembly.test.cjs`, and their test files are
  added to the `test` and `test:migration` scripts. Pages for other roles do not ship them. The
  page-assembly test also gains a case for each of: a coordinator and a non-coordinator opening the page
  during maintenance (the maintenance page, and the message page with no script).
- **New root `.js` files** (`students.js`, `teams.js` and the new modules) are loaded by
  `tests/page-assembly.test.cjs` into one context together with every other root file, so they must do
  no work at load time (the way `intake-approval-workflow.js` does, which that test has to exclude).
- Add the read-only **journal inspection report** used at the
  [journal gate](#gate-after-phase-1-inspect-the-live-journals).

### Gate after Phase 1: inspect the live journals

Runs once the Phase 1 report exists and before Phase 5. No code changes.

1. Run the read-only **journal inspection report** (all journals that `assessmentJournal_` resolves, plus
   publication events). It lists each journal's rows and records a **content fingerprint**: a hash of
   every cell, in order.
2. Confirm in writing that they hold only dummy data. Only then is the reset in Phase 5 approved. If
   anything real is found, stop: the journals need a conversion plan of their own.
3. Record the fingerprint with that confirmation. **No result reset runs without a recorded fingerprint.**

The fingerprint, not a row count or timestamp, is what Phase 5 compares against. It also catches a
result edited in place without a newer timestamp.

### Phase 2: team details from `TeamRoster`; coordinator detection first

- Move the **team-level** reads of every file in the list above to `teams.js`: Team ID, semester, guide,
  committee and repository details. `TeamStatus` is then read only for workflow state. Members are
  resolved from the roster's Student IDs through `Students`, filled in Phase 0.
- **Not changed in Phase 2:** `weeklyStudents_` ([logbook-tracker.js:289](logbook-tracker.js#L289)) and
  `getStudentsFromTeamStatusRow_` keep reading the old roster and `TeamStatus` student columns, with their
  roster-versus-`TeamStatus` cross-check, until Phase 4 replaces them. So those columns must keep
  agreeing with the roster's Student IDs (the Phase 0 reconcile) from Phase 2 until the cut-over, and no
  person change is made in that period ([Changing the person on a Student ID](#changing-the-person-on-a-student-id)).
- Role detection checks coordinator and Cell PD first, from the settings only. Guide and reviewer are
  detected next, from `TeamRoster`'s team-level columns without resolving members
  ([Failing safely](#failing-safely)). This reorders `getDashboardRoleViews_`, and
  `github-invitation-resend.js:4` stops using it as its coordinator check (it uses
  `activityIsCoordinator_`), with `github-invitation-resend.test.cjs` updated to match.
- Guide email recipients come from `TeamRoster`.
- Storage keys do not change.
- **Update the existing tests** as listed in [Existing tests that change](#existing-tests-that-change).
  The fixtures keep the same people, so outputs and snapshots do not change.
- Verify: dashboard golden masters identical; `api-authorization*` and `entry-point-guard` pass.

### Phase 3: sign-in and access through `Students`

- Student role, `requireCurrentStudent_()` in every `API_student_*` endpoint, the GitHub student checks,
  intake membership, publication actor match and display name all use `students.js` / `teams.js`.
- Student email recipients come from `Students` ([Notification emails](#notification-emails)).
- `tests/api-authorization.test.cjs` classifies endpoints by name: its `WRAPPER_GUARDS` and `IDENTITY`
  patterns list `studentAccessOrThrow_`, `authorizeStudentGithub_` and `authorizeWeeklyStudent_`. Update
  them to `requireCurrentStudent_` in the same commit that replaces those functions, so the test keeps
  proving that every student endpoint identifies the caller.
- Add `Students` to the privacy filter, keeping every existing source.
- Storage keys do not change.
- New tests:
  - email not in `Students`
  - in `Students` but not in `TeamRoster`
  - duplicate email: both rows blocked, other students fine
  - wrong team
  - malformed `Students` with coordinator access intact

### Phase 4: the Student object everywhere (still stored by register number)

- Replace `weeklyStudents_`, `getStudentsFromTeamStatusRow_` and `rosterSlots` with the new modules,
  caller by caller. This is where `logbook-tracker.js`, `marks-tracker.js` and `student-dashboard.js`
  stop reading the old student columns, and where their test stubs are replaced.
- Replace the other roster lookups by register number too, in particular eligibility reconciliation
  ([progress-eligibility.js:228](progress-eligibility.js#L228)), which finds the student through the
  `S1`–`S4` register-number columns and reads the old name column. It must use the team's members and
  `Students` before Phase 6 removes those columns. Search again for `S1_`–`S4_` and `_REGNO` before
  Phase 4 is called done.
- Internal records carry `studentId` beside `regNo`; writes still store the register number.
- Verify: identical output; all tests pass with no snapshot regeneration.

This phase makes the cut-over small: afterwards, switching keys touches only reads, writes and
contracts.

### Phase 5: cut-over (one release, one maintenance window)

**Prepared and tested beforehand on a branch:**
- every reader and writer of stored student keys uses the Student ID
- **ProgressEligibility has its own header map outside `FIELD_DEFINITIONS`:** `PROGRESS_ELIGIBILITY_FIELDS_`
  ([progress-eligibility.js:2](progress-eligibility.js#L2)), which `buildColumnMap_` validates the live
  header row against and `setupProgressEligibilityStorage` writes as the header. Its `regNo` entry
  (header `Register Number`) changes to a Student ID key and header in the same release, together with
  every reader and writer of that sheet (the files that mention it today are `progress-eligibility.js`,
  `logbook-tracker.js`, `common-helpers.js` and `weekly-progress-phase2.js`; search again before the
  release), or the sheet is unreadable after migration. It is not in `schema.json`, so no
  snapshot changes. The `Student Name` column stays until Phase 6
- the `FIELD_DEFINITIONS` entries that hold a register number and are in use (`LOG_ENTRIES.regNo`,
  `WEEKLY_REMINDERS.regNo`; the unused `COMMITTEE_TAB` is left as it is) get the new header text **and** a new key name
  (for example `studentId`), because every reader changes in the same release; `schema.json` is
  regenerated in the reviewed commit
- GitHub ownership uses the Student ID ([GitHub accounts](#github-accounts)); commit evidence still
  matches the commit's author ID to the account row, which is now found by Student ID
- publication snapshots use `{team, studentId}` and the release check compares `identity.studentId`
- the stored membership fingerprint uses Team ID + Student IDs ([Membership fingerprint](#membership-fingerprint))
- the contracts in [DATA-CONTRACTS.md](DATA-CONTRACTS.md), their endpoints, contract tests and views
  change together, under one **key rule**: a DTO carries `studentId` wherever a view keys a row or sends
  a student back to the server; the register-number fields (`regno`, `register`, `registerNumbers`)
  stay only as **display** fields, read from `Students`, and are never used as a key. Existing field
  names are kept so views and snapshots do not churn. The DTOs that change:
  - `StudentDashboard`: `roster[]` and `github.members[]` gain `studentId` (`regno` and `isMe` stay).
  - `GuideDashboard`: `members[]` gains `studentId`; `memberEmails` and `registerNumbers` come from
    `Students`
  - `GuideGithub.members[]` and `API_guide_getCommits` `members[]` gain `studentId`
  - `ReviewerDashboard` and `CoordinatorDashboard`: `registerNumbers` and `emailRecipients` come from
    `Students` (display only)
  - `API_guide_getWeekly`: `entries[].regNo` and `requiredByWeek[].regNos` are keys, so they carry
    `studentId`; the `data-guide-students`, `data-guide-members` and `data-weekly-missing` hooks follow
  - guide evaluation (`API_guide_getEvaluation(teamId, student)`, `roster.students[]`, `student`,
    `statuses[]`, `evaluation.students[]`, save and submit input), review marking
    (`API_review_getEvaluation`, `API_review_save` input, including the makeup `student`), the
    publication report (`teams[].students[]`) and `API_publishing_run` input, and team-drawer inputs
    are keyed by `studentId`. Each row keeps its existing `register` field as a display value
  - GitHub setup members carry a `label` that today **is** the register number and is matched against
    the student; it becomes the Student ID
  - the published result `identity` keeps its existing `register` (display) and gains `studentId`:
    `{team, studentId, name, register}`; the name and register number come from the current `Students`
    row (Decision 16)
  - views use `data-student-id`
- the new refusals map onto the **existing error codes**, with no new code: a maintenance refusal and
  "contact the coordinator" use `UNAVAILABLE`; "This page is out of date. Reload." uses `CONFLICT`. The
  views offer a Reload for `CONFLICT`.
- a write endpoint that receives a value that is not a Student ID answers "This page is out of date.
  Reload." This covers pages opened before the cut-over.
- the migration function `migrateStudentKeys()`: guarded by `requireTriggerOrOperator_('migration')`
  (the named maintenance exception) and listed in `tests/entry-point-guard.test.cjs`
- a **verification report** on the maintenance page. For every student, guide and reviewer it builds
  the data their dashboard would load, and reports any failure or missing record. It doesn't need
  anyone else to sign in.
  - It is **strictly read-only**. It uses read-only builders that send no mail, call no GitHub API,
    provision nothing and refresh no GitHub account details. Normal dashboard loads can refresh those
    details ([team-github-setup.js:99](team-github-setup.js#L99)); the report must not.
  - It does not weaken any endpoint's authorization. It is a coordinator operation of its own.

#### No rehearsal (Decision 21)

There is no rehearsal copy. Before the window, the checks are:
- the automated tests in the repository, which use made-up fixture data and must cover every case in
  [Tests to add](#tests-to-add)
- the dry run in step 4 below, which reads live data and changes nothing

Problems that only real screens or real saves would show are first found by the pilot users in step 7,
while maintenance is still on and rollback is still possible.

Choose the pilot users before the window: at least one student, one guide and one reviewer who are
available at that time. Choose a student with an open week, so a real weekly log can be submitted.

#### Run order (live)

0. **Choose the window** ([Choosing the window](#what-it-blocks)): away from the daily eligibility run
   near a weekly boundary and from any reminder span.
1. **Turn maintenance on** from the System Status screen and wait for the [drain](#drain) deadline.
   Triggers stay installed and pause themselves. The title form handler keeps running to send its
   maintenance reply.
2. **Back up outside the live spreadsheet:** copy the whole spreadsheet to a separate Drive file named
   with the date and time. Never copy tabs inside the live spreadsheet: `assessmentJournal_` scans every
   tab for journal headers and could pick a backup tab up as the live journal.
   - This backup is taken **now**, after the drain, so it holds everything saved up to the window.
     Rollback restores to this moment.
   - The backup already taken earlier is kept as an extra copy. It is not used for rollback, because it
     lacks everything saved since it was made.
3. **Deploy the cut-over release**, still under maintenance.
4. **Dry run.** Produce a per-sheet report: rows to convert, rows already converted, register numbers
   with no `Students` row, and conflicts. Stop if anything cannot be resolved.
5. **Migrate.** `migrateStudentKeys()` takes the script lock for the whole run; a second run started at
   the same time is refused. Each sheet is converted under the rules in
   [Migration rules per sheet](#migration-rules-per-sheet), and the result reset follows
   [Result reset](#result-reset).
6. **Verify on the maintenance page:** integrity card clean (no problem rows, orphans
   or unowned GitHub rows), and verification report clean.
7. **Pilot check.** Add the [pilot users](#pilot-users) on the maintenance page. While maintenance stays
   on, they use the live app:
   - each loads their dashboard and checks their own data: name, team, past logs, marks
   - the student submits a weekly log for an open week (there is no draft: a save is a submission or
     revision)
   - the guide opens and saves an evaluation
   - the reviewer opens their assigned teams and an evaluation
   - a student with a linked GitHub account checks that it still shows as connected

   The coordinator writes down each pilot save. If anything fails, go to [Rollback](#rollback).
8. **Release maintenance.** First tell the pilot users to stop saving. Run *Close*, wait for the
   [drain](#drain) deadline, then run *Release* in a later execution: a fresh scan and, only if it is
   clean, the flag is turned off ([The maintenance page](#the-maintenance-page)).
   *Release* is refused while the scan shows any problem. Afterwards, watch the first run of each
   scheduled job in the Apps Script executions list.

#### Migration rules per sheet

Every sheet records a **checkpoint** in Script Properties when it finishes. A re-run continues from
the checkpoints, but trusts a checkpoint only if the sheet still matches its rule below. A mismatch
stops the run.

| Sheet | Conversion | "Already converted" means | Checkpoint is valid when |
|---|---|---|---|
| `LogEntries`, ProgressEligibility | Header changed in place to `Student ID`; each register number replaced by the Student ID, as text | The value is a Student ID that exists in `Students` **and** whose current team equals the row's Team ID | The header in that position is `Student ID` and every data row holds a valid Student ID of the row's team |
| `WeeklyReminders` (no Team ID column) | Header changed in place to `Student ID`; each register number replaced by `studentByRegister_` | The value is a Student ID that exists in `Students` | The header is `Student ID` and every data row holds an existing Student ID |
| `GitHubAccounts` | `Student ID` column added after the existing columns; each cell filled by email + Team ID | The cell holds the Student ID that email + Team ID resolve to | The column and header exist; every filled cell equals the ID its email + Team ID resolve to; a blank cell resolves to nothing and is listed as unowned |
| Result journals (header keeps `Student`) | No conversion: reset only ([Result reset](#result-reset)) | — | See [Result reset](#result-reset) |

Any other value in a converted column stops the run. It is never overwritten.

**Order inside one sheet, so an interruption is recoverable.** The header is the commit point and is
changed **last**:
1. **Convert the values first.** Classify each value: a register number that `studentByRegister_`
   resolves (convert), a Student ID that passes the "already converted" test (keep), or anything else
   (stop, nothing written). For `GitHubAccounts`, a blank cell is resolved from email + Team ID, and left
   blank if it resolves to nothing. Write the column in **one `setValues` call** (or fixed-size chunks, in
   row order).
2. **Then write the header** (rename it, or for `GitHubAccounts` write the new column's header).
3. **Then record the checkpoint.**

A re-run after any interruption redoes the same classification: converted or filled cells are kept,
remaining cells are converted, and the header is written when every value is done. So old and new values
mixed in one column are a normal, recoverable state; the header never changes before every value is
converted. A filled `GitHubAccounts` cell that differs from what email + Team ID resolve to, a value that
is neither a resolvable register number nor a valid Student ID, or a changed header over old values means
the sheet was edited by hand: **stop and use [Rollback](#rollback)**.

#### Result reset

Runs only if the [journal gate](#gate-after-phase-1-inspect-the-live-journals) approved it and recorded a
fingerprint. Each journal goes through four states, recorded in Script Properties **before** each change:

1. **Intent:** records the journal name and the gate's content fingerprint.
2. **Check, under the migration lock:** the journal's current content fingerprint must equal the
   approved one. Any difference (a new row, or a result edited in place) stops the reset.
3. **Clear:** delete all data rows in one operation, keeping the header row.
4. **Done:** recorded once the journal has only its header row.

A re-run after an interruption looks at the recorded state and the sheet together:

| Recorded state | Sheet holds | Re-run does |
|---|---|---|
| Intent, no Done | Exactly the approved content (fingerprint matches) | The clear never happened: check and clear again |
| Intent, no Done | Header row only | The clear happened before the interruption: record Done |
| Intent, no Done | Anything else | Stops for manual review |
| Done | Anything | **Never clears again**, so it can't erase records written after the reset |

#### Rollback

Use this if step 6 or the pilot check in step 7 fails and the cause can't be fixed while still in
maintenance. Pilot users' saves since the backup are lost and are redone after the fix. **Maintenance stays on
throughout.**

1. Redeploy the previous version.
2. Restore each affected tab **inside the live spreadsheet** from the backup file. The live
   spreadsheet keeps its ID, its script binding and its form link, and each tab keeps its identity.
   For each tab, restore:
   - the header row and every data row, values and formulas
   - number formats, especially plain-text ID and register-number columns
   - the row and column count: delete any rows or columns the migration added, such as the
     `Student ID` column in `GitHubAccounts`, and clear any converted cells left over
3. Delete the migration's checkpoints and reset states.
4. Check the integrity card on the maintenance page (both exist since Phase 1), and compare the
   restored tabs with the backup file.
5. Release maintenance only when step 4 is clean. Pilot access is closed by then, so *Close* is not
   needed; *Release* runs once the drain deadline has passed.

Triggers were never removed, so there is nothing to reinstall.

Rollback is only safe before *Release*. After that, new data exists in the new format.

### Phase 6: cleanup

- Retire the `TeamStatus` columns that `TeamRoster` owns: Semester, Guide Name/Email,
  S1–S4 Name/Register No/Email, Review Committee Number.
- Retire the `TeamRoster` S1–S4 Name, Register No and Email columns; slots keep the Student ID only.
- Retire the derived name column in ProgressEligibility. That sheet's header is defined by
  `PROGRESS_ELIGIBILITY_FIELDS_` ([progress-eligibility.js:2](progress-eligibility.js#L2)), not by
  `FIELD_DEFINITIONS`, and still requires `Student Name`: remove the field from that map and from its
  readers and writers first.
- In each case, remove the columns from their header definition (`FIELD_DEFINITIONS`, or
  `PROGRESS_ELIGIBILITY_FIELDS_` for ProgressEligibility) first, release, confirm nothing reads them,
  then delete them from the sheet.
- Remove `migrateStudentKeys()` and its entry-point-guard listing. Keep the maintenance switch.
- Update README, WEEKLY-PROGRESS.md, PROGRESS-ELIGIBILITY.md, REVIEW-EVALUATION.md, GUIDE-EVALUATION.md
  and PUBLISHING-IMPLEMENTATION.md. `DATA-CONTRACTS.md` was updated in Phases 1 and 5; here only confirm
  that no register-number field (`regno`, `regNo`, `register`) is still used as a key.

## Starting a new semester

The code names no semester, so it is copied unchanged.

1. Create the new spreadsheet and copy the Apps Script project into it.
2. Set `ACADEMIC_YEAR` and `SEMESTER`, for example `2026-27` and `Even`.
3. Start `Students`, `TeamRoster`, `TeamStatus`, the logs and the journals with header rows only.
4. Fill `Students` with IDs for the new semester (`2026-27-even-stud-0001`, …), and `TeamRoster` slots
   with the same IDs.
5. Get the integrity card clean before students sign in.

## Tests to add

| Area | Cases |
|---|---|
| ID validation | `0000`, `10000`, wrong year pair, wrong prefix, uppercase, surrounding spaces, numeric cells |
| Directory | blank rows, partial rows, duplicate headers, duplicate ID / email / register number, leading-zero register numbers |
| Roster slots | unknown Student ID, same ID in two slots or two teams, uppercase or padded ID, numeric cell, empty slot allowed; a team with a bad slot is unavailable while other teams work |
| Failing safely | malformed `Students` or `TeamRoster`: coordinator still opens System Status; unaffected students and teams still work; affected team's evaluations refuse to run |
| Staff detection | `Students` missing or unusable: guides and reviewers still sign in and see their teams as unavailable; member-dependent actions blocked |
| Register-number typo | After the cut-over, fixed in `Students` only: nothing else changes, and the ID's records and team are intact. Before it, the correction is made in `Students`, the roster and `TeamStatus` old columns, the student's `GitHubAccounts` email (for an email fix) and the register-keyed records (for a register fix) together, and the reconcile is clean; a stale `GitHubAccounts` email is reported as an unowned row by the dry run |
| Semester complete | with `SEMESTER_COMPLETE` = `Yes`, loading the GitHub setup or a student's dashboard writes nothing to `GitHubAccounts` (no metadata refresh) and the account-linking write is refused; with `No` both behave as today |
| Change of person (after the semester) | the four `Students` fields of an ID edited together, `TeamRoster` unchanged: the new person sees all past logs, marks and published results in the same team; the old person sees none; the published-result hash still verifies; the stored membership fingerprint is unchanged, so no roster-change flag; the `GitHubAccounts` row is untouched, and X's earlier commits show as the new holder's commit credit |
| Maintenance flag | the flag turned on after `getConfig_` has already cached Config in the same execution: `maintenanceOn_()` still sees it on; **race:** a write that began before maintenance and waits for the lock while maintenance starts is rejected by the post-lock check, which is an uncached read (`{fresh:true}`) and never returns the execution's memoized value |
| Trigger pause | for every `GUARDED` and `SELF_CHECKED` scheduled handler, with the flag on: it returns its existing skip value, throws nothing, and reads or writes no sheet and sends no mail; with the flag off it behaves as before; `onTeamIntakeSubmit` (`'maintenance-reply'`) and `migrateStudentKeys()` (`'migration'`) are not paused; the guard test accepts both first-statement forms |
| Maintenance blocking | endpoints, `doGet` for non-coordinators, editor entry points and every trigger handler are blocked, **including triggers owned by the coordinator**; only the named operations run; the form handler sends the maintenance reply with no workflow change |
| Maintenance page | a coordinator opening the dashboard in a fresh browser during maintenance gets the maintenance page; a non-coordinator gets the message; each maintenance endpoint rejects a non-coordinator |
| Read-only verification | the verification report makes zero sheet writes, sends no mail and makes no GitHub API calls |
| GitHub | preview, confirm, duplicate owner and provisioning keyed by Student ID; an email change does not lose the account; new rows get the holder's Student ID; a row without a Student ID is ignored for ownership but **its GitHub ID still blocks a duplicate link**; a former holder's email in a row is never mailed or shown; commits are still credited by author ID through the account row found by Student ID; deleting a row, or changing its `GitHub ID`, makes the integrity card warn about that team's now-unmatched commits (a changed `Student ID` alone is not detected); the app's refresh of username, display name and profile URL still works during the semester |
| Notifications | recipients come from `Students`; the two form-sender exceptions |
| Privacy filter | `Students` identifiers added, and team, guide and GitHub identifiers still present; a log naming a student of another team is scrubbed |
| Central maintenance check | `doGet`, `apiHandle_`, `requireTriggerOrOperator_()` and the five self-checked entry points (including the daily `reconcileProgressEligibility`) refuse or exit during maintenance; the extended entry-point-guard test fails on an `API_*` function without `apiHandle_`, and on any public function not in `GUARDED` or `SELF_CHECKED`; only the named maintenance operations pass `apiHandle_`; a write that takes a lock re-checks the flag after it |
| Existing tests updated | every item in [Existing tests that change](#existing-tests-that-change) is done in the phase named there; all legacy-facts and review-policy snapshots stay byte-for-byte unchanged; only `schema.json` is regenerated |
| Write-path audit | the audit lists every write endpoint and its lock behaviour, and fails when a new write endpoint is missing from it; no existing write's behaviour changes (the guide title decision still takes no lock) |
| Release gate | *Close* clears pilot access, records the drain deadline and returns at once, so a pilot save started afterwards is refused; *Release* before the deadline is refused; *Release* after it runs in a separate execution with a fresh scan; a save that started before *Close*, with or without a lock, has finished by the deadline; with no active pilot user *Close* is not needed once the turn-on deadline has passed; a failed scan leaves maintenance on and pilot access closed; a clean scan turns the flag off |
| Coordinator gate | with `TeamStatus`, `TeamRoster` and `Students` unreadable, the coordinator still passes `getDashboardRoleViews_` and the invitation-resend check; guide, reviewer and student detection fail only for themselves |
| Flag reads | a read-only request reads `MAINTENANCE` once; a write reads it again after its lock; neither reads it per helper call |
| Window timing | the daily eligibility run and the reminder span are not skipped across a weekly boundary in the chosen window (a runbook check, listed in the Phase 5 steps) |
| Maintenance start | a coordinator on a normal session (flag off) can start maintenance from the System Status card and from `startMaintenance()`; a non-coordinator is refused on both; starting twice is harmless; the flag and the drain deadline are recorded; the page then switches to the maintenance page |
| Guard exceptions | `onTeamIntakeSubmit` sends the maintenance reply and `migrateStudentKeys()` runs while maintenance is on; every other guarded trigger and editor entry point is refused; the entry-point-guard test accepts the `operation` argument and still requires `requireTriggerOrOperator_(…)` as the first statement |
| Migration column positions | after the header rename, `migrateStudentKeys()` and the new readers find `Student ID` from the live header row; a stale `_columnMapCache` from before the rename is never used |
| Unavailable team keeps the role | a student on a team with a problem keeps the student role and sees "contact the coordinator", not "no role found" |
| Semester values | `Odd`, `ODD` and `odd` are accepted and equal to the setting; a blank value, or a value that differs from the other teams, is a problem row; a non-`Odd`/`Even` form (`7`, `Semester 7`) is kept, not compared with the setting, and does not affect repository or folder names |
| Drain deadline | turning the flag on and *Close* each record a deadline of 6 minutes (or `MAINTENANCE_DRAIN_MINUTES` if set); `migrateStudentKeys()` and *Release* refuse before it and no request ever sleeps for it |
| DTO contracts | each changed DTO matches `DATA-CONTRACTS.md`; no view or endpoint uses `regno`, `regNo`, `regNos` or `register` as a key; `studentId` is present wherever a row is keyed or sent back; the published-result `identity` is `{team, studentId, name, register}`; `ROLE_MODULES` ships the new coordinator modules only with the coordinator role |
| Error codes | a maintenance refusal and "contact the coordinator" arrive as `UNAVAILABLE`; the out-of-date message arrives as `CONFLICT`; the bridge and views offer Reload for `CONFLICT`; no new code is added |
| Coordinator and pilot | a coordinator listed as a pilot still gets the maintenance page, not another role's dashboard |
| Team without workflow row | a `TeamRoster` team with no `TeamStatus` row is unavailable; other teams are unaffected |
| Student role | a valid `Students` row without a roster slot gets no student role; a roster slot whose ID has no valid `Students` row gets none |
| Journal gate | no result reset runs without a recorded fingerprint from the gate |
| ProgressEligibility header map | `PROGRESS_ELIGIBILITY_FIELDS_` and the sheet's header agree before and after the cut-over; the storage setup writes the new header; the reader accepts the migrated sheet and rejects the old header after the release |
| Migration interruption | for each sheet, a stop before the write, mid-write, after the values and after the header re-runs to a clean result; the header is never written while a value is still unconverted; a filled `GitHubAccounts` cell that differs from its email + Team ID source, or a value that is neither a resolvable register number nor a valid Student ID, stops the run with nothing written |
| Migration | dry run; a re-run after stopping halfway; "already converted" accepted only under each sheet's rule; `WeeklyReminders` converted without a Team ID; a second concurrent run refused; a checkpoint that doesn't match the sheet stops the run; backups are written to a separate file |
| Result reset | a journal edited in place without a newer timestamp stops the reset (fingerprint mismatch); interruption after Intent but before Clear: re-run clears; interruption after Clear but before Done: re-run records Done without clearing; Done: a re-run after a verification write never clears again |
| Rollback | restores tabs in place with their values, formulas, number formats and original size; removes the added column and leftover converted cells; keeps tab identities; removes checkpoints and reset states; maintenance stays on until the check is clean |
| Paused jobs | each trigger handler exits during maintenance and catches up on its next run after it |
| Pilot users | a pilot user gets their normal roles during maintenance and nothing more; a non-pilot is refused; trigger handlers stay blocked even when owned by a pilot; *Close* clears the list |
| Cut-over contracts | an old page sending a register number gets "reload"; reminder de-duplication by (Student ID, week) |

## Existing tests that change

Checked against the 55 test files and 4 shared fixtures in `tests/`. All were read, except that the middle
of `review-evaluation.test.cjs` (about 800 lines of marking and absence logic) was searched for identity
use rather than read line by line. **33 of the 55 test files reference student identity directly**
(register numbers, roster columns, or the functions this plan replaces); at least five more are affected
by the entry-point, endpoint-argument, weekly-input and `TeamStatus`-read changes, and four shared
fixtures need `Students` rows. This is a large piece of work, not a fixture tweak.

**Shared fixtures (Phases 2 and 3)**
- `weekly-progress-fixture.cjs` is the base of the coordinator, guide and student fixtures. It builds
  `TeamStatus` and `TeamRoster` rows from `FIELD_DEFINITIONS` and loads a fixed list of root files. It
  needs a `Students` sheet, roster Student IDs, and `students.js` and `teams.js` in its file list.
- `coordinator-fixture.cjs`, `guide-fixture.cjs` and `internal-publishing-fixture.cjs` build their own
  student rows. The publishing fixture stubs `getStudentsFromTeamStatusRow_` and has no
  `PropertiesService`, which the central maintenance check needs.
- `sheet-read-fixture.cjs` already stubs `requireTriggerOrOperator_` for contexts that skip
  `common-helpers.js`. It must also stub `maintenanceOn_`, because the self-checked entry points call it.
- Many tests build a private `vm` context and stub the functions being replaced: `weeklyStudents_`,
  `getStudentsFromTeamStatusRow_`, `studentAccessOrThrow_`, `authorizeStudentGithub_`,
  `authorizeWeeklyStudent_`, `rosterSlots`. They are `api-authorization`, `assessment-registry`,
  `github-identity`, `github-invitation-resend`, `guide-evaluation`, `review-completion`,
  `review-evaluation`, `reviewer-evaluation`, `student-github`, `team-github-setup`, `weekly-activity`,
  `weekly-api` and `weekly-progress-phase2`. Each stub is replaced by the new function in the same commit
  that removes the old one (Phase 4).

**Tests that assert a rule this plan changes (rewrite, not re-feed)**
- `title-intake`: membership is read from `TeamStatus` student emails; it becomes `Students` plus the
  roster. Emails to students come from `Students`.
- `weekly-progress`: "authoritative membership fails closed" edits `Student n Register No` and
  `Student n Email` in `TeamStatus`; it edits `Students` and the roster instead.
- `team-github-setup`: "membership comes from TeamStatus and the latest matching team/email
  submission" becomes membership from the roster and ownership by Student ID.
- Roster-change tests in `review-evaluation`, `guide-evaluation`, `publication-events` and
  `internal-assessment-publishing`: today a changed register number is a roster change, and name, email
  and order changes are not. They become: a changed **Student ID** in a slot is a roster change; a
  change of person (same ID, new person) is **not**, and the old person loses and the new person gains
  access to the published result ([Membership fingerprint](#membership-fingerprint)).
- `weekly-api` and `project-schedule`: assertions that the roster is read once per request, that a
  guide request makes one sheet read, and that the drawer's progress section does not read `TeamRoster`
  are restated for `studentDirectory_` and `teamDirectory_`.
- `project-schedule`, `student-migration` and others call helpers with a `(row, columns)` pair that
  holds `S1_EMAIL` and `S1_REGNO` (`assessProjectTeam_`, `getTeamLogWeekSummary_`) or with a register
  (`getLogWeekSummary_`); the helpers take a team object or a Student ID instead.
- `team-folders` and `assessment-storage-setup` (committee configuration): they stub `TeamStatus`
  columns and rows (Team ID, Semester, Committee number) that move to `teamDirectory_` and
  `teamsForCommittee_`. `team-folders` also uses `Semester 7` as a value, which the kept-as-is Semester
  rule above allows.
- `progress-eligibility`, `weekly-evidence`, `github-identity`: records are keyed by `regNo` and the
  `Register Number` column, and GitHub members by `label`; they are keyed by Student ID. The
  `GitHubAccounts` header checks reject extra or missing columns, so they accept the new `Student ID`
  column, and the "conflicting journal headers" test uses the new `Student ID` header.
- `api-authorization-roles`: its request matrix passes register numbers (`'001'`) as `student`, and its
  access-message pattern must still match the new refusals. `api-authorization`: its guard patterns name
  the functions being replaced.
- `guide-weekly-browser`, `guide-view`, `guide-evaluation-view`, `student-view`, `team-drawer-view`,
  `internal-publishing-browser`, `student-results-view`: DOM hooks that carry a register number
  (`data-guide-students`, `data-guide-members`, `data-weekly-missing`, `data-member-register`) gain
  `data-student-id` hooks, and tests find rows through them.
- `entry-point-guard` and `page-assembly`: lists extended as described in Phase 1.

**Rules the new code must satisfy because existing tests scan every root file**
- `sheet-reads`: no `.getValues()` or `.getRange()` reads; use `getSheetRows_` / `readSheetRows_`
  (`students.js`, `teams.js` and the integrity scan).
- `busy-state`: only `busy-state.js` sets `aria-busy` or writes "Saving…" text; the new views use
  `busy.mark`/`busy.write`.
- `lucide-icons`: icons come from the bundled set through `renderLucideIcon_`; no inline `<svg>`.
- `compiled-css`: every utility class a new view renders must be in `tailwind-styles.html`
  (`npm run build:tailwind`, then `npm run check:tailwind`); no inline `on*` handlers or `style`.
- `page-assembly` loads every root `.js` file into one context: no work at load time.
- `dashboard-loading` builds the shell from a subset of files. `getDashboardUserName_` keeps its
  `try`/`catch` fallback so it still works when `students.js` is not loaded.
- `commit-collection` asserts Script Properties are unchanged by reads: `maintenanceOn_()` only reads.

## Risks

| Risk | Mitigation |
|---|---|
| Real results cleared | Reset only after the journal gate approves it with a recorded fingerprint, only if the content fingerprint still matches, only after the off-spreadsheet backup, and never twice ([Result reset](#result-reset)). |
| Data written mid-migration | Maintenance flag checked on all entry points and trigger handlers (read once per execution, and an uncached read after every lock), named exceptions only, a recorded 6-minute drain deadline, second check after every lock that exists, serialized re-runnable migration. |
| Jobs not restored after the window | Triggers are never removed; they pause themselves. |
| A backup is used as a live journal | Backups go to a separate file, never into the live spreadsheet. |
| One bad row locks everyone out | Problems are isolated per row and team. Coordinator and staff detection don't depend on `Students`. |
| Roster is less readable (IDs instead of register numbers) | Roster name columns stay until Phase 6; the old `Register No` columns stay until the cut-over; the integrity card compares them with `Students`. |
| A pilot save overlaps the release scan | *Close* stops pilot access and records a drain deadline; a later *Release* scans fresh and flips the flag. It does not rely on locks, because some writes take none (for example the guide title decision). |
| A write path with no lock lets two saves overlap | Not new, and this plan does not change it (workflow behaviour is frozen). The write-path audit documents each path, and maintenance and the drain keep such writes out of the cut-over window. |
| A request would time out waiting for the drain | The drain is a recorded deadline checked by a later action; nothing sleeps inside a request. The published 6-minute quota is used; a longer limit is used only if confirmed. |
| A maintenance window changes academic outcomes by pausing a job | Choose the window away from weekly boundaries, the daily eligibility run and reminder spans; check `firstDetected` after the window ([Maintenance mode](#what-it-blocks)). |
| The Script Properties daily quota is exhausted by flag reads | The flag is read once per execution and again after a write's lock, not per call; the quota is confirmed in Phase 0. |
| Coordinator access fails when a directory is broken | `getDashboardRoleViews_` checks the coordinator first and the invitation-resend check no longer uses it (Phase 2). |
| Maintenance cannot be started because the dashboard is broken | The editor-run `startMaintenance()` fallback, coordinator-checked. |
| The maintenance guard blocks the form reply or the migration | Two named exceptions in `requireTriggerOrOperator_`, each covered by a test; everything else stays blocked. |
| `Semester` values are not `Odd`/`Even` | Phase 0 reads the live values. They are not changed (they feed repository names, folder names and registry matching); validation then only requires them to be present and identical across teams, and the Student ID takes its semester from the setting. |
| The academic owner rejects "results follow the ID" | Written sign-off in Phase 0 before any migration; if refused, revisit Decision 18 before the cut-over. |
| The cut-over fails in a way only real use shows | No rehearsal (Decision 21). Automated tests and the read-only dry run come first; pilot users then check the live app while maintenance is on and rollback is still possible. |
| Rollback restores old data | The rollback backup is taken in the window after the drain, not the earlier backup. |
| An ID deleted or reused | Orphans reported by the integrity card. Rule for sheet maintainers: never delete or reuse an ID. |
| A person is changed on an ID during the live semester | The rule is coordinator-only editing (checked in Phase 0) and no person change until the semester is complete. The app does not detect a mistaken edit; the risk is accepted. |
| Leading zeros lost | Numeric-formatted cells are reported; the columns must be plain text. |
| Page size | `students.js` and `teams.js` are server-only. The integrity card and maintenance page are new coordinator browser modules, registered under the coordinator role and added to `ROLE_MODULES` in [tests/page-assembly.test.cjs](tests/page-assembly.test.cjs); student, guide and reviewer pages do not ship them. |

## Not in this plan

- The Class Coordinator role (it will use Class Number).
- Any history of reassignments (Decision 18).
- Changing a person on an ID during a live semester: it needs maintenance windows, page tokens and
  GitHub handling that this plan deliberately leaves out.
- Showing a redo student their earlier semester's work: that lives in the other spreadsheet.
