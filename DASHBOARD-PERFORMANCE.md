# Dashboard loading and freshness

## Progressive coordinator loading

The coordinator role request now returns an authorized skeleton shell, without
reading roster, committee marks or historical logs. The browser starts four
independent requests after inserting that shell:

- Overview: basic counts, GitHub access, committee directory and searchable teams.
  It does not read marks or historical logs. Review and health values show Loading
  and health filters stay disabled until progress arrives.
- Progress: assessment counts, completion cards, deadline filters and team health.
  These share one marks evaluation so each committee review tab is read once per
  progress request. Historical log calculations use the first three fields of full-width rows, and each
  team's weekly summary is calculated once for both health and deadline events.
- Weekly activity: starts without waiting for the tracker. Its result is retained
  for this page and applied when either overview or progress renders the tracker.
- Assessment readiness: validates configuration independently of the above.

The timeline remains independent. Related cards intentionally share a request;
one request per card would duplicate authorization and spreadsheet reads. Overview
and progress do each read their own current team snapshot; no client-provided
assessment or roster data is trusted by the server.

Non-tracker content starts hidden behind individual animated card placeholders.
Each placeholder is replaced by its complete card after its dependencies finish:
summary cards wait for progress and weekly activity, completion/assessment cards
wait for progress, GitHub waits for overview, and the committee card waits for
overview plus configuration validation. Application CSS is inline in the page
head; reveal also waits for `document.fonts.ready`. Finished error states remain
visible with retry controls instead of leaving cards permanently loading. The
Team Tracker alone retains progressive skeletons and early interaction. Routine
section-loading text is suppressed; error messages and Retry remain visible.

Overview and progress have separate Retry controls, including partial assessment
failures. A late overview cannot replace completed progress. Callbacks from an old
shell are ignored. Search text, valid filters and page selection survive progress
updates. Only the current ten tracker rows stay attached to the table; all rows
remain available in memory for filtering and weekly-activity updates.

Browser `coordinator_core_render` now measures shell arrival only. Use
`coordinator_section_render` (overview/progress) with server `coordinator_request`
logs to assess useful-data latency. Parallel loading improves time to usable
content; it does not guarantee shorter total time under Google service contention.
The complete tracker HTML is still transferred, and marks are still read live.

After uploading, publish a new Apps Script deployment version and reload. Check
overview while progress is pending, activity both before/after progress, search
and pagination during loading, and section retries on a test copy. Automated tests
cover these ordering, isolation and pagination cases with mocked browser/services;
real browser appearance and deployed latency require live verification.

## Coordinator hardening and deployment checks

Coordinator data, drawer and refresh endpoints authorize the active user on every
request and share request-local reads. Bulk and team review-completion collectors
are internal functions ending in `_`; all repository callers use those names.
This does not constitute an authorization audit of unrelated application endpoints.

Review completion includes `available`. Missing links, missing tabs and failed
reads are unavailable; a successfully read empty tab is available but incomplete.
Coordinator summaries label partial counts, tracker/drawer cells show Unavailable,
and unavailable reviews do not generate overdue alerts. Other known overdue tasks
still generate attention. Use the progress Retry control to retry failed assessment reads.
No persistent marks cache was introduced.

Drawer requests use a sequence number so old success/failure callbacks cannot
overwrite a newer selection or a closed drawer.

The drawer now loads three independently authorized batches: basic project,
guide, students, committee and repository information; assessment/health; and
weekly activity. Each visible section starts with a labeled skeleton. Basic
details never read marks or activity, progress skips roster and commits, and
activity skips roster and marks. Related basic sections share one request to
reuse reads. Progress reads historical logs once; the activity request has its
own scoped log read. No persistent cache or client-provided team facts are used.
Each failed batch can be retried without reloading successful sections. Partial
review availability also offers Retry. Duplicate pending retries are suppressed,
and section callbacks check both selection generation and target identity.
Server `coordinator_request` logs distinguish drawer-basic, drawer-progress and
drawer-activity. Live service latency and visual appearance still require a
deployed browser check; the local suite verifies request isolation and ordering.

