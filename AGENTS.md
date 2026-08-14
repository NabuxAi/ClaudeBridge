# ClaudeBridge / DigiWP agent guide

> این فایل نقطه شروع همه عامل‌های هوش مصنوعی است. بررسی پایه پروژه در تاریخ
> 2026-08-14 انجام شده است؛ کل پروژه را از ابتدا audit نکنید. ابتدا این سند را
> کامل بخوانید، سپس فقط بخش مرتبط با تغییر خود را دوباره اعتبارسنجی کنید.

## Scope and intent

This file applies to the entire repository.

It records the verified architecture, the honest product boundary, known defects,
security invariants, test baseline, and agreed development order. It is meant to
prevent future agents from rediscovering the same facts or accidentally restoring
UI claims and fake data that were deliberately removed.

The baseline was verified on 2026-08-14 at commit `538de5a` (`main`). Treat dates,
versions, test counts, bundle hashes, and production behavior as a baseline rather
than eternal truth. If a change invalidates a statement here, update this file in
the same change.

Before editing:

1. Read this file completely.
2. Run `git status --short --branch` and preserve unrelated user changes.
3. Inspect the files named in the relevant finding; do not repeat the full audit.
4. Prefer a focused fix with regression coverage over a broad rewrite.
5. Do not claim a production state that was not directly verified.

## Product in one minute

This repository contains three products/layers that share one engine:

```text
Site owner -> Hub (React) -> relay server (Node/PostgreSQL)
                           -> HMAC connector -> managed WordPress site

AI/MCP client --------------------------------> WordPress plugin directly
```

1. `wp-claude-bridge.php`
   - Canonical, single-file WordPress plugin.
   - Turns a WordPress site into an MCP server and also supports stricter Hub
     Connector Mode.
   - PHP 7.4+ / WordPress 5.6+ target.
   - Version at baseline: `3.7.4`.
   - 6,121 lines and approximately 142 advertised tools at baseline: 16 initial
     tools, 79 generated CRUD tools, and 47 appended tools.

2. `server/`
   - Express relay and control plane backed by PostgreSQL.
   - Stores accounts, sites, pairing credentials, policies, events, proposals,
     assistant sweeps, vulnerability intelligence, and alert delivery records.
   - Talks to managed WordPress sites through HMAC-signed connector calls.

3. `hub/`
   - React 18 + Vite customer-facing marketing site and management panel.
   - Production Docker build sets `VITE_USE_MOCK=0` and
     `VITE_API_BASE_URL=/api`; nginx proxies `/api` to `server:8787/v1`.
   - The browser must never receive managed-site secrets or contact sites
     directly.

The source/open-source name is **WP Claude Bridge**. The self-hosted branded
artifact is **DigiWp Ai Bridge**. The customer SaaS/panel is **DigiWP Ai
Support**. Keep these roles explicit instead of mixing the names casually.

## Repository map

- `wp-claude-bridge.php` — canonical plugin source and WordPress admin UI.
- `skills/` — WordPress engineering playbooks bundled with the self-hosted build.
- `server/src/index.js` — Express composition, middleware, protected routes, and
  scheduler startup.
- `server/src/config.js` — all server environment configuration.
- `server/src/db.js` — PostgreSQL schema bootstrapping and the unsafe demo seed
  discussed below.
- `server/src/store.js` — persistent user/site store and public response shapes.
- `server/src/authority.js` / `policy.js` — action classification, owner
  authority, and update policy.
- `server/src/assistant.js` / `sweep.js` — bounded model/tool loop and scheduled
  fleet review.
- `server/src/events.js` / `proposals.js` — audit trail, alerts, approval claims,
  and terminal outcomes.
- `server/src/intel/` — NVD, WordPress.org matching, YARA/signature feeds, and
  hash-only threat intelligence.
- `server/src/routes/` — auth, account, site, connector, and cookbook APIs.
- `server/test/` — Node test suite, including database-dependent integration
  tests.
- `hub/src/lib/api.js` — the only hub API client; real/mock routing happens here.
- `hub/src/lib/auth.jsx` — current bearer-token session state.
- `hub/src/App.jsx` — route table; currently lacks protected-route guards.
- `hub/src/pages/marketing/Landing.jsx` — public promise/feature surface.
- `hub/src/layouts/MarketingLayout.jsx` — public navigation and footer.
- `hub/src/pages/account/` and `hub/src/pages/site/` — account and per-site UI.
- `hub/src/data/mock.js` — development-only data. Never let production silently
  fall back to it.
