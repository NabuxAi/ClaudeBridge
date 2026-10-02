import { Router } from 'express'
import { requireAuth } from '../auth.js'
import { pushSubscriptions, validateSubscription } from '../push.store.js'
import { isPushConfigured } from '../push.js'
import { limiter, clientIp } from '../security/ratelimit.js'
import { config } from '../config.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

/**
 * Browser push (VAPID) enrollment for the signed-in account.
 *
 * The mailConfigured pattern, carried over: configuration is a deployment
 * state, so /push/status is identical for everyone and answers honestly
 * { configured:false } with the reason rather than letting the panel guess.
 * Nothing here mints keys — a server-generated VAPID key stored on disk dies
 * with the next deploy and takes every subscription with it.
 *
 * All routes are session-authenticated; subscriptions belong to one account.
 */
router.get('/push/status', requireAuth, async (req, res, next) => {
  try {
    const configured = isPushConfigured()
    res.json({
      configured,
      // One deployment-level reason for the honest off state; the UI renders
      // it verbatim rather than inventing its own explanation.
      ...(configured ? {} : {
        reason: 'کلیدهای VAPID روی این سرور تنظیم نشده است (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).',
      }),
      subscriptions: await pushSubscriptions.listForUser(req.user.sub),
      scope: 'اعلان مرورگر، مستقیم از سرور؛ پذیرش سرویس به معنی دیده‌شدن نیست.',
    })
  } catch (e) { next(e) }
})

router.get('/push/public-key', requireAuth, (req, res) => {
  if (!isPushConfigured()) {
    // 200 with the honest state, not an error: this is asked on page load and
    // the answer is "this deployment has not turned push on", which is a
    // normal state the panel renders rather than an exception.
    return res.json({
      configured: false,
      message: 'اعلان مرورگر روی این سرور فعال نیست: کلیدهای VAPID تنظیم نشده‌اند.',
    })
  }
  // The public half is exactly what the browser needs for
  // pushManager.subscribe({ applicationServerKey }); the private half never
  // leaves config.
  res.json({ configured: true, publicKey: config.push.publicKey })
})

const subscribeLimit = limiter('push-subscribe', {
  limit: 30, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'ثبت اشتراک اعلان از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

/**
 * Register a subscription the browser created via PushManager.subscribe.
 *
 * Refused while unconfigured: storing a subscription that can never receive
 * anything would make the panel show an active-looking channel that is dead
 * — the exact "unavailable dressed as healthy" this codebase removes.
 */
router.post('/push/subscribe', requireAuth, subscribeLimit, async (req, res, next) => {
  try {
    if (!isPushConfigured()) {
      return res.status(503).json({
        message: 'اعلان مرورگر روی این سرور فعال نیست: کلیدهای VAPID تنظیم نشده‌اند.',
      })
    }
    const sub = validateSubscription(req.body)
    const saved = await pushSubscriptions.upsert(req.user.sub, sub)
    res.status(201).json(saved)
  } catch (e) { next(e) }
})

/**
 * Remove one subscription. Accepts { id } or { endpoint }, always scoped to
 * the signed-in user — a token for one account cannot delete another
 * account's rows even with a copied endpoint URL.
 */
router.post('/push/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const { id, endpoint } = req.body || {}
    if (!id && !endpoint) {
      return res.status(400).json({ message: 'شناسه یا نشانی اشتراک لازم است.' })
    }
    const removed = await pushSubscriptions.remove(req.user.sub, { id, endpoint })
    if (!removed) return res.status(404).json({ message: 'اشتراک پیدا نشد.' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
