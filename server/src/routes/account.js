import { Router } from 'express'
import { store } from '../store.js'
import * as seed from '../seed.js'

const router = Router()

router.get('/sites', (req, res) => res.json(store.listSites()))

// Create a site → returns the pairing secret + site key to paste into the plugin.
router.post('/sites', (req, res) => {
  const { name, title } = req.body || {}
  if (!name) return res.status(400).json({ message: 'name (domain) is required' })
  const site = store.addSite({ name, title })
  res.status(201).json({
    id: site.id, name: site.name, title: site.title, status: site.status,
    pairing: {
      serverUrl: `${req.protocol}://${req.get('host')}/v1`,
      siteKey: site.siteKey,
      secret: site.secret, // shown ONCE, for the operator to paste into the plugin
      steps: [
        'در سایت مقصد: افزونه‌ها → WP Claude Bridge را نصب و فعال کنید.',
        'ابزارها → Claude Bridge → Hub Connector Mode را باز کنید.',
        'حالت کانکتور را روشن کنید و «Hub server URL» و «Shared secret» بالا را وارد کنید.',
        'ذخیره کنید؛ سپس اینجا «بررسی اتصال» را بزنید.',
      ],
    },
  })
})

router.get('/billing/plans', (req, res) => res.json(seed.plans))
router.get('/billing', (req, res) => res.json(seed.billing))
router.get('/billing/invoices', (req, res) => res.json(seed.invoices))
router.get('/billing/invoices/:id', (req, res) => res.json(seed.invoiceDetail(req.params.id)))
router.get('/team', (req, res) => res.json(seed.team))
router.get('/notifications', (req, res) => res.json(seed.notifications))
router.get('/profile', (req, res) => res.json({ ...seed.demoUser, password: undefined, twoFactor: true, lang: 'fa', timezone: 'Asia/Tehran' }))

export default router
