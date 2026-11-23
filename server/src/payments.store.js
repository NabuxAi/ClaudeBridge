// ============================================================
// Invoices and the one place a payment turns into a subscription.
//
// settle() is the only writer of a paid invoice. It locks the invoice and the
// subscription in one transaction, so a callback and a manual re-check that
// arrive together activate the period once, and a gateway that answers
// "already verified" (code 2) cannot extend it twice.
// ============================================================
import { pool, one, all, newId } from './db.js'
import { httpError } from './store.js'
import { billing } from './billing.store.js'
import { config } from './config.js'
import * as gateway from './payments/aqayepardakht.js'

export const GATEWAY = 'aqayepardakht'
export const MONTH_CHOICES = [1, 3, 6, 12]
const DAY = 24 * 60 * 60 * 1000
const MONTH = 30 * DAY

/**
 * The price list is a contract: the public pricing page sells a year as ten
 * months ("2 months free"). 1, 3 and 6 months carry no discount.
 */
export const priceFor = (monthly, months) => (months === 12 ? monthly * 10 : monthly * months)

export const paymentsConfigured = () => !!config.payments.aqayepardakhtPin

/** The masked card, never a full number: keep the gateway's own mask, or mask it here. */
export function maskCard(raw) {
  const s = String(raw || '').replace(/[^0-9*]/g, '').slice(0, 19)
  if (!s) return null
  if (/^\d{16}$/.test(s)) return `${s.slice(0, 6)}******${s.slice(-4)}`
  return s
}

export function publicInvoice(r) {
  if (!r) return null
  return {
    id: r.id,
    plan: r.plan,
    months: Number(r.months),
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status,
    gateway: r.gateway,
    bankRef: r.bank_ref || null,
    cardMask: r.card_mask || null,
    failure: r.failure || null,
    periodStart: r.period_start ? Number(r.period_start) : null,
    periodEnd: r.period_end ? Number(r.period_end) : null,
    createdAt: Number(r.created_at),
    paidAt: r.paid_at ? Number(r.paid_at) : null,
  }
}

export const invoices = {
  /** A pending invoice priced from the plans table, never from the request. */
  async create(userId, planId, months) {
    if (!MONTH_CHOICES.includes(months)) throw httpError(400, 'billing.checkout.badMonths')
    const plan = await one('SELECT * FROM plans WHERE id = $1', [planId])
    if (!plan) throw httpError(404, 'billing.planNotFound')
    const amount = priceFor(Number(plan.price), months)
    const now = Date.now()
    return one(
      `INSERT INTO invoices (id, user_id, plan, months, amount, gateway, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [newId('inv_'), userId, planId, months, amount, GATEWAY, now]
    )
  },

  async attachRef(id, ref) {
    return one('UPDATE invoices SET gateway_ref = $2, updated_at = $3 WHERE id = $1 RETURNING *', [id, ref, Date.now()])
  },

  async byRef(ref) {
    return one('SELECT * FROM invoices WHERE gateway = $1 AND gateway_ref = $2', [GATEWAY, String(ref)])
  },

  async forUser(id, userId) {
    return one('SELECT * FROM invoices WHERE id = $1 AND user_id = $2', [id, userId])
  },

  async listForUser(userId, limit = 50) {
    return all('SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])
  },

  /** pending → failed. A paid invoice is never downgraded. */
  async fail(id, reason) {
    return one(
      `UPDATE invoices SET status = 'failed', failure = $2, updated_at = $3
        WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, String(reason).slice(0, 120), Date.now()]
    )
  },

  /**
   * Mark paid and activate the plan, once.
   *
   * A failed invoice can still become paid: "failed" may mean the customer
   * closed the bank page, and a later verify that says the money moved wins.
   * The period starts now, or at the end of an active paid period, so buying
   * early never loses days already paid for.
   */
  async settle(id, { bankRef = null, cardMask = null } = {}) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const inv = (await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id])).rows[0]
      if (!inv) throw httpError(404, 'billing.invoiceNotFound')
      if (inv.status === 'paid') { await client.query('COMMIT'); return { invoice: inv, activated: false } }

      await billing.ensure(inv.user_id)
      const sub = (await client.query('SELECT * FROM subscriptions WHERE user_id = $1 FOR UPDATE', [inv.user_id])).rows[0]
      const now = Date.now()
      const paidUntil = sub.status === 'active' && Number(sub.current_period_end) > now ? Number(sub.current_period_end) : now
      const periodEnd = paidUntil + Number(inv.months) * MONTH
      const periodStart = sub.status === 'active' && paidUntil > now ? Number(sub.current_period_start) || now : now

      await client.query(
        `UPDATE subscriptions
            SET plan = $2, status = 'active', current_period_start = $3, current_period_end = $4,
                cancel_at_period_end = false,
                metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb, updated_at = $6
          WHERE id = $1`,
        [sub.id, inv.plan, periodStart, periodEnd, JSON.stringify({ lastInvoice: inv.id }), now]
      )
      const paid = (await client.query(
        `UPDATE invoices
            SET status = 'paid', failure = NULL, bank_ref = COALESCE($2, bank_ref), card_mask = COALESCE($3, card_mask),
                period_start = $4, period_end = $5, paid_at = $6, updated_at = $6
          WHERE id = $1 RETURNING *`,
        [id, bankRef ? String(bankRef).slice(0, 64) : null, cardMask, paidUntil, periodEnd, now]
      )).rows[0]
      const plan = (await client.query('SELECT name FROM plans WHERE id = $1', [inv.plan])).rows[0]
      await client.query('UPDATE users SET plan = $2 WHERE id = $1', [inv.user_id, plan?.name || inv.plan])
      await client.query('COMMIT')
      return { invoice: paid, activated: true }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  },
}

