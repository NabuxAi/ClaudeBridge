// The rate limiter — the actual brute-force defence.
//
// The captcha filters scripts; this is what makes password guessing
// impractical. What is tested is the behaviour an attacker would probe: does
// the window really reset, can one key's exhaustion starve another, and can
// the per-IP limit be walked around by forging a header.
import test from 'node:test'
import assert from 'node:assert/strict'
import { hit, clear, peek, clientIp, limiter, _reset } from '../src/security/ratelimit.js'

test('attempts are allowed up to the limit and refused after it', () => {
  _reset()
  const opts = { limit: 3, windowMs: 60_000 }
  assert.equal(hit('k', opts).allowed, true)
  assert.equal(hit('k', opts).allowed, true)
  const third = hit('k', opts)
  assert.equal(third.allowed, true)
  assert.equal(third.remaining, 0)
  assert.equal(hit('k', opts).allowed, false)
})

test('a refused attempt reports how long to wait', () => {
  _reset()
  const opts = { limit: 1, windowMs: 30_000 }
  hit('k', opts)
  const r = hit('k', opts)
  assert.equal(r.allowed, false)
  assert.ok(r.retryAfter > 0 && r.retryAfter <= 30, `implausible retryAfter: ${r.retryAfter}`)
})

test('the window really expires', async () => {
  _reset()
  const opts = { limit: 1, windowMs: 25 }
  assert.equal(hit('k', opts).allowed, true)
  assert.equal(hit('k', opts).allowed, false)
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(hit('k', opts).allowed, true, 'a limiter that never resets locks out real users forever')
})

test('keys are independent, so one attacker cannot lock everyone out', () => {
  _reset()
  const opts = { limit: 1, windowMs: 60_000 }
  hit('ip:1.1.1.1', opts)
  assert.equal(hit('ip:1.1.1.1', opts).allowed, false)
  assert.equal(hit('ip:2.2.2.2', opts).allowed, true, 'exhausting one key must not affect another')
})

test('clearing a key forgives the attempts', () => {
  _reset()
  const opts = { limit: 2, windowMs: 60_000 }
  hit('k', opts)
  hit('k', opts)
  assert.equal(hit('k', opts).allowed, false)
  clear('k')
  assert.equal(hit('k', opts).allowed, true,
    'a correct password must clear the penalty, or two typos follow someone all day')
})

test('peek reads without counting', () => {
  _reset()
  const opts = { limit: 5, windowMs: 60_000 }
  hit('k', opts)
  assert.equal(peek('k').count, 1)
  assert.equal(peek('k').count, 1, 'peek must not itself be an attempt')
  assert.equal(peek('never-seen').count, 0)
})

test('a forwarded header is only believed when a proxy is trusted', () => {
  // The attack: send X-Forwarded-For with a random value on every request and
  // every request looks like a new client, so the per-IP limit never trips.
  // Trusting the header is therefore a deployment decision, not a default that
  // applies whether or not a proxy is actually in front.
  const req = {
    get: (h) => (h.toLowerCase() === 'x-forwarded-for' ? '9.9.9.9' : null),
    socket: { remoteAddress: '10.0.0.1' },
  }
  assert.equal(clientIp(req, { trustProxy: true }), '9.9.9.9')
  assert.equal(clientIp(req, { trustProxy: false }), '10.0.0.1',
    'without a trusted proxy the socket address is the only honest answer')
})

test('the first hop is taken from a forwarded chain', () => {
  const req = {
    get: (h) => (h.toLowerCase() === 'x-forwarded-for' ? '203.0.113.5, 10.0.0.7, 10.0.0.8' : null),
    socket: { remoteAddress: '10.0.0.9' },
  }
  assert.equal(clientIp(req, { trustProxy: true }), '203.0.113.5')
})

test('a request with no address at all still yields a usable key', () => {
  // Otherwise the key becomes "undefined" for every such request and they all
  // share one bucket — which is either a lockout or a bypass, depending on
  // which way it falls.
  const req = { get: () => null, socket: {} }
  assert.equal(clientIp(req, { trustProxy: true }), 'unknown')
})

test('the limiter middleware answers 429 with a Retry-After header', () => {
  _reset()
  const mw = limiter('t', { limit: 1, windowMs: 60_000, keyFn: () => 'x' })

  const res = makeRes()
  let nexted = 0
  mw({}, res, () => nexted++)
  assert.equal(nexted, 1, 'the first attempt goes through')

  const res2 = makeRes()
  mw({}, res2, () => nexted++)
  assert.equal(nexted, 1, 'the second is stopped')
  assert.equal(res2.statusCode, 429)
  assert.ok(res2.headers['Retry-After'], 'a client told to back off needs to know for how long')
  assert.ok(res2.body.message)
})

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}
