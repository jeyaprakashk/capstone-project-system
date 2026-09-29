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
    escape(full.slice(0, maxLen).trim()) + '&hellip; <em class="expand-hint">more</em></span>' +
    '<span class="expandable-text-full">' + escape(full) +
    ' <em class="expand-hint">less</em></span></summary></details>';
}

/** Lazy-load one pinned bundle; a separate top-layer host also covers marking dialogs. */
function dashboardDialogsBrowser_(renderSkeleton, renderIcon) {
  let library, active=false, settled=Promise.resolve();
  function load() {
    if (window.Swal) return Promise.resolve(window.Swal);
    if (!library) library=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Dialog download timed out.')),15000);
      function finish(error) {
        clearTimeout(timer);script.onload=null;script.onerror=null;
        if(error){script.remove();reject(error);}else resolve(window.Swal);
      }
      script.src='https://cdn.jsdelivr.net/npm/sweetalert2@11.26.25/dist/sweetalert2.all.min.js';
      script.onload=()=>finish(window.Swal?null:new Error('Dialog library unavailable.'));
      script.onerror=()=>finish(new Error('Dialog download failed.'));
      document.head.appendChild(script);
    }).catch(error=>{library=null;throw error;});
    return library;
  }
  async function show(kind,text,icon) {
    // A second action must never inherit approval from an already open confirmation.
    if(active)return {isConfirmed:false};
    active=true;
    let settle;
    settled=new Promise(resolve=>{settle=resolve;});
    const previous=document.activeElement;
    const host=document.createElement('dialog');
    host.setAttribute('aria-label','Dashboard message');
    host.style.cssText='position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;color:inherit;';
    host.addEventListener('cancel',event=>event.preventDefault());
    host.addEventListener('keydown',event=>event.stopPropagation());
    host.addEventListener('focusin',event=>event.stopPropagation());
    document.body.appendChild(host);
    try {
      host.showModal();
      host.innerHTML=renderSkeleton('panel','Preparing message');
      const swal=await load();
      host.innerHTML='';
      // The result resolves before the close animation finishes. Keep the host
      // mounted until SweetAlert has removed its body classes and scroll lock.
      let finishDialog;
      const dialogDestroyed=new Promise(resolve=>{finishDialog=resolve;});
      const result=await swal.fire({
        target:host,titleText:kind==='confirm'?'Please confirm':kind==='prompt'?'Add a remark':icon==='error'?'Unable to complete action':'Message',
        text:String(text),icon:'info',iconHtml:renderIcon(({success:'check',error:'x',warning:'triangle-alert',question:'circle-help',info:'info'})[icon] || (kind==='confirm'?'circle-help':'info')),customClass:{icon:'dashboard-dialog-icon'},
        showCancelButton:kind!=='alert',confirmButtonText:kind==='alert'?'OK':'Continue',
        cancelButtonText:'Cancel',focusCancel:kind==='confirm',allowOutsideClick:false,
        heightAuto:false,returnFocus:false,keydownListenerCapture:true,
        animation:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        ...(kind==='prompt'?{input:'textarea',inputLabel:String(text),inputAttributes:{maxlength:'5000'},
          inputValidator:value=>!value.trim()?'Please enter a remark.':undefined}:{}),
        didOpen:()=>{const content=swal.getHtmlContainer();if(content)content.style.whiteSpace='pre-line';},
        didDestroy:()=>finishDialog()
      });
      await dialogDestroyed;
      return result;
    } catch(error) {
      // Fail closed when the CDN is unavailable; retain form data and permit retry.
      host.innerHTML='';
      const panel=document.createElement('div');
      panel.style.cssText='margin:15vh auto;padding:24px;max-width:480px;background:var(--color-paper,white);color:var(--color-ink,#172033);border-radius:var(--editorial-radius,12px);';
      const message=document.createElement('p');
      message.style.whiteSpace='pre-line';
      message.textContent=kind==='alert'?String(text):'Unable to open the confirmation. Your action was not performed. Please close this message and try again.';
      const button=document.createElement('button');button.textContent='Close';
      panel.appendChild(message);panel.appendChild(button);host.appendChild(panel);
      await new Promise(resolve=>{button.onclick=resolve;button.focus();});
      return {isConfirmed:false};
    } finally {
      host.close();host.remove();active=false;settle();
      if(previous && previous.isConnected)previous.focus();
    }
  }
  return {
    notify:async (text,icon)=>{while(active)await settled;return show('alert',text,icon);},
    ask:async text=>(await show('confirm',text)).isConfirmed,
    requestText:async text=>{const result=await show('prompt',text);return result.isConfirmed?result.value.trim():null;}
  };
}

