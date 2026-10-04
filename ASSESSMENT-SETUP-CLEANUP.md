# Assessment setup cleanup report

## Root cause

The earlier engine cleanup removed the alternate entry and provisioning paths but left the committee schema and presentation tied to a retired external-file identifier. Column mapping still required that column, and the directory interpreted its presence as storage readiness. The current setup action initializes journals in the main spreadsheet, so it could never satisfy that directory state. This was a remaining schema, payload and presentation dependency, not a missing reviewer entry interface.

The reviewer interface is the shared web-app drawer. Journal initialization and reviewer authorization are separate concerns.

## Discovered and removed artifacts

The names in this inventory identify removed artifacts only; they are not supported configuration or migration instructions.

| Artifact | Resolution |
| --- | --- |
| `MARKS_SHEET_ID`, `Marks Sheet ID`, `marksSheetId` | Removed the field definition, singular/plural header compatibility branch, committee helper payload property, Coordinator payload property and fixture values. Committee column mapping now requires only the committee number and four reviewer name/email pairs. |
| `Sheet linked`, `Not created`, `Open marking spreadsheet`, `Create the marking spreadsheet` | Removed the status badge, action link, empty-state instruction and associated styles. The directory now shows members and assigned teams only. |
| `createReviewerSheets`, `creatingReviewerSheets`, `reviewerSheetsStatus`, `reviewerSheetsResults` | Renamed to current assessment-storage action, busy-state and result identifiers, including generated handlers and tests. No aliases remain. |
| `reviewer-sheet-provisioning.js` and its test filename | Renamed to `assessment-storage-setup.js` and `tests/assessment-storage-setup.test.cjs`; package test references were updated. |
| `committee-sheet-*`, `marking-sheets-heading` and related section labels | Removed obsolete selectors and replaced the setup heading/classes with assessment-storage terminology. |
| Prior numbered evaluation documentation and two superseded cleanup reports | Removed and consolidated into `REVIEW-EVALUATION.md` and this report. Removed stale storage/migration instructions in README and performance documentation. |

The alternate client, level-based mutation path, committee-file provisioner, seeding/trigger helpers, numbered server endpoints and numbered Review storage mappings had already been removed in the preceding phase. The repository trace confirmed they were not restored. No compatibility alias, fallback, data migration or replacement editable file was added.

## Modified files and functions

- `common-constants.js`: `FIELD_DEFINITIONS.REVIEW_COMMITTEE` now contains assignment fields only.
- `common-helpers.js`: simplified `buildColumnMap_()` to ordinary header matching; `getCommitteeInfo_()` returns reviewer information only. Existing assignment helpers remain unchanged.
- `coordinator-dashboard.js`: `buildCommitteeData_()` returns number, members and teams; `buildCommitteeDirectory_()` renders only assignment information. `buildReviewConfigurationCard_()` includes server-reported states for each configured Review and a definitions link. Setup markup and styles use current terminology.
- `review-configuration.js`: `checkReviewConfiguration_()` uses the existing journal resolver and configuration/rubric validators to report per-assessment READY, MISSING, EMPTY or ERROR states. A journal conflict is retained against its assessment instead of discarding all assessment results. The server returns aggregate validity, readiness, presentation state and summary. Structural configuration errors still block setup.
- `dashboard-client-scripts.js`: `initializeAssessmentStorage()` retains the existing authorized setup RPC. `recheckReviewConfiguration()` displays server results without recalculating readiness rules, preserves the last successful assessment list on failed refresh, settles the shared loading lifecycle and disables setup until a successful validation permits it.
- `common-styles.js`: removed obsolete committee status styling and styled setup-required/error readiness states using existing theme rules.
- `rubric-config.js`: corrected the storage terminology in its read-only comment.
- `package.json`: points to the renamed setup test.
- README, DASHBOARD-PERFORMANCE, GUIDE-EVALUATION and PUBLISHING-IMPLEMENTATION documentation were corrected where they described removed setup behavior or endpoints. No policy implementation changed.

