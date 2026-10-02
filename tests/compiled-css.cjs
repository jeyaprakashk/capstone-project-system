// Helpers for asserting against the compiled Tailwind stylesheet.
const fs = require('node:fs');
const css = fs.readFileSync('tailwind-styles.html', 'utf8');
const escapeSelector = name => '.' + name.replace(/([:\/.\[\]%#&])/g, '\\$1');
const compiled = name => css.includes(escapeSelector(name));
/** Class names in rendered markup (or in a literal string) that the build did not generate. */
function missingClasses(classNames) { return [...new Set(classNames)].filter(name => name && !compiled(name)); }
function renderedClasses(root) {
  return Array.from(root.querySelectorAll('[class]')).flatMap(n => n.getAttribute('class').split(/\s+/).filter(Boolean));
}
module.exports = { css, compiled, missingClasses, renderedClasses };
