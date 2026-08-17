import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { billing } from '../billing.store.js'
import { limiter, clientIp } from '../security/ratelimit.js'
import { config } from '../config.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

const NOT_BUILT = (what) => ({
  provenance: { live: [], unavailable: what },
})

/**
 * Current subscription and entitlement summary.
 *
 * Returns the real subscription row (plan, status, trial window, site usage)
 * and a clear provenance note. Payment gateway/card/invoice data is still
 * NOT_BUILT and returned separately so the UI does not mix real and fake.
 */
router.get('/billing', requireAuth, async (req, res, next) => {
  try {
    const subscription = await billing.forUser(req.user.sub)
    res.json({
      subscription,
      provenance: { live: ['subscriptions'], unavailable: null },
      payment: NOT_BUILT('درگاه پرداخت هنوز متصل نیست و کارتی ذخیره نمی‌شود.'),
      invoices: { ...NOT_BUILT('فاکتوری صادر نمی‌شود چون سیستم پرداخت هنوز وجود ندارد.'), list: [] },
    })
  } catch (e) { next(e) }
})

/** All available plans. Public within an authenticated session. */
router.get('/billing/plans', requireAuth, async (req, res, next) => {
  try {
    res.json(await billing.plans())
  } catch (e) { next(e) }
})

/** Trial status for the signed-in user. */
router.get('/billing/trial', requireAuth, async (req, res, next) => {
  try {
    res.json(await billing.trialStatus(req.user.sub))
  } catch (e) { next(e) }
})

/**
 * Request pilot access to a plan.
 *
 * No payment is taken. The server records the request, starts/extends a trial,
 * and returns the updated subscription. This replaces the fake "پرداخت امن"
 * flow until real gateways are wired in.
 */
const pilotLimit = limiter('request-pilot', {
  limit: 10, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد درخواست‌های دسترسی آزمایشی از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

router.post('/billing/request-pilot', requireAuth, pilotLimit, async (req, res, next) => {
  try {
    const planId = String(req.body?.plan || '').trim()
    if (!planId) return res.status(400).json({ message: 'شناسهٔ پلن لازم است.' })
    const subscription = await billing.requestPilot(req.user.sub, planId)
    res.json({ ok: true, subscription })
  } catch (e) { next(e) }
})

/**
 * Webhook placeholder.
 *
 * External payment providers would post here. We return an honest NOT_BUILT
 * because no gateway is connected, but we still persist explicit plan/trial
 * changes sent by a trusted internal caller. This lets the skeleton exercise
 * the persistence path without pretending a charge succeeded.
 */
const webhookLimit = limiter('billing-webhook', {
  limit: 60, windowMs: 60 * 1000, keyFn: ip,
  message: 'تعداد webhookهای دریافتی از این آدرس بیش از حد است.',
})

router.post('/billing/webhook', requireAuth, webhookLimit, async (req, res, next) => {
  try {
    const userId = req.body?.userId || req.user?.sub
    if (!userId) return res.status(400).json({ message: 'شناسهٔ کاربر لازم است.' })

    const { plan, trialDays, cancelAtPeriodEnd } = req.body || {}
    const persisted = await billing.applyChange(userId, { plan, trialDays, cancelAtPeriodEnd })

    res.json({
      ok: true,
      payment: 'NOT_BUILT',
      message: 'پرداخت هنوز فعال نیست، اما تغییر پلن/دورهٔ آزمایشی ثبت شد.',
      persisted,
    })
  } catch (e) { next(e) }
})

export default router
