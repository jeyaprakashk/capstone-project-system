# Student identity: plan

Status: **plan, not built. Revision 15, a rewrite (2026-10-12).** It replaces revision 14 (1,227 lines). That text is in git history:
`git show 2b16770:STUDENT-IDENTITY-PLAN.md`. Nothing described here exists in the code yet.

**Prepared and parked (2026-10-12).** The plan is complete and ready to start, but the owner has decided to do the work later. Nothing is to
be built until the owner says to start. The decisions are made; the three items below must be answered first.

## Status and next steps

| Item | State |
|---|---|
| Plan | Revision 15, complete. Decision 1 (start in the next semester's spreadsheet) is the recommendation and stands unless the owner overrules it. |
| Academic sign-off | **Not yet recorded.** Phase 0 cannot finish without it. |
| Next semester's start date | **Not yet known.** It sets when the branch must be finished. |
| Implementation | Not started. No code, sheet, setting or branch has been created. |

**When the owner says to start, in this order**
1. Answer the three questions in [section 15](#15-questions-for-the-owner) and record the written sign-off in section 3.
2. Create the branch `student-identity` from `main`, and note the date here so that fixes made on `main` afterwards can be merged into it.
3. Phase 0 to Phase 5 in [section 12](#12-phases), one phase at a time, each with `npm test` green.
4. Before the next semester's spreadsheet is prepared, merge the branch and follow [section 13](#13-starting-the-next-semester).

**Continuing in a new session:** ask the assistant to read this file and AGENTS.md, then name the phase you are on. Search for a function
by name before relying on a file or line mentioned here; the code moves.

## 1. What this does, in plain words

Today a student is written down in several places: name, register number and e-mail are in both `TeamRoster` and `TeamStatus`,
the account is in `GitHubAccounts`, and every record (weekly logs, eligibility, review and guide marks, published results) is keyed
by the **register number**. Two problems follow:

- The same facts are typed twice, and `weeklyStudents_` stops the whole cohort if the two copies differ.
- Credits are tied to a person's register number. If a student leaves and another takes the project place, the credits cannot be
  moved without editing every record.

After this plan:

- One tab, `Students`, says who a person is: **Student ID, Register Number, Student Name, Email, Class Number**.
- `TeamRoster` says which Student ID is in which team slot. It holds the ID, not the person.
- Every record is keyed by the **Student ID**. The ID owns the credits. The `Students` row says who holds the ID now.
- After a semester is complete, the coordinator can give an ID to another person by editing one row of `Students`.

## 2. What changed since revision 14, and why this plan is shorter

| Revision 14 | Now |
|---|---|
| Convert the live semester in a maintenance window, with pilot users, a drain, per-sheet checkpoints, a result reset and a rollback. | **Not done.** The new model starts in the **next semester's spreadsheet** (decision 1). No live data is converted, so none of that machinery is needed. |
| E-mails to students go to `Students.Email`. | The project sends no e-mail. Dropped. |
| Title submission by Google Form. | The title workflow is in the dashboard (`TitleLog`). The Form, `onTeamIntakeSubmit` and `intake-approval-workflow.js` are gone. Only the membership check needs to change. |
| `WeeklyReminders` stores a student key. | The sheet was removed. |
| Columns are read by position, so the plan protected header positions. | Every sheet is read by header name (AGENTS.md, "Sheet access"). New columns are added by name through `ensureSheet_`. |
| `TeamStatus` holds title state, decisions and links. | Those columns are gone. `TeamStatus` now holds only team facts that `TeamRoster` already has, plus `Repo URL`. |

## 3. Decisions

Settled unless the owner overrules. The ones marked **owner** need the owner's answer (section 15).

| # | Topic | Decision |
|---|---|---|
| 1 | **Where it starts** (owner) | In the **next semester's spreadsheet**. The running semester keeps its current layout and code until it is complete. This reverses revision 14's decision to convert the live system. Reason: the live semester has real logs and marks keyed by register number; converting them needs a maintenance window and a rollback, and risks the data. A new spreadsheet starts empty, so it needs neither. |
| 2 | Branch | The work is done on a branch, `student-identity`. `main` keeps matching the live spreadsheet and receives only fixes, which are merged into the branch. The branch is merged when the running semester is complete, before the next spreadsheet is prepared. (AGENTS.md rule: one branch applies to dashboard work; this is the exception, because `main` is what is deployed to the live script.) |
| 3 | Tabs | New tab `Students`, defined in the sheet catalog and created by `ensureSheet_` in an editor-run setup. `TeamRoster` becomes the one source of team details. `TeamStatus` is reduced to `Team ID` and `Repo URL`. |
| 4 | Student ID | `<academic year>-<semester>-stud-<4 digits>`, for example `2026-27-odd-stud-0001`. Section 7. |
| 5 | Who creates IDs | Whoever prepares the sheet. The app only reads and validates them. It never creates, assigns, changes or reuses an ID. |
| 6 | Student role | Needs **both** a valid `Students` row (found by the signed-in e-mail) **and** a `TeamRoster` slot holding that row's ID. A student in `Students` on no team has no role. |
| 7 | Credits | All records are keyed by Student ID. Changing the person on an ID moves all of that ID's credits. Only after the semester is complete (section 9). **Needs written academic sign-off.** |
| 8 | Published results | The protection hash includes the Student ID. Name and register number shown come from the current `Students` row, so an old published result shows the current holder. Same sign-off. |
| 9 | GitHub accounts | An account stays with the person who linked it. Each row is tagged with the Student ID it was linked under, and commit credit follows the ID. Nothing is done on GitHub when a person changes. Same sign-off. |
| 10 | History | No reassignment log. The app does not record who held an ID before. Names already inside records stay there. Same sign-off. |
| 11 | Semester values | `Odd` or `Even` only, in the `SEMESTER` setting and in IDs. One spreadsheet runs one semester; no two run the same semester. |
| 12 | Redo | A student does a project once. A redo is in a later semester's spreadsheet, with a new ID. |
| 13 | Class Number | Stored now for a future Class Coordinator role. Not part of this plan. |
| 14 | `MasterRegistry` | Not a student record. Unchanged. When the end-of-semester registry export is built, its `Team Members` text comes from the register numbers in `Students`. |
| 15 | AI privacy filter | `Students` is added to the list of identifiers removed before log text goes to the AI model (section 11). |
| 16 | No e-mail | No part of this plan sends e-mail. |

**Sign-off.** The person who owns academic results records in writing that they accept: (a) credits and published results follow the
Student ID (7, 8); (b) no reassignment log is kept, so nobody can later tell who held an ID (10); (c) GitHub accounts stay with their
person while the commits made through them are credited to the ID, and so to its next holder (9). Without (a) and (b), stop: a
reassignment log is hard to add later.

## 4. The model

### What each tab owns

| Tab | Owns | Student key |
|---|---|---|
| `Students` (new) | Who holds each ID: `Student ID`, `Register Number`, `Student Name`, `Email`, `Class Number` | Student ID (primary key) |
| `TeamRoster` | `Team ID`, `Semester`, `Guide Name`, `Guide Email`, `Review Committee Number`, `Student 1 Student ID` to `Student 4 Student ID` | Student ID |
| `TeamStatus` | `Team ID`, `Repo URL` | none |
| `LogEntries`, `ProgressEligibility`, `GitHubAccounts`, the assessment journals, publication events | Each student's work and credits | Student ID |
| `MasterRegistry` (hub) | Approved titles of all years | none |

`TitleLog` is keyed by Team ID; its actors are e-mail addresses, as now. It needs no conversion.

### The join

```
signed-in e-mail ──► Students.Email ──► Student ID (and the person)
                                            │
                    Students.Student ID ◄── TeamRoster slot n
                                            │
                                            ▼
                               team, slot, guide, committee
```

The roster names the ID, never the person, so changing the person never touches `TeamRoster`.

### Objects

```js
Student    = { studentId, registerNumber, name, email, classNumber }          // from Students
Membership = { student, teamId, slot }                                          // slot 1 to 4
Team       = { teamId, semester, committeeNumber, guide: {name, email}, members: [Membership] }
```

Rebuilt for every request. Nothing is kept between requests.

## 5. Code

Two new modules; every function name ends in `_`.

**`students.js`** is the only reader of `Students`.
- `studentDirectory_()` reads and validates every row and returns `{valid, byEmail, byId, problems}`. A bad row goes to `problems` and does
  not stop good rows. It throws only when the tab or a header is unusable.
- `isStudentId_(value)`, `studentIdPrefix_()`, `studentById_(id)`, `studentByEmail_(email)`.

**`teams.js`** is the only reader of team details.
- `teamDirectory_()` reads `TeamRoster`, resolves each slot through the directory, and checks that every team has a `TeamStatus` row.
  A team with a problem is marked unavailable; other teams keep working.
- `teamById_`, `teamsForGuide_(email)`, `teamsForCommittee_(numbers)`, `membershipFor_(studentId)`.
- `currentStudent_()` and `requireCurrentStudent_()` (session e-mail to student to membership) replace `studentAccessOrThrow_` and
  `authorizeStudentGithub_`.

### Failing safely

- **The coordinator never depends on the directories.** Coordinator detection runs first and uses only settings. Today
  `getDashboardRoleViews_` reads `TeamStatus` before it checks the coordinator, so this is a change.
- **Guides and reviewers never depend on `Students`.** They are found from the team-level columns of `TeamRoster` (guide e-mail, committee
  number). A team whose members cannot be resolved still shows to them, marked "unavailable: contact the coordinator".
- **A problem stays local.** A bad row blocks only the students and the team it involves, with a clear message. Team-level actions
  (evaluations, publication, team GitHub setup) refuse while any member of that team has a problem.
- **Unusable `Students` tab** (missing, or a header missing or repeated): every student is blocked; guides, reviewers and the coordinator are not.
- `weeklyStudents_` no longer stops the whole cohort for one bad team. It is replaced by `teamDirectory_`.

## 6. What changes where

| Today | Where | After |
|---|---|---|
| `weeklyStudents_()` builds `{email, regNo, teamId}` and cross-checks `TeamRoster` with `TeamStatus` | logbook-tracker.js, about 12 callers | `teamDirectory_()` |
| `getStudentsFromTeamStatusRow_()` | marks-tracker.js, about 12 callers | `teamById_(id).members` |
| Student role from the `Student n Email` columns of `TeamStatus` | dashboard-router.js (`getDashboardRoleViews_`), student-api.js (`studentAccessOrThrow_`), student-github.js, title-api.js (`titleRolesFor_` and the member list) | `currentStudent_()` / `requireCurrentStudent_()` / `teamById_` |
| Guide and reviewer role from `TeamStatus` | dashboard-router.js, guide-api.js, reviewer-api.js | `teamsForGuide_()`, `teamsForCommittee_()` |
| Team members in team GitHub setup, provisioning, invitation resend, weekly evidence | team-github-setup.js, github-provisioning.js, github-invitation-resend.js, weekly-activity.js | Student ID and `Team.members` |
| Evaluation roster fingerprint | evaluation-lifecycle.js (`evaluationMembership_`) | `{teamId, studentIds: [sorted]}`. A change of person keeps the IDs, so it is not a roster change. |
| Publication actor match and snapshot identity | publication-events.js, internal-assessment-publishing.js | Student ID; the snapshot identity is `{team, studentId}` and the hash covers it |
| Prerequisite completion by register number | assessment-registry.js | by Student ID |
| Display names | dashboard-router.js, coordinator-dashboard.js, student-dashboard.js | `Student.name` |

Files that read the `TeamStatus` student or guide columns and move to `teams.js` (a starting list; **run a fresh search for `regNo`,
`REGNO`, `S1_` to `S4_`, `GUIDE_EMAIL` and `COMMITTEE_NUMBER` before starting**): common-helpers.js, coordinator-dashboard.js,
coordinator-api.js, dashboard-router.js, github-invitation-resend.js, github-provisioning.js, guide-api.js, guide-dashboard.js,
guide-evaluation.js, logbook-tracker.js, marks-tracker.js, progress-eligibility.js, publication-events.js, review-evaluation.js,
reviewer-api.js, reviewer-dashboard.js, reviewer-evaluation.js, student-api.js, student-dashboard.js, student-github.js,
team-folders.js, team-github-setup.js, title-api.js, weekly-activity.js, weekly-progress-phase2.js.

DTOs keep their shape. Where one shows a register number or a name, it comes from `Students`. `DATA-CONTRACTS.md` changes only where an
endpoint is added (section 12, phase 1).

## 7. Student ID format and validation

```
<academic year>-<semester>-stud-<sequence>        2026-27-odd-stud-0001
```

| Part | Rule |
|---|---|
| Academic year | `YYYY-YY`, the second part is the first year plus 1. Must equal the `ACADEMIC_YEAR` setting. |
| Semester | `odd` or `even`, lowercase in the ID. Must equal the `SEMESTER` setting, compared without case. |
| Literal | `stud` |
| Sequence | exactly 4 digits, `0001` to `9999` |

Four fixed digits mean one spelling per ID, text order equals numeric order, and a missing digit fails. IDs are never deleted or reused:
a deleted ID orphans its records, and the integrity check reports orphans.

**`Students`**: exactly one of each of the five headers (compared by `textEquals_`); a row with all five cells empty is ignored, a partly
filled row is a problem row. Student ID and Email are unique and required; Register Number is unique and must be **text** (a numeric cell
has already lost leading zeros); Name is required; Class Number is optional. Every row in a duplicate is a problem row: the app never
picks one.

**`TeamRoster`**: `Semester` is non-empty and the same on every team (and equals the setting when the values are `Odd` or `Even`). A
Student ID slot may be empty (fewer than four members); a filled slot must be a valid ID that exists in `Students` and appears only
once across the whole roster. Student ID and Register Number columns use plain text format.

## 8. Stored keys

These are schema changes for the new semester's layout: each is a reviewed commit that regenerates `tests/invariants/snapshots/schema.json`.
They are made on the branch, so the running semester is not affected.

| Sheet | Today | In the new layout |
|---|---|---|
| `TeamRoster` | `Student n Name`, `Student n Register No`, `Student n Email` | `Student n Student ID` |
| `TeamStatus` | team, semester, guide, four students, committee | `Team ID`, `Repo URL` |
| `LogEntries` | `Reg No` | `Student ID` |
| `ProgressEligibility` | `Register Number`, `Student Name` | `Student ID` (the name is read from `Students`) |
| `GitHubAccounts` | first four columns by email + team | gains `Student ID`; rows are found by it |
| Assessment journals, guide evaluation journal | `Student` = register number | `Student` = Student ID (the header stays) |
| Publication events | payload `releases[].student`, `snapshot.identity.register` | Student ID |
| `TitleLog`, `CommitCollectionStatus`, `Commits`, `Config`, `WeeklyWindows` | no student key | unchanged |

There are no committee mark tabs: the `COMMITTEE_TAB` definition in `common-constants.js` is referenced nowhere, is frozen by the
snapshot and stays. Any mark tab added later is keyed by Student ID from the start.

## 9. Changing the person on a Student ID

This moves an ID, and everything attached to it, to another person.

- **Only after the semester is complete.** Nothing is then in flight, so no maintenance window or freeze is needed.
- **Only the coordinator can do it.** The spreadsheet is editable by the coordinator alone (checked in phase 0). The app adds no check.
- Do not move an ID's roster slot to another team once it has records.

**Procedure**
1. Remove the time-driven triggers once the last weekly deadline has passed, and set the Config row `SEMESTER_COMPLETE` to `Yes`. That row
   stops writes to `GitHubAccounts`; removing the triggers stops the jobs.
2. In the ID's `Students` row set the new person's Register Number, Name, Email and Class Number. **All four change together.**
   `TeamRoster` is not touched: the new person joins the team through the ID.
3. Open System Status and get the Students check clean.
4. Do nothing on GitHub.

**What follows the ID:** logs, eligibility, marks, evaluations and published results go to the new person. Commit credit does; the
GitHub account does not (section 10). The old holder's name stays inside `Actor` columns and old text.

**Other edits.** A name, e-mail, class or register-number **typo** for the same person can be fixed in `Students` alone at any time,
because every record holds the ID. Whether an edit is a typo or a change of person is the coordinator's call; when unsure, wait for
the semester to end.

## 10. GitHub accounts

`GitHubAccounts` gains a `Student ID` column. It is found by header name, so no order is assumed.

- **Ownership.** An account stays with the person who linked it and is never transferred. Each row carries the Student ID it was linked
  under, and every path finds the row by that ID: the profile preview, the confirmation and "cannot be replaced" check, the duplicate-owner
  check, team setup, provisioning, invitation resend and weekly evidence.
- **Commit evidence is unchanged in rule:** a commit is credited when its `GitHub Author ID` matches the student's account row. Only
  the way the row is found changes.
- **New rows** are written only by the app when a student confirms an account, with the signed-in holder's ID. Nothing else writes the tab.
- **Rows without a Student ID** are ignored for ownership and listed by the Students check. Their GitHub numeric IDs still count in the
  duplicate check.
- **A change of person leaves the row as it is.** The earlier commits stay credited to the ID and show as the new holder's credit. The
  new holder cannot link a different account to that ID ("cannot be replaced"); the semester is over, so nothing needs linking.
- **After `SEMESTER_COMPLETE` is `Yes`** the app writes nothing to this tab (no refresh, no linking), so viewing a historical credit makes
  no write.
- **Screens** show the person (name, register number) from the current `Students` row, and the GitHub username only as the account that
  made the credited commits. They never say the account belongs to the new holder.

## 11. Weekly-log privacy filter

`weeklyAIIdentifiers_()` builds the list of identifiers replaced with `[identity removed]` before log text goes to the AI model.

- Add every `Students` row: Student ID, Register Number, Student Name and Email.
- Keep the existing sources: team IDs, guide details, GitHub account details and commit usernames. The list still covers every team.
- Literal replacement removes known identifiers only. A nickname or other personal detail typed into a log is not recognised. That is
  true today and stays true.

## 12. Phases

Every phase is one or more commits on the branch, and each ends with `npm test`, `npm run test:invariants` (regenerated only where a
schema change is the point of the commit), `npm run check:sheets-doc` and `npm run check:tailwind` green.

**Phase 0: approval and sign-off.** The owner approves this as a reviewed change to frozen items (sheet layout, stored data, role
detection) and records the sign-off in section 3. Confirm that only the coordinator can edit the spreadsheet.

**Phase 1: foundations (no change to behaviour).**
- Catalog entry and `ensureSheet_` setup for `Students` (an editor-run setup function, added to the entry-point guard).
- `students.js` and `teams.js` with their tests, written against the new layout.
- The Students check: a read-only report listing problem rows, a roster slot with an unknown or repeated ID, a team without a
  `TeamStatus` row, records whose key has no `Students` row, and (GitHub) collected commits whose author ID matches no account of the
  team. It is a System Status card and one new coordinator endpoint, documented in `DATA-CONTRACTS.md` with its contract test.
- The schema commit for the new `TeamRoster`, `TeamStatus`, `LogEntries` and `ProgressEligibility` layouts, with the snapshot regenerated.

**Phase 2: roles and access.** `getDashboardRoleViews_` checks the coordinator first and then uses `teams.js`. `studentAccessOrThrow_`,
`authorizeStudentGithub_`, the title membership checks and the guide and reviewer lookups move to `teams.js`. A team with a problem
is returned marked unavailable, not hidden.

**Phase 3: team members everywhere.** `weeklyStudents_` and `getStudentsFromTeamStatusRow_` are removed and every caller moves to
`teams.js`. Group the work by area, one commit each: weekly and eligibility; GitHub setup, provisioning and resend; evaluations and
publication; coordinator and guide dashboards. Each commit keeps the full suite green.

**Phase 4: stored keys.** `LogEntries`, `ProgressEligibility`, the journals, publication events and `GitHubAccounts` use the Student
ID. The publication hash includes it. The privacy filter reads `Students`. Add `Student ID` to `GitHubAccounts` through `ensureSheet_`.

**Phase 5: cleanup.** Remove the dead student columns and helpers, update README, SHEETS.md and AGENTS.md ("Sheet access" and the
role-detection text), and merge the branch when the running semester is complete.

## 13. Starting the next semester

1. Copy the spreadsheet and the script; run the setups (`setupTitleStorage`, `Students`, weekly storage, `setupTeamStatusColumns`).
2. Fill `Students` (IDs, register numbers as text, names, e-mails, class numbers) and `TeamRoster` (slots hold IDs). Fill `TeamStatus`
   with the team IDs.
3. Set `ACADEMIC_YEAR`, `SEMESTER` and `SEMESTER_COMPLETE = No` in `Config`.
4. Open System Status: the Students check must be clean.
5. Install the triggers and deploy.

## 14. Tests

New (each in the `test` script of `package.json`):
- `students.js` and `teams.js`: every validation row of section 7, duplicates, an unusable tab, a team marked unavailable, a student on no team.
- Shuffled columns, a missing header and a duplicate header for `Students`, `TeamRoster` and the changed layouts
  (`tests/shuffled-columns.test.cjs`).
- Roles: the coordinator is found with `Students` and `TeamRoster` broken; guides and reviewers still see an unavailable team; a student
  with a problem team sees "contact the coordinator" and everyone else is unaffected.
- A person change: swap the holder of an ID and check that logs, eligibility, marks and published results follow the ID, that the roster
  is untouched, and that the evaluation fingerprint does not change.
- GitHub: rows are found by ID; a row without an ID is ignored; nothing is written after `SEMESTER_COMPLETE`.
- Privacy filter includes the `Students` fields.
- The position search (`tests/sheet-position-guard.test.cjs`) still passes: no new numeric sheet index.

Existing tests that change: the fixtures that describe a team by `TeamStatus` student columns (`weekly-progress-fixture`, the coordinator,
guide and student fixtures, the team tables in `title-api.test.cjs`, `legacy-team-status.cjs`) get a shared `Students` and `TeamRoster`
builder; tests that key by register number key by ID; the schema snapshot is regenerated in the schema commit only.

## 15. Questions for the owner

1. **Start in the next semester's spreadsheet (recommended), or convert the running semester?** Converting needs the maintenance window,
   journal rewrites and rollback of revision 14, which adds roughly half of that plan back. Say "next semester" to accept the
   recommendation.
2. **Academic sign-off** (section 3). Who owns academic results, and have they accepted (a), (b) and (c) in writing?
3. **When does the next semester's spreadsheet need to be ready?** The branch must be finished before that date; the date sets how much
   work can be done in what order.

## 16. Risks

| Risk | Handling |
|---|---|
| The branch drifts from `main` while the semester runs. | Merge every `main` fix into the branch the same day; keep the branch's changes inside the files in section 6. |
| A wrong Student ID in a roster slot. | The Students check reports unknown and repeated IDs before the semester starts. |
| A register number stored as a number loses its leading zeros. | `Students` rejects a numeric register number; the columns are formatted as text. |
| A deleted `GitHubAccounts` row loses commit credit. | The app never deletes a row; after `SEMESTER_COMPLETE` it writes nothing; the Students check lists commits matching no account. |
| The coordinator edits `Students` by mistake. | Accepted: the app cannot tell a valid edit from a mistake. Only the coordinator can edit the sheet. |
| A person change made during the semester. | Not allowed by procedure; the ID would move credits mid-semester. |

## 17. Not in this plan

A reassignment log; a Class Coordinator role; creating Student IDs in the app; converting the running semester (question 1); e-mail of any
kind; changes to `MasterRegistry`; the registry export; students on no team.
