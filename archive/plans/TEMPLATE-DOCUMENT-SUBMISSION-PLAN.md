# Template document submission: plan

> **Update 2026-10-13 (owner-approved rule change).** Decision 8 ("a file already in a team folder counts as approved") is retired. A file with a
> template name and no journal row is `NOT_SUBMITTED`, and the DTO has no `existing` field. The files that stood in the folders at go-live were
> recorded once as an ordinary SUBMIT and APPROVE pair with actor `baseline` (111 documents; the one-time editor functions
> `previewDocumentBaseline` / `applyDocumentBaseline` were run and deleted, and Versions 202 and 203 hold them). A history whose first row is `REOPEN` is now `UNAVAILABLE` (none existed in the sheet). The text below is the original plan.

Status: **planned, not implemented. Rewritten 2026-10-12**, aligned the same day with the project's status, error, styling and helper policies (section 9), then revised the same day after two reviews (all review findings resolved, section 15), with the owner's rule for when Submit is available (decision 4) and the owner's decision to use the Document ID in ActivityDependencies (decision 9). This version has no pending-review location: a submitted file goes
straight into the team's Drive folder. The owner's answers of 2026-10-12 are built in (section 14). Nothing described here exists in the code yet.

## 1. What this does, in plain words

Every team repository starts with the same Office files from the capstone template (ten `.docx` in `1_Documents`, one `.pptx` in
`5_Presentations`; `.pdf` files are supported too if the template ever has them). When a team member edits one of them and commits, a student can press **Submit** under *Documents*. The system checks the
file, copies it into the team's Drive folder under the same name, and the project guide approves or returns it. An approved file is listed for the
student, the guide, the reviewers and the coordinator, each with a link to the file.

Two separate daily processes keep this cheap and independent of each other:

- **A. Template scan.** Keeps a list of the template file names. It knows nothing about teams.
- **B. Team-file scan.** For each team, goes through that list and records which files a team member has changed. The student screen reads
  this record; Submit checks again at the moment of the click.

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Pending copies | **No separate review location.** A submitted file is written straight to the team's Drive folder under its own name, and the journal says whether it is awaiting the guide, approved or returned. |
| 2 | How people view an approved file | **A link to the file in Drive.** Reason: opening a binary Office file in the dashboard would need the bytes to pass through the data bridge, a file viewer the project does not have, and size limits; Drive already previews Office files. The guide, reviewers and coordinator are in the shared drive's faculty group and can open it. Students get a link to **that one file**, never to a folder (section 8). |
| 3 | How students get access | **Each team's students are given viewer access to their own team folder.** The existing folder-creation function (`createTeamFolders_`, System Status *Create team folders*) is extended to add them when it creates a folder. A **temporary** editor-run function adds them to the folders that already exist and is deleted once it has been run (section 11, Phase 0). The access is the Drive viewer permission with no notification e-mail. It is folder-level, so a student is not a member of the shared drive. **This is a policy change in itself:** a student who has the folder can open every file in it from Drive, including pending and returned submissions and anything else placed there, and what the app chooses to link cannot limit that. Do not put anything in a team folder that its students must not see. It needs the shared drive to allow access for people who are not members (section 14, answer 2), and AGENTS.md, OWNER-CHECKLIST.md and their tests are updated in Phase 0, before any access is granted (section 10). |
| 4 | When Submit is available, and what is submitted | **Submit is available once at least one commit by anyone in the team has changed the file** (owner rule, 2026-10-12). Concretely: the file exists in the team repository on its default branch, its current blob differs from the manifest baseline, and at least one commit that touched that path was made by a team member whose GitHub account is linked in `GitHubAccounts`. **What is submitted is always the latest copy**: the version at the head of the default branch at the moment of the click, whoever made the last commit. The team finalizes the file in GitHub first and then submits it. The student sees which commit that is (short SHA, date, author) before confirming, and the request carries that commit; if a newer commit has arrived since, Submit is refused with "a newer version was committed, review it and submit again". The commit recorded in the journal is the latest commit that touched the path. |
| 5 | Baseline for "unchanged"; which files can be submitted | The file the team received: the blob SHA in the bundled template manifest (`generated/github-template-manifest.js`), which is what `github-template.js` writes into a new team repository. The live GitHub template repository is **not** the baseline, because it can change after a team's repository was created. A template file whose path is **not in the manifest** (added to the template after the manifest was built) is in no team repository, has no baseline and **cannot be submitted**: its inventory row has `In Team Template = No`. It becomes submittable only when the manifest is rebuilt and the file is added to the team repositories, a separate step outside this plan. |
| 6 | Same file name | The Drive file has the same name as the template file. If the folder already holds exactly one file of that name, it is **updated in place**; Drive keeps the older content as a version. If it holds more than one, Submit is refused with "contact the coordinator". Nothing creates a second file with the same name, because the `drive` requirement counts exactly one. |
| 7 | What the Drive file holds, and who sees it | The Drive file **always holds the most recent submission**, whatever its state. A return keeps it there (status `RETURNED`) and the student resubmits over it. Before an update, the previous content is marked "keep forever" in Drive, so an earlier approved or hand-placed version can be recovered from the version history by the coordinator; it is **not** the visible current file during a review. One rule for the links: a **reviewer or the coordinator** is shown the file's link only while the latest state is `APPROVED`, `REOPENED` or "existing" (the content is still the approved content); a **student and the guide** are shown the link in every state, labelled with the state. A reopened file keeps its link until a student submits again; from then on it is labelled "awaiting the guide", and reviewers and the coordinator see no link until it is approved. |
| 8 | Files already in a team folder | **A file in the team folder whose name is a template file name counts as already approved by the guide.** It has no journal row and is shown as "Approved (existing)". A new submission over it needs the coordinator to record a reopen first (section 8), so a hand-placed file is never overwritten by accident. |
| 9 | Use in ActivityDependencies | **Owner decision (2026-10-12): `ActivityDependencies` uses the Document ID of the scanned list as a requisite for any action.** A new check kind, `document`, takes a Document ID as its item and is met when that document is approved for the team (state `APPROVED`, `REOPENED` or "existing"; section 3) **and** its live file is in the team folder (Phase 5), and fails closed when either source cannot be read. The existing `drive` kind is **not changed**: it is still met by exactly one file of the item's name in the team folder, whatever its submission state, so the two existing document requirements behave as today. This plan enters **no** `ActivityDependencies` row, so no behaviour changes until the coordinator adds one; each row is then the coordinator's configuration, not a code rule change. The engine's list of gated activities is unchanged ("any action" means any activity the engine knows; adding an activity is separate work). Phase 5. |
| 10 | File types | `.docx`, `.pptx` and `.pdf`. Older `.doc` and `.ppt` are not supported. The largest file is **10 MB** (a constant). |
| 11 | Reopening | The coordinator can reopen an approved document, like title reopening; the student may then submit again. |
| 12 | Document ID | Every template file gets a **Document ID** (`doc-0001`, `doc-0002`, ...) the first time the scan sees it. It is never changed or reused, even if the file disappears. The folder and filename find the row; the Document ID is what everything else refers to: `TeamFileStatus`, `DocumentSubmissions` and `ActivityDependencies`. A file renamed or moved upstream is a new file with a new Document ID. |
| 13 | Same file name in two folders | Both template folders submit into one flat team folder under the filename alone. The scan sets `Name Conflict = Yes` on every active row whose filename (compared without case) is shared with another active row. Such rows are not listed and cannot be submitted until the template is fixed, so two documents can never address one Drive file. |
| 14 | Names and one write path | Statuses, actions and error codes use the project's own vocabulary (section 9): the guide **approves or returns** (with notes), as for titles; nothing is called "accepted" or "rejected". All four actions (submit, approve, return, reopen) go through **one** write function, `documentWrite_`, built like `titleWrite_` (authorize, fingerprint, lock, settle, revision check, append), with the document rules in a pure `document-service.js` like `title-service.js`. `titleWrite_` itself is not reused or changed: it is bound to `TitleLog` and the cutover flag, and it is live and tested. |

