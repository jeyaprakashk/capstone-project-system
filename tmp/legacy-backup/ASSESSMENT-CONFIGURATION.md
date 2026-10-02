# Assessment configuration and bootstrap

## Ownership

| Source | Responsibility |
| --- | --- |
| `Milestones` | Non-assessment lifecycle events and project logging schedule. |
| `AssessmentDefinitions` | Sole graded-assessment registry: identity, type, label, sequence, weight, opening/due dates, prerequisites, policy binding and journal binding. |
| `Rubrics` | Criteria grouped by `Assessment ID`, matching the ID in `AssessmentDefinitions`. |
| Configured Journal / `Assessment_<assessmentId>` | Append-only assessment revisions and publication events. Not a reviewer cell-entry grid. |

There is no overlay, fallback, migration or copying of graded Milestones into the
registry. A Milestones row never makes a Review or Guide assessment operational.
Its existing five headers remain; `Graded By` must be `Not Applicable` and weight
must be blank or zero. Graded rows are rejected with a configuration message.
Legitimate lifecycle events, including start, formation, title and report, remain.

## Fresh-installation workflow

1. An authorized Coordinator/PD opens System Status → Assessment readiness.
2. If the registry is missing, **Create assessment definitions tab** calls
   `createAssessmentDefinitions()`. Authorization and a script lock precede writes.
   It validates and writes only the existing parser's ten-column header row.
3. Readiness refreshes to **Assessment definitions required**. The direct sheet
   link opens the new tab. The Coordinator enters the institution's actual
   assessment definitions and referenced rubrics, then selects **Recheck**.
4. Valid configuration enables the separate **Create missing assessment storage**
   action. `prepareReviewAssessmentStorage()` revalidates under a lock and
   provisions all supported configured assessments, including Guide.
5. Missing journals are created, genuinely empty journals receive headers, and
   compatible existing journals remain unchanged. Reviewers/Guides enter marks
   through their existing evaluation interfaces when entry rules permit.

Creation supplies no assessment rows, dates, weights,
prerequisites or policy bindings. A repeat bootstrap validates the existing tab
without writing. An existing invalid or blank tab is not overwritten or repaired.
If creation fails after inserting the tab but before writing its header, the next
read reports invalid configuration; the Coordinator must correct it through the
sheet link. Spreadsheet operations are not transactional.

The sheet itself is the definitions editor. There is no separate custom editor,
automatic migration or implicit initialization on dashboard reads. Appropriate
main-spreadsheet access is needed to edit the configuration.

## Executable schema

`ASSESSMENT_DEFINITION_HEADERS_` and `parseAssessmentDefinitions_()` in
`assessment-registry.js` remain the schema and validation authority. Header
matching is case/whitespace insensitive and each required header must occur once.
Bootstrap writes exactly these headers, in this order:

| Header | Requirement |
| --- | --- |
| Assessment ID | Required, normalized stable ID; letter followed by up to 39 letters, digits, underscores or hyphens. Unique. |
| Type | `REVIEW`, `GUIDE_EVALUATION` (`guide_eval` only), or `SEE` (`see` only; reserved for SEE). |
| Label | Required display label. |
| Sequence | Required positive integer; sorts registry instances, with ID as tie-breaker. |
| Weight (%) | Required numeric percentage greater than zero and at most 100; total at most 100. |
| Opening | Required valid date, not later than Due Date. |
| Due Date | Required valid date. |
| Prerequisites | Optional; blank means none. SEE requires blank or `[]` and cannot be referenced as a prerequisite. Otherwise JSON array of `assessmentId` and `condition: "RECORDED"`; references must exist, be unique and acyclic. |
| Academic Policy Version | Required supported binding: `review-attendance-v1` for REVIEW or `guide-bands-v3-target-level-2` for Guide. Must be blank for SEE. Policy implementation remains code-controlled. |
| Journal | Must be blank for SEE, which has no journal. Otherwise optional; defaults to `Assessment_<assessmentId>`. Journal bindings must be distinct, valid and compatible with existing storage. |

Dates use the spreadsheet timezone and existing date parser. Lifecycle IDs and
reserved schedule fields cannot collide with assessments in timeline composition
or Coordinator readiness. No alternative schema validator runs in the client.

Each assessment owns its rubric criteria. Repeat identical criteria under each
assessment ID when needed; shared rubric groups are not supported. This schema
targets fresh setups: the Rubrics header must be `Assessment ID`, and no legacy
header fallback or historical-record migration is provided. The separate
Milestones tab retains its `Milestone ID` header.

## Readiness states

| Situation | Server/UI behavior |
| --- | --- |
| Missing tab | `registryState=MISSING`, creation action available; storage setup blocked. |
| Header-only tab | `registryState=EMPTY`, configuration-required message and direct definitions link; storage setup blocked. |
| Invalid definitions | `registryState=INVALID`, parser error and direct link; no automatic repair, storage setup blocked. |
| Valid definitions, invalid rubric/storage | Each assessment reports rubric and storage status independently; errors block storage setup. |
| Missing journals | `storage-missing`; each absent journal is `MISSING`. |
| Existing empty journals | `storage-empty` when none are missing; each empty journal is `EMPTY`. |
| SEE | Definition and rubric validated; storage `NOT_REQUIRED` (evaluated outside this app). No journal is resolved or created. |
| All journals compatible | `ready`; each journal is `READY`. |

The browser displays server states and links; it does not recalculate academic
validity. Duplicate operations are blocked. Shared loading cleanup runs on success
and failure; failed readiness refreshes retain the previous results. Required
Reviewer and rubric consumers reject missing/empty definitions explicitly.
Guide requires an explicit `guide_eval` definition and uses its Opening rather
than a computed offset. A missing Guide definition never falls back to Milestones.

