// Lists legacy CSS rules (everything before app-styles) whose subject is a button and that set appearance properties.
const fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({ escapeHtml: s => String(s), console });
for (const f of ['lucide-icons.js', 'icon-renderer.js', 'common-styles.js', 'coordinator-dashboard.js', 'guide-dashboard.js', 'reviewer-dashboard.js', 'review-evaluation-client.js', 'internal-assessment-publishing-client.js'])
  try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); } catch (e) {}
const router = fs.readFileSync('dashboard-router.js', 'utf8');
const inline = router.slice(router.indexOf('${getLucideStyles_()}') + 21, router.indexOf('${getEditorialStyles_()}'));
const call = n => { try { return vm.runInContext(n + '()', ctx); } catch (e) { return ''; } };
const gens = ['getGuideStyles', 'getCoordinatorStyles', 'getWorkflowStyles_', 'getReviewerStyles', 'getReviewEvaluationStyles_', 'getSharedTimelineStyles_', 'getLoadingStyles_', 'getDashboardSurfaceStyles_', 'getLucideStyles_'];
let css = gens.map(n => '/*@' + n + '*/' + call(n)).join('\n') + '/*@router-inline*/' + vm.runInContext('`' + inline + '`', ctx) + '/*@getEditorialStyles_*/' + call('getEditorialStyles_');
// Internal publishing CSS is injected separately; include it if it exists.
for (const n of ['getInternalAssessmentPublishingStyles_']) css += '/*@' + n + '*/' + call(n);
css = css.replace(/\/\*(?!@)[\s\S]*?\*\//g, '');
const BTN_CLASSES = 'announcement-refresh-btn tab-refresh-btn link-button action-link view-all team-action-icon filter-tab deadline-pill reset-btn run-sync-btn timeline-toggle timeline-retry rubric-assessment rubric-view-button announcement-add-btn workflow-btn role-tab-btn role-menu-toggle team-drawer-close mini guide-team-option publishing-toggle publishing-icon-action review-other-feedback github-form-jump drawer-repo-link btn-solid btn-outline btn btn-primary btn-sm btn-lg'.split(' ');
const APPEAR = /^(background(-color)?|color|border(-(top|right|bottom|left))?(-(color|radius|width|style))?|border-(top|bottom)-(left|right)-radius|box-shadow|padding(-(top|right|bottom|left|inline|block))?|font(-(size|weight|family))?|text-transform|letter-spacing|text-decoration)$/;
const isButtonSubject = sel => {
  const last = sel.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
  const base = last.replace(/::?[a-z-]+(\([^)]*\))?/g, '');
  if (/(^|[^-\w])button\b/.test(base.replace(/:is\([^)]*\)/g, m => m))) return true;
  if (/:is\([^)]*\bbutton\b/.test(last)) return true;
  return BTN_CLASSES.some(c => new RegExp('\\.' + c.replace(/-/g, '\\-') + '(?![\\w-])').test(base));
};
let gen = '?', out = [], i = 0, depth = [], buf = '';
const re = /\/\*@([\w-]+)\*\/|((?:(?!\/\*@)[^{}])+)\{|\}/g; let m, stack = [];
while ((m = re.exec(css))) {
  if (m[1]) { gen = m[1]; continue; }
  if (m[2] !== undefined) {
    const head = m[2].trim();
    if (head.startsWith('@')) { stack.push({ at: head }); continue; }
    const end = css.indexOf('}', re.lastIndex), body = css.slice(re.lastIndex, end); re.lastIndex = end + 1;
    const sels = head.split(',').map(s => s.trim());
    const hits = sels.filter(isButtonSubject);
    if (!hits.length) continue;
    const props = body.split(';').map(d => d.trim()).filter(Boolean).map(d => d.split(':')[0].trim()).filter(p => APPEAR.test(p));
    if (props.length) out.push({ gen, at: stack.map(s => s.at).join(' '), sel: hits.join(', ').replace(/body\[data-dashboard-theme="editorial"\]\s*/g, 'E '), allSel: sels.length, props: [...new Set(props)].join(' ') });
    continue;
  }
  stack.pop();
}
for (const r of out) console.log(`[${r.gen}]${r.at ? ' ' + r.at : ''} ${r.sel}${r.allSel > 1 ? ` (+${r.allSel} sel)` : ''} :: ${r.props}`);
console.log('TOTAL', out.length);
