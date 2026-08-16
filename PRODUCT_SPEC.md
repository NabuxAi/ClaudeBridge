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
   that site into a complete **MCP server**, exposing more than 130 tools: files, plugins,
   themes, posts, WooCommerce, options, the database, caches, backups, screenshots. Claude
   — or any MCP client — connects to it directly and operates the site. No SaaS, no proxy.
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
PostgreSQL for the server. React + Vite for the hub. `node --test` throughout: 287 tests
with none skipped when `CB_TEST_DATABASE_URL` names a PostgreSQL — several assertions are
database properties (a partial unique index, a conditional UPDATE) and testing those against
a stand-in would test the stand-in.

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
  before they reach the server's classification. The same rule applies one level down:
  `job_start` is a single tool covering seven jobs, so it is classified by its job **type**
  — `update_apply` and `backup_restore` are destructive whatever the tool is called, and an
  unrecognised type is destructive too.
- **An approval is spent once, and what came of it is recorded.** The proposal row is
  claimed before the tool runs, so two people approving the same change produce one
  execution and one 409. If the site then refuses, the outcome is written onto the row
  rather than leaving an approval that reads as carried out. It is never returned to
  pending: a request that failed on the way back may well have run.
- **An unconfigured alert channel has not failed.** It is skipped, and "we had no way to
  reach this person" is reported as a different state from "every road broke". Which also
  means a deployment with no channel configured never reaches an owner at all, so the
  server says which channels are live at startup.
- **Sites update themselves; the server publishes.** The plugin polls
  `/plugin/manifest` and installs when the advertised version is newer. Equal is not newer,
  so a fix republished under the same version reaches nobody — the version is pinned by
  tests across the plugin header, `CB_VERSION`, the manifest and both built zips.

## External integrations

WordPress REST + WP-CLI on the managed side; NVD for vulnerability data; YARA rules for
malware signatures; an OpenAI-compatible gateway for the assistant — which is NabuGate's
wire format, so `ASSISTANT_URL` can point straight at it.

Two separate outbound paths, easily confused and deliberately distinct:

| Path | Reaches | Configured by |
|---|---|---|
| Operator | us, immediately and in the daily digest | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| Site owner | the person whose site it is | one of `FCM_SERVER_KEY`, `NAJVA_API_KEY`, `SMS_URL`+`SMS_API_KEY`, `EMAIL_URL` |

"We will find out" is not "the customer will find out". Only the first is configured on the
current deployment.

## Complete

The plugin and its 130+ tools, pairing and signing, monitoring, digests, security scanning,
the hub, server-initiated tool execution with authority enforcement and an audit trail, the
plugin update channel, and the fleet's own version state — each site's installed version is
observed during the nightly run and divergence from the published one is reported in the
digest.

Alerting is complete as **machinery** and inert as **delivery**: the dispatcher, the
fallback order and the accounting all work, and no owner-facing channel is configured, so
today an emergency reaches the operator and nobody else.

### The assistant on a schedule

All of the above could only be started by a person. Every tool, the authority level, the
proposal inbox and the audit trail existed, and none of it did anything until somebody
opened the panel and typed a question — so the only maintenance this server performed on
its own was one fixed malware scan inside the digest. An expiring backup, a plugin that had
been failing to update for a week, a queue of pending updates: all visible to the assistant,
none of them looked at unless a human went looking first.

The sweep runs the same assistant over every paired site daily. It adds no capability —
everything it can do, a person asking a question could already have done. What changes is
that nobody has to remember.

It is **off unless asked for**. It spends gateway tokens on every paired site every day and,
under `auto`, performs changes with nobody watching. Both are reasonable to want; neither
should begin because someone deployed a new version.

| variable | unset means |
|---|---|
| `ASSISTANT_SWEEP` | off. The scheduler says so at boot rather than staying silent |
| `ASSISTANT_SWEEP_HOUR` | `6` UTC — two hours before the digest, so what it finds is in today's message rather than tomorrow's |
| `ASSISTANT_SWEEP_MAX_SITES` | `25`. What it skips over the cap is reported, because a sweep that silently stops at N reads as having covered everything |
| `ASSISTANT_SWEEP_TOOL_STEPS` | `6` per site — lower than a person's question, because nobody is waiting on it and nobody is watching it |

Switched on without a model configured, it refuses to schedule and says why: it would
re-read each site every morning and never propose anything, which looks like it is working.

`POST /v1/sweep/run` runs it now, behind auth and deliberately not a GET — it costs tokens
on every site and may make a change on one set to `auto`. Such a run is recorded as
`manual`, because somebody triggering a sweep is not evidence that the schedule is alive.

Every run is written to `sweep_runs` and the daily digest carries one line from it. That
line renders even when there is nothing to report, which is the opposite of every other
section here and the entire reason it exists: without it, a sweep that checked the fleet and
found it healthy produced exactly the same digest as one that never started. It also
separates a *degraded* run — the assistant read each site but had no model to think with —
from a clean bill of health, and says when the last run is old enough that one was missed.

The prompt is a constant in the module, not configuration. This runs unattended against
live sites with tool access, and a prompt reachable from outside is an instruction channel
into exactly that.

## Release requirements

`DATABASE_URL` for the server. `ASSISTANT_URL` + `ASSISTANT_API_KEY` to enable the model;
without them the assistant still answers from the site's own readings and says so.
`TRUST_PROXY` must be off anywhere the server is reachable directly.

`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` for the digest and the operator channel — without
them nothing leaves the server at all. At least one owner channel (see the table above) if
site owners are to be told about their own emergencies; every one is optional and every one
is skipped rather than failed when unset, which is why the server names the missing ones at
startup instead of leaving it to be discovered after an incident.

`PUBLIC_BASE_URL` is the address the panel hands a site operator to paste into the plugin's
connector settings. The site stores it and polls `{server_url}/plugin/manifest` from then
on, so a wrong value at pairing time means that site never sees a plugin update — and
changing it later does not repair sites already paired against the old one.

## Assumptions

- One relay server serves many sites; the pairing secret is per-site.
- The hub is the only client of the server's API.
