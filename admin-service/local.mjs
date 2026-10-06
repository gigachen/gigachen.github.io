import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleApi, adminHeaders, ApiError, json } from './api.mjs';
import { localStore } from './sqlite-store.mjs';
import redirectWorker from '../worker/redirect.js';
export { localStore } from './sqlite-store.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');


export async function startLocalServer({ root = projectRoot, port = Number(process.env.TAPTAP_ADMIN_PORT || 8788) } = {}) {
  const store = localStore(root);
  await store.read();
  const cookie = randomBytes(32).toString('hex');
  const server = createServer(async (incoming, outgoing) => {
    try {
      const actualPort = server.address().port;
      const host = incoming.headers.host;
      if (![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(host)) {
        outgoing.writeHead(403); outgoing.end('Use the local admin address.'); return;
      }
      const url = new URL(incoming.url, `http://${host}`);
      const isApi = url.pathname.startsWith('/api/');
      let response;
      if (isApi) {
        if (incoming.headers.origin && incoming.headers.origin !== url.origin) response = json({ error: 'Use the local admin panel.' }, 403);
        else {
          const chunks = [];
          let size = 0;
          for await (const chunk of incoming) {
            size += chunk.length;
            if (size > 8192) throw new ApiError(413, 'The redirect is too large.');
            chunks.push(chunk);
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          const request = new Request(url, { method: incoming.method, headers, ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}) });
          const authorized = (incoming.headers.cookie || '').split(';').some((item) => item.trim() === `taptap_local=${cookie}`);
          response = await handleApi(request, { store, authorized, mode: 'local' });
        }
      } else if (!['GET', 'HEAD'].includes(incoming.method)) {
        response = new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
      } else if (url.pathname === '/admin') {
        response = new Response(null, { status: 302, headers: { Location: '/admin/' } });
      } else {
        const match = /^\/r\/([a-z0-9][a-z0-9_-]{2,31})\/?$/.exec(url.pathname);
        if (match) {
          response = await redirectWorker.fetch(new Request(url, { method: incoming.method }), { DB: store.database });
        } else {
          const routes = {
            '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
            '/admin/': ['admin/index.html', 'text/html'], '/admin/index.html': ['admin/index.html', 'text/html'],
            '/admin/admin.css': ['admin/admin.css', 'text/css'], '/admin/admin.js': ['admin/admin.js', 'text/javascript'],
            '/script.js': ['script.js', 'text/javascript'], '/taptap-20260929d.css': ['taptap-20260929d.css', 'text/css'],
            '/taptap-icon.svg': ['taptap-icon.svg', 'image/svg+xml'], '/assets/taptap-preview.png': ['assets/taptap-preview.png', 'image/png'],
          };
          if (!Object.hasOwn(routes, url.pathname)) response = new Response('Not found', { status: 404 });
          else {
            const [file, type] = routes[url.pathname];
            const headers = { 'Content-Type': `${type}; charset=utf-8`, ...adminHeaders };
            if (file === 'admin/index.html') headers['Set-Cookie'] = `taptap_local=${cookie}; HttpOnly; SameSite=Strict; Path=/`;
            // The existing landing page has inline redirects/styles of its own.
            if (!url.pathname.startsWith('/admin')) delete headers['Content-Security-Policy'];
            response = new Response(await readFile(join(root, file)), { headers });
          }
        }
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const response = json({ error: error instanceof ApiError ? error.message : 'The local admin service could not complete the request.' }, error.status || 503);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    }
  });
  server.once('close', () => store.close());
  try {
    await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  } catch (error) { store.close(); throw error; }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = await startLocalServer();
    process.stdout.write(`TapTap admin: http://127.0.0.1:${server.address().port}/admin/\nChanges save to the SQLite database. Local card redirects read this database immediately.\n`);
  } catch (error) { process.stderr.write(`Admin could not start: ${error.message}\n`); process.exitCode = 1; }
}
