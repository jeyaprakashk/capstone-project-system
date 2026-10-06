# Student identity: implementation plan

Status: **plan, not implemented.** Nothing described here exists in the code yet.

## Status and next steps

As of 2026-10-06.

| Item | State |
|---|---|
| Plan | Revision 5. All 21 decisions are settled; there are no open questions. |
| Independent review (Codex) | Reviewed through Revision 3; its findings are addressed in Revisions 4 and 5. **Revisions 4 and 5 have not been reviewed yet.** |
| Implementation | Not started. No code, sheet or setting has changed for this plan. |
| Backup | An earlier backup of the live spreadsheet has been taken. It is an extra copy only; rollback uses the fresh backup taken in the Phase 5 window. |

**Next steps, in order**

1. Optionally, have Revisions 4 and 5 reviewed before implementation.
2. Phase 0:
   - approve this as a reviewed change to frozen items
   - prepare the `Students` tab with Student IDs, Student ID and Register Number columns as plain text
   - reconcile `TeamRoster` with `TeamStatus`
   - inspect the result journals and record their content fingerprint (the inspection report itself is
     built in Phase 1)
3. Phase 1 onwards, one phase at a time, each with `npm test` green.
4. Before the Phase 5 window: choose the [pilot users](#pilot-users), at least one student with an open
   week, one guide and one reviewer, and make sure they are available at that time.

**Continuing in a new session:** start by asking the assistant to read this file and AGENTS.md, then
name the step you are on. Code line links in this plan may drift as the code changes; search for the
named function before relying on a line number.

This plan introduces a `Students` tab and a **Student ID** that every part of the system uses as the
student key. The Student ID holds a student's credits: logs, marks, results and GitHub link. The
`Students` row says which person currently holds that ID, and the coordinator can move an ID to another
person.

This is a deliberate change to frozen items in [AGENTS.md](AGENTS.md): sheet layout, stored data and
role detection. It is not a dashboard migration, so it follows the reviewed route in Phase 0.

Revision 5. Revision 2 added the ID reassignment model and fixed the first independent review. Revision 3
fixed the second: reassignment concurrency, stale pages, staff detection, checkpoints and rollback.
Revision 4 fixed the third: a fresh, uncached maintenance flag; triggers that stay installed and pause
themselves; a coordinator maintenance page; per-sheet checkpoint rules; crash-safe result reset;
read-only verification; and a defined team-binding rule. Revision 5 drops the rehearsal copy: the
switch-over runs on the live system only, checked by pilot users during the maintenance window
(Decision 21).

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | `TeamRoster` link to students | Student slots hold the **Register Number**. |
| 2 | Team details | Team ID, semester, guide details, committee and membership come from **`TeamRoster`**, not `TeamStatus`. |
| 3 | Student in `Students` but on no team | Out of scope: no student role. |
| 4 | Student ID format | `<academic year>-<semester>-stud-<4 digits>`, for example `2026-27-odd-stud-0001`. |
| 5 | Who creates Student IDs | **Whoever prepares the sheet.** IDs are already in the `Students` tab. The app only reads and validates them; it never creates, assigns or changes one. |
| 6 | Cut-over | The **live system** is migrated. |
| 7 | Existing results | Believed to be **dummy data**. Clearing them is a separate decision, taken after the live sheets are inspected (Phase 0). |
| 8 | AI model | No student details are sent to the AI model, as far as the [privacy filter](#weekly-log-privacy-filter) can detect them. The filter is best-effort: it removes known identifiers, not every personal detail a student might type. |
| 9 | `MasterRegistry` | Not a student record; unchanged. |
| 10 | Class Number | Stored now, for a future **Class Coordinator** role that is not part of this plan. |
| 11 | Redo | A student does a project once. A redo is in a later semester's spreadsheet, with a new Student ID. |
| 12 | One spreadsheet per semester | Each semester gets a new spreadsheet with the code copied in. No two spreadsheets ever run the same semester. |
| 13 | Semester values | **`Odd` or `Even` only.** |
| 14 | Notification emails | Go to **`Students.Email`**, with two stated exceptions, both form-sender replies ([Notification emails](#notification-emails)). |
| 15 | Moving credits to another person | Changing the person on a Student ID moves **all of that ID's credits, past and future**, to the new person ([Reassigning a Student ID](#reassigning-a-student-id)). |
| 16 | Published results | Protected by a hash that includes the **Student ID**. Name and register number are shown from the current `Students` row. |
| 17 | GitHub on reassignment | **The GitHub account stays linked to the Student ID**, not to the person. |
| 18 | History of reassignments | **No reassignment log.** The app does not record when an ID moves to another person. Former-holder details already inside existing records stay there: `Actor` columns, log narratives, GitHub rows and evaluation payloads. |
| 19 | Title submission | The Google Form will be **replaced by an in-app title submission**, designed separately to the department's needs. It is not part of this plan. Until it ships, the form path follows the rules in [Title submission](#title-submission). |
| 20 | When a reassignment happens | **Only during maintenance.** This covers any change of register number in `Students`. Name, email and class corrections for the same person need no maintenance ([Which edits need maintenance](#which-students-edits-need-maintenance)). |
| 21 | Switch-over testing | **Everything on the live system.** No rehearsal copy, no test GitHub organisation, no hub copy, no tester accounts. Checks are the automated tests, the read-only dry run, the integrity and verification reports, and **pilot users** in the live window ([Run order](#run-order-live)). A backup has already been taken; a fresh one is still taken in the window for rollback. |

## Target model

### What each tab owns

| Tab | Owns | Student key |
|---|---|---|
| `Students` (new) | Who currently holds each Student ID: Student ID, Register Number, Student Name, Email, Class Number | **Student ID** (primary key) |
| `TeamRoster` | Team ID, Semester, Guide Name/Email/GitHub, Review Committee Number, student slots | **Register Number**, the join to `Students` |
| `TeamStatus` | Workflow state only: Title, Problem Statement, Similarity Flag, decisions and notes, Title Approved By, document links, Repo URL | none; keyed by Team ID |
| Logs, reminders, eligibility, committee marks, GitHub accounts, evaluation and publication journals | Each student's work and credits | **Student ID** |
| `MasterRegistry` (hub spreadsheet) | Approved titles across years | none. Its members field is descriptive text (comma-joined register numbers), not a key. |

`Students` headers, in order:

```
Student ID | Register Number | Student Name | Email | Class Number
```

### Join path

```
login email ──► Students.Email ──► Student ID + person
                                        │
                Students.Register Number ◄── TeamRoster slot n Register No
                                        │
                                        ▼
                         team (teamId, guide, committee, slot n)
```

A student appears once in this spreadsheet (Decision 12), so the register number alone is enough to
join `TeamRoster` to `Students`.

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
| `teamDirectory_()` | Reads `TeamRoster` and resolves each slot through `studentDirectory_()`. A team with any problem goes into `problems`: an unknown register number, a member listed twice, a member whose `Students` row is invalid, a Semester that differs from the setting, or a duplicate Team ID. Other teams keep working. |
| `teamById_(teamId)` | A valid team, or `null`. |
| `teamsForGuide_(email)`, `teamsForCommittee_(numbers)` | Every team assigned to the guide or committee, read from team-level columns only. Each team is marked valid or unavailable. |
| `membershipFor_(studentId)` | The valid team and slot of a student, or `null`. |
| `currentStudent_()` | Session email → `Student` → `membershipFor_`. Returns `{student, membership}` or `null` (Decision 3). |
| `requireCurrentStudent_()` | Replaces `studentAccessOrThrow_` ([student-api.js:71](student-api.js#L71)) and `authorizeStudentGithub_` ([student-github.js:23](student-github.js#L23)). Throws `apiFail_` codes. |

### Failing safely

- **Coordinator access never depends on the directories.** Coordinator and Cell PD detection run first
  and use only the settings, as they do now. The coordinator can always open System Status and see the
  integrity check, however broken `Students` or `TeamRoster` is.
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
- Writes read live data. Every write endpoint takes its lock **first**, then:
  1. checks the maintenance flag with a fresh read, `maintenanceOn_()` ([Maintenance mode](#maintenance-mode))
  2. resolves the student and team from fresh reads
  3. checks the page's context token ([Stale pages](#stale-pages))
  4. writes
- No cache lasts beyond one request.
- The script lock coordinates only the app's own code. It does **not** stop someone editing the sheet
  directly, and a fresh read cannot detect an edit made after it. **Overlap between a save and a
  reassignment is prevented by maintenance and the drain wait, not by these checks.** The checks catch
  pages loaded before a reassignment that are saved after it.

### Stale pages

A page loaded before a reassignment must not save under the ID's new holder. Today the weekly
submission carries no identity: the server works out who is submitting only when the save arrives
([logbook-tracker.js:391](logbook-tracker.js#L391)).

- Every student endpoint that loads a page returns a **context token**. Its exact contents are in the
  table below.
- Every student write sends the token back. After the lock, the server recomputes it from fresh reads.
  A mismatch answers "Your details changed. Reload the page." and nothing is saved.
- The token only detects change. It never identifies the user; identity still comes from the session.
- It is separate from the GitHub preview-confirmation token
  ([student-github.js:39](student-github.js#L39)), which keeps its own purpose and expiry.

Three fingerprints, each with one exact shape:

| Fingerprint | Exact contents | Changes on reassignment? | Changes on a name, email or class fix? | Purpose |
|---|---|---|---|---|
| Stored membership fingerprint (`evaluationMembership_`, [evaluation-lifecycle.js:8](evaluation-lifecycle.js#L8)) | `{teamId, studentIds: [sorted]}` | No | No | Credits survive a reassignment; not flagged as a roster change |
| Student context token | `{studentId, registerNumber, email, teamId}` of the signed-in holder | Yes | Email only | A student page opened before a reassignment must reload |
| Guide and review evaluation tokens ([guide-evaluation.js:121](guide-evaluation.js#L121), [review-evaluation.js:175](review-evaluation.js#L175)) | the current config, plus each member's `{studentId, registerNumber, name, email}` | Yes | Name and email | An evaluation page opened before a reassignment must reload |

## Student ID format

```
<academic year>-<semester>-stud-<sequence>
2026-27-odd-stud-0001
```

| Part | Rule |
|---|---|
| Academic year | `YYYY-YY`. The two-digit part must be the first year + 1 (`2026-27` passes; `2026-29` fails). It must equal the `ACADEMIC_YEAR` setting. |
| Semester | `odd` or `even`. It must equal the `SEMESTER` setting. |
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
- Moving an ID to another person is allowed **only** through the
  [reassignment procedure](#reassigning-a-student-id).

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
| `TeamRoster.Semester` | Must be `Odd` or `Even` and equal the `SEMESTER` setting. |

The Student ID and Register Number columns in `Students`, and every Student ID column the app writes,
use plain-text format (`setNumberFormat('@')`).

## Maintenance mode

Used for the cut-over (Phase 5) and for every reassignment (Decision 20).

### The flag

- Stored in **Script Properties** as `MAINTENANCE` (`on` / absent), **not** in the Config tab.
  `getConfig_` reads the whole Config tab once and caches it for the rest of the execution
  ([common-helpers.js:16](common-helpers.js#L16)), so a later check in the same execution would still see
  the old value.
- Read only through `maintenanceOn_()`, which reads the property afresh on every call. It never uses the
  Config cache or the dashboard row snapshot.
- Turned on and off by two coordinator actions on the maintenance page below. Each records who changed it
  and when, in Script Properties.

### What it blocks

Every entry point calls `maintenanceOn_()` first, and every write calls it again after taking its lock:

| Entry point | During maintenance |
|---|---|
| `doGet` for anyone except the coordinator / Cell PD and pilot users | "The dashboard is being updated. Please try again later." |
| `doGet` for the coordinator / Cell PD | The [maintenance page](#the-maintenance-page) |
| `doGet` and `API_*` for a **pilot user** | The normal dashboard for that user's own roles ([Pilot users](#pilot-users)) |
| `API_*` endpoints, for everyone else | Refused, except the named operations of the maintenance page |
| Time-based trigger handlers | **Exit immediately, doing nothing.** Triggers stay installed. |
| Title form handler (`onTeamIntakeSubmit`) | Runs only to send the maintenance reply ([Title submission](#title-submission)) |
| Editor-run entry points | Refused, except `migrateStudentKeys()` and the maintenance-off action |

**Triggers are never removed.** Each trigger handler's first line checks the flag and returns. That
avoids three problems:
- recording and recreating triggers: Apps Script can list only the current user's triggers, and
  doesn't expose their schedules
- a missing form handler that can't send the maintenance reply
- users being let back in before jobs are restored

A run skipped during maintenance is picked up by that job's next scheduled run. An automated test
covers this for each job: weekly reminders, eligibility, commit collection, AI analysis and the
digests. After the window, the coordinator checks each job's first run in the Apps Script executions
list.

### Pilot users

Real people who use the live app while maintenance is still on, to check it before everyone returns.

- The coordinator enters their emails on the maintenance page. The list is kept in Script Properties as
  `MAINTENANCE_PILOTS` and is cleared automatically when maintenance is turned off.
- A pilot user gets exactly their normal roles and access. The list grants nothing extra: every endpoint
  still checks authorization as usual.
- The list applies only to a signed-in person using the dashboard. **Trigger handlers stay blocked,
  whoever owns them**, so a pilot coordinator's background jobs don't run.
- Pilot users' saves are real data. If the switch-over is rolled back, those saves are lost with
  everything else since the backup, and the pilot users redo them.

### The maintenance page

What the coordinator / Cell PD see from `doGet` while the flag is on. It shows only:
- the Students integrity card
- the verification report ([Phase 5](#phase-5-cut-over-one-release-one-maintenance-window))
- the pilot-user list
- the maintenance-off action

Each of its endpoints checks coordinator authorization itself, as every endpoint does now. The exemption
is by **operation**, not by person: a trigger owned by the coordinator still runs as the coordinator, so
a person-based exemption would let background jobs through.

**Turning maintenance off is refused** while the integrity card shows a problem: problem rows, team-binding
conflicts, orphans or `GitHubAccounts` rows without a Student ID. The page lists what has to be fixed
first.

### Drain

After turning the flag on, wait **6 minutes**. That is the Apps Script per-execution limit, so anything
that started before the flag was set has finished. The flag, not the wait, stops new work from starting.

## Reassigning a Student ID

This is how a member of one team is replaced by another person, and how members are rotated between
teams. **All credits of the ID, past and future, go to the new person** (Decision 15).

### Procedure

A reassignment is two sheet edits. Apps Script locks cannot stop a person editing the sheet, and a
half-finished edit can look valid (for example, `Students` rotated but `TeamRoster` not yet). So every
reassignment runs **under maintenance** (Decision 20):

1. **Turn maintenance on** and wait for the [drain](#drain).
2. **Edit `Students`:** for each ID, set the new person's Register Number, Student Name, Email and
   Class Number. **All four person fields change together.**
3. **Edit `TeamRoster`:** put each new register number in the ID's team slot.
4. **Open the dashboard**, which shows the [maintenance page](#the-maintenance-page), and get the
   integrity card clean.
5. **Turn maintenance off.** This is refused until the card is clean. Pages opened before the change
   must reload before saving ([Stale pages](#stale-pages)).

### Example

`2026-27-odd-stud-0001` is held by register number `9923005001`, who is in Team A. To give its credits
to `9923005002`:
- In step 2, change the `2026-27-odd-stud-0001` row to `9923005002` and that person's name, email and
  class.
- In step 3, replace `9923005001` with `9923005002` in Team A's slot.

From then on, `9923005002` signs in and sees all of `stud-0001`'s logs, marks and results in their own
name. `9923005001` no longer sees them.

### Loops between 3 or 4 members

The same procedure across several rows. For example, the people on IDs 0001 (Team A), 0007 (Team B) and
0012 (Team C) rotate. In one maintenance window, edit those three `Students` rows and the three
`TeamRoster` cells so that each ID gets its new person.

### Rules

- **An ID is bound to a team.** An ID's bound team is the Team ID found on its stored records. The
  person who takes the ID must be placed in that team.
  - **Records checked:** every record that carries both a Student ID and a Team ID: `LogEntries`,
    ProgressEligibility, `GitHubAccounts`, committee mark tabs, and the review, guide-evaluation and
    publication journals. `WeeklyReminders` carries no Team ID and is not used.
  - **The rule:** all of those records for one ID must name **the same team**, and that team must be the
    ID's current team in `TeamRoster`. Two different teams among the records, or a team different from
    the current one, is a **binding conflict**.
  - **On conflict:** the ID is a problem row, and its holder is blocked from access and writes until the
    records or the roster are fixed.
  - **No records yet:** the ID is not bound and can be placed in any team. Moving it carries no credits.
  - **When it is checked:**
    - in full, by the integrity card, which reads each of those sheets once
    - by the maintenance-off action, which is refused on any conflict
    - by every write, for the acting ID only, after the lock

    Dashboard reads don't re-scan the sheets. Since a reassignment happens only under maintenance and
    maintenance can't end while there is a conflict, a conflict can't appear between those checks.
- **No reassignment log** (Decision 18). The app does not record who held an ID before.
  - Existing `Actor` columns (who submitted a log, who saved an evaluation) still contain the email of
    whoever acted. Those columns already exist and are frozen; nothing new is added.
- **GitHub stays with the ID** (Decision 17).
  - The ID's linked GitHub account, and that account's repository access, are not changed.
  - Commits from the linked account count for the ID, whoever holds it.
  - Commits from the new person's own GitHub account do **not** count for the ID.
- **Published results follow the ID.** They are protected by a hash that includes the Student ID, and
  they show the name and register number from the current `Students` row. No re-publication is needed.

### Which `Students` edits need maintenance

| Change in `Students` | Maintenance needed? |
|---|---|
| Name, email or class number of the **same person** | **No.** Edit any time. Anyone with a page open may get "reload" on their next save; nothing is lost or misattributed. |
| A **different person** on the ID: new register number with that person's name, email and class, plus the matching `TeamRoster` edit | **Yes.** Follow the [procedure](#procedure). |
| Fixing a **typo in a register number**, plus the matching `TeamRoster` edit | **Yes.** Both tabs must change together, and a half-done edit must not be used. |

Only a register-number change needs maintenance, because only it changes who holds the ID or how the ID
joins `TeamRoster`.

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
- The in-app replacement is designed separately. It must use `requireCurrentStudent_()`, the context
  token and the maintenance switch like every other student write.

## GitHub accounts

`GitHubAccounts` keeps its first four columns (`Timestamp`, `Email address`, `Team ID`,
`GitHub Username`), which [github-identity.js:17](github-identity.js#L17) checks, and gains a
**`Student ID`** column. After the cut-over, **the Student ID is the owner of a GitHub account
everywhere**:

| Path | Today | After |
|---|---|---|
| Preview token | email + Team ID ([student-github.js:39](student-github.js#L39)) | `studentId` |
| Confirmation and "cannot be replaced" check | rows matched by email + Team ID ([student-github.js:45-70](student-github.js#L45-L70)) | rows matched by Student ID |
| Duplicate-owner check | owners resolved by email + Team ID ([github-identity.js:101](github-identity.js#L101)) | owners resolved by Student ID |
| Team setup, provisioning, invitation resend, weekly evidence | email + label (register number) | Student ID |

- **Existing rows:** the migration fills `Student ID` once, by email + Team ID.
- **New rows:** written only by the app, when a student confirms an account
  ([student-github.js:72](student-github.js#L72)). The app writes the Student ID of the signed-in holder
  with the row. No form writes to this tab.
- **Rows without a Student ID** after the cut-over are ignored for ownership and reported by the
  integrity card. This would catch an old form that is still linked to the tab.
  - Their GitHub numeric IDs **still count in the duplicate check**. Linking an account that already
    appears in such a row is refused until the coordinator repairs or removes the row. Otherwise a
    damaged row could let the same account be linked twice.
- **Reassignment** (Decision 17) leaves the GitHub row untouched. The new holder of the ID sees the
  account as already connected and cannot link another one; that is the intended Option B.
- **Addresses:** a GitHub row keeps the email of whoever linked it, which may be a former holder. The
  app never mails or displays that email. Any notification or screen about the account uses the current
  holder from `Students`.

## Weekly-log privacy filter

`weeklyAIIdentifiers_()` ([weekly-progress-phase2.js:160](weekly-progress-phase2.js#L160)) builds the
list of names and identifiers replaced with `[identity removed]` before log text goes to the AI model.
Today it takes team IDs, guide names and emails, and student names, emails and register numbers from
`TeamRoster` and `TeamStatus`, plus GitHub account details and commit usernames.

- **Add** every `Students` row: Student ID, Register Number, Student Name and Email.
- **Keep** every existing source: team IDs, guide details, GitHub metadata, commit usernames.
- Literal replacement removes known identifiers only. A nickname or other personal detail typed into a
  log cannot be recognized, so the filter is best-effort. That is true today and remains so.
- **After a reassignment** the former holder's name, email and register number are no longer in
  `Students`, and once Phase 6 retires the roster name columns they are nowhere else either. Old log text
  that mentions the former holder is then no longer filtered. This follows from Decision 18, which keeps
  no reassignment log, and is covered by the best-effort wording of Decision 8.

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
| Evaluation roster fingerprint | [evaluation-lifecycle.js:8](evaluation-lifecycle.js#L8) | Fingerprint of Student IDs. A reassignment keeps the IDs, so it does not count as a roster change. |
| Prerequisite completion | [assessment-registry.js:73](assessment-registry.js#L73) | Guide records looked up by Student ID |
| Publication team list and matching | [internal-assessment-publishing.js:25-52](internal-assessment-publishing.js#L25-L52) | Student ID |
| Weekly activity and evidence | [weekly-activity.js:32](weekly-activity.js#L32), [:96](weekly-activity.js#L96), [:121-151](weekly-activity.js#L121-L151) | Student ID |
| Team weekly summary | [common-helpers.js:583](common-helpers.js#L583) | `teamById_(id).members` |
| Registry members field | [common-helpers.js:345](common-helpers.js#L345) | `TeamRoster` register numbers; same text as now |

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
| Committee mark tabs | `Student Register No`, `Student Name`, `Student Email` | `Student ID`; name and email are derived |
| `GitHubAccounts` | `Email address` + `Team ID` | new `Student ID` column, authoritative |
| Review journals | `Student` = register number | `Student` = Student ID |
| Guide evaluation journal | `Student` = register number | `Student` = Student ID |
| Publication events | `Student` = register number; payload `releases[].student`, `snapshot.identity.register` | Student ID. Snapshot identity is `{team, studentId}` and the hash covers it. Name and register number are shown from `Students`. |

Journals are found by `assessmentJournal_` ([assessment-registry.js:80](assessment-registry.js#L80)).
The migration discovers them through it, not by assuming sheet names.

## Phases

### Phase 0: approval, settings and live-data inspection

1. **Approve** this as a reviewed change to frozen items. Each phase that changes `SHEET_NAMES` or
   `FIELD_DEFINITIONS` regenerates `tests/invariants/snapshots/schema.json` with `UPDATE_GOLDEN=1` in
   its own reviewed commit. Record the rules in AGENTS.md.
2. **Prepare the `Students` tab:** IDs assigned by whoever maintains the sheet, Student ID and Register
   Number columns formatted as plain text.
3. **Reconcile `TeamRoster` and `TeamStatus`:** same teams, members, guides and committees. Phase 2
   switches the source, so they must agree first.
4. **Inspect the live result journals** (all journals that `assessmentJournal_` resolves, plus
   publication events). A read-only coordinator report lists each journal's rows and records a
   **content fingerprint**: a hash of every cell, in order. Confirm in writing that they hold only dummy
   data. Only then is the reset in Phase 5 approved. If anything real is found, stop: the journals need a
   conversion plan of their own.

   The fingerprint, not a row count or timestamp, is what Phase 5 compares against. It also catches a
   result edited in place without a newer timestamp.

### Phase 1: foundations (no behaviour change)

- Add the `SEMESTER` setting (`Odd` / `Even`) next to `ACADEMIC_YEAR`.
- Add `SHEET_NAMES.STUDENTS` and `FIELD_DEFINITIONS.STUDENTS`.
- Add `students.js` and `teams.js` with tests, listed in the `test` script in `package.json`. Nothing
  calls them yet.
- Add the **Students integrity** card to System Status (coordinator only). It reports:
  - unusable headers, problem rows and their reasons
  - IDs with the wrong format or prefix
  - numeric-formatted Student ID or Register Number cells
  - `TeamRoster` register numbers not in `Students`, and members listed twice
  - Semester values that differ from the setting
  - teams in `TeamRoster` with no `TeamStatus` row, and differences between the two
  - after the cut-over:
    - stored records whose Student ID is not in `Students` (orphans)
    - team-binding conflicts ([Rules](#rules))
    - `GitHubAccounts` rows without a Student ID
- Add [maintenance mode](#maintenance-mode), shipped with the flag off:
  - the `MAINTENANCE` script property and `maintenanceOn_()`
  - the check at every entry point, and again after every write's lock
  - the first-line check in every trigger handler
  - the maintenance page with its operations, including the [pilot-user](#pilot-users) list
  - the refusal to turn maintenance off while the integrity card has problems
- Add the read-only **journal inspection report** used in Phase 0, step 4.

### Phase 2: team details from `TeamRoster`; coordinator detection first

- Move every file in the list above to `teams.js`. `TeamStatus` is read only for workflow state.
- Role detection checks coordinator and Cell PD first, from the settings only. Guide and reviewer are
  detected next, from `TeamRoster`'s team-level columns without resolving members
  ([Failing safely](#failing-safely)).
- Guide email recipients come from `TeamRoster`.
- Storage keys do not change.
- Verify: dashboard golden masters identical; `api-authorization*` and `entry-point-guard` pass.

### Phase 3: sign-in and access through `Students`

- Student role, `requireCurrentStudent_()` in every `API_student_*` endpoint, the GitHub student checks,
  intake membership, publication actor match and display name all use `students.js` / `teams.js`.
- Student email recipients come from `Students` ([Notification emails](#notification-emails)).
- Add `Students` to the privacy filter, keeping every existing source.
- Add the student **context token** to every student page and write ([Stale pages](#stale-pages)). The
  guide and review evaluation tokens include the holders' register numbers, names and emails.
- Storage keys do not change.
- New tests:
  - email not in `Students`
  - in `Students` but not in `TeamRoster`
  - duplicate email: both rows blocked, other students fine
  - wrong team
  - malformed `Students` with coordinator access intact

### Phase 4: the Student object everywhere (still stored by register number)

- Replace `weeklyStudents_`, `getStudentsFromTeamStatusRow_` and `rosterSlots` with the new modules,
  caller by caller.
- Internal records carry `studentId` beside `regNo`; writes still store the register number.
- Verify: identical output; all tests pass with no snapshot regeneration.

This phase makes the cut-over small: afterwards, switching keys touches only reads, writes and
contracts.

### Phase 5: cut-over (one release, one maintenance window)

**Prepared and tested beforehand on a branch:**
- every reader and writer of stored student keys uses the Student ID
- GitHub ownership uses the Student ID ([GitHub accounts](#github-accounts))
- publication snapshots use `{team, studentId}` and the release check compares `identity.studentId`
- the stored membership fingerprint uses Team ID + Student IDs, while page tokens keep the holder
  details ([Stale pages](#stale-pages))
- the contracts in [DATA-CONTRACTS.md](DATA-CONTRACTS.md), their endpoints, contract tests and views
  change together:
  - `API_student_getCore` returns `me: {studentId, registerNumber, name, classNumber}`, and roster
    entries carry `studentId`
  - guide evaluation, review marking, publication and team-drawer inputs use `studentId`
  - views use `data-student-id`
- a write endpoint that receives a value that is not a Student ID answers "This page is out of date.
  Reload." This covers pages opened before the cut-over.
- the migration function `migrateStudentKeys()`: guarded by `requireTriggerOrOperator_()` and listed in
  `tests/entry-point-guard.test.cjs`
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

1. **Turn maintenance on** and wait for the [drain](#drain). Triggers stay installed and pause
   themselves. The title form handler keeps running to send its maintenance reply.
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
6. **Verify on the maintenance page:** integrity card clean (no problem rows, binding conflicts, orphans
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
8. **Turn maintenance off.** This is refused while step 6 shows any problem, and it clears the pilot
   list. Afterwards, watch the first run of each scheduled job in the Apps Script executions list.

#### Migration rules per sheet

Every sheet records a **checkpoint** in Script Properties when it finishes. A re-run continues from
the checkpoints, but trusts a checkpoint only if the sheet still matches its rule below. A mismatch
stops the run.

| Sheet | Conversion | "Already converted" means | Checkpoint is valid when |
|---|---|---|---|
| `LogEntries`, ProgressEligibility, committee mark tabs | Header changed in place to `Student ID`; each register number replaced by the Student ID, as text | The value is a Student ID that exists in `Students` **and** whose current team equals the row's Team ID | The header in that position is `Student ID` and every data row holds a valid Student ID of the row's team |
| `WeeklyReminders` (no Team ID column) | Header changed in place to `Student ID`; each register number replaced by `studentByRegister_` | The value is a Student ID that exists in `Students` | The header is `Student ID` and every data row holds an existing Student ID |
| `GitHubAccounts` | `Student ID` column added after the existing columns; filled by email + Team ID | The cell holds a Student ID that exists in `Students` and whose current team equals the row's Team ID | The column exists after the four base columns, and every row has a valid Student ID or is listed as unowned in the report |
| Result journals (header keeps `Student`) | No conversion: reset only ([Result reset](#result-reset)) | — | See [Result reset](#result-reset) |

Any other value in a converted column stops the run. It is never overwritten.

#### Result reset

Runs only if Phase 0 approved it. Each journal goes through four states, recorded in Script Properties
**before** each change:

1. **Intent:** records the journal name and the Phase 0 content fingerprint.
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

If step 6 or the pilot check in step 7 fails, and the cause can't be fixed while still in maintenance.
Pilot users' saves since the backup are lost and are redone after the fix. **Maintenance stays on
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
5. Turn maintenance off only when step 4 is clean.

Triggers were never removed, so there is nothing to reinstall.

Rollback is only safe before maintenance is turned off. After that, new data exists in the new format.

### Phase 6: cleanup

- Retire the `TeamStatus` columns that `TeamRoster` owns: Semester, Guide Name/Email,
  S1–S4 Name/Register No/Email, Review Committee Number.
- Retire the `TeamRoster` S1–S4 Name and Email columns; slots keep the Register Number only.
- Retire the derived name and email columns in ProgressEligibility and committee tabs.
- In each case, remove the columns from `FIELD_DEFINITIONS` first, release, confirm nothing reads
  them, then delete them from the sheet.
- Remove `migrateStudentKeys()` and its entry-point-guard listing. Keep the maintenance switch.
- Update README, WEEKLY-PROGRESS.md, PROGRESS-ELIGIBILITY.md, REVIEW-EVALUATION.md, GUIDE-EVALUATION.md,
  PUBLISHING-IMPLEMENTATION.md and DATA-CONTRACTS.md.

## Starting a new semester

The code names no semester, so it is copied unchanged.

1. Create the new spreadsheet and copy the Apps Script project into it.
2. Set `ACADEMIC_YEAR` and `SEMESTER`, for example `2026-27` and `Even`.
3. Start `Students`, `TeamRoster`, `TeamStatus`, the logs and the journals with header rows only.
4. Fill `Students` with IDs for the new semester (`2026-27-even-stud-0001`, …).
5. Get the integrity card clean before students sign in.

## Tests to add

| Area | Cases |
|---|---|
| ID validation | `0000`, `10000`, wrong year pair, wrong prefix, uppercase, surrounding spaces, numeric cells |
| Directory | blank rows, partial rows, duplicate headers, duplicate ID / email / register number, leading-zero register numbers |
| Failing safely | malformed `Students` or `TeamRoster`: coordinator still opens System Status; unaffected students and teams still work; affected team's evaluations refuse to run |
| Staff detection | `Students` missing or unusable: guides and reviewers still sign in and see their teams as unavailable; member-dependent actions blocked |
| Team binding | an ID whose records name Team A but placed in Team B: holder blocked from access and writes, integrity card shows it; records of one ID naming two different teams: blocked; ProgressEligibility included; an ID with no records moves freely; maintenance-off refused on any conflict |
| Reassignment | ID moved to a new person: they see all past logs, marks and published results; the old person sees none; the published-result hash still verifies; GitHub link unchanged; the stored membership fingerprint is unchanged, so no roster-change flag |
| Reassignment loop | 3 and 4 members rotated across teams under maintenance |
| Valid-looking half edit | `Students` rotated but `TeamRoster` not yet, with no duplicate fields: the team binding check blocks the IDs involved |
| Stale pages | after maintenance ends: a weekly page loaded while holding ID A, submitted after the user has been given ID B, is rejected with "reload" and nothing saved; a guide or review evaluation page opened before a reassignment is rejected; the token shapes match the [fingerprint table](#stale-pages) exactly |
| Maintenance flag | the flag turned on after `getConfig_` has already cached Config in the same execution: `maintenanceOn_()` still sees it on; a write that took its lock just as maintenance turned on is rejected by the second check |
| Maintenance blocking | endpoints, `doGet` for non-coordinators, editor entry points and every trigger handler are blocked, **including triggers owned by the coordinator**; only the named operations run; the form handler sends the maintenance reply with no workflow change |
| Maintenance page | a coordinator opening the dashboard in a fresh browser during maintenance gets the maintenance page; a non-coordinator gets the message; each maintenance endpoint rejects a non-coordinator |
| Read-only verification | the verification report makes zero sheet writes, sends no mail and makes no GitHub API calls |
| GitHub | preview, confirm, duplicate owner and provisioning keyed by Student ID; an email change does not lose the account; new rows get the holder's Student ID; a row without a Student ID is ignored for ownership but **its GitHub ID still blocks a duplicate link**; a former holder's email in a row is never mailed or shown |
| Notifications | recipients come from `Students`; the two form-sender exceptions |
| Privacy filter | `Students` identifiers added, and team, guide and GitHub identifiers still present |
| Migration | dry run; a re-run after stopping halfway; "already converted" accepted only under each sheet's rule; `WeeklyReminders` converted without a Team ID; a second concurrent run refused; a checkpoint that doesn't match the sheet stops the run; backups are written to a separate file |
| Result reset | a journal edited in place without a newer timestamp stops the reset (fingerprint mismatch); interruption after Intent but before Clear: re-run clears; interruption after Clear but before Done: re-run records Done without clearing; Done: a re-run after a verification write never clears again |
| Rollback | restores tabs in place with their values, formulas, number formats and original size; removes the added column and leftover converted cells; keeps tab identities; removes checkpoints and reset states; maintenance stays on until the check is clean |
| Paused jobs | each trigger handler exits during maintenance and catches up on its next run after it |
| Pilot users | a pilot user gets their normal roles during maintenance and nothing more; a non-pilot is refused; trigger handlers stay blocked even when owned by a pilot; turning maintenance off clears the list |
| Cut-over contracts | an old page sending a register number gets "reload"; reminder de-duplication by (Student ID, week) |

## Risks

| Risk | Mitigation |
|---|---|
| Real results cleared | Reset only after the Phase 0 inspection approves it, only if the content fingerprint still matches, only after the off-spreadsheet backup, and never twice ([Result reset](#result-reset)). |
| Data written mid-migration | Fresh uncached maintenance flag on all entry points and trigger handlers, named exceptions only, 6-minute drain, second check after every lock, serialized re-runnable migration. |
| Jobs not restored after the window | Triggers are never removed; they pause themselves. |
| A backup is used as a live journal | Backups go to a separate file, never into the live spreadsheet. |
| One bad row locks everyone out | Problems are isolated per row and team. Coordinator and staff detection don't depend on `Students`. |
| A save goes to the wrong person during a reassignment | Reassignment only under maintenance, after the drain, so no save overlaps the edit; context tokens reject pages loaded before it. |
| Reassignment only half done | It happens under maintenance, so nobody uses the half state; the team binding and integrity card show what is left before maintenance is turned off. |
| An ID moved to a person on another team | The team binding blocks that ID's holder until it is fixed. |
| The cut-over fails in a way only real use shows | No rehearsal (Decision 21). Automated tests and the read-only dry run come first; pilot users then check the live app while maintenance is on and rollback is still possible. |
| Rollback restores old data | The rollback backup is taken in the window after the drain, not the earlier backup. |
| An ID deleted or reused | Orphans reported by the integrity card. Rule for sheet maintainers: never delete or reuse an ID. |
| Leading zeros lost | Numeric-formatted cells are reported; the columns must be plain text. |
| Page size | `students.js` and `teams.js` are server-only; `ROLE_MODULES` in [tests/page-assembly.test.cjs](tests/page-assembly.test.cjs) is unchanged. |

## Not in this plan

- The Class Coordinator role (it will use Class Number).
- Any history of reassignments (Decision 18).
- Showing a redo student their earlier semester's work: that lives in the other spreadsheet.
