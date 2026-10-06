import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { slugPattern, validateDestination, validateRecords, redirectPage } from './redirect-lib.mjs';

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
  await writeFile(join(root, '404.html'), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>TapTap link</title></head>
<body><main><h1>Looking for your TapTap link…</h1><p id="message">Please check the address or <a href="/">return to TapTap</a>.</p></main>
<script>
const path = location.pathname;
if (/^\\/r\\/[a-z0-9][a-z0-9_-]{2,31}\\/?$/.test(path)) {
  const target = ${JSON.stringify(serviceOrigin)} + path;
  const link = document.createElement('a');
  link.href = target;
  link.textContent = 'Continue to your card';
  document.getElementById('message').replaceChildren(link);
  location.replace(target);
} else {
  document.querySelector('h1').textContent = 'Page not found';
}
</script>
</body></html>
`);
}
