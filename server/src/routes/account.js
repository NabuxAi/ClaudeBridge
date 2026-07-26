import { Router } from 'express'
import { config, publicApiBase } from '../config.js'
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
/**
 * Where to reach this person in an emergency.
 *
 * On the user, not the site: a phone belongs to a human, and someone with four
 * sites should not enter it four times. The push tokens are registered by the
 * PWA itself, so the panel writes them here after the browser grants permission.
 */
router.patch('/contact', async (req, res, next) => {
  try {
    const patch = {}
    if ('phone' in (req.body || {})) patch.phone = normalisePhone(req.body.phone)
    if ('fcmToken' in (req.body || {})) patch.fcmToken = tokenOrNull(req.body.fcmToken)
    if ('najvaToken' in (req.body || {})) patch.najvaToken = tokenOrNull(req.body.najvaToken)
    res.json(await users.setContact(req.user.sub, patch))
  } catch (e) { next(e) }
})

/**
 * Can we actually reach this person?
 *
 * Asked and answered plainly, because the failure mode is silent: a customer
 * who never entered a phone number and a deployment missing an SMS key both
 * look like "alerts are on" until the night one is needed. This says which
 * roads exist right now — and it counts a road only when both ends are there,
 * the provider key on our side and the address on theirs.
 */
router.get('/alerts/readiness', async (req, res, next) => {
  try {
    const me = await users.byId(req.user.sub)
    const contact = await users.contact(req.user.sub)
    const rows = [
      { id: 'firebase', label: 'اعلان مرورگر (Firebase)', server: Boolean(config.alerts.fcmServerKey), user: Boolean(contact.fcmToken) },
      { id: 'najva', label: 'اعلان نجوا', server: Boolean(config.alerts.najvaApiKey), user: Boolean(contact.najvaToken) },
      { id: 'sms', label: 'پیامک', server: Boolean(config.alerts.smsUrl && config.alerts.smsApiKey), user: Boolean(contact.phone) },
      { id: 'email', label: 'ایمیل', server: Boolean(config.alerts.emailUrl), user: Boolean(me?.email) },
    ].map((r) => ({
      ...r,
      ready: r.server && r.user,
      why: r.server && r.user ? null
        : !r.server ? 'این سرویس روی سرور ما تنظیم نشده'
        : 'اطلاعات تماس شما برای این راه ثبت نشده',
    }))

    const ready = rows.filter((r) => r.ready)
    res.json({
      channels: rows,
      readyCount: ready.length,
      // The sentence that matters. A single channel is not redundancy, and the
      // whole design of the dispatcher assumes there is somewhere to fall back to.
      verdict: ready.length === 0
        ? 'هیچ راهی برای اطلاع‌رسانی اضطراری به شما وجود ندارد. اگر سایتتان هک شود، از ما خبری نمی‌شنوید.'
        : ready.length === 1
          ? `فقط یک راه فعال است (${ready[0].label}). اگر همان یکی کار نکند، هشداری به شما نمی‌رسد.`
          : `${ready.length} راه فعال است؛ اگر یکی کار نکند، بعدی امتحان می‌شود.`,
    })
  } catch (e) { next(e) }
})

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

/**
 * Iranian mobile numbers, in one shape.
 *
 * Stored as +989…, because an SMS gateway that receives 0912… from one user
 * and +98912… from another will silently fail for one of them. Anything that
 * is not recognisably a mobile number is rejected rather than stored — a
 * number we cannot send to is worse than a blank, since a blank is visible in
 * the readiness check.
 */
function normalisePhone(v) {
  const digits = String(v || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')
  if (!digits) return null
  if (/^09\d{9}$/.test(digits)) return '+98' + digits.slice(1)
  if (/^989\d{9}$/.test(digits)) return '+' + digits
  if (/^9\d{9}$/.test(digits)) return '+98' + digits
  // A foreign number is fine as long as it looks like one.
  if (digits.length >= 10 && digits.length <= 15) return '+' + digits
  return null
}

const tokenOrNull = (v) => {
  const s = String(v || '').trim()
  return s && s.length <= 512 ? s : null
}
