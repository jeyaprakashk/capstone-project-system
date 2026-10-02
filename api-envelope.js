/**
 * API ENVELOPE — the only way migrated endpoints return data to the browser.
 * Shapes are defined in DATA-CONTRACTS.md. Never put HTML, CSS classes or column
 * positions in a payload.
 */
const API_ERROR_CODES_ = ['UNAUTHENTICATED','UNAUTHORIZED','NOT_FOUND','INVALID_INPUT','REJECTED','CONFLICT','UNAVAILABLE','INTERNAL'];

function apiOk_(data) {
  return JSON.stringify({ok:true, data:data === undefined ? null : data, generatedAt:new Date().toISOString()});
}

function apiError_(code, message) {
  return JSON.stringify({ok:false, error:{code:API_ERROR_CODES_.includes(code) ? code : 'INTERNAL', message:String(message || 'Request failed.')}});
}

/** Throw from an endpoint to return a specific code and a user-safe message. */
function apiFail_(code, message) {
  const error = new Error(message);
  error.apiCode = code;
  return error;
}

/**
 * Runs an endpoint body and serializes its result. Errors raised on purpose with
 * apiFail_ or a plain Error (existing business-rule messages meant for users) keep
 * their message. Engine errors (TypeError, ReferenceError, ...) are logged and
 * replaced with a generic message so internals never reach the browser.
 */
function apiHandle_(body) {
  try {
    return apiOk_(body());
  } catch (error) {
    if (error && error.apiCode) return apiError_(error.apiCode, error.message);
    if (error && error.name === 'Error') return apiError_('REJECTED', error.message);
    console.error('API failure: ' + (error && error.stack || error));
    return apiError_('INTERNAL', 'Something went wrong. Please try again.');
  }
}
