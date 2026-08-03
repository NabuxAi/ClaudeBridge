// ============================================================
// Daily security digest — runs a real security_scan on every paired
// site (via the signed connector relay) and sends a Telegram summary.
// Triggered by the scheduler in index.js, or on-demand via the route.
// ============================================================
import { all } from './db.js'
import { sites as siteStore } from './store.js'
import * as events from './events.js'
import * as connector from './connector.js'
import { sendTelegram } from './telegram.js'
import * as proposals from './proposals.js'
import { config } from './config.js'
import { alertChannelStatus } from './alerts/index.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * The bridge version this server publishes, read from the same manifest the
 * sites poll — so the digest cannot disagree with what an update would install.
 * Returns null if it cannot be read, and the section is simply omitted: a
 * version comparison against a guess is worse than no comparison.
 */
export function currentPluginVersion() {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin-manifest.json')
    const v = JSON.parse(readFileSync(path, 'utf8'))?.version
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

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

    // While we have the site on the line anyway, learn which plugin version it
    // is actually running. Registration only fires when the plugin announces
    // itself, which left the fleet view stale — and the version is what decides
    // whether a published fix has landed. Best-effort: a site that will not
    // answer this is still worth scanning.
    try {
      const info = unwrap(await connector.callTool(site, 'site_info', {}))
      if (info?.bridge_version) await siteStore.recordObservedVersion(s.id, info.bridge_version)
    } catch { /* the scan below reports unreachability; no need to say it twice */ }

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
        // The status separates "the plugin refused us" from "the host is
        // returning 500" from "nothing answered" — three failures with three
        // different fixes, which the message alone did not distinguish.
        detail: { error: e.message, status: e.status || null },
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

/**
 * The proposals waiting for a human, as a digest section.
 *
 * A proposal became durable and visible on its site's page, and that was still
 * not the same as anyone finding out: no push, SMS or e-mail channel is
 * configured on this deployment, so the only notification that actually leaves
 * the server is this digest — and it reported security scans only. A decision
 * waiting for approval reached whoever happened to open the panel, which for a
 * change the assistant judged worth making is an arbitrary amount of time.
 *
 * Rendered from the same rows the panel reads, so the two cannot disagree.
 */
export function renderPendingProposals(pending) {
  if (!pending?.length) return ''

  const lines = pending.slice(0, 10).map((p) => {
    const args = p.args && Object.keys(p.args).length
      ? ` <code>${escapeHtml(JSON.stringify(p.args)).slice(0, 60)}</code>`
      : ''
    const mark = p.kind === 'sensitive' ? '🔴' : '🟠'
    return `${mark} <b>${escapeHtml(p.site_name || p.site_id)}</b> — ${escapeHtml(p.tool)}${args}`
  })

  // Saying how many were withheld beats a list that silently stops at ten.
  const more = pending.length > 10 ? `\n   …و ${pending.length - 10} مورد دیگر` : ''

  return `\n\n⏳ <b>در انتظار تأیید شما: ${pending.length}</b>\n` + lines.join('\n') + more
}

/** Telegram's HTML mode needs these escaped, and a tool's arguments are data. */
function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Sites running an older bridge than the one we publish.
 *
 * The server has known both halves of this for a while and never put them
 * together: each site's version is recorded from the nightly contact, and the
 * manifest says what is current. Nobody was told when they diverged — which is
 * how a site sat five days on a version whose security scan fatally errored,
 * while the fix was published, reachable, and installable the whole time.
 *
 * An outdated bridge is reported rather than alerted on: it is not an
 * emergency, and treating it as one is how people learn to skim the digest.
 */
export function renderOutdatedSites(rows, current) {
  if (!current || !rows?.length) return ''

  const behind = rows
    .map((r) => {
      let seen = null
      try { seen = r.connector ? (typeof r.connector === 'string' ? JSON.parse(r.connector) : r.connector) : null } catch { seen = null }
      return { name: r.title || r.name || r.id, version: seen?.version || null }
    })
    // A site that has never reported a version is not known to be behind, and
    // saying it is would be inventing a fact. It shows as unknown instead.
    .filter((r) => r.version && r.version !== current)

  const unknown = rows.length - behind.length -
    rows.filter((r) => {
      let seen = null
      try { seen = r.connector ? (typeof r.connector === 'string' ? JSON.parse(r.connector) : r.connector) : null } catch { seen = null }
      return seen?.version === current
    }).length

  if (!behind.length && unknown <= 0) return ''

  const lines = behind.map((r) => `📦 <b>${escapeHtml(r.name)}</b> — ${escapeHtml(r.version)} → ${escapeHtml(current)}`)
  if (unknown > 0) lines.push(`❔ ${unknown} سایت نسخه‌اش را گزارش نکرده`)

  return `\n\n🔄 <b>افزونه به‌روز نیست: ${behind.length}</b>\n` + lines.join('\n')
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

  // Settled independently: a digest that fails entirely because the proposals
  // query hiccuped is worse than one missing its last section.
  let pending = []
  try {
    pending = await proposals.pendingAcrossSites()
  } catch (e) {
    console.error('digest: could not read pending proposals', e?.message || e)
  }

  // Same treatment as proposals: a digest that loses its last section beats a
  // digest that fails because one query hiccuped.
  let outdated = ''
  try {
    const rows = await all("SELECT id, name, title, connector FROM sites WHERE paired = true")
    outdated = renderOutdatedSites(rows, currentPluginVersion())
  } catch (e) {
    console.error('digest: could not read plugin versions', e?.message || e)
  }

  const text = renderDigest(results) + renderPendingProposals(pending) + outdated
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

  // Which emergency channels can reach a SITE OWNER, said out loud once.
  // Skipping an unconfigured channel is correct, and it also means a
  // deployment with none configured never tells an owner their site is
  // compromised — while looking healthy from every angle, because the operator
  // still gets the ops message. This makes that a choice, not a discovery.
  const ch = alertChannelStatus()
  if (ch.live.length === 0) {
    console.warn(
      'Emergency alerts CANNOT reach site owners — no channel configured. ' +
      `Set one of: ${ch.missing.join(', ')}. ` +
      (ch.ops ? 'The operator channel still receives them.' : 'The operator channel is not configured either.')
    )
  } else {
    console.log(`Emergency alert channels: ${ch.live.join(', ')}` +
      (ch.missing.length ? ` (unset: ${ch.missing.join(', ')})` : ''))
  }
}
