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
  return '<details class="expandable-text"><summary><span class="expandable-text-preview">' +
    escape(full.slice(0, maxLen).trim()) + '&hellip; <em>more</em></span>' +
    '<span class="expandable-text-full">' + escape(full) +
    ' <em>less</em></span></summary></details>';
}

/** Shared confirmation, notice and short-text dialog using the framework modal. */
function dashboardDialogsBrowser_() {
  let queue=Promise.resolve(), pending=0, activeTrigger=null;
  function show(kind,options,trigger) {
    const previous=trigger;
    activeTrigger=trigger;
    const host=document.querySelector('dialog[open]') || document.body;
    const overlay=document.createElement('div');overlay.className='overlay';overlay.setAttribute('data-dialog-overlay','');
    const modal=document.createElement('section');modal.className='modal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
    const heading=document.createElement('h2');heading.id='dashboardDialogHeading';
    heading.textContent=options.title || (kind==='confirm'?'Please confirm':kind==='prompt'?'Add a remark':'Message');
    modal.setAttribute('aria-labelledby',heading.id);
    const header=document.createElement('div');header.className='modal-header';header.appendChild(heading);
    const body=document.createElement('div');body.className='modal-body';
    const message=document.createElement('p');message.className=options.tone==='danger'?'notice notice--danger student-text':'student-text';message.textContent=String(options.body || '');body.appendChild(message);
    const footer=document.createElement('div');footer.className='modal-footer';
    let input=null,error=null;
    if(kind==='prompt') {
      input=document.createElement('textarea');input.maxLength=5000;
      input.setAttribute('aria-label',String(options.body || ''));body.appendChild(input);
      error=document.createElement('p');error.setAttribute('role','alert');error.hidden=true;body.appendChild(error);
    }
    const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-outline';cancel.textContent=options.cancelText || 'Cancel';
    const confirm=document.createElement('button');confirm.type='button';confirm.className='btn btn-primary';confirm.textContent=options.confirmText || (kind==='alert'?'OK':'Continue');
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
  // Preserve live DOM, layout and event handlers until a read finishes.
  function beginContentLoading(target, label, options) {
    if (!target) return function() {};
    const overlay = document.createElement('div');
    overlay.className = 'app-loading-overlay';
    const compact = options && options.compact;
    // Hidden tabs measure zero during preloading; that is not a small control.
    const height = target.clientHeight;
    overlay.innerHTML = renderSkeleton(options && options.variant || (!compact && height > 0 && height < 120 ? 'inline' : 'panel'), label);
    const children = Array.from(target.children).map(function(child) { return {node:child, inert:child.inert}; });
    children.forEach(function(child) { child.node.inert = true; });
    target.setAttribute('aria-busy', 'true');
    target.classList.add('app-content-loading');
    if (compact) target.classList.add('app-content-loading--compact');
    target.appendChild(overlay);
    let finished = false;
    return function() {
      if (finished) return;
      finished = true;
      overlay.remove();
      children.forEach(function(child) { child.node.inert = child.inert; });
      target.setAttribute('aria-busy', 'false');
      target.classList.remove('app-content-loading');
      if (compact) target.classList.remove('app-content-loading--compact');
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
  let announcementsSettled = false;
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
    if (announcementsSettled && byId('systemStatusContent') && !systemStatusState.attempted) ensureSystemStatusLoaded();
  }
  function initializeLoading() {
    ensureAnnouncementsLoaded();
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
          const utility = utilityRequestContext || method === 'loadAnnouncementsForCurrentUser' || method === 'loadCoordinatorSystemStatus';
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
              if (method === 'loadAnnouncementsForCurrentUser') announcementsSettled = true;
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
    if (key === 'student') { loadWeeklyProgress(); GuideEvaluation.student(); if(typeof ReviewEvaluations!=='undefined')document.querySelectorAll('[data-review-result]').forEach(host=>ReviewEvaluations.student(host.dataset.reviewResult)); }
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
      (milestones.length ? '<button type="button" class="btn btn-sm btn-outline" data-timeline-toggle aria-expanded="false" aria-controls="projectTimelineMilestones">View full timeline</button>' : '') + '</div>' +
      (!milestones.length ? '<p class="timeline-empty">No project milestones scheduled</p>' : '') +
      '<ol id="projectTimelineMilestones" class="timeline-track" data-timeline-track style="--timeline-stops:' + (finish-start) + '">' + milestones.map(function(m,index) {
        const past = m.day < data.today, current = index === next;
        const mobileContext = next < 0 ? index >= Math.max(0, milestones.length - 2) : Math.abs(index - next) <= 1;
        const description = m.openingDate ? 'Opens ' + m.openingDate + '; due ' + m.date : m.date;
        const days = m.day - data.today;
        const timing = current ? 'CURRENT · ' + (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days')
          : !past ? (days === 0 ? 'Due today' : 'In ' + days + (days === 1 ? ' day' : ' days')) : '';
        return '<li data-timeline-stop class="timeline-stop" data-timeline-state="' + (past ? 'past' : current ? 'current' : 'future') + '" data-timeline-mobile="' + mobileContext + '" data-timeline-context="' + (index >= start && index < finish) + '"' + (index < start || index >= finish ? ' hidden' : '') + (current ? ' aria-current="step"' : '') + '>' +
          '<span class="circle" aria-hidden="true">' + (past ? renderLucideIcon_('check') : current ? '<span class="circle"></span>' : '') + '</span>' +
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
      target.querySelectorAll('[data-timeline-stop]').forEach(item => { item.hidden = !expanded && item.dataset.timelineContext !== 'true'; });
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
      dashboardRun()
        .withSuccessHandler(function(data) {
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
        })
        .withFailureHandler(failed)
        .loadSharedProjectTimeline();
      function failed(err) {
        timelineRequest = null;
        if (target) {
          target.setAttribute('aria-busy', 'false');
          target.innerHTML = '<div><h2>Project timeline</h2><span role="status">Schedule unavailable</span><button type="button" class="btn btn-sm btn-outline" data-timeline-retry>Retry</button></div>';
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
      dashboardRun().withSuccessHandler(function(data) {
        try {
          target.innerHTML = '<div>' + data.assessments.map(function(item) {
            const desktopCard = '<button type="button" class="rubric-assessment tile' + (item.available ? '' : ' tile--locked') + '" data-rubric-key="' + escapeClientHtml(item.key) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '><span><strong>' + escapeClientHtml(item.label) + '</strong><span>' + escapeClientHtml(item.weight) + '%<span class="rubric-mobile-hidden"> weight</span></span></span><span><span>' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span>' + (item.available ? '<span><span class="rubric-mobile-hidden">View rubric</span> '+renderLucideIcon_('arrow-right')+'</span>' : '') + '</span></button>';
            const mobileRow = '<div class="rubric-mobile-row"><div><div><strong>' + escapeClientHtml(item.label) + '</strong><span aria-label="' + escapeClientHtml(item.weight) + '% weight">' + escapeClientHtml(item.weight) + '% weight</span></div><span>' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span></div><button type="button" class="btn btn-sm btn-outline" data-rubric-key="' + escapeClientHtml(item.key) + '" aria-label="View rubric for ' + escapeClientHtml(item.label) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '>View rubric</button></div>';
            return desktopCard + mobileRow;
          }).join('') + '</div>' + (data.assessments.length ? '' : '<p>No graded assessments configured.</p>');
          sharedRubrics = data;
          target.querySelectorAll('[data-rubric-key]').forEach(function(button) {
            button.addEventListener('click', function() { openRubricDrawer(button.getAttribute('data-rubric-key'), button); });
          });
          section.setAttribute('aria-busy', 'false');
          resolve(data);
        } catch (err) { reject(err); }
      }).withFailureHandler(reject).loadSharedRubrics();
    }).catch(function(err) {
      rubricsRequest = null;
      section.setAttribute('aria-busy', 'false');
      target.innerHTML = '<p role="status">Unable to load rubrics.</p><button class="btn btn-outline" type="button">Retry</button>';
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
    scrim.onclick = function(event) { if (event.target === scrim) closeSharedDrawer(drawerId); };
    drawer.inert = false;
    drawer.hidden = false;
    scrim.hidden = false;
    drawer.classList.add('open');
    drawer.dataset.open = 'true';
    drawer.setAttribute('aria-hidden', 'false');
    scrim.classList.add('open');
    document.body.classList.add('team-drawer-open');
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
    document.body.classList.remove('team-drawer-open');
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
    else dashboardRun().withSuccessHandler(onRoleLoaded).withFailureHandler(onRoleFailed).loadDashboardRoleContent(activeKey);
  }

  const announcementsState = { loading:false, loaded:false, query:'', audience:'all', type:'all', page:1, pageSize:5 };

  function initializeAnnouncementSearch(target) {
    const search=target.querySelector('#announcementSearch');
    if(!search)return;
    const items=Array.from(target.querySelectorAll('#announcementList [data-announcement-item]'));
    const groups=Array.from(target.querySelectorAll('[data-announcement-group]'));
    const audiences=Array.from(target.querySelectorAll('[data-announcement-audience]'));
    const type=target.querySelector('[data-announcement-type-filter]');
    const more=target.querySelector('[data-announcement-more]');
    function render() {
      const query=announcementsState.query.trim().toLocaleLowerCase();
      const matches=items.filter(item=>(item.dataset.announcementSearch||'').toLocaleLowerCase().includes(query) && (announcementsState.audience==='all' || item.dataset.announcementAudiences.split(' ').includes(announcementsState.audience)) && (announcementsState.type==='all' || item.dataset.announcementType===announcementsState.type));
      const visible=new Set(matches.slice(0,announcementsState.page*announcementsState.pageSize));
      items.forEach(item=>{item.hidden=!visible.has(item);});
      groups.forEach(group=>{group.hidden=!Array.from(group.querySelectorAll('[data-announcement-item]')).some(item=>!item.hidden);});
      target.querySelector('[data-announcement-results]').textContent='Showing '+visible.size+' of '+matches.length+' announcements';
      target.querySelector('[data-announcement-no-results]').hidden=matches.length>0;
      const remaining=Math.max(0,matches.length-announcementsState.page*announcementsState.pageSize);
      more.hidden=!remaining;
      more.textContent='Show '+Math.min(remaining,announcementsState.pageSize)+' older announcements';
      audiences.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.announcementAudience===announcementsState.audience)));
    }
    search.value=announcementsState.query;
    type.value=announcementsState.type;
    search.addEventListener('input',()=>{announcementsState.query=search.value;announcementsState.page=1;render();});
    type.addEventListener('change',()=>{announcementsState.type=type.value;announcementsState.page=1;render();});
    audiences.forEach(button=>button.addEventListener('click',()=>{announcementsState.audience=button.dataset.announcementAudience;announcementsState.page=1;render();}));
    more.addEventListener('click',()=>{announcementsState.page++;render();});
    render();
  }

  function renderAnnouncementsLoading() {
    const target = byId('announcementsContent');
    if (target) {
      target.innerHTML = renderSkeleton('panel', 'Loading announcements');
    }
  }

  function ensureAnnouncementsLoaded(forceRefresh) {
    if (announcementsState.loading) return;
    if (announcementsState.loaded && !forceRefresh) return;

    const target = byId('announcementsContent');
    if (!target) return;

    announcementsState.loading = true;
    const hadContent = announcementsState.loaded;
    if (!hadContent) renderAnnouncementsLoading();
    const finishLoading = beginContentLoading(target, 'Loading announcements');
    const refreshButton = target.querySelector('[data-refresh-button]');
    const status = target.querySelector('[data-refresh-status]');
    if (refreshButton) { refreshButton.disabled = true; refreshButton.innerHTML = renderSkeleton('inline', 'Refreshing'); }
    if (status) status.innerHTML = renderSkeleton('inline', 'Checking for updates');
    target.setAttribute('aria-busy', 'true');

    dashboardRun()
      .withSuccessHandler(function(html) {
        finishLoading();
        announcementsState.loading = false;
        announcementsState.loaded = true;
        target.innerHTML = html;
        initializeAnnouncementSearch(target);
        target.setAttribute('aria-busy', 'false');
        if (forceRefresh) {
          const updatedButton = target.querySelector('[data-refresh-button]');
          if (updatedButton && document.activeElement === document.body) updatedButton.focus();
        }
      })
      .withFailureHandler(function(err) {
        finishLoading();
        announcementsState.loading = false;
        announcementsState.loaded = hadContent;
        target.setAttribute('aria-busy', 'false');
        if (hadContent) {
          if (refreshButton) { refreshButton.disabled = false; refreshButton.innerHTML = renderLucideIcon_('refresh-cw') + 'Refresh'; }
          if (status) status.textContent = 'Could not refresh. Your previous announcements are still shown. Try again.';
          return;
        }
        target.innerHTML = '<div>Unable to load announcements: ' +
          escapeClientHtml(errorMessage(err)) + '<button type="button" class="btn btn-sm btn-outline" data-refresh-button onclick="refreshAnnouncements()">Try again</button></div>';
      })
      .loadAnnouncementsForCurrentUser();
  }

  function refreshAnnouncements() {
    ensureAnnouncementsLoaded(true);
  }

  function escapeClientHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    dashboardRun().withSuccessHandler(function(html) {
      finishCards.forEach(function(finish) { finish(); });
      disconnectConfigurationGrids();
      checkingReviewConfiguration=false;checkingCommitteeConfiguration=false;
      target.innerHTML = html;
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
    }).withFailureHandler(function(err) {
      finishCards.forEach(function(finish) { finish(); });
      systemStatusState.loading = false;
      target.setAttribute('aria-busy', 'false');
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw') + 'Refresh'; }
      buttons.forEach(function(item) { item.el.disabled = item.disabled; });
      if (!systemStatusState.loaded) target.textContent = 'System status is unavailable.';
      setText('systemStatusMessage', 'Unable to load system status: ' + errorMessage(err) + '. Select Refresh to retry.');
    }).loadCoordinatorSystemStatus();
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
    } else if (activeKey === 'announcements') {
      // Click-to-load path. This may win the race against background preload.
      ensureAnnouncementsLoaded(false);
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
    Array.from(table.querySelectorAll('thead th')).forEach((header, column) => {
      if (!header.hasAttribute('data-sort-type')) return;
      let button = header.querySelector('[data-table-sort]');
      if (!button) {
        const label = header.textContent.trim();
        header.textContent = '';
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline';
        button.setAttribute('data-table-sort', label);
        header.appendChild(button);
      }
      const selected = state.column === column;
      header.setAttribute('aria-sort', selected ? state.direction : 'none');
      const label = button.getAttribute('data-table-sort');
      button.textContent = label;
      button.setAttribute('data-sort-direction', selected ? state.direction : 'none');
      button.setAttribute('aria-label', 'Sort by ' + label + (selected && state.direction === 'ascending' ? ' descending' : ' ascending'));
      button.onclick = function() {
        state.direction = state.column === column && state.direction === 'ascending' ? 'descending' : 'ascending';
        state.column = column;
        state.type = header.getAttribute('data-sort-type');
        initializeTableSorting(table, options);
        if (options.onSort) options.onSort(state);
        else {
          const body = table.querySelector('tbody');
          if (body) body.replaceChildren(...sortTableRows(Array.from(body.children),state));
        }
      };
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
      const btn = document.createElement('button');btn.className='page-link';
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
      ? '<a class="btn btn-outline" href="' +
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
          '<div class="card">' +
            '<div>Guide</div>' +
            '<div>' +
              escapeDrawerHtml(data.guideName || '—') +
            '</div>' +
          '</div>' +

          '<div class="card">' +
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
            '</span><span class="badge badge--' + (review.completed ? 'success' : 'warning') + '">' + (review.available === false ? 'Unavailable' : review.completed ? 'Completed' : 'Pending') + '</span></div>';
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
          '<div class="card">' +
            '<div>Daily Logs</div>' +
            '<div>' +
              escapeDrawerHtml(data.weekLogs) +
            '</div>' +
          '</div>' +

          '<div class="card">' +
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
        const button = document.createElement('button');button.className='btn btn-sm btn-outline';button.type = 'button';button.textContent = 'Retry';
        button.addEventListener('click', function() { loadSection(section); });
        note.appendChild(button);target.appendChild(note);
      }
      dashboardRun().withSuccessHandler(function(data) {
        if (!current()) return;
        pending.delete(section);
        target.innerHTML = buildCoordinatorTeamDrawerHtml(data, section);
        target.setAttribute('aria-busy', 'false');
        if (section === 'progress' && (data.reviews || []).some(review => review.available === false)) showRetry('Some review data is unavailable.');
      }).withFailureHandler(function(err) {
        if (!current()) return;
        pending.delete(section);target.innerHTML = '';target.setAttribute('aria-busy', 'false');
        showRetry('Unable to load ' + section + ': ' + errorMessage(err));
      }).loadCoordinatorDrawerSection(teamId, section);
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
      content.innerHTML=report.html;
      content.querySelectorAll('details').forEach(item=>{item.open=expanded.has(item.getAttribute('data-committee-key'));});
      card.setAttribute('data-readiness-loaded','true');
      setText('committeeConfigurationCheckedAt','Last checked: '+new Date(report.checkedAt).toLocaleString());
      [['committeeConfigLink','committees'],['committeeAssignmentsLink','assignments']].forEach(([id,key])=>{const link=byId(id),url=report.links[key];link.hidden=!url;if(url)link.href=url;});
      arrangeAssessmentReadiness();
    }
    dashboardRun().withSuccessHandler(report=>finish(report,null)).withFailureHandler(error=>finish(null,errorMessage(error))).getCoordinatorCommitteeConfiguration();
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
    dashboardRun().withSuccessHandler(function(report) { finish(report, null); })
      .withFailureHandler(function(err) { finish(null, 'Unable to check configuration: ' + errorMessage(err) + '. Try Recheck.'); })
      .getCoordinatorReviewConfiguration();
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
    dashboardRun().withSuccessHandler(function(result){
      finish(result.created?'AssessmentDefinitions created with headers only. Open Assessment definitions to configure the graded assessments, then Recheck.':'AssessmentDefinitions already exists. Existing configuration was left unchanged.');
    }).withFailureHandler(function(err){
      finish('Definitions setup stopped: '+errorMessage(err));
    }).createAssessmentDefinitions();
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
    dashboardRun().withSuccessHandler(function(result){
      const journals=result.journals;
      journals.forEach(function(journal){
        if(!results)return;
        const item=document.createElement('li');
        item.textContent=journal.label+': '+journal.journal+' — '+(journal.created?'created':journal.initialized?'initialized':'existing storage retained')+'.';
        results.appendChild(item);
      });
      finish(journals.length+' assessment journals ready. Existing assessment data was left unchanged.');
      document.querySelectorAll('[data-publishing]').forEach(function(section){InternalAssessmentPublishing.refresh(section.dataset.publishing);});
    }).withFailureHandler(function(err){
      finish('Setup stopped: '+errorMessage(err)+'. Retry to resume missing assessment storage.');
    }).prepareReviewAssessmentStorage();
  }

  function runGithubSync() {
    const btn = document.getElementById('githubSyncButton');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing...';
    }

    dashboardRun()
      .withSuccessHandler(function(result) {

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
      })
      .withFailureHandler(function(error) {

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
      })
      .syncCoordinatorGithubAccess();
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
      output.innerHTML = rows.length ? '<table class="table table--compact"><thead><tr><th>Team</th><th>Student</th><th>GitHub</th><th>Result</th><th>Details</th></tr></thead><tbody>' + rows.slice(bounds.start, bounds.end).map(row => '<tr>' + [row.teamId,row.student,row.username,row.status,row.reason].map(value => '<td>' + escapeClientHtml(value || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '';
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
      dashboardRun().withSuccessHandler(function(result) {
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
      }).withFailureHandler(function(error) {
        host.resendCursor = cursor;
        finish('Run interrupted: ' + (error && error.message || 'Unknown error') + '. Retry to recheck unfinished work.', true);
      }).resendExpiredStudentInvitations(cursor);
    }
    batch(host.resendCursor || '');
  }

  const weeklyFields = [
    ['workCompleted','Work Completed','Built, tested, learned — share your progress.'],
    ['guideDiscussion','Guide Discussion/Decision','What did you discuss or decide?'],
    ['blockers','Problems/Blockers','Need help? Add it here. Otherwise, write None.'],
    ['nextAction','Next Week Plan','Your next few steps. Keep it specific.'],
  ];
  const weeklySeparator = ' ' + String.fromCharCode(183) + ' ';
  function weeklyDate(value, timezone) {
    return value ? new Date(value).toLocaleString('en-IN',{timeZone:timezone,day:'numeric',month:'short',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'}).replace('Sept','Sep').replace('am','AM').replace('pm','PM') : 'Not submitted';
  }
  function weeklyWeekLabel(weekId) {
    const match = String(weekId).match(/[0-9]+$/);
    return match ? 'Week ' + match[0].padStart(2,'0') : String(weekId);
  }
  function weeklyHeading(host, action) {
    const label = weeklyWeekLabel(action.weekId);
    if (!action.opens) return label;
    const shortDate = value => new Date(value).toLocaleDateString('en-GB',{timeZone:host.weeklyData.timezone,day:'numeric',month:'short'}).replace('Sept','Sep');
    return label + weeklySeparator + shortDate(action.opens) + ' ' + String.fromCharCode(8211) + ' ' + shortDate(action.deadline);
  }
  function weeklyStateLabel(week, timezone) {
    if (week.guideFrozen) return week.state + weeklySeparator + 'Guide confirmed; further revisions are frozen';
    if (week.state === 'OPEN') return 'OPEN' + weeklySeparator + 'Not submitted';
    if (week.state === 'LATE') return 'LATE' + weeklySeparator + 'Submission available until ' + weeklyDate(week.cutoff,timezone);
    return week.state;
  }
  function weeklyStatusTone(state, deadline, timezone, now) {
    if (state === 'SUBMITTED ON TIME') return 'success';
    if (state === 'LATE' || state === 'SUBMITTED LATE' || state === 'MISSED' || now > Date.parse(deadline)) return 'danger';
    const day = value => {
      const parts = new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(value));
      const part = name => Number(parts.find(p=>p.type === name).value);
      return Date.UTC(part('year'),part('month')-1,part('day')) / 86400000;
    };
    return day(deadline) - day(now) <= 1 ? 'warning' : 'success';
  }
  function updateWeeklyFormPresentation(host, form, action, saved) {
    const data = host.weeklyData, esc = escapeClientHtml;
    const latest = saved || data.history.filter(r=>r.weekId === action.weekId && r.entryStatus !== 'MISSED').slice(-1)[0];
    const state = latest ? (latest.timeliness === 'ON_TIME' ? 'SUBMITTED ON TIME' : 'SUBMITTED LATE') : action.state;
    const label = weeklyStateLabel({...action,state},data.timezone);
    host.querySelector('[data-weekly-heading]').textContent = weeklyHeading(host,action);
    const dates = host.querySelector('[data-weekly-dates]');
    dates.innerHTML = '<span>Due ' + esc(weeklyDate(action.deadline,data.timezone)) + '</span><span>Late submission until ' + esc(weeklyDate(action.cutoff,data.timezone)) + '</span>';
    dates.hidden = !dates.textContent;
    host.querySelector('[data-weekly-state]').innerHTML = '<span data-tone="' + weeklyStatusTone(state,action.deadline,data.timezone,data.checkedAt ? Date.parse(data.checkedAt) : Date.now()) + '" data-state="' + esc(state) + '">' + esc(label) + '</span>';
    if (form && form.dataset.week === action.weekId) form.querySelector('[type="submit"]').textContent = (latest ? 'Update ' : 'Submit ') + weeklyWeekLabel(action.weekId) + ' Progress';
  }
  function openWeeklyActivity(trigger) {
    const data = byId('studentWeeklyProgress')?.weeklyData;
    if (!data) { openContentDrawer('All weekly logs','<p>Logs unavailable. Refresh weekly progress and try again.</p>',trigger); return; }
    const esc=escapeClientHtml, weeks=data.allWeeks || data.weeks;
    const now=Date.parse(data.checkedAt) || Date.now();
    const content='<p>'+weeks.length+' weeks</p>'+weeks.map(week=>{
      const future=Date.parse(week.opens)>now;
      const entries=data.history.filter(entry=>entry.weekId===week.weekId).slice().reverse();
      const evidence=(data.evidence || []).find(item=>item.weekId===week.weekId);
      const github=evidence?.state==='available' ? (evidence.count ? '<ul>'+evidence.commits.map(commit=>'<li>'+esc(weeklyDate(commit.timestamp,data.timezone))+' | '+esc(commit.message)+' | <a href="'+esc(commit.url)+'" target="_blank" rel="noopener noreferrer">'+esc(commit.shortSha)+'</a></li>').join('')+'</ul>' : '<p>No qualifying GitHub activity recorded.</p>') : '<p>'+esc(evidence?.message || (evidence?.state==='unmapped' ? 'GitHub username mapping is unavailable.' : 'GitHub activity is unavailable.'))+'</p>';
      return '<section'+(future?' data-future':'')+'><h3>'+esc(weeklyWeekLabel(week.weekId))+(future?' · Upcoming':'')+'</h3><p>Opens '+esc(weeklyDate(week.opens,data.timezone))+'<br>Deadline '+esc(weeklyDate(week.deadline,data.timezone))+'</p>'+(entries.length ? entries.map(entry=>entry.entryStatus==='MISSED' ? '<p>Missed</p>' : '<details><summary>'+esc(weeklyDate(entry.recordedAt,data.timezone)+weeklySeparator+entry.entryStatus+weeklySeparator+entry.timeliness)+'</summary><p>First submitted: '+esc(weeklyDate(entry.firstSubmittedAt,data.timezone))+'</p>'+weeklyFields.map(field=>'<h4>'+esc(field[1])+'</h4><p>'+esc(entry[field[0]] || '')+'</p>').join('')+'<h4>Your GitHub activity</h4>'+github+'</details>').join('') : '<p>'+(future?'Not open yet':'No submission recorded')+'</p>')+'</section>';
    }).join('');
    openContentDrawer('All weekly logs',content,trigger);
  }
  function hasWeeklyGithubEvidence(host, weekId) {
    const evidence = (host.weeklyData.evidence || []).find(item=>item.weekId === weekId);
    return !!evidence && evidence.state === 'available' && evidence.count > 0;
  }
  function renderWeeklyGithub(host, weekId) {
    let panel = host.querySelector('[data-weekly-github]');
    if (!panel) {
      panel = document.createElement('section'); panel.setAttribute('data-weekly-github','');
      panel.className = '';
    }
    // Keep the gate visible even when its form is hidden; never discard draft text.
    host.insertBefore(panel,host.querySelector('[data-weekly-form]'));
    const data = host.weeklyData, evidence = (data.evidence || []).find(item=>item.weekId === weekId), esc = escapeClientHtml;
    panel.hidden = !weekId;
    let header = host.querySelector('[data-weekly-header]');
    if (!header) {
      header = document.createElement('header'); header.className = ''; header.setAttribute('data-weekly-header','');
      header.innerHTML = '<h4 data-weekly-heading></h4><div data-weekly-state role="status" aria-label="Submission status"></div><p data-weekly-dates></p>';
    }
    host.insertBefore(header,panel);
    const week = data.weeks.find(w=>w.weekId === weekId);
    header.hidden = !week;
    if (week) updateWeeklyFormPresentation(host,host.querySelector('form'),week);
    if (!weekId) return;
    let body = '<p>' + esc(evidence && evidence.message || 'GitHub activity is unavailable. Refresh GitHub Activity to retry.') + '</p>';
    if (evidence && evidence.state === 'unmapped') body = '<p>Your GitHub username mapping is unavailable or unverified. Complete GitHub setup, then refresh.</p>';
    if (evidence && evidence.state === 'available') {
      body = evidence.count > 0 ? '<details><summary>' + evidence.count + (evidence.count === 1 ? ' commit' : ' commits') + ' this week</summary><ul>' + evidence.commits.map(commit=>
        '<li><time datetime="' + esc(commit.timestamp) + '">' + esc(weeklyDate(commit.timestamp,data.timezone)) + '</time><span>' + esc(commit.message) + '</span><a href="' + esc(commit.url) + '" target="_blank" rel="noopener noreferrer">' + esc(commit.shortSha) + '</a></li>').join('') + '</ul></details>'
        : '<p>No GitHub activity found for you this week. Commit your project work/evidence to the team repository, then refresh.</p>';
    }
    panel.innerHTML = '<div><h5>Your GitHub activity' + weeklySeparator + esc(weeklyWeekLabel(weekId)) + '</h5>' +
      '<button type="button" class="btn btn-sm btn-outline" data-weekly-github-refresh title="Refresh GitHub Activity" aria-label="Refresh GitHub Activity" onclick="DashboardUI.loadWeeklyProgress()">' + renderLucideIcon_('refresh-cw') + '</button></div>' + body;
  }
  function loadWeeklyProgress() {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const target = host.querySelector('[data-weekly-read]'), status = host.querySelector('[data-weekly-status]');
    const buttons = host.querySelectorAll('[data-weekly-refresh], [data-weekly-github-refresh]');
    host.weeklyBusy = true; buttons.forEach(button=>{button.disabled = true;});
    const finish = beginContentLoading(host,'Refreshing weekly progress',{compact:true});
    function settle() { finish(); host.weeklyBusy = false; buttons.forEach(button=>{button.disabled = false;}); }
    dashboardRun().withSuccessHandler(function(data) {
      settle();
      if (!host.isConnected || byId('studentWeeklyProgress') !== host) return;
      if (host.weeklyRefreshError) {
        if (status.textContent === host.weeklyRefreshError) status.textContent = '';
        host.weeklyRefreshError = null;
      }
      host.weeklyData = data;
      const recent=byId('studentRecentActivity');
      if(recent) {
        const latest=new Map();
        data.history.slice().reverse().forEach(entry=>{if(!latest.has(entry.weekId))latest.set(entry.weekId,entry);});
        recent.innerHTML=Array.from(latest.values()).slice(0,3).map(entry=>'<div data-activity-row><strong>'+escapeClientHtml(weeklyWeekLabel(entry.weekId))+'</strong><span>'+escapeClientHtml(entry.entryStatus==='MISSED'?'Missed':entry.timeliness==='ON_TIME'?'Submitted on time':'Submitted late')+'</span><time>'+escapeClientHtml(weeklyDate(entry.recordedAt,data.timezone))+'</time></div>').join('') || '<p>No weekly submissions yet.</p>';
      }
      const esc = escapeClientHtml;
      target.innerHTML = (data.message && (!data.ready || !data.weeks.length) ? '<p>' + esc(data.message) + '</p>' : '') +
        data.weeks.filter(week=>week.weekId !== host.querySelector('form')?.dataset.week && !data.actions.some(action=>action.weekId === week.weekId)).map(function(week) {
          return '<p>' + esc(weeklyWeekLabel(week.weekId) + weeklySeparator + weeklyStateLabel(week,data.timezone)) + '</p>';
        }).join('') + (data.actions.length > 1 ? '<nav aria-label="Choose progress week">' +
        data.actions.map(function(action) { return '<button type="button" class="btn btn-sm btn-outline" data-week="' + esc(action.weekId) + '" onclick="DashboardUI.chooseWeeklyAction(this)">' +
          esc(weeklyWeekLabel(action.weekId)) + '</button>'; }).join(' ') + '</nav>' : '');
      const formContainer = host.querySelector('[data-weekly-form]');
      const form = host.querySelector('form');
      const selectedWeek = host.weeklySelectedWeek || form?.dataset.week || (data.actions.find(a=>a.state === 'OPEN') || data.actions[0] || data.weeks.slice(-1)[0])?.weekId || (data.evidence || []).slice(-1)[0]?.weekId;
      host.weeklySelectedWeek = selectedWeek;
      const hasEvidence = hasWeeklyGithubEvidence(host,selectedWeek);
      formContainer.hidden = !data.ready || !hasEvidence;
      const action = data.actions.find(a=>a.weekId === selectedWeek);
      if (form && form.dataset.week === selectedWeek) {
        const stillAllowed = data.ready && hasEvidence && !!action;
        Array.from(form.elements).forEach(el=>{el.disabled = !stillAllowed;});
        const week = data.weeks.find(a=>a.weekId === selectedWeek);
        if (week) updateWeeklyFormPresentation(host,form,week);
        form.querySelector('[type="submit"]').hidden = !stillAllowed;
        const cancel=form.querySelector('[data-weekly-cancel]');if(cancel)cancel.disabled=false;
        if (!action && hasEvidence) status.textContent = 'This action is no longer available. Your unsaved text is retained. Choose an available week to continue.';
      } else if (action || (latestWeeklySubmission(host,selectedWeek) && data.weeks.some(w=>w.weekId === selectedWeek))) {
        renderWeeklyForm(host,action || data.weeks.find(w=>w.weekId === selectedWeek));
      }
      renderWeeklyGithub(host,selectedWeek);
    }).withFailureHandler(function(error) {
      settle();
      if (host.isConnected && byId('studentWeeklyProgress') === host) {
        const recent=byId('studentRecentActivity');
        if(recent && !host.weeklyData)recent.innerHTML='<p>Logs unavailable. Refresh weekly progress to retry.</p>';
        host.weeklyRefreshError = 'Could not refresh weekly progress: ' + errorMessage(error) + '. Use Refresh weekly progress to retry.';
        status.textContent = host.weeklyRefreshError;
      }
    }).loadStudentWeeklyProgress();
  }
  function latestWeeklySubmission(host, weekId) {
    return host.weeklyData.history.filter(r=>r.weekId === weekId && r.entryStatus !== 'MISSED').slice(-1)[0];
  }
  function renderWeeklyForm(host, action, editing) {
    host.weeklySelectedWeek = action.weekId;
    const container = host.querySelector('[data-weekly-form]');
    const saved = latestWeeklySubmission(host,action.weekId);
    if (saved && !editing) {
      const esc=escapeClientHtml;
      const editable=host.weeklyData.ready && hasWeeklyGithubEvidence(host,action.weekId) && host.weeklyData.actions.some(a=>a.weekId===action.weekId);
      container.hidden=false;
      container.innerHTML='<div data-submission-summary>'+weeklyFields.map(field=>'<section><h5>'+esc(field[1])+'</h5><p>'+esc(saved[field[0]] || '')+'</p></section>').join('')+'</div>'+(editable?'<button type="button" class="btn btn-sm btn-outline" data-weekly-edit onclick="DashboardUI.editWeeklySubmission(this)">Edit submission</button>':'');
      renderWeeklyGithub(host,action.weekId);
      return;
    }
    container.hidden = !host.weeklyData.ready || !hasWeeklyGithubEvidence(host,action.weekId);
    if (container.hidden) {
      const form = host.querySelector('form');
      if (form) Array.from(form.elements).forEach(el=>{el.disabled = true;});
      renderWeeklyGithub(host,action.weekId);
      return;
    }
    const data = host.weeklyData, esc = escapeClientHtml;
    const latest = data.history.filter(r=>r.weekId === action.weekId && r.entryStatus !== 'MISSED').slice(-1)[0] || {};
    host.querySelector('[data-weekly-form]').innerHTML = '<form class="weekly-progress-form" data-week="' + esc(action.weekId) + '" onsubmit="DashboardUI.submitWeeklyProgress(event,this)">' +
      weeklyFields.map(function(field) { return '<div><label for="weekly-' + field[0] + '">' + esc(field[1]) + ' <span aria-hidden="true">*</span></label><textarea id="weekly-' + field[0] + '" name="' + field[0] + '" rows="3" required maxlength="10000" placeholder="' + esc(field[2]) + '">' + esc(latest[field[0]] || '') + '</textarea></div>'; }).join('') +
      '<div><button type="submit" class="btn btn-lg btn-primary"></button>' + (saved ? '<button type="button" class="btn btn-sm btn-outline" data-weekly-cancel onclick="DashboardUI.cancelWeeklyEdit(this)">Cancel</button>' : '') + '</div></form>';
    renderWeeklyGithub(host,action.weekId);
    host.querySelector('form').addEventListener('input',function() { this.weeklyDirty = true; });
  }
  function editWeeklySubmission(button) {
    const host=button.closest('#studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const action=host.weeklyData.actions.find(a=>a.weekId===host.weeklySelectedWeek);
    if (!action || !host.weeklyData.ready || !hasWeeklyGithubEvidence(host,action.weekId)) return;
    renderWeeklyForm(host,action,true);
    host.querySelector('textarea')?.focus();
  }
  async function cancelWeeklyEdit(button) {
    const host=button.closest('#studentWeeklyProgress'), form=host?.querySelector('form');
    if (!form || host.weeklyBusy || host.weeklySaving) return;
    const saved=latestWeeklySubmission(host,form.dataset.week);
    const changed=weeklyFields.some(field=>form.elements[field[0]].value !== (saved?.[field[0]] || ''));
    if (changed && !await dialogs.ask('Discard unsaved changes to this weekly submission?')) return;
    if (!host.isConnected || host.weeklyBusy || host.weeklySaving || host.querySelector('form')!==form) return;
    const week=host.weeklyData.weeks.find(w=>w.weekId===form.dataset.week);
    if (week) { renderWeeklyForm(host,week); host.querySelector('[data-weekly-edit]')?.focus(); }
  }
  async function chooseWeeklyAction(button) {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const action = host.weeklyData.actions.find(a=>a.weekId === button.dataset.week);
    if (!action) return;
    const form = host.querySelector('form');
    if (form && form.dataset.week === action.weekId && host.weeklySelectedWeek === action.weekId) return;
    if (form && form.weeklyDirty && !await dialogs.ask('Discard unsaved weekly text and open the selected week?')) return;
    if (!host.isConnected || host.weeklySaving) return;
    renderWeeklyForm(host,action);
  }
  function submitWeeklyProgress(event, form) {
    event.preventDefault();
    const host = form.closest('#studentWeeklyProgress');
    if (host.weeklySaving || host.weeklyBusy || !hasWeeklyGithubEvidence(host,form.dataset.week) || !host.weeklyData.actions.some(a=>a.weekId === form.dataset.week) || !form.reportValidity()) return;
    const input = {};
    weeklyFields.forEach(field=>{input[field[0]] = form.elements[field[0]].value;});
    input.weekId = form.dataset.week;
    const content = JSON.stringify(input);
    if (!form.weeklyRequest || form.weeklyRequest.content !== content) form.weeklyRequest = {content:content,id:crypto.randomUUID()};
    input.requestId = form.weeklyRequest.id;
    host.weeklySaving = true;
    Array.from(form.elements).forEach(el=>{el.disabled = true;});
    const status = host.querySelector('[data-weekly-status]');
    status.textContent = 'Saving weekly progress...';
    function settle() { host.weeklySaving = false; Array.from(form.elements).forEach(el=>{el.disabled = false;}); }
    dashboardRun().withSuccessHandler(function(result) {
      settle();
      if (!host.isConnected) return;
      form.weeklyDirty = false; form.weeklyRequest = null;
      status.textContent = result.message + ' ' + weeklyWeekLabel(result.weekId) + weeklySeparator + result.entryStatus + weeklySeparator + result.timeliness;
      const saved={...latestWeeklySubmission(host,input.weekId),...input,...result};
      host.weeklyData.history.push(saved);
      const week=host.weeklyData.weeks.find(w=>w.weekId===input.weekId);
      if(week)renderWeeklyForm(host,week);
      loadWeeklyProgress();
    }).withFailureHandler(function(error) {
      settle();
      if (host.isConnected) status.textContent = errorMessage(error) + ' Your text is retained; retry when ready.';
    }).submitWeeklyProgress(input);
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
    dashboardRun().withSuccessHandler(function(result) { finish(result.message || ''); })
      .withFailureHandler(function(err) { finish(errorMessage(err)); }).completeStudentGithubSetup();
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
    dashboardRun().withSuccessHandler(function(result) {
      settle();
      if (!form.isConnected || form.githubRequest !== request) return;
      form.githubToken = result.token;
      const account = result.account, esc = escapeClientHtml;
      panel.innerHTML = (account.avatarUrl ? '<img width="48" height="48" alt="" src="' + esc(account.avatarUrl) + '">' : '') +
        '<p><strong>' + esc(account.displayName || '') + '</strong> <a target="_blank" rel="noopener" href="' + esc(account.profileUrl) + '">@' + esc(account.username) + '</a></p>' +
        '<p>Is this your GitHub account?</p><button type="button" class="btn btn-primary" data-confirm-account>Yes, this is my account</button> <button type="button" class="secondary btn btn-outline" data-change-account>No, change profile link</button>';
      input.disabled = true;
      form.querySelector('button[type="submit"]').hidden = true;
      panel.querySelector('[data-confirm-account]').onclick = function() { confirmGithubAccount(form); };
      panel.querySelector('[data-change-account]').onclick = function() {
        form.githubRequest++; form.githubToken = null; panel.hidden = true; panel.innerHTML = '';
        input.disabled = false; form.querySelector('button[type="submit"]').hidden = false; input.focus();
      };
      panel.querySelector('[data-confirm-account]').focus();
    }).withFailureHandler(function(error) {
      settle();
      if (!form.isConnected || form.githubRequest !== request) return;
      setText('githubSubmitStatus',errorMessage(error)); input.focus();
    }).previewStudentGithubAccount(input.value);
  }

  function confirmGithubAccount(form) {
    if (form.githubBusy || !form.githubToken) return;
    form.githubBusy = true; setButtonsDisabled(form,true);
    setText('githubSubmitStatus','Connecting GitHub account...');
    dashboardRun().withSuccessHandler(function(result) {
      form.githubBusy = false;
      if (!form.isConnected) return;
      form.hidden = true; form.githubToken = null;
      setText('githubSubmitStatus',result.message);
      dashboardRun().withSuccessHandler(function(setup) { refreshGithubStatus(null,result.message + ' ' + (setup.message || '')); })
        .withFailureHandler(function(error) { refreshGithubStatus(null,'GitHub account connected. Repository access is pending: ' + errorMessage(error)); }).completeStudentGithubSetup();
    }).withFailureHandler(function(error) {
      form.githubBusy = false; setButtonsDisabled(form,false);
      if (form.isConnected) setText('githubSubmitStatus',errorMessage(error));
    }).confirmStudentGithubAccount(form.githubToken);
  }

  return {
    notify: dialogs.notify, ask: dialogs.ask, confirmDialog: dialogs.confirmDialog, requestText: dialogs.requestText,
    loadWeeklyProgress, chooseWeeklyAction, submitWeeklyProgress,
    refreshGithubStatus,
    retryGithubSetup,
    focusGithubAccountForm, previewGithubAccount,
    renderAssessmentHistory: renderAssessmentHistory,
    renderSkeleton: renderSkeleton,
    beginContentLoading: beginContentLoading,
    guideRun: dashboardRun,
    refreshRoleDashboard,
    refreshSystemStatus: function() { ensureSystemStatusLoaded(true); },
    loadSharedTimeline,
    loadSharedRubrics,
    openRubricDrawer,
    openWeeklyActivity,
    editWeeklySubmission,
    cancelWeeklyEdit,
    closeRubricDrawer,
    getSharedSchedule: function() { return sharedSchedule; },
    showRoleTab,
    toggleRoleMenu,
    initializeRoleMenu,
    initializeLoading,
    refreshAnnouncements,
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
function refreshAnnouncements() { DashboardUI.refreshAnnouncements(); }
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
