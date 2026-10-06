import { backup } from 'node:sqlite';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localStore } from '../admin-service/sqlite-store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
if (!['init', 'export', 'seed', 'backup'].includes(action)) throw new Error('Use database.mjs init, export, seed, or backup.');
const store = localStore(root);
try {
  const { records } = await store.read();
  if (action === 'init') {
    process.stdout.write(`Database: ${store.databasePath}\n${Object.keys(records).length} redirects stored.\n`);
  } else if (action === 'export') {
    const snapshot = Object.fromEntries(Object.entries(records).map(([id, { destination, status }]) => [id, { destination, status }]));
    await writeFile(join(root, 'links.json'), JSON.stringify(snapshot, null, 2) + '\n');
    process.stdout.write('Exported a database snapshot to links.json. Run npm run generate to update the static Pages fallback.\n');
  } else if (action === 'seed') {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const inserts = Object.entries(records).map(([id, { destination, status, created_at, updated_at }]) =>
      `INSERT INTO redirects (id, destination, status, created_at, updated_at) SELECT ${[id, destination, status, created_at, updated_at].map(quote).join(', ')} WHERE (SELECT seeded FROM redirect_state WHERE singleton = 1) = 0 ON CONFLICT(id) DO NOTHING;`);
    const sql = '-- One-time initial import. Existing destinations and later deletions are preserved.\n' + inserts.join('\n') + '\nUPDATE redirect_state SET seeded = 1 WHERE singleton = 1;\n';
    await writeFile(join(root, 'admin-service', 'seed.sql'), sql);
    process.stdout.write(`Prepared ${inserts.length} redirects for D1 in admin-service/seed.sql.\n`);
  } else {
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const destination = join(root, 'data', `redirects-backup-${stamp}.sqlite`);
    await backup(store.connection, destination);
    process.stdout.write(`Database backup: ${destination}\n`);
  }
} finally { store.close(); }
