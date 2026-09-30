# Student GitHub identity: administrator runbook

The repository source is **Release 2 (ID-only)**. Do not deploy it directly before
the migration is verified. Generate and deploy Release 1 first. No migration or
deployment is performed by the build command or by dashboard requests.

## Build the two releases

```powershell
node scripts/build-github-identity-release.cjs 1
node scripts/build-github-identity-release.cjs 2
```

Outputs are `tmp/github-identity-release-1` and `tmp/github-identity-release-2`.
Each contains the complete Apps Script source and manifest, without credentials,
tests, templates, or another release's files. Point your existing deployment
tool at the selected output directory. If using clasp, configure that directory
as the root directory for the existing script project. Do not push the repository
tree recursively. Preserve the current deployment version before changing it.

Release 1 is built from the current source plus isolated transition templates in
`releases/github-identity/*.txt`. Those templates are not part of Release 2.
They retain the old reporting and username-only account handling while migration
runs. An established ID never falls back to a username in either release.

## Exact schema

`GithubUsernameRaw` keeps its name, timestamp, institutional email, team ID, and
GitHub Username columns. Setup appends `GitHub ID`, `GitHub Display Name`, and
`GitHub Profile URL`, without duplicating existing headers or moving unrelated
columns. IDs use plain-text cells. A null GitHub display name is stored as blank.
No GitHub Email is collected or stored.

`Commits` keeps A:F unchanged: Date, Team ID, Commit Message, GitHub Username,
Repository URL, Commit SHA. Setup appends `GitHub Author ID` after existing columns.
Collectors preserve the current first-line message behavior and global SHA
deduplication. Historical backfill changes only blank author-ID cells.

The administrator journal `GitHubIdentityMigration` has:

`Kind | Key | Source | Outcome | GitHub ID | Account JSON | Checked At | Detail`

Account keys are source row numbers stored as plain text. Older numeric-valued
keys are recognized without rewriting the registration sheet. Duplicate journal
history is collapsed logically by normalized key and exact current source
snapshot. Compatible migrated outcomes take precedence over proposals; duplicate
proposals claiming different IDs produce a reviewable conflict. On an actual
restage/apply write, the last existing row for that key is reused and earlier
duplicates are marked `superseded`; their payloads remain intact.

Commit keys are normalized repository owner/name plus SHA. Account proposal keys
are source row numbers, guarded by snapshots of the complete row and academic
owner. Do not sort/edit registration rows during a batch; changed snapshots are
restaged rather than blindly applied. The journal is migration/audit metadata,
not another account registry or commit tracker.

Do not delete the journal after cutover: it distinguishes confirmed unlinked
authors from historical commits that have not yet been resolved.

## Execution order

Run utilities as the configured coordinator or CELL_PD account. They check the
active user; blank active-user identity is denied. The existing admin token is
still `GITHUB_ADMIN_TOKEN`. Staff username configuration does not change.

1. Back up the spreadsheet (including Config, TeamRoster, TeamStatus,
   GithubUsernameRaw, Commits) and record the current deployment version. Protect
   credentials separately; do not put tokens in migration reports.
2. Deploy the complete **Release 1** output to the existing project/web app.
   Before schema preparation, its old registration and collection remain usable.
3. Run `setupGitHubIdentityMigrationStorage()`. It validates base headers and
   appends the new fields/journal. New profile confirmation and ID capture activate
   when the registration headers are present. No identities are inferred or
   automatically backfilled by setup.
4. Run `auditGitHubIdentityMigration({limit:50,cursor:0})`. Inspect every outcome,
   duplicates, conflicts, and proposed canonical account metadata. It makes no
   writes, including no cursor/journal writes. Continue using `nextCursor` until
   `done:true`; pass the previous response's `proposals` to accumulate cross-page
   duplicate/conflict reporting. `completeDataset:true` means all rows were
   represented. Old usernames are current account claims, not proof of historical
   ownership.
5. Resolve account conflicts through coordinator-controlled source-data correction.
   Do not delete historical rows or use student resubmission to replace an account.
   Re-audit corrected rows. There is intentionally no new reset/relink UI.
6. Repeatedly run `applyGitHubIdentityMigration({limit:50})`. Its first phase stages
   proposals in the journal across **all** registration rows; no account writes
   happen until staging is complete. Its apply phase detects cross-batch ID
   conflicts and updates bounded batches. Repeat until `done:true`; inspect
   `requiresReview` even when done. Apply resumes from journal snapshots, so its
   cursor is always zero. Use `{limit:50,retryFailed:true}` to restage failures
   after repairing access/API issues. Successful timestamps and unrelated data
   remain unchanged. An established ID is never replaced on conflicting lookup.
   Reports include `staging.total`, `staging.effectiveStaged`, `staging.complete`,
   `staging.remainingProposals`, and `staging.physicalAccountRows`. Completion and
   claim checks use effective current records, never physical journal row counts.
