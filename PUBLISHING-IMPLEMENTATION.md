# Publishing implementation report

Implemented against the existing evaluation refactor on 28 September 2026. No deployment, live spreadsheet writes, journal provisioning or data migration was performed.

## Changes made

### Registry discovery and command routing

The Coordinator publishing sections and their refresh initialization now discover configured assessments instead of enumerating Review 1 and Review 2. Labels and ordering come from assessment definitions. Guide must be explicitly registered in AssessmentDefinitions; there is no Milestones fallback. This configuration-source change does not alter publication policy or snapshot semantics.

SEE is display-only and is excluded from publication discovery and commands.

`publication-events.js` registers two type adapters: REVIEW and GUIDE_EVALUATION. All configured Review instances use the same adapter and existing Review engine. Guide retains its individual evaluation and reopening behavior. Its team publication action remains a sequence of independent student commands, with partial-success reporting.

The public commands are:

- `publishInternalAssessment_({assessmentId, team, student?, revision, requestId})`
- `reopenInternalAssessment_({assessmentId, team, student?, revision, requestId, reason})`

Commands use explicit assessment IDs. Student result endpoints read publication snapshots.

### Academic authority and publication authority

Finalized evaluation revisions remain authoritative for academic facts, marks, outcomes and provenance. Publishing does not invoke the academic calculator.

A publication appends one `PUBLICATION` event to the existing assessment journal. It does not copy the evaluation payload. The journal envelope supplies assessment/team scope, aggregate revision, actor, timestamp and request ID. Its payload contains:

- An event ID, schema version and presentation version.
- The exact source academic revision and its integrity hash.
- Academic-policy version, rubric fingerprint and configuration fingerprint.
- Released student snapshots and their integrity hashes.
- The command fingerprint for idempotency.

Each snapshot contains the released identity, assessment label, displayed criterion labels/maxima, released scores and feedback, component states/sources, academic status, total and weighted contribution. It excludes attendance facts, private correction reasons, inactive assessment evidence, makeup drafts, audit-event history, unused rubric descriptors and unrelated students.

Academic and publication records are distinguished during journal reads. Publication metadata is combined with the academic record only in an in-memory lifecycle projection, preserving existing revision and locking behavior. That projection is never persisted as a replacement academic record. Source references and snapshot hashes are validated during reconstruction; inconsistent, conflicting or unsupported records fail closed.

### Correction visibility and permissions

For both Review and Guide, reopening retains the last published snapshot. Students see “Under correction” alongside the previous publication. Draft edits and resubmission do not replace it. Explicit republication replaces only the selected student's snapshot, or all selected team snapshots for a team command.

Makeup updates leave previous publications visible until republication. Academic pending remains distinct from publication permission: submitted makeup-pending outcomes can be published, with null preserved. Policy zero remains a resolved numeric zero.

Publication membership checks use canonical registers and team membership. Name/email corrections alone are accepted; membership changes or ambiguity block publication. Student access still resolves the current authenticated user to an unambiguous current identity.

Review reopening availability uses the existing rubric, configuration, canonical-membership and policy compatibility checks. The UI no longer suggests that incompatible Reviews can be repaired by reopening or that reopening clears Review evidence.

### UI and retry handling

The existing shared Coordinator table, filters, confirmations and loading helpers remain in use. Details display component state and policy/makeup provenance. Obsolete academic-decision labels were removed from the publishing status map.

Operation reconciliation checks confirmed journal request IDs for Review and Guide, including after later revisions. Uncertain successful requests therefore stop appearing as retryable failures. Retries retain their original IDs.

Student refreshes retain successful content on failure, deduplicate reads, provide retries and ignore callbacks targeting a replaced screen. The Guide result loader now uses the shared content-loading lifecycle.

## Verification

| Check | Result |
|---|---|
| Focused publishing/registry suite | 54 passed; 0 failed |
| Complete `npm test` suite | 379 passed; 0 failed; 0 skipped |
| Root JavaScript syntax parsing | 36 files passed |
| `git diff --check` | Passed |

Focused command:

```text
node --test tests/publication-events.test.cjs tests/assessment-registry.test.cjs tests/internal-assessment-publishing.test.cjs tests/internal-publishing-browser.test.cjs
```

Coverage includes immutable source evidence, minimal snapshot contents, corrupted source/snapshot references, duplicate events, unsupported presentation versions, null versus zero, correction visibility through draft and resubmission, isolated republication, membership guards, authorization, stale revisions, idempotent retries, partial Guide operations, uncertain outcomes after later commands, oversized-event rejection, refresh failure/retry, detached callbacks and existing keyboard/focus behavior.

Browser interaction checks use the repository's DOM test environment. No live Apps Script integration session or visual browser inspection was performed.

## Review 3 verification

The integration test adds Review 3 through spreadsheet fixture rows, gives it an 80-point Team / 20-point Individual rubric and configures Review 2 as its RECORDED prerequisite. The existing registry provisions its journal in the test environment.

The same production code discovers Review 3, renders its publishing section, publishes the team, reads the frozen student result, reopens the Review, retains the old publication, resubmits and republishes one student. The other students remain under correction with their previous snapshots. No Review 3 engine or publishing endpoint was added.

## Remaining limitations and operating requirements

- This release supports publication schema/presentation version 1. Future presentation changes must retain the version-1 rendering contract or introduce a separately supported version.
- Guide team publication is intentionally sequential, not an all-or-nothing team transaction.
- A publication event must fit the existing 45,000-character journal payload guard. Oversized releases are rejected before append; no automatic splitting was introduced.
- Journal reads currently reconstruct history in memory. Large-volume pagination/indexing remains future work.
- Existing experimental full-evaluation publication rows are not migrated or treated as the new event schema. Unsupported records fail closed. No production migration was authorized or executed.
- Definition IDs, journal bindings and referenced academic history must remain available. This phase does not implement renaming/moving journal history or rebasing incompatible Review assessments.
- Integrity hashes detect inconsistent stored data; they are not signatures protecting against an administrator who can rewrite both records and hashes.
- Configured definitions and journals still need normal operational setup before use. Tests used isolated spreadsheet fixtures only.

## Scope confirmation

The approved attendance truth table, scoring rules, makeup evidence preservation, policy version and Review copy-and-correct compatibility rules were not redesigned in this publishing phase. Guide academic behavior remains separate. Changes inside evaluation files connect publication aliases, distinguish journal record kinds and retain canonical membership metadata.

The working tree also contains the earlier evaluation refactor; the complete suite validates both sets of changes together. No deployment or live data modification was performed.
