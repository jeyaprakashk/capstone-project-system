# Data contracts

The server returns data only; the client bridge and views consume these shapes.
Spreadsheet columns, `FIELD_DEFINITIONS` and A1 positions never appear in a DTO.

## Envelope

Every migrated endpoint returns `JSON.stringify` of one of:

```json
{ "ok": true,  "data": { }, "generatedAt": "2026-01-02T12:00:00.000Z" }
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "You do not have access." } }
```

- `generatedAt` and every date inside `data` are ISO-8601 strings, never `Date` objects.
- `message` is safe to show a user. Internal detail is logged on the server only.
- The bridge treats a response that does not match the envelope as an error.

Error codes: `UNAUTHENTICATED`, `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`, `REJECTED`,
`CONFLICT`, `UNAVAILABLE`, `INTERNAL`. `REJECTED` carries an existing business-rule message
(a plain `Error` thrown by the rules code) unchanged; engine errors become `INTERNAL` with a generic message.
The bridge adds client-side codes `TRANSPORT`, `TIMEOUT`, `BAD_RESPONSE` and `SUPERSEDED`.

## Endpoints

One section per migrated endpoint, added with the dashboard that needs it:

| Endpoint | Role | Request | `data` shape | Replaces |
| --- | --- | --- | --- | --- |
| `API_coordinator_getOverview()` | Coordinator | none | `CoordinatorDashboard` (below) with `loading:true`; assessment values are not read yet | `buildCoordinatorContent`, `loadCoordinatorSection` (removed) |
| `API_coordinator_getReviewProgress(key)` | Coordinator | `key` is a configured Review key | `{key, label, total, completed, unavailable, teams:{<teamId>:'Completed'\|'Pending'\|'Unavailable'}}`; rejected for an unknown key | the Review completion read |
| `API_coordinator_getGuideProgress()` | Coordinator | none | `{available, completed, teams:{<teamId>:'Completed'\|'Pending'\|'Unavailable'}}` | the Guide Evaluation completion read |
| `API_coordinator_getHealth()` | Coordinator | none | `{needsAttention, partial, teams:{<teamId>:{health}}}` | the health read |
| `API_coordinator_validateTitleLog()` | Coordinator | none | `{ok, rows, rosterTeams, errors:[{kind, teamId, message}], information:[{kind, teamId, message}], truncated}`; `kind` is `NO_ROW`, `NOT_ON_ROSTER`, `INVALID_HISTORY` or `APPROVED_WITHOUT_DATE`; a roster team with no row is information; each list holds at most 200 items and `truncated` says more existed. Read-only. Rejected with `UNAVAILABLE` when the TitleLog sheet is missing or its headers are wrong | new (title revision, Phase 1) |
| `API_coordinator_getRequirements(teamId?)` | Coordinator | optional `teamId` | `{rules:{<activity>:[{kind,item,label}]}, errors:[string], teamId, activities}`; `activities` is `null` without a team, otherwise `{<activity>:{allowed, reason, requirements:[{label, met, reason, diagnostic?}]}}` for `title.submit`, `title.resubmit` and one entry per `REVIEW` assessment, named by its Assessment ID (`review1`, ...; there is no document upload activity: documents are placed in the team folder outside the system). `diagnostic` appears here only (`GITHUB_ERROR`, `GITHUB_MEMBER_UNVERIFIED`, `GITHUB_REPOSITORY_UNVERIFIED`, `COMMITS_UNREADABLE`, `COMMITS_COLLECTION_FAILED`, `COMMITS_NOT_COLLECTED`, `TITLE_HISTORY_UNAVAILABLE`, `TEAM_DOCUMENTS_UNRESOLVED`, `FOLDER_AMBIGUOUS`); student DTOs go through `studentRequirements_`, which removes it. A team not on the roster is `NOT_FOUND`. Read-only | new (activity engine) |
| `API_title_get(teamId?)` | Student (own team), Guide, Reviewer, Coordinator | optional `teamId`; a student always gets its own team | `TitleDto` (below). `UNAUTHORIZED` for a person with no role on the team (also for a team that does not exist, except to a coordinator, who gets `NOT_FOUND`); `UNAVAILABLE` when that team's history fails validation | new (title revision) |
| `API_documents_get(teamId?)` | Student (own team), Guide, Reviewer, Coordinator | optional `teamId`; a student always gets its own team | `DocumentsDto` (below). `UNAUTHORIZED` for a person with no role on the team; `UNAVAILABLE` when the document sheets cannot be read | none |
| `API_student_previewDocument(input)` | Student | `{documentId}` | `{documentId, fileName, commit:{sha, shortSha, date, author}, lastTeamChange}`; `author` is `{name\|null, login, outsideMember}`. Read live from GitHub; `REJECTED` when no team member has changed the file, `UNAVAILABLE` ("Could not verify") when GitHub cannot be read | none |
| `API_student_submitDocument(input)` | Student | `{requestId, expectedRevision, documentId, expectedCommit}`; the team comes from the session | `{ok, revision, status, message, evidence?}`; when the document has evidence folders the evidence is copied right after the submission and `message` says what was copied or is left, `evidence` is the `EvidenceCopy` result below; a copy failure never fails the submission | none |
| `API_student_checkEvidence(input)` | Student | `{documentId}`; the team comes from the session | `{ok, message, evidence, can:{copyEvidence}}`: the document's evidence read live from the team repository (the Documents screen reads none), with its `PENDING` and `TOO_LARGE` files, and whether Copy evidence is now allowed. The counts are saved to `EvidenceStatus`. Copies nothing. `REJECTED` when the document has no evidence folder or has not been submitted; `UNAVAILABLE` when GitHub cannot be read | none |
| `API_student_copyEvidence(input)` | Student | `{documentId}`; the team comes from the session. Idempotent (a file is copied only when new or changed), so it has no request ID | `EvidenceCopy` = `{ok, message, configured, copied, pending, tooLarge, failed:[{path, reason}], busy}`. `REJECTED` when the document has no evidence folder or has not been submitted; `UNAVAILABLE` when GitHub or the team folder cannot be used. One call copies at most 20 files and 60 MB: `pending` is what is left | none |
| `API_guide_decideDocument(input)` | Guide | `{requestId, expectedRevision, teamId, documentId, decision:'approve'\|'return', notes}`; `notes` are required for `return` | `{ok, revision, status, message}` | none |
| `API_coordinator_reopenDocument(input)` | Coordinator | `{requestId, expectedRevision, teamId, documentId, reason}` | `{ok, revision, status, message}` | none |
| `API_student_submitTitle(input)` | Student | `{requestId, expectedRevision, title, problem}`; the team comes from the session | `{ok, revision, status, message}` | the Team Intake Form |
| `API_guide_decideTitle(input)` | Guide | `{requestId, expectedRevision, teamId, decision:'approve'|'return', notes, editedTitle?}`; `editedTitle` only with `approve`; `notes` required for `return` | `{ok, revision, status, message}` | the old guide decision endpoint (removed) |
| `API_reviewer_decideTitle(input)` | Reviewer | `{requestId, expectedRevision, teamId, decision:'approve'|'return', notes}` | `{ok, revision, status, message}` | the old reviewer decision endpoint (removed) |
| `API_coordinator_reopenTitle(input)` / `API_coordinator_cancelReopen(input)` | Coordinator | `{requestId, expectedRevision, teamId, reason}` (reason required, at most 500 characters) | `{ok, revision, status, message}` | new |
| `API_coordinator_getActivity()` | Coordinator | none | `{state (`active`, `between` weeks, `not-started`, `ended`, `unavailable`), week, checkedAt, teams:{<teamId lower-case>:{logs,commits}}, totalTeams, activeTeams}` | `loadAllTeamsWeeklyActivity_` (wrapped) |
| `API_coordinator_getSystemStatus()` | Coordinator | none | `SystemStatus` (below) | `loadCoordinatorSystemStatus` (removed) |
| `API_student_getWeekly()` / `API_student_submitWeekly(input)` | Student | input: `{requestId, weekId, workCompleted, guideDiscussion, blockers, nextAction}` | the existing weekly-progress object (`ready, weeks, actions, history, evidence, allWeeks, timezone, checkedAt …`) / `{ok, entryId, weekId, entryStatus, timeliness, firstSubmittedAt, message}` | `loadStudentWeeklyProgress_` / `submitWeeklyProgress_` called directly |
| `API_guide_getWeekly()` / `API_guide_signWeekly(entryId, status)` | Guide | `status` is `DISCUSSED` or `NOT_DISCUSSED` | `{checkedAt, timezone, weeks, entries, requiredByWeek …}` / `{ok, entryId, status, message}` | `loadGuideWeeklyProgress_` / `submitWeeklyGuideSignoff_` called directly |
| `API_guide_getEvaluation(teamId, register)` | Guide | register optional | the existing `loadGuideEvaluation_` object (`roster, student, statuses, config, evaluation, repository, revision, token, overdue`) | `loadGuideEvaluation_` called directly |
| `API_guide_saveEvaluationDraft(input)` / `API_guide_submitEvaluation(input)` | Guide | `{team, student, revision, token, scores, requestId}`; the request ID makes a retry safe | `{status, …}` as before | `saveGuideEvaluationDraft_` / `submitGuideEvaluation_` called directly |
| `API_student_getReviewResult(key)` / `API_student_getGuideResult()` | Student | assessment key | the published result (`config, identity, total, weighted, scores, assessment, underCorrection`) or `null` when nothing is published | `loadPublishedReviewEvaluation_` / `loadPublishedGuideEvaluation_` called directly |
| `API_student_getEligibility()` | Student | none | `{notEligible:[assessmentKey]}`: the assessments the student's team is not eligible for: every assessment the activity dependencies know (`activityIds_`: each `REVIEW` row of `AssessmentDefinitions`) that is not yet entered and where an earlier assessment is not recorded or a requirement row is definitely unmet, whether or not it has opened. One read for every assessment of the team, so the Drive folder, the documents and the rules are read once. It labels an unpublished assessment `Not Eligible` and says nothing more: no requirement, label or reason reaches a student. A requirement that could not be read, or a misconfigured sheet, leaves the assessment out | `assessmentsTeamNotEligible_` called directly |
| `API_student_getCore()` | Student | none | `StudentCore` (below): team, roster, `titleApproved`, assessment labels; sheet data only, no GitHub calls | `getStudentBaseData_` + `buildStudentCoreDto_` |
| `API_student_getProject()` | Student | none | `StudentProject` (below): setup, GitHub and title cards (the GitHub checks) | `getStudentDashboardData_` + `buildStudentProjectDto_` |
| `API_guide_getDashboard()` | Guide | none | `GuideDashboard` (below) | `buildDashboardContent` (removed) |
| `API_guide_getGithub()` | Guide | none | `{teams:{<teamId>: GuideGithub \| null}}` for the guide's own teams; `null` = status unavailable (a failed GitHub read is never an error) | `buildGuideGithubDto_` over `getTeamsGithubSetup_`; read once after the dashboard renders so first paint never waits on live GitHub calls |
| `API_guide_getCommits(teamId)` | Guide (own team only) | team ID | `{teamId, state:'available'|'unavailable', message, repositoryUrl?, members:[{regno, username, count:number|null, commits:[{sha, shortSha, message, timestamp, url}]}]}`; `count` is every collected commit by that member in the team repository (all time, bootstrap commit excluded) and `commits` the latest 3; read when the GitHub status tab is first shown | `buildGuideCommitsDto_` over `readCollectedCommits_` |
| `API_reviewer_getDashboard()` | Reviewer | none | `ReviewerDashboard` (below) | `buildReviewerContent` (removed) |
| `API_reviewer_getTeamRequirements(teamId)` | Reviewer (assigned team only; any other team is `NOT_FOUND`) | team ID | `{teamId, reviews:[{key, enabled, actionLabel, note}]}`: the same cells as `ReviewerDashboard.teams[].reviews`, with every `ActivityDependencies` row of each review evaluated (documents, GitHub). Slow (Drive), so the dashboard reads it per team after first paint, at most three at a time, and replaces the cells it showed; a failed read leaves them, and the server still refuses the entry itself | `getReviewerReviewProgress_(rows, undefined, true)` and `reviewerReviewCellDto_` |
| `API_review_getEvaluation(teamId, assessmentId)` | Reviewer | assessment key such as `review1` | the existing `loadReviewEvaluation_` object (details, roster, config, evaluation, statuses, revision, token); `availability.absenceCorrectionAllowed` is true only for a submitted team evaluation with no publication history. An unsubmitted evaluation is refused (a plain error message) until the review's `ActivityDependencies` rows are met (the project title approved, documents approved, ...) and every lower-sequence assessment is recorded | `loadReviewEvaluation_` called directly |
| `API_review_save(kind, input)` | Reviewer | `kind` is `draft`, `submit`, `absence`, `makeupDraft` or `makeupSubmit`; `input` is the existing request object | the existing result of `saveReviewEvaluationDraft_`, `submitReviewEvaluation_`, `recordReviewAbsence_`, `saveReviewMakeupDraft_` or `submitReviewMakeup_`; `{ok:false}` results become `REJECTED` | those functions called directly; every kind is refused with the same messages while the review is not open for the team |
| `API_coordinator_getWeeklySetup()` / `API_coordinator_setupWeekly(kind)` | Coordinator | `kind` is `storage` or `triggers` | the existing readiness report (`storageReady, triggerReady, canSetupStorage, canSetupTriggers, issues`) / the existing setup result | `getWeeklyProgressPhase2Readiness_` / `setupWeeklyProgressPhase2Storage` / `setupWeeklyProgressPhase2Triggers` called directly |
| `API_coordinator_getCommitteeConfiguration()` / `API_coordinator_getReviewConfiguration()` | Coordinator | none | the existing readiness reports (`valid, state, summary, issues, links, checkedAt`, plus `committees` or `storage`) | `getCoordinatorCommitteeConfiguration_` / `getCoordinatorReviewConfiguration_` called directly |
| `API_coordinator_createDefinitions()` / `API_coordinator_prepareStorage()` | Coordinator | none | `{created}` / `{journals:[{label,journal,created,initialized}]}` | `createAssessmentDefinitions_` / `prepareReviewAssessmentStorage_` called directly |
| `API_coordinator_resendInvitations(cursor)` | Coordinator | `cursor` is `''` for the first batch, then the returned `nextCursor` | `{results, nextCursor, stopped}` | `resendExpiredStudentInvitations_` called directly |
| `API_publishing_get(assessmentId)` / `API_publishing_run(method, input)` | Coordinator | `method` is `publishInternalAssessment_` or `reopenInternalAssessment_`; `input` carries `requestId`, so a retry is safe | the existing publication report (`ready, config, teams, error`) / the existing publish or reopen result | `loadInternalAssessmentPublishing_` / `publishInternalAssessment_` / `reopenInternalAssessment_` called directly |
| `API_student_previewGithub(profileUrl)` / `API_student_confirmGithub(token)` / `API_student_completeGithubSetup()` | Student | profile URL; the signed `token` returned by the preview | `{token, account:{githubId, username, displayName, profileUrl, avatarUrl}}` / `{ok, message}` / `{message}` | `previewStudentGithubAccount_` / `confirmStudentGithubAccount_` / `completeStudentGithubSetup_` called directly |
| `API_shared_getTimeline()` / `API_shared_getRubrics()` | Any dashboard role | none | the existing project timeline (`schedule, milestones …`) / shared rubrics (`assessments …`) | `loadSharedProjectTimeline_` / `loadSharedRubrics_` called directly |
| `API_coordinator_getTeamDrawer(teamId, section)` | Coordinator | `section` is `basic`, `title`, `progress` or `activity` | the existing team detail for that section, rendered by `TeamDrawerView` (`team-drawer-view.js`); the `title` section is `{title: TitleDto (with history), requirements:{errors, activities:{<activity>:{allowed, reason, requirements:[{label, met, reason, diagnostic?}]}}}}` and is where the coordinator reopens a title or cancels a reopening; `basic` and `progress` report `titleStatus` as above and no longer carry the guide and reviewer decisions | `loadCoordinatorDrawerSection_` called directly |

