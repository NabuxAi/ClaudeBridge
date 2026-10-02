// Plan/trial entitlement enforcement — the site-creation gate.
//
// Covers: the plan site cap (and its honest 402), the expired-trial block
// while reads stay open, plans with no cap (site_limit NULL), and capacity
// freeing when a site is tombstoned (status 'deleted').
// The payment gateway itself stays NOT_BUILT — nothing here pretends a
// payment path exists.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import express from 'express'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('entitlement (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_entitlement'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { hashPassword, signToken } = await import('../src/auth.js')
  const { sessions } = await import('../src/sessions.store.js')
  const { billing } = await import('../src/billing.store.js')
  const { default: billingRouter } = await import('../src/routes/billing.js')
  const { default: accountRouter } = await import('../src/routes/account.js')

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

  // Mirrors the mounting order in src/index.js: billing router BEFORE the
  // account router, so GET /billing serves the real subscription, and the
  // same additive error middleware so `code`/`details` reach the client.
  function makeApp(userId) {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { sub: userId }
      next()
    })
    app.use('/v1', billingRouter)
    app.use('/v1', accountRouter)
    app.use((err, _req, res, _next) => {
      res.status(err.status || 500).json({
        message: err.message || 'server error',
        ...(err.code ? { code: err.code } : {}),
        ...(err.details != null ? { details: err.details } : {}),
      })
    })
    return app
  }

  async function listen(app) {
    const server = app.listen(0)
    await new Promise((r) => server.once('listening', r))
    return {
      base: `http://127.0.0.1:${server.address().port}/v1`,
      close: () => new Promise((r) => server.close(r)),
    }
  }

  // The billing router guards each route with requireAuth, and since the
  // sessions wave that resolves the token's jti to a live sessions row —
  // so the test mints a real login-shaped session instead of a bare token.
  async function authHeaders(userId) {
    const jti = crypto.randomBytes(16).toString('hex')
    await sessions.create({ userId, jti })
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signToken({ sub: userId, jti })}`,
    }
  }

  const addSite = (base, H, name) =>
    fetch(`${base}/sites`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ name }),
    })

  // Put the account on a named plan with a fresh 14-day trial window.
  const putOnPlan = async (userId, planId) => {
    const sub = await billing.requestPilot(userId, planId)
    assert.equal(sub.status, 'trialing')
    return sub
  }

  test('plan cap: the site beyond site_limit is refused with 402 site_limit_reached', async () => {
    const user = await makeUser()
    await putOnPlan(user.id, 'base') // site_limit = 1
    const { base, close } = await listen(makeApp(user.id))
    const H = await authHeaders(user.id)

    try {
      const first = await addSite(base, H, 'https://cap-one.example.com')
      assert.equal(first.status, 201)
      const created = await first.json()
      // The one-time pairing secret is still the contract of a successful create.
      assert.ok(created.pairing?.secret)

      const second = await addSite(base, H, 'https://cap-two.example.com')
      assert.equal(second.status, 402)
      const body = await second.json()
      assert.equal(body.code, 'site_limit_reached')
      assert.ok(body.message.includes('ظرفیت پلن'))
      assert.equal(body.details?.subscription?.sitesUsed, 1)
      assert.equal(body.details?.subscription?.sitesLimit, 1)
      // Nothing was created over the cap.
      assert.equal(await billing.siteCount(user.id), 1)
      // The billing read states the same numbers — one source of truth.
      const sub = await billing.forUser(user.id)
      assert.equal(sub.sitesUsed, 1)
      assert.equal(sub.sitesLimit, 1)
    } finally {
      await close()
    }
  })

  test('expired trial: adding is refused with 402 trial_expired while reads stay open', async () => {
    const user = await makeUser()
    await putOnPlan(user.id, 'agency') // no cap — only the trial should block
    await query('UPDATE subscriptions SET trial_ends_at = $2 WHERE user_id = $1', [user.id, Date.now() - 1000])
    const { base, close } = await listen(makeApp(user.id))
    const H = await authHeaders(user.id)

    try {
      const refused = await addSite(base, H, 'https://expired-trial.example.com')
      assert.equal(refused.status, 402)
      const body = await refused.json()
      assert.equal(body.code, 'trial_expired')
      assert.ok(body.message.includes('دسترسی آزمایشی'))
      assert.equal(body.details?.subscription?.trialState, 'expired')
      assert.equal(await billing.siteCount(user.id), 0)

      // Reads are NOT gated: the account keeps seeing what it already has.
      const list = await fetch(`${base}/sites`, { headers: { Authorization: H.Authorization } })
      assert.equal(list.status, 200)
      const billingRead = await fetch(`${base}/billing`, { headers: H })
      assert.equal(billingRead.status, 200)
      const billingBody = await billingRead.json()
      assert.equal(billingBody.subscription.trialState, 'expired')
      assert.equal(billingBody.subscription.isTrialing, false)
      // An expired trial reports no days left at all — 0 would read like
      // "ends today", null says the window is gone.
      assert.equal(billingBody.subscription.daysLeftInTrial, null)
      const trialRead = await fetch(`${base}/billing/trial`, { headers: H })
      assert.equal(trialRead.status, 200)
      assert.equal((await trialRead.json()).trialState, 'expired')
    } finally {
      await close()
    }
  })

  test('plan without cap (site_limit NULL): three sites, no refusal', async () => {
    const user = await makeUser()
    await putOnPlan(user.id, 'agency') // site_limit = NULL
    const { base, close } = await listen(makeApp(user.id))
    const H = await authHeaders(user.id)

    try {
      const names = ['https://agency-a.example.com', 'https://agency-b.example.com', 'https://agency-c.example.com']
      for (const [i, name] of names.entries()) {
        const res = await addSite(base, H, name)
        assert.equal(res.status, 201, `site ${i + 1} should pass`)
      }
      const sub = await billing.forUser(user.id)
      assert.equal(sub.sitesUsed, 3)
      assert.equal(sub.sitesLimit, null)
    } finally {
      await close()
    }
  })

  test('a deleted (tombstoned) site frees its slot against the cap', async () => {
    const user = await makeUser()
    await putOnPlan(user.id, 'base') // site_limit = 1
    const { base, close } = await listen(makeApp(user.id))
    const H = await authHeaders(user.id)

    try {
      const first = await addSite(base, H, 'https://freeslot.example.com')
      assert.equal(first.status, 201)
      const created = await first.json()
      const blocked = await addSite(base, H, 'https://freeslot-2.example.com')
      assert.equal(blocked.status, 402)

      // The tombstone is the shape account deletion leaves behind: pairing
      // credentials emptied, status 'deleted'. No row is physically deleted
      // — the cap must free on the status alone.
      await query("UPDATE sites SET status = 'deleted', secret = '', site_key = '' WHERE id = $1", [created.id])

      assert.equal(await billing.siteCount(user.id), 0)
      const freed = await addSite(base, H, 'https://freeslot-3.example.com')
      assert.equal(freed.status, 201)
      const sub = await billing.forUser(user.id)
      assert.equal(sub.sitesUsed, 1)
    } finally {
      await close()
    }
  })

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
