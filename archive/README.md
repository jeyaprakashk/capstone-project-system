# Archive

Documents of work that is finished. They are kept as the record of what was planned, what was built and why it differs. Nothing in the
code reads them. The current rules are in [AGENTS.md](../AGENTS.md); the generated sheet reference is [SHEETS.md](../SHEETS.md).

## plans/

Each plan begins with **What was planned**, **What was implemented** and a table of differences with the reason. The plan as it was written follows
under "The plan as it was written".

| Plan | Outcome |
|---|---|
| [TITLE-REVISION-PLAN.md](plans/TITLE-REVISION-PLAN.md) | Built and live: the title log, the workflow in the dashboard, the cutover. The student document upload and all e-mail were removed on request. |
| [ENSURE-SHEET-PLAN.md](plans/ENSURE-SHEET-PLAN.md) | Built: `ensureSheet_`, in use for every sheet whose creating code runs in an editor-run setup. |
| [ACTIVITY-DEPENDENCIES-SHEET-PLAN.md](plans/ACTIVITY-DEPENDENCIES-SHEET-PLAN.md) | Built: the `ActivityDependencies` sheet. It has no rows, so no requirement is enforced. |
| [ACTIVITY-DEPENDENCIES-PLAN.md](plans/ACTIVITY-DEPENDENCIES-PLAN.md) | Built: the engine, the `github` and `drive` checks and `API_coordinator_getRequirements`. |
| [SHEET-HEADER-MATCHING-PLAN.md](plans/SHEET-HEADER-MATCHING-PLAN.md) | Built: every sheet is read and written by header name; AGENTS.md no longer freezes column order. |
| [FORM-SHEET-RETIREMENT-PLAN.md](plans/FORM-SHEET-RETIREMENT-PLAN.md) | Executed: the Form sheets are gone from the code; the owner's backup replaced the archive steps. |

Still open and not archived: [STUDENT-IDENTITY-PLAN.md](../STUDENT-IDENTITY-PLAN.md) (not built), [BUILD-ORDER.md](../BUILD-ORDER.md) (item 14 is
open) and [OWNER-CHECKLIST.md](../OWNER-CHECKLIST.md) (section D lists the remaining owner steps).
