import { Router } from 'express'
import { config } from '../config.js'
import { store } from '../store.js'
import { siteData } from '../seed.js'
import * as connector from '../connector.js'

const router = Router()

// Return seed data for a per-site concern, optionally enriched by a live read.
function concern(name) {
  return async (req, res) => {
    const site = store.getSite(req.params.id)
    if (!site) return res.status(404).json({ message: 'site not found' })
    const data = siteData(req.params.id)[name]
    // When live and paired, enrich the overview with a real connector read.
    if (name === 'overview' && config.live && site.paired && site.url && site.secret) {
      try {
        const info = await connector.callTool(site, 'site_info', {})
        data.live = info
      } catch (e) {
        data.liveError = e.message
      }
    }
    if (name === 'settings') {
      data.connector = site.connector
        ? { paired: true, server: 'this server', lastSeen: site.connector.lastSeen, version: site.connector.version || '3.5.1' }
        : { paired: false }
    }
    res.json(data)
  }
}

router.get('/sites/:id/overview', concern('overview'))
router.get('/sites/:id/incidents', concern('incidents'))
router.get('/sites/:id/updates', concern('updates'))
router.get('/sites/:id/security', concern('security'))
router.get('/sites/:id/backups', concern('backups'))
router.get('/sites/:id/settings', concern('settings'))

// Pairing info + a live connection check via the signed /connector/ping.
router.get('/sites/:id/pairing', (req, res) => {
  const site = store.getSite(req.params.id)
  if (!site) return res.status(404).json({ message: 'site not found' })
  res.json({
    siteKey: site.siteKey, paired: site.paired, url: site.url,
    serverUrl: `${req.protocol}://${req.get('host')}/v1`,
  })
})

router.post('/sites/:id/ping', async (req, res) => {
  const site = store.getSite(req.params.id)
  if (!site) return res.status(404).json({ message: 'site not found' })
  if (!site.url || !site.secret) return res.status(400).json({ message: 'site is not configured for pairing yet' })
  try {
    const out = await connector.ping(site)
    store.markPaired(site.id, { version: out.version })
    res.json({ ok: true, connector: out })
  } catch (e) {
    res.status(e.status || 502).json({ ok: false, message: e.message })
  }
})

// A guarded action = a command this server relays (signed) to the connector.
// Sensitive actions ALWAYS require approval regardless of the site's authority level.
const SENSITIVE = new Set(['delete_plugin', 'activate_theme', 'edit_file', 'db_query'])
router.post('/sites/:id/actions', async (req, res) => {
  const site = store.getSite(req.params.id)
  if (!site) return res.status(404).json({ message: 'site not found' })
  const { action, tool, args = {}, approved } = req.body || {}
  const op = tool || action
  if (!op) return res.status(400).json({ message: 'action/tool is required' })
  if (SENSITIVE.has(op) && !approved) {
    return res.status(202).json({ ok: false, requiresApproval: true, message: 'این اقدام حساس است و به تأیید شما نیاز دارد.' })
  }
  if (config.live && site.paired && site.url && site.secret) {
    try {
      const result = await connector.callTool(site, op, args)
      return res.json({ ok: true, relayed: true, result })
    } catch (e) {
      return res.status(e.status || 502).json({ ok: false, message: e.message })
    }
  }
  // Demo mode (site not live-paired): acknowledge without touching a real site.
  res.json({ ok: true, relayed: false, action: op, note: 'شبیه‌سازی — سایت به‌صورت زنده جفت نشده است.' })
})

// The assistant Q&A endpoint (your LLM would answer here; demo returns a canned reply).
router.post('/sites/:id/assistant', (req, res) => {
  const { message } = req.body || {}
  res.json({
    reply: 'در ۲۴ ساعت گذشته سایت سالم بوده است. یک آپدیت پرریسک (Elementor) در صف تأیید شماست و فضای هاست به ۸۲٪ رسیده که پیشنهاد پاک‌سازی داده‌ام.',
    refs: ['گزارش امروز', 'صف آپدیت‌ها'], echo: message,
  })
})

export default router
