/**
 * DASHBOARD CLIENT SCRIPTS
 *
 * Single source of truth for browser-side behaviour used by both
 * single-role and multi-role dashboards.
 */
function getDashboardClientScript() {
  return `
const DashboardUI = (function() {
  'use strict';
  const renderSkeleton = ${getSkeletonMarkup_.toString()};
  ${getLucideIconNodes_.toString()}
  ${renderLucideIcon_.toString()}
  ${initializeDashboardTooltips_.toString()}
  initializeDashboardTooltips_();

  function byId(id) { return document.getElementById(id); }
  function setLoading(id, label) { const el = byId(id); if (el) el.innerHTML = renderSkeleton('inline', label); }
  function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
  function setButtonsDisabled(container, disabled) {
    if (!container) return;
    container.querySelectorAll('button').forEach(function(btn) { btn.disabled = disabled; });
  }
  function errorMessage(err) { return err && err.message ? err.message : 'Unknown error'; }

  // Session-only diagnostics: no user records or extra telemetry requests.
  const performanceEvents = [];
  let pendingRequests = 0;
  let preloadTimer = null;
  let activeRole = null;
  let tabSelectedAt = 0;
  let preloadCandidate = null;
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
    const systemPending = byId('systemStatusContent') && !systemStatusState.attempted && Object.keys(loadedRoleTabs).length > 0;
    if (pendingRequests || (!preloadCandidate && !systemPending) || document.hidden || !window.DashboardPerformance.preloading) return;
    preloadTimer = setTimeout(function() {
      if (pendingRequests || document.hidden || !window.DashboardPerformance.preloading) return;
      if (byId('systemStatusContent') && !systemStatusState.attempted) { ensureSystemStatusLoaded(); return; }
      const key = preloadCandidate;
      preloadCandidate = null;
      if (!key || loadedRoleTabs[key] || loadingRoleTabs[key]) return;
      preloadedRoles[key] = true;
      recordPerformance({event:'preload_started', role:key});
      loadRoleContent(key, true);
    }, 750);
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
          pendingRequests++;
          clearTimeout(preloadTimer);
          let finished = false;
          function finish(ok, callback, args) {
            if (finished) return;
            finished = true;
            try { if (callback) callback.apply(null, args); }
            finally {
              pendingRequests--;
              recordPerformance({event:'request', method:String(method), ok:ok, durationMs:performance.now() - started});
              schedulePreload();
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
    if (key === 'student') { loadStudentMarksAsync(); GuideEvaluation.student(); }
  }

  let sharedSchedule = null;
  let timelineRequest = null;

  function renderSharedTimeline(data, target) {
    const phase = data.active ? 'Week ' + data.week + ' of ' + data.totalWeeks
      : data.today < data.schedule.week1 ? 'Weekly logging starts ' + data.milestones.find(function(m) { return m.key === 'week1'; }).date
      : 'Weekly logging ended';
    const next = data.milestones.findIndex(function(m) { return m.day >= data.today; });
    target.innerHTML = '<div class="timeline-heading"><div class="timeline-title-group"><span class="timeline-eyebrow">CAPSTONE JOURNEY</span><h2>Project timeline</h2><p class="timeline-note">Your semester, milestone by milestone</p></div>' +
      '<div class="timeline-meta"><span class="timeline-today">Today · ' + escapeClientHtml(data.todayLabel) + '</span><span class="timeline-week">' + escapeClientHtml(phase) + '</span></div></div>' +
      '<div class="timeline-scroll" role="region" aria-label="Project milestones, scroll horizontally to see all dates" tabindex="0"><ol class="timeline-track" style="--timeline-stops:' + data.milestones.length + '">' + data.milestones.map(function(m, index) {
        const state = m.day < data.today ? 'past' : m.day === data.today ? 'today' : index === next ? 'next' : 'future';
        const label = state === 'past' ? 'Date passed' : state === 'today' ? 'Today' : state === 'next' ? 'Up next' : 'Scheduled';
        return '<li class="timeline-stop timeline-' + state + '"><span class="timeline-dot" aria-hidden="true"></span><strong>' + escapeClientHtml(m.label) + '</strong><span class="timeline-date">' + escapeClientHtml(m.date) + '</span><span class="timeline-state">' + label + '</span></li>';
      }).join('') + '</ol></div><p class="timeline-scroll-hint" hidden>Scroll Horizontally to see all dates ' + renderLucideIcon_('arrow-left-right') + '</p>';
    const scroll = target.querySelector('.timeline-scroll');
    const hint = target.querySelector('.timeline-scroll-hint');
    function updateScrollHint() {
      hint.hidden = scroll.scrollWidth - scroll.clientWidth <= 1;
    }
    if (target.timelineResizeObserver) target.timelineResizeObserver.disconnect();
    target.timelineResizeObserver = new ResizeObserver(updateScrollHint);
    target.timelineResizeObserver.observe(scroll);
    target.timelineResizeObserver.observe(scroll.querySelector('.timeline-track'));
    updateScrollHint();
  }

  function loadSharedTimeline() {
    if (sharedSchedule) return Promise.resolve(sharedSchedule);
    if (timelineRequest) return timelineRequest;
    const target = byId('sharedProjectTimeline');
    if (target) target.setAttribute('aria-busy', 'true');
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
  function loadSharedRubrics() {
    if (rubricsRequest) return rubricsRequest;
    const target = byId('sharedRubrics');
    if (!target) return Promise.resolve(null);
    target.setAttribute('aria-busy', 'true');
    target.innerHTML = '<h2 id="sharedRubricsHeading">Assessment rubrics</h2>' + renderSkeleton('panel', 'Loading assessment rubrics');
    rubricsRequest = new Promise(function(resolve, reject) {
      dashboardRun().withSuccessHandler(function(data) {
        try {
          target.innerHTML = '<h2 id="sharedRubricsHeading">Assessment rubrics</h2><div class="rubric-assessments">' + data.assessments.map(function(item) {
            return '<button type="button" class="rubric-assessment" data-rubric-key="' + escapeClientHtml(item.key) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '><strong>' + escapeClientHtml(item.label) + '</strong><span class="rubric-weight">' + escapeClientHtml(item.weight) + '% contribution</span><span>' + (item.available ? escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks' : escapeClientHtml(item.status)) + '</span></button>';
          }).join('') + '</div>' + (data.assessments.length ? '' : '<p>No graded assessments configured.</p>');
          sharedRubrics = data;
          target.querySelectorAll('[data-rubric-key]').forEach(function(button) {
            button.addEventListener('click', function() { openRubricDrawer(button.getAttribute('data-rubric-key'), button); });
          });
          target.setAttribute('aria-busy', 'false');
          resolve(data);
        } catch (err) { reject(err); }
      }).withFailureHandler(reject).loadSharedRubrics();
    }).catch(function(err) {
      rubricsRequest = null;
      target.setAttribute('aria-busy', 'false');
      target.innerHTML = '<h2 id="sharedRubricsHeading">Assessment rubrics</h2><p role="status">Unable to load rubrics.</p><button type="button">Retry</button>';
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
    byId('rubricDrawerContent').innerHTML = '<div class="drawer-section"><div class="drawer-section-title">Assessment contribution</div><div class="drawer-project-title">' + escapeClientHtml(item.weight) + '% of overall assessment</div><p class="drawer-person-meta">' + escapeClientHtml(item.criterionCount) + ' criteria · ' + escapeClientHtml(item.totalMarks) + ' marks</p></div>' + item.criteria.map(function(c) {
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
    const refreshButton = byId(activeKey + 'Refresh');
    if (refreshButton) { refreshButton.disabled = true; refreshButton.innerHTML = renderSkeleton('inline', 'Refreshing'); }
    setText(activeKey + 'RefreshStatus', '');
    loadingRoleTabs[activeKey] = true;
    const requestStarted = Date.now();

    dashboardRun()
      .withSuccessHandler(function(html) {
        target.innerHTML = html;
        if (onLoaded) onLoaded();
        if (refresh) activatedRoles[activeKey] = false;
        if (activeKey === 'coord') console.log(JSON.stringify({event:'coordinator_core_render', durationMs:Date.now() - requestStarted, htmlCharacters:html.length}));
        loadedRoleTabs[activeKey] = true;
        loadingRoleTabs[activeKey] = false;

        recordPerformance({event:'role_core_render', role:activeKey, background:!!background, durationMs:Date.now() - requestStarted});
        if (activeRole === activeKey) {
          recordPerformance({event:'tab_core_ready', role:activeKey, durationMs:performance.now() - tabSelectedAt});
          activateRole(activeKey);
        }

        // Preload the common Announcements tab only after the first role dashboard
        // has finished. If the user clicked Announcements earlier, this is a no-op.
        ensureAnnouncementsLoaded();
      })
      .withFailureHandler(function(err) {
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

  function loadStudentMarksAsync() {
    const marksTarget = byId('studentMarksAsync');
    if (!marksTarget) return;

    dashboardRun()
      .withSuccessHandler(function(html) {
        marksTarget.innerHTML = html;
      })
      .withFailureHandler(function(err) {
        marksTarget.innerHTML = '<h3>Your Marks</h3><div class="marks-row"><span>Review marks</span><span class="marks-pending">Unable to load: ' +
          escapeClientHtml(errorMessage(err)) + '</span></div>';
      })
      .loadStudentMarksSection();
  }

  const announcementsState = { loading: false, loaded: false, query: '', page: 1, pageSize: 10 };

  function initializeAnnouncementSearch(target) {
    const search = target.querySelector('#announcementSearch');
    if (!search) return;
    const items = Array.from(target.querySelectorAll('.announcement-list > .announcement-item'));
    const indexed = items.map(function(item) {
      const content = item.querySelector('.announcement-message, .announcement-details p');
      const date = item.querySelector('.announcement-date');
      const audience = item.querySelector('.announcement-audience');
      return { item: item, text: [content, date, audience].map(function(el) { return el ? el.textContent : ''; }).join(' ').toLocaleLowerCase() };
    });
    const previous = target.querySelector('[data-announcement-prev]');
    const next = target.querySelector('[data-announcement-next]');
    function render() {
      const query = announcementsState.query.trim().toLocaleLowerCase();
      const matches = indexed.filter(function(entry) { return entry.text.includes(query); });
      const pages = Math.max(1, Math.ceil(matches.length / announcementsState.pageSize));
      announcementsState.page = Math.min(Math.max(1, announcementsState.page), pages);
      const start = (announcementsState.page - 1) * announcementsState.pageSize;
      items.forEach(function(item) { item.hidden = true; });
      matches.slice(start, start + announcementsState.pageSize).forEach(function(entry) { entry.item.hidden = false; });
      target.querySelector('.announcement-results').textContent = matches.length
        ? 'Showing ' + (start + 1) + '–' + Math.min(start + announcementsState.pageSize, matches.length) + ' of ' + matches.length + (query ? ' matching announcements' : ' announcements')
        : '0 matching announcements';
      target.querySelector('.announcement-no-results').hidden = matches.length > 0;
      target.querySelector('[data-announcement-page]').textContent = 'Page ' + announcementsState.page + ' of ' + pages;
      previous.disabled = announcementsState.page <= 1;
      next.disabled = announcementsState.page >= pages;
      target.querySelector('.announcement-pagination').hidden = matches.length === 0;
    }
    search.value = announcementsState.query;
    search.addEventListener('input', function() {
      announcementsState.query = search.value;
      announcementsState.page = 1;
      render();
    });
    target.querySelector('[data-announcement-clear]').addEventListener('click', function() {
      announcementsState.query = '';
      announcementsState.page = 1;
      search.value = '';
      render();
      search.focus();
    });
    previous.addEventListener('click', function() { announcementsState.page--; render(); });
    next.addEventListener('click', function() { announcementsState.page++; render(); });
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
    const refreshButton = target.querySelector('.announcement-refresh-btn');
    const status = target.querySelector('.announcement-status');
    if (refreshButton) { refreshButton.disabled = true; refreshButton.innerHTML = renderSkeleton('inline', 'Refreshing'); }
    if (status) status.innerHTML = renderSkeleton('inline', 'Checking for updates');
    target.setAttribute('aria-busy', 'true');

    dashboardRun()
      .withSuccessHandler(function(html) {
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
    const buttons = Array.from(target.querySelectorAll('button')).map(function(el) { return {el:el, disabled:el.disabled}; });
    buttons.forEach(function(item) { item.el.disabled = true; });
    target.setAttribute('aria-busy', 'true');
    setLoading('systemStatusMessage', 'Loading system status');
    dashboardRun().withSuccessHandler(function(html) {
      target.innerHTML = html;
      systemStatusState.loading = false;
      systemStatusState.loaded = true;
      target.setAttribute('aria-busy', 'false');
      if (button) { button.disabled = false; button.innerHTML = renderLucideIcon_('refresh-cw', '', 'icon-leading') + 'Refresh'; }
      setText('systemStatusMessage', '');
      setText('systemStatusUpdated', updatedLabel());
      reviewConfigurationValid = false;
      recheckReviewConfiguration();
      GuideEvaluation.admin();
    }).withFailureHandler(function(err) {
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
    const media = window.matchMedia('(max-width: 760px)');
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
    activeRole = activeKey;
    tabSelectedAt = performance.now();
    recordPerformance({event:'tab_selected', role:activeKey, cached:!!loadedRoleTabs[activeKey], prefetched:!!preloadedRoles[activeKey]});
    const keys = Array.from(document.querySelectorAll('[data-role-content]')).map(function(el) { return el.getAttribute('data-role-content'); });
    const index = keys.indexOf(activeKey);
    preloadCandidate = index >= 0 ? keys.slice(index + 1).find(function(key) { return !loadedRoleTabs[key] && !loadingRoleTabs[key]; }) || null : null;
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
    if (activeKey === 'system-status') {
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
                escapeDrawerHtml(data.problem) +
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

  let reviewConfigurationValid = false;
  let checkingReviewConfiguration = false;
  function recheckReviewConfiguration() {
    const card = byId('reviewConfigurationCard');
    if (!card || checkingReviewConfiguration || creatingReviewerSheets) return;
    checkingReviewConfiguration = true;
    reviewConfigurationValid = false;
    card.setAttribute('aria-busy', 'true');
    card.setAttribute('data-state', 'checking');
    byId('reviewConfigurationRecheck').disabled = true;
    byId('createReviewerSheetsButton').disabled = true;
    setLoading('reviewConfigurationSummary', 'Checking');
    function finish(report, error) {
      checkingReviewConfiguration = false;
      if (coordinatorSectionState) coordinatorSectionState.configurationSettled = true;
      reviewConfigurationValid = !error && report.valid;
      card.setAttribute('aria-busy', 'false');
      card.setAttribute('data-state', reviewConfigurationValid ? 'ready' : 'invalid');
      byId('reviewConfigurationRecheck').disabled = false;
      byId('createReviewerSheetsButton').disabled = !reviewConfigurationValid || creatingReviewerSheets;
      const issues = error ? [{sheet:'Configuration', message:error}] : report.issues;
      setText('reviewConfigurationSummary', reviewConfigurationValid ? 'Ready · ' + report.count + (report.count === 1 ? ' review' : ' reviews') :
        issues.length + (issues.length === 1 ? ' issue to resolve' : ' issues to resolve'));
      byId('reviewConfigurationSummary').title = reviewConfigurationValid ? 'Review count, dates, and rubric criteria match.' : 'Resolve the issues below before creating marking sheets.';
      const list = byId('reviewConfigurationIssues');
      list.textContent = ''; list.hidden = !issues.length;
      issues.forEach(function(issue) {
        const item = document.createElement('li'); item.textContent = issue.sheet + ': ' + issue.message; list.appendChild(item);
      });
      if (report) {
        setText('reviewConfigurationCheckedAt', 'Last checked: ' + new Date(report.checkedAt).toLocaleString());
        [['reviewConfigLink','config'],['reviewRubricsLink','rubrics']].forEach(function(pair) {
          const link = byId(pair[0]), url = report.links[pair[1]];
          link.hidden = !url; if (url) link.href = url;
        });
      }
    }
    dashboardRun().withSuccessHandler(function(report) { finish(report, null);revealCoordinatorCards(); })
      .withFailureHandler(function(err) { finish(null, 'Unable to check configuration: ' + errorMessage(err) + '. Try Recheck.');revealCoordinatorCards(); })
      .getCoordinatorReviewConfiguration();
  }

  let creatingReviewerSheets = false;
  function createReviewerSheets() {
    if (creatingReviewerSheets || !reviewConfigurationValid || checkingReviewConfiguration) return;
    creatingReviewerSheets = true;
    const button = byId('createReviewerSheetsButton');
    const results = byId('reviewerSheetsResults');
    if (button) button.disabled = true;
    if (results) results.textContent = '';
    const attempted = [];
    let created = 0, failed = 0;
    function finish(message) {
      creatingReviewerSheets = false;
      if (button) button.disabled = !reviewConfigurationValid;
      setText('reviewerSheetsStatus', message);
      recheckReviewConfiguration();
    }
    function next() {
      setText('reviewerSheetsStatus', 'Setting up committee spreadsheets… ' + created + ' created, ' + failed + ' failed.');
      dashboardRun().withSuccessHandler(function(result) {
        if (result.done) {
          finish(created + ' created; ' + failed + ' failed. Existing linked spreadsheets were left unchanged.');
          return;
        }
        attempted.push(result.key);
        if (result.ok) {
          created++;
          document.querySelectorAll('.committee-item').forEach(function(card) {
            if (card.getAttribute('data-committee-key') !== result.key) return;
            const badge = card.querySelector('.committee-sheet-status');
            badge.textContent = 'Sheet linked'; badge.classList.add('linked');
            const target = card.querySelector('.committee-sheet-link');
            const link = document.createElement('a');
            link.href = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(result.id) + '/edit';
            link.target = '_blank'; link.rel = 'noopener'; link.innerHTML = 'Open marking spreadsheet ' + renderLucideIcon_('external-link');
            target.textContent = ''; target.appendChild(link);
          });
        } else failed++;
        if (results) {
          const item = document.createElement('li');
          item.textContent = 'Committee ' + result.committee + ': ' + (result.ok ? 'Created. ' : result.error + (result.id ? ' Saved file ID: ' + result.id : ''));
          if (result.ok) {
            const link = document.createElement('a');
            link.href = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(result.id) + '/edit';
            link.textContent = 'Open spreadsheet'; link.target = '_blank'; link.rel = 'noopener';
            item.appendChild(link);
          }
          results.appendChild(item);
        }
        next();
      }).withFailureHandler(function(err) {
        finish('Setup stopped: ' + errorMessage(err) + '. Retry to resume unfinished committees.');
      }).createNextReviewerSpreadsheet(attempted);
    }
    next();
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

        alert(message);

        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Run Sync';
        }
      })
      .withFailureHandler(function(error) {

        alert(
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

  function refreshGithubStatus(button, message) {
    const statusButton = byId('githubStatusRefresh');
    if (statusButton) { statusButton.hidden = false; statusButton.disabled = true; }
    setText('githubSubmitStatus', message || 'Refreshing GitHub status…');
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
      if (text) text.textContent = 'Your valid GitHub username is saved. Checking the latest team status…';
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
    setText('githubSubmitStatus', 'Checking team usernames and repository access…');
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
    setText('githubSubmitStatus', 'Checking your GitHub username…');
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
      setText('githubSubmitStatus', result.message + ' Checking repository setup…');
      dashboardRun().withSuccessHandler(function(setup) {
        refresh(setup.message || '');
      }).withFailureHandler(function(err) {
        refresh('Your valid username is saved. Repository setup failed: ' + errorMessage(err));
      }).completeStudentGithubSetup();
    }).withFailureHandler(function(err) { retry(errorMessage(err)); }).submitStudentGithubUsername(input.value);
  }

  return {
    refreshGithubStatus,
    retryGithubSetup,
    submitGithubUsername,
    renderSkeleton: renderSkeleton,
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
    refreshAnnouncements,
    toggleProblem,
    decide,
    openReviewerMarks: function(team, review, button) { ReviewerMarks.open(team, review, button); },
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
    createReviewerSheets,
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
function createReviewerSheets() { DashboardUI.createReviewerSheets(); }
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
