# Review 1 evaluation

Review 1 uses the `review1` milestone ID, its date and weight in `Milestones`, and its criteria in `Rubrics`. It opens at midnight in the main spreadsheet's timezone seven calendar days before the due date. Late submissions remain allowed and are recorded.

Use the manually created `Review1Evaluations` tab in the main spreadsheet. Its header row must be: `Assessment`, `Team`, `Student`, `Revision`, `Action`, `Actor`, `At`, `Request ID`, `Payload`. `Student` contains the student's register number. The application validates these headers and never creates or replaces the tab. For a header-only tab using the earlier layout, insert `Student` immediately after `Team`. Existing populated team-row data must be converted before using this layout; changing its header alone is not a migration.

Assigned committee reviewers share a team draft. The provisional eligibility rule requires a nonempty, reviewer-approved project title; `review1Eligibility_` is the replacement point for the final policy. Team criteria are entered once, and individual criteria are entered separately for every student. The guide evaluation band validator calculates totals and weighted contributions. Incomplete drafts are allowed; submission requires all scores and feedback for levels below 2.

Submission locks normal team scoring. Coordinators use System Status to publish or administratively reopen it. Full reopening requires a reason, clears scores, uses the current rubric/roster, and hides the previous publication while retaining its audit history. Reviewers resolve documented exceptions through targeted student assessments, without reopening the team. Review 2 requires a valid Review 1 team submission for the current roster; properly documented policy exceptions permit progression while those students remain individually incomplete.

The history is authoritative. Existing legacy level-only marks remain untouched and are not automatically imported, submitted, published, or counted as Review 1 completion. Review 2 now uses the same configurable engine and its own `Review2Evaluations` tab in the main spreadsheet. Custom committee reviews retain their existing marking sheets. File links and additional drawer content are deferred.

Each revision contains one row per student. Its `Payload.scores` includes the team criterion marks replicated for that student and only that student's individual criterion marks, with their total and weighted contribution. The faculty still uses one form: common team inputs and individual inputs labelled with student names. All student rows share the revision, action, actor, timestamp, request ID, roster and rubric snapshots and are written in a single range operation. Reads reconstruct the team form and reject incomplete or inconsistent revisions. Writes use a script lock, optimistic revision/token checks, and idempotent retries. Do not edit history rows manually.

Public endpoints: `getReview1Evaluation`, `saveReview1EvaluationDraft`, `submitReview1Evaluation`, `publishReview1Evaluation`, `reopenReview1Evaluation`, `loadCoordinatorReview1Evaluations`, and `loadPublishedReview1Evaluation`. The legacy Review 1 save endpoint rejects writes.

Run `npm test` for server lifecycle, validation, authorization, legacy isolation, completion integration, and client interaction tests. Live Apps Script deployment and browser visual checks are separate from these local tests.

## Review 2 configuration and deployment

Create `Review2Evaluations` manually **in the main spreadsheet** with the same nine headers listed above. An old committee-spreadsheet tab with that name is not the history store. Do not copy its level-sheet header or rows. No Review 2 marks have been entered, so no import is provided. Repeated reads validate setup without modifying either history tab.

Maintain `review2` in Milestones and its Team/Individual criteria in Rubrics. The engine reads Review 2's own maxima, PI/CO definitions, level descriptors, weight and date. It uses the same scoring architecture as Review 1 (level bands, half-mark increments and feedback below Level 2), without copying Review 1 rubric content. Both reviews open seven calendar days before their respective dates. Legacy committee-sheet Review 2 save RPCs reject writes.

Deploy server and client changes together. Existing Review 1 history is not migrated, rewritten or recalculated. Its public endpoints remain available; missing absence metadata defaults to Normal at read time. Review 2 endpoints mirror Review 1: `getReview2Evaluation`, `saveReview2EvaluationDraft`, `submitReview2Evaluation`, `publishReview2Evaluation`, `reopenReview2Evaluation`, `loadCoordinatorReview2Evaluations`, and `loadPublishedReview2Evaluation`.

## Absence and academic decisions

The reviewer records per-student absence facts and evidence. Normal implies attendance; Review-Day Absence implies nonattendance. Prolonged Absence additionally requires explicit approval, verified contribution and scheduled-review attendance. There is no editable assessability flag or inferred contribution.

`assessment.classification`, `assessment.status` and the existing review `status` are separate. Effective team/individual marks and criterion results have explicit component states; unresolved numeric values are `null`. Review totals and weighted contributions remain `null` while either required component is pending. Legitimate rubric evidence remains in `scores`; policy results are stored separately in `assessment`. Published student APIs expose effective marks in both `scores` and `assessment.effectiveScores`, so pending/withheld marks cannot appear as earned marks to existing result consumers.

Review-day absence always retains the common team score. Approved absence leaves the individual component pending makeup; unapproved absence assigns a policy zero. Prolonged absence uses explicit verified contribution to determine team eligibility and preserves legitimate individual rubric evidence. Approved absence without contribution remains an academic decision case; unapproved non-participation receives zero team marks without deleting existing individual evidence.

Only an assigned reviewer can call `recordReviewAbsence`, `recordReviewAcademicDecision`, or `saveReviewTargetedAssessment`. Inputs include `review`, team, student, revision, token, request ID, and reason. Decisions are `MAKEUP_ALTERNATIVE_ASSESSMENT`, `DEFERRED_ASSESSMENT`, `TEAM_MARK_APPLICABLE`, `TEAM_MARK_NOT_APPLICABLE`, or `OTHER`. Authorization identifies the pending `team`/`individual` components; assessment submission uses their existing rubric. Server-derived audit entries include actor, timestamp, reason and before/after status. Coordinator-only identity cannot make academic writes; existing administrative publish/full-reopen actions remain separate.

Targeted drafts keep effective marks pending. Targeted completion appends a complete atomic revision while retaining the common team scores and unaffected student payloads. Student-specific alternative team assessment is recorded separately from the common team rubric. No contribution factors or rescaling are used.

After submission/publication, absence fields and evidence pills are read-only. Assigned reviewers select **Edit absence correction**, then explicitly save or cancel the affected student's changes. Successful saves restore read-only mode; failed saves retain the entries for retry. Corrections preserve prior academic decisions, authorizations, draft/assessed rubric evidence, and makeup completion. If changed facts conflict with an existing team assessment decision, the correction is rejected without writing; the committee must resolve the academic-policy conflict rather than the application silently overriding the decision.

## Publication and completion

Targeted changes require publication for the affected student. Until then, students see their last published snapshot. Other students' published results stay intact. Publication can release one student or all pending results; explicitly invoking administrative full reopening still withdraws the whole review. Draft targeted marks are not exposed in published responses.

Completion counts use resolved individual results. Team progression uses valid submission with completed assessments or documented exceptions. Ordinary incomplete drafts cannot unlock Review 2, and no pending mark is converted to zero for progression.

Before production, run `npm test` and verify in a test deployment: mixed-status submission, Review 2 access with a pending teammate, reviewer-only decisions, targeted makeup, student-specific publication, unchanged teammate results, administrative reopen, and loading failure/retry behavior. Live account authorization, visual layout, keyboard behavior and reduced-motion checks require the deployed Apps Script application.
