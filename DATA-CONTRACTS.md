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
| `API_coordinator_getHealth()` | Coordinator | none | `{needsAttention, partial, teams:{<teamId>:{health, pendingDeadlines}}, deadlinePills}` | the health and deadline read |
| `API_coordinator_getActivity()` | Coordinator | none | `{state (`active`, `between` weeks, `not-started`, `ended`, `unavailable`), week, checkedAt, teams:{<teamId lower-case>:{logs,commits}}, totalTeams, activeTeams}` | `loadAllTeamsWeeklyActivity_` (wrapped) |
| `API_coordinator_getSystemStatus()` | Coordinator | none | `SystemStatus` (below) | `loadCoordinatorSystemStatus` (removed) |
| `API_student_getWeekly()` / `API_student_submitWeekly(input)` | Student | input: `{requestId, weekId, workCompleted, guideDiscussion, blockers, nextAction}` | the existing weekly-progress object (`ready, weeks, actions, history, evidence, allWeeks, timezone, checkedAt …`) / `{ok, entryId, weekId, entryStatus, timeliness, firstSubmittedAt, message}` | `loadStudentWeeklyProgress_` / `submitWeeklyProgress_` called directly |
| `API_guide_getWeekly()` / `API_guide_signWeekly(entryId, status)` | Guide | `status` is `DISCUSSED` or `NOT_DISCUSSED` | `{checkedAt, timezone, weeks, entries, requiredByWeek …}` / `{ok, entryId, status, message}` | `loadGuideWeeklyProgress_` / `submitWeeklyGuideSignoff_` called directly |
| `API_guide_getEvaluation(teamId, register)` | Guide | register optional | the existing `loadGuideEvaluation_` object (`roster, student, statuses, config, evaluation, repository, revision, token, overdue`) | `loadGuideEvaluation_` called directly |
| `API_guide_saveEvaluationDraft(input)` / `API_guide_submitEvaluation(input)` | Guide | `{team, student, revision, token, scores, requestId}`; the request ID makes a retry safe | `{status, …}` as before | `saveGuideEvaluationDraft_` / `submitGuideEvaluation_` called directly |
| `API_student_getReviewResult(key)` / `API_student_getGuideResult()` | Student | assessment key | the published result (`config, identity, total, weighted, scores, assessment, underCorrection`) or `null` when nothing is published | `loadPublishedReviewEvaluation_` / `loadPublishedGuideEvaluation_` called directly |
| `API_student_getDashboard()` | Student | none | `StudentDashboard` (below) | `buildStudentContent` (removed) |
| `API_guide_getDashboard()` | Guide | none | `GuideDashboard` (below) | `buildDashboardContent` (removed) |
| `API_guide_submitDecision(teamId, decision, notes, editedTitle)` | Guide | `decision` is `Approved` or `Rejected`; notes required for `Rejected` | `{message}` | `decide` in the old client |
| `API_reviewer_getDashboard()` | Reviewer | none | `ReviewerDashboard` (below) | `buildReviewerContent` (removed) |
| `API_reviewer_submitDecision(teamId, decision, notes)` | Reviewer | `decision` is `Approved` or `Revise`; notes required for `Revise` | `{message}` | `reviewerDecide` in the old client |
| `API_review_getEvaluation(teamId, assessmentId)` | Reviewer | assessment key such as `review1` | the existing `loadReviewEvaluation_` object (details, roster, config, evaluation, statuses, revision, token) | `loadReviewEvaluation_` called directly |
| `API_review_save(kind, input)` | Reviewer | `kind` is `draft`, `submit`, `absence`, `makeupDraft` or `makeupSubmit`; `input` is the existing request object | the existing result of `saveReviewEvaluationDraft_`, `submitReviewEvaluation_`, `recordReviewAbsence_`, `saveReviewMakeupDraft_` or `submitReviewMakeup_`; `{ok:false}` results become `REJECTED` | those functions called directly |
| `API_coordinator_getWeeklySetup()` / `API_coordinator_setupWeekly(kind)` | Coordinator | `kind` is `storage` or `triggers` | the existing readiness report (`storageReady, triggerReady, canSetupStorage, canSetupTriggers, issues`) / the existing setup result | `getWeeklyProgressPhase2Readiness_` / `setupWeeklyProgressPhase2Storage` / `setupWeeklyProgressPhase2Triggers` called directly |
| `API_coordinator_getCommitteeConfiguration()` / `API_coordinator_getReviewConfiguration()` | Coordinator | none | the existing readiness reports (`valid, state, summary, issues, links, checkedAt`, plus `committees` or `storage`) | `getCoordinatorCommitteeConfiguration_` / `getCoordinatorReviewConfiguration_` called directly |
| `API_coordinator_createDefinitions()` / `API_coordinator_prepareStorage()` | Coordinator | none | `{created}` / `{journals:[{label,journal,created,initialized}]}` | `createAssessmentDefinitions_` / `prepareReviewAssessmentStorage_` called directly |
| `API_coordinator_syncGithub()` / `API_coordinator_resendInvitations(cursor)` | Coordinator | `cursor` is `''` for the first batch, then the returned `nextCursor` | the existing sync summary / `{results, nextCursor, stopped}` | `syncCoordinatorGithubAccess_` / `resendExpiredStudentInvitations_` called directly |
| `API_publishing_get(assessmentId)` / `API_publishing_run(method, input)` | Coordinator | `method` is `publishInternalAssessment_` or `reopenInternalAssessment_`; `input` carries `requestId`, so a retry is safe | the existing publication report (`ready, config, teams, error`) / the existing publish or reopen result | `loadInternalAssessmentPublishing_` / `publishInternalAssessment_` / `reopenInternalAssessment_` called directly |
| `API_student_previewGithub(profileUrl)` / `API_student_confirmGithub(token)` / `API_student_completeGithubSetup()` | Student | profile URL; the signed `token` returned by the preview | `{token, account:{githubId, username, displayName, profileUrl, avatarUrl}}` / `{ok, message}` / `{message}` | `previewStudentGithubAccount_` / `confirmStudentGithubAccount_` / `completeStudentGithubSetup_` called directly |
| `API_shared_getTimeline()` / `API_shared_getRubrics()` | Any dashboard role | none | the existing project timeline (`schedule, milestones …`) / shared rubrics (`assessments …`) | `loadSharedProjectTimeline_` / `loadSharedRubrics_` called directly |
| `API_coordinator_getTeamDrawer(teamId, section)` | Coordinator | `section` is `basic`, `progress` or `activity` | the existing team detail for that section, rendered by `TeamDrawerView` (`team-drawer-view.js`) | `loadCoordinatorDrawerSection_` called directly |

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
           titleApproval:{ status:{tone:'neutral'|'success'|'warning', label}, canDecide:boolean,
                           submittedTitle, similarityFlag, documents:[{label,url}], reviewerNotes },
           reviews:[{key, enabled:boolean, actionLabel, note}] }] }