Server execution logs emit `coordinator_request` with operation, durationMs and
success, without user identifiers or assessment values. Browser console logs emit
`coordinator_core_render` with request-to-HTML-insertion duration and HTML character
count. This timing excludes deferred activity/readiness and is not a paint metric.

Before release, upload to the intended Apps Script project and test its test
deployment with coordinator and PD accounts. Confirm a non-coordinator cannot call
the three coordinator endpoints, open two team drawers rapidly, and use a test
copy with an inaccessible review sheet to verify Unavailable and partial counts.
Compare several cold/warm core and drawer requests using realistic data volumes.
Do not alter production sheet permissions to simulate a failure.

After checks, update the versioned web-app deployment to the tested version.
Keep the prior deployment version recorded for rollback. Local tests cannot verify
Google account identity, live service latency or deployment permissions.

Role tabs load on demand (sequential preloading exists but ships disabled; see below), and reuse their rendered content while the page remains
open. Each server request authorizes the requested role again.

## Shared timeline UI

The shell contains one timeline outside the role panels. Its data request starts
in parallel with the first role request; no dashboard awaits it. It sends dates
and week metadata only, with no new UI libraries. Duplicate callers share the
same pending promise and successful result for the lifetime of the page. A failed
request can be retried independently.

Browser consumers can read `DashboardSchedule.current` (initially `null`) or await
`DashboardSchedule.ready()`. The published snapshot is immutable. Server-side
weekly logs and attention calculations continue using `getProjectSchedule_()`;
they do not trust or depend on browser data. Refresh the page to obtain a new
timeline snapshot after midnight or a Config edit.

The coordinator's Team Completion Progress remains a separate view of actual
completion counts. Timeline markers indicate scheduled dates, not completed work.

## Fresh data across page reloads

No application data is cached across server requests or page reloads. The shared
CacheService schedule and rubric caches have been removed. Each new request reads
its required data from the sheets; repeated reads within that execution can reuse
its local snapshot. Config writes invalidate the relevant execution-local values.

Loaded tabs and the shared timeline retain their current page-session behavior:
switching tabs reuses loaded content, and sequential preloading remains enabled.
Reloading the page discards that browser state and fetches fresh data. System
Status also retains its explicit Refresh control.

## Lifecycle and assessment configuration

`Milestones` contains only non-assessment lifecycle events. Its headers remain
`Milestone ID`, `Milestone Name`, `Due Date`, `Graded By`, `Weight (%)`.
Graded By must be `Not Applicable`, with blank or zero weight. Graded rows are
rejected with a configuration message; they never discover or configure assessments.
Required schedule IDs remain `formation`, `start`, `title`, and `report`.
Logging starts on the first Monday strictly after title approval and ends on report
submission. Dates accept Sheets date cells, DD/MM/YYYY or YYYY-MM-DD.

`AssessmentDefinitions` is the sole authority for graded assessments. Coordinator
System Status can create its ten-column schema without academic rows. The
Coordinator explicitly configures instances using the direct sheet link, validates,
then provisions journals through the separate storage action. Reviews are ordered
by Sequence; no review count or numbered implementation is configured in code.
Guide Evaluation requires an explicit `guide_eval` / `GUIDE_EVALUATION` definition.

The timeline composes non-assessment events and configured assessments for display
by due date, using Sequence to order assessments on the same date, then adds weekly
logging start. IDs cannot collide. Neither source overrides the other, and no
duplicate Review row is required in Milestones. Assessment opening dates are supplied
directly to timeline metadata. See [Assessment configuration](ASSESSMENT-CONFIGURATION.md).

Rubrics uses `Assessment ID` to match `AssessmentDefinitions`:

`Assessment ID | Order | PI | Criterion | CO | Max Marks | Type | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 | Level 5`

