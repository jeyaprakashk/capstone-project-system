/**
 * DOCUMENTS VIEW - browser module serialized into every dashboard page as `DocumentsView` (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md).
 * Renders the Documents DTO of one team (DATA-CONTRACTS.md, DocumentsDto) into a host element and sends the document writes through the
 * bridge: Submit (API_student_submitDocument, after a live preview the student confirms; "Check GitHub now" runs the same preview when the
 * team scan has not yet seen a team member's change), Approve and Return
 * (API_guide_decideDocument) and Reopen (API_coordinator_reopenDocument). Everything a person may do comes from the DTO's `can`; this
 * module decides nothing and reads no spreadsheet column. The request ID of a write comes from TitleRequests, so a retry of the same
 * content after a failure that may have committed is recognised by the server. It never calls google.script.run.
 * Hosts: the student's Documents screen, the guide's Documents tab and the coordinator's team drawer. Each host gets one delegated listener
 * and is found through data-* hooks only.
 */
function documentsViewBrowser_(bridge, getUi, getRequests) {
  'use strict';
  const delegated = new WeakSet();
  const hosts = new WeakMap();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https?:\/\//i.test(String(url)) ? String(url) : '#';
  const p = (html, extra) => '<p class="mt-1 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  const CARD = 'rounded-card border border-edge bg-paper p-4 shadow-card';
  const BADGE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const TONE = {
    done: BADGE + 'bg-success-tint text-success ring-success/20', waiting: BADGE + 'bg-info-tint text-info ring-info/20',
    active: BADGE + 'bg-warning-tint text-warning ring-warning/20'
  };
  const FIELD = 'mt-1 block w-full rounded-md border border-control bg-paper px-3 py-2 text-sm text-ink disabled:opacity-60';
  const LABEL = 'mt-3 block text-sm font-semibold text-ink-2';
  const PRIMARY = 'border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const LINK = 'inline-flex items-center rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink no-underline ring-1 ring-inset ring-line hover:bg-tint';
  const NOTICE = 'mb-3 rounded-md border border-warning/20 bg-warning-tint px-3 py-2 text-sm text-warning';

  const when = value => {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : '';
  };
  /** "Ann (@ann)" for a team member's account; "Outside member (@login)" for anyone else. */
  const person = author => {
    if (!author) return '';
    const login = author.login ? ' (@' + author.login + ')' : '';
    return (author.name ? author.name : 'Outside member') + login;
  };

  function linesMarkup(doc) {
    const out = [];
    if (doc.submittedBy) out.push('<li><strong>Submitted by:</strong> ' + escape(doc.submittedBy.name || 'a team member') + (doc.submittedBy.email ? ' (' + escape(doc.submittedBy.email) + ')' : '') +
      (doc.submittedBy.at ? ' · ' + escape(when(doc.submittedBy.at)) : '') + '</li>');
    if (doc.commit) {
      out.push('<li><strong>Committed by:</strong> ' + escape(person(doc.commit.committedBy)) + ' · version ' + escape(doc.commit.shortSha) + '</li>');
      if (doc.commit.lastTeamChange) out.push('<li><strong>Last changed by a team member:</strong> ' + escape(person(doc.commit.lastTeamChange)) + '</li>');
    }
    return out.length ? '<ul class="m-0 mt-2 list-none p-0 text-sm text-ink-2" data-doc-lines>' + out.join('') + '</ul>' : '';
  }

  function historyMarkup(doc) {
    if (!doc.history || !doc.history.length) return '';
    return '<details class="mt-2 text-sm"><summary class="cursor-pointer font-semibold text-ink-2">History</summary><ul class="m-0 mt-1 list-none p-0 text-xs text-muted">' +
      doc.history.slice().reverse().map(item => '<li>' + escape(item.revision) + ' · ' + escape(item.action) + ' · ' + escape(item.actor) + ' · ' + escape(when(item.at)) +
        (item.notes ? ' · ' + escape(item.notes) : '') + '</li>').join('') + '</ul></details>';
  }

  function controlsMarkup(doc, dto) {
    const can = doc.can;
    if (!can) return '';
    const id = escape(doc.documentId), revision = escape(doc.revision), hooks = ' data-document="' + id + '" data-revision="' + revision + '"';
    let html = '';
    if (can.submit.allowed) {
      html += '<div class="mt-3"><button type="button" class="' + PRIMARY + '" data-doc-action="submit"' + hooks + '>Submit the latest version</button></div>';
    } else if (dto.roles && dto.roles.student && ['NOT_SUBMITTED', 'RETURNED', 'REOPENED'].indexOf(doc.status) >= 0 && can.submit.reason) {
      const checked = doc.checkedAt && when(doc.checkedAt) ? ' <span class="text-muted">(last checked ' + escape(when(doc.checkedAt)) + ')</span>' : '';
      html += p(escape(can.submit.reason) + checked, 'text-warning');
    }
    if (can.check && can.check.allowed) {
      html += '<div class="mt-2"><button type="button" class="' + BUTTON + '" data-doc-action="check"' + hooks + '>Check GitHub now</button></div>';
    }
    if (can.approve.allowed || can.return.allowed) {
      html += '<label class="' + LABEL + '" for="docNotes-' + id + '">Notes for the team (required to return)</label>' +
        '<textarea id="docNotes-' + id + '" rows="3" maxlength="2000" class="' + FIELD + '" data-doc-notes' + hooks + '></textarea>' +
        '<div class="mt-2 flex flex-wrap gap-2">' +
        (can.approve.allowed ? '<button type="button" class="' + PRIMARY + '" data-doc-action="approve"' + hooks + '>Approve</button>' : '') +
        (can.return.allowed ? '<button type="button" class="' + BUTTON + '" data-doc-action="return"' + hooks + '>Return</button>' : '') + '</div>';
    }
    if (can.reopen.allowed) {
      html += '<label class="' + LABEL + '" for="docReason-' + id + '">Reason for reopening</label>' +
        '<textarea id="docReason-' + id + '" rows="2" maxlength="2000" class="' + FIELD + '" data-doc-reason' + hooks + '></textarea>' +
        '<div class="mt-2"><button type="button" class="' + BUTTON + '" data-doc-action="reopen"' + hooks + '>Reopen for a new version</button></div>';
    }
    return html;
  }

  function documentMarkup(doc, dto) {
    const tone = TONE[doc.state] || TONE.waiting;
    return '<article class="' + CARD + '" data-document-card="' + escape(doc.documentId) + '" data-document-status="' + escape(doc.status) + '">' +
      '<div class="flex flex-wrap items-center justify-between gap-2"><h4 class="m-0 text-base font-semibold text-ink break-all">' + escape(doc.fileName) + '</h4>' +
      '<span class="' + tone + '">' + escape(doc.statusText) + '</span></div>' +
      (doc.existing ? p('Already in the team folder.', 'text-muted') : '') +
      (doc.status === 'RETURNED' && doc.returnedNotes ? p('<strong>Guide\'s notes:</strong> ' + escape(doc.returnedNotes), 'text-warning') : '') +
      (doc.link ? '<div class="mt-2"><a class="' + LINK + '" href="' + escape(safeUrl(doc.link)) + '" target="_blank" rel="noopener">Open the file</a></div>' : '') +
      linesMarkup(doc) + controlsMarkup(doc, dto) +
      '<p class="mt-2 text-sm text-ink-2 empty:hidden" role="status" aria-live="polite" data-doc-status></p>' + historyMarkup(doc) + '</article>';
  }

  function listMarkup(dto, notice) {
    const stamp = dto.scannedAt ? p('Team files last checked ' + escape(when(dto.scannedAt)) + '.', 'text-muted') : '';
    const list = dto.documents.length
      ? '<div class="mt-3 grid gap-3">' + dto.documents.map(doc => documentMarkup(doc, dto)).join('') + '</div>'
      : p('No documents are listed yet.', 'text-muted');
    return (notice ? '<p class="' + NOTICE + '" role="status" data-doc-notice>' + escape(notice) + '</p>' : '') + stamp + list;
  }

  function errorMessage(error) {
    return error && typeof error.message === 'string' && error.message.trim() ? error.message.trim() : 'The server did not provide error details';
  }

  /** Reads the Documents DTO into the host. Content already shown stays on a failed refresh, with a Retry. */
  function load(host) {
    const state = hosts.get(host);
    if (!state || state.busy) return Promise.resolve();
    state.busy = true;
    const ui = getUi(), finish = state.dto ? ui.beginContentLoading(host, 'Loading documents', {compact: true}) : function() {};
    return bridge.read('documents:' + (state.teamId || 'own'), 'API_documents_get', state.teamId ? [state.teamId] : [], {timeoutMs: 120000}).then(dto => {
      finish(); state.busy = false;
      if (!host.isConnected || hosts.get(host) !== state) return;
      state.dto = dto;
      const notice = state.notice; state.notice = '';
      host.innerHTML = listMarkup(dto, notice);
    }, error => {
      finish(); state.busy = false;
      if (error && error.superseded) return;
      if (!host.isConnected || hosts.get(host) !== state) return;
      const retry = '<p class="' + NOTICE + '" role="alert" data-doc-error>Could not load documents: ' + escape(errorMessage(error)) + '. <button type="button" class="' + BUTTON + '" data-doc-action="retry">Retry</button></p>';
      const old = host.querySelector('[data-doc-error]');
      if (old) old.remove();
      if (state.dto) host.insertAdjacentHTML('afterbegin', retry); else host.innerHTML = retry;
    });
  }

  /** Starts showing a team's documents in a host. teamId is blank for a student (the server uses the signed-in student's team). */
  function mount(host, teamId) {
    hosts.set(host, {teamId: teamId || '', dto: null, busy: false, notice: ''});
    host.innerHTML = getUi().renderSkeleton('panel', 'Loading documents');
    if (!delegated.has(host)) { delegated.add(host); host.addEventListener('click', onClick); }
    return load(host);
  }

  /** One write: the busy state on the card, the request ID for this content, and a reload that keeps the server's message. */
  function write(host, card, button, method, scope, content, build, busyText) {
    const state = hosts.get(host), status = card.querySelector('[data-doc-status]');
    const requestId = getRequests().idFor(scope, content);
    const done = getUi().busy.write(status, busyText, Array.from(card.querySelectorAll('button, textarea')));
    return bridge.write(method, [build(requestId)]).then(result => {
      getRequests().settle(scope);
      done();
      state.notice = result && result.message ? result.message : '';
      state.dto = null;
      return load(host);
    }, error => {
      getRequests().settle(scope, error);
      done(errorMessage(error));
      if (error && (error.code === 'CONFLICT' || error.code === 'REJECTED' || error.code === 'UNAVAILABLE')) { state.notice = errorMessage(error); return load(host); }
    });
  }

  function submit(host, card, button) {
    const state = hosts.get(host), documentId = button.getAttribute('data-document'), revision = Number(button.getAttribute('data-revision'));
    const status = card.querySelector('[data-doc-status]'), ui = getUi();
    const done = ui.busy.write(status, 'Checking the latest version…', [button]);
    return bridge.read('document-preview:' + documentId, 'API_student_previewDocument', [{documentId}], {timeoutMs: 120000}).then(preview => {
      done();
      const commit = preview.commit;
      const body = 'This is the version that will be submitted: ' + commit.shortSha + (commit.date ? ', ' + when(commit.date) : '') + '. It was committed by ' + person(commit.author) + '.' +
        (preview.lastTeamChange ? ' The last change by a team member was by ' + person(preview.lastTeamChange) + '.' : '') + ' Your guide will review exactly this version.';
      return ui.confirmDialog({title: 'Submit ' + preview.fileName, body, confirmText: 'Submit', cancelText: 'Cancel'}).then(approved => {
        if (!approved) return;
        return write(host, card, button, 'API_student_submitDocument', 'document-submit:' + documentId, [revision, commit.sha].join('|'),
          requestId => ({requestId, expectedRevision: revision, documentId, expectedCommit: commit.sha}), 'Submitting…');
      });
    }, error => {
      done(errorMessage(error));
      if (error && (error.code === 'REJECTED' || error.code === 'UNAVAILABLE') && state) { state.notice = errorMessage(error); return load(host); }
    });
  }

  function decide(host, card, button, decision) {
    const state = hosts.get(host), documentId = button.getAttribute('data-document'), revision = Number(button.getAttribute('data-revision'));
    const field = card.querySelector('[data-doc-notes]'), notes = field ? field.value.trim() : '';
    if (decision === 'return' && !notes) { card.querySelector('[data-doc-status]').textContent = 'Say what the team should change before returning the document.'; return; }
    return write(host, card, button, 'API_guide_decideDocument', 'document-' + decision + ':' + state.dto.teamId + ':' + documentId, [revision, notes].join('|'),
      requestId => ({requestId, expectedRevision: revision, teamId: state.dto.teamId, documentId, decision, notes}), decision === 'approve' ? 'Approving…' : 'Returning…');
  }

  function reopen(host, card, button) {
    const state = hosts.get(host), documentId = button.getAttribute('data-document'), revision = Number(button.getAttribute('data-revision'));
    const field = card.querySelector('[data-doc-reason]'), reason = field ? field.value.trim() : '';
    if (!reason) { card.querySelector('[data-doc-status]').textContent = 'Enter a reason for reopening.'; return; }
    return write(host, card, button, 'API_coordinator_reopenDocument', 'document-reopen:' + state.dto.teamId + ':' + documentId, [revision, reason].join('|'),
      requestId => ({requestId, expectedRevision: revision, teamId: state.dto.teamId, documentId, reason}), 'Reopening…');
  }

  function onClick(event) {
    const button = event.target.closest ? event.target.closest('[data-doc-action]') : null;
    if (!button || button.disabled) return;
    const host = event.currentTarget, action = button.getAttribute('data-doc-action'), card = button.closest('[data-document-card]');
    if (action === 'retry') { load(host); return; }
    if (!card || !hosts.get(host) || !hosts.get(host).dto) return;
    if (action === 'submit' || action === 'check') submit(host, card, button);
    else if (action === 'approve' || action === 'return') decide(host, card, button, action);
    else if (action === 'reopen') reopen(host, card, button);
  }

  return {mount, load, markup: listMarkup};
}
