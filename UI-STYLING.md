# UI styling rules

All UI styling comes from the single stylesheet, [`app-styles.html`](app-styles.html).
Use its tokens and classes. Never hard-code hex values, font sizes, radii, or
shadows in components.
Keep the attached stylesheet unchanged. While migrating an existing screen,
retain styling with no matching token or class and record the file, element,
old value, and its role for review. Change styling only; preserve behavior.

- **Must use tokens:** spacing, radius, shadow, outline and focus ring, z-index, colour, font size.
- **Allowed as literals:** `width`, `height`, `min-*`, `max-*`, grid column templates, 1px, 2px and 3px border widths, and media-query breakpoints. Breakpoints follow the 1024, 860 and 520 mapping.

## Colour

- Use tokens only (`var(--primary)`, `var(--muted)`, and so on).
- `--text-strong-2` is for chip text and summaries only. `--text` is an acceptable substitute.
- `--muted` is the lightest text colour allowed. Do not introduce lighter greys.
- `--accent` (golden) is for the logo ring and the selected-team marker only. Never use it for text, buttons, or backgrounds.
- Late and danger text use `--danger` (`#B3261E`).
- Info status reuses `--info`, the same hue as primary.
- Avatars cycle `--avatar-1`, `--avatar-2`, `--avatar-3` in that order, with white initials.

## Status and accessibility

- Show status with both colour and a text label, such as Approved, Pending, or Late.
- Keep links inside body text underlined.
- Every focusable element shows `--focus-ring`. Replace an outline before removing it.
- Inputs, selects, and checkboxes use `--control-border`. Outlined text buttons use `--outline`.

## Typography

- Use `--font` (Source Sans 3) for UI text. Use `--font-mono` only for commit codes.
- Load weights 400, 600, and 700 only. Do not use weight 500 or italics.
- Body text is 14px (`--fs-body`). Headings are at least `--fs-h3` (15px).
- The minimum size is 12px, only for `.text-badge`, `.btn-sm`, and `code`/`.mono`.
- Use `.text-hero`, `.text-kpi`, `.text-meta`, `.text-label`, and `.text-badge` for text styles. Do not use `.label`, `.kpi`, or `.hero-title`.
- Use `.num` for dates, counts, and percentages.
- Render student project titles with `.title-case`, or normalize on save.
- Render student free text with `.student-text` to retain line breaks.

## Monospace commit codes

- Wrap every commit code in `<code>` or give it `.mono`.
- Use `--font-mono` only for commit codes, never for repository names, links, dates, or other text.
- Commit codes use `--fs-badge` (12px). Do not load a web monospace font.

## Sizes and shape

- Heights: button 34px, small button 30px, large button 40px, input 38px, navigation item 40px, avatar 36px, top bar 60px.
- Radii: card 16px, tile 14px, button and input 8px, badge 6px, chip 12px.
- Center content at a maximum width of 1100px inside a full-width shell with a 240px sidebar and top bar.

## Components

- Stage lists use `.nav-item`, with `.nav-item--active` on the selected stage.
- Team selection uses `.segmented` and `aria-pressed` on the active button.
- Disabled controls use `--soft` for background and `--muted` for text.
- Selected tiles use `.tile--selected`, with a tint background and 2px primary border.

## Fonts

If Google Fonts cannot be used, replace the stylesheet's `@import` with
self-hosted `@font-face` rules for weights 400, 600, and 700 using
`font-display: swap`.

## Motion and loading

- Use the `.anim-*` classes and tokens `--dur-fast`, `--dur` and `--ease` for motion. No custom durations, easings or keyframes in screens.
- Loading regions get `aria-busy="true"`. Use `.skeleton` shapes (`aria-hidden="true"`) plus one `<span class="sr-only">Loading</span>`.
- Inline waits use `.spinner` or `.spinner--sm`. Unknown-duration progress uses `.progress--indeterminate`.
- Never animate layout properties (width, height, margin). Animate opacity and transform only, except the existing progress bar width.

## Overlays and navigation

- **Modal:** `.overlay > .modal` with `.modal-header`, `.modal-body` and `.modal-footer`. Set `role="dialog"`, `aria-modal="true"` and `aria-labelledby`. Trap focus, close on Esc, and return focus to the trigger. Use it for confirmations and short forms only.
- **Drawer:** `.drawer-scrim` plus `.drawer` with `.drawer-header`, `.drawer-body` and `.drawer-footer`. Use it for detail or edit panels. It has the same ARIA and focus rules as the modal.
- **Tooltip:** `.tooltip > trigger + .tooltip-text` with `role="tooltip"` and `aria-describedby` on the trigger. Use it for short hints only. Never put essential information in a tooltip, because touch users can't see it.
- **Tabs:** `.tabs[role="tablist"] > .tab[role="tab"][aria-selected]` with a matching `.tabpanel[role="tabpanel"]`. Use `hidden` on the inactive panels.
- **Timeline:** `<ol class="timeline">`, with `.timeline-item.is-done` or `.is-current`. A step's state must also be written as text, never shown by colour alone.
- **Pagination:** `<nav aria-label="Pagination" class="pagination">`. Mark the current page with `aria-current="page"`.
- **Z-index:** use only the `--z-*` tokens. Never write a raw z-index number.
