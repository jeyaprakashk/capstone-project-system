# Review 1 evaluation

Review 1 uses the `review1` milestone ID, its date and weight in `Milestones`, and its criteria in `Rubrics`. It opens at midnight in the main spreadsheet's timezone seven calendar days before the due date. Late submissions remain allowed and are recorded.

Use the manually created `Review1Evaluations` tab in the main spreadsheet. Its header row must be: `Assessment`, `Team`, `Student`, `Revision`, `Action`, `Actor`, `At`, `Request ID`, `Payload`. `Student` contains the student's register number. The application validates these headers and never creates or replaces the tab. For a header-only tab using the earlier layout, insert `Student` immediately after `Team`. Existing populated team-row data must be converted before using this layout; changing its header alone is not a migration.

Assigned committee reviewers share a team draft. The provisional eligibility rule requires a nonempty, reviewer-approved project title; `review1Eligibility_` is the replacement point for the final policy. Team criteria are entered once, and individual criteria are entered separately for every student. The guide evaluation band validator calculates totals and weighted contributions. Incomplete drafts are allowed; submission requires all scores and feedback for levels below 2.

Submission locks the entire team evaluation. Coordinators use the Review 1 section in System Status to publish or reopen it. Publishing exposes each student's own scores and shared team criteria. Reopening requires a reason, clears scores, uses the current rubric/roster, and hides the previous publication while retaining its audit history. Review 2 requires Review 1 to be Submitted or Published for the current roster.

The new history is authoritative. Existing legacy level-only marks remain untouched and are not automatically imported, submitted, published, or counted as Review 1 completion. Review 2 and custom committee reviews continue using their existing marking sheets. File links and additional drawer content are deferred.

Each revision contains one row per student. Its `Payload.scores` includes the team criterion marks replicated for that student and only that student's individual criterion marks, with their total and weighted contribution. The faculty still uses one form: common team inputs and individual inputs labelled with student names. All student rows share the revision, action, actor, timestamp, request ID, roster and rubric snapshots and are written in a single range operation. Reads reconstruct the team form and reject incomplete or inconsistent revisions. Writes use a script lock, optimistic revision/token checks, and idempotent retries. Do not edit history rows manually.

Public endpoints: `getReview1Evaluation`, `saveReview1EvaluationDraft`, `submitReview1Evaluation`, `publishReview1Evaluation`, `reopenReview1Evaluation`, `loadCoordinatorReview1Evaluations`, and `loadPublishedReview1Evaluation`. The legacy Review 1 save endpoint rejects writes.

Run `npm test` for server lifecycle, validation, authorization, legacy isolation, completion integration, and client interaction tests. Live Apps Script deployment and browser visual checks are separate from these local tests.
