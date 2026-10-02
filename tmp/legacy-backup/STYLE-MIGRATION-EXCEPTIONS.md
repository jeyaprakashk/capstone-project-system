# Styling migration exceptions

Source audit and migration on 2 October 2026. `UI-STYLING.md` and the supplied `app-styles.html` are the style authority. This migration added no CSS token, selector, or rule, and did not change dashboard workflows. Legacy style generators load before the framework in `dashboard-router.js`. Findings below are from source inspection and focused tests; they do not prove visual equivalence in a deployed Apps Script dashboard.

## Completed in this migration

| Existing source | Change | Why it is safe |
| --- | --- | --- |
| `common-styles.js:58` publishing tooltip | Kept one `cursor:help` rule; removed its identical duplicate and both legacy focus-outline rules. | The framework has one `.tooltip` implementation and a global `:focus-visible` ring. The duplicated `span[data-tooltip]` rules were in legacy CSS, not the framework. This `data-tooltip` element keeps its existing tooltip behavior and gains the framework focus ring. |
| `student-dashboard.js:110`; `common-styles.js` step node | Added `.circle` to the rendered node and removed its literal circular radius. | The framework class has the same `border-radius:50%` value. |
| `dashboard-client-scripts.js:264`; `common-styles.js` timeline dots | Added `.circle` to the rendered dot and core; removed their duplicate circular-radius declarations. | The timeline grid, step selection, expansion and mobile layout are unchanged. |
| `common-helpers.js:539`; `common-styles.js` announcement step number | Added `.circle` and removed the desktop circular-radius declaration. | The existing mobile badge-radius override remains, preserving its different mobile shape. |
| `guide-dashboard.js:308,347,408`; `guide-weekly-client.js:102,121` | Added `.marker-accent` and `.ring-selected` to the selected controls, synchronized them with the existing selection changes, and removed the matching legacy inset-shadow declarations. | The same classes follow the existing `aria-pressed` states. Colour, border, focus and selection behavior remain in their existing rules. |
| `coordinator-dashboard.js` stage-icon block; `common-styles.js` grouped editorial rules | Removed `.stage-icon` declarations and references. | No production markup or script outside CSS emits or queries `stage-icon`; source search found only these style rules. |

## Remaining framework exceptions

| File and element | Retained style | Reason |
| --- | --- | --- |
| `review-evaluation-client.js:988` review progress markers | `border-radius:50%` on `::before` | `.circle` cannot be attached to a pseudo-element without changing markup. |
| `common-styles.js:965,1307` announcement group heading | Asymmetric desktop and mobile top radii | `.rounded-top-card` uses two 16px top corners; replacing the existing 12px/mobile values changes the shape. |
| `dashboard-client-scripts.js:256`; `common-styles.js:1009-1053` project timeline | Dynamic grid and `--timeline-stops` | `.timeline--horizontal` uses flex, different connector geometry and a 520px vertical breakpoint. The existing timeline expands, hides out-of-context steps and changes layout at 760px. |
| `coordinator-dashboard.js:405,449,469` progress bars | Runtime width percentages | Width expresses measured progress; `UI-STYLING.md` permits literal width. |
| `dashboard-client-scripts.js:1494` assessment grid | Runtime `gridTemplateColumns` | Column count follows the available assessments; grid templates are permitted literals. |
| `guide-weekly-client.js:226`; `guide-dashboard.js:434` Guide action reserve | Runtime `--guide-action-reserve` | The measured action area height is needed to preserve the existing layout. |
| `icon-renderer.js:15,45-70` clipped-container tooltip | Fixed portal position and runtime left/top | The portal avoids clipping inside scroll regions; the adjacent framework tooltip would not preserve this behavior. |

## Button migration: framework classes only

Second pass on 2 October 2026, at the owner's request for strict framework classes. This pass deliberately changes button appearance across every dashboard; it does not change workflows.

