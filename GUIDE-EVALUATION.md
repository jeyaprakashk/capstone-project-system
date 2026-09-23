# Guide evaluation

## Enable in a test deployment

1. Populate `Milestones` with the schema documented in
   [DASHBOARD-PERFORMANCE.md](DASHBOARD-PERFORMANCE.md). Set the `guide_eval`
   row's Graded By to `Project Guide`, enter its due date and Weight (%).
2. Maintain the guide criteria directly in the existing `Rubrics` sheet.
   Use `Milestone ID` = `guide_eval`, Individual type, and all six Level 0–5
   descriptors. No rubric creation/reset action or built-in criteria are provided.
3. Use the manually created `GuideEvaluations` tab in the main spreadsheet.
   Its header row must be: `Assessment`, `Team`, `Student`, `Revision`, `Action`,
   `Actor`, `At`, `Request ID`, `Payload`. The application validates these headers
   and never creates or replaces the tab. Deploy the updated script, then refresh evaluations.
4. Verify the entered criteria and band convention against the approved framework
   before production grading, then refresh evaluations.

For the previously supplied framework, enter five criteria totaling 100 marks
and a milestone weight of 20. Grading reads these values from the sheet; the code supplies no default criteria.
No team-level copying or inferred marks are used. SEE collection and final
course aggregation remain outside this workflow.

## Guide workflow

The dashboard's Guide Evaluation button is disabled until five calendar days
before the scheduled `guide_eval` date, using the spreadsheet timezone. While
disabled, it shows its opening date; a missing date keeps it disabled. Refresh
the dashboard to update the button after the opening date or a schedule change.
The button remains available on and after the assessment date.

Open **My Teams → Guide Evaluation** on the assigned team. Select a student,
expand criterion descriptors, select each level and enter marks within the
shown range. Marks accept two decimals. Select **Save Draft** for incomplete
work or **Submit Evaluation** when complete. Each criterion below Level 2 needs
a remark on submission. Zero is valid; blank is incomplete. The repository link
opens existing project evidence; the app does not treat commit counts as marks.
Student selection/reload/closing warns about unsaved edits. Tab switching keeps
the editor in memory. Page reload fetches fresh data and discards browser state.

Scoring bands (percentage of that criterion's maximum):

| Level | Permitted percentage |
|---|---|
| 0 | 0 inclusive to 40 exclusive |
| 1 | 40 inclusive to 60 exclusive |
| 2 | 60 inclusive to 75 exclusive |
| 3 | 75 inclusive to 85 exclusive |
| 4 | 85 inclusive to 95 exclusive |
| 5 | 95 through 100 inclusive |

The server validates without first rounding percentages and calculates total
marks against the sum of criterion maxima, and contribution as
`total / maximum × milestone Weight (%)`, rounded to two decimals. The policy
version is `guide-bands-v2`. Committee level-to-mark scoring is unchanged.
Late submissions remain allowed and carry a late flag; drafts after the deadline
are shown as overdue to coordinators.

## Coordinator and student workflow

System Status shows aggregate student, submitted and published counts without a
student list or per-student action buttons. The coordinator server operations remain:
**Publish** releases a submitted student's marks and feedback; **Reopen** requires a reason,
withdraws publication, and creates a blank draft using the current rubric.
Previous revisions are retained. The assigned guide must reevaluate and submit;
coordinators cannot overwrite scores. Every student sees only their own latest
published evaluation in My Team. Existing page content follows the application's
page-session reuse rule; reload the page to observe publication/reopening changes.

Coordinator cards and the tracker count a team complete only when every current
registered student has a Submitted or Published evaluation. Invalid setup shows
Unavailable rather than zero completed. Changing the roster/guide blocks
publication of a mismatched submission and requires reopening.

## Persistence and interfaces

`GuideEvaluations` is an append-only log: Assessment, Team, Student, Revision,
Action, Actor, At, Request ID, Payload. The JSON payload holds the full rubric,
score policy, per-criterion levels/marks/COs/feedback, totals, roster fingerprint,
status, late flag, and request fingerprint. Latest revision determines state;
previous submitted rubrics and marks are never recalculated. Do not manually edit
this log. Normal sheet ownership/sharing must keep it inaccessible to students.
The existing Apps Script deployment identity writes it on authenticated users'
behalf; every public endpoint verifies the actual signed-in user.

Read APIs: `loadGuideEvaluation(team, student)`,
`loadCoordinatorGuideEvaluations()`, `loadPublishedGuideEvaluation()`.
Write APIs: `saveGuideEvaluationDraft(input)`, `submitGuideEvaluation(input)`,
`publishGuideEvaluation(input)`, `reopenGuideEvaluation(input)`.
All write inputs include team, student, expected revision, and request ID.
Guide writes additionally include the load token and scores; reopen includes a
reason. Setup is coordinator-only. Stale revisions, stale rubric/roster tokens,
and unauthorized assignments fail before append. A short script lock serializes
writes; identical request retries return the original result. Different payloads
cannot reuse a request ID. A single append is both the action log and full state
revision; there is no separate current-state write to diverge.

No cross-request cache, localStorage or sessionStorage is introduced. Rubric
parsing is shared with review logic, but `guide_eval` is excluded from committee
sheet creation. Definitions now come from Milestones; existing spreadsheet data
is not automatically migrated. Excel export and complete course-grade aggregation
are not included.

## Verification before production

Run `npm test`. Automated fixtures cover band boundaries, zero/blank, remarks,
precision, authorization, publication privacy, full revision workflow, retries,
lock contention, stale edits, assignment/rubric changes, setup repeatability,
completion counts, and existing review regressions.

In a test deployment use separate guide, coordinator and student accounts:
- Guide saves partial marks, reloads, completes/submits, and cannot edit afterward.
- An unrelated guide cannot read/write the evaluation, including direct RPC calls.
- Student sees no draft/submitted marks; coordinator publishes and the correct
  student sees marks after reload; another student sees no such result.
- Reopen withdraws visibility after reload and permits the assigned guide to enter
  a new draft. Verify the older revision remains intact in the storage sheet.
- Two tabs editing the same student produce a stale-revision error instead of
  overwriting each other; double clicks do not append duplicate revisions.
- Confirm mobile form layout, selected-level ranges, unsaved-change prompts,
  System Status refresh behavior and unchanged reviewer sheet creation.

These live account and visual checks have not been performed locally. History
is sheet-backed and grows with revisions; monitor execution duration and sheet
size under the semester's actual workload before claiming capacity guarantees.

## Rubric maintenance

The Rubrics setup card and creation/reset routines have been removed. Maintain
criteria in the sheet. Assessment readiness still validates the existing rubric
configuration. Guide evaluation setup creates only evaluation-record storage;
it does not create or modify rubric definitions.

The read-only **System Status → Rubrics** card checks that the tab exists and
contains valid criteria for every graded Milestones assessment, including Guide
Evaluation and SEE. It shows a green Configured pill or an amber Not configured
pill with the missing/invalid configuration explained. Refresh System Status to
read sheet changes. This card never creates or modifies rubric definitions.