For each endpoint record: required role, request fields and validation, the exact
`data` fields and types, and which server HTML builder it replaces. Each endpoint has
a contract test that checks its output against this shape, and a golden-master
comparison against the output of the function it replaces.

### ReviewerDashboard

```
{ summary:{pending,approved,awaitingGuide,total},
  reviews:[{key,label}],                 // configured REVIEW assessments, in column order
  reviewError:string|null,               // set when marks are unavailable (e.g. missing definitions)
  teams:[{ teamId, guideName, registerNumbers:[string], title, committee,
           titleApproval:{ status:{tone:'neutral'|'success'|'warning', label}, canDecide:boolean, canApprove:boolean, approveBlockedReason:string, revision:number,
                           submittedTitle, problem, similarityFlag, folderUrl, notes },
           reviews:[{key, enabled:boolean, actionLabel, note}] }] }
```

On first paint the dashboard evaluates only the cheap rows (the `title` kind); the documents and GitHub rows arrive per team through `API_reviewer_getTeamRequirements`, and until then a team with an open review is being checked: the view shows the shared spinner beside its ID and keeps its marks button disabled (and out of the pending counts), so a button never goes from enabled to disabled. A failed read settles the team and uses the cell the dashboard sent (opening it is still refused with the reasons). A review cell is `enabled` only when marks can be opened for the team: the review's `ActivityDependencies` rows are met (the project title approved, documents approved, ...), every lower-sequence assessment is recorded, and the review is open. The title is one of those rows, not a separate check. While it is not, `note` carries the reason: `Not Eligible` (any requirement row or earlier assessment not met while the review is open: the details are on the coordinator's requirements report and in the refusal when the entry is opened), or the opening date. A submitted or published review stays viewable (`View marks`).

