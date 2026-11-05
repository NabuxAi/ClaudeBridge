// ============================================================
// Peer relay receiver — the other DigiWP server hands us a connector
// request it could not deliver itself. See peer-relay.js for the protocol.
//
// Public by mount (the peer holds no session), closed by signature: without
// PEER_RELAY_SECRET configured here nothing is accepted at all, and every
// request must carry a fresh HMAC over its exact bytes. Rate-limited so a
// leaked secret cannot turn this server into a free proxy at full speed.
// ============================================================
import { Router } from 'express'
import { config } from '../config.js'
import * as peerRelay from '../peer-relay.js'
import { limiter, clientIp } from '../security/ratelimit.js'

const router = Router()

const relayLimit = limiter('peer-relay', {
  limit: 600,
  windowMs: 60 * 1000,
  keyFn: (req) => clientIp(req, { trustProxy: config.trustProxy }),
})

router.post('/relay/forward', relayLimit, async (req, res) => {
  if (!config.peerRelay.secret) {
    return res.status(404).json({ message: 'peer relay is not enabled on this server' })
  }
  const ok = peerRelay.verifyRelay({
    timestamp: req.get('x-digiwp-relay-timestamp'),
    signature: req.get('x-digiwp-relay-signature'),
    rawBody: req.rawBody || '',
  })
  if (!ok) return res.status(401).json({ message: 'bad relay signature' })

  try {
    const answer = await peerRelay.forward(req.body || {})
    res.json(answer)
  } catch (e) {
    const status = e.status && e.status < 500 ? e.status : 502
    res.status(status).json({ message: e.message || 'relay failed' })
  }
})

export default router