Maintain criteria directly in the existing Rubrics sheet, using the referenced
rubric IDs. Guide criteria require all six descriptors and Individual type.
There is no rubric creation/reset endpoint, framework catalog, or setup card.
The application reads and validates sheet definitions without supplying defaults.
Existing Rubrics contents and evaluation records are preserved. REVIEW instances
come from AssessmentDefinitions. The shared evaluation drawer persists revisions
in definition-driven journals in the main spreadsheet. Coordinator setup creates
or initializes missing journals; it does not rewrite existing assessment data.
See [Review evaluation](REVIEW-EVALUATION.md) for the current setup contract.

Each new request reads current definitions; only execution-local reuse and the
existing browser tab reuse remain. Run `npm test` for schema, date, rubric,
review completion, provisioning, guide workflow, and tab-loading regressions.

## Request-local reuse

Weekly activity lives in `weekly-activity.js`. Browser callers can independently
invoke `loadStudentWeeklyActivity(email)`, `loadTeamWeeklyActivity(teamId)`, or
`loadAllTeamsWeeklyActivity_()` through `google.script.run`. Each endpoint authorizes
its requested scope. Student access is limited to their own individual activity
and their team's totals; assigned guides/reviewers and coordinators have scoped
staff access. Only coordinators/PD can request every team.

No scoped endpoint calls another. All-team loading reads full-width log and commit
rows once and aggregates in one pass. Team/student requests use a matching-column
search and read matching records in a bounded range; Sheets still scans to find
matches, and interleaved records may span a large range. These are not indexed
database queries. No locks or persistent activity caches are used.

The coordinator's activity column and Active This Week summary arrive in a separate
batch request after the dashboard renders. Failed requests expose Retry. Inactive
or invalid schedules show unavailable/not-started/ended states instead of zeroes.
Historical logs still load for deadline/health evaluation in the core dashboard.
Student commit attribution uses the latest submitted GitHub username per email
within the team; absent or ambiguous mappings return null, not a fabricated zero.
Counts represent stored commit records, not unique SHAs (the current collector
does not store a SHA). Freshness also depends on the commit-import schedule.

Read-only shell and role endpoints opt into `withDashboardRead_()`.
Authorization and rendering reuse sheet rows within that scope. The scope is
released in `finally`, including on errors. Write workflows retain live row reads.
Spreadsheet/sheet handles and column maps are reused within an execution.

Student log and username lookups batch matching records into one full-width rectangular
read instead of reading each matching row separately. Only matching rows are
returned; intervening rows in the rectangle are discarded.

## Verification

Run `npm test`. Tests cover schedule boundaries, fresh reads across requests and execution-local invalidation,
corruption/outages, row-read reuse, batched matches, and authorization revocation
between requests. These are local service-mock tests; production latency must be
measured against the deployed spreadsheet and Apps Script service.


## Sequential tab preloading and measurements

The first role starts immediately. Remaining roles preload sequentially in DOM
tab order after non-utility dashboard RPCs settle, with a 750 ms idle delay.
Each role initializes its full initial content, including Coordinator overview,
progress and weekly activity, and Student marks, before the next role starts.
Requests within a role retain their existing concurrency. Drawers and administrative
actions remain user-triggered. Background rendering does not select a tab or move focus.

System Status starts alongside the first role, if available. This utility request
and callback-triggered follow-up reads do not block the role sequence or reset its
idle timer.

Clicking an unloaded tab starts its request immediately; selecting a pending tab
reuses its request. The remaining role queue survives tab changes and resumes in
displayed order. Each role is attempted automatically at most once per page session;
failures advance the queue and remain manually retryable. Hidden pages and disabled
preloading pause new background work, resuming when eligible. In-flight requests
finish normally. Preloading adds work for tabs never visited.

Existing role authorization is unchanged. The timeline continues to share its
pending promise and immutable result; protected role datasets are not combined
into a cross-role client cache.
Existing mutation refresh paths remain unchanged; rendered tabs retain their
existing page-session freshness behavior.

Browser developer console:

```js
DashboardPerformance.setPreloading(false); // Baseline: run before first preload
DashboardPerformance.setPreloading(true);  // Resume sequential preloading
console.table(DashboardPerformance.snapshot());
```

