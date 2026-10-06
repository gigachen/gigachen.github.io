import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { sqliteAdapter } from '../admin-service/sqlite-store.mjs';
import worker from './redirect.js';

async function makeEnv(t, records = {}) {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  connection.exec(await readFile(new URL('../admin-service/migrations/0001_redirects.sql', import.meta.url), 'utf8'));
  const insert = connection.prepare('INSERT INTO redirects (id, destination, status) VALUES (?, ?, ?)');
  for (const [id, record] of Object.entries(records)) insert.run(id, record.destination, record.status);
  return { connection, DB: sqliteAdapter(connection) };
}

test('active database links return a temporary, uncached redirect and see edits immediately', async (t) => {
  const env = await makeEnv(t, { card123: { destination: 'https://example.com/profile', status: 'active' } });
  const request = new Request('https://tap-tap.live/r/card123/');
  const first = await worker.fetch(request, env);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get('Location'), 'https://example.com/profile');
  assert.match(first.headers.get('Cache-Control'), /no-store/);
  env.connection.prepare('UPDATE redirects SET destination = ? WHERE id = ?').run('https://example.com/new', 'card123');
  assert.equal((await worker.fetch(request, env)).headers.get('Location'), 'https://example.com/new');
});

test('inactive and unknown database links do not redirect', async (t) => {
  const env = await makeEnv(t, { card123: { destination: 'https://example.com', status: 'inactive' } });
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/card123'), env)).status, 410);
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/unknown'), env)).status, 404);
});

test('unsafe database destinations, malformed paths and missing bindings fail safely', async (t) => {
  const env = await makeEnv(t, {
    loop123: { destination: 'https://tap-tap.live/r/card123', status: 'active' },
    go123: { destination: 'https://go.tap-tap.live/r/card123', status: 'active' },
    bad123: { destination: 'https://user:pass@example.com', status: 'active' },
  });
  for (const id of ['loop123', 'go123', 'bad123']) assert.equal((await worker.fetch(new Request(`https://tap-tap.live/r/${id}`), env)).status, 503);
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/%2e%2e'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/card123/extra'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/card123'), {})).status, 503);
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/card123'), { DB: { prepare() { throw new Error('Database unavailable'); }, batch() {} } })).status, 503);
});

test('HEAD and unsupported methods behave correctly with database redirects', async (t) => {
  const env = await makeEnv(t, { card123: { destination: 'https://example.com', status: 'active' } });
  const head = await worker.fetch(new Request('https://tap-tap.live/r/card123', { method: 'HEAD' }), env);
  assert.equal(head.status, 302);
  assert.equal(await head.text(), '');
  assert.equal((await worker.fetch(new Request('https://tap-tap.live/r/card123', { method: 'POST' }), env)).status, 405);
  const missing = await worker.fetch(new Request('https://tap-tap.live/r/missing', { method: 'HEAD' }), env);
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), '');
});
