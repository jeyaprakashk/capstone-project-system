# Title Revision Plan

Title submission, approval and coordinator reopening in the dashboard, with configurable submission requirements.

Status: **final plan (revision 9), not implemented.** Nothing described here exists in the code yet. Each spreadsheet
holds one semester, so Team ID alone identifies a team in the log.

Review history: revisions 3 to 8 were each reviewed independently (Codex) against the code, and every finding is
addressed here. The reviews covered the cutover write barrier, request-ID recovery for title writes and uploads,
upload replacement and concurrency, requirement deadlocks, history validation, the standard envelope error codes and
existing status names, input rules for title and problem, the effective title and problem pair, and legacy baselines
with a blank problem. Revision 9 is revision 8 marked final, with no design change.

**Position in the build order:** items 5, 6, 8, 9 and 10. Phase 1 needs `ensureSheet_` and catalog v1 (items 1 to 4); Phase 2 is the engine (item 7). The full order is in [BUILD-ORDER.md](BUILD-ORDER.md).

## 1. Goal and scope

Move title submission from the Google Form into the dashboard, hold all title state in one append-only log, let the
coordinator reopen an approved title, and give every later step of the system one yes/no answer: **does this team
have an approved title?**

Title submission opens for a team only when its configured requirements are met. At release these are a completed
GitHub setup and two documents in the team's Drive folder. Students put those documents there through a minimal
dashboard upload that ships with this plan.

**In scope:** student title submission, minimal document upload, guide and reviewer decisions, coordinator reopen and
cancel, `titleGate_`, the precondition engine (`ActivityDependencies`, the loader, the `github` and `drive` checks, the
decision function), a validator for the hand-entered baseline, a preparatory release (Release 0) that lets the old
title writers be stopped, and the cutover.

