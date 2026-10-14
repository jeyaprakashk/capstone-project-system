/**
 * DOCUMENTS VIEW - browser module serialized into every dashboard page as `DocumentsView` (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md).
 * Renders the Documents DTO of one team (DATA-CONTRACTS.md, DocumentsDto) into a host element and sends the document writes through the
 * bridge: Submit (API_student_submitDocument, after a live preview the student confirms; "Check GitHub now" runs the same preview when the
 * team scan has not yet seen a team member's change), Approve and Return
 * (API_guide_decideDocument), Reopen (API_coordinator_reopenDocument), Copy evidence (API_student_copyEvidence) and Check for new evidence (API_student_checkEvidence; archive/plans/EVIDENCE-PLAN.md). Everything a person may do comes from the DTO's `can`; this
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

  const CARD = 'rounded-card border border-edge bg-paper shadow-card';
  const BADGE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const TONE = {
    done: BADGE + 'bg-success-tint text-success ring-success/20', waiting: BADGE + 'bg-info-tint text-info ring-info/20',
    active: BADGE + 'bg-warning-tint text-warning ring-warning/20'
  };
  const FIELD = 'mt-1 block w-full rounded-md border border-control bg-paper px-3 py-2 text-sm text-ink disabled:opacity-60';
  const LABEL = 'mt-3 block text-sm font-semibold text-ink-2';
  const PRIMARY = 'border-0 rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
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

  const label = text => '<span class="text-muted">' + text + '</span> ';

  /** The facts behind "Details": who submitted and when (with the e-mail a guide or coordinator sees), who committed which version, and who last changed it if another person. */
  function linesMarkup(doc) {
    const out = [];
    if (doc.submittedBy) out.push('<li>' + label('Submitted by:') + escape(doc.submittedBy.name || 'a team member') + (doc.submittedBy.email ? ' (' + escape(doc.submittedBy.email) + ')' : '') +
      (doc.submittedBy.at ? ' · ' + escape(when(doc.submittedBy.at)) : '') + '</li>');
    if (doc.commit) {
      const committer = person(doc.commit.committedBy), last = doc.commit.lastTeamChange ? person(doc.commit.lastTeamChange) : '';
      out.push('<li>' + label('Committed by:') + escape(committer) + ' · version <span class="' + CODE + '" data-doc-version>' + escape(doc.commit.shortSha) + '</span></li>');
      if (last && last !== committer) out.push('<li>' + label('Last changed by a team member:') + escape(last) + '</li>');
    }
    return out.length ? '<ul class="m-0 list-none p-0 text-ink" data-doc-lines>' + out.join('') + '</ul>' : '';
  }

  function historyMarkup(doc) {
    if (!doc.history || !doc.history.length) return '';
    return '<details class="mt-2 text-sm"><summary class="cursor-pointer font-semibold text-ink-2">History</summary><ul class="m-0 mt-1 list-none p-0 text-xs text-muted">' +
      doc.history.slice().reverse().map(item => '<li>' + escape(item.revision) + ' · ' + escape(item.action) + ' · ' + escape(item.actor) + ' · ' + escape(when(item.at)) +
        (item.notes ? ' · ' + escape(item.notes) : '') + '</li>').join('') + '</ul></details>';
  }

  const bytes = size => size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(size / 1024)) + ' KB';
  const EVIDENCE_STATE = {COPIED: '', PENDING: 'waiting to be copied', TOO_LARGE: 'too large, not copied'};

  const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's');
  const SHARE = ' flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-2';
  const unmetFor = (doc, activity) => ((doc.evidence && doc.evidence.requirements) || []).some(item => !item.met && (!activity || item.activity === activity));

  /** The evidence buttons sit with the evidence they act on: Copy evidence is the next step, so it is the primary one. */
  function evidenceButtons(doc, dto, list) {
    const can = doc.can;
    if (!can) return '';
    const hooks = ' data-document="' + escape(doc.documentId) + '" data-revision="' + escape(doc.revision) + '"';
    // Copy evidence is offered only when files are known to be waiting; with none (or no count yet) it is not shown. Check for new evidence finds out.
    const pending = doc.evidence ? doc.evidence.pending : null;
    const copyReady = !!(can.copyEvidence && can.copyEvidence.allowed && typeof pending === 'number' && pending > 0);
    const html = (copyReady ? '<button type="button" class="' + PRIMARY + SHARE + '" data-doc-action="copy-evidence"' + hooks + ' aria-label="Copy evidence (' + pending + ' waiting)" title="Copy evidence">' + icon('copy') +
        'Copy (' + pending + ')</button>' : '') +
      (can.checkEvidence && can.checkEvidence.allowed ? '<button type="button" class="' + BUTTON + SHARE + '" data-doc-action="check-evidence"' + hooks + ' aria-label="Check for new evidence" title="Check for new evidence">' + icon('refresh-cw') + 'Check</button>' : '');
    // `list` is the toggle of the evidence list: the third button of the same row. Check takes the width the others leave.
    return html || list ? '<div class="mt-4 flex gap-2">' + html + (list || '') + '</div>' : '';
  }

  /**
   * What each Review needs from the document's evidence folders, one block per folder: the folder's copied count is said once (it is one set of
   * files) and each Review keeps its own minimum, because two Reviews may ask a different number of the same folder. A block that still owes files
   * is amber and says how many are owed; the evidence buttons close it.
   */
  function requirementsMarkup(doc, dto, tail) {
    const folders = [];
    ((doc.evidence && doc.evidence.requirements) || []).forEach(item => {
      let block = folders.find(entry => entry.folder === item.folder);
      if (!block) { block = {folder: item.folder, copied: item.copied, items: []}; folders.push(block); }
      block.items.push(item);
    });
    if (!folders.length) return '';
    const last = folders.length - 1;
    return '<div class="flex flex-col gap-3" data-evidence-requirements>' + folders.map((block, index) => {
      const items = block.items.slice().sort((a, b) => a.minimum - b.minimum || String(a.label).localeCompare(String(b.label)));
      const owes = items.some(item => !item.met);
      const left = item => Math.max(item.minimum - item.copied, 0);
      const rows = items.map(item => '<li class="flex items-center justify-between gap-3 py-2" data-evidence-requirement="' + (item.met ? 'met' : 'unmet') + '">' +
        '<span class="flex min-w-0 items-center gap-2.5"><span class="' + (item.met ? 'inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-success-tint text-success' : 'size-5 shrink-0 rounded-full border-2 border-control') + '">' + (item.met ? icon('check') : '') + '</span>' +
        '<span class="min-w-0 text-ink-2">' + escape(item.label) + ' <span class="text-muted">needs ' + escape(item.minimum) + '</span></span></span>' +
        '<span class="shrink-0 ' + TONE[item.met ? 'done' : 'active'] + '">' + (item.met ? 'done' : escape(left(item)) + ' more') + '</span></li>').join('');
      return '<section class="rounded-card border border-edge bg-paper p-4 text-sm" data-evidence-folder="' + escape(block.folder) + '"' + (owes ? ' data-evidence-owes' : '') + '>' +
        '<div class="flex items-baseline justify-between gap-2 border-b border-edge pb-3"><span class="min-w-0 break-all font-semibold text-ink">Evidence \u00b7 ' + escape(block.folder) + '</span>' +
        '<span class="shrink-0 text-muted">' + escape(plural(block.copied, 'file')) + ' copied</span></div><ul class="m-0 list-none p-0">' + rows + '</ul>' +
        (index === last ? evidenceButtons(doc, dto, tail && tail.toggle) + (tail && tail.panel ? '<div class="mt-2">' + tail.panel + '</div>' : '') : '') + '</section>';
    }).join('') + '</div>';
  }

  const PANEL = 'flex flex-col gap-1 rounded-md bg-soft px-3 py-2 text-sm';
  const toggleButton = (target, glyph, text, name) => '<button type="button" class="' + DETAILS + '" data-doc-action="toggle" data-doc-target="' + target + '"' + (name ? ' aria-label="' + name + '" title="' + name + '"' : '') + ' aria-expanded="false">' + icon(glyph) + text +
    '<span class="inline-flex transition-transform" data-doc-chevron>' + icon('chevron-down') + '</span></button>';

  /**
   * The evidence of a document, in three parts: `main` (the requirement blocks and the evidence buttons, always visible), and a `toggle` button and
   * `panel` for the files (the team's copied files with a link to each, and what is still waiting), which share the pattern of the Details panel.
   */
  function evidenceMarkup(doc, dto) {
    const evidence = doc.evidence, none = {main: '', toggle: '', panel: ''};
    if (!evidence) return none;
    const hasBlocks = ((evidence.requirements) || []).length > 0;
    const items = evidence.files.map(file => '<li class="break-all" data-evidence-file="' + escape(file.state) + '">' + escape(file.path) + ' · ' + escape(bytes(file.size)) +
      (EVIDENCE_STATE[file.state] ? ' · ' + escape(EVIDENCE_STATE[file.state]) : '') +
      (file.link ? ' · <a class="text-primary" href="' + escape(safeUrl(file.link)) + '" target="_blank" rel="noopener">' + (file.state === 'PENDING' ? 'Open the earlier copy' : 'Open') + '</a>' : '') + '</li>').join('');
    const standalone = () => ({main: hasBlocks ? requirementsMarkup(doc, dto, null) : evidenceButtons(doc, dto), toggle: '', panel: ''});
    if (!(items || evidence.pending || evidence.tooLarge)) return standalone();
    // The requirement block already says how many files are copied, so the summary repeats the count only when there is no block.
    const parts = [hasBlocks ? '' : evidence.copied + ' copied', evidence.pending ? evidence.pending + ' waiting to be copied' : '', evidence.tooLarge ? evidence.tooLarge + ' too large' : ''].filter(Boolean);
    const checked = evidence.checkedAt && when(evidence.checkedAt) ? ' (checked ' + when(evidence.checkedAt) + ')' : '';
    const summary = (parts.length ? 'Evidence: ' + parts.join(', ') : 'Evidence files') + checked;
    // `files` lists the copied files only; files still waiting are a count until the next check, so an empty list is not "no evidence".
    const waiting = [evidence.pending ? plural(evidence.pending, 'file') + ' waiting to be copied from ' + evidence.folders.join(', ') : '',
      evidence.tooLarge ? plural(evidence.tooLarge, 'file') + ' too large to copy' : ''].filter(Boolean);
    const body = items ? '<ul class="m-0 list-none p-0 text-xs text-muted" data-evidence-list>' + items + '</ul>' : '<p class="m-0 text-muted">' + escape(waiting.join('; ')) + '.</p>';
    const toggle = toggleButton('evidence', 'paperclip', 'List', 'Evidence list');
    const panel = '<div class="' + PANEL + '" data-doc-panel="evidence" data-doc-evidence hidden><p class="m-0 font-semibold text-ink-2" data-evidence-summary>' + escape(summary) + '</p>' + body + '</div>';
    // The list toggle joins the evidence buttons in one row, and its panel opens under that row: inside the evidence box when there is one.
    return hasBlocks ? {main: requirementsMarkup(doc, dto, {toggle, panel}), toggle: '', panel: ''} : {main: evidenceButtons(doc, dto, toggle) + '<div class="mt-2 empty:hidden">' + panel + '</div>', toggle: '', panel: ''};
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
        '<div class="mt-2 flex gap-2">' +
        (can.approve.allowed ? '<button type="button" class="' + PRIMARY + ' flex-1" data-doc-action="approve"' + hooks + '>Approve</button>' : '') +
        (can.return.allowed ? '<button type="button" class="' + BUTTON + ' flex-1" data-doc-action="return"' + hooks + '>Return</button>' : '') + '</div>';
    }
    if (can.reopen.allowed) {
      html += '<label class="' + LABEL + '" for="docReason-' + id + '">Reason for reopening</label>' +
        '<textarea id="docReason-' + id + '" rows="2" maxlength="2000" class="' + FIELD + '" data-doc-reason' + hooks + '></textarea>' +
        '<div class="mt-2"><button type="button" class="' + BUTTON + '" data-doc-action="reopen"' + hooks + '>Reopen for a new version</button></div>';
    }
    return html;
  }

  // Layout: the Reviews that need the documents are selectable cards (a row to scroll on a phone, a column from xl up); the open Review shows
  // its documents as compact cards. Each card keeps what the person must act on in view and puts the commit details behind a chevron.
  const TILE = 'inline-flex size-12 shrink-0 items-center justify-center rounded-xl ';
  const TILE_TONE = {done: 'bg-success-tint text-success', waiting: 'bg-info-tint text-info', active: 'bg-warning-tint text-warning'};
  const STATUS_ICON = {APPROVED: 'check', NEEDS_REVIEW: 'clock', RETURNED: 'circle-alert', REOPENED: 'file-text', NOT_SUBMITTED: 'file-text', UNAVAILABLE: 'circle-alert'};
  const ROW = 'flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-3 text-left text-ink hover:bg-tint aria-[current=true]:bg-tint';
  const CIRCLE = 'inline-flex shrink-0 items-center justify-center rounded-full ';
  const CIRCLE_TONE = {done: 'bg-success-tint text-success', waiting: 'bg-paper text-info ring-1 ring-inset ring-info/30', active: 'bg-warning-tint text-warning'};
  const GROUP_ICON = {done: 'check', waiting: 'clock', active: 'pencil'};
  const OPEN_LINK = LINK + ' min-w-36 flex-1 justify-center gap-2 md:min-w-0 md:gap-1.5 md:px-2';
  const DETAILS = BUTTON + ' inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap md:px-2.5';
  const CODE = 'inline-block rounded-md bg-tint px-1.5 py-0.5 font-mono text-xs text-ink-2';
  const APPROVED = ['APPROVED', 'REOPENED'];
  const TEAM_TO_ACT = ['NOT_SUBMITTED', 'RETURNED', 'REOPENED'];
  const ALL_GROUP = 'all', OTHER_GROUP = 'other';
  const icon = (name, className) => getUi().renderIcon(name, null, className);

  function documentMarkup(doc, dto) {
    const short = unmetFor(doc), dot = doc.fileName.lastIndexOf('.');
    // Evidence still owed on a document the guide is waiting for must not look settled.
    const unsettled = short && (doc.status === 'NEEDS_REVIEW' || APPROVED.indexOf(doc.status) >= 0);
    const tone = unsettled ? 'active' : TONE[doc.state] ? doc.state : 'waiting';
    const base = dot > 0 ? doc.fileName.slice(0, dot) : doc.fileName, extension = dot > 0 ? doc.fileName.slice(dot) : '';
    const more = linesMarkup(doc) + historyMarkup(doc), proof = evidenceMarkup(doc, dto);
    const icon_ = unsettled ? 'circle-alert' : STATUS_ICON[doc.status] || 'file-text';
    return '<article class="flex min-w-0 flex-col gap-3 ' + CARD + ' p-4" data-document-card="' + escape(doc.documentId) + '" data-document-status="' + escape(doc.status) + '">' +
      '<div class="flex items-start gap-3"><span class="' + TILE + TILE_TONE[tone] + '">' + icon(icon_, 'size-6') + '</span>' +
      '<div class="min-w-0 flex-1"><h4 class="m-0 break-words text-base text-ink"><span class="font-semibold">' + escape(base) + '</span><span class="text-muted">' + escape(extension) + '</span></h4>' +
      '<div class="mt-1.5 flex flex-wrap gap-1.5"><span class="' + TONE[TONE[doc.state] ? doc.state : 'waiting'] + '">' + escape(doc.statusText) + '</span>' +
      (short ? '<span class="' + TONE.active + '" data-evidence-incomplete>Evidence incomplete</span>' : '') + '</div>' +
      '</div></div>' +
      (doc.status === 'RETURNED' && doc.returnedNotes ? p('<strong>Guide\'s notes:</strong> ' + escape(doc.returnedNotes), 'text-warning m-0') : '') +
      proof.main + controlsMarkup(doc, dto) +
      '<p class="m-0 text-sm text-ink-2 empty:hidden" role="status" aria-live="polite" data-doc-status></p>' +
      (proof.toggle ? '<div class="flex">' + proof.toggle + '</div>' : '') + proof.panel +
      (doc.link || more ? '<div class="flex gap-2">' + (doc.link ? '<a class="' + OPEN_LINK + '" href="' + escape(safeUrl(doc.link)) + '" target="_blank" rel="noopener"><span class="truncate">Open the file</span>' + icon('external-link') + '</a>' : '') +
        (more ? toggleButton('details', 'info', 'Details') : '') + '</div>' : '') +
      (more ? '<div class="' + PANEL + '" data-doc-panel="details" data-doc-more hidden>' + more + '</div>' : '') + '</article>';
  }

  /**
   * The Reviews, from the DTO's `neededFor` (a document is listed under every Review that needs it), in Review order. Documents no Review needs
   * come last as "Other documents"; when no document names a Review there is one group, "All documents".
   */
  function groupDocuments(documents) {
    const groups = [], byId = new Map();
    const add = (id, label, doc) => {
      if (!byId.has(id)) { const group = {id, label, documents: []}; byId.set(id, group); groups.push(group); }
      byId.get(id).documents.push(doc);
    };
    documents.forEach(doc => {
      const needed = doc.neededFor || [];
      if (!needed.length) add(OTHER_GROUP, 'Other documents', doc);
      needed.forEach(entry => add(entry.id, entry.label, doc));
    });
    if (groups.length === 1 && groups[0].id === OTHER_GROUP) { groups[0].id = ALL_GROUP; groups[0].label = 'All documents'; }
    const rank = group => group.id === OTHER_GROUP ? 1 : 0;
    return groups.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id, 'en', {numeric: true}));
  }

  const activityOf = group => group.id === OTHER_GROUP || group.id === ALL_GROUP ? '' : group.id;
  /** A document is complete when the guide has approved it AND the evidence it needs is all there; either one alone is not enough. */
  const isComplete = (doc, activity) => APPROVED.indexOf(doc.status) >= 0 && !unmetFor(doc, activity);
  const completeCount = group => group.documents.filter(doc => isComplete(doc, activityOf(group))).length;
  const countOf = (group, statuses) => group.documents.filter(doc => statuses.indexOf(doc.status) >= 0).length;
  /** How many documents of a Review still owe evidence for it. */
  const evidenceShort = group => group.documents.filter(doc => unmetFor(doc, activityOf(group))).length;
  /** The one thing worth saying about a Review: what the team still has to do, else what the guide has, else done. */
  function groupChip(group) {
    const toDo = countOf(group, TEAM_TO_ACT), awaiting = countOf(group, ['NEEDS_REVIEW']);
    const short = evidenceShort(group);
    if (toDo) return {tone: 'active', text: toDo + ' to submit'};
    if (short) return {tone: 'active', text: short + ' need evidence'};
    if (awaiting) return {tone: 'waiting', text: awaiting + ' awaiting guide'};
    return {tone: 'done', text: 'All complete'};
  }

  function rowMarkup(group, selected) {
    const chip = groupChip(group), count = group.documents.length;
    const awaiting = countOf(group, ['NEEDS_REVIEW']), short = evidenceShort(group);
    const sub = completeCount(group) + ' of ' + count + ' complete' + (short ? ' \u00b7 ' + short + ' need evidence' : '') + (awaiting ? ' \u00b7 ' + awaiting + ' awaiting the guide' : '');
    return '<li><button type="button" class="' + ROW + '" data-doc-action="select" data-doc-group="' + escape(group.id) + '"' + (selected ? ' aria-current="true"' : '') + '>' +
      '<span class="' + CIRCLE + 'size-9 ' + CIRCLE_TONE[chip.tone] + '">' + icon(GROUP_ICON[chip.tone]) + '</span>' +
      '<span class="min-w-0 flex-1"><span class="block font-semibold text-ink">' + escape(group.label) + '</span>' +
      '<span class="block text-sm text-muted">' + escape(sub) + '</span></span>' +
      '<span class="text-muted">' + icon('chevron-right') + '</span></button></li>';
  }

  /** The status card on top of the list: how many documents are complete (approved and with their evidence), and when the team files were last checked. */
  function summaryMarkup(dto) {
    const total = dto.documents.length, complete = dto.documents.filter(doc => isComplete(doc, '')).length, done = complete === total;
    const awaiting = dto.documents.filter(doc => doc.status === 'NEEDS_REVIEW').length;
    const short = dto.documents.filter(doc => unmetFor(doc, '')).length;
    const sub = [short ? short + ' need evidence' : '', awaiting ? awaiting + ' awaiting the guide' : '', dto.scannedAt ? 'Team files last checked ' + when(dto.scannedAt) : ''].filter(Boolean).join(' \u00b7 ');
    return '<section class="p-5 ' + CARD + '" data-doc-summary aria-label="Documents status"><div class="flex items-center gap-3">' +
      '<span class="' + CIRCLE + 'size-12 ' + (done ? CIRCLE_TONE.done : CIRCLE_TONE.active) + '">' + icon(done ? 'check' : 'circle-alert', 'size-6') + '</span>' +
      '<div class="min-w-0"><h2 class="m-0 text-hero font-semibold text-ink">' + complete + ' of ' + total + ' complete</h2>' + (sub ? '<p class="m-0 text-sm text-muted">' + escape(sub) + '</p>' : '') + '</div></div></section>';
  }

  function detailMarkup(group, dto) {
    const heading = group.id === OTHER_GROUP ? group.label : group.id === ALL_GROUP ? 'Documents' : 'Needed for ' + group.label;
    return '<section aria-label="' + escape(group.label) + '">' +
      '<div class="mb-3 xl:hidden"><button type="button" class="inline-flex items-center gap-1 ' + BUTTON + '" data-doc-action="back">' + icon('chevron-left') + 'All activities</button></div>' +
      '<div class="flex flex-wrap items-center justify-between gap-2"><h3 class="m-0 text-h1 font-semibold text-ink">' + escape(heading) + '</h3>' +
      '<span class="' + TONE[groupChip(group).tone === 'done' ? 'done' : 'waiting'] + '">' + completeCount(group) + ' of ' + group.documents.length + ' complete</span></div>' +
      '<div class="mt-3 grid gap-3 sm:grid-cols-2">' + group.documents.map(doc => documentMarkup(doc, dto)).join('') + '</div></section>';
  }

  /** The first Review that still needs the team, else the first. */
  function defaultSelection(groups) {
    return (groups.find(group => groupChip(group).tone === 'active') || groups[0]).id;
  }

  /** `view` = {selected: a group id, mode: 'list'|'detail'} (the mode only matters below xl). */
  function listMarkup(dto, notice, view) {
    const banner = notice ? '<p class="' + NOTICE + '" role="status" data-doc-notice>' + escape(notice) + '</p>' : '';
    if (!dto.documents.length) return banner + p('No documents are listed yet.', 'text-muted');
    const groups = groupDocuments(dto.documents);
    const selectedId = view && groups.some(group => group.id === view.selected) ? view.selected : defaultSelection(groups);
    const mode = view && view.mode === 'detail' ? 'detail' : 'list';
    const selected = groups.find(group => group.id === selectedId);
    return banner + '<div class="group/docs" data-doc-shell data-doc-view="' + mode + '">' +
      '<div class="grid gap-4 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:items-start">' +
      '<div class="flex min-w-0 flex-col gap-4 group-data-[doc-view=detail]/docs:max-xl:hidden" data-doc-list>' + summaryMarkup(dto) +
      '<section aria-labelledby="docListHeading"><h3 id="docListHeading" class="m-0 mb-2 px-1 text-sm font-semibold text-ink-2">Activities</h3>' +
      '<ul class="m-0 list-none divide-y divide-edge overflow-hidden p-0 ' + CARD + '">' + groups.map(group => rowMarkup(group, group.id === selectedId)).join('') + '</ul></section></div>' +
      '<div class="min-w-0 group-data-[doc-view=list]/docs:max-xl:hidden" data-doc-detail>' + detailMarkup(selected, dto) + '</div></div></div>';
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
      host.innerHTML = listMarkup(dto, notice, state);
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
    hosts.set(host, {teamId: teamId || '', dto: null, busy: false, notice: '', selected: '', mode: 'list'});
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

  /** Copy evidence: idempotent on the server, so it needs no request ID. The server's message (what was copied, what is left) is shown after the reload. */
  function copyEvidence(host, card, button) {
    const state = hosts.get(host), documentId = button.getAttribute('data-document');
    const status = card.querySelector('[data-doc-status]');
    const done = getUi().busy.write(status, 'Copying evidence…', Array.from(card.querySelectorAll('button, textarea')));
    return bridge.write('API_student_copyEvidence', [{documentId}]).then(result => {
      done();
      state.notice = result && result.message ? result.message : '';
      state.dto = null;
      return load(host);
    }, error => {
      done(errorMessage(error));
      if (error && (error.code === 'REJECTED' || error.code === 'UNAVAILABLE')) { state.notice = errorMessage(error); return load(host); }
    });
  }

  /**
   * Check for new evidence: the server reads the repository now (the screen load reads none) and returns this document's evidence with its waiting
   * and too-large files. The result is put into the DTO already on screen and the list is drawn again; the next load shows the saved counts.
   */
  function checkEvidence(host, card, button) {
    const state = hosts.get(host), documentId = button.getAttribute('data-document');
    const status = card.querySelector('[data-doc-status]');
    const done = getUi().busy.write(status, 'Checking the repository…', Array.from(card.querySelectorAll('button, textarea')));
    return bridge.read('evidence-check:' + documentId, 'API_student_checkEvidence', [{documentId}], {timeoutMs: 120000}).then(result => {
      done();
      const item = state.dto && state.dto.documents.find(candidate => candidate.documentId === documentId);
      if (!host.isConnected || hosts.get(host) !== state || !item) return;
      item.evidence = result.evidence;
      if (item.can) item.can.copyEvidence = result.can.copyEvidence;
      host.innerHTML = listMarkup(state.dto, result.message || '', state);
    }, error => {
      if (error && error.superseded) return;
      done(errorMessage(error));
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

  /** Opens a Review's documents (select) or goes back to the list (id null) below xl. Only the open Review is drawn, so a half-typed note lasts only while it stays open. */
  function show(host, id) {
    const state = hosts.get(host);
    if (!state || !state.dto) return;
    if (id) { state.selected = id; state.mode = 'detail'; } else state.mode = 'list';
    host.innerHTML = listMarkup(state.dto, '', state);
  }

  /** The chevron of a document card: shows or hides its commit details and history. */
  function toggle(button) {
    const card = button.closest('[data-document-card]'), panel = card && card.querySelector('[data-doc-panel="' + button.getAttribute('data-doc-target') + '"]');
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    const chevron = button.querySelector('[data-doc-chevron]');
    if (chevron) chevron.classList.toggle('rotate-180', open);
  }

  function onClick(event) {
    const button = event.target.closest ? event.target.closest('[data-doc-action]') : null;
    if (!button || button.disabled) return;
    const host = event.currentTarget, action = button.getAttribute('data-doc-action'), card = button.closest('[data-document-card]');
    if (action === 'retry') { load(host); return; }
    if (action === 'select' || action === 'back') { show(host, action === 'select' ? button.getAttribute('data-doc-group') : null); return; }
    if (action === 'toggle') { toggle(button); return; }
    if (!card || !hosts.get(host) || !hosts.get(host).dto) return;
    if (action === 'submit' || action === 'check') submit(host, card, button);
    else if (action === 'approve' || action === 'return') decide(host, card, button, action);
    else if (action === 'reopen') reopen(host, card, button);
    else if (action === 'copy-evidence') copyEvidence(host, card, button);
    else if (action === 'check-evidence') checkEvidence(host, card, button);
  }

  return {mount, load, markup: (dto, notice) => listMarkup(dto, notice, null)};
}
