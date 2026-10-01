const LINK_PATH = /^\/r\/([a-z0-9][a-z0-9_-]{2,31})\/?$/;

function validDestination(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (['tap-tap.live', 'www.tap-tap.live', 'go.tap-tap.live', 'gigachen.me', 'go.gigachen.me'].includes(url.hostname) && url.pathname.startsWith('/r/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function messagePage(status, title, message, method = 'GET') {
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · TapTap</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f8ff;color:#13235a;font:16px Arial,sans-serif}main{max-width:460px;padding:32px}h1{font-size:36px;letter-spacing:-.05em}p{line-height:1.6}a{color:#183ba8;font-weight:bold}</style></head><body><main><h1>${title}</h1><p>${message}</p><a href="https://tap-tap.live/">Back to TapTap →</a></main></body></html>`;
  return new Response(method === 'HEAD' ? null : body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    const url = new URL(request.url);
    const match = LINK_PATH.exec(url.pathname);
    if (!match) return messagePage(404, 'Link not found', 'Please check the address on the card.', request.method);
    if (!env.LINKS || typeof env.LINKS.get !== 'function') {
      return messagePage(503, 'Link unavailable', 'Please try again shortly.', request.method);
    }

    let record;
    try {
      const value = await env.LINKS.get(`link:${match[1]}`);
      if (!value) return messagePage(404, 'Link not found', 'Please check the address on the card.', request.method);
      record = JSON.parse(value);
    } catch {
      return messagePage(503, 'Link unavailable', 'Please try again shortly.', request.method);
    }

    if (!record || typeof record !== 'object' || !['active', 'inactive'].includes(record.status)) {
      return messagePage(503, 'Link unavailable', 'Please try again shortly.', request.method);
    }
    if (record.status !== 'active') {
      return messagePage(410, 'Link inactive', 'This TapTap link is not active right now.', request.method);
    }
    const destination = validDestination(record.destination);
    if (!destination) return messagePage(503, 'Link unavailable', 'Please try again shortly.', request.method);

    return new Response(null, {
      status: 302,
      headers: {
        Location: destination,
        'Cache-Control': 'no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  },
};