**Out of scope:** everything in [section 14](#14-future-features), in particular the end-of-semester registry export,
gating activities other than title submission and document upload, and any code that reads, converts or imports the
old title data.

## 2. Decisions

1. **`titleGate_(teamId, index?)` returns `{approved, title, problem, approvedAt}`.** `approved` becomes `true` at the
   first final approval and stays `true`, including while the title is reopened. `title` and `problem` are the
   effective pair: the approved title and problem once approved, otherwise the current proposal (section 5).
   `approvedAt` is the date of the first approval and never moves, so reopening can never shift eligibility.
2. **`TitleLog` is the only title store.** After cutover no code reads or writes the TeamStatus title, decision,
   similarity or document-link columns, or `TeamIntakeRaw`. Those columns stay in the sheet and in
   `FIELD_DEFINITIONS`, unchanged, because they are frozen. TeamStatus still supplies roster, guide, committee and
   repository.
3. **No legacy code in the release.** No read-source switch, no import script, no old and new endpoints side by side
   in production. The one exception is Release 0 (decision 5), a small change to the old writers that is deleted by
   the release itself.
4. **The baseline is entered by hand.** The coordinator copies every team's current state into `TitleLog` as one
   `BASELINE` row, including teams that have not submitted. A read-only validator checks completeness and consistency.
5. **No maintenance mode.** Only title writes are stopped, and only for the minutes of the cutover, by one script
   property, `TITLE_CUTOVER` ([section 11](#11-cutover)). Every other part of the system keeps working.
6. **Standard codes and names.** Errors use the existing envelope codes. Title statuses keep the existing names where
   the meaning is the same (`NOT_SUBMITTED`, `NEEDS_REVIEW`, `AWAITING_REVIEWER`, `APPROVED`) and add only
   `RETURNED` and `REOPENED`.
7. **One Return action, with required notes,** replaces Rejected and Revise for both guide and reviewer, so
   `RETURNED` replaces `REJECTED_BY_GUIDE` and `REVISE_AWAITING_STUDENT`. The guide may edit the title only when
   approving. Any one assigned reviewer's approval is final, as today.
8. **Reopening keeps the approved title in effect** until a new reviewer approval replaces it or the coordinator
   cancels.
9. **Similarity uses the existing `similarity_` and thresholds,** with one normalization for student and guide titles.
10. **Submission requirements are data, not code.** The kinds of check (`github`, `drive`) are code. Which checks
    apply to which activity is rows in `ActivityDependencies`. At release: `github`/`READY` and the two documents.
11. **This plan lands before [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md),** which is rebased afterwards
    (section 14, F8).

## 3. Frozen and deliberate changes

- **Frozen and untouched:** existing sheets, columns and `FIELD_DEFINITIONS`; review rubrics, attendance, the
  eligibility calculation and weights; role detection.
- **Deliberate changes, reviewed, in their own commit, never inside a UI migration:** the two new sheets (`TitleLog`,
  `ActivityDependencies`), the Return action and `RETURNED`/`REOPENED` statuses, unified normalization, the reopen
  rule, the length limits, guide edits only on approval, the submission requirements and document upload.
- `npm run test:invariants` stays green. The new sheet names (`TitleLog`, `ActivityDependencies`) and their headers are kept
  in the sheet catalog (`sheet-columns.js`, [SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md)) and are **not**
  added to `SHEET_NAMES` or `FIELD_DEFINITIONS`, so no snapshot changes for them; each is pinned by the catalog test and its
  own test. The only snapshot change in this work is the removal of `TEAM_INTAKE_RAW` from `SHEET_NAMES`,
  a deliberate, reviewed commit with explicit approval (step 9 of
  [FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md)).
- The deliberate differences are listed in [section 12](#12-acceptance-tests) and tested separately from the
  equivalence checks.

## 4. Title storage: `TitleLog`

Script-owned and append-only. Created through `ensureSheet_` (call mode `setup`) with access `view`: visible, with a red tab, and **no sheet
protection** (only coordinators can open the spreadsheet; [ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md) decision 1). It is
visible and editable because the coordinator enters the baseline rows by hand before cutover (section 11); after cutover
nobody edits it (section 13, rule 2), and the red tab marks it as read-only in practice.

| Column | Content |
|---|---|
| Timestamp, Team ID, Revision | Revision runs 1, 2, 3 … per team |
| Action | `BASELINE`, `SUBMIT`, `GUIDE_APPROVE`, `RETURN`, `REVIEWER_APPROVE`, `REOPEN`, `CANCEL_REOPEN` |
| Actor, Request ID, Fingerprint | The fingerprint is a hash of the action and its normalized input; blank on `BASELINE` |
| Status | `NOT_SUBMITTED` (baseline only), `NEEDS_REVIEW`, `AWAITING_REVIEWER`, `RETURNED`, `APPROVED`, `REOPENED` |
| Proposed Title, Proposed Problem | The current proposal |
| Notes, Similarity Note | Return notes or a reason; the closest similarity match |
| Reopened | `Yes` while a reopening is open |
| Approved Title, Approved Problem, Approved At, Approved By | The effective approval, copied forward on every row |

- Each row is the team's complete state after one action, so the latest row is the current state. A team with no
  row is `NOT_SUBMITTED` (a team added to the roster after cutover).
- Rows are never edited after cutover. Text starting with `=`, `+`, `@` or `-` is escaped.
- Missing or duplicated headers make every title read and write fail with `UNAVAILABLE`. **Runtime reads and writes never
  create, append or repair a header.** The only code that may append a missing header is the editor-run setup
  (`setupTitleStorage`, through `ensureSheet_`; see "Setup" below), and it reports what it added.

**Validation of a team's history** (on every read; a failure makes only that team `UNAVAILABLE`, and coordinator
health lists it):

1. Revisions run 1…n with no gaps or duplicates.
2. Revision 1 is `BASELINE` or `SUBMIT`; only revision 1 may be `BASELINE`; `NOT_SUBMITTED` appears only on a
   `BASELINE`.
3. Every later row is a legal transition: the previous row's status and this row's action are a row of the table in
   [section 5](#5-title-workflow), and this row's status is that row's result.
4. The `Reopened` flag is set by `REOPEN`, kept by `SUBMIT`, `GUIDE_APPROVE` and `RETURN`, and cleared by
   `REVIEWER_APPROVE` and `CANCEL_REOPEN`.
5. The approved fields are copied forward unchanged on every row except `REVIEWER_APPROVE`, which replaces the title,
   problem and approver. `Approved At`, once set, never changes. Approved Title, Approved At and Approved By are all
   set or all blank. Approved Problem is set whenever they are, with one exception: an `APPROVED` baseline whose
   Form-period problem statement was empty may carry a blank Approved Problem until the next `REVIEWER_APPROVE`.
   Every `SUBMIT`, `GUIDE_APPROVE` and `REVIEWER_APPROVE` row has a non-empty Proposed Title and Proposed Problem.
   (A pending baseline with a blank problem therefore cannot be approved; it must go through Return and a
   resubmission, section 5.)
6. **Approval consistency.** The approved fields are set exactly when the team has been approved: from an `APPROVED`
   baseline or the first `REVIEWER_APPROVE` onward, and on no row before that. So they are always set when the
   status is `APPROVED` or `REOPENED`, or `Reopened` is `Yes`, and always blank on a team that was never approved.
7. **Approver row content.** On a `REVIEWER_APPROVE` row, Approved Title and Approved Problem equal that row's Proposed
   Title and Proposed Problem, and Approved By equals its Actor. On the first such row (no approved baseline),
   Approved At equals that row's Timestamp.
8. **Valid dates.** Every Timestamp, and every populated Approved At, is a real date, not in the future (Approved At
   is blank on rows of a team never approved, as rule 6 requires), and Timestamps never decrease
   from one revision to the next. Approved At is not later than the Timestamp of the row that first carries it.

With these rules `titleGate_` (from the approved fields) and the eligibility calculation (from `Approved At`) can
never disagree about whether or when a team was approved.

**Setup:** `setupTitleStorage()` is editor-run, starts with `requireTriggerOrOperator_()`, creates `TitleLog` and
`ActivityDependencies` through `ensureSheet_` ([ENSURE-SHEET-PLAN.md](ENSURE-SHEET-PLAN.md)), and is safe to rerun. Each
sheet is created with its headers if absent; a missing header on an existing sheet is appended at setup; a possible typo,
a duplicate header or unlabelled content is refused and nothing is changed.

## 5. Title workflow

| Action | Who | From | Result | Rules |
|---|---|---|---|---|
| Submit | A member of the team, derived from the session | `NOT_SUBMITTED`, `RETURNED`, `REOPENED` | `NEEDS_REVIEW` | Title and problem both required (see input rules below); similarity check; requirements met ([section 7](#7-precondition-engine)) |
| Guide approve | The team's recorded guide | `NEEDS_REVIEW` | `AWAITING_REVIEWER` | Optional title edit, under the same input rules, which reruns the similarity check. Refused while the proposed problem is blank (legacy baselines only) |
| Return | The guide (from `NEEDS_REVIEW`) or an assigned reviewer (from `AWAITING_REVIEWER`) | as stated | `RETURNED` | Notes required |
| Reviewer approve | Any assigned committee reviewer | `AWAITING_REVIEWER` | `APPROVED`, reopening closed | Sets the approved title, problem and approver; sets `Approved At` only on the first approval. Refused while the proposed problem is blank (legacy baselines only) |
| Reopen | Coordinator | `APPROVED` | `REOPENED` | Reason required, at most 500 characters. Approved fields unchanged |
| Cancel reopen | Coordinator | any status while a reopening is open | `APPROVED` | Reason required. Proposal reverts to the approved title and problem |

- A reopening is open from `REOPEN` until the next `REVIEWER_APPROVE` or `CANCEL_REOPEN`. Returns and resubmissions
  inside it do not close it.
- Submitting is blocked while the status is `NEEDS_REVIEW` or `AWAITING_REVIEWER`.
- **Input rules** (submissions and guide edits, checked on the server before similarity):
  - The title is normalized first (trim, strip surrounding quotes, uppercase). The normalized title must be
    non-empty and at most 200 characters. Whitespace-only and quote-only titles (for example `"  "` or `'""'`) are
    refused with `INVALID_INPUT`. `similarity_` returns 0 for an empty string, so it must never be relied on to
    catch this.
  - The problem statement is **mandatory**: after trimming it must be non-empty and at most 5,000 characters.
  - A guide's edited title, when given, follows the title rule. An empty `editedTitle` means "no edit", never "clear
    the title".
- **Legacy baselines with a blank problem.** The Form period allowed an empty problem statement; this plan does not.
  - **Pending** (`NEEDS_REVIEW` or `AWAITING_REVIEWER` baseline with a blank problem): approval is refused at both
    stages. `can.approve` is `{allowed: false, reason: "The problem statement is missing. Return the title so the
    team can resubmit it with one."}`, and the endpoint refuses the same way with `REJECTED`. Return stays available,
    and the team's resubmission must include a problem (input rules), after which the normal path applies. No
    decision endpoint accepts a replacement problem; only the team supplies it.
  - **Approved** (`APPROVED` baseline with a blank problem): the blank approved problem stays valid (section 4, rule
    5) and is shown as "Not recorded". It survives a reopening and a cancel unchanged: the cancel restores the
    proposal to the approved title with the blank problem. A resubmission during the reopening must include a
    problem, so the next approval replaces the blank.
- **Effective title and problem.** The title and problem shown together are always one pair from one source, never
  mixed:
  - when `approved` is `true` (including during a reopening): the approved title **and** the approved problem;
  - otherwise: the proposed title and the proposed problem.

  `titleGate_` returns this pair (section 2) and every screen outside the title panel uses it: reviews, review
  marking (the `title` and `problem` details at [review-evaluation.js:32](review-evaluation.js#L32)), results, the
  team drawer and lists. Title panels show both pairs during a reopening, labelled "Approved" and "Proposed".

**Similarity** (submissions and guide edits):

- Normalization: trim, strip surrounding quotes, uppercase.
- Master registry: a match of 75% or more blocks the save, naming the matching title and its context. The team's own
  registry rows are excluded by academic year, semester and team ID.
- This semester: other teams' approved titles and current proposals. The best match is stored as the Similarity
  Note and never blocks.
- If the registry cannot be read, the save is refused.

## 6. Writes

Every title write carries `requestId` and `expectedRevision`.

**Order of checks:**

1. Authenticate and authorize from the session (role, and for staff the team assignment).
2. If `TITLE_CUTOVER` is not `LIVE`, refuse with `UNAVAILABLE`: "Title updates are paused for a short update." This
   is only a fast early answer; the binding check is step 7.
3. **Committed request first.** Read the log (read-only, no lock). If the `requestId` is already logged, return the
   stored result when the fingerprint matches, or `CONFLICT` when it does not. A retry of a committed write therefore
   never reaches the requirement check.
4. **Requirements, outside the lock (submit only).** GitHub and Drive calls must not hold the shared script lock.
5. **If a requirement is unmet, look for a committed copy before refusing.** Reread the log (read-only) for the
   `requestId`. If another copy of this request committed while the requirements were being checked, return its
   stored result (or `CONFLICT` if the fingerprint differs). Only if it is still absent, return `REJECTED` with every
   unmet item in the message.
6. Take the script lock with `waitLock(10000)`. A timeout returns `UNAVAILABLE` ("Busy, try again").
7. **Under the lock, immediately before any change:** reread `TITLE_CUTOVER` and refuse with `UNAVAILABLE` unless it
   is `LIVE`; reread the team's log rows, the roster row and the committee. Nothing read before the lock may decide
   anything from here on.
8. Recheck authorization and the committed request ID against the fresh data (a concurrent duplicate may have
   committed during step 4), then refuse with `CONFLICT` when `expectedRevision` is not the fresh current revision.
9. `titleCanDo_` on the fresh state, input validation and similarity, then append one row with revision = fresh
   current + 1, and `SpreadsheetApp.flush()`.
10. If the append throws, reread by `requestId`. If the row is there, the write succeeded. If not, return
    `UNAVAILABLE`; the user retries manually with the same request ID (below).
11. Release the lock, then send mail. A mail failure is logged and returned as `warning`; the save stands. A
    duplicate request sends no mail.

**Error codes** (the existing envelope codes in [api-envelope.js](api-envelope.js); no new codes):

| Situation | Code | View behaviour |
|---|---|---|
| Wrong role or not assigned | `UNAUTHORIZED` | Show the message |
| Bad input (length, empty notes, unknown decision) | `INVALID_INPUT` | Show the message; keep the form |
| Similar to a registry title | `REJECTED` | Show the message naming the match; keep the form |
| Requirements not met | `REJECTED` | Show the message listing unmet items; reload the title DTO so the checklist updates |
| Wrong state for the action | `REJECTED` | Show the message; reload |
| Stale revision, or request ID reused with different content | `CONFLICT` | "This title changed since you opened it."; reload |
| Lock timeout, cutover pause, storage error, uncertain append | `UNAVAILABLE` | Show the message; keep the form for a manual retry |

The precise reason is written to the server log for diagnosis. The envelope, the bridge and the error section of
DATA-CONTRACTS.md do not change.

**Request IDs in the browser.** The bridge stays as it is: it only merges identical in-flight writes and
never retries. The title and upload views own their request IDs:

- A view creates a request ID the first time the user submits a given content, and keeps it in the view's state with
  that content (title and problem; decision, notes and edited title; reason; or document key and file hash).
- It **reuses** the ID when the user retries the same content after `TRANSPORT`, `TIMEOUT`, `BAD_RESPONSE` or
  `UNAVAILABLE`.
- It **replaces** the ID when the content changes, and **drops** it after success or after `UNAUTHORIZED`,
  `INVALID_INPUT`, `REJECTED` or `CONFLICT`.
- **Title writes:** if the page is reloaded the ID is lost. That is safe: a new ID carries the revision the user last
  saw, so a write that already committed makes the retry fail with `CONFLICT` rather than apply twice.
- **Uploads** have no revision. After a reload, a retry with a new ID simply uploads the same file again, which is
  harmless because the last successful upload wins ([section 8](#8-document-upload-minimal)).

## 7. Precondition engine

### `ActivityDependencies`

Coordinator-edited. Only coordinators can open the spreadsheet, and the sheet has no sheet protection. One row per
required item; an activity has several items by having several rows.

| Activity | Kind | Item | Label | Active |
|---|---|---|---|---|
| `title.submit` | `github` | `READY` | GitHub setup complete | Yes |
| `title.submit` | `drive` | `Step1_Work_Breakdown.docx` | Work Breakdown document | Yes |
| `title.submit` | `drive` | `Step2_Need_Analysis.docx` | Need Analysis document | Yes |

- **Activity:** an ID the code knows. In this plan: `title.submit` (any submission before the first approval,
  including after a Return), `title.resubmit` (a submission during a reopening) and `document.upload`. With no rows,
  an activity is unrestricted.
- **Kind:** a check provided by code. **Item:** its meaning depends on the kind. **Label:** what the student sees.
  **Active = No:** turns the row off for everyone.

### Checks provided by code

| Kind | Item | Met when | Data used |
|---|---|---|---|
| `github` | `READY` | Every member's GitHub username is submitted and valid, the repository exists and is verified, every member has active or invited access, and template setup has finished | `getTeamGithubSetup_` with access inspection, `ready` |
| `drive` | a file name | Exactly one non-trashed file with that exact name is in the team folder | `findTeamFolder_`, then a name lookup in that folder |

- An unmet `github` item uses the existing `githubSetupMessage_` text as its reason.
- `READY` is the only `github` item. A repository-only check is not offered: `getTeamGithubSetup_` verifies the
  repository only once every username is complete ([team-github-setup.js:116](team-github-setup.js#L116)), so it
  cannot answer "does the repository exist?" on its own. Any other `github` item is a misconfiguration (F3 lists an
  independent repository check as a possible later kind).
- A `drive` item must be one of the upload names in `TEAM_DOCUMENT_FILE_NAMES_`
  ([team-folders.js:11](team-folders.js#L11)); any other name is a misconfiguration, because students could never
  satisfy it.

### Loader and decision

```
loadActivityRules_(ctx)                         → { rules: {activityId: [{kind, item, label}]}, errors: [] }
check = { kind, needsApprovedTitle, perStudent, validItem(item), isMet(team, item, ctx) → {met, reason} }
activityPreconditions_(activityId, team, ctx)   → { allowed, requirements: [{label, met, reason}], reason }
titleCanDo_(state, action, user)                → { allowed, reason }
```

`ctx` holds the request's loaded rules and a GitHub and Drive result cache for that request. It never holds title
state used for a write decision (section 6, step 7). An endpoint and its DTO flag both call `titleCanDo_` and, for
gated actions, `activityPreconditions_`, so they cannot disagree.

### Fixed rules

1. **Only student submit actions are gated** (title submission and document upload). Guide and reviewer decisions,
   returns and coordinator actions are never gated.
2. **Built-in rules run first; the sheet only adds requirements.**
3. **All-of only.** Every active row must be met. No any-of, no expressions, no per-team waivers.
4. **Checked only at the moment of the action, never retroactively.** A committed request is recognized before the
   requirements are checked (section 6, step 3).
5. **No caching between requests.** A sheet change takes effect on the next request.
6. **Misconfiguration denies.** A missing sheet, a missing or duplicated required header, or a row with an unknown activity, unknown kind or
   invalid item denies every gated activity: "Submission requirements are misconfigured. Contact the coordinator."
7. **No active rows allows.**
8. **Unverifiable is unmet:** "Could not verify: <label>."
9. **A missing team folder** makes every `drive` item unmet: "Team folder not created yet."
10. **No cycles.** A check with `needsApprovedTitle` cannot be required by `title.*` or `document.upload`, and the
    `drive` kind cannot be required by `document.upload`, because the upload is how those files are created. The
    loader treats either as a misconfiguration.
11. **Per-student kinds** (later kinds only) are met when every obligated current member has done the item. If no
    member is obligated, the item is unmet.
12. **A denial lists every unmet item,** and the student DTO carries the full checklist.
13. **Cost.** Requirements are evaluated only for the student's own team when the built-in rules would allow the
    action, once more at the action, and for one team on demand in the coordinator drawer.
14. **Administration.** Only the coordinator edits the sheet. Coordinator health shows the parsed rules and errors.
    The sheet layout is fixed once introduced.

## 8. Document upload (minimal)

The `drive` requirements need a way for files to reach the team folder. Folder creation does not share
folders with anyone ([team-folders.js:111](team-folders.js#L111)), so students cannot place files themselves.

- **Endpoint:** `API_student_uploadDocument({requestId, documentKey, fileName, mimeType, dataBase64})`. The team comes
  from the session. `documentKey` is a key of `TEAM_DOCUMENT_FILE_NAMES_` (`work`, `need`); the stored name is that
  constant's value, whatever the uploaded file was called.
- **Rules:** `.docx` only (checked by extension and MIME type); at most 10 MB; the team folder must exist (it is never
  created here); blocked while the title is `NEEDS_REVIEW` or `AWAITING_REVIEWER`, so documents do not change under
  review; gated by `document.upload` rows (none at release).
- **Fingerprint.** The server decodes the content and computes `fingerprint = SHA-256(documentKey + SHA-256(bytes))`.
  The browser's own hash only decides when to reuse a request ID; the server never trusts it.
- **Before the lock** (read-only):
  1. Authenticate, the early `TITLE_CUTOVER` check, decode and fingerprint the content.
  2. **Committed upload first.** Look in the team folder (live files and trash) for a file whose description carries
     this `requestId`:
     - different fingerprint: return `CONFLICT`;
     - same fingerprint and **complete** (the file is in the trash because a newer upload replaced it, or it is live
       and is the only live file with that name): return success at once (with `replaced: true` in the first case).
       The requirements are not evaluated, so a retry of a finished upload never fails because GitHub became
       unavailable or a rule changed;
     - same fingerprint but **incomplete** (live, with other live files of the same name still to trash): skip the
       requirements and go to the lock to finish the cleanup;
     - not found: continue.
  3. **Requirements** (`document.upload`), only for a request not found in step 2. If one is unmet, repeat the step 2
     lookup once before refusing, in case another copy of this request finished meanwhile; only if it is still absent,
     return `REJECTED` with the unmet items.
- **Under the script lock** (`waitLock(10000)`), in this order:
  1. **Fresh checks under the lock, before touching any file:** reread `TITLE_CUTOVER` (refuse unless `LIVE`),
     re-derive the student's team from the session and the fresh roster, and reread that team's title state from
     `TitleLog`. If the status is now `NEEDS_REVIEW` or `AWAITING_REVIEWER` (for example, a title submission committed
     while this upload waited for the lock), refuse with `REJECTED` and change nothing. These checks also apply to
     retries, so a retry never runs cleanup on a team whose documents are now under review.
  2. Look again, on fresh data, in the team folder (live files and trash) for a file whose description carries this
     `requestId`. The pre-lock lookup only short-cuts finished requests; this one decides.
  3. **Found, with a different fingerprint:** return `CONFLICT` and change nothing.
  4. **Found, same fingerprint, and that file is in the trash:** a later upload replaced it, so this request had
     already succeeded. Return success with `replaced: true` and the note "A newer upload has since replaced this
     file." **Change no files**; above all, never trash the newer file.
  5. **Found, same fingerprint, and that file is live (a retry):** do not upload again; go to step 7.
  6. **Not found:** create the new file with the fixed name and a description of
     `{"requestId", "fingerprint", "uploadedBy", "uploadedAt"}`.
  7. **Finish and verify.** Trash every *other* live file with the same name (never this request's file), then reread
     the folder. Return success only if exactly one live file has the name and it is this request's file. If cleanup
     fails, return `UNAVAILABLE` (the user retries and the retry finishes the cleanup); the `drive` check, seeing two
     files, stays unmet meanwhile.
- **Concurrency: the last successful upload wins.** Uploads carry no version precondition. Two members replacing the
  same document one after the other both succeed, and the later file is kept; the DTO shows who uploaded the current
  file and when, so the team can see it. This is acceptable because a document is not under review while uploads are
  allowed (rules above), and the lock makes each replacement whole.
- **Only students upload.** Guides and reviewers only open the folder link.
- **Server-side write as the deploying account.** The web app runs as `USER_DEPLOYING`, so every file is created by
  that account and students need no Drive access. Consequences:
  - Drive's creator and "last modified by" are always the deploying account, so the upload records its own audit in
    the file description: `{"requestId", "fingerprint", "uploadedBy", "uploadedAt"}`, where `uploadedBy` is the
    session email.
  - Drive permissions do not separate teams, because the deploying account can write to every folder. The server alone
    enforces it: the target folder is always the session student's own team folder, and no team or folder ID is ever
    taken from the request.
  - Uploads depend on that account keeping Content manager access to the shared drive. Without it they fail with
    `UNAVAILABLE` and the `drive` check stays unmet.
- **DTO:** the student title DTO lists each document key with its label, whether it is present, and who uploaded it
  and when (from the description). A file placed by hand, such as a copied Form upload, shows as present with the
  uploader unknown.
- **Who can open the files:** the spreadsheet and `Team Documents` are in a shared drive. Guides and reviewers get view
  access to the team folders from the shared drive's own permissions, so the folder link shown to them opens without
  any sharing step. This plan never changes Drive sharing.
- **Shared drive requirements:** files in a shared drive belong to the drive, not to the deploying account. The
  deploying account (the web app runs as `USER_DEPLOYING`) must be a shared drive member with at least **Content
  manager** access, because the upload moves the replaced file to trash, which the Contributor role cannot do.
  Students need no shared drive membership; the upload writes for them.
- **Students must not be shared drive members.** The web app is their only way to write to a team folder, which is
  what keeps each student to their own team's folder. A student with shared drive membership could open or edit any
  team's folder directly in Drive, bypassing every check here. Keep membership to staff (coordinator, guides,
  reviewers) and the deploying account.

**Existing documents.** Documents uploaded through the Form are not moved by code. Before cutover the coordinator
copies each team's existing Form uploads into its team folder under the fixed names (section 11, step 3) and checks
them on the requirements card.

## 9. Downstream readers

These all move to `titleGate_`, or to the title DTO for display:

| Area | Sites |
|---|---|
| Weekly submission | [logbook-tracker.js:424](logbook-tracker.js#L424), [logbook-tracker.js:454](logbook-tracker.js#L454) |
| Review marking | [review-evaluation.js:15](review-evaluation.js#L15), [review-evaluation.js:32](review-evaluation.js#L32) (title and problem details: the effective pair), [reviewer-evaluation.js:3-13](reviewer-evaluation.js#L3-L13) (`reviewerTeamContext_` title), [reviewer-api.js:16](reviewer-api.js#L16) |
| Eligibility | [progress-eligibility.js:93-104](progress-eligibility.js#L93-L104), [progress-eligibility.js:221-261](progress-eligibility.js#L221-L261): `titleStatus` and `titleDate` come from the gate; the `ProgressEligibility` columns and calculation are unchanged |
| Guide | [guide-dashboard.js:22](guide-dashboard.js#L22), [guide-dashboard.js:38-75](guide-dashboard.js#L38-L75) (approval and document dates), [guide-api.js:73](guide-api.js#L73), [guide-api.js:155](guide-api.js#L155) |
| Reviewer | [reviewer-api.js:5-50](reviewer-api.js#L5-L50), [reviewer-dashboard.js:7-31](reviewer-dashboard.js#L7-L31) |
| Coordinator | [coordinator-dashboard.js](coordinator-dashboard.js) lines 57, 97, 165, 275, 307, 317; [coordinator-view.js:163](coordinator-view.js#L163); the team drawer |
| Student | [student-dashboard.js:42](student-dashboard.js#L42), [student-api.js:36](student-api.js#L36) (Form link) |
| Digests | `sendGuideReminderDigest` (status `NEEDS_REVIEW`), `sendReviewerApprovalDigest` (status `AWAITING_REVIEWER`) |

Before Phase 1 ends, grep every use of `getTeamStatus_`, `REVIEWER_DECISION`, `GUIDE_DECISION`, `TS.TITLE`,
`columns.TITLE`, `TS.PROBLEM`, `SIMILARITY_FLAG`, `TITLE_APPROVED_BY`, the document-link fields, `TEAM_INTAKE_RAW`,
`submitDecision` and `buildTeamIntakeLink_` across server code, views, tests and DATA-CONTRACTS.md, and add any site
missing from this table.

**Removal check (Phase 8 and section 12).** The goal is zero *runtime* readers or writers of the old title data, not
zero mentions. The same grep must find no match in server code (`*.js` run by Apps Script) or browser modules, with
these exclusions, which keep their mentions:

- the frozen definitions: `SHEET_NAMES`, `FIELD_DEFINITIONS` and the column-map helpers in `common-constants.js`;
- `tests/invariants/` and its snapshots, and the Phase 0 golden-master fixtures;
- tests that assert the old columns are untouched or unread;
- documentation (`*.md`), including this plan and the "Form period" notes in DATA-CONTRACTS.md.

The check is a test that greps the runtime files with the exclusion list written in it, so a new exclusion has to be
added there deliberately.

**Removed by the end of the work**, each in the phase of the dashboard that used it:

| Removed | Callers removed with it |
|---|---|
| `API_guide_submitDecision`, `submitGuideDecision_`, `applyGuideDecision_` | [guide-view.js:333](guide-view.js#L333); its DATA-CONTRACTS.md row; its tests |
| `API_reviewer_submitDecision`, `submitReviewerDecision_`, `applyReviewerDecision_` | [reviewer-view.js:135](reviewer-view.js#L135); its DATA-CONTRACTS.md row; its tests |
| `onTeamIntakeSubmit` | its `GUARDED` entry; `tests/title-intake.test.cjs`; the intake cases in `tests/team-github-setup.test.cjs` |
| `buildTeamIntakeLink_`, `TEAM_INTAKE_FORM_URL_BASE`, `TEAM_INTAKE_TEAMID_ENTRY` | [student-api.js:36](student-api.js#L36); `tests/student-fixture.cjs` |
| `getTeamStatus_`, `progressTitleDate_`, `readGuideApprovals_`, the `TeamIntakeRaw` document-date reader | every site in the table above |
| The `CHAPTER1_LATEX_LINK` read in `reviewer-api.js` (a field not in `FIELD_DEFINITIONS`) | the reviewer documents list |

Guide and reviewer views show a link to the team's Drive folder in place of document links.

The `TeamIntakeRaw` sheet is not deleted by this plan. Its archive copy, the verification, the rename test and the deletion
(and the later removal of the `TEAM_INTAKE_RAW` constant, a deliberate schema-snapshot change) are in
[FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md). The guide dashboard's document-submission date comes from
the Drive upload record after this plan, with "Date unavailable" for older files.

## 10. Endpoints, DTO and phases

| Endpoint | Role | Input |
|---|---|---|
| `API_title_get(teamId?)` | Any; the server limits which teams are visible | — |
| `API_student_submitTitle(input)` | Student | `{requestId, expectedRevision, title, problem}` |
| `API_student_uploadDocument(input)` | Student | `{requestId, documentKey, fileName, mimeType, dataBase64}` |
| `API_guide_decideTitle(input)` | Guide | `{requestId, expectedRevision, teamId, decision: 'approve' \| 'return', notes, editedTitle?}` |
| `API_reviewer_decideTitle(input)` | Reviewer | `{requestId, expectedRevision, teamId, decision: 'approve' \| 'return', notes}` |
| `API_coordinator_reopenTitle(input)` / `API_coordinator_cancelReopen(input)` | Coordinator | `{requestId, expectedRevision, teamId, reason}` |
| `API_coordinator_getRequirements(teamId?)` | Coordinator | Parsed rules and errors; with `teamId`, that team's checklist |
| `API_coordinator_validateTitleLog()` | Coordinator | Read-only report (section 11) |

**Title DTO:**

```
{ teamId, revision, status, reopened,
  proposal: {title, problem}, notes, similarityNote,
  approved: {value, title, problem, at, by},
  reopen: {reason, by, at} | null,
  folderUrl,                                          // team Drive folder, '' when absent
  documents: [{key, label, present, uploadedBy, uploadedAt}],   // student's own team; staff see presence only
  history: [{revision, action, actor, at, notes}],     // coordinator only
  can: {
    submit:  Capability,             // the server picks title.submit or title.resubmit; activity says which
    upload:  {work: Capability, need: Capability},   // one per document key
    approve: Capability, return: Capability,         // guide or reviewer, for this team
    reopen:  Capability, cancel: Capability          // coordinator
  } }

Capability = { allowed: boolean,
               reason: string,                       // '' when allowed; otherwise the first reason to show
               activity: string | null,              // 'title.submit', 'title.resubmit', 'document.upload'; null if not gated
               requirements: [{label, met, reason}] } // that activity's checklist; [] when not gated or not evaluated
```

Every action has its own capability, so the view can say exactly why each button is disabled: a built-in reason
(role, state, under review) in `reason`, or unmet items in that action's own `requirements`. Requirements are filled
only for the student's own team, and only when the built-in rules would allow the action (section 7, rule 13);
otherwise `requirements` is `[]` and `reason` explains the built-in refusal.

**Write results:**

- Title writes: `{ok, revision, status, message, warning?}`.
- Uploads (no revision): `{ok, documentKey, present: true, uploadedBy, uploadedAt, replaced, message, warning?}`.
  `replaced` is `true` only for a retry whose file a newer upload has since replaced (section 8, step 4); then
  `uploadedBy` and `uploadedAt` describe the current file.

DATA-CONTRACTS.md, the endpoint, its contract test and its view change together.

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

**Views.** Bridge only, Tailwind utilities, `data-*` hooks and delegated listeners; views render only `can.*` (with
each capability's `requirements`) and `documents`. New modules are registered under their role in `getMigratedViewsClientScript_` and in
`ROLE_MODULES` in `tests/page-assembly.test.cjs`; their tests go into the `test` and `test:migration` scripts.
Rebuild Tailwind after any class change. [tests/entry-point-guard.test.cjs](tests/entry-point-guard.test.cjs) gains
`setupTitleStorage`, `setTitleCutover` and `clearTitleCutover` (both from Release 0) and the new `API_*` functions, and loses `onTeamIntakeSubmit` and the two old decision endpoints.

### Phases

Phases are commits on the development branch, and every one passes `npm test`, `npm run test:migration`,
`npm run test:invariants` and `npm run check:tailwind`. Old code stays in the branch until the dashboard that uses it
has switched, so nothing breaks between phases. Production receives Release 0 early and everything else in one
release, so no old and new code coexist in production.

| Phase | Work |
|---|---|
| 0 | Fixtures and golden masters of today's downstream results (weekly, review marking, eligibility, coordinator health, digests) for every TeamStatus decision combination; `getTeamGithubSetup_` and `findTeamFolder_` stubs |
| R0 | **Release 0** (deployed to production on its own, at least a day before cutover): the old guide decision path and the Form handler take the script lock (the reviewer path already does); all three reread `TITLE_CUTOVER` under the lock immediately before writing and refuse when it is set; the editor-run `setTitleCutover(value)` and `clearTitleCutover()` are added (section 11) and listed in the entry-point guard. Tests for both states and for the barrier |
| 1 | `setupTitleStorage`, the title service, `titleGate_`, history validation, `API_coordinator_validateTitleLog`. `TitleLog` and `ActivityDependencies` are created from the sheet catalog (catalog v1, built earlier; [SHEET-HEADER-MATCHING-PLAN.md](SHEET-HEADER-MATCHING-PLAN.md)). Deliberate schema commit. Nothing calls them yet |
| 2 | Precondition engine, `API_coordinator_getRequirements`, document upload endpoint |
| 3 | Downstream server readers (weekly, review marking, eligibility, digests, coordinator health) switch to `titleGate_`, with equivalence tests from Phase 0 fixtures translated to `TitleLog` fixtures |
| 4 | **Student slice:** `API_student_submitTitle`, the upload endpoint's contract, student view, contract and view tests; `buildTeamIntakeLink_`, the Form link and `onTeamIntakeSubmit` removed |
| 5 | **Guide slice:** `API_guide_decideTitle`, guide view, tests; old guide decision path removed |
| 6 | **Reviewer slice:** `API_reviewer_decideTitle`, reviewer view, tests; old reviewer decision path removed |
| 7 | **Coordinator slice:** reopen, cancel, history, requirements card and drawer; tests |
| 8 | Remove `getTeamStatus_` and the remaining old readers; add the removal-check test from section 9 (no runtime matches, with its exclusion list). The `TeamIntakeRaw` sheet itself is archived and deleted after this phase under FORM-SHEET-RETIREMENT-PLAN.md |
| 9 | Rehearse the cutover on a copy of the spreadsheet |

## 11. Cutover

### `TITLE_CUTOVER`

One script property, read on every title write by both old and new code:

| Value | Old code (Release 0) | New code |
|---|---|---|
| unset | Works as today | **Refuses writes with `UNAVAILABLE`; reads work** (fails closed, the same as `PAUSED`) |
| `PAUSED` | Refuses: "Title updates are paused. Reload the dashboard shortly." | Refuses writes with `UNAVAILABLE`; reads work |
| `LIVE` | Refuses permanently: "Reload the dashboard." | Works |

Because the old code refuses for any value once set, a page still open on the old version can never write again,
whichever version its calls reach. The Form handler, which is old code too, refuses the same way.

**The write barrier.** Waiting for running writes to finish is not reliable, because an Apps Script execution can run
for up to six minutes. The barrier is the script lock instead:

- Every title writer, old (from Release 0) and new, takes the script lock and rereads `TITLE_CUTOVER` under it
  immediately before changing anything. Uploads do the same.
- The property is only ever changed by `setTitleCutover(value)`: editor-run, starting with
  `requireTriggerOrOperator_()`, accepting only `PAUSED` or `LIVE`, and setting the property while holding the script
  lock (`waitLock(30000)`, retried by the coordinator if it times out).
- So when `setTitleCutover('PAUSED')` returns, any write that held the lock earlier has finished, and every later
  write will read `PAUSED` under the lock and refuse. No write can be in progress or start after that point.
- **The one authorized rollback operation is `clearTitleCutover()`.** Editor-run, starting with
  `requireTriggerOrOperator_()`, taking the script lock (`waitLock(30000)`), rereading the property under it, and then
  deleting the property **only if it is `PAUSED` or unset**, and it is run only as the last step of a rollback, after the
  previous deployment and saved code are restored. If the value is `LIVE` it refuses with "Cutover is LIVE; fix
  forward", changes nothing, and the rollback is not available. It is in Release 0 so that it exists in the code that a
  rollback re-pushes. No other way of changing the property is allowed, by hand or by any other function.

### Baseline row

One per team on the roster at cutover, including teams that have not submitted:

| Field | Value |
|---|---|
| Revision, Action | `1`, `BASELINE` |
| Timestamp, Actor | When entered; the coordinator's email |
| Request ID | `baseline:<TeamID>` |
| Status | `NOT_SUBMITTED`, `NEEDS_REVIEW`, `AWAITING_REVIEWER`, `RETURNED` or `APPROVED` |
| Proposed Title, Proposed Problem | The current title and problem (blank for `NOT_SUBMITTED`) |
| Notes, Similarity Note | Carried over as the coordinator chooses |
| Approved fields | For `APPROVED`: title, approver and **Approved At (required)**, and the problem (left blank only if the Form-period problem statement was empty; section 4, rule 5). Otherwise blank |

### Validator

`API_coordinator_validateTitleLog()` reports, without writing:

- every team on the TeamStatus roster that has no row (an error during cutover, information afterwards);
- every Team ID in the log that is not on the roster;
- every history check failure from section 4, per team;
- `APPROVED` baselines without `Approved At`.

### Code availability before the web app is deployed

`setTitleCutover` and `clearTitleCutover` are part of Release 0 and are already in the deployed and saved code. The other
editor-run functions (`setupTitleStorage` and the retirement plan's preflight, archive and verification functions) are
**not** in Release 0, so they must be available in the Apps Script editor before the new web-app version is deployed. How:

- Apps Script runs an editor-run function from the project's **saved code**, serves the web app to users from a
  **deployed version** until a new deployment is created, and runs installable triggers from the **saved code**. (The
  README already treats "update the web-app deployment" as a separate administrator action.) This is confirmed in the
  rehearsal (Phase 9), not assumed.
- So the new functions become available when the new code is **pushed** (`npm run push`) **without creating a new
  deployment version**. Pushing does not change what users get.

**What runs during the interval between the push and step 5:**

| Who or what | Runs |
|---|---|
| Students, guides, reviewers, coordinators using the web app | The **Release 0 deployed version** (old title flow, locks and `TITLE_CUTOVER` checks) |
| Editor-run functions | The **new saved code** |
| Time-driven and other installable triggers | The **new saved code** from the moment of the push, so every trigger whose handler reads title state is **paused before the push** (step 0). None of them runs the new code in the interval. Downstream readers use `titleGate_`, which has no data until the baseline is copied in step 4 |

### Steps

0. **Pause the triggers, then push without deploying.** In this order:
   1. **Pause first.** Pause every time-driven trigger whose handler reads title state (at least
      `processWeeklySubmissionSchedule`, the weekly AI trigger, and the guide and reviewer digests; Phase 0 lists them
      all) from the Triggers page, under every account that installed one. Record each trigger's handler, schedule and
      owner so it can be restored. Where the page offers no disable option, delete it and recreate it from the record
      (or with its existing setup function) in step 6. The commit-fetch trigger does not read titles and keeps running.
   2. **Verify the pause.** Reopen the Triggers page and confirm that none of the listed triggers is active.
   3. **Then push.** With the full suite green, run `npm run push`. Do **not** create a new deployment version; check
      that the web-app deployment still points at the Release 0 version.
   The triggers stay paused through steps 1 to 5 and are restored only in step 6.
1. Release 0 is in production and the new code is pushed (step 0). Check the shared drive's members: the deploying account
   is a Content manager, and no student is a member (directly or through a group). Run `setupTitleStorage`. Enter the
   `ActivityDependencies` rows with `Active = Yes`.
2. Run `setTitleCutover('PAUSED')` and wait for it to return. From then on no old writer can change TeamStatus
   titles, and none is still running (the barrier above).
3. Close the Form (`setAcceptingResponses(false)`) and delete its trigger. Copy each team's existing Form-uploaded
   documents into its team folder under the fixed names.
4. Copy the baseline into `TitleLog` from TeamStatus as it now stands. Every decision made before step 2 is
   included, and none can arrive after it.
5. Deploy the new version. Reads work; writes still refuse because of `PAUSED`.
6. Run `API_coordinator_validateTitleLog` and check the requirements card. Fix the baseline until both are clean. Then
   **restore the triggers paused in step 0**, and only now (check before restoring that none was re-enabled earlier, by
   hand or by a setup function); reads are correct from here on.
7. Check the requirement checklists of teams at `NOT_SUBMITTED` or `RETURNED`; they now need GitHub setup complete and
   both documents in their folder before they can submit. Tell the teams that are not ready.
8. Check each role's dashboard read-only, then run `setTitleCutover('LIVE')` and announce.

**Rollback before step 8.** The write barrier stays in place until the old version is fully restored, and is cleared only after that (the paused triggers are restored after it is cleared, step 6 below).
In this order:

1. Leave `TITLE_CUTOVER` at `PAUSED`. No writer, old or new, can write.
2. Redeploy the previous web-app version.
3. Push the previous code again (the saved code changed in step 0, and editor-run functions and triggers use it).
4. Verify that the deployment and the saved code are both the previous ones (Release 0).
5. Only then run `clearTitleCutover()`, the only authorized way to remove the property. It clears it under the lock, and
   Release 0 then works as it did before.
6. **Conditional: restore the triggers paused in step 0.** If the cutover is rolled back before the normal restoration in
   step 6, those triggers are still paused and the weekly jobs and digests are stopped. After steps 4 and 5 have
   verified that Release 0 is back, restore every trigger recorded in step 0 that is still paused, from the recorded
   handler, schedule and owner, and check the Triggers page. If the cutover had already restored them, there is nothing
   to do.

If the property is unset at any point while the **new** code is still the deployed or saved code, the new code treats it as
`PAUSED` (the table above): it refuses writes with `UNAVAILABLE`. So an early or mistaken clear cannot reopen writes
through the new version. It would reopen them only through Release 0, which is why step 5 comes after steps 2 to 4.
Nothing has been written to `TitleLog` by users before step 8. **After step 8:** fix forward. Rolling back would need every `TitleLog` row since
step 8 copied back to TeamStatus by hand.

## 12. Acceptance tests

- **Transitions:** every row of section 5; refusals for the wrong role, wrong team or wrong state; submitting while
  under review.
- **Input rules:** `INVALID_INPUT` for an empty, whitespace-only or quote-only title (`""`, `"   "`, `'""'`,
  `"' '"`), for one over 200 characters after normalization, and for an empty, whitespace-only or over-long problem;
  the same title rules for a guide's edited title; an empty `editedTitle` approves without changing the title; none of
  these reaches the similarity check or writes a row.
- **Effective pair:** during a reopening with a different proposed problem, `titleGate_`, review marking details,
  results, the team drawer and lists all show the approved title **with the approved problem**, never the proposed
  problem; before the first approval they show the proposed pair; title panels show both pairs labelled.
- **Legacy blank problems:** a `NEEDS_REVIEW` baseline with a blank problem gives `can.approve.allowed = false` with
  the missing-problem reason for its guide, the guide approve endpoint refuses with `REJECTED` and writes nothing, and
  Return succeeds; the same for an `AWAITING_REVIEWER` baseline and its reviewers; after Return, a resubmission
  without a problem is `INVALID_INPUT` and one with a problem follows the normal path to approval. An `APPROVED`
  baseline with a blank problem validates, shows "Not recorded", keeps the blank through reopen and cancel (cancel
  restores the approved title with the blank problem, and history validation passes), and a re-approval after a
  resubmission replaces it.
- **Write order and concurrency:**
  - a committed submission retried after its documents disappear or GitHub is unavailable returns the stored result,
    not `REJECTED`;
  - a log row appended by another request while requirements are being checked makes the slower request return
    `CONFLICT`, never a duplicate revision;
  - a duplicate request committed during the requirement check is recognized under the lock when the requirements
    pass, and is still recognized (stored result, not `REJECTED`) when this copy finds a requirement unmet;
  - a write that passed the early `TITLE_CUTOVER` check but reaches the lock after `PAUSED` was set refuses with
    `UNAVAILABLE` and writes nothing;
  - a reused request ID with different content gives `CONFLICT`; a repeated one gives one row and one mail;
  - lock timeout gives `UNAVAILABLE`; an append that throws but whose row exists counts as success.
- **Browser request IDs:** after a `TRANSPORT` failure, a manual retry of the same content sends the same request ID
  and gets the stored result; changed content gets a new ID; a reload followed by a retry gets `CONFLICT`, not a
  second row.
- **Error codes:** every situation in the section 6 table returns its standard code, and none returns `INTERNAL`.
- **Gate:** `approved` and `approvedAt` unchanged through reopen, return, resubmit and cancel; a new approval replaces
  the title, not the date; weekly submission and review marking stay available during a reopening; the displayed title
  is the approved one during a reopening.
- **Equivalence:** for each Phase 0 golden master whose state means the same in both models (`NOT_SUBMITTED`,
  `NEEDS_REVIEW`, `AWAITING_REVIEWER`, `APPROVED`), the `TitleLog` fixture gives identical weekly, review marking,
  eligibility, coordinator-health and digest results.
- **Deliberate differences,** tested on their own: guide `Rejected` or `Revise` and reviewer `Revise` or `Rejected`
  all become `RETURNED` (status, label and digests); guide title edits only on approval; reviewers have no Reject.
- **History validation:** each rule of section 4 refuses its broken case: an illegal transition, a changed
  `Approved At`, approved fields changed by anything other than `REVIEWER_APPROVE`, a wrong `Reopened` flag, blank
  approved fields on an `APPROVED` or `REOPENED` row or while `Reopened` is `Yes`, approved fields set before any
  approval, a `REVIEWER_APPROVE` row whose approved fields differ from its proposal or actor, a first approval whose
  `Approved At` differs from its Timestamp, an invalid or future date, and decreasing Timestamps. One bad team does not
  affect the others.
- **Validator:** an omitted roster team, an unknown Team ID, and an `APPROVED` baseline without a date are each
  reported.
- **Cutover:** old guide, reviewer and Form writers refuse under `PAUSED` and `LIVE`; new writers and uploads refuse
  under `PAUSED` with `UNAVAILABLE` and work under `LIVE`; reads work in both; every writer reads the property under
  the lock immediately before its change; `setTitleCutover` sets the property only while holding the lock, waits for a
  writer holding the lock, and accepts only `PAUSED` and `LIVE`.
- **Similarity:** a registry match of 75% or more blocks both paths; own registry rows excluded; this semester's
  matches only flag; one normalization on both paths; a registry read failure refuses the save.
- **Engine:** all rows met allows; each unmet row listed; `Active = No` ignored; no rows allows; a missing sheet, bad
  header, unknown activity or kind, invalid `github` item or a `drive` name outside the upload names denies with the
  misconfiguration message; unavailable GitHub or Drive gives "Could not verify"; a missing folder gives "Team folder
  not created yet"; a duplicate or trashed file does not count; `READY` unmet for a missing username, missing access,
  pending template or unavailable GitHub, each with the setup message; a `github` item other than `READY` (for example
  `REPOSITORY`) is a misconfiguration; a `drive` row or a `needsApprovedTitle` check
  under `document.upload` is a misconfiguration; non-gated actions never call the engine.
- **Upload:** wrong type or size refused; missing folder refused; blocked under review; the new file replaces the old
  one and leaves exactly one; a retry with the same request ID does not upload twice; a retry after a failed cleanup
  finishes the cleanup and succeeds only when exactly one live file remains; a reused request ID with another document
  key or different bytes returns `CONFLICT`; **a completed upload whose response was lost, retried after its
  requirements became unmet (GitHub unavailable, or a new active rule), returns its stored success without evaluating
  the requirements; an incomplete one is finished under the lock instead; a request not found and with an unmet
  requirement returns `REJECTED` only after a second lookup still finds nothing**; **upload A succeeds, upload B replaces A, then A is retried: the retry
  returns success with `replaced: true`, B stays the one live file, and no file is created or trashed**; **an upload
  that passes its early checks, then reaches the lock after a title submission has committed, refuses with
  `REJECTED` and creates or trashes nothing; so does an incomplete retry (its file live with older copies still to
  trash) that reaches the lock after that submission**; **a completed upload retried while the title is under review
  returns its stored success from the pre-lock lookup and creates or trashes nothing**; two uploads in sequence keep
  the later file and its uploader; the `drive` check sees the
  uploaded file; the description records the session student's email and time; a student can only ever write to their
  own team's folder; if trashing the old file fails (for example, insufficient shared drive role), the upload reports
  `UNAVAILABLE` and the `drive` check, seeing two files, stays unmet rather than passing.
- **Capabilities:** for each role and title state, every `can.*` capability's `allowed` matches what its endpoint
  decides; a disabled action gives either a built-in `reason` or its own unmet `requirements`, never another action's;
  `can.submit.activity` is `title.submit` or `title.resubmit` as the server chose; `can.upload.work` and
  `can.upload.need` are independent; requirements are `[]` for staff and when a built-in rule already refuses.
- **Results:** title writes return `{ok, revision, status, message, warning?}`; uploads return the upload result shape
  of section 10 with no `revision`.
- **Removal:** the section 9 removal-check test passes (no runtime reader or writer of the old title data; frozen
  definitions, invariant snapshots, golden fixtures and documentation excluded); no Form handler, Form link or Form config key remains; the entry-point guard
  and DATA-CONTRACTS.md match the endpoints.
- **Suite:** `npm test`, `npm run test:migration`, `npm run test:invariants`, `npm run check:tailwind`.

## 13. Operator rules and known limits

**Operator rules**

1. Deploy Release 0 at least a day before cutover, so open pages have reloaded.
2. Do not edit `TitleLog` after cutover.
3. Keep the TeamStatus title columns as they are; they are the record of the Form period. `TeamIntakeRaw` is not kept:
   after cutover it is copied in full to a values-only archive sheet, verified row by row, renamed, and then deleted, as set
   out in [FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md). Do not edit it meanwhile.
4. Each semester uses its own spreadsheet. Before starting the next semester's spreadsheet, run the registry export
   (F2) on this one, so its final approved titles are in the master registry.
5. To pause title writes later (for example to fix a bad row), run `setTitleCutover('PAUSED')`, then
   `setTitleCutover('LIVE')`. Never edit the property by hand; only `setTitleCutover` and `clearTitleCutover` change it, under the lock.
6. Never add students, or a group that contains students, to the shared drive that holds `Team Documents`.

**Known limits**

- The script lock is shared with long GitHub and logbook jobs. A title save during one of them can return
  `UNAVAILABLE`. It fails safely.
- Until the registry export runs, this semester's approvals made after cutover are not in the master registry. Their
  similarity within the semester comes from `TitleLog`.
- Titles replaced by a reopening are not checked for similarity.
- Results published before a reopening show the new approved title once it is approved.

## 14. Future features

None of these is built in this plan. Each is a separate plan. The rules in section 7 apply to all of them, so each one
adds code behind an existing signature and does not change the title service.

### F1. Document upload, extended

The minimal upload of section 8 ships with this plan. Later additions: more document keys (each also an upload name
and, if required, a `drive` row); an upload history per document; other file types. Uploads stay student-only.

### F2. End-of-semester registry export

**Purpose.** Put this semester's final approved titles into the master registry so later semesters' similarity checks
see them.

**Shape.** A coordinator-run function starting with `requireTriggerOrOperator_()`, listed in the entry-point guard.

**Rules.**
- The registry holds **one row per team per academic year and semester**, keyed by those three values.
- For each team with `approved = true`: if no row exists, append one in the existing column order (year, semester,
  team, guide, title, repository, members, approval date, approver). If one row exists and its title differs from the
  current approved title (a team approved before cutover and later reopened and re-approved), update that row's title,
  approval date and approver in place. If it matches, skip it.
- The approval date written is the timestamp of the team's latest `REVIEWER_APPROVE`, or the baseline's `Approved At`
  if there is none.
- If a team has more than one existing row for the semester, refuse that team and list it.
- Refuses while any reopening is open, and lists those teams.
- A rerun changes nothing. It writes a summary (appended, updated, skipped, refused) to the run log and coordinator
  health.

### F3. More requirement kinds

Each is one check in code and rows in the sheet.

| Kind | Item | Met when | `needsApprovedTitle` | `perStudent` |
|---|---|---|---|---|
| `opens` | ISO date | `now` is on or after the date | No | No |
| `title` | `APPROVED` | `titleGate_().approved` | Yes | No |
| `weekly` | week ID, for example `W03` | every obligated member submitted that week | Yes | Yes |
| `review` | review key | marks for that review are complete for the team | Yes | No |
| `github` | `REPOSITORY` | the saved repository exists on GitHub, regardless of member usernames; needs its own check, because `getTeamGithubSetup_` verifies the repository only when every username is complete | No | No |

### F4. Gating more student activities

Use the same engine for other student submissions, such as `weekly.submit` and later assessment submissions. Each gets
an activity ID, and its endpoint and DTO flag call `activityPreconditions_` after their own built-in checks. Built-in
rules stay in code. Activities owned by guides, reviewers or the coordinator are never gated.

### F5. Full cycle detection

Once more than two kinds exist, the loader builds a graph from each activity to the activities its required kinds
depend on, including built-in dependencies, and refuses the whole rule set on any cycle, naming it in coordinator
health.

### F6. Batch readiness for coordinators

A scheduled, coordinator-guarded job evaluates every team's requirements and stores a timestamped summary for System
Status. Actions still evaluate live; the summary never allows anything.

### F7. "Any of" requirements (only if needed)

A `Mode` column (`ALL` by default, or `ANY`) with rows grouped by a `Group` value. Add it only when a real rule needs
alternatives.

### F8. Rebase of the student identity plan

After this release, [STUDENT-IDENTITY-PLAN.md](STUDENT-IDENTITY-PLAN.md) changes as follows: drop the
`'maintenance-reply'` exception; migrate `TitleLog` (team IDs and actor emails); move the title service's membership
and eligibility lookups and the `github` check's member list to `Students` and `TeamRoster`; add the new endpoints,
the upload and the engine checks to its guarded and reader lists; consider replacing `TITLE_CUTOVER` with its general
maintenance mechanism.

### F9. Shared lock cleanup

Stop short user saves failing while long background jobs hold the one script lock: shorter critical sections in the
GitHub and logbook jobs, network work outside the lock, and one shared lock helper with consistent waits and messages.

### F10. Similarity against replaced titles

Optionally include titles replaced by a reopening in the same-semester similarity flag. Flag only, never block.

### F11. Per-team waivers (not planned)

If a real need appears, it needs its own audited plan: coordinator only, a reason, an expiry, its own log, and
visibility in coordinator health. Until then `Active = No` is the only relaxation, and it applies to every team.

### F12. Retiring the frozen TeamStatus columns

In a later semester, once nothing reads them, the TeamStatus title, decision, similarity and document-link columns can be
removed from `FIELD_DEFINITIONS` and the sheets. This is a deliberate, reviewed schema change with its own snapshot
update. `TeamIntakeRaw` is not part of F12: its archive, rename test and deletion are in
[FORM-SHEET-RETIREMENT-PLAN.md](FORM-SHEET-RETIREMENT-PLAN.md).
