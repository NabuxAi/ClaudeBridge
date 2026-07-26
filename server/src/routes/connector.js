import { Router } from 'express'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
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

export default router
