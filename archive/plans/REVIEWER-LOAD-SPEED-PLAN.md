# Reviewer dashboard and Enter marks: load speed plan

Status: October 2026. Part A is done in the working tree and **not committed**. Parts B and C are planned and not started.
Written so the work can continue on another machine without the chat history.

## 0. Pick-up checklist

1. On the first machine: `git status`, then commit and push the working tree (it holds everything in Part A). On the new machine: pull.
2. `npm test` must be green (1280 tests at the time of writing). `npm run test:invariants` and `npm run check:sheets-doc` were not run
   separately; run them before committing.
3. The timing logs of Part A are still in the code on purpose. Deploy, open the reviewer dashboard, then read Apps Script > Executions and
   filter for `reviewer_request`. Each line is JSON: `{event, operation, totalMs, timings:[{phase, durationMs}]}`. No team IDs or sheet values.
4. Rules that apply (AGENTS.md): migrate one thing at a time, change a DTO only together with DATA-CONTRACTS.md, the endpoint, its contract
   test and the view; keep the old endpoint until the new one is verified; no rule or sheet data changes; a new test file must be listed
   in the `test` script of `package.json`.

## 1. What was slow, and what was measured

Reviewer dashboard (first paint, then one call per team to learn which "Enter marks" buttons are enabled) and the marking drawer.

| Request | Start | After Part A |
|---|---|---|
| `getTeamRequirements` (one team) | 14.5 to 24 s | 4.2 to 5.4 s (1.3 s for a team whose review is already submitted) |
| `getDashboard` (first paint) | 6.1 s | 3.8 s |
| `getEvaluation` (open the drawer) | 5.0 s | not re-measured |
| `journal:review2` | 9 to 18 s | about 0.2 s |
| `config:*` | 0.2 to 0.8 s | 1 ms |

Causes found, in order of size:
1. `assessmentJournal_` scanned every sheet of the workbook when a journal existed but had no records yet (Review 2). Fixed (A3).
2. The Rubrics sheet and the definitions were read again for every Review and every call. Fixed (A4).
3. Documents were checked against Drive. Fixed for the label and the drawer open (A1, A2).

What is left (per the last logs):
- Dashboard 3.8 s: `build:folder_links` 1.6 s (a Drive listing of all team folders), `build:progress` 1.4 s (two journal reads of about 0.2 s
  each plus definitions), `auth` 0.36 s, `dashboard_data` 0.38 s.
- One team call about 4.5 s: first `document` row 0.9 to 1.5 s (template list and DocumentSubmissions journal, read once per call), `title`
  row 0.2 to 0.3 s, two journals about 0.25 s each, about 1 s outside `progress_and_rows` (auth and team lookup).
- The dashboard queues one call per team with an open review, 3 at a time (`REQUIREMENTS_PARALLEL` in `reviewer-view.js`). For about 15
  teams the last button settles after roughly 5 rounds of 4.5 s, about 20 s. This is the largest remaining problem.

## 2. Part A: done (working tree)

- **A1. Hint for the dashboard button.** `API_reviewer_getTeamRequirements` runs the requirements in hint mode
  (`getReviewerReviewProgress_(rows, undefined, true, true, timings)`): a `document` with a journal row is answered from the journal, no Drive
  read. Rows run cheapest first and stop at the first unmet one. First paint is unchanged (`['title']` only, no hint).
- **A2. Hint when opening a Review.** `loadReviewEvaluation_` -> `getReviewEvaluation_` -> `reviewContext_(teamId, false, key, true, timings)`.
  **Every save keeps the full gate, Drive included** (`reviewWrite_` calls `reviewContext_` without the flag). Owner decision, recorded in
  AGENTS.md under "Review entry". Known gap, accepted: a duplicate file in the team folder is not seen on read. The owner wants another
  solution for duplicates later.
- **A3. No workbook scan on reads.** `assessmentJournal_(definition, {discover: false})` returns the configured journal sheet when it exists,
  without opening the other sheets. Used by `reviewerReviewProgressRead_` (history) and `getReviewEvaluation_`. Setup and saves still scan, and a
  missing journal sheet still scans (rename case). **AGENTS.md has no line for this yet**; add one under "Review entry" or "Sheet access".
- **A4. One read per request.** `withAssessmentDefinitions_` also keeps the Rubrics rows for its scope (`assessmentRubricRowsMemo_`).
  `getReviewerReviewProgress_` now runs inside that scope itself; a registry that cannot be parsed still comes back as `error`.
- **A5. Timing logs.** `getDashboard` (phases `auth`, `dashboard_data`, `build_dto` and, inside it, `build:*`, `definitions:*`, `config:*`,
  `journal:*`, `progress:*`, `sequence:*`, `row:*`), `getTeamRequirements`, `getEvaluation`. Per-row timing is in `activityPreconditions_`
  (`ctx.timings`). Keep them until Parts B and C are verified, then decide whether to keep a reduced set.
- Files touched: `activity-engine.js`, `assessment-registry.js`, `review-evaluation.js`, `reviewer-api.js`, `reviewer-evaluation.js`,
  `AGENTS.md`, `DATA-CONTRACTS.md`, and tests in `tests/review-evaluation.test.cjs`, `tests/reviewer-migration.test.cjs`,
  `tests/assessment-registry.test.cjs`.
