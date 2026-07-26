// ============================================================
// Daily security digest — runs a real security_scan on every paired
// site (via the signed connector relay) and sends a Telegram summary.
// Triggered by the scheduler in index.js, or on-demand via the route.
// ============================================================
import { all } from './db.js'
import * as events from './events.js'
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
      // The scan reached the site, so whatever we recorded about not being
      // able to reach it is over.
      await events.resolveByPrefix(s.id, 'scan:unreachable')
      await recordScanEvents(s.id, scan)
    } catch (e) {
      results.push({ id: s.id, name: s.title || s.name, url: s.url, ok: false, error: e.message })
      await events.record({
        siteId: s.id, kind: 'scan_failed', severity: 'warning',
        title: 'اسکن امنیتی به سایت نرسید',
        detail: { error: e.message },
        fingerprint: 'scan:unreachable',
      })
    }
  }
  return results
}

/**
 * Turn one scan into events.
 *
 * Findings are fingerprinted per file, so a shell that survives four nightly
 * scans stays one open alert with its original discovery time — and disappears
 * from the open list the night it is actually gone, because the next clean
 * scan resolves it. That resolution is the measurement disagreeing with the
 * previous one, never someone marking it done.
 */
async function recordScanEvents(siteId, scan) {
  const findings = Array.isArray(scan.findings) ? scan.findings : []
  const seen = new Set()

  for (const f of findings) {
    const fp = `scan:file:${f.file}`
    seen.add(fp)
    await events.record({
      siteId,
      kind: 'malware',
      severity: f.severity === 'critical' ? 'critical' : 'warning',
      title: f.severity === 'critical'
        ? `فایل آلوده پیدا شد: ${f.file}`
        : `فایل مشکوک: ${f.file}`,
      detail: { file: f.file, rule: f.rule || null, severity: f.severity, why: f.why || null },
      fingerprint: fp,
    })
  }

  if (scan.robots_injection) {
    seen.add('scan:robots')
    await events.record({
      siteId, kind: 'malware', severity: 'critical',
      title: 'فایل robots.txt دستکاری شده',
      detail: scan.robots_injection,
      fingerprint: 'scan:robots',
    })
  }

  // Close what this scan no longer sees. Done per fingerprint rather than by
  // wiping everything, so a scan that only covered part of the site cannot
  // silently declare the rest clean.
  const open = await events.list(siteId, 200)
  for (const ev of open) {
    if (ev.resolved_at || !ev.fingerprint) continue
    if (!ev.fingerprint.startsWith('scan:file:') && ev.fingerprint !== 'scan:robots') continue
    if (!seen.has(ev.fingerprint)) await events.resolveOne(siteId, ev.id)
  }
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
