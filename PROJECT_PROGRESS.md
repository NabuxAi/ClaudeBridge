# WP Claude Bridge — progress

Last updated 2026-08-02. Companion to [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md).

## Done in this pass — the server can now actually drive a site

Everything needed was already built, and nothing connected it:

- `POST /sites/:id/actions` could relay **any** of the plugin's 58 tools, with an approval
  gate on the destructive ones. Working.
- `PATCH /sites/:id/authority` stored `report` / `confirm` / `auto`, and the seed even set a
  demo site to `auto`. **Nothing read it.** The column was written, returned by the API and
  rendered in the panel, and gated exactly nothing.
- `assistant.answer()` read three probes — `site_info`, `update_status`, `backup_list` —
  rendered a briefing, and stopped. It could describe a site and never touch one.

So the answer to "how much may the assistant do unattended?" was a question about a
capability that did not exist. Claude connected directly to the plugin had all 58 tools;
our own server had three reads.

### The assistant now calls tools

`assistant.js` gained a bounded tool loop. Tools are offered to the model as OpenAI-wire
function definitions, the model's requests are executed through the existing signed
connector, results are fed back, and it iterates until it answers.

Deliberate choices:

- **The tool schemas declare an open object rather than 58 hand-written parameter sets.**
  The plugin validates its own arguments and is the authority on their shape; re-declaring
  them here would be a second source of truth that drifts.
- **A refusal is returned to the model as the tool's result**, not thrown. "You may not do
  that without approval" is information it needs to answer usefully; hiding it produces an
  assistant that silently does nothing.
- **The step budget terminates the loop rather than nudging it.** The first version pushed
  a "that's enough tools now" message and continued with the tools still attached — against
  a model that requests a tool every turn, that loops forever, and the test that drives
  exactly that case caught it. It now makes one final call with the tools removed.

### Authority is enforced, in one place

New `src/authority.js` classifies every tool by consequence and answers whether a level
permits it:

| | `report` | `confirm` | `auto` |
|---|---|---|---|
| read (33 tools) | ✅ | ✅ | ✅ |
| mutating (17 tools) | proposed | proposed | ✅ performed |
| destructive (8 tools) | proposed | proposed | proposed |

- **Reading is allowed at every level.** Refusing to look is not caution, it is uselessness.
- **Destructive tools need a human at every level**, `auto` included — that is the whole
  reason the selector is three-way and not two-way.
- **An unknown tool is classified destructive.** New tools land in the plugin before they
  land here, and the failure that costs something is the one where an unclassified tool
  runs unattended.
- A refusal carries a *reason*, because "this needs your approval" and "I am only allowed
  to look right now" lead to different next steps.
- Proposals carry the real arguments, so approving one needs no retyping.
- `routes/sites.js` had its own literal list of sensitive tools; it now imports the shared
  set. Two lists that must agree are one list that will eventually disagree.
- Anything the assistant performs is written to the audit log with `by: 'assistant'` and
  the authority it acted under.

### Two real faults found on the way

**A circular import that only worked by luck.** `db.js` imported the events table's DDL
from `events.js`, which imports `db.js` for its query helpers. An ES module cycle does not
fail loudly — it works or explodes depending on which side is evaluated first. Importing
`events.js` first threw `Cannot access 'EVENTS_SCHEMA' before initialization` and took the
process down at boot; the server only started because of the order `index.js` happened to
use, and any new route or refactor could have broken it. The DDL now lives in
`src/events.schema.js`, which depends on nothing. Both import orders are proven to work.

**The one unguarded probe.** `gatherFacts` settles every connector call independently —
its stated premise is that a failing source must not blank the others — except the event-log
read, which was unwrapped. A database hiccup turned the whole assistant into a 500 instead
of an answer naming which part was missing. It is now settled like the rest.

### Tests

167 pass, up from 145.

- `test/authority.test.js` (12) — every level against every class, the unknown-tool default,
  an invalid level falling back to the most cautious one, no overlap between the three
  lists, and that no destructive tool is ever offered to the model.
- `test/assistant-tools.test.js` (10) — the loop end to end. Both hops are HTTP, so one
  `fetch` stub routed by URL covers the model call *and* the connector call, which means
  the connector's real signing and response handling run rather than a stand-in.

## The panel now shows proposals, and approving one runs it

Server-initiated work was only half a feature while the proposals stayed in the JSON. The
assistant would decline a change and describe it, the owner had no button, and `confirm`
was indistinguishable from `report` — the only way to act was to go and do it by hand.

`hub/src/pages/site/Assistant.jsx` now renders what the answer carries: what the assistant
already ran, and what it wants permission to run. Each proposal shows the real tool name,
its real arguments and the reason it was held, with a **تأیید و اجرا** button that posts
straight to `/sites/:id/actions` with `approved: true`. Sensitive proposals are marked as
such, so approving one is a deliberate act rather than a reflex.

Approving runs *the proposal* — the same tool, the same arguments — rather than a version
the panel retyped. That is the property the new test pins hardest.

