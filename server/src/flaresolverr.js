// ============================================================
// FlareSolverr proxy client & Cloudflare challenge solver.
//
// When managed WordPress sites sit behind Cloudflare anti-bot
// protection or DDoS mitigation, standard HTTP requests may be
// greeted with 403 / 503 challenge pages ("Just a moment...",
// Turnstile, cf-mitigated: challenge).
//
// This module provides:
// 1. Detection of Cloudflare challenge responses.
// 2. Client for FlareSolverr (v1 API: request.get, request.post,
//    sessions.create, sessions.destroy, sessions.list).
// 3. In-memory clearance cache: stores valid cf_clearance
//    cookies and User-Agent per host/origin, avoiding
//    repetitive solver calls when clearance is already active.
// 4. Safe address validation: refuses loopback and private
//    IP ranges to prevent SSRF through the solver proxy.
// ============================================================

import { BlockList, isIP } from 'node:net'
import { config } from './config.js'

const blockedIpv4 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
]) blockedIpv4.addSubnet(network, prefix, 'ipv4')

const blockedIpv6 = new BlockList()
for (const [network, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
]) blockedIpv6.addSubnet(network, prefix, 'ipv6')

let fetchOverride = null
let configOverride = null

/** Test seam to inject a fake fetch for FlareSolverr calls. */
export function _setFetchForTests(fn) {
  fetchOverride = fn
}

/** Test seam to override config for FlareSolverr tests. */
export function _setConfigForTests(cfg) {
  configOverride = cfg
}

function getActiveConfig() {
  return configOverride || config
}

const clearanceCache = new Map()
const activeSessions = new Map()
const MAX_CACHE_ENTRIES = 500

function pruneCache() {
  const now = Date.now()
  for (const [k, v] of clearanceCache.entries()) {
    if (now >= v.expiresAt) clearanceCache.delete(k)
  }
  if (clearanceCache.size > MAX_CACHE_ENTRIES) {
    const excess = clearanceCache.size - MAX_CACHE_ENTRIES
    let count = 0
    for (const k of clearanceCache.keys()) {
      clearanceCache.delete(k)
      count++
      if (count >= excess) break
    }
  }
}

/** Test seam to clear the clearance cache and recorded sessions. */
export function _clearCacheForTests() {
  clearanceCache.clear()
  activeSessions.clear()
}

/** Whether FlareSolverr URL is configured in the environment. */
export function isConfigured() {
  const cfg = getActiveConfig()
  return Boolean(cfg?.flaresolverr?.url || cfg?.flaresolverrUrl)
}

/** Normalize FlareSolverr API endpoint (ensures /v1 suffix). */
export function getEndpoint() {
  const cfg = getActiveConfig()
  const raw = cfg?.flaresolverr?.url || cfg?.flaresolverrUrl || ''
  const trimmed = String(raw).trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

/** Check if an address is loopback, private IPv4/IPv6 range, or internal hostname. */
export function isPrivateDestination(urlStr) {
  try {
    const parsed = new URL(urlStr)
    if (!['http:', 'https:'].includes(parsed.protocol)) return true
    if (parsed.username || parsed.password) return true
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (!host) return true
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true

    const family = isIP(host)
    if (family === 4) return blockedIpv4.check(host, 'ipv4')
    if (family === 6) {
      if (host.startsWith('::ffff:')) {
        const v4 = host.slice(7)
        if (isIP(v4) === 4 && blockedIpv4.check(v4, 'ipv4')) return true
      }
      return !/^[23][0-9a-f]{3}:/i.test(host) || blockedIpv6.check(host, 'ipv6')
    }

    if (!host.includes('.')) return true
    return false
  } catch {
    return true
  }
}

function getHeader(headers, name) {
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get(name)
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return Array.isArray(v) ? v.join(', ') : String(v)
  }
  return null
}

/**
 * Determine if an HTTP response represents a Cloudflare anti-bot challenge
 * (e.g. 403/503/200 status code with Cloudflare challenge markers).
 */
export function isCloudflareChallenge({ status, headers, body = '' } = {}) {
  const server = (getHeader(headers, 'server') || '').toLowerCase()
  const cfRay = getHeader(headers, 'cf-ray')
  const cfMitigated = (getHeader(headers, 'cf-mitigated') || '').toLowerCase()

  const isCfServer = server.includes('cloudflare') || Boolean(cfRay)
  const isMitigated = cfMitigated === 'challenge'

  if (isMitigated) return true

  const bodyStr = typeof body === 'string' ? body : ''
  const hasChallengeMarkers =
    bodyStr.includes('Just a moment...') ||
    bodyStr.includes('cf-browser-verification') ||
    bodyStr.includes('challenge-platform') ||
    bodyStr.includes('turnstile') ||
    bodyStr.includes('Attention Required! | Cloudflare') ||
    bodyStr.includes('challenges.cloudflare.com') ||
    bodyStr.includes('__cf_chl_') ||
    /cf[-_]chl[-_]/i.test(bodyStr) ||
    (Boolean(cfRay) && (bodyStr.includes('Checking your browser') || bodyStr.includes('Enable JavaScript and cookies')))

  // Genuine Cloudflare challenge pages carry distinct challenge markers.
  // We do not treat arbitrary origin 403/503 HTML pages as challenges.
  if (hasChallengeMarkers) {
    return true
  }

  return false
}

