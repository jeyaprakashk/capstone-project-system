// Helpers for asserting against the compiled Tailwind stylesheet.
const fs = require('node:fs');
const css = fs.readFileSync('tailwind-styles.html', 'utf8');
const escapeSelector = name => '.' + name.replace(/([:\/.\[\]%#&(),=@])/g, '\\$1');
// Hook classes carry no styles: scripts and tests find elements through them.
const HOOK = /^(review-|publishing-|lucide|app-skeleton|timeline-|rubric-|committee-|setup-|student-|expandable-text|role-|dashboard-|team-drawer|tab-refresh|stat-|coordinator-|tracker-|shared-)/;
const compiled = name => HOOK.test(name) || css.includes(escapeSelector(name));
/** Class names in rendered markup (or in a literal string) that the build did not generate. */
function missingClasses(classNames) { return [...new Set(classNames)].filter(name => name && !compiled(name)); }
function renderedClasses(root) {
  return Array.from(root.querySelectorAll('[class]')).flatMap(n => n.getAttribute('class').split(/\s+/).filter(Boolean));
}
module.exports = { css, compiled, missingClasses, renderedClasses };