`server/test/actions-approval.test.js` covers the seam over real HTTP: a sensitive tool is
held with 202 and never reaches the connector; the same tool with `approved: true` is
relayed with its arguments intact; a non-sensitive tool needs no approval; **every** tool
the shared policy calls sensitive is held by the route, not a subset; and the panel's
older `action` field still works alongside the assistant's `tool`, so neither caller
breaks silently.

The connector could not be stubbed directly — it is a module function, and ES module
bindings are read-only — so the stub sits one level lower and answers the HTTP call the
connector makes. That has the side benefit of running the connector's real signing and
response handling rather than a stand-in for them.

173 tests pass, up from 167.

## Remaining work

1. **The audit-log write is not covered by a test.** It is `.catch()`-swallowed by design
   and needs a real Postgres to observe; the tests run without one.
2. **`MAX_TOOL_STEPS` is a constant.** Five is right for a maintenance question; a "fix my
   site" flow will want more, and that should be a per-request budget rather than an edit.
3. ~~A proposal is not persisted.~~ **Done** — see the 2026-08-02 entry at the end.

## Validation

```bash
cd server && npm test           # 173 tests
node --test test/authority.test.js test/assistant-tools.test.js test/actions-approval.test.js

cd hub && npm run build         # the proposal UI compiles
```

## Needs you

**`ASSISTANT_URL` and `ASSISTANT_API_KEY`.** The assistant answers without them — from the
site's own readings, saying plainly that free-form questions are not available — but it
cannot call tools without a model to ask for them. The endpoint is OpenAI-wire, so
NabuGate serves it directly: point `ASSISTANT_URL` at the gateway and set `ASSISTANT_MODEL`
to an alias such as `nabu-smart`.

Nothing has been faked: with no gateway configured the tool loop simply never starts, and
the assistant says why.

---

## 2026-08-02 — the assistant now acts on a real site, and production had two databases

Everything below was found by running the deployed system rather than the test
suite. The suite was green throughout; none of these faults are visible from it.

### Two databases were answering to the same name

The most serious finding, and unrelated to the assistant.

A manual deployment from 30 July left a Postgres container, `digiwp-pg`, on the
application network with the network alias **`db`** — the same alias the
Coolify-managed database uses. Docker DNS returns every container holding an
alias, so `db` resolved to two addresses and connections round-robined between
two different databases.

The two were not copies. `digiwp-pg` held the real production data: three
accounts, including two real users, and the genuinely paired site
`account30t.com`. The Coolify-managed database held seed data only — 16 KB
against 3.4 MB. So roughly half of every real request was served by a database
that did not contain the requester, which presents as intermittent
"password authentication failed" and, worse, as a login that works one moment
and fails the next.

Resolved by dumping both (kept at `/root/cb-backups/`), restoring the real data
into the Coolify-managed database, and disconnecting `digiwp-pg` from the
network. The container is intact and stopped, not removed, so the step is
reversible. The stale `-manual` server and hub containers, which claimed the
same Traefik router names as the live ones and were returning 503 on
`api.digiwp.com` and `ai.digiwp.com`, were stopped for the same reason.

**Worth your decision:** `digiwp-pg` and the two `-manual` containers are now
idle. They can be removed once you are satisfied nothing was lost, but that is
your call, not one to make on your behalf.

### The demo WordPress had never had the plugin

The demo site received the connector as a bind mount of
`./wp-claude-bridge.php`. That path resolves relative to wherever compose runs
— a checkout locally, and Coolify's application directory in production, which
holds the rendered compose file and nothing else. Docker does not treat a
missing bind source as an error; it creates it, as a **directory**. So the
plugins folder contained a directory named `wp-claude-bridge.php`, WordPress
loaded nothing, and neither side logged anything.

"A real WordPress site to pair with the hub" is the entire purpose of that
service, and it had been untrue since deployment. The plugin is now baked into
the image and installed by an entrypoint on every start, so it no longer
depends on where compose is run.

### The approval path could not be reached

The system prompt told the model, at `report` and `confirm`, to "propose the
change in words instead". It did — a paragraph, no tool call, and therefore no
proposal. But a proposal only exists when the model **calls** a tool and the
server refuses it: that refusal is what captures the tool name and its real
arguments and puts an approve button in front of the owner.

Following the instruction produced exactly the outcome the approval feature
exists to prevent. The model is now told to always call the tool it intends,
even expecting refusal, and that the server enforces authority so it need not.

### The owner was shown raw JSON

The model's reply was passed to the screen exactly as produced. Against
`nabu-smart` it arrived as a JSON document, so the panel rendered
`{"reply": "در ..."}`. `plainReply()` unwraps a JSON object carrying
a known text field and strips a code fence, leaving prose that merely opens
with a brace alone.

### ASSISTANT_URL rejected the way people write it

`/v1/chat/completions` was appended unconditionally, so the natural value —
which ends in `/v1`, as every OpenAI-compatible base URL does — produced
`/v1/v1/chat/completions` and a 404 that reads as "the assistant is not
answering". Both forms now work.

