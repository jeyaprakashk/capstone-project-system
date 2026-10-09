# Title Revision Plan

Title submission, confirmation, revision and amendment on a gate layer.

## 1. Goal and scope

Move title submission into the dashboard, harden the title decisions, and add coordinator-controlled amendment of an approved title. Every "may this happen now?" check sits behind one gate layer, so document, weekly-log and assessment prerequisites can be added later without touching the call sites.

**In scope:** decision hardening, the log, the gate layer, dashboard title submission, unlinking the Google Form, removing the registry append, and the amendment.

**Out of scope (later plans):**

- the document registry, and the evaluators for document, weekly-log and assessment prerequisites;
- where prerequisite configuration is stored, and coordinator waivers;
- the semester-end registry action;
- cleanup of the background-job and provisioning locks;
- the document upload workflow.

## 2. Decisions

- Titles are submitted in the dashboard, and the Google Form is unlinked. Documents are a separate workflow.
- An amendment reuses the existing workflow. Reopening returns the team to "awaiting student revision", and the reviewer's final approval makes the new title effective.
- While an amendment is pending, TeamStatus shows the proposal as the team's title. Weekly logging and review marking continue.
- Reopening is refused while any member's progress eligibility is not fixed.
- The approval date moves from the registry to a log. The registry append leaves the approval workflow.
- Stale decisions are fixed here. Every user-facing save uses one lock helper (5 s).
- Document links in TeamStatus are display-only, and no gate reads them.
- No similarity check against superseded titles in this plan.
- The structure is: weekly logs per student, a configurable list of documents per team, a configurable list of assessments per team. Weekly logs are weekly, not daily.

## 3. Frozen and protected

- Not changed: `SHEET_NAMES`, `FIELD_DEFINITIONS`, the TeamStatus layout, the registry layout, the review rubrics and attendance rules, and role detection.
- The five new `TeamIntakeRaw` columns are outside `FIELD_DEFINITIONS`, so the schema snapshot does not see them. A guard test freezes them.
- `npm run test:invariants` stays green.
- Phases 0 and 5 are deliberate changes outside the migration. If a snapshot legitimately changes there, stop and regenerate only with explicit approval, in that phase's commit.

## 4. The log (`TeamIntakeRaw`, script-owned after Phase 4)

Existing columns used: `Timestamp` (a real date), `Email Address` (the actor), `Team ID`, `Project Title`, `Problem Statement`. Legacy form rows stay, and every reader ignores any row without an `Event Type`.

| New column | Content |
|---|---|
| Amendment ID | Set on amendment events |
| Event Type | `SUBMITTED`, `REFUSED`, `REOPENED`, `CANCELLED`, `TITLE_APPROVED` |
| Request ID | Idempotency key for student writes |
| Notes | Reason, decision notes, refusal reason, similarity note |
| Snapshot | On `REOPENED`: approver, decision notes and similarity flag to restore on cancel |

- On `REOPENED`, the approved title and problem go in the existing title and problem columns.
- An amendment is active from the latest `REOPENED` for a team until a later `CANCELLED` or `TITLE_APPROVED`.
- Order is by row number, never by timestamp.
- If the headers are missing or duplicated, any endpoint that needs the log refuses before writing, with a clear message. It never creates headers silently.
- An editor-run setup function adds the headers once. It is idempotent and starts with `requireTriggerOrOperator_()`.

## 5. The gate layer

One file, `activity-gates.js`. A gate function takes an activity key and a subject (team row, student, actor) and returns `{allowed, reason, unmet}`, like `reviewEligibility_` does now.

- **Built-in rules** are code. They are the frozen academic and authorization rules and are never configurable.
- **Configured prerequisites** are the hook `requirementsFor_(activity)`. It returns an empty list in this plan, so behaviour is exactly today's. The later plan fills it.
- Configuration can only add requirements. It can never remove a built-in rule.
- Requirements are checked when the action happens, not retroactively.
- Negative actions are never gated.
- Server endpoints and dashboard DTO flags (`canDecide`, `enabled`, readiness messages) call the same gate, so they cannot disagree.
- A weekly-log requirement is invalid on `title_submit`, `title_guide_approve` and `title_reviewer_approve`, because weekly logs need an effective title. This is the cross-kind cycle rule for the later loader. It is valid on the amendment activities.

**Title activities:**

| Activity | Built-in rules | Configured prerequisites |
|---|---|---|
| `title_submit` | Team member from the session; no approval yet; not under review; similarity | Hook |
| `title_guide_approve` | Recorded guide; a title exists; reviewer has not decided | Hook |
| `title_reviewer_approve` | Committee member; guide approved first | Hook |
| `title_reopen` | Coordinator; title fully approved; approval date on record; no active amendment; every member's eligibility fixed; reason given | Hook |
| `title_amend_submit` | Member of a reopened team | Hook |
| `title_amend_guide_approve` | As `title_guide_approve` | Hook |
| `title_amend_reviewer_approve` | As `title_reviewer_approve`, plus no unfixed member | Hook |
| `title_return` (guide reject, reviewer revise) | Authorization only | Never gated |
| `title_cancel` | Coordinator; no `TITLE_APPROVED` after the `REOPENED` | Never gated |

