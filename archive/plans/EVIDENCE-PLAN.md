# Evidence: plan

**Status: built and live.** Implemented 2026-10-13 and deployed by the owner. The owner approved the plan and the AGENTS.md change on 2026-10-13.
The rules are now in [AGENTS.md](../../AGENTS.md) ("Review entry" and "Students and Drive"), the sheets in [SHEETS.md](../../SHEETS.md) and the endpoints in
[DATA-CONTRACTS.md](../../DATA-CONTRACTS.md).

## What was planned

Copy the evidence files of a team (the topic folders below `2_Evidence` in its repository) into the team's Drive folder when a document is submitted,
show them next to the document to everyone with a role on the team, and open a Review only when the team has copied the minimum number of files the
coordinator set for it. Evidence never gates a document's approval.

## What was implemented

- `evidence.js`: the sheet readers and writers, the file rules (no dot files, no README files, at most 25 MB), the copy to `evidences/<path>` in the team
  folder, the Documents-screen view, and the Review gate (`evidenceGateItems_`).
- Four sheets in the catalog, created by `setupDocumentStorage`: `EvidenceFolders` and `ActivityEvidences` (filled in by the coordinator), `EvidenceCopies`
  and `EvidenceStatus`.
- Submit copies the evidence after the submission (a failure never blocks it); the student's **Copy evidence** and **Check for new evidence** buttons
  (`API_student_copyEvidence`, `API_student_checkEvidence`) do the rest.
- The team-file scan (`team-files.js`) saves the waiting counts from the tree it already reads, so the Documents screen reads no GitHub.
- The activity engine adds the evidence requirement to the Review activities; the Documents screen lists each Review's requirement beside the folders it uses.
- Tests: `tests/evidence.test.cjs`, `tests/document-api.test.cjs`, `tests/documents-view.test.cjs`. The invariants snapshots did not change.

## What differs from the plan, and why

| Planned | Built | Why |
|---|---|---|
| The gate is checked in `reviewEligibility_` | It is in the activity engine (`evidenceGateItems_`), for the Review activities only | So it appears in every checklist beside the other requirements; the title activities never read the sheets. |
| A missing `ActivityEvidences` sheet denies | A workbook without the sheet has no evidence requirement | The code can be deployed before setup runs without closing any Review. |
| Copy evidence carries a request ID | It does not | A copy is idempotent (only new or changed files), so a repeated click is safe. |
| Three sheets | Four: `EvidenceStatus` was added | Students and faculty found the screen slow. The screen now reads saved counts instead of GitHub (decision 15). |
| The screen lists the waiting files | It lists the copied files and the counts; the waiting and too-large files appear after Check for new evidence | Same reason (decisions 15 and 16). |
| Staff are exempt from the evidence gate | They are not: it behaves like the other `ActivityDependencies` rows. Only the Sequence (order) block exempts staff | The plan misdescribed the existing rule. |
| A student is shown "Add at least N files in <folder>" | The reviewer and student dashboards say only "Not Eligible"; the full checklist is on the coordinator's drawer, and the Documents screen lists each Review's requirement (decision 17) | The dashboards deliberately never show requirement details; the owner asked for the lines on the Documents screen. |
| Copy evidence only when files are waiting | When the saved count is not 0; an unknown count allows it | The copy itself finds out (decision 16). |
| (not planned) | The owner redesigned the Documents screen afterwards (Versions 206 to 208, `documents-view.js`) | Layout only: the DTO and the endpoints are unchanged. |
| Evidence by week | Not built. `Committed At` and `First Committed At` are recorded so it can be added (section 8) | Left as a future option, as planned. |

## The plan as it was written

The text below is the plan as it stood at the end of the work: it was edited during the work to say what the code does (sections 4 to 7 and decisions
15 to 17), except where the table above says otherwise.

## 1. What this does, in plain words

Every team repository has a folder `2_Evidence` with topic subfolders (Architecture, Budget, Design_Selection, Existing_Solutions, Final_Cost,
Integration, Need_Analysis, Requirements, Testing). When a team submits a document, the evidence files in that document's topic folders are
copied from GitHub into the team's Drive folder, and everyone with a role on the team can see them next to the document. A Review opens only when
the team has copied at least the minimum number of evidence files that the coordinator set for it.

