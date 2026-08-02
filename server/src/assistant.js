// ============================================================
// The assistant — answers built from what the site actually reports.
//
// It used to return one hardcoded paragraph to every question, including
// invented figures ("host storage reached 82%") for a metric this system has
// never measured. That is the most damaging kind of fake data in the product:
// it is phrased as a personal report about *your* site, so it is believed.
//
// What replaces it has one rule — every sentence traces to a real reading, and
// anything not measured is named as not measured. When a language model is
// configured, it is given these same facts and told it may not add any; when
// one is not, the briefing itself is the answer. In neither case does the
// assistant invent a number.
// ============================================================
import * as connector from './connector.js'
import * as events from './events.js'
import { config } from './config.js'
import { updatesFromStatus } from './live.js'
import { classify, offeredTools, permits, readAuthority } from './authority.js'
import * as proposalStore from './proposals.js'

/**
 * The chat-completions URL for an OpenAI-compatible gateway.
 *
 * ASSISTANT_URL is written by a person, and every OpenAI-compatible base URL
 * in the wild ends in /v1 — the provider docs, the SDK defaults, our own
 * gateway's published address. Appending /v1 unconditionally therefore turns
 * the most natural value anyone could enter into /v1/v1/chat/completions and a
 * 404, which surfaces as "the assistant is not answering" with nothing to say
 * why. Accept the URL with or without it.
 */
export function completionsEndpoint(base) {
  const trimmed = String(base || '').replace(/\/+$/, '')
  const root = trimmed.replace(/\/v1$/, '')
  return `${root}/v1/chat/completions`
}

/**
 * The prose inside whatever the model actually returned.
 *
 * The reply goes straight onto the owner's screen, so anything the model wraps
 * around it is visible. Models asked for structure elsewhere in a conversation
 * will sometimes answer with a JSON object or a fenced block even when the
 * prompt asks for prose — and a reply rendered as {"reply": "در ..."}
 * is not a degraded answer, it is an unreadable one.
 *
 * Only unwrapping when the payload is an object carrying a known text field
 * keeps a legitimate answer that merely happens to discuss JSON intact.
 */
export function plainReply(content) {
  const text = String(content ?? '').trim()
  if (!text) return ''

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  const inner = fenced ? fenced[1].trim() : text
  if (!inner.startsWith('{')) return fenced ? inner : text

  try {
    const parsed = JSON.parse(inner)
    for (const key of ['reply', 'answer', 'content', 'text', 'message']) {
      if (typeof parsed?.[key] === 'string' && parsed[key].trim()) {
        return parsed[key].trim()
      }
    }
  } catch {
    // Not JSON after all — a reply that merely opens with a brace.
  }
  return fenced ? inner : text
}

const unwrap = (raw) => {
  const text = raw?.content?.[0]?.text
  if (typeof text === 'string') { try { return JSON.parse(text) } catch { return null } }
  return raw || null
}

/**
 * Everything we can currently say about a site, with its gaps.
 *
 * Each probe is settled independently: one connector call failing must not
 * blank the others, and a failure is itself a fact worth reporting — "I could
 * not reach your site" is a real answer.
 */
