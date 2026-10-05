/**
 * SYSTEM STATUS ACTIONS — browser module serialized into the dashboard shell as `SystemStatusActions`.
 * The coordinator's System Status card actions: committee and assessment readiness checks, definition
 * bootstrap, storage setup, GitHub access sync and the student-invitation resend log. Every server call
 * goes through the bridge (API_coordinator_*); DashboardUI only forwards to this module and owns the
 * shared loading overlay. It never calls google.script.run.
 */
function systemStatusActionsBrowser_(bridge, getUi) {
  'use strict';
  const byId = id => document.getElementById(id);
  const setText = (id, text) => { const el = byId(id); if (el) el.textContent = text; };
  const escapeClientHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const beginContentLoading = (target, label, options) => getUi().beginContentLoading(target, label, options);
  const errorMessage = err => {
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err.message === 'string' && err.message.trim()) return err.message.trim();
    return 'The server did not provide error details';
  };

  const PAGE_BUTTON = 'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-line bg-paper px-3 text-sm text-ink no-underline hover:bg-tint aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:font-semibold aria-[current=page]:text-paper disabled:pointer-events-none disabled:opacity-50';
  const paginationState = new WeakMap();
  /** Page changes arrive through one delegated listener per button strip, never one listener per button. */
  function bindPagination(buttons) {
    if (paginationState.has(buttons)) return;
    paginationState.set(buttons, null);
    buttons.addEventListener('click', event => {
      const button = event.target.closest ? event.target.closest('button[data-page]') : null;
      const current = paginationState.get(buttons);
      if (!button || button.disabled || !current) return;
      current.state.page = Number(button.getAttribute('data-page'));
      current.onChange();
    });
  }
  function renderTeamPagination(totalRows, state, prefix, onChange, rowLabel = 'teams') {
    const info = byId(prefix + 'PaginationInfo');
    const buttons = byId(prefix + 'PaginationButtons');
    const select = byId(prefix + 'PageSize');
    if (select) select.value = String(state.size);
    const pageSize = state.size === 'all' ? Math.max(1, totalRows) : state.size;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    const start = totalRows === 0 ? 0 : ((state.page - 1) * pageSize) + 1;
    const end = Math.min(state.page * pageSize, totalRows);

    if (info) info.textContent = 'Showing ' + start + ' - ' + end + ' of ' + totalRows + ' ' + rowLabel;

    const bounds = {start:start ? start - 1 : 0, end:end};
    if (!buttons) return bounds;
    bindPagination(buttons);
    paginationState.set(buttons, {state, onChange});

    const button = (label, page, disabled, active) => '<button type="button" class="' + PAGE_BUTTON + '" data-page="' + page + '"' + (disabled ? ' disabled' : '') + (active ? ' aria-current="page"' : '') + '>' + label + '</button>';
    const dots = '<span class="px-1 text-muted">…</span>';
    // Keep the control compact when there are many pages.
    let firstPage = Math.max(1, state.page - 2);
    const lastPage = Math.min(totalPages, firstPage + 4);
    firstPage = Math.max(1, lastPage - 4);
    let html = button(getUi().renderIcon('chevron-left') + 'Previous', state.page - 1, state.page === 1, false);
    if (firstPage > 1) html += button('1', 1, false, state.page === 1) + (firstPage > 2 ? dots : '');
    for (let page = firstPage; page <= lastPage; page++) html += button(String(page), page, false, page === state.page);
    if (lastPage < totalPages) html += (lastPage < totalPages - 1 ? dots : '') + button(String(totalPages), totalPages, false, state.page === totalPages);
    html += button('Next' + getUi().renderIcon('chevron-right'), state.page + 1, state.page === totalPages, false);
    buttons.innerHTML = html;
    return bounds;
  }

  function changeTeamPageSize(key, value) {
    if (!['10','25','50','all'].includes(String(value))) return;
    if (key === 'invitations') {
      const host = byId('studentInvitationResend');
      if (!host || !host.resendPagination) return;
      host.resendPagination.size = value === 'all' ? 'all' : Number(value);
      host.resendPagination.page = 1;
      host.renderResendLog();
      return;
    }
  }

  let checkingCommitteeConfiguration=false;
  function recheckCommitteeConfiguration() {
    const card=byId('committeeConfigurationCard');if(!card||checkingCommitteeConfiguration)return;
    checkingCommitteeConfiguration=true;
    const finishLoading=beginContentLoading(card,'Checking review committees');
    const button=byId('committeeConfigurationRecheck');button.disabled=true;
    const content=byId('committeeDirectoryContent');
    const expanded=new Set(Array.from(content.querySelectorAll('details[open]')).map(item=>item.getAttribute('data-committee-key')));
    function finish(report,error){
      finishLoading();
      if(byId('committeeConfigurationCard')!==card)return;
      checkingCommitteeConfiguration=false;button.disabled=false;getUi().busy.mark(card, false);
      card.setAttribute('data-state',error?'error':report.state);
      const messages=error?[{message:'Unable to check review committees: '+error+'. Try Recheck.'}]:report.issues;
      SystemStatusView.renderIssues(byId('committeeConfigurationIssues'),messages.map(issue=>issue.message));
      if(error){if(!card.hasAttribute('data-readiness-loaded'))setText('committeeConfigurationSummary','Unable to check readiness');return;}
      setText('committeeConfigurationSummary',report.summary);
      content.innerHTML=SystemStatusView.committeeDirectory(report.committees);
      content.querySelectorAll('details').forEach(item=>{item.open=expanded.has(item.getAttribute('data-committee-key'));});
      card.setAttribute('data-readiness-loaded','true');
      setText('committeeConfigurationCheckedAt','Last checked: '+new Date(report.checkedAt).toLocaleString());
      [['committeeConfigLink','committees'],['committeeAssignmentsLink','assignments']].forEach(([id,key])=>{const link=byId(id),url=report.links[key];link.hidden=!url;if(url)link.href=url;});
    }
    bridge.read('committee-configuration','API_coordinator_getCommitteeConfiguration',[],{timeoutMs:120000}).then(report=>finish(report,null),error=>finish(null,errorMessage(error)));
  }

  let checkingTeamFolders = false;
  let creatingTeamFolders = false;
  let teamFoldersReport = null;
  /** Reads the team folder state. A failed refresh keeps what the card already shows. */
  function recheckTeamFolders() {
    const card = byId('teamFoldersCard');
    if (!card || checkingTeamFolders || creatingTeamFolders) return;
    checkingTeamFolders = true;
    const finishLoading = beginContentLoading(card, 'Checking team folders');
    const recheck = byId('teamFoldersRecheck'), create = byId('teamFoldersCreate');
    recheck.disabled = true;
    create.disabled = true;
    getUi().busy.mark(card, true);
    function finish(report, error) {
      finishLoading();
      if (byId('teamFoldersCard') !== card) return;
      checkingTeamFolders = false;
      recheck.disabled = false;
      getUi().busy.mark(card, false);
      if (error) {
        create.disabled = !teamFoldersReport || !teamFoldersReport.canCreate;
        SystemStatusView.renderIssues(byId('teamFoldersIssues'), ['Unable to check team folders: ' + error + '. Try Recheck.']);
        if (!teamFoldersReport) setText('teamFoldersSummary', 'Unable to check team folders');
        return;
      }
      teamFoldersReport = report;
      SystemStatusView.renderTeamFolders(report);
    }
    bridge.read('team-folders', 'API_coordinator_getTeamFolders', [], {timeoutMs:120000}).then(report => finish(report, null), error => finish(null, errorMessage(error)));
  }

  /** Asks first, naming the folder the team folders will go into, then creates them batch by batch. */
  function createTeamFolders() {
    const report = teamFoldersReport;
    if (!report || !report.canCreate || creatingTeamFolders || checkingTeamFolders) return;
    const count = report.missing.length;
    getUi().confirmDialog({
      title: 'Create team folders',
      body: 'Create the folder "Team Documents" (if it does not exist) inside "' + report.baseFolder.name + '", and ' + count + ' team folder' + (count === 1 ? '' : 's') + ' inside it?',
      confirmText: 'Create folders', cancelText: 'Cancel'
    }).then(approved => { if (approved) runTeamFolderCreation(); });
  }
  function runTeamFolderCreation() {
    const card = byId('teamFoldersCard'), button = byId('teamFoldersCreate'), recheck = byId('teamFoldersRecheck');
    if (!card || creatingTeamFolders) return;
    creatingTeamFolders = true;
    button.disabled = true;
    recheck.disabled = true;
    getUi().busy.mark(card, true);
    const created = [], failed = [];
    let stopBusy = null;
    function finish(message) {
      creatingTeamFolders = false;
      if (stopBusy) stopBusy();
      if (byId('teamFoldersCard') !== card) return;
      recheck.disabled = false;
      getUi().busy.mark(card, false);
      setText('teamFoldersStatus', message);
      recheckTeamFolders();
    }
    function batch(cursor) {
      stopBusy = getUi().busy.write(byId('teamFoldersStatus'), 'Creating team folders… ' + created.length + ' created so far.');
      bridge.write('API_coordinator_createTeamFolders', [cursor]).then(result => {
        created.push(...result.created);
        failed.push(...result.failed);
        if (result.nextCursor !== null) { if (card.isConnected) batch(result.nextCursor); else finish('Run paused because this section was closed. Recheck to continue.'); return; }
        finish(created.length + ' team folder' + (created.length === 1 ? '' : 's') + ' created.' + (failed.length ? ' Failed: ' + failed.map(item => item.teamId + ' (' + item.reason + ')').join('; ') + '. Use Recheck, then create again to retry.' : ''));
      }, error => finish('Folder creation stopped: ' + errorMessage(error) + '. ' + created.length + ' created before the stop. Recheck, then create again to resume.'));
    }
    batch('');
  }

  let reviewConfigurationValid = false;
  let assessmentStorageAvailable = false;
  let checkingReviewConfiguration = false;
  let bootstrappingDefinitions = false;
  let definitionsBootstrapAvailable = false;
  function recheckReviewConfiguration() {
    const card = byId('reviewConfigurationCard');
    if (!card || checkingReviewConfiguration || initializingAssessmentStorage || bootstrappingDefinitions) return;
    if(typeof WeeklyPhase2Setup !== 'undefined')WeeklyPhase2Setup.load();
    checkingReviewConfiguration = true;
    const finishLoading = beginContentLoading(card, 'Checking assessment readiness');
    reviewConfigurationValid = false;
    getUi().busy.mark(card, true);
    card.setAttribute('data-state', 'checking');
    byId('reviewConfigurationRecheck').disabled = true;
    byId('initializeAssessmentStorageButton').disabled = true;
    const createButton=byId('createAssessmentDefinitionsButton');
    if(createButton)createButton.disabled=true;
    function finish(report, error) {
      finishLoading();
      if(byId('reviewConfigurationCard')!==card)return;
      checkingReviewConfiguration = false;
      reviewConfigurationValid = !error && report.valid;
      assessmentStorageAvailable = reviewConfigurationValid && report.canInitializeStorage !== false;
      definitionsBootstrapAvailable = !error && report.canBootstrap === true;
      if(createButton){createButton.hidden=!definitionsBootstrapAvailable;createButton.disabled=!definitionsBootstrapAvailable;}
      getUi().busy.mark(card, false);
      card.setAttribute('data-state', error ? 'error' : report.state);
      byId('reviewConfigurationRecheck').disabled = false;
      byId('initializeAssessmentStorageButton').disabled = !assessmentStorageAvailable || initializingAssessmentStorage;
      const issues = error ? [{sheet:'Configuration', message:error}] : report.issues;
      if(report)setText('reviewConfigurationSummary',report.summary);
      else if(!card.hasAttribute('data-readiness-loaded'))setText('reviewConfigurationSummary','Unable to check readiness');
      byId('reviewConfigurationSummary').title = reviewConfigurationValid ? 'Assessment definitions and rubric criteria are valid.' : 'Resolve the issues below before initializing assessment storage.';
      SystemStatusView.renderIssues(byId('reviewConfigurationIssues'), issues.map(function(issue) { return issue.sheet + ': ' + issue.message; }));
      if (report) {
        const setup=byId('assessmentStorageSetup');
        if(setup)setup.hidden=report.storageComplete===true;
        SystemStatusView.renderReadiness(byId('reviewAssessmentReadiness'), report.storage);
        card.setAttribute('data-readiness-loaded','true');
        setText('reviewConfigurationCheckedAt', 'Last checked: ' + new Date(report.checkedAt).toLocaleString());
        [['reviewDefinitionsLink','definitions'],['reviewConfigLink','config'],['reviewRubricsLink','rubrics']].forEach(function(pair) {
          const link = byId(pair[0]), url = report.links[pair[1]];
          link.hidden = !url; if (url) link.href = url;
        });
      }
    }
    bridge.read('review-configuration','API_coordinator_getReviewConfiguration',[],{timeoutMs:120000}).then(function(report) { finish(report, null); },
      function(err) { finish(null, 'Unable to check configuration: ' + errorMessage(err) + '. Try Recheck.'); });
  }

  function bootstrapAssessmentDefinitions() {
    if(!definitionsBootstrapAvailable||bootstrappingDefinitions||checkingReviewConfiguration||initializingAssessmentStorage)return;
    bootstrappingDefinitions=true;
    const card=byId('reviewConfigurationCard'),button=byId('createAssessmentDefinitionsButton');
    const finishLoading=beginContentLoading(card,'Creating assessment definitions schema');
    button.disabled=true;
    byId('reviewConfigurationRecheck').disabled=true;
    const stopBusy=getUi().busy.write(byId('assessmentStorageStatus'),'Creating assessment definitions schema…');
    function finish(message){
      stopBusy();
      finishLoading();
      bootstrappingDefinitions=false;
      setText('assessmentStorageStatus',message);
      recheckReviewConfiguration();
    }
    bridge.write('API_coordinator_createDefinitions',[]).then(function(result){
      finish(result.created?'AssessmentDefinitions created with headers only. Open Assessment definitions to configure the graded assessments, then Recheck.':'AssessmentDefinitions already exists. Existing configuration was left unchanged.');
    },function(err){
      finish('Definitions setup stopped: '+errorMessage(err));
    });
  }

  let initializingAssessmentStorage = false;
  function initializeAssessmentStorage() {
    if(initializingAssessmentStorage||!reviewConfigurationValid||!assessmentStorageAvailable||checkingReviewConfiguration||bootstrappingDefinitions)return;
    initializingAssessmentStorage=true;
    const button=byId('initializeAssessmentStorageButton'),results=byId('assessmentStorageResults');
    if(button)button.disabled=true;
    if(results)results.textContent='';
    const stopBusy=getUi().busy.write(byId('assessmentStorageStatus'),'Preparing assessment storage…');
    function finish(message){
      stopBusy();
      initializingAssessmentStorage=false;
      if(button)button.disabled=!assessmentStorageAvailable;
      setText('assessmentStorageStatus',message);
      recheckReviewConfiguration();
    }
    bridge.write('API_coordinator_prepareStorage',[]).then(function(result){
      const journals=result.journals;
      if(results)SystemStatusView.renderJournalResults(results,journals);
      finish(journals.length+' assessment journals ready. Existing assessment data was left unchanged.');
      document.querySelectorAll('[data-publishing]').forEach(function(section){InternalAssessmentPublishing.refresh(section.dataset.publishing);});
    },function(err){
      finish('Setup stopped: '+errorMessage(err)+'. Retry to resume missing assessment storage.');
    });
  }

  function runGithubSync() {
    const btn = document.getElementById('githubSyncButton');

    const stopBusy = btn ? getUi().busy.write(btn, 'Syncing…', [btn]) : function() {};

    bridge.write('API_coordinator_syncGithub',[])
      .then(function(result) {

        // Update the displayed repository access count
        // without reloading the Apps Script page.
        const accessValue = document.getElementById('githubReposAccess');

        if (accessValue) {
          accessValue.textContent =
            result.verifiedAccess + ' / ' + result.totalRepos;
        }

        let message =
          'GitHub access sync completed.\n\n' +
          'Coordinator: ' + result.username + '\n' +
          'Verified access: ' +
          result.verifiedAccess + ' / ' + result.totalRepos + '\n' +
          'Already accessible: ' + result.alreadyAccessible + '\n' +
          'Repaired: ' + result.repaired + '\n' +
          'Failed: ' + result.failedCount;

        getUi().notify(message, result.failedCount ? 'warning' : 'success');

        stopBusy('Run Sync');
      }, function(error) {

        getUi().notify(
          'GitHub access sync failed.\n\n' +
          (error && error.message
            ? error.message
            : 'Unknown error')
        );

        stopBusy('Run Sync');
      });
  }

  let studentInvitationResendBusy = false;
  function runStudentInvitationResend() {
    if (studentInvitationResendBusy) return;
    const host = document.getElementById('studentInvitationResend');
    if (!host) return;
    const button = host.querySelector('[data-action="resend"]'), status = host.querySelector('[data-resend-status]');
    const output = host.querySelector('[data-resend-results]');
    const results = host.resendResults || new Map();
    host.resendResults = results;
    host.resendPagination = host.resendPagination || {page:1, size:10};
    studentInvitationResendBusy = true;
    let stopBusy = null;
    button.disabled = true;
    getUi().busy.mark(host, true);
    function render() {
      const rows = Array.from(results.values());
      host.querySelector('[data-resend-log]').hidden = !rows.length;
      const bounds = renderTeamPagination(rows.length, host.resendPagination, 'studentInvitations', render, 'students');
      output.innerHTML = rows.length ? '<table class="w-full border-collapse text-sm [&_th]:border-b [&_td]:border-b [&_th]:border-edge [&_td]:border-edge [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1 [&_th]:text-left [&_td]:text-left [&_td]:align-top [&_thead_th]:bg-soft [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:text-ink-2"><thead><tr><th>Team</th><th>Student</th><th>GitHub</th><th>Result</th><th>Details</th></tr></thead><tbody>' + rows.slice(bounds.start, bounds.end).map(row => '<tr>' + [row.teamId,row.student,row.username,row.status,row.reason].map(value => '<td>' + escapeClientHtml(value || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '';
      return ['invited','already joined','pending','skipped','failed'].map(kind => rows.filter(row => row.status === kind).length + ' ' + kind).join(' · ');
    }
    host.renderResendLog = render;
    function finish(message, retry) {
      studentInvitationResendBusy = false;
      button.disabled = false;
      getUi().busy.mark(host, false);
      button.textContent = retry ? 'Retry remaining invitations' : 'Resend expired student invitations';
      if (stopBusy) stopBusy();
      status.textContent = message + ' ' + render();
    }
    function batch(cursor) {
      stopBusy = getUi().busy.write(status, 'Processing student invitations. Completed results remain below.');
      bridge.write('API_coordinator_resendInvitations',[cursor]).then(function(result) {
        result.results.forEach(row => results.set(row.teamId + ':' + row.email, row));
        render();
        host.resendCursor = result.nextCursor;
        if (result.stopped) { finish('GitHub paused this run. Check rate limits or token permissions before retrying.', true); return; }
        if (result.nextCursor !== null) {
          if (host.isConnected) batch(result.nextCursor);
          else finish('Run paused because this section was closed. Reopen it to recheck remaining invitations.', true);
          return;
        }
        host.resendCursor = null;
        finish('Invitation check complete.', false);
      }, function(error) {
        host.resendCursor = cursor;
        finish('Run interrupted: ' + (error && error.message || 'Unknown error') + '. Retry to recheck unfinished work.', true);
      });
    }
    batch(host.resendCursor || '');
  }


  /** A freshly rendered System Status frame starts every check from a clean state. */
  function resetChecks() { checkingReviewConfiguration = false; checkingCommitteeConfiguration = false; checkingTeamFolders = false; teamFoldersReport = null; reviewConfigurationValid = false; }
  function recheckAll() { recheckReviewConfiguration(); recheckCommitteeConfiguration(); recheckTeamFolders(); }

  return {renderTeamPagination, resetChecks, recheckAll, recheckTeamFolders, createTeamFolders, recheckCommitteeConfiguration, recheckReviewConfiguration, bootstrapAssessmentDefinitions, initializeAssessmentStorage, runGithubSync, runStudentInvitationResend, changeTeamPageSize};
}
