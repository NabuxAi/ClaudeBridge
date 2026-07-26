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
  captcha: call(mock.captcha, () => http('/auth/captcha')),
  // Asked before the form renders, so a first-time visitor is not made to do
  // arithmetic to sign in. The challenge only appears once this address has
  // failed a few times.
  challengeState: call(mock.challengeState, () => http('/auth/challenge-state')),
  logout: () => { setToken(''); return Promise.resolve({ ok: true }) },
}

// ---- Account (sites, billing, team, notifications, profile) ----
export const account = {
  sites: call(mock.listSites, () => http('/sites')),
  addSite: call(mock.addSite, (b) => http('/sites', { method: 'POST', body: b })),
  pingSite: call(mock.pingSite, (id) => http(`/sites/${id}/ping`, { method: 'POST' })),
  billing: call(mock.billing, () => http('/billing')),
  invoices: call(mock.invoices, () => http('/billing/invoices')),
  invoice: call(mock.invoice, (id) => http(`/billing/invoices/${id}`)),
  team: call(mock.team, () => http('/team')),
  notifications: call(mock.notifications, () => http('/notifications')),
  profile: call(mock.profile, () => http('/profile')),
  saveProfile: call(
    (body) => mock.saveProfile(body),
    (body) => http('/profile', { method: 'PATCH', body })
  ),
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
    // Closes the alert without touching the site. Named "dismiss" all the way
    // down so nothing in the chain can be read as "fixed".
    dismissIncident: call(
      (eventId) => mock.dismissIncident(siteId, eventId),
      (eventId) => http(p(`/incidents/${eventId}/dismiss`), { method: 'POST', body: {} })
    ),
    updates: call(() => mock.siteUpdates(siteId), () => http(p('/updates'))),
    security: call(() => mock.siteSecurity(siteId), () => http(p('/security'))),
    backups: call(() => mock.siteBackups(siteId), () => http(p('/backups'))),
    settings: call(() => mock.siteSettings(siteId), () => http(p('/settings'))),
    // Auto-update switches. The server refuses to turn any of them off while
    // safe mode is on, and names the ones it refused — so the UI can say why
    // instead of letting a switch silently spring back.
    setUpdatePolicy: call(
      (patch) => mock.setUpdatePolicy(siteId, patch),
      (patch) => http(p('/update-policy'), { method: 'PATCH', body: patch })
    ),
    // How much the assistant may do without asking. Stored server-side, so it
    // governs what the relay will actually run — not just what the panel shows.
    setAuthority: call(
      (level) => mock.setAuthority(siteId, level),
      (level) => http(p('/authority'), { method: 'PATCH', body: { authority: level } })
    ),
    // Speed. Measuring costs the request it measures, so it queues like
    // everything else; the recipe matching runs on our server so improvements
    // to the rules reach every site without a plugin update.
    measureSpeed: call(
      (body) => mock.measureSpeed(siteId, body),
      (body) => http(p('/perf'), { method: 'POST', body: body || {} })
    ),
    analyseSpeed: call(
      (profile) => mock.analyseSpeed(siteId, profile),
      (profile) => http(p('/perf/analyse'), { method: 'POST', body: { profile } })
    ),
    // Apply updates. Queued and paced one item per pass on the site.
    runUpdates: call(
      (items) => mock.runUpdates(siteId, items),
      (items) => http(p('/updates/run'), { method: 'POST', body: items ? { items } : {} })
    ),
    // Backups. Both writes are queued on the site — a dump or a replay inside
    // a request would hold a PHP worker for minutes.
    runBackup: call(
      (body) => mock.runBackup(siteId, body),
      (body) => http(p('/backups'), { method: 'POST', body: body || {} })
    ),
    restoreBackup: call(
      (backupId, body) => mock.restoreBackup(siteId, backupId, body),
      (backupId, body) => http(p(`/backups/${backupId}/restore`), { method: 'POST', body: body || {} })
    ),
    // Fetched rather than linked, because the API is Bearer-authenticated and
    // an <a href> carries no header. The response is buffered into a Blob,
    // which does mean a large dump briefly sits in browser memory — acceptable
    // for a deliberate download, and the alternative (a URL that works without
    // the header) would be a link to a database dump that anyone can replay.
    downloadBackup: async (backupId, what = 'db') => {
      if (USE_MOCK) return mock.downloadBackup(siteId, backupId, what)
      const res = await fetch(`${BASE}/sites/${siteId}/backups/${backupId}/download?what=${what}`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new ApiError(data?.message || res.statusText, res.status, data)
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1]
        || `${backupId}.${what === 'files' ? 'zip' : 'sql'}`
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
      return { ok: true, name }
    },
    // Conflict hunt. Queued on the site, so this returns a job id in
    // milliseconds rather than holding a connection open while plugins are
    // flipped one group at a time.
    findConflict: call(
      (body) => mock.findConflict(siteId, body),
      (body) => http(p('/conflict'), { method: 'POST', body })
    ),
    job: call(
      (jobId) => mock.jobStatus(siteId, jobId),
      (jobId) => http(p(`/jobs/${jobId}`))
    ),
    // Rescue runs one step at a time. Deliberately not a single "rescue this
    // site" call: each step is separately runnable and separately stoppable,
    // because a rescue that dies halfway and leaves a site part-replaced is
    // worse than one never started.
    rescue: call(
      (step, body) => mock.rescueStep(siteId, step, body),
      (step, body) => http(p(`/rescue/${step}`), { method: 'POST', body: body || {} })
    ),
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
