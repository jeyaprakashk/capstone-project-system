/**
 * STUDENT TITLE — browser module serialized into the dashboard shell as `StudentTitle` for pages that include the student role.
 * Renders the body of the student's Project title card from the Title DTO (DATA-CONTRACTS.md, TitleDto) and sends the two student
 * writes through the bridge: the title and problem statement (API_student_submitTitle) and the two documents (API_student_uploadDocument).
 * Everything the student may do comes from the DTO's `can` and the checklist in it; this module decides nothing. The request ID of a
 * write comes from TitleRequests, so a retry of the same content after a failure that may have committed is recognised by the server.
 * It never calls google.script.run; StudentView supplies the card and reloads the project after a write.
 */
function studentTitleBrowser_(bridge, getUi, getRequests, getView) {
  'use strict';
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const state = {notice: ''};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const p = (html, extra) => '<p class="mt-2 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';
  const FIELD = 'mt-1 block w-full rounded-md border border-control bg-paper px-3 py-2 text-sm text-ink disabled:opacity-60';
  const LABEL = 'mt-3 block text-sm font-semibold text-ink-2';
  const PRIMARY = 'border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const LINK = 'font-semibold text-primary underline';
  const BADGE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const OK = BADGE + 'bg-success-tint text-success ring-success/20';
  const MISSING = BADGE + 'bg-warning-tint text-warning ring-warning/20';
  const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const when = value => {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
  };

  function checklistMarkup(requirements) {
    if (!requirements || !requirements.length) return '';
    return '<div data-title-checklist class="mt-4"><h4 class="text-xs font-semibold uppercase tracking-wide text-muted">Before you can submit</h4><ul class="mt-2 divide-y divide-edge text-sm">' +
      requirements.map(item => '<li class="flex items-start justify-between gap-3 py-2"><span class="font-semibold text-ink">' + escape(item.label) + '</span><span class="text-right ' +
        (item.met ? 'text-success' : 'text-warning') + '">' + (item.met ? 'Done' : escape(item.reason || 'Not done')) + '</span></li>').join('') + '</ul></div>';
  }

  function documentsMarkup(t) {
    const documents = t.documents || [];
    if (!documents.length) return '';
    return '<div data-title-documents class="mt-4"><h4 class="text-xs font-semibold uppercase tracking-wide text-muted">Documents</h4><ul class="mt-2 divide-y divide-edge text-sm">' +
      documents.map(doc => {
        const capability = t.can && t.can.upload && t.can.upload[doc.key];
        const allowed = !!(capability && capability.allowed);
        const by = doc.uploadedBy ? ' · uploaded by ' + escape(doc.uploadedBy) + (doc.uploadedAt ? ' on ' + escape(when(doc.uploadedAt)) : '') : '';
        return '<li class="py-2" data-document="' + escape(doc.key) + '"><div class="flex flex-wrap items-center justify-between gap-2"><span class="font-semibold text-ink">' + escape(doc.label) + '</span>' +
          '<span class="' + (doc.present ? OK : MISSING) + '">' + (doc.present ? 'Uploaded' : 'Not uploaded') + '</span></div>' +
          (doc.present && by ? '<div class="mt-1 text-xs text-muted">' + by.replace(/^ · /, '') + '</div>' : '') +
          '<div class="mt-2"><input type="file" class="hidden" accept=".docx,' + DOCX_TYPE + '" data-doc-input="' + escape(doc.key) + '" aria-label="Choose the ' + escape(doc.label) + '">' +
          '<button type="button" class="' + BUTTON + '" data-action="title-upload" data-document-key="' + escape(doc.key) + '"' + (allowed ? '' : ' disabled') + '>' + (doc.present ? 'Replace' : 'Upload') + ' (.docx)</button></div>' +
          (!allowed && capability && capability.reason ? p(escape(capability.reason), 'text-muted') : '') +
          '<p class="mt-1 text-sm text-ink-2" role="status" data-document-status></p></li>';
      }).join('') + '</ul>' + p('Each document must be a Word file (.docx) of at most 10 MB. A new upload replaces the earlier one.', 'text-muted') + '</div>';
  }

  function formMarkup(t) {
    const submit = t.can && t.can.submit;
    if (!submit) return '';
    const showForm = submit.allowed || ['NOT_SUBMITTED', 'RETURNED', 'REOPENED'].indexOf(t.status) >= 0;
    if (!showForm) return submit.reason ? p(escape(submit.reason), 'text-muted') : '';
    const disabled = submit.allowed ? '' : ' disabled';
    const label = t.status === 'NOT_SUBMITTED' ? 'Submit title' : 'Resubmit title';
    return '<form data-title-form data-revision="' + escape(t.revision) + '" class="mt-4" novalidate>' +
      '<label class="' + LABEL + '" for="studentTitleText">Project title</label>' +
      '<input id="studentTitleText" type="text" maxlength="200" autocomplete="off" class="' + FIELD + '" data-title-field="title" value="' + escape(t.proposal.title) + '"' + disabled + '>' +
      '<label class="' + LABEL + '" for="studentTitleProblem">Problem statement</label>' +
      '<textarea id="studentTitleProblem" rows="5" maxlength="5000" class="' + FIELD + '" data-title-field="problem"' + disabled + '>' + escape(t.proposal.problem) + '</textarea>' +
      (submit.allowed ? '' : p(escape(submit.reason || 'You cannot submit the title yet.'), 'text-warning')) +
      '<div class="mt-3"><button type="submit" class="' + PRIMARY + '"' + disabled + '>' + label + '</button></div>' +
      '<p class="mt-2 text-sm text-ink-2" role="status" data-title-status></p></form>';
  }

  /** The inside of the Project title card. */
  function markup(t) {
    const notice = state.notice ? '<p class="mt-2 text-sm text-danger" role="alert" data-title-notice>' + escape(state.notice) + '</p>' : '';
    state.notice = '';
    if (t.status === 'UNAVAILABLE') return p(escape(t.statusText)) + notice;
    const lines = [p(escape(t.statusText))];
    if (t.approved && t.approved.value) lines.push(p('<strong>Approved title:</strong> ' + escape(t.approved.title)));
    if (t.proposal && t.proposal.title && (!t.approved.value || t.proposal.title !== t.approved.title)) lines.push(p('<strong>' + (t.approved.value ? 'Proposed change' : 'Submitted title') + ':</strong> ' + escape(t.proposal.title)));
    if (t.status === 'RETURNED' && t.notes) lines.push(p('<strong>Feedback:</strong> ' + escape(t.notes), 'text-warning'));
    if (t.status === 'REOPENED' && t.reopen && t.reopen.reason) lines.push(p('<strong>Reopened:</strong> ' + escape(t.reopen.reason)));
    lines.push(p('Approval due ' + escape(t.due.date) + (t.due.overdue ? ' · Overdue' : ''), t.due.overdue ? 'text-danger' : 'text-ink-2'));
    if (t.folderUrl) lines.push(p('<a class="' + LINK + '" href="' + escape(/^https?:\/\//i.test(t.folderUrl) ? t.folderUrl : '#') + '" target="_blank" rel="noopener">Open team folder</a>'));
    return lines.join('') + notice + checklistMarkup(t.can && t.can.submit && t.can.submit.requirements) + documentsMarkup(t) + formMarkup(t);
  }

  /** Reload the project after a write; a message that must outlive the reload is kept for the next render. */
  function reload(message) {
    if (message) state.notice = message;
    return getView().reloadProject();
  }

  function submit(event, form) {
    event.preventDefault();
    if (form.getAttribute('aria-busy') === 'true') return;
    const field = name => form.querySelector('[data-title-field="' + name + '"]');
    const title = field('title').value, problem = field('problem').value, revision = Number(form.getAttribute('data-revision'));
    const status = form.querySelector('[data-title-status]'), button = form.querySelector('button[type="submit"]');
    if (!title.trim()) { status.textContent = 'Enter a project title.'; return; }
    if (!problem.trim()) { status.textContent = 'Enter the problem statement.'; return; }
    const scope = 'student-title', requestId = getRequests().idFor(scope, [revision, title, problem].join('|'));
    const done = getUi().busy.write(status, 'Submitting…', [button, field('title'), field('problem')]);
    return bridge.write('API_student_submitTitle', [{requestId, expectedRevision: revision, title, problem}]).then(() => {
      getRequests().settle(scope);
      done();
      return reload();
    }, error => {
      getRequests().settle(scope, error);
      done(error && error.message || 'Unable to submit the title.');
      if (error && (error.code === 'CONFLICT' || error.code === 'REJECTED')) return reload(error.message);
    });
  }

  /** Opens the file chooser of a document. */
  function pick(button) {
    const item = button.closest('[data-document]');
    const input = item && item.querySelector('[data-doc-input]');
    if (input) input.click();
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => { const text = String(reader.result || ''); resolve(text.slice(text.indexOf(',') + 1)); };
      reader.onerror = () => reject(new Error('The file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  function upload(input) {
    const item = input.closest('[data-document]'), key = input.getAttribute('data-doc-input');
    const status = item.querySelector('[data-document-status]'), button = item.querySelector('[data-action="title-upload"]');
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) { status.textContent = 'Choose a Word document (.docx).'; input.value = ''; return; }
    if (file.size > MAX_FILE_BYTES) { status.textContent = 'The file is larger than 10 MB.'; input.value = ''; return; }
    const scope = 'student-doc:' + key, requestId = getRequests().idFor(scope, [file.name, file.size, file.lastModified].join('|'));
    const done = getUi().busy.write(status, 'Uploading…', [button]);
    return readBase64(file).then(dataBase64 => bridge.write('API_student_uploadDocument', [{requestId, documentKey: key, fileName: file.name, mimeType: file.type || '', dataBase64}])).then(result => {
      getRequests().settle(scope);
      done();
      input.value = '';
      return reload(result && result.warning ? result.warning : '');
    }, error => {
      getRequests().settle(scope, error);
      done(error && error.message || 'Unable to upload the document.');
      input.value = '';
      if (error && (error.code === 'CONFLICT' || error.code === 'REJECTED')) return reload(error.message);
    });
  }

  return {markup, submit, pick, upload, state};
}
