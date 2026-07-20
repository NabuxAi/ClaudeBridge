import { Router } from 'express'
import { config, publicApiBase } from '../config.js'
import { sites } from '../store.js'
import { siteData } from '../seed.js'
import * as connector from '../connector.js'

const router = Router()

// Load the site (owned by the signed-in user) or respond 404. Returns the raw row.
async function loadSite(req, res) {
  const raw = await sites.rawForUser(req.params.id, req.user.sub)
  if (!raw) { res.status(404).json({ message: 'سایت یافت نشد.' }); return null }
  return raw
}

function concern(name) {
  return async (req, res, next) => {
    try {
      const site = await loadSite(req, res)
      if (!site) return
      const data = siteData(req.params.id)[name]
      if (name === 'overview' && config.live && site.paired && site.url && site.secret) {
        try { data.live = await connector.callTool({ url: site.url, secret: site.secret, siteKey: site.site_key }, 'site_info', {}) }
        catch (e) { data.liveError = e.message }
      }
      if (name === 'settings') {
        const c = site.connector || null
        data.connector = site.paired
          ? { paired: true, server: 'this server', lastSeen: c?.lastSeen, version: c?.version || '3.5.1' }
          : { paired: false }
        data.authority = site.authority
      }
      res.json(data)
    } catch (e) { next(e) }
  }
}

router.get('/sites/:id/overview', concern('overview'))
router.get('/sites/:id/incidents', concern('incidents'))
router.get('/sites/:id/updates', concern('updates'))
router.get('/sites/:id/security', concern('security'))
router.get('/sites/:id/backups', concern('backups'))
router.get('/sites/:id/settings', concern('settings'))

router.get('/sites/:id/pairing', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    res.json({ siteKey: site.site_key, paired: !!site.paired, url: site.url, serverUrl: publicApiBase(req) })
  } catch (e) { next(e) }
})

// Live connection check via the signed /connector/ping.
router.post('/sites/:id/ping', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    if (!site.url || !site.secret) return res.status(400).json({ message: 'سایت هنوز برای اتصال آماده نیست.' })
    try {
      const out = await connector.ping({ url: site.url, secret: site.secret, siteKey: site.site_key })
      await sites.markPaired(site.id, { version: out.version })
      res.json({ ok: true, connector: out })
    } catch (e) {
      res.status(e.status || 502).json({ ok: false, message: e.message })
    }
  } catch (e) { next(e) }
})

// A guarded action = a signed command relayed to the connector.
const SENSITIVE = new Set(['delete_plugin', 'activate_theme', 'edit_file', 'db_query', 'delete_file'])
router.post('/sites/:id/actions', async (req, res, next) => {
  try {
    const site = await loadSite(req, res)
    if (!site) return
    const { action, tool, args = {}, approved } = req.body || {}
    const op = tool || action
    if (!op) return res.status(400).json({ message: 'action/tool لازم است.' })
    if (SENSITIVE.has(op) && !approved) {
      return res.status(202).json({ ok: false, requiresApproval: true, message: 'این اقدام حساس است و به تأیید شما نیاز دارد.' })
    }
    if (config.live && site.paired && site.url && site.secret) {
      try {
        const result = await connector.callTool({ url: site.url, secret: site.secret, siteKey: site.site_key }, op, args)
        return res.json({ ok: true, relayed: true, result })
      } catch (e) {
        return res.status(e.status || 502).json({ ok: false, message: e.message })
      }
    }
    res.json({ ok: true, relayed: false, action: op, note: 'شبیه‌سازی — سایت به‌صورت زنده جفت نشده است.' })
  } catch (e) { next(e) }
})

router.post('/sites/:id/assistant', async (req, res, next) => {
  try {
    if (!(await loadSite(req, res))) return
    const { message } = req.body || {}
    res.json({
      reply: 'در ۲۴ ساعت گذشته سایت سالم بوده است. یک آپدیت پرریسک (Elementor) در صف تأیید شماست و فضای هاست به ۸۲٪ رسیده که پیشنهاد پاک‌سازی داده‌ام.',
      refs: ['گزارش امروز', 'صف آپدیت‌ها'], echo: message,
    })
  } catch (e) { next(e) }
})

export default router
