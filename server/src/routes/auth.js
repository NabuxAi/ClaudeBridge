import { Router } from 'express'
import crypto from 'node:crypto'
import { signToken, verifyPassword, verifyPasswordDummy, requireAuth } from '../auth.js'
import { sessions, tokenHash as sessionTokenHash } from '../sessions.store.js'
import { twoFactor } from '../twofactor.store.js'
import { generateSecret, verify as verifyTotp, otpauthUri } from '../totp.js'
import { users, passwordResets, team } from '../store.js'
import { config } from '../config.js'
import * as captcha from '../security/captcha.js'
import { hit, clear, peek, clientIp, limiter } from '../security/ratelimit.js'
import { sendMail, isMailerConfigured } from '../mailer.js'

const router = Router()

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })
const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase() || 'none'

/**
 * A short human-readable summary of the signing-in device, stored with the
 * session so the security page can say "Chrome روی Windows" instead of a
 * 300-character user-agent. Genuinely unrecognised clients say so rather
 * than inventing a device name.
 */
export function deviceSummary(ua) {
  const s = String(ua || '')
  if (!s) return 'دستگاه ناشناس'
  const browser =
    (/Edg\//.test(s) && 'Edge') ||
    (/OPR\//.test(s) && 'Opera') ||
    (/SamsungBrowser\//.test(s) && 'Samsung Internet') ||
    (/Firefox\//.test(s) && 'Firefox') ||
    (/Chrome\//.test(s) && 'Chrome') ||
    (/Safari\//.test(s) && 'Safari') ||
    ''
  const os =
    (/Windows/.test(s) && 'Windows') ||
    (/Android/.test(s) && 'Android') ||
    (/iPhone|iPad|iPod/.test(s) && 'iOS') ||
    (/Mac OS X|Macintosh/.test(s) && 'macOS') ||
    (/Linux/.test(s) && 'Linux') ||
    ''
  if (!browser && !os) return 'دستگاه ناشناس'
  return [browser, os].filter(Boolean).join(' روی ')
}

/**
 * Mint a login/register token together with the session row its jti points
 * at. The pair is one unit: a token whose session row failed to write must
 * never reach the client, so a database error here fails the whole login
 * (500) instead of issuing an untracked token.
 */
async function issueSessionToken(req, user) {
  const jti = crypto.randomBytes(16).toString('hex')
  const token = signToken({ sub: user.id, name: user.name, role: user.role, jti })
  await sessions.create({
    userId: user.id,
    jti,
    device: deviceSummary(req.get('user-agent')),
    // Node reports IPv4 loopback as the mapped form; the security page should
    // read "127.0.0.1", not "::ffff:127.0.0.1". Same address, written for humans.
    ip: ip(req).replace(/^::ffff:/, ''),
  })
  return token
}

// Session-management routes answer only to real session tokens. A
// purpose-scoped token (kind: 'backup_download') authenticates a download,
// not a person — requireAuth sets req.sessionId exclusively for session
// tokens, so this keeps capability tokens away from the device list.
const requireSession = (req, res, next) => {
  if (!req.sessionId) return res.status(401).json({ message: 'Unauthorized' })
  next()
}

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
//
// `inviteToken` (optional) is the raw token of a team invitation — the same
// one the invite email carries — so someone without an account registers and
// lands in the inviting site's team in one step. The account is created first;
// an unusable token (expired, spent, revoked, or addressed to another email)
// never fails the registration itself — the response reports why, honestly.
router.post('/auth/register', registerLimit, async (req, res, next) => {
  try {
    const { name, email, password, captchaId, captchaAnswer, inviteToken } = req.body || {}

    const c = captcha.verify(captchaId, captchaAnswer)
    if (!c.ok) return res.status(400).json({ message: captcha.MESSAGES[c.reason], captchaRequired: true })

    const user = await users.create({ name, email, password })

    let invite = null
    if (inviteToken) {
      try {
        invite = { applied: true, member: await team.acceptOnRegister(inviteToken, user) }
      } catch (e) {
        invite = { applied: false, error: e.status ? e.message : 'اعمال دعوت‌نامه انجام نشد.' }
        if (!e.status) console.warn('register: invite application failed unexpectedly:', e.message)
      }
    }

    const token = await issueSessionToken(req, user)
    res.status(201).json({ token, user, invite })
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
 *
 * Accounts with two-factor enabled add a gate between the password and the
 * session: without `code` the answer is the `{totp_required: true}` challenge,
 * with a wrong code it is a 401 that feeds the same failure counters — code
 * guessing is priced exactly like password guessing.
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

    // Second factor. Reached only past a correct password, so its answers
    // never become an account-existence oracle: a stranger without the
    // password is turned away by the generic message above, and the same
    // per-IP and per-account limiters that price password guessing price
    // code guessing — every 2FA attempt is a full login attempt.
    const tf = await twoFactor.get(row.id)
    if (tf && tf.status === 'active') {
      const code = String(req.body?.code || '').trim()
      if (!code) {
        // The challenge: the password checked out, but no session exists
        // until the code arrives. The client re-submits the same login
        // with `code` — stateless, so no half-built session can pile up.
        return res.json({ totp_required: true })
      }
      // The authenticator's code first; a recovery code is the same door
      // with a single-use key. Either passing is the second factor met.
      const codeOk = verifyTotp(tf.secret, code, { window: 1 })
        || await twoFactor.consumeRecoveryCode(row.id, code)
      if (!codeOk) {
        const fails = hit(failKey, { limit: 1_000_000, windowMs: 15 * 60 * 1000 })
        const failures = 1_000_000 - fails.remaining
        // Not the generic wrong-password line: this caller has already
        // proven the password, and telling them "email or password is
        // wrong" would be a lie. It stays enumeration-safe anyway —
        // only someone holding the password can ever read it.
        return res.status(401).json({
          message: 'کد ورود دو مرحله‌ای درست نیست.',
          captchaRequired: failures >= config.security.captchaAfterFailures,
        })
      }
    }

    // A correct login clears the penalty. Someone who mistypes twice and
    // then gets it right should not carry a lockout into tomorrow — and
    // "correct login" now means the second factor passed too, not merely
    // the password, so code guessing accumulates like password guessing.
    clear(failKey)
    clear(`login-acct:${emailOf(req)}`)

    const user = await users.byId(row.id)
    const token = await issueSessionToken(req, user)
    res.json({ token, user })
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

// ---- Session / device management ------------------------------------------
// The owner's own sessions only, and never with hashes: `token_hash` is the
// server's lookup key, and a list response is not the place to teach an XSS
// what a session identifier looks like. `current` on each row is the only
// thing the client needs to mark "این دستگاه".

router.get('/auth/sessions', requireAuth, requireSession, async (req, res, next) => {
  try {
    const list = await sessions.listForUser(req.user.sub, sessionTokenHash(req.user.jti))
    res.json({ sessions: list })
  } catch (e) { next(e) }
})

// "خروج" for one device. Scoped to req.user.sub, so another user's session id
// is indistinguishable from a made-up one: both are a plain 404.
router.delete('/auth/sessions/:id', requireAuth, requireSession, async (req, res, next) => {
  try {
    const row = await sessions.revoke(req.params.id, req.user.sub)
    if (!row) return res.status(404).json({ message: 'نشست پیدا نشد.' })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// "خروج از دستگاه‌های دیگر" — everything but the session this request rode
// in on, so the user does not log themselves out of the device they are
// holding.
router.post('/auth/sessions/revoke-others', requireAuth, requireSession, async (req, res, next) => {
  try {
    const revoked = await sessions.revokeOthers(req.user.sub, sessionTokenHash(req.user.jti))
    res.json({ ok: true, revoked })
  } catch (e) { next(e) }
})

// "خروج" — the daily-exit path the header button rides. Clearing the browser's
// localStorage alone left the session row live until its 7-day expiry, so a
// token copied off a shared device kept working after the person left. Here
// the session this request rode in on is revoked server-side; the client then
// clears its own copy. Idempotent by construction: requireAuth resolved a live
// row moments ago, and if it was revoked in between, the outcome the caller
// wanted already holds — a plain ok is still the truth. Like every session
// route this answers only to real session tokens: a purpose-scoped capability
// token authenticates a download, not a person, and has nothing to log out.
router.post('/auth/logout', requireAuth, requireSession, async (req, res, next) => {
  try {
    await sessions.revoke(req.sessionId, req.user.sub)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ---- Two-factor authentication (TOTP, RFC 6238) ----------------------------
// All four routes answer only to real session tokens (requireSession): a
// purpose-scoped capability token authenticates a file download, not a
// person, and must never touch enrollment.
//
// The one state the status route will not return is the secret itself. It
// exists in exactly two places — the database and the user's authenticator
// app — and a page that displays it on every visit turns any past screenshot
// into a permanent credential.

// Verification attempts (activate, and disable's code check) are priced per
// account, not per address: the caller holds a live session, so a distributed
// guess against one enrollment is the realistic attack, not one busy IP.
const totpActionLimit = limiter('2fa', {
  limit: 20, windowMs: 15 * 60 * 1000,
  keyFn: (req) => req.user?.sub || ip(req),
  message: 'تلاش‌های ورود دو مرحله‌ای بیش از حد است. کمی بعد دوباره تلاش کنید.',
})

// Disable re-proves the password, so it gets the tighter treatment the other
// password-behind-session endpoints use.
const totpDisableLimit = limiter('2fa-disable', {
  limit: 10, windowMs: 15 * 60 * 1000,
  keyFn: (req) => req.user?.sub || ip(req),
  message: 'تلاش‌های غیرفعال‌سازی ورود دو مرحله‌ای بیش از حد است. کمی بعد دوباره تلاش کنید.',
})

/** Whether this account has the factor on, a setup in flight, and codes left. */
router.get('/auth/2fa/status', requireAuth, requireSession, async (req, res, next) => {
  try {
    const tf = await twoFactor.get(req.user.sub)
    res.json({
      enabled: !!tf && tf.status === 'active',
      pending: !!tf && tf.status === 'pending',
      recoveryCodesLeft: tf ? await twoFactor.recoveryCodesLeft(req.user.sub) : 0,
    })
  } catch (e) { next(e) }
})

/**
 * Begin enrollment: a fresh secret, returned with the otpauth:// URI an
 * authenticator app scans. The secret is stored "pending" — the factor does
 * not exist until activate proves the user's app actually derives the same
 * codes, which is what stops a typo in manual entry from locking the owner
 * out.
 */
router.post('/auth/2fa/setup', requireAuth, requireSession, totpActionLimit, async (req, res, next) => {
  try {
    const existing = await twoFactor.get(req.user.sub)
    if (existing?.status === 'active') {
      return res.status(400).json({ message: 'ورود دو مرحله‌ای همین حالا فعال است؛ برای تغییر، ابتدا آن را غیرفعال کنید.' })
    }
    const secret = generateSecret()
    await twoFactor.setPending(req.user.sub, secret)
    const user = await users.byId(req.user.sub)
    res.json({
      secret,
      otpauth: otpauthUri({ secret, account: user?.email || '', issuer: 'DigiWP' }),
    })
  } catch (e) { next(e) }
})

/**
 * Prove the app and finish enrollment. The first correct code flips the
 * factor on — accepted within the same ±1-step window a login would later
 * get — and mints the recovery codes. Those ride in this one response body
 * and nowhere else: only their hashes are stored, so this page load is the
 * single chance the user has to keep them.
 */
router.post('/auth/2fa/activate', requireAuth, requireSession, totpActionLimit, async (req, res, next) => {
  try {
    const tf = await twoFactor.get(req.user.sub)
    if (!tf || tf.status !== 'pending') {
      return res.status(400).json({ message: 'راه‌اندازی ورود دو مرحله‌ای در جریان نیست؛ ابتدا آن را شروع کنید.' })
    }
    const code = String(req.body?.code || '').trim()
    if (!verifyTotp(tf.secret, code, { window: 1 })) {
      return res.status(400).json({ message: 'کد وارد شده درست نیست؛ کد شش‌رقمیِ فعلی اپلیکیشن را وارد کنید.' })
    }
    const { codes } = await twoFactor.activate(req.user.sub)
    res.json({ ok: true, recoveryCodes: codes })
  } catch (e) { next(e) }
})

/**
 * Turn the factor off. Both proofs are demanded because each one covers the
 * other's theft: a stolen phone alone has the code but not the password, a
 * stolen session alone has the password but not the device. The code may be
 * the authenticator's or a recovery code — a user who lost the phone and
 * logged in with a recovery code must still be able to leave 2FA.
 */
router.post('/auth/2fa/disable', requireAuth, requireSession, totpDisableLimit, async (req, res, next) => {
  try {
    const { password, code } = req.body || {}
    const row = await users.byIdRaw(req.user.sub)
    if (!row) return res.status(401).json({ message: 'Unauthorized' })
    if (!password || !(await verifyPassword(String(password), row.pass_hash))) {
      return res.status(400).json({ message: 'رمز عبور نادرست است.' })
    }

    const tf = await twoFactor.get(req.user.sub)
    if (!tf || tf.status !== 'active') {
      return res.status(400).json({ message: 'ورود دو مرحله‌ای فعال نیست.' })
    }
    const codeOk = verifyTotp(tf.secret, String(code || '').trim(), { window: 1 })
      || await twoFactor.consumeRecoveryCode(req.user.sub, code)
    if (!codeOk) {
      return res.status(400).json({ message: 'کد تأیید دو مرحله‌ای درست نیست.' })
    }
    await twoFactor.disable(req.user.sub)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

const forgotLimit = limiter('forgot-password', {
  limit: 5, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد درخواست‌های بازنشانی از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

/**
 * Request a password reset link.
 *
 * The response is deliberately vague: "if this email has an account, a link
 * was sent". That is the only claim we can make without leaking whether the
 * address is registered.
 *
 * `mailConfigured` is the one extra field, and it is deployment state, not
 * account state: it is computed before the lookup so it is identical for
 * every address. Revealing "email is not configured here" only for
 * addresses that have an account would enumerate the customer list;
 * revealing it for all of them tells an attacker nothing the login page of
 * any deployment does not.
 */
router.post('/auth/forgot-password', forgotLimit, async (req, res, next) => {
  try {
    const { email, captchaId, captchaAnswer } = req.body || {}
    const c = captcha.verify(captchaId, captchaAnswer)
    if (!c.ok) return res.status(400).json({ message: captcha.MESSAGES[c.reason], captchaRequired: true })

    const mailConfigured = isMailerConfigured()

    const normalized = String(email || '').trim().toLowerCase()
    // Always cost the same regardless of whether the account exists.
    const row = normalized ? await users.byEmailRaw(normalized) : null
    if (row) {
      const { raw } = await passwordResets.create(row.id)
      const link = `${config.publicPanelUrl || 'http://localhost:8080'}/reset?token=${raw}`
      const mail = await sendMail({
        to: row.email,
        subject: 'بازنشانی رمز عبور DigiWP',
        text: `برای بازنشانی رمز عبور روی این لینک کلیک کنید:\n${link}\n\nاین لینک یک ساعت معتبر است و فقط یک‌بار قابل استفاده است.`,
        html: `<p>برای بازنشانی رمز عبور روی این لینک کلیک کنید:</p><p><a href="${link}">${link}</a></p><p>این لینک یک ساعت معتبر است و فقط یک‌بار قابل استفاده است.</p>`,
      })
      // The response must stay vague or the delivery outcome becomes an
      // account-existence oracle, so a failed send is visible to the operator
      // only — and with reason/status alone: no provider detail (it can echo
      // sender credentials), no address.
      if (!mail.ok) {
        console.warn(`forgot-password: delivery failed (reason=${mail.reason}${mail.status ? ` status=${mail.status}` : ''})`)
      }
    }
    res.json({
      ok: true,
      mailConfigured,
      message: mailConfigured
        ? 'اگر این ایمیل در سیستم وجود داشته باشد، لینک بازنشانی ارسال شده است.'
        : 'ارسال ایمیل روی این سرور پیکربندی نشده است؛ برای بازنشانی رمز عبور با پشتیبانی تماس بگیرید.',
    })
  } catch (e) { next(e) }
})

const resetLimit = limiter('reset-password', {
  limit: 10, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'تعداد تلاش‌های بازنشانی از این آدرس بیش از حد است. یک ساعت دیگر تلاش کنید.',
})

/**
 * Spend a reset token and set a new password.
 *
 * A spent or expired token is a 400, with the same message for both so an
 * attacker cannot distinguish expiration from use by timing or status code.
 */
router.post('/auth/reset-password', resetLimit, async (req, res, next) => {
  try {
    const { token, password } = req.body || {}
    if (!token || String(token).length < 32) return res.status(400).json({ message: 'لینک بازنشانی نامعتبر است.' })
    if (!password || String(password).length < 8) return res.status(400).json({ message: 'رمز عبور باید حداقل ۸ نویسه باشد.' })

    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')
    const pr = await passwordResets.find(tokenHash)
    if (!pr) return res.status(400).json({ message: 'لینک بازنشانی منقضی یا استفاده شده است.' })

    await users.updatePassword(pr.user_id, password)
    await passwordResets.markUsed(pr.id)
    res.json({ ok: true, message: 'رمز عبور بازنشانی شد. اکنون می‌توانید وارد شوید.' })
  } catch (e) { next(e) }
})

export default router