## 3. Three sheets

All are defined in the sheet catalog (`sheet-columns.js`), not in `SHEET_NAMES`, created by `ensureSheet_` in an editor-run setup, and read and
written by header name. No request creates or repairs a header. Writes follow AGENTS.md "Sheet access": a record is written with `writeRecordSpan_` over
its mapped columns only, so extra columns and any column order are tolerated; do not put formulas in unmapped cells of these sheets.

**`TemplateFiles`** (tab mode `view`). One row per template file: `Document ID`, `Folder`, `File Name`, `Extension`, `First Seen`, `Last Seen`,
`Active`, `In Team Template`, `Name Conflict`. Rows are never deleted. `Active` is `Yes` when the last successful scan found the file and `No` when it did not.
`In Team Template` is `Yes` when the file's path is in the bundled manifest. `Name Conflict` is decision 13. The Documents screen lists only rows with
`Active = Yes`, `In Team Template = Yes` and `Name Conflict = No`.

**`TeamFileStatus`** (tab mode `view`). One row per team and document: `Team ID`, `Document ID`, `Repo Blob SHA`, `Team Changed`
(`Yes`/`No`/`Unknown`), `Last Team Commit` (the most recent commit on the path by a linked team member), `Latest Commit` (the most recent commit on the path by anyone), `Checked At`.
Rows are updated in place by the team-file scan.

**`DocumentSubmissions`** (tab mode `view`), append-only like `TitleLog`. One row per event: `Timestamp`, `Team ID`, `Document ID`, `File Name`,
`Revision`, `Action` (`SUBMIT`, `APPROVE`, `RETURN`, `REOPEN`), `Actor`, `Request ID`, `Fingerprint`, `Commit SHA`, `Commit Author`, `Commit Author ID`, `Team Commit SHA`, `Team Commit Author`, `Team Commit Author ID`, `Blob SHA`, `Drive File ID`, `Notes`.
`Actor` is who pressed the button (the signed-in e-mail). `Fingerprint` is a hash of the action, the team, the Document ID and the action's own input, as in `TitleLog`: the commit the request carries for `SUBMIT`, the decision for `APPROVE`/`RETURN`, and the trimmed notes for `RETURN` and the trimmed reason for `REOPEN`. A repeated request ID must carry the same fingerprint; changing the notes, the reason or the commit while reusing a request ID is a `CONFLICT`, not the first stored result. `Commit Author` and `Commit Author ID` are the GitHub login and numeric ID of the author of the submitted commit. `Team Commit SHA`, `Team Commit Author` and `Team Commit Author ID` are the same for the qualifying teammate commit (`Last Team Commit`) **as found at the moment of the submission**, so the history keeps the contribution as it was then, and not as the daily scan may later change it. They are filled on `SUBMIT` rows and blank on the others.
(`File Name` is there for people reading the sheet.) `Notes` holds the guide's notes on a `RETURN` (required) and the coordinator's reason on a `REOPEN`. The latest row of a team and document gives its status (section 9); a document with no row is `NOT_SUBMITTED`. Revision starts at 1 for the first row and goes up by 1.

## 4. Process A: the template scan (daily)

