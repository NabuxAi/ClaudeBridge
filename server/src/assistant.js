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

  const openEvents = (await events.list(site.id, 40)).filter((e) => !e.resolved_at)
  facts.openAlerts = openEvents.map((e) => ({ severity: e.severity, title: e.title, kind: e.kind }))

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

/**
 * Answer a question.
 *
 * With no model configured this returns the briefing plus an honest note that
 * it cannot hold a conversation — better than a fluent paragraph that happens
 * to be fiction. With a model, the facts go in as the only permitted source.
 */
export async function answer(site, message) {
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
  ].join('\n')

  try {
    const res = await fetch(`${config.assistant.url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.assistant.key}`,
      },
      body: JSON.stringify({
        model: config.assistant.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: String(message || '') }],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    const reply = body?.choices?.[0]?.message?.content
    if (!reply) throw new Error('پاسخ خالی بود')
    return { reply, refs, grounded: true, unknown: facts.unknown }
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
