/**
 * STUDENT GITHUB ACTIONS — browser module serialized into the dashboard shell as `StudentGithub`.
 * The student's GitHub connection flow: refresh status, retry repository setup, preview the profile,
 * confirm the account. Server calls go through the bridge (API_student_*); the dashboard refresh and the
 * loading overlay come from DashboardUI. It never calls google.script.run.
 */
function studentGithubBrowser_(bridge, getUi) {
  'use strict';
  const byId = id => document.getElementById(id);
  const setText = (id, text) => { const el = byId(id); if (el) el.textContent = text; };
  const setLoading = (id, label) => { const el = byId(id); if (el) el.innerHTML = getUi().renderSkeleton('inline', label); };
  const setButtonsDisabled = (container, disabled) => { if (container) container.querySelectorAll('button').forEach(btn => { btn.disabled = disabled; }); };
  const beginContentLoading = (target, label, options) => getUi().beginContentLoading(target, label, options);
  const escapeClientHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const errorMessage = err => {
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err.message === 'string' && err.message.trim()) return err.message.trim();
    return 'The server did not provide error details';
  };
  const loadRoleContent = (key, background, refresh, onLoaded, onError) => getUi().reloadRole(key, onLoaded, onError);

  function refreshGithubStatus(button, message) {
    const statusButton = byId('githubStatusRefresh');
    if (statusButton) { statusButton.hidden = false; statusButton.disabled = true; }
    setLoading('githubSubmitStatus', message || 'Refreshing GitHub status');
    loadRoleContent('student', false, true, function() {
      setText('githubSubmitStatus', message || '');
    }, function(err) {
      if (statusButton) { statusButton.hidden = false; statusButton.disabled = false; }
      setText('githubSubmitStatus', (message ? message + ' ' : '') + 'Dashboard refresh failed: ' + errorMessage(err) + '. Use Refresh GitHub status to retry.');
    });
  }

  function retryGithubSetup(button) {
    if (button.disabled) return;
    button.disabled = true;
    setLoading('githubSubmitStatus', 'Checking team usernames and repository access');
    function finish(message) {
      button.disabled = false;
      refreshGithubStatus(null, message);
    }
    bridge.write('API_student_completeGithubSetup',[]).then(function(result) { finish(result.message || ''); },
      function(err) { finish(errorMessage(err)); });
  }

  function focusGithubAccountForm(button) {
    const card = button.closest('[data-step-card]');
    const input = card && card.querySelector('#studentGithubProfile');
    if (!input || input.disabled) return;
    input.scrollIntoView({block:'center', behavior:'auto'});
    input.focus({preventScroll:true});
  }

  function previewGithubAccount(event, form) {
    event.preventDefault();
    if (form.githubBusy || !form.reportValidity()) return;
    const input = form.elements.profileUrl, panel = form.querySelector('[data-github-confirmation]');
    const request = (form.githubRequest || 0) + 1;
    form.githubRequest = request; form.githubBusy = true; form.githubToken = null;
    setButtonsDisabled(form,true); input.disabled = true;
    panel.hidden = false;
    const finish = beginContentLoading(panel,'Resolving GitHub account');
    function settle() { finish(); form.githubBusy = false; input.disabled = false; setButtonsDisabled(form,false); }
    bridge.write('API_student_previewGithub',[input.value]).then(function(result) {
      settle();
      if (!form.isConnected || form.githubRequest !== request) return;
      form.githubToken = result.token;
      const account = result.account, esc = escapeClientHtml;
      panel.innerHTML = '<div class="flex items-center gap-3">' + (account.avatarUrl ? '<img width="48" height="48" alt="" class="size-12 shrink-0 rounded-full border border-edge" src="' + esc(account.avatarUrl) + '">' : '') +
        '<div class="min-w-0"><p class="m-0 font-semibold text-ink">' + esc(account.displayName || account.username) + '</p><a class="text-sm text-primary" target="_blank" rel="noopener" href="' + esc(account.profileUrl) + '">@' + esc(account.username) + '</a></div></div>' +
        '<p class="m-0 text-sm text-ink-2">Is this your GitHub account?</p><div class="flex flex-wrap gap-2"><button type="button" class="border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50" data-confirm-account>Yes, this is my account</button><button type="button" class="border-0 inline-flex items-center rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50 no-underline" data-change-account>No, change profile link</button></div>';
      input.disabled = true;
      form.querySelector('button[type="submit"]').hidden = true;
      if (!panel.actionsAttached) {
        panel.actionsAttached = true;
        panel.addEventListener('click', function(event) {
          const target = event.target.closest && event.target.closest('button');
          if (!target || !panel.contains(target)) return;
          if (target.hasAttribute('data-confirm-account')) confirmGithubAccount(form);
          else if (target.hasAttribute('data-change-account')) {
            form.githubRequest++; form.githubToken = null; panel.hidden = true; panel.innerHTML = '';
            input.disabled = false; form.querySelector('button[type="submit"]').hidden = false; input.focus();
          }
        });
      }
      panel.querySelector('[data-confirm-account]').focus();
    }, function(error) {
      settle();
      if (!form.isConnected || form.githubRequest !== request) return;
      setText('githubSubmitStatus',errorMessage(error)); input.focus();
    });
  }

  function confirmGithubAccount(form) {
    if (form.githubBusy || !form.githubToken) return;
    form.githubBusy = true; setButtonsDisabled(form,true);
    const stopBusy = getUi().busy.write(byId('githubSubmitStatus'), 'Connecting GitHub account…');
    bridge.write('API_student_confirmGithub',[form.githubToken]).then(function(result) {
      stopBusy();
      form.githubBusy = false;
      if (!form.isConnected) return;
      form.hidden = true; form.githubToken = null;
      setText('githubSubmitStatus',result.message);
      bridge.write('API_student_completeGithubSetup',[]).then(function(setup) { refreshGithubStatus(null,result.message + ' ' + (setup.message || '')); },
        function(error) { refreshGithubStatus(null,'GitHub account connected. Repository access is pending: ' + errorMessage(error)); });
    }, function(error) {
      stopBusy();
      form.githubBusy = false; setButtonsDisabled(form,false);
      if (form.isConnected) setText('githubSubmitStatus',errorMessage(error));
    });
  }


  return {refreshGithubStatus, retryGithubSetup, focusGithubAccountForm, previewGithubAccount};
}