export async function gatherFacts(site) {
  const facts = { known: [], unknown: [] }

  // Settled like every other probe below. This was the one unguarded call in a
  // function whose whole premise is that a failing source must not blank the
  // rest — a database hiccup turned the entire assistant into a 500 instead of
  // an answer that says which part is missing.
  try {
    const openEvents = (await events.list(site.id, 40)).filter((e) => !e.resolved_at)
    facts.openAlerts = openEvents.map((e) => ({ severity: e.severity, title: e.title, kind: e.kind }))
  } catch (e) {
    facts.openAlerts = []
    facts.unknown.push(`لاگ هشدارها خوانده نشد: ${e?.message || 'خطا'}`)
  }

  if (!site.paired || !site.url || !site.secret) {
    facts.unknown.push('سایت هنوز به سرور ما وصل نشده، پس هیچ اطلاعات زنده‌ای از آن نداریم.')
    return facts
  }

  const target = { url: site.url, secret: site.secret, siteKey: site.site_key }
  const [info, updates, backups] = await Promise.allSettled([
    connector.callTool(target, 'site_info', {}),
    connector.callTool(target, 'update_status', {}),
    connector.callTool(target, 'backup_list', {}),
  ])

  if (info.status === 'fulfilled') {
    const d = unwrap(info.value)
    if (d) facts.site = { wp: d.wp_version || null, php: d.php_version || null, title: d.name || null }
  } else {
    facts.unknown.push(`اطلاعات پایهٔ سایت خوانده نشد: ${info.reason?.message || 'خطا'}`)
  }

  if (updates.status === 'fulfilled') {
    const live = updatesFromStatus(unwrap(updates.value))
    if (live) {
      facts.updates = {
        pending: live.queue?.length ?? 0,
        wpVersion: live.wpVersion, wpLatest: live.wpLatest,
        policy: live.policy || null,
        items: (live.queue || []).slice(0, 6).map((q) => `${q.name} → ${q.to}`),
      }
    }
  } else {
    facts.unknown.push(`وضعیت به‌روزرسانی‌ها خوانده نشد: ${updates.reason?.message || 'خطا'}`)
  }

  if (backups.status === 'fulfilled') {
    const d = unwrap(backups.value)
    if (d && Array.isArray(d.backups)) {
      facts.backups = {
        count: d.backups.length,
        last: d.backups[0] ? new Date(d.backups[0].created_at * 1000).toLocaleString('fa-IR') : null,
        verified: d.backups[0] ? Boolean(d.backups[0].verified) : null,
      }
    }
  } else {
    facts.unknown.push(`فهرست بکاپ‌ها خوانده نشد: ${backups.reason?.message || 'خطا'}`)
  }

  // Named explicitly rather than left silent. These are the questions people
  // ask an assistant first, and an answer that skips the question reads as
  // "everything is fine" instead of "I cannot see that".
  facts.unknown.push('آپ‌تایم و سرعت پاسخ سایت را نمی‌سنجیم — پایش مستمر هنوز ساخته نشده.')
  facts.unknown.push('فضای دیسک و منابع هاست را نمی‌بینیم.')

  return facts
}

/** The briefing, in Persian, entirely from `facts`. */
export function renderBriefing(facts) {
  const lines = []

  if (facts.site) {
    const bits = []
    if (facts.site.wp) bits.push(`وردپرس ${facts.site.wp}`)
    if (facts.site.php) bits.push(`PHP ${facts.site.php}`)
    if (bits.length) lines.push(`سایت روی ${bits.join(' و ')} است.`)
  }

  if (facts.updates) {
    if (facts.updates.pending > 0) {
      lines.push(`${faNum(facts.updates.pending)} به‌روزرسانی در صف است${facts.updates.items.length ? '؛ از جمله ' + facts.updates.items.join('، ') : ''}.`)
    } else {
      lines.push('همه‌چیز به‌روز است — چیزی در صف به‌روزرسانی نیست.')
    }
    if (facts.updates.wpVersion && facts.updates.wpLatest && facts.updates.wpVersion !== facts.updates.wpLatest) {
      lines.push(`هستهٔ وردپرس روی ${facts.updates.wpVersion} است در حالی که ${facts.updates.wpLatest} منتشر شده.`)
    }
  }

  if (facts.openAlerts?.length) {
    const crit = facts.openAlerts.filter((a) => a.severity === 'critical')
    lines.push(
      crit.length
        ? `${faNum(crit.length)} هشدار بحرانی باز دارید: ${crit.slice(0, 3).map((a) => a.title).join('؛ ')}`
        : `${faNum(facts.openAlerts.length)} هشدار باز دارید که هیچ‌کدام بحرانی نیست.`
    )
  } else {
    lines.push('هیچ هشدار بازی ثبت نشده.')
  }

  if (facts.backups) {
    lines.push(
      facts.backups.count
        ? `آخرین بکاپ: ${facts.backups.last}${facts.backups.verified ? ' (کامل بودنش بررسی شده)' : ' — کامل بودنش تأیید نشده'}.`
        : 'هیچ بکاپی روی سایت ثبت نشده.'
    )
  }

  if (!lines.length) lines.push('هنوز هیچ دادهٔ زنده‌ای از این سایت نداریم.')

  return lines.join(' ')
}

const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

// How many times the model may ask for a tool before we stop. A maintenance
// question needs two or three calls; anything past that is a loop, and a loop
// against a live site is worse than an incomplete answer.
//
// Five suits "is my site up to date?". It does not suit "work out why the
// checkout is broken", which legitimately reads several things before it can
// say anything — and silently truncating that produces a confident, incomplete
// answer, which is the worst outcome available.
const DEFAULT_TOOL_STEPS = 5

// The ceiling a caller may ask for. A budget is a bound on how much a single
// question may do to a live site; one the caller can set to anything is not a
// bound at all. ASSISTANT_MAX_TOOL_STEPS moves it for a deployment that wants
// longer investigations, without letting any individual request decide.
const HARD_TOOL_STEP_LIMIT = (() => {
  const raw = process.env.ASSISTANT_MAX_TOOL_STEPS?.trim()
  if (!raw) return 12
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 12
})()

