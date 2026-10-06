import { handleApi, adminHeaders, json } from './api.mjs';
import { databaseStore } from './database-store.mjs';
import redirectWorker from '../worker/redirect.js';

async function validToken(request, expected) {
  if (typeof expected !== 'string' || expected.length < 32) return false;
  const supplied = request.headers.get('Authorization') || '';
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([supplied, `Bearer ${expected}`].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

async function adminApi(request, env, url) {
  const allowedOrigins = [url.origin, 'https://tap-tap.live', 'https://www.tap-tap.live'];
  const origin = request.headers.get('Origin');
  const respond = (response) => {
    const headers = new Headers(response.headers);
    headers.set('Vary', 'Origin');
    if (allowedOrigins.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
    return new Response(response.body, { status: response.status, headers });
  };
  if (origin && !allowedOrigins.includes(origin)) return respond(json({ error: 'Use the TapTap admin panel.' }, 403));
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('Access-Control-Request-Method');
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
    if (!origin || !['GET', 'PUT'].includes(method) || requestedHeaders.some((name) => !['authorization', 'content-type', 'x-taptap-admin'].includes(name))) {
      return respond(json({ error: 'Unsupported admin request.' }, 403));
    }
    return respond(new Response(null, { status: 204, headers: { ...adminHeaders, 'Access-Control-Allow-Methods': 'GET, PUT', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-TapTap-Admin', 'Access-Control-Max-Age': '600' } }));
  }
  const authorized = await validToken(request, env.ADMIN_TOKEN);
  if (!authorized) return respond(json({ error: 'Sign in with your admin access key.' }, 401));
  try { return respond(await handleApi(request, { store: databaseStore(env.DB), authorized, mode: 'database', allowedOrigins })); }
  catch (error) { return respond(json({ error: error.message }, error.status || 503)); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/r/')) return redirectWorker.fetch(request, env);
    if (url.pathname.startsWith('/api/')) return adminApi(request, env, url);
    if (url.pathname === '/' || url.pathname === '/admin') return new Response(null, { status: 302, headers: { ...adminHeaders, Location: '/admin/' } });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...adminHeaders, Allow: 'GET, HEAD' } });
    const assets = { '/admin/': '/index.html', '/admin/index.html': '/index.html', '/admin/admin.css': '/admin.css', '/admin/admin.js': '/admin.js' };
    if (!Object.hasOwn(assets, url.pathname)) return new Response('Not found', { status: 404, headers: adminHeaders });
    url.pathname = assets[url.pathname];
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(adminHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