- `hub/src/styles/app.css` — layout and responsive rules.
- `hub/nginx.conf` — same-origin API proxy and static caching policy.
- `scripts/build-digiwp-ai-bridge.sh` — branded self-hosted artifact.
- `scripts/build-wporg-bridge.sh` — WordPress.org artifact with updater and
  bundled skills stripped.
- `PRODUCT_SPEC.md` — reconstructed product specification; some counts are stale.
- `PROJECT_PROGRESS.md` — detailed history and rationale for past fixes.
- `docs/SECURITY.md`, `docs/RESCUE.md`, `docs/INTELLIGENCE.md` — subsystem intent
  and limitations.

## Verified strengths — preserve these

The strongest part of the product is the server safety model. Do not weaken it
for UI convenience.

- Connector requests are HMAC-SHA256 signed over `timestamp + "\n" + raw body`
  and checked with a replay window.
- Site secrets are returned only once during pairing and excluded from normal
  list/detail responses.
- Authority is three-way:
  - `report`: reads only.
  - `confirm`: prepares exact proposals and waits for the owner.
  - `auto`: may perform recoverable changes unattended.
- Destructive tools require explicit human approval at every authority level.
- Unknown tools and unknown job types fail closed as destructive.
- `job_start` is classified by its nested job type, not merely by the wrapper
  tool name.
- An approval is claimed before execution and can be spent only once.
- A failed approved action records its terminal failure; it is never put back
  into a misleading pending state.
- Audit records distinguish proposed, performed, failed, rejected, and
  unavailable operations.
- UI/server data should distinguish measured, unmeasured, unavailable, healthy,
  and degraded states. Missing data must never become a green zero.
- Alert delivery distinguishes unconfigured, skipped, accepted by a provider,
  and failed. Provider acceptance must never be worded as "the user was
  notified".
- Security intelligence uses hashes for third-party lookup. Do not upload a
  customer's file to VirusTotal or another public malware service.
- Assistant tool loops are step-bounded and sensitive tools are not offered to
  the model.
- The unattended assistant sweep is off unless `ASSISTANT_SWEEP` is explicitly
  enabled.
- The service worker intentionally caches no dashboard data. A stale security
  status is worse than an explicit offline error.

## Honest current feature boundary

### Implemented or materially implemented

- WordPress MCP transport and direct tool execution.
- HMAC Hub Connector Mode, pairing, ping, and live relay.
- Core/plugin/theme inventory and update policy.
- Three-level authority, proposals, approvals, and audit trail.
- Site readings, event/incidence model, and limited health probes.
- Malware/signature scan and WordPress core checksum integrity.
- NVD-based vulnerability matching with WordPress.org confirmation.
- Local database backups, optional `wp-content` zip, listing, reading, pruning,
  and database restore jobs.
- Conflict bisect, rescue inventory/audit/key rotation/verification steps.
- Performance measurement and server-side recommendation recipes.
- Telegram operator digest machinery and multi-channel owner alert dispatcher.
- Assistant answers/tool loop and optional scheduled fleet sweep.
- Plugin manifest/update channel and two release variants.

### Partial, limited, or easy to misdescribe

- Monitoring probes currently cover the homepage and `wp-login`; checkout,
  payment gateway, contact form, and arbitrary business transactions are not
  continuously monitored.
- Automatic updates use WordPress background updates. The manual update job
  takes a database snapshot, but there is no complete file rollback path.
- Backups are local to the managed site, not off-site, not independently
  encrypted, and not a disaster-recovery guarantee.
- The security scan is signature/heuristic based. A clean result is not proof
  that a site is uncompromised.
- The assistant can operate without a model gateway, but then it cannot reason
  beyond deterministic readings and must say so.
- Owner-alert machinery exists, but a deployment with no configured owner
  channel reaches only the operator or nobody. Check `/alerts/readiness`.

### Not built at baseline

- Real billing, subscriptions, payment gateways, invoices, trial expiry, plan
  entitlements, or site-count enforcement.
- Password-reset email/token flow.
- Two-factor authentication, passkeys, session/device management, token
  revocation before expiry, or "log out all devices".
- Account deletion workflow.
- Team invitations, multi-user RBAC, or per-site member permissions.
- Persistent notification preferences or quiet hours.
- Browser push subscription enrollment from the hub.
- Off-site encrypted backups and automated restore drills.
- Staging/canary update execution and automatic file rollback.
- Configurable synthetic checkout/form/business-journey monitoring.

