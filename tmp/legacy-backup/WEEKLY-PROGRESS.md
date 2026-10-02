# Weekly progress

## Phase 2: guide confirmation and AI quality

Phase 2 adds two append-only journals. Both link only to `LogEntries.Entry ID`;
they contain no duplicate student, team, week, or commit columns.

**GuideSignoff**

```text
Signoff ID | Entry ID | Status | Guide Email | Signed At
```

**AIProgressAnalysis**

```text
Analysis ID | Entry ID | Technical Substance | Specificity | Outcome | Next Action | GitHub Support | AI Score | Comment | Analyzed At
```

The assigned guide confirms the effective submitted entry as `DISCUSSED` or
`NOT_DISCUSSED`. No sign-off means `PENDING`. Either choice immediately freezes
further student revisions for that student/week, even before the normal cutoff.
This is the only Phase 2 change to the Phase 1 editing rules below. An earlier
successful student request can still be replayed without appending a revision.
Guide decisions may change by appending another sign-off; the latest is effective,
but the student log never reopens. MISSED and superseded entries cannot be signed.

The Guide Dashboard has a compact weekly table, a week selector, and View Details
for the full log, quality ratings/comment, and GitHub evidence. Missing analysis
displays a dash, never a zero. Dashboard reads never invoke Gemini.

`processWeeklyProgressAI()` selects up to five unsaved effective submitted entries
per hourly run, ordered by submission time and then physical sheet order. It runs
requests sequentially. Entries must be frozen and strictly past Deadline At;
unsigned LATE entries wait until strictly after Late Until. An early guide sign-off
therefore never shortens the qualifying GitHub evidence window.

The processor reuses attributable commits from Opens At through Deadline At.
Missing/unavailable evidence leaves the entry unsaved. The supplied Gemini
Interactions API (`gemini-3.8-flash`) receives only the four narrative fields and
commit messages. A small literal filter removes known roster and GitHub account
identifiers, emails, and links from that text. The identifier sources must be
readable before any request is sent. No identity metadata is added to the payload.
This is known-identifier filtering, not a general detector of arbitrary personal
information that a student may place in prose.

Gemini must return exactly five HIGH/MEDIUM/LOW ratings and one short comment.
Apps Script alone calculates the 0–10 quality score using HIGH=2, MEDIUM=1, LOW=0.
Quota/API errors, invalid responses, or unavailable evidence save no analysis for
that entry; the processor continues the remaining selected entries. It does not
retry within a run or replace failed entries with additional work. Later runs
retry unsaved entries oldest-first; saved Entry IDs are never reassessed. A request
may be repeated if its result was not saved. Five persistently failing oldest
entries can occupy the batch; there is intentionally no cursor/rotation mechanism.

The installing coordinator's Apps Script user lock prevents overlapping AI runs,
separately from the script lock used for student/sign-off writes. Network calls do
not hold the student-write lock. Script Properties records only the trigger owner
(`WEEKLY_AI_TRIGGER_OWNER`) for this purpose; there are no leases or cursors.

### Phase 2 setup actions (manual; not executed by this implementation)

The coordinator can also use **Assessment readiness → Weekly progress setup**:
**Create weekly progress storage**, followed by **Create weekly AI schedule**.
Each button disappears once its corresponding setup is ready. **Recheck** refreshes
both checks. Trigger creation requires ready storage, `GEMINI_API_KEY`, and the
coordinator to be the script execution account; triggers belonging to another
account must be checked by their owner. These controls call the same authorized
setup functions below. They never start an AI analysis directly.

After the code is made available in Apps Script through a separately authorized
release, run these actions as the configured coordinator:

1. Run `setupWeeklyProgressPhase2Storage()`. It creates the two sheets only when
   missing, initializes empty sheets, and validates existing normalized headers
   without rewriting history. Shared sheet/header helpers allow case differences,
   outer whitespace, and reordered columns; duplicate required headers fail.
2. Ensure Script Properties contains the existing `GEMINI_API_KEY`. Do not put it
   in a sheet or source file. Existing GitHub account metadata must be configured.
3. Run `setupWeeklyProgressPhase2Triggers()` to install one hourly
   `processWeeklyProgressAI` trigger owned by that coordinator. Rerunning retains
   the existing Phase 2 trigger and creates one only when absent, leaving all
   Phase 1/commit and unrelated triggers untouched.
   Another account cannot take ownership silently. If ownership must change,
   remove the old owner's trigger before clearing `WEEKLY_AI_TRIGGER_OWNER` and
   installing under the new configured coordinator.
4. Inspect Apps Script Executions for scheduled processing. Errors recorded by
   the per-entry handler are generic and never include prompts or API responses.

No marks, penalties, coordinator monitoring UI, new emails, correction workflow,
or extra lifecycle states are introduced. No deployment or live setup is performed
by the local implementation or its tests.

