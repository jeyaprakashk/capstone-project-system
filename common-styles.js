/**
 * Shared skeleton renderer. All styling comes from the Tailwind build (scripts/tailwind-input.css).
 */

/** Shared pure renderer, used on the server and embedded in the browser bundle. */
function getSkeletonMarkup_(variant, label) {
  variant = ['panel','drawer','inline','status','timeline'].includes(variant) ? variant : 'panel';
  const safeLabel = String(label || 'Loading content').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const line = '<span class="app-skeleton-bar skeleton skeleton-text" data-skeleton aria-hidden="true"></span>';
  const shortLine = '<span class="app-skeleton-bar skeleton skeleton-text skeleton-text--short" data-skeleton aria-hidden="true"></span>';
  return '<span class="app-skeleton app-skeleton--' + variant + '" role="status" aria-label="' + safeLabel + '" aria-busy="true">' +
    (variant === 'inline' ? '<span class="spinner spinner--sm" aria-hidden="true"></span>' :
    '<span class="app-skeleton-title"><span class="app-skeleton-bar skeleton skeleton-title" data-skeleton aria-hidden="true"></span></span>' +
    '<span class="app-skeleton-lines skeleton-group">' + line.repeat(variant === 'drawer' ? 5 : variant === 'status' ? 0 : 2) + shortLine + '</span>') +
    '<span class="sr-only">Loading</span></span>';
}
