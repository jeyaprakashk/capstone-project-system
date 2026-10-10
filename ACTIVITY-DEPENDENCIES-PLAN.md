# Activity dependencies engine: plan

Status: proposal. This file frames the engine only. It refines section 7 of
[TITLE-REVISION-PLAN.md](TITLE-REVISION-PLAN.md) (Phase 2) and changes nothing in it. Where the two differ, the title
plan wins until this file is merged into it.

## 1. Purpose

Decide whether a student action may proceed by checking that its dependencies are complete. A dependency belongs to the
team or to individual members. If all are complete the action is allowed; otherwise the engine lists what is missing.

Which dependencies apply to which activity is data (a coordinator-edited sheet). How each kind of dependency is
verified is code. The engine is small and plain: load rules, run checks, combine, answer.

## 2. Scope

**In (this plan):**

- the `ActivityDependencies` sheet and its setup
- the loader and its validation
- the check registry and the check contract
- two checks: `github` and `drive`
- `activityPreconditions_` and its result
- `API_coordinator_getRequirements`
- tests for all of the above

**Out:**

- the document upload endpoint itself (TITLE-REVISION-PLAN section 8). Only its call into the engine is in scope
  (section 10, step 8)
- any student or coordinator view
- `titleCanDo_` (title service, Phase 1). It handles the built-in title rules and is not part of the engine. Gated
  callers (the title submit and upload endpoints, and their DTO flags) call `titleCanDo_` and, once Phase 2 is present,
  also call `activityPreconditions_`, as two separate calls (TITLE-REVISION-PLAN section 7)
- later kinds, more gated activities and everything in section 11

## 3. Principles

1. **Plain.** Three jobs: load rules, run checks, combine results. Nothing else is added without a shown need.
2. **Data-driven.** A new requirement on an existing kind is a sheet row, with no deploy.
3. **Registry, not branches.** The engine never compares a kind by name. It looks the kind up in a registry. Adding a
   kind adds one file.
4. **Live and server-side.** Checked on the server at the moment of the action. The browser only displays the result.
   No caching between requests.
5. **Fail closed.** Misconfiguration denies. An unverifiable item is unmet.
6. **Engine core touches no sheet, GitHub or Drive.** Reading the sheet is a separate step (section 6) and the parser
   and decision receive plain data; each check reads its own source. The core is tested with fake checks.
7. **One decision, two consumers.** An action endpoint and the DTO flag the view reads both use the same call, so they
   cannot disagree.
8. **Read-only.** Evaluating the engine never writes anything: no sheet write, no repository or invitation change, no
   file change. A dashboard load or coordinator inspection must be safe to repeat any number of times.

## 4. Sheet: `ActivityDependencies`

Coordinator-edited and protected. One row per required item.

| Column | Meaning |
|---|---|
| Activity | An ID the code knows (below) |
| Kind | A registered check kind |
| Item | Meaning depends on the kind |
| Label | What the student sees |
| Active | `Yes` or `No` |

- Created with headers by `setupTitleStorage` if absent; safe to rerun. **The layout is frozen once introduced**, so this
  is the one part to review before it ships.
- **Kind** is matched after trim and lowercase. **Item is matched exactly and is not trimmed**, so an accidental
  leading or trailing space makes `validItem` fail and is reported as a misconfiguration. Activity is matched exactly.
- **Active** accepts `Yes` and `No` (trimmed, case-insensitive). Any other value, including blank, is a
  misconfiguration.
- **Label** must be non-blank after trimming. It is the student-facing requirement and part of "Could not verify:
  <label>.", so a blank label is a misconfiguration.
- **Rows:** a row is ignored only when all five cells are blank. A row with any non-blank cell is a rule, and every one
  of Activity, Kind, Item, Label and Active must then be valid. A partially filled row is a misconfiguration, never
  skipped, so a half-typed requirement cannot silently weaken the gate.

