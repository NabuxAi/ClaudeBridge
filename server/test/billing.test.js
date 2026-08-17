// Billing / subscription / entitlement skeleton.
//
// Covers: schema bootstrap, default subscription materialisation, plan
// listing, current subscription read, trial status, pilot request, and the
// webhook placeholder that honestly says payment is NOT_BUILT while still
// persisting plan/trial changes.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import express from 'express'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('billing (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_billing'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { hashPassword, signToken } = await import('../src/auth.js')
  const { billing } = await import('../src/billing.store.js')
  const { users } = await import('../src/store.js')
  const { default: billingRouter } = await import('../src/routes/billing.js')

  async function makeUser(email = null) {
    const id = `u_${crypto.randomBytes(4).toString('hex')}`
    const e = email || `${id}@example.com`
    await pool.query(
      `INSERT INTO users (id, email, name, pass_hash, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, e, 'Test User', await hashPassword('password123'), Date.now()]
    )
    return { id, email: e }
  }

  function makeApp(userId) {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { sub: userId }
      next()
    })
    app.use('/v1', billingRouter)
    return app
  }

  test('plans are seeded on schema init', async () => {
    const plans = await billing.plans()
    assert.equal(plans.length, 3)
    assert.ok(plans.find((p) => p.id === 'pro'))
    assert.ok(plans.find((p) => p.id === 'base'))
    assert.ok(plans.find((p) => p.id === 'agency'))
  })

  test('forUser creates a default trialing subscription if missing', async () => {
    const user = await makeUser()
    const sub = await billing.forUser(user.id)

    assert.ok(sub)
    assert.equal(sub.plan.id, 'pro')
    assert.equal(sub.status, 'trialing')
    assert.equal(sub.isTrialing, true)
    assert.ok(sub.trialEndsAt > Date.now())
    assert.ok(sub.daysLeftInTrial > 0)
    assert.equal(sub.sitesUsed, 0)
    assert.equal(sub.sitesLimit, 5)

    const row = await query('SELECT * FROM subscriptions WHERE user_id = $1', [user.id])
    assert.equal(row.rowCount, 1)
    assert.equal(row.rows[0].plan, 'pro')
  })

  test('trialStatus returns honest trial window', async () => {
    const user = await makeUser()
    const status = await billing.trialStatus(user.id)
    assert.equal(status.status, 'trialing')
    assert.equal(status.isTrialing, true)
    assert.ok(status.daysLeftInTrial > 0)
  })

  test('requestPilot changes plan and records the request', async () => {
    const user = await makeUser()
    const sub = await billing.requestPilot(user.id, 'agency')

    assert.equal(sub.plan.id, 'agency')
    assert.equal(sub.status, 'trialing')
    assert.equal(sub.pilotRequested, true)
    assert.equal(sub.sitesLimit, null)

    const userRow = await query('SELECT plan FROM users WHERE id = $1', [user.id])
    assert.equal(userRow.rows[0].plan, 'آژانس')
  })

  test('applyChange via webhook persists plan and trial changes', async () => {
    const user = await makeUser()
    const before = await billing.forUser(user.id)
    const sub = await billing.applyChange(user.id, { plan: 'base', trialDays: 3 })

    assert.equal(sub.plan.id, 'base')
    assert.equal(sub.status, 'trialing')
    assert.equal(sub.daysLeftInTrial, 3)
  })

  test('GET /billing returns subscription and honest NOT_BUILT for payment', async () => {
    const user = await makeUser()
    const app = makeApp(user.id)
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${server.address().port}/v1`

    try {
      const res = await fetch(`${base}/billing`, { headers: { Authorization: `Bearer ${signToken({ sub: user.id })}` } })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.subscription.plan.id, 'pro')
      assert.equal(body.subscription.status, 'trialing')
      assert.ok(body.provenance.live.includes('subscriptions'))
      assert.equal(body.payment.provenance.unavailable.length > 0, true)
      assert.equal(body.invoices.list.length, 0)
    } finally {
      server.close()
    }
  })

  test('GET /billing/trial returns trial status', async () => {
    const user = await makeUser()
    const app = makeApp(user.id)
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${server.address().port}/v1`

    try {
      const res = await fetch(`${base}/billing/trial`, { headers: { Authorization: `Bearer ${signToken({ sub: user.id })}` } })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.status, 'trialing')
      assert.equal(body.isTrialing, true)
      assert.ok(body.daysLeftInTrial > 0)
    } finally {
      server.close()
    }
  })

  test('POST /billing/request-pilot updates subscription', async () => {
    const user = await makeUser()
    const app = makeApp(user.id)
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${server.address().port}/v1`

    try {
      const res = await fetch(`${base}/billing/request-pilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken({ sub: user.id })}` },
        body: JSON.stringify({ plan: 'agency' }),
      })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.ok, true)
      assert.equal(body.subscription.plan.id, 'agency')
      assert.equal(body.subscription.pilotRequested, true)
    } finally {
      server.close()
    }
  })

  test('POST /billing/webhook is honest NOT_BUILT but persists changes', async () => {
    const user = await makeUser()
    const app = makeApp(user.id)
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${server.address().port}/v1`

    try {
      const res = await fetch(`${base}/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken({ sub: user.id })}` },
        body: JSON.stringify({ userId: user.id, plan: 'base', trialDays: 7 }),
      })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(body.ok, true)
      assert.equal(body.payment, 'NOT_BUILT')
      assert.equal(body.persisted.plan.id, 'base')
      assert.equal(body.persisted.daysLeftInTrial, 7)
    } finally {
      server.close()
    }
  })

  test('billing endpoints require authentication', async () => {
    const app = express()
    app.use(express.json())
    app.use('/v1', billingRouter)
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${server.address().port}/v1`

    try {
      const res = await fetch(`${base}/billing`)
      assert.equal(res.status, 401)
    } finally {
      server.close()
    }
  })

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
