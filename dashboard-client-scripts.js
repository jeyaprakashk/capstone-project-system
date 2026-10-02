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
      overlay.addEventListener('click',event=>{if(event.target===overlay)finish(false);});
      document.addEventListener('focusin',onFocus,true);
      cancel.addEventListener('click',()=>finish(false));
      confirm.addEventListener('click',()=>{
        if(input && !input.value.trim()){error.textContent='Please enter a remark.';error.hidden=false;input.focus();return;}
        finish(true);
      });
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

function getDashboardClientScript() {
  return `
const DashboardUI = (function() {
  'use strict';
  const renderSkeleton = ${getSkeletonMarkup_.toString()};
  const dialogs = (${dashboardDialogsBrowser_.toString()})();
  const renderExpandableText = ${renderExpandableText_.toString()};
  const renderAssessmentHistory = ${renderAssessmentHistory_.toString()};
  ${getLucideIconNodes_.toString()}
  ${renderLucideIcon_.toString()}
  ${initializeDashboardTooltips_.toString()}
  initializeDashboardTooltips_();

  function byId(id) { return document.getElementById(id); }
  function setLoading(id, label) { const el = byId(id); if (el) el.innerHTML = renderSkeleton('inline', label); }
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
    target.setAttribute('aria-busy', 'true');
    LOADING_CLASSES.forEach(function(name) { target.classList.add(name); });
    if (compact) { target.setAttribute('data-loading-compact', ''); LOADING_COMPACT_CLASSES.forEach(function(name) { target.classList.add(name); }); }
    target.appendChild(overlay);
    let finished = false;
    return function() {
      if (finished) return;
      finished = true;
      overlay.remove();
      children.forEach(function(child) { child.node.inert = child.inert; });
      target.setAttribute('aria-busy', 'false');
      LOADING_CLASSES.forEach(function(name) { target.classList.remove(name); });
      if (compact) { target.removeAttribute('data-loading-compact'); LOADING_COMPACT_CLASSES.forEach(function(name) { target.classList.remove(name); }); }
    };
  }
  function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
  function setButtonsDisabled(container, disabled) {
    if (!container) return;
    container.querySelectorAll('button').forEach(function(btn) { btn.disabled = disabled; });
  }
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
    preloading: true
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

  function renderSharedTimeline(data, target) {
    // Presentation only: retain the authoritative snapshot, including weekly scheduling.
    const milestones = data.milestones.filter(m => !['week1','end'].includes(m.key));
    const next = milestones.findIndex(m => m.day >= data.today);
    const start = Math.max(0, (next < 0 ? milestones.length : next) - 2);
    const finish = next < 0 ? milestones.length : Math.min(milestones.length, next + 3);
    target.innerHTML = '<div><h2>Project timeline</h2>' +
      (milestones.length ? '<button type="button" class="border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" data-timeline-toggle aria-expanded="false" aria-controls="projectTimelineMilestones">View full timeline</button>' : '') + '</div>' +
      (!milestones.length ? '<p class="timeline-empty">No project milestones scheduled</p>' : '') +
      '<ol id="projectTimelineMilestones" class="timeline-track m-0 list-none p-0" data-timeline-track style="--timeline-stops:' + (finish-start) + '">' + milestones.map(function(m,index) {
        const past = m.day < data.today, current = index === next;
        const mobileContext = next < 0 ? index >= Math.max(0, milestones.length - 2) : Math.abs(index - next) <= 1;
        const description = m.openingDate ? 'Opens ' + m.openingDate + '; due ' + m.date : m.date;
        const days = m.day - data.today;
        const timing = current ? 'CURRENT · ' + (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days')
          : !past ? (days === 0 ? 'Due today' : 'In ' + days + (days === 1 ? ' day' : ' days')) : '';
        return '<li data-timeline-stop class="timeline-stop' + (mobileContext ? '' : ' max-[760px]:hidden') + '" data-timeline-state="' + (past ? 'past' : current ? 'current' : 'future') + '" data-timeline-mobile="' + mobileContext + '" data-timeline-context="' + (index >= start && index < finish) + '"' + (index < start || index >= finish ? ' hidden' : '') + (current ? ' aria-current="step"' : '') + '>' +
          '<span class="rounded-full" aria-hidden="true">' + (past ? renderLucideIcon_('check') : current ? '<span class="rounded-full"></span>' : '') + '</span>' +
          '<strong>' + escapeClientHtml(m.label) + '</strong>' +
          '<span data-timeline-date title="' + escapeClientHtml(description) + '" aria-label="' + escapeClientHtml(description) + '">' + escapeClientHtml(m.date) + '</span>' +
          (timing ? '<span data-timeline-timing>' + timing + '</span>' : '') + '</li>';
      }).join('') + '</ol>';
    const toggle = target.querySelector('[data-timeline-toggle]');
    if (toggle) toggle.addEventListener('click', function() {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show less' : 'View full timeline';
      target.querySelector('[data-timeline-track]').classList.toggle('timeline-full', expanded);
      target.querySelectorAll('[data-timeline-stop]').forEach(item => {
        item.hidden = !expanded && item.dataset.timelineContext !== 'true';
        item.classList.toggle('max-[760px]:hidden', !expanded && item.dataset.timelineMobile === 'false');
      });
    });
  }

  function loadSharedTimeline() {
    if (sharedSchedule) return Promise.resolve(sharedSchedule);
    if (timelineRequest) return timelineRequest;
    const target = byId('sharedProjectTimeline');
    if (target) {
      target.setAttribute('aria-busy', 'true');
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
            if (target) renderSharedTimeline(data, target);
            sharedSchedule = Object.freeze(data);
            if (target) target.setAttribute('aria-busy', 'false');
            resolve(sharedSchedule);
          } catch (err) { failed(err); }
        }, failed);
      function failed(err) {
        timelineRequest = null;
        if (target) {
          target.setAttribute('aria-busy', 'false');
          target.innerHTML = '<div><h2>Project timeline</h2><span role="status">Schedule unavailable</span><button type="button" class="border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" data-timeline-retry>Retry</button></div>';
          target.querySelector('[data-timeline-retry]').addEventListener('click', function() { loadSharedTimeline().catch(function() {}); });
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
  function loadSharedRubrics() {
    if (rubricsRequest) return rubricsRequest;
    const target = byId('sharedRubricsContent'), section = byId('sharedRubrics');
    if (!target || !section) return Promise.resolve(null);
    section.setAttribute('aria-busy', 'true');
    target.innerHTML = renderSkeleton('panel', 'Loading assessment rubrics');
    rubricsRequest = new Promise(function(resolve, reject) {
      DataBridge.read('shared-rubrics','API_shared_getRubrics',[],{timeoutMs:120000}).then(function(data) {
        try {
          target.innerHTML = '<div>' + data.assessments.map(function(item) {
            const desktopCard = '<button type="button" class="rubric-assessment @max-[480px]/rubrics:hidden rounded-tile border border-edge px-5 py-4 text-left ' + (item.available ? 'bg-paper' : 'bg-soft') + '" data-rubric-key="' + escapeClientHtml(item.key) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '><span><strong>' + escapeClientHtml(item.label) + '</strong><span>' + escapeClientHtml(item.weight) + '%<span class="rubric-mobile-hidden"> weight</span></span></span><span><span>' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span>' + (item.available ? '<span><span class="rubric-mobile-hidden">View rubric</span> '+renderLucideIcon_('arrow-right')+'</span>' : '') + '</span></button>';
            const mobileRow = '<div class="rubric-mobile-row hidden @max-[480px]/rubrics:grid"><div><div><strong>' + escapeClientHtml(item.label) + '</strong><span aria-label="' + escapeClientHtml(item.weight) + '% weight">' + escapeClientHtml(item.weight) + '% weight</span></div><span>' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span></div><button type="button" class="border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" data-rubric-key="' + escapeClientHtml(item.key) + '" aria-label="View rubric for ' + escapeClientHtml(item.label) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '>View rubric</button></div>';
            return desktopCard + mobileRow;
          }).join('') + '</div>' + (data.assessments.length ? '' : '<p>No graded assessments configured.</p>');
          sharedRubrics = data;
          target.querySelectorAll('[data-rubric-key]').forEach(function(button) {
            button.addEventListener('click', function() { openRubricDrawer(button.getAttribute('data-rubric-key'), button); });
          });
          section.setAttribute('aria-busy', 'false');
          resolve(data);
        } catch (err) { reject(err); }
      }, reject);
    }).catch(function(err) {
      rubricsRequest = null;
      section.setAttribute('aria-busy', 'false');
      target.innerHTML = '<p role="status">Unable to load rubrics.</p><button class="border-0 inline-flex items-center rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50 no-underline" type="button">Retry</button>';
      target.querySelector('button').addEventListener('click', function() { loadSharedRubrics().catch(function() {}); });
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
    byId('rubricDrawerContent').innerHTML = '<div><div>Assessment contribution</div><div>' + escapeClientHtml(item.weight) + '% of overall assessment</div><p>' + escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks</p>' + (item.evaluationNotice ? '<p>'+escapeClientHtml(item.evaluator)+' · '+escapeClientHtml(item.evaluationNotice)+'</p>' : '') + '</div>' + item.criteria.map(function(c) {
      return '<section><div>' + escapeClientHtml(c.pi) + ' · ' + escapeClientHtml(c.co) + ' · ' + escapeClientHtml(c.type) + ' · ' + escapeClientHtml(c.maxMarks) + ' marks</div><h3>' + escapeClientHtml(c.name) + '</h3><dl>' + c.descriptors.map(function(text, level) {
        return text ? '<dt>Level ' + level + '</dt><dd>' + escapeClientHtml(text) + '</dd>' : '';
      }).join('') + '</dl></section>';
    }).join('');
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

        recordPerformance({event:'role_core_render', role:activeKey, background:!!background, durationMs:Date.now() - requestStarted});
        if (activeRole === activeKey) {
          recordPerformance({event:'tab_core_ready', role:activeKey, durationMs:performance.now() - tabSelectedAt});
        }
        activateRole(activeKey);
    }
    function onRoleFailed(err) {
        if (err && err.superseded) { finishLoading(); loadingRoleTabs[activeKey] = false; return; }
        finishLoading();
        loadingRoleTabs[activeKey] = false;
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
    const button = byId('systemStatusRefresh');
    if (button) { button.disabled = true; button.innerHTML = renderSkeleton('inline', 'Refreshing'); }
    if (!systemStatusState.loaded) target.innerHTML = renderSkeleton('panel', 'Loading system status');
    const buttons = Array.from(target.querySelectorAll('button')).map(function(el) { return {el:el, disabled:el.disabled}; });
    buttons.forEach(function(item) { item.el.disabled = true; });
    const cards = Array.from(target.querySelectorAll('[data-status-primary] > *, [data-status-cards] > section'));
    const finishCards = (cards.length ? cards : [target]).map(function(card) { return beginContentLoading(card, 'Loading system status'); });
    target.setAttribute('aria-busy', 'true');
    setText('systemStatusMessage', '');
    SystemStatusView.load().then(function(dto) { inUtilityLane(function() {
      finishCards.forEach(function(finish) { finish(); });
      disconnectConfigurationGrids();
      checkingReviewConfiguration=false;checkingCommitteeConfiguration=false;
      SystemStatusView.render(target, dto);
      systemStatusState.loading = false;
      systemStatusState.loaded = true;
      target.setAttribute('aria-busy', 'false');
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw') + 'Refresh'; }
      setText('systemStatusMessage', '');
      setText('systemStatusUpdated', updatedLabel());
      reviewConfigurationValid = false;
      recheckReviewConfiguration();
      recheckCommitteeConfiguration();
      arrangeAssessmentReadiness();
      target.querySelectorAll('[data-publishing]').forEach(function(section) { InternalAssessmentPublishing.refresh(section.dataset.publishing); });
    }); }).catch(function(err) {
      if (err && err.superseded) return;
      finishCards.forEach(function(finish) { finish(); });
      systemStatusState.loading = false;
      target.setAttribute('aria-busy', 'false');
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
    if (activeKey === 'rubrics') {
      loadSharedRubrics();
    } else if (activeKey === 'system-status') {
      ensureSystemStatusLoaded();
    } else {
      loadRoleContent(activeKey);
      activateRole(activeKey);
    }
    schedulePreload();
  }

  function toggleProblem(teamId) {
    const shortEl = byId('problem-short-' + teamId);
    const fullEl = byId('problem-full-' + teamId);
    if (!shortEl || !fullEl) return;
    const showingFull = fullEl.style.display !== 'none';
    fullEl.style.display = showingFull ? 'none' : 'inline';
    shortEl.style.display = showingFull ? 'inline' : 'none';
  }


  function toggleStudentMessage(idx) {
    const shortEl = byId('stumsg-short-' + idx);
    const fullEl = byId('stumsg-full-' + idx);
    if (!shortEl || !fullEl) return;
    const showingFull = fullEl.style.display !== 'none';
    fullEl.style.display = showingFull ? 'none' : 'inline';
    shortEl.style.display = showingFull ? 'inline' : 'none';
  }

  // Supply the complete row collection before pagination or filtering detaches rows.
  function sortTableRows(rows, state) {
    if (!state || state.column == null) return rows.slice();
    const value = row => {
      const cell = row.children[state.column];
      if (!cell || cell.querySelector('[data-skeleton], [aria-label^="Loading"], [aria-label^="Checking"]')) return null;
      const explicit = cell.getAttribute('data-sort-value');
      const text = (explicit !== null ? explicit : cell.textContent).trim();
      if ((state.type === 'number' || state.type === 'pair') && !text.split('/').every(part=>part.trim() !== '' && Number.isFinite(Number(part)))) return null;
      return !text || text === '—' || /^(loading|unavailable)$/i.test(text) ? null : text;
    };
    const collator = new Intl.Collator(undefined, {numeric:true, sensitivity:'base'});
    return rows.map((row, index) => ({row, index, value:value(row)})).sort((a,b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index-b.index : a.value === null ? 1 : -1;
      let comparison = 0;
      if (state.type === 'number' || state.type === 'pair') {
        const av = a.value.split('/').map(Number), bv = b.value.split('/').map(Number);
        for (let i=0; i < (state.type === 'pair' ? 2 : 1); i++) {
          comparison = (av[i] || 0) - (bv[i] || 0);
          if (comparison) break;
        }
      } else comparison = collator.compare(a.value,b.value);
      return comparison * (state.direction === 'descending' ? -1 : 1) || a.index-b.index;
    }).map(item=>item.row);
  }

  function initializeTableSorting(table, options = {}) {
    if (!table) return;
    const state = options.state || table.tableSortState || {};
    table.tableSortState = state;
    table.tableSortOptions = options;
    if (!table.tableSortAttached) {
      table.tableSortAttached = true;
      table.addEventListener('click', function(event) {
        const button = event.target.closest && event.target.closest('[data-table-sort]');
        if (!button || !table.contains(button)) return;
        const header = button.closest('th');
        const column = Array.from(table.querySelectorAll('thead th')).indexOf(header);
        const sortState = table.tableSortState, sortOptions = table.tableSortOptions;
        sortState.direction = sortState.column === column && sortState.direction === 'ascending' ? 'descending' : 'ascending';
        sortState.column = column;
        sortState.type = header.getAttribute('data-sort-type');
        initializeTableSorting(table, sortOptions);
        if (sortOptions.onSort) sortOptions.onSort(sortState);
        else {
          const body = table.querySelector('tbody');
          if (body) body.replaceChildren(...sortTableRows(Array.from(body.children), sortState));
        }
      });
    }
    Array.from(table.querySelectorAll('thead th')).forEach((header, column) => {
      if (!header.hasAttribute('data-sort-type')) return;
      let button = header.querySelector('[data-table-sort]');
      if (!button) {
        const label = header.textContent.trim();
        header.textContent = '';
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
        button.setAttribute('data-table-sort', label);
        header.appendChild(button);
      }
      const selected = state.column === column;
      header.setAttribute('aria-sort', selected ? state.direction : 'none');
      const label = button.getAttribute('data-table-sort');
      button.textContent = label;
      button.setAttribute('data-sort-direction', selected ? state.direction : 'none');
      button.setAttribute('aria-label', 'Sort by ' + label + (selected && state.direction === 'ascending' ? ' descending' : ' ascending'));
    });
    return state;
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

    if (info) {
      info.textContent = 'Showing ' + start + ' - ' + end + ' of ' + totalRows + ' ' + rowLabel;
    }

    const bounds = {start:start ? start - 1 : 0, end:end};
    if (!buttons) return bounds;
    buttons.innerHTML = '';

    function addButton(label, page, disabled, active) {
      const btn = document.createElement('button');btn.className='inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border border-line bg-paper px-3 text-sm text-ink no-underline hover:bg-tint aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:font-semibold aria-[current=page]:text-paper disabled:pointer-events-none disabled:opacity-50';
      btn.type = 'button';
      btn.textContent = label;
      if (label === 'Previous') btn.innerHTML = renderLucideIcon_('chevron-left') + 'Previous';
      if (label === 'Next') btn.innerHTML = 'Next' + renderLucideIcon_('chevron-right');
      btn.disabled = !!disabled;
      if (active) { btn.classList.add('active'); btn.setAttribute('aria-current', 'page'); }
      btn.addEventListener('click', function() {
        if (disabled) return;
        state.page = page;
        onChange();
      });
      buttons.appendChild(btn);
    }

    addButton('Previous', state.page - 1, state.page === 1, false);

    // Keep the control compact when there are many pages.
    let firstPage = Math.max(1, state.page - 2);
    let lastPage = Math.min(totalPages, firstPage + 4);
    firstPage = Math.max(1, lastPage - 4);

    if (firstPage > 1) {
      addButton('1', 1, false, state.page === 1);
      if (firstPage > 2) {
        const dots = document.createElement('span');
        dots.className = '';
        dots.textContent = '…';
        buttons.appendChild(dots);
      }
    }

    for (let page = firstPage; page <= lastPage; page++) {
      addButton(String(page), page, false, page === state.page);
    }

    if (lastPage < totalPages) {
      if (lastPage < totalPages - 1) {
        const dots = document.createElement('span');
        dots.className = '';
        dots.textContent = '…';
        buttons.appendChild(dots);
      }
      addButton(String(totalPages), totalPages, false, state.page === totalPages);
    }

    addButton('Next', state.page + 1, state.page === totalPages, false);
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

  function escapeDrawerHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getHealthLabel(health) {
    if (health === 'ontrack') return 'On Track';
    if (health === 'monitor') return 'Monitor';
    return 'Attention';
  }

  function getHealthClass(health) {
    if (health === 'ontrack') return 'drawer-status-good';
    if (health === 'monitor') return 'drawer-status-warn';
    return 'drawer-status-bad';
  }

  function buildCoordinatorTeamDrawerHtml(data, section) {
    const studentsHtml = data.students && data.students.length
      ? data.students.map(function(student) {
          return (
            '<div>' +
              '<div>' +
                escapeDrawerHtml(student.name || 'Student') +
              '</div>' +
              '<div>' +
                escapeDrawerHtml(student.regNo || '') +
                (student.regNo && student.email ? ' · ' : '') +
                escapeDrawerHtml(student.email || '') +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<div>No student details available.</div>';

    const reviewersHtml = data.reviewers && data.reviewers.length
      ? data.reviewers.map(function(reviewer) {
          return (
            '<div>' +
              '<div>' +
                escapeDrawerHtml(reviewer.name || 'Reviewer') +
              '</div>' +
              '<div>' +
                escapeDrawerHtml(reviewer.email || '') +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<div>Committee details not available.</div>';

    const repoHtml = data.repoUrl
      ? '<a class="border-0 inline-flex items-center rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50 no-underline" href="' +
          escapeDrawerHtml(data.repoUrl) +
          '" target="_blank" rel="noopener">' +
          escapeDrawerHtml(data.repoUrl) +
        '</a>'
      : '<span>Pending</span>';

    const sections = [
      '<div>' +
        '<div>Project</div>' +
        '<div>' +
          escapeDrawerHtml(data.title || '(Title not submitted)') +
        '</div>' +
        (
          data.problem
            ? '<div>' +
                renderExpandableText(data.problem) +
              '</div>'
            : ''
        ) +
      '</div>',

      '<div>' +
        '<div>Guide</div>' +
        '<div>' +
          '<div class="rounded-card border border-edge bg-paper shadow-card">' +
            '<div>Guide</div>' +
            '<div>' +
              escapeDrawerHtml(data.guideName || '—') +
            '</div>' +
          '</div>' +

          '<div class="rounded-card border border-edge bg-paper shadow-card">' +
            '<div>Email</div>' +
            '<div>' +
              escapeDrawerHtml(data.guideEmail || '—') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>',

      '<div>' +
        '<div>Students</div>' +
        studentsHtml +
      '</div>',

      '<div>' +
        '<div>' +
          'Review Committee' +
          (
            data.committeeNumber
              ? ' · ' + escapeDrawerHtml(data.committeeNumber)
              : ''
          ) +
        '</div>' +
        reviewersHtml +
      '</div>',

      '<div>' +
        '<div>Progress</div>' +

        '<div>' +
          '<span>Title Status</span>' +
          '<span>' +
            escapeDrawerHtml(data.titleStatus || '—') +
          '</span>' +
        '</div>' +

        '<div>' +
          '<span>Guide Decision</span>' +
          '<span>' +
            escapeDrawerHtml(data.guideDecision || '—') +
          '</span>' +
        '</div>' +

        '<div>' +
          '<span>Reviewer Decision</span>' +
          '<span>' +
            escapeDrawerHtml(data.reviewerDecision || '—') +
          '</span>' +
        '</div>' +

        '<div>' +
          '<span>Repository</span>' +
          '<span>' +
            escapeDrawerHtml(data.repoStatus || 'Pending') +
          '</span>' +
        '</div>' +

        (data.reviews || []).map(function(review) {
          return '<div><span>' + escapeDrawerHtml(review.label) +
            '</span><span class="inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-semibold ' + (review.completed ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning') + '">' + (review.available === false ? 'Unavailable' : review.completed ? 'Completed' : 'Pending') + '</span></div>';
        }).join('') +

        '<div>' +
          '<span>Overall Health</span>' +
          '<span class="' + getHealthClass(data.health) + '">' +
            escapeDrawerHtml(getHealthLabel(data.health)) +
          '</span>' +
        '</div>' +
      '</div>',

      '<div>' +
        '<div>This Week</div>' +

        '<div>' +
          '<div class="rounded-card border border-edge bg-paper shadow-card">' +
            '<div>Daily Logs</div>' +
            '<div>' +
              escapeDrawerHtml(data.weekLogs) +
            '</div>' +
          '</div>' +

          '<div class="rounded-card border border-edge bg-paper shadow-card">' +
            '<div>GitHub Commits</div>' +
            '<div>' +
              escapeDrawerHtml(data.weekCommits) +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>',

      '<div>' +
        '<div>Repository</div>' +
        repoHtml +
      '</div>'
    ];
    const indices = section === 'basic' ? [0,1,2,3,6] : section === 'progress' ? [4] : section === 'activity' ? [5] : [0,1,2,3,4,5,6];
    return indices.map(index => sections[index]).join('');
  }

  let coordinatorDrawerRequest = 0;
  function focusCoordinatorTeam(teamId) {
    closeRubricDrawer(false);
    const request = ++coordinatorDrawerRequest;
    const drawer = byId('teamDrawer');
    const backdrop = byId('teamDrawerBackdrop');
    const content = byId('teamDrawerContent');
    const title = byId('teamDrawerTitle');

    if (!drawer || !backdrop || !content) return;

    if (title) {
      title.textContent = 'Team ' + teamId;
    }

    content.innerHTML = ['basic','progress','activity'].map(function(section) {
      const labels = section === 'basic' ? ['Project','Guide','Students','Review Committee','Repository'] : [section === 'progress' ? 'Progress' : 'This Week'];
      return '<div id="drawerSection-' + section + '" aria-busy="true">' + labels.map(function(label) { return '<div><div>' + label + '</div>' + renderSkeleton('panel', 'Loading ' + label) + '</div>'; }).join('') + '</div>';
    }).join('');

    openSharedDrawer('teamDrawer', 'teamDrawerBackdrop', document.activeElement);

    const pending = new Set();
    function loadSection(section) {
      if (request !== coordinatorDrawerRequest || pending.has(section)) return;
      const target = byId('drawerSection-' + section);
      if (!target) return;
      pending.add(section);
      target.setAttribute('aria-busy', 'true');
      const retryButton = target.querySelector('button');
      if (retryButton) retryButton.disabled = true;
      function current() { return request === coordinatorDrawerRequest && drawer.dataset.open === 'true' && target === byId('drawerSection-' + section); }
      function showRetry(message) {
        const note = document.createElement('div');note.className = '';note.textContent = message + ' ';
        const button = document.createElement('button');button.className='border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';button.type = 'button';button.textContent = 'Retry';
        button.addEventListener('click', function() { loadSection(section); });
        note.appendChild(button);target.appendChild(note);
      }
      DataBridge.read('team-drawer:' + teamId + ':' + section,'API_coordinator_getTeamDrawer',[teamId, section],{timeoutMs:120000}).then(function(data) {
        if (!current()) return;
        pending.delete(section);
        target.innerHTML = buildCoordinatorTeamDrawerHtml(data, section);
        target.setAttribute('aria-busy', 'false');
        if (section === 'progress' && (data.reviews || []).some(review => review.available === false)) showRetry('Some review data is unavailable.');
      }, function(err) {
        if (!current()) return;
        pending.delete(section);target.innerHTML = '';target.setAttribute('aria-busy', 'false');
        showRetry('Unable to load ' + section + ': ' + errorMessage(err));
      });
    }
    ['basic','progress','activity'].forEach(loadSection);
  }

  function closeCoordinatorTeamDrawer(restoreFocus) {
    coordinatorDrawerRequest++;
    closeSharedDrawer('teamDrawer', restoreFocus);
  }

  // Application CSS is inline in the document head. Wait for web fonts as well
  // before revealing complete cards; the tracker intentionally stays progressive.
  let configurationGridObserver = null;
  function disconnectConfigurationGrids() {
    if(configurationGridObserver)configurationGridObserver.disconnect();
    configurationGridObserver=null;
  }
  function arrangeAssessmentReadiness() {
    disconnectConfigurationGrids();
    const grids=['committeeReadinessGrid','reviewAssessmentReadiness'].map(byId).filter(Boolean);
    function layout() {
      const widths=grids.map(grid=>grid.clientWidth).filter(width=>width>0);
      const width=widths.length?Math.min(...widths):0;
      const columns=Math.max(1,Math.floor((width+8)/268));
      grids.forEach(grid=>{grid.style.gridTemplateColumns='repeat('+columns+', minmax(0, 1fr))';});
    }
    layout();
    if(typeof ResizeObserver!=='undefined'){
      configurationGridObserver=new ResizeObserver(layout);
      grids.forEach(grid=>configurationGridObserver.observe(grid));
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
      checkingCommitteeConfiguration=false;button.disabled=false;card.setAttribute('aria-busy','false');
      card.setAttribute('data-state',error?'error':report.state);
      const issues=byId('committeeConfigurationIssues');issues.textContent='';
      const messages=error?[{message:'Unable to check review committees: '+error+'. Try Recheck.'}]:report.issues;
      issues.hidden=!messages.length;
      messages.forEach(issue=>{const li=document.createElement('li');li.textContent=issue.message;issues.appendChild(li);});
      if(error){if(!card.hasAttribute('data-readiness-loaded'))setText('committeeConfigurationSummary','Unable to check readiness');return;}
      setText('committeeConfigurationSummary',report.summary);
      content.innerHTML=SystemStatusView.committeeDirectory(report.committees);
      content.querySelectorAll('details').forEach(item=>{item.open=expanded.has(item.getAttribute('data-committee-key'));});
      card.setAttribute('data-readiness-loaded','true');
      setText('committeeConfigurationCheckedAt','Last checked: '+new Date(report.checkedAt).toLocaleString());
      [['committeeConfigLink','committees'],['committeeAssignmentsLink','assignments']].forEach(([id,key])=>{const link=byId(id),url=report.links[key];link.hidden=!url;if(url)link.href=url;});
      arrangeAssessmentReadiness();
    }
    DataBridge.read('committee-configuration','API_coordinator_getCommitteeConfiguration',[],{timeoutMs:120000}).then(report=>finish(report,null),error=>finish(null,errorMessage(error)));
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
    card.setAttribute('aria-busy', 'true');
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
      card.setAttribute('aria-busy', 'false');
      card.setAttribute('data-state', error ? 'error' : report.state);
      byId('reviewConfigurationRecheck').disabled = false;
      byId('initializeAssessmentStorageButton').disabled = !assessmentStorageAvailable || initializingAssessmentStorage;
      const issues = error ? [{sheet:'Configuration', message:error}] : report.issues;
      if(report)setText('reviewConfigurationSummary',report.summary);
      else if(!card.hasAttribute('data-readiness-loaded'))setText('reviewConfigurationSummary','Unable to check readiness');
      byId('reviewConfigurationSummary').title = reviewConfigurationValid ? 'Assessment definitions and rubric criteria are valid.' : 'Resolve the issues below before initializing assessment storage.';
      const list = byId('reviewConfigurationIssues');
      list.textContent = ''; list.hidden = !issues.length;
      issues.forEach(function(issue) {
        const item = document.createElement('li'); item.textContent = issue.sheet + ': ' + issue.message; list.appendChild(item);
      });
      if (report) {
        const setup=byId('assessmentStorageSetup');
        if(setup)setup.hidden=report.storageComplete===true;
        const readiness=byId('reviewAssessmentReadiness');
        readiness.textContent='';
        report.storage.forEach(function(entry){
          const item=document.createElement('li');item.setAttribute('data-assessment',entry.assessment);item.setAttribute('data-state',entry.state);
          const heading=document.createElement('strong');heading.textContent=entry.label+' \u00b7 '+(entry.ready?'Ready':'Needs attention');item.appendChild(heading);
          const rubric=entry.rubric || {state:'MISSING'};
          const labels={READY:'Ready',MISSING:'Missing',INVALID:'Invalid',EMPTY:'Needs initialization',ERROR:'Error',NOT_REQUIRED:'Not required'};
          const rubricLine=document.createElement('small');rubricLine.textContent='Rubric: '+labels[rubric.state]+(rubric.state==='READY'?' \u00b7 '+rubric.criterionCount+' '+(rubric.criterionCount===1?'criterion':'criteria')+' \u00b7 '+rubric.maximumMarks+' marks':'');item.appendChild(rubricLine);
          const storageLine=document.createElement('small');storageLine.textContent='Storage: '+labels[entry.state]+(entry.state==='NOT_REQUIRED'?' \u00b7 Evaluated outside this app':'');item.appendChild(storageLine);
          if(entry.state!=='NOT_REQUIRED'){const journal=document.createElement('small');journal.textContent='Journal: '+entry.journal;item.appendChild(journal);}
          if(rubric.error){const issue=document.createElement('small');issue.textContent=rubric.error;item.appendChild(issue);}
          if(entry.error){const issue=document.createElement('small');issue.textContent=entry.error;item.appendChild(issue);}
          readiness.appendChild(item);
        });
        arrangeAssessmentReadiness(readiness);
        card.setAttribute('data-readiness-loaded','true');
        setText('reviewConfigurationCheckedAt', 'Last checked: ' + new Date(report.checkedAt).toLocaleString());
        [['reviewDefinitionsLink','definitions'],['reviewConfigLink','config'],['reviewRubricsLink','rubrics']].forEach(function(pair) {
          const link = byId(pair[0]), url = report.links[pair[1]];
          link.hidden = !url; if (url) link.href = url;
        });
      }
    }
    DataBridge.read('review-configuration','API_coordinator_getReviewConfiguration',[],{timeoutMs:120000}).then(function(report) { finish(report, null); },
      function(err) { finish(null, 'Unable to check configuration: ' + errorMessage(err) + '. Try Recheck.'); });
  }

  function bootstrapAssessmentDefinitions() {
    if(!definitionsBootstrapAvailable||bootstrappingDefinitions||checkingReviewConfiguration||initializingAssessmentStorage)return;
    bootstrappingDefinitions=true;
    const card=byId('reviewConfigurationCard'),button=byId('createAssessmentDefinitionsButton');
    const finishLoading=beginContentLoading(card,'Creating assessment definitions schema');
    button.disabled=true;
    byId('reviewConfigurationRecheck').disabled=true;
    setText('assessmentStorageStatus','Creating assessment definitions schema…');
    function finish(message){
      finishLoading();
      bootstrappingDefinitions=false;
      setText('assessmentStorageStatus',message);
      recheckReviewConfiguration();
    }
    DataBridge.write('API_coordinator_createDefinitions',[]).then(function(result){
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
    setText('assessmentStorageStatus','Preparing assessment storage…');
    function finish(message){
      initializingAssessmentStorage=false;
      if(button)button.disabled=!assessmentStorageAvailable;
      setText('assessmentStorageStatus',message);
      recheckReviewConfiguration();
    }
    DataBridge.write('API_coordinator_prepareStorage',[]).then(function(result){
      const journals=result.journals;
      journals.forEach(function(journal){
        if(!results)return;
        const item=document.createElement('li');
        item.textContent=journal.label+': '+journal.journal+' — '+(journal.created?'created':journal.initialized?'initialized':'existing storage retained')+'.';
        results.appendChild(item);
      });
      finish(journals.length+' assessment journals ready. Existing assessment data was left unchanged.');
      document.querySelectorAll('[data-publishing]').forEach(function(section){InternalAssessmentPublishing.refresh(section.dataset.publishing);});
    },function(err){
      finish('Setup stopped: '+errorMessage(err)+'. Retry to resume missing assessment storage.');
    });
  }

  function runGithubSync() {
    const btn = document.getElementById('githubSyncButton');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing...';
    }

    DataBridge.write('API_coordinator_syncGithub',[])
      .then(function(result) {

        // Update the displayed repository access count
        // without reloading the Apps Script page.
        const accessValue = document.getElementById('githubReposAccess');

        if (accessValue) {
          accessValue.textContent =
            result.verifiedAccess + ' / ' + result.totalRepos;
        }

        let message =
          'GitHub access sync completed.\\n\\n' +
          'Coordinator: ' + result.username + '\\n' +
          'Verified access: ' +
          result.verifiedAccess + ' / ' + result.totalRepos + '\\n' +
          'Already accessible: ' + result.alreadyAccessible + '\\n' +
          'Repaired: ' + result.repaired + '\\n' +
          'Failed: ' + result.failedCount;

        dialogs.notify(message, result.failedCount ? 'warning' : 'success');

        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run Sync';
        }
      }, function(error) {

        dialogs.notify(
          'GitHub access sync failed.\\n\\n' +
          (error && error.message
            ? error.message
            : 'Unknown error')
        );

        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run Sync';
        }
      });
  }

  let studentInvitationResendBusy = false;
  function runStudentInvitationResend() {
    if (studentInvitationResendBusy) return;
    const host = document.getElementById('studentInvitationResend');
    if (!host) return;
    const button = host.querySelector('button'), status = host.querySelector('[data-resend-status]');
    const output = host.querySelector('[data-resend-results]');
    const results = host.resendResults || new Map();
    host.resendResults = results;
    host.resendPagination = host.resendPagination || {page:1, size:10};
    studentInvitationResendBusy = true;
    button.disabled = true;
    host.setAttribute('aria-busy', 'true');
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
      host.setAttribute('aria-busy', 'false');
      button.textContent = retry ? 'Retry remaining invitations' : 'Resend expired student invitations';
      status.textContent = message + ' ' + render();
    }
    function batch(cursor) {
      status.textContent = 'Processing student invitations. Completed results remain below.';
      DataBridge.write('API_coordinator_resendInvitations',[cursor]).then(function(result) {
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
    DataBridge.write('API_student_completeGithubSetup',[]).then(function(result) { finish(result.message || ''); },
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
    DataBridge.write('API_student_previewGithub',[input.value]).then(function(result) {
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
    setText('githubSubmitStatus','Connecting GitHub account...');
    DataBridge.write('API_student_confirmGithub',[form.githubToken]).then(function(result) {
      form.githubBusy = false;
      if (!form.isConnected) return;
      form.hidden = true; form.githubToken = null;
      setText('githubSubmitStatus',result.message);
      DataBridge.write('API_student_completeGithubSetup',[]).then(function(setup) { refreshGithubStatus(null,result.message + ' ' + (setup.message || '')); },
        function(error) { refreshGithubStatus(null,'GitHub account connected. Repository access is pending: ' + errorMessage(error)); });
    }, function(error) {
      form.githubBusy = false; setButtonsDisabled(form,false);
      if (form.isConnected) setText('githubSubmitStatus',errorMessage(error));
    });
  }

  return {
    notify: dialogs.notify, ask: dialogs.ask, confirmDialog: dialogs.confirmDialog, requestText: dialogs.requestText,
    loadWeeklyProgress: function() { StudentWeekly.load(); },
    openContentDrawer,
    refreshGithubStatus,
    retryGithubSetup,
    focusGithubAccountForm, previewGithubAccount,
    renderAssessmentHistory: renderAssessmentHistory,
    renderSkeleton: renderSkeleton,
    beginContentLoading: beginContentLoading,
    refreshRoleDashboard,
    refreshSystemStatus: function() { ensureSystemStatusLoaded(true); },
    loadSharedTimeline,
    loadSharedRubrics,
    openRubricDrawer,
    openWeeklyActivity: function(trigger) { StudentWeekly.openActivity(trigger); },
    closeRubricDrawer,
    getSharedSchedule: function() { return sharedSchedule; },
    showRoleTab,
    toggleRoleMenu,
    initializeRoleMenu,
    initializeLoading,
    toggleProblem,
    renderExpandableText,
    renderIcon: renderLucideIcon_,
    renderIcon: renderLucideIcon_,
    run: dashboardRun,
    openReviewerMarks: function(team, review, button) { ReviewEvaluations.open(team, review, button); },
    changeTeamPageSize,
    toggleStudentMessage,
    focusCoordinatorTeam,
    closeCoordinatorTeamDrawer,
    runGithubSync,
    runStudentInvitationResend,
    initializeAssessmentStorage,
    recheckCommitteeConfiguration,
    bootstrapAssessmentDefinitions,
    recheckReviewConfiguration,
    initializeTableSorting,
    sortTableRows
  };
})();

// Consumers may read current immediately or await ready(); role loading never awaits it.
const DashboardSchedule = Object.freeze({
  get current() { return DashboardUI.getSharedSchedule(); },
  ready: function() { return DashboardUI.loadSharedTimeline(); }
});

function showRoleTab(key) { DashboardUI.showRoleTab(key); }
function toggleProblem(teamId) { DashboardUI.toggleProblem(teamId); }
function toggleStudentMessage(idx) { DashboardUI.toggleStudentMessage(idx); }
function focusCoordinatorTeam(teamId) { DashboardUI.focusCoordinatorTeam(teamId); }
function runGithubSync() { DashboardUI.runGithubSync(); }
function initializeAssessmentStorage() { DashboardUI.initializeAssessmentStorage(); }
function recheckReviewConfiguration() { DashboardUI.recheckReviewConfiguration(); }
function closeCoordinatorTeamDrawer() {
  DashboardUI.closeCoordinatorTeamDrawer();
}

function initializeFirstRoleTab() {
  DashboardUI.initializeRoleMenu();
  const activePanel = document.querySelector('[data-role-panel]:not([hidden])');
  if (activePanel) {
    DashboardUI.showRoleTab(activePanel.getAttribute('data-role-panel'));
  }
  DashboardUI.initializeLoading();
  DashboardSchedule.ready().catch(function() {});
  DashboardUI.loadSharedRubrics().catch(function() {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFirstRoleTab);
} else {
  initializeFirstRoleTab();
}
`;
}