### The gateway had no key for this project

NabuGate had no `claudebridge` key, so `ASSISTANT_API_KEY` had nothing to hold.
Added, scoped to `nabu-*` chat aliases only — it embeds nothing — at 300/min,
because one question runs a bounded tool loop and becomes several completions.

### A landmine in the deployment config

Coolify stored `AUTH_SECRET=please-change-this-secret` while the running
container had a real 48-character secret. `assertSecretIsReal()` calls
`process.exit(1)` in production for a secret under 32 characters, so the next
deploy would have replaced a working secret with one that refuses to boot.
Coolify now holds the secret actually in use — no sessions were invalidated.

### Proof, on the live deployment

Against the demo site, paired with a real shared secret:

1. **Read** — "which WordPress and PHP versions, and which theme?" The assistant
   called `site_info` and `list_themes` on the live site and answered from what
   they returned: WordPress 7.0.2, PHP 8.2.25, Twenty Twenty-Four 1.2.
2. **Refuse and propose** — "clear the site cache" under `confirm` authority.
   Nothing ran (`ran: []`), and the answer carried
   `requiresApproval: true` with a proposal naming `flush_cache`, its
   arguments, and `kind: mutating`.
3. **Approve and execute** — posting that proposal back with `approved: true`
   relayed it, and the site returned `{"flushed":["object-cache","opcache"]}`.
4. **The sensitive gate holds** — `db_query` without approval is answered 202
   and never reaches the site.

That is the server-initiated path working end to end, against a real WordPress,
through the real signed connector.

### Still open

- **`digiwp-pg` and the two `-manual` containers** are idle and awaiting your
  decision to remove.
- **The demo site is paired by a secret written directly into both sides** for
  this proof. The normal pairing flow through the panel was not exercised.
- **MAX_TOOL_STEPS is still a constant.** Five suits a maintenance question; a
  "fix my site" flow will want a per-request budget.
- ~~A proposal is not persisted.~~ **Done** — see below.

---

## 2026-08-02 (later) — an approval can now wait, and come from someone else

A proposal existed only in the panel's React state. It lasted exactly as long as
the tab did: a refresh lost it, and the only person who could act on one was
whoever asked the question that produced it.

That made `confirm` authority weaker than it reads. The point of a three-way
setting is that a change can wait for a human — but a confirmation that has to
arrive in the same breath as the question is not a second pair of eyes, it is
the same pair.

Proposals are a table now. The panel loads what is still open on mount, so the
approve button is an inbox rather than a transient.

### Two properties the database enforces, not hopeful code

**One open proposal per change.** A partial unique index on
`(site_id, tool, md5(args))` where the status is pending. The assistant
re-proposes the same thing every time it is asked the same question, and a list
that grows a row per retry is a list nobody reads. Because the index covers only
pending rows, the same change can legitimately be proposed again after an
earlier one was resolved — flushing the cache twice in a week is two decisions.

**One execution per approval.** Approving claims the row with an `UPDATE …
WHERE status = 'pending'` *before* the tool runs. Two people clicking approve at
the same instant both issue it and exactly one matches; the loser gets 409 and
runs nothing. Without that, an approval queue is a way to make the same change
to a live site twice.

### Proven on the live deployment

```
POST /assistant  "clear the cache"   → ran: none, requiresApproval: true
GET  /proposals  (a fresh page load) → prop_d70a…  flush_cache  {}  pending
two simultaneous approvals           → 200 {"flushed":["object-cache","opcache"]}
                                       409 "این پیشنهاد پیش‌تر تعیین تکلیف شده است."
GET  /proposals                      → []
```

The 200 is the real WordPress: the cache was actually flushed. The 409 is the
second click, which executed nothing.

### Deliberately non-fatal

Recording a proposal cannot fail the answer — if the write fails the caller
still sees the proposal in that response, exactly as it behaved before the table
existed. The panel treats an unreadable proposal list as empty rather than
breaking the whole view over a feature that is additional to it.

### Tests

Eight against a real PostgreSQL, skipped when `CB_TEST_DATABASE_URL` is unset,
because both properties above are database behaviour and a stand-in would test
the stand-in. They cover the round trip with arguments intact, deduplication of
a repeated proposal, different arguments staying distinct, resolution keeping
the row with who decided, only the first of two simultaneous approvals winning,
a resolved proposal refusing a second resolution, cross-site isolation, and a
resolved change being proposable again.

188 tests: 187 pass, 1 skipped without a database.

## Remaining work

1. **The audit-log write is not covered by a test.** It is `.catch()`-swallowed
   by design and needs a real Postgres to observe.
2. **`MAX_TOOL_STEPS` is a constant.** Five suits a maintenance question; a
   "fix my site" flow wants a per-request budget.
3. **Nothing notifies anyone that a proposal is waiting.** It is now durable and
   visible on the site's page, but a person who never opens that page will not
   learn of it. The alert-delivery machinery already exists for events.