- Open items for A: (1) confirm the drawer shows the load error when the full gate refuses a save that the label allowed (the server message
  is the engine's reason); (2) the AGENTS.md line for A3.

Note on test sandboxes: several test files load only some modules into a VM. Code in `review-evaluation.js`, `activity-engine.js`,
`assessment-registry.js` and `reviewer-evaluation.js` therefore must not call `timedPhase_` (it lives in `common-helpers.js`); those use a local
timer or a plain `ctx.timings` push. `reviewer-api.js` endpoints may use `timedPhase_` and `logPhases_`. `tests/api-authorization.test.cjs` requires
the role guard (`reviewerEmailOrThrow_`) to appear in the first 700 characters of every `API_*` function, so keep it inside the endpoint.

## 3. Part B: batched requirement calls (recommended next)

Goal: the template list, journal, rules, definitions, auth and the team lookup are read once per chunk of teams instead of once per team. Expected:
about 20 s to roughly 7 to 8 s for 15 teams, with buttons still turning on chunk by chunk.

Design:
- New endpoint `API_reviewer_getTeamsRequirements(teamIds)` (array, at most about 10; reject more with `INVALID_INPUT`). Returns
  `{teams: [{teamId, reviews: [ReviewCell...]}]}`, the same cells as today's `API_reviewer_getTeamRequirements`.
- Server: one `reviewerEmailOrThrow_()`, one read of TeamStatus, keep only rows whose committee is the reviewer's (silently drop unknown or
  foreign IDs; do not reveal that they exist), one `getReviewerReviewProgress_(rows, undefined, true, true, timings)` call. That function already
  takes many rows and shares one `activityContext_()` for the whole run, so the document sources are read once.
- **Verify before relying on the shared context:** `ctx.github` and `ctx.drive` caches must be keyed by team (they are objects keyed per team
  in `activityContext_`; check `activity-check-github.js` and `activity-check-drive.js`), and `ctx.hint` stops a row list per team, not per run.
  Add a test with two teams where the first is unmet and the second met.
- Keep `API_reviewer_getTeamRequirements` until the batch is verified, then remove it (migration step 5): DATA-CONTRACTS.md row, endpoint,
  the `DELEGATED`/guard lists in `tests/api-authorization.test.cjs` and `tests/api-authorization-roles.test.cjs`.
- Browser (`reviewer-view.js`, `loadRequirements`): queue chunks of about 8 teams, 2 chunks in parallel. A chunk settles its teams on every
  path (answer replaces the cells, failure leaves them and the server still refuses the entry). Keep `state.checking`, the spinner and the
  "button never goes from enabled to disabled" behaviour. Writes are not involved, so the bridge timeout (`REQUIREMENTS_READ`) and stale
  response handling stay as they are; scale the timeout to the chunk.
- Tests: contract test for the new DTO, authorization (assigned teams only; a foreign ID is absent, not an error), a batch of two
  teams, an empty list, more than the maximum, the view test for chunking and settle-on-failure (`tests/reviewer-view.test.cjs`,
  `tests/reviewer-migration.test.cjs`), and `tests/page-assembly.test.cjs` still green.
- Measure again with the same logs. Success criteria: one batch of 8 teams under about 8 s, the last button for 15 teams under about 10 s.

Risks: a slow GitHub row (kind `github`) in one team delays its whole chunk; Apps Script quota per execution (keep chunks small); the
batch response must still contain only what a reviewer may see (no student-only data, no `diagnostic` beyond what the current cell carries).

## 4. Part C: folder links on demand

Goal: remove `build:folder_links` (1.6 s, a Drive listing of every team folder) from first paint.

Design:
- `teamFolderUrls_` (`team-folders.js`) lists every folder with `getFolders()` and picks the assigned teams. Today
  `ReviewerDashboard.teams[].titleApproval.folderUrl` carries the link.
- New endpoint `API_reviewer_getTeamFolder(teamId)` (reviewer of that team's committee only; same checks as the requirements endpoint) returning
  `{teamId, folderUrl}`. Resolve one folder by name (`teamFolderName_(year, semester, teamId)` plus the documents folder's `getFoldersByName`)
  instead of listing all of them. Keep the rule that exactly one folder must match, else no link.
- DTO: `titleApproval.folderUrl` stays in the contract but is `''` on first paint, or is dropped and replaced by a flag; decide when editing
  DATA-CONTRACTS.md. Students must still never receive `folderUrl` (`tests/student-title.test.cjs`, `tests/student-migration.test.cjs`
  are unaffected, but run them).
- View: the title panel (`state.panelTeam`) requests the link when it opens, shows a small loading state, then the link. A failed read leaves
  the panel usable without the link (preserve existing content, per LOADING-UI.md).
- Check `tests/invariants/` and any golden master of the reviewer DTO before changing it. Snapshots must not be regenerated for a migration;
  if one holds `folderUrl`, stop and decide with the owner.
- Expected effect: first paint about 3.8 s to about 2.2 s.

## 5. Not planned, kept for later

- Duplicate files in a team folder: not detected on read any more (A2). Needs its own design, for example a check at Submit and Approve time
  that writes a flag the journal can carry, or a coordinator report. Do not re-add a Drive read to the dashboard.
- `auth` (committee lookup, 0.36 s) and `dashboard_data` (0.38 s) are small; look at them only after B and C.
- GitHub and `drive`-kind rows still run per team in hint mode. If the logs show `row:github` or `row:drive` entries, consider limiting the
  button label to `['title','document','evidence']` (`ctx.kinds`) and leaving those two to the drawer open. That narrows what the button
  promises, so it needs the owner's decision. Current logs show no such rows for the sampled teams.
