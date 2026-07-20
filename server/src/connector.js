// ============================================================
// Connector relay — the bridge to each managed site.
// ------------------------------------------------------------
// This module speaks to the WP Claude Bridge plugin running in
// "Hub Connector Mode". It signs every request exactly the way the
// plugin verifies it, so the plugin accepts ONLY traffic from this
// server. Signature scheme (must match wp-claude-bridge.php):
//
//   sig  = HMAC_SHA256( `${ts}\n${rawBody}` , secret )   // hex
//   headers: X-DigiWP-Timestamp: ts (unix seconds)
//            X-DigiWP-Signature: sig
//            X-DigiWP-Site:      siteKey
//   replay window: 300s
// ============================================================
import crypto from 'node:crypto'

const REPLAY_WINDOW = 300 // seconds

/** Sign a raw body string for the paired site. Returns headers to send. */
export function signHeaders(secret, siteKey, rawBody = '') {
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${rawBody}`).digest('hex')
  return { 'X-DigiWP-Timestamp': ts, 'X-DigiWP-Signature': sig, 'X-DigiWP-Site': siteKey }
}

/** Verify an INBOUND signed request (e.g. the plugin's /connector/register). */
export function verifySignature(secret, { timestamp, signature, rawBody = '' }) {
  if (!secret || !timestamp || !signature) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > REPLAY_WINDOW) return false
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}\n${rawBody}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const base = (url) => String(url).replace(/\/$/, '')

/** GET {site}/wp-json/claude-bridge/v1/connector/ping — verify pairing is live. */
export async function ping(site) {
  const url = `${base(site.url)}/wp-json/claude-bridge/v1/connector/ping`
  const headers = signHeaders(site.secret, site.siteKey, '')
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new ConnectorError(`ping failed (${res.status})`, res.status)
  return res.json()
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
  const url = `${base(site.url)}/wp-json/claude-bridge/v1/mcp`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...signHeaders(site.secret, site.siteKey, rawBody) },
    body: rawBody,
    signal: AbortSignal.timeout(30000),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) throw new ConnectorError('connector rejected signature (401)', 401)
  if (!res.ok || data.error) throw new ConnectorError(data.error?.message || `tool ${name} failed`, res.status)
  // MCP wraps tool output in result.content[]; return the useful part.
  return data.result ?? data
}

function cryptoRandomId() {
  return crypto.randomBytes(6).toString('hex')
}

export class ConnectorError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ConnectorError'
    this.status = status || 502
  }
}