## Existing Phase 1

Weekly entry is an HTML form in the existing Apps Script Student Dashboard.
`google.script.run` calls `loadStudentWeeklyProgress()` and
`submitWeeklyProgress(input)`. There is no weekly Google Form, Form response
handler, separate app, or fallback to RawLog.

## Configuration and cutover

Create a **WeeklyWindows** sheet in the existing spreadsheet:

| Week ID | Opens At | Deadline At | Late Until |
| --- | --- | --- | --- |
| 2026-W01 | 2026-10-05 00:00:00 | 2026-10-11 18:00:00 | 2026-10-18 23:59:59 |
| 2026-W02 | 2026-10-12 00:00:00 | 2026-10-18 18:00:00 | 2026-10-25 23:59:59 |

These are examples; configure actual course windows. Enter the three date/time
columns as native Google Sheets date/time values, using the spreadsheet's time
zone (for example Asia/Kolkata), not text or JSON timestamps. Display them with a
date/time format including seconds. The reader uses the shared sheet-name and
header helpers: names are case-insensitive and trimmed, and columns can be reordered.
Missing/duplicate headers, duplicate Week IDs, invalid dates and reversed boundaries
fail closed. Blank rows are ignored.

Keep `SUBMISSION_REMINDER_HOURS` in Config as a positive number, such as `24`.
Delete the retired JSON windows Config row; it is no longer read or supported.
No automated migration modifies existing windows or LogEntries history.

Week IDs are unique and immutable once referenced. Boundaries satisfy
`opens_at < deadline_at <= late_until`. OPEN windows cannot overlap; a late
reporting period may overlap a later week's OPEN period.

- `opens_at <= now <= deadline_at`: OPEN. First submission is SUBMITTED/ON_TIME;
  revisions append REVISED/ON_TIME through the deadline, inclusive.
- Immediately after the deadline, an ON_TIME report is frozen.
- `deadline_at < now <= late_until`: students without a prior submission see LATE
  and use the same form. First save is SUBMITTED/LATE; revisions append REVISED/LATE
  through the late cutoff, inclusive.
- Immediately after the late cutoff, all submissions are frozen. The hourly
  handler appends one MISSED row only if there has never been an entry. The
  dashboard shows MISSED even before the next handler run.
- Every save includes the selected Week ID. The server validates it against the
  sheet, durable eligibility, current time and immutable first submission.
  There is no separate overdue action. Concurrent OPEN and LATE weeks use the
  same week selector and form.

Dashboard states are `OPEN · Not submitted`, `SUBMITTED ON TIME`,
`LATE · Submission available until ...`, `SUBMITTED LATE`, and `MISSED`.
Submit/Update buttons appear only for editable weeks; frozen reports remain in
submission history. Refresh preserves unsaved text and disables a form that has
become frozen. Missing counts begin after the late cutoff.

Release and setup require separate authorization. For the individual eligibility
cutover, follow [PROGRESS-ELIGIBILITY.md](PROGRESS-ELIGIBILITY.md) before enabling
weekly processing. The following describes storage and the existing hourly schedule:

1. Run `setupWeeklySubmissionStorage()`. It creates/initializes only empty
   LogEntries and ProgressEligibility storage. Existing
   incompatible storage fails instead of being overwritten.
2. The hourly `processWeeklySubmissionSchedule()` consumes persisted individual
   eligibility only; it never establishes or reconciles eligibility. The isolated
   migration reconstructs historical eligibility and applies its cutover floor.
   Complete and verify migration before activating daily reconciliation.
3. Run `setupWeeklySubmissionTriggers()` to install one hourly schedule handler
   and remove current-owner installations of `onFormSubmit`,
   `sendWeeklyLogReminders`, and `sendWeeklyAnalysisDigest`.
4. Inventory installed triggers under every account that previously installed
   weekly triggers: Apps Script trigger enumeration only exposes the caller's
   installations. Remove retired weekly installations owned by other accounts.
5. Stop accepting responses on the retired weekly Google Form. Remove Config
   `WEEKLY_LOG_FORM_URL_BASE` and `WEEKLY_LOG_TEAMID_ENTRY`. Keep its historical
   responses and RawLog untouched as archives.
6. Verify a student submission and revision in the deployed dashboard and inspect
   the installed hourly trigger. No local tests install triggers or deploy code.

Keep title/intake Google Forms, `onTeamIntakeSubmit`, their configuration and
unrelated notifications unchanged. Existing commit-fetch triggers are untouched;
Phase 1 does not add or expand them. The retired `setupLogbookTriggers` installer
and weekly-analysis/priority mechanism are no longer used.

## Schema and authoritative data

New sheet: **LogEntries**, with these headers:

```text
Entry ID | Request ID | Reg No | Team ID | Week ID | Actor | Recorded At |
Submitted At | First Submitted At | Timeliness | Entry Status | Work Completed |
Guide Discussion/Decision | Problems/Blockers | Next Week Plan
```

Individual eligibility authority: **ProgressEligibility**. Its complete schema,
evidence policy and cutover procedure are in [PROGRESS-ELIGIBILITY.md](PROGRESS-ELIGIBILITY.md).
The old TeamStatus eligibility column is not read or written by production code.

Roster membership is checked against TeamRoster and TeamStatus; mismatches or
ambiguous identities fail closed. Repository URLs remain solely in TeamStatus.
No names, guide assignments, repository registry or readiness statuses are copied
into LogEntries. Eligibility uses the first normal Deadline At at or after the
later of the student's effective collaborator date and authoritative title
confirmation date. Only the daily reconciliation fixes unresolved students.
Dashboard, submission, approval, provisioning and hourly processing never reconcile
eligibility. Once fixed, it remains persisted. Each student's enforcement boundary
controls required counts, reminders and MISSED generation. Earlier historically
eligible windows may be submitted voluntarily while their existing timing rules
permit it; they do not create obligations. Another student's incomplete GitHub
setup does not block an individually eligible student.

LogEntries is append-only. Do not manually edit, reorder or sort source rows; use
separate sheet views when inspecting history. Effective entry is the last physical
row for Reg No + Week ID. First actual entry is SUBMITTED; subsequent versions
are REVISED. First Submitted At and ON_TIME/LATE never change across revisions.
A system MISSED row has blank submission timestamps and timeliness MISSED. It is
appended only after the late cutoff; submissions are no longer permitted then.
Existing history rows are never rewritten or deleted.

All four narrative fields are required on every actual submission. GitHub commits
are system-observed supporting evidence: code, documents, CAD/design files,
simulation/experimental results, datasets, hardware/testing photographs and other
relevant project artifacts can be committed to the team repository.

LogEntries and Commits remain independent authorities. The private
`readWeeklyProgressEvidence_(student, weekId)` reader returns the effective log
and attributable commit details for an authorized, roster-derived student.
Dashboard multi-week reads reuse one request-local Team ID-scoped commit read.
Attribution requires Reg No/email, a unique verified username, Team ID, the team
repository and the configured normal window: `opens_at <= Date <= deadline_at`.
`late_until` never extends the work week. Unknown authors remain in raw history
but are excluded from evidence. Links use a validated HTTPS repository URL and
full SHA. Commits has no Week ID; there is no combined sheet or evidence cache.

The weekly form requires at least one qualifying commit for the authenticated
student in that Week ID. Both initial submissions and revisions enforce this
server-side using the same evidence reader. ON_TIME and LATE submissions use the
original inclusive Opens At through Deadline At interval; later commits never
unlock an earlier week's form. Unknown/system/bot authors and the app-generated
repository initialization commit do not qualify.

Qualifying commit details (date/time, message, short SHA) appear above the form.
With zero qualifying commits, the form is hidden and the student is prompted to
commit project work/evidence, then refresh. Unavailable mapping or collection
shows a setup/error message instead of zero. Hidden drafts are retained across
refreshes. `Refresh GitHub Activity` rereads existing mapping/Commits evidence; it
does not run or change commit collection. No additional sheet, input field,
verification record, or submission status is created.

Collection health is recorded per team in `CommitCollectionStatus`
(`Team ID | Status | Updated At`, with `ok`/`error` status).
Run normal `fetchAllCommits` collection after deploying this reader to establish
health. Before that, or after a collection/read failure, activity is unavailable,
never assumed zero. Missing, unverified or ambiguous mappings show a neutral
message. No semantic comparison, scoring, sign-off, flags or new emails are added.

Retry Request IDs deduplicate identical saves under the same script lock used by
MISSED generation. Different content with a reused ID is rejected. Identity,
repository, Week ID resolution, timestamps and timing classifications are server-side.

## Email policy

The only weekly-progress email is one pre-deadline reminder per eligible student
and Week ID, within SUBMISSION_REMINDER_HOURS of the deadline and only when there
is no actual submission. There are no confirmation, MISSED, late, guide,
coordinator, flag, escalation or sign-off emails. Dashboard status messages
communicate save results. Existing title/intake emails remain unrelated.

Successful sends are recorded in Script Properties under
`weekly-reminder:<encoded-reg-no>:<week-id>`. Failed sends can retry; recorded
successful sends are suppressed. No report-only or flag logic gates reminders.
Apps Script scheduling is approximate. Delivery and its property marker are not
transactional, so a crash after sending but before recording can duplicate an email.

No snapshots, verification flags, guide sign-off, PROGRESS_SUMMARY,
REVIEW_SNAPSHOT, escalation or marks integration are implemented.