Only teams in the reviewer's committees are returned. `tone` is semantic; the view maps it to colours. The title facts come from `TitleLog`: `title` is the
title in effect (the approved one once approved), `submittedTitle` and `problem` are the proposal, `similarityFlag` is the similarity note, `notes` is the
latest note, `folderUrl` is the team's Drive folder (empty when absent), and `revision` is what the decision must send as `expectedRevision` to
`API_reviewer_decideTitle`. `canDecide` is true only while the title is waiting for the reviewers. A team whose title history fails validation shows
the status `Unavailable` and cannot be decided.
Contract tests: `tests/reviewer-migration.test.cjs` (snapshots in `tests/invariants/snapshots/reviewer-*.json`).

### CoordinatorDashboard

```
{ loading:boolean,                        // true for the overview stage: assessment values are not read yet
  stats:{ total, titleApproved, reposReady, needsAttention,
          guideEvaluation:{available,completed}|null,
          reviews:[{key,label,completed:number|null,unavailable:number,known:boolean}] },
  reviewColumns:[{key,label}], reviewConfigurationError:boolean, partial:boolean,
  teams:[{ teamId, guide, title /* the title in effect */, titleStatus /* NOT_SUBMITTED|NEEDS_REVIEW|AWAITING_REVIEWER|RETURNED|APPROVED|REOPENED|UNAVAILABLE */, repoStatus:'ready'|'pending', githubMessage, githubTiming, repoUrl,
           registerNumbers:[string], emailRecipients:[string], health:'ontrack'|'monitor'|'attention'|'loading',
           guideEvaluation:string, reviews:{<key>:'Completed'|'Pending'|'Unavailable'|'Loading…'} }] }
```

