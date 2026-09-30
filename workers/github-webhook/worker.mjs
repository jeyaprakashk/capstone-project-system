const encoder = new TextEncoder();

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, usages);
}

async function forwardPush(env, message, deliveryId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const key = await hmacKey(env.APPS_SCRIPT_RELAY_SECRET, ['sign']);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
    const signature = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await fetch(env.APPS_SCRIPT_WEBHOOK_URL, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message, signature}), redirect: 'follow', signal: controller.signal
    });
    if (!response.ok) throw new Error('http_' + response.status);
    let result;
    try { result = await response.json(); } catch (_) { throw new Error('invalid_response'); }
    if (!result || result.ok !== true) throw new Error('receiver_rejected');
  } catch (error) {
    const reason = controller.signal.aborted ? 'timeout' :
      /^(http_\d{3}|invalid_response|receiver_rejected)$/.test(error.message) ? error.message : 'forward_failed';
    console.error(JSON.stringify({event: 'github_relay_failure', deliveryId, reason}));
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname !== '/github/push') return new Response('Not found', {status: 404});
    if (request.method !== 'POST') return new Response('Method not allowed', {status: 405, headers: {Allow: 'POST'}});
    if (!env.GITHUB_WEBHOOK_SECRET) return new Response('Not configured', {status: 503});
    const signature = request.headers.get('X-Hub-Signature-256') || '';
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return new Response('Unauthorized', {status: 401});
    const bytes = await request.arrayBuffer();
    const digest = Uint8Array.from(signature.slice(7).match(/../g), pair => parseInt(pair, 16));
    const key = await hmacKey(env.GITHUB_WEBHOOK_SECRET, ['verify']);
    if (!await crypto.subtle.verify('HMAC', key, digest, bytes)) return new Response('Unauthorized', {status: 401});
    let payload;
    try {
      payload = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
    } catch (_) { return new Response('Invalid JSON', {status: 400}); }
    const event = request.headers.get('X-GitHub-Event');
    if (event === 'ping') return new Response('pong');
    if (event !== 'push') return new Response(null, {status: 204});
    const deliveryId = request.headers.get('X-GitHub-Delivery') || '';
    if (!/^[a-z0-9-]{1,128}$/i.test(deliveryId)) return new Response('Invalid delivery ID', {status: 400});
    if (!env.APPS_SCRIPT_RELAY_SECRET ||
        !/^https:\/\/script\.google\.com\/macros\/s\/[a-z0-9_-]+\/exec\/github-push$/i.test(env.APPS_SCRIPT_WEBHOOK_URL || '')) {
      return new Response('Not configured', {status: 503});
    }
    const message = JSON.stringify({version: 1, event, deliveryId, sentAt: Date.now(), payload});
    ctx.waitUntil(forwardPush(env, message, deliveryId));
    return new Response('Accepted', {status: 202});
  }
};
