/**
 * TITLE REQUEST IDS - browser module serialized into every dashboard page as `TitleRequests` (TITLE-REVISION-PLAN.md, section 6).
 * The bridge never retries a write, so a view that sends a title write owns the request ID:
 *  - the first time for a given content it gets a new ID;
 *  - it keeps the ID while the user retries the same content after a failure that may have committed (TRANSPORT, TIMEOUT, BAD_RESPONSE,
 *    UNAVAILABLE), so the server recognises the retry;
 *  - it gets a new ID when the content changes, and the ID is dropped after success or any other failure.
 * A scope names what is being changed (for example "reviewer:T1"); a content string identifies what is being sent.
 */
function titleRequestsBrowser_() {
  'use strict';
  const KEEP_ON = ['TRANSPORT', 'TIMEOUT', 'BAD_RESPONSE', 'UNAVAILABLE'];
  const open = Object.create(null);
  const fresh = () => {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  };
  return {
    /** The request ID to send for this content in this scope. */
    idFor(scope, content) {
      const text = String(content);
      if (!open[scope] || open[scope].content !== text) open[scope] = {id: fresh(), content: text};
      return open[scope].id;
    },
    /** Call when the write finished. `error` is the failure, or nothing on success. */
    settle(scope, error) {
      if (error && KEEP_ON.indexOf(error.code) >= 0) return;
      delete open[scope];
    }
  };
}
