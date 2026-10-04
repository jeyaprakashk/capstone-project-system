# Individual weekly progress eligibility

`ProgressEligibility` is the sole production authority. There are two policies:
steady state and isolated one-time migration. Production never reads or writes
TeamStatus's old eligibility column and contains no old/new compatibility path.

## Steady state

Maintain `Collaborator First Detected At` once, without overwriting it, when the
permission API positively confirms active repository access for the stored numeric
GitHub ID. Maintain `First Qualifying Student Commit At` from a complete historical
commit scan matched only by `author.id`. Exclude bootstrap, system, bot, unknown
and invalid commit records. Preserve previously established earlier evidence if
later history changes. Neither audit history nor account submission dates are
steady-state eligibility sources.

```text
Effective Collaborator Date = earliest valid available(first detection, first commit)
Progress Fixing Date = max(Effective Collaborator Date, Title Confirmation Date)
Progress Eligible From Week ID = first normal ordered WeeklyWindow
                                with Deadline At >= Progress Fixing Date
Enforced From Week ID = Progress Eligible From Week ID
```

Either access date alone is sufficient. A tie selects FIRST_DETECTED as the source.
Both effective access evidence and an authoritative approved title date are required.
Title dates come from the last matching MasterRegistry approval row: academic year,
semester, team, guide, exact current title and approving reviewer must match current
TeamStatus. Missing title dates never become observation time. Late Until does not
participate in eligibility. Missing future windows leave WAITING_WINDOW.

Once fixed, eligibility and its evidence are immutable in normal operation. The
coordinator-owned daily job `reconcileProgressEligibility()` around 2 AM processes
only unresolved roster students. Fixed students generate no eligibility GitHub
requests or writes. No dashboard, save, approval, provisioning or hourly scheduler
calls reconciliation.

Coordinator-managed `PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS` stores a JSON array
of normalized register numbers. Daily reconciliation skips held unresolved students
without GitHub requests or row writes and reports their count as `held`. An unresolved
row with a persisted enforcement floor is also protected from automatic fixing,
including if the explicit hold property is missing. The hold/floor is rechecked
under the write lock. Malformed hold configuration stops reconciliation.
Fixed rows remain immutable and do not require removal from the hold list.

## Schema

One row per normalized register number; register numbers and numeric GitHub IDs
are text, dates are spreadsheet dates. Required columns may be reordered but may
not be duplicated. The two retired audit-specific columns are no longer required
or read; extra existing columns are left untouched.

```text
Register Number | Student Name | Team | GitHub Username | GitHub Numeric ID |
Collaborator Status | Collaborator First Detected At |
First Qualifying Student Commit At | Collaborator Date Source |
Effective Collaborator Date | Evidence Reference | Title Status |
Title Confirmation Date | Progress Fixing Date |
Progress Eligible From Week ID | Enforced From Week ID | Eligibility Fixed At |
Status | Last Checked At | Last Check Error
```

`Evidence Reference` stores JSON repository/numeric identity and commit SHA/time.
Migrated rows may additionally retain the historical registration date, its source
sheet and row number as audit data. Production never interprets that registration
reference to calculate eligibility. Names and identity/title snapshots do not replace
TeamRoster, TeamStatus, GitHubAccounts or MasterRegistry as their source authorities.
Identity or repository conflicts require coordinator review.

## Read-only evidence requests

All calls use `GITHUB_ADMIN_TOKEN` from Script Properties:

- `GET /user/{numeric-id}` resolves the current login.
- `GET /repos/{owner}/{repo}/collaborators/{login}/permission` verifies the numeric
  identity and active access (read or higher). Invitations alone are not access.
- `GET /repos/{owner}/{repo}/commits?per_page=100` follows all next-page links before
  selecting the earliest qualifying committer timestamp, without a rolling `since`.
  The history scope is the default branch, consistent with the existing collector.

Audit API requests, event parsing, source precedence, and
`PROGRESS_ELIGIBILITY_AUDIT_MODE` configuration have been removed. Any old property
is inert; it cannot change current behavior. Normal commit collection and Commits
writes are untouched by these history reads.

A failed/incomplete history scan defers fixing, while preserving a positive first
observation. It is never treated as empty history. A successful history scan with
no qualifying commit permits first detection alone. Permission failures do not
invalidate already established reliable dates. Scans are bounded to 100 pages and
four minutes per run; exceeding those limits remains an error for retry/review.

