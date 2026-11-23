// ============================================================
// The gateway's return trip. Public: the customer's browser arrives here from
// the bank page with no panel session.
//
// Nothing the browser sends is trusted to decide the outcome. The transid only
// finds OUR invoice; the amount verified is the invoice's own; and only the
// gateway's server-side verify can settle it. The browser is always sent on to
// the panel's billing page, which reads the invoice from the API.
// ============================================================
import express, { Router } from 'express'
import { config } from '../config.js'
import { limiter, clientIp } from '../security/ratelimit.js'
import { invoices, verifyAndSettle, maskCard } from '../payments.store.js'
import { callbackPath } from './billing.js'

const router = Router()

const panelBilling = (query) => `${config.publicPanelUrl || ''}/app/billing?${new URLSearchParams(query)}`

const callbackLimit = limiter('billing-callback', {
  limit: 60, windowMs: 60 * 1000, keyFn: (req) => clientIp(req, { trustProxy: config.trustProxy }),
  message: 'billing.limit.checkout',
})

router.all(callbackPath, express.urlencoded({ extended: false, limit: '16kb' }), callbackLimit, async (req, res) => {
  const field = (k) => {
    const v = req.body?.[k] ?? req.query?.[k]
    return typeof v === 'string' ? v.trim().slice(0, 80) : ''
  }
  const transid = field('transid')
  const inv = transid ? await invoices.byRef(transid).catch(() => null) : null
  if (!inv) return res.redirect(303, panelBilling({ payment: 'unknown' }))
  try {
    await verifyAndSettle(inv, { final: true, bankRef: field('tracking_number') || null, cardMask: maskCard(field('cardnumber')) })
  } catch (e) {
    // Unreachable gateway: the money may have moved, so the invoice stays
    // pending and the billing page offers a re-check.
    console.error(`[payments] verify on return failed for ${inv.id}: ${e.message}`)
  }
  return res.redirect(303, panelBilling({ invoice: inv.id }))
})

export default router
