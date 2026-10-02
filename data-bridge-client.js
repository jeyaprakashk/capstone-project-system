/**
 * DATA BRIDGE — browser module serialized into the dashboard shell as `DataBridge`.
 * The only code that calls google.script.run for migrated endpoints. Views receive
 * plain DTOs and never touch the transport.
 */
function dataBridgeBrowser_() {
  'use strict';
  const READ_TIMEOUT_MS = 30000;
  let runnerFactory = null, transport = null;
  const latest = Object.create(null), inFlightWrites = new Map();

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

  /** Read for a named view; a response superseded by a newer read of the same key is discarded. */
  function read(key, method, args, options) {
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
    call: call, read: read, write: write,
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

/** Browser globals for views migrated to DTOs; must precede the dashboard client script. */
function getMigratedViewsClientScript_() {
  return `const DataBridge = (${dataBridgeBrowser_.toString()})();
const ReviewerView = (${reviewerViewBrowser_.toString()})(DataBridge, () => DashboardUI);
const SystemStatusView = (${systemStatusViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => typeof InternalAssessmentPublishing === 'undefined' ? null : InternalAssessmentPublishing);
const CoordinatorView = (${coordinatorViewBrowser_.toString()})(DataBridge, () => DashboardUI);
const StudentView = (${studentViewBrowser_.toString()})(DataBridge, () => DashboardUI);
const GuideView = (${guideViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => typeof GuideWeekly === 'undefined' ? null : GuideWeekly);`;
}
