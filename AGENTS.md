# Project conventions

For asynchronous UI reads and refreshes, follow [LOADING-UI.md](LOADING-UI.md).
Reuse the shared skeleton renderer, refresh lifecycle helper, and loading styles.
Preserve existing content on failed refreshes and settle loading on every path.

For action buttons and button-style links, follow [BUTTON-UI.md](BUTTON-UI.md).
Use the shared `app-btn` size and semantic color classes; keep geometry and color
definitions in `getStandardButtonStyles_()` rather than feature-specific CSS.
