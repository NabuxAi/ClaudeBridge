import { Router } from 'express'
import { store } from '../store.js'
import { verifySignature } from '../connector.js'

const router = Router()

// Receiver for the plugin's opt-in "announce this site to the hub" (signed).
// The plugin POSTs here with X-DigiWP-{Timestamp,Signature,Site}. We don't know
// which site until we find whose shared secret validates the signature.
router.post('/connector/register', (req, res) => {
  const timestamp = req.get('X-DigiWP-Timestamp')
  const signature = req.get('X-DigiWP-Signature')
  const pluginSiteId = req.get('X-DigiWP-Site')
  const rawBody = req.rawBody || ''

  const match = store.candidates().find((c) => verifySignature(c.secret, { timestamp, signature, rawBody }))
  if (!match) return res.status(401).json({ ok: false, message: 'signature did not match any known site' })

  let body = {}
  try { body = JSON.parse(rawBody || '{}') } catch { /* ignore */ }
  const site = store.recordRegister(match.id, {
    url: body.site_url, pluginSiteId, name: body.name, version: body.version,
  })
  res.json({ ok: true, site })
})

export default router
