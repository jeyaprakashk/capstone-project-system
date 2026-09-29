# capstone-project-system

## UI conventions

Follow [Loading and refresh behavior](LOADING-UI.md) for all asynchronous UI reads.
Use the shared skeleton renderer and `DashboardUI.beginContentLoading` helper.

## Sheet read boundaries

Use `readSheetRows_(sheet, firstRow, rowCount)` for selected rows. It reads
column A through `getLastColumn()`, including all headers and any additional
populated columns, while preserving absolute column indexes. Omit `rowCount`
to read through the last populated row. Empty ranges return `[]`. Complete-sheet
reads may use `getDataRange().getValues()` or `getSheetRows()`.

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

## Student GitHub registration

Students enter their GitHub username on the dashboard. The server checks that
GitHub returns a personal user account before saving it to `GithubUsernameRaw`
(timestamp, institutional email, team ID, GitHub username). The email and team
come from the signed-in student's TeamStatus membership, not browser input.
Once a valid username is saved, resubmission is rejected and its original
timestamp is preserved. An invalid saved username can be corrected; a new
member gets a new row. A temporary GitHub verification failure never permits
overwriting an existing submission.

Missing or invalid usernames keep the textbox visible. Valid submissions show
which teammates still need valid usernames, or that the repository is awaiting
creation. Existing repository links remain visible even when a member needs to
correct their username. Validation confirms account existence, not ownership.

After saving, the dashboard checks every current member in TeamStatus, even if
the repository already exists. Only when every username is valid will setup
create or reuse the repository and ensure student write access. Active access
or a pending invitation with sufficient permission counts as ready; read-only
invitations are upgraded without replacing them. Existing contents and stronger
permissions are preserved. API failures keep setup pending and do not undo saves.

Title submission retains its existing Google Form and server-side GitHub readiness
checks. Rejected intake responses remain in the original form tab and do not
change TeamStatus. Weekly progress uses the embedded Student Dashboard HTML form
and authenticated `google.script.run` endpoints; it never uses Google Forms.
Weekly submission requires both an approved title and ready GitHub repository.
Existing titles, approvals, logs, marks and repository links are preserved.
Retry GitHub setup repairs access without resubmitting usernames. Batch provisioning
and student collaborator repair use the same team-level readiness checks.

See [Phase 1 weekly progress setup](WEEKLY-PROGRESS.md) for Config, schema,
eligibility, cutover, triggers and the single permitted student-reminder email.

Submission timing uses the latest valid timestamp among current members and the
configured formation deadline in the spreadsheet timezone. Missing usernames
remain incomplete; missing timestamps or GitHub verification failures produce
unknown timing. Repository/access failures do not make on-time submissions late.
Coordinator indicators distinguish repository availability from setup completion.

### Deployment

- Deploy the updated Apps Script project, including `student-github.js` and
  `team-github-setup.js`, with the form handlers and dashboard in the same release.
- Keep `GITHUB_ADMIN_TOKEN` configured in Script Properties for GitHub API calls.
- Use `TeamStatus`'s `Repo URL` column for student repository display.
- All repository workflows now use `TeamStatus` as their only registry. Before
  retiring the old repository tab, ensure existing URLs are present in
  `TeamStatus`. `backfillExistingRepos()` can recover missing URLs directly from
  GitHub by matching the configured academic year, semester, and team ID.
  Existing URLs are preserved.
- Set Config `ACADEMIC_YEAR` to `2026-27` (format `YYYY-YY`). New repositories
  use `capstone-2026-27-odd-team-G2`, with the semester and team ID from TeamStatus.
- Provisioning retries recover an existing GitHub repository if a previous
  sheet write failed. Repository creation dates are not stored; valid member
  submission timestamps remain in `GithubUsernameRaw`.
- Remove the installed `onGithubUsernameSubmit` form-submit trigger and stop
  accepting responses through the old GitHub username form. Its handler is removed.
- Remove the unused `GITHUB_USERNAME_FORM_URL_BASE` and
  `GITHUB_USERNAME_TEAMID_ENTRY` rows from Config. Retain `GithubUsernameRaw`;
  provisioning and activity reporting still use it.

Run `npm test` for dashboard, registration, authorization, and workflow checks.

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

`fetchAllCommits()` uses `makeGithubRequest()` and its authoritative
`GITHUB_ADMIN_TOKEN` Script Property, just like provisioning/readiness. The old
`GITHUB_TOKEN` property is no longer read and may be removed after deployment.
Repository URLs, collaborators, permissions and provisioning are not changed.

The `Commits` layout is exactly six columns: `Date | Team ID | Commit Message | GitHub Username | Repository URL | Commit SHA`.
Commit SHA is index 5 (column F); date, team and username retain indexes 0, 1
and 3. The reader and collector never modify headers or migrate historical rows.
Repository URLs for new rows come from the authoritative TeamStatus record.

Collection follows all pages in the existing four-week lookback. A script lock
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