Do not present anything in this section as live until server behavior, UI,
tests, and operational configuration all exist.

## Known P0 findings

### P0.1 — production can seed a known demo account

`server/src/db.js` always calls `seedDemo()` after schema initialization. An
empty database receives:

```text
maryam@example.com / demo1234
```

There is no development-only environment guard. `NODE_ENV=production` does not
prevent the seed. This is a production credential vulnerability, not sample
data cleanup.

Required fix and acceptance criteria:

- Require an explicit development-only flag such as `SEED_DEMO=1`.
- Refuse or ignore demo seeding in production.
- A fresh production database must remain user-empty.
- Add a test that boots/migrates an empty production-style database and proves
  the known account does not exist.
- Check the live database for the account. Do not state that it exists or remove
  it without direct production verification and authorization.
- If found in production, remove/disable it and rotate any credentials or data
  it could access.

Relevant lines: `server/src/db.js:101-120`, `server/src/seed.js:3-7`.

### P0.2 — customer purchase/trial flows are simulations

The public site advertises a 14-day trial, paid plans, and checkout. The server
explicitly returns `NOT_BUILT` for billing and invoices.

- `hub/src/pages/billing/Checkout.jsx` defines three Iranian gateways but
  `pay()` only navigates to the fixed route `/invoice/INV-1403-014`.
- `server/src/routes/account.js` says no gateway is connected, no card is stored,
  and no invoices are issued.
- Every new user currently gets the database default plan (`حرفه‌ای`); there is
  no trial clock or entitlement enforcement.

Until implemented, replace purchase actions with an honest pilot/waitlist/demo
state. Never leave a control labeled "پرداخت امن" that performs no payment.

Relevant lines: `hub/src/pages/billing/Checkout.jsx:20-23`,
`server/src/routes/account.js:44-56`, `server/src/db.js:31`.

### P0.3 — password reset reports a false success

`hub/src/pages/auth/Reset.jsx` waits 600 ms and says an email was sent. There is
no reset endpoint or mail/token flow in `server/src/routes/auth.js`.

Required short-term behavior: disable the action or say plainly that recovery
requires support. Required real behavior: single-use expiring tokens, hashed
token storage, enumeration-safe responses, rate limits, transactional email,
password rotation, and tests.

Relevant lines: `hub/src/pages/auth/Reset.jsx:7-17`.

### P0.4 — "Safe Mode" has no complete update rollback

Safe mode currently forces core/plugin/theme background updates on. The queued
manual update path calls:

```php
cb_backup_run( array( 'label' => 'pre-update', 'files' => false ) );
```

That database dump cannot restore plugin/theme PHP files after a broken update.
WordPress background updates can bypass even this database-only snapshot.

Do not market the current setting as a safe-update guarantee. A real safe update
pipeline needs:

- preflight disk/PHP/WordPress compatibility checks;
- a file-capable snapshot or a guaranteed source-version rollback artifact;
- one item per transaction/wave;
- post-update homepage, login, REST, cron, and optional business-journey checks;
- automatic rollback on a failed health check;
- a durable record of the old/new version and rollback outcome.

Relevant lines: `wp-claude-bridge.php:2657-2750`,
`wp-claude-bridge.php:4098-4178`, `server/src/policy.js`.

### P0.5 — database backups can live under a public uploads URL

`cb_backup_dir()` writes to `wp-content/uploads/cb-backups`. It creates
`.htaccess` and `index.php`, but nginx ignores `.htaccess`, and direct filenames
can still be served if the web server is not separately configured.

The random six-character suffix reduces guessing; it is not an access-control
boundary. Database dumps contain credentials, tokens, personal data, and site
content.

Required direction:

- Prefer storage outside the document root.
- Add explicit nginx/IIS/Apache protection where local storage remains.
- Encrypt snapshots at rest with per-site/account key management.
- Add optional off-site S3-compatible storage and retention policies.
- Verify that public HTTP requests cannot retrieve a known backup filename.
- Never log or expose the physical backup path.

Relevant lines: `wp-claude-bridge.php:623-646`,
`wp-claude-bridge.php:725-807`.

## Known P1 findings

### P1.1 — landing page overflows on mobile

Verified on `https://ai.digiwp.com/` at an effective 375 px viewport:

