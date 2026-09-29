# TapTap website

A dependency-free concept landing page for the TapTap NFC card, hosted from this repository on GitHub Pages at `gigachen.me`.

For card URLs and the redirect service, see [REDIRECTS.md](REDIRECTS.md).

## Local preview

Run `python3 -m http.server 8000` in this directory and open `http://localhost:8000`.

## Source material

- `assets/taptap-preview.png` is the TapTap card concept render.
- The QR in that render is a visual placeholder and does not work.
- The one-time and smart-card options are proposals. This site has no checkout, account, or active subscription service.
- `links.json` and `scripts/generate-redirects.mjs` provide a static redirect prototype; `worker/` contains the HTTP `302` service for a future Cloudflare deployment.

## Publishing and domain

The `CNAME` file points GitHub Pages at `gigachen.me`. Publish the root of `main` from repository Settings → Pages.

Namecheap DNS currently points the root domain to GitHub Pages with these four `A` records for `@`:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

These are GitHub's [recommended apex-domain records](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). The certificate was approved and **Enforce HTTPS** was enabled on 29 September 2026.
