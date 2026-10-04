# Review evaluation

The marking interface is the web-app `ReviewEvaluations` drawer. The assessment journal is persistence and audit storage. Reviewers enter marks in the drawer, not in journal cells.

## Instance configuration

Each row in `AssessmentDefinitions` defines an instance: Assessment ID, Type (`REVIEW`), Label, Sequence, Weight (%), Opening, Due Date, Prerequisites, Academic Policy Version and Journal. Instances use a supported code-controlled policy; configuration binds the version rather than implementing policy.

Journal defaults to `Assessment_<assessmentId>` in the main spreadsheet identified by `SHEET_ID`. An explicit Journal binding overrides the default. Assessment ID selects the matching criteria from `Rubrics`. IDs, labels, rubrics, dates and prerequisites are configuration; adding Review 3 or an arbitrary future REVIEW does not require another engine or endpoint.

Prerequisites are definition-driven JSON entries such as `[{"assessmentId":"design_gate","condition":"RECORDED"}]`. The common evaluator enforces them. Opening is explicit, not calculated from a Review number.

## Coordinator setup and readiness

If the definitions tab is missing, **Create assessment definitions tab** creates only
the eleven parser-defined headers. No instance, date, weight, rubric, prerequisite
or policy binding is supplied. Use the direct definitions link to configure instances
in the sheet, then Recheck. Missing, empty and invalid definitions block storage setup
and produce an explicit configuration message on the Reviewer dashboard.

System Status presents two separate concerns:

- Committee directory: reviewer membership and assigned teams.
- Assessment readiness: the server validates definitions, assessment rubric criteria, schedule and journal compatibility, and returns each assessment's state and errors.

`READY` means configuration and journal checks succeeded. `MISSING` means storage must be created. `EMPTY` means an existing blank journal needs initialization. `ERROR` identifies a configuration/storage problem that must be corrected. These are server results, not rules reimplemented by the browser.

Team entry availability additionally requires the existing assignment, title approval, opening, prerequisite and lifecycle checks. A ready journal alone does not authorize or unlock an evaluation.

**Create missing assessment storage** calls `prepareReviewAssessmentStorage_()`. It authorizes the Coordinator/PD, obtains a script lock, revalidates configuration and invokes `provisionAssessmentJournals_()` for all supported configured assessments, including Guide. No new Drive file is created or shared.

The resolver uses an explicit/default name and the existing normalized name lookup. For a default binding, a compatible journal can be recognized by assessment identity. Ambiguous histories, incompatible schemas, conflicting bindings, foreign data and nonempty blank-valued cells fail without overwriting data. Provisioning preflights definitions, initializes genuinely empty tabs and preserves populated journals. Re-running setup is idempotent. Service failures are not transactional; a retry retains valid storage already initialized.

## Reviewer workflow

`Reviewer dashboard → Enter marks / View marks → ReviewEvaluations.open(team, assessmentId, button) → loadReviewEvaluation_ → shared drawer → saveReviewEvaluationDraft_ / submitReviewEvaluation_ → append revision`

The generic APIs load the configured rubric, current roster and latest evaluation. Server checks enforce authorization, prerequisites, lifecycle, input completeness, revision concurrency and request idempotency. Team criteria are assessed once; Individual criteria and attendance facts are entered per student. Drafts may remain incomplete; submission and makeup follow the existing academic strategy.

## Persistence and publication

The journal schema is:

`Assessment | Team | Student | Revision | Action | Actor | At | Request ID | Payload`

Storage initialization writes the header, not a student-by-rubric grid. Saves and submissions append student rows for the new revision. Existing journal evidence is preserved.

Academic policy remains in `review-academic-policy.js`; common revision infrastructure remains in `evaluation-lifecycle.js`. Reopening preserves historical evidence and provenance; corrected facts determine applicability. A makeup result never becomes normal assessment evidence automatically.

The finalized evaluation revision is authoritative for academic assessment. Publication events reference that exact revision and freeze only the released data and integrity metadata. The existing student result interface reads publication snapshots, including the existing correction/republication behavior. See [Publishing implementation](PUBLISHING-IMPLEMENTATION.md).

## Absence corrections after submission

For every configured REVIEW, assigned reviewers can select **Edit absence details** on a student with an existing absence or pending makeup, then **Save absence details** or **Cancel editing** without reopening the team evaluation. Completed absence cases remain accessible even when another student has pending makeup. Only the selected student's absence fields become editable; rubric marks stay locked. The summary previews unsaved outcomes using the same policy as the server.

`recordReviewAbsence_({assessmentId, team, student, revision, token, requestId, absence})` uses the shared command lifecycle and appends an `absenceCorrection` revision. It checks reviewer assignment, prerequisites, finalized status, existing-absence eligibility, configuration/roster compatibility, concurrency and idempotency. It accepts only absence facts, validates supporting evidence, and rejects attended classifications without the required normal individual scores; those cases require coordinator reopening.

Corrections preserve original submission timing, common team scores, individual rubric evidence, makeup drafts/completed evidence and provenance, earlier events, and other students. Corrected facts determine evidence applicability under the current policy. An automatic event stores actor, timestamp, request ID, and before/after facts and outcomes; no correction reason is required. The corrected student needs publication and the evaluation returns to Submitted. Existing published snapshots remain visible with an update pending until explicit republication.

Failed saves retain entries and retry IDs. Failed reloads retain the correction form; navigation and cancellation confirm before discarding unsaved changes. Deploy UI and server changes together. No journal migration or policy-version change is required.

## Verification

Run `npm test`. Storage/registry, committee assignment, UI readiness, generic evaluation, academic policy and publication suites cover the workflow. Changes to local code do not initialize live storage or deploy the application automatically.

Approved absences offer optional supporting-evidence selections: medical document, official approval/permission, and other supporting evidence. Selecting Other requires a description before submission (maximum 2000 characters). These selections and descriptions are stored with the evaluation revision; this is a record of evidence reviewed, not a document upload. Evidence is hidden and omitted when approval does not apply.
