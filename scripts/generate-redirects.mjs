import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'r');
const records = JSON.parse(await readFile(join(root, 'links.json'), 'utf8'));
const slugPattern = /^[a-z0-9][a-z0-9_-]{2,31}$/;

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function validateDestination(value) {
  if (typeof value !== 'string') throw new Error('Destination must be a string');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Destination must be an HTTPS URL without embedded credentials');
  if (['tap-tap.live', 'www.tap-tap.live', 'go.tap-tap.live', 'gigachen.me', 'go.gigachen.me'].includes(url.hostname) && url.pathname.startsWith('/r/')) throw new Error('Destination cannot point to another TapTap redirect');
  return url.toString();
}

function activePage(destination) {
  const safeUrl = escapeHtml(destination);
  const jsUrl = JSON.stringify(destination).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta http-equiv="refresh" content="0;url=${safeUrl}">
  <title>Connecting with TapTap…</title>
  <script>location.replace(${jsUrl});</script>
</head>
<body>
  <p>Connecting with TapTap… <a href="${safeUrl}" rel="noreferrer">Continue to the destination</a>.</p>
</body>
</html>
`;
}

function inactivePage() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>TapTap link unavailable</title></head>
<body><main><h1>This TapTap link is unavailable.</h1><p>Please check the card or try again later.</p><a href="/">Back to TapTap</a></main></body>
</html>
`;
}

await mkdir(output, { recursive: true });
const existing = await readdir(output, { withFileTypes: true });
for (const entry of existing) {
  if (entry.isDirectory() && slugPattern.test(entry.name) && !(entry.name in records)) {
    throw new Error(`Removed link ${entry.name} still has a published page. Set its status to "inactive" instead of deleting it.`);
  }
}

for (const [slug, record] of Object.entries(records)) {
  if (!slugPattern.test(slug)) throw new Error(`Invalid link ID: ${slug}`);
  if (!record || typeof record !== 'object' || !['active', 'inactive'].includes(record.status)) throw new Error(`Invalid status for ${slug}`);
  const destination = validateDestination(record.destination);
  const folder = join(output, slug);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'index.html'), record.status === 'active' ? activePage(destination) : inactivePage());
  process.stdout.write(`${slug}: ${record.status} → ${destination}\n`);
}