/**
 * The step budget for one question.
 *
 * Anything unusable — absent, not a number, zero, negative, fractional — falls
 * back to the default rather than being clamped into something surprising. A
 * caller asking for 0 steps means an assistant that can only guess, which is
 * never what anyone wants and is more likely a bug in the caller.
 */
export function stepBudget(requested) {
  // Only a number or a numeric string. Number(true) is 1, which would quietly
  // turn `maxToolSteps: true` — a plausible thing for a caller to send — into a
  // one-step budget rather than the default.
  if (typeof requested !== 'number' && typeof requested !== 'string') {
    return DEFAULT_TOOL_STEPS
  }
  const n = Number(requested)
  if (!Number.isInteger(n) || n < 1) return DEFAULT_TOOL_STEPS
  return Math.min(n, HARD_TOOL_STEP_LIMIT)
}

/** The tool list handed to the model, as OpenAI-wire function definitions. */
function toolSchemas(level) {
  return offeredTools(level).map((name) => ({
    type: 'function',
    function: {
      name,
      description: `WP Claude Bridge tool \`${name}\` on the managed site.`,
      // The plugin validates its own arguments and is the authority on their
      // shape. Re-declaring 58 schemas here would be a second source of truth
      // that drifts; an open object lets the model pass what the tool wants and
      // lets the plugin reject what it does not.
      parameters: { type: 'object', properties: {}, additionalProperties: true },
    },
  }))
}

/**
 * Run one tool the model asked for, or refuse it.
 *
 * A refusal is returned to the model as the tool's result rather than thrown:
 * "you may not do that without approval" is information it needs in order to
 * say something useful, and hiding it produces an assistant that silently does
 * nothing.
 */
async function runToolCall(site, level, call, proposals) {
  const name = call?.function?.name || ''
  let args = {}
  try {
    args = call?.function?.arguments ? JSON.parse(call.function.arguments) : {}
  } catch {
    return { ok: false, error: 'arguments were not valid JSON' }
  }

  const verdict = permits(level, name)
  if (!verdict.allowed) {
    proposals.push({ tool: name, args, kind: verdict.kind, reason: verdict.reason })

    // Also persisted, so the approval can arrive later and from someone else.
    // Failing to record it must not turn a refusal into an error: the caller
    // still sees the proposal in this answer, which is exactly how it behaved
    // before there was a table at all.
    proposalStore
      .record({
        siteId: site.id,
        userId: site.user_id,
        tool: name,
        args,
        kind: verdict.kind,
        reason: verdict.reason,
        authority: level,
      })
      .catch(() => {})

    return { ok: false, refused: true, reason: verdict.reason }
  }

  if (!site.paired || !site.url || !site.secret) {
    return { ok: false, error: 'site is not connected' }
  }

  try {
    const result = await connector.callTool(
      { url: site.url, secret: site.secret, siteKey: site.site_key },
      name,
      args,
    )
    // Anything that changed the site is logged, whether a human asked for it or
    // the assistant did it under standing authority. "Nobody remembers doing
    // that" is exactly what an audit trail is for.
    if (verdict.kind === 'mutating') {
      events.record({
        siteId: site.id,
        kind: 'action',
        severity: 'info',
        title: `دستیار اجرا کرد: ${name}`,
        detail: { op: name, args, by: 'assistant', authority: level },
      }).catch(() => {})
    }
    return { ok: true, result: unwrap(result) ?? result }
  } catch (e) {
    return { ok: false, error: e.message || 'tool failed' }
  }
}

/**
 * Answer a question.
 *
 * With no model configured this returns the briefing plus an honest note that
 * it cannot hold a conversation — better than a fluent paragraph that happens
 * to be fiction. With a model, the facts go in as the only permitted source,
 * and the model may additionally reach for the site's own tools — bounded by
 * the authority level the owner chose, which until now nothing consulted.
 */