The overview renders first. Then one `getReviewProgress` per `reviewColumns` entry, `getGuideProgress`, `getHealth` and weekly
activity run in parallel and settle independently: each fills only its own card and tracker column, and a failure or
timeout is isolated to that section, with its own message and Retry. Percentages, tones and badge labels are derived in the view.
The team drawer is rendered by `TeamDrawerView` (three sections read independently; each fails and retries on its own); DashboardUI only opens, closes and focuses it. Contract tests: `tests/coordinator-migration.test.cjs`
(snapshot `tests/invariants/snapshots/coordinator-legacy-facts.json`, captured from the removed HTML for the overview,
progress and no-reviews cases, with explicit expectations for the removed deadline alerts).

The tracker offers All, Attention and On Track filters. Deadline alert pills and
per-team pending deadline keys have been removed; team-health assessment remains separate.

The shared timeline schedule contains configured milestone and assessment dates,
without a derived `week1` field. Logging start, current week and week count come
from `WeeklyWindows`, independently of the title deadline.

### SystemStatus

```
{ publishing:{ configured:boolean, items:[{key,title}] } }       // configured:false when assessment definitions are invalid
```

This is only the frame: the invitation-resend card, one collapsed publishing card per assessment, and the
committee and assessment-readiness cards. Each card's own checks (`getCoordinatorCommitteeConfiguration_`,
`getCoordinatorReviewConfiguration_`, publishing reads, weekly setup, invitation resend) are separate calls made
by their dashboard modules against hooks the view renders. `getCoordinatorCommitteeConfiguration_` returns structured
`committees:[{number, members:[{name,email}], teams:[string]}]`; the view builds the directory (no server HTML).
Contract tests: `tests/system-status-view.test.cjs` and the System Status cases in `tests/project-schedule.test.cjs`.