| Area | Change |
| --- | --- |
| Variant classes | Removed `app-btn`, `btn-md`, `btn-secondary`, `btn-icon`, `btn-help`, `btn-success`, `btn-danger`, `btn-warning` and `btn-table-sort` from all markup, and their rules from `getStandardButtonStyles_`. Approve uses `.btn-primary`; Reject, Revise, help and sort headers use `.btn-outline`. Sort headers no longer show ↕/↑/↓; `aria-sort` on the header still carries the state. |
| Legacy button skins | Removed appearance (background, colour, border, radius, shadow, padding, font) from every legacy rule whose subject is a button, including the editorial theme's generic `button` rules, which outranked the framework classes. Layout declarations (display, grid, width, height, margin, gap) remain. |
| Pressed-state groups | `.segmented` on the tracker filters, announcement audiences, review PI pills, proficiency levels and feedback suggestions. Tracker filters now expose `aria-pressed`. |
| Card buttons | `.tile` / `.tile--selected` on rubric cards, Guide view cards and review student cards; `.tile--locked` on unavailable rubric cards. |
| Other bare buttons | Role menu toggle, publishing toggle and "Other remarks" use `.btn` variants. Role tabs keep `.tab`. |
| Status text | Overdue deadline filters show a `.badge--danger` "Overdue" label because the colour-only state was removed. |
| Removed aliases | `--pill-border`, `--pill-bg`, `--pill-text`, `--pill-active`, `--pill-hover`. |

### Retained exceptions from this pass

| File and element | Retained style | Reason |
| --- | --- | --- |
| `common-styles.js` `getButtonStyles` — `a.btn` | `text-decoration:none` | New rule. The framework underlines every `a`, and `.btn` does not reset it, so link buttons would be underlined. Remove if `app-styles.html` gains a reset. |
| `common-styles.js` `getButtonStyles` — `button, a.btn` | `display:inline-flex; align-items:center; justify-content:center` | `.btn` sets no display; this keeps icon and label aligned. Layout only. |
| `review-evaluation-client.js` `.review-stepper button` | `padding:0` | The stepper buttons sit in 26px grid tracks; `.btn-sm` padding would leave no room for the icon. |

## Further migration candidates

| Source | Candidate | Condition before removal |
| --- | --- | --- |
| `common-styles.js:965,1307` | Use `.rounded-top-card` for the announcement group heading. | Approve the changed corner geometry at desktop and mobile sizes. This is not an exact-value migration. |
| `common-styles.js:1287`; `dashboard-router.js:169-176` | Remove redundant 44px touch-target declarations where the framework coarse-pointer rule matches. | Width breakpoints also affect narrow mouse windows, and these legacy selectors cover controls beyond the framework list. Compare both pointer types before deleting. |
| `common-styles.js`, `coordinator-dashboard.js`, `dashboard-router.js`, `guide-dashboard.js`, `review-evaluation-client.js` | Replace off-scale spacing and legacy focus outlines with existing spacing and focus tokens/classes. | Match each rule's role and check the cascade. A 1px/2px/3px border-width allowance does not allow a literal outline, shadow, radius, spacing or font size. Existing focus outlines are not automatically equivalent to `--focus-ring`. |
| `review-evaluation-client.js:216,222,394` | Move the native grading dialog to framework drawer markup. | This requires a separate behavior migration, including focus and close handling; it is outside styling-only work. |

## Custom properties outside the framework

All names below still have source reads. No custom property was proven unused. These are not new framework tokens.

| Property | Definitions and reads | Disposition |
| --- | --- | --- |
| `--guide-action-reserve` | Set in `guide-weekly-client.js:226`, read in `guide-dashboard.js:434` | Retain measured layout property. |
| `--timeline-stops` | Set in `dashboard-client-scripts.js:256`, read in `common-styles.js:1009` | Retain while the dynamic grid remains. |
| `--stat-tone`, `--stat-tint` | Defined in `coordinator-dashboard.js:875-878` and `common-styles.js:1169-1172`; read in both generators | Used status aliases. The generators assign different values in some states; consolidate their state cascade before removing either alias. |

## Policy and verification boundary

The remaining component CSS includes literal padding, margin, gap, focus outlines and radii outside the allowed list in `UI-STYLING.md`. Width, height, min/max dimensions, grid column templates and 1px/2px/3px border widths may remain literal. Existing media queries include 1200/1201, 1100, 900, 800, 760, 640, 600 and 540; migrating to the 1024/860/520 mapping requires layout review at both sides of each changed breakpoint. Rubric container queries use container width and need separate review. Static source evidence does not establish computed styles or deployed visual fidelity.

Focused announcement, Guide, publishing and project-schedule tests passed (101 tests), and syntax checks passed for the touched JavaScript files. No live deployment or visual browser check was performed.

After the button pass, `npm test` ran 641 tests: 634 passed and 7 failed, the same 7 `team-github-setup` failures present before the pass. A local headless-Edge render of representative buttons with the shell's CSS stack was reviewed. No deployed Apps Script dashboard was checked.
