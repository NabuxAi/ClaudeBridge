# DigiWP Ai Support — Server (سرور واسط)

The **واسط** — the only backend the hub talks to, and the only thing that talks
to the managed sites. It completes the architecture:

```
شما → Hub (React)  ──►  THIS server  ──►  WP Claude Bridge connector  ──►  managed WP site
        hub/                server/            (wp-claude-bridge.php)
```

The hub sends no site URLs or tokens; it calls this server, which stores each
site's pairing credentials and relays **HMAC-signed** commands to that site's
connector — using the exact signature the plugin's *Hub Connector Mode* verifies.

## Run

Needs a **PostgreSQL** database (set `DATABASE_URL`). The quickest way is the
whole stack — `docker compose up` from the repo root brings up Postgres + this
server + the hub together. To run the server alone against your own Postgres:

```bash
cd server
npm install
cp .env.example .env                       # set DATABASE_URL
npm start          # http://localhost:8787   (health: /health)
npm test           # proves the HMAC scheme matches the plugin byte-for-byte
```

On first boot it migrates the schema and seeds a demo user
(`maryam@example.com` / `demo1234`) with 3 sites. Point the hub at it: in
`hub/.env` set `VITE_API_BASE_URL=http://localhost:8787/v1` and `VITE_USE_MOCK=0`.
Set `LIVE=1` to relay reads/actions to live paired sites.

## Pairing a real site (end-to-end)

1. Hub → **افزودن سایت** (`POST /v1/sites`) → the response returns a one-time
   **shared secret** + **server URL**.
2. On the target site: install WP Claude Bridge → **Tools → Claude Bridge →
   Hub Connector Mode** → enable, paste the server URL + secret, save.
   (Optional: tick "announce this site" → the plugin signs & POSTs
   `/v1/connector/register`, which this server verifies and marks paired.)
3. Hub → **بررسی اتصال** (`POST /v1/sites/:id/ping`) → this server calls the
   signed `/connector/ping` on the site; a 200 confirms the bridge is live.

From then on the plugin refuses every request that isn't signed by this server.

## Endpoints (mounted under `/v1`)

| Area | Routes |
|---|---|
| Auth (public) | `POST /auth/login` · `POST /auth/register` · `GET /auth/me` |
| Account | `GET/POST /sites` · `GET /billing` · `/billing/invoices[/:id]` · `/billing/plans` · `/team` · `/notifications` · `/profile` |
| Per-site | `GET /sites/:id/{overview,incidents,updates,security,backups,settings}` · `GET /sites/:id/pairing` · `POST /sites/:id/ping` · `POST /sites/:id/actions` · `POST /sites/:id/assistant` |
| Connector (signed, from the plugin) | `POST /connector/register` |

## Guardrails

- **Sensitive actions always require approval** (`delete_plugin`, `activate_theme`,
  `edit_file`, `db_query`, …) regardless of a site's authority level — the relay
  returns `202 requiresApproval` until called again with `approved: true`.
- Shared secrets are never returned in list/detail responses (only once, at
  pairing time). Data lives in PostgreSQL via `store.js` (parameterized queries)
  and set a real `AUTH_SECRET`.
