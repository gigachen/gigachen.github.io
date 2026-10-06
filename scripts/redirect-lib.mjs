export const slugPattern = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function validateDestination(value, { allowService = false } = {}) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter an HTTPS destination of at most 2,048 characters.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a complete HTTPS URL, such as https://example.com/profile.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS URL without embedded credentials.');
  if (['tap-tap.live', 'www.tap-tap.live', 'go.tap-tap.live', 'gigachen.me', 'www.gigachen.me', 'go.gigachen.me'].includes(url.hostname) && url.pathname.startsWith('/r/')) throw new Error('A destination cannot point to another TapTap redirect.');
  if (!allowService && url.hostname === 'taptap-admin.admin-service.workers.dev' && url.pathname.startsWith('/r/')) throw new Error('A destination cannot point to another TapTap redirect.');
  return url.toString();
}

export function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !['active', 'inactive'].includes(record.status)) throw new Error('Choose an active or inactive status.');
  return { destination: validateDestination(record.destination), status: record.status };
}

export function validateRecords(records) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('The redirect data is invalid.');
  for (const [id, record] of Object.entries(records)) {
    if (!slugPattern.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error(`Invalid card ID: ${id}`);
    validateRecord(record);
  }
  return records;
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function redirectPage(record, { allowService = false } = {}) {
  const { status } = record;
  if (!['active', 'inactive'].includes(status)) throw new Error('Choose an active or inactive status.');
  const destination = validateDestination(record.destination, { allowService });
  if (status === 'inactive') return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>TapTap link unavailable</title></head>
<body><main><h1>This TapTap link is unavailable.</h1><p>Please check the card or try again later.</p><a href="/">Back to TapTap</a></main></body>
</html>
`;
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
