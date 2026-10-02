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
   - Current release: `3.9.1` (verified 2026-10-02) — the `render_blocks`
     content-placement fix in the shared block compiler (`3.9.1`) on top of
     the 2026-09-29 smart-design wave (seven Gutenberg block / Elementor
     tools, `3.9.0`) and the 2026-09-28 transactional safe-update pipeline
     (P0.4).
   - 151 advertised tools: 17 initial tools, 79 generated CRUD tools, and 55
     appended tools (48 before the design wave plus the seven `3.9.0` design
     tools: `list_block_types`, `render_blocks`, `create_block_page`,
     `append_blocks`, `list_elementor_widgets`, `elementor_page_create`,
     `elementor_section_append`). Counted from the source on 2026-09-29; the
     previous "16 initial / 50 appended ≈ 145" split was already off — the
     initial array holds 17 entries and the pre-design appended section 48.

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
- `skills/` — repository-side WordPress engineering playbooks. As of `3.7.5`
  they are not copied into either WordPress release archive; security-review
  documents contain literal vulnerable-code examples that do not belong in a
  site's executable webroot. As of `3.7.6`, the DigiWP server exposes them as
  read-only, path-validated JSON and the plugin loads requested files on demand.
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
- `server/src/routes/` — auth, account, site, connector, cookbook, on-demand
  playbook, admin, billing, team, notifications, and offsite-backup APIs.
- `server/test/` — Node test suite, including database-dependent integration
  tests.
- `hub/src/lib/api.js` — the only hub API client; real/mock routing happens here.
- `hub/src/lib/auth.jsx` — current bearer-token session state.
- `hub/src/App.jsx` — route table; protected routes sit behind
  `hub/src/lib/ProtectedRoute.jsx` (P1.3) and pages are lazy-loaded (P1.5).
- `hub/src/pages/marketing/Landing.jsx` — public promise/feature surface.
- `hub/src/layouts/MarketingLayout.jsx` — public navigation and footer.
- `hub/src/pages/account/` and `hub/src/pages/site/` — account and per-site UI.
- `hub/src/data/mock.js` — development-only data. Never let production silently
  fall back to it.
- `hub/src/styles/app.css` — layout and responsive rules.
- `hub/nginx.conf` — same-origin API proxy and static caching policy.
- `scripts/build-digiwp-ai-bridge.sh` — branded self-hosted runtime artifact;
  deliberately excludes repository development playbooks.
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
- Transactional manual update pipeline (`3.8.0`): preflight, per-wave file
  snapshots, health gates, automatic plugin/theme rollback, durable journal —
  see P0.4 for the honest boundaries.
- Block/Elementor design tools (`3.9.0`): `render_blocks` compiles JSON block
  specs into Gutenberg markup and returns it — a pure preview, nothing is
  saved; `create_block_page` and `elementor_page_create` create new pages
  from structured block / section-column-widget specs and default to `draft`
  so a human reviews before anything goes live; `append_blocks` and
  `elementor_section_append` append to an existing page in place and are
  classified sensitive at every authority level — `edit_file`'s precedent,
  pinned in `server/src/authority.js:121-126`; the Elementor tools work only
  when Elementor is active and refuse honestly otherwise, and only block
  names / widget types registered on the site are accepted. Two more honesty
  gates pinned in tests: `append_blocks` refuses Elementor builder-mode pages
  (post_content changes there are invisible to visitors) and reports whether
  revisions are actually enabled for that post type instead of promising an
  undo that may not exist; and `classify()` treats `status: 'publish'` on the
  two create tools as sensitive — the draft default is a convention, the
  status argument is the decision, so publishing asks a human even under
  `auto`.
- Three-level authority, proposals, approvals, and audit trail.
- Session/device management with server-side revocation (2026-10-01): every
  login/register token now carries a random `jti`, and `requireAuth`
  (`server/src/auth.js:133-158`) resolves SHA-256 of that jti to a live row in
  the `sessions` table (`server/src/sessions.schema.js`,
  `server/src/sessions.store.js`) — missing, revoked, or expired rows all mean
  401, so "log out this device" and "log out other devices" are real writes,
  not wishes. Routes: `GET /auth/sessions` (own sessions, no hashes, current
  marked), `DELETE /auth/sessions/:id` (own rows only, scoped by user_id),
  `POST /auth/sessions/revoke-others`. `last_seen_at` is throttled to one
  write per minute per session; expired rows are pruned on the user's next
  login. The hub page is `/app/security` (`hub/src/pages/account/Security.jsx`)
  with the current session marked and per-device logout. Deliberate breaking
  change: tokens issued before this wave carry no jti and are rejected — every
  existing user must sign in again once after deploy. One carve-out, pinned in
  tests: purpose-scoped tokens (`payload.kind`, e.g. the 5-minute
  `backup_download` capability) keep their stateless short-lived semantics —
  they are not login sessions. `POST /auth/logout` (2026-10-02 review-fix
  wave) now revokes the session the request rides in on — pinned in
  `server/test/sessions.test.js` — and the account-shell header «خروج» button
  (`hub/src/layouts/AccountShell.jsx`) calls it before clearing the browser's
  localStorage, so a token copied off a shared device dies server-side instead
  of living out its 7 days. Still unbuilt: auto-revoking sessions on password
  reset.
- Two-factor login with TOTP (2026-10-02): RFC 6238 (HMAC-SHA1, 30-second
  step, 6 digits, ±1-step window) on `node:crypto` alone in
  `server/src/totp.js` — base32 codec, code generator, constant-time
  verifier, otpauth URI; no new dependency. State lives in the
  `two_factor` + `two_factor_recovery` tables
  (`server/src/twofactor.schema.js`, `server/src/twofactor.store.js`): the
  base32 secret held as `pending` until `active`, recovery codes stored only
  as SHA-256 hashes of their normalized (uppercase, dash-less) form. Routes,
  all session-token-only: `GET /auth/2fa/status` (enabled/pending/codes left —
  never the secret), `POST /auth/2fa/setup` (fresh secret + otpauth URI;
  refused while active; re-setup replaces any abandoned pending secret),
  `POST /auth/2fa/activate` (first correct code turns the factor on and
  returns the 8 recovery codes — the only response that ever carries them),
  `POST /auth/2fa/disable` (current password + a TOTP or recovery code).
  Login with an active factor answers a correct password with
  `{totp_required: true}` and issues no session until a code arrives; a wrong
  code is a 401 «کد ورود دو مرحله‌ای درست نیست.» that feeds the same per-IP
  and per-account login limiters — code guessing is priced exactly like
  password guessing, and the fail counters clear only after the second factor
  passes. Ownership change, deliberate: `two_factor` is no longer writable
  through `PATCH /account/profile` (`users.update` dropped it from its allow
  list) — the display flag is synced only by activate/disable, and account
  deletion purges both 2FA tables explicitly (the tombstoned user row never
  cascades). Hub: the «ورود دو مرحله‌ای» card on `/app/security`
  (`hub/src/pages/account/Security.jsx` — URI + manual secret with copy
  buttons, activate form, one-time recovery-code display behind an explicit
  warning, disable form behind password + code) and a second step on the
  login form that re-submits email/password with `code`. Pinned in
  `server/test/totp.test.js` (the RFC vectors and window tests run
  everywhere; the enrollment/login/disable flow needs real PostgreSQL).
  Honest boundaries: no QR image is rendered — the otpauth URI and secret are
  text the user copies or pastes into their app; a lost phone with zero
  remaining recovery codes has no self-service recovery path; 2FA is not
  demanded at registration, and register-time enforcement does not exist.
