// Billing / subscription persistence.
//
// One subscription row per user. Reads are entitlement-aware: if a row is
// missing, a default trialing subscription is created idempotently. All
// returned shapes are plain objects with no secrets.
import { one, all, newId } from './db.js'
import { httpError } from './store.js'

const TRIAL_DAYS = 14

const publicPlan = (p) => p && ({
  id: p.id,
  name: p.name,
  price: Number(p.price),
  popular: !!p.popular,
  siteLimit: p.site_limit == null ? null : Number(p.site_limit),
  features: p.features || [],
})

// Trial state, spelled out instead of derivable: a raw status of 'trialing'
// stays 'trialing' after the window has passed, which is how an expired
// trial used to read as an active one. 'trialing' = inside the window,
// 'expired' = the window is over and nothing has replaced it (no gateway
// exists, so nothing replaces it yet), 'ended' = the subscription moved on
// (e.g. an operator-granted 'active' period via the trusted applyChange).
const trialStateOf = (s, isTrialing) =>
  isTrialing ? 'trialing' : s.status === 'trialing' ? 'expired' : 'ended'

const publicSubscription = (s, plan, siteLimit, sitesUsed) => {
  if (!s) return null
  const now = Date.now()
  const trialEndsAt = s.trial_ends_at ? Number(s.trial_ends_at) : null
  const isTrialing = s.status === 'trialing' && trialEndsAt && trialEndsAt > now
  const daysLeftInTrial = isTrialing
    ? Math.max(0, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)))
    : null
  return {
    plan: plan ? publicPlan(plan) : { id: s.plan, name: s.plan },
    status: s.status,
    isTrialing,
    trialState: trialStateOf(s, isTrialing),
    trialEndsAt,
    daysLeftInTrial,
    currentPeriodStart: s.current_period_start ? Number(s.current_period_start) : null,
    currentPeriodEnd: s.current_period_end ? Number(s.current_period_end) : null,
    cancelAtPeriodEnd: !!s.cancel_at_period_end,
    sitesUsed,
    sitesLimit: siteLimit,
    pilotRequested: !!s.metadata?.pilotRequested,
    metadata: s.metadata || {},
  }
}