Downstream gates move behind the same layer, with their built-in rules unchanged: `weekly_submit`, review marking, the reviewer list's enabled flags, `canDecide`, and the coordinator flags. For these, the built-in test is "title effective and eligibility fixed", and the hook adds configured prerequisites.

## 6. Phases

Each phase passes `npm test`, `npm run test:migration`, `npm run test:invariants` and `npm run check:tailwind` before the next starts.

### Phase 0: decision hardening (deliberate change, own commit)

1. **Shared lock helper.** `getScriptLock().tryLock(5000)`, message "Another save is in progress. Try again shortly.", released in `finally`. Authorize before locking, recheck state inside, never nest inside `weeklyLock_`. Apply to:
   - guide decisions (new lock);
   - reviewer decisions (1 s to 5 s);
   - the evaluation saves in `evaluation-lifecycle.js` (routed through the helper, same behaviour);
   - the `assessment-storage-setup.js` paths (1 s to 5 s).

   Leave background jobs and the long provisioning and GitHub `waitLock(30000)` paths alone.
2. **Guide after final approval.** `applyGuideDecision_` refuses when the reviewer decision is `Approved` or `Revise`, or there is no title. This also stops a guide's title edit overwriting an approved title.
3. **Decide on what you saw.** Both decision calls take the title and problem the person was looking at. The server compares them inside the lock and refuses with "This title changed since you opened it. Refresh and review again." No DTO field is added. Update `DATA-CONTRACTS.md`, the views and the tests together.
4. **Repeat decisions.** The same decision on an unchanged row returns success without resending mail.
5. **Decision values.** The guide path accepts only Approved, Rejected or Revise, and requires notes for Rejected and Revise, as the reviewer path does.

### Phase 1: foundation (no behaviour change)

- Log setup function, header guard test, log reader and writer.
- `titleApprovalDate_(team, row)`: reads the latest `TITLE_APPROVED` row matching team, title and approver, with a fallback to the registry match for teams approved before the change.
- The gate layer with the built-in rules above, and `requirementsFor_` returning an empty list.
- Re-point the existing sites to the gates: `logbook-tracker.js:424` and the readiness message near line 477, `reviewEligibility_` and `review-evaluation.js:15`, `reviewer-api.js:16` and `reviewer-api.js:31`, `reviewer-dashboard.js:29`, the guide decision precondition, and `coordinator-dashboard.js:57, 307, 317`.
- Grep every use of `getTeamStatus_` and `REVIEWER_DECISION` to confirm the site list is complete.
- **Gate:** golden masters prove identical results for every team state, with the hook empty.

### Phase 2: dual-write approval events

- `applyReviewerDecision_` appends a `TITLE_APPROVED` row first, then writes the decision, and still appends the registry row.
- `progressTitleDate_` and `readGuideApprovals_` read through `titleApprovalDate_`.
- If the log headers are missing, approval is refused before anything is written.
- **Gate:** eligibility and guide-date fixtures are identical to the registry's.

### Phase 3: dashboard title submission (a migration under `AGENTS.md`)

1. Golden master of `onTeamIntakeSubmit` for fixed fixtures (`tests/title-intake.test.cjs`, `tests/team-github-setup.test.cjs`).
2. New `API_student_submitTitle`, beside the old handler:
   - The team is derived from the session via TeamStatus. A team ID is never accepted as input.
   - Gate: `title_submit` or `title_amend_submit`, chosen by team state on the server.
   - It applies the same rules in the same order as the handler: membership, blocked when approved or under review, registry similarity at 0.75, the cross-team flag, the decision and notes reset, title cleanup and upper-casing, and the guide mail.
   - The team's own registry rows are skipped in the similarity check.
   - It never writes the document-link fields. This is the one deliberate behaviour difference, recorded in the comparison.
   - A client `requestId` makes it idempotent. It uses the lock helper, appends `SUBMITTED`, and mails the guide.
   - Refusals for authorization or similarity append `REFUSED`, deduplicated by `requestId`. A caller with no team goes only to the Apps Script log. No alert mail is sent.
3. Student view: a two-field form with a similarity or refusal message and the current status. It uses the bridge, Tailwind utilities, `data-*` hooks and delegated events, and is disabled until the call settles. It replaces the "Submit title" and "Resubmit title" link in `student-api.js`.
4. **Document links are display-only.** Add a test: with links blank and with links populated, weekly submission, review marking, decisions, reopen and the gates behave identically, and submitting a title leaves both link fields untouched. Add a view test that the reviewer card renders a blank link cleanly.
5. Compare against the golden master. The Google Form stays linked until it passes.

### Phase 4: unlink the form

- Unlink, delete the trigger, and remove `onTeamIntakeSubmit`, its tests and its `GUARDED` entry in `tests/entry-point-guard.test.cjs`.
- Remove the config keys `TEAM_INTAKE_FORM_URL_BASE` and `TEAM_INTAKE_TEAMID_ENTRY`, and `buildTeamIntakeLink_`.
- Update the student DTO and `DATA-CONTRACTS.md`.
- **Before this phase:** confirm the separate document workflow keeps the guide's "documents submitted" date working (`guide-dashboard.js:60-72`).

