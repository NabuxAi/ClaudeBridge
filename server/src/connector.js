// ============================================================
// Connector relay — the bridge to each managed site.
// ------------------------------------------------------------
// This module speaks to the WP Claude Bridge plugin running in
// "Hub Connector Mode". It signs every request exactly the way the
// plugin verifies it, so the plugin accepts ONLY traffic from this
// server. Signature scheme (must match wp-claude-bridge.php):
//
//   sig  = HMAC_SHA256( `${ts}\n${nonce}\n${rawBody}` , secret )   // hex
//   headers: X-DigiWP-Timestamp: ts (unix seconds)
//            X-DigiWP-Nonce:     random 16-byte hex nonce
//            X-DigiWP-Signature: sig
//            X-DigiWP-Site:      siteKey
//   replay window: 300s
// ============================================================
import crypto from 'node:crypto'
import { normalizeSiteAddress, restAddresses } from './site-address.js'
import { connectorFetch } from './peer-relay.js'
import { classify } from './authority.js'


const REPLAY_WINDOW = 300 // seconds

/** Sign a raw body string for the paired site. Returns headers to send. */
export function signHeaders(secret, siteKey, rawBody = '') {
  const ts = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString('hex')
  const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n${rawBody}`).digest('hex')
  return { 'X-DigiWP-Timestamp': ts, 'X-DigiWP-Nonce': nonce, 'X-DigiWP-Signature': sig, 'X-DigiWP-Site': siteKey }
}

/** Verify an INBOUND signed request (e.g. the plugin's /connector/register). */
export function verifySignature(secret, { timestamp, nonce, signature, rawBody = '' }) {
  if (!secret || !/^\d{10,12}$/.test(String(timestamp)) || !/^[a-f0-9]{32}$/.test(String(nonce)) || !/^[a-f0-9]{64}$/.test(String(signature))) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > REPLAY_WINDOW) return false
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}


/**
 * One-time nonce cache for this process. Multi-replica deployments must replace
 * this with a shared atomic store (Redis SET NX EX or a UNIQUE DB key).
 */
const seenNonces = new Map()
export function consumeSignedNonce(siteId, nonce) {
  if (!siteId || !/^[a-f0-9]{32}$/.test(String(nonce))) return false
  const now = Date.now()
  if (seenNonces.size > 5000) {
    for (const [key, until] of seenNonces) {
      if (until <= now) seenNonces.delete(key)
    }
  }
  const key = crypto.createHash('sha256').update(String(siteId) + ':' + nonce).digest('hex')
  if ((seenNonces.get(key) || 0) > now) return false
  seenNonces.set(key, now + REPLAY_WINDOW * 1000)
  return true
}

const base = normalizeSiteAddress

// Cache only a verified transport choice, never a tool response or secret.
const transports = new Map()
const transportKey = (site) => crypto.createHash('sha256').update(`${base(site.url)}\n${site.siteKey}\n${site.secret}`).digest('hex')
function remember(site, index) {
  if (transports.size >= 256) transports.delete(transports.keys().next().value)
  transports.set(transportKey(site), { index, expires: Date.now() + 300000 })
}
function selected(site) {
  const entry = transports.get(transportKey(site))
  return entry?.expires > Date.now() ? entry.index : null
}

/** Negotiate with read-only signed GETs, independently of the admin/login URL. */
export async function ping(site) {
  const signal = AbortSignal.timeout(15000)
  const addresses = restAddresses(site.url, '/claude-bridge/v1/connector/ping')
  let lastStatus = 502
  let forbidden = false
  for (const [index, url] of addresses.entries()) {
    const res = await connectorFetch(url, { redirect: 'manual', headers: { ...signHeaders(site.secret, site.siteKey, ''), 'Cache-Control': 'no-cache' }, signal }, { idempotent: true })
    lastStatus = res.status
    if (res.status === 403) forbidden = true
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok === true && typeof data.version === 'string') {
      remember(site, index)
      return data
    }
    if (res.status === 401) throw connectionFailure(401, 'sites.connectorAuth')
    if (res.status >= 300 && res.status < 400) throw connectionFailure(res.status, 'sites.connectorRedirect')
    if (![403, 404].includes(res.status) && !res.ok) break
  }
  throw connectionFailure(lastStatus, forbidden ? 'sites.connectorForbidden' : lastStatus === 404 ? 'sites.connectorMissing' : 'sites.connectorInvalid')
}

function connectionFailure(status, key) {
  const error = new ConnectorError(`WordPress connector check failed (HTTP ${status}); ${key}`, status >= 400 ? status : 502)
  error.i18n = { key, vars: { status } }
  return error

}

async function mcpAddress(site) {
  let index = selected(site)
  if (index == null) {
    // Negotiate before sending a command; route failures never replay a write.
    try { await ping(site); index = selected(site) } catch (error) {
      if (error.status === 401) throw new ConnectorError('connector rejected signature (401)', 401)
      // Preserve the MCP endpoint's own diagnostic if the ping route is absent.
    }
  }
  return restAddresses(site.url, '/claude-bridge/v1/mcp')[index ?? 0]
}

/**
 * Call a WP Claude Bridge MCP tool on a managed site, signed.
 * Uses the plugin's MCP JSON-RPC surface: method "tools/call".
 */
export async function callTool(site, name, args = {}) {
  const rawBody = JSON.stringify({
    jsonrpc: '2.0', id: cryptoRandomId(), method: 'tools/call',
    params: { name, arguments: args },
  })
  const url = await mcpAddress(site)
  const res = await connectorFetch(url, {
    method: 'POST', redirect: 'manual',

    headers: { 'Content-Type': 'application/json', ...signHeaders(site.secret, site.siteKey, rawBody) },
    body: rawBody,
    signal: AbortSignal.timeout(30000),
  }, { idempotent: classify(name, args) === 'read', singleAttempt: classify(name, args) !== 'read' })
  // Read as text first. A site that answers with a PHP fatal, an HTML error
  // page or an empty body is exactly the case worth diagnosing, and parsing
  // straight to JSON with a swallowed catch turned all of those into nothing:
  // a nightly scan failed against a live site and the only record of it read
  // "tool security_scan failed", which names neither cause nor status.
  const raw = await res.text().catch(() => '')
  let data = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = {}
  }

  if (res.status === 401) throw new ConnectorError('connector rejected signature (401)', 401)

  if (res.status === 403) throw connectionFailure(403, 'sites.connectorForbidden')
  if (res.status === 404) throw connectionFailure(404, 'sites.connectorMissing')
  if (res.status >= 300 && res.status < 400) throw connectionFailure(res.status, 'sites.connectorRedirect')

  if (!res.ok || data.error) {
    throw new ConnectorError(describeToolFailure(name, res.status, data, raw), res.status)
  }
  if (!raw || (!data.result && !data.content)) throw connectionFailure(res.status, 'sites.connectorInvalid')
  // MCP wraps tool output in result.content[]; return the useful part.
  return data.result ?? data
}

/**
 * The site's own tool catalogue (MCP "tools/list"), signed like a call.
 * Read-only, so it may take the peer road after a timeout too.
 */
export async function listTools(site) {
  const rawBody = JSON.stringify({ jsonrpc: '2.0', id: cryptoRandomId(), method: 'tools/list', params: {} })
  const url = await mcpAddress(site)
  const res = await connectorFetch(url, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...signHeaders(site.secret, site.siteKey, rawBody) },
    body: rawBody,
    signal: AbortSignal.timeout(30000),
  }, { idempotent: true })
  const raw = await res.text().catch(() => '')
  let data = null
  try { data = raw ? JSON.parse(raw) : null } catch { data = null }
  if (res.status === 401) throw new ConnectorError('connector rejected signature (401)', 401)
  if (!res.ok || !data || data.error || !Array.isArray(data.result?.tools)) {
    throw new ConnectorError(describeToolFailure('tools/list', res.status, data || {}, raw), res.status)
  }
  return data.result.tools
}

function cryptoRandomId() {
  return crypto.randomBytes(6).toString('hex')
}

/**
 * A failure message someone can act on.
 *
 * The site's own error text when it sent one, because that is the only thing
 * that says WHY. Otherwise the HTTP status, which at least separates "the
 * plugin refused" from "the host returned 500" from "nothing came back" — three
 * situations with three different fixes that all used to read the same.
 *
 * A body is included only when there is no structured error to quote, and it is
 * truncated: this string is stored on an event and shown in a digest, and an
 * HTML error page pasted whole into either is worse than useless.
 */
function describeToolFailure(name, status, data, raw) {
  const structured = data?.error?.message
  if (structured) return `${name}: ${structured}`

  const body = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!body) {
    return `${name}: no response body (HTTP ${status})`
  }
  const snippet = body.length > 200 ? `${body.slice(0, 200)}…` : body
  return `${name} failed (HTTP ${status}): ${snippet}`
}

export class ConnectorError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ConnectorError'
    this.status = status || 502
  }
}
