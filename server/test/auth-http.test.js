// The login endpoint, exercised over real HTTP.
//
// The unit tests cover the pieces; this covers the wiring, which is where
// security features usually fail — a captcha that is never actually demanded,
// a limiter mounted after the handler, a 429 that still leaks whether the
// account exists. Nothing is mocked except the user lookup, because the point
// is to test the route as it is mounted.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { hashPassword } from '../src/auth.js'
import { _reset } from '../src/security/ratelimit.js'
import { issue } from '../src/security/captcha.js'
import { config } from '../src/config.js'

// The route module imports `users` from the store, which imports pg. Rather
// than reach for a mocking framework, the suite drives the same logic through
// a tiny app that mounts the real router with a stubbed store — see below.
const { default: authRouter } = await import('../src/routes/auth.js')
const store = await import('../src/store.js')

const PASSWORD = 'a-real-password-123'
let PASS_HASH

const realByEmailRaw = store.users.byEmailRaw
const realById = store.users.byId
const realCreate = store.users.create

function stubStore() {
  store.users.byEmailRaw = async (email) =>
    String(email).toLowerCase() === 'someone@example.com'
      ? { id: 'u_1', pass_hash: PASS_HASH }
      : null
  store.users.byId = async (id) => ({ id, name: 'کاربر', email: 'someone@example.com' })
  store.users.create = async ({ email }) => ({ id: 'u_new', name: 'تازه', email })
}

function restoreStore() {
  store.users.byEmailRaw = realByEmailRaw
  store.users.byId = realById
  store.users.create = realCreate
}

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/v1', authRouter)
  return app
}

let server
let base

test.before(async () => {
  PASS_HASH = await hashPassword(PASSWORD)
  stubStore()
  server = makeApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/v1`
})

test.after(() => {
  restoreStore()
  server?.close()
})

const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

/** Solve a challenge the way the browser does. */
function solved() {
  const c = issue()
  const fa = '۰۱۲۳۴۵۶۷۸۹'
  const ascii = c.question.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
  const [, a, op, b] = ascii.match(/(-?\d+)\s*([+×−])\s*(-?\d+)/)
  const answer = op === '+' ? Number(a) + Number(b) : op === '−' ? Number(a) - Number(b) : Number(a) * Number(b)
  return { captchaId: c.id, captchaAnswer: answer }
}

test('a correct password logs in and returns a token', async () => {
  _reset()
  const res = await post('/auth/login', { email: 'someone@example.com', password: PASSWORD })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(body.token)
  assert.equal(body.user.id, 'u_1')
})

test('a wrong password is refused, and says nothing about the account', async () => {
  _reset()
  const res = await post('/auth/login', { email: 'someone@example.com', password: 'nope' })
  assert.equal(res.status, 401)
  const body = await res.json()
  // The same sentence for both cases, deliberately.
  assert.equal(body.message, 'ایمیل یا رمز عبور نادرست است.')
})

test('a nonexistent account gives the identical response to a wrong password', async () => {
  _reset()
  const a = await post('/auth/login', { email: 'someone@example.com', password: 'nope' })
  _reset()
  const b = await post('/auth/login', { email: 'nobody@example.com', password: 'nope' })
  assert.equal(a.status, b.status)
  assert.deepEqual(await a.json(), await b.json(),
    'a different response for a missing account enumerates the customer list')
})

test('a captcha is demanded once an address has failed enough times', async () => {
  _reset()
  const n = config.security.captchaAfterFailures
  for (let i = 0; i < n; i++) {
    await post('/auth/login', { email: 'someone@example.com', password: 'nope' })
  }

  // Now even the *correct* password is refused without a solved challenge.
  const res = await post('/auth/login', { email: 'someone@example.com', password: PASSWORD })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.captchaRequired, true)
})

test('a solved captcha lets the correct password through again', async () => {
  _reset()
  for (let i = 0; i < config.security.captchaAfterFailures; i++) {
    await post('/auth/login', { email: 'someone@example.com', password: 'nope' })
  }
  const res = await post('/auth/login', {
    email: 'someone@example.com', password: PASSWORD, ...solved(),
  })
  assert.equal(res.status, 200)
})

test('a successful login clears the penalty', async () => {
  _reset()
  for (let i = 0; i < config.security.captchaAfterFailures; i++) {
    await post('/auth/login', { email: 'someone@example.com', password: 'nope' })
  }
  await post('/auth/login', { email: 'someone@example.com', password: PASSWORD, ...solved() })

  // No captcha needed on the next attempt: two typos should not follow someone
  // around all afternoon.
  const state = await (await fetch(`${base}/auth/challenge-state`)).json()
  assert.equal(state.captchaRequired, false)
})

test('the per-account limit stops a distributed attack on one address', async () => {
  _reset()
  // Every request claims a different source address, so the per-IP limit never
  // trips — this is the case the per-account limit exists for.
  let last
  for (let i = 0; i < 12; i++) {
    last = await post(
      '/auth/login',
      { email: 'someone@example.com', password: 'nope', ...solved() },
      { 'X-Forwarded-For': `203.0.113.${i}` }
    )
  }
  assert.equal(last.status, 429)
  assert.ok(last.headers.get('retry-after'), 'a locked-out client has to be told for how long')
})

test('the per-IP limit stops one machine hammering many accounts', async () => {
  _reset()
  let last
  for (let i = 0; i < 25; i++) {
    last = await post(
      '/auth/login',
      { email: `user${i}@example.com`, password: 'nope', ...solved() },
      { 'X-Forwarded-For': '198.51.100.7' }
    )
  }
  assert.equal(last.status, 429)
})

test('registration always demands a captcha', async () => {
  _reset()
  const res = await post('/auth/register', {
    name: 'ن', email: 'new@example.com', password: 'a-good-password',
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).captchaRequired, true)
})

test('registration succeeds with a solved captcha', async () => {
  _reset()
  const res = await post('/auth/register', {
    name: 'ن', email: 'new@example.com', password: 'a-good-password', ...solved(),
  })
  assert.equal(res.status, 201)
  assert.ok((await res.json()).token)
})

test('a captcha cannot be reused across two requests', async () => {
  _reset()
  const c = solved()
  const first = await post('/auth/register', { name: 'a', email: 'a1@example.com', password: 'a-good-password', ...c })
  assert.equal(first.status, 201)
  const second = await post('/auth/register', { name: 'b', email: 'a2@example.com', password: 'a-good-password', ...c })
  assert.equal(second.status, 400, 'a solved challenge must not work twice')
})

test('the challenge-state endpoint does not itself count as an attempt', async () => {
  _reset()
  for (let i = 0; i < 5; i++) await fetch(`${base}/auth/challenge-state`)
  const state = await (await fetch(`${base}/auth/challenge-state`)).json()
  assert.equal(state.failures, 0)
})
