import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { slugPattern, validateDestination, validateRecords, redirectPage, redirectFallbackPage } from './redirect-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'r');
const records = validateRecords(JSON.parse(await readFile(join(root, 'links.json'), 'utf8')));
let serviceOrigin = null;
try {
  const config = JSON.parse(await readFile(join(root, 'redirect-service.json'), 'utf8'));
  const url = new URL(validateDestination(config.origin));
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('The redirect service must be an HTTPS origin.');
  serviceOrigin = url.origin;
} catch (error) { if (error.code !== 'ENOENT') throw error; }

await mkdir(output, { recursive: true });
const existing = await readdir(output, { withFileTypes: true });
for (const entry of existing) {
  if (!serviceOrigin && entry.isDirectory() && slugPattern.test(entry.name) && !(entry.name in records)) {
    throw new Error(`Removed link ${entry.name} still has a published page. Set its status to "inactive" instead of deleting it.`);
  }
}

for (const [slug, record] of Object.entries(records)) {
  if (!slugPattern.test(slug)) throw new Error(`Invalid link ID: ${slug}`);
  if (!record || typeof record !== 'object' || !['active', 'inactive'].includes(record.status)) throw new Error(`Invalid status for ${slug}`);
  validateDestination(record.destination);
  const folder = join(output, slug);
  await mkdir(folder, { recursive: true });
  const target = serviceOrigin ? { destination: `${serviceOrigin}/r/${slug}/`, status: 'active' } : record;
  // The service URL is controlled by deployment config, rather than an editable card destination.
  await writeFile(join(folder, 'index.html'), redirectPage(target, { allowService: !!serviceOrigin }));
  process.stdout.write(`${slug}: ${serviceOrigin ? 'database service' : record.status} → ${target.destination}\n`);
}

if (serviceOrigin) {
  await writeFile(join(root, '404.html'), redirectFallbackPage(serviceOrigin));
}