- A time-driven trigger runs `scanTemplateFiles`. It reads the two folders `1_Documents` and `5_Presentations` of the template repository on its default
  branch. The repository name (`ece-kalasalingam/capstone-team-template`) and the two folder names are **constants in the scan module**, not a Config
  key, so nothing is added to or silently edited in the Config tab; changing them is a code change. The repository is private, so the existing
  `GITHUB_ADMIN_TOKEN` must be able to read it (section 14, answer 4).
- Only regular files ending in `.docx`, `.pptx` or `.pdf` are listed; everything else, and anything in a subfolder, is ignored.
- **Write design.** Under the script lock the scan (1) reads both GitHub folders completely and stops with a logged error if either read fails, without
  touching the sheet; (2) reads the sheet through its header map and stops with a logged error if two rows share a folder and filename; (3) computes in
  memory every row's new values (`Last Seen`, `Active`, `In Team Template`, `Name Conflict`, and a new row with the next Document ID, which is the highest
  number in the sheet plus one); (4) writes **record by record**: each existing row is updated with `writeRecordSpan_` over only its mapped columns, and each
  new row is appended the same way. Extra columns are untouched.
- **What is and is not promised.** There is **no all-or-nothing guarantee**. The scan is *convergent*: every run recomputes the whole desired state from GitHub
  and the sheet. If a run stops part-way, the rows already written are each complete and valid, and the next successful run finishes the rest. An appended row
  keeps its Document ID, so IDs are never reused or duplicated.
- A scan never copies a file, submits anything or changes anything but this sheet.

## 5. Process B: the team-file scan (daily)

- A second trigger runs `scanTeamFiles`. For each team that has a repository and linked students, it reads the repository tree once and, for every
  listed template row (`Active = Yes`, `In Team Template = Yes`, `Name Conflict = No`):
  1. absent in the team repository: `Team Changed = No`;
  2. present, with the same blob SHA as the manifest baseline: `No`;
  3. otherwise read the commits that touched the path, newest first, page by page (100 per page), and stop at the first of these:
     - a commit by a team member's linked GitHub account (author ID in the team's `GitHubAccounts` rows) is found: `Team Changed = Yes`, and that commit is `Last Team Commit`;
     - the history ends with no such commit: `No`. This is a definite answer;
     - **10 pages (1,000 commits) have been read** without either of the above, or GitHub could not be read: `Unknown`. The limit is a constant. It is never treated as `No`.
     `Latest Commit` is the first commit of the first page. A commit by the administrator on top of an earlier teammate commit therefore leaves `Team Changed = Yes` (decision 4). The screen shows `Unknown` as "could not verify yet, try again later", and **Submit refuses with the same message** (it fails closed).
- Rows that no longer qualify (the file went inactive or conflicting) are left as they are; the screen reads the template list first.
- It works in batches of a few teams with a resume cursor kept in a Script Property, as the invitation resend does, so one run never reaches the
  6-minute limit. Each (team, document) row is one `writeRecordSpan_` write; a run that stops part-way leaves valid rows and the next run completes it (the
  same convergent rule as section 4). If GitHub cannot be read for a team, that team's listed rows are written with `Team Changed = Unknown` (and the time), the error is logged, and the other teams continue. An old `Yes` is never left standing after a failed scan; the next successful scan restores the right value. Submit does not depend on these rows: it checks GitHub again and fails closed (section 6).
- A commit by an unlinked account, and a change on a branch other than the default branch, does not count. The student screen says when a file is
  "not available yet" so the team can link accounts and merge.

## 6. Student submission

- A new *Documents* tab in the student view lists the documents of section 3 with, for each, its **status** (section 9) and what the student can do. Whether Submit is possible is the capability `can.submit`: not allowed with the reason "No team member has changed this file yet." (`Team Changed = No`), not allowed with "Could not verify: <document>." (`Unknown`), or allowed (with the latest commit that will be submitted: short SHA, date and author, and a confirmation before the click). A document under review shows "awaiting the guide"; a returned one shows the guide's notes; an approved one shows its link. The screen shows when the scan last ran. Links follow decision 7.
- **Settling an interrupted submission.** A Drive write whose journal row was never appended is an *outstanding write*. Before **any** Submit, guide decision or
  reopen for a team and document proceeds, the server settles it (step 5 below), after the caller has been authorized.
