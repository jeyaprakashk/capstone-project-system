# capstone-project-system

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

Title submission and new weekly logs remain locked until this shared readiness
check succeeds. Both form handlers enforce the prerequisite, so bookmarked
forms cannot bypass the lock. Rejected responses stay in their original form
tabs, but are not applied to TeamStatus or appended to RawLog; the submitter is
notified to complete setup and submit again. Previous titles, approvals, logs,
and marks are preserved. The dashboard retains repository links and existing
title/log information while locked. Retry GitHub setup runs repair without
resubmitting usernames. Batch provisioning and student collaborator repair use
the same team-level logic and no longer skip teams merely because a URL exists.

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
  GitHub by matching the current team's semester and team ID. Existing URLs are
  preserved; no legacy-sheet fallback or migration function remains.
- Provisioning retries recover an existing GitHub repository if a previous
  sheet write failed. Repository creation dates are not stored; valid member
  submission timestamps remain in `GithubUsernameRaw`.
- Remove the installed `onGithubUsernameSubmit` form-submit trigger and stop
  accepting responses through the old GitHub username form. Its handler is removed.
- Remove the unused `GITHUB_USERNAME_FORM_URL_BASE` and
  `GITHUB_USERNAME_TEAMID_ENTRY` rows from Config. Retain `GithubUsernameRaw`;
  provisioning and activity reporting still use it.

Run `npm test` for dashboard, registration, authorization, and workflow checks.