For repeatable comparisons, temporarily set the initial `preloading` value to
false in a test deployment for the baseline, then compare with true using the
same accounts, data and tab journeys. Refresh between runs; include single-tab
visits, multiple-role visits, repeated reloads and concurrent sessions.
Report median/p95 timings, request counts and failures for each scenario.

Diagnostics retain the most recent 300 events in browser memory, contain no
user records, and send no telemetry RPCs. `request` measures round-trip plus
callback processing time, not isolated server execution. `tab_core_ready`
measures selection-to-core-HTML completion (zero for reused content); it does
not claim that Coordinator sections or Student marks are ready or that the
browser has painted. `role_core_render`, `tab_selected`, and `preload_started`
identify background work and cache reuse. Count prefetched roles subsequently
selected to assess usefulness. Match RPC methods with Apps Script execution
logs for server durations/errors; these browser events do not measure sheet
reads or remaining quotas. No live performance improvement is claimed from
local tests alone.

### Coordinator server phase timings

Coordinator section responses now include `timings`, also logged server-side as
`coordinator_phases`. They measure column lookup, status/roster/committee reads,
repository mapping, historical logs, schedule, review definitions, review
completion, remaining aggregation work, and panel rendering. The browser adds
these as `server_phase` events without extra server calls. No identifiers or
sheet contents are included. A caught review failure records `ok: false` even
when the section returns partial content successfully.

After deploying, refresh, open Coordinator and wait for its sections, then run:

```js
console.table(DashboardPerformance.snapshot()
  .filter(e => e.event === 'server_phase' && e.section === 'progress')
  .sort((a, b) => b.durationMs - a.durationMs));
```

Repeat with preloading disabled to compare. Phase times exclude authorization,
Apps Script startup/queueing, transport and browser work. They measure elapsed
operations, not precise sheet-call counts; cached reads may take zero milliseconds.
`aggregation_and_other` includes otherwise uninstrumented work. A fatal request
failure may have only the existing `coordinator_request` server log; completed
phase details are returned only when the section response succeeds.

### Shared reads and detailed review timing

Read-only dashboard scopes now retain headers alongside their row snapshot.
Column maps and repository mapping reuse that snapshot instead of requesting
TeamStatus headers and rows again. Outside those scopes, row reads remain live.
Repository lookups now use TeamStatus exclusively. No persistent marks
cache is introduced. A column-map phase can now include the initial full sheet
read, so compare combined column/row totals across deployments, not either alone.

Review completion includes aggregated child timings: `review_detail_rubrics`,
`review_detail_open`, `review_detail_read`, and `review_detail_evaluate`. Their
`calls` field counts timed operations; read calls include missing-tab attempts,
not just successful getValues operations. Child durations are already included
in `review_completion`: do not add them again when totaling server time. They
contain no committee or spreadsheet identifiers. Use the same progress-phase
console command above and compare repeated runs with the previous measurements.

Further drill-down timings are available in the same progress table:
`review_read_lookup`, `review_read_row_count`, `review_read_column_count`, and
`review_read_values` split the review-tab read operation. Missing tabs count as
lookup attempts but do not perform dimension or value reads. Failures propagate
through the same existing partial-data handling and mark the affected timings
unsuccessful. `repository_detail_total` measures the TeamStatus repository lookup;
the former repository fallback phases have been removed.
These are nested diagnostics: review read children are included in
`review_detail_read`, and all repository details are included in `repository_map`.
Do not sum parent and child durations. No persistent caching is introduced.

## Guide server phase timings

`API_guide_getDashboard`, `API_guide_getWeekly` and `API_guide_getEvaluation` log one
`guide_phases` line per request to the Apps Script execution log:
`{event, operation: dashboard|weekly|evaluation, totalMs, timings:[{phase, durationMs, success, count?}]}`.
The response payload is unchanged. Phases contain names and durations only.

- dashboard: `access`, `team_status_read`, `repository_map`, `schedule`, `log_entries_read`,
  `team_log_summaries`, `hub_registry`, `intake_history`, `dto_total` (includes `weekly_windows`),
  `teams` (count only).