function normalizeKey(urlStr) {
  try {
    const u = new URL(urlStr)
    return u.origin.toLowerCase()
  } catch {
    return String(urlStr).toLowerCase()
  }
}

function calculateClearanceExpires(cookies, defaultTtlMs = 2 * 60 * 60 * 1000) {
  if (Array.isArray(cookies)) {
    // Specifically respect cf_clearance cookie expiry
    const cf = cookies.find((c) => c && c.name === 'cf_clearance')
    if (cf && typeof cf.expires === 'number' && cf.expires > 0) {
      return cf.expires > 1e11 ? cf.expires : cf.expires * 1000
    }
    const cfBm = cookies.find((c) => c && (c.name === '__cf_bm' || c.name?.startsWith('cf_')))
    if (cfBm && typeof cfBm.expires === 'number' && cfBm.expires > 0) {
      return cfBm.expires > 1e11 ? cfBm.expires : cfBm.expires * 1000
    }
  }
  return Date.now() + defaultTtlMs
}

/**
 * Cache clearance cookies and User-Agent returned by FlareSolverr.
 */
export function saveClearance(url, cookies = [], userAgent = '', session = null) {
  if (!url) return null
  if (clearanceCache.size >= MAX_CACHE_ENTRIES) pruneCache()

  const key = normalizeKey(url)
  const cookieString = Array.isArray(cookies)
    ? cookies.filter((c) => c && c.name && c.value != null).map((c) => `${c.name}=${c.value}`).join('; ')
    : ''
  const expiresAt = calculateClearanceExpires(cookies)
  const entry = {
    key,
    cookies,
    cookieString,
    userAgent: userAgent || '',
    session: session || null,
    expiresAt,
    savedAt: Date.now(),
  }
  clearanceCache.set(key, entry)
  try {
    const u = new URL(url)
    clearanceCache.set(u.hostname.toLowerCase(), entry)
  } catch { /* ignore */ }
  return entry
}

/**
 * Look up active, unexpired clearance for a URL or domain.
 */
export function getClearance(url) {
  if (!url) return null
  const key = normalizeKey(url)
  let entry = clearanceCache.get(key)
  if (!entry) {
    try {
      const u = new URL(url)
      entry = clearanceCache.get(u.hostname.toLowerCase())
    } catch { /* ignore */ }
  }
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    clearClearance(url)
    return null
  }
  return entry
}

/**
 * Returns Cookie and User-Agent headers if active clearance is cached.
 */
export function getClearanceHeaders(url) {
  const clearance = getClearance(url)
  if (!clearance) return {}
  const headers = {}
  if (clearance.cookieString) headers['Cookie'] = clearance.cookieString
  if (clearance.userAgent) headers['User-Agent'] = clearance.userAgent
  return headers
}

/**
 * Remove cached clearance for a URL/hostname.
 */
export function clearClearance(url) {
  if (!url) return
  const key = normalizeKey(url)
  clearanceCache.delete(key)
  try {
    const u = new URL(url)
    clearanceCache.delete(u.hostname.toLowerCase())
  } catch { /* ignore */ }
}

function unescapeHtml(str) {
  return str.replace(/&(?:amp|lt|gt|quot|#39|#039);/g, (entity) => {
    switch (entity) {
      case '&quot;': return '"'
      case '&lt;': return '<'
      case '&gt;': return '>'
      case '&#39;':
      case '&#039;': return "'"
      case '&amp;': return '&'
      default: return entity
    }
  })
}

/**
 * Extract JSON object from FlareSolverr's solution response string,
 * handling raw JSON, Chrome DOM wrapping (<pre>{...}</pre>), and HTML wrappers
 * without stripping HTML tags from JSON string values.
 */
