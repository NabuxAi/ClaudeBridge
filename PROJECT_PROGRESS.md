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
3. **A proposal is not persisted.** Approving works while the answer is still on screen; a
   refresh loses it. Fine for a conversational flow, wrong if approvals are ever meant to
   wait for someone else.

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
