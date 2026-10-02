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
| `API_coordinator_getOverview()` / `API_coordinator_getProgress()` | Coordinator | none | `CoordinatorDashboard` (below); overview has `loading:true` | `buildCoordinatorContent`, `loadCoordinatorSection` (removed) |
| `API_coordinator_getActivity()` | Coordinator | none | `{state, week, checkedAt, teams:{<teamId lower-case>:{logs,commits}}, totalTeams, activeTeams}` | `loadAllTeamsWeeklyActivity` (wrapped) |
| `API_coordinator_getSystemStatus()` | Coordinator | none | `SystemStatus` (below) | `loadCoordinatorSystemStatus` (removed) |
| `API_student_getWeekly()` / `API_student_submitWeekly(input)` | Student | input: `{requestId, weekId, workCompleted, guideDiscussion, blockers, nextAction}` | the existing weekly-progress object (`ready, weeks, actions, history, evidence, allWeeks, timezone, checkedAt …`) / `{ok, entryId, weekId, entryStatus, timeliness, firstSubmittedAt, message}` | `loadStudentWeeklyProgress` / `submitWeeklyProgress` called directly |
| `API_guide_getWeekly()` / `API_guide_signWeekly(entryId, status)` | Guide | `status` is `DISCUSSED` or `NOT_DISCUSSED` | `{checkedAt, timezone, weeks, entries, requiredByWeek …}` / `{ok, entryId, status, message}` | `loadGuideWeeklyProgress` / `submitWeeklyGuideSignoff` called directly |
| `API_guide_getEvaluation(teamId, register)` | Guide | register optional | the existing `loadGuideEvaluation` object (`roster, student, statuses, config, evaluation, repository, revision, token, overdue`) | `loadGuideEvaluation` called directly |
| `API_guide_saveEvaluationDraft(input)` / `API_guide_submitEvaluation(input)` | Guide | `{team, student, revision, token, scores, requestId}`; the request ID makes a retry safe | `{status, …}` as before | `saveGuideEvaluationDraft` / `submitGuideEvaluation` called directly |
| `API_student_getReviewResult(key)` / `API_student_getGuideResult()` | Student | assessment key | the published result (`config, identity, total, weighted, scores, assessment, underCorrection`) or `null` when nothing is published | `loadPublishedReviewEvaluation` / `loadPublishedGuideEvaluation` called directly |
| `API_student_getDashboard()` | Student | none | `StudentDashboard` (below) | `buildStudentContent` (removed) |
| `API_guide_getDashboard()` | Guide | none | `GuideDashboard` (below) | `buildDashboardContent` (removed) |
| `API_guide_submitDecision(teamId, decision, notes, editedTitle)` | Guide | `decision` is `Approved` or `Rejected`; notes required for `Rejected` | `{message}` | `decide` in the old client |
| `API_reviewer_getDashboard()` | Reviewer | none | `ReviewerDashboard` (below) | `buildReviewerContent` (removed) |
| `API_reviewer_submitDecision(teamId, decision, notes)` | Reviewer | `decision` is `Approved` or `Revise`; notes required for `Revise` | `{message}` | `reviewerDecide` in the old client |

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

The overview renders first; progress and weekly activity are requested at the same time and settle independently
(each failure is isolated, with its own retry). Percentages, tones and badge labels are derived in the view.
The team drawer is still driven by DashboardUI. Contract tests: `tests/coordinator-migration.test.cjs`
(snapshot `tests/invariants/snapshots/coordinator-legacy-facts.json`, captured from the removed HTML for the overview,
progress and no-reviews cases).

### SystemStatus

```
{ github:{ coordUsername:string, reposWithAccess:number, totalRepos:number },
  publishing:{ configured:boolean, items:[{key,title}] } }       // configured:false when assessment definitions are invalid
```

This is only the frame: GitHub access, the invitation-resend card, one collapsed publishing card per assessment, and the
committee and assessment-readiness cards. Each card's own checks (`getCoordinatorCommitteeConfiguration`,
`getCoordinatorReviewConfiguration`, publishing reads, weekly setup, invitation resend, GitHub sync) are separate calls made
by their dashboard modules against hooks the view renders. `getCoordinatorCommitteeConfiguration` returns structured
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
`#studentGuideEvaluation`, `#studentGithubProfile`); they still call the server directly and are migrated separately.
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
