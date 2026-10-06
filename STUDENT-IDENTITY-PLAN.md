# Student identity: implementation plan

Status: **plan, not implemented.** Nothing described here exists in the code yet.

This plan introduces a `Students` tab and a single server-side **Student object** that every part of
the system uses. It is a deliberate schema and role-detection change. It is not a dashboard migration,
so it is made outside the migration rules in [AGENTS.md](AGENTS.md) and needs review (see Phase 0).

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What links `TeamRoster` to students? | `TeamRoster` student slots hold the **Register Number**. |
| 2 | Where do team details come from? | Team ID, semester, guide details, committee and student membership come from **`TeamRoster`**, not `TeamStatus`. |
| 3 | A student in `Students` but on no team? | Out of scope. Such a user has no student role. |
| 4 | Student ID format | `<academic year>-<semester>-stud-<4-digit sequence>`, for example `2026-27-odd-stud-0001`. The sequence is always 4 digits (see [Student ID format](#student-id-format)). |
| 5 | Cut-over | Migrate the **live system**: existing data is converted, not abandoned. |
| 6 | Existing results | Review, guide-evaluation and publication records hold **dummy data**. They are cleared, not migrated. |
| 7 | AI model | No student details are sent to the AI model, now or later. |
| 8 | `MasterRegistry` | Not a student record; it stays as it is. |
| 9 | Class Number | Stored now. It will drive a future **Class Coordinator** role, which is not part of this plan. |
| 10 | A student who redoes the project | A student does a project only once. A redo has a new title and happens in a later semester, so it lives in that semester's spreadsheet with a **new Student ID**. |
| 11 | Scope of a spreadsheet | **One spreadsheet serves one semester.** The next semester gets a new spreadsheet with the Apps Script code copied into it. |
| 12 | Notification emails | Every email to a student goes to **`Students.Email`** (see [Notification emails](#notification-emails)). |

### What one semester per spreadsheet means

- Every row in this spreadsheet's `Students` tab belongs to the same semester. Inside one spreadsheet a
  student appears **once**, so register number and email are unique across the whole tab.
- The semester is a property of the spreadsheet, not of each row. It is the `ACADEMIC_YEAR` setting
  plus a new **`SEMESTER`** setting (`Odd` / `Even`). This is the same pair already used to name team
  repositories (`capstone-2026-27-odd-team-…`, [github-provisioning.js:64](github-provisioning.js#L64)).
  Every Student ID in the tab must start with it, and every `TeamRoster.Semester` value must equal it.
- A redo student's earlier work stays in the earlier semester's spreadsheet. This spreadsheet never
  sees two attempts by one student.
- The year-and-semester prefix keeps IDs unique **across** spreadsheets, so they stay unambiguous if
  semesters are ever compared or combined.

## Target model

### Tabs and who owns what

| Tab | Owns | Student key |
|---|---|---|
| `Students` (new) | One row per student in this semester: Student ID, Register Number, Student Name, Email, Class Number | **Student ID** (primary key) |
| `TeamRoster` | Team ID, Semester, Guide Name/Email/GitHub, Review Committee Number, student slots | **Register Number** (the one exception) |
| `TeamStatus` | Workflow state only: Title, Problem Statement, Similarity Flag, decisions and notes, Title Approved By, document links, Repo URL | none; keyed by Team ID |
| Every other tab | Logs, reminders, eligibility, evaluations, publications, committee marks, GitHub accounts | **Student ID** |

`Students` headers, in order:

```
Student ID | Register Number | Student Name | Email | Class Number
```

### Join path

```
login email ──► Students.Email ──► Student (studentId, registerNumber, name, email, classNumber)
                                        │
                     Students.Register Number ◄── TeamRoster.Student n Register No
                                        │
                                        ▼
                         team (teamId, guide, committee, slot n)
```

The register number is the join key between `TeamRoster` and `Students`. It is enough on its own
because a student appears only once in this spreadsheet.

### The Student object

It exists only on the server. Columns never leave the server; the browser receives DTO fields.

```js
{
  studentId,        // Students.Student ID (text)
  registerNumber,   // Students.Register Number (text)
  name,             // Students.Student Name
  email,            // Students.Email, normalized
  classNumber,      // Students.Class Number (reserved for the future Class Coordinator role)
  teamId,           // the one TeamRoster row whose slot holds registerNumber
  slot              // 1–4: position in that row (keeps roster order stable)
}
```

The semester is not stored on the object: it is the same for every student in the spreadsheet. Code
that needs it reads the `ACADEMIC_YEAR` and `SEMESTER` settings. No code splits the ID string to find it.

### The Team object

Built from `TeamRoster`, with students resolved through `Students`.

```js
{
  teamId, semester, committeeNumber,
  guide: { name, email, githubUsername },
  students: [Student, ...]   // in slot order
}
```

## New server modules

Every function name ends in `_` (see *Public surface* in AGENTS.md).

### `students.js`: the only reader of the `Students` tab

| Function | Purpose |
|---|---|
| `studentDirectory_()` | Reads `Students` once per request through `getSheetRows_`. Returns `{list, byId, byEmail, byRegister}`. **Throws** when a row breaks a [uniqueness rule](#uniqueness-rules) or the [ID format](#student-id-format), so it never guesses. |
| `isStudentId_(value)` | Checks that a value matches the [Student ID format](#student-id-format) **and** this spreadsheet's semester prefix. Used by the directory, the integrity check and every endpoint that accepts a `studentId` from the browser. |
| `studentIdPrefix_()` | Builds `<ACADEMIC_YEAR>-<semester>-stud-` from the settings, for example `2026-27-odd-stud-`. Throws if either setting is missing or malformed. |
| `studentById_(id)`, `studentByEmail_(email)`, `studentByRegister_(regNo)` | Lookups returning `Student` or `null`. |
| `currentStudent_()` | Takes the session email, finds it in `Students`, and requires the student's register number on exactly one `TeamRoster` row. Returns `Student` or `null` (Decision 3). |
| `nextStudentId_()` | Returns the next free ID: the highest sequence in the tab + 1, formatted to 4 digits. Shown by the integrity check to whoever adds rows. Sequences are never reused, even after a row is deleted. |
| `requireCurrentStudent_()` | Replaces `studentAccessOrThrow_` ([student-api.js:70](student-api.js#L70)). Throws `apiFail_('UNAUTHENTICATED' / 'NOT_FOUND')`. |

The directory does not index by Class Number yet. The Class Coordinator role will add that lookup
when it is defined.

### `teams.js`: the only reader of team details

| Function | Purpose |
|---|---|
| `teamDirectory_()` | Reads `TeamRoster` once per request. Resolves each slot's register number through `studentDirectory_()`. Throws on an unknown register number, a register number on two teams, a `Semester` that differs from the `SEMESTER` setting, or a duplicate Team ID. |
| `teamById_(teamId)` | Returns a `Team` or `null`. |
| `teamsForGuide_(email)` | Teams whose guide email matches. |
| `teamsForCommittee_(numbers)` | Teams assigned to the given committees. |
| `teamStudents_(teamId)` | Students of a team, in slot order. |

All existing callers move onto these two modules. No other file reads S1–S4 columns, guide columns or
committee columns again.

## Current state

### What is replaced

| Today | Where | Replaced by |
|---|---|---|
| `weeklyStudents_()`: `{email, regNo, teamId}`, cross-checks `TeamRoster` against `TeamStatus` | [logbook-tracker.js:289](logbook-tracker.js#L289), about 12 callers | `teamDirectory_()` / `studentDirectory_()` |
| `getStudentsFromTeamStatusRow_()` | [marks-tracker.js:27](marks-tracker.js#L27), 12 callers | `teamStudents_(teamId)` |
| `rosterSlots` built inline from `TeamStatus` | [student-dashboard.js:50](student-dashboard.js#L50) | `teamStudents_(teamId)` |
| Student role: email in `TeamStatus` S1–S4 | [dashboard-router.js:44](dashboard-router.js#L44) | `currentStudent_()` |
| Guide role and guide authorization: `TeamStatus.Guide Email` | [dashboard-router.js:51](dashboard-router.js#L51), [guide-api.js:123](guide-api.js#L123), [guide-api.js:221](guide-api.js#L221) | `teamsForGuide_()` |
| Reviewer role: `TeamStatus.Review Committee Number` | [dashboard-router.js:59](dashboard-router.js#L59), reviewer API and evaluation | `teamsForCommittee_()` |
| Display name from slots or guide name | [dashboard-router.js:80](dashboard-router.js#L80) | `Student.name`, then `Team.guide.name`, then ReviewCommittee |
| Intake membership check: submitter email in `TeamStatus` slots | [intake-approval-workflow.js:45](intake-approval-workflow.js#L45) | `studentByEmail_()` plus a check that `teamId` matches |
| Registry member list: S1–S4 Register No from `TeamStatus` | [common-helpers.js:345](common-helpers.js#L345) | `teamStudents_()`, producing the same register-number text |
| Team weekly summary: register numbers from `TeamStatus` slots | [common-helpers.js:583](common-helpers.js#L583) | `teamStudents_()` |

### Files that read `TeamStatus` team-detail columns today

Each must move to `teams.js`:

`common-helpers.js`, `coordinator-dashboard.js`, `dashboard-router.js`, `github-invitation-resend.js`,
`guide-api.js`, `guide-dashboard.js`, `guide-evaluation.js`, `intake-approval-workflow.js`,
`logbook-tracker.js`, `marks-tracker.js`, `progress-eligibility.js`, `publication-events.js`,
`review-evaluation.js`, `reviewer-api.js`, `reviewer-dashboard.js`, `reviewer-evaluation.js`,
`student-api.js`, `student-dashboard.js`, `student-github.js`, `team-folders.js`,
`team-github-setup.js`, `weekly-progress-phase2.js`, `github-provisioning.js` (already uses `TeamRoster`
for the guide but `TeamStatus` for the team list).

### Stored student keys to migrate

| Sheet | Column today | After | Notes |
|---|---|---|---|
| `LogEntries` | `Reg No` | `Student ID` | Same column position; rewrite values. |
| `WeeklyReminders` | `Reg No` | `Student ID` | |
| ProgressEligibility | `Register Number` (and `Student Name`) | `Student ID` | Name becomes derived. Keep the text number format ([progress-eligibility.js:66](progress-eligibility.js#L66)). |
| Committee mark tabs | `Student Register No`, `Student Name`, `Student Email` | `Student ID` | Name and email become derived. |
| `GitHubAccounts` | `Email address` + `Team ID` (form-owned) | add `Student ID` | The first four columns are fixed by the form and checked at [github-identity.js:17](github-identity.js#L17). Fill `Student ID` on the server; legacy rows resolve by email. |
| Review journal | `Student` = register number | `Student` = Student ID | Dummy data: cleared, not migrated (Phase 5). |
| Guide evaluation journal | `Student` = register number | `Student` = Student ID | Dummy data: cleared, not migrated. |
| Publication events | `Student` = register number; payload `releases[].student` and `snapshot.identity.register` | Student ID; snapshots carry `identity.studentId` | Dummy data: cleared, not migrated. |

**Not migrated: `MasterRegistry`** (in the hub spreadsheet). It is not a student record. When a title is
approved, [intake-approval-workflow.js:232](intake-approval-workflow.js#L232) appends a row whose members
field is the team's comma-joined register numbers (`buildTeamMembersField_`). The plan keeps that
field exactly as it is, sourced from `TeamRoster` instead of `TeamStatus`.

## Phases

Each phase ships on its own, keeps `npm test` green and changes no academic rule.

### Phase 0: approval and preparation

- Record this as a reviewed schema and role-detection change. AGENTS.md freezes sheet names, headers,
  stored data and role detection for *migrations*; this is the out-of-migration route it allows.
- Confirm the [Student ID format](#student-id-format) and assign IDs to the current students.
- Add a short "Students and Student ID" section to AGENTS.md and update `FIELD_DEFINITIONS` docs.
- Every phase that changes `SHEET_NAMES` / `FIELD_DEFINITIONS` regenerates
  `tests/invariants/snapshots/schema.json` with `UPDATE_GOLDEN=1`, in its own reviewed commit.
- Agree a maintenance window for Phase 5.

### Phase 1: `Students` tab and directory (read-only, no behaviour change)

- Add `SHEET_NAMES.STUDENTS = 'Students'` and
  `FIELD_DEFINITIONS.STUDENTS = {ID:'Student ID', REGNO:'Register Number', NAME:'Student Name', EMAIL:'Email', CLASS:'Class Number'}`.
- Add the `SEMESTER` setting (`Odd` / `Even`) beside `ACADEMIC_YEAR`, and set it for the current
  spreadsheet.
- Add `students.js` and `teams.js` with tests. Add the test files to the `test` script in
  `package.json`; an unlisted test never runs.
- Add a **Students integrity** check to System Status (coordinator only). It reports:
  - missing Student ID, Register Number or Email, or a row that breaks a
    [uniqueness rule](#uniqueness-rules)
  - Student IDs that do not match the [format](#student-id-format)
  - Student IDs whose prefix is not this spreadsheet's `ACADEMIC_YEAR` + `SEMESTER`
  - `TeamRoster` register numbers not found in `Students`
  - a register number on more than one team
  - a `TeamRoster.Semester` value that differs from the `SEMESTER` setting
  - the next free Student ID (`nextStudentId_`), for whoever adds rows
  - `TeamRoster` teams with no `TeamStatus` row
  - `TeamRoster` and `TeamStatus` disagreeing on guide, committee or members. These must be reconciled
    before Phase 2.
- Fill the `Students` tab and get the check clean. Nothing reads the new modules yet.

### Phase 2: team details from `TeamRoster`

- Switch every file listed under *Files that read `TeamStatus` team-detail columns* to `teams.js`.
  `TeamStatus` is then read only for workflow state, keyed by Team ID.
- Switch every student and guide email recipient as listed in
  [Notification emails](#notification-emails).
- Guide and reviewer role detection and authorization use `teamsForGuide_()` / `teamsForCommittee_()`.
- Student name and email still come through `Students`; storage keys are unchanged.
- **Keep student details out of AI requests (Decision 7).** Weekly-log text is written by students
  and can mention names. `weeklyAIIdentifiers_()`
  ([weekly-progress-phase2.js:160](weekly-progress-phase2.js#L160)) builds the list of identifiers
  replaced with `[identity removed]` before the text is sent. It reads names, emails and register
  numbers from `TeamRoster` and `TeamStatus`, so once those columns are retired it must read every
  `Students` row instead: Student ID, Register Number, Name and Email.
- Verify: the golden masters for the student, guide, reviewer and coordinator dashboards match
  exactly, and `api-authorization*` and `entry-point-guard` tests pass.

### Phase 3: login builds the Student object

- `getDashboardRoleViews_` uses `currentStudent_()`. The student role requires both:
  - the email is in `Students`
  - the student's register number is on exactly one `TeamRoster` row

  Anything else gives no student role (Decision 3).
- `requireCurrentStudent_()` replaces `studentAccessOrThrow_` in every `API_student_*` endpoint. Each
  endpoint re-checks on its own; the browser never supplies the identity.
- The publication actor match ([publication-events.js:116](publication-events.js#L116)) and
  `authorizeWeeklyStudent_` ([logbook-tracker.js:319](logbook-tracker.js#L319)) use the Student
  object.
- New authorization tests:
  - email not in `Students`
  - email in `Students` but not in `TeamRoster`
  - duplicate email
  - correct student on the wrong team
  - a `studentId` sent from the browser with another semester's prefix is rejected

### Phase 4: the Student object everywhere, still stored by register number

- `weeklyStudents_`, `getStudentsFromTeamStatusRow_` and `rosterSlots` become thin wrappers over
  `teamStudents_()` that return the old shapes. Then each caller is moved to `Student` and the
  wrappers are deleted.
- Internal records carry `studentId` alongside `regNo`. Writes still store the register number.
- Verify: identical dashboard output; all tests pass with no snapshot regeneration.

### Phase 5: migrate stored keys

Done in the maintenance window by one coordinator-run function, `migrateStudentKeys()`:

- It is public only for this run. It starts with `requireTriggerOrOperator_()`, is listed in
  `tests/entry-point-guard.test.cjs`, and is removed in Phase 7.
- It holds the script lock.

Run order:

1. **Pause triggers** that write student keys: weekly reminders, eligibility, commit collection, intake.
2. **Dry run.** Produce a report per sheet: rows to change, rows that cannot be resolved, and conflicts.
   Stop if anything cannot be resolved.
3. **Back up** each affected tab by copying it to `<name> backup <date>`.
4. **Rewrite the tabular sheets.** For `LogEntries`, `WeeklyReminders`, ProgressEligibility and the
   committee tabs:
   - Change the header text in the same column position.
   - Replace each register number with the Student ID, using `setNumberFormat('@')` so IDs stay text.   - Drop the now-derived name and email columns only after Phase 6 stops reading them.
5. **`GitHubAccounts`:** add the `Student ID` column after the existing columns and fill it by
   email + Team ID. Future submissions get it filled on the server when the account is confirmed.
6. **Result journals (review, guide evaluation, publication events): clear the dummy data.**
   - The backup from step 3 keeps a copy. Clear all data rows and keep the header row
     (`Assessment, Team, Student, Revision, Action, Actor, At, Request ID, Payload`).
   - From now on the `Student` column holds the Student ID. Review and guide-evaluation rows key
     each revision chain by (team, Student ID).
   - Publication snapshots carry `identity.studentId`, plus `identity.register` because the register
     number is still displayed. The release check at
     [publication-events.js:71](publication-events.js#L71) compares `snapshot.identity.studentId`
     with `release.student`.
   - No legacy keys remain, so readers need no register-number fallback.
7. **Resume triggers** and check the System Status integrity card.

Tests: the review, guide-evaluation and publication fixtures switch to Student IDs. They prove that:

- latest-revision lookup is unchanged
- publication verification is unchanged
- results stay visible to students

### Phase 6: contracts and views

Update [DATA-CONTRACTS.md](DATA-CONTRACTS.md), each endpoint, its contract test and its view together:

- `API_student_getCore` gains `me: {studentId, registerNumber, name, classNumber}`. Roster entries
  carry `studentId`; `isMe` compares Student IDs.
- Guide evaluation (`API_guide_getEvaluation(teamId, register)` and save/submit inputs), review
  marking inputs (`student`), publication actions and the team drawer change to `studentId`. The
  register number stays as a display field.
- Coordinator and reviewer search keep matching register numbers and names. Those are attributes,
  not keys.
- Views use `data-student-id` hooks. Run `npm run build:tailwind` only if classes change.
- Rewrite the affected golden masters (`student-legacy-facts`, `guide-legacy-facts`,
  `reviewer-dto`, ...) only for the field rename, in a reviewed commit.

### Phase 7: cleanup

- Retire the `TeamStatus` columns that `TeamRoster` now owns: Semester, Guide Name/Email,
  S1–S4 Name/Register No/Email and Review Committee Number. Remove them from
  `FIELD_DEFINITIONS.TEAM_STATUS` and the sheet only after a release with no reads.
- Retire the `TeamRoster` S1–S4 Name and Email columns; the slots keep the Register Number only.
- Delete the `TeamRoster` ↔ `TeamStatus` membership cross-check in `weeklyStudents_`.
- Remove `migrateStudentKeys()` and its entry-point-guard listing.
- Update README, WEEKLY-PROGRESS.md, PROGRESS-ELIGIBILITY.md, REVIEW-EVALUATION.md,
  GUIDE-EVALUATION.md and PUBLISHING-IMPLEMENTATION.md.

## Student ID format

```
<academic year>-<semester>-stud-<sequence>
2026-27-odd-stud-0001
```

| Part | Rule |
|---|---|
| Academic year | `YYYY-YY`, where the second part is the first year + 1 (`2026-27`). Same form as the `ACADEMIC_YEAR` setting. |
| Semester | `odd` or `even`, lowercase |
| Literal | `stud` |
| Sequence | **Exactly 4 digits**, `0001`–`9999`. Each semester's spreadsheet starts again at `0001`. |

Pattern for `isStudentId_()`:

```
^\d{4}-\d{2}-(odd|even)-stud-\d{4}$
```

### Why a fixed width of 4

- **One spelling per ID.** With a variable width, `stud-1`, `stud-01` and `stud-001` would look like
  different keys for the same student. A fixed width allows exactly one spelling, so a plain text
  comparison is always correct, including Sheets lookups and filters.
- **Text order equals numeric order.** `…-stud-0010` sorts after `…-stud-0009` in a sheet, a filter
  or code, with no special sorting.
- **Room to grow.** 9,999 students is far beyond one semester, so the width
  never has to change. Widening later would break the first two properties for existing IDs.
- **Validation catches typos.** A missing or extra digit fails the pattern instead of creating a
  second student.

The example in the earlier decision (`2026-27-odd-stud-001`) becomes `2026-27-odd-stud-0001`.

### Assigning IDs

- Each new student gets `nextStudentId_()`: the highest sequence in the tab + 1.
- A sequence is **never reused**, even if a row is deleted, so an old ID in a log or result can never
  point at a different student.
- An ID never changes once assigned. Correcting a register number, name, email or class number edits
  that row and leaves the ID alone.
- A redo (Decision 10) gets a new ID in the later semester's spreadsheet. Nothing in this spreadsheet
  changes.

### Storage rules

- Stored as **text** with `setNumberFormat('@')`, lowercase.
- Formula-safe: it starts with a digit, never `=`, `+`, `-` or `@`.
- Never confused with a register number, because of the `-stud-` part.

### Uniqueness rules

`studentDirectory_()` and `teamDirectory_()` enforce these across the whole spreadsheet and throw when
one is broken:

| Rule |
|---|
| Student ID is unique |
| Register Number is unique |
| Email is unique |
| Every Student ID starts with this spreadsheet's prefix (`2026-27-odd-stud-`) |
| A register number is on at most one team |

## Starting a new semester

The code is the same in every spreadsheet, and nothing in it names a semester. For the next semester:

1. Create the new spreadsheet and copy the Apps Script project into it, as today.
2. Set `ACADEMIC_YEAR` and `SEMESTER` for the new semester, for example `2026-27` and `Even`.
3. Start the `Students`, `TeamRoster`, `TeamStatus` and journal tabs with their header rows only. No
   rows carry over: a returning (redo) student is entered as a new student.
4. Fill `Students` from `2026-27-even-stud-0001`, using the next free ID the integrity check shows.
5. Open System Status and get the Students integrity check clean before students sign in.

## Risks

| Risk | Mitigation |
|---|---|
| Real results cleared by mistake | Result journals are cleared only after the backup in Phase 5, step 3. Confirm they still hold only dummy data on the day of the migration. |
| A half-migrated sheet during live use | Maintenance window, paused triggers, script lock, dry run, backups. |
| Names written in weekly logs reach the AI model once `TeamRoster` no longer holds them | `weeklyAIIdentifiers_` reads `Students` (Phase 2). |
| `TeamRoster` and `TeamStatus` disagree when Phase 2 switches source | Integrity check must be clean before Phase 2. |
| A duplicate email or register number silently picks the wrong student | Directories throw on ambiguity; the affected user sees a clear error. |
| A copied spreadsheet still has last semester's settings or rows | IDs must carry the current `ACADEMIC_YEAR` + `SEMESTER` prefix, so leftover IDs fail the integrity check (and the directory) before anyone signs in. |
| A public function added for the migration | Trailing-`_` rule. The one migration entry point is guarded and removed in Phase 7. |
| Page size | `students.js` and `teams.js` are server-only. `ROLE_MODULES` in [tests/page-assembly.test.cjs](tests/page-assembly.test.cjs) is unchanged unless a browser module is added. |

## Notification emails

Every email to a student goes to the student's `Students.Email` (Decision 12). Guide emails go to the
guide email in `TeamRoster` (Decision 2). Today both come from `TeamStatus` slots.

| Email | Where | Recipient after the change |
|---|---|---|
| Guide updated the title; title rejected by guide | [intake-approval-workflow.js:174](intake-approval-workflow.js#L174), [:191](intake-approval-workflow.js#L191) | `teamStudents_(teamId)` → each `Students.Email` |
| Title approved (to guide and students) | [intake-approval-workflow.js:233](intake-approval-workflow.js#L233) | `TeamRoster` guide email + each `Students.Email` |
| Reviewer requested revision | [intake-approval-workflow.js:237](intake-approval-workflow.js#L237), [:239](intake-approval-workflow.js#L239) | `TeamRoster` guide email; each `Students.Email` |
| Weekly progress reminder | [logbook-tracker.js:572](logbook-tracker.js#L572) | `Students.Email` of the student who has not logged |
| Title-intake replies: already approved, under review, too similar | [intake-approval-workflow.js:57-81](intake-approval-workflow.js#L57-L81) | `Students.Email` of the student matched to the submitter |
| Title-intake replies: Team ID not recognized, not a team member | [intake-approval-workflow.js:38](intake-approval-workflow.js#L38), [:49](intake-approval-workflow.js#L49) | The form's submitter address. This person is not a known student of that team, so there is no `Students` row to use. |

Rules:

- Code never takes a student's recipient address from `TeamStatus`, `TeamRoster`, a form response or the
  browser. It always looks the student up in `Students` and uses that row's `Email`.
- The intake form still identifies the submitter by the form's email address. That address must match a
  `Students.Email` on the submitted team; otherwise the mismatch replies above apply, as today.
- Correcting a student's email is one edit in `Students`. Sign-in and every later notification follow it.
- Tests for the intake and reminder flows assert the recipient list comes from `Students`.

The Class Coordinator role, which will use Class Number, will get its own plan when it is defined.
