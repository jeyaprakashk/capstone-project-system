/**
 * TITLE CUTOVER (Release 0) - the write barrier for the title cutover. See TITLE-REVISION-PLAN.md, section 11.
 *
 * One script property, TITLE_CUTOVER, is read under the script lock by every title writer immediately before it writes:
 *   unset   - old code works as today
 *   PAUSED  - old code refuses: "Title updates are paused. Reload the dashboard shortly."
 *   LIVE    - old code refuses permanently: "Reload the dashboard."
 * Any other value refuses like PAUSED (fail closed). The property is changed only by setTitleCutover and clearTitleCutover,
 * which are editor-run and hold the script lock, so when setTitleCutover('PAUSED') returns no old writer is in progress.
 */
const TITLE_CUTOVER_PROPERTY_ = 'TITLE_CUTOVER';
const TITLE_CUTOVER_LOCK_WAIT_MS_ = 30000;

function readTitleCutover_() {
  return String(PropertiesService.getScriptProperties().getProperty(TITLE_CUTOVER_PROPERTY_) || '').trim();
}

/** The refusal message for a property value, or '' when title writes are allowed (the property is unset). */
function titleCutoverRefusal_(value) {
  if (!value) return '';
  if (value === 'LIVE') return 'Reload the dashboard.';
  return 'Title updates are paused. Reload the dashboard shortly.';
}

/**
 * Runs `write` while holding the script lock, and only if title writes are allowed. The property is read after the lock
 * is held, immediately before the write, so a write that passed an earlier check but reached the lock after PAUSED was
 * set refuses and writes nothing. An already-owned lock is reused and left held. Refusals throw a plain Error.
 */
function withTitleWriteLock_(waitMs, busyMessage, write) {
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned && !lock.tryLock(waitMs)) throw new Error(busyMessage);
  try {
    const refusal = titleCutoverRefusal_(readTitleCutover_());
    if (refusal) throw new Error(refusal);
    return write();
  } finally {
    if (!owned) lock.releaseLock();
  }
}

/** Holds the script lock (reusing an owned one) for a change to the property itself. */
function titleCutoverLocked_(change) {
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned) {
    try { lock.waitLock(TITLE_CUTOVER_LOCK_WAIT_MS_); }
    catch (error) { throw new Error('A title write is still running. Run this again shortly.'); }
  }
  try { return change(PropertiesService.getScriptProperties()); }
  finally { if (!owned) lock.releaseLock(); }
}

/** Editor-run. value is 'PAUSED' or 'LIVE'. Returns after any write that held the lock earlier has finished. */
function setTitleCutover(value) {
  requireTriggerOrOperator_();
  const next = String(value == null ? '' : value).trim();
  if (next !== 'PAUSED' && next !== 'LIVE') throw new Error("setTitleCutover accepts only 'PAUSED' or 'LIVE'.");
  return titleCutoverLocked_(properties => {
    properties.setProperty(TITLE_CUTOVER_PROPERTY_, next);
    return {ok: true, value: next};
  });
}

/**
 * Editor-run. The one authorized rollback operation: deletes the property, only if it is PAUSED or unset. It refuses once the
 * value is LIVE (fix forward), and refuses a value it does not recognise. Run it last in a rollback, after the previous
 * deployment and saved code are restored (TITLE-REVISION-PLAN.md, section 11).
 */
function clearTitleCutover() {
  requireTriggerOrOperator_();
  return titleCutoverLocked_(properties => {
    const current = String(properties.getProperty(TITLE_CUTOVER_PROPERTY_) || '').trim();
    if (current === 'LIVE') throw new Error('Cutover is LIVE; fix forward.');
    if (current && current !== 'PAUSED') throw new Error("TITLE_CUTOVER has an unrecognised value. Run setTitleCutover('PAUSED') first.");
    properties.deleteProperty(TITLE_CUTOVER_PROPERTY_);
    return {ok: true, was: current || 'unset'};
  });
}
