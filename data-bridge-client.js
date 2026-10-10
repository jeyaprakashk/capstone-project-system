/**
 * DATA BRIDGE — browser module serialized into the dashboard shell as `DataBridge`.
 * The only code that calls google.script.run for migrated endpoints. Views receive
 * plain DTOs and never touch the transport.
 */
function dataBridgeBrowser_() {
  'use strict';
  const READ_TIMEOUT_MS = 30000, EARLY_READ_TTL_MS = 60000;
  let runnerFactory = null, transport = null;
  const latest = Object.create(null), early = Object.create(null), inFlightWrites = new Map();

  class BridgeError extends Error {
    constructor(code, message) { super(message); this.name = 'BridgeError'; this.code = code; }
  }

  function defaultTransport(method, args) {
    return new Promise(function(resolve, reject) {
      try {
        const runner = runnerFactory ? runnerFactory() : google.script.run;
        runner.withSuccessHandler(resolve)
          .withFailureHandler(function(error) { reject(new BridgeError('TRANSPORT', error && error.message || 'The request could not be completed.')); })[method].apply(null, args);
      } catch (error) { reject(new BridgeError('TRANSPORT', error && error.message || 'The request could not be started.')); }
    });
  }

  function unwrap(raw) {
    let frame;
    try { frame = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (error) { throw new BridgeError('BAD_RESPONSE', 'The server returned an unreadable response.'); }
    if (!frame || typeof frame !== 'object' || typeof frame.ok !== 'boolean') throw new BridgeError('BAD_RESPONSE', 'The server returned an unexpected response.');
    if (!frame.ok) throw new BridgeError(frame.error && frame.error.code || 'INTERNAL', frame.error && frame.error.message || 'The request failed.');
    return frame.data;
  }

  /** Reads time out client-side; writes never do, because the server may still complete them. */
  function call(method, args, options) {
    const settings = options || {};
    const send = (transport || defaultTransport)(String(method), args || []).then(unwrap);
    if (settings.write) return send;
    const timeoutMs = settings.timeoutMs || READ_TIMEOUT_MS;
    let timer;
    const timeout = new Promise(function(_, reject) { timer = setTimeout(function() { reject(new BridgeError('TIMEOUT', 'The server took too long to respond.')); }, timeoutMs); });
    return Promise.race([send, timeout]).finally(function() { clearTimeout(timer); });
  }

  /**
   * Starts a read before the view that consumes it exists, so independent requests overlap instead of queueing.
   * The consumer takes it over once with read(key, ..., {prefetched:true}); an unclaimed or old one is ignored.
   */
  function prefetch(key, method, args, options) {
    const promise = read(key, method, args, options);
    promise.catch(function() { /* The consumer handles the outcome; this only avoids an unhandled rejection. */ });
    early[key] = {promise: promise, at: Date.now()};
  }

  function takeEarly(key) {
    const entry = early[key];
    delete early[key];
    return entry && Date.now() - entry.at <= EARLY_READ_TTL_MS ? entry.promise : null;
  }

  /** Read for a named view; a response superseded by a newer read of the same key is discarded. */
  function read(key, method, args, options) {
    const taken = options && options.prefetched ? takeEarly(key) : null;
    if (taken) return taken;
    const token = (latest[key] || 0) + 1;
    latest[key] = token;
    const superseded = function() { const error = new BridgeError('SUPERSEDED', 'A newer request replaced this one.'); error.superseded = true; return error; };
    return call(method, args, options).then(
      function(data) { if (latest[key] !== token) throw superseded(); return data; },
      function(error) { throw latest[key] !== token ? superseded() : error; });
  }

  /** Write: an identical call already in flight returns the same promise instead of sending twice. */
  function write(method, args) {
    const id = method + '\u0000' + JSON.stringify(args || []);
    if (inFlightWrites.has(id)) return inFlightWrites.get(id);
    const pending = call(method, args, {write:true}).finally(function() { inFlightWrites.delete(id); });
    inFlightWrites.set(id, pending);
    return pending;
  }

  return {
    BridgeError: BridgeError,
    call: call, read: read, prefetch: prefetch, write: write,
    /** Use an instrumented Apps Script runner (same chaining as google.script.run). */
    useRunner: function(factory) { runnerFactory = factory; },
    /** Replace the transport, e.g. with fixtures: (method, args) => Promise<envelope string>. */
    useTransport: function(fn) { transport = fn; },
    /** Fixture transport: maps method name to a response object or function. */
    useFixtures: function(map) {
      transport = function(method, args) {
        if (!(method in map)) return Promise.reject(new BridgeError('TRANSPORT', 'No fixture for ' + method));
        const value = typeof map[method] === 'function' ? map[method].apply(null, args) : map[method];
        return Promise.resolve(typeof value === 'string' ? value : JSON.stringify({ok:true, data:value, generatedAt:new Date().toISOString()}));
      };
    }
  };
}

/**
 * Browser globals for views migrated to DTOs; must precede the dashboard client script.
 * `roles` lists the page's role keys (student, guide, reviewer, coord); a role's modules ship only
 * when the page has that role. Omitted, every role's modules ship.
 */
function getMigratedViewsClientScript_(roles) {
  const has = role => !roles || roles.indexOf(role) >= 0;
  return [
    `const DataBridge = (${dataBridgeBrowser_.toString()})();
const SharedTabs = (${sharedTabsBrowser_.toString()})(() => DashboardUI);`,
    has('reviewer') ? `const ReviewerView = (${reviewerViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => ReviewEvaluations, () => SharedTabs);` : '',
    has('coord') ? `const SystemStatusView = (${systemStatusViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => InternalAssessmentPublishing, () => SystemStatusActions);
const CoordinatorView = (${coordinatorViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => TeamDrawerView);
const TeamDrawerView = (${teamDrawerViewBrowser_.toString()})(DataBridge, () => DashboardUI);` : '',
    `const SharedTimelineView = (${sharedTimelineViewBrowser_.toString()})(() => DashboardUI);
const SharedRubricsView = (${sharedRubricsViewBrowser_.toString()})(() => DashboardUI);`,
    has('coord') ? `const SystemStatusActions = (${systemStatusActionsBrowser_.toString()})(DataBridge, () => DashboardUI);` : '',
    has('student') ? `const StudentGithub = (${studentGithubBrowser_.toString()})(DataBridge, () => DashboardUI, () => StudentView);
const StudentResults = (${studentResultsViewBrowser_.toString()})(DataBridge, () => DashboardUI);
const StudentWeekly = (${studentWeeklyViewBrowser_.toString()})(DataBridge, () => DashboardUI);
const StudentView = (${studentViewBrowser_.toString()})(DataBridge, () => DashboardUI, {weekly: StudentWeekly, results: StudentResults, github: StudentGithub});` : '',
    has('guide') ? `const GuideView = (${guideViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => GuideWeekly, () => SharedTabs);` : ''
  ].filter(Boolean).join('\n');
}

/**
 * The whole page script: common modules, each included role's modules, then the start script, which
 * registers only those roles. `roles` as for getMigratedViewsClientScript_; omitted, every role ships.
 */
function getDashboardPageScript_(roles) {
  const has = role => !roles || roles.indexOf(role) >= 0;
  return [
    getMigratedViewsClientScript_(roles),
    getDashboardClientScript_(),
    has('coord') ? getInternalAssessmentPublishingClientScript_() : '',
    has('guide') ? getGuideEvaluationClientScript_() : '',
    has('guide') ? getGuideWeeklyClientScript_() : '',
    has('coord') ? getWeeklySetupClientScript_() : '',
    has('reviewer') ? getReviewEvaluationClientScript_() : '',
    getDashboardStartScript_(roles)
  ].filter(Boolean).join('\n');
}
