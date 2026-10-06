# capstone-project-system

## UI conventions

Follow [Loading and refresh behavior](LOADING-UI.md) for all asynchronous UI reads.
Use the shared skeleton renderer and `DashboardUI.beginContentLoading` helper.

## Sheet read boundaries

Use `readSheetRows_(sheet, firstRow, rowCount)` for selected rows. It reads
column A through `getLastColumn()`, including all headers and any additional
populated columns, while preserving absolute column indexes. Omit `rowCount`
to read through the last populated row. Empty ranges return `[]`. Complete-sheet
reads may use `getDataRange().getValues()` or `getSheetRows_()`.

Do not derive read width from one field's position or a fixed schema length.
Header-mapped consumers access fields through the column map. Searches may target
one column to locate rows; `readMatchedRows_()` returns complete matched records
in search-result order using one batched value read. Writes remain limited to the
intended cells. Readers do not persist data or width caches between calls.

Fixed-layout form, log, configuration, and marking consumers still use explicit
column positions. Full-width reads prevent truncation; they do not make those
layouts reorderable. Layout changes require updating readers and writers together.

Deploy `sheet-reads.js` alongside all callers. `npm test` includes empty-sheet,
reordered-header, trailing-column and matched-row checks, plus a source audit
that rejects value reads outside the helper or a complete data-range read.

## Student GitHub accounts

Students use **Connect your GitHub Account**, paste a profile URL, preview the
resolved personal account and confirm before saving. The authenticated roster
membership supplies the institutional email and team. Numeric GitHub ID is the
only GitHub identity anchor; username, display name and profile URL are metadata.
Existing IDs cannot be replaced by ordinary student submission. Account connection
is saved independently of repository provisioning.

The `GitHubAccounts` sheet preserves these columns in order:
`Timestamp | Email address | Team ID | GitHub Username | GitHub ID | GitHub Display Name | GitHub Profile URL`.
IDs are positive decimal strings in plain-text cells. Existing header spelling is
accepted case-insensitively after trimming outer whitespace; no data is rewritten.

Current accounts resolve through `/user/{id}`; collaborator operations use the
returned current login and verify returned account IDs. Failed ID resolution never
falls back to saved usernames. Staff access configuration remains unchanged.

The GitHub Setup card shows actual team students as compact register-number/status
rows with shared status icons, followed by the team repository URL. Only a logged-in
student without a GitHub ID sees the connection form. Pending invitations and joined
access are communicated by the status rows without separate action sections.

Coordinators can use **System Status → Student GitHub invitations → Resend expired
student invitations** to renew expired or missing invitations in existing team
repositories. The action processes five teams per request and shows a result for
each student. Joined students and valid pending invitations are skipped; an
incomplete teammate registration does not block other students. After a stopped
run, retry rechecks live access before sending. GitHub sends the invitation;
students must still accept it. No repositories or additional emails are created.

`Commits` retains its seven-column schema, including `GitHub Author ID`. The collector
stores linked author IDs and deduplicates by SHA. A blank author ID means GitHub
provided no linked author; it contributes to no student's count. Invalid nonblank
IDs, missing student IDs, failed collection or unavailable evidence produce null,
not zero. Malformed author IDs from GitHub reject the collection batch before any
rows are written. Commit rows and IDs are written together. No auxiliary journal
is required. Only matching positive student and author IDs count, regardless of
username changes, commit author names, emails or system display labels.

Title submission and approval are independent of GitHub registration, repository
write access and invitation acceptance. Students submit titles for guide approval,
then reviewer approval. Repository ownership comes from TeamStatus; timestamps
remain in the account sheet.
See [Weekly progress](WEEKLY-PROGRESS.md) for its normal configuration and policies.

### Normal deployment

The root Apps Script sources are the single baseline; no generated release variants
are needed. Run `npm test` and `git diff --check` before deployment. Configure the
existing clasp project locally, review its target and source files, and explicitly
run the normal `npm run push` workflow when ready. Updating the web-app deployment
is a separate administrator action. Do not upload `tests`, `scripts`, `tmp`, or
development dependencies. Keep `GITHUB_ADMIN_TOKEN` in Script Properties and
`ACADEMIC_YEAR` in Config. No GitHub account setup utility runs on dashboard requests.

### Existing trial spreadsheet: administrator action before deploying