### TeamFolders

```
read  API_coordinator_getTeamFolders():
{ configured:boolean,                    // false when the spreadsheet has no single usable parent folder
  baseFolder:{name,url}|null,            // the spreadsheet's folder
  teamDocuments:{exists:boolean, url:string|null},
  total, existing, missing:[teamId], duplicates:[teamId], collisions:[teamId],
  issues:[string], canCreate:boolean }

write API_coordinator_createTeamFolders(cursor):
{ teamDocuments:{url, justCreated:boolean}, created:[teamId], failed:[{teamId,reason}],
  notShared:[{teamId,reason}],           // folders created, but some students of the team could not be given viewer access
  remaining:number, nextCursor:string|null }
```

Layout in Drive: `<spreadsheet's folder>/Team Documents/<year>_<semester>_team_<teamid>`. The name is lowercase, each run of
characters other than `a-z`, `0-9` and `_` becomes one `_`, repeated `_` collapse, and each part is trimmed (`teamFolderName_`).
`Team Documents` is matched by exact name; trashed folders are ignored. Whether a team has a folder is answered from Drive by name,
never from a sheet column. The read never creates anything. The write takes the script lock, creates `Team Documents` if needed, then
up to 25 team folders per call from `cursor` (the last Team ID key handled); it re-reads Drive, skips folders that exist, and is safe to
repeat. Two `Team Documents` folders, duplicate team folders or names that collide are reported and never merged, removed or created.
A new folder is shared at once with the team's students (the e-mail columns of the team's row, each distinct address once) as Drive **viewers of that folder only**, with no notification e-mail; students already on the folder are skipped. A student who cannot be added never undoes the folder: the team is listed in `notShared` with the reason, and the card prints it. Folders that existed before this was introduced were shared once by a temporary function, since deleted.
`findTeamFolder_(teamId, semester)` is the shared server lookup for later features (it never creates anything). The browser asks for
confirmation, naming the parent folder, before the write. Contract tests: `tests/team-folders.test.cjs`, `tests/team-folders-view.test.cjs`.

