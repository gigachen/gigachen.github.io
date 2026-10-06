import { ApiError } from './api.mjs';
import { slugPattern, validateRecord } from '../scripts/redirect-lib.mjs';

// The same prepared SQL runs against local SQLite and Cloudflare D1.
export function databaseStore(database) {
  if (!database || typeof database.prepare !== 'function' || typeof database.batch !== 'function') throw new ApiError(503, 'The redirect database has not been configured.');
  async function read() {
    const [state, links] = await database.batch([
      database.prepare('SELECT revision FROM redirect_state WHERE singleton = 1'),
      database.prepare('SELECT id, destination, status, created_at, updated_at FROM redirects ORDER BY id'),
    ]);
    if (!state.results?.length) throw new ApiError(503, 'The redirect database needs its schema migration.');
    const records = Object.fromEntries(links.results.map(({ id, ...record }) => [id, record]));
    return { records, revision: String(state.results[0].revision) };
  }
  return {
    database,
    read,
    async get(id) {
      const { results } = await database.prepare('SELECT destination, status FROM redirects WHERE id = ?').bind(id).all();
      return results[0] || null;
    },
    async save({ id, record: input, revision, create }) {
      if (!slugPattern.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new ApiError(400, 'Choose a different card ID.');
      let record;
      try { record = validateRecord(input); } catch (error) { throw new ApiError(400, error.message); }
      const snapshot = await read();
      if (snapshot.revision !== revision) throw new ApiError(409, 'The redirect list changed. Refresh it before saving your changes.');
      const exists = Object.hasOwn(snapshot.records, id);
      if (create && exists) throw new ApiError(409, 'That card ID already exists. Choose another ID.');
      if (!create && !exists) throw new ApiError(404, 'This redirect no longer exists. Refresh the list.');
      if (exists && snapshot.records[id].destination === record.destination && snapshot.records[id].status === record.status) return { revision, changed: false, record: snapshot.records[id] };
      const nextRevision = Number(revision) + 1;
      if (!Number.isSafeInteger(nextRevision)) throw new ApiError(503, 'The database revision is invalid.');
      const statement = create
        ? database.prepare(`INSERT INTO redirects (id, destination, status)
            SELECT ?, ?, ? WHERE (SELECT revision FROM redirect_state WHERE singleton = 1) = ?
            RETURNING destination, status, created_at, updated_at`).bind(id, record.destination, record.status, Number(revision))
        : database.prepare(`UPDATE redirects SET destination = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ? AND (SELECT revision FROM redirect_state WHERE singleton = 1) = ?
            RETURNING destination, status, created_at, updated_at`).bind(record.destination, record.status, id, Number(revision));
      // The revision predicate and write execute as one atomic SQL statement.
      // Triggers advance the revision even for writes from other database clients.
      const { results } = await statement.all();
      if (results.length !== 1) throw new ApiError(409, 'The redirect list changed while saving. Refresh before trying again.');
      return { revision: String(nextRevision), changed: true, record: results[0] };
    },
  };
}