```

Only teams in the reviewer's committees are returned. `tone` is semantic; the view maps it to colours.
Contract tests: `tests/reviewer-migration.test.cjs` (snapshots in `tests/invariants/snapshots/reviewer-*.json`).

### CoordinatorDashboard

```
{ loading:boolean,                        // true for the overview stage: assessment values are not read yet
  stats:{ total, titleApproved, reposReady, needsAttention,
          guideEvaluation:{available,completed}|null,
          reviews:[{key,label,completed:number|null,unavailable:number,known:boolean}] },
  reviewColumns:[{key,label}], reviewConfigurationError:boolean, partial:boolean,
  teams:[{ teamId, guide, title, titleStatus, repoStatus:'ready'|'pending', githubMessage, githubTiming, repoUrl,
           registerNumbers:[string], emailRecipients:[string], health:'ontrack'|'monitor'|'attention'|'loading',
           pendingDeadlines:[key], guideEvaluation:string, reviews:{<key>:'Completed'|'Pending'|'Unavailable'|'Loading…'} }],
  deadlinePills:[{key,label,count,due:string,overdue:boolean}] }
```

The overview renders first. Then one `getReviewProgress` per `reviewColumns` entry, `getGuideProgress`, `getHealth` and weekly
activity run in parallel and settle independently: each fills only its own card and tracker column, and a failure or
timeout is isolated to that section, with its own message and Retry. Percentages, tones and badge labels are derived in the view.
The team drawer is rendered by `TeamDrawerView` (three sections read independently; each fails and retries on its own); DashboardUI only opens, closes and focuses it. Contract tests: `tests/coordinator-migration.test.cjs`
(snapshot `tests/invariants/snapshots/coordinator-legacy-facts.json`, captured from the removed HTML for the overview,
progress and no-reviews cases).

### SystemStatus

```
{ github:{ coordUsername:string, reposWithAccess:number, totalRepos:number },
  publishing:{ configured:boolean, items:[{key,title}] } }       // configured:false when assessment definitions are invalid
