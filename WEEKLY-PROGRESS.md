# Phase 1 weekly progress

Weekly entry is an HTML form in the existing Apps Script Student Dashboard.
`google.script.run` calls `loadStudentWeeklyProgress()` and
`submitWeeklyProgress(input)`. There is no weekly Google Form, Form response
handler, separate app, or fallback to RawLog.

## Configuration and cutover

Add these keys to the existing Config key/value sheet before deployment:

| Key | Value |
| --- | --- |
| `WEEKLY_SUBMISSION_WINDOWS` | JSON array of explicit windows, as below |
| `SUBMISSION_REMINDER_HOURS` | Positive numeric lead time, for example `24` |

Example only — configure actual course windows explicitly:

```json
[
  {
    "week_id": "2026-W01",
    "opens_at": "2026-10-05T00:00:00+05:30",
    "deadline_at": "2026-10-11T18:00:00+05:30",
    "closes_at": "2026-10-11T23:59:59+05:30",
    "late_until": "2026-10-18T23:59:59+05:30"
  },
  {
    "week_id": "2026-W02",
    "opens_at": "2026-10-12T00:00:00+05:30",
    "deadline_at": "2026-10-18T18:00:00+05:30",
    "closes_at": "2026-10-18T23:59:59+05:30",
    "late_until": "2026-10-25T23:59:59+05:30"
  }
]
```

Week IDs are unique and immutable once referenced. Timestamps require explicit
offsets. Normal windows must not overlap; late-recovery windows may overlap.
`opens_at < deadline_at <= closes_at <= late_until`.

- `opens_at` opens submission.
- At or before `deadline_at`, the first actual submission is ON_TIME; afterward,
  it is LATE.
- At `closes_at`, normal submission is still accepted. After that instant, only
  the explicit overdue-week action is allowed, and MISSED processing may run.
- Overdue submissions and revisions are accepted through `late_until`, then blocked.
- The normal Week ID comes from server time. The overdue action's candidate is
  validated against the student's eligibility and Config; it is not trusted.

Deploy the changed files together. From the Apps Script editor, as the configured
Coordinator/PD:

1. Run `setupWeeklySubmissionStorage()`. It creates/initializes only empty
   LOG_ENTRIES storage and adds the eligibility column to TeamStatus. Existing
   incompatible storage fails instead of being overwritten.
2. Run `processWeeklySubmissionSchedule()` to establish eligibility for currently
   approved/ready teams. Use windows beginning at the intended Phase 1 cutover;
   do not invent prior eligibility from archived Form timestamps.
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

New sheet: **LOG_ENTRIES**, with these headers:

```text
Entry ID | Request ID | Reg No | Team ID | Week ID | Actor | Recorded At |
Submitted At | First Submitted At | Timeliness | Entry Status | Work Completed |
Guide Discussion/Decision | Problems/Blockers | Next Week Plan
```

New TeamStatus header: **Progress Eligible From Week ID**.

Roster membership is checked against TeamRoster and TeamStatus; mismatches or
ambiguous identities fail closed. Repository URLs remain solely in TeamStatus.
No names, guide assignments, repository registry or readiness statuses are copied
into LOG_ENTRIES. Eligibility recording uses the first still-open normal window,
or the next future window, when both title approval and GitHub readiness are
confirmed. Earlier windows contribute no Expected Weeks, reminders or MISSED rows.
Existing title-approval/provisioning completion hooks and the hourly handler
capture eligibility; the dashboard also confirms it. Once persisted, temporary
GitHub/API failure never moves or removes that boundary. Live prerequisite failures
may still block a new submission without erasing obligations or history.

LOG_ENTRIES is append-only. Do not manually edit, reorder or sort source rows; use
separate sheet views when inspecting history. Effective entry is the last physical
row for Reg No + Week ID. First actual entry is SUBMITTED; subsequent versions
are REVISED. First Submitted At and ON_TIME/LATE never change across revisions.
A system MISSED row has blank submission timestamps and timeliness MISSED; a
later actual entry becomes SUBMITTED/LATE and preserves the system row.

All four narrative fields are required on every actual submission. GitHub commits
are system-observed supporting evidence: code, documents, CAD/design files,
simulation/experimental results, datasets, hardware/testing photographs and other
relevant project artifacts can be committed to the team repository.

LOG_ENTRIES and Commits remain independent authorities. The private
`readWeeklyProgressEvidence_(student, weekId)` reader returns the effective log
and attributable commit details for an authorized, roster-derived student.
Dashboard multi-week reads reuse one request-local Team ID-scoped commit read.
Attribution requires Reg No/email, a unique verified username, Team ID, the team
repository and the configured normal window: `opens_at <= Date <= closes_at`.
`late_until` never extends the work week. Unknown authors remain in raw history
but are excluded from evidence. Links use a validated HTTPS repository URL and
full SHA. Commits has no Week ID; there is no combined sheet or evidence cache.

Collection health is recorded per team in Script Properties (ok/error only).
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
