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

## Temporary migration policy

Every migration function lives in `progress-eligibility-migration.js`. No production
file depends on that module or calls a migration function.

```text
Migration Effective Collaborator Date = earliest valid available(
  GitHub account submission date, first qualifying commit, first detection)
Migration Progress Fixing Date = max(Migration Effective Collaborator Date,
                                    authoritative Title Confirmation Date)
Historical eligible week = first normal deadline >= Migration Progress Fixing Date
Cutover current week = first normal deadline >= immutable Cutover Timestamp
Enforced From Week = later ordered week(historical eligible week, cutover current week)
```

Submission dates are read ONLY here from `GitHubAccounts.Timestamp`, matching the
student's roster email, team and stored numeric GitHub ID. Choose the earliest valid
non-future matching record; blank, invalid, future and mismatched records do not
qualify. Username spelling is not identity evidence. Registration may be the only
available migration date and is deliberately accepted as a student-benefit proxy,
not represented as proof of historical access. If selected, the source is
`MIGRATION_REGISTRATION`; otherwise it is FIRST_COMMIT or FIRST_DETECTED. Ties keep
the steady-state source. Missing authoritative title evidence still defers fixing.

The cohort is snapshotted once. Later arrivals are not added to it. Resume attempts
use the original cutover and cohort, preserve first detection and fixed results,
and revalidate membership, identity, repository and title before writes. Network
requests occur outside the script lock.

Earlier historically eligible weeks remain voluntary under the existing timing,
commit and freezing rules. They create no reminders, new MISSED records, missing
counts, penalties or incompleteness. Existing logs, MISSED rows, revisions, guide
sign-offs and AI analyses are never rewritten or deleted.

## Migration workflow and later cleanup

These are future coordinator operations, not executed by this local change:

1. Set up storage only after separate authorization.
2. `previewProgressEligibilityMigration(cutoverIso)` previews cohort/cutover only.
   `previewProgressEligibilityMigrationEvidence(cutoverIso)` additionally performs
   read-only historical evidence checks and returns proposed student records and
   unresolved counts, without saving first observations or changing properties.
3. After authorization, `initializeProgressEligibilityMigration(cutoverIso)` saves
   the immutable cohort/cutover and seeds enforcement floors. Partial writes can
   resume. Pass the same reviewed timestamp when initializing after a preview.
4. `executeProgressEligibilityMigration()` reconstructs and persists individual
   eligibility under the migration policy. It requires completed initialization,
   can resume unresolved students, and never refreshes already-fixed students.
5. Verify results and resolve all migration-cohort exceptions before activating
   the normal daily job. Do not use steady-state reconciliation to finish unresolved
   migration students: it intentionally cannot use their registration dates or
   calculate a migration cutover. Initialization alone is not completed migration.
6. After verification, separately authorize cleanup and daily trigger activation.

Cleanup deletes the entire migration module, including its cohort preview,
initialization, evidence preview, execution, registration-date helper and migration
calculation. Delete properties `PROGRESS_ELIGIBILITY_MIGRATION` and
`PROGRESS_ELIGIBILITY_MIGRATION_COHORT_<n>` and migration-specific tests/runbook steps.
There are no migration branches in production to retain. The retired audit-mode
property can also be removed if present; no code reads it.

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

`setupProgressEligibilityStorage()` initializes/validates storage only.
`setupProgressEligibilityTrigger()` creates one coordinator-owned daily trigger
around 2 AM in the spreadsheet timezone, retains an existing installation and
rejects duplicate/other-owner configurations. Its ordinary property is
`PROGRESS_ELIGIBILITY_TRIGGER_OWNER`. No existing hourly weekly, commit-collection
or AI trigger is altered by the new setup.

Submission fields, numeric attribution, own qualifying-commit requirements,
ON_TIME/LATE timing, retry deduplication, freezing, guide sign-off, AI scheduling
and assessment/publication systems are unchanged.

## Local policy-update scope

Changed for this policy revision: `progress-eligibility.js`,
`progress-eligibility-migration.js`, `tests/progress-eligibility.test.cjs`, this
file and `WEEKLY-PROGRESS.md`. Prior uncommitted work remains intact.
No deployment, live spreadsheet change, migration execution or trigger installation
was performed. Tests use local mocks only.

Validation: 36 eligibility-policy tests passed; the focused eligibility, weekly,
evidence, Phase 2, schedule and browser suites passed all 195 tests. The full suite
passed all 633 tests, with no failures or skips. Syntax checks passed for both
changed JavaScript modules and the changed test file; `git diff --check` passed.