export async function answer(site, message, { maxToolSteps } = {}) {
  const facts = await gatherFacts(site)
  const briefing = renderBriefing(facts)
  const refs = []
  if (facts.updates) refs.push('صف به‌روزرسانی‌ها')
  if (facts.openAlerts?.length) refs.push('لاگ هشدارها')
  if (facts.backups) refs.push('فهرست بکاپ‌ها')

  if (!config.assistant?.url || !config.assistant?.key) {
    return {
      reply: briefing,
      refs,
      grounded: true,
      note: 'این خلاصه مستقیماً از خود سایت خوانده شده. پاسخ‌گویی آزاد به سؤال هنوز فعال نیست، چون مدل زبانی پیکربندی نشده است.',
      unknown: facts.unknown,
    }
  }

  const system = [
    'You are a WordPress maintenance assistant. Answer in Persian (fa).',
    'You may ONLY use the facts given below. If the answer is not in them, say plainly that it is not measured.',
    'Never invent a number, a date, a version, a percentage, or a file name.',
    'Be brief and concrete.',
    '',
    'FACTS:',
    briefing,
    '',
    'NOT MEASURED (say so if asked about these):',
    ...facts.unknown.map((u) => `- ${u}`),
    '',
    // The model has to know the shape of its own permission, or it will either
    // promise actions it cannot take or refuse ones it can.
    'TOOLS: you may call the site\'s tools to check something rather than guess.',
    `AUTHORITY: ${readAuthority(site.authority)}.`,
    '- report:  you may read anything. Changes are never performed, only proposed.',
    '- confirm: you may read anything. A change is proposed for the owner to approve, not performed.',
    '- auto:    you may read and perform recoverable changes yourself.',
    'Destructive tools (deleting, editing files in place, raw SQL, switching theme) always need the owner, at every level.',
    '',
    // The server, not the model, decides what may run. So the model must CALL
    // the tool it wants — a refusal comes back as the tool's result and is
    // recorded as a proposal carrying the real arguments, which is what puts an
    // approve button in front of the owner. A model that instead describes the
    // change in prose produces no proposal at all: the owner reads a paragraph,
    // has nothing to approve, and has to go and do it by hand. Asking for the
    // tool is therefore always correct, whatever the authority level.
    'ALWAYS call the tool for the change you intend, even when you expect it to',
    'be refused. Do not describe a change instead of requesting it: the refusal',
    'is what creates the approval the owner clicks. The server enforces the',
    'authority above — you do not need to enforce it yourself.',
    'If a tool comes back refused, say what you would do and that it needs their approval. Do not pretend it ran.',
    '',
    'Reply with plain Persian prose. Do not wrap your answer in JSON or code fences.',
  ].join('\n')

  const level = readAuthority(site.authority)
  const budget = stepBudget(maxToolSteps)
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: String(message || '') },
  ]
  const proposals = []
  const ran = []

  const post = async (payload) => {
    const res = await fetch(`${completionsEndpoint(config.assistant.url)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.assistant.key}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  try {
    const tools = site.paired ? toolSchemas(level) : []

    for (let step = 0; ; step++) {
      const body = await post({
        model: config.assistant.model,
        messages,
        temperature: 0.2,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      })

      const choice = body?.choices?.[0]?.message
      const calls = choice?.tool_calls || []

      if (!calls.length) {
        const reply = plainReply(choice?.content)
        if (!reply) throw new Error('پاسخ خالی بود')
        return {
          reply,
          refs: [...refs, ...ran.map((r) => `ابزار ${r}`)],
          grounded: true,
          unknown: facts.unknown,
          authority: level,
          ...(ran.length ? { ran } : {}),
          ...(proposals.length ? { proposals, requiresApproval: true } : {}),
        }
      }

      // The model wants to act, but the step budget is gone. Asking it again
      // with the tools still attached is not a stop — a model that requests a
      // tool every turn would keep requesting one forever. Take the tools away
      // and make one final call, so the turn ends with an answer built from
      // what has already been gathered.
      if (step >= budget) {
        messages.push({
          role: 'user',
          content: 'به اندازهٔ کافی ابزار اجرا شد. حالا فقط با همان چیزی که داری پاسخ بده.',
        })
        const last = await post({ model: config.assistant.model, messages, temperature: 0.2 })
        const reply = plainReply(last?.choices?.[0]?.message?.content) || briefing
        return {
          reply,
          refs: [...refs, ...ran.map((r) => `ابزار ${r}`)],
          grounded: true,
          unknown: facts.unknown,
          authority: level,
          truncated: true,
          ...(ran.length ? { ran } : {}),
          ...(proposals.length ? { proposals, requiresApproval: true } : {}),
        }
      }

      messages.push(choice)
      for (const call of calls) {
        const outcome = await runToolCall(site, level, call, proposals)
        if (outcome.ok) ran.push(call.function.name)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(outcome).slice(0, 8000),
        })
      }
    }
  } catch (e) {
    // Falling back to the briefing beats an error screen: the facts are already
    // gathered, and they answer most questions people actually ask.
    return {
      reply: briefing,
      refs,
      grounded: true,
      note: `مدل زبانی در دسترس نبود (${e.message})، پس فقط خلاصهٔ واقعی سایت را می‌بینید.`,
      unknown: facts.unknown,
    }
  }
}