- **Order of every write** (the same order as `titleWrite_`: who you are comes first):
  1. **Authenticate and authorize**, before anything is read or changed, and again under the lock with a fresh roster: the signed-in student is on the team (a guide, for a decision, is the team's guide; a reopen is the coordinator's). A caller who fails sees nothing about the request, even on a retry.
  2. Validate the input and compute the fingerprint (action, team, Document ID and the action's own input, section 3).
  3. **Duplicate request ID, first look, before any GitHub or Drive call.** Read the journal. A row with this request ID and the same fingerprint returns its stored result at once; a different fingerprint is refused with `CONFLICT` ("this request ID was already used for a different request"). So a retry of a Submit that already succeeded works even when GitHub or Drive is unavailable.
  4. Otherwise do the slow reads **outside** the lock: the GitHub checks of section 5 (steps 1 to 3), the latest commit and its bytes, and the file checks of section 7.
  5. Take the script lock and **look again** for the request ID (another click may have committed meanwhile), with the same rule as step 3. Then **settle**: find the team's Drive file by exact name (none: nothing to settle; several: refuse with "contact the coordinator"). Read its description. If it holds a submission record whose request ID is **not** in the journal, append the `SUBMIT` row from that record now (actor, commit, commit author, teammate commit, blob and fingerprint come from the record, with the reason "recorded after an interruption"). Then look for the request ID once more: if the settled row is this request's own, return its stored result. A description that is empty, hand-edited or unreadable is treated as "nothing to settle".
  6. Check that the expected revision matches the journal, and that the document's state allows the action (for Submit: none, returned or reopened; an existing file with no row needs a reopen first). A stale revision is refused with "this document changed, reload".
  7. **Submit only:** re-check under the lock that the latest commit touching the path is still the one the request carries and the one whose bytes were read (one GitHub call); otherwise refuse with "a newer version was committed, review it and submit again".
  8. Drive: for an existing single file, first mark its current content "keep forever" (if that fails, stop), then update it in place; if none exists, create it. In the **same** Drive call that writes the content, set the file's description to a JSON record: request ID, fingerprint, actor, team, Document ID, revision, commit SHA, commit author login and ID, the teammate commit SHA, author login and ID, blob SHA and time.
  9. Append the `SUBMIT` row. Release the lock. Return the new state.
- **If the run stops between steps 8 and 9**, the next request for that team and document settles it (step 5), including the same student's retry with the same request ID, which then returns the stored result. If a different request settles it first, the retry simply finds its own row. The journal and the Drive file never disagree about the latest submission, and no outstanding write can be overwritten before it is recorded.

## 7. What is checked in the file

- The name and extension match the listed template file; size is at most **10 MB** (a constant).
- The bytes are a valid zip. A `.docx` has `[Content_Types].xml` and `word/document.xml`; a `.pptx` has `[Content_Types].xml` and `ppt/presentation.xml`.
- A `.pdf` starts with `%PDF-`, has `%%EOF` in its last kilobyte and no `/Encrypt` entry.
- A macro-enabled content type, an encrypted file, more than 2,000 entries, or content that unpacks beyond a fixed limit is refused.
- A refused file creates no Drive file and no journal row. The student sees the reason in plain words.

## 8. Guide decision, viewing and reopening

- The guide of the team sees the documents awaiting a decision in the existing Documents tab, with a link to the Drive file and, for each, **who committed it and who submitted it**:
  - *Submitted by*: the student who pressed Submit (name and e-mail, from the roster), and when.
  - *Committed by*: the author of the submitted commit, with the short commit SHA and date. The author's GitHub numeric ID is matched to the team's students through their linked accounts (`GitHubAccounts`). If it matches, the **student's name** is shown (with the GitHub username in small text). If it matches no student of the team, it shows **"Outside member"** followed by the GitHub username, for example an administrator or a person whose account is not linked.
  - *Last changed by a team member*: the author of `Last Team Commit`, matched to a student in the same way, so the guide can see the team's own contribution when the last commit is someone else's. Only the most recent teammate is shown, because only that commit is stored.
  The same lines are kept in the history shown for a document after a decision, read from the journal row of the submission (the commit author and the teammate commit stored with it), never from `TeamFileStatus`. Students see their own team's lines with names only (no e-mail addresses); reviewers and the coordinator see the lines of approved documents. **Approve** or **Return**
  (notes are required to return). The decision carries the revision the guide saw; a stale page is refused, as with titles. The server authorizes the
  guide first, then settles any outstanding write for that team and document under the lock (section 6), so a decision is never made on a version the journal does not know. Reopen follows the same order.
- **Approve** records `APPROVE`. Nothing is shared at that moment, because the team's students already have viewer access to the folder (decision 3). **Return** records `RETURN` and the notes; the student resubmits.
- **Who sees what** follows decision 7. In short: students and the guide see every state of their team's documents, labelled; reviewers and the coordinator see a link only while the content is approved. The app never gives a student a folder link. A student who opens the team folder in Drive can see everything in it (decision 3). Guides, reviewers and the coordinator keep their folder links.
- **Reopen.** The coordinator records `REOPEN` with a reason (after settling), for a document with an `APPROVE` row or for an existing file with no row (the first row then has revision 1). The Drive file is not touched. The student may submit again; when they do, the file is updated and the state becomes `NEEDS_REVIEW` (decision 7).

## 9. Endpoints, statuses, errors and the project's common parts

| Name | Role | Purpose |
|---|---|---|
| `API_documents_get(teamId?)` | any (server limits the team) | Documents of a team with state and capabilities; read-only, it settles nothing |
| `API_student_submitDocument(input)` | student | `{requestId, expectedRevision, documentId, expectedCommit}` |
| `API_guide_decideDocument(input)` | guide | `{requestId, expectedRevision, teamId, documentId, decision, notes}` (`decision` is `approve` or `return`; `notes` are required for `return`) |
| `API_coordinator_reopenDocument(input)` | coordinator | `{requestId, expectedRevision, teamId, documentId, reason}` |
| `setupDocumentStorage`, `setupDocumentTriggers`, `scanTemplateFiles`, `scanTeamFiles` | editor / trigger | `setupDocumentStorage` creates the sheets built so far (each phase extends it) and installs no trigger. `setupDocumentTriggers` installs the daily triggers that exist so far, once each, no duplicates, owned by the coordinator as in WEEKLY-PROGRESS.md: Phase 1 adds the template-scan trigger, Phase 2 adds the team-scan trigger. The two scans are the trigger handlers. |

Each public function starts with `requireTriggerOrOperator_()` (or checks the caller itself) and is added to `tests/entry-point-guard.test.cjs`.
DTOs, the envelope and the new endpoints go into `DATA-CONTRACTS.md` in the same commits as the code and the contract tests. Views use the bridge,
Tailwind utilities, `data-*` hooks and delegated listeners, are registered under their role in `getMigratedViewsClientScript_` and in
`ROLE_MODULES`, and have their test files listed in `package.json`.

### Statuses

One status per team and document, taken from the latest journal row (the same words and meanings as the title workflow):

| Status | Meaning | Comes from |
|---|---|---|
| `NOT_SUBMITTED` | Nothing submitted | no row (and no hand-placed file) |
| `NEEDS_REVIEW` | Submitted, awaiting the guide | `SUBMIT` |
| `APPROVED` | The guide approved it | `APPROVE`; also a hand-placed file with a template name and no row (the DTO marks it `existing: true`) |
| `RETURNED` | The guide sent it back with notes; the student submits again | `RETURN` |
| `REOPENED` | The coordinator reopened an approved document; the content is still the approved content | `REOPEN` |
| `UNAVAILABLE` | The document's history cannot be trusted or read | see below |

**`UNAVAILABLE` is needed, but only for one situation:** the journal cannot be read, or the rows of that team and document break the rules (revisions not consecutive from 1, a duplicate revision, an action not allowed after the previous one, a `Document ID` that does not exist). This is what `UNAVAILABLE` already means for titles (the team's history failed validation). It carries `can: null` and the message "contact the coordinator", and the other documents and teams keep working. A document history check, written like `validateTitleHistory_`, runs whenever the journal is read. It is **not** used for a GitHub or Drive problem: those are the capability reasons and the `Unknown` of section 5.

Allowed moves: `NOT_SUBMITTED`, `RETURNED` or `REOPENED` → submit → `NEEDS_REVIEW`; `NEEDS_REVIEW` → approve → `APPROVED`, or return → `RETURNED`; `APPROVED` → reopen → `REOPENED`. Anything else is refused with `REJECTED`.

The DTO uses the project's existing shape: `status`, the existing `state` word and `statusText` that the views already map to a tone, and `can.submit`, `can.approve`, `can.return` and `can.reopen`, each `{allowed, reason, activity, requirements}` as in the title DTO. A student never sees an internal `diagnostic`.

### One write path

`documentWrite_(request, deps)` serves submit, approve, return and reopen. The endpoint says who the caller is and passes callbacks (as the title endpoints do); `documentWrite_` owns the order of section 6, the lock, the duplicate rules, the settlement of an interrupted write and the append. The pure rules (the allowed moves, who may do what, the fingerprint, the history check) are in `document-service.js`, unit-tested without Sheets, GitHub or Drive.

### Errors

Only the codes of `api-envelope.js` are used; messages are user-safe and the detail goes to the server log.

| Situation | Code |
|---|---|
| Not signed in | `UNAUTHENTICATED` |
| Not on the team, not the team's guide, not the coordinator | `UNAUTHORIZED` |
| Document ID not in the list | `NOT_FOUND` |
| Not a valid Office or PDF file, too large, wrong extension, missing notes or reason, bad input | `INVALID_INPUT` |
| The status does not allow the action; the file is absent, unchanged or not changed by the team | `REJECTED` |
| Stale revision; a newer commit; a request ID reused with different input | `CONFLICT` |
| GitHub or Drive cannot be read, the lock times out, several files share the name in the folder, Team Changed is `Unknown` | `UNAVAILABLE` |
| Anything unexpected | `INTERNAL` (generic message) |

`REJECTED` is the error code for "a rule refused this"; it is never a document status.

### Screens and styling

- **Nothing new.** No new style, component, CSS file, inline `<style>` or `style=""`. Views use the existing Tailwind utility strings and theme tokens, kept as string constants in their module (as `student-title.js` does for its fields, buttons and badges), then run `npm run build:tailwind` and `check:tailwind`. `scripts/tailwind-input.css` is not edited.
- **Tabs.** The guide's Documents tab uses `SharedTabs` (its markup, More sheet and keyboard handling). The student's Documents tab follows the student view's existing tab buttons. Selection is `aria-selected` or `aria-current`, never a class.
- **No script keyed on a class or a style.** Scripts find elements through `data-*` hooks and one delegated listener per host, never by class name, tag chain or style; they never read or set a style or toggle a styling class; no `on*` attribute and no per-element `onclick`. Tests find elements through `data-*` hooks.
- **Hidden elements** do not carry a display utility.
- **Bridge only.** Views never call `google.script.run`; loading and error handling follow LOADING-UI.md (a failed refresh keeps the content on screen).
- New modules are registered under their role in `getMigratedViewsClientScript_` or `getDashboardPageScript_` and in `ROLE_MODULES`, and their tests are listed in `package.json`.

### Helpers to use

- **Creating sheets:** `ensureSheet_` in setup mode from an editor-run setup, with `sheetSpec_` from three new entries in `sheet-columns.js` (status `new`, with their `code` lists, so the catalog completeness test and `SHEETS.md` stay green).
- **Reading:** `readSheetRows_` and `getSheetRows_` for values, `getColumnMap_` / `buildColumnMap_` for header names (a missing or repeated header throws), the same way `readTitleLog_` does.
- **Writing:** `writeRecordSpan_` for the two updatable sheets; for the append-only journal a small `appendDocumentRow_` modelled on `appendTitleLogRow_` (a row built from the header map, appended, flushed).
- **GitHub:** `makeGithubRequest_` (blob requests like `githubTemplateRequest_`); `githubAccountColumns_` and `githubStudentIdentity_` to match a commit author to a student.
- **Drive:** `teamFoldersBase_`, `teamDocumentsFolder_`, `teamFolderIn_`, `findTeamFolder_` and `activityDriveFolder_`; no new way to find a team folder.
- **Rules of AGENTS.md:** header-name access, no numeric column, a new test for shuffled, missing and repeated headers on each new sheet, and the position search.

## 10. Rules that change, and rules that do not

AGENTS.md, OWNER-CHECKLIST.md and the tests change in **two steps**, each in the commit that makes it true:

- **Phase 0 (before any folder permission is granted).**
  - AGENTS.md "Students never get a Drive link" becomes: students are given viewer access to **their own team's folder**; nothing in a team folder may be hidden from them; the app never shows a student a folder link. State plainly that the app's link visibility cannot limit what folder viewers see.
  - OWNER-CHECKLIST.md rule E ("never add students, or a group that contains students, to the shared drive") is reworded: students are never members of the shared drive; they are viewers of their own team's folder only.
  - The tests that guard the old rule are reviewed. `student-title.test.cjs` and `student-migration.test.cjs` check that no student DTO carries a link; they stay in force in Phase 0, because the app still shows no link yet.
- **Phase 3 (with the student endpoint).** A student DTO may carry the link of **a file of their own team** (decision 7). Those two tests are updated to allow exactly that case; the strip of `folderUrl` in `student-api.js` stays.

Unchanged: academic and review rules (including the existing `drive` kind and the two document requirements, decision 9), role detection and server-side authorization, the frozen sheets and the schema snapshot (no snapshot is regenerated), and the `TitleLog` workflow.

## 11. Phases (a proposed delivery sequence)

This is the order in which the work is proposed to be built. Each phase ends with `npm test`, `npm run test:invariants`, `npm run check:tailwind` and
`npm run check:sheets-doc` green. Committing, pushing, deploying and every change to live Drive permissions are separate steps that need the owner's go-ahead;
nothing here is done automatically.

0. **Student access to team folders** (first, and it does not change what students see in the app).
   - The policy and test review of section 10, first.
   - `createTeamFolders_` adds each student of the team (the e-mail columns of the team's row) as a viewer of the new folder, with no notification e-mail. A team whose permission fails is listed in the result with the reason and the folder is still created; the System Status card shows the list, and `DATA-CONTRACTS.md` and its contract test change with it.
   - A temporary public function, `grantExistingTeamFolderAccess` (since run and deleted), runs in the editor for the coordinator only. It starts with `requireTriggerOrOperator_()`, goes through the existing team folders in batches with a cursor, adds the students who are not yet viewers, and reports what it added, skipped and failed. It is safe to run again. It is added to the entry-point guard, and **deleted (with its guard entry and test) in the commit after the owner has run it successfully**.
   - Start with a one-folder trial: run it for one team, then check a student of that team can open the folder. If not, the shared-drive setting in section 14, answer 2 is off.
1. **Template scan.** `TemplateFiles` with Document IDs and the name-conflict rule, `setupDocumentStorage` (creates `TemplateFiles`), `setupDocumentTriggers` (installs the daily template-scan trigger), `scanTemplateFiles`, and their tests. Nothing else reads the sheet yet.
2. **Team-file scan.** `TeamFileStatus` (added to `setupDocumentStorage`), `scanTeamFiles` with batches and a cursor, the team-scan trigger (added to `setupDocumentTriggers`), the manifest baseline and the latest-commit author check, and tests.
3. **Submission.** `DocumentSubmissions` (added to `setupDocumentStorage`), the file checks, the Drive write with settlement, `API_student_submitDocument`, the student *Documents* tab, and the Phase 3 changes of section 10.
4. **Decision and viewing.** `API_guide_decideDocument`, the guide's tab with the submitted-by and committed-by lines, approved files in the team drawer for reviewers and the coordinator, `API_coordinator_reopenDocument`.
5. **Requirements.** The `document` check kind in the activity engine (decision 9). Its item must be a listed Document ID (active, in the team template, no name conflict), otherwise the sheet row is a misconfiguration and every gated activity is denied, as for any bad row. It is met for a team only when **both** sources agree: (a) the journal's latest state for the team and document is `APPROVED` or `REOPENED`, or there is no row and the file is hand-placed ("existing"), **and** (b) the team's Drive folder holds exactly one live file with that name, found with the same helpers as the `drive` check (so a deleted, trashed or duplicated file is unmet), and for a journal state its description does not name a submission missing from the journal (an outstanding write is "could not verify" until settled). If either the journal or Drive cannot be read, the check is unmet with "Could not verify" (it fails closed). It never needs an approved title. It is added to the coordinator's requirements report and to `DATA-CONTRACTS.md`. No `ActivityDependencies` row is entered by this plan.

## 12. Tests

- Template scan: a new file adds a row with the next Document ID; a repeated scan adds no duplicate and keeps the ID; a removed file becomes `Active = No`, is not deleted and keeps its ID; a path not in the manifest gets `In Team Template = No`; two active files with the same filename (any case) both get `Name Conflict = Yes`; unsupported types and subfolders are ignored; a failure reading either folder leaves the sheet untouched; duplicate inventory rows stop the scan; extra and shuffled columns are kept; a fault injected after the k-th record write (for every k) leaves valid rows and the next run converges with no duplicate rows or IDs.
- Team-file scan: GitHub unreadable for one team sets that team's rows to `Unknown` (an earlier `Yes` is overwritten) and the other teams are still scanned; a teammate commit found on page 1, found on page 5 (older than 400 commits), history ending with none (`No`), and the 10-page limit reached or GitHub failing (`Unknown`, never `No`; Submit refuses); absent; same as baseline; latest commit by a linked teammate; latest commit by the administrator after an earlier teammate commit (eligible; `Latest Commit` is the administrator's, `Last Team Commit` the teammate's); changed only by the administrator (not eligible); changed by an unlinked account; a teammate commit followed by a revert to the baseline (not eligible); a template edited after a team's repository was created does not make an untouched file "changed"; a file not in the manifest or with a name conflict is never evaluated; batching and the cursor; one team failing does not stop the others.
- Submission: the copy written is the latest commit's content, and the journal records that commit; a newer commit between the screen and the click is refused with the stale-version message and writes nothing; the screen shows the commit that will be submitted; a valid `.docx`, `.pptx` and `.pdf`; an encrypted or truncated `.pdf`; an existing file with no row shown as approved, and refused for a new submission until the coordinator reopens it; a wrong extension, a zip that is not an Office file, a `.pptx` renamed `.docx`, a macro-enabled file, an empty file, an oversize file; the repository changing during Submit; a duplicate click; a second file of the same name in the folder; an update in place keeps the earlier version as "keep forever".
- Settlement: a failure injected after the Drive write and before the journal row, then (a) a retry with the same request ID returns the settled result and Drive is written once; (b) a different student's Submit settles first and is then refused as stale, and the journal matches the file; (c) a guide decision and a coordinator reopen both settle first; (d) a description that is empty or hand-edited settles nothing; a failure of the "keep forever" step stops before any write.
- Guide listing: for a document submitted by one student whose latest commit is a teammate's, an administrator's, or an unlinked account's, the guide's DTO shows the right *submitted by*, *committed by* and *last changed by a team member* lines, with a matched student shown by name and any other author shown as "Outside member" with the GitHub username; the student DTO shows names but no e-mail address; a reviewer or coordinator sees them only for approved documents.
- Decision: approve, return with notes (and a return without notes is `INVALID_INPUT`), resubmit, a stale revision refused, a guide who is not the team's guide refused, reopen (of an approved document and of an existing file with no row).
- Visibility (decision 7): for each of `NEEDS_REVIEW`, `RETURNED`, `APPROVED`, `REOPENED` and existing, which link the student, guide, reviewer and coordinator each receive; after a reopen and a new submission reviewers and the coordinator lose the link until approval; no student DTO carries a folder link or a link to another team's file.
- The existing `drive` kind behaves exactly as before for a pending, returned or approved file. The new `document` kind: a misconfigured item denies; each state is met or unmet as in Phase 5; an approved state whose Drive file was deleted, trashed or duplicated is unmet; an unreadable journal or an unreadable Drive is unmet with "Could not verify"; an outstanding write is unmet until settled; the report shows it; and a team with no row in `ActivityDependencies` is unaffected.
- Retry without GitHub: after a successful Submit, a retry with the same request ID returns the stored result while GitHub and Drive both fail; a different fingerprint is `CONFLICT`; the lookup is repeated under the lock.
- History: the guide's lines for an old submission come from its journal row (commit author and teammate commit) and do not change when the daily scan later updates `TeamFileStatus`.
- Triggers: `setupDocumentTriggers` installs each trigger once, a second run adds none, and Phase 1 installs only the template-scan trigger.
- Fingerprint: reusing a request ID with different notes (return), a different reason (reopen), a different decision or a different commit is a `CONFLICT`; the same input returns the stored result.
- Authorization order: a caller who is not on the team (or not the team's guide, or not the coordinator) is refused before the journal is read, with a new and with a repeated request ID, and learns nothing about the stored result; a repeated request ID with the same fingerprint returns the stored result; with a different one it is refused with `CONFLICT`.
- Phase 0: folder creation adds the team's students and lists failures; the temporary function adds only the missing viewers, is safe to run twice, and reports failures; no notification e-mail is requested.
- Statuses and errors: every status of section 9 for every move; a move the status does not allow is `REJECTED`; each row of the error table returns its code; a journal with a gap, a duplicate revision or an unknown Document ID makes only that document `UNAVAILABLE` (`can: null`) and the others still work; `REJECTED` is never a status.
- Screens: no inline style, no class or style name used by a script, the Documents tab built from `SharedTabs` (guide) and the student tab pattern, elements found by `data-*` hooks, and `check:tailwind` green with no edit to `scripts/tailwind-input.css`.
- Also the shuffled-column, missing-header and duplicate-header tests that AGENTS.md ("Sheet access") requires for each new sheet, and the position search.

## 13. Not in this plan

A pending or review location; opening files inside the dashboard; files in subfolders of the two template folders; the other template folders (`2_Evidence` and so on); file types other than `.docx`, `.pptx` and `.pdf` (including `.doc` and `.ppt`); journal rows for files already in Drive (they count as approved without one); **any change to the existing `drive` kind, and any `ActivityDependencies` row** (the `document` kind is added but nothing uses it until the coordinator enters a row); new gated activities; adding new template files to existing team repositories; changes to review marks or academic rules.

## 14. Owner's answers (2026-10-12) and what is left

1. **Existing files with a template name.** They count as approved by the guide. This is how they are **shown** (decision 8); the `drive` requirement itself is unchanged (decision 9).
2. **Is there a shared-drive setting that lets a folder be shared with people who are not members?** Yes, in Google Workspace. A manager of the shared drive opens it, chooses *Manage members*, then the shared drive's settings, and looks for **"Allow people who aren't shared drive members to access files"**. The Workspace administrator's Drive sharing policy must also allow sharing with other users of the same domain, which the students are. I cannot see either setting from here, so Phase 0 starts with the one-folder trial. If it fails, the setting is off and the owner changes it or grants access by hand.
3. **Largest file.** The owner approves a smaller limit, because the files are `.docx`, `.pdf` and `.pptx`. Set to **10 MB**.
4. **Token access.** The organization's private team repositories were all created by the system account, so the `GITHUB_ADMIN_TOKEN` can read every team repository. The template repository is in the same organization (`ece-kalasalingam`) but its access was not checked: the first template scan will show it, and a failure is logged and leaves the sheet unchanged. If it fails, the system account is added to the template repository.

Still open: only the Phase 0 one-folder trial in answer 2.

## 15. Review findings resolved (2026-10-12)

| Finding | Resolution |
|---|---|
| The review-requirement change contradicts "unchanged rules" and the frozen prerequisites. | The existing `drive` kind is not changed. The owner's use of the Document ID is a new, opt-in kind, `document` (decision 9, Phase 5); no row is entered by this plan. |
| A newly scanned template file has no baseline. | Only files in the bundled manifest can be submitted; the rest get `In Team Template = No` (decision 5). |
| "Last approved version stays" conflicts with updating the same Drive file. | The file always holds the latest submission; links are shown by state; the previous content is recoverable from Drive's version history (decision 7). |
| The Drive access policy change must come before its use. | The AGENTS.md, OWNER-CHECKLIST.md and test review is the first step of Phase 0, and the plan says plainly that app link visibility cannot limit what folder viewers see (decision 3, section 10). |
| `TEMPLATE_REPO` is a Config key the project does not define. | It is a constant in the scan module; nothing is added to Config (section 4). |
| The failure promises had no concrete write design. | Convergent record-by-record writes with no all-or-nothing claim (sections 4 and 5), and an explicit write order with settlement for Submit (section 6). |
| The plan prescribed commits on `main` after every phase. | Section 11 is a proposed delivery sequence; commit, push, deployment and live Drive permission changes need the owner's go-ahead. |
| The whole-table write conflicts with the sheet-access rules. | Writes are per record with `writeRecordSpan_` over mapped columns, so extra and shuffled columns are kept (section 3, sections 4 and 5); the all-or-nothing claim is dropped. |
| A historical teammate commit can qualify a later version written by someone else. | **Decided by the owner (2026-10-12):** that is intended. Submit is available once any linked teammate has changed the file; what is submitted is always the latest copy, shown to the student before confirming, and refused if it changed since (decision 4, sections 5 and 6). |
| An unrecorded Drive write can be replaced by a second request. | Every Submit, decision and reopen first settles an outstanding write from the file's description (section 6, step 2, and section 8). |
| Future filenames can collide in the flat Drive folder. | Rows sharing a filename get `Name Conflict = Yes` and are not submittable (decision 13). Everything refers to documents by the stable Document ID (decision 12). |
| Submit checks the request ID and may change the journal before authorizing the caller. | Authentication and authorization come first, again under the lock; the duplicate-request check compares a fingerprint (same input returns the stored result, different input is `CONFLICT`); settlement happens only after authorization (section 6, steps 1 to 5). |
| The three-page commit search can mark an eligible file unavailable. | The search reads page by page until a teammate commit is found or history ends; reaching the 10-page limit or a GitHub failure is `Unknown`, shown as "could not verify", and Submit fails closed (section 5, step 3). |
| The `document` requirement can pass when its Drive file is gone. | It needs both the approved state and exactly one live Drive file, and fails closed when either source cannot be read (Phase 5). |
| "Also changed by" implies several teammates but one commit is stored. | The label is singular: "Last changed by a team member" (section 8). |
| A Submit retry depends on GitHub being available. | The authorized duplicate-request lookup moves ahead of every slow check and is repeated under the lock (section 6, steps 3 to 5). |
| The historical contributor line has no fixed source. | The qualifying teammate commit is captured in the `SUBMIT` row (`Team Commit SHA`, `Team Commit Author`, `Team Commit Author ID`) and the history reads it from there (section 3, section 8). |
| `setupDocumentStorage` is described as both installing triggers and as sheets only. | It creates sheets only; a separate `setupDocumentTriggers` installs the triggers phase by phase (section 9, section 11). |
| GitHub failure has two outcomes in the team scan (`Unknown` and "rows unchanged"). | One outcome: the team's listed rows are written `Unknown`, the error is logged and the other teams continue (section 5). |
| The fingerprint omits the decision inputs. | It includes each action's own input: commit, decision and trimmed reason (section 3). |
| Statuses and errors use words of their own, not the project's. | Renamed to the project vocabulary (`NOT_SUBMITTED`, `NEEDS_REVIEW`, `APPROVED`, `RETURNED`, `REOPENED`, `UNAVAILABLE`), approve/return with notes, an error-code table, and one write path (decision 14, section 9). |
| The style, component and no-script-on-class rules were only half stated. | Section 9, "Screens and styling". |
| The common sheet, GitHub and Drive helpers were not named. | Section 9, "Helpers to use". |

## 16. Implementation notes (2026-10-12)

All phases are implemented on `main`; nothing is pushed or deployed. Differences from the plan above:

- **Preview endpoint.** `API_student_previewDocument({documentId})` was added so the student sees the exact latest commit (committer, last teammate change) before confirming; Submit then sends that commit as `expectedCommit`.
- **`roles` in the Documents DTO.** `DocumentsDto` carries the caller's roles on the team, so the shared view shows the "cannot submit" reason only to students. `DATA-CONTRACTS.md` has the change.
- **One shared view.** `documents-view.js` (`DocumentsView`) renders the Documents DTO for the student's Documents tab, the guide's Documents workspace tab and the coordinator's team drawer; each host has one delegated listener and `data-*` hooks. The drawer section is not a `getTeamDrawer` section: it reads `API_documents_get` itself.
- **`document` check kind** is in `activity-check-document.js`, registered in `activityChecks_()`. It is met only by an approved (or hand-placed) document with exactly one live Drive file, and an outstanding Drive write that is not yet in the journal keeps it unmet. No `ActivityDependencies` row is entered.
- **Superseded by REPO-FROM-TEMPLATE-PLAN.md (built 2026-10-12):** there is no bundled manifest any more. The baseline is the file's content in its first commit in the team repository (column `Baseline Blob SHA` of `TeamFileStatus`, read once), and `In Team Template` is `Yes` for every file found in the template repository. Sections 3, 4 and 5 above describe the earlier manifest design.
- **Owner steps:** `setupDocumentStorage`, `setupDocumentTriggers`, the Phase 0 trial and the grant for existing folders are done, and the temporary `grantExistingTeamFolderAccess` has been deleted. Run `setupDocumentStorage` once more after the next deploy: it adds the `Baseline Blob SHA` header to `TeamFileStatus`.
