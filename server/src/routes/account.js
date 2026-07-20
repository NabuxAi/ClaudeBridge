import { Router } from 'express'
import { publicApiBase } from '../config.js'
import { sites, users } from '../store.js'
import * as seed from '../seed.js'

const router = Router()

// The signed-in user's sites (empty for a brand-new account).
router.get('/sites', async (req, res, next) => {
  try { res.json(await sites.listByUser(req.user.sub)) } catch (e) { next(e) }
})

// Create a site → returns the one-time shared secret + server URL for the plugin.
router.post('/sites', async (req, res, next) => {
  try {
    const { name, title } = req.body || {}
    const site = await sites.add(req.user.sub, { name, title })
    res.status(201).json({
      id: site.id, name: site.name, title: site.title, status: site.status,
      pairing: {
        serverUrl: publicApiBase(req),
        siteKey: site.siteKey,
        secret: site.secret, // shown ONCE — paste into the plugin
        steps: [
          'در سایت مقصد: افزونه‌ها → WP Claude Bridge را نصب و فعال کنید.',
          'ابزارها → Claude Bridge → Hub Connector Mode را باز کنید.',
          'حالت کانکتور را روشن کنید و «Hub server URL» و «Shared secret» بالا را وارد کنید.',
          'ذخیره کنید؛ سپس اینجا «بررسی اتصال» را بزنید.',
        ],
      },
    })
  } catch (e) { next(e) }
})

// Presentational data (real product config; not per-user dynamic in this reference).
router.get('/billing/plans', (_req, res) => res.json(seed.plans))
router.get('/billing', (_req, res) => res.json(seed.billing))
router.get('/billing/invoices', (_req, res) => res.json(seed.invoices))
router.get('/billing/invoices/:id', (req, res) => res.json(seed.invoiceDetail(req.params.id)))
router.get('/team', (_req, res) => res.json(seed.team))
router.get('/notifications', (_req, res) => res.json(seed.notifications))
router.get('/profile', async (req, res, next) => {
  try { res.json(await users.byId(req.user.sub)) } catch (e) { next(e) }
})
router.patch('/profile', async (req, res, next) => {
  try {
    const { name, twoFactor, lang, timezone } = req.body || {}
    const fields = {}
    if (name != null) fields.name = name
    if (twoFactor != null) fields.two_factor = !!twoFactor
    if (lang != null) fields.lang = lang
    if (timezone != null) fields.timezone = timezone
    res.json(await users.update(req.user.sub, fields))
  } catch (e) { next(e) }
})

export default router
