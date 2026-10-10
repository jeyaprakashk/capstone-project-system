/**
 * SHARED TABS — browser module serialized into every dashboard page as `SharedTabs`.
 * The one definition of the workspace tab strip used by the Guide and Reviewer dashboards. Below md it is a
 * bottom bar (icon over a short label) showing four tabs; the rest open from "More" in a sheet above the bar.
 * From md up it is an underlined strip. It follows the WAI-ARIA Tabs pattern: role=tablist/tab/tabpanel,
 * aria-selected, a roving tabindex and ←/→/Home/End. The More button sits outside the tablist.
 * Views pass data and decide what a selected tab shows; they hold no tab markup, styles or key handling.
 * Selection is shown by `aria-selected` and the open sheet by `data-more-open`; no script touches classes.
 */
function sharedTabsBrowser_(getUi) {
  'use strict';
  const bound = new WeakSet();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const BAR_LIMIT = 4;

  const BAR = 'group/tabs fixed inset-x-0 bottom-0 z-30 flex border-t border-edge bg-paper shadow-card md:static md:z-auto md:border-t-0 md:border-b md:px-4 md:shadow-none';
  const TABLIST = 'flex min-w-0 flex-1 md:flex-wrap md:items-center md:gap-1';
  const TAB_BASE = 'relative items-center border-0 bg-transparent text-ink hover:bg-tint aria-selected:text-primary disabled:text-muted disabled:hover:bg-transparent max-md:justify-center max-md:border-t-2 max-md:border-t-transparent max-md:px-1 max-md:py-2 max-md:text-xs max-md:aria-selected:border-t-primary md:gap-1 md:border-b-2 md:border-b-transparent md:px-4 md:py-3 md:text-sm md:aria-selected:border-b-primary [&_[data-tab-badge]]:max-md:absolute [&_[data-tab-badge]]:max-md:right-2 [&_[data-tab-badge]]:max-md:top-0.5';
  const TAB = 'flex max-md:min-w-0 max-md:flex-1 max-md:basis-0 ' + TAB_BASE;
  const SHEET = 'max-md:absolute max-md:inset-x-0 max-md:bottom-full max-md:hidden max-md:flex-col max-md:group-data-[more-open]/tabs:flex md:contents';
  const SHEET_TAB = 'flex max-md:justify-start max-md:border-t max-md:border-edge max-md:bg-paper max-md:px-5 max-md:py-4 max-md:text-sm ' + TAB_BASE;
  const LABEL = 'flex items-center gap-2 font-semibold max-md:flex-col max-md:gap-1 max-md:text-xs max-md:font-medium';
  const SHEET_LABEL = LABEL + ' max-md:flex-row max-md:gap-3 max-md:text-sm';
  const MORE = 'flex shrink-0 basis-1/5 flex-col items-center justify-center gap-1 border-0 border-t-2 border-t-transparent bg-transparent px-1 py-2 text-xs text-ink hover:bg-tint aria-expanded:border-t-primary aria-expanded:text-primary group-has-[[data-tab-sheet]_[aria-selected=true]]/tabs:border-t-primary group-has-[[data-tab-sheet]_[aria-selected=true]]/tabs:text-primary md:hidden';
  const BADGE = 'ml-1 rounded-md bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-inset ring-warning/20';

  const tabId = (id, key) => id + '-tab-' + key;
  const panelId = id => id + '-panel';
  const attributes = attrs => Object.keys(attrs || {}).map(name => ' ' + name + '="' + escape(attrs[name]) + '"').join('');
  const badgeMarkup = (count, title) => count ? '<span data-tab-badge class="' + BADGE + '" title="' + escape(title || '') + '" aria-label="' + escape(title || '') + '">' + escape(count) + '</span>' : '';

  function tabMarkup(id, tab, sheet) {
    const label = tab.short ? '<span class="max-md:hidden">' + escape(tab.label) + '</span><span class="md:hidden">' + escape(tab.short) + '</span>' : escape(tab.label);
    return '<button type="button" role="tab" id="' + escape(tabId(id, tab.key)) + '" aria-controls="' + escape(panelId(id)) + '" aria-selected="' + !!tab.selected + '" tabindex="' + (tab.selected ? 0 : -1) + '"' +
      ' class="' + (sheet ? SHEET_TAB : TAB) + '" data-tab="' + escape(tab.key) + '"' + attributes(tab.attrs) + '>' +
      '<strong class="' + (sheet ? SHEET_LABEL : LABEL) + '" data-tab-label>' + getUi().renderIcon(tab.icon) + label + badgeMarkup(tab.count, tab.countLabel) + '</strong></button>';
  }

  /**
   * The tab strip. `options`: {id, label, activation:'auto'|'manual', tabs:[{key, icon, label, short?, count?,
   * countLabel?, selected, attrs?}]}. `attrs` are the view's own data-* hooks. Tabs past the fourth go in the sheet.
   */
  function markup(options) {
    const id = options.id, tabs = options.tabs, overflow = tabs.length > BAR_LIMIT;
    const bar = overflow ? tabs.slice(0, BAR_LIMIT) : tabs, sheet = overflow ? tabs.slice(BAR_LIMIT) : [];
    return '<div class="' + BAR + '" data-tabs data-tab-activation="' + (options.activation === 'manual' ? 'manual' : 'auto') + '">' +
      '<div class="' + TABLIST + '" role="tablist" aria-label="' + escape(options.label) + '">' + bar.map(tab => tabMarkup(id, tab, false)).join('') +
      (sheet.length ? '<div class="' + SHEET + '" id="' + escape(id) + '-more" role="none" data-tab-sheet>' + sheet.map(tab => tabMarkup(id, tab, true)).join('') + '</div>' : '') + '</div>' +
      (sheet.length ? '<button type="button" class="' + MORE + '" data-tab-more aria-expanded="false" aria-controls="' + escape(id) + '-more" aria-label="More sections">' + getUi().renderIcon('ellipsis') + '<span>More</span></button>' : '') +
      '</div>';
  }

  /** Attributes for the panel every tab of the strip controls. */
  const panelAttributes = (id, selectedKey) => 'id="' + escape(panelId(id)) + '" role="tabpanel" aria-labelledby="' + escape(tabId(id, selectedKey)) + '"';

  /** Marks the tab `isSelected` picks as selected, moves the roving tabindex to it and relabels its panel. */
  function select(tabs, isSelected) {
    Array.from(tabs).forEach(tab => {
      const selected = !!isSelected(tab);
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      const panel = selected && tab.id && tab.ownerDocument.getElementById(tab.getAttribute('aria-controls') || '');
      if (panel) panel.setAttribute('aria-labelledby', tab.id);
    });
  }

  /** Shows `count` in the tab's badge (hidden when zero), creating the badge on first use. */
  function setBadge(tab, count, title) {
    let badge = tab.querySelector('[data-tab-badge]');
    if (!badge) { badge = tab.ownerDocument.createElement('span'); badge.setAttribute('data-tab-badge', ''); badge.className = BADGE; (tab.querySelector('[data-tab-label]') || tab).appendChild(badge); }
    badge.hidden = !count; badge.textContent = count ? String(count) : ''; badge.title = count ? title : '';
    badge.setAttribute('aria-label', badge.title);
  }

  function setOpen(strip, open) {
    strip.toggleAttribute('data-more-open', open);
    const more = strip.querySelector('[data-tab-more]');
    if (more) more.setAttribute('aria-expanded', String(open));
  }
  const narrow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(width < 48rem)').matches;
  /** Tabs the arrow keys reach: enabled, and not inside the closed sheet of the mobile bar. */
  const reachable = strip => Array.from(strip.querySelectorAll('[role="tab"]')).filter(tab => !tab.disabled && (!tab.closest('[data-tab-sheet]') || !narrow() || strip.hasAttribute('data-more-open')));

  function onClick(event) {
    const host = event.currentTarget, more = event.target.closest ? event.target.closest('[data-tab-more]') : null;
    if (more) { const strip = more.closest('[data-tabs]'); setOpen(strip, !strip.hasAttribute('data-more-open')); return; }
    host.querySelectorAll('[data-tabs][data-more-open]').forEach(strip => setOpen(strip, false));
  }
  function onKeydown(event) {
    const host = event.currentTarget;
    if (event.key === 'Escape') {
      const open = host.querySelector('[data-tabs][data-more-open]');
      if (open) { setOpen(open, false); const more = open.querySelector('[data-tab-more]'); if (more) more.focus(); }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = event.target.closest ? event.target.closest('[role="tab"]') : null, strip = current && current.closest('[data-tabs]');
    if (!strip) return;
    const tabs = reachable(strip), index = tabs.indexOf(current);
    if (index < 0) return;
    event.preventDefault();
    const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    const id = next.id, doc = next.ownerDocument;
    if (strip.getAttribute('data-tab-activation') !== 'manual') next.click();
    // A view may re-render the strip on selection; focus the tab with the same id in the new markup, or More
    // when that tab is in the mobile sheet the selection just closed.
    const target = doc.getElementById(id) || next, owner = target.closest('[data-tabs]');
    const hidden = owner && target.closest('[data-tab-sheet]') && narrow() && !owner.hasAttribute('data-more-open');
    (hidden && owner.querySelector('[data-tab-more]') || target).focus();
  }

  /** One delegated listener per host for the More sheet and the arrow keys. */
  function bind(host) {
    if (bound.has(host)) return;
    bound.add(host);
    host.addEventListener('click', onClick);
    host.addEventListener('keydown', onKeydown);
  }

  return {markup, panelAttributes, select, setBadge, bind};
}
