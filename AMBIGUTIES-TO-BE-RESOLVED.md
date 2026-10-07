# Ambiguities to be resolved

Found by reading the code only; no tests were run and no code was changed. Each item is something the code leaves open: two parts of the system that disagree, a rule that is implied but not stated, or a behaviour that depends on an unstated assumption. Items are decisions to make, not confirmed bugs, unless marked otherwise.

Part 1 covers locking. Part 2 covers everything else.

---

## Part 1 — Locking

### Current lock styles

| Style | Where | Behaviour on contention |
|---|---|---|
| `getScriptLock().tryLock(0)` | `fetchAllCommits` (`logbook-tracker.js:189`) | Skips silently, returns `[]` |
| `tryLock(1000)` | `reviewer-dashboard.js:23`, `assessment-storage-setup.js` (twice) | Throws "Try again" |
| `tryLock(5000)` | `evaluation-lifecycle.js:16` (review, guide evaluation, publish) | Throws "Retry shortly" |
| `waitLock(30000)` | commit append and status, provisioning (3 entry points), invitation resend, student GitHub, team folders | Blocks up to 30 s, then raw platform error |
| Re-entrant `hasLock()` wrapper | `weeklyLock_` (`logbook-tracker.js:268`), `githubIdentityLock_` (`github-identity.js:70`) | Reuses a lock the caller already holds |
| `getUserLock().tryLock(1)` | `processWeeklyProgressAI` (`weekly-progress-phase2.js:207`) | Skips silently |
| No lock | Guide decision, `setConfig_`, `updateTeamStatusRepoUrl_`, intake, similarity flag | None |

### L1. Guide decision has no lock; the reviewer decision does
`API_guide_submitDecision` → `submitGuideDecision_` (`guide-dashboard.js:87`) → `applyGuideDecision_` takes no lock. It reads then writes TeamStatus and also sends mail and edits the title. `submitReviewerDecision_` locks the same row. Because only one side locks, a guide write can interleave with a reviewer decision, and the registry append can duplicate under a race.

### L2. Timeouts differ with no stated reason
Values 0, 1, 1000, 5000 and 30000 ms are used with no shared constant or rationale. A reviewer decision waits 1 s while an evaluation save waits 5 s; both are user-facing saves. `waitLock` throws a raw platform error where `tryLock` paths show a friendly message, so the same condition looks different to users.

### L3. One script-wide lock serves unrelated work
Every `getScriptLock()` is the same lock (commits, weekly progress, identity, evaluation, provisioning, team folders). Long jobs (`syncCoordinatorGithubAccess_`, `provisionTeamRepos_`, 30 s waits) can block unrelated short saves such as a student's weekly submit. No document says whether one shared lock is intended.

### L4. Re-entrancy exists in only two places
`weeklyLock_` and `githubIdentityLock_` check `hasLock()`; other holders cannot be nested. Calling a `weeklyLock_` function from inside `evaluationCommand_` works, the reverse would time out. `processWeeklyProgressAI` holds a user lock then calls `weeklyLock_`; the nesting order is not documented.

### L5. README and code disagree about the user lock
`README.md:147` says "No user lock is used" (in the commit-collection section). `processWeeklyProgressAI` does use `getUserLock()`. A user lock only prevents overlap if one account owns the trigger.

### L6. Three concurrency patterns mixed
`fetchAllCommits` takes the lock only to claim a 15-minute lease in script properties, then works unlocked; `writeCommitCollectionStatus_` and `appendCollectedCommits_` re-lock per team. Which writes are protected by the lease and which by the lock is not written down.

### L7. Release safety differs
`syncCoordinatorGithubAccess_` acquires inside `try` and wraps `releaseLock` in try/catch. Most others acquire before `try`. `weeklyLock_` and `githubIdentityLock_` skip release when they did not take the lock; the other paths do not.

### L8. Unlocked sheet writes
- `setConfig_` (`common-helpers.js:70`): scan then single-cell write, no lock. One caller (`github-provisioning.js:552`) is under the lock.
- `updateTeamStatusRepoUrl_`: same. Callers are `github-provisioning.js:372` (locked) and `team-github-setup.js:211` inside `repairTeamGithubSetup_` (no lock in its own file).
- `progress-eligibility.js` writes via `setValues`; it is covered only if every caller goes through `weeklyLock_` (call sites at lines 73 and 245).
- `onTeamIntakeSubmit` writes TeamStatus with no lock.