- Configurable HTTP uptime monitors with real availability history
  (2026-10-02, the «مانیتورها» wave): per-site monitor rows (`site_monitors`:
  label, url, `expect_status` default 200, optional `expect_contains`,
  enabled) and every check attempt recorded (`monitor_results`), created by
  `server/src/monitors.schema.js` and wired into the schema concat in
  `server/src/db.js`. The scheduler runs every enabled monitor of every
  non-tombstoned site (`server/src/monitors.runner.js`, started beside the
  digest/intel/sweep schedulers in `server/src/index.js`) — one plain HTTP GET
  per URL with a 10 s timeout, redirects followed, no JavaScript, no login;
  the interval is `MONITOR_INTERVAL_MINUTES` (default 5, 0 disables the
  schedule; manual «بررسی الان» still works). The honest scope label
  «بررسی دسترسی HTTP، نه سفر کاربری/پرداخت» travels in every API response.
  Routes in `server/src/routes/monitors.js` (mounted with requireAuth):
  GET/POST/PATCH/DELETE `/sites/:id/monitors[/:monitorId]` — members read,
  every write and the manual check are owner-only (same membership layer as
  sites/offsite-backups) — capped at 10 monitors per site (`monitor_limit_reached`
  on the 11th, disabled monitors hold their slot), plus
  `GET .../results` and `POST .../check`. Availability: 7- and 30-day windows
  computed from recorded attempts with failure *episodes* counted (a stretch
  of consecutive failures is one outage, not N failed checks); a window with
  zero attempts is `measured:false, percent:null` — «اندازه‌گیری نشده», never
  a green zero. Site-wide totals are in `GET /sites/:id/overview`
  (`data.uptime` — the field that was a deliberate null after the seeded
  99.98% was removed) and in the monitors list response. Hub: the
  «مانیتورها» tab (`hub/src/pages/site/Monitors.jsx`, route
  `/site/:siteId/monitors`) with add/edit/delete, enable/disable, «بررسی
  الان», last check, and per-monitor + site-wide availability. Results past
  35 days are pruned (throttled to once an hour per process). Pinned in
  `server/test/monitors.test.js` (8 tests, real PostgreSQL; the runner's
  requests are injected through a global fetch fake — no test touches a real
  network). Honest boundaries: a check is reachability of one URL only —
  checkout, payment-gateway and login journeys are still not monitored;
  monitor failures do not yet feed the alert/Telegram dispatch; monitor
  config changes write no separate audit event; monitor URLs are
  owner-supplied and fetched unattended by the server, with no internal-network
  (SSRF) guard — the same trust level as the existing `site.url`/speedtest
  fetches.
