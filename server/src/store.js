// In-memory registry of managed sites + their connector pairing credentials.
// Optionally persists to a JSON file (config.dataFile). Swap for your DB.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { config } from './config.js'
import { demoSites } from './seed.js'

const state = { sites: {} }

function persist() {
  if (!config.dataFile) return
  try { fs.writeFileSync(config.dataFile, JSON.stringify(state, null, 2)) } catch { /* ignore */ }
}

function load() {
  if (config.dataFile && fs.existsSync(config.dataFile)) {
    try { Object.assign(state, JSON.parse(fs.readFileSync(config.dataFile, 'utf8'))); return } catch { /* fall through */ }
  }
  // Seed from demo sites (unpaired — reads fall back to seed data until paired).
  for (const s of demoSites) {
    state.sites[s.id] = { ...s, url: '', secret: '', siteKey: '', paired: false, connector: null }
  }
}
load()

export const store = {
  listSites: () => Object.values(state.sites).map(publicSite),
  getSite: (id) => state.sites[id] || null,

  /** Create a site + generate a shared secret for the operator to paste into the plugin. */
  addSite({ name, title }) {
    const id = slug(name) || crypto.randomBytes(4).toString('hex')
    const site = {
      id, name, title: title || name, status: 'checking', authority: 'report',
      uptime: 100, checks: 0, lastCheck: 0, incidents: 0, pendingUpdates: 0,
      url: name.startsWith('http') ? name : `https://${name}`,
      secret: crypto.randomBytes(32).toString('hex'),
      siteKey: crypto.randomBytes(10).toString('hex'),
      paired: false, connector: null,
    }
    state.sites[id] = site
    persist()
    return site // includes secret + siteKey for the pairing screen
  },

  /** Mark a site paired (called after the plugin registers or a successful ping). */
  markPaired(id, connector = {}) {
    const s = state.sites[id]
    if (!s) return null
    s.paired = true
    s.status = 'healthy'
    s.connector = { ...connector, lastSeen: Date.now() }
    persist()
    return publicSite(s)
  },

  /** Find a site by its connector siteKey (used by the register receiver). */
  bySiteKey: (siteKey) => Object.values(state.sites).find((s) => s.siteKey === siteKey) || null,

  /** Candidate {id, secret} pairs for verifying an inbound signed request. */
  candidates: () => Object.values(state.sites).filter((s) => s.secret).map((s) => ({ id: s.id, secret: s.secret })),

  /** Record what a registering plugin told us about itself. */
  recordRegister(id, { url, pluginSiteId, name, version } = {}) {
    const s = state.sites[id]
    if (!s) return null
    if (url) s.url = url
    if (name) s.title = name
    if (pluginSiteId) s.pluginSiteId = pluginSiteId
    s.paired = true
    s.status = 'healthy'
    s.connector = { version: version || '3.5.1', lastSeen: Date.now(), pluginSiteId }
    persist()
    return publicSite(s)
  },
}

// Never leak the shared secret in list/detail responses.
function publicSite(s) {
  const { secret, ...rest } = s
  return { ...rest, hasSecret: !!secret }
}

function slug(v) {
  return String(v).toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}