7. Run `backfillCommitAuthorIds({limit:50,cursor:0})`. Resume using `nextCursor`
   until `done:true`. It fetches each exact repository/SHA outside the normal
   collection window, skips established IDs, and records resolved, unlinked,
   missing-commit, inaccessible-repository, API-failure, or conflict outcomes.
   Run again from cursor zero with `retryFailed:true` after correcting failures;
   this also rechecks previously unlinked commits. Established IDs remain protected,
   including against a concurrent write while a request is in flight.
8. Run `verifyGitHubIdentityMigration()`. Require `ready:true`, review account
   results and commit totals, and compare representative weekly counts/evidence.
   Missing required IDs, conflicting journal outcomes, and unprocessed historical
   author IDs prevent readiness. Confirmed unlinked commits do not.
9. Deploy the complete **Release 2** output. Do not include transition templates or
   mix files from both releases. Verify profile connection, provisioning retries,
   accepted-invitation/title gates, student counts, weekly evidence, and reloads.
10. Confirm scheduled `fetchAllCommits()` continues successfully. Re-run verification
    to catch any rows appended during the final verification/deployment interval.

Utilities return reports. To inspect them from the Apps Script editor, use a small
temporary wrapper and inspect its execution log, for example:

```javascript
function inspectGithubIdentityMigration() {
  console.log(JSON.stringify(verifyGitHubIdentityMigration()));
}
function runGithubIdentityApplyBatch() {
  console.log(JSON.stringify(applyGitHubIdentityMigration({limit:50})));
}
function runGithubCommitBackfillBatch() {
  // Replace cursor with the preceding report's nextCursor for the next batch.
  console.log(JSON.stringify(backfillCommitAuthorIds({limit:50,cursor:0})));
}
function inspectGithubIdentityAuditPage() {
  // For later pages, pass nextCursor and accumulated proposals from the prior report.
  console.log(JSON.stringify(auditGitHubIdentityMigration({limit:50,cursor:0})));
}
```

**Do not pause collection or remove triggers.** Migration uses bounded requests
and short locked write/recheck sections. New commits may arrive between batches;
restart verification/backfill as needed. Existing Release 1 dashboards/reporting
remain available during migration.

## Verification readiness and unregistered students

`verifyGitHubIdentityMigration()` returns `accountCounts` and separate student
lists: `available`, `notRegistered`, `migrationConflict`, and
`migrationUnresolved`. The existing `accounts` list includes each student's
classification as `status`. `registrations` reports every source row, including
orphaned or ambiguous academic mappings that block readiness.

Students with no registration are `notRegistered` and do not block `ready:true`.
Existing registrations with missing/invalid/conflicting IDs still block cutover,
as do unresolved historical commits. Commit `resolved` and `unlinked` are counts;
`commits.unresolved` lists remaining unresolved records. Confirmed unlinked history
does not block readiness. Verification remains read-only and never creates accounts.

For the reported 182-student dataset, 176 available accounts, 6 not registered,
15 resolved commits and 63 confirmed unlinked commits permit readiness if there
are no other registration or journal conflicts. This is the expected result, not
a new live audit. After Release 2, unregistered students retain unavailable/null
activity and evidence until they use Connect GitHub Account. No migration or
legacy identity fallback is needed for their subsequent registration.

## Recovery from repeated account staging / duplicate journal rows

The original writer formatted the `GitHub ID` column as text but not the `Key`
column. Sheets could coerce a key such as the string `"2"` to the number `2`.
Both the staging lookup and journal upsert used strict string equality, so they
missed the existing record and appended another proposal. Completion also counted
raw journal proposals, allowing duplicate/stale rows to prevent completion. The
original test fixture preserved strings and did not simulate General-format
numeric coercion. Regression tests now simulate that behavior and 177 records.

For the existing live journal with 242 account rows:

1. Back up `GithubUsernameRaw` and `GitHubIdentityMigration`. Keep normal collection
   and dashboard operation running; avoid concurrent administrator migration runs
   and do not sort registration rows during recovery.
2. Build and deploy the **fixed Release 1** package to the same Apps Script project.
   This is an administrator action; generating a package does not deploy it. Do not
   deploy Release 2 merely to fix this staging bug.
