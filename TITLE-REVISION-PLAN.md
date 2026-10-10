# Title Revision Plan

Title submission, approval and coordinator reopening in the dashboard, with configurable submission requirements.

Status: **plan (revision 3), not implemented.** It replaces the earlier gate-layer plan (log columns in `TeamIntakeRaw`,
amendment snapshots, dual writes). Nothing described here exists in the code yet.

## 1. Goal and scope

Move title submission from the Google Form into the dashboard, hold all title state in one append-only log, let the
coordinator reopen an approved title, and give every later step of the system one yes/no answer: **does this team
have an approved title?**

Title submission opens for a team only when its configured requirements are met. At release these are a completed
GitHub setup and two documents in the team's Drive folder.

**In scope:** student submission, guide and reviewer decisions, coordinator reopen and cancel, `titleGate_`, the
precondition engine (`ActivityDependencies`, the loader, the `github` and `drive` checks, the decision function), a
validator for the hand-entered baseline, and the release.

**Out of scope:** everything in [section 14](#14-future-features). In particular: how documents reach the team folder,
the end-of-semester registry export, gating any activity other than title submission, and any code that reads,
converts or imports the old title data.

## 2. Decisions

1. **`titleGate_(teamId, index?)` returns `{approved, title, approvedAt}`.** `approved` becomes `true` at the first
   final approval and stays `true`, including while the title is reopened. `title` is the effective approved title.
   `approvedAt` is the date of the first approval and never moves, so reopening can never shift eligibility.
2. **`TitleLog` is the only title store.** After release no code reads or writes the TeamStatus title, decision,
   similarity or document-link columns, or `TeamIntakeRaw`. Those columns stay in the sheet and in
   `FIELD_DEFINITIONS`, unchanged, because they are frozen. TeamStatus still supplies roster, guide, committee and
   repository.
3. **No legacy code.** No read-source switch, no import script, no old and new endpoints side by side. Every title
   reader and writer changes in one release.
4. **The baseline is entered by hand.** The coordinator copies each team's current state into `TitleLog` as one row
   in the format of [section 11](#11-baseline-and-release). A read-only validator checks it before release.
5. **No maintenance mode.** Deploying the new version is the switch. A recheck afterwards catches any decision made
   on the old version in between.
6. **One Return action, with required notes,** replaces Rejected and Revise for both guide and reviewer. The guide may
   edit the title only when approving. Any one assigned reviewer's approval is final, as today.
7. **Reopening keeps the approved title in effect** until a new reviewer approval replaces it or the coordinator
   cancels.
8. **Similarity uses the existing `similarity_` and thresholds,** with one normalization for student and guide titles.
9. **Submission requirements are data, not code.** The kinds of check (`github`, `drive`) are code. Which checks apply
   to which activity is rows in `ActivityDependencies`. At release: `github`/`READY` and the two documents.
10. **This plan lands before [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md),** which is rebased afterwards
    (section 14, F8).

## 3. Frozen and deliberate changes

- **Frozen and untouched:** existing sheets, columns and `FIELD_DEFINITIONS`; review rubrics, attendance, the
  eligibility calculation and weights; role detection.
- **Deliberate changes, reviewed, in their own commit, never inside a UI migration:** the two new sheets (`TitleLog`,
  `ActivityDependencies`), the Return action, unified normalization, the reopen rule, the length limits, guide edits
  only on approval, and the submission requirements.
- `npm run test:invariants` stays green. A snapshot changes only for the new sheet names, and only with explicit
  approval.

## 4. Title storage: `TitleLog`

Script-owned and append-only. Protected so only the coordinator can edit it (needed for the baseline).

| Column | Content |
|---|---|
| Timestamp, Team ID, Revision | Revision runs 1, 2, 3 … per team |
| Action | `BASELINE`, `SUBMIT`, `GUIDE_APPROVE`, `RETURN`, `REVIEWER_APPROVE`, `REOPEN`, `CANCEL_REOPEN` |
| Actor, Request ID, Fingerprint | The fingerprint is a hash of the action and its normalized input; blank on `BASELINE` |
| Status | `SUBMITTED`, `GUIDE_APPROVED`, `RETURNED`, `APPROVED`, `REOPENED` |
| Proposed Title, Proposed Problem | The current proposal |
| Notes, Similarity Note | Return notes or a reason; the closest similarity match |
| Reopened | `Yes` while a reopening is open |
| Approved Title, Approved Problem, Approved At, Approved By | The effective approval, copied forward on every row |

- Each row is the team's complete state after one action, so the latest row is the current state. No row means "not
  submitted".
- Rows are never edited after release. Text starting with `=`, `+`, `@` or `-` is escaped.
- **Validation per team:** revisions run 1…n with no gaps; revision 1 is `BASELINE` or `SUBMIT`; only revision 1 may
  be `BASELINE`; the status is known; the approved fields are consistent (all set when the team has ever been
  approved, all blank otherwise). A failure gives that team a `STORAGE` error; other teams keep working, and
  coordinator health lists it.
- Missing or duplicated headers give a `STORAGE` error for everything. Headers are never created silently.
- The log is read once per request into an index by team that every caller reuses.

**Setup:** `setupTitleStorage()` is editor-run, starts with `requireTriggerOrOperator_()`, creates `TitleLog` and
`ActivityDependencies` with headers if they are absent, and is safe to rerun.

## 5. Title workflow

| Action | Who | From | Result | Rules |
|---|---|---|---|---|
| Submit | A member of the team, derived from the session | none, `RETURNED`, `REOPENED` | `SUBMITTED` | Title at most 200 characters, problem at most 5,000; similarity check; requirements met ([section 7](#7-precondition-engine)) |
| Guide approve | The team's recorded guide | `SUBMITTED` | `GUIDE_APPROVED` | Optional title edit, which reruns the similarity check |
| Return | The guide (from `SUBMITTED`) or an assigned reviewer (from `GUIDE_APPROVED`) | as stated | `RETURNED` | Notes required |
| Reviewer approve | Any assigned committee reviewer | `GUIDE_APPROVED` | `APPROVED`, reopening closed | Sets the approved title, problem and approver; sets `Approved At` only on the first approval |
| Reopen | Coordinator | `APPROVED` | `REOPENED` | Reason required, at most 500 characters. Approved fields unchanged |
| Cancel reopen | Coordinator | any status while a reopening is open | `APPROVED` | Reason required. Proposal reverts to the approved title and problem |

- A reopening is open from `REOPEN` until the next `REVIEWER_APPROVE` or `CANCEL_REOPEN`. Returns and resubmissions
  inside it do not close it.
- Submitting is blocked while the status is `SUBMITTED` or `GUIDE_APPROVED`.
- **Displayed title:** wherever a team's title is shown outside the title panel (reviews, results, team drawer, lists),
  it is the approved title when `approved` is `true`, otherwise the proposal. Title panels show both during a
  reopening.

**Similarity** (submissions and guide edits):

- Normalization: trim, strip surrounding quotes, uppercase.
- Master registry: a match of 75% or more blocks the save, naming the matching title and its context. The team's own
  registry rows are excluded by academic year, semester and team ID.
- This semester: other teams' approved titles and current proposals. The best match is stored as the Similarity
  Note and never blocks.
- If the registry cannot be read, the save is refused.

## 6. Writes

Every write carries `requestId` and `expectedRevision`.

1. **Submit only: requirements first, outside the lock.** They need GitHub and Drive calls, which must not hold the
   shared script lock. A failure returns `REQUIREMENTS` with every unmet item.
2. Take the script lock with `waitLock(10000)`. The lock is shared with GitHub and logbook jobs; a timeout returns
   `BUSY` ("Busy, try again").
3. Recheck authorization from the session, roster and committee.
4. If the `requestId` is already logged: the same fingerprint returns the stored result; a different one returns
   `CONFLICT`.
5. Refuse with `STALE` when `expectedRevision` is not the current revision.
6. `titleCanDo_` (role and state), input validation and similarity, then append one row and `SpreadsheetApp.flush()`.
7. If the append throws, reread by `requestId`. If the row is there, the write succeeded. If not, return an error;
   the user resubmits and the bridge reuses the same `requestId` for the same content.
8. Release the lock, then send mail. A mail failure is logged and returned as `warning`; the save stands. A
   duplicate request sends no mail.

The bridge never times out or retries a write.

## 7. Precondition engine

### `ActivityDependencies`

Coordinator-edited and protected. One row per required item; an activity has several items by having several rows.

| Activity | Kind | Item | Label | Active |
|---|---|---|---|---|
| `title.submit` | `github` | `READY` | GitHub setup complete | Yes |
| `title.submit` | `drive` | `Step1_Work_Breakdown.docx` | Work Breakdown document | Yes |
| `title.submit` | `drive` | `Step2_Need_Analysis.docx` | Need Analysis document | Yes |

- **Activity:** an ID the code knows. In this plan: `title.submit` (any submission before the first approval,
  including after a Return) and `title.resubmit` (a submission during a reopening; with no rows it is unrestricted).
- **Kind:** a check provided by code. **Item:** its meaning depends on the kind. **Label:** what the student sees.
  **Active = No:** turns the row off for everyone.

### Checks provided by code

| Kind | Item | Met when | Data used |
|---|---|---|---|
| `github` | `READY` | Every member's GitHub username is submitted and valid, the repository exists and is verified, every member has active or invited access, and template setup has finished | `getTeamGithubSetup_` with access inspection, `ready` |
| `github` | `REPOSITORY` | The repository URL is saved and the repository is verified on GitHub | `getTeamGithubSetup_`, `repositoryAvailable` |
| `drive` | a file name | Exactly one non-trashed file with that exact name is in the team folder | `findTeamFolder_`, then a name lookup in that folder |

- An unmet `github` item uses the existing `githubSetupMessage_` text as its reason, so students see the same
  guidance as on their GitHub card.
- `REPOSITORY` is valid in code but not used at release.
- Coordinator health warns when a `drive` item matches none of `TEAM_DOCUMENT_FILE_NAMES_`
  ([team-folders.js:11](team-folders.js#L11)), the names the upload feature will write.

### Loader and decision

```
loadActivityRules_(ctx)                         → { rules: {activityId: [{kind, item, label}]}, errors: [] }
check = { kind, needsApprovedTitle, perStudent, validItem(item), isMet(team, item, ctx) → {met, reason} }
activityPreconditions_(activityId, team, ctx)   → { allowed, requirements: [{label, met, reason}], reason }
titleCanDo_(state, action, user, ctx)           → { allowed, reason }
```

`ctx` is built once per request (`now`, the log index, roster, registry, the loaded rules, a GitHub and Drive result
cache for that request). An endpoint and its DTO flag both call `titleCanDo_` and, for submit,
`activityPreconditions_`, so they cannot disagree.

### Fixed rules

1. **Only student submit actions are gated.** Guide and reviewer decisions, returns and coordinator actions are never
   gated, so a team can never be stuck halfway through a review.
2. **Built-in rules run first; the sheet only adds requirements.** It can never relax role, state, eligibility or
   review rules.
3. **All-of only.** Every active row must be met. No any-of, no expressions, no per-team waivers.
4. **Checked only at the moment of submission, never retroactively.** A title already submitted or approved is not
   affected by later file, repository or sheet changes.
5. **No caching between requests.** A sheet change takes effect on the next request.
6. **Misconfiguration denies.** A missing sheet, a wrong header, or a row with an unknown activity, unknown kind or
   invalid item denies every gated activity: "Submission requirements are misconfigured. Contact the coordinator."
7. **No active rows allows.** An existing sheet with no active rows for an activity allows it.
8. **Unverifiable is unmet.** If GitHub, Drive or the team folder cannot be read, the item is unmet with "Could not
   verify: <label>."
9. **A missing team folder** makes every `drive` item unmet with "Team folder not created yet." Only the coordinator
   creates folders, from System Status.
10. **No cycles.** A check with `needsApprovedTitle` cannot be required by `title.*`; the loader refuses such rows.
11. **Per-student kinds** (later kinds only) are met when every obligated current member has done the item. If no
    member is obligated, the item is unmet.
12. **A denial lists every unmet item,** and the student DTO carries the full checklist.
13. **Cost.** Requirements are evaluated only for the student's own team when the built-in rules would allow a
    submission, once more at submission, and for one team on demand in the coordinator drawer. Guide, reviewer and
    coordinator lists never evaluate them on load.
14. **Administration.** Only the coordinator edits the sheet. Coordinator health shows the parsed rules, validation
    errors and `drive` names that match no upload name. The sheet layout is fixed once introduced.

## 8. Downstream readers

These all move to `titleGate_`, or to the title DTO for display, in the release:

| Area | Sites |
|---|---|
| Weekly submission | [logbook-tracker.js:424](logbook-tracker.js#L424), [logbook-tracker.js:454](logbook-tracker.js#L454) |
| Review marking | [review-evaluation.js:15](review-evaluation.js#L15), [reviewer-api.js:16](reviewer-api.js#L16) |
| Eligibility | [progress-eligibility.js:93-104](progress-eligibility.js#L93-L104), [progress-eligibility.js:221-261](progress-eligibility.js#L221-L261): `titleStatus` and `titleDate` come from the gate; the `ProgressEligibility` columns and calculation are unchanged |
| Guide | [guide-dashboard.js:22](guide-dashboard.js#L22), [guide-dashboard.js:38-75](guide-dashboard.js#L38-L75) (approval and document dates), [guide-api.js:73](guide-api.js#L73), [guide-api.js:155](guide-api.js#L155) |
| Reviewer | [reviewer-api.js:5-50](reviewer-api.js#L5-L50), [reviewer-dashboard.js:7-31](reviewer-dashboard.js#L7-L31) |
| Coordinator | [coordinator-dashboard.js](coordinator-dashboard.js) lines 57, 97, 165, 275, 307, 317; the team drawer |
| Student | [student-dashboard.js:42](student-dashboard.js#L42), [student-api.js:36](student-api.js#L36) (Form link) |
| Digests | `sendGuideReminderDigest` (status `SUBMITTED`), `sendReviewerApprovalDigest` (status `GUIDE_APPROVED`) |

Grep every use of `getTeamStatus_`, `REVIEWER_DECISION`, `GUIDE_DECISION`, `TS.TITLE`, `TS.PROBLEM`,
`SIMILARITY_FLAG`, `TITLE_APPROVED_BY`, the document-link fields and `TEAM_INTAKE_RAW` to confirm the list is complete.

**Removed in the same release:** `getTeamStatus_`; the registry date matching (`progressTitleDate_`,
`readGuideApprovals_`); the `TeamIntakeRaw` document-date reader; `onTeamIntakeSubmit`, `applyGuideDecision_`,
`applyReviewerDecision_`, `submitReviewerDecision_`, `submitGuideDecision_` and `API_guide_submitDecision`;
`buildTeamIntakeLink_` and the `TEAM_INTAKE_FORM_URL_BASE` and `TEAM_INTAKE_TEAMID_ENTRY` config keys; the Form links.

Guide and reviewer views show a link to the team's Drive folder in place of document links.

## 9. Endpoints and DTO

| Endpoint | Role | Input |
|---|---|---|
| `API_title_get(teamId?)` | Any; the server limits which teams are visible | — |
| `API_student_submitTitle(input)` | Student | `{requestId, expectedRevision, title, problem}`; the team comes from the session |
| `API_guide_decideTitle(input)` | Guide | `{requestId, expectedRevision, teamId, decision: 'approve' \| 'return', notes, editedTitle?}` |
| `API_reviewer_decideTitle(input)` | Reviewer | `{requestId, expectedRevision, teamId, decision: 'approve' \| 'return', notes}` |
| `API_coordinator_reopenTitle(input)` / `API_coordinator_cancelReopen(input)` | Coordinator | `{requestId, expectedRevision, teamId, reason}` |
| `API_coordinator_getRequirements(teamId?)` | Coordinator | Parsed rules and errors; with `teamId`, that team's checklist |
| `API_coordinator_validateTitleLog()` | Coordinator | Read-only report of the section 4 checks for every team |

**Title DTO:**

```
{ teamId, revision, status, reopened,
  proposal: {title, problem}, notes, similarityNote,
  approved: {value, title, at, by},
  reopen: {reason, by, at} | null,
  folderUrl,                                    // team Drive folder, '' when absent
  requirements: [{label, met, reason}],         // student's own team only; [] elsewhere
  history: [{revision, action, actor, at, notes}],   // coordinator only
  can: { submit: {allowed, reason}, approve, return, reopen, cancel } }
```

Write results are `{ok, revision, status, message, warning?}`. Errors use the existing envelope with the codes `BUSY`,
`STALE`, `CONFLICT`, `FORBIDDEN`, `INVALID`, `SIMILAR`, `REQUIREMENTS` and `STORAGE`. DATA-CONTRACTS.md, the endpoints,
their contract tests and the views change together.

**Notifications:**

| Event | Recipients |
|---|---|
| Submit | Guide |
| Guide edit | Students |
| Guide approve | Coordinator |
| Guide return | Students |
| Reviewer return | Guide and students |
| Reviewer approve | Guide and students |
| Reopen, cancel | Guide and students |
| Refused authorization attempt | Coordinator |

**Views.** Student (title form, requirements checklist, folder link), guide, reviewer and coordinator (drawer actions,
history and requirements; a requirements card in System Status). Each is built and tested in its own commit and all
ship in the one release. Bridge only, Tailwind utilities, `data-*` hooks and delegated listeners; views render only
`can.*` and `requirements`. New modules are registered under their role in `getMigratedViewsClientScript_` and in
`ROLE_MODULES` in `tests/page-assembly.test.cjs`; their tests go into the `test` and `test:migration` scripts.
Rebuild Tailwind after any class change.

**Entry points.** [tests/entry-point-guard.test.cjs](tests/entry-point-guard.test.cjs) gains `setupTitleStorage` and
the new `API_*` functions, and drops `onTeamIntakeSubmit`. Every other server function ends in `_`.

## 10. Phases

Each phase passes `npm test`, `npm run test:migration`, `npm run test:invariants` and `npm run check:tailwind`
before the next starts. All phases ship together in one release.

| Phase | Work |
|---|---|
| 0 | Fixtures and golden masters of today's downstream results (weekly, review, eligibility, coordinator health, digests) for every TeamStatus decision combination, plus `getTeamGithubSetup_` and `findTeamFolder_` stubs |
| 1 | `setupTitleStorage`, the title service, `titleGate_`, log validation. Deliberate schema commit |
| 2 | Precondition engine: loader, `github` and `drive` checks, decision function, `API_coordinator_getRequirements` |
| 3 | Title endpoints, `API_coordinator_validateTitleLog`, DATA-CONTRACTS.md, contract tests |
| 4 | Downstream readers moved to `titleGate_`; old code removed (section 8) |
| 5 | Views, one dashboard per commit: student, guide, reviewer, coordinator |
| 6 | Rehearse the baseline, the requirement rows and the release steps on a copy of the spreadsheet |

## 11. Baseline and release

**Baseline row**, one per team that has a title. Teams with no title get no row.

| Field | Value |
|---|---|
| Revision, Action | `1`, `BASELINE` |
| Timestamp, Actor | When entered; the coordinator's email |
| Request ID | `baseline:<TeamID>` |
| Status | `SUBMITTED`, `GUIDE_APPROVED`, `RETURNED` or `APPROVED` |
| Proposed Title, Proposed Problem | The current title and problem |
| Notes, Similarity Note | Carried over as the coordinator chooses |
| Approved fields | For `APPROVED`: title, problem, approver and **Approved At (required)**. Otherwise blank |

**Release:**

1. Merge with every suite green. Run `setupTitleStorage` and enter the `ActivityDependencies` rows.
2. Close the Form (`setAcceptingResponses(false)`) and delete its trigger.
3. Copy the baseline into `TitleLog`. Note the time.
4. Deploy the new version. This is the switch.
5. Run `API_coordinator_validateTitleLog` and check the requirements card. Fix errors by correcting baseline rows.
   Revision 1 is the only row the coordinator may edit, and only before that team has a later revision.
6. **Recheck:** compare the TeamStatus decision columns with the baseline. A guide or reviewer decision made on the
   old version after step 3 shows as a difference. Apply it through the new dashboard, or correct the team's
   baseline if it has no later rows.
7. Check the requirement checklists of teams at `RETURNED` or with no title. They now need GitHub setup complete and
   both documents in their Drive folder before they can submit. Tell the teams that are not ready.
8. Check each role, then announce.

**Rollback:** redeploy the previous version. TeamStatus is untouched, so it works as before, but anything saved in
`TitleLog` after release must be copied back by hand. That is why step 8 comes before announcing.

## 12. Acceptance tests

- **Transitions:** every row of section 5; refusals for the wrong role, wrong team or wrong state; submitting while
  under review.
- **Concurrency:** `STALE`; a repeated `requestId` gives one row and one mail; a reused `requestId` with different
  content gives `CONFLICT`; `BUSY`; an append that throws but whose row exists counts as success.
- **Gate:** `approved` and `approvedAt` unchanged through reopen, return, resubmit and cancel; a new approval replaces
  the title, not the date; weekly submission and review marking stay available during a reopening; the displayed
  title is the approved one during a reopening.
- **Downstream equivalence:** for each Phase 0 golden master, an equivalent `TitleLog` fixture gives identical
  weekly, review, eligibility, coordinator-health and digest results.
- **Baseline validation:** a valid `BASELINE` for each status is accepted; refused: `APPROVED` without
  `Approved At`, `BASELINE` at revision 2, gaps or duplicates, an unknown status, inconsistent approved fields; one bad
  team does not fail the others.
- **Similarity:** a registry match of 75% or more blocks both the student and the guide path; the team's own registry
  rows are excluded; this semester's matches only flag; one normalization on both paths; a registry read failure
  refuses the save.
- **Engine:** all rows met allows; each unmet row is listed with its label; `Active = No` is ignored; no rows allows;
  a missing sheet, bad header, unknown activity or kind, or invalid `github` item denies with the misconfiguration
  message; GitHub or Drive unavailable gives "Could not verify"; a missing folder gives "Team folder not created
  yet"; a duplicate or trashed file does not count; `READY` is unmet for a missing or invalid username, missing
  access, pending template setup or unavailable GitHub, each with the setup message; requirements are re-evaluated at
  submission (a file removed after page load gives `REQUIREMENTS`); `title.resubmit` with no rows is allowed; a
  `needsApprovedTitle` check under `title.*` is refused; non-submit actions never call the engine.
- **Storage:** missing headers fail everything; text that would start a formula is escaped.
- **DTO:** `can.*` and `requirements` match the endpoint's decision for each role and state.
- **Mail:** a failure gives a warning and keeps the save; recipients match the notification table.
- **Removal:** no code reads the TeamStatus title, decision, similarity or document-link columns or `TeamIntakeRaw`;
  no Form handler, Form link or Form config key remains; the entry-point guard matches.
- **Suite:** `npm test`, `npm run test:migration`, `npm run test:invariants`, `npm run check:tailwind`.

## 13. Operator rules and known limits

**Operator rules**

1. Run `setupTitleStorage` and enter the requirement rows before deploying.
2. Do not edit `TitleLog` after release, except a baseline row before that team has a later revision.
3. Keep `TeamIntakeRaw` and the TeamStatus title columns as they are; they are the record of the Form period.
4. Do not roll TeamStatus over to the next semester until the registry export (F2) has run.

**Known limits**

- The script lock is shared with long GitHub and logbook jobs. A title save during one of them can return `BUSY`. It
  fails safely.
- Until the registry export runs, this semester's approvals made after release are not in the master registry. Their
  similarity within the semester comes from `TitleLog`.
- Titles replaced by a reopening are not checked for similarity.
- Results published before a reopening show the new approved title once it is approved, because results show the
  effective title.
- `reviewer-api.js` reads a `CHAPTER1_LATEX_LINK` field that is not in `FIELD_DEFINITIONS`. It is removed with the
  other document links in this release.

## 14. Future features

None of these is built in this plan. Each is a separate plan. The rules fixed in section 7 apply to all of them, so
each one adds code behind an existing signature and does not change the title service.

### F1. Document upload to the team folder

**Purpose.** Let students put the required documents into their team's Drive folder from the dashboard, so the `drive`
checks can be met without Drive access or coordinator help.

**Shape.**
- A student endpoint, for example `API_student_uploadDocument({requestId, documentKey, file})`, that writes into the
  folder found by `findTeamFolder_` under the fixed name from `TEAM_DOCUMENT_FILE_NAMES_`. It never creates the folder;
  folder creation stays in System Status.
- One file per name. A new upload replaces the content of the existing file (Drive keeps its revisions), so there is
  never more than one file with the name and the `drive` check stays simple.
- The student dashboard shows each document's state from the same `drive` check, so "uploaded" and "requirement
  met" can never disagree.

**Decisions it needs.** Allowed file types and size; whether uploads are allowed after title approval; whether a guide
can also upload; whether a later upload is blocked once a review has started.

**Plugs in as** an ordinary student submit activity (`document.upload`), so it can itself be gated by
`ActivityDependencies` rows (for example `github`/`READY`).

### F2. End-of-semester registry export

**Purpose.** Add this semester's approved titles to the master registry so later semesters' similarity checks see
them.

**Shape.** A coordinator-run function starting with `requireTriggerOrOperator_()`, listed in the entry-point guard.

**Rules.**
- Exports, for each team with `approved = true`, the approved title in the existing registry column order: year,
  semester, team, guide, title, repository, members, approval date, approver.
- Skips teams the registry already has for this academic year and semester (approvals made before release), so a
  rerun never duplicates.
- Refuses while any reopening is open, and lists those teams.
- Writes a summary (exported, skipped, refused) to the run log and to coordinator health.

### F3. More requirement kinds

Each is one check in code (`kind`, `validItem`, `isMet`, `needsApprovedTitle`, `perStudent`) and rows in the sheet.

| Kind | Item | Met when | `needsApprovedTitle` | `perStudent` |
|---|---|---|---|---|
| `opens` | ISO date | `now` is on or after the date | No | No |
| `title` | `APPROVED` | `titleGate_().approved` | Yes | No |
| `weekly` | week ID, for example `W03` | every obligated member submitted that week | Yes | Yes |
| `review` | review key | marks for that review are complete for the team | Yes | No |
| `document` | document key | the uploaded document exists (via F1) | No | No |

`opens` covers "submission opens on a date". `title` lets later activities require an approved title explicitly
instead of in code.

### F4. Gating more student activities

**Purpose.** Use the same engine for other student submissions: `document.upload` (F1), `weekly.submit`, and later
assessment submissions.

**Rules.**
- Each activity gets an ID, and its endpoint and DTO flag call `activityPreconditions_` after their own built-in
  checks, exactly as title submission does.
- Built-in rules stay in code. For example, weekly submission keeps its approved-title and eligibility checks; the
  sheet can only add to them.
- Activities owned by guides, reviewers or the coordinator are never gated (rule 1).

### F5. Full cycle detection

Once more than two kinds exist, the loader builds a graph from each activity to the activities its required kinds
depend on, including built-in dependencies (weekly and review need an approved title), and refuses the whole rule set
on any cycle, with the cycle named in coordinator health. A depth-first search is enough at this size.

### F6. Batch readiness for coordinators

**Purpose.** Show every team's requirement status in System Status without slow live checks on page load.

**Shape.** A scheduled, coordinator-guarded job evaluates every team's requirements and stores a timestamped summary.
The dashboard shows that summary with its age. Submissions still evaluate live (rule 4); the summary is never used to
allow an action.

### F7. "Any of" requirements (only if needed)

A `Mode` column on `ActivityDependencies`, `ALL` (default) or `ANY`, with rows grouped by a `Group` value. Add it only
when a real rule needs alternatives; until then all-of stays the only mode.

### F8. Rebase of the student identity plan

After this release, [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md) changes as follows:
- drop the `'maintenance-reply'` exception, since `onTeamIntakeSubmit` no longer exists;
- migrate `TitleLog` (team IDs and actor emails) alongside its other sheets;
- move the title service's single membership lookup and its eligibility lookup to `Students` and `TeamRoster`;
- move the `github` check's member list to the same identity source;
- add the new title endpoints, the engine checks and the digests to its guarded and reader lists.

### F9. Shared lock cleanup

**Purpose.** Stop short user saves failing with `BUSY` while long background jobs hold the one script lock.

**Options to evaluate.** Shorter critical sections in the GitHub and logbook jobs; moving long network work outside
the lock as this plan does for requirements; one shared lock helper with consistent waits and messages.

### F10. Similarity against replaced titles

Optionally include titles replaced by a reopening (from `TitleLog`) in the same-semester similarity flag, so a team
cannot take a title another team gave up. Flag only, never block.

### F11. Per-team waivers (not planned)

Not planned. If a real need appears, it needs its own audited plan: coordinator only, a reason, an expiry, its own
log, and visibility in coordinator health. Until then, `Active = No` on a row is the only relaxation, and it applies
to every team.

### F12. Retiring the frozen TeamStatus columns

In a later semester, once nothing reads them, the TeamStatus title, decision, similarity and document-link columns
and `TeamIntakeRaw` can be removed from `FIELD_DEFINITIONS` and the sheets. This is a deliberate, reviewed schema
change with its own snapshot update, never part of a feature migration.