**Activities at release:** `title.submit` (a submission before the first approval, including after a Return),
`title.resubmit` (a submission during a reopening) and `document.upload`. An activity with no active rows is
unrestricted.

**Release rows** (entered by the coordinator at cutover; the setup does not seed them):

| Activity | Kind | Item | Label | Active |
|---|---|---|---|---|
| `title.submit` | `github` | `READY` | GitHub setup complete | Yes |
| `title.submit` | `drive` | `Step1_Work_Breakdown.docx` | Work Breakdown document | Yes |
| `title.submit` | `drive` | `Step2_Need_Analysis.docx` | Need Analysis document | Yes |

## 5. Check contract and registry

```
registerActivityCheck_(kind, {
  needsApprovedTitle: boolean,
  perStudent: boolean,
  validItem(item) → boolean,
  isMet(subject, item, ctx) → { met: boolean, reason: string, diagnostic?: string }
})
```

- `subject` is the team, and for a `perStudent` check the team's members.
- **Where the team comes from.** Student actions and the student DTO derive the team from the session, never from the
  browser. `API_coordinator_getRequirements(teamId)` is the one exception: it authorizes the coordinator first, then
  resolves the supplied ID against the roster. An ID not on the roster returns `NOT_FOUND` and is never evaluated.
- `perStudent` is met only when every obligated current member has done the item; with no obligated member it is unmet.
  No release check uses it. The flag exists so later kinds fit without reshaping the contract.
- `ctx` holds the request's loaded rules and a GitHub and Drive result cache for that request only. It never holds
  title state used for a write decision.
- A check that throws or cannot reach its source returns `met: false` with "Could not verify: <label>." This applies
  to a *returned* unavailable result as well as to an exception (see the `github` rule below).
- A check result may carry an optional `diagnostic`: a short code naming what could not be established, for example
  `FOLDER_AMBIGUOUS`. It says what was observed, never a guessed cause. It is carried through the core (section 7) and
  removed before any student DTO is built; only `API_coordinator_getRequirements` returns it.
- Each check lives in its own file and registers itself. Apps Script has one global scope, so load order matters; a test
  asserts that every expected kind is registered.

### Checks at release

| Kind | Item | Met when | Source |
|---|---|---|---|
| `github` | `READY` | Every member's username is valid, the repository is verified, every member has active or invited access, and template setup has finished | `getTeamGithubSetup_` with access inspection |
| `drive` | an upload name from `TEAM_DOCUMENT_FILE_NAMES_` | Exactly one non-trashed file with that exact name is in the team folder | `teamFoldersBase_`, `teamDocumentsFolder_`, `teamFolderIn_`, then a name lookup |