3. Run the read-only `inspectGitHubIdentityMigrationStaging()` as coordinator and
   log its result. It makes no GitHub calls or writes. Expect `total:177` if the
   registration dataset is unchanged. `physicalAccountRows` may remain 242 or
   increase only as previously unseen keys are staged; `effectiveStaged` is the
   number that matters. Review `duplicateKeys` and `requiresReview`.
4. Repeatedly run `applyGitHubIdentityMigration({limit:50})` **without**
   `retryFailed:true` for normal resumption. Existing valid current proposals are
   reused. Missing/changed snapshots are resolved in batches. No separate repair
   function, header edit, cursor reset, or manual journal-row deletion is required.
   The same call starts applying on a subsequent invocation once staging is
   complete, so do not invoke it if application is not yet authorized.
5. Require `staging.complete:true` and `effectiveStaged === total`. From an empty
   177-record journal the normal resolve sequence is 50, 100, 150, 177; the live
   partially staged journal needs fewer resolve batches. Application then handles
   at most 50 unique proposals per call. Stop when `done:true`, and inspect
   `requiresReview` even if done is true. Unchanged already-migrated accounts are
   not reapplied. An interrupted account write is recognized on resume before any
   repeated account write.
6. If duplicate proposals disagree on an ID or other account failures are reported,
   review them against the academic identity and authoritative account. Preserve
   established IDs. After resolving the underlying issue, use a deliberate
   `applyGitHubIdentityMigration({limit:50,retryFailed:true})` call to restage the
   failed current records, then resume normal calls. An ID lookup that disagrees
   with an established ID remains a conflict; retry does not permit replacement.
7. Continue exact-commit backfill and `verifyGitHubIdentityMigration()` as in the
   normal sequence. Deploy Release 2 only after verification is ready and weekly
   evidence has been checked. Physical duplicate history can remain in the journal;
   it is not a reason to delete rows or restart migration.

An editor diagnostic wrapper:

```javascript
function inspectGithubIdentityStagingRecovery() {
  console.log(JSON.stringify(inspectGitHubIdentityMigrationStaging()));
}
```

## Release 2 attribution and retained behavior

Only a valid, exact student GitHub ID / commit author ID match counts. Blank IDs
never match. A system label cannot include or exclude a commit independently of
this equality. Nonmatching system/staff/other account IDs contribute nothing to
that student's count.

No student progress, evidence, count, or provisioning identity path falls back to
username, display name, Git author name, or email. Missing/conflicting student
identity, unresolved history in the requested week, or failed required resolution
produces unavailable evidence/count `null`, not zero. Confirmed unlinked authors
are preserved and excluded; successfully available attribution with no matches is
zero. Existing team aggregate semantics and weekly-log policy are unchanged.

Initial profile lookup and migration may resolve a username. Student collaborator
operations resolve a stored ID to its current login first. Guide/coordinator
username operations remain unchanged. Institutional email/register number still
provide academic identity and authorization.

## Recovery and architectural limits

- Roll back application code to **Release 1**, not the pre-migration collector:
  the old collector rejects added columns. Retain all captured IDs and the journal.
- A transient API failure cannot clear an ID or authorize replacement. Retry after
  restoring access. Registration survives repository/provisioning failures.
- GitHub HTTP 404 may conceal permissions. Missing/inaccessible reports retain
  that ambiguity; administrator inspection may be necessary.
- Current API linkage of an exact historical commit is the source for backfill.
  Neither a historic username nor a commit email proves ownership.
- Confirmation confirms a student's claim, not account ownership; no OAuth or
  external challenge is introduced.
- Existing global SHA deduplication and first-line commit message storage remain
  intentional scope boundaries. This migration does not redesign them.
- Sheet editors remain trusted administrators. Direct edits can invalidate
  mapping/journal snapshots; re-audit after corrections. Do not clear protected
  IDs merely to make verification pass.

## Validation and implementation inventory

Run `npm test`, `git diff --check`, and build both releases. Tests include existing
workflows, transition behavior, ID-only registration/provisioning/evidence,
confirmation UI, duplicate/protected IDs, renames, null authors, bounded migration,
concurrent conflicts, and resumable backfill. Automated DOM tests are not a live
Apps Script deployment or visual browser check.

Production changes: `github-identity.js`, `github-identity-migration.js`,
`student-github.js`, `team-github-setup.js`, `logbook-tracker.js`,
`weekly-activity.js`, `student-dashboard.js`, `dashboard-client-scripts.js`.
Packaging: `scripts/build-github-identity-release.cjs`, transition templates,
`.gitignore`, and the npm test list. Existing test fixtures/assertions are updated;
dedicated identity and browser tests cover the new behavior. No staff, assessment,
review, publication, or weekly-log policy implementation is changed.
