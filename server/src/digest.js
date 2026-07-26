// ============================================================
// Daily security digest — runs a real security_scan on every paired
// site (via the signed connector relay) and sends a Telegram summary.
// Triggered by the scheduler in index.js, or on-demand via the route.
// ============================================================
import { all } from './db.js'
import * as connector from './connector.js'
import { sendTelegram } from './telegram.js'
import { config } from './config.js'

/** MCP tools/call wraps the op result as result.content[0].text (JSON). Unwrap it. */
function unwrap(result) {
  const text = result?.content?.[0]?.text
  if (typeof text === 'string') {
    try { return JSON.parse(text) } catch { return { raw: text } }
  }
  return result || {}
}

/** Scan every paired site and return per-site results + totals. */
export async function scanAllSites() {
  const rows = await all("SELECT * FROM sites WHERE paired = true AND url <> '' AND secret <> '' ORDER BY created_at")
  const results = []
  for (const s of rows) {
    const site = { url: s.url, secret: s.secret, siteKey: s.site_key }
    try {
      const scan = unwrap(await connector.callTool(site, 'security_scan', {}))
      results.push({
        id: s.id, name: s.title || s.name, url: s.url, ok: true,
        critical: scan.critical || 0, suspicious: scan.suspicious || 0,
        clean: !!scan.clean, robots: scan.robots_injection || null,
        findings: Array.isArray(scan.findings) ? scan.findings.slice(0, 5) : [],
      })
    } catch (e) {
      results.push({ id: s.id, name: s.title || s.name, url: s.url, ok: false, error: e.message })
    }
  }
  return results
}

/** Build the Telegram digest text from scan results. */
export function renderDigest(results) {
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const totalCrit = results.reduce((a, r) => a + (r.critical || 0), 0)
  const totalSusp = results.reduce((a, r) => a + (r.suspicious || 0), 0)
  const head =
    `🛡️ <b>گزارش امنیتی روزانه — DigiWP</b>\n` +
    `📅 ${when} UTC\n` +
    `🖥️ سایت‌ها: <b>${results.length}</b> · بحرانی: <b>${totalCrit}</b> · مشکوک: <b>${totalSusp}</b>\n`
  const lines = results.map((r) => {
    if (!r.ok) return `❓ <b>${r.name}</b> — اسکن ناموفق (${r.error || 'خطا'})`
    const icon = r.critical ? '🚨' : r.robots ? '🚨' : r.suspicious ? '⚠️' : '✅'
    let line = `${icon} <b>${r.name}</b> — بحرانی:${r.critical} مشکوک:${r.suspicious}`
    if (r.robots) line += ' · robots آلوده'
    if (r.critical && r.findings.length) line += `\n   <code>${r.findings.filter((f) => f.severity === 'critical').map((f) => f.file).slice(0, 3).join(', ')}</code>`
    return line
  })
  return head + '\n' + (lines.join('\n') || 'هیچ سایت جفت‌شده‌ای نیست.')
}

/** Full daily run: scan + render + send. Returns a summary object. */
export async function runDailyDigest() {
  const results = await scanAllSites()
  const text = renderDigest(results)
  const sent = await sendTelegram(text)
  return { sites: results.length, totalCritical: results.reduce((a, r) => a + (r.critical || 0), 0), sent, text }
}

/** Fire the digest once per day at config.digestHour (UTC). Checks every ~4 min. */
export function scheduleDailyDigest() {
  if (!config.telegram.token || !config.telegram.chatId) {
    console.log('Telegram digest: not configured (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) — skipping scheduler.')
    return
  }
  let lastRunDay = null
  const tick = async () => {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    if (now.getUTCHours() === config.digestHour && lastRunDay !== day) {
      lastRunDay = day
      try {
        const r = await runDailyDigest()
        console.log(`Telegram digest sent for ${day}: ${r.sites} sites, ${r.totalCritical} critical.`)
      } catch (e) {
        console.error('Telegram digest failed:', e.message)
      }
    }
  }
  setInterval(tick, 4 * 60 * 1000)
  console.log(`Telegram digest scheduled daily at ${config.digestHour}:00 UTC.`)
}
