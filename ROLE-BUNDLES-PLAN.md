# Role-specific script bundles: plan

Status: agreed plan, not started. Reviewed by Claude and Codex.

## Goal

Send each user only the browser modules their roles need. Shared reading and generic UI stay common;
domain actions are role-specific. Workflow, academic rules, authorization and spreadsheet data do not change.

## Background

### doGet timing (Executions, 6 Oct 2026)

| Run | Version | doGet |
|---|---|---|
| `?probe=empty` (static `<p>ok</p>`, no reads) | 177 | 2.96 s |
| Normal dashboard (first run after deploy) | 178 | 4.42 s |

About 3 s was observed for an empty page (one sample each). Treat it as a baseline, not a proven fixed
cost; repeat the probe on one version to confirm the range. Apps Script also loads every
server file (62 files, ~810 KB) on every execution. The browser side is what we control: every user
currently receives every role's script.

### Measured page script

The assembled script is 409 KB of JavaScript, plus 35 KB of CSS (`tailwind-styles.html`).

| Group | Modules (KB) | Total |
|---|---|---|
| Common | `DashboardUI` 56, `DataBridge` 5, `SharedTimelineView` 5.5, `SharedRubricsView` 5.3, bootstrap 0.7 | ~73 KB |
| Student | `StudentWeekly` 32, `StudentView` 17, `StudentGithub` 7, `StudentResults` 6 | ~61 KB |
| Guide | `GuideWeekly` 32, `GuideView` 31, `GuideEvaluation` 10 | ~73 KB |
| Reviewer | Review marking drawer incl. review-policy functions ~77, `ReviewerView` 14 | ~91 KB |
| Coordinator | `CoordinatorView` 34, `InternalAssessmentPublishing` 23, `SystemStatusActions` 22, `SystemStatusView` 19, `TeamDrawerView` 7.6, `WeeklyPhase2Setup` ~5 | ~110 KB |

Estimated single-role script: student ~134 KB, guide ~146 KB, reviewer ~165 KB, coordinator ~183 KB
(55–67% smaller). Source size is not transfer size or startup time; Stage 0 measures the real effect.

## Findings the plan must handle

1. **The shell holds role-specific actions.** `DashboardUI` (sent to everyone) contains the System Status
   loader and state, nine `SystemStatusActions` wrappers, `focusCoordinatorTeam`, six student wrappers,
   `openReviewerMarks`, and coordinator endpoint names in `dashboardRun`.
2. **The role registry is eager.** `dashboard-client-scripts.js:423` builds
   `{ reviewer: ReviewerView, guide: GuideView, student: StudentView, coord: CoordinatorView }` when the
   script runs; any missing view throws.
3. **`WeeklyPhase2Setup` travels with Guide code.** `guide-weekly-client.js:418` emits it with
   `GuideWeekly`, but `system-status-actions.js:188` uses it for coordinator setup.
4. **The Review drawer depends on publishing.** `ReviewEvaluations.admin()`
   (`review-evaluation-client.js:746`) calls `InternalAssessmentPublishing`. It has no caller; remove it.
5. **`typeof` guards hide broken bundles.** `typeof GuideWeekly` (line 238) and `typeof WeeklyPhase2Setup`
   skip silently, and `typeof` on a `const` in its temporal dead zone throws anyway.
6. **Team drawer and assessment history are coordinator-only.** Only `CoordinatorView` opens the team
   drawer; only publishing uses `renderAssessmentHistory`.
7. **`dashboardRun` classification is scheduling logic.** Lines 206–222 put
   `API_coordinator_getSystemStatus` and `API_coordinator_getWeeklySetup` in a utility lane that does not
   block preloading, and callbacks inherit that context.
8. **No test builds the real page script.** `tests/dashboard-loading.test.cjs:195` replaces the
   serializers with `''`.
9. **Review-policy functions are frozen academic rules.** They are serialized server functions and must
   ship unchanged.
