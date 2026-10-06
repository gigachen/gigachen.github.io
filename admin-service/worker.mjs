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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/r/')) return redirectWorker.fetch(request, env);
    if (url.pathname.startsWith('/api/')) {
      const authorized = await validToken(request, env.ADMIN_TOKEN);
      if (!authorized) return json({ error: 'Sign in with your admin access key.' }, 401);
      try { return await handleApi(request, { store: databaseStore(env.DB), authorized, mode: 'database' }); }
      catch (error) { return json({ error: error.message }, error.status || 503); }
    }
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