- **The `github` check must be read-only.** Today `getTeamGithubSetup_` can call `refreshGithubAccountMetadata_`
  ([team-github-setup.js:99](team-github-setup.js#L99)), which takes a lock and writes the GitHub accounts sheet when a
  stored username, display name or profile URL differs from GitHub's. That write is a side effect of a read path and is
  not acceptable for a dashboard load or coordinator inspection. The plan therefore requires a read-only mode:
  `getTeamGithubSetup_` accepts an option (for example `readOnly: true`) that skips only that refresh, and the engine
  always passes it. Every other behaviour and result is unchanged, and existing callers keep the default. The option is
  added in the same step as the `github` check (section 10, step 6) with a test that no sheet write occurs when stored
  metadata is stale. Stale metadata is refreshed by the existing setup flows, not by the engine.
- **`github` messages.** `getTeamGithubSetup_` catches verification failures and returns normally, so the check reads the
  result and does not depend on an exception:
  - *Unavailable* is when `verificationUnavailable` is true, or any member's `access` is `unavailable`, or the team has
    a repository URL and complete usernames but `repositoryAvailable` is false. The reason is
    "Could not verify: <label>." (the title plan's acceptance wording). The same flag is false whether the saved URL is
    invalid, the GitHub request failed, or the repository could not be confirmed, so the diagnostic is general:
    `GITHUB_REPOSITORY_UNVERIFIED` means "the repository could not be verified", not "the URL is invalid". The check
    does not inspect the URL to name a cause. Member-level unavailability uses `GITHUB_MEMBER_UNVERIFIED`.
  - *Any other unmet result* (missing username, missing access, template setup pending, no repository yet) uses the
    existing `githubSetupMessage_` text, because it tells the student what to do.
  - Tests cover both a thrown error and each returned-unavailable shape.
- **`drive` messages.** Absence and ambiguity are different and the check must tell them apart:
  - `findTeamFolder_` and `teamDocumentsFolderOrNull_` return null for absent, ambiguous and unreadable alike, so the
    check does not use them. It composes the underlying helpers, which do report the difference:
    1. `teamFoldersBase_()` ([team-folders.js:29](team-folders.js#L29)): an `issue` (spreadsheet folder unreadable, not in
       a folder, or in several) is unresolved.
    2. `teamDocumentsFolder_(base.folder, false)` ([team-folders.js:45](team-folders.js#L45)): an `issue` (more than one
       Team Documents folder) is unresolved. No issue and no folder is the only true "absent" case.
    3. `teamFolderIn_(documents, teamId, semester)` ([team-folders.js:144](team-folders.js#L144)) returns
       `{folder, count}`: `count` 0 is absent, above 1 is ambiguous.
    A thrown Drive error is also unresolved.
  - Team Documents absent, or `count` 0: unmet, "Team folder not created yet."
  - Unresolved parent (steps 1 or 2, or a Drive error): unmet, "Could not verify: <label>.", with
    `diagnostic: TEAM_DOCUMENTS_UNRESOLVED`.
  - `count` above 1 (ambiguous team folder): unmet, "Could not verify: <label>.", with `diagnostic: FOLDER_AMBIGUOUS`.
  - "Not created yet" is said only for a confirmed absence, never for an unresolved or ambiguous lookup.
  - Folder found: "Not uploaded yet." when no file has the name. A duplicate or trashed file does not count.
- `READY` is the only `github` item. Any other item, and any `drive` name outside the upload names, is a
  misconfiguration.

## 6. Loader

Reading and parsing are two functions, so the parser is pure and tests need no sheet.

```
readActivityDependencyRows_()          → { present: boolean, headers: [string], rows: [[cell]] }   // the only sheet read
parseActivityRules_(data, registry)    → { rules: { activityId: [{kind, item, label}] }, errors: [string] }   // pure
loadActivityRules_(ctx)                → parseActivityRules_(readActivityDependencyRows_(), ACTIVITY_CHECKS_), once per request, kept in ctx
```

- `readActivityDependencyRows_` is the only function that touches the sheet. It reads fresh on every request and never
  caches between requests.
- `parseActivityRules_` receives plain data and the registry, so tests pass hand-written rows and fake checks.
- `loadActivityRules_` runs both once per request and stores the result in `ctx`, so repeated decisions in one request
  (for example a dashboard evaluating several activities) read the sheet once.

The parser validates:

- sheet present and headers correct
- per row (section 4): all five cells valid for any row that is not entirely blank; known activity; registered kind;
  `validItem(item)` true with the exact, untrimmed Item; non-blank Label; valid `Active`
- no cycle (rule 10 below)

Any error in `errors` denies every gated activity with: "Submission requirements are misconfigured. Contact the
coordinator." The details never reach students. In Phase 2 they are available to the coordinator through
`API_coordinator_getRequirements` and written to the server log. Showing them in coordinator health or the requirements
card is Phase 7 (title plan), which reads that endpoint; Phase 2 does not change the existing health DTO.

## 7. Decision

```
activityPreconditions_(activityId, team, ctx) →
  { allowed: boolean,
    requirements: [{ label, met, reason, diagnostic? }],
    reason: string }
```

1. Load rules. On errors, return `allowed: false` with the misconfiguration message and no requirements.
2. No active rows for the activity: `allowed: true`.
3. Run every active row's check, not stopping at the first failure, so the student sees everything that is missing.
4. `allowed` is true only when every row is met.
5. `diagnostic` is passed through unchanged. A single function, `studentRequirements_(result)`, drops it, and every
   student-facing DTO and action response goes through it. The coordinator endpoint does not.

### Fixed rules

1. Only student submit actions are gated (title submission, document upload). Guide, reviewer and coordinator actions
   never are.
2. Built-in rules run first; the sheet only adds requirements.
3. All-of only. No any-of, expressions or waivers.
4. Checked only at the moment of the action, never retroactively. A committed request is recognised before requirements
   are checked (TITLE-REVISION-PLAN section 6, step 3).
5. No caching between requests.
6. Misconfiguration denies.
7. No active rows allows.
8. Unverifiable is unmet.
9. A missing team folder makes every `drive` item unmet ("Team folder not created yet."). An ambiguous team folder
   (more than one match) or an unresolved Team Documents parent also makes every `drive` item unmet, but reports "Could not verify" with a coordinator-only
   diagnostic, because the problem is not the student's.
10. No cycles. A check with `needsApprovedTitle` cannot be required by `title.*` or `document.upload`, and `drive`
    cannot be required by `document.upload`, because the upload is how those files are created.
11. A `perStudent` item is met when every obligated current member has done it.

## 8. Response and endpoint

The core functions return plain objects. Endpoints wrap them in the standard envelope from
[DATA-CONTRACTS.md](DATA-CONTRACTS.md), so the core stays testable on its own.

- "Not allowed" is a normal answer: `ok: true`, `data.allowed: false`. The action endpoint that refuses because of it
  returns `REJECTED` with the unmet items.
- Dates are ISO strings. The server returns JSON only: no HTML, classes or layout.
- `API_coordinator_getRequirements(teamId?)`: coordinator only, read-only. Without `teamId` it returns the parsed rules
  and loader errors. With `teamId` it returns that team's `activityPreconditions_` result for each activity, including
  any check `diagnostic` values. This is the only place Phase 2 exposes configuration errors and diagnostics; the Phase 7
  card renders them.
- The new public function is added to `tests/entry-point-guard.test.cjs` and checks the coordinator itself. Every other
  function ends in `_`.
- The endpoint and its DTO are documented in DATA-CONTRACTS.md in the same commit as the code and its contract test.

### Callers

- Action endpoints (title submit, document upload): call it after their own built-in checks, before doing the work.
- The DTO that feeds the student view: same call, so the checklist and the button state match the server.
- The coordinator endpoint above.

## 9. Speed

- Evaluation is once per action and once per dashboard load. A request-scoped cache in `ctx` removes repeat GitHub and
  Drive lookups inside a request.
- `github` / `READY` is the slow check (one GitHub call per member).
- **Decision:** live checks only, no completion sheet. A second copy of the answer can drift when GitHub access or Drive
  files change outside the system, and it conflicts with rules 4 and 5.
- **Measure first.** After the engine is in, time the student dashboard load. If `github` makes it slow, let the page
  render first and fill the requirements checklist in a separate bridge call. That does not touch the gate.

## 10. Implementation order and tests

This is the implementation order **inside Phase 2** of the [title plan](TITLE-REVISION-PLAN.md#phases) ("Precondition
engine, `API_coordinator_getRequirements`, document upload endpoint"), not a separate set of phases. Phases are commits on
the development branch and every phase passes `npm test`, `npm run test:migration`, `npm run test:invariants` and
`npm run check:tailwind`. The steps below may be separate commits, but each must leave the full suite green, and Phase 2
is not complete until step 8 is done. New test files are added to the `test` script in `package.json`. The invariants
snapshots are not regenerated for this work.

| Step | Phase | Work | Tests |
|---|---|---|---|
| 1 | 1 | Sheet creation inside `setupTitleStorage` (already a Phase 1 deliverable) | Created with headers; rerun is a no-op; a wrong header is detected |
| 2 | 2 | Registry and check contract | Registering, lookup, unknown kind; registry-completeness test |
| 3 | 2 | `readActivityDependencyRows_`, `parseActivityRules_`, `loadActivityRules_` | Each misconfiguration case; `Active` parsing; blank Label; untrimmed Item with a stray space; partially filled row; fully blank row ignored; both cycle rules; sheet read once per request |
| 4 | 2 | `activityPreconditions_` with fake checks | All met; each unmet listed; `Active = No` ignored; no rows allows; check throws gives "Could not verify"; no early stop |
| 5 | 2 | `drive` check | One file met; none, duplicate, trashed unmet; Team Documents absent or team folder count 0 says "not created yet"; duplicate Team Documents, a base-folder issue, a Drive error and duplicate team folders each say "Could not verify" with their diagnostic and never "not created"; name outside the upload names |
| 6 | 2 | Read-only option on `getTeamGithubSetup_`, then the `github` check | Ready; each unmet cause shows the setup message; GitHub unavailable as a thrown error and as each returned-unavailable shape gives "Could not verify"; item other than `READY`; **no sheet write when stored metadata is stale**; default behaviour of existing callers unchanged |
| 7 | 2 | `API_coordinator_getRequirements` | Envelope shape; coordinator only; guard test; DATA-CONTRACTS entry; loader errors and `diagnostic` values present in the coordinator response and absent from `studentRequirements_` output (both sides asserted on the coordinator endpoint and the filter); an ID not on the roster returns `NOT_FOUND`; the existing health DTO is unchanged |
| 8 | 2 | Upload endpoint integration (endpoint itself per title plan section 8) | `document.upload` rows allow and refuse as configured; an unmet row returns `REJECTED` with the unmet items; a completed request retried after a rule change returns its stored success without evaluating; a `drive` or `needsApprovedTitle` row under `document.upload` is a loader misconfiguration; no rows allows |

The assertion that no student-facing DTO or action response carries a `diagnostic` runs where those callers appear: the
upload response in step 8, and the student title view, the title submission endpoint and their DTO flags in Phase 4. Each
of those caller tests is added in the same commit as the caller.

Also asserted: non-gated actions never call the engine, and a committed request is not re-checked (the latter is
covered in the title and upload tests).

## 11. Not now

Left out until a real need is shown; each can be added later without rewriting the engine.

| Item | Why not now | Add when |
|---|---|---|
| Cross-request caching, retries, circuit breakers | Stale answers conflict with live checks; scale does not need them | Measured load time or GitHub rate limits become a problem |
| Expression language, any-of groups, per-team waivers | Harder for a coordinator to debug and to explain to a student | A real rule cannot be written as all-of (TITLE-REVISION-PLAN F7) |
| Plugin discovery, dependency injection frameworks | One global scope and two or three checks; passing `ctx` already allows fakes | There are many checks written independently |
| Persistent completion store | Second source of truth that can drift | A check measures a one-time event with no existing record |

Later kinds and activities (TITLE-REVISION-PLAN F3 to F6): `title` / `APPROVED`, `weekly`, `review`, a repository-only
`github` check, gating `weekly.submit` and later assessments, full cycle detection across kinds, and a scheduled batch
readiness summary.

## 12. Open decisions

1. **Seeding.** Whether `setupTitleStorage` seeds the three release rows or leaves the sheet empty. An empty sheet means
   "no rows allows", so the gate is off until the coordinator enters the rows. This plan assumes the coordinator enters
   them at cutover, as the title plan says.
2. **File.** The engine and each check as separate files, for example `activity-preconditions.js` plus one file per kind.
   All function names end in `_`.
3. **Test doubles.** Fake GitHub and Drive layers from the start, matching the Phase 0 stubs for `getTeamGithubSetup_`
   and `findTeamFolder_`.
4. **Read-only option name.** `readOnly` on `getTeamGithubSetup_` is a placeholder; settle the name when step 6 is
   written. Its behaviour is fixed: it skips only the metadata refresh.
