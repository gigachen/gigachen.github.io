import { slugPattern, validateRecord } from '../scripts/redirect-lib.mjs';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const adminHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...adminHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

export async function handleApi(request, { store, authorized, mode }) {
  const url = new URL(request.url);
  try {
    if (!authorized) throw new ApiError(401, 'Sign in with your admin access key.');
    if (url.pathname === '/api/session' && request.method === 'GET') return json({ mode });
    if (url.pathname === '/api/links' && request.method === 'GET') {
      const snapshot = await store.read();
      return json({ revision: snapshot.revision, links: Object.entries(snapshot.records).map(([id, record]) => ({ ...record, id })), mode });
    }
    const match = /^\/api\/links\/([a-z0-9][a-z0-9_-]{2,31})$/.exec(url.pathname);
    if (!match) throw new ApiError(404, 'This admin endpoint does not exist.');
    if (request.method !== 'PUT') return new Response(null, { status: 405, headers: { ...adminHeaders, Allow: 'PUT' } });
    if (request.headers.get('Origin') !== url.origin || request.headers.get('X-TapTap-Admin') !== '1') throw new ApiError(403, 'Save changes from the TapTap admin panel.');
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new ApiError(415, 'Use JSON to save a redirect.');
    const raw = await request.text();
    if (raw.length > 8192) throw new ApiError(413, 'The redirect is too large.');
    let body;
    try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'The redirect data is not valid JSON.'); }
    if (!body || typeof body !== 'object' || typeof body.revision !== 'string' || typeof body.create !== 'boolean') throw new ApiError(400, 'Reload the list before saving.');
    const id = match[1];
    if (!slugPattern.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new ApiError(400, 'Choose a different card ID.');
    let record;
    try { record = validateRecord(body); } catch (error) { throw new ApiError(400, error.message); }
    const result = await store.save({ id, record, revision: body.revision, create: body.create });
    return json({ ...result, id, record: result.record || record, mode });
  } catch (error) {
    return json({ error: error instanceof ApiError ? error.message : 'The redirect service is unavailable. Please try again.' }, error instanceof ApiError ? error.status : 503);
  }
}