- document width: 500 px;
- horizontal scrollbar present;
- Hero status card exits the left edge;
- heading/buttons become awkwardly narrow.

The main cause is the two-column inline Hero grid in
`hub/src/pages/marketing/Landing.jsx`; `hub/src/styles/app.css` collapses generic
`.dwp-grid-*` classes but has no mobile rule for `.dwp-hero`.

Acceptance criteria:

- No horizontal overflow at 320, 360, 375, 390, 768, 1024, and desktop widths.
- Hero becomes one column on mobile with sensible content order.
- The status card stays entirely inside the viewport.
- CTA labels remain readable and keyboard focus remains visible.
- Add a Playwright/component regression check rather than relying only on a
  screenshot.

Relevant lines: `hub/src/pages/marketing/Landing.jsx:38-78`,
`hub/src/styles/app.css:59-80`.

### P1.2 — public navigation contains dead or misleading controls

- Landing "تماشای دمو" is a button with no action.
- Nine footer links point to `#`.
- Registration terms and privacy links point to `#`.
- The terms checkbox is checked by default and not part of validated form state.
- Copyright displays ۱۴۰۳ at the 2026/1405 baseline.

Fix links or remove them. Legal consent must be explicit, required, versioned,
and backed by real documents before public registration is treated as launch
ready.

Relevant files: `hub/src/pages/marketing/Landing.jsx`,
`hub/src/layouts/MarketingLayout.jsx`, `hub/src/pages/auth/Register.jsx`.

### P1.3 — protected UI routes are not protected in the router

`/app`, `/site/:siteId`, `/onboarding`, `/checkout`, and invoice routes render
without a route-level authentication gate. Visiting `/app` without a session
was verified to render the account shell and then fail its sites request instead
of redirecting cleanly to login.

`AccountShell` also falls back to the demo-looking initials/name when `user` is
null.

Add a `ProtectedRoute`/authenticated layout that waits for `AuthProvider.ready`,
redirects anonymous users, preserves the intended destination, and handles 401
globally. Do not leak protected shell content before readiness is known.

Relevant files: `hub/src/App.jsx`, `hub/src/lib/auth.jsx`,
`hub/src/layouts/AccountShell.jsx`, `hub/src/layouts/SiteShell.jsx`.

### P1.4 — account UI still contains inert controls and invented rows

The server honestly labels team and notification preference systems as not
built, but the UI still renders active-looking controls:

- Team invite fields and "ارسال دعوت" have no handler.
- A fixed pending invitation for `sara@digiwp.com` is always rendered.
- Notification switches and quiet-hour selects are uncontrolled and not saved.
- Browser push switch has no permission/subscription flow.

Prefer `NotMeasured`/`NotBuilt` UI until endpoints exist. A visible disabled
control must explain why it is disabled. Do not show personal-looking sample
rows inside a signed-in real account.

Relevant files: `hub/src/pages/account/Team.jsx`,
`hub/src/pages/account/Notifications.jsx`,
`server/src/routes/account.js:38-69`.

### P1.5 — frontend quality gate is incomplete

- `hub/package.json` defines `npm run lint`, but ESLint is not declared and no
  ESLint config exists.
- CI builds the hub but does not lint or test it.
- There are no React component or browser end-to-end tests.
- All route pages are imported eagerly from `hub/src/App.jsx`.
- Baseline production build: main JS about 435.84 kB raw / 117.98 kB gzip,
  CSS about 41.40 kB raw / 7.31 kB gzip.

Add ESLint, a React test runner, critical Playwright flows, route-level lazy
loading, and bundle/performance budgets.

### P1.6 — docs and marketing counts/claims drift

- `PRODUCT_SPEC.md` says the plugin exposes 58 tools.
- `README.fa.md` says more than 100 tools.
- The source definition produces approximately 142 tools at baseline.
- README badges still mention version 3.6.0 while the plugin is 3.7.4.
- "No third party" language needs nuance: the optional screenshot tool sends a
  public URL to WordPress.com mShots; integrity/rescue use WordPress.org APIs;
  server intelligence uses NVD, raw GitHub YARA feeds, abuse.ch, and optional
  VirusTotal hash lookup.

Generate version/tool-count documentation where possible and maintain a clear
external-services/privacy disclosure. Optional external calls are acceptable;
hidden external calls are not.

## Product truth rules

These rules override visual mockups and optimistic marketing copy:

