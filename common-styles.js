/**
 * Shared loading indicator: one spinner for every variant. The name is historical; the markup is no longer a skeleton.
 * Variants only set how much room the loading state holds. All styling comes from the Tailwind build.
 */

/** Shared pure renderer, used on the server and embedded in the browser bundle. */
function getSkeletonMarkup_(variant, label) {
  variant = ['panel','drawer','inline','status','timeline'].includes(variant) ? variant : 'panel';
  const safeLabel = String(label || 'Loading content').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const size = variant === 'inline' ? 'size-4' : 'size-6';
  const room = {inline:'inline-flex', status:'flex min-h-16 w-full', timeline:'flex min-h-32 w-full', panel:'flex min-h-40 w-full', drawer:'flex min-h-48 w-full'}[variant];
  return '<span class="app-skeleton app-skeleton--' + variant + ' ' + room + ' items-center justify-center" role="status" aria-label="' + safeLabel + '" aria-busy="true">' +
    '<span class="inline-block ' + size + ' rounded-full border-2 border-tint border-t-primary animate-[spin_.7s_linear_infinite]" data-skeleton aria-hidden="true"></span>' +
    '<span class="sr-only">Loading</span></span>';
}
