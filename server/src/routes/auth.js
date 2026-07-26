import { Router } from 'express'
import { signToken, verifyPassword, verifyPasswordDummy, requireAuth } from '../auth.js'
import { users } from '../store.js'
import { config } from '../config.js'
import * as captcha from '../security/captcha.js'
import { hit, clear, peek, clientIp, limiter } from '../security/ratelimit.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })
const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase() || 'none'

/**
 * A fresh challenge.
 *
 * Rate-limited too. Without that a script can pull challenges as fast as it
 * likes and solve them in bulk, so the captcha costs it one extra request per
 * attempt instead of any real friction.
 */
router.get(
  '/auth/captcha',
  limiter('captcha', { limit: 60, windowMs: 10 * 60 * 1000, keyFn: ip }),
  (_req, res) => res.json(captcha.issue())
)

/**
 * How much proof this address currently owes.
 *
 * The login form asks before rendering, so a first-time visitor is not made to
 * do arithmetic to sign in. The captcha appears once this address has failed a
 * few times — the point at which it is either a typo-prone human, who will not
 * mind, or a script, which is what we are pricing out.
 */
router.get('/auth/challenge-state', (req, res) => {
  const failures = peek(`login-fail:${ip(req)}`).count
  res.json({
    captchaRequired: failures >= config.security.captchaAfterFailures,
    failures,
  })
})

const registerLimit = limiter('register', {
  limit: 5, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد ثبت‌نام از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

// Registration always demands a captcha: there is no prior failure to key off,
// and an open registration endpoint is how a user table fills with junk.
router.post('/auth/register', registerLimit, async (req, res, next) => {
  try {
    const { name, email, password, captchaId, captchaAnswer } = req.body || {}

    const c = captcha.verify(captchaId, captchaAnswer)
    if (!c.ok) return res.status(400).json({ message: captcha.MESSAGES[c.reason], captchaRequired: true })

    const user = await users.create({ name, email, password })
    res.status(201).json({ token: signToken({ sub: user.id, name: user.name }), user })
  } catch (e) { next(e) }
})

const loginLimit = limiter('login', {
  limit: 20, windowMs: 15 * 60 * 1000, keyFn: ip,
  message: 'تلاش‌های ورود از این آدرس بیش از حد است. کمی صبر کنید.',
})

/**
 * Login.
 *
 * Three defences, each covering a gap the others leave:
 *
 *   per-IP limit       one machine guessing.
 *   per-account limit  many machines guessing one known address, where a
 *                      per-IP limit never trips.
 *   captcha after N    scripted hammering, before either limit is reached.
 *
 * Plus one property that is not a defence but a leak: a missing account has to
 * cost the same time as a wrong password. Otherwise the response time alone
 * tells an attacker which addresses have accounts, and they can enumerate the
 * customer list before trying a single password.
 */
router.post('/auth/login', loginLimit, async (req, res, next) => {
  try {
    const { email, password, captchaId, captchaAnswer } = req.body || {}
    const failKey = `login-fail:${ip(req)}`

    if (peek(failKey).count >= config.security.captchaAfterFailures) {
      const c = captcha.verify(captchaId, captchaAnswer)
      if (!c.ok) {
        return res.status(400).json({ message: captcha.MESSAGES[c.reason], captchaRequired: true })
      }
    }

    // Keyed on the address being attacked, not on the attacker, so rotating
    // source IPs does not reset it.
    const acct = hit(`login-acct:${emailOf(req)}`, { limit: 10, windowMs: 15 * 60 * 1000 })
    if (!acct.allowed) {
      res.setHeader('Retry-After', String(acct.retryAfter))
      return res.status(429).json({
        message: 'ورود به این حساب موقتاً قفل شده است. کمی بعد دوباره تلاش کنید.',
        retryAfter: acct.retryAfter,
      })
    }

    const row = await users.byEmailRaw(email)
    // The dummy derivation is the point, not a fallback: both branches do the
    // same amount of work.
    const ok = row ? await verifyPassword(password, row.pass_hash) : await verifyPasswordDummy(password)

    if (!ok) {
      const fails = hit(failKey, { limit: 1_000_000, windowMs: 15 * 60 * 1000 })
      const failures = 1_000_000 - fails.remaining
      return res.status(401).json({
        message: 'ایمیل یا رمز عبور نادرست است.',
        // Says what the next attempt needs, without the error itself revealing
        // anything about whether the account exists.
        captchaRequired: failures >= config.security.captchaAfterFailures,
      })
    }

    // A correct password clears the penalty. Someone who mistypes twice and
    // then gets it right should not carry a lockout into tomorrow.
    clear(failKey)
    clear(`login-acct:${emailOf(req)}`)

    const user = await users.byId(row.id)
    res.json({ token: signToken({ sub: user.id, name: user.name }), user })
  } catch (e) { next(e) }
})

// Current user from the session token.
router.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await users.byId(req.user.sub)
    if (!user) return res.status(401).json({ message: 'Unauthorized' })
    res.json(user)
  } catch (e) { next(e) }
})

export default router