### L9. Lock before authorization
`applyReviewerDecision_` runs under the reviewer lock and checks authorization inside it, so a non-reviewer can briefly hold the lock. The guide endpoint checks access first and then does not lock.

**Not verified:** whether callers of `repairTeamGithubSetup_` and the progress-eligibility writers already hold a lock; whether the intake trigger can race a dashboard write in practice.

---

## Part 2 — Other ambiguities

### A. Business rules defined twice or in two places

**A1. `ACADEMIC_YEAR` is read two ways.** `intake-approval-workflow.js:8` sets `const ACADEMIC_YEAR = getAcademicYear_()` at file load (runs on every script load, throws if Config is incomplete). `progressTitleDate_` calls `getAcademicYear_()` at call time. The registry row is written with the load-time value and matched later with the call-time value; a Config change between the two (or a stale warm instance) leaves eligibility stuck on `WAITING_TITLE`. `SHEET_ID` (`common-helpers.js:9`) has the same load-time pattern.

**A2. Title approval date comes from a fuzzy registry match.** `progressTitleDate_` matches year, semester, team, guide email, title text and approver, then takes the last match. Title text uses exact `String(a)===String(b)` while the rest of the code lowercases and trims. A title edited after approval, or a team approved twice, has no defined winner. Registry appends are never de-duplicated.

**A3. Two definitions of "approved".** `getTeamStatus_` (`guide-dashboard.js:77`) returns `APPROVED` once the reviewer decision is Approved, regardless of the guide decision. The reviewer path requires guide approval first. `applyGuideDecision_` can overwrite the guide decision after reviewer approval (no "already approved" guard, unlike `submitReviewerDecision_`). A reviewer "Revise" clears the guide decision; a reviewer "Approved" followed by a guide change resets nothing.

**A4. Guide and reviewer decisions validate differently.** The reviewer path allows only Approved or Revise and requires notes for Revise. The guide path writes any value (including an empty one) after case normalisation. Only `Approved` and `Rejected` send mail; `Revise` sends none. The similarity limit `0.75` is hard-coded in `applyGuideDecision_`, and the intake path uses its own value.

**A5. "Similarity" is a hybrid, not one measure.** `similarity_` returns 1.0 for exact or reordered-word matches, the word-Jaccard if it is at least 0.5, otherwise a trigram score. The score is discontinuous (word 0.5 vs trigram 0.49 mean different things). The comment says "trigram Jaccard".

### B. Time, windows and eligibility

**B1. Boundary comparisons are inconsistent.**
- `weeklySubmissionState_` allows edits while `at <= deadline_at` / `at <= late_until` (inclusive).
- `calculateProgressEligibility_` picks the first window with `deadline_at >= fixing` (a title approved exactly at a deadline lands in that week).
- `getLogWeekSummary_` counts a week missing only when `now > late_until` but "current" only when `now <= deadline_at`; between deadline and cutoff the week is neither.
- Reminders stop at `at >= deadline_at` (exclusive).
- A student who becomes eligible mid-week is held to that whole week.

**B2. `eligibleFrom` and `enforcedFrom` have no stated difference.** `calculateProgressEligibility_` sets both to the same week. Reads use `enforcedFrom` for what is required and `eligibleFrom` for what is allowed. `reconcileProgressEligibility` treats a row with `enforcedFrom` but no `eligibleFrom` as `held` and never touches it; which process creates that state is unclear.

**B3. Mixed time bases.** Window times are epoch ms, project milestones are civil-day numbers, sheet values may be Date objects or strings. `progressDateMs_` accepts a string or Date but returns `NaN` for numbers. `processWeeklySubmissionSchedule` re-reads `Date.now()` per window, so the clock can move mid-run.

**B4. Missed entries are a trigger side effect.** `appendMissedWeeklyEntries_` writes `MISSED` rows only when the schedule trigger runs. A closed week whose trigger has not run is counted missing by `getLogWeekSummary_` while no `MISSED` row exists.

**B5. Effective entry rule.** `getEffectiveLogEntries_` keeps the last row per student and week; `weeklySubmissionState_` ignores `MISSED` rows when finding the first submission. What should happen when a `MISSED` row is appended after a real submission is not defined.

### C. Identity, roles and data shape