### TitleDto

Returned by `API_title_get`. Dates are ISO strings. `history` is filled for the coordinator only. `can.*` is the whole of what the view may offer: the server computes it with the same rules as the write path, so a button and its refusal cannot disagree.

```
{ teamId, revision, status (NOT_SUBMITTED|NEEDS_REVIEW|AWAITING_REVIEWER|RETURNED|APPROVED|REOPENED), reopened,
  proposal:{title, problem}, notes, similarityNote,
  approved:{value, title, problem, at, by},
  reopen:{reason, by, at} | null,
  folderUrl,                                         // the team Drive folder, '' when absent
  documents:[{key, label, present, uploadedBy, uploadedAt}],   // read-only: the two fixed files in the team folder; staff only (a student's own card does not carry them)
  history:[{revision, action, actor, at, notes}],    // coordinator only
  can:{ submit, approve, return, reopen, cancel }    // each a Capability }
Capability = { allowed, reason, activity ('title.submit'|'title.resubmit'|null), requirements:[{label, met, reason}] }
```

`requirements` is filled only for a student on its own team, and only when the built-in rules would allow the action; it never carries a `diagnostic`. `documents` lists `{key, label, present, uploadedBy, uploadedAt}` for `work` and `need` (read from the team folder; there is no upload in this system, the files are placed there outside it); a student's own card does not carry `documents`.

### DocumentsDto

Returned by `API_documents_get`. One entry per listed template document (active, in the team template, no name conflict; archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md). Dates are ISO strings. The statuses and error codes are the project's own: a document is `NOT_SUBMITTED`, `NEEDS_REVIEW`, `APPROVED`, `RETURNED`, `REOPENED` or `UNAVAILABLE` (its journal failed validation: `can` is null and only that document is affected). `REJECTED` is an error code, never a status.

