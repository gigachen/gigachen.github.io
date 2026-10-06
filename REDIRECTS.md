# TapTap redirect links

Keep the URL printed in a QR code or written to an NFC card stable:

```text
https://tap-tap.live/r/card123/
```

The destination is now stored in a database and can change without rewriting the card. See [ADMIN.md](ADMIN.md) for the panel, database backup, import, and deployment instructions.

## Database redirect service

Local development uses SQLite at `data/redirects.sqlite`. Hosted deployment uses Cloudflare D1, bound as `DB`. Both use the schema in `admin-service/migrations/0001_redirects.sql`:

- `redirects`: unique card ID, HTTPS destination, active/inactive status, and timestamps.
- `redirect_state`: revision used to reject concurrent edits, plus the initial import marker.

Run `npm run admin` to import the existing `links.json` records once and open the panel at `http://127.0.0.1:8788/admin/`. Subsequent saves go to the database. Restarting does not reimport JSON.

`worker/redirect.js` serves uncached HTTP `302` redirects directly from the database. An inactive record returns `410`; an unknown card returns `404`. The same handler runs in the local server and the combined admin Worker. The previous KV binding is no longer used.

The public handler accepts only GET and HEAD and has no write API. Destinations must be HTTPS without embedded credentials and cannot point back to another TapTap redirect. Authenticated admin changes are handled separately by the protected API. Payments, subscriptions, and per-customer management are not implemented.

## Existing GitHub Pages URLs

The public site stays on GitHub Pages. Existing `r/<id>/index.html` pages forward browser visitors to `https://taptap-admin.admin-service.workers.dev/r/<id>/`, which reads D1. Its `404.html` also forwards valid `/r/<id>/` paths, allowing newly created cards to work without another GitHub deployment. Other missing paths remain a normal not-found page. This adds a browser forwarding step before the Worker's uncached HTTP `302`; GitHub Pages itself does not serve a database-backed HTTP redirect.

To regenerate these forwarding pages:

```sh
npm run generate
```

Review, commit, and push the generated pages to `main`. Each card's ID stays the same. Set a card inactive to pause it, or use Delete in the panel to permanently remove it. Deleted card paths still reach the service and show “Link not found.” The hosted database determines the destination and status, so cached forwarding pages do not retain old destinations. Local SQLite edits are separate from production.

For a direct HTTP `302` at the original addresses, an optional future upgrade is to route `tap-tap.live/r/*` and `www.tap-tap.live/r/*` to the combined D1 Worker. This requires a Cloudflare DNS migration, which has not been performed. Browser forwarding already connects those card paths to D1 with the current Name.com DNS.

Previously issued `gigachen.me` URLs are forwarded by the separate [gigachen-me-redirect](https://github.com/gigachen/gigachen-me-redirect) site, preserving paths, query strings, and fragments. That forwarding uses browser-side JavaScript.

## Before physical cards

The domain was changed from `gigachen.me` to `tap-tap.live` on 1 October 2026. DNS validation and the GitHub Pages HTTPS certificate were verified then. Verify each exact public card URL over HTTPS after changing deployment or routing and before issuing cards. Generate a real QR code for that address; the QR in the concept render is a placeholder.

References: [D1](https://developers.cloudflare.com/d1/), [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).
