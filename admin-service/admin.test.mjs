import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { DatabaseSync, backup } from 'node:sqlite';
import { localStore, startLocalServer } from './local.mjs';
import { sqliteAdapter } from './sqlite-store.mjs';
import { handleApi } from './api.mjs';
import { databaseStore } from './database-store.mjs';
import worker from './worker.mjs';
import redirectWorker from '../worker/redirect.js';
import { validateDestination, redirectPage } from '../scripts/redirect-lib.mjs';

const original = { demo: { destination: 'https://example.com/original', status: 'active' } };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'taptap-database-test-'));
  const connections = [], servers = [];
  t.after(async () => {
    for (const server of servers) await new Promise((accept, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : accept());
    });
    for (const connection of connections) if (connection.isOpen) connection.close();
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'r/demo'), { recursive: true });
  await writeFile(join(root, 'links.json'), JSON.stringify(original, null, 2) + '\n');
  await writeFile(join(root, 'r/demo/index.html'), redirectPage(original.demo));
  function open() {
    const store = localStore(root);
    connections.push(store.connection);
    return store;
  }
  return { root, store: open(), open, servers };
}
function request(id, body, headers = {}) {
  return new Request(`https://admin.example.com/api/links/${id}`, { method: 'PUT', headers: { Origin: 'https://admin.example.com', 'X-TapTap-Admin': '1', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
async function save(store, destination, extra = {}) {
  const { revision } = await store.read();
  return store.save({ id: 'demo', record: { destination, status: 'active' }, revision, create: false, ...extra });
}

test('first launch migrates every source link into a real SQLite file with timestamps', async (t) => {
  const { root, store } = await fixture(t);
  const header = await readFile(join(root, 'data/redirects.sqlite'));
  assert.equal(header.subarray(0, 15).toString(), 'SQLite format 3');
  const record = (await store.read()).records.demo;
  assert.equal(record.destination, original.demo.destination);
  assert.equal(record.status, 'active');
  assert.match(record.created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(record.updated_at, record.created_at);
});

test('admin saves update only the database and public redirects immediately read it', async (t) => {
  const { root, store } = await fixture(t);
  const source = await readFile(join(root, 'links.json'), 'utf8');
  const page = await readFile(join(root, 'r/demo/index.html'), 'utf8');
  const before = await store.read();
  const response = await handleApi(request('demo', { destination: 'https://example.com/new?tag=taptap', status: 'active', revision: before.revision, create: false }), { store, authorized: true, mode: 'local' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.record.destination, 'https://example.com/new?tag=taptap');
  assert.ok(result.record.updated_at);
  const redirect = await redirectWorker.fetch(new Request('https://tap-tap.live/r/demo/'), { DB: store.database });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('Location'), result.record.destination);
  assert.equal(await readFile(join(root, 'links.json'), 'utf8'), source);
  assert.equal(await readFile(join(root, 'r/demo/index.html'), 'utf8'), page);
});

test('destination edits survive closing and reopening, without reimporting stale JSON', async (t) => {
  const { root, store, open } = await fixture(t);
  await save(store, 'https://example.com/persisted');
  store.close();
  await writeFile(join(root, 'links.json'), '{invalid stale data');
  const reopened = open();
  assert.equal((await reopened.read()).records.demo.destination, 'https://example.com/persisted');
  assert.deepEqual(Object.keys((await reopened.read()).records), ['demo']);
});

test('create and deactivate use the same permanent card URL and never remove the record', async (t) => {
  const { store } = await fixture(t);
  await store.save({ id: 'new-card', record: { destination: 'https://example.com/new', status: 'active' }, revision: (await store.read()).revision, create: true });
  await store.save({ id: 'new-card', record: { destination: 'https://example.com/new', status: 'inactive' }, revision: (await store.read()).revision, create: false });
  const redirect = await redirectWorker.fetch(new Request('https://tap-tap.live/r/new-card/'), { DB: store.database });
  assert.equal(redirect.status, 410);
  assert.equal(redirect.headers.get('Location'), null);
  assert.equal((await store.read()).records['new-card'].status, 'inactive');
});

test('unauthenticated, cross-origin, unsafe, and malformed changes never write', async (t) => {
  const { store } = await fixture(t), before = await store.read();
  const body = { destination: 'https://example.com/new', status: 'active', revision: before.revision, create: false };
  assert.equal((await handleApi(request('demo', body), { store, authorized: false, mode: 'local' })).status, 401);
  assert.equal((await handleApi(request('demo', body, { Origin: 'https://evil.example' }), { store, authorized: true, mode: 'local' })).status, 403);
  assert.equal((await handleApi(request('demo', body, { 'X-TapTap-Admin': '' }), { store, authorized: true, mode: 'local' })).status, 403);
  for (const destination of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://tap-tap.live/r/demo/', 'https://go.tap-tap.live/r/demo/', 'https://www.gigachen.me/r/demo/', 'https://taptap-admin.admin-service.workers.dev/r/demo/', 'not a url']) {
    assert.equal((await handleApi(request('demo', { ...body, destination }), { store, authorized: true, mode: 'local' })).status, 400);
  }
  assert.equal((await handleApi(request('constructor', { ...body, create: true }), { store, authorized: true, mode: 'local' })).status, 400);
  const malformed = new Request('https://admin.example.com/api/links/demo', { method: 'PUT', headers: { Origin: 'https://admin.example.com', 'X-TapTap-Admin': '1', 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handleApi(malformed, { store, authorized: true, mode: 'local' })).status, 400);
  assert.equal((await store.read()).revision, before.revision);
});

test('independent database connections cannot overwrite a concurrent save', async (t) => {
  const { store, open } = await fixture(t), other = open();
  const { revision } = await store.read();
  const results = await Promise.allSettled([store, other].map((db, i) => db.save({ id: 'demo', record: { destination: `https://example.com/${i}`, status: 'active' }, revision, create: false })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409);
  const current = await store.read();
  assert.equal(current.revision, String(Number(revision) + 1));
});

test('database triggers invalidate revisions after direct SQL writes', async (t) => {
  const { store } = await fixture(t), { revision } = await store.read();
  store.connection.prepare('UPDATE redirects SET destination = ? WHERE id = ?').run('https://example.com/external', 'demo');
  await assert.rejects(store.save({ id: 'demo', record: original.demo, revision, create: false }), { status: 409 });
  assert.equal((await store.read()).records.demo.destination, 'https://example.com/external');
});

test('duplicate IDs, nonexistent edits, invalid status, and unchanged saves are handled', async (t) => {
  const { store } = await fixture(t), { revision } = await store.read();
  await assert.rejects(store.save({ id: 'demo', record: original.demo, revision, create: true }), { status: 409 });
  await assert.rejects(store.save({ id: 'missing', record: original.demo, revision, create: false }), { status: 404 });
  await assert.rejects(store.save({ id: '../../escape', record: original.demo, revision, create: true }), { status: 400 });
  await assert.rejects(store.save({ id: 'demo', record: { ...original.demo, status: 'other' }, revision, create: false }), { status: 400 });
  const unchanged = await store.save({ id: 'demo', record: original.demo, revision, create: false });
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.revision, revision);
});

test('SQL constraints reject invalid IDs/status and bindings prevent SQL injection', async (t) => {
  const { store } = await fixture(t);
  assert.throws(() => store.connection.prepare('UPDATE redirects SET status = ? WHERE id = ?').run('bad', 'demo'));
  assert.throws(() => store.connection.prepare('INSERT INTO redirects (id, destination, status) VALUES (?, ?, ?)').run('../bad', 'https://example.com', 'active'));
  const destination = "https://example.com/#';DROP%20TABLE%20redirects;--";
  await save(store, destination);
  assert.equal((await store.read()).records.demo.destination, destination);
  assert.equal(store.connection.prepare('SELECT COUNT(*) AS count FROM redirects').get().count, 1);
});

test('SQLite backups preserve the saved destinations', async (t) => {
  const { root, store } = await fixture(t);
  await save(store, 'https://example.com/backup');
  const destination = join(root, 'backup.sqlite');
  await backup(store.connection, destination);
  const restored = new DatabaseSync(destination);
  try { assert.equal(restored.prepare('SELECT destination FROM redirects WHERE id = ?').get('demo').destination, 'https://example.com/backup'); }
  finally { restored.close(); }
});

test('D1 schema and seed SQL import repeatedly without resetting an edited destination', async () => {
  const connection = new DatabaseSync(':memory:');
  try {
    connection.exec(await readFile(new URL('./migrations/0001_redirects.sql', import.meta.url), 'utf8'));
    const seed = await readFile(new URL('./seed.sql', import.meta.url), 'utf8');
    connection.exec(seed);
    const store = databaseStore(sqliteAdapter(connection));
    assert.ok((await store.read()).records.portfolio);
    await save(store, 'https://example.com/edited-cloud');
    connection.exec(seed);
    assert.equal((await store.read()).records.demo.destination, 'https://example.com/edited-cloud');
  } finally { connection.close(); }
});

test('redirect snapshots escape destinations in HTML and inline JavaScript', () => {
  const page = redirectPage({ destination: 'https://example.com/?q=%22&tag=%3Cscript%3E', status: 'active' });
  assert.match(page, /&amp;tag=/);
  assert.throws(() => validateDestination('https://go.tap-tap.live/r/demo'));
});

test('hosted admin fails closed for absent, short, incorrect keys and missing database', async () => {
  for (const ADMIN_TOKEN of [undefined, 'short', 'a'.repeat(48)]) {
    const response = await worker.fetch(new Request('https://admin.example.com/api/links'), { ADMIN_TOKEN });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  const ADMIN_TOKEN = 'a'.repeat(48);
  assert.equal((await worker.fetch(new Request('https://admin.example.com/api/links', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }), { ADMIN_TOKEN })).status, 503);
});

test('hosted admin and public redirect worker share the same database', async (t) => {
  const { store } = await fixture(t);
  const ADMIN_TOKEN = 'test-only-access-key-'.repeat(3);
  const env = { ADMIN_TOKEN, DB: store.database };
  const session = await worker.fetch(new Request('https://admin.example.com/api/session', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }), env);
  assert.deepEqual(await session.json(), { mode: 'database' });
  const { revision } = await store.read();
  const change = request('demo', { destination: 'https://example.com/hosted', status: 'active', revision, create: false }, { Authorization: `Bearer ${ADMIN_TOKEN}` });
  assert.equal((await worker.fetch(change, env)).status, 200);
  const response = await worker.fetch(new Request('https://tap-tap.live/r/demo/'), env);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://example.com/hosted');
  const assets = [];
  const ASSETS = { fetch: async (request) => { assets.push(new URL(request.url).pathname); return new Response('<!doctype html><title>TapTap</title>'); } };
  const panel = await worker.fetch(new Request('https://admin.example.com/admin/'), { ASSETS });
  assert.equal(panel.status, 200);
  assert.deepEqual(assets, ['/index.html']);
  assert.match(panel.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal((await worker.fetch(new Request('https://admin.example.com/data/redirects.sqlite'), { ASSETS })).status, 404);
});

test('local HTTP access stays protected and saved destinations return HTTP 302 immediately', async (t) => {
  const { root, servers } = await fixture(t);
  await mkdir(join(root, 'admin'));
  await writeFile(join(root, 'admin/index.html'), '<!doctype html><title>Admin fixture</title>');
  const server = await startLocalServer({ root, port: 0 });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/links`)).status, 401);
  const page = await fetch(`${base}/admin/`), setCookie = page.headers.get('Set-Cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(';')[0];
  const links = await (await fetch(`${base}/api/links`, { headers: { Cookie: cookie } })).json();
  assert.equal(links.links[0].id, 'demo');
  assert.equal((await fetch(`${base}/api/links`, { headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status, 403);
  const hostileHostStatus = await new Promise((accept, reject) => {
    const req = httpRequest(`${base}/api/links`, { headers: { Host: 'evil.example' } }, (res) => { res.resume(); accept(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostileHostStatus, 403);
  for (const path of ['/.git/config', '/data/redirects.sqlite', '/data/redirects.sqlite-wal']) assert.equal((await fetch(base + path)).status, 404);
  const response = await fetch(`${base}/api/links/demo`, { method: 'PUT', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-TapTap-Admin': '1' }, body: JSON.stringify({ destination: 'https://example.com/http-test', status: 'active', revision: links.revision, create: false }) });
  assert.equal(response.status, 200);
  const redirect = await fetch(`${base}/r/demo/`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('Location'), 'https://example.com/http-test');
});