## Timeline and scalability

`getMilestones_()` returns lifecycle events only. Review discovery, shared rubrics
and publishing discovery read registry definitions. `getProjectSchedule_()` keeps
lifecycle events and assessments separate; `composeProjectTimeline_()` combines
them for presentation, rejects colliding IDs, and orders by due date then sequence.
The timeline includes the configured label, opening/due dates and sequence, with
opening/due information exposed in the date tooltip and accessible label.

Additional REVIEW instances use the same policy, lifecycle, prerequisite evaluator,
makeup, reopening, revision and journal mechanisms. No numbered instance or
duplicate evaluation engine is created in JavaScript. Guide is the supported
individual strategy. SEE is display-only and has no evaluation or publication
adapter; other assessment types require an explicit implementation.

Publication discovery no longer supplies a Guide definition from Milestones.
Academic policy, publication authorization, frozen snapshots and revision semantics
are unchanged by this configuration/bootstrap work.

## Verification

Local regression tests cover exact schema creation, no seeded rows, authorization,
lock conflicts, idempotency, existing/invalid tab preservation, missing/empty/invalid
states, Reviewer messages, Guide registry-only configuration and provisioning,
timeline composition, arbitrary future REVIEW instances, rubric authority,
prerequisites, journal preservation, UI retries and loading cleanup. The existing
Review 3 lifecycle/publication tests use a distinct rubric and configured prerequisite.

Run `npm test` for the complete suite. No live spreadsheet action or deployment is
part of this implementation.

Local verification on 2026-09-28: focused suite 143 passed; complete suite 384
passed, zero failures. All 35 root JavaScript files parsed successfully,
`git diff --check` passed, and the source check found no duplicate top-level
function declarations within a file. Browser behavior was verified with local
DOM/RPC fixtures; live Google Sheets and deployed-browser checks were not run.


## End Review (SEE)

SEE is evaluated outside this app by the **SEE Committee (includes external
members)**. The app displays its rubric and schedule to dashboard users; committee
membership, external logins, marks, completion, and publication are not managed here.

Example AssessmentDefinitions row (dates, sequence and weight are illustrative):

| Assessment ID | Type | Label | Sequence | Weight (%) | Opening | Due Date | Prerequisites | Academic Policy Version | Journal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| see | SEE | End Review (SEE) | 4 | 40 | 2026-12-01 | 2026-12-01 | | | |

Use `see` in the Rubrics **Assessment ID** column. Example criteria:

| Assessment ID | Order | PI | Criterion | CO | Max Marks | Type |
| --- | --- | --- | --- | --- | --- | --- |
| see | 1 | PI1 | Project demonstration | CO1 | 60 | Team |
| see | 2 | PI2 | Individual explanation | CO2 | 40 | Individual |

Level 0 through Level 5 descriptor columns retain the existing rubric rules.
All assessment weights, including SEE, must total at most 100%; the example leaves
60% for other assessments. Opening and Due Date are required and may be identical.
SEE does not extend the weekly logging period, which still ends at report submission.

System Status shows SEE storage as **Not required - evaluated outside this app**.
A valid SEE-only configuration is ready without storage setup. An invalid or missing
SEE rubric still requires correction. Internal assessment prerequisites cannot use
SEE completion because this app never records it. Coordinator progress shows SEE
only when configured, with no completion percentage or overdue marking alerts.

Configure this through the existing definitions and rubric tabs; no SEE journal,
policy version, external committee directory, or data migration is required.


## Rubric and storage readiness

Each Assessment readiness entry shows a combined Ready / Needs attention status,
its rubric status, and its storage status. Ready rubrics report criterion count
and maximum marks. Missing rubrics show MISSING; invalid criteria or shared headers
show INVALID, with actionable errors. Criterion errors retain original Rubrics
sheet row numbers, even when criteria for several assessments are interleaved.

Rubric and journal checks are independent. A ready journal stays READY when its
rubric is invalid, and another assessment's valid rubric remains READY. SEE needs
a valid rubric but keeps storage NOT_REQUIRED. Unknown or blank assessment IDs
in populated rubric rows are sheet-wide errors shown in the main issue list.

The summary reports how many assessments meet both requirements. Sheet-wide or
schedule errors can still block overall readiness even if individual assessments
are ready. Storage setup remains blocked until all configuration errors are fixed;
Recheck never writes assessment data. Failed refreshes retain the previous results.

The readiness API retains each entry's storage `state` and adds `ready` plus a
`rubric` object containing `state`, `criterionCount`, `maximumMarks`, and an optional
`error`. The browser displays these server-computed states without recalculating
academic or readiness rules.


## System Status configuration cards

Review Committees and Assessment readiness are separate full-width cards, each
with its own Recheck action, status, issues, configuration links and check time.
Committee Recheck is Coordinator/PD-only and reads assignment information without
writing to sheets. Missing tabs, invalid required headers, empty configuration and
committees without reviewer email addresses are reported independently of assessment
readiness. Empty reviewer slots and committees without assigned teams are allowed.

Both cards share the column count derived from the narrower grid's content width,
using 260px minimum cells and 8px gaps. Final rows retain the same cell width rather
than stretching; narrow screens use one column. Committee expansion survives a
successful Recheck. Failed refreshes preserve previous content and provide a retry.

The storage creation area is hidden only after readiness confirms every journal
is READY or NOT_REQUIRED, including SEE-only configurations and configurations with
rubric errors but complete storage. Missing, empty or unresolved storage keeps the
area visible. Creation is enabled only when configuration is valid and a journal
is missing or empty. Successful setup rechecks readiness before hiding the area.
