import { Router } from 'express'
import { describe as describeHosting } from '../hosting.js'
import { httpError, normalizeLocale, i18nMiddleware } from '../i18n.js'
import { localizeEvent, i18nTitle } from '../event-text.js'
import { config, publicApiBase } from '../config.js'
import { sites, users } from '../store.js'
import * as events from '../events.js'
import * as seed from '../seed.js'
import { one, all, query } from '../db.js'
import { verifyPassword } from '../auth.js'
import { sessions } from '../sessions.store.js'
import { twoFactor } from '../twofactor.store.js'
import { billing } from '../billing.store.js'
import { limiter, hit, clientIp } from '../security/ratelimit.js'

const router = Router()
// Idempotent with the app-level middleware; keeps req.t/req.locale present
// when a router is mounted on its own (tests build bare apps).
router.use(i18nMiddleware)

// The signed-in user's sites (empty for a brand-new account).
router.get('/sites', async (req, res, next) => {
  try {
    // Hosting labels are rendered in the reader's language here; the store
    // has no request and describes them in English.
    const list = await sites.listByUser(req.user.sub)
    res.json(list.map((s) => ({ ...s, hosting: describeHosting(s.hosting, req.locale) })))
  } catch (e) { next(e) }
})

// Create a site → returns the one-time shared secret + server URL for the plugin.
//
// Gated by the plan/trial entitlement BEFORE anything is written: a site
// created over the cap would hand out a pairing secret the plan never paid
// for, and un-creating it later cannot un-disclose that secret. Pairing an
// already-added site (/sites/:id/ping) is deliberately NOT gated — the slot
// is already counted, and cutting an existing site's relay off because the
// trial expired afterwards would punish data already in the product.
router.post('/sites', async (req, res, next) => {
  try {
    const { name, title } = req.body || {}
    await billing.canAddSite(req.user.sub, req.locale)
    const site = await sites.add(req.user.sub, { name, title })
    res.status(201).json({
      id: site.id, name: site.name, title: site.title, status: site.status,
      pairing: {
        serverUrl: publicApiBase(req),
        siteKey: site.siteKey,
        secret: site.secret, // shown ONCE — paste into the plugin
        steps: [
          req.t('account.pairing.step1'),
          req.t('account.pairing.step2'),
          req.t('account.pairing.step3'),
          req.t('account.pairing.step4'),
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

router.get('/billing/plans', (req, res) => res.json(billing.localizePlans(req.locale, seed.plans)))
router.get('/billing', (req, res) =>
  res.json(NOT_BUILT(req.t('account.notBuilt.billing'))))
router.get('/billing/invoices', (req, res) =>
  res.json({ ...NOT_BUILT(req.t('billing.noInvoices')), list: [] }))
router.get('/billing/invoices/:id', (req, res) =>
  res.status(404).json({ message: req.t('account.notBuilt.invoice') }))
router.get('/team', async (req, res, next) => {
  try {
    // The one real member: whoever is signed in. Inviting others needs an
    // invitation flow and per-site permissions, neither of which exists.
    const me = await users.byId(req.user.sub)
    res.json({
      ...NOT_BUILT(req.t('account.notBuilt.team')),
      list: me ? [{ id: me.id, name: me.name, email: me.email, role: 'owner', roleLabel: req.t('team.role.owner'), initials: (me.name || me.email)[0], sites: req.t('account.allSites') }] : [],
    })
  } catch (e) { next(e) }
})
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
      { id: 'firebase', label: req.t('account.readiness.firebase'), server: Boolean(config.alerts.fcmServerKey), user: Boolean(contact.fcmToken) },
      { id: 'najva', label: req.t('account.readiness.najva'), server: Boolean(config.alerts.najvaApiKey), user: Boolean(contact.najvaToken) },
      { id: 'sms', label: req.t('account.readiness.sms'), server: Boolean(config.alerts.smsUrl && config.alerts.smsApiKey), user: Boolean(contact.phone) },
      { id: 'email', label: req.t('account.readiness.email'), server: Boolean(config.alerts.emailUrl), user: Boolean(me?.email) },
    ].map((r) => ({
      ...r,
      ready: r.server && r.user,
      why: r.server && r.user ? null
        : !r.server ? req.t('account.readiness.noServer')
        : req.t('account.readiness.noContact'),
    }))

    const ready = rows.filter((r) => r.ready)
    res.json({
      channels: rows,
      readyCount: ready.length,
      // The sentence that matters. A single channel is not redundancy, and the
      // whole design of the dispatcher assumes there is somewhere to fall back to.
      verdict: ready.length === 0
        ? req.t('account.readiness.none')
        : ready.length === 1
          ? req.t('account.readiness.one', { channel: ready[0].label })
          : req.t('account.readiness.many', { count: ready.length }),
    })
  } catch (e) { next(e) }
})

router.get('/account/activity', async (req, res, next) => {
  try {
    const rows = await events.listByUser(req.user.sub, 20)
    res.json({ events: rows.map((e) => localizeEvent(req.locale, e)) })
  } catch (e) { next(e) }
})

router.get('/profile', async (req, res, next) => {
  try {
    const me = users.withLabels(req.locale, await users.byId(req.user.sub))
    // The enrolled emergency contact rides along so the alerts screen can
    // prefill what this user already gave us — their own data, behind auth.
    res.json({ ...me, contact: await users.contact(req.user.sub) })
  } catch (e) { next(e) }
})
router.patch('/profile', async (req, res, next) => {
  try {
    // No `twoFactor` here on purpose: with real TOTP enrollment live, the
    // flag is owned by /auth/2fa/* — a profile save must never be able to
    // claim or unclaim a second factor no secret backs.
    const { name, lang, timezone } = req.body || {}
    const fields = {}
    if (name != null) fields.name = name
    if (lang != null) {
      // Only a supported language code is stored: background mail and
      // alerts are rendered in it.
      fields.lang = normalizeLocale(lang)
      if (!fields.lang) throw httpError(400, 'account.invalidLang')
    }
    if (timezone != null) fields.timezone = timezone
    res.json(users.withLabels(req.locale, await users.update(req.user.sub, fields)))
  } catch (e) { next(e) }
})

// ---- Account deletion -------------------------------------------------------
//
// The one-way door, priced like one. The session already proves who is asking;
// the current password proves the person holding the session is still the
// account's owner, which is the difference between "deleting my account" and
// "a stolen token burning someone's account down".

const deleteIpLimit = limiter('account-delete', {
  limit: 10, windowMs: 60 * 60 * 1000,
  keyFn: (req) => clientIp(req, { trustProxy: config.trustProxy }),
  message: 'account.limit.deleteIp',
})

router.post('/account/delete', deleteIpLimit, async (req, res, next) => {
  try {
    // The per-account counter rides on the session subject, not the address:
    // guessing the password through this endpoint is an attack on ONE account,
    // and a per-IP limit never trips when the guesses come from many machines.
    // Wrong attempts are not cleared on success — after a successful deletion
    // there is no account left to clear a penalty for.
    const acct = hit(`account-delete-acct:${req.user.sub}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!acct.allowed) {
      res.setHeader('Retry-After', String(acct.retryAfter))
      return res.status(429).json({
        message: req.t('account.limit.deleteAccount'),
        retryAfter: acct.retryAfter,
      })
    }

    const { password } = req.body || {}
    const row = await one('SELECT * FROM users WHERE id = $1', [req.user.sub])
    if (!row) return res.status(404).json({ message: req.t('common.userNotFound') })
    // Deliberately vague and identical for a missing password and a wrong one:
    // this answer never says which of the two failed.
    if (!password || !(await verifyPassword(String(password), row.pass_hash))) {
      return res.status(400).json({ message: req.t('auth.wrongPassword') })
    }

    // 1 · Credentials die first, so a failure anywhere later in this flow
    //     leaves a locked account, never a half-deleted reachable one.
    const revokedSessions = await sessions.revokeAll(req.user.sub)

    // 2 · Tombstone the sites rather than deleting the rows. The events log is
    //     site-scoped (events.site_id → sites ON DELETE CASCADE), so deleting
    //     the rows would take the audit trail with them. Emptying the secret
    //     and site key is what actually kills the connector: candidates()
    //     matches only rows with a secret, every relay path refuses a site
    //     without one, and the plugin's copy of the secret no longer matches
    //     anything on this side.
    const siteRows = await all(
      `UPDATE sites
         SET secret = '', site_key = '', paired = false, status = 'deleted', connector = NULL
        WHERE user_id = $1
       RETURNING id`,
      [req.user.sub]
    )
    const siteIds = siteRows.map((s) => s.id)

    // 3 · One audit event per site — what happened and nothing personal:
    //     no name, no email, no contact detail, just the fact and its scope.
    //     kind/severity are chosen so the alert dispatcher ignores them.
    for (const id of siteIds) {
      await events.record({
        siteId: id, kind: 'account', severity: 'info',
        ...i18nTitle('account.events.ownerDeleted', null, { kind: 'account_deleted' }),
      })
    }

    // 4 · Everything else the account could reach, and every remaining copy
    //     of its personal data: S3 credentials (encrypted but still secrets),
    //     pending invitations it issued, its assistant conversations (message
    //     text is the customer's own words), enrolled contacts, notification
    //     preferences, unused reset tokens, and the subscription record.
    if (siteIds.length) {
      await query('DELETE FROM offsite_backup_targets WHERE site_id = ANY($1)', [siteIds])
      await query(
        'UPDATE invitations SET revoked_at = $2 WHERE site_id = ANY($1) AND used_at IS NULL AND revoked_at IS NULL',
        [siteIds, Date.now()]
      )
      await query('DELETE FROM assistant_conversations WHERE site_id = ANY($1)', [siteIds])
    }
    await query('DELETE FROM team_members WHERE user_id = $1', [req.user.sub])
    await query('DELETE FROM user_contacts WHERE user_id = $1', [req.user.sub])
    await query('DELETE FROM notification_settings WHERE user_id = $1', [req.user.sub])
    // Browser push subscriptions are enrolled contact material (a capability
    // URL per browser): the account is tombstoned, not deleted, so nothing
    // cascades — they must be erased explicitly or they outlive the account.
    await query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.sub])
    await query('DELETE FROM password_resets WHERE user_id = $1', [req.user.sub])
    await query('DELETE FROM subscriptions WHERE user_id = $1', [req.user.sub])
    // The TOTP secret and recovery-code hashes are credentials: the account is
    // tombstoned rather than deleted, so nothing cascades — they must be
    // erased explicitly or they outlive the account they guarded.
    await twoFactor.purge(req.user.sub)

    // 5 · The user row goes last: identity rewritten to a tombstone the login
    //     flow cannot find and the password check cannot pass.
    await users.anonymize(req.user.sub)

    // No confirmation email is sent and none is claimed — delivery of one is
    // not configured on every deployment, and "we emailed you" about the
    // deletion of the address we just erased would be a claim without evidence.
    res.json({
      ok: true,
      sitesAffected: siteIds.length,
      revokedSessions,
      message: req.t('account.deleted'),
    })
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