```
{ teamId, scannedAt /* the latest team scan time, '' if none */,
  roles:{student, guide, reviewer, coordinator} /* the caller's roles on this team, booleans */,
  documents:[{ documentId, fileName, folder, extension,
    neededFor:[{id /* REVIEW assessment ID */, label}] /* the Reviews whose active `document` rows in ActivityDependencies name this document, in Sequence order; [] = none (or the sheets could not be read). The screen lists the document under each; it gates nothing */,
    status, state /* active|waiting|done, as for titles */, statusText, revision,
    teamChanged /* Yes|No|Unknown|'' (from the team scan, every 2 hours; '' = not checked yet) */, checkedAt, returnedNotes /* the guide's notes when RETURNED */,
    link /* the Drive file, per the rules below; '' otherwise */,
    submittedBy:{name, at, email?} | null,                 // email: guide and coordinator only
    commit:{sha, shortSha, committedBy:{name|null, login, outsideMember}, lastTeamChange:{...}|null} | null,
    evidence:{ folders:[string], files:[{path /* below 2_Evidence */, name, folder, size, state /* COPIED|PENDING|TOO_LARGE */, link /* the Drive file, COPIED (or the earlier copy of a PENDING one) only, else '' */, committedAt}],
               copied, pending /* files waiting to be copied, from the last check; null = unknown (never checked, or the repository could not be read) */, tooLarge, checkedAt /* when pending was last saved, or '' */,
               requirements:[{activity, label /* the Review's label */, folder, minimum, copied, met}] } | null,   // null: the document has no evidence folder
    history:[{revision, action, actor, at, notes}],         // guide and coordinator only
    can:{ submit, approve, return, reopen, check, copyEvidence, checkEvidence } | null }] }  // each a Capability {allowed, reason, activity:null, requirements:[]}
```

`can.check` is allowed for a student when the document may be submitted (`NOT_SUBMITTED`, `RETURNED`, `REOPENED`) but the scan's
`teamChanged` is not `Yes`: the screen offers "Check GitHub now", which runs the live preview (`API_student_previewDocument`) and, when
a team member's change is found, the usual Submit confirmation. Nothing is written by the check.

`evidence` (archive/plans/EVIDENCE-PLAN.md): the files of the document's evidence folders (`EvidenceFolders` sheet) copied from `2_Evidence/<folder>` of the team repository to `evidences/<path>` in the team folder. Every role sees the copied files and the counts. **Loading the screen reads no GitHub:** `pending` and `tooLarge` come from the `EvidenceStatus` sheet, which the team-file scan (from the tree it already reads), Copy evidence and Check for new evidence keep up to date, so they can be up to one scan old; `files` lists the copied files only, and the waiting and too-large files appear after `API_student_checkEvidence`. `can.copyEvidence` is allowed for a student when the document has been submitted and `pending` is not 0 (an unknown count allows it: the copy finds out); `can.checkEvidence` is allowed for a student once the document has been submitted. Their reasons say why not otherwise. `requirements` lists, for every role, the Review requirements (`ActivityEvidences` rows) that use this document's folders and how many files the team has copied against each minimum, so a student can see what a Review will ask for; it is empty when the sheet is absent or unreadable, and rows the gate would refuse (no folder, a minimum that is not a whole number above 0) and the title activities are left out. It is information only: the gate is the activity engine's. A `link` is always one file, never a folder. Dot files and README files are not evidence; the largest file is 25 MB. A Review is gated by the `ActivityEvidences` rows through the activity engine: the requirement appears in the Review's checklist like any other (`label` "Evidence: at least N files in <folder>", never a diagnostic). Contract tests: `tests/document-api.test.cjs`, `tests/evidence.test.cjs`.

Links: a student and the guide see the Drive file's link in every status; a reviewer and the coordinator only while the content is approved (`APPROVED` or `REOPENED`). A student never receives a folder link, and sees names, never e-mail addresses. `submittedBy`, `commit` and the lines are shown to the student, guide and coordinator, and to a reviewer only for approved content. Contract tests: `tests/document-api.test.cjs`, `tests/document-service.test.cjs`.

### StudentCore and StudentProject