/** Open a gateway transaction for a fresh invoice. Returns {invoice, payUrl}. */
export async function startCheckout(user, planId, months, callbackUrl) {
  if (!paymentsConfigured()) throw httpError(503, 'billing.checkout.notConfigured', null, 'payment_not_configured')
  const inv = await invoices.create(user.id, planId, months)
  try {
    const transid = await gateway.createPayment({
      pin: config.payments.aqayepardakhtPin,
      amount: Number(inv.amount),
      callback: callbackUrl,
      invoiceId: inv.id,
      email: user.email && !user.email.endsWith('@invalid') ? user.email : undefined,
      description: `DigiWP ${inv.plan} × ${inv.months}`,
    })
    const withRef = await invoices.attachRef(inv.id, transid)
    return { invoice: withRef, payUrl: gateway.startUrl(transid) }
  } catch (e) {
    await invoices.fail(inv.id, e.code ? `create_${e.code}` : 'create_unreachable')
    if (e instanceof gateway.GatewayError) {
      throw httpError(502, 'billing.checkout.gatewayFailed', { code: e.code || '—' }, 'gateway_failed')
    }
    throw e
  }
}

/**
 * Ask the gateway and settle accordingly. `final` is true on the customer's
 * return trip: a "not paid" answer then fails the invoice. A manual re-check
 * while the customer may still be on the bank page leaves it pending.
 */
export async function verifyAndSettle(inv, { final = false, bankRef = null, cardMask = null } = {}) {
  if (inv.status === 'paid') return { invoice: inv, activated: false }
  if (!inv.gateway_ref) return { invoice: inv, activated: false }
  if (!paymentsConfigured()) throw httpError(503, 'billing.checkout.notConfigured', null, 'payment_not_configured')
  const result = await gateway.verifyPayment({
    pin: config.payments.aqayepardakhtPin, amount: Number(inv.amount), transid: inv.gateway_ref,
  })
  if (result.paid) return invoices.settle(inv.id, { bankRef, cardMask })
  if (final || result.code !== '0') {
    const failed = await invoices.fail(inv.id, result.code === '0' ? 'not_paid' : `verify_${result.code}`)
    return { invoice: failed || inv, activated: false }
  }
  return { invoice: inv, activated: false }
}