export const billing = {
  /** All active plans, ordered by price. */
  async plans() {
    return (await all('SELECT * FROM plans ORDER BY price ASC')).map(publicPlan)
  },

  /** A single plan by id, or null. */
  async planById(id) {
    return publicPlan(await one('SELECT * FROM plans WHERE id = $1', [id]))
  },

  /** Number of sites this user owns. Tombstoned sites (status 'deleted') do
   *  not count: their pairing credentials are gone and they are out of the
   *  product, so holding their slot against the plan cap would charge for a
   *  site the account can no longer reach. */
  async siteCount(userId) {
    const row = await one(
      "SELECT COUNT(*)::int AS n FROM sites WHERE user_id = $1 AND status <> 'deleted'",
      [userId]
    )
    return row ? Number(row.n) : 0
  },

  /**
   * Ensure a subscription row exists for the user.
   *
   * Defaults to the plan stored on users.plan (legacy column) or 'pro',
   * status 'trialing', and a 14-day trial ending from creation. This is the
   * only place the default is materialised, so the rest of the system can
   * assume a row exists.
   */
  async ensure(userId) {
    const existing = await one('SELECT * FROM subscriptions WHERE user_id = $1', [userId])
    if (existing) return existing

    const user = await one('SELECT plan FROM users WHERE id = $1', [userId])
    const planId = planIdFromName(user?.plan) || 'pro'
    const now = Date.now()
    const trialEndsAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000
    const id = newId('sub_')

    const row = await one(
      `INSERT INTO subscriptions
         (id, user_id, plan, status, trial_ends_at, current_period_start, current_period_end, created_at, updated_at)
       VALUES ($1, $2, $3, 'trialing', $4, $5, $6, $5, $5)
       RETURNING *`,
      [id, userId, planId, trialEndsAt, now, trialEndsAt]
    )
    return row
  },

  /** Current subscription + plan + entitlement summary for the user. */
  async forUser(userId) {
    const s = await this.ensure(userId)
    const plan = await one('SELECT * FROM plans WHERE id = $1', [s.plan])
    const sitesUsed = await this.siteCount(userId)
    const siteLimit = plan?.site_limit == null ? null : Number(plan.site_limit)
    return publicSubscription(s, plan, siteLimit, sitesUsed)
  },

  /**
   * Trial status, plain and honest. Returns null if the user has no
   * subscription (should not happen because ensure() is called first).
   */
  async trialStatus(userId) {
    const s = await this.ensure(userId)
    const now = Date.now()
    const trialEndsAt = s.trial_ends_at ? Number(s.trial_ends_at) : null
    const isTrialing = s.status === 'trialing' && trialEndsAt && trialEndsAt > now
    const daysLeft = isTrialing
      ? Math.max(0, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)))
      : 0
    return {
      status: s.status,
      isTrialing,
      trialState: trialStateOf(s, isTrialing),
      trialEndsAt,
      daysLeftInTrial: daysLeft,
      cancelAtPeriodEnd: !!s.cancel_at_period_end,
    }
  },

  /**
   * Entitlement gate for adding a site — the one place plan/trial limits bite.
   *
   * Blocked states (402, because nothing is broken or forbidden — the account
   * simply has no entitlement), each with a machine-readable `code` so the hub
   * can react without parsing Persian:
   *   trial_expired       — the trial window is over and no gateway exists to
   *                         replace it. Adding is blocked; READING everything
   *                         the account already has stays open.
   *   site_limit_reached  — sites_used >= plan.site_limit. A plan with
   *                         site_limit NULL (آژانس) is unlimited by contract.
   * When allowed, returns the same honest summary the billing endpoints serve
   * so the caller can log the decision against real numbers.
   */
  async canAddSite(userId) {
    const s = await this.ensure(userId)
    const plan = await one('SELECT * FROM plans WHERE id = $1', [s.plan])
    const sitesUsed = await this.siteCount(userId)
    const siteLimit = plan?.site_limit == null ? null : Number(plan.site_limit)
    const now = Date.now()
    const trialEndsAt = s.trial_ends_at ? Number(s.trial_ends_at) : null
    const isTrialing = s.status === 'trialing' && trialEndsAt && trialEndsAt > now
    const subscription = publicSubscription(s, plan, siteLimit, sitesUsed)

    if (s.status === 'trialing' && (!trialEndsAt || trialEndsAt <= now)) {
      const e = httpError(
        402,
        'دسترسی آزمایشی شما به پایان رسیده است؛ افزودن سایت جدید تا فعال‌سازی اشتراک متوقف است. درگاه پرداخت هنوز فعال نیست — برای ادامه از صفحهٔ اشتراک درخواست دسترسی آزمایشی ثبت کنید یا با پشتیبانی تماس بگیرید.'
      )
      e.code = 'trial_expired'
      e.details = { subscription }
      throw e
    }
    if (siteLimit != null && sitesUsed >= siteLimit) {
      const e = httpError(
        402,
        `ظرفیت پلن «${plan?.name || s.plan}» (${faDigits(siteLimit)} سایت) تکمیل شده است. برای افزودن سایت بیشتر، پلن خود را ارتقا دهید. درگاه پرداخت هنوز فعال نیست — برای ارتقا با پشتیبانی تماس بگیرید.`
      )
      e.code = 'site_limit_reached'
      e.details = { subscription }
      throw e
    }
    return { isTrialing, trialExpired: false, sitesUsed, siteLimit, subscription }
  },

  /**
   * Request pilot access to a plan.
   *
   * No payment is taken; this records the request and starts/extends a trial
   * so the account is usable immediately. The plan change is also written back
   * to users.plan so legacy paths stay consistent.
   */
  async requestPilot(userId, planId) {
    const plan = await one('SELECT * FROM plans WHERE id = $1', [planId])
    if (!plan) throw httpError(404, 'پلن پیدا نشد.')

    const s = await this.ensure(userId)
    const now = Date.now()
    const trialEndsAt = Math.max(Number(s.trial_ends_at) || now, now) + TRIAL_DAYS * 24 * 60 * 60 * 1000

    const updated = await one(
      `UPDATE subscriptions
        SET plan = $3, status = 'trialing', trial_ends_at = $4,
            current_period_start = $5, current_period_end = $6,
            metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
            updated_at = $5
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      [userId, s.id, planId, trialEndsAt, now, trialEndsAt, JSON.stringify({ pilotRequested: true, requestedAt: now })]
    )

    await one('UPDATE users SET plan = $2 WHERE id = $1', [userId, plan.name])
    return this.forUser(userId)
  },

  /**
   * Apply a plan/trial change from an internal source.
   *
   * This is what the webhook placeholder uses: it does not pretend a payment
   * happened, but it does persist an explicit plan or trial change sent by a
   * trusted internal caller.
   */
  async applyChange(userId, { plan: planId, trialDays, cancelAtPeriodEnd } = {}) {
    const s = await this.ensure(userId)
    let targetPlan = s.plan
    if (planId) {
      const plan = await one('SELECT * FROM plans WHERE id = $1', [planId])
      if (!plan) throw httpError(404, 'پلن پیدا نشد.')
      targetPlan = planId
    }

    const now = Date.now()
    let trialEndsAt = s.trial_ends_at ? Number(s.trial_ends_at) : null
    let periodEnd = s.current_period_end ? Number(s.current_period_end) : null
    let status = s.status

    if (Number.isFinite(trialDays) && trialDays >= 0) {
      trialEndsAt = now + trialDays * 24 * 60 * 60 * 1000
      periodEnd = trialEndsAt
      status = trialDays > 0 ? 'trialing' : 'active'
    }

    const cancel = cancelAtPeriodEnd != null ? !!cancelAtPeriodEnd : s.cancel_at_period_end
    const updated = await one(
      `UPDATE subscriptions
        SET plan = $3,
            trial_ends_at = $4,
            current_period_end = $5,
            cancel_at_period_end = $6,
            status = $7,
            updated_at = $8
       WHERE user_id = $1 AND id = $2
       RETURNING *`,
      [userId, s.id, targetPlan, trialEndsAt, periodEnd, cancel, status, now]
    )

    const plan = await one('SELECT * FROM plans WHERE id = $1', [targetPlan])
    await one('UPDATE users SET plan = $2 WHERE id = $1', [userId, plan?.name || targetPlan])
    return this.forUser(userId)
  },
}

const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

function planIdFromName(name) {
  const map = { 'پایه': 'base', 'حرفه‌ای': 'pro', 'آژانس': 'agency' }
  return map[String(name || '').trim()] || null
}