10. **Server authorization is already role-specific.** Each write endpoint checks its role;
    `API_publishing_run` and `API_review_save` dispatch to allowlisted methods that authorize themselves.
    Coverage lives in `tests/api-authorization-roles.test.cjs`.
11. **Reads do not overlap between roles.** Bridge keys are per role (`role:guide`, `coord:guide`, ...);
    only `shared-timeline` and `shared-rubrics` are shared.

## Ownership rule

Common code owns generic UI interactions: tabs, refresh lifecycle, drawers, dialogs, loading, icons,
skeletons, the bridge, Timeline and Rubrics. Role bundles own domain actions and role-specific
orchestration. Role keys are opaque to the shell; bundle selection happens on the server.

## Contracts

### Controllers

- **Dashboard controller** (one per role tab): `load`, `render`, optional `activate`, optional partial
  refresh (for example the student's Project-only reload).
- **Utility controller** (System Status): `load`, `render`, and a declared `endpoints` list.
- Registration rejects duplicate keys and missing required methods.
- Each role's dependency group is built by a factory. The controller registers only after the whole
  group is constructed; a failure is recorded as a failed registration and never retried (a retry could
  duplicate listeners). Do not wrap individual `const` modules in `try` blocks: block scope hides them.
- Failures in shared infrastructure remain visible page-level failures.
- A tab whose controller is missing or failed shows "This dashboard could not initialize; reload the
  page", settles loading and preserves existing content.

### Refresh lifecycle

- The shell runs one sequence for dashboard and utility tabs: `load → render → timestamp`, with cleanup
  on every path. Controllers do not show their own loading for a full refresh.
- Existing timeouts, write deduplication and stale-response handling stay in the bridge.
- **Activation:** `activate` is not awaited (fire and forget, as `GuideWeekly.load()` is today). It runs
  after the first successful render and when the tab is shown, guarded by the existing flags: showing an
  already activated tab does not rerun it; only a successful refresh clears the flag; a failed refresh
  does not.
- **Pending requests:** the global `pendingRequests` counter counts all requests, reads and writes,
  across all roles, and blocks refresh as today (lines 411, 416, 501). Keep it global and unchanged.

### Utility request classification

- The utility controller declares its endpoints at registration, before any request; the list is
  deduplicated.
- A request is a utility request if it starts inside a utility callback **or** its endpoint is
  registered, exactly as line 206 does today.
- Being in the list grants no access; endpoints keep their own authorization.
- The bridge interface does not change.

### Bundle selection

- One allowlisted manifest lists common modules, role modules and dependencies.
- Bundles are chosen from the `views` list `doGet` already builds (keys `student`, `guide`, `reviewer`,
  `coord`). Never from the browser; no second role detection.
- Multi-role users get the deduplicated union, in a stable dependency order. Startup runs once, after
  DOM readiness and after all included groups are constructed.
- Never cache role-specific HTML under a shared key.
- A role change during an open session needs a page reload.

## Stages

### Stage 0: measure (temporary diagnostic, test deployment only)

The bundle changes only two things: bytes downloaded and script evaluation time. Data requests are the
same either way, so Stage 0 measures those two and does not need student data or a student account.

- **Temporary diagnostic page.** A real network measurement needs Apps Script to serve the page, so this
  cannot be scratchpad-only. Add a temporary `?bundle=full` / `?bundle=student` parameter to `doGet`,
  like the earlier `?probe=empty`. It serves the student shell with the selected script. The student
  variant uses placeholders for `ReviewerView`, `GuideView` and `CoordinatorView` (the eager registry).
  The page makes no data requests and shows its own timings on screen:
  - transferred bytes and uncompressed bytes (Navigation Timing `transferSize`, `decodedBodySize`);
  - download time (`responseStart` to `responseEnd`);
  - script evaluation time (marks before and after the inline script);
  - time to `DOMContentLoaded`.

  Use the test deployment (`/dev` URL) only, and remove the parameter after measuring.
- **Controlled runs: Firefox desktop developer tools.** Network panel, cache disabled, throttling presets
  Regular 3G (about 0.75 Mbps) and Good 3G (about 1.5 Mbps), plus Regular 4G/LTE (about 4 Mbps) for
  comparison. Firefox has no custom profiles and no CPU throttling, so these runs measure the network
  side; script evaluation on a laptop understates a phone.
- **Real-world runs: Android phone, Chrome or Firefox, on the students' slow mobile data.** No USB
  profiling; read the on-screen timings. Alternate full and student loads, at least five of each, in
  the same place and time window, because mobile speed varies.
- **Gate:** 150 ms (agreed product threshold). The saving is the difference in download time plus the
  difference in evaluation time. Judge it on the phone runs (median) and confirm with Firefox at Good
  3G. If the student variant saves less than 150 ms, stop after Stage 1.
- Rough estimate before measuring: about 65 KB compressed (275 KB uncompressed) less to transfer for a
  student, which is roughly 0.5 s (2.2 s) at 1 Mbps and 0.1 s (0.44 s) at 5 Mbps. Expected to pass.

#### Stage 0 result (6 Oct 2026): gate passed

Measured with a temporary `?bundle=full|student` page on the test deployment, Firefox desktop
(Pixel 5 emulation, Regular 3G, cache disabled). The diagnostic has been removed.

| | Full | Student |
|---|---|---|
| Page document transferred (compressed) | 115.1 kB | 42.5 kB |
| Whole page transferred | 349.3 kB | ~276.7 kB |
| Document "Receiving" time, Regular 3G | 458 ms | 14 ms |
| Script evaluation (laptop CPU, median) | ~19 ms | ~7 ms |

- Saving per student load: 72.6 kB, about **0.44 s** download at Regular 3G plus about 12 ms of
  evaluation (more on a real phone). Well above the 150 ms gate.
- Google compresses the page about 3.5:1. About 230 kB of every load is Apps Script's own code and
  frames, which we cannot reduce.
- Whole-page load times were too noisy to show the saving: the document's server wait (doGet) varied
  from 4.3 s to 6.1 s between runs. The decision rests on bytes and "Receiving" time.
- The on-screen readout only sees Apps Script's inner frame (a 5 KB wrapper); use the Network panel for
  any future measurement.

### Stage 1: assembly tests (tests only)

- Build the page with the real serializers; mock only Apps Script services and response fixtures.
- Cover all 15 role combinations (still the full bundle), both DOM-readiness paths, and the no-role
  `doGet` denial page.
- Assert review-policy functions are serialized unchanged.
- Worth doing regardless of the Stage 0 result.
- **Done (6 Oct 2026):** `tests/page-assembly.test.cjs`, registered in `test` and `test:migration`.
  Each combination starts on both readiness paths and opens every role tab, Timeline & Rubrics and
  (for coordinators) System Status, checking the expected read for each. Removing a view or breaking
  the script fails 16 of 17 tests. Known gap, closed in Stage 2: a module behind a `typeof` guard
  (for example `GuideWeekly`) can be dropped without any test failing.

### Stage 2: registration (still the full bundle)

- Add the controller registry, factories, shell refresh sequence and endpoint registration described
  above.
- Behaviour must be identical.
- **Done (6 Oct 2026), kept deliberately small:**
  - `getDashboardStartScript_()` (in `dashboard-client-scripts.js`) runs last in the page script. It
    registers the four role controllers and the utility endpoints, then starts the dashboard. Startup
    can no longer run before `GuideWeekly` and the other later modules exist.
  - `DashboardUI.registerRole(key, controller)` replaces the eager `migratedRoles` object and the guide
    and student special cases in `activateRole`. It rejects duplicates and controllers without
    `load`/`render`. Guide activation now calls `GuideWeekly.load()` without a `typeof` guard.
  - `DashboardUI.registerUtilityEndpoints([...])` replaces the hardcoded endpoint names in
    `dashboardRun`, with the same either/or rule.
  - An unregistered tab shows "This dashboard could not initialize. Reload the page." through the
    existing failure path, which settles loading.
- **Simplified from the plan:** no per-group construction factories. Construction errors are code
  bugs, and the Stage 1 assembly tests construct every combination. The System Status refresh
  sequence moves with the Coordinator step of Stage 3, together with its actions.

### Stage 3: move domain actions, one role per release (still the full bundle)

Order: Student → Reviewer (and remove `admin()`) → Guide → Coordinator.

- Views receive their role's actions through their constructor; `getUi()` keeps only shared UI services.
  No global action registry.
- Split `WeeklyPhase2Setup` serialization from `GuideWeekly`.
- Move the team drawer opener and `renderAssessmentHistory` to the coordinator group.
- **Done (6 Oct 2026), one commit per role.** `DashboardUI` no longer refers to any role module.
  - Student: `StudentView` gets `{weekly, results, github}` through its constructor; `StudentGithub`
    reloads the Project cards through `StudentView`. Eight shell wrappers removed (two were unused).
  - Reviewer: `ReviewerView` opens the marking drawer through a getter; `ReviewEvaluations.admin()`
    removed.
  - Guide: the shell's `typeof GuideWeekly` guard removed (activation already uses the registry).
  - Coordinator: `CoordinatorView.openTeam` opens the team drawer through `DashboardUI.openDrawer`,
    which gained an `onClose` hook (`TeamDrawerView.cancel`). Closing the drawer by any route,
    including the scrim, now cancels its reads; before, a scrim close did not. System Status
    registers as a utility controller (`endpoints`, `load`, `render`, `rendered`), and its buttons call
    `SystemStatusActions` directly. `renderAssessmentHistory_` ships with the publishing script.
    `WeeklyPhase2Setup` has its own serializer (`getWeeklySetupClientScript_`) and its guard is gone.
  - The assembly test checks that each module a view calls at run time exists on every page.

### Stage 4: selective serialization

Students are the users on slow connections, so they get the benefit first.

- **4a. Student-only users**, right after Stage 2 and the Student step of Stage 3. A student-only page
  then needs no other role's module: the registry is lazy, and the remaining wrappers for other roles
  in the shell sit inside functions a student page never calls. Every other user, including
  multi-role users with a student role, still gets the full bundle. Re-measure the same way as
  Stage 0 (phone on mobile data, Firefox at Good 3G).
- **4b. All other combinations**, after the Coordinator step of Stage 3.
- Enable the manifest. Add inclusion and exclusion assertions for all 15 combinations.
- Re-measure against Stage 0.
- Verify focus, dialogs and layout in a real browser (linkedom cannot), including Chrome or Firefox on
  Android.

## Behaviour that must survive

- Student GitHub changes reload only the Project section.
- Guide activation starts the weekly workspace load, with today's timing and flags.
- System Status loading, refresh, timestamps and optional preloading.
- Team drawer cancellation, late-response rejection, focus restoration, Escape and its interaction with
  the rubric drawer.
- Unsaved-input prompts, draft state and save/submit request IDs.
- The global pending-request refresh restriction across tabs.

## Tests to add

- Timeline & Rubrics and System Status tabs alongside role tabs.
- Missing registration and invalid controller methods.
- Refresh failure preserves content and restores controls.
- Guide activation and the student Project-only reload.
- Coordinator-only weekly setup; team drawer open and close.
- Reviewer draft, save and submit; coordinator publishing with unchanged payloads.
- Multi-role switching with outstanding reads and preloading enabled.
- No duplicate listeners or submissions after repeated refreshes.
- Extend `tests/api-authorization-roles.test.cjs`: each allowed dispatch operation, and denied requests
  cause no writes or external side effects.
- Register every new test file in the `test` and `test:migration` scripts in `package.json`.

## Checks after every stage

`npm test`, `npm run test:invariants`, `npm run test:migration`, `npm run check:tailwind`.
Do not regenerate invariant snapshots.

## Out of scope

Role detection, server authorization, academic functions (rubrics, attendance, eligibility, deadlines,
publishing, weights), spreadsheet sheet names, headers and data, and the observed ~3 s Apps Script
startup baseline.
