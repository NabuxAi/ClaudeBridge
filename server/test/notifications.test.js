// Notification preferences and contact enrollment endpoints.
//
// Exercises the new /notifications/preferences and /notifications/contacts
// routes against a real PostgreSQL instance, using the actual Express routers
// mounted the same way index.js mounts them.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import express from 'express'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('notifications (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_notifications'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { requireAuth } = await import('../src/auth.js')
  const { default: authRouter } = await import('../src/routes/auth.js')
  const { default: notificationsRouter } = await import('../src/routes/notifications.js')
  const { _reset: resetRateLimits } = await import('../src/security/ratelimit.js')

  const app = express()
  app.use(express.json())
  app.use('/v1', authRouter)
  app.use('/v1', requireAuth, notificationsRouter)

  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const send = async (path, opts = {}) => {
    const res = await fetch(API + path, opts)
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 200) } }
    return { status: res.status, body }
  }

  const { issue } = await import('../src/security/captcha.js')
  const solved = () => {
    const c = issue()
    const fa = '۰۱۲۳۴۵۶۷۸۹'
    const ascii = c.question.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
    const [, a, op, b] = ascii.match(/(-?\d+)\s*([+×−])\s*(-?\d+)/)
    const answer = op === '+' ? Number(a) + Number(b) : op === '−' ? Number(a) - Number(b) : Number(a) * Number(b)
    return { captchaId: c.id, captchaAnswer: answer }
  }

  async function makeUser() {
    resetRateLimits()
    const email = `notif-${crypto.randomUUID()}@test.local`
    const { status, body } = await send('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'a-strong-password-123', name: 'Notif Test', ...solved(),
      }),
    })
    assert.equal(status, 201, `registration failed: ${JSON.stringify(body)}`)
    return { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' }
  }

  test('preferences returns all known channels with defaults for a new user', async () => {
    const auth = await makeUser()
    const { status, body } = await send('/notifications/preferences', { headers: auth })
    assert.equal(status, 200)
    assert.equal(body.channels.length, 3)
    assert.ok(body.channels.some((c) => c.id === 'email' && c.enabled === false))
  })

  test('saving a preference persists enabled, destination and quiet hours', async () => {
    const auth = await makeUser()
    const { status, body } = await send('/notifications/preferences/email', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({
        enabled: true,
        destination: 'me@example.com',
        quietHoursStart: 23,
        quietHoursEnd: 7,
      }),
    })
    assert.equal(status, 200, JSON.stringify(body))
    assert.equal(body.enabled, true)
    assert.equal(body.destination, 'me@example.com')
    assert.equal(body.quietHoursStart, 23)
    assert.equal(body.quietHoursEnd, 7)

    const list = await send('/notifications/preferences', { headers: auth })
    const email = list.body.channels.find((c) => c.id === 'email')
    assert.equal(email.enabled, true)
    assert.equal(email.destination, 'me@example.com')
  })

  test('invalid quiet hours are clamped to null', async () => {
    const auth = await makeUser()
    const { status, body } = await send('/notifications/preferences/sms', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({
        enabled: true,
        destination: '09123456789',
        quietHoursStart: 99,
        quietHoursEnd: -1,
      }),
    })
    assert.equal(status, 200)
    assert.equal(body.quietHoursStart, null)
    assert.equal(body.quietHoursEnd, null)
    assert.equal(body.destination, '+989123456789')
  })

  test('unknown channel is rejected', async () => {
    const auth = await makeUser()
    const { status } = await send('/notifications/preferences/telegram', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ enabled: true }),
    })
    assert.equal(status, 400)
  })

  test('contacts can be enrolled, listed, verified and deleted', async () => {
    const auth = await makeUser()

    const created = await send('/notifications/contacts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ type: 'email', value: 'contact@example.com' }),
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.value, 'contact@example.com')
    assert.equal(created.body.verified, false)

    const listed = await send('/notifications/contacts', { headers: auth })
    assert.equal(listed.body.contacts.length, 1)

    const verified = await send(`/notifications/contacts/${created.body.id}/verify`, {
      method: 'POST',
      headers: auth,
    })
    assert.equal(verified.status, 200)
    assert.equal(verified.body.verified, true)

    const deleted = await send(`/notifications/contacts/${created.body.id}`, {
      method: 'DELETE',
      headers: auth,
    })
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body.ok, true)

    const after = await send('/notifications/contacts', { headers: auth })
    assert.equal(after.body.contacts.length, 0)
  })

  test('contacts are scoped to the owning user', async () => {
    const a = await makeUser()
    const b = await makeUser()

    const created = await send('/notifications/contacts', {
      method: 'POST',
      headers: a,
      body: JSON.stringify({ type: 'email', value: 'owner-a@example.com' }),
    })
    assert.equal(created.status, 201)

    const bList = await send('/notifications/contacts', { headers: b })
    assert.equal(bList.body.contacts.length, 0)

    const bDelete = await send(`/notifications/contacts/${created.body.id}`, {
      method: 'DELETE',
      headers: b,
    })
    assert.equal(bDelete.status, 404)
  })

  test('enrolling the same contact twice is idempotent', async () => {
    const auth = await makeUser()

    const first = await send('/notifications/contacts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ type: 'sms', value: '09123456789' }),
    })
    assert.equal(first.status, 201)

    const second = await send('/notifications/contacts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ type: 'sms', value: '09123456789' }),
    })
    assert.equal(second.status, 201)

    const listed = await send('/notifications/contacts', { headers: auth })
    assert.equal(listed.body.contacts.length, 1)
  })

  test('unauthenticated requests are rejected', async () => {
    const { status } = await send('/notifications/preferences')
    assert.equal(status, 401)
  })

  test.after(async () => {
    server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
