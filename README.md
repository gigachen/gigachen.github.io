# TapTap website

A dependency-free concept landing page for the TapTap NFC card, hosted from this repository on GitHub Pages at `tap-tap.live`.

For card URLs and the redirect service, see [REDIRECTS.md](REDIRECTS.md).

## Local preview

Run `python3 -m http.server 8000` in this directory and open `http://localhost:8000`.

## Source material

- `assets/taptap-preview.png` is the TapTap card concept render.
- The QR in that render is a visual placeholder and does not work.
- The one-time and smart-card options are proposals. This site has no checkout, account, or active subscription service.
- `links.json` and `scripts/generate-redirects.mjs` provide a static redirect prototype; `worker/` contains the HTTP `302` service for a future Cloudflare deployment.

## Publishing and domain

The `CNAME` file points GitHub Pages at `tap-tap.live`. Publish the root of `main` from repository Settings → Pages.

Name.com DNS points the root domain to GitHub Pages with these four `A` records for `@`:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Add a `CNAME` record for `www` pointing to `gigachen.github.io`. In Name.com, leave the host blank for each apex A record. Keep Name.com's default nameservers.

These are GitHub's [recommended custom-domain records](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). The custom domain was changed from `gigachen.me` on 1 October 2026. DNS validation succeeded, the certificate was issued, and **Enforce HTTPS** was enabled on 1 October 2026. Both the apex and `www` certificates were verified; `www` redirects to the apex.

The old domain is served by [gigachen-me-redirect](https://github.com/gigachen/gigachen-me-redirect), a separate GitHub Pages site that forwards browser visitors to `tap-tap.live` while preserving paths, query strings, and fragments. It uses JavaScript forwarding, not an HTTP 301. The old domain's Namecheap DNS stays pointed at GitHub Pages.