Back up the spreadsheet and retain its current deployment. Rename the existing
account-registration tab in place to `GitHubAccounts`, preserving every cell,
timestamp, header, formula and format; do not create an empty replacement.
Coordinate the rename with the code update because the current deployment expects
the previous tab name. Keep `Commits` and `GitHub Author ID` unchanged. The completed
transition journal can be archived outside the active workbook after backup and
confirmation that its historical classification completed. It is not read by this
code. Remove obsolete transition utility files from the Apps Script project when
deploying the root baseline. No live action is performed by these instructions.

## Review assessment setup

Start in Coordinator System Status. If `AssessmentDefinitions` is missing, use
**Create assessment definitions tab**. This creates only its validated headers.
Follow the definitions link to configure academic instances explicitly, then Recheck.

Configure REVIEW instances in `AssessmentDefinitions`, with matching `Assessment ID` values in
`Rubrics`. The Coordinator uses System Status to check readiness and create or
initialize missing assessment storage. Each instance uses its explicit Journal
binding or `Assessment_<assessmentId>` in the main spreadsheet.

Reviewers enter marks only in the shared ReviewEvaluations drawer. Drafts and
submissions append revisions to the nine-column assessment journal; journal cells
are not the marking interface. Committee data describes assignments only.

See [Review evaluation](REVIEW-EVALUATION.md) for configuration, readiness, storage
and workflow details. Guide Evaluation must also have an explicit
`GUIDE_EVALUATION` definition (`guide_eval`) and uses its configured Journal or
`Assessment_guide_eval`. `Milestones` contains only non-assessment lifecycle events.
End Review uses Type `SEE` and Assessment ID `see`. Its rubric and dates are
displayed, while evaluation remains outside this app. Leave its policy version
and Journal blank.
See [Assessment configuration](ASSESSMENT-CONFIGURATION.md) for the full setup contract.


## Existing GitHub commit collection

Collection health is stored in `CommitCollectionStatus`, with one row per team:
`Team ID | Status | Updated At`. `Status` is `ok` or `error`; the timestamp records
the latest collection attempt. Missing or ambiguous status keeps student evidence
unavailable rather than reporting zero commits. Dashboard reads use only this tab.

Collection creates the status tab when needed and updates the same team row on each run.

`fetchAllCommits()` uses `makeGithubRequest_()` and its authoritative
`GITHUB_ADMIN_TOKEN` Script Property, just like provisioning/readiness. The old
`GITHUB_TOKEN` property is no longer read and may be removed after deployment.
Repository URLs, collaborators, permissions and provisioning are not changed.

The `Commits` layout is exactly six columns: `Date | Team ID | Commit Message | GitHub Username | Repository URL | Commit SHA`.
Commit SHA is index 5 (column F); date, team and username retain indexes 0, 1
and 3. The reader and collector never modify headers or migrate historical rows.
Repository URLs for new rows come from the authoritative TeamStatus record.

The hourly collection follows all pages in a rolling two-hour lookback, with no
last-run cursor. A single `COMMITS_COLLECTION_LEASE` Script Property stores only
the active run's acquisition timestamp. Acquisition uses `tryLock(0)` on the
script lock; a busy lock or unexpired lease skips the run immediately. The lease
expires after 15 minutes (longer than the [Apps Script execution limit](https://developers.google.com/apps-script/guides/services/quotas))
and is cleared by its owner in `finally`. No user lock is used. A script lock
protects fresh history reads and append-only writes; the stable identity is the
full GitHub SHA (case insensitive, across the entire sheet). Each run reports
fetched, newly appended and skipped counts, with explicit errors rather than
treating failed API calls as zero commits. No trigger changes are required.

Run `auditCommitHistory()` for a read-only report of row count, unique SHA count,
team count, duplicate SHA row numbers and unidentified rows. It never deletes
rows or guesses missing SHAs. Collection rejects misaligned headers without
rewriting or migrating history.

Diagnostics separate HTTP 401 authentication rejection, 403 access restrictions,
rate limiting, and an empty repository. On a commits 404, a repository metadata
probe can confirm the repository exists; otherwise a credential probe helps
identify rejected credentials. If metadata also returns 404, the result remains
`REPOSITORY_MISSING_OR_INACCESSIBLE`: GitHub intentionally hides private resources
from callers without access, so a 404 alone cannot prove deletion. Diagnostics do
not log token values or change access settings.