- github (`API_guide_getGithub`, read after the dashboard renders): `access`, `github_setup`. Live GitHub
  calls live here so they never delay first paint.
- weekly: `access`, `setup_and_signoffs`, `log_entries_read`, `entries_and_evidence` (includes
  `evidence_reads`, whose `count` is the number of per-student evidence sources built),
  `weekly_windows`, `eligibility_read`.
- evaluation: `access`, `evaluation_load`.

`dto_total` and `entries_and_evidence` contain their nested phases; do not add parent and child
durations. Measure by opening the Guide dashboard on the deployed web app (cold, then warm), then read
Executions in the Apps Script project and filter on `guide_phases`. Record p50/p95 for dashboard, weekly
and the per-team evaluation calls with the same account and data before changing anything further.

## Coordinator System Status tab

System Status is shown only when the shell includes the Coordinator role. Its
`loadCoordinatorSystemStatus` endpoint independently authorizes the current user
before reading data. GitHub access/sync, the committee directory, assessment
readiness, and assessment storage initialization live together in this tab. The Coordinator
progress dashboard retains summaries, assessments, completion, and the tracker.

System Status loads on first click, or once in the background alongside the first
role, independently of role loading.
Automatic loading respects page visibility and
`DashboardPerformance.setPreloading(false)`. It does not require opening the
Coordinator role first. Failed background attempts do not retry automatically;
opening the tab or selecting Refresh retries. Loaded content is reused.

Refresh keeps old content on failure and disables its action buttons during
replacement. Refresh is deferred by an explanatory message while any tracked
operation is running; the user can retry once it finishes. This prevents refresh
from replacing controls during GitHub sync, configuration checks or storage initialization.
Configuration is rechecked after each successful status load. Existing action
endpoints retain their own authorization and configuration checks.

The status endpoint reads only operational status/committee/repository/config
inputs; it does not read marks, roster or historical activity. Coordinator overview
no longer renders system cards or initiates configuration checks. Progress still
reads committee assignments as required by review completion. This separation
improves loading priority and organization; assessment journals still require reads.
Tests cover tab visibility, server authorization, deferred loading, click deduping,
retry, and preservation of loaded status content on refresh failure.

### Full-width review reads

Review reads validate required rubric columns and fetch populated rows from
column A through the last used column with `readSheetRows_()`. Extra columns are
retained in the record but do not change which rubric fields are scored.
Empty/header-only behavior, header validation, and live marks evaluation remain
unchanged. This prioritizes complete records; wider sheets transfer more data.
Timings include `review_read_row_count`, `review_read_column_count`, and
`review_read_values`.

No cross-request data cache is used. Existing request-local reuse, page-session
loaded tabs, sequential preloading, and System Status behavior remain intact.

## Coordinator tracking cards

Tracking is displayed only in the compact summary cards: Total Teams, Repositories
Ready, Title Approved, Active This Week, each configured Review Completed,
and Need Attention. Review cards retain unavailable-data indicators. Skeleton
counts follow the configured review count. The separate Team Progress and
Assessment Progress panels are not rendered. The team tracker follows the cards.
System Status, tab loading, live reads on page reload and current-page reuse
remain unchanged.

## Guide evaluation

Guide Evaluation is available from each guide team card, with per-student draft,
submission and coordinator-controlled publication/reopening. It uses live
Rubrics/GuideEvaluations reads; no cross-request cache was added. Coordinator
progress includes a completion card and tracker column. System Status exposes
setup/configuration errors and submission management. See GUIDE-EVALUATION.md
for the scoring policy, setup routine, endpoint contracts and live rollout checks.

The read-only **System Status → Rubrics** card checks that the tab exists and
contains valid criteria for every registered graded assessment, including Guide
Evaluation. It shows a green Configured pill or an amber Not configured
pill with the missing/invalid configuration explained. Refresh System Status to
read sheet changes. This card never creates or modifies rubric definitions.