## Final Coordinator workflow

1. System Status loads committee membership and team assignments without an external storage identifier.
2. Assessment readiness calls `getCoordinatorReviewConfiguration_()`.
3. Definitions, assessment rubric criteria, dates, prerequisite configuration and journal compatibility are validated by server code.
4. Each configured Review shows its returned storage state. Missing or genuinely empty storage permits initialization; conflicts and invalid configuration block it.
5. Create missing assessment storage invokes `prepareReviewAssessmentStorage_()`, which authorizes the Coordinator/PD, obtains a lock, revalidates and preflights configured Review journals.
6. Missing tabs are created, empty tabs receive the header, and valid populated journals are preserved. Results and readiness are refreshed.

Storage READY does not authorize a particular team to enter marks. Existing reviewer assignment, title, opening, prerequisite and lifecycle checks continue to determine team entry availability. The directory does not calculate or display journal readiness.

## Final Reviewer and journal workflows

`configured REVIEW → reviewer assignment → Reviewer dashboard → Enter marks / View marks → ReviewEvaluations.open(team, assessmentId, button) → loadReviewEvaluation_ → rubric + roster + current evaluation → saveReviewEvaluationDraft_ / submitReviewEvaluation_ → append revision`

Instances use the configured Journal binding or `Assessment_<assessmentId>` in the main spreadsheet. The resolver, initialization behavior and nine-column schema remain unchanged:

`Assessment | Team | Student | Revision | Action | Actor | At | Request ID | Payload`

Initialization creates storage headers, not a student-by-rubric entry grid. Draft/save/submit writes student rows for a new revision to the resolved journal. No reviewer cell-editing workflow or alternate score-entry path exists.

## Tests and verification

Obsolete fixture fields and the test for existing external committee links were removed. A test that only checked deleted seeding names was replaced with a real zero-score submission/completion regression. Setup tests were renamed and their callers updated.

Coverage verifies:

- The real committee schema maps successfully using only nine assignment columns; reviewer lookup and directory rendering work with that data, and directory payloads have only number, members and teams.
- Setup works without external file creation/access, remains authorized and locked, and is idempotent.
- MISSING, EMPTY, READY and ERROR states come from the server. Empty tabs initialize once; conflicting headers/bindings/history fail without overwrite; existing rows remain unchanged.
- Review 1, Review 2 and Review 3 use the same setup/load/draft/submit path, with different rubric maxima where configured. Each writes only its correct journal.
- An arbitrary `design_gate` REVIEW uses default storage and generic draft/submission APIs without engine changes.
- Reviewer buttons route directly to the shared client. The client passes assessment IDs to generic APIs.
- Readiness renders server states verbatim, blocks duplicate reads, preserves results on refresh failure and permits retry. Setup blocks duplicate mutations and supports failure/retry.
- Existing attendance, makeup, finalization, reopening, provenance and publication tests remain in the complete suite.

Results: **181 focused tests passed; 376 full-suite tests passed; zero failures or skipped tests.** All **35 root JavaScript files** passed syntax compilation. `git diff --check` passed.

Hash comparisons against the start of this cleanup confirm no changes to `assessment-registry.js`, `review-evaluation.js`, `review-evaluation-client.js`, `review-academic-policy.js`, `evaluation-lifecycle.js`, `publication-events.js`, `internal-assessment-publishing.js` or `internal-assessment-publishing-client.js`. No Review-number-specific implementation was introduced.

## Repository search and boundaries

The working tree was searched with hidden/ignored project files included, excluding Git history and installed dependencies. The retired identifiers and exact UI phrases listed in the inventory have no occurrences in functional code, tests, configuration or operational documentation. Their only remaining occurrences are the historical removal inventory in this report. A broader search also matches the performance document's privacy statement about not logging committee or spreadsheet identifiers; that statement concerns telemetry privacy, not an entry/storage workflow.

No deployment, live spreadsheet modification, permission change, trigger change or data migration was performed. Tests use local spreadsheet and DOM fixtures. No live browser visual inspection was performed.
