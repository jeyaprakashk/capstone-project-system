# Project conventions

For all dashboard UI work, follow [UI-STYLING.md](UI-STYLING.md). The single
stylesheet is `app-styles.html`; components must use its tokens and classes.
Keep that stylesheet exactly as supplied. During migration, if an existing
component has no matching token or class, retain its existing styling and
record the file, element, value, and purpose for review. Do not change UI
behaviour while migrating styling.

For asynchronous reads and refreshes, follow the behavior described in
[LOADING-UI.md](LOADING-UI.md). Preserve existing content on failed refreshes
and settle loading on every path.