Evidence **never gates the approval of a document** (many documents are approved already). It gates **Review entry** only.

## 2. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Folder to document | Sheet `EvidenceFolders`, filled in by the coordinator: one evidence folder belongs to **one** document, a document may have **many** folders. A folder with a blank Document ID is never copied. |
| 2 | Review gate | Sheet `ActivityEvidences`: `Activity ID`, `Evidence Folder`, `Minimum Files`. Many-to-many: a Review may need several folders and a folder may be needed by several Reviews. A Review with no row has no evidence requirement. |
| 3 | What is evidence | Any file under `2_Evidence/<folder>/`, subfolders included. Dot files and README files are excluded. Any file type. Largest file **25 MB** (a constant); a larger file is listed as "too large" and does not count. |
| 4 | Counting | Files actually copied to Drive (rows of `EvidenceCopies`) per team and folder, over the whole semester. No date window now (section 8). |
| 5 | Copy time | On Submit of the document, and by a **Copy evidence** button. |
| 6 | Changed files | A file is copied only if it is new or its blob SHA changed; a changed file updates the Drive file in place. |
| 7 | Deleted in GitHub | The Drive copy is **kept**. |
| 8 | Drive layout | `<team folder>/evidences/<Topic>/<file>`, the GitHub path below `2_Evidence`. |
| 9 | Failure | A copy failure never blocks or undoes a document Submit. The evidence shows "not copied yet". |
| 10 | Batch | One click copies at most a fixed batch (about 20 files and 60 MB, constants) to stay under the 6-minute limit; the next click continues. |
| 11 | Retry button | **Copy evidence** is shown on a document when the saved count of waiting files is not 0 (see decision 16). It works for documents submitted before this feature, and appends nothing to the document journal. |
| 12 | Already-approved documents | **No one-time script.** Their students use the button. |
| 13 | Who sees it | Everyone with a role on the team. Students see a link to each file, never a folder link. |
| 14 | Template scan unchanged | The template folders `1_Documents` and `5_Presentations` stay the only folders `TemplateFiles` scans. `2_Evidence` is not added to `TEMPLATE_FOLDERS_`. |
| 15 | Screen load reads no GitHub (2026-10-13, owner request: students and faculty found the screen slow) | The Documents DTO takes the waiting and too-large counts from a fourth sheet, `EvidenceStatus` (`Team ID`, `Document ID`, `Evidence Pending`, `Evidence Too Large`, `Checked At`; blank = unknown). The team-file scan writes it from the repository tree it already reads for every team (no extra GitHub call; an unreadable repository writes blanks), and Copy evidence writes it after each copy. The screen therefore shows counts up to one scan old and lists only the copied files. |
| 16 | Check for new evidence | A student button (after the document has been submitted) that reads the team repository now, shows the waiting and too-large files and saves the counts. It copies nothing. Copy evidence is offered when the count is not 0; an unknown count (never checked) allows it, because the copy itself finds out. |
| 17 | Requirement lines on the Documents screen (2026-10-13, owner request) | The Review gate's detail is otherwise only on the coordinator's drawer (the reviewer and student dashboards say only "Not Eligible"). Each document's evidence therefore lists, for every role, the `ActivityEvidences` rows that use its folders: "Review 1 needs at least 3 files in Requirements: 1 copied". Information only; the gate is unchanged. |

## 3. Four sheets

All are defined in the sheet catalog (`sheet-columns.js`), created by `ensureSheet_` in an editor-run setup, read and written by header name
(AGENTS.md "Sheet access").

- **`EvidenceFolders`**: `Evidence Folder`, `Document ID`.
- **`ActivityEvidences`**: `Activity ID`, `Evidence Folder`, `Minimum Files`.
- **`EvidenceStatus`** (decision 15): `Team ID`, `Document ID`, `Evidence Pending`, `Evidence Too Large`, `Checked At`.
- **`EvidenceCopies`**: one row per team and file: `Team ID`, `Document ID`, `Evidence Folder`, `Path`, `Blob SHA`, `Size`, `Drive File ID`,
  `Committed At`, `First Committed At`, `Copied At`. `Committed At` is the date of the last commit that touched the file; `First Committed At` is set
  once and never changed (section 8).