### Phase 5: remove the registry append (deliberate change)

- `applyReviewerDecision_` stops writing the registry. Approval writes the log row, then the decision and `Title Approved By`, and no longer touches the hub spreadsheet.
- **Gate:** eligibility and guide-date fixtures are still identical, and `test:invariants` is green.

### Phase 6: coordinator-controlled amendment

**Reopen** (coordinator only, server-side check, reason required, 500 characters at most). The gate `title_reopen` requires all of:

- reviewer and guide decisions are `Approved`, and the title is not blank;
- `titleApprovalDate_` finds the approval for the current academic year;
- no active amendment exists;
- every current member's eligibility is fixed. Otherwise it refuses and names how many students are unresolved.

On reopen, under the lock:

- Append `REOPENED` with the snapshot.
- Set `Reviewer Decision` to `Revise` with the reason as `Reviewer Notes`, and clear `Guide Decision`. This mirrors a reviewer revision today.
- The old title stays in TeamStatus until the students resubmit.
- Mail the students and guide.

**Resubmit and decisions:** the ordinary Phase 3 and Phase 0 paths. The guide's title edit works as today. Active-amendment mails carry one extra line that the previous approved title stays in effect until final approval.

**Final approval:** the existing reviewer approval, gated by `title_amend_reviewer_approve`. It refuses while any current member is unfixed, which covers a member who joined during the amendment. The `TITLE_APPROVED` row carries the Amendment ID and closes the amendment.

**Cancel** (coordinator, reason required): restore the snapshot to TeamStatus (title, problem, decisions and notes, approver, similarity flag), append `CANCELLED`, and mail the students and guide.

**Weekly and review gates:** the only change is inside the gate layer, where "title approved" becomes "approved, or an active amendment exists". The call sites do not change. For teams with no amendment the result is identical, proven by the Phase 1 golden masters.

**DTOs and UI:**

- Guide, reviewer, student and team-drawer data gain an optional `amendment` object (reason, the approved title, reopened date). It is present only for an active amendment, so existing fixtures and snapshots do not change.
- The coordinator drawer gets "Reopen title" and "Cancel amendment", loads on open, and shows read-only history from the log.
- The student form shows the reason and the current approved title.
- The guide and reviewer cards show the current approved title beside the proposal.
- Register modules under their role bundles and in `ROLE_MODULES` in `tests/page-assembly.test.cjs`. Rebuild Tailwind after any class change.

## 7. Contracts and entry points

- Every new `API_*` endpoint starts with its own authorization check. Helpers end in `_`.
- Add to `tests/entry-point-guard.test.cjs`: `API_student_submitTitle`, `API_coordinator_reopenTitle`, `API_coordinator_cancelAmendment`, `API_coordinator_getAmendment`, and the editor-run log setup function. Remove `onTeamIntakeSubmit`.
- `DATA-CONTRACTS.md` gets the submission DTO, the `amendment` object, the new decision arguments, the gate result shape, and each endpoint's request shape and errors. Contract, endpoint, contract test and view change together.
- Add every new test file to the `test` and `test:migration` scripts in `package.json`.

## 8. Verification

- **Phase 0:** no guide decision after reviewer approval or revise; stale title or problem refused; repeated decision sends no second mail; invalid values refused; two decisions racing under the lock.
- **Phase 1:** golden masters identical across every team state for every re-pointed gate; a hook returning a requirement blocks the action with its reason (tested with a stub), and never blocks `title_return` or `title_cancel`.
- **Phase 2:** the header guard; log dates match the registry's; approval refused with missing headers; the registry fallback for legacy teams.
- **Phase 3:** golden master against the old handler; session-derived team; idempotent `requestId`; `REFUSED` rows and no alert mail; the own-registry-row skip; the document-link tests.
- **Phase 5:** no registry write on approval; fixtures identical.
- **Phase 6:** reopen preconditions, including the unfixed-eligibility block; one active amendment; weekly submission and review marking keep working while pending; cancel restores everything; final approval closes the amendment; a late-joining unfixed member blocks final approval; a weekly-log prerequisite on a fresh title activity is flagged invalid; no change for non-amended teams.

## 9. Operator rules

1. Run the log setup function before Phase 2 goes live.
2. Do not clear or archive `TeamIntakeRaw` while the log holds the only approval dates.
3. Do not roll TeamStatus over to the next semester until the semester-end registry action exists and has run.

## 10. Known limits

- Reviews and results show the proposed title while an amendment is pending. This is accepted.
- Published results show the live team title, so results published before an amendment will show the new one.
- There is one shared script lock for everything. A long provisioning job can make a title save fail with the friendly message. It fails safely.
- Phase 2 overlaps with the Google Form still linked. Both write to `TeamIntakeRaw` until Phase 4, which is a small risk.
- After final approval, the registry stays out of date until the semester-end action ships. Similarity for this semester's titles relies on TeamStatus, and superseded titles are in the log only.
- No coordinator waiver exists for a prerequisite once the hook is filled.
