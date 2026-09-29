# TapTap redirect links

Keep the URL printed in a QR code or written to an NFC card stable:

```text
https://gigachen.me/r/card123/
```

The destination lives elsewhere and can change without rewriting the card. A one-time card can instead store its final destination directly. The redirect route is for the proposed smart card.

## Use it now on GitHub Pages

The repository includes a static proof of concept at `/r/demo/`, which opens this website's public GitHub repository. To make a new link:

1. Add a unique 3–32 character lowercase ID to `links.json`. Use letters, numbers, `_`, or `-`, beginning with a letter or number.
2. Set an HTTPS `destination` and `status` of `active`.
3. Run `node scripts/generate-redirects.mjs`.
4. Commit and push both `links.json` and the generated `r/<id>/index.html` to `main`.
5. Once the page is deployed and HTTPS works, write `https://gigachen.me/r/<id>/` to the card and generate a real QR code for that URL.

Example record:

```json
"card123": {
  "destination": "https://example.com/profile",
  "status": "active"
}
```

To change the destination, edit that record, run the generator, and push again. To disable it, set `status` to `inactive` and regenerate. Keep the ID in `links.json` so a previously issued card cannot accidentally serve an old page. **Do not print or program physical cards using the placeholder QR in the render.**

This prototype uses an HTML/JavaScript redirect, so the first response is HTTP `200`, not HTTP `302`. GitHub Pages caches files, and changes can take minutes to reach everyone. `links.json` is public, so do not place secrets or private destinations in it. It has no customer login, subscription checks, or billing integration. **Use it to test the flow; choose the production URL before issuing physical cards.** Do not use the demo ID for a customer card.

## Real redirect service for smart cards

`worker/redirect.js` is a Cloudflare Worker that returns an uncached HTTP `302`. It reads each card's destination from Workers KV:

```text
card → https://go.gigachen.me/r/card123/ → KV lookup → HTTP 302 → destination
```

Each KV key is `link:<id>`. Its value is JSON such as:

```json
{"destination":"https://example.com/profile","status":"active"}
```

Set `status` to `inactive` to return HTTP `410`. The Worker accepts only HTTPS destinations and has no public write API. Use authenticated Cloudflare tools to change records. An eventual subscription service would update the status after receiving verified billing events; that part is not implemented.

### Deployment path

The domain currently uses Namecheap DNS (`dns1.registrar-servers.com` and `dns2.registrar-servers.com`) with GitHub Pages A records. The recommended production setup uses `go.gigachen.me` for redirects and keeps the main `gigachen.me` website on GitHub Pages:

1. First get `https://gigachen.me/` working with a valid GitHub Pages certificate. Add `gigachen.me` as a Cloudflare zone. Copy **all** existing DNS records into Cloudflare, including any mail or verification records. In Namecheap, change the domain's nameservers to the Cloudflare nameservers assigned to the zone. This changes DNS hosting, not domain registration.
2. Keep the apex A records pointing to GitHub Pages as **DNS only** in Cloudflare. The main site can continue to use this repository and its `CNAME` file.
3. From `worker/`, sign in with `npx wrangler login`, then run `npx wrangler deploy`. The supplied Wrangler configuration deploys a test endpoint on `workers.dev` and provisions the `LINKS` KV binding.
4. In Cloudflare Workers & Pages → the `taptap-redirect` Worker → Settings → Domains & Routes, add the **Custom Domain** `go.gigachen.me`. Cloudflare creates the DNS record and certificate for that subdomain. The main site continues to use GitHub Pages.
5. Add or update a card's record with `npx wrangler kv key put 'link:card123' '{"destination":"https://example.com/profile","status":"active"}' --binding LINKS --remote` from `worker/`.
6. Verify `curl -I https://go.gigachen.me/r/card123/` returns `302` and a `Location` header with the intended destination before putting the URL on a physical card.

Moving nameservers should be planned carefully if the domain later has email or other DNS records. Cloudflare KV is eventually consistent, so changes can take up to about 60 seconds to appear everywhere. Neither the Worker nor the static prototype implements payments or per-customer management yet.

## HTTPS before physical cards

The browser currently shows the site over HTTP, and the HTTPS certificate for `gigachen.me` was not valid when checked on 29 September 2026. The Namecheap DNS records now point to GitHub Pages, but GitHub may still be provisioning the certificate. Check repository Settings → Pages, confirm the custom domain, and enable **Enforce HTTPS** when it becomes available. Use HTTPS URLs on NFC cards and QR codes only after the certificate works. Do not bypass certificate warnings.

If the endpoint must be exactly `gigachen.me/r/<id>/`, a Cloudflare Worker route can do that, but the apex would have to be proxied through Cloudflare. That changes how GitHub Pages receives traffic and needs a separate deployment and HTTPS check. The `go` subdomain avoids touching the existing website origin.

References: [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https), [Cloudflare Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Wrangler KV commands](https://developers.cloudflare.com/workers/wrangler/commands/kv/), [KV consistency](https://developers.cloudflare.com/kv/api/write-key-value-pairs/).