The browser loads the student dashboard in two parts: `API_student_getCore` first (it renders the Weeks and Assessments screens and the Team screen's heading and roster), and `API_student_getProject` once, the first time the Title or GitHub screen is shown (both screens draw from that one response), or when a GitHub action refreshes it. `StudentDashboard` below is their union, the shape the page shows once both parts have loaded. The former combined `API_student_getDashboard` was removed after the split was verified live; `tests/student-migration.test.cjs` still freezes the facts of the union for every scenario.

- `StudentCore` = `{teamId, titleApproved, titleStatus, roster, assessments}`; `titleStatus` is one of the TitleDto statuses or `UNAVAILABLE`. A `REOPENED` title opens the Title screen first and shows a notice on every screen.
- `StudentProject` = `{setup, github, title}`.

### StudentDashboard

```
{ teamId, titleApproved:boolean,
  roster:[{name, initials, regno, isMe}],
  setup:{complete:boolean, pendingSteps:[string]},            // complete = GitHub ready and title approved
  github:{ state:'done'|'waiting'|'active'|'locked', text, connected:boolean, captureReady:boolean,
           due:string, statusText, repoUrl,
           members:[{regno, status:'missing'|'joined'|'pending', canConnect:boolean, isMe:boolean}] },  // canConnect: this student, not yet connected; isMe: this student's own row
  title: TitleDto fields (see TitleDto) without `history`, `similarityNote`, `documents` and `folderUrl` (students are not members of the shared drive, so they never get a Drive link), with `can` limited to {submit},
         plus { state:'active'|'waiting'|'done', statusText, due:{date,overdue} },   // independent of GitHub setup; `can.submit` carries the checklist
         // a team whose title history failed validation gets {teamId, status:'UNAVAILABLE', state, statusText, due, can:null}
  assessments:{ reviews:[{key,label}], guideEvaluationLabel } }
```

The view lays the DTO out as five screens (Weeks, Assessments, Title, GitHub, Team) behind a sidebar that becomes a bottom bar on small viewports; the DTO is unchanged. Weekly progress (status card, week list, week detail), assessment results and the GitHub account connection are separate modules that attach to
placeholders in the view (`#studentWeeklyProgress`, `#studentAssessment-<key>`,
`#studentGuideEvaluation`, `#studentGithubProfile`); the GitHub connection uses the endpoints above through the bridge.
Contract tests: `tests/student-migration.test.cjs` (snapshot `tests/invariants/snapshots/student-legacy-facts.json`,
captured from the removed HTML for eight states, with explicit expectations for the removed GitHub title prerequisite; regenerated in the title-revision change for the title card: the Form link is replaced by the in-page title form and document upload, `StudentTitle` in `student-title.js`).

### GuideDashboard

```
{ teams:[{ teamId, title, status:{key,text,tone}, members:[{name,regno}], memberEmails:[string],
           registerNumbers:[string], repoUrl, problem, folderUrl,
           revision, proposal:{title,problem}, canApprove, canReturn, approveBlockedReason, returnedByGuide,
           overdueLogs:number, titleDue:{date,overdue}|null, titleTiming:{state,explanation}|null,
           similarityFlag, notes, reopen:{reason,at}|null,
           approval:{approvedBy, approvedOn:string, timing:{state,explanation,days:number|null}}|null }],   // set once the title has had its first final approval, including while it is reopened
  githubDue:string|null,
  evaluation:{enabled:boolean, notice:string},
  weeks:[{weekId, opensAt, deadlineAt, lateUntil}] }   // epoch ms; consumed by GuideWeekly

GuideGithub   // one team's entry in API_guide_getGithub().teams
{ tone, members:[{name,regno,state:'missing'|'joined'|'pending',
                  timing:{state,explanation,date,daysLate,days:number|null}|null}] }
```

The dashboard has no `github` field. The view treats a team's `github` as `undefined` (placeholder) until
`API_guide_getGithub` returns, then `GuideGithub` or `null` (unavailable). The golden-master test merges both
responses. The title facts come from `TitleLog`: `status.key` is one of `NOT_SUBMITTED`, `NEEDS_REVIEW`, `AWAITING_REVIEWER`,
`RETURNED`, `APPROVED`, `REOPENED` or `UNAVAILABLE` (the team's history failed validation); `title` is the title in effect and
`proposal` the one under review. `revision` is what `API_guide_decideTitle` must send as `expectedRevision`. The approval date and
timing come with the dashboard (they no longer need a second read). `documents` are no longer listed: `folderUrl` opens the team folder.
`guide-legacy-facts.json` was regenerated for these title fields in the title-revision change.

Teams are ordered by title-review priority. `state` is one of `on-time`, `late`, `overdue`, `pending`,
`unknown`; the view maps it to a label and colour. Workflow rejections returned as `{ok:false,message}` by
the rules code reach the browser as `REJECTED` errors. Contract tests: `tests/guide-migration.test.cjs`
(snapshot `tests/invariants/snapshots/guide-legacy-facts.json`, captured from the removed HTML).

## Rules

- Names are camelCase and describe meaning (`repoStatus`), not columns.
- Unknown or empty values are `null`, not `""` or `0`, when the difference matters
  (for example unavailable commit evidence).
- Keep payloads lean; send only what the view renders.
- Reads are safe to retry. Writes are idempotent where possible and are never retried
  automatically.
