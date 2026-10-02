// Rebuild common-styles.js: shared skeleton renderer + functional rules only.
const fs = require('fs');
const src = fs.readFileSync('common-styles.js', 'utf8').replace(/\r/g, '');
const a = src.indexOf('/** Shared pure renderer, used on the server and embedded in the browser bundle. */');
const b = src.indexOf('\n}\n', src.indexOf('function getSkeletonMarkup_(')) + 3;
if (a < 0 || b < 3) throw new Error('skeleton renderer not found');
const skeleton = src.slice(a, b);
const css = fs.readFileSync('tmp/functional-final.css', 'utf8').trim();
if (/[`\\]|\$\{/.test(css)) throw new Error('css needs escaping');
const out = `/**
 * COMMON STYLES — dashboard styling comes only from app-styles.html.
 * This file keeps the shared skeleton renderer and the few rules the dashboard
 * needs to function (visibility toggles, overlay positioning, scroll regions,
 * screen-reader-only text). It defines no colours, spacing, typography or borders.
 */

${skeleton}
/** Functional rules only; loaded before app-styles.html by the dashboard shell. */
function getFunctionalStyles_() {
  return \`
${css.split('\n').map(l => '  ' + l).join('\n')}
\`;
}
`;
fs.writeFileSync('common-styles.js', out.replace(/\n/g, '\r\n'));
console.log('common-styles.js lines:', out.split('\n').length);
