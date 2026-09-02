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

  const { hashPassword, signToken } = await import('../src/auth.js')
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
      const res = await fetch(`${base}/admin/users`, { headers: { Authorization: `Bearer ${signToken({ sub: user.id, role: 'مدیر حساب' })}` } })
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
      const res = await fetch(`${base}/admin/users`, { headers: { Authorization: `Bearer ${signToken({ sub: user.id, role: 'admin' })}` } })
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.ok(Array.isArray(body.users))
      assert.ok(body.total >= 1)
    } finally {
      server.close()
    }
  })

  test('admin stats are readable by admin', async () => {
    const user = await makeUser({ role: 'admin' })
    const app = createApp()
    const { server, base } = await listen(app)
    try {
      const res = await fetch(`${base}/admin/stats`, { headers: { Authorization: `Bearer ${signToken({ sub: user.id, role: 'admin' })}` } })
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