## Retired migration

The one-time migration of existing students (preview, initialization, execution, exception holds and
property clean-up) has been completed and its code, tests and runbook steps were removed. Nothing in
production reads its cohort properties. Persisted individual eligibility and enforced boundaries are
ordinary data, described below.

Persisted Enforced From Week remains ordinary individual data consumed by required
counts; retaining it preserves the historical exemption without retaining migration
calculations. Historical evidence references and archived sheet columns can remain
as data. No cleanup operation should remove logs or change fixed boundaries.

## Production consumers and setup

Student loading and submission/revision authorization use persisted historical
individual eligibility, title requirements and the student's own numeric-ID commit
evidence. Another member's unfinished setup does not gate the student. Reminders,
MISSED generation, individual summaries, team aggregates and guide/coordinator
indicators use persisted individual enforced boundaries. Guide `requiredByWeek`
counts exclude students without an obligation; voluntary logs remain visible.

`setupProgressEligibilityStorage()` initializes/validates storage only. The daily
reconciliation trigger (around 2 AM in the spreadsheet timezone) is installed and
owned in the Apps Script project; no existing hourly weekly, commit-collection or
AI trigger depends on it.

Submission fields, numeric attribution, own qualifying-commit requirements,
ON_TIME/LATE timing, retry deduplication, freezing, guide sign-off, AI scheduling
and assessment/publication systems are unchanged.

## Live verification — October 1, 2026

Spreadsheet: `1nPtioEYUanqZ42WtBQOJfoHxJPOUGrxNKDGDFMAkq3w`.
Apps Script: `1AyDrQfSOAiTO4iFwdRzQ0QojwC_c6uKZIrJquQWL-MUVEDwD-NREDvYH`.
The original 182-student cohort and cutover `2026-10-01T01:24:47.633Z`
(`2026-W02`) were retained. No initialization was rerun.

All 182 unique students were checked. The final execution completed at 11:01:59
IST with 171 fixed, 11 unresolved and zero deferred students. Of the fixed rows,
144 are historically eligible from `2026-W01` and 27 from `2026-W02`; all 171
are enforced from `2026-W02`. All 20 headers, identity-matched registration
references, authoritative title approvals, earliest effective evidence dates,
fixing dates and normal-deadline boundaries were verified. The original 20 fixed
rows remained unchanged.

Remaining prerequisites (11 unique students; two have both kinds of issue):

| Prerequisite | Team | Register numbers |
| --- | --- | --- |
| Numeric GitHub identity | G24 | 9923005155 |
| Numeric GitHub identity | G45 | 9923005019 |
| Numeric GitHub identity | G50 | 9923005087 |
| Authoritative title approval | G20 | 9923005048, 9923005037, 9923005008 |
| Authoritative title approval | G45 | 9923005019 |
| Authoritative title approval | G50 | 9923005154, 9923005308, 9923005087 |
| Authoritative title approval | G56 | 9923005192, 9923005220, 9923005025 |

The one-time migration is complete and retired: unresolved cohort members were moved to normal daily
eligibility and the migration code, cohort properties and runbook steps were removed.

The coordinator-owned daily trigger was installed and its Day timer, 2–3 AM
GMT+05:30 schedule verified. All five existing triggers were retained:
`processWeeklySubmissionSchedule`, `processWeeklyProgressAI`, `fetchAllCommits`,
`onTeamIntakeSubmit` and `sendGuideReminderDigest`.

Only the obsolete TeamStatus column was deleted after rechecking its unique
header at AC. Readback confirmed 28 remaining columns, unchanged A:AB data and
unchanged structures for all other sheets. Logs, revisions, sign-offs, AI analyses
and other history were not rewritten or deleted. Migration code and properties
were removed after the exceptions were resolved.

The live source was compared with local code before edits, preserving the
20-student/90-second batching fix. Saved source readback matched the tested local
files. The hold and window-snapshot changes were committed and pushed as
`770b4a4` and `a1ec2e2` respectively. Validation: 42 eligibility tests and all
639 full-suite tests passed, with no failures or skips; syntax and diff checks
passed. A few live batches hit script-lock timeouts and were resumed without
resetting or overwriting fixed records. No execution remains running from this
migration workflow.
