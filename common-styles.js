/**
 * Shared skeleton renderer. All styling comes from the Tailwind build (scripts/tailwind-input.css).
 */

/** Shared pure renderer, used on the server and embedded in the browser bundle. */
function getSkeletonMarkup_(variant, label) {
  variant = ['panel','drawer','inline','status','timeline'].includes(variant) ? variant : 'panel';
  const safeLabel = String(label || 'Loading content').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const line = '<span class="app-skeleton-bar block rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--color-soft)_25%,var(--color-tint)_50%,var(--color-soft)_75%)] animate-[shimmer_1.6s_linear_infinite] h-[1em] w-full" data-skeleton aria-hidden="true"></span>';
  const shortLine = '<span class="app-skeleton-bar block rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--color-soft)_25%,var(--color-tint)_50%,var(--color-soft)_75%)] animate-[shimmer_1.6s_linear_infinite] h-[1em] w-3/5" data-skeleton aria-hidden="true"></span>';
  return '<span class="app-skeleton app-skeleton--' + variant + '" role="status" aria-label="' + safeLabel + '" aria-busy="true">' +
    (variant === 'inline' ? '<span class="inline-block size-4 rounded-full border-2 border-tint border-t-primary animate-[spin_.7s_linear_infinite]" aria-hidden="true"></span>' :
    '<span class="app-skeleton-title"><span class="app-skeleton-bar block rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,var(--color-soft)_25%,var(--color-tint)_50%,var(--color-soft)_75%)] animate-[shimmer_1.6s_linear_infinite] h-[1.4em] w-2/5" data-skeleton aria-hidden="true"></span></span>' +
    '<span class="app-skeleton-lines flex flex-col gap-2">' + line.repeat(variant === 'drawer' ? 5 : variant === 'status' ? 0 : 2) + shortLine + '</span>') +
    '<span class="sr-only">Loading</span></span>';
}
