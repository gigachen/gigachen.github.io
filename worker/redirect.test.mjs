import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './redirect.js';

function makeEnv(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, LINKS: { get: async (key) => values.get(key) ?? null } };
}

test('active links return a temporary, uncached redirect', async () => {
  const env = makeEnv({ 'link:card123': JSON.stringify({ destination: 'https://example.com/profile', status: 'active' }) });
  const request = new Request('https://gigachen.me/r/card123/');
  const first = await worker.fetch(request, env);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get('Location'), 'https://example.com/profile');
  assert.match(first.headers.get('Cache-Control'), /no-store/);

  env.values.set('link:card123', JSON.stringify({ destination: 'https://example.com/new', status: 'active' }));
  const updated = await worker.fetch(request, env);
  assert.equal(updated.headers.get('Location'), 'https://example.com/new');
});

test('inactive and unknown links do not redirect', async () => {
  const env = makeEnv({ 'link:card123': JSON.stringify({ destination: 'https://example.com', status: 'inactive' }) });
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/card123'), env)).status, 410);
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/unknown'), env)).status, 404);
});

test('unsafe destinations and malformed paths are rejected', async () => {
  const env = makeEnv({
    'link:card123': JSON.stringify({ destination: 'javascript:alert(1)', status: 'active' }),
    'link:loop123': JSON.stringify({ destination: 'https://gigachen.me/r/card123', status: 'active' }),
    'link:go123': JSON.stringify({ destination: 'https://go.gigachen.me/r/card123', status: 'active' }),
    'link:bad123': 'null',
  });
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/card123'), env)).status, 503);
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/loop123'), env)).status, 503);
  assert.equal((await worker.fetch(new Request('https://go.gigachen.me/r/go123'), env)).status, 503);
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/bad123'), env)).status, 503);
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/%2e%2e'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://gigachen.me/r/card123/extra'), env)).status, 404);
});

test('HEAD and unsupported methods behave correctly', async () => {
  const env = makeEnv({ 'link:card123': JSON.stringify({ destination: 'https://example.com', status: 'active' }) });
  const head = await worker.fetch(new Request('https://gigachen.me/r/card123', { method: 'HEAD' }), env);
  assert.equal(head.status, 302);
  assert.equal(await head.text(), '');
  const post = await worker.fetch(new Request('https://gigachen.me/r/card123', { method: 'POST' }), env);
  assert.equal(post.status, 405);
});
