import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as events from '../events.js'
import { sites } from '../store.js'
import { verifySignature } from '../connector.js'

const router = Router()

// Plugin self-update manifest (public). The DigiWp Ai Bridge connector polls this
// to discover + auto-install newer versions straight from the server.
const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugin-manifest.json')
router.get('/plugin/manifest', (_req, res) => {
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    if (process.env.PLUGIN_DOWNLOAD_URL) m.download_url = process.env.PLUGIN_DOWNLOAD_URL
    res.json(m)
  } catch {
    res.status(404).json({ message: 'plugin manifest not available' })
  }
})

// Central shell bank (public). The connector's security_scan pulls this and
// applies it locally, so adding a signature here instantly upgrades detection
// on every managed site — no plugin update needed.
const SIGNATURES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'security-signatures.json')
router.get('/security/signatures', (_req, res) => {
  try {
    res.json(JSON.parse(readFileSync(SIGNATURES_PATH, 'utf8')))
  } catch {
    res.status(404).json({ message: 'signatures not available' })
  }
})

// Receiver for the plugin's opt-in "announce this site to the hub" (signed).
// The plugin POSTs here with X-DigiWP-{Timestamp,Signature,Site}. We don't know
// which site until we find whose shared secret validates the signature.
router.post('/connector/register', async (req, res, next) => {
  try {
    const timestamp = req.get('X-DigiWP-Timestamp')
    const signature = req.get('X-DigiWP-Signature')
    const pluginSiteId = req.get('X-DigiWP-Site')
    const rawBody = req.rawBody || ''

    const candidates = await sites.candidates()
    const match = candidates.find((c) => verifySignature(c.secret, { timestamp, signature, rawBody }))
    if (!match) return res.status(401).json({ ok: false, message: 'signature did not match any known site' })

    let body = {}
    try { body = JSON.parse(rawBody || '{}') } catch { /* ignore */ }
    const site = await sites.recordRegister(match.id, {
      url: body.site_url, pluginSiteId, name: body.name, version: body.version,
    })
    res.json({ ok: true, site })
  } catch (e) { next(e) }
})

/**
 * What an automatic update run actually did, reported by the site itself.
 *
 * Same signature scheme as /connector/register: we do not know which site is
 * calling until one of the shared secrets validates the body, which means an
 * unsigned or replayed report cannot inject events into someone's log.
 *
 * This is what turns "auto-updates are enabled" into "these five things
 * updated last night and this one failed" — intent versus outcome.
 */
router.post('/connector/report', async (req, res, next) => {
  try {
    const timestamp = req.get('X-DigiWP-Timestamp')
    const signature = req.get('X-DigiWP-Signature')
    const rawBody = req.rawBody || ''

    const candidates = await sites.candidates()
    const match = candidates.find((c) => verifySignature(c.secret, { timestamp, signature, rawBody }))
    if (!match) return res.status(401).json({ ok: false, message: 'signature did not match any known site' })

    let body = {}
    try { body = JSON.parse(rawBody || '{}') } catch { /* ignore */ }
    if (body.kind !== 'update_run') return res.status(400).json({ ok: false, message: 'unknown report kind' })

    const summary = body.summary || {}
    const items = [...(summary.core || []), ...(summary.plugin || []), ...(summary.theme || [])]
    const failed = items.filter((i) => !i.ok && !i.unknown)
    const unknown = items.filter((i) => i.unknown)

    await sites.recordUpdateRun(match.id, { summary, at: body.at ? body.at * 1000 : Date.now() })

    // One event for the run, plus one open alert per failure. A failure is
    // fingerprinted by name so a plugin that fails to update every night stays
    // a single unresolved problem, and closes itself the night it succeeds.
    await events.record({
      siteId: match.id, kind: 'update', severity: failed.length ? 'warning' : 'info',
      title: failed.length
        ? `به‌روزرسانی خودکار: ${faCount(items.length - failed.length)} مورد انجام شد، ${faCount(failed.length)} مورد ناموفق`
        : `به‌روزرسانی خودکار: ${faCount(items.length)} مورد انجام شد`,
      detail: { summary, unknown: unknown.length },
    })

    const failedNames = new Set(failed.map((f) => f.name))
    for (const f of failed) {
      await events.record({
        siteId: match.id, kind: 'update_failed', severity: 'warning',
        title: `به‌روزرسانی ناموفق: ${f.name}`,
        detail: f,
        fingerprint: `update:failed:${f.name}`,
      })
    }
    // Anything that updated cleanly this run closes its old failure alert.
    for (const i of items) {
      if (i.ok && !failedNames.has(i.name)) {
        await events.resolveByPrefix(match.id, `update:failed:${i.name}`)
      }
    }

    res.json({ ok: true })
  } catch (e) { next(e) }
})

const faCount = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

export default router
