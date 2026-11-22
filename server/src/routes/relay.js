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
import { discoverWordPress } from '../site-address.js'
import { peerLinks } from '../peer-link.js'
import { runTool } from './hub-mcp.js'
import { errorMessage } from '../i18n.js'

const router = Router()

const relayLimit = limiter('peer-relay', {
  limit: 600,
  windowMs: 60 * 1000,
  keyFn: (req) => clientIp(req, { trustProxy: config.trustProxy }),
})

/** Only the partner server, holding PEER_RELAY_SECRET, gets past here. */
function signedByPeer(req, res, next) {
  if (!config.peerRelay.secret) {
    return res.status(404).json({ message: 'peer relay is not enabled on this server' })
  }
  const ok = peerRelay.verifyRelay({
    timestamp: req.get('x-digiwp-relay-timestamp'),
    signature: req.get('x-digiwp-relay-signature'),
    rawBody: req.rawBody || '',
  })
  if (!ok) return res.status(401).json({ message: 'bad relay signature' })
  next()
}

router.post('/relay/forward', relayLimit, signedByPeer, async (req, res) => {
  try {
    const answer = await peerRelay.forward(req.body || {})
    res.json(answer)
  } catch (e) {
    const status = e.status && e.status < 500 ? e.status : 502
    res.status(status).json({ message: e.message || 'relay failed' })
  }
})

// The partner asks: can YOU see this WordPress site? Same public discovery as
// /sites/discover (public addresses only, bounded time and body); the answer
// is what this server saw, never relayed any further.
router.post('/relay/discover', relayLimit, signedByPeer, async (req, res) => {
  try {
    res.json({ ok: true, result: await discoverWordPress(req.body?.url) })
  } catch (e) {
    res.json({ ok: false, key: e.i18n?.key || 'sites.reach.unknownFailure' })
  }
})

// ---- linked accounts (peer-link.js) ----

const sendError = (res, e) => res.status(e.status && e.status < 500 ? e.status : 502)
  .json({ message: e.message || 'failed', ...(e.i18n ? { i18n: { key: e.i18n.key } } : {}) })

router.post('/relay/link/redeem', relayLimit, signedByPeer, async (req, res) => {
  try { res.json(await peerLinks.spendCode(req.body || {})) } catch (e) { sendError(res, e) }
})

router.post('/relay/link/revoke', relayLimit, signedByPeer, async (req, res) => {
  try { await peerLinks.dropMirror(req.body || {}); res.json({ ok: true }) } catch (e) { sendError(res, e) }
})

// The partner's hub MCP acting for a linked account: allowed only when OUR
// row pairs exactly these two accounts, and run under our own policy as our
// user. `federated` keeps it to this server's sites: no second hop.
router.post('/relay/mcp', relayLimit, signedByPeer, async (req, res) => {
  const { userId, peerUserId, name, args } = req.body || {}
  const user = await peerLinks.localUserFor({ userId, peerUserId }).catch(() => null)
  if (!user) return res.status(403).json({ message: 'these accounts are not linked' })
  try {
    const result = await runTool(user, String(name || ''), args && typeof args === 'object' ? args : {}, { federated: true })
    res.json({ result })
  } catch (e) {
    res.json({ result: { content: [{ type: 'text', text: errorMessage('en', e) || 'The call failed.' }], isError: true } })
  }
})

export default router