1. Never fabricate site metrics, incidents, colleagues, cards, invoices,
   notification channels, uptime, storage, update counts, or activity.
2. Never use mock data as a fallback after a live request fails. A failed reading
   is unavailable/degraded, not healthy.
3. A price page is a customer contract. List only current features or clearly
   label roadmap/pilot features.
4. A button must either perform its labeled action, navigate to an honest
   explanation, or be removed/disabled with a reason.
5. "Backup created" and "backup restorable" are different claims. Preserve the
   `verified` distinction and add restore drills before claiming disaster
   recovery.
6. "Alert provider accepted" and "owner read the alert" are different claims.
7. "Scan clean" and "site uncompromised" are different claims.
8. "Update completed" and "site still works" are different claims. The latter
   requires health checks.
9. "Automatic" does not mean "safe" unless rollback is tested.
10. State exactly which scope was measured: homepage/login is not checkout,
    contact form, payment gateway, or full uptime monitoring.

## Security and privacy invariants

- Production must have an `AUTH_SECRET` of at least 32 characters; the server
  must refuse weak/default secrets.
- Set `TRUST_PROXY=0` wherever the server is directly reachable. Trust forwarded
  IP headers only behind a controlled proxy.
- Keep raw-body capture bounded; connector signatures depend on exact bytes.
- Never expose site shared secrets after pairing or place them in normal logs.
- Preserve replay protection and constant-time signature comparison.
- Preserve generic login errors and dummy password verification to avoid account
  enumeration.
- Rate limits are currently in process memory. Before horizontal scaling, move
  them to a shared store or document the multiplied effective limit.
- Hub bearer tokens currently live in `localStorage` for seven days. Treat XSS as
  session compromise. A future migration to secure, HttpOnly, SameSite cookies
  should include CSRF design and token revocation rather than a partial switch.
- Direct MCP query-string tokens can leak through logs/history/referrers. Prefer
  Application Passwords, OAuth, or HMAC Connector Mode and deprecate URL tokens
  carefully for compatibility.
- Do not add dangerous operations to the recoverable/auto list simply to make a
  UI flow easier.
- Database restore, file deletion/editing, theme activation, unknown tools, and
  update/restore jobs must remain human-approved unless a separately designed
  reversible transaction proves otherwise.
- Do not upload customer source files or malware samples to public third-party
  analysis services.
- Add hub/nginx security headers deliberately; API headers in `server/src/index.js`
  do not protect the static React document.

## Current operational assumptions

- One relay server can serve many sites; pairing secret is per site.
- The hub is the only intended browser client of the server API.
- `DATABASE_URL` is required for real server operation.
- `LIVE=1` enables real connector relay.
- `PUBLIC_BASE_URL` is handed to connectors. A wrong value at pairing can strand
  future plugin updates.
- `ASSISTANT_URL` and `ASSISTANT_API_KEY` enable model reasoning.
- `ASSISTANT_SWEEP` is intentionally off by default because it costs tokens and
  can perform recoverable changes on `auto` sites.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` reach the operator, not the site
  owner.
- Owner channels require both provider-side configuration and user contact data.
- In-process schedules are acceptable for the current single-instance baseline,
  but durable jobs/locks are required before multi-instance scaling.

## Verified test/build baseline

Verified on 2026-08-14:

- `php -l wp-claude-bridge.php` — passed.
- Hub production build — passed.
- Server suite after generated release artifacts, without PostgreSQL:
  - 264 tests discovered;
  - 260 passed;
  - 0 failed;
  - 4 skipped because `CB_TEST_DATABASE_URL` was not set.
- The skipped tests cover database properties such as pairing flow, proposal
  outcome/claim behavior, and audit persistence. A no-database green run is not
  the full release gate.
- `PROJECT_PROGRESS.md` records the full PostgreSQL baseline as 285 passing,
  none skipped. Re-run rather than relying on that count after changes.

### Canonical release verification

On Linux/CI or an environment with bash, PHP, zip, Node, and PostgreSQL:

```bash
bash scripts/build-digiwp-ai-bridge.sh
bash scripts/build-wporg-bridge.sh
php -l wp-claude-bridge.php
php -l dist/digiwp-ai-bridge/digiwp-ai-bridge.php
php -l dist/digi-ai-bridge/digi-ai-bridge.php

cd server
npm ci
CB_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:5432/cbtest npm test