## 4. Copy flow

Authorize first (the caller is a member of the team), then copy. A copy is idempotent (a file is copied only when new or changed), so it needs no request ID. The script lock is taken for one file at a time and released between files, so other writes are never kept waiting for a whole batch; each file is looked at again under the lock, so two clicks never copy it twice.

1. Read the team repository's `2_Evidence` tree once. Keep the files of the document's folders that pass decision 3.
2. Compare with `EvidenceCopies`: new path, or a different Blob SHA, means copy.
3. For each file in the batch: fetch the bytes from GitHub, create or update the Drive file under `evidences/<Topic>/`, then write or update its `EvidenceCopies` row with `writeRecordSpan_`.
4. Return the evidence state of the document. Files left over (batch limit, too large, a GitHub or Drive error) are reported, not hidden.

A run that stops part-way leaves valid rows and the next click finishes it (the same convergent rule as the template scan).

## 5. The Review gate

`reviewEligibility_` also checks `ActivityEvidences` for the Review's Assessment ID: for each row, the team's `EvidenceCopies` rows in that folder
must number at least `Minimum Files`. A short count denies entry. A sheet that cannot be read, or a row that is not valid for its Review (no folder, a minimum that is not a whole number above 0), denies; an unreadable `EvidenceCopies` is "Could not verify". A workbook **without** the `ActivityEvidences` sheet has no evidence requirement (so the code can be deployed before setup is run without closing any Review), and a row naming an activity that does not exist gates nothing. The check lives in the activity engine (`evidenceGateItems_`), appended to the requirements of the Review activities only; the title activities are never read for it. A student sees
"Add at least N files in <folder>", never a diagnostic. Staff are not exempt (only the Sequence block is). A Submitted or Published evaluation stays
readable.

## 6. Display

`DocumentsDto` gets an additive `evidence` object per document: `{folders, files, copied, pending, tooLarge, checkedAt}`, `files` being `{path, name, folder, size, state, link, committedAt}` with `state` `COPIED`, `PENDING` or
`TOO_LARGE` (the last two only after Check for new evidence), and `can.copyEvidence` and `can.checkEvidence`. Counts come from `EvidenceStatus` (decision 15). `link` is a link to that one Drive file. `DATA-CONTRACTS.md`, the endpoint, its contract test and
`documents-view.js` change together.

## 7. Tests

- A shuffled-column test, a missing-header test and a duplicate-header test for each of the four sheets.
- Copy rules: new file, changed file, unchanged file, deleted file kept, dot and README skipped, oversize skipped, batch limit, retry after a failure.
- Gate: no row (no requirement), short count, enough, unreadable sheet (denied).
- DTO contract test and a student-link test (no folder link). No new browser module was added, so there is no page-assembly entry.
- `npm run test:invariants` stays green with no snapshot regenerated; `npm run check:sheets-doc` passes (`SHEETS.md` regenerated).

## 8. Later option, not built: evidence by week

`EvidenceCopies` records `Committed At` and `First Committed At` now, so a week filter needs no re-scan. Later: add a `Week ID` column to
`ActivityEvidences` (blank = whole semester, today's behaviour), and count only the rows whose date falls in that week's window. "Added in week N"
uses `First Committed At`; "touched in week N" uses `Committed At`. Copying, layout and the button do not change.

## 9. Owner approval needed (AGENTS.md)

- Under "Review entry": a Review is also gated by `ActivityEvidences` rows, counting copied files; dated as an owner-approved rule change.
- Under "Students and Drive": evidence files are copied under `evidences` in the team folder; a student sees a link to each file, never a folder link;
  nothing is hand-placed.
- The invariants snapshots did **not** change: with no `ActivityEvidences` row the Review rules behave as before, so `npm run test:invariants` passes unchanged and nothing was regenerated.

## 10. Out of scope

Evidence gating a document's approval or Submit; opening evidence inside the dashboard; a one-time copy script for approved documents; deleting Drive
copies; any change to the document journal, review marks or other academic rules.
