import { test, expect } from '@playwright/test'

const user = { id: 'u1', name: 'Ali', initials: 'A', email: 'owner@example.com', role: 'owner', lang: 'en' }
const plans = [
  { id: 'base', name: 'Basic', price: 190000, popular: false, siteLimit: 1, features: [] },
  { id: 'pro', name: 'Pro', price: 490000, popular: true, siteLimit: 5, features: [] },
  { id: 'agency', name: 'Agency', price: 990000, popular: false, siteLimit: null, features: [] },
]
const subscription = (over = {}) => ({
  plan: plans[1], status: 'trialing', isTrialing: true, trialState: 'trialing', daysLeftInTrial: 9,
  trialEndsAt: Date.now() + 9 * 864e5, isPaid: false, paidExpired: false, sitesUsed: 1, sitesLimit: 5, pilotRequested: true, ...over,
})
const paidInvoice = { id: 'inv_1', plan: 'pro', months: 1, amount: 490000, status: 'paid', createdAt: Date.now(), paidAt: Date.now(), periodStart: Date.now(), periodEnd: Date.now() + 30 * 864e5, bankRef: '123456', cardMask: '603799******7890' }

async function setup(page, { configured = true, sub = subscription(), invoices = [], invoice = null, recheck = null } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('digiwp.token', 'billing-test-session')
    localStorage.setItem('digiwp.lang', 'en')
  })
  const calls = []
  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    calls.push({ method: req.method(), path, body: req.postDataJSON?.() ?? null })
    if (path === '/api/auth/me' || path === '/api/profile') return route.fulfill({ json: user })
    if (path === '/api/sites') return route.fulfill({ json: [] })
    if (path === '/api/billing/plans') return route.fulfill({ json: plans })
    if (path === '/api/billing') {
      return route.fulfill({ json: { subscription: sub, provenance: { live: ['subscriptions'] }, payment: { configured, months: [1, 3, 6, 12], provenance: { unavailable: configured ? null : 'No gateway.' } }, invoices: { provenance: { live: ['invoices'] }, list: invoices } } })
    }
    if (path === '/api/billing/checkout') return route.fulfill({ status: 201, json: { invoice: { id: 'inv_new', status: 'pending' }, payUrl: 'https://panel.aqayepardakht.ir/startpay/T123' } })
    if (path.startsWith('/api/billing/invoices/') && path.endsWith('/recheck')) return route.fulfill({ json: recheck || invoice })
    if (path.startsWith('/api/billing/invoices/')) return route.fulfill({ json: invoice })
    return route.fulfill({ json: {} })
  })
  return calls
}

test('checkout sends the chosen plan and period, then leaves for the gateway page', async ({ page }) => {
  const calls = await setup(page)
  await page.route('https://panel.aqayepardakht.ir/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>gateway</h1>' }))
  await page.goto('/checkout?plan=pro')
  await page.getByText('12 months').click()
  await expect(page.getByText('4,900,000')).toBeVisible()
  await page.getByRole('button', { name: 'Pay with Aqayepardakht' }).click()
  await page.waitForURL('https://panel.aqayepardakht.ir/startpay/T123')
  const checkout = calls.find((c) => c.path === '/api/billing/checkout')
  expect(checkout.body).toEqual({ plan: 'pro', months: 12 })
})

test('without a configured gateway the checkout offers nothing to pay', async ({ page }) => {
  await setup(page, { configured: false })
  await page.goto('/checkout?plan=base')
  await expect(page.getByText('Online payment is not active on this server yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pay with Aqayepardakht' })).toHaveCount(0)
})

test('returning from the bank shows the paid result and the invoice row', async ({ page }) => {
  const until = Date.now() + 30 * 864e5
  await setup(page, {
    sub: subscription({ status: 'active', isTrialing: false, trialState: 'ended', isPaid: true, daysLeftInPeriod: 30, currentPeriodEnd: until }),
    invoices: [paidInvoice],
    invoice: paidInvoice,
  })
  await page.goto('/app/billing?invoice=inv_1')
  await expect(page.getByText(/Payment received\. Your plan is active until/)).toBeVisible()
  await expect(page.getByText(/Active until/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'View', exact: true })).toHaveAttribute('href', '/invoice/inv_1')
})

test('a pending payment can be checked again and turns paid', async ({ page }) => {
  const pending = { ...paidInvoice, status: 'pending', paidAt: null, periodEnd: null }
  const calls = await setup(page, { invoice: pending, recheck: paidInvoice })
  await page.goto('/app/billing?invoice=inv_1')
  await expect(page.getByText(/not received the bank/)).toBeVisible()
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText(/Payment received/)).toBeVisible()
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/billing/invoices/inv_1/recheck')).toBe(true)
})