cd ../hub
npm ci
npm run build
```

Build plugin artifacts before the server suite. At baseline,
`plugin-tool-dispatch.test.js` reads both generated PHP files directly and can
fail with `ENOENT` if `dist/` has not been built.

`npm run lint` in `hub/` is not a valid gate until ESLint and its configuration
are added. Fix the gate rather than deleting the script.

## Immediate development order — Sprint 0

Do this before expanding the feature list:

1. **Production seed safety**
   - Guard/remove demo seed.
   - Add database regression coverage.
   - Separately verify the live database with authorization.

2. **Honest customer flows**
   - Replace fake checkout/invoice/reset flows with an explicit pilot state, or
     implement them end to end.
   - Remove inert controls and invented personal rows.
   - Add real terms/privacy pages and explicit consent.

3. **Authentication UX**
   - Add protected routes, global 401 handling, loading/error states, and return
     path after login.

4. **Responsive public page**
   - Fix Hero/mobile overflow, footer links, demo CTA, and stale copyright.
   - Add viewport regression tests.

5. **Frontend quality gate**
   - Add ESLint/config, React tests, Playwright critical flows, and CI steps.
   - Introduce route-level code splitting and a bundle budget.

6. **Backup and update safety design**
   - Close public-backup exposure.
   - Design file rollback and post-update health checks before describing Safe
     Mode as safe.

## Recommended roadmap after Sprint 0

### Product foundation

- Billing/trial/subscription/entitlement service with webhook reconciliation and
  idempotency.
- Password recovery, 2FA/passkeys, device/session list, revocation, and account
  deletion.
- Team invitations, roles, per-site grants, and immutable permission audit.
- Persistent notification preferences, contact enrollment, push subscription,
  and channel readiness UX.

### Site safety

- Off-site encrypted backups, retention tiers, restore drills, and recovery
  objectives.
- Transactional update pipeline with canary/waves, file+DB rollback, and health
  verification.
- Configurable synthetic journeys: checkout, forms, cron, REST, login, SSL and
  domain expiry.
- Real uptime history and SLO/incident calculations instead of snapshot-only
  status.

### Scale and operability

- Durable worker/queue and distributed scheduler locks.
- Structured logs, metrics, tracing, error aggregation, and per-site correlation
  IDs without secret leakage.
- OpenAPI/schema-generated clients and contract tests between hub/server/plugin.
- Modular plugin source compiled into the single-file release artifact.
- Feature flags and deployment/readiness checks for external integrations.

### Broader product ideas

- WooCommerce transaction monitoring and failed-order/payment diagnostics.
- Agency white-label dashboards, client access, scheduled reports, and SLA views.
- Webhooks and Slack/Telegram/email/ticketing integrations.
- AI change plans with evidence, exact diffs, risk score, budget/cost ceilings,
  and rollback proof.
- Site baselines and drift detection for plugins, files, admins, DNS, SSL, and
  performance.
- Maintenance windows and fleet-wide staged rollout policies.

## Definition of done for future changes

A change is not done merely because the UI renders or one test passes.

- Relevant unit and integration tests pass.
- Database-dependent behavior is tested against real PostgreSQL when applicable.
- Plugin changes are verified in canonical source and both generated artifacts.
- PHP syntax passes for every shipped PHP file.
- Hub builds, lints, and relevant component/E2E tests pass once those gates exist.
- Mobile and desktop behavior are checked for user-facing layout changes.
- Security classification and approval behavior are mutation/regression tested
  for any new tool or job type.
- Error, unavailable, timeout, and unpaired states are represented honestly.
- No mock or invented data appears in real-account paths.
- Marketing/docs match the implemented behavior and version.
- No secret, generated credential, personal data, node modules, transient store,
  or unrelated artifact is committed.
- `git status` contains only intentional changes.
- Update this `AGENTS.md` when architecture, feature boundary, verified baseline,
  or priority findings change.

## Guidance for reviews and bug fixes

- For a narrow task, inspect only the relevant section and named files, then
  verify the affected behavior. Do not repeat the entire repository audit.
- For a security-sensitive change, trace browser -> server -> connector ->
  WordPress and test the boundary at each hop.
- For a new customer-facing feature, prove the backend, persistence, permissions,
  failure state, and operational configuration before enabling its UI.
- For performance work, measure first and preserve correctness/auditability over
  micro-optimizations.
- For production incidents, do not mutate production from assumptions in this
  document. Verify the live state, obtain the required authorization, and record
  exactly what was changed.
