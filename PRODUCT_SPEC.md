# WP Claude Bridge — product spec

Reconstructed from the repository on 2026-08-02: the plugin, the relay server, the hub, and
the test suite.

## What it is

Three pieces that make one product, and it is worth being precise about which does what,
because the direction of each arrow is the whole design:

```
you → Hub (React)  ──►  server (Node)  ──►  connector  ──►  managed WordPress site
      hub/                server/          wp-claude-bridge.php
```

1. **`wp-claude-bridge.php`** — a single PHP file dropped into any WordPress site. It turns
   that site into a complete **MCP server**, exposing 58 tools: files, plugins, themes,
   posts, WooCommerce, options, the database, caches, backups, screenshots. Claude — or any
   MCP client — connects to it directly and operates the site. No SaaS, no proxy.
2. **`server/`** — the relay. The hub never holds a site URL or token; it calls this server,
   which stores each site's pairing credentials and forwards **HMAC-signed** commands to
   that site's connector, using the exact signature the plugin's Hub Connector Mode
   verifies. It also runs the monitoring, alerting, security scanning and the assistant.
3. **`hub/`** — the React panel a site owner actually looks at.

So there are two independent ways to drive a site: **Claude connecting to the plugin
directly** (full power, a human in the loop), and **our own server driving it** (bounded,
unattended, auditable). This document is mostly about the second, because that is the half
that was incomplete.

## Stack

PHP 7.4+ / WordPress 5.6+ for the plugin, single file, zero dependencies. Node + Express +
PostgreSQL for the server. React + Vite for the hub. `node --test` throughout; 167 tests.

## Users

| Type | Reaches |
|---|---|
| Site owner | the hub — status, alerts, the assistant, the authority selector |
| Claude / any MCP client | the plugin directly, over MCP |
| The relay server | every paired site, over signed HTTP |

## Main journeys

1. **Install** — drop the PHP file into the site, take the URL and token.
2. **Pair** — the server stores the credentials and proves the signature round-trips.
3. **Watch** — probes, uptime, security scans, vulnerability matching, alerts, digests.
4. **Ask** — the assistant answers from what the site actually reports.
5. **Act** — the assistant now runs tools on the site, bounded by the owner's authority
   level; anything it may not do itself comes back as an exact, approvable proposal.

## Business rules inferred from the code

- **Every fact the assistant states traces to a real reading.** The file's own comment
  records that it once returned invented figures phrased as a personal report, and that
  this is the most damaging kind of fake data in the product. Anything unmeasured is named
  as unmeasured rather than filled in.
- **The connector is HMAC-signed both ways**, `hash_hmac('sha256', ts . "\n" . body,
  secret)`, and the server's test reproduces the plugin's scheme independently rather than
  calling the same helper.
- **Safe mode is a lock, not a preset.** While on, the three update switches cannot be
  turned off by the panel or by a crafted request — enforced on the server, not in the UI.
- **Authority is three-way**: `report` looks only, `confirm` proposes, `auto` acts. It is
  now enforced (see `PROJECT_PROGRESS.md`).
- **Destructive tools always need a human**, at every authority level. `auto` is permission
  to work unattended, not permission to run `db_query`.
- **An unclassified tool is treated as destructive**, because new tools reach the plugin
  before they reach the server's classification.

## External integrations

WordPress REST + WP-CLI on the managed side; NVD for vulnerability data; YARA rules for
malware signatures; Telegram for alerts; an OpenAI-compatible gateway for the assistant —
which is NabuGate's wire format, so `ASSISTANT_URL` can point straight at it.

## Complete

The plugin and its 58 tools, pairing and signing, monitoring, alerts, digests, security
scanning, the hub, and — as of this pass — server-initiated tool execution with authority
enforcement and an audit trail.

## Release requirements

`DATABASE_URL` for the server. `ASSISTANT_URL` + `ASSISTANT_API_KEY` to enable the model;
without them the assistant still answers from the site's own readings and says so.
`TRUST_PROXY` must be off anywhere the server is reachable directly.

## Assumptions

- One relay server serves many sites; the pairing secret is per-site.
- The hub is the only client of the server's API.
