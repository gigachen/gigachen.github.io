# gigachen.me

A dependency-free personal website for GitHub Pages.

## Preview

Run `python3 -m http.server 8000` in this directory, then open `http://localhost:8000`.

## Publish

The existing `CNAME` file points GitHub Pages at `gigachen.me`. In repository Settings → Pages, use **Deploy from a branch**, `main`, and `/ (root)`.

At the domain's DNS provider, add these four `A` records for `@` (the root domain):

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

These are GitHub's current [recommended apex-domain records](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). After DNS resolves and GitHub provisions a certificate, enable **Enforce HTTPS** in the Pages settings.

Edit page copy and project links in `index.html`; edit appearance in `styles.css`.
