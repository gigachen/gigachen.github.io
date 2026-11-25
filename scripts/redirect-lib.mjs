export const slugPattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;

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

const openingTitle = 'Opening your TapTap link…';
const continueLabel = 'Continue to your link';

function renderRedirectPage({ heading, detail = '', href = '/', action = 'Back to TapTap', redirecting = false, head = '', script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#f6f8ff">
  <link rel="icon" type="image/svg+xml" href="/taptap-icon.svg">
  <title>${heading}</title>${head}
  <style>
    * { box-sizing: border-box; }
    body {
      display: grid;
      place-items: center;
      min-height: 100vh;
      min-height: 100svh;
      margin: 0;
      padding: 20px;
      background: radial-gradient(ellipse at 50% 35%, #e9f0ff, #f6f8ff 70%);
      color: #13235a;
      font: 16px Arial, Helvetica, sans-serif;
    }
    main {
      width: min(100%, 440px);
      padding: clamp(24px, 8vw, 44px);
      border: 1px solid #cbd5ee;
      border-radius: 28px;
      background: #fff;
      box-shadow: 0 16px 48px #183ba814;
      text-align: center;
    }
    .signal {
      position: relative;
      display: grid;
      place-items: center;
      width: 128px;
      height: 128px;
      margin: 0 auto 12px;
    }
    .signal img { position: relative; }
    .signal::before, .signal::after {
      content: '';
      position: absolute;
      inset: 14px;
      border: 1px solid #a9c8ef;
      border-radius: 50%;
    }
    .signal::after { inset: 24px; }
    h1 {
      margin: 0;
      font-size: clamp(26px, 6vw, 34px);
      line-height: 1.12;
      letter-spacing: -.04em;
      text-wrap: balance;
    }
    .detail { margin: 12px 0 0; color: #5d6989; line-height: 1.5; }
    [data-redirecting] .detail { display: none; }
    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      margin-top: 22px;
      padding: 8px 18px;
      border: 1px solid #cbd5ee;
      border-radius: 100px;
      background: #f6f8ff;
      color: #183ba8;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
    }
    a:hover { background: #e9f0ff; }
    a:focus-visible { outline: 2px solid #183ba8; outline-offset: 4px; }
    @media (prefers-reduced-motion: no-preference) {
      [data-redirecting] .signal::before, [data-redirecting] .signal::after {
        animation: signal-pulse 1.6s ease-out 3;
      }
      [data-redirecting] .signal::after { animation-delay: -.8s; }
    }
    @keyframes signal-pulse {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(1.45); }
    }
  </style>
</head>
<body>
  <main${redirecting ? ' data-redirecting' : ''}>
    <div class="signal" aria-hidden="true"><img src="/taptap-icon.svg" width="64" height="64" alt=""></div>
    <h1>${heading}</h1>${detail ? `\n    <p class="detail">${detail}</p>` : ''}
    <a href="${escapeHtml(href)}" rel="noreferrer">${action}</a>
  </main>${script ? `\n  <script>${script}</script>` : ''}
</body>
</html>
`;
}

export function redirectPage(record, { allowService = false } = {}) {
  const { status } = record;
  if (!['active', 'inactive'].includes(status)) throw new Error('Choose an active or inactive status.');
  const destination = validateDestination(record.destination, { allowService });
  if (status === 'inactive') return renderRedirectPage({
    heading: 'This TapTap link is unavailable.',
    detail: 'Please check the card or try again later.',
  });
  const jsUrl = JSON.stringify(destination).replaceAll('<', '\\u003c');
  return renderRedirectPage({
    heading: openingTitle,
    href: destination,
    action: continueLabel,
    redirecting: true,
    head: `\n  <noscript><meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}"></noscript>`,
    script: `location.replace(${jsUrl});`,
  });
}

export function redirectFallbackPage(serviceOrigin) {
  return renderRedirectPage({
    heading: 'Page not found',
    detail: 'Please check the address and try again.',
    script: `
    const path = location.pathname;
    if (/^\\/r\\/[a-z0-9][a-z0-9_-]{0,31}\\/?$/.test(path)) {
      const target = ${JSON.stringify(serviceOrigin)} + path;
      const title = ${JSON.stringify(openingTitle)};
      document.querySelector('main').dataset.redirecting = '';
      document.querySelector('h1').textContent = title;
      document.title = title;
      const link = document.querySelector('main a');
      link.href = target;
      link.textContent = ${JSON.stringify(continueLabel)};
      location.replace(target);
    }
  `,
  });
}
