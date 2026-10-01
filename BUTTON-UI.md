# Shared action buttons

Use `app-btn`, one size class, and one color class for every action button or
button-style link. `getStandardButtonStyles_()` in `common-styles.js` owns their
geometry, typography, colors, icons, focus, hover, and disabled states.

| Size | Minimum height | Font | Use |
| --- | --- | --- | --- |
| `btn-sm` | 30px | 12px | Refresh, Email Team, table actions, retry, pagination |
| `btn-md` | 36px | 13px | Routine actions, draft saves, opening evaluations |
| `btn-lg` | 44px | 14px | Main form submissions |

Small controls use a 36px minimum on coarse pointers. Text can wrap when needed;
these are minimum heights, not clipping constraints.

| Variant | Use |
| --- | --- |
| `btn-primary` | Main action, submit, publish |
| `btn-secondary` | Refresh, email, view, cancel, reload |
| `btn-help` | Borderless help or explanation trigger; pair with `btn-icon` and a labelled question-mark icon |
| `btn-success` | Approve or accept |
| `btn-warning` | Revise, reopen, or request corrections |
| `btn-danger` | Reject or destructive actions |
| `btn-custom` | Deliberate feature-specific color, using shared size and shape |

```html
<button type="button" class="app-btn btn-sm btn-secondary">Refresh</button>
<a class="app-btn btn-sm btn-secondary" href="mailto:team@example.com">Email Team</a>
<button type="submit" class="app-btn btn-lg btn-primary">Submit</button>
```

Add `btn-icon` for square icon-only actions, together with an accessible label.
Add `btn-table-sort` for sortable table headers. This shared variant inherits
the header typography and uses a transparent, borderless surface with a subtle
direction indicator; its styling stays in `getStandardButtonStyles_()`.
Use the shared Lucide renderer; icon sizes follow the button size automatically.
Custom variants accept `--button-custom-bg`, `--button-custom-color`,
`--button-custom-border`, and corresponding `--button-custom-hover-*` properties.
Prefer the semantic variants when they describe the action.

Feature classes may control placement, width, or margins. Do not override button
font size, padding, height, border, or colors in feature styles. Preserve `hidden`,
disabled, and loading behavior. Navigation tabs, disclosure controls, rubric
cards, and assessment choice controls are distinct components; retain their
layout and selected-state styling instead of turning them into action buttons.

## Disabled appearance

`getStandardButtonStyles_()` owns the disabled appearance for all buttons,
including navigation controls, and `app-btn` links with `aria-disabled="true"`.
Use the shared `--color-disabled-bg` (#E8EAED), muted text, subtle solid border, full
opacity, and not-allowed cursor. Do not add feature-specific disabled colors
or opacity. Existing button dimensions and layout remain unchanged.

For an availability-gated control, use `disabled-button-label` on its label
with a bundled lock icon, and `disabled-button-caption` for its availability
text. Keep the date in its tooltip. Do not add lock icons to temporary loading
states. Styling does not disable links: retain their existing activation guards.
