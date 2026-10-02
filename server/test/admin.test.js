// Admin panel and public pricing route.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('admin panel (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_admin'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { hashPassword, signToken, verifyToken } = await import('../src/auth.js')
  const { sessions: sessionsStore } = await import('../src/sessions.store.js')
  const { createApp } = await import('../src/index.js')

  async function makeUser({ email = null, role = 'مدیر حساب' } = {}) {
    const id = `u_${crypto.randomBytes(4).toString('hex')}`
    const e = email || `${id}@example.com`
    await pool.query(
      `INSERT INTO users (id, email, name, pass_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, e, 'Test User', await hashPassword('password123'), role, Date.now()]
    )
    return { id, email: e }
  }

  /**
   * Mint an admin bearer AND the session row it now needs: requireAuth
   * resolves a token's jti to a live sessions row, so a bare signed token is
   * no longer a valid credential even in a test.
   */
  async function authHeader(user, role) {
    const token = signToken({ sub: user.id, role })
    await sessionsStore.create({ userId: user.id, jti: verifyToken(token).jti, device: 'test', ip: '127.0.0.1' })
    return `Bearer ${token}`
  }

  function listen(app) {
    return new Promise((resolve) => {
      const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/v1` }))
    })
  }

  test('GET /billing/plans is public and returns plans', async () => {
    const app = createApp()
    const { server, base } = await listen(app)
    try {
      const res = await fetch(`${base}/billing/plans`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.ok(Array.isArray(body))
      assert.equal(body.length, 3)
      assert.ok(body.find((p) => p.id === 'pro'))
    } finally {
      server.close()
    }
  })

  test('admin endpoints require admin role', async () => {
    const user = await makeUser({ role: 'مدیر حساب' })
    const app = createApp()
    const { server, base } = await listen(app)
    try {
      const res = await fetch(`${base}/admin/users`, { headers: { Authorization: await authHeader(user, 'مدیر حساب') } })
      assert.equal(res.status, 403)
    } finally {
      server.close()
    }
  })

  test('admin endpoints accept admin role', async () => {
    const user = await makeUser({ role: 'admin' })
    const app = createApp()
    const { server, base } = await listen(app)
    try {
      const res = await fetch(`${base}/admin/users`, { headers: { Authorization: await authHeader(user, 'admin') } })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.ok(Array.isArray(body.users))
      assert.ok(body.total >= 1)
    } finally {
      server.close()
    }
  })

  test('admin user responses expose no pass_hash and carry created_at/site_count', async () => {
    const user = await makeUser({ role: 'admin' })
    const app = createApp()
    const { server, base } = await listen(app)
    try {
      const headers = { Authorization: await authHeader(user, 'admin') }
      const list = await fetch(`${base}/admin/users`, { headers })
      assert.equal(list.status, 200)
      const listBody = await list.json()
      assert.ok(listBody.users.length >= 1)
      for (const u of listBody.users) {
        assert.ok(!('pass_hash' in u), 'pass_hash must never reach the browser')
        assert.equal(typeof u.created_at, 'number')
        assert.equal(typeof u.site_count, 'number')
      }
      const detail = await fetch(`${base}/admin/users/${user.id}`, { headers })
      assert.equal(detail.status, 200)
      const detailBody = await detail.json()
      assert.ok(!('pass_hash' in detailBody.user), 'pass_hash must never reach the browser')
      assert.equal(typeof detailBody.user.created_at, 'number')
    } finally {
      server.close()
    }
  })

  test('admin stats are readable by admin', async () => {
    const user = await makeUser({ role: 'admin' })
    const app = createApp()
    const { server, base } = await listen(app)
    try {
      const res = await fetch(`${base}/admin/stats`, { headers: { Authorization: await authHeader(user, 'admin') } })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.equal(typeof body.users, 'number')
      assert.equal(typeof body.sites, 'number')
    } finally {
      server.close()
    }
  })

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
