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
// Three views with no system behind them. Each was returning seed data as if
// it were the signed-in user's own: a saved card ending 8824, three paid
// invoices, two colleagues with names and email addresses, and notification
// channels pointing at a phone number and a Telegram handle that belong to
// nobody. Personal-looking data is the most believable kind, so these now say
// plainly that the feature does not exist rather than showing a plausible
// version of it.
//
// The plan list stays: it is a price list, the same for everyone, and true.
const NOT_BUILT = (what) => ({
  provenance: { live: [], unavailable: what },
})

router.get('/billing/plans', (_req, res) => res.json(seed.plans))
router.get('/billing', (_req, res) =>
  res.json(NOT_BUILT('صورتحساب و پرداخت هنوز ساخته نشده — هیچ درگاه پرداختی متصل نیست و کارتی ذخیره نمی‌شود.')))
router.get('/billing/invoices', (_req, res) =>
  res.json({ ...NOT_BUILT('فاکتوری صادر نمی‌شود چون سیستم پرداخت هنوز وجود ندارد.'), list: [] }))
router.get('/billing/invoices/:id', (_req, res) =>
  res.status(404).json({ message: 'فاکتوری وجود ندارد — سیستم پرداخت هنوز ساخته نشده.' }))
router.get('/team', async (req, res, next) => {
  try {
    // The one real member: whoever is signed in. Inviting others needs an
    // invitation flow and per-site permissions, neither of which exists.
    const me = await users.byId(req.user.sub)
    res.json({
      ...NOT_BUILT('دعوت هم‌تیمی و دسترسی چندکاربره هنوز ساخته نشده. فقط حساب خودتان وجود دارد.'),
      list: me ? [{ id: me.id, name: me.name, email: me.email, role: 'owner', roleLabel: 'مالک', initials: (me.name || me.email)[0], sites: 'همه' }] : [],
    })
  } catch (e) { next(e) }
})
router.get('/notifications', (_req, res) =>
  res.json(NOT_BUILT('تنظیمات اعلان هنوز ساخته نشده. گزارش امنیتی روزانه فقط به تلگرامی می‌رود که در سرور پیکربندی شده.')))
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
