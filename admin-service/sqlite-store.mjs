import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { databaseStore } from './database-store.mjs';
import { validateRecords, validateRecord } from '../scripts/redirect-lib.mjs';

export function sqliteAdapter(connection) {
  function prepare(sql) {
    const statement = connection.prepare(sql);
    const make = (params = []) => ({
      bind: (...values) => make(values),
      all: async () => ({ success: true, results: statement.all(...params) }),
      run: async () => ({ success: true, meta: statement.run(...params) }),
      execute: () => ({ success: true, results: statement.all(...params) }),
    });
    return make();
  }
  return {
    prepare,
    async batch(statements) {
      connection.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        connection.exec('COMMIT');
        return results;
      } catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
  };
}

export function localStore(root, { databasePath = join(root, 'data', 'redirects.sqlite') } = {}) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const connection = new DatabaseSync(databasePath);
  try {
    connection.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    connection.exec(readFileSync(new URL('./migrations/0001_redirects.sql', import.meta.url), 'utf8'));
    // Seed once, in a transaction. A restart never reimports stale JSON.
    connection.exec('BEGIN IMMEDIATE');
    try {
      const { seeded } = connection.prepare('SELECT seeded FROM redirect_state WHERE singleton = 1').get();
      if (!seeded) {
        const records = validateRecords(JSON.parse(readFileSync(join(root, 'links.json'), 'utf8')));
        const insert = connection.prepare('INSERT INTO redirects (id, destination, status) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING');
        for (const [id, input] of Object.entries(records)) {
          const record = validateRecord(input);
          insert.run(id, record.destination, record.status);
        }
        connection.prepare('UPDATE redirect_state SET seeded = 1 WHERE singleton = 1').run();
      }
      connection.exec('COMMIT');
    } catch (error) { connection.exec('ROLLBACK'); throw error; }
    return { ...databaseStore(sqliteAdapter(connection)), connection, databasePath, close: () => connection.close() };
  } catch (error) { connection.close(); throw error; }
}
