/** Shared Lucide SVG renderer for Apps Script HTML and browser updates. */
function renderLucideIcon_(name, label, className) {
  const nodes = getLucideIconNodes_();
  if (!Object.prototype.hasOwnProperty.call(nodes, name)) throw new Error('Unknown Lucide icon: ' + name);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const extraClass = className ? ' ' + escape(className) : '';
  const accessible = label ? 'tabindex="0" role="img" aria-label="' + escape(label) + '"' : 'aria-hidden="true"';
  return '<svg xmlns="http://www.w3.org/2000/svg" class="lucide-icon lucide-' + name + extraClass + '" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="' + (label ? 'true' : 'false') + '" ' + accessible + '>' + (label ? '<title>' + escape(label) + '</title>' : '') + nodes[name] + '</svg>';
}

function getLucideStyles_() {
  return `
  .lucide-icon { display:inline-block; width:16px; height:16px; flex-shrink:0; vertical-align:-3px; pointer-events:none; }
  .lucide-icon[aria-label] { pointer-events:auto; }
  .dashboard-tooltip { position:fixed; z-index:2147483647; max-width:min(280px,calc(100vw - 16px)); padding:7px 10px; border-radius:7px; background:#182230; color:#fff; font:12px/1.4 'Inter','Segoe UI',sans-serif; box-shadow:0 3px 12px rgba(0,0,0,.2); overflow-wrap:anywhere; pointer-events:none; }
  .dashboard-tooltip[hidden] { display:none; }
  .lucide-icon.icon-leading { margin-right:5px; }
  .lucide-icon.icon-trailing { margin-left:5px; }
  .lucide-icon.stat-icon { width:28px; height:28px; }
  .team-action-icon .lucide-icon, .team-drawer-close .lucide-icon { width:18px; height:18px; }
  .announcement-empty-icon .lucide-icon { width:24px; height:24px; }
  .step-node .lucide-icon { width:16px; height:16px; }
  .icon-spin { animation:lucide-spin 1s linear infinite; }
  @keyframes lucide-spin { to { transform:rotate(360deg); } }
  @media(prefers-reduced-motion:reduce) { .icon-spin { animation:none; } }
  `;
}

/** Delegated tooltip events also cover content replaced by asynchronous refreshes. */
function initializeDashboardTooltips_() {
  let tooltip = null, active = null, oldDescription = null, nativeTitle = null;
  function hide() {
    if (tooltip) tooltip.hidden = true;
    if (active) {
      if (oldDescription === null) active.removeAttribute('aria-describedby');
      else active.setAttribute('aria-describedby', oldDescription);
      if (nativeTitle !== null) active.setAttribute('title', nativeTitle);
    }
    active = null;
  }
  function show(target) {
    if (!target || !target.closest) return;
    const owner = target.closest('[data-tooltip], [title], svg[aria-label]');
    if (!owner || owner === active) return;
    const text = owner.getAttribute('data-tooltip') || owner.getAttribute('title') || owner.getAttribute('aria-label');
    if (!text) return;
    hide();
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'dashboardTooltip'; tooltip.className = 'dashboard-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltip);
    }
    active = owner;
    oldDescription = owner.getAttribute('aria-describedby');
    nativeTitle = owner.getAttribute('title');
    if (nativeTitle !== null) owner.removeAttribute('title');
    owner.setAttribute('aria-describedby', (oldDescription ? oldDescription + ' ' : '') + tooltip.id);
    tooltip.textContent = text; tooltip.hidden = false;
    tooltip.style.left = '0px'; tooltip.style.top = '0px';
    const rect = owner.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left + (rect.width - box.width) / 2, window.innerWidth - box.width - 8));
    const top = rect.top >= box.height + 16 ? rect.top - box.height - 8 : Math.min(rect.bottom + 8, window.innerHeight - box.height - 8);
    tooltip.style.left = left + 'px'; tooltip.style.top = Math.max(8, top) + 'px';
  }
  document.addEventListener('pointerover', event => show(event.target));
  document.addEventListener('focusin', event => show(event.target));
  function leave(event) {
    if (active && (!event.relatedTarget || !active.contains(event.relatedTarget))) hide();
  }
  document.addEventListener('pointerout', leave);
  document.addEventListener('focusout', leave);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  document.addEventListener('scroll', hide, true);
  document.addEventListener('click', hide);
  if (window.addEventListener) window.addEventListener('resize', hide);
}