```

This is only the frame: GitHub access, the invitation-resend card, one collapsed publishing card per assessment, and the
committee and assessment-readiness cards. Each card's own checks (`getCoordinatorCommitteeConfiguration_`,
`getCoordinatorReviewConfiguration_`, publishing reads, weekly setup, invitation resend, GitHub sync) are separate calls made
by their dashboard modules against hooks the view renders. `getCoordinatorCommitteeConfiguration_` returns structured
`committees:[{number, members:[{name,email}], teams:[string]}]`; the view builds the directory (no server HTML).
Contract tests: `tests/system-status-view.test.cjs` and the System Status cases in `tests/project-schedule.test.cjs`.

### StudentDashboard

```
{ teamId, titleApproved:boolean,
  roster:[{name, initials, regno, isMe}],
  setup:{complete:boolean, pendingSteps:[string]},            // complete = GitHub ready and title approved
  github:{ state:'done'|'waiting'|'active'|'locked', text, connected:boolean, captureReady:boolean,
           due:string, statusText, repoUrl,
           members:[{regno, status:'missing'|'joined'|'pending', canConnect:boolean}] },  // canConnect: this student, not yet connected
  title:{ locked:boolean, state:'locked'|'active'|'waiting'|'done', statusText, currentTitle, note,
          intake:{url,label}|null, due:{date,overdue}|null },
  assessments:{ reviews:[{key,label}], guideEvaluationLabel } }
```

Weekly progress, recent logs, assessment results and the GitHub account connection are separate modules that attach to
placeholders in the view (`#studentWeeklyProgress`, `#studentRecentActivity`, `#studentAssessment-<key>`,
`#studentGuideEvaluation`, `#studentGithubProfile`); the GitHub connection uses the endpoints above through the bridge.
Contract tests: `tests/student-migration.test.cjs` (snapshot `tests/invariants/snapshots/student-legacy-facts.json`,
captured from the removed HTML for eight states).

### GuideDashboard

```
{ teams:[{ teamId, title, status:{key,text,tone}, members:[{name,regno}], memberEmails:[string],
           registerNumbers:[string], repoUrl, problem, documents:[{label,url}], lastDocumentSubmission,
           overdueLogs:number, titleDue:{date,overdue}|null, titleTiming:{state,explanation}|null,
           similarityFlag, guideNotes, reviewerNotes,
           approval:{approvedBy, approvedOn, timing:{state,explanation}}|null,          // APPROVED only
           github:{ tone, members:[{name,regno,state:'missing'|'joined'|'pending',
                    timing:{state,explanation,date,daysLate}|null}] }|null }],          // null = status unavailable
  githubDue:string|null,
  evaluation:{enabled:boolean, notice:string},
  weeks:[{weekId, opensAt, deadlineAt}] }       // epoch ms; consumed by GuideWeekly
```

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