export function extractJsonFromSolutionResponse(responseStr) {
  if (!responseStr || typeof responseStr !== 'string') return null
  const trimmed = responseStr.trim()
  try {
    return JSON.parse(trimmed)
  } catch { /* proceed */ }

  const preMatch = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
  if (preMatch && preMatch[1]) {
    try {
      return JSON.parse(unescapeHtml(preMatch[1].trim()))
    } catch { /* proceed */ }
    try {
      return JSON.parse(preMatch[1].trim())
    } catch { /* proceed */ }
  }

  const startIdx = trimmed.search(/[{\[]/)
  const endIdx = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
  if (startIdx !== -1 && endIdx > startIdx) {
    const candidate = trimmed.slice(startIdx, endIdx + 1)
    try {
      return JSON.parse(candidate)
    } catch { /* proceed */ }
    try {
      return JSON.parse(unescapeHtml(candidate))
    } catch { /* proceed */ }
  }

  return null
}

/**
 * Solve a Cloudflare challenge through FlareSolverr.
 */
export async function solve({
  url,
  method = 'GET',
  headers = {},
  postData = null,
  session = null,
  maxTimeout = null,
} = {}) {
  if (!isConfigured()) {
    throw new FlareSolverrError('FlareSolverr is not configured', 503, 'not_configured')
  }
  if (!url || typeof url !== 'string') {
    throw new FlareSolverrError('A valid URL is required', 400, 'invalid_url')
  }
  if (isPrivateDestination(url)) {
    throw new FlareSolverrError('Refusing to proxy private destination through FlareSolverr', 400, 'private_destination_refused')
  }

  const endpoint = getEndpoint()
  const cfg = getActiveConfig()
  const timeout = maxTimeout || cfg?.flaresolverr?.maxTimeout || 30000

  const cmd = method.toUpperCase() === 'POST' ? 'request.post' : 'request.get'
  const payload = {
    cmd,
    url,
    maxTimeout: timeout,
    ...(session ? { session } : {}),
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    ...(postData ? { postData: typeof postData === 'string' ? postData : String(postData) } : {}),
  }

  const fetchFn = fetchOverride || globalThis.fetch
  let res
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout + 5000),
    })
  } catch (e) {
    throw new FlareSolverrError(`FlareSolverr request failed: ${e.message}`, 502, 'gateway_error')
  }

  const raw = await res.text().catch(() => '')
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new FlareSolverrError(`FlareSolverr returned non-JSON response (${res.status})`, 502, 'invalid_response')
  }

  if (data.status !== 'ok') {
    throw new FlareSolverrError(data.message || 'FlareSolverr challenge solving failed', 502, 'solve_failed')
  }

  const sol = data.solution || {}
  const cookies = Array.isArray(sol.cookies) ? sol.cookies : []
  const userAgent = sol.userAgent || ''
  if (cookies.length && userAgent) {
    saveClearance(url, cookies, userAgent, session)
  }

  const extracted = extractJsonFromSolutionResponse(sol.response)
  return {
    ok: sol.status >= 200 && sol.status < 300,
    status: sol.status || 200,
    headers: sol.headers || {},
    cookies,
    userAgent,
    body: sol.response || '',
    data: extracted,
    solution: sol,
  }
}

/** Create a persistent FlareSolverr browser session. */
export async function createSession(sessionId = null) {
  if (!isConfigured()) throw new FlareSolverrError('FlareSolverr is not configured', 503, 'not_configured')
  const endpoint = getEndpoint()
  const payload = { cmd: 'sessions.create', ...(sessionId ? { session: sessionId } : {}) }
  const fetchFn = fetchOverride || globalThis.fetch
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  if (data.status !== 'ok') throw new FlareSolverrError(data.message || 'sessions.create failed', 502, 'session_create_failed')
  const sid = data.session || sessionId
  activeSessions.set(sid, { id: sid, createdAt: Date.now() })
  return sid
}

/** Destroy a persistent FlareSolverr browser session. */
export async function destroySession(sessionId) {
  if (!isConfigured()) throw new FlareSolverrError('FlareSolverr is not configured', 503, 'not_configured')
  const endpoint = getEndpoint()
  const payload = { cmd: 'sessions.destroy', session: sessionId }
  const fetchFn = fetchOverride || globalThis.fetch
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  activeSessions.delete(sessionId)
  return data.status === 'ok'
}

/** List all active sessions in FlareSolverr. */
export async function listSessions() {
  if (!isConfigured()) throw new FlareSolverrError('FlareSolverr is not configured', 503, 'not_configured')
  const endpoint = getEndpoint()
  const payload = { cmd: 'sessions.list' }
  const fetchFn = fetchOverride || globalThis.fetch
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  if (data.status !== 'ok') throw new FlareSolverrError(data.message || 'sessions.list failed', 502, 'session_list_failed')
  return data.sessions || []
}

/** Check connectivity and operational status of FlareSolverr. */
export async function getStatus() {
  if (!isConfigured()) {
    return { configured: false, url: null }
  }
  const endpoint = getEndpoint()
  const fetchFn = fetchOverride || globalThis.fetch
  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'sessions.list' }),
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json().catch(() => ({}))
    return {
      configured: true,
      url: getActiveConfig()?.flaresolverr?.url || '',
      live: res.ok && data?.status === 'ok',
      version: data?.version || null,
      sessions: data?.sessions || [],
    }
  } catch (e) {
    return {
      configured: true,
      url: getActiveConfig()?.flaresolverr?.url || '',
      live: false,
      error: e.message,
    }
  }
}

export class FlareSolverrError extends Error {
  constructor(message, status = 502, code = 'flaresolverr_error') {
    super(message)
    this.name = 'FlareSolverrError'
    this.status = status
    this.code = code
  }
}