function getDashboardClientScript() {
  return `
const DashboardUI = (function() {
  'use strict';
  const renderSkeleton = ${getSkeletonMarkup_.toString()};
  const dialogs = (${dashboardDialogsBrowser_.toString()})(renderSkeleton, renderLucideIcon_);
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
    overlay.innerHTML = renderSkeleton(!compact && height > 0 && height < 120 ? 'inline' : 'panel', label);
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
  function activateRole(key) {
    if (!loadedRoleTabs[key] || activatedRoles[key]) return;
    activatedRoles[key] = true;
    if (key === 'coord') initializeCoordinatorAsync();
    if (key === 'reviewer') filterReviewerAssignedTeams();
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
    target.innerHTML = '<div class="timeline-heading"><h2>Project timeline</h2>' +
      (milestones.length ? '<button type="button" class="timeline-toggle" aria-expanded="false" aria-controls="projectTimelineMilestones">View full timeline</button>' : '') + '</div>' +
      (!milestones.length ? '<p class="timeline-empty">No project milestones scheduled</p>' : '') +
      '<ol id="projectTimelineMilestones" class="timeline-track" style="--timeline-stops:' + (finish-start) + '">' + milestones.map(function(m,index) {
        const past = m.day < data.today, current = index === next;
        const mobileContext = next < 0 ? index >= Math.max(0, milestones.length - 2) : Math.abs(index - next) <= 1;
        const description = m.openingDate ? 'Opens ' + m.openingDate + '; due ' + m.date : m.date;
        const days = m.day - data.today;
        const timing = current ? 'CURRENT · ' + (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days')
          : !past ? (days === 0 ? 'Due today' : 'In ' + days + (days === 1 ? ' day' : ' days')) : '';
        return '<li class="timeline-stop timeline-' + (past ? 'past' : current ? 'current' : 'future') + '" data-timeline-mobile="' + mobileContext + '" data-timeline-context="' + (index >= start && index < finish) + '"' + (index < start || index >= finish ? ' hidden' : '') + (current ? ' aria-current="step"' : '') + '>' +
          '<span class="timeline-dot" aria-hidden="true">' + (past ? renderLucideIcon_('check') : current ? '<span class="timeline-node-core"></span>' : '') + '</span>' +
          '<strong>' + escapeClientHtml(m.label) + '</strong>' +
          '<span class="timeline-date" title="' + escapeClientHtml(description) + '" aria-label="' + escapeClientHtml(description) + '">' + escapeClientHtml(m.date) + '</span>' +
          (timing ? '<span class="timeline-timing">' + timing + '</span>' : '') + '</li>';
      }).join('') + '</ol>';
    const toggle = target.querySelector('.timeline-toggle');
    if (toggle) toggle.addEventListener('click', function() {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show less' : 'View full timeline';
      target.querySelector('.timeline-track').classList.toggle('timeline-full', expanded);
      target.querySelectorAll('.timeline-stop').forEach(item => { item.hidden = !expanded && item.dataset.timelineContext !== 'true'; });
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
          target.innerHTML = '<div class="timeline-heading"><h2>Project timeline</h2><span role="status">Schedule unavailable</span><button type="button" class="timeline-retry">Retry</button></div>';
          target.querySelector('.timeline-retry').addEventListener('click', function() { loadSharedTimeline().catch(function() {}); });
        }
        reject(err);
      }
    });
    return timelineRequest;
  }

  const loadedRoleTabs = Object.create(null);
  let sharedRubrics = null;
  let rubricsRequest = null;
  let rubricTrigger = null;
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
          target.innerHTML = '<div class="rubric-assessments">' + data.assessments.map(function(item) {
            const desktopCard = '<button type="button" class="rubric-assessment" data-rubric-key="' + escapeClientHtml(item.key) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '><span class="rubric-header"><strong>' + escapeClientHtml(item.label) + '</strong><span class="rubric-weight">' + escapeClientHtml(item.weight) + '%<span class="rubric-mobile-hidden"> weight</span></span></span><span class="rubric-footer"><span class="rubric-metadata">' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span>' + (item.available ? '<span class="rubric-action"><span class="rubric-mobile-hidden">View rubric</span> '+renderLucideIcon_('arrow-right')+'</span>' : '') + '</span></button>';
            const mobileRow = '<div class="rubric-mobile-row"><div class="rubric-mobile-details"><div class="rubric-mobile-title"><strong>' + escapeClientHtml(item.label) + '</strong><span class="rubric-mobile-weight" aria-label="' + escapeClientHtml(item.weight) + '% weight">' + escapeClientHtml(item.weight) + '% weight</span></div><span class="rubric-mobile-meta">' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span></div><button type="button" class="rubric-view-button" data-rubric-key="' + escapeClientHtml(item.key) + '" aria-label="View rubric for ' + escapeClientHtml(item.label) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '>View rubric</button></div>';
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
      target.innerHTML = '<p role="status">Unable to load rubrics.</p><button type="button">Retry</button>';
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
    rubricTrigger = trigger || document.activeElement;
    byId('rubricDrawerTitle').textContent = item.label;
    byId('rubricDrawerContent').innerHTML = '<div class="drawer-section"><div class="drawer-section-title">Assessment contribution</div><div class="drawer-project-title">' + escapeClientHtml(item.weight) + '% of overall assessment</div><p class="drawer-person-meta">' + escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks</p>' + (item.evaluationNotice ? '<p class="drawer-person-meta">'+escapeClientHtml(item.evaluator)+' · '+escapeClientHtml(item.evaluationNotice)+'</p>' : '') + '</div>' + item.criteria.map(function(c) {
      return '<section class="drawer-section"><div class="drawer-section-title">' + escapeClientHtml(c.pi) + ' · ' + escapeClientHtml(c.co) + ' · ' + escapeClientHtml(c.type) + ' · ' + escapeClientHtml(c.maxMarks) + ' marks</div><h3 class="drawer-project-title">' + escapeClientHtml(c.name) + '</h3><dl class="rubric-levels">' + c.descriptors.map(function(text, level) {
        return text ? '<dt>Level ' + level + '</dt><dd>' + escapeClientHtml(text) + '</dd>' : '';
      }).join('') + '</dl></section>';
    }).join('');
    drawer.inert = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    byId('rubricDrawerBackdrop').classList.add('open');
    document.body.classList.add('team-drawer-open');
    byId('rubricDrawerContent').scrollTop = 0;
    byId('rubricDrawerClose').focus();
  }

  function closeRubricDrawer(restoreFocus) {
    const drawer = byId('rubricDrawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    byId('rubricDrawerBackdrop').classList.remove('open');
    document.body.classList.remove('team-drawer-open');
    if (restoreFocus !== false && rubricTrigger && rubricTrigger.isConnected) rubricTrigger.focus();
    rubricTrigger = null;
  }
  document.addEventListener('keydown', function(event) {
    const drawer = byId('rubricDrawer');
    if (!drawer || !drawer.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeRubricDrawer(); }
    if (event.key === 'Tab') {
      const controls = Array.from(drawer.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('focusin', function(event) {
    const drawer = byId('rubricDrawer');
    if (drawer && drawer.classList.contains('open') && !drawer.contains(event.target)) byId('rubricDrawerClose').focus();
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

    dashboardRun()
      .withSuccessHandler(function(html) {
        finishLoading();
        target.innerHTML = html;
        if (onLoaded) onLoaded();
        if (refresh) activatedRoles[activeKey] = false;
        if (activeKey === 'coord') console.log(JSON.stringify({event:'coordinator_core_render', durationMs:Date.now() - requestStarted, htmlCharacters:html.length}));
        loadedRoleTabs[activeKey] = true;
        loadingRoleTabs[activeKey] = false;

        recordPerformance({event:'role_core_render', role:activeKey, background:!!background, durationMs:Date.now() - requestStarted});
        if (activeRole === activeKey) {
          recordPerformance({event:'tab_core_ready', role:activeKey, durationMs:performance.now() - tabSelectedAt});
        }
        activateRole(activeKey);
      })
      .withFailureHandler(function(err) {
        finishLoading();
        loadingRoleTabs[activeKey] = false;
        if (onError) { onError(err); return; }
        if (refreshButton) { refreshButton.disabled = false; refreshButton.innerHTML = renderLucideIcon_('refresh-cw', '', 'icon-leading') + 'Refresh'; }
        if (hadContent) {
          setText(activeKey + 'RefreshStatus', 'Could not refresh: ' + errorMessage(err) + '. Previous content is still shown.');
          return;
        }
        target.innerHTML = '<div class="role-load-error">Unable to load this dashboard: ' +
          escapeClientHtml(errorMessage(err)) + '</div>';
      })
      .loadDashboardRoleContent(activeKey);
  }

  const announcementsState = { loading:false, loaded:false, query:'', audience:'all', type:'all', page:1, pageSize:5 };

  function initializeAnnouncementSearch(target) {
    const search=target.querySelector('#announcementSearch');
    if(!search)return;
    const items=Array.from(target.querySelectorAll('.announcement-list .announcement-item'));
    const groups=Array.from(target.querySelectorAll('.announcement-date-group'));
    const audiences=Array.from(target.querySelectorAll('[data-announcement-audience]'));
    const type=target.querySelector('[data-announcement-type-filter]');
    const more=target.querySelector('[data-announcement-more]');
    function render() {
      const query=announcementsState.query.trim().toLocaleLowerCase();
      const matches=items.filter(item=>(item.dataset.announcementSearch||'').toLocaleLowerCase().includes(query) && (announcementsState.audience==='all' || item.dataset.announcementAudiences.split(' ').includes(announcementsState.audience)) && (announcementsState.type==='all' || item.dataset.announcementType===announcementsState.type));
      const visible=new Set(matches.slice(0,announcementsState.page*announcementsState.pageSize));
      items.forEach(item=>{item.hidden=!visible.has(item);});
      groups.forEach(group=>{group.hidden=!Array.from(group.querySelectorAll('.announcement-item')).some(item=>!item.hidden);});
      target.querySelector('.announcement-results').textContent='Showing '+visible.size+' of '+matches.length+' announcements';
      target.querySelector('.announcement-no-results').hidden=matches.length>0;
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
    const refreshButton = target.querySelector('.announcement-refresh-btn');
    const status = target.querySelector('.announcement-status');
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
          const updatedButton = target.querySelector('.announcement-refresh-btn');
          if (updatedButton && document.activeElement === document.body) updatedButton.focus();
        }
      })
      .withFailureHandler(function(err) {
        finishLoading();
        announcementsState.loading = false;
        announcementsState.loaded = hadContent;
        target.setAttribute('aria-busy', 'false');
        if (hadContent) {
          if (refreshButton) { refreshButton.disabled = false; refreshButton.innerHTML = renderLucideIcon_('refresh-cw', '', 'icon-leading') + 'Refresh'; }
          if (status) status.textContent = 'Could not refresh. Your previous announcements are still shown. Try again.';
          return;
        }
        target.innerHTML = '<div class="role-load-error">Unable to load announcements: ' +
          escapeClientHtml(errorMessage(err)) + '<button type="button" class="announcement-refresh-btn" onclick="refreshAnnouncements()">Try again</button></div>';
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
    const cards = Array.from(target.querySelectorAll('.system-status-primary > *, .coordinator-container > .assessment-section'));
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
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw', '', 'icon-leading') + 'Refresh'; }
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
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw', '', 'icon-leading') + 'Refresh'; }
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
    const media = window.matchMedia('(max-width: 1200px)');
    if (media.addEventListener) media.addEventListener('change', function(event) {
      const toggle = byId('roleMenuToggle');
      const focusInNav = nav.contains(document.activeElement);
      setRoleMenuOpen(false, event.matches && focusInNav);
      if (!event.matches && document.activeElement === toggle) {
        const selected = nav.querySelector('.role-tab-btn.active');
        if (selected) selected.focus();
      }
    });
  }

  function showRoleTab(activeKey) {
    document.body.setAttribute('data-dashboard-theme', 'editorial');
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
      panel.classList.toggle('active', panel.getAttribute('data-role-panel') === activeKey);
    });
    document.querySelectorAll('[data-role-tab]').forEach(function(btn) {
      const selected = btn.getAttribute('data-role-tab') === activeKey;
      btn.classList.toggle('active', selected);
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

  function decide(teamId, decision) {
    const notesEl = byId('notes-' + teamId);
    const titleEl = byId('title-' + teamId);
    const card = byId('card-' + teamId);
    const notes = notesEl ? notesEl.value : '';
    const editedTitle = titleEl ? titleEl.value : '';
    if (decision === 'Rejected' && !notes.trim()) {
      setText('status-' + teamId, 'Please add a note explaining the rejection.');
      return;
    }
    setButtonsDisabled(card, true);
    setText('status-' + teamId, 'Submitting...');
    dashboardRun()
      .withSuccessHandler(function(result) {
        if (result && result.ok) {
          dashboardRun()
            .withSuccessHandler(function(html) {
              const target = byId('guideContent');
              if (target) { target.innerHTML = html; filterReviewerAssignedTeams(); }
            })
            .withFailureHandler(function(err) {
              setText('status-' + teamId, 'Refresh failed: ' + errorMessage(err));
              setButtonsDisabled(card, false);
            })
            .refreshDashboardContent();
        } else {
          setText('status-' + teamId, result && result.message ? result.message : 'Unable to submit decision.');
          setButtonsDisabled(card, false);
        }
      })
      .withFailureHandler(function(err) {
        setText('status-' + teamId, 'Error: ' + errorMessage(err));
        setButtonsDisabled(card, false);
      })
      .submitGuideDecision(teamId, decision, notes, editedTitle);
  }

  const reviewerPagination = { page:1, size:10 };
  function filterReviewerAssignedTeams(resetPage) {
    const box = byId('reviewerAssignedSearch');
    const body = byId('reviewerAssignedBody');
    if (!box || !body) return;
    const query = box.value.trim().toLowerCase();
    const rows = Array.from(body.querySelectorAll('[data-assigned-search]'));
    if (resetPage !== false) reviewerPagination.page = 1;
    const matches = rows.filter(function(row) { return row.getAttribute('data-assigned-search').includes(query); });
    const bounds = renderTeamPagination(matches.length, reviewerPagination, 'reviewerAssigned', function() { filterReviewerAssignedTeams(false); });
    rows.forEach(function(row) { row.hidden = true; });
    matches.slice(bounds.start, bounds.end).forEach(function(row) { row.hidden = false; });
    byId('reviewerAssignedEmpty').hidden = matches.length > 0;
  }

  function reviewerDecide(teamId, decision) {
    if (pendingRequests) return;
    const notesEl = byId('reviewer-notes-' + teamId);
    const notes = notesEl ? notesEl.value : '';
    const row = byId('reviewer-decision-' + teamId);
    if (decision === 'Revise' && !notes.trim()) {
      setText('reviewer-status-' + teamId, 'Note required.');
      return;
    }
    setButtonsDisabled(row, true);
    setText('reviewer-status-' + teamId, 'Submitting…');
    dashboardRun()
      .withSuccessHandler(function(result) {
        if (result && result.ok) {
          const search = byId('reviewerAssignedSearch');
          const query = search ? search.value : '';
          dashboardRun()
            .withSuccessHandler(function(html) {
              const target = byId('reviewerContent');
              if (target) { target.innerHTML = html; const box = byId('reviewerAssignedSearch'); if (box) box.value = query; filterReviewerAssignedTeams(false); }
            })
            .withFailureHandler(function(err) {
              setText('reviewer-status-' + teamId, 'Refresh failed: ' + errorMessage(err));
              setButtonsDisabled(row, false);
            })
            .refreshReviewerContentForCurrentUser();
        } else {
          setText('reviewer-status-' + teamId, result && result.message ? result.message : 'Unable to submit decision.');
          setButtonsDisabled(row, false);
        }
      })
      .withFailureHandler(function(err) {
        setText('reviewer-status-' + teamId, 'Error: ' + errorMessage(err));
        setButtonsDisabled(row, false);
      })
      .submitReviewerDecision(teamId, decision, notes);
  }

  function toggleStudentMessage(idx) {
    const shortEl = byId('stumsg-short-' + idx);
    const fullEl = byId('stumsg-full-' + idx);
    if (!shortEl || !fullEl) return;
    const showingFull = fullEl.style.display !== 'none';
    fullEl.style.display = showingFull ? 'none' : 'inline';
    shortEl.style.display = showingFull ? 'inline' : 'none';
  }

  const trackerPagination = { page:1, size:10 };

  let trackerRowsBody = null;
  let trackerRows = [];
  function getCoordinatorRows() {
    const body = byId('trackerBody');
    if (body !== trackerRowsBody) {
      trackerRowsBody = body;
      trackerRows = body ? Array.from(body.querySelectorAll('tr[data-search]')) : [];
    }
    return trackerRows;
  }

  function getCoordinatorFilteredRows() {
    const box = byId('trackerSearch');
    const q = box ? box.value.trim().toLowerCase() : '';
    const activeTab = document.querySelector('.tracker-tabs .tab.active');
    const filter = activeTab ? activeTab.getAttribute('data-filter') || 'all' : 'all';

    return getCoordinatorRows().filter(function(row) {
      const matchesSearch = row.getAttribute('data-search').includes(q);
      let matchesFilter = true;

      if (filter === 'attention') matchesFilter = row.getAttribute('data-health') === 'attention';
      else if (filter === 'ontrack') matchesFilter = row.getAttribute('data-health') === 'ontrack';
      else if (filter.indexOf('deadline:') === 0) matchesFilter = (row.getAttribute('data-deadlines') || '').split(' ').indexOf(filter.slice(9)) !== -1;

      return matchesSearch && matchesFilter;
    });
  }

  function renderTeamPagination(totalRows, state, prefix, onChange) {
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
      info.textContent = 'Showing ' + start + ' - ' + end + ' of ' + totalRows + ' teams';
    }

    const bounds = {start:start ? start - 1 : 0, end:end};
    if (!buttons) return bounds;
    buttons.innerHTML = '';

    function addButton(label, page, disabled, active) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      if (label === 'Previous') btn.innerHTML = renderLucideIcon_('chevron-left', '', 'icon-leading') + 'Previous';
      if (label === 'Next') btn.innerHTML = 'Next' + renderLucideIcon_('chevron-right', '', 'icon-trailing');
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
        dots.className = 'pagination-ellipsis';
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
        dots.className = 'pagination-ellipsis';
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
    const state = key === 'coord' ? trackerPagination : key === 'reviewer' ? reviewerPagination : null;
    if (!state) return;
    state.size = value === 'all' ? 'all' : Number(value);
    state.page = 1;
    if (key === 'coord') applyCoordinatorFilters(false);
    else filterReviewerAssignedTeams(false);
  }

  function applyCoordinatorFilters(resetPage) {
    if (resetPage !== false) trackerPagination.page = 1;
    const filteredRows = getCoordinatorFilteredRows();
    const bounds = renderTeamPagination(filteredRows.length, trackerPagination, 'tracker', function() { applyCoordinatorFilters(false); });
    const body = byId('trackerBody');
    if (body) body.replaceChildren(...filteredRows.slice(bounds.start, bounds.end));
  }

  function filterTeamTracker(btn, type) {
    document.querySelectorAll('.tracker-tabs .tab').forEach(function(tab) { tab.classList.remove('active'); });
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('data-filter', type || 'all');
    }
    applyCoordinatorFilters(true);
  }

  function filterTrackerSearch() { applyCoordinatorFilters(true); }

  function resetTrackerFilters() {
    const box = byId('trackerSearch');
    if (box) box.value = '';
    const tabs = document.querySelectorAll('.tracker-tabs .tab');
    tabs.forEach(function(tab) { tab.classList.remove('active'); });
    if (tabs.length) {
      tabs[0].classList.add('active');
      tabs[0].setAttribute('data-filter', 'all');
    }
    applyCoordinatorFilters(true);
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
            '<div class="drawer-person">' +
              '<div class="drawer-person-name">' +
                escapeDrawerHtml(student.name || 'Student') +
              '</div>' +
              '<div class="drawer-person-meta">' +
                escapeDrawerHtml(student.regNo || '') +
                (student.regNo && student.email ? ' · ' : '') +
                escapeDrawerHtml(student.email || '') +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<div class="drawer-person-meta">No student details available.</div>';

    const reviewersHtml = data.reviewers && data.reviewers.length
      ? data.reviewers.map(function(reviewer) {
          return (
            '<div class="drawer-person">' +
              '<div class="drawer-person-name">' +
                escapeDrawerHtml(reviewer.name || 'Reviewer') +
              '</div>' +
              '<div class="drawer-person-meta">' +
                escapeDrawerHtml(reviewer.email || '') +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<div class="drawer-person-meta">Committee details not available.</div>';

    const repoHtml = data.repoUrl
      ? '<a class="drawer-repo-link" href="' +
          escapeDrawerHtml(data.repoUrl) +
          '" target="_blank" rel="noopener">' +
          escapeDrawerHtml(data.repoUrl) +
        '</a>'
      : '<span class="drawer-status-warn">Pending</span>';

    const sections = [
      '<div class="drawer-section">' +
        '<div class="drawer-section-title">Project</div>' +
        '<div class="drawer-project-title">' +
          escapeDrawerHtml(data.title || '(Title not submitted)') +
        '</div>' +
        (
          data.problem
            ? '<div class="drawer-problem">' +
                renderExpandableText(data.problem) +
              '</div>'
            : ''
        ) +
      '</div>',

      '<div class="drawer-section">' +
        '<div class="drawer-section-title">Guide</div>' +
        '<div class="drawer-info-grid">' +
          '<div class="drawer-info-card">' +
            '<div class="drawer-info-label">Guide</div>' +
            '<div class="drawer-info-value">' +
              escapeDrawerHtml(data.guideName || '—') +
            '</div>' +
          '</div>' +

          '<div class="drawer-info-card">' +
            '<div class="drawer-info-label">Email</div>' +
            '<div class="drawer-info-value">' +
              escapeDrawerHtml(data.guideEmail || '—') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>',

      '<div class="drawer-section">' +
        '<div class="drawer-section-title">Students</div>' +
        studentsHtml +
      '</div>',

      '<div class="drawer-section">' +
        '<div class="drawer-section-title">' +
          'Review Committee' +
          (
            data.committeeNumber
              ? ' · ' + escapeDrawerHtml(data.committeeNumber)
              : ''
          ) +
        '</div>' +
        reviewersHtml +
      '</div>',

      '<div class="drawer-section">' +
        '<div class="drawer-section-title">Progress</div>' +

        '<div class="drawer-status-row">' +
          '<span class="drawer-status-label">Title Status</span>' +
          '<span class="drawer-status-value">' +
            escapeDrawerHtml(data.titleStatus || '—') +
          '</span>' +
        '</div>' +

        '<div class="drawer-status-row">' +
          '<span class="drawer-status-label">Guide Decision</span>' +
          '<span class="drawer-status-value">' +
            escapeDrawerHtml(data.guideDecision || '—') +
          '</span>' +
        '</div>' +

        '<div class="drawer-status-row">' +
          '<span class="drawer-status-label">Reviewer Decision</span>' +
          '<span class="drawer-status-value">' +
            escapeDrawerHtml(data.reviewerDecision || '—') +
          '</span>' +
        '</div>' +

        '<div class="drawer-status-row">' +
          '<span class="drawer-status-label">Repository</span>' +
          '<span class="drawer-status-value">' +
            escapeDrawerHtml(data.repoStatus || 'Pending') +
          '</span>' +
        '</div>' +

        (data.reviews || []).map(function(review) {
          return '<div class="drawer-status-row"><span class="drawer-status-label">' + escapeDrawerHtml(review.label) +
            '</span><span class="drawer-status-value ' + (review.completed ? 'drawer-status-good' : 'drawer-status-warn') +
            '">' + (review.available === false ? 'Unavailable' : review.completed ? 'Completed' : 'Pending') + '</span></div>';
        }).join('') +

        '<div class="drawer-status-row">' +
          '<span class="drawer-status-label">Overall Health</span>' +
          '<span class="drawer-status-value ' +
            getHealthClass(data.health) +
          '">' +
            escapeDrawerHtml(getHealthLabel(data.health)) +
          '</span>' +
        '</div>' +
      '</div>',

      '<div class="drawer-section">' +
        '<div class="drawer-section-title">This Week</div>' +

        '<div class="drawer-info-grid">' +
          '<div class="drawer-info-card">' +
            '<div class="drawer-info-label">Daily Logs</div>' +
            '<div class="drawer-info-value">' +
              escapeDrawerHtml(data.weekLogs) +
            '</div>' +
          '</div>' +

          '<div class="drawer-info-card">' +
            '<div class="drawer-info-label">GitHub Commits</div>' +
            '<div class="drawer-info-value">' +
              escapeDrawerHtml(data.weekCommits) +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>',

      '<div class="drawer-section">' +
        '<div class="drawer-section-title">Repository</div>' +
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
      return '<div id="drawerSection-' + section + '" aria-busy="true">' + labels.map(function(label) { return '<div class="drawer-section"><div class="drawer-section-title">' + label + '</div>' + renderSkeleton('panel', 'Loading ' + label) + '</div>'; }).join('') + '</div>';
    }).join('');

    drawer.classList.add('open');
    backdrop.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('team-drawer-open');

    const pending = new Set();
    function loadSection(section) {
      if (request !== coordinatorDrawerRequest || pending.has(section)) return;
      const target = byId('drawerSection-' + section);
      if (!target) return;
      pending.add(section);
      target.setAttribute('aria-busy', 'true');
      const retryButton = target.querySelector('button');
      if (retryButton) retryButton.disabled = true;
      function current() { return request === coordinatorDrawerRequest && drawer.classList.contains('open') && target === byId('drawerSection-' + section); }
      function showRetry(message) {
        const note = document.createElement('div');note.className = 'drawer-error';note.textContent = message + ' ';
        const button = document.createElement('button');button.type = 'button';button.textContent = 'Retry';
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

  function closeCoordinatorTeamDrawer() {
    coordinatorDrawerRequest++;
    const drawer = byId('teamDrawer');
    const backdrop = byId('teamDrawerBackdrop');

    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }

    if (backdrop) {
      backdrop.classList.remove('open');
    }

    document.body.classList.remove('team-drawer-open');
  }
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      closeCoordinatorTeamDrawer();
    }
  });

  function showAllCoordinatorTeams() {
    resetTrackerFilters();
    const tracker = document.querySelector('.team-tracker-section');
    if (tracker) tracker.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function initializeCoordinatorTracker() {
    if (byId('trackerBody')) applyCoordinatorFilters(true);
  }

  function markCoordinatorProgressUnavailable() {
    getCoordinatorRows().forEach(function(row) {
      row.querySelectorAll('.col-review, .col-guide-evaluation, .col-health').forEach(function(cell) { cell.innerHTML = renderLucideIcon_('triangle-alert', 'Unavailable'); });
    });
    document.querySelectorAll('#coordinatorStats .stat-card-teal .stat-num, #coordinatorStats .stat-card-red .stat-num').forEach(function(el) { el.textContent = 'Unavailable'; });
    document.querySelectorAll('.tracker-tabs button:disabled').forEach(function(el) { el.textContent = el.getAttribute('data-filter') === 'attention' ? 'Attention (Unavailable)' : 'On Track (Unavailable)'; });
  }

  // Application CSS is inline in the document head. Wait for web fonts as well
  // before revealing complete cards; the tracker intentionally stays progressive.
  function revealCoordinatorCards() {
    const state = coordinatorSectionState;
    if (!state || !state.fontsReady || state.root !== byId('coordinatorAsyncRoot')) return;
    const ready = {
      coordinatorStats:state.overviewSettled || state.progressSettled
    };
    Object.keys(ready).forEach(function(id) {
      const card = byId(id);
      if (card && ready[id] && (id === 'coordinatorCommitteeCard' || card.getAttribute('aria-busy') !== 'true')) {
        card.hidden = false;
        const placeholder = byId(id + 'Placeholder');
        if (placeholder) placeholder.hidden = true;
      }
    });
  }

  let coordinatorSectionState = null;
  function initializeCoordinatorAsync() {
    coordinatorSectionState = {root:byId('coordinatorAsyncRoot'), pending:{}, progressReady:false, fontsReady:!document.fonts};
    const state = coordinatorSectionState;
    if (document.fonts) document.fonts.ready.then(function() {
      if (state !== coordinatorSectionState) return;
      state.fontsReady = true;revealCoordinatorCards();
    });
    coordinatorActivityResult = null;
    loadCoordinatorSectionAsync('overview');
    loadCoordinatorSectionAsync('progress');
    loadCoordinatorWeeklyActivity();
  }

  function loadCoordinatorSectionAsync(section) {
    const state = coordinatorSectionState;
    if (!state || !state.root || state.pending[section] || (section !== 'overview' && section !== 'progress')) return;
    state.pending[section] = true;
    const started = Date.now();
    const status = byId(section === 'overview' ? 'coordinatorOverviewStatus' : 'coordinatorProgressStatus');
    if (status) status.textContent = '';
    function current() { return state === coordinatorSectionState && state.root === byId('coordinatorAsyncRoot'); }
    function retry(message) {
      if (!status) return;
      status.textContent = message + ' ';
      const button = document.createElement('button');
      button.type = 'button';button.textContent = 'Retry';
      button.addEventListener('click', function() { loadCoordinatorSectionAsync(section); });
      status.appendChild(button);
    }
    dashboardRun().withSuccessHandler(function(result) {
      if (!current()) return;
      if (Array.isArray(result.timings)) result.timings.forEach(function(timing) {
        recordPerformance({event:'server_phase', section:section, phase:timing.phase, durationMs:timing.durationMs, calls:timing.calls, ok:timing.success});
      });
      state.pending[section] = false;
      state[section + "Settled"] = true;
      state[section + "Succeeded"] = true;
      if (state.overviewSucceeded && state.progressSucceeded) setText('coordUpdated', updatedLabel());
      const search = byId('trackerSearch');
      const searchText = search ? search.value : '';
      const selected = document.querySelector('.tracker-tabs .tab.active');
      const filter = selected ? selected.getAttribute('data-filter') : 'all';
      if (section === 'progress') { state.progressReady = true;state.progressFailed = false; }
      Object.keys(result.panels).forEach(function(id) {
        // A slower overview must never replace completed assessment results.
        if (section === 'overview' && state.progressReady && (id === 'coordinatorStats' || id === 'coordinatorTracker')) return;
        const target = byId(id);
        if (target) { target.innerHTML = result.panels[id];target.setAttribute('aria-busy', 'false'); }
      });
      if (byId('trackerSearch')) byId('trackerSearch').value = searchText;
      const tabs = Array.from(document.querySelectorAll('.tracker-tabs .tab'));
      const restoredFilter = tabs.some(tab => tab.getAttribute('data-filter') === filter && !tab.disabled) ? filter : 'all';
      tabs.forEach(function(tab) { tab.classList.toggle('active', tab.getAttribute('data-filter') === restoredFilter); });
      applyCoordinatorFilters(false);
      renderCoordinatorActivity();
      if (state.progressFailed) markCoordinatorProgressUnavailable();
      revealCoordinatorCards();
      if (status) status.textContent = '';
      if (result.partial) retry('Some assessment data is unavailable. Counts are partial; unavailable reviews are excluded from overdue alerts.');
      console.log(JSON.stringify({event:'coordinator_section_render', section, durationMs:Date.now() - started}));
    }).withFailureHandler(function(err) {
      if (!current()) return;
      state.pending[section] = false;
      state[section + "Settled"] = true;
      state[section + "Succeeded"] = true;
      if (state.overviewSucceeded && state.progressSucceeded) setText('coordUpdated', updatedLabel());
      if (section === 'progress' && !state.progressReady) { state.progressFailed = true;markCoordinatorProgressUnavailable(); }
      const ids = [];
      ids.forEach(function(id) {
        const target = byId(id);
        if (target && target.getAttribute('aria-busy') === 'true') {
          target.textContent = 'Unavailable';target.setAttribute('aria-busy', 'false');
        }
      });
      if (!state.pending.overview && !state.pending.progress) {
        ['coordinatorStats','coordinatorTracker'].forEach(function(id) { const el=byId(id);if(el && el.getAttribute('aria-busy') === 'true') { el.textContent='Unavailable';el.setAttribute('aria-busy','false'); } });
      }
      revealCoordinatorCards();
      retry('Unable to load ' + section + ': ' + errorMessage(err));
    }).loadCoordinatorSection(section);
  }

  let coordinatorActivityResult = null;
  function renderCoordinatorActivity() {
    const result = coordinatorActivityResult;
    if (!result) return;
    const body = byId('trackerBody');
      const label = result.state === 'active' ? 'Logs / commit records this week' : result.state === 'not-started' ? 'Weekly logging has not started' : result.state === 'ended' ? 'Weekly logging has ended' : 'Activity unavailable: check project dates';
      if (body) getCoordinatorRows().forEach(function(row) {
        const item = result.teams[row.getAttribute('data-team-id').trim().toLowerCase()];
        const cell = row.querySelector('.col-activity');
        if (cell) { cell.textContent = item && result.state === 'active' ? item.logs + '/' + item.commits : '—'; cell.title = label; }
      });
      setText('coordinatorActiveTeams', result.activeTeams === null ? '—' : result.activeTeams);
      const activeValue = byId('coordinatorActiveTeams');
      const activeCard = activeValue && activeValue.closest ? activeValue.closest('.stat-card') : null;
      if (activeCard) {
        const remaining = result.totalTeams - result.activeTeams;
        const tone = result.activeTeams === null || !result.totalTeams || result.state !== 'active' ? 'neutral' : remaining <= 0 ? 'complete' : remaining / result.totalTeams >= .6 ? 'danger' : remaining / result.totalTeams >= .3 ? 'warning' : 'neutral';
        activeCard.setAttribute('data-completion-tone', tone);
      }
      setText('coordinatorActiveTeamsPct', result.activeTeams === null ? label : '(' + (result.totalTeams ? Math.round(result.activeTeams / result.totalTeams * 100) : 0) + '%)');
      setText('weeklyActivityStatus', label + ' · Updated ' + new Date(result.checkedAt).toLocaleString());
      if (byId('weeklyActivityRetry')) byId('weeklyActivityRetry').hidden = result.state !== 'unavailable';
      revealCoordinatorCards();
  }

  let activityRequestPending = false;
  function loadCoordinatorWeeklyActivity() {
    if (activityRequestPending) return;
    const root = byId('coordinatorAsyncRoot');
    if (!root) return;
    activityRequestPending = true;
    if (byId('weeklyActivityRetry')) byId('weeklyActivityRetry').hidden = true;
    setLoading('weeklyActivityStatus', 'Loading weekly activity');
    dashboardRun().withSuccessHandler(function(result) {
      activityRequestPending = false;
      if (root !== byId('coordinatorAsyncRoot')) return;
      coordinatorActivityResult = result;
      renderCoordinatorActivity();
    }).withFailureHandler(function(err) {
      activityRequestPending = false;
      if (root !== byId('coordinatorAsyncRoot')) return;
      const body = byId('trackerBody');
      if (body) getCoordinatorRows().forEach(function(row) { const cell = row.querySelector('.col-activity'); if (cell) { cell.textContent = '—'; cell.title = 'Activity unavailable'; } });
      setText('coordinatorActiveTeams', '—');setText('coordinatorActiveTeamsPct', 'Unavailable');
      setText('weeklyActivityStatus', 'Unable to load weekly activity: ' + errorMessage(err));
      if (byId('weeklyActivityRetry')) byId('weeklyActivityRetry').hidden = false;
      coordinatorActivityResult = {state:'unavailable', teams:{}, activeTeams:null, checkedAt:new Date().toISOString()};
      revealCoordinatorCards();
    }).loadAllTeamsWeeklyActivity();
  }

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
      if (coordinatorSectionState) coordinatorSectionState.configurationSettled = true;
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
    dashboardRun().withSuccessHandler(function(report) { finish(report, null);revealCoordinatorCards(); })
      .withFailureHandler(function(err) { finish(null, 'Unable to check configuration: ' + errorMessage(err) + '. Try Recheck.');revealCoordinatorCards(); })
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
    const btn = document.querySelector('.run-sync-btn');

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

  const weeklyFields = [
    ['workCompleted','Work Completed','Summarize what you finished and the outcome.','E.g. Built the sensor prototype and tested its readings.'],
    ['guideDiscussion','Guide Discussion/Decision','Note your guide discussion and any agreed decisions.','E.g. Agreed to compare two designs before choosing one.'],
    ['blockers','Problems/Blockers','Describe what is blocking progress or where you need help.','E.g. Waiting for a component; write None if there are no blockers.'],
    ['nextAction','Next Week Plan','List the concrete tasks you plan to complete next.','E.g. Run three trials, compare results and update the design.'],
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
    const window = JSON.parse(host.dataset.weeklyWindows || '[]').find(w=>w.weekId === action.weekId);
    const label = weeklyWeekLabel(action.weekId);
    if (!window) return label;
    const shortDate = value => new Date(value).toLocaleDateString('en-GB',{timeZone:host.weeklyData.timezone,day:'numeric',month:'short'}).replace('Sept','Sep');
    return label + weeklySeparator + shortDate(window.opens) + ' ' + String.fromCharCode(8211) + ' ' + shortDate(window.closes);
  }
  function updateWeeklyFormPresentation(host, form, action, saved) {
    const data = host.weeklyData, esc = escapeClientHtml;
    const latest = saved || data.history.filter(r=>r.weekId === action.weekId && r.entryStatus !== 'MISSED').slice(-1)[0];
    const labels = latest ? [latest.entryStatus] : [action.overdue || Date.now() > Date.parse(action.deadline) ? 'LATE' : 'OPEN'];
    if (latest && latest.timeliness === 'LATE') labels.push('LATE');
    form.querySelector('[data-weekly-heading]').textContent = weeklyHeading(host,action);
    form.querySelector('[data-weekly-dates]').textContent = 'Due: ' + weeklyDate(action.deadline,data.timezone) + weeklySeparator + 'Late submission until: ' + weeklyDate(action.cutoff,data.timezone);
    form.querySelector('[data-weekly-state]').innerHTML = labels.map(label=>'<span class="weekly-state" data-state="' + esc(label) + '">' + esc(label) + '</span>').join('');
    form.querySelector('[type="submit"]').textContent = (latest ? 'Update ' : 'Submit ') + weeklyWeekLabel(action.weekId) + ' Progress';
  }
  function renderWeeklyGithub(host, weekId) {
    let panel = host.querySelector('[data-weekly-github]');
    if (!panel) {
      panel = document.createElement('section'); panel.setAttribute('data-weekly-github','');
      panel.className = 'weekly-github-activity'; host.appendChild(panel);
    }
    const form = host.querySelector('form');
    if (form) form.insertBefore(panel, form.querySelector('[type="submit"]'));
    const data = host.weeklyData, evidence = (data.evidence || []).find(item=>item.weekId === weekId), esc = escapeClientHtml;
    if (!weekId) { panel.hidden = true; return; }
    panel.hidden = false;
    let body = '<p>GitHub activity is unavailable. Use Refresh weekly progress to retry.</p>';
    if (evidence && evidence.state === 'unmapped') body = '<p>Your GitHub username mapping is unavailable or unverified.</p>';
    if (evidence && evidence.state === 'available') {
      body = '<p>' + evidence.count + ' commits this week</p>' + (evidence.count ? '<ul>' + evidence.commits.map(commit=>
        '<li><time datetime="' + esc(commit.timestamp) + '">' + esc(weeklyDate(commit.timestamp,data.timezone)) + '</time><span>' + esc(commit.message) + '</span><a href="' + esc(commit.url) + '" target="_blank" rel="noopener noreferrer">' + esc(commit.shortSha) + '</a></li>').join('') + '</ul>' : '<p>No GitHub activity recorded for you this week</p>');
    }
    panel.innerHTML = '<h4>Your GitHub activity this week' + weeklySeparator + esc(weeklyWeekLabel(weekId)) + '</h4><p class="weekly-helper">GitHub Supporting Evidence · System-observed project artifacts</p>' + body;
  }
  function loadWeeklyProgress() {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const target = host.querySelector('[data-weekly-read]'), status = host.querySelector('[data-weekly-status]');
    const button = host.querySelector('[data-weekly-refresh]');
    host.weeklyBusy = true; button.disabled = true;
    const finish = beginContentLoading(host,'Refreshing weekly progress',{compact:true});
    function settle() { finish(); host.weeklyBusy = false; button.disabled = false; }
    dashboardRun().withSuccessHandler(function(data) {
      settle();
      if (!host.isConnected || byId('studentWeeklyProgress') !== host) return;
      if (host.weeklyRefreshError) {
        if (status.textContent === host.weeklyRefreshError) status.textContent = '';
        host.weeklyRefreshError = null;
      }
      host.weeklyData = data;
      const esc = escapeClientHtml;
      target.innerHTML = '<p>' + esc(data.message) + '</p><p>Expected weeks: ' + data.summary.expectedWeeks + ' &middot; Missing: ' + data.summary.missing + '</p>' +
        data.actions.map(function(action) { return '<button type="button" class="workflow-btn secondary" data-week="' + esc(action.weekId) + '" onclick="DashboardUI.chooseWeeklyAction(this)">' +
          (action.overdue ? 'Overdue: ' : '') + esc(weeklyHeading(host,action)) + '</button>'; }).join(' ') +
        '<details><summary>Submission history (' + data.history.length + ')</summary>' + data.history.slice().reverse().map(function(entry) {
          return '<details><summary>' + esc(weeklyWeekLabel(entry.weekId) + weeklySeparator + entry.entryStatus + weeklySeparator + entry.timeliness + weeklySeparator + weeklyDate(entry.recordedAt,data.timezone)) + '</summary>' +
            '<p>First submitted: ' + esc(weeklyDate(entry.firstSubmittedAt,data.timezone)) + '</p>' + weeklyFields.map(function(field) {
              return '<p><strong>' + esc(field[1]) + '</strong></p><p style="white-space:pre-wrap">' + esc(entry[field[0]] || '') + '</p>';
            }).join('') + '</details>';
        }).join('') + '</details>';
      const formContainer = host.querySelector('[data-weekly-form]');
      formContainer.hidden = !data.ready;
      const form = host.querySelector('form');
      if (form) {
        const stillAllowed = data.ready && data.actions.some(a=>a.weekId === form.dataset.week && String(a.overdue) === form.dataset.overdue);
        Array.from(form.elements).forEach(el=>{el.disabled = !stillAllowed;});
        const action = data.actions.find(a=>a.weekId === form.dataset.week);
        if (action) updateWeeklyFormPresentation(host,form,action);
        if (!stillAllowed) status.textContent = 'This action is no longer available. Your unsaved text is retained. Choose an available week to continue.';
      } else {
        const normal = data.actions.find(a=>!a.overdue);
        if (data.ready && normal) renderWeeklyForm(host,normal);
      }
      renderWeeklyGithub(host,(host.querySelector('form') || {}).dataset?.week || (data.evidence || []).slice(-1)[0]?.weekId);
    }).withFailureHandler(function(error) {
      settle();
      if (host.isConnected && byId('studentWeeklyProgress') === host) {
        host.weeklyRefreshError = 'Could not refresh weekly progress: ' + errorMessage(error) + '. Use Refresh weekly progress to retry.';
        status.textContent = host.weeklyRefreshError;
      }
    }).loadStudentWeeklyProgress();
  }
  function renderWeeklyForm(host, action) {
    if (!host.weeklyData.ready) return;
    const data = host.weeklyData, esc = escapeClientHtml;
    const latest = data.history.filter(r=>r.weekId === action.weekId && r.entryStatus !== 'MISSED').slice(-1)[0] || {};
    host.querySelector('[data-weekly-form]').innerHTML = '<form class="weekly-progress-form" data-week="' + esc(action.weekId) + '" data-overdue="' + action.overdue + '" onsubmit="DashboardUI.submitWeeklyProgress(event,this)">' +
      '<header class="weekly-form-header"><h4 data-weekly-heading></h4><div class="weekly-status-strip" data-weekly-state role="status" aria-label="Submission status"></div><p class="weekly-dates" data-weekly-dates></p></header>' +
      weeklyFields.map(function(field) { return '<div class="weekly-field"><label for="weekly-' + field[0] + '">' + esc(field[1]) + '</label><p class="weekly-helper" id="weekly-help-' + field[0] + '">' + esc(field[2]) + '</p><textarea id="weekly-' + field[0] + '" name="' + field[0] + '" rows="3" required maxlength="10000" aria-describedby="weekly-help-' + field[0] + '" placeholder="' + esc(field[3]) + '">' + esc(latest[field[0]] || '') + '</textarea></div>'; }).join('') +
      '<button type="submit" class="workflow-btn"></button></form>';
    updateWeeklyFormPresentation(host,host.querySelector('form'),action);
    renderWeeklyGithub(host,action.weekId);
    host.querySelector('form').addEventListener('input',function() { this.weeklyDirty = true; });
  }
  async function chooseWeeklyAction(button) {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const action = host.weeklyData.actions.find(a=>a.weekId === button.dataset.week);
    if (!action) return;
    const form = host.querySelector('form');
    if (form && form.dataset.week === action.weekId && form.dataset.overdue === String(action.overdue)) return;
    if (form && form.weeklyDirty && !await dialogs.ask('Discard unsaved weekly text and open the selected week?')) return;
    if (!host.isConnected || host.weeklySaving) return;
    renderWeeklyForm(host,action);
  }
  function submitWeeklyProgress(event, form) {
    event.preventDefault();
    const host = form.closest('#studentWeeklyProgress');
    if (host.weeklySaving || host.weeklyBusy || !form.reportValidity()) return;
    const input = {};
    weeklyFields.forEach(field=>{input[field[0]] = form.elements[field[0]].value;});
    if (form.dataset.overdue === 'true') input.overdueWeekId = form.dataset.week;
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
      const action = host.weeklyData.actions.find(a=>a.weekId === result.weekId);
      if (action) updateWeeklyFormPresentation(host,form,action,result);
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

  function markGithubUsernameSaved(form) {
    form.hidden = true;
    const card = form.closest('.step-card');
    if (!card) return;
    const body = card.querySelector('.step-body');
    const badge = card.querySelector('.step-badge');
    if (body) {
      const text = body.querySelector('p');
      if (text) text.innerHTML = 'Your valid GitHub username is saved. ' + renderSkeleton('inline', 'Checking the latest team status');
      body.querySelectorAll('.step-detail').forEach(function(detail) { detail.hidden = true; });
    }
    if (badge) { badge.textContent = 'Waiting'; badge.classList.remove('active', 'done'); badge.classList.add('waiting'); }
    card.classList.remove('step-card-active', 'step-card-done');
    card.classList.add('step-card-waiting');
    const statusButton = byId('githubStatusRefresh');
    if (statusButton) statusButton.hidden = false;
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

  function submitGithubUsername(event, form) {
    event.preventDefault();
    const input = form.elements.username;
    if (input.disabled || !form.reportValidity()) return;
    input.disabled = true;
    setButtonsDisabled(form, true);
    setLoading('githubSubmitStatus', 'Checking your GitHub username');
    function retry(message) {
      input.disabled = false;
      setButtonsDisabled(form, false);
      setText('githubSubmitStatus', message);
      input.focus();
    }
    function refresh(message) {
      refreshGithubStatus(null, message);
    }
    dashboardRun().withSuccessHandler(function(result) {
      if (result.alreadySubmitted) {
        markGithubUsernameSaved(form);
        refresh(result.message);
        return;
      }
      if (!result.ok) { retry(result.message); return; }
      markGithubUsernameSaved(form);
      setLoading('githubSubmitStatus', result.message + ' Checking repository setup');
      dashboardRun().withSuccessHandler(function(setup) {
        refresh(setup.message || '');
      }).withFailureHandler(function(err) {
        refresh('Your valid username is saved. Repository setup failed: ' + errorMessage(err));
      }).completeStudentGithubSetup();
    }).withFailureHandler(function(err) { retry(errorMessage(err)); }).submitStudentGithubUsername(input.value);
  }

  return {
    notify: dialogs.notify, ask: dialogs.ask, requestText: dialogs.requestText,
    loadWeeklyProgress, chooseWeeklyAction, submitWeeklyProgress,
    refreshGithubStatus,
    retryGithubSetup,
    submitGithubUsername,
    renderAssessmentHistory: renderAssessmentHistory,
    renderSkeleton: renderSkeleton,
    beginContentLoading: beginContentLoading,
    guideRun: dashboardRun,
    refreshRoleDashboard,
    refreshSystemStatus: function() { ensureSystemStatusLoaded(true); },
    initializeCoordinatorAsync,
    loadCoordinatorSectionAsync,
    loadSharedTimeline,
    loadSharedRubrics,
    openRubricDrawer,
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
    decide,
    openReviewerMarks: function(team, review, button) { ReviewEvaluations.open(team, review, button); },
    filterReviewerAssignedTeams,
    changeTeamPageSize,
    reviewerDecide,
    toggleStudentMessage,
    filterTeamTracker,
    filterTrackerSearch,
    resetTrackerFilters,
    focusCoordinatorTeam,
    closeCoordinatorTeamDrawer,
    showAllCoordinatorTeams,
    runGithubSync,
    loadCoordinatorWeeklyActivity,
    initializeAssessmentStorage,
    recheckCommitteeConfiguration,
    bootstrapAssessmentDefinitions,
    recheckReviewConfiguration,
    initializeCoordinatorTracker
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
function decide(teamId, decision) { DashboardUI.decide(teamId, decision); }
function reviewerDecide(teamId, decision) { DashboardUI.reviewerDecide(teamId, decision); }
function toggleStudentMessage(idx) { DashboardUI.toggleStudentMessage(idx); }
function filterTeamTracker(btn, type) { DashboardUI.filterTeamTracker(btn, type); }
function filterTrackerSearch() { DashboardUI.filterTrackerSearch(); }
function resetTrackerFilters() { DashboardUI.resetTrackerFilters(); }
function focusCoordinatorTeam(teamId) { DashboardUI.focusCoordinatorTeam(teamId); }
function showAllCoordinatorTeams() { DashboardUI.showAllCoordinatorTeams(); }
function runGithubSync() { DashboardUI.runGithubSync(); }
function loadCoordinatorWeeklyActivity() { DashboardUI.loadCoordinatorWeeklyActivity(); }
function retryCoordinatorSection(section) { DashboardUI.loadCoordinatorSectionAsync(section); }
function initializeAssessmentStorage() { DashboardUI.initializeAssessmentStorage(); }
function recheckReviewConfiguration() { DashboardUI.recheckReviewConfiguration(); }
function closeCoordinatorTeamDrawer() {
  DashboardUI.closeCoordinatorTeamDrawer();
}

function initializeFirstRoleTab() {
  DashboardUI.initializeRoleMenu();
  const activePanel = document.querySelector('[data-role-panel].active');
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
