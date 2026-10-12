# New team repositories from the template repository (plan)

Status: **built on `main` (2026-10-12), not pushed or deployed.** Phases 1 to 5 are done. Owner steps are in section 6.

## 1. What changes, in plain words

Today a new team repository is created **empty**, and the system then uploads every template file into it from files bundled in the
Apps Script project (`github-template.js` plus 30 files under `generated/`, about 3.6 MB). Adding or changing a template file means
rebuilding that bundle (the build script it names, `scripts/build-repo-template.cjs`, no longer exists) and pushing the code.

After this plan a new team repository is **made from the template repository on GitHub** (`ece-kalasalingam/capstone-team-template`) with
GitHub's own "create from template" call. The template repository becomes the single place where template files live. The bundle, its
installer and its tests are deleted.

The 62 existing repositories are **not touched**. They already hold the template files (the folder layout was installed by the system, and
`Review1_Presentation.pptx` was added with the PowerShell script).

## 2. Decisions (made here; say if you want one changed)

| # | Decision |
|---|---|
| 1 | Use GitHub's `POST /repos/{template}/generate` (owner = the organization, `private: true`, `include_all_branches: false`). The new repository starts with one commit holding the template's default branch. |
| 2 | The template repository must be marked **"Template repository"** in its settings. That is an owner step (section 6). The system account already needs read access to it for the daily template scan. |
| 3 | The repository name, the description (`Capstone project — Team X`), the saved URL in `TeamStatus` and the student access setup stay exactly as they are. Only the way the files get in changes. |
| 4 | **No bundle at all.** The template repository is read live when a repository is created. The daily template scan already reads it. |
| 5 | The baseline for "has the team changed this file" no longer comes from the bundle. It is the content the file had in the **first commit that touched it** in the team's repository, read once and kept (section 4). This also works for the existing repositories and for the pptx, which the bundle never listed. |
| 6 | `TemplateFiles.In Team Template` stays as a column (headers are frozen) but is no longer computed from a bundle. Every file found in the template repository is `Yes`; whether a team's repository really has the file is already decided per team by the team scan. |
| 7 | GitHub fills a generated repository a few seconds after it answers. The system waits for it (at most about 30 seconds, inside the existing lock). If it is still empty it stops with the existing "Retry GitHub setup" message; a retry never calls generate again because the repository already exists. |

## 3. Creation flow after the change

`repairTeamGithubSetup_` keeps its shape. Only the "repository is missing" branch changes:

1. The repository is looked up by its saved URL or its expected name, as today. If it exists, **nothing is generated** (so a retry can never make a second repository or overwrite files).
2. If it is missing and the name is the expected one, call `generate` on the template. A 404 or 403 from GitHub (template not marked, or no access) is reported as "The repository template is not available. Contact the coordinator." and nothing is saved.
3. Save the repository URL in `TeamStatus` (unchanged), then wait until the default branch has its commit (poll `git/ref/heads/{branch}`, short sleeps, at most 30 s).
4. Continue to the student invitations exactly as today.

Removed from this path: the `GITHUB_TEMPLATE_PENDING_*` script property, the receipt, the three-attempt install loop and
`resumeGithubTemplateInitialization_`. The commit author of the first commit is now the system account's GitHub login instead of
`System <system@capstone.local>`; nothing in the code filters on that name (searched), and the commit views already show a
non-team account as an "outside member".

## 4. Where the manifest is used today, and what replaces it

| Use today | Replacement |
|---|---|
| `team-files.js: teamFileBaselines_()`, the blob SHA each team's file started with | New column `Baseline Blob SHA` in `TeamFileStatus` (added at the right end by `setupDocumentStorage`, like any catalog change). The team scan already walks a file's commit history; the oldest commit on the path is the system's own. The scan reads the file at that commit once (`contents?ref=<sha>`), writes the blob SHA, and never reads it again. If the oldest commit on the path is by a linked teammate, or the history is longer than the search limit, the baseline stays blank and the file is `Unknown` (never `No`). |
| `template-files.js: templateManifestPaths_()` for `In Team Template` | Decision 6 above. |

The one-time cost is about one extra GitHub call per team and listed document (roughly 60 teams x 12 documents), spread over the daily batches.

## 5. Phases (each ends with a green `npm test`, `test:invariants`, `check:sheets-doc`)

1. **Baseline without the bundle.** Add `Baseline Blob SHA` to the `teamFileStatus` catalog entry (and `SHEETS.md`); teach the team scan to fill it from history; compare with the bundle's SHAs on the tests' fixtures; remove `teamFileBaselines_()`. Tests: shuffled, missing and duplicate header for the new column; a teammate-created file has no baseline and is `Unknown`; the baseline is read once.
2. **`In Team Template` without the bundle** (decision 6) and update `template-files.test.cjs`.
3. **Create from the template.** Replace `createTeamRepo_` with the generate call, add the readiness wait, drop the pending key and `resumeGithubTemplateInitialization_` from `repairTeamGithubSetup_`. Tests (fake GitHub): the exact generate request; template 404 gives the plain message and saves nothing; empty branch then ready; still empty after the wait gives the retry message; a second run with the repository existing makes no generate call; existing repositories are untouched.
4. **Delete the bundle.** `github-template.js`, `generated/` (manifest and 30 payloads), their tests and the stub in `tests/team-github-setup.test.cjs`; remove them from `.claspignore`/file lists if listed. Before this phase the developer checks that no `GITHUB_TEMPLATE_PENDING_*` script property exists (any left means a half-installed repository the old code must finish first).
5. **Documents.** Update `TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md` (sections 4, 5 and 16: the manifest and its rebuild no longer exist), `AGENTS.md` if it names the bundle, and `OWNER-CHECKLIST.md`.

Order matters: phases 1 and 2 first (they remove the last readers of the bundle), 3 next, 4 last.

## 6. Owner steps

1. In the template repository settings, tick **Template repository**.
2. After the code is deployed, create **one** test team repository (or use a test team row) and check: folders `1_Documents`, `2_Evidence`, `3_Design_and_Code_Files`, `4_Photos_Videos_Results`, `5_Presentations` and `README.md` are there, the pptx is in `5_Presentations`, and the students received their invitations.
3. Keep `Distribute-CapstoneReview1.ps1` outside the repository; it is a one-time tool and no longer needed once new repositories come from the template (template changes for **existing** repositories still need a script like it, by design: the system never changes a team's repository after creation).

### After the build

Before deploying: run `setupDocumentStorage` once (it adds the `Baseline Blob SHA` header). Delete any script property named `GITHUB_TEMPLATE_PENDING_*` (nothing reads it any more). The first daily team scan after deploy reads each file's baseline once; it makes about one extra GitHub call per team and document.

## 7. Not in this plan

Changing files in the 62 existing repositories; adding new template files to existing repositories; changing repository naming, visibility, branch protection or student permissions; changing which files are submittable (`TemplateFiles`, section 3 of the template-document plan).

## 8. Risks

- **Template not marked or not readable:** creation stops with a plain message and changes nothing. Found at the owner's test in section 6.
- **Template changed while teams are created:** each new repository gets the template as it is at that moment. The baseline (decision 5) is read from the team's own first commit, so it is always right for that team.
- **Generate answers before the files arrive:** handled by the wait and the retry message (decision 7); a repository is never generated twice.
- **Large template:** generate copies the whole default branch in one commit; the template is a few MB, well inside GitHub's limits.
