// ============================================================
// Peer relay — reaching a site through the other DigiWP server.
// ------------------------------------------------------------
// Two servers run this code: one inside Iran (wp.nabuxai.ir) and one
// outside (api.digiwp.com). Each can reach sites the other cannot: an
// Iranian host that drops foreign traffic is reachable from the Iran
// server, a foreign host filtered inside Iran from the international one.
// When a signed connector call cannot get through from here, it is handed
// to the peer, which sends the very same bytes on and returns the answer.
//
// What crosses between the servers:
//
//   POST {peer}/relay/forward
//   body    { url, method, headers, body }       — the connector request as built here
//   headers X-DigiWP-Relay-Timestamp: ts
//           X-DigiWP-Relay-Signature: hex HMAC_SHA256(`${ts}\n${rawBody}`, PEER_RELAY_SECRET)
//
// The connector's own HMAC headers ride inside, untouched, so the site
// still verifies that the command came from the server that paired it —
// the peer is a pipe, not a signer. The peer forwards only to Claude Bridge
// REST paths on public addresses, with a fixed header allow-list, and never
// relays a relayed request again.
//
// When to go through the peer is decided per request, conservatively:
// connection-level failures (refused, unresolvable, unreachable) and a
// firewall's block page (403/451/5xx that is not JSON) mean the request never
// reached WordPress, so sending it again cannot run a tool twice. A plain
// timeout is ambiguous — the site may have run the tool — so it is retried
// through the peer only when the caller says the request is idempotent.
// ============================================================
import crypto from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { config } from './config.js'
import { publicAddress, publicFetch } from './site-address.js'

const REPLAY_WINDOW = 300 // seconds
const PEER_TIMEOUT_MS = 45000
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
// A host that needed the peer once is tried through the peer first for a
// while, so every call does not pay a failed direct attempt first.
const REMEMBER_MS = 30 * 60 * 1000

const FORWARDED_HEADERS = new Set([
  'accept', 'content-type',
  'x-digiwp-timestamp', 'x-digiwp-signature', 'x-digiwp-site', 'x-digiwp-nonce',
])

const CONNECT_ERRORS = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID',
])

const viaPeerUntil = new Map() // host -> epoch ms

export function isConfigured() {
  return Boolean(config.peerRelay.url && config.peerRelay.secret)
}

export function signRelay(rawBody, secret = config.peerRelay.secret) {
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${rawBody}`).digest('hex')
  return { 'X-DigiWP-Relay-Timestamp': ts, 'X-DigiWP-Relay-Signature': sig }
}

export function verifyRelay({ timestamp, signature, rawBody = '' }, secret = config.peerRelay.secret) {
  if (!secret || !timestamp || !signature) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > REPLAY_WINDOW) return false
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}\n${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Only the plugin's own REST namespace may be reached through the relay. */
export function isBridgePath(url) {
  let u
  try { u = new URL(url) } catch { return false }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false
  if (/\/wp-json\/claude-bridge\/v1\//.test(u.pathname)) return true
  const route = u.searchParams.get('rest_route') || ''
  return route.startsWith('/claude-bridge/v1/')
}

/** Did this attempt fail before it could have reached WordPress? */
export function neverArrived(err) {
  const code = err?.cause?.code || err?.code
  return CONNECT_ERRORS.has(code)
}

function isTimeout(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.cause?.name === 'TimeoutError'
}

/** A block page in front of WordPress, not an answer from the plugin. */
export function looksBlocked(status, contentType) {
  if (/json/i.test(String(contentType || ''))) return false
  return [403, 451, 502, 503, 504].includes(status)
}

function hostOf(url) {
  try { return new URL(url).host } catch { return '' }
}

export function prefersPeer(url) {
  const until = viaPeerUntil.get(hostOf(url))
  if (!until) return false
  if (until < Date.now()) { viaPeerUntil.delete(hostOf(url)); return false }
  return true
}

function remember(url) {
  viaPeerUntil.set(hostOf(url), Date.now() + REMEMBER_MS)
}

export function _reset() {
  viaPeerUntil.clear()
}

/** Send one connector request through the peer; resolves to a Response. */
export async function viaPeer(url, { method = 'GET', headers = {}, body = null } = {}) {
  const payload = JSON.stringify({ url, method, headers, body: body ?? null })
  const res = await fetch(`${config.peerRelay.url}/relay/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...signRelay(payload) },
    body: payload,
    signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || typeof data.status !== 'number') {
    const why = data?.message || `HTTP ${res.status}`
    const err = new Error(`peer relay refused: ${why}`)
    err.peer = true
    throw err
  }
  return new Response([204, 205, 304].includes(data.status) ? null : String(data.body ?? ''), {
    status: data.status,
    headers: { 'content-type': data.contentType || 'application/octet-stream', 'x-digiwp-route': 'peer' },
  })
}

