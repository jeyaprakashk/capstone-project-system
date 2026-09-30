# GitHub student identity implementation report

## Result and validation

Implemented both separately deployable releases. Final source uses positive
GitHub ID equality for student attribution; transition-only behavior is confined
to Release 1 packaging templates. No live migration, deployment, trigger change,
or destructive operation was executed.

- Baseline: 488 tests passed.
- Final `npm test`: **531 passed, 0 failed, 0 skipped** (including resumable staging, duplicate-journal recovery, and unregistered-student readiness and presentation regressions).
- `npm run check:icons`: 35 bundled Lucide icons verified.
- `git diff --check`: passed.
- Both release packages built and their JavaScript syntax was checked.
- No duplicate top-level function declarations found in root production files.
- Confirmation/loading behavior was checked with DOM tests. Live Apps Script
  latency, permissions, migration data, and visual browser appearance were not
  verified.

## Changed files

Production:

- `github-identity.js` — ID normalization, account resolution, metadata refresh,
  duplicate academic-identity checks, and positive matching.
- `github-identity-migration.js` — schema preparation, audit, staged account
  application, journal, exact-commit backfill, and verification.
- `student-github.js` — profile preview, expiring student-bound confirmation,
  protected account save, and connected-account payload.
- `team-github-setup.js` — current-login resolution from ID, request-local reuse,
  and collaborator/invitee identity checks; staff behavior remains unchanged.
- `logbook-tracker.js` — appended author-ID capture/read state and compatible
  header validation; existing SHA/message/timestamp behavior retained.
- `weekly-activity.js` — ID-only student counts and weekly evidence with unavailable
  counts represented by null.
- `student-dashboard.js` — profile-link registration and separate account/access
  presentation within the existing setup card.
- `dashboard-client-scripts.js` — preview/confirmation, correction, retry, and
  separate provisioning flow using shared loading behavior.

Packaging/documentation:

- `scripts/build-github-identity-release.cjs`
- `releases/github-identity/weekly-activity.release1.txt`
- `releases/github-identity/student-github.original.txt`
- `releases/github-identity/student-cta.release1.txt`
- `releases/github-identity/student-client.release1.txt`
- `.gitignore`, `package.json`, `README.md`
- `GITHUB-IDENTITY-MIGRATION.md`, this report

Tests:

- Added `tests/github-identity.test.cjs` and `tests/github-identity-browser.test.cjs`.
- Updated `tests/commit-collection.test.cjs`, `tests/project-schedule.test.cjs`,
  `tests/sheet-reads.test.cjs`, `tests/student-github.test.cjs`,
  `tests/team-github-setup.test.cjs`, `tests/weekly-activity.test.cjs`,
  `tests/weekly-evidence.test.cjs`, and `tests/weekly-progress-fixture.cjs`.
- Existing username-only registration/provisioning cases explicitly exercise the
  Release 1 package; new tests exercise the final ID-only behavior.

## Exact schema changes

| Sheet | Appended headers |
|---|---|
| `GithubUsernameRaw` | `GitHub ID`, `GitHub Display Name`, `GitHub Profile URL` |
| `Commits` | `GitHub Author ID` |
| New `GitHubIdentityMigration` | `Kind`, `Key`, `Source`, `Outcome`, `GitHub ID`, `Account JSON`, `Checked At`, `Detail` |

Existing sheet names, columns, timestamps, and historical rows are preserved.
ID cells are plain text. No GitHub Email or commit-status column is added.

## Identity paths and retained legacy behavior

Student registration, duplicate checks, protected-account checks, provisioning,
invitation matching, weekly activity, and weekly evidence now use stored GitHub
IDs. Current login is resolved from ID when a GitHub endpoint requires it.

Release 2 removes username matching from student counts/evidence and removes
username-only student provisioning resolution. There is no display-name,
author-name, or email attribution fallback. Blank IDs never match. System labels
do not influence identity matching.

Retained deliberately: institutional email/register number for academic identity;
profile-username lookup at initial connection; username resolution in isolated
old-record migration; current-login API paths after ID resolution; unchanged
staff username configuration; existing team aggregate semantics. Release 1 alone
retains pre-migration reporting and registration while migration runs.

## Administrator sequence and utilities

See [the complete administrator runbook](GITHUB-IDENTITY-MIGRATION.md) for exact
build commands, batch options, editor wrappers, and rollback instructions.

1. Back up affected sheets/configuration and retain the current deployment.
2. Build/deploy Release 1.
3. Run `setupGitHubIdentityMigrationStorage()`.
4. Page through `auditGitHubIdentityMigration(options)` and review all proposals.
5. Resolve conflicting academic/account claims without deleting history.
6. Repeat `applyGitHubIdentityMigration(options)` through staging and application;
   review failures even when `done` is true.
7. Page through `backfillCommitAuthorIds(options)` and retry failures.
8. Require `verifyGitHubIdentityMigration().ready === true`; compare sample evidence.
9. Deploy Release 2 and verify student workflows/counts/reloads.
10. Confirm normal scheduled collection and rerun migration verification.

**No collection pause is required.** Collection continues during migration;
write locks and source rechecks protect concurrent work. Rollback uses Release 1,
because the original pre-migration collector rejects added schema columns.

## Unresolved live data and architectural risks

No live data was inspected or migrated, so unresolved account/commit totals are
unknown until the administrator runs the audit and verification utilities.

GitHub 404 responses can conceal access restrictions. Old username claims do not
prove historical ownership. Exact-SHA lookup uses GitHub's currently linked author
ID. Confirmation establishes a student claim, not OAuth ownership proof.

The journal must be retained to distinguish unprocessed history from confirmed
unlinked authors. Existing global SHA deduplication, first-line commit messages,
and trusted spreadsheet-administrator access remain unchanged. These are recorded
scope boundaries, not redesigned behavior.
