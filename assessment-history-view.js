/**
 * ASSESSMENT HISTORY VIEW — browser presentation helper, serialized into the dashboard shell by
 * dashboard-client-scripts.js and used by the Review drawer and the publishing cards. It renders the
 * academic-decision history DTO (labels and note filtering are fixed; nothing here reads a sheet).
 * Every value is escaped and styling is Tailwind utilities only.
 */
function renderAssessmentHistory_(decisions) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  if (!decisions || !decisions.length) return '';
  const actions = {exception:'Absence details updated', targetSubmit:'Assessment completed', targetDraft:'Assessment draft saved', MAKEUP_ALTERNATIVE_ASSESSMENT:'Assessment authorized', DEFERRED_ASSESSMENT:'Assessment deferred', TEAM_MARK_APPLICABLE:'Team mark approved', TEAM_MARK_NOT_APPLICABLE:'Team mark not applicable', OTHER:'Academic decision recorded'};
  const statuses = {COMPLETED:'Completed', MAKEUP_PENDING:'Awaiting makeup', COMPLETED_AFTER_MAKEUP:'Completed after makeup', ABSENT_UNAPPROVED:'Unapproved absence', ACADEMIC_DECISION_PENDING:'Awaiting academic decision', NON_PARTICIPATION:'Non-participation', INCOMPLETE:'Incomplete'};
  const automaticReasons = ['Prolonged absence source facts updated.', 'Review-day absence recorded as unapproved.'];
  return '<details class="mt-2 text-sm"><summary class="cursor-pointer text-xs font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">Assessment history <span class="ml-1 rounded-badge bg-tint px-1.5 text-muted">' + decisions.length + '</span></summary>' +
    '<ol class="m-0 mt-2 flex list-none flex-col gap-2 p-0">' + decisions.slice().reverse().map(d => {
      const date = new Date(d.at), valid = Number.isFinite(date.getTime());
      const when = valid ? date.toLocaleString('en-GB', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
      const reason = String(d.reason || '');
      const note = reason && !automaticReasons.includes(reason) && !reason.startsWith('Absence details recorded: ') ? '<p class="m-0 mt-1 whitespace-pre-line text-ink-2">' + escape(reason) + '</p>' : '';
      return '<li class="rounded-md border border-edge bg-paper p-2"><div class="flex flex-wrap items-baseline justify-between gap-2"><strong class="text-ink">' + escape(actions[d.decision] || 'Assessment updated') + '</strong>' +
        (when ? '<time class="text-xs text-muted" datetime="' + escape(date.toISOString()) + '">' + escape(when) + '</time>' : '') + '</div>' +
        '<div class="mt-1 text-ink-2">' + escape(statuses[d.previousStatus] || 'Not assessed') + ' <span class="text-muted">changed to</span> ' + escape(statuses[d.resultingStatus] || 'Updated') + '</div>' +
        note + (d.reviewer ? '<small class="mt-1 block text-muted">' + escape(d.reviewer) + '</small>' : '') + '</li>';
    }).join('') + '</ol></details>';
}
