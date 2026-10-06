# TapTap database admin

The admin panel reads and writes a redirects database. Every record has a permanent card ID, HTTPS destination, active/inactive status, and creation/update timestamps. Updating a destination leaves the NFC/QR URL unchanged. There are no rename or delete actions for issued card IDs.

## Local use

Use Node.js 22.16 or newer, then run:

```sh
npm run admin
```

Open `http://127.0.0.1:8788/admin/`. No npm installation is needed. The local server stores records in **`data/redirects.sqlite`**. On the first start it imports every existing link from `links.json`, in one transaction. Later starts use the existing database; they never reimport stale JSON. Database files are ignored by Git and cannot be downloaded through the admin server.

A save commits to SQLite immediately. Local `/r/<id>/` routes read that database and return uncached HTTP `302` redirects. Inactive records return `410`; unknown IDs return `404`. The admin and card service use the same database. `links.json` and generated HTML pages are now legacy snapshots and are not rewritten on every save.

**The local database does not update production.** Live cards use the separate hosted D1 database. The panel identifies local database mode explicitly.

The server binds only to `127.0.0.1`, validates Host headers, and issues an HttpOnly, SameSite cookie. Mutations require same-origin JSON requests. Use `TAPTAP_ADMIN_PORT` to change the port.

## Back up and export

```sh
npm run database:init
npm run database:backup
```

The backup command uses SQLite's backup API and creates a timestamped database in `data/`; it also works while the panel is running. Keep a copy of backups outside this checkout. When restoring a backup, stop the server first, preserve the current database, and restore into a fresh data directory so an old WAL file cannot be paired with another database.

To export a JSON snapshot for backup or review:

```sh
npm run database:export
```

This is an explicit snapshot operation; the database remains the source of truth. `npm run generate` normally creates forwarding pages using `redirect-service.json`, rather than embedding snapshot destinations. To prepare direct static destinations for an emergency fallback, preserve and temporarily remove that service configuration before generating; review the snapshot before publishing.

## Hosted database service

The admin panel is deployed at **https://taptap-admin.admin-service.workers.dev/admin/**. Its public card redirects use `https://taptap-admin.admin-service.workers.dev/r/<id>/`. The panel copies links on the service where it is opened, so those links read the hosted database immediately. Existing `tap-tap.live` card pages and the fallback for new card paths forward browser visitors to this same service.

The initial access key is saved locally in `data/admin-access-key.txt`, which is ignored by Git. Keep it in your password manager and enter it on the hosted panel. It is also configured as the Worker's private `ADMIN_TOKEN` secret.

Cloudflare D1 uses the same SQLite schema and prepared queries. `admin-service/worker.mjs` serves the admin panel, protected API, and public `/r/<id>/` redirects. It no longer needs GitHub credentials or commits for each save.

The hosted database is separate from the local file. Initial import is explicit; later local edits are not automatically synced to production.

1. From `admin-service/`, sign in and create the database:

   ```sh
   npx wrangler login
   npx wrangler d1 create taptap-redirects
   ```

2. Add the returned `database_id` to the `DB` entry in `admin-service/wrangler.jsonc`. If deploying the standalone redirect Worker in `worker/` too, bind it to that exact same database ID.
3. Apply the schema to the remote database:

   ```sh
   npx wrangler d1 migrations apply taptap-redirects --remote
   ```

4. From the repository root, prepare the initial data from the local database:

   ```sh
   npm run database:seed
   ```

   Then from `admin-service/`, import it:

   ```sh
   npx wrangler d1 execute taptap-redirects --remote --file=seed.sql
   ```

   The generated SQL uses `ON CONFLICT(id) DO NOTHING`, so rerunning it cannot overwrite an existing production destination. Review the file before importing. It contains only redirect data, never credentials. It is an initial import, not a synchronization mechanism.

5. Generate a random admin key and keep it in a password manager:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

6. From `admin-service/`, deploy and set that key as a Worker secret:

   ```sh
   npx wrangler deploy
   npx wrangler secret put ADMIN_TOKEN
   ```

   Before the key is configured, admin API access is denied. Do not put the key in Wrangler `vars`, public assets, Git, or chat messages.
7. Open the returned HTTPS `workers.dev` URL at `/admin/` and sign in. Check the two imported cards and a reviewed save. Verify `/r/<id>/` on this Worker returns the expected `302` and Location.

## Keep already-issued URLs

Cards already point to `https://tap-tap.live/r/<id>/`. Generated forwarding pages and `404.html` connect those exact browser URLs to D1 while retaining the current GitHub Pages and Name.com setup. Existing cards do not need to be rewritten. New valid card paths reach D1 through the 404 fallback; JavaScript is required for that fallback. Known card pages also include a meta refresh and a manual Continue link.

To serve a direct HTTP `302` without browser forwarding, a future upgrade can route **both** `tap-tap.live/r/*` and `www.tap-tap.live/r/*` to the database Worker.

The domain currently uses Name.com DNS and GitHub Pages. Cloudflare Worker routes require a Cloudflare zone and proxied records. Moving DNS hosting requires preserving all DNS records, proxying the appropriate apex/www records, and checking GitHub Pages HTTPS afterward. This change has **not** been made by this implementation. A separate `go.tap-tap.live` custom domain works for new cards but does not change existing card URLs.

Test exact public card URLs after deployment. The old `gigachen.me` forwarding site keeps forwarding paths into `tap-tap.live`.

## Integrity and access

Each database save validates its destination and uses bound SQL parameters. Schema constraints enforce unique IDs, valid status, and ID characters. SQL triggers advance the list revision after every insert/update/delete, including direct database writes. Saves check the expected revision in the mutation statement itself, so concurrent edits cannot silently overwrite newer changes. List reads use a consistent database batch.

Public redirects need no admin key. They can only read destinations. The admin API requires the configured high-entropy key, does not permit cross-origin access, and disables caching. The browser keeps the key only in tab memory. Sign out or reload to clear it; rotate `ADMIN_TOKEN` to revoke it. This version does not implement individual admin accounts or billing.

## Verify

```sh
npm test
```

Tests use temporary SQLite files and the real SQL schema, including persistence across reopening, concurrent connections, seed idempotency, safe backups, protected HTTP saves, and the shared admin/redirect database. Cloudflare account configuration, remote D1, and public DNS routing remain deployment checks.

References: [Node SQLite](https://nodejs.org/api/sqlite.html), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/).
