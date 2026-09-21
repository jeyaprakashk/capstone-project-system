# Dashboard icons

The dashboard uses Lucide inline SVGs, including the student dashboard. No icon font, CDN script, DOM replacement pass, or legacy icon registry is used.

- `lucide-static` is an exact-version development dependency. It is not loaded in the browser or in Apps Script.
- `scripts/build-icons.cjs` selects the icons and produces the deployable `lucide-icons.js`. The generated file includes Lucide and Feather license notices, also preserved when embedded in the browser script.
- `icon-renderer.js` contains the shared `renderLucideIcon_(name, label, className)` function and icon CSS. `dashboard-client-scripts.js` embeds the same renderer and selected SVG paths for dynamic updates.
- Call `renderLucideIcon_('check', 'Completed')` for a meaningful standalone icon. For icons beside visible text or inside an already labelled control, omit the label so the SVG is decorative.
- Use `icon-leading` or `icon-trailing` for spacing and `icon-spin` for loading indicators. Colors inherit from the existing status or control.

To add an icon, add its Lucide name to the build script, run `npm run build:icons`, and use the shared renderer. Run `npm run check:icons` and `npm test` before deployment. Do not edit the generated file. Deploy both root-level icon files with the other Apps Script files.

Plain-text log and email symbols are not UI icons and remain plain text.