/**
 * fetch() for connector calls, with the peer as the second road.
 *
 * `idempotent` marks a request that may safely be sent twice (a ping, a
 * read-only tool); only those are retried through the peer after a timeout.
 */
export async function connectorFetch(url, init = {}, { idempotent = false } = {}) {
  const peerInit = { method: init.method || 'GET', headers: init.headers || {}, body: init.body ?? null }

  if (isConfigured() && prefersPeer(url)) {
    try {
      return await viaPeer(url, peerInit)
    } catch {
      // The peer may be the one that is down now. Fall through to direct.
    }
  }

  let res
  try {
    res = await fetch(url, init)
  } catch (err) {
    if (!isConfigured() || !(neverArrived(err) || (idempotent && isTimeout(err)))) throw err
    const relayed = await viaPeer(url, peerInit)
    remember(url)
    return relayed
  }

  if (isConfigured() && looksBlocked(res.status, res.headers.get('content-type'))) {
    try {
      const relayed = await viaPeer(url, peerInit)
      if (!looksBlocked(relayed.status, relayed.headers.get('content-type'))) {
        await res.body?.cancel().catch(() => {})
        remember(url)
        return relayed
      }
    } catch {
      // Report what the direct attempt saw; that is the honest failure.
    }
  }
  return res
}

/**
 * The receiving half: carry a peer's connector request to the site.
 *
 * Validates everything the sending side could get wrong or a stranger could
 * try: the target must be a Claude Bridge path on a public address, only the
 * allow-listed headers pass, and the method is GET or POST. Returns the
 * site's answer as `{ status, contentType, body }`.
 */
export async function forward({ url, method = 'GET', headers = {}, body = null }) {
  if (!isBridgePath(url)) {
    const err = new Error('relay target must be a Claude Bridge REST path')
    err.status = 400
    throw err
  }
  const verb = String(method).toUpperCase()
  if (!['GET', 'POST'].includes(verb)) {
    const err = new Error('relay method must be GET or POST')
    err.status = 400
    throw err
  }
  const passed = {}
  for (const [k, v] of Object.entries(headers || {})) {
    if (FORWARDED_HEADERS.has(String(k).toLowerCase()) && typeof v === 'string') passed[k] = v
  }
  const sendBody = verb === 'POST' && typeof body === 'string' ? body : null
  const signal = AbortSignal.timeout(PEER_TIMEOUT_MS - 5000)

  let res
  if (config.peerRelay.allowPrivate) {
    res = await fetch(url, { method: verb, headers: passed, body: sendBody, redirect: 'manual', signal })
  } else {
    const target = new URL(url)
    const addresses = await publicAddress(target, lookup, signal)
    if (sendBody != null) passed['Content-Length'] = String(Buffer.byteLength(sendBody))
    res = await publicFetch(target.href, { method: verb, headers: passed, body: sendBody, signal }, addresses)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_RESPONSE_BYTES) {
    const err = new Error('site answer too large to relay')
    err.status = 502
    throw err
  }
  return { status: res.status, contentType: res.headers.get('content-type') || '', body: buf.toString('utf8') }
}
