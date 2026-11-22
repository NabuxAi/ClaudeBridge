// ============================================================
// Reachability — which DigiWP server can see a WordPress site.
// ------------------------------------------------------------
// Two servers run this code, one outside Iran and one inside. A site hosted
// in Iran may drop foreign traffic; a foreign site may be filtered inside
// Iran. When a site is added, both servers look at it — this one directly,
// the partner through the signed relay (POST /relay/discover) — and the
// answer is kept on the site row:
//
//   reach = {
//     checkedAt,
//     route: 'direct' | 'peer' | null,   // the road this server takes
//     servers: [{ region, self, ok, reason }],  // 'intl' listed before 'ir'
//   }
//
// `route: 'peer'` is pinned in peer-relay.js, so every later connector call
// from this server — panel, scheduled jobs and the hub MCP alike — goes to
// the partner first, writes included. Both sides use the same public
// discovery (site-address.js): the same SSRF guard, the same honesty about
// what was and was not seen.
// ============================================================
import { config } from './config.js'
import { discoverWordPress, normalizeSiteAddress } from './site-address.js'
import * as peerRelay from './peer-relay.js'

const REMEMBER_MS = 15 * 60 * 1000
const MAX_REMEMBERED = 500
// Discovery answers by normalized site address, so the site created right
// after a check stores what that check saw instead of asking twice.
const recent = new Map() // siteUrl -> { reach, at }

// Errors about the address itself: the same on both sides, no peer needed.
const ADDRESS_ERRORS = new Set(['sites.publicAddressRequired', 'sites.invalidAddress', 'sites.domainRequired'])

const otherRegion = (region) => (region === 'ir' ? 'intl' : region === 'intl' ? 'ir' : '')
const reasonOf = (error) => error?.i18n?.key || 'sites.reach.unknownFailure'

function keyOf(url) {
  try { return normalizeSiteAddress(url) } catch { return '' }
}

function remember(siteUrl, reach) {
  const key = keyOf(siteUrl)
  if (!key) return
  recent.delete(key)
  recent.set(key, { reach, at: Date.now() })
  while (recent.size > MAX_REMEMBERED) recent.delete(recent.keys().next().value)
}

/** The reach a check saw for this address in the last few minutes, if any. */
export function recalled(siteUrl) {
  const hit = recent.get(keyOf(siteUrl))
  if (!hit) return null
  if (Date.now() - hit.at > REMEMBER_MS) { recent.delete(keyOf(siteUrl)); return null }
  return hit.reach
}

export function _reset() {
  recent.clear()
}

/** The partner's view; any failure to get one is reported, never thrown. */
async function askPeer(viaPeer, input) {
  try {
    const answer = await viaPeer(normalizeSiteAddress(input))
    if (answer?.ok && typeof answer.result?.siteUrl === 'string') {
      return { ok: true, result: { ...answer.result, siteUrl: normalizeSiteAddress(answer.result.siteUrl) } }
    }
    return { ok: false, reason: typeof answer?.key === 'string' ? answer.key : 'sites.reach.unknownFailure' }
  } catch {
    return { ok: false, reason: 'sites.reach.peerUnavailable' }
  }
}

/**
 * Look at a site from both servers.
 *
 * Resolves to `{ result, reach }`: `result` is the WordPress discovery answer
 * (from whichever server saw the site, this one preferred). When neither
 * server sees it, rejects with this server's own error, carrying `details:
 * { reach }` so the panel can still say what each server saw.
 */
export async function checkReach(input, {
  discover = discoverWordPress,
  viaPeer = peerRelay.discoverViaPeer,
  peerConfigured = peerRelay.isConfigured(),
  region = config.serverRegion,
} = {}) {
  const [local, peer] = await Promise.all([
    discover(input).then((result) => ({ ok: true, result }), (error) => ({ ok: false, error })),
    peerConfigured ? askPeer(viaPeer, input) : Promise.resolve(null),
  ])

  // A malformed or private address is refused the same way everywhere.
  if (!local.ok && ADDRESS_ERRORS.has(local.error?.i18n?.key)) throw local.error

  const servers = [{ region, self: true, ok: local.ok, reason: local.ok ? null : reasonOf(local.error) }]
  if (peer) servers.push({ region: otherRegion(region), self: false, ok: peer.ok, reason: peer.ok ? null : peer.reason })
  // International first, then Iran: the order the owner reads them in.
  servers.sort((a, b) => (a.region === 'intl' ? -1 : b.region === 'intl' ? 1 : a.self ? -1 : 1))

  const reach = {
    checkedAt: Date.now(),
    route: local.ok ? 'direct' : peer?.ok ? 'peer' : null,
    servers,
  }
  const result = local.ok ? local.result : peer?.ok ? peer.result : null
  if (!result) {
    const error = local.error
    error.details = { reach }
    throw error
  }
  remember(result.siteUrl, reach)
  return { result, reach }
}