**C1. Role detection can disagree with authorization.**
- The app runs as `USER_DEPLOYING` with `DOMAIN` access; `Session.getActiveUser().getEmail()` can be blank for users outside the deployer's domain, and role detection depends on it.
- A student's role comes from TeamStatus, but `weeklyStudents_` also requires TeamRoster to match TeamStatus exactly, or it throws. A mismatched student sees the shell but fails every weekly call.
- The reviewer role needs committee membership and at least one team on that committee; server endpoints may not repeat the second check.
- The router treats a blank `CELL_PD_EMAIL` as "not set", but `getConfig_('CELL_PD_EMAIL')` throws on blank; `activityIsCoordinator_` does not guard it the same way.

**C2. Student and reviewer slots are fixed at four.** `S1`–`S4` and `REVIEWER1`–`REVIEWER4` are repeated across many functions; a fifth member is silently unsupported. "Is a student" differs: `weeklyStudents_` requires email and Reg No unless the whole slot is blank, while `getTeamLogWeekSummary_` filters by email only.

**C3. `emailsMatch_` and `textEquals_` are the same normalisation.** Both lowercase and trim. Aliases and `+tag` addresses are treated as different people; whether that is intended is unstated.

**C4. Duplicate headers resolve differently.** `buildColumnMap_` keeps the last matching column; `weeklyLogColumns_` and `progressEligibilityStorage_` require exactly one and throw. A duplicated TeamStatus header silently uses the right-most column.

**C5. `Repo URL` is outside the declared schema.** It is not in `FIELD_DEFINITIONS.TEAM_STATUS`, is found by header lookup in four places, and is auto-created by `updateTeamStatusRepoUrl_`. This touches the frozen sheet-layout rules in `AGENTS.md`; a decision is needed on whether it is part of the schema.

**C6. Sheet-name sources mixed.** Most code uses `SHEET_NAMES.*`, but `'Config'`, `'Milestones'` and `'ProgressEligibility'` are hard-coded, and `SHEET_NAMES` mixes key styles (`GuideSignoff` vs `TEAM_STATUS`).

### D. Review marking policy (`review-academic-policy.js`)

**D1. Overlapping attendance states.** `PROLONGED` with `verifiedContribution:false` and `attended:true` skips the approval check; with `attended:false` approval is required. What "Approved" means shifts by type.

**D2. Level and mark rules.** Marks must be half-mark steps inside the level band. Level 5 allows up to maximum; lower levels use strict `<` on the next band. The bands `[0,40,60,75,85,95,100]` are a code constant, not in the rubric configuration. Remarks are required only below level 2.

**D3. Two meanings of "completed".** A policy-assigned zero team mark counts as `RESOLVED`, so a team can be `COMPLETED` with no scored evidence. `frozenTeam` bypasses all checks and what freezes it is not visible in this file.

**D4. Policy version is a literal in two places** (`'review-attendance-v1'` in the constant and again in `reviewPolicyCalculate_`).

### E. Operations and structure

**E1. Inconsistent failure shapes.** Failures come back as a thrown error, `{ok:false}`, or `{skipped:true}`. `API_guide_signWeekly` converts `ok:false` to an error; `API_guide_submitDecision` goes through `apiWorkflowResult_`. "Busy" is `{skipped:true}` for the AI job and `[]` for commit collection.

**E2. Module-level caches on a warm instance.** `_rcColumnsCache`, `_committeeRowsCache`, `_columnMapCache`, `configExecutionValues_` and `milestonesExecution_` are described as per-execution, but a reused web-app instance can keep them across requests. The committee cache has no reset path, while `getSheetRows_` has explicit snapshot scoping.

**E3. Silent failures that look like success.** `getDashboardUserName_` swallows every error and falls back to the email. A failed reminder email is only logged. The weekly AI failure logs a fixed message that drops the error. Missing data returns `''` in some helpers and throws in others.

**E4. Documentation drift.** `AGENTS.md` and README quote numbers (bundle sizes, "15 role combinations", the "7 failures at Version 127") that go stale with each version bump. `api-envelope.zip` and `releases/` sit beside the code with no description.

---

## Decisions still needed

- Is a guide re-decision after final approval intended?
- Which process creates a row with `enforcedFrom` set and `eligibleFrom` empty?
- Is `Repo URL` part of the frozen TeamStatus schema?
- Is one shared script lock intended, and what timeout policy should apply per path?
- Is instance reuse a real risk for the module-level caches in this deployment?
