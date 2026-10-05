/**
 * DASHBOARD CLIENT SCRIPTS
 *
 * Single source of truth for browser-side behaviour used by both
 * single-role and multi-role dashboards.
 */
/** Shared server/browser text preview, matching the 130-character card limit. */
function renderExpandableText_(value, maxLen = 130) {
  const full = String(value || '');
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if (full.length <= maxLen) return escape(full);
  return '<details class="expandable-text group"><summary class="[&::-webkit-details-marker]:hidden"><span class="expandable-text-preview group-open:hidden">' +
    escape(full.slice(0, maxLen).trim()) + '&hellip; <em>more</em></span>' +
    '<span class="expandable-text-full hidden group-open:inline">' + escape(full) +
    ' <em>less</em></span></summary></details>';
}

/** Shared confirmation, notice and short-text dialog using the framework modal. */
function dashboardDialogsBrowser_() {
  let queue=Promise.resolve(), pending=0, activeTrigger=null;
  function show(kind,options,trigger) {
    const previous=trigger;
    activeTrigger=trigger;
    const host=document.querySelector('dialog[open]') || document.body;
    const overlay=document.createElement('div');overlay.className='fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 animate-[fade-in_.15s_cubic-bezier(.2,0,0,1)]';overlay.setAttribute('data-dialog-overlay','');
    const modal=document.createElement('section');modal.className='flex max-h-[calc(100vh-2rem)] w-full max-w-[520px] flex-col rounded-card bg-paper shadow-overlay animate-[scale-in_.25s_cubic-bezier(.2,0,0,1)]';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const heading=document.createElement('h2');heading.id='dashboardDialogHeading';
    heading.textContent=options.title || (kind==='confirm'?'Please confirm':kind==='prompt'?'Add a remark':'Message');
    modal.setAttribute('data-dialog-modal','');modal.setAttribute('aria-labelledby',heading.id);
    const header=document.createElement('div');header.className='flex items-center justify-between gap-3 border-b border-edge px-5 py-4';header.setAttribute('data-dialog-header','');header.appendChild(heading);
    const body=document.createElement('div');body.className='overflow-auto p-5';
    body.setAttribute('data-dialog-body','');const message=document.createElement('p');message.className=options.tone==='danger'?'rounded-md bg-danger-tint px-3 py-2 text-danger student-text whitespace-pre-line [overflow-wrap:anywhere]':'student-text whitespace-pre-line [overflow-wrap:anywhere]';message.textContent=String(options.body || '');body.appendChild(message);
    const footer=document.createElement('div');footer.setAttribute('data-dialog-footer','');footer.className='flex justify-end gap-2 border-t border-edge px-5 py-3';
    let input=null,error=null;
    if(kind==='prompt') {
      input=document.createElement('textarea');input.maxLength=5000;
      input.setAttribute('aria-label',String(options.body || ''));body.appendChild(input);
      error=document.createElement('p');error.setAttribute('role','alert');error.hidden=true;body.appendChild(error);
    }
    const cancel=document.createElement('button');cancel.type='button';cancel.setAttribute('data-dialog-cancel','');cancel.className='border-0 inline-flex items-center rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50 no-underline';cancel.textContent=options.cancelText || 'Cancel';
    const confirm=document.createElement('button');confirm.type='button';confirm.setAttribute('data-dialog-confirm','');confirm.className='border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';confirm.textContent=options.confirmText || (kind==='alert'?'OK':'Continue');
    if(kind!=='alert')footer.appendChild(cancel);
    footer.appendChild(confirm);modal.appendChild(header);modal.appendChild(body);modal.appendChild(footer);overlay.appendChild(modal);
    const siblings=Array.from(host.children).filter(node=>node!==overlay).map(node=>({node:node,inert:node.inert}));
    host.appendChild(overlay);siblings.forEach(item=>{item.node.inert=true;});
    return new Promise(resolve=>{
      let closed=false;
      function finish(approved) {
        if(closed)return;
        closed=true;
        overlay.removeEventListener('keydown',onKeydown);
        document.removeEventListener('focusin',onFocus,true);
        overlay.remove();siblings.forEach(item=>{item.node.inert=item.inert;});
        if(previous && previous.isConnected)previous.focus();
        resolve({isConfirmed:approved,value:approved && input?input.value:''});
      }
      function onKeydown(event) {
        if(event.key==='Escape'){event.preventDefault();finish(false);return;}
        if(event.key!=='Tab')return;
        const controls=Array.from(modal.querySelectorAll('button:not([disabled]),textarea:not([disabled])'));
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
      function onFocus(event){if(!overlay.contains(event.target)) (kind==='confirm'?cancel:input||confirm).focus();}
      overlay.addEventListener('keydown',onKeydown);
      // One delegated listener: the backdrop and both buttons.
      overlay.addEventListener('click',event=>{
        if(event.target===overlay||(event.target.closest&&event.target.closest('[data-dialog-cancel]'))){finish(false);return;}
        if(event.target.closest&&event.target.closest('[data-dialog-confirm]')){
          if(input && !input.value.trim()){error.textContent='Please enter a remark.';error.hidden=false;input.focus();return;}
          finish(true);
        }
      });
      document.addEventListener('focusin',onFocus,true);
      (kind==='confirm'?cancel:input||confirm).focus();
    });
  }
  function enqueue(kind,options) {
    const focused=document.activeElement;
    const trigger=focused && focused.closest && focused.closest('[data-dialog-overlay]') ? activeTrigger : focused;
    const invoke=()=>show(kind,options,trigger);
    const result=pending ? queue.then(invoke) : invoke();
    pending++;
    queue=result.then(()=>{pending--;},()=>{pending--;});
    return result;
  }
  function confirmDialog(options) {return enqueue('confirm',options).then(result=>result.isConfirmed);}
  return {
    confirmDialog,
    notify:(text,icon)=>enqueue('alert',{title:icon==='error'?'Unable to complete action':'Message',body:text,confirmText:'OK',tone:icon==='error'?'danger':icon}),
    ask:text=>confirmDialog({title:'Please confirm',body:text,confirmText:'Continue',cancelText:'Cancel',tone:/discard|delete|remove|reopen/i.test(text)?'danger':undefined}),
    requestText:async text=>{const result=await enqueue('prompt',{title:'Add a remark',body:text,confirmText:'Continue',cancelText:'Cancel'});return result.isConfirmed?result.value.trim():null;}
  };
}

function getDashboardClientScript_() {
  return `
const DashboardUI = (function() {
  'use strict';
  const renderSkeleton = ${getSkeletonMarkup_.toString()};
  const busy = (${busyStateBrowser_.toString()})(renderSkeleton, function(target, label, options) { return beginContentLoading(target, label, options); });
  const dialogs = (${dashboardDialogsBrowser_.toString()})();
  const renderExpandableText = ${renderExpandableText_.toString()};
  const renderAssessmentHistory = ${renderAssessmentHistory_.toString()};
  ${getLucideIconNodes_.toString()}
  ${renderLucideIcon_.toString()}
  ${initializeDashboardTooltips_.toString()}
  initializeDashboardTooltips_();

  function byId(id) { return document.getElementById(id); }
  // While a read runs the live content stays in place but invisible, under a skeleton overlay.
  const LOADING_CLASSES = ['relative!', 'overflow-hidden', '[&>:not([data-loading-overlay])]:invisible!'];
  const LOADING_COMPACT_CLASSES = ['[&>:not([data-loading-overlay])]:hidden!'];
  // Preserve live DOM, layout and event handlers until a read finishes.
  function beginContentLoading(target, label, options) {
    if (!target) return function() {};
    const overlay = document.createElement('div');
    const compact = options && options.compact;
    overlay.className = compact ? 'relative z-10 overflow-hidden' : 'absolute inset-0 z-10 overflow-hidden';
    overlay.setAttribute('data-loading-overlay', '');
    // Hidden tabs measure zero during preloading; that is not a small control.
    const height = target.clientHeight;
    overlay.innerHTML = renderSkeleton(options && options.variant || (!compact && height > 0 && height < 120 ? 'inline' : 'panel'), label);
    const children = Array.from(target.children).map(function(child) { return {node:child, inert:child.inert}; });
    children.forEach(function(child) { child.node.inert = true; });
    busy.mark(target, true);
    LOADING_CLASSES.forEach(function(name) { target.classList.add(name); });
    if (compact) { target.setAttribute('data-loading-compact', ''); LOADING_COMPACT_CLASSES.forEach(function(name) { target.classList.add(name); }); }
    target.appendChild(overlay);
    let finished = false;
    return function() {
      if (finished) return;
      finished = true;
      overlay.remove();
      children.forEach(function(child) { child.node.inert = child.inert; });
      busy.mark(target, false);
      LOADING_CLASSES.forEach(function(name) { target.classList.remove(name); });
      if (compact) { target.removeAttribute('data-loading-compact'); LOADING_COMPACT_CLASSES.forEach(function(name) { target.classList.remove(name); }); }
    };
  }
  function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
  function errorMessage(err) {
    if (typeof err === 'string' && err.trim()) return err.trim();
    if (err && typeof err.message === 'string' && err.message.trim()) return err.message.trim();
    return 'The server did not provide error details';
  }

  // Session-only diagnostics: no user records or extra telemetry requests.
  const performanceEvents = [];
  let pendingRequests = 0;
  let pendingRoleRequests = 0;
  let utilityRequestContext = false;
  let preloadTimer = null;
  let activeRole = null;
  let tabSelectedAt = 0;
  let roleQueue = null;
  const attemptedRoles = Object.create(null);
  const preloadedRoles = Object.create(null);
  const activatedRoles = Object.create(null);
  function recordPerformance(event) {
    performanceEvents.push(Object.assign({ atMs: performance.now() }, event));
    if (performanceEvents.length > 300) performanceEvents.shift();
  }
  window.DashboardPerformance = {
    snapshot: function() { return performanceEvents.map(function(event) { return Object.assign({}, event); }); },
    setPreloading: function(enabled) {
      window.DashboardPerformance.preloading = !!enabled;
      schedulePreload();
    },
    preloading: false
  };
  function schedulePreload() {
    clearTimeout(preloadTimer);
    scheduleUtilities();
    if (pendingRoleRequests || !roleQueue || document.hidden || !window.DashboardPerformance.preloading) return;
    if (!roleQueue.some(key => !attemptedRoles[key] && !loadedRoleTabs[key] && !loadingRoleTabs[key])) return;
    preloadTimer = setTimeout(function() {
      if (pendingRoleRequests || document.hidden || !window.DashboardPerformance.preloading) return;
      const key = roleQueue.find(key => !attemptedRoles[key] && !loadedRoleTabs[key] && !loadingRoleTabs[key]);
      if (!key) return;
      preloadedRoles[key] = true;
      recordPerformance({event:'preload_started', role:key});
      loadRoleContent(key, true);
    }, 750);
  }
  function scheduleUtilities() {
    if (document.hidden || !window.DashboardPerformance.preloading) return;
    if (byId('systemStatusContent') && !systemStatusState.attempted) ensureSystemStatusLoaded();
  }
  function initializeLoading() {
    schedulePreload();
  }
  document.addEventListener('visibilitychange', schedulePreload);
  // Wrap the immutable Apps Script runner, preserving callback and argument semantics.
  function dashboardRun() {
    function wrap(runner, success, failure) {
      return new Proxy({}, {get: function(_, method) {
        if (method === 'withSuccessHandler') return function(fn) { return wrap(runner, fn, failure); };
        if (method === 'withFailureHandler') return function(fn) { return wrap(runner, success, fn); };
        if (method === 'withUserObject') return function(value) { return wrap(runner.withUserObject(value), success, failure); };
        return function() {
          const started = performance.now();
          // Follow-up reads started by utility callbacks stay in the utility lane.
          const utility = utilityRequestContext || method === 'API_coordinator_getSystemStatus' || method === 'API_coordinator_getWeeklySetup';
          pendingRequests++;
          if (!utility) { pendingRoleRequests++; clearTimeout(preloadTimer); }
          let finished = false;
          function finish(ok, callback, args) {
            if (finished) return;
            finished = true;
            const previousContext = utilityRequestContext;
            utilityRequestContext = utility;
            try { if (callback) callback.apply(null, args); }
            finally {
              utilityRequestContext = previousContext;
              pendingRequests--;
              if (!utility) pendingRoleRequests--;
              recordPerformance({event:'request', method:String(method), ok:ok, durationMs:performance.now() - started});
              if (utility) scheduleUtilities();
              else schedulePreload();
            }
          }
          const request = runner.withSuccessHandler(function() { finish(true, success, arguments); })
            .withFailureHandler(function() { finish(false, failure, arguments); });
          try { return request[method].apply(request, arguments); }
          catch (err) { if (finished) throw err; finish(false, failure, [err]); }
        };
      }});
    }
    return wrap(google.script.run);
  }
  if (typeof DataBridge !== 'undefined') DataBridge.useRunner(dashboardRun);
  function activateRole(key) {
    if (!loadedRoleTabs[key] || activatedRoles[key]) return;
    activatedRoles[key] = true;
    if (key === 'guide' && typeof GuideWeekly !== 'undefined') GuideWeekly.load();
    if (key === 'student') { StudentWeekly.load(); StudentResults.all(); }
  }

  let sharedSchedule = null;
  let timelineRequest = null;

  function loadSharedTimeline() {
    if (sharedSchedule) return Promise.resolve(sharedSchedule);
    if (timelineRequest) return timelineRequest;
    const target = byId('sharedProjectTimeline');
    if (target) {
      busy.mark(target, true);
      target.innerHTML = renderSkeleton('timeline', 'Loading project timeline');
    }
    timelineRequest = new Promise(function(resolve, reject) {
      DataBridge.read('shared-timeline','API_shared_getTimeline',[],{timeoutMs:120000})
        .then(function(data) {
          try {
            // Publish one immutable snapshot for optional browser-side consumers.
            Object.freeze(data.schedule);
            data.milestones.forEach(Object.freeze);
            Object.freeze(data.milestones);
            if (target) SharedTimelineView.render(target, data);
            sharedSchedule = Object.freeze(data);
            if (target) busy.mark(target, false);
            resolve(sharedSchedule);
          } catch (err) { failed(err); }
        }, failed);
      function failed(err) {
        timelineRequest = null;
        if (target) {
          busy.mark(target, false);
          SharedTimelineView.renderError(target, function() { loadSharedTimeline().catch(function() {}); });
        }
        reject(err);
      }
    });
    return timelineRequest;
  }

  const loadedRoleTabs = Object.create(null);
  let sharedRubrics = null;
  let rubricsRequest = null;
  let sharedDrawerState = null;
  function syncRubricsDisclosure() {
    const section = byId('sharedRubrics');
    if (section) section.hidden = activeRole !== 'rubrics';
  }
  function loadSharedRubrics_() {
    if (rubricsRequest) return rubricsRequest;
    const target = byId('sharedRubricsContent'), section = byId('sharedRubrics');
    if (!target || !section) return Promise.resolve(null);
    busy.mark(section, true);
    target.innerHTML = renderSkeleton('panel', 'Loading assessment rubrics');
    rubricsRequest = new Promise(function(resolve, reject) {
      DataBridge.read('shared-rubrics','API_shared_getRubrics',[],{timeoutMs:120000}).then(function(data) {
        try {
          SharedRubricsView.render(target, data, openRubricDrawer);
          sharedRubrics = data;
          busy.mark(section, false);
          resolve(data);
        } catch (err) { reject(err); }
      }, reject);
    }).catch(function(err) {
      rubricsRequest = null;
      busy.mark(section, false);
      SharedRubricsView.renderError(target, function() { loadSharedRubrics_().catch(function() {}); });
      throw err;
    });
    return rubricsRequest;
  }

  function openRubricDrawer(key, trigger) {
    const item = sharedRubrics && sharedRubrics.assessments.find(function(a) { return a.key === key; });
    const drawer = byId('rubricDrawer');
    if (!item || !item.available || !drawer) return;
    closeCoordinatorTeamDrawer();
    byId('rubricDrawerTitle').textContent = item.label;
    byId('rubricDrawerContent').innerHTML = SharedRubricsView.detailMarkup(item);
    openContentDrawer(item.label, byId('rubricDrawerContent').innerHTML, trigger);
  }

  function openSharedDrawer(drawerId, scrimId, trigger) {
    const drawer = byId(drawerId), scrim = byId(scrimId);
    if (!drawer || !scrim) return;
    if (sharedDrawerState && sharedDrawerState.drawer !== drawer) closeSharedDrawer(sharedDrawerState.id, false);
    sharedDrawerState = {id:drawerId, drawer:drawer, scrim:scrim, trigger:trigger || document.activeElement};
    drawer.inert = false;
    drawer.hidden = false;
    scrim.hidden = false;
    drawer.classList.add('open');
    drawer.dataset.open = 'true';
    drawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
    document.body.classList.add('overflow-hidden');
    const focusTarget = (drawer.querySelector && drawer.querySelector('[data-drawer-close]')) || byId(drawerId === 'rubricDrawer' ? 'rubricDrawerClose' : 'teamDrawerClose');
    if (focusTarget) focusTarget.focus();
  }
  function closeSharedDrawer(drawerId, restoreFocus) {
    const drawer = byId(drawerId);
    if (!drawer || drawer.dataset.open !== 'true') return;
    const state = sharedDrawerState && sharedDrawerState.drawer === drawer ? sharedDrawerState : null;
    drawer.classList.remove('open');
    delete drawer.dataset.open;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    drawer.hidden = true;
    if (state) {
      state.scrim.hidden = true;
      state.scrim.classList.remove('open');
      sharedDrawerState = null;
      if (restoreFocus !== false && state.trigger && state.trigger.isConnected) state.trigger.focus();
    }
    document.body.classList.remove('overflow-hidden');
  }
  function openContentDrawer(title, content, trigger) {
    const drawer = byId('rubricDrawer');
    if (!drawer) return;
    closeCoordinatorTeamDrawer(false);
    byId('rubricDrawerTitle').textContent = title;
    byId('rubricDrawerContent').innerHTML = content;
    openSharedDrawer('rubricDrawer', 'rubricDrawerBackdrop', trigger);
    byId('rubricDrawerContent').scrollTop = 0;
  }
  function closeRubricDrawer(restoreFocus) {
    closeSharedDrawer('rubricDrawer', restoreFocus);
  }
  document.addEventListener('keydown', function(event) {
    const state = sharedDrawerState;
    if (!state) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (state.id === 'rubricDrawer') closeRubricDrawer();
      else closeCoordinatorTeamDrawer();
    }
    if (event.key === 'Tab') {
      const controls = Array.from(state.drawer.querySelectorAll ? state.drawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]') : []).filter(function(el) { return !el.hidden && (!el.getClientRects || el.getClientRects().length); });
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('focusin', function(event) {
    const state = sharedDrawerState;
    if (state && !state.drawer.contains(event.target)) {
      const close = (state.drawer.querySelector && state.drawer.querySelector('[data-drawer-close]')) || byId(state.id === 'rubricDrawer' ? 'rubricDrawerClose' : 'teamDrawerClose');
      if (close) close.focus();
    }
  });
  const loadingRoleTabs = Object.create(null);

  function updatedLabel() {
    return 'Last updated: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST';
  }
  // Header refresh details: mirrors the active tab's last-updated time and refreshes that tab.
  const shellUpdatedAt = Object.create(null);
  function shellTabBusy(key) { return key === 'system-status' ? systemStatusState.loading : !!loadingRoleTabs[key]; }
  function syncShellRefresh() {
    const button = byId('shellRefresh');
    if (!button) return;
    const key = activeRole;
    const refreshable = key !== 'rubrics' && (key === 'system-status' || !!migratedRoles[key]);
    const stamp = shellUpdatedAt[key] || '';
    const label = byId('shellUpdated');
    if (label) { label.textContent = refreshable ? stamp : ''; }
    button.disabled = !refreshable || shellTabBusy(key);
  }
  function refreshActiveTab() {
    const key = activeRole;
    if (key === 'system-status') { ensureSystemStatusLoaded(true); return; }
    if (!migratedRoles[key]) return;
    if (pendingRequests) { setText('shellUpdated', 'Please wait for the current operation to finish, then refresh.'); return; }
    loadRoleContent(key, false, true);
  }
  function refreshRoleDashboard(key) {
    if (!['guide', 'reviewer', 'coord'].includes(key)) return;
    if (pendingRequests) {
      setText(key + 'RefreshStatus', 'Please wait for the current operation to finish, then refresh.');
      return;
    }
    loadRoleContent(key, false, true);
  }
  // Roles already on the DTO + view architecture: load() resolves a DTO, render() draws it.
  const migratedRoles = { reviewer: ReviewerView, guide: GuideView, student: StudentView, coord: CoordinatorView };
  function loadRoleContent(activeKey, background, refresh, onLoaded, onError) {
    if ((!refresh && loadedRoleTabs[activeKey]) || loadingRoleTabs[activeKey]) {
      if (onError) onError(new Error('A dashboard refresh is already in progress. Please retry shortly.'));
      return;
    }

    const target = document.querySelector('[data-role-content="' + activeKey + '"]');
    if (!target) {
      if (onError) onError(new Error('The dashboard panel is unavailable. Reload the page.'));
      return;
    }

    const hadContent = !!loadedRoleTabs[activeKey];
    const finishLoading = beginContentLoading(target, 'Loading dashboard', {compact:activeKey === 'reviewer' || activeKey === 'student'});
    const refreshButton = byId(activeKey + 'Refresh');
    if (refreshButton) { refreshButton.disabled = true; refreshButton.innerHTML = renderSkeleton('inline', 'Refreshing'); }
    setText(activeKey + 'RefreshStatus', '');
    loadingRoleTabs[activeKey] = true;
    syncShellRefresh();
    attemptedRoles[activeKey] = true;
    const requestStarted = Date.now();

    const migrated = migratedRoles[activeKey];
    function onRoleLoaded(html) {
        finishLoading();
        if (migrated) migrated.render(target, html); else target.innerHTML = html;
        if (onLoaded) onLoaded();
        if (refresh) activatedRoles[activeKey] = false;
        if (activeKey === 'coord') console.log(JSON.stringify({event:'coordinator_core_render', durationMs:Date.now() - requestStarted, htmlCharacters:migrated ? 0 : html.length}));
        loadedRoleTabs[activeKey] = true;
        loadingRoleTabs[activeKey] = false;
        shellUpdatedAt[activeKey] = updatedLabel();
        syncShellRefresh();

        recordPerformance({event:'role_core_render', role:activeKey, background:!!background, durationMs:Date.now() - requestStarted});
        if (activeRole === activeKey) {
          recordPerformance({event:'tab_core_ready', role:activeKey, durationMs:performance.now() - tabSelectedAt});
        }
        activateRole(activeKey);
    }
    function onRoleFailed(err) {
        if (err && err.superseded) { finishLoading(); loadingRoleTabs[activeKey] = false; syncShellRefresh(); return; }
        finishLoading();
        loadingRoleTabs[activeKey] = false;
        syncShellRefresh();
        if (onError) { onError(err); return; }
        if (refreshButton) { refreshButton.disabled = false; refreshButton.innerHTML = renderLucideIcon_('refresh-cw') + 'Refresh'; }
        if (hadContent) {
          setText(activeKey + 'RefreshStatus', 'Could not refresh: ' + errorMessage(err) + '. Previous content is still shown.');
          return;
        }
        target.innerHTML = '<div>Unable to load this dashboard: ' +
          escapeClientHtml(errorMessage(err)) + '</div>';
    }
    // Bridge promises settle after the runner hook, so resume queued preloads once handled.
    if (migrated) migrated.load().then(onRoleLoaded).catch(onRoleFailed).then(schedulePreload);
    else Promise.resolve().then(function() { throw new Error('Unknown dashboard role.'); }).catch(onRoleFailed).then(schedulePreload);
  }

  function escapeClientHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Work started from a utility callback stays in the utility lane even when it runs after a promise settles.
  function inUtilityLane(work) {
    const previous = utilityRequestContext;
    utilityRequestContext = true;
    try { return work(); } finally { utilityRequestContext = previous; }
  }
  const systemStatusState = {loading:false, loaded:false, attempted:false};
  function ensureSystemStatusLoaded(refresh) {
    const target = byId('systemStatusContent');
    if (!target || systemStatusState.loading || (systemStatusState.loaded && !refresh)) return;
    if (refresh && pendingRequests) {
      setText('systemStatusMessage', 'Please wait for the current operation to finish, then refresh.');
      return;
    }
    systemStatusState.loading = true;
    systemStatusState.attempted = true;
    syncShellRefresh();
    const button = byId('systemStatusRefresh');
    if (button) { button.disabled = true; button.innerHTML = renderSkeleton('inline', 'Refreshing'); }
    if (!systemStatusState.loaded) target.innerHTML = renderSkeleton('panel', 'Loading system status');
    const buttons = Array.from(target.querySelectorAll('button')).map(function(el) { return {el:el, disabled:el.disabled}; });
    buttons.forEach(function(item) { item.el.disabled = true; });
    const cards = Array.from(target.querySelectorAll('[data-status-primary] > *, [data-status-cards] > section'));
    const finishCards = (cards.length ? cards : [target]).map(function(card) { return beginContentLoading(card, 'Loading system status'); });
    busy.mark(target, true);
    setText('systemStatusMessage', '');
    SystemStatusView.load().then(function(dto) { inUtilityLane(function() {
      finishCards.forEach(function(finish) { finish(); });
      SystemStatusActions.resetChecks();
      SystemStatusView.render(target, dto);
      systemStatusState.loading = false;
      systemStatusState.loaded = true;
      busy.mark(target, false);
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw') + 'Refresh'; }
      setText('systemStatusMessage', '');
      setText('systemStatusUpdated', updatedLabel());
      shellUpdatedAt['system-status'] = updatedLabel();
      syncShellRefresh();
      SystemStatusActions.recheckAll();
      target.querySelectorAll('[data-publishing]').forEach(function(section) { InternalAssessmentPublishing.refresh(section.dataset.publishing); });
    }); }).catch(function(err) {
      if (err && err.superseded) { systemStatusState.loading = false; syncShellRefresh(); return; }
      finishCards.forEach(function(finish) { finish(); });
      systemStatusState.loading = false;
      syncShellRefresh();
      busy.mark(target, false);
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw') + 'Refresh'; }
      buttons.forEach(function(item) { item.el.disabled = item.disabled; });
      if (!systemStatusState.loaded) target.textContent = 'System status is unavailable.';
      setText('systemStatusMessage', 'Unable to load system status: ' + errorMessage(err) + '. Select Refresh to retry.');
    });
  }

  function setRoleMenuOpen(open, restoreFocus) {
    const nav = byId('dashboardNavigation');
    const toggle = byId('roleMenuToggle');
    if (!nav || !toggle) return;
    nav.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    const icon = byId('roleMenuIcon');
    if (icon) icon.innerHTML = renderLucideIcon_(open ? 'x' : 'menu');
    if (restoreFocus) toggle.focus();
  }
  function toggleRoleMenu() {
    const toggle = byId('roleMenuToggle');
    if (toggle) setRoleMenuOpen(toggle.getAttribute('aria-expanded') !== 'true', false);
  }
  function initializeRoleMenu() {
    const nav = byId('dashboardNavigation');
    if (!nav) return;
    document.addEventListener('click', function(event) {
      const origin = event.target && event.target.closest ? event.target : null;
      if (!origin) return;
      if (sharedDrawerState && origin === sharedDrawerState.scrim) { closeSharedDrawer(sharedDrawerState.id); return; }
      const tab = origin.closest('[data-role-tab]');
      if (tab) { showRoleTab(tab.getAttribute('data-role-tab')); return; }
      if (origin.closest('#roleMenuToggle')) { toggleRoleMenu(); return; }
      if (origin.closest('#rubricDrawerClose')) { closeRubricDrawer(); return; }
      if (origin.closest('[data-shell-refresh-active]')) { refreshActiveTab(); return; }
      const refresh = origin.closest('[data-shell-refresh]');
      if (refresh) { const key = refresh.getAttribute('data-shell-refresh'); if (key === 'systemStatus') ensureSystemStatusLoaded(true); else refreshRoleDashboard(key); }
    });
    document.addEventListener('click', function(event) {
      if (!nav.contains(event.target)) setRoleMenuOpen(false, false);
    });
    document.addEventListener('keydown', function(event) {
      const toggle = byId('roleMenuToggle');
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setRoleMenuOpen(false, true);
        event.preventDefault();
      }
    });
    nav.addEventListener('focusout', function(event) {
      if (event.relatedTarget && !nav.contains(event.relatedTarget)) setRoleMenuOpen(false, false);
    });
    const tablist = byId('roleMenuItems');
    if (tablist) tablist.addEventListener('keydown', function(event) {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      showRoleTab(tabs[next].getAttribute('data-role-tab'));
    });
    const media = window.matchMedia('(max-width: 1200px)');
    if (media.addEventListener) media.addEventListener('change', function(event) {
      const toggle = byId('roleMenuToggle');
      const focusInNav = nav.contains(document.activeElement);
      setRoleMenuOpen(false, event.matches && focusInNav);
      if (!event.matches && document.activeElement === toggle) {
        const selected = nav.querySelector('[data-role-tab][aria-selected="true"]');
        if (selected) selected.focus();
      }
    });
  }

  function showRoleTab(activeKey) {
    activeRole = activeKey;
    const timeline = byId('sharedProjectTimeline');
    if (timeline) timeline.hidden = activeKey !== 'rubrics';
    syncRubricsDisclosure();
    tabSelectedAt = performance.now();
    recordPerformance({event:'tab_selected', role:activeKey, cached:!!loadedRoleTabs[activeKey], prefetched:!!preloadedRoles[activeKey]});
    if (!roleQueue) roleQueue = Array.from(document.querySelectorAll('[data-role-content]')).map(function(el) { return el.getAttribute('data-role-content'); });
    clearTimeout(preloadTimer);
    if (loadedRoleTabs[activeKey]) recordPerformance({event:'tab_core_ready', role:activeKey, durationMs:0});
    document.querySelectorAll('[data-role-panel]').forEach(function(panel) {
      const selected = panel.getAttribute('data-role-panel') === activeKey;
      panel.classList.toggle('active', selected);
      panel.hidden = !selected;
    });
    document.querySelectorAll('[data-role-tab]').forEach(function(btn) {
      const selected = btn.getAttribute('data-role-tab') === activeKey;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      if (selected) {
        btn.setAttribute('aria-current', 'page');
        setText('roleMenuLabel', btn.textContent.trim());
      } else btn.removeAttribute('aria-current');
    });
    const menuToggle = byId('roleMenuToggle');
    if (menuToggle) setRoleMenuOpen(false, menuToggle.getAttribute('aria-expanded') === 'true');
    syncShellRefresh();
    if (activeKey === 'rubrics') {
      loadSharedRubrics_();
    } else if (activeKey === 'system-status') {
      ensureSystemStatusLoaded();
    } else {
      loadRoleContent(activeKey);
      activateRole(activeKey);
    }
    schedulePreload();
  }

  function focusCoordinatorTeam(teamId) {
    closeRubricDrawer(false);
    const drawer = byId('teamDrawer');
    const backdrop = byId('teamDrawerBackdrop');
    const content = byId('teamDrawerContent');
    const title = byId('teamDrawerTitle');
    if (!drawer || !backdrop || !content) return;
    if (title) title.textContent = 'Team ' + teamId;
    openSharedDrawer('teamDrawer', 'teamDrawerBackdrop', document.activeElement);
    TeamDrawerView.mount(content, teamId, function() { return drawer.dataset.open === 'true'; });
  }

  function closeCoordinatorTeamDrawer(restoreFocus) {
    TeamDrawerView.cancel();
    closeSharedDrawer('teamDrawer', restoreFocus);
  }

  // Application CSS is inline in the document head. Wait for web fonts as well
  // before revealing complete cards; the tracker intentionally stays progressive.
  return {
    notify: dialogs.notify, ask: dialogs.ask, confirmDialog: dialogs.confirmDialog, requestText: dialogs.requestText,
    loadWeeklyProgress: function() { StudentWeekly.load(); },
    openContentDrawer,
    refreshGithubStatus: function(button, message) { StudentGithub.refreshGithubStatus(button, message); },
    retryGithubSetup: function(button) { StudentGithub.retryGithubSetup(button); },
    focusGithubAccountForm: function(button) { StudentGithub.focusGithubAccountForm(button); },
    previewGithubAccount: function(event, form) { StudentGithub.previewGithubAccount(event, form); },
    reloadRole: function(key, onLoaded, onError) { loadRoleContent(key, false, true, onLoaded, onError); },
    renderAssessmentHistory: renderAssessmentHistory,
    renderSkeleton: renderSkeleton,
    beginContentLoading: beginContentLoading,
    busy: busy,
    refreshRoleDashboard,
    refreshSystemStatus: function() { ensureSystemStatusLoaded(true); },
    loadSharedTimeline,
    loadSharedRubrics_,
    openRubricDrawer,
    openWeeklyActivity: function(trigger) { StudentWeekly.openActivity(trigger); },
    closeRubricDrawer,
    getSharedSchedule: function() { return sharedSchedule; },
    showRoleTab,
    toggleRoleMenu,
    initializeRoleMenu,
    initializeLoading,
    renderExpandableText,
    renderIcon: renderLucideIcon_,
    run: dashboardRun,
    openReviewerMarks: function(team, review, button) { ReviewEvaluations.open(team, review, button); },
    changeTeamPageSize: function(key, value) { SystemStatusActions.changeTeamPageSize(key, value); },
    focusCoordinatorTeam,
    closeCoordinatorTeamDrawer,
    runGithubSync: function() { SystemStatusActions.runGithubSync(); },
    runStudentInvitationResend: function() { SystemStatusActions.runStudentInvitationResend(); },
    initializeAssessmentStorage: function() { SystemStatusActions.initializeAssessmentStorage(); },
    recheckCommitteeConfiguration: function() { SystemStatusActions.recheckCommitteeConfiguration(); },
    recheckTeamFolders: function() { SystemStatusActions.recheckTeamFolders(); },
    createTeamFolders: function() { SystemStatusActions.createTeamFolders(); },
    bootstrapAssessmentDefinitions: function() { SystemStatusActions.bootstrapAssessmentDefinitions(); },
    recheckReviewConfiguration: function() { SystemStatusActions.recheckReviewConfiguration(); },
  };
})();

// Consumers may read current immediately or await ready(); role loading never awaits it.
const DashboardSchedule = Object.freeze({
  get current() { return DashboardUI.getSharedSchedule(); },
  ready: function() { return DashboardUI.loadSharedTimeline(); }
});

function initializeFirstRoleTab_() {
  DashboardUI.initializeRoleMenu();
  const activePanel = document.querySelector('[data-role-panel]:not([hidden])');
  if (activePanel) {
    DashboardUI.showRoleTab(activePanel.getAttribute('data-role-panel'));
  }
  DashboardUI.initializeLoading();
  DashboardSchedule.ready().catch(function() {});
  DashboardUI.loadSharedRubrics_().catch(function() {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFirstRoleTab_);
} else {
  initializeFirstRoleTab_();
}
`;
}
