/**
 * Shared in-progress handling for every page: one place for the spinner, aria-busy and trigger disabling.
 * Browser module serialized into DashboardUI (see getDashboardClientScript_); it holds no state of its own, so each
 * page keeps its own double-submit guard. Presentation is the shared inline spinner and Tailwind utilities only.
 */
function busyStateBrowser_(renderSkeleton, beginContentLoading) {
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const WRITE = 'inline-flex items-center gap-2';
  /** Reads: cover existing content with the shared spinner. Returns finish(), safe to call twice. */
  function read(target, label, options) { return beginContentLoading(target, label, options); }
  /** The only place that sets aria-busy. */
  function mark(element, busy) { if (element) element.setAttribute('aria-busy', String(!!busy)); }
  /**
   * Writes: show the spinner and label in `status`, disable `disable` (elements) until done.
   * done(text) restores the triggers and replaces the spinner with the result text; done() only clears the spinner.
   */
  function write(status, label, disable) {
    const triggers = (disable || []).filter(Boolean).map(node => ({node, disabled:node.disabled}));
    triggers.forEach(item => { item.node.disabled = true; });
    if (status) { status.innerHTML = '<span class="' + WRITE + '">' + renderSkeleton('inline', label) + '<span>' + escape(label) + '</span></span>'; mark(status, true); }
    let finished = false;
    return function done(text) {
      if (finished) return;
      finished = true;
      triggers.forEach(item => { item.node.disabled = item.disabled; });
      if (status) { status.textContent = text == null ? '' : String(text); mark(status, false); }
    };
  }
  return {read, write, mark};
}
