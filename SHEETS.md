# Sheets

Generated from `sheet-columns.js` by `npm run build:sheets-doc`. Do not edit by hand: change the catalog, run the build, and
commit both. `npm run check:sheets-doc` fails when this file is out of date. Design: SHEET-HEADER-MATCHING-PLAN.md ("Sheet catalog").

Catalog v1 lists the **new** sheets only. Existing sheets are added when the header-name migration completes the catalog.

- **Tab** shows the access mode: it decides the tab colour and whether the sheet is hidden, when the sheet is first created.
- **Status:** `new` (header-name access from the start), `migrated`, `positional` (not yet migrated), `retiring`.
- **Created at runtime:** only a sheet with this flag may be created by a runtime write (ENSURE-SHEET-PLAN.md, "Runtime mode").

| Key | Sheet | Tab | Headers | Status | Created at runtime | Purpose | Code |
|---|---|---|---|---|---|---|---|
| `activityDependencies` | `ActivityDependencies` | Visible, green tab (`edit`) | `Activity`, `Kind`, `Item`, `Label`, `Active` | new | No | Rules that gate student actions. The coordinator fills the rows. | None yet |
| `titleLog` | `TitleLog` | Visible, red tab (`view`) | `Timestamp`, `Team ID`, `Revision`, `Action`, `Actor`, `Request ID`, `Fingerprint`, `Status`, `Proposed Title`, `Proposed Problem`, `Notes`, `Similarity Note`, `Reopened`, `Approved Title`, `Approved Problem`, `Approved At`, `Approved By` | new | No | Append-only title history; the latest row of a team is its current title state. | None yet |
| `formArchive` | `TitleFormArchive` | Visible, red tab (`view`) | Taken from the source Form sheet at archive time (recorded in the verification report) | new | No | Values-only copy of the Form-period history, kept for one semester. | None yet |
