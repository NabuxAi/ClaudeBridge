import { Router } from 'express'
import { i18nMiddleware } from '../i18n.js'
import { requireAuth } from '../auth.js'
import { billing } from '../billing.store.js'
import { limiter, clientIp } from '../security/ratelimit.js'
import { config, publicApiBase } from '../config.js'
import { users } from '../store.js'
import {
  invoices, publicInvoice, paymentsConfigured, startCheckout, verifyAndSettle, MONTH_CHOICES, GATEWAY,
} from '../payments.store.js'
import { GatewayError } from '../payments/aqayepardakht.js'

const router = Router()
// Idempotent with the app-level middleware; keeps req.t/req.locale present
// when a router is mounted on its own (tests build bare apps).
router.use(i18nMiddleware)

const ip = (req) => clientIp(req, { trustProxy: config.trustProxy })

const NOT_BUILT = (what) => ({
  provenance: { live: [], unavailable: what },
})

/** Where the gateway sends the customer back. Public, outside requireAuth. */
export const callbackPath = '/billing/aqayepardakht/callback'

/**
 * Current subscription, payment availability and the account's invoices.
 * Payment is either live (a gateway PIN is configured on this server) or
 * honestly unavailable; nothing in between is shown as working.
 */
router.get('/billing', requireAuth, async (req, res, next) => {
  try {
    const subscription = await billing.forUser(req.user.sub, req.locale)
    const list = (await invoices.listForUser(req.user.sub)).map(publicInvoice)
    res.json({
      subscription,
      provenance: { live: ['subscriptions', 'invoices'], unavailable: null },
      payment: paymentsConfigured()
        ? { configured: true, gateway: GATEWAY, months: MONTH_CHOICES, provenance: { live: ['gateway'], unavailable: null } }
        : { configured: false, gateway: null, months: MONTH_CHOICES, ...NOT_BUILT(req.t('billing.noGateway')) },
      invoices: { provenance: { live: ['invoices'], unavailable: null }, list },
    })
  } catch (e) { next(e) }
})

router.get('/billing/invoices', requireAuth, async (req, res, next) => {
  try {
    res.json((await invoices.listForUser(req.user.sub)).map(publicInvoice))
  } catch (e) { next(e) }
})

router.get('/billing/invoices/:id', requireAuth, async (req, res, next) => {
  try {
    const inv = await invoices.forUser(req.params.id, req.user.sub)
    if (!inv) return res.status(404).json({ message: req.t('billing.invoiceNotFound') })
    res.json(publicInvoice(inv))
  } catch (e) { next(e) }
})

const checkoutLimit = limiter('billing-checkout', {
  limit: 20, windowMs: 60 * 60 * 1000, keyFn: (req) => req.user?.sub || ip(req),
  message: 'billing.limit.checkout',
})

/**
 * Start a payment: a pending invoice priced from the plans table (the request
 * names a plan and a month count, never an amount), a gateway transaction,
 * and the URL the browser opens to pay.
 */
router.post('/billing/checkout', requireAuth, checkoutLimit, async (req, res, next) => {
  try {
    const planId = String(req.body?.plan || '').trim()
    const months = Number(req.body?.months || 1)
    if (!planId) return res.status(400).json({ message: req.t('billing.planIdRequired') })
    const user = await users.byId(req.user.sub)
    const callback = `${publicApiBase(req)}${callbackPath}`
    const { invoice, payUrl } = await startCheckout(user, planId, months, callback)
    res.status(201).json({ invoice: publicInvoice(invoice), payUrl })
  } catch (e) { next(e) }
})

/** Ask the gateway again about a pending invoice (a lost return trip). */
router.post('/billing/invoices/:id/recheck', requireAuth, checkoutLimit, async (req, res, next) => {
  try {
    const inv = await invoices.forUser(req.params.id, req.user.sub)
    if (!inv) return res.status(404).json({ message: req.t('billing.invoiceNotFound') })
    try {
      const { invoice } = await verifyAndSettle(inv)
      res.json(publicInvoice(invoice))
    } catch (e) {
      if (e instanceof GatewayError) return res.status(502).json({ message: req.t('billing.gatewayUnreachable'), invoice: publicInvoice(inv) })
      throw e
    }
  } catch (e) { next(e) }
})

/** All available plans. Public within an authenticated session. */
router.get('/billing/plans', requireAuth, async (req, res, next) => {
  try {
    res.json(await billing.plans(req.locale))
  } catch (e) { next(e) }
})

/** Trial status for the signed-in user. */
router.get('/billing/trial', requireAuth, async (req, res, next) => {
  try {
    res.json(await billing.trialStatus(req.user.sub))
  } catch (e) { next(e) }
})

/**
 * Request pilot access to a plan: no payment, a 14-day trial, once per account
 * and never over a paid plan (billing.requestPilot refuses both with 409).
 */
const pilotLimit = limiter('request-pilot', {
  limit: 10, windowMs: 60 * 60 * 1000, keyFn: ip,
  message: 'billing.limit.pilot',
})

router.post('/billing/request-pilot', requireAuth, pilotLimit, async (req, res, next) => {
  try {
    const planId = String(req.body?.plan || '').trim()
    if (!planId) return res.status(400).json({ message: req.t('billing.planIdRequired') })
    const subscription = await billing.requestPilot(req.user.sub, planId, req.locale)
    res.json({ ok: true, subscription })
  } catch (e) { next(e) }
})

export default router
