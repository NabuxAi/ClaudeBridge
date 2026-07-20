// ============================================================
// DigiWP hub — API client
// ------------------------------------------------------------
// This is the ONLY way the hub reaches the outside world, and it
// only ever talks to YOUR server (the "واسط"). Your server is the
// thing that talks to the WP Claude Bridge connector on each managed
// site. The hub never contacts a managed WordPress site directly —
// no site URLs, no site tokens, no MCP endpoints live in the browser.
//
//   Browser (this hub)  ──►  YOUR server  ──►  connector  ──►  WP site
//
// Every method below maps to an endpoint on YOUR server. Swap the
// mock layer (src/data/mock.js) for real fetches once the server
// endpoints exist — the shapes are already defined there.
// ============================================================

import * as mock from '../data/mock.js'

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1' || !BASE

/** Auth token for YOUR server (never a managed-site token). */
const TOKEN_KEY = 'digiwp.token'
export const getToken = () => localStorage.getItem(TOKEN_KEY) || ''
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

async function http(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data?.message || res.statusText, res.status, data)
  return data
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

// Route to mock or real server without changing call-sites.
const call = (mockFn, realFn) => (...args) => (USE_MOCK ? mockFn(...args) : realFn(...args))

// ---- Auth (against YOUR server) --------------------------------
export const auth = {
  login: call(mock.login, (creds) => http('/auth/login', { method: 'POST', body: creds })),
  register: call(mock.register, (b) => http('/auth/register', { method: 'POST', body: b })),
  me: call(mock.me, () => http('/auth/me')),
  logout: () => { setToken(''); return Promise.resolve({ ok: true }) },
}

// ---- Account (sites, billing, team, notifications, profile) ----
export const account = {
  sites: call(mock.listSites, () => http('/sites')),
  addSite: call(mock.addSite, (b) => http('/sites', { method: 'POST', body: b })),
  billing: call(mock.billing, () => http('/billing')),
  invoices: call(mock.invoices, () => http('/billing/invoices')),
  invoice: call(mock.invoice, (id) => http(`/billing/invoices/${id}`)),
  team: call(mock.team, () => http('/team')),
  notifications: call(mock.notifications, () => http('/notifications')),
  profile: call(mock.profile, () => http('/profile')),
  plans: call(mock.plans, () => http('/billing/plans')),
}

// ---- Per-site management (all proxied through YOUR server) ------
// site() returns a namespaced client; every call carries the siteId
// so YOUR server knows which connector to relay the command to.
export function site(siteId) {
  const p = (path) => `/sites/${siteId}${path}`
  return {
    overview: call(() => mock.siteOverview(siteId), () => http(p('/overview'))),
    incidents: call(() => mock.siteIncidents(siteId), () => http(p('/incidents'))),
    updates: call(() => mock.siteUpdates(siteId), () => http(p('/updates'))),
    security: call(() => mock.siteSecurity(siteId), () => http(p('/security'))),
    backups: call(() => mock.siteBackups(siteId), () => http(p('/backups'))),
    settings: call(() => mock.siteSettings(siteId), () => http(p('/settings'))),
    // A guarded action = a command your server relays to the connector.
    // Sensitive actions ALWAYS require approval regardless of authority level.
    runAction: call(
      (action, payload) => mock.runAction(siteId, action, payload),
      (action, payload) => http(p('/actions'), { method: 'POST', body: { action, ...payload } })
    ),
    ask: call(
      (message) => mock.askGuardian(siteId, message),
      (message) => http(p('/assistant'), { method: 'POST', body: { message } })
    ),
  }
}

export const isMock = USE_MOCK
