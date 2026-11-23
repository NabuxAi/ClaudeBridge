// Online payment through Aqayepardakht, end to end over real HTTP with real
// PostgreSQL. The gateway itself is a fake injected through the client's
// fetch seam: no test talks to the real gateway or moves money.
//
// What is pinned: the price comes from the plans table (never the request);
// only the gateway's server-side verify settles an invoice; a paid invoice
// activates exactly one period however many times it is confirmed; a renewal
// starts where the paid period ends; a refused or abandoned payment activates
// nothing; another account cannot see or re-check an invoice; an expired paid
// period blocks adding sites like an expired trial; manual activation is
// admin-only.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('payments (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_payments'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.AQAYEPARDAKHT_PIN = 'test-pin'
  process.env.PUBLIC_PANEL_URL = 'https://panel.example'
  process.env.PUBLIC_BASE_URL = 'https://api.example/v1'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { createApp } = await import('../src/index.js')
  const { config } = await import('../src/config.js')
  const { signToken, verifyToken } = await import('../src/auth.js')
  const { users } = await import('../src/store.js')
  const { sessions } = await import('../src/sessions.store.js')
  const { _setFetchForTests } = await import('../src/payments/aqayepardakht.js')
  const { _reset: resetRateLimit } = await import('../src/security/ratelimit.js')

  const app = createApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`
  test.beforeEach(() => resetRateLimit())

  // ---- the fake gateway ----------------------------------------------------
  // Remembers what was created; `paid` decides what verify answers.
  const gw = { created: [], verified: [], paid: new Set(), verifiedOnce: new Set(), createFails: false, down: false }
  _setFetchForTests(async (url, init) => {
    if (gw.down) throw new Error('connect ETIMEDOUT')
    const body = JSON.parse(init.body)
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.endsWith('/api/v2/create')) {
      if (gw.createFails) return json({ status: 'error', code: '-6' })
      const transid = `T${crypto.randomBytes(4).toString('hex')}`
      gw.created.push({ ...body, transid })
      return json({ status: 'success', transid })
    }
    if (url.endsWith('/api/v2/verify')) {
      gw.verified.push(body)
      const made = gw.created.find((c) => c.transid === body.transid)
      if (!made) return json({ status: 'error', code: '-8' })
      if (Number(made.amount) !== Number(body.amount)) return json({ status: 'error', code: '-10' })
      if (!gw.paid.has(body.transid)) return json({ status: 'error', code: '0' })
      const code = gw.verifiedOnce.has(body.transid) ? '2' : '1'
      gw.verifiedOnce.add(body.transid)
      return json({ status: 'success', code })
    }
    return new Response('not found', { status: 404 })
  })

  async function account({ admin = false } = {}) {
    const user = await users.create({ email: `pay-${crypto.randomUUID()}@test.local`, name: 'Pay Test', password: 'a-strong-password-123' })
    const token = signToken({ sub: user.id, name: user.name, ...(admin ? { role: 'admin' } : {}) })
    await sessions.create({ userId: user.id, jti: verifyToken(token).jti, device: 'test', ip: '127.0.0.1' })
    return { user, authorization: `Bearer ${token}` }
  }

  async function call(method, path, body, auth) {
    const res = await fetch(API + path, {
      method,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth.authorization } : {}) },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, location: res.headers.get('location'), body: await res.json().catch(() => ({})) }
  }

  /** The customer's browser coming back from the bank page (form POST). */
  async function returnTrip(fields) {
    const res = await fetch(`${API}/billing/aqayepardakht/callback`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })
    return { status: res.status, location: res.headers.get('location') }
  }

  const DAY = 24 * 60 * 60 * 1000
  const subOf = async (userId) => (await query('SELECT * FROM subscriptions WHERE user_id = $1', [userId])).rows[0]

  test('checkout prices the invoice from the plans table and hands back the gateway page', async () => {
    const a = await account()
    const res = await call('POST', '/billing/checkout', { plan: 'pro', months: 3, amount: 1500 }, a)
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.invoice.amount, 490000 * 3, 'price × months from the plans table; a request amount is ignored')
    assert.equal(res.body.invoice.status, 'pending')
    const made = gw.created.at(-1)
    assert.equal(made.amount, 1470000)
    assert.equal(made.pin, 'test-pin')
    assert.equal(made.invoice_id, res.body.invoice.id)
    assert.equal(made.callback, 'https://api.example/v1/billing/aqayepardakht/callback')
    assert.equal(res.body.payUrl, `https://panel.aqayepardakht.ir/startpay/${made.transid}`)

    const year = await call('POST', '/billing/checkout', { plan: 'pro', months: 12 }, a)
    assert.equal(year.body.invoice.amount, 490000 * 10, 'a year is priced as ten months, as the pricing page promises')
    assert.equal((await call('GET', '/billing/availability')).body.payment.configured, true, 'public availability for the price page')

    assert.equal((await call('POST', '/billing/checkout', { plan: 'pro', months: 2 }, a)).status, 400, 'only 1/3/6/12 months')
    assert.equal((await call('POST', '/billing/checkout', { plan: 'nope', months: 1 }, a)).status, 404)
  })

  test('a paid return trip settles once and activates the plan for the months bought', async () => {
    const a = await account()
    const start = await call('POST', '/billing/checkout', { plan: 'base', months: 1 }, a)
    const { transid } = gw.created.at(-1)
    gw.paid.add(transid)

    const back = await returnTrip({ transid, tracking_number: '123456789', cardnumber: '6037991234567890', status: '1', invoice_id: start.body.invoice.id })
    assert.equal(back.status, 303)
    assert.equal(back.location, `https://panel.example/app/billing?invoice=${start.body.invoice.id}`)

    const inv = (await call('GET', `/billing/invoices/${start.body.invoice.id}`, null, a)).body
    assert.equal(inv.status, 'paid')
    assert.equal(inv.bankRef, '123456789')
    assert.equal(inv.cardMask, '603799******7890', 'a full card number is never stored')
    const sub = await subOf(a.user.id)
    assert.equal(sub.status, 'active')
    assert.equal(sub.plan, 'base')
    assert.ok(Math.abs(Number(sub.current_period_end) - (Date.now() + 30 * DAY)) < 60000)

    // The browser comes back twice, and the user presses re-check: still one period.
    const endBefore = Number(sub.current_period_end)
    await returnTrip({ transid, status: '1' })
    await call('POST', `/billing/invoices/${start.body.invoice.id}/recheck`, null, a)
    assert.equal(Number((await subOf(a.user.id)).current_period_end), endBefore)

    const overview = (await call('GET', '/billing', null, a)).body
    assert.equal(overview.payment.configured, true)
    assert.equal(overview.subscription.isPaid, true)
    assert.equal(overview.invoices.list[0].status, 'paid')
  })

  test('only the gateway decides: a forged "status=1" for an unpaid transaction activates nothing', async () => {
    const a = await account()
    const start = await call('POST', '/billing/checkout', { plan: 'agency', months: 12 }, a)
    const { transid } = gw.created.at(-1)
    const back = await returnTrip({ transid, status: '1', tracking_number: 'forged' })
    assert.equal(back.status, 303)
    const inv = (await call('GET', `/billing/invoices/${start.body.invoice.id}`, null, a)).body
    assert.equal(inv.status, 'failed')
    assert.equal(inv.failure, 'not_paid')
    assert.notEqual((await subOf(a.user.id))?.status, 'active')
  })

  test('a payment that lands after the invoice was marked failed still activates on re-check', async () => {
    const a = await account()
    const start = await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
    const { transid } = gw.created.at(-1)
    await returnTrip({ transid, status: '0' })
    assert.equal((await call('GET', `/billing/invoices/${start.body.invoice.id}`, null, a)).body.status, 'failed')
    gw.paid.add(transid)
    const re = await call('POST', `/billing/invoices/${start.body.invoice.id}/recheck`, null, a)
    assert.equal(re.body.status, 'paid')
    assert.equal((await subOf(a.user.id)).status, 'active')
  })

  test('a re-check while the customer is still paying leaves the invoice pending', async () => {
    const a = await account()
    const start = await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
    const re = await call('POST', `/billing/invoices/${start.body.invoice.id}/recheck`, null, a)
    assert.equal(re.body.status, 'pending')
  })

  test('an unreachable gateway on the return trip keeps the invoice pending, never failed', async () => {
    const a = await account()
    const start = await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
    const { transid } = gw.created.at(-1)
    gw.paid.add(transid)
    gw.down = true
    try {
      const back = await returnTrip({ transid, status: '1' })
      assert.equal(back.status, 303)
      assert.equal((await call('GET', `/billing/invoices/${start.body.invoice.id}`, null, a)).body.status, 'pending')
      const re = await call('POST', `/billing/invoices/${start.body.invoice.id}/recheck`, null, a)
      assert.equal(re.status, 502)
    } finally { gw.down = false }
    assert.equal((await call('POST', `/billing/invoices/${start.body.invoice.id}/recheck`, null, a)).body.status, 'paid')
  })

  test('renewing early starts the new period where the paid one ends', async () => {
    const a = await account()
    for (let i = 0; i < 2; i++) {
      await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
      const { transid } = gw.created.at(-1)
      gw.paid.add(transid)
      await returnTrip({ transid, status: '1' })
    }
    const sub = await subOf(a.user.id)
    assert.ok(Math.abs(Number(sub.current_period_end) - (Date.now() + 60 * DAY)) < 60000, 'two months, not one')
  })

  test('another account can neither read nor re-check an invoice; an unknown transid changes nothing', async () => {
    const a = await account()
    const b = await account()
    const start = await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
    assert.equal((await call('GET', `/billing/invoices/${start.body.invoice.id}`, null, b)).status, 404)
    assert.equal((await call('POST', `/billing/invoices/${start.body.invoice.id}/recheck`, null, b)).status, 404)
    const back = await returnTrip({ transid: 'does-not-exist', status: '1' })
    assert.equal(back.location, 'https://panel.example/app/billing?payment=unknown')
  })

  test('a gateway that refuses to open the payment fails the invoice and charges nothing', async () => {
    const a = await account()
    gw.createFails = true
    try {
      const res = await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
      assert.equal(res.status, 502)
      assert.equal(res.body.code, 'gateway_failed')
    } finally { gw.createFails = false }
    const list = (await call('GET', '/billing/invoices', null, a)).body
    assert.equal(list[0].status, 'failed')
    assert.equal(list[0].failure, 'create_-6')
  })

  test('without a PIN the server says payment is not configured and opens nothing', async () => {
    const a = await account()
    const pin = config.payments.aqayepardakhtPin
    config.payments.aqayepardakhtPin = ''
    try {
      const res = await call('POST', '/billing/checkout', { plan: 'pro', months: 1 }, a)
      assert.equal(res.status, 503)
      assert.equal(res.body.code, 'payment_not_configured')
      assert.equal((await call('GET', '/billing', null, a)).body.payment.configured, false)
    } finally { config.payments.aqayepardakhtPin = pin }
  })

  test('an expired paid period blocks adding sites, like an expired trial', async () => {
    const a = await account()
    await call('GET', '/billing', null, a)
    await query("UPDATE subscriptions SET status = 'active', current_period_end = $2 WHERE user_id = $1", [a.user.id, Date.now() - DAY])
    const res = await call('POST', '/sites', { name: `pay-${Date.now()}.ir` }, a)
    assert.equal(res.status, 402)
    assert.equal(res.body.code, 'subscription_expired')
    assert.equal((await call('GET', '/billing', null, a)).body.subscription.paidExpired, true)
  })

  test('manual activation is admin-only', async () => {
    const a = await account()
    const admin = await account({ admin: true })
    assert.equal((await call('POST', `/admin/users/${a.user.id}/subscription`, { plan: 'agency', days: 30 }, a)).status, 403)
    const ok = await call('POST', `/admin/users/${a.user.id}/subscription`, { plan: 'agency', days: 30 }, admin)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.plan.id, 'agency')
    assert.equal(ok.body.isPaid, true)
    assert.equal((await call('POST', `/admin/users/${a.user.id}/subscription`, { plan: 'agency', days: 0 }, admin)).status, 400)
  })

  test.after(async () => {
    _setFetchForTests()
    server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