- Browser push with Web Push/VAPID (2026-10-02, the «اعلان مرورگر» wave):
  `web-push` is a server dependency and the VAPID pair comes only from the
  environment (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` in
  `server/src/config.js`) — the server never mints keys, and a deployment
  without them is the honest `{configured:false, reason:…}` state everywhere
  (the mailConfigured pattern). Subscriptions live in `push_subscriptions`
  (`server/src/push.schema.js`, `server/src/push.store.js`): one row per
  browser endpoint, upserted on the endpoint, owned by one account, and the
  public shapes never return the capability URL in full or the encryption
  keys. Routes (session-auth, mounted in `server/src/index.js`):
  `GET /push/status`, `GET /push/public-key`, `POST /push/subscribe`
  (HTTPS-endpoint + keys validation, refused 503 while unconfigured — a
  subscription that can never receive is not stored), `POST /push/unsubscribe`
  (id-or-endpoint, always scoped to the signed-in user). The owner alert
  dispatcher gained a `web-push` channel (`server/src/alerts/channels.js`,
  first in `ORDER`, counted in `alertChannelStatus`): `events.raiseEmergency`
  hands it the owner's subscription rows, the sender
  (`server/src/push.js`, test seam `_setWebPushForTests` — the mailer
  transport-factory pattern) reports "push service accepted" with the same
  «تحویل و خوانده‌شدن آن تأیید نشده» honesty as every other channel, and a
  push service answering 404/410 deletes that subscription at delivery time
  (a 500 is kept). Account deletion purges the rows explicitly (the tombstoned
  user row never cascades). Hub: `hub/public/sw.js` already carried the
  `push`/`notificationclick` handlers (unchanged); the «اعلان مرورگر» card in
  `hub/src/pages/account/Notifications.jsx` renders the honest off state with
  the server's reason when unconfigured, and otherwise enrolls through
  `Notification.requestPermission()` → `PushManager.subscribe` with the
  server's public key → `POST /push/subscribe`, with per-device removal.
  Pinned in `server/test/push.test.js` (13 tests with real PostgreSQL; the
  sender runs against an injected fake web-push and never touches a network;
  without `CB_TEST_DATABASE_URL` the file runs the sender/channel half —
  6 pass — and registers one honest skipped placeholder). Honest boundaries:
  production has no VAPID keys yet (they must be set in the Coolify UI like
  `EMAIL_SERVER`, or the next deploy loses them); delivery to a real browser
  has never been verified end to end; the legacy Alerts-page «فعال‌سازی اعلان
  روی این دستگاه» button stores the subscription JSON as an `fcmToken` contact
  and never creates a subscription — it predates this channel and is not
  wired to it; `/alerts/readiness` still reports the legacy channels only.
- Site readings, event/incidence model, and limited health probes.
- Malware/signature scan and WordPress core checksum integrity.
- NVD-based vulnerability matching with WordPress.org confirmation.
- Local database backups, optional `wp-content` zip, listing, reading, pruning,
  and database restore jobs.
- Conflict bisect, rescue inventory/audit/key rotation/verification steps.
- Performance measurement and server-side recommendation recipes.
- Telegram operator digest machinery and multi-channel owner alert dispatcher.
- Persistent notification preferences, quiet hours, and contact enrollment
  (`notification_settings` + `user_contacts` tables, `/notifications/*` endpoints,
  and the hub Notifications page).
- Assistant answers/tool loop and optional scheduled fleet sweep.
- Transactional email delivery (2026-09-30, commit `4d7dc2d`): `sendMail`
  prefers `EMAIL_SERVER` (direct SMTP via `nodemailer`) over `EMAIL_URL` (HTTP
  provider) under one `{ok, status?, reason, detail}` contract
  (`server/src/mailer.js:85-150`), and `/auth/forgot-password` reports an
  honest `mailConfigured` deployment state. Password-reset delivery was
  verified end to end on production on 2026-09-30 — see the production E2E
  baseline for what was and was not proven.
- Auth pages reskinned in the NabuxUi language (2026-09-30, commit `4d7dc2d`):
  split-screen `AuthLayout` reusing the landing hero backdrop and
  `gd-card--glass` (`hub/src/layouts/AuthLayout.jsx:6-23`), shared atoms for
  password show/hide, a two-step progress rail, and status badges
  (`hub/src/pages/auth/shared.jsx`), styles isolated in
  `hub/src/styles/polish-auth.css`, email autofocus, and button loading states
  in Login/Register. `Reset.jsx` renders an honest "ارسال ایمیل فعال نیست"
  state when the server answers `mailConfigured:false`
  (`hub/src/pages/auth/Reset.jsx:36-38,50-63`). Existing contracts —
  Input/Button/Captcha components, the `/reset?token=` routing, 401 handling —
  are unchanged.
- Draft legal pages and the external-services disclosure (2026-10-01):
  `/terms` and `/privacy` (`hub/src/pages/legal/Terms.jsx`,
  `hub/src/pages/legal/Privacy.jsx`, lazy routes inside the marketing
  shell) describe only data flows and limits that exist in the code, and
  each carries a visible draft banner («پیش‌نویس اولیه — پیش از انتشار
  نهایی نیازمند بازبینی حقوقی است»); the footer gained these two real
  links while the other former `#` anchors remain plain text.
  `docs/PRIVACY.md` lists the nine external services verified in code
  (mShots, WordPress.org APIs, NVD, the GitHub YARA feed, abuse.ch,
  hash-only VirusTotal, SMTP mail, the model gateway, S3-compatible
  backup targets) with file:line references. Honest boundary: no legal
  review has happened yet — the banners say exactly that — and no support
  address or channel is invented anywhere in the pages.
- Plugin manifest/update channel and two release variants.

### Partial, limited, or easy to misdescribe

- Monitoring probes currently cover the homepage and `wp-login`; checkout,
  payment gateway, contact form, and arbitrary business transactions are not
  continuously monitored.
- Automatic updates still use WordPress background updates with no pipeline.
  As of `3.8.0` the **manual** update job (`update_apply`) is transactional:
  per-item file snapshots, a measured health baseline, one item per wave,
  health gates (homepage / wp-login / REST / cron) after each wave, and
  automatic rollback from the snapshot when a gate fails — which also stops
  the queue. Core updates are health-gated but deliberately NOT auto-rolled
  back (the upgrade migrates the DB schema forward; old files over a new
  schema is worse), and `update_rollback` restores plugin/theme waves only.
- Backups are local to the managed site, not off-site, not independently
  encrypted, and not a disaster-recovery guarantee.
- The security scan is signature/heuristic based. A clean result is not proof
  that a site is uncompromised.
- The assistant can operate without a model gateway, but then it cannot reason
  beyond deterministic readings and must say so.
- Owner-alert machinery exists, but a deployment with no configured owner
  channel reaches only the operator or nobody. Check `/alerts/readiness`.
  As of 2026-09-30 production does have an SMTP transport (`EMAIL_SERVER`),
  but only in Coolify's on-disk managed files — the next Coolify deploy
  regenerates them from its own database and silently reverts the panel to
  `mailConfigured:false` until the variables are also saved in the Coolify UI
  (see the production E2E baseline).
- Subscription/trial record: PostgreSQL-backed, with a 14-day default trial
  materialised on first billing read and a no-payment pilot request
  (`server/src/billing.store.js`, `server/src/routes/billing.js`), rendered in
  `hub/src/pages/account/Billing.jsx`. No gateway is connected and no invoice
  is issued. Site-count/trial entitlement IS enforced at the one place it
  bites (2026-10-01): `billing.canAddSite()` gates `POST /sites`
  (`server/src/routes/account.js`) with 402 before any pairing secret is
  minted — `trial_expired` when the trial window has passed (reads of
  everything already in the account stay open) and `site_limit_reached` when
  `sites_used >= plan.site_limit`; a plan with `site_limit NULL` (آژانس) is
  unlimited, and a site tombstoned with `status='deleted'` frees its slot.
  The global error handler now passes an error's optional `code`/`details`
  through additively (existing errors render byte-for-byte as before).
  Billing responses carry an explicit `trialState`
  ('trialing' | 'expired' | 'ended') next to `isTrialing`/`daysLeftInTrial`,
  and the hub renders the expired state (banner, danger badge, honest
  «پایان دسترسی آزمایشی» line) instead of a fabricated «تمدید بعدی». Pinned
  in `server/test/entitlement.test.js` (4 tests, real PostgreSQL). Pairing an
  already-added site is deliberately NOT gated — the slot is already counted.
- Per-site team management: invitations with hashed single-use tokens and
  7-day expiry, role changes, and member removal (`server/src/store.js`,
  `server/src/routes/team.js`), rendered in `hub/src/pages/account/Team.jsx`.
  Owner-only; accepting an invite requires an existing account — or none at
  all (2026-10-01): `POST /auth/register` accepts the same single-use
  `inviteToken` and attaches the membership right after the account is
  created (`team.acceptOnRegister`); an expired, spent, revoked, or
  wrong-address token never fails the registration — the response reports it
  in `invite:{applied:false,error}` and the token is not spent on a refusal.
  The invite email and the Team page now carry the register link
  (`/register?invite=<token>&email=…`) next to the signed-in accept link.
- Per-site member roles ARE enforced on the site routes (2026-10-01,
  membership layer): `sites.rawWithRole` resolves owner/admin/viewer in one
  query, `routes/sites.js` and `routes/offsite-backups.js` admit an active
  member to every GET (a stranger still gets the same 404), and every
  non-GET route — settings writes, pairing (`/ping`), job starts
  (scan/update/backup/restore/rescue/conflict/perf), assistant, actions,
  proposal rejection, offsite targets/jobs, and the backup download-token
  mint — answers 403 «این اقدام فقط برای مالک سایت مجاز است…» BEFORE the
  route's own 400s. One deliberate GET exception (2026-10-02 review-fix
  wave): `GET /sites/:id/backups/:backupId/download` is owner-only like its
  token mint — it streams the full database dump (`user_pass` hashes,
  options, content), which is not one of the «گزارش‌ها و وضعیت» views the
  member promise covers; the capability-token path still passes the gate
  because the token's `sub` is the minting owner (pinned in
  `server/test/team-roles.test.js`). This is membership only: the authority
  ladder (report/confirm/auto) and the sensitive-tool classification are
  untouched, and admin/viewer are both read-only at this layer — the stored
  role distinction is not yet load-bearing. The Team page renders the honest
  effective access (`effective:{level,label}` on each member) instead of
  promising writes the server refuses. Not yet built: shared sites in the
  member's own site list, and any admin-beyond-read behaviour.
- Account deletion (2026-10-01): `POST /account/delete`
  (`server/src/routes/account.js`) asks for the current password behind the
  live session — wrong answers get one generic 400 and a per-account limiter
  (5/hour, keyed on the session subject, gating BEFORE the password check) plus
  a per-IP limiter. On success, in fail-safe order: every session row is
  revoked (`sessions.revokeAll`, current token included); the user's sites are
  tombstoned rather than deleted — `secret`/`site_key` emptied, `paired=false`,
  `status='deleted'`, `connector=NULL` — which kills every connector path
  (`sites.candidates()` matches only non-empty secrets, so signed
  `/connector/register` and `/connector/report` calls 401, and every relay
  path refuses a site without a secret); one `kind:'account'` info event per
  site records the deletion with no personal data; offsite S3 targets,
  pending invitations, assistant conversations, team memberships, enrolled
  contacts, notification settings, unused reset tokens, and the subscription
  row are removed; finally `users.anonymize()` rewrites the user row in place
  — email → `deleted-<sha256(id)…>@invalid` (unique, frees the address for
  re-registration), name → «حساب حذف‌شده», pass_hash → a value
  `verifyPassword()` rejects by shape, contact reset to all-null. The
  tombstone is deliberate: deleting the user row would CASCADE through sites
  → events and destroy the audit trail. No email is sent and none is claimed.
  Hub: the Profile danger-zone button opens a two-step Dialog (type
  «حذف حساب» + current password) with an explicit irreversibility list; on
  success the token is cleared and the browser goes to `/goodbye`
  (`hub/src/pages/Goodbye.jsx`, a public route outside both shells). Honest
  boundaries: deletion is immediate — no cooling-off window, no exported data
  archive, and no confirmation email exist; the audit events that remain are
  site-scoped rows, readable only through admin surfaces.

### Not built at baseline

- Payment gateways and invoices. (Site-count/trial-expiry enforcement at site
  creation shipped on 2026-10-01 — see the subscription bullet under
  "Partial"; what remains unbuilt is any paid activation path itself, cap
  enforcement beyond `POST /sites`, and trial-expiry handling for jobs the
  sites already run.)
- Passkeys. (TOTP two-factor authentication shipped on 2026-10-02 — see the
  bullet under "Implemented or materially implemented": enrollment, the login
  second step, one-time recovery codes, and the disable flow are live. What
  remains unbuilt: WebAuthn/passkeys, 2FA demanded at registration time, and
  any recovery path beyond the 8 one-time codes.)
- Account-level multi-user RBAC. (Invitation acceptance without a prior
  account and per-site member-role enforcement on site routes shipped on
  2026-10-01 — see the team-management bullet under "Partial"; what remains
  unbuilt is any distinction beyond owner-vs-read for admin/viewer, shared
  sites in the member's site list, and account-level role grants.)
- Browser push subscription enrollment from the hub. (Web Push/VAPID
  enrollment shipped on 2026-10-02 — see the bullet under "Implemented or
  materially implemented". What remains unbuilt: production VAPID keys set in
  the Coolify UI, any end-to-end push delivery verification against real
  browsers/push services, and the legacy Alerts-page fcmToken contact path is
  a placeholder that never created a subscription and is not wired to this
  channel.)
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

**Status: resolved.** `SEED_DEMO=1` is now required for the demo seed to run.
`server/src/config.js` exposes `config.seedDemo` and `server/src/db.js` only calls
`seedDemo()` when it is true. `server/test/demo-seed.test.js` boots an empty
production-style database and asserts the known account does not exist. The live
database was not inspected or modified here.

### P0.2 — customer purchase/trial flows are simulations

The public site advertises a 14-day trial, paid plans, and checkout. At finding
time the server returned `NOT_BUILT` for billing and invoices; that honest stub
still exists in `server/src/routes/account.js:51-52`, but a real billing router
is now mounted before it and shadows it (see status).

- `hub/src/pages/billing/Checkout.jsx` defines three Iranian gateways but
  `pay()` only navigates to the fixed route `/invoice/INV-1403-014`.
- `server/src/routes/account.js` says no gateway is connected, no card is stored,
  and no invoices are issued.
- A user's subscription row (materialised on first billing read) still
  defaults to the legacy `users.plan` value or `pro` (`حرفه‌ای`), and
  entitlement is not enforced — though the row now carries a real 14-day
  trial window (see status).

Until implemented, replace purchase actions with an honest pilot/waitlist/demo
state. Never leave a control labeled "پرداخت امن" that performs no payment.

Relevant lines: `hub/src/pages/billing/Checkout.jsx:20-23`,
`server/src/routes/account.js:44-56`, `server/src/db.js:31`.

**Status: resolved (pilot state, real subscription record).** `hub/src/pages/billing/Checkout.jsx`,
`hub/src/pages/billing/Invoice.jsx`, and `hub/src/pages/billing/Pricing.jsx`
now state that payment and invoicing are not yet active. The "پرداخت امن" button
and fake invoice sheet are removed. Plan CTAs read "درخواست دسترسی آزمایشی" and
navigate to the honest checkout screen. `hub/src/pages/account/Billing.jsx` no
longer renders a `NOT_BUILT` response: `server/src/billing.store.js`
materialises a 14-day trial per user (PostgreSQL `subscriptions`/`plans`) and
`server/src/routes/billing.js` serves `/billing`, `/billing/plans`,
`/billing/trial`, and a rate-limited `/billing/request-pilot` that records a
pilot request without payment. That router is mounted before the account
router (`server/src/index.js:101-102`), so the real subscription row wins over
the `NOT_BUILT` stub still kept in `server/src/routes/account.js:51-52`; the
page renders plan, trial days left, and sites used versus plan limit, and
keeps payment/invoices in explicit unavailable states. Plan entitlement and
site-count enforcement remain unbuilt.

### P0.3 — password reset reports a false success

`hub/src/pages/auth/Reset.jsx` waits 600 ms and says an email was sent. There is
no reset endpoint or mail/token flow in `server/src/routes/auth.js`.

Required short-term behavior: disable the action or say plainly that recovery
requires support. Required real behavior: single-use expiring tokens, hashed
token storage, enumeration-safe responses, rate limits, transactional email,
password rotation, and tests.

Relevant lines: `hub/src/pages/auth/Reset.jsx:7-17`.

**Status: resolved.** `server/src/password-resets.schema.js` adds a
`password_resets` table that stores SHA-256 hashed tokens, per-user active-token
enforcement, expiry, and a spent-once flag. `server/src/mailer.js` sends via
`EMAIL_URL`/`EMAIL_API_KEY` (and, since 2026-09-30, `EMAIL_SERVER` SMTP — see
the delivery update below). `server/src/routes/auth.js` adds
`/auth/forgot-password` (enumeration-safe, captcha-guarded, rate-limited) and
`/auth/reset-password` (token hash check, expiry check, password strength check).
`hub/src/pages/auth/Reset.jsx` now renders the real two-step flow. Tests in
`server/test/auth-password-reset.test.js` cover token hashing, single active
token, expiry, and password change.

**Delivery update, 2026-09-30 (commit `4d7dc2d`).** `sendMail` now has two
transports in priority order: `EMAIL_SERVER` — a direct SMTP connection URL
(`smtps://` implicit TLS / `smtp://` STARTTLS, percent-encoded username decoded
in the mailer) through a lazily imported `nodemailer` transport — and the
existing `EMAIL_URL` HTTP POST provider (`server/src/mailer.js:43-59,61-74,85-150`,
`server/src/config.js:107-110`). The `{ok, status?, reason, detail}` response
contract is unchanged for both. `/auth/forgot-password` additionally returns
`mailConfigured`, a deployment state computed before the account lookup so it is
identical for every address and cannot enumerate the customer list; when no
transport is configured the message honestly says mail is not configured on
this server (`server/src/routes/auth.js:166,190-194`), and a failed delivery is
logged to the operator with reason/status only — no provider detail, no
address. `server/test/mailer.test.js` (transport selection and SMTP error
branches via an injected fake transport) and `server/test/auth-forgot-mail.test.js`
(`mailConfigured` states, byte-identical responses for existing and absent
addresses) pin this. Delivery was verified against production on 2026-09-30
(see the production E2E baseline). Honest limits: an SMTP "250 accepted" is not
by itself proof of inbox delivery — in that run receipt was additionally
verified through the operator's own IMAP mailbox, which says nothing about
deliverability to arbitrary customer domains — and a pre-existing timing side
channel remains: response bodies are byte-identical for existing and absent
addresses, but an existing address costs one SMTP round trip, so response time
can hint at account existence; captcha and rate limits bound it.

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

**Status: resolved in 3.8.0 (transactional manual pipeline).** The manual
`update_apply` job now IS the pipeline this finding asked for: preflight (free
disk ≥ 100 MB, database safety backup, measured health baseline), per-item
file snapshots zipped into `cb-backups-<hash>/safe-updates/<run_id>/`, one
item per wave, the four health probes after each wave compared against the
baseline, automatic rollback from the snapshot when a wave breaks something
that worked before — and the queue stops there. Every run writes a durable
journal (`journal.json` + an options-table pointer); the result separates
`applied`, `failed`, `rolled_back`, and `skipped`. Two new read-only tools
expose it (`update_health_check`, `update_journal_get`) and
`update_rollback` restores a plugin/theme wave manually (server-side:
sensitive at every authority level; see `server/src/authority.js`).
Regression structure is pinned in `server/test/safe-update-pipeline.test.js`.
Honest boundaries that remain: WordPress background (automatic) updates do
not go through this pipeline; core updates are gated but never auto-rolled
back — the upgrade migrates the DB schema forward, so old files over a new
schema is a worse outcome, and the journal says so in plain words; probes
cover homepage/login/REST/cron, not business journeys.

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

Relevant code: `cb_backup_dir()`, `cb_backup_dirs()`, `cb_backup_find_meta()`,
`cb_backup_list()`, `cb_backup_prune()`, `cb_op_backup_read()`,
`cb_job_backup_restore()` in `wp-claude-bridge.php`; `docs/SECURITY.md`.

**Status: resolved (defense in depth).** `cb_backup_dir()` now prefers a
`cb-backups-<hash>` directory next to `ABSPATH` (outside the document root) and
falls back to `wp-content/uploads/cb-backups` only when that is impossible.
`cb_backup_dirs()` and `cb_backup_find_meta()` keep list/read/restore working
for backups already stored in the legacy uploads path. `.htaccess` and
`index.php` protection is written to both locations. `docs/SECURITY.md` now
includes nginx and Apache snippets that block `/wp-content/uploads/cb-backups/`
and explains why `.htaccess` is not enough on nginx. Encryption at rest and
off-site storage remain in the product roadmap.

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

**Status: resolved.** `.dwp-hero` and `.dwp-report` now collapse cleanly to a
single column on viewports under 860px in `hub/src/styles/app.css`. The landing
page hero heading uses fluid typography (`clamp(28px, 5vw, 44px)`), and container
padding blocks prevent horizontal clipping across all mobile viewports (320px to 390px).

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

**Status: resolved.** The demo CTA is removed; the secondary hero button now
links to `/pricing`. Plan CTAs and the bottom CTA no longer promise a 14-day
trial. Footer links are rendered as plain text instead of dead `#` anchors,
except the two that became real on 2026-10-01: «حریم خصوصی» and «شرایط
استفاده» now point to the draft `/privacy` and `/terms` pages (see the
feature boundary; both carry a visible draft banner pending legal review).
The registration form no longer claims a free trial, and the unchecked terms
checkbox stays removed until the documents are final and explicit consent is
wired. Copyright is updated to ۱۴۰۵.

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

**Status: resolved.** `ProtectedRoute` component (`hub/src/lib/ProtectedRoute.jsx`)
guards all `/app`, `/site/:siteId`, `/onboarding`, `/checkout`, and `/invoice/:id`
routes. It waits for auth readiness, prevents shell content leakage for anonymous
sessions, and preserves `returnTo` state upon redirecting to `/login`. User initials
and names fall back gracefully without demo mocks.

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

**Status: resolved, and now backed by real endpoints.** The invented pending
invitation for `sara@digiwp.com` and the inert controls are gone. Team
management is real: `server/src/routes/team.js` and the PostgreSQL
`team_members`/`invitations` stores (`server/src/store.js:384-582`) back the
invite form, pending-invitation list, role change, and member removal in
`hub/src/pages/account/Team.jsx`; invitations carry hashed single-use tokens
with 7-day expiry and every management action is owner-only.
`hub/src/pages/account/Notifications.jsx` persists channels and contacts
through the real `/notifications/*` endpoints
(`server/src/routes/notifications.js`) instead of rendering `NotMeasured`.

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

**Status: resolved (lint and lazy loading).** ESLint + React plugin are now
installed with a config in `hub/eslint.config.js`, the existing lint errors are
fixed, and `npm run lint` is part of CI. Route-level lazy loading is added in
`hub/src/App.jsx`. React component tests and Playwright end-to-end flows remain
in the roadmap.

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

**Status: resolved (counts aligned).** `PRODUCT_SPEC.md` now says "more than 130
tools" instead of 58. The "130+ tools" copy landed in `README.md`,
`README.fa.md`, `README.ru.md`, and `README.zh.md`; the ar/de/es/fr/tr
subtitles still read "100+ tools" as of 2026-10-02 (this pass touched version
badges only). README version badges were aligned to `CB_VERSION` `3.9.1` on
2026-10-02 (the badge line in `README.md` and all eight translated READMEs;
`CB_VERSION` verified at `wp-claude-bridge.php:14`) — re-check them with the
next release touch. The external-services/privacy disclosure exists as
`docs/PRIVACY.md` plus the draft hub `/privacy` and `/terms` pages
(2026-10-01); keeping all three in sync with every data-flow change is the
remaining obligation.

### P1.7 — release archive can trigger malware-upload scanners

The self-hosted ZIP used to copy the entire repository `skills/` tree into the
WordPress plugin directory. The security-review playbooks include deliberately
unsafe examples and literal web-shell indicators, including direct request-data
execution examples. They are documentation, not code reached by WordPress, but
an archive scanner sees the same byte patterns it is designed to block.

The ZIP reported by a host on 2026-08-31 was byte-identical to the then-committed
`hub/public/digiwp-ai-bridge.zip` (SHA-256
`A88B3FFCCFB4189D7BF454F97741E30B2491DE0BF9B01683EF98A5287A831399`). The
hosting notice did not include the scanner product, signature id, or matched
inner file, so this evidence supports a false-positive explanation but does not
prove the host's exact detection rule.

**Status: resolved in 3.7.5 and compatibility-restored in 3.7.6.** The self-hosted
release contains only its PHP runtime and readme. Development playbooks remain
outside the site webroot. The DigiWP server exposes their catalog and individual
files through read-only, path-validated endpoints; the plugin fetches and caches
only requested text. This restores `list_wp_skills`, `get_wp_skill`, MCP resources,
MCP prompts, and playbook-assisted cookbook recipes without returning scanner
signatures to the upload archive. Operator-provided local playbooks remain a
fallback. Release tests pin the self-hosted payload to the two intended runtime
files. The blocked ZIP predated the latest canonical PHP change even though it
carried the same 3.7.4 version.

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
  session compromise. Since the sessions wave (2026-10-01) each token also maps
  to a server-side `sessions` row, so a stolen token can be revoked from
  `/app/security` — but revocation is manual and XSS-stolen tokens still work
  until someone notices. A future migration to secure, HttpOnly, SameSite cookies
  should include CSRF design rather than a partial switch.
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
- `EMAIL_SERVER` (an `smtp://`/`smtps://` connection URL; wins over `EMAIL_URL`)
  enables transactional mail — password resets and owner email alerts. On the
  Coolify production deployment it must be set in the Coolify UI too: editing
  only the on-disk `.env`/`docker-compose.yaml` survives until the next deploy
  overwrites it (verified 2026-09-30).
- `ASSISTANT_URL` and `ASSISTANT_API_KEY` enable model reasoning.
- `ASSISTANT_SWEEP` is intentionally off by default because it costs tokens and
  can perform recoverable changes on `auto` sites.
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` reach the operator, not the site
  owner.
- Owner channels require both provider-side configuration and user contact data.
- In-process schedules are acceptable for the current single-instance baseline,
  but durable jobs/locks are required before multi-instance scaling.

## Verified test/build baseline

Full gate on 2026-10-02 (final gate of the 2026-10-01/02 multi-wave sprint —
sessions, account deletion, team roles/invite-registration, entitlement,
TOTP, uptime monitors, web push, the `3.9.1` `render_blocks` fix, and the
draft legal pages — run after the gate's final repair round):

- Full server suite with PostgreSQL (`npm test` in `server/` with
  `CB_TEST_DATABASE_URL`): 440 tests discovered; 440 passed; 0 failed;
  0 skipped (~13.8 s). The numbers are read from the sprint's final gate
  output; this documentation pass did not re-run the suite. Verbatim
  caveat, recorded because this file records provenance: the gate
  wrapper's own status line for this pass reads «قرمز» although the
  captured run output ends with `fail 0` / `skipped 0` and contains no
  failing test line, and a second captured full run on the same machine
  the same day shows the identical 440/440/0/0 counters. The counters
  above are what the final gate output carries.
- Server suite without PostgreSQL: the gate reports ok; its summary
  carries no counts for this pass.
- Plugin artifacts: build ok for both release scripts, and `php -l`
  passed for `wp-claude-bridge.php` and both dist artifacts (all three
  pin `CB_VERSION` `3.9.1`).
- Hub `npm run lint` and `npm run build`: both ok.

Wave-scoped verification on 2026-10-02 (review-fix wave: backup-download
owner-only, `POST /auth/logout`, monitor-cap advisory lock, legal-page data
sync; the full gate was NOT run in this wave, same rule as every wave below):

- `CB_TEST_DATABASE_URL=… npm --prefix server test test/team-roles.test.js
  test/sessions.test.js test/monitors.test.js` (real PostgreSQL on
  127.0.0.1:55433): 27 tests, 27 passed, 0 failed. New pins: a member
  (admin or viewer) gets the membership 403 on
  `GET /sites/:id/backups/:backupId/download` before the route's own 400,
  while the owner's minted capability token passes the same gate with no
  Authorization header (the unpaired site answers the route's own 400);
  logout revokes exactly the session it rode in on (other devices and the
  registration session survive, the logged-out row leaves the active list,
  capability-token and anonymous calls 401); and 14 concurrent monitor
  creates end at exactly 10 rows + 4 `monitor_limit_reached` refusals (the
  cap count is taken under a per-site transaction-level advisory lock).
  The owner-mint test also exposed a real pre-existing bug:
  `routes/sites.js` never imported `signToken`, so the download-token mint
  route had answered 500 for everyone since it shipped — the import is now
  in place and the mint is covered end to end.
- Hub `npm run lint` passed after the account-shell header «خروج» button,
  the api.js logout rewiring (server revoke first, token cleared in every
  outcome), and the Terms/Privacy data-flow sync.
- `php -l` re-passed for `wp-claude-bridge.php` and both dist artifacts (all
  three pin `CB_VERSION` `3.9.1`, matching the committed self-hosted ZIP).

Wave-scoped verification on 2026-10-02 (web-push/VAPID wave; the full gate
was NOT run in this wave, same rule as every wave below):

- `CB_TEST_DATABASE_URL=… npm --prefix server test test/push.test.js` (real
  PostgreSQL on 127.0.0.1:55433): 13 tests, 13 passed, 0 failed — the honest
  unconfigured state (status `{configured:false}` + reason, public-key 200
  not an error, subscribe refused 503 and nothing stored), enrollment with no
  endpoint URL or keys ever returned to the browser, HTTPS-endpoint/keys
  validation, endpoint upsert (one browser, one row), unsubscribe scoping
  (a stranger gets 404 by id and by endpoint), delivery cleanup (410 removes
  the row, 500 keeps it), the channel's skip/accept wording, and the
  account-deletion purge. Without `CB_TEST_DATABASE_URL`: 6 pass + 1 skipped
  placeholder. All sending goes through the injected fake web-push
  (`_setWebPushForTests`, mailer.test.js pattern) — no test touches a push
  service. Neighbouring affected files re-run in the same round:
  `alerts.test.js` + `alert-channel-status.test.js` + `emergency-flow.test.js`
  (23/23 without a database, after the dispatcher's new channel and status
  entry) and `account-delete.test.js` (4/4 with the database, after the
  explicit purge).
- Hub `npm run lint` (clean) and `npm run build` (passed) after the
  Notifications «اعلان مرورگر» card and the api.js push methods. The service
  worker `hub/public/sw.js` needed no change: its `push` and
  `notificationclick` handlers already matched the sender's payload shape.

Wave-scoped verification on 2026-10-02 (uptime-monitors wave; the full gate
was NOT run in this wave, same rule as every wave below):

- `CB_TEST_DATABASE_URL=… npm --prefix server test test/monitors.test.js`
  (real PostgreSQL on 127.0.0.1:55433): 8 tests, 8 passed, 0 failed — CRUD
  with honest validation (default expect_status 200, bad URL/scheme/status
  refused), member reads while every write and the manual check answer 403
  «مالک» and a stranger gets 404, the 10-per-site cap (`monitor_limit_reached`,
  disabled monitors hold their slot), result recording with 7/30-day
  availability (2/5 attempts → 40% with 2 failure episodes),
  `expect_contains` catching a 200 without the expected phrase, `expect_status`
  honoured (204), connection failure recorded as an attempt with status null,
  «اندازه‌گیری نشده» (percent null) for sites with no recorded checks, the
  scheduler skipping disabled monitors and monitors of tombstoned sites while
  re-enabled ones rejoin, and 35-day retention pruning. Without
  `CB_TEST_DATABASE_URL` the file registers one honest skipped placeholder.
  All monitor HTTP in the tests goes through an injected global fetch fake
  (mailer.test.js pattern) — no real network.
- Hub `npm run lint` and `npm run build` both passed after adding the
  «مانیتورها» tab, api.js client methods, and nav entry.

Wave-scoped verification on 2026-10-01 (sessions/device-management wave; the
full gate was NOT run in this wave, so the suite totals below still speak from
2026-09-30):

- `CB_TEST_DATABASE_URL=… npm test test/sessions.test.js` (real PostgreSQL on
  127.0.0.1:55433): 10 tests, 10 passed, 0 failed — login mints a jti + session
  row, revoke → 401 despite a valid signature, expired row → 401, list without
  hashes, revoke-others, cross-user delete → 404, kind-token carve-out,
  last_seen throttle, expired-row pruning.
- Files touched by the `requireAuth` change, each run in the mode it supports:
  `test/auth.test.js` + `test/auth-http.test.js` without a database (28 tests,
  28 passed), `test/admin.test.js` + `test/offsite-backups.test.js` with the
  database (10 tests, 10 passed), and `test/team.test.js` +
  `test/notifications.test.js` + `test/pairing-flow.test.js` +
  `test/auth-password-reset.test.js` with the database (26 tests, 26 passed).
- Hub `npm run lint` and `npm run build` both passed after adding
  `/app/security`.

Wave-scoped verification on 2026-10-01 (account-deletion wave; full gate NOT
run, same rule as above):

- `CB_TEST_DATABASE_URL=… npm --prefix server test
  test/account-delete.test.js` (real PostgreSQL on 127.0.0.1:55433): 4 tests,
  4 passed, 0 failed — wrong password → generic 400 with the account intact,
  per-account rate limit gating before the password check (correct password
  cannot bypass the lockout), successful deletion → next login 401 + every
  token 401 + signed connector register with the old secret 401 + tombstone
  user row + audit events retained without personal data + email freed for
  re-registration, and self-scoping (another account untouched).
- `test/sessions.test.js` re-run with the database after the
  `sessions.revokeAll` addition: 10 tests, 10 passed, 0 failed. Without a
  database the new file registers one honest skipped placeholder.
- Hub `npm run lint` and `npm run build` both passed after the Profile
  danger-zone flow and the `/goodbye` route.

Wave-scoped verification on 2026-10-01 (team-roles/invite-registration wave;
full gate NOT run, same rule as above):

- `CB_TEST_DATABASE_URL=… npm --prefix server test test/team-roles.test.js`
  (real PostgreSQL on 127.0.0.1:55433): 6 tests, 6 passed, 0 failed — member
  reads site views while a stranger gets 404, lower-role (admin AND viewer)
  writes answered 403 with the Persian message BEFORE the route's own 400s
  including the backup download-token mint, register-with-invite creates the
  membership in one step with `effective:{level:'report'}` in the owner's
  list, a spent token refused on both the accept endpoint and a second
  registration, an expired invitation refused at registration and at accept,
  and a wrong-address registration that applies and spends nothing (the
  invited address can still use the token afterwards).
- `test/team.test.js` + `test/pairing-flow.test.js` re-run with the database
  after the `loadSite` membership change: 13 tests, 13 passed, 0 failed.
- Hub `npm run lint` and `npm run build` both passed after the Team
  effective-access/invite-link changes and the Register invite-token flow.

Wave-scoped verification on 2026-10-01 (entitlement wave; full gate NOT run,
same rule as above):

- `CB_TEST_DATABASE_URL=… npm --prefix server test test/entitlement.test.js`
  (real PostgreSQL on 127.0.0.1:55433): 4 tests, 4 passed, 0 failed — plan cap
  ('base', limit 1: second create 402 `site_limit_reached` with the
  subscription summary in `details`, nothing created over the cap), expired
  trial (402 `trial_expired` while `GET /sites`, `GET /billing`,
  `GET /billing/trial` all stay 200 and `daysLeftInTrial` is null, not 0),
  plan without cap (آژانس, `site_limit NULL`: three creates, all 201), and a
  tombstoned site (`status='deleted'`, the shape account deletion leaves)
  freeing its slot for a new create. Without `CB_TEST_DATABASE_URL` the file
  registers one honest skipped placeholder.
- Hub `npm run lint` and `npm run build` both passed after the Billing.jsx
  expired-trial banner/badge/usage-cap honesty changes and the mock
  `trialState` addition.

Wave-scoped verification on 2026-10-02 (TOTP two-factor wave; full gate NOT
run, same rule as above):

- `CB_TEST_DATABASE_URL=… npm --prefix server test test/totp.test.js` (real
  PostgreSQL on 127.0.0.1:55433): 14 tests, 14 passed, 0 failed — RFC 6238
  SHA-1 vectors (8- and 6-digit), base32 round-trip and paste-tolerant
  decoding, exact ±1-step window, leading-zero code verified as a string,
  pending factor not gating login, activate (wrong code 400; correct code →
  8 recovery codes, status enabled; setup-while-active 400), login challenge
  `{totp_required:true}` with no token, wrong-code 401, ±1-window code
  accepted, 90-second-old code refused, a recovery code logging in exactly
  once (case/dash-insensitive), disable refusing wrong password and wrong
  code then restoring password-only login, and disable via recovery code.
  Without `CB_TEST_DATABASE_URL` the file runs the pure-math half and
  registers one honest skipped placeholder (8 pass / 1 skip).
- Files touched by the login-gate change, each run in the mode it supports:
  `test/auth-http.test.js` + `test/auth.test.js` without a database (28
  tests, 28 passed — the no-DB file stubs `twoFactor.get` to null like its
  other store stubs), and `test/account-delete.test.js` +
  `test/sessions.test.js` with the database (14 tests, 14 passed — deletion
  now purges the two_factor tables).
- Hub `npm run lint` and `npm run build` both passed after the
  Security-page 2FA section, the login second step, and the api.js client
  methods.

Verified on 2026-09-30 (after the SMTP-mail/auth wave, commit `4d7dc2d`):

- Server suite with PostgreSQL (`CB_TEST_DATABASE_URL=… npm test` in
  `server/` against a throwaway `postgres:16` container): 374 tests
  discovered; 374 passed; 0 failed; 0 skipped. Includes the wave's 16 new
  tests — 9 in `server/test/mailer.test.js`, 7 in
  `server/test/auth-forgot-mail.test.js`.
- Server suite without PostgreSQL (`npm test`): 316 tests discovered;
  304 passed; 0 failed; 12 skipped for `CB_TEST_DATABASE_URL`. An earlier
  round in the same run was red and was repaired before this green run.
  The database-dependent files register one placeholder test when the URL is
  absent and their real cases only register when it is set (e.g.
  `server/test/pairing-flow.test.js:20-23`), so a no-database green run is
  not the full release gate.
- Hub `npm run lint` and `npm run build` both passed after the auth reskin.
- `php -l` was not re-run in this wave: `4d7dc2d` touched no plugin PHP
  source (13 files, all under `hub/` and `server/`). PHP verification was
  refreshed on 2026-10-02: `php -l` passed for `wp-claude-bridge.php` and both
  dist artifacts; all three pin `CB_VERSION` `3.9.1`, matching the committed
  `hub/public/digiwp-ai-bridge.zip`.

Historical baselines: 2026-09-29 no-database run 300 discovered / 288
passed / 12 skipped and full-PostgreSQL run 357 / 357 / 0; 2026-09-28
no-database run 290 / 278 / 12; 2026-08-16 full-PostgreSQL run 287 passing,
none skipped; 2026-08-16 no-database run 264 / 260 / 4.

### Production E2E baseline (2026-09-30)

Run on 2026-09-30 against the real deployment at `https://ai.digiwp.com`
(commit `4d7dc2d`, Coolify auto-deploy confirmed by the running server image
tag equaling the full commit SHA). The public API base is
`https://ai.digiwp.com/api/` (nginx `/api/` → `server:8787/v1/`);
`/api/v1/*` returns 404.

Panel (password-reset email):

- Test-account registration via the API: ok.
- Before the env fix, `POST /auth/forgot-password` answered
  `{ok:true, mailConfigured:false}` with the honest "mail is not configured
  on this server" message, logged `delivery failed (reason=no_email_url)` for
  the operator, and still created the hashed `password_resets` row (SHA-256
  token hash, one-hour expiry) — the token exists, delivery honestly fails.
- After applying `EMAIL_SERVER` (SMTP) + `EMAIL_FROM=noreply@nabuxai.com`:
  `{ok:true, mailConfigured:true}` with the vague enumeration-safe message; a
  nonexistent mailbox is refused honestly (SMTP 550); a real mailbox received
  "250 2.0.0 Message queued", the reset mail arrived in the IMAP inbox, and
  the full cycle token → reset → login with the new password succeeded.
- Honest limits of that evidence: an SMTP 250 is not proof of inbox delivery
  by itself — receipt was machine-verified through the operator's own IMAP
  mailbox, which proves nothing about deliverability to arbitrary customer
  domains or that an owner read the mail. The env change was applied to
  Coolify's on-disk `.env` AND the inline `environment:` of
  `docker-compose.yaml` (compose has no `env_file`); both files are
  Coolify-managed and the next Coolify deploy regenerates them from its
  database, wiping `EMAIL_SERVER`/`EMAIL_FROM` and silently reverting the
  panel to `mailConfigured:false`. Persist them in the Coolify UI. Backup
  copies `.env.bak-e2e-20260930005123` and
  `docker-compose.yaml.bak-e2e-20260930005123` remain on the server
  (root-only; delete the env backup once the UI value is permanent). Two E2E
  test accounts remain in production because no account-deletion workflow
  exists; credentials are in `/root/digiwp-e2e-creds.txt` (chmod 600).

WordPress (plugin over the real relay, hermetic stack on the same server —
the customer site `account30t.com` sits behind ArvanCloud and its origin was
unreachable, so a throwaway stack was used):

- Stack: `digiwp-e2e-wp` (`wordpress:6.6-php8.2-apache`; WP 6.6.2,
  core-upgraded to 7.1.2 to satisfy Elementor's minimum; PHP 8.2.25) +
  `digiwp-e2e-db` (`mariadb:11`), no published ports, wp-cli via a
  `wordpress:cli` sidecar; plugin `digiwp-ai-bridge` `3.9.0` installed and
  active; paired to the production panel through the real HMAC connector.
- 14 tools exercised through the panel relay; 14 succeeded: `site_info`,
  `update_status`, `list_plugins`, `backup_preflight`,
  `job_start{security_scan}` (done; 220 files scanned, zero findings),
  `job_start{backup, files:false}` (done; 150,951 bytes, 12 tables, 170
  rows, `verified:true`), `update_health_check` (all four probes 200 before
  and after the update), `list_block_types` (94 registered types),
  `render_blocks` (pure preview, `saved:false`), `create_block_page`
  (draft), `list_elementor_widgets` (149 widgets on Elementor 4.3.2),
  `elementor_page_create` (draft with valid `_elementor_data`),
  `job_start{update_apply}` (without approval → `202 requiresApproval` and
  nothing ran; with approval → akismet 5.3.3→5.7.2), and
  `update_journal_get` (durable run journal read back).
- Cleanup: draft posts trashed, test admin removed, containers/volumes/
  network fully removed — independently re-verified on the server during the
  review pass.
- Caveat found: `render_blocks` silently emits self-closing markup that
  renders nothing on the front end when `content` is nested inside
  `attributes` instead of sitting at the spec level; spec-level content
  renders correctly. **Fixed in 3.9.1:** the shared compiler
  (`cb_block_spec_to_markup`) now promotes a string `attributes.content` to
  the paired block body (and strips the duplicated key from the comment JSON,
  matching the editor's own serializer), so all three block tools
  (`render_blocks`, `create_block_page`, `append_blocks`) accept either
  shape; a spec with no content anywhere still compiles to a self-closing
  comment (legitimate for void blocks) but `render_blocks` now names it in
  `empty_blocks` and warns honestly instead of returning silent markup.
- This was API-driven E2E over the real relay, not browser Playwright
  flows; the P1.5 Playwright gap stands.

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
fail with `ENOENT` if `dist/` has not been built. As of `3.9.0`,
`design-tools.test.js` reads the canonical source plus both dist artifacts
the same way, so the same ordering requirement applies.

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
  deletion. (Password-reset delivery shipped 2026-09-30; server-side sessions
  with revocation, TOTP two-factor, and account deletion shipped on
  2026-10-01/02 — see the feature boundary. What remains here: passkeys/
  WebAuthn, 2FA demanded at registration, auto-revoking sessions on password
  reset, and any 2FA recovery path beyond the 8 one-time codes.)
- Team invitations, roles, per-site grants, and immutable permission audit.
  (Invitations — including acceptance at registration — and per-site
  read-only membership shipped on 2026-10-01; what remains: any
  admin-beyond-read behaviour, shared sites in the member's own list, and
  the permission audit.)
- Browser push: what shipped on 2026-10-02 is VAPID enrollment + the owner
  alert `web-push` channel; what remains is end-to-end channel readiness UX
  (the readiness screen still reports the legacy FCM/Najva/`/contact` paths,
  not the VAPID subscriptions), and real delivery verification.

### Site safety

- Off-site encrypted backups, retention tiers, restore drills, and recovery
  objectives.
- Extend the 3.8.0 manual pipeline to WordPress background updates, plus
  canary/staging waves; core still has no automatic file rollback by design.
- Real uptime history and SLO/incident calculations instead of snapshot-only
  status. (HTTP-only uptime history shipped on 2026-10-02 — see the monitors
  bullet under "Implemented or materially implemented"; what remains here is
  SLO/incident calculation and anything beyond a plain HTTP GET.)
- Configurable synthetic journeys: checkout, forms, cron, REST, login, SSL and
  domain expiry.

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
