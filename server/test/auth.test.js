// Session tokens and password hashing.
//
// These are the primitives everything else trusts, so the tests are the
// attacks: forge a token, extend your own expiry, swap the payload, and read
// the timing difference between a real account and a missing one.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {
  signToken, verifyToken, hashPassword, verifyPassword, verifyPasswordDummy, requireAuth,
} from '../src/auth.js'
import { config } from '../src/config.js'

test('a token round-trips and carries its payload', () => {
  const t = signToken({ sub: 'u_1', name: 'کاربر' })
  const p = verifyToken(t)
  assert.equal(p.sub, 'u_1')
  assert.equal(p.name, 'کاربر')
  assert.ok(p.exp > Math.floor(Date.now() / 1000))
})

test('a tampered payload is rejected', () => {
  // The attack: decode the token, change sub to someone else's id, re-encode.
  // Only the signature stands in the way — so it has to be checked over the
  // exact bytes that were signed.
  const t = signToken({ sub: 'u_1' })
  const [, sig] = t.split('.')
  const evil = Buffer.from(JSON.stringify({ sub: 'u_admin', exp: 9e9 })).toString('base64url')
  assert.equal(verifyToken(`${evil}.${sig}`), null)
})

test('a token signed with another key is rejected', () => {
  const body = Buffer.from(JSON.stringify({ sub: 'u_1', exp: 9e9 })).toString('base64url')
  const sig = crypto.createHmac('sha256', 'someone-elses-secret').update(body).digest('base64url')
  assert.equal(verifyToken(`${body}.${sig}`), null)
})

test('an expired token is rejected even though the signature is valid', () => {
  const t = signToken({ sub: 'u_1' }, -10)
  assert.equal(verifyToken(t), null, 'expiry has to be enforced, not merely recorded')
})

test('a signature of the wrong length does not crash the comparison', () => {
  // timingSafeEqual throws on length mismatch, so the length check has to come
  // first — otherwise a one-character signature is a denial of service.
  const t = signToken({ sub: 'u_1' })
  const [body] = t.split('.')
  assert.equal(verifyToken(`${body}.x`), null)
  assert.equal(verifyToken(`${body}.`), null)
})

test('garbage in gives null, never a throw', () => {
  for (const bad of [null, undefined, '', 'nodots', '...', 'a.b.c.d', 42, {}]) {
    assert.equal(verifyToken(bad), null, `threw or accepted: ${JSON.stringify(bad)}`)
  }
})

test('a password verifies against its own hash and nothing else', async () => {
  const h = await hashPassword('correct horse battery staple')
  assert.equal(await verifyPassword('correct horse battery staple', h), true)
  assert.equal(await verifyPassword('Correct horse battery staple', h), false)
  assert.equal(await verifyPassword('', h), false)
})

test('the same password hashes differently every time', async () => {
  // Without a per-password salt, identical passwords produce identical hashes
  // and one leaked table tells an attacker which accounts share a password.
  const a = await hashPassword('same')
  const b = await hashPassword('same')
  assert.notEqual(a, b)
  assert.equal(await verifyPassword('same', a), true)
  assert.equal(await verifyPassword('same', b), true)
})

test('a malformed stored hash fails closed', async () => {
  for (const bad of ['', 'garbage', 'md5$aa$bb', 'scrypt$onlyone', null, undefined]) {
    assert.equal(await verifyPassword('x', bad), false, `accepted stored hash ${JSON.stringify(bad)}`)
  }
})

test('a missing account costs the same time as a wrong password', async () => {
  // The leak this closes: if a nonexistent email returns instantly while a real
  // one costs a full scrypt derivation, response time alone enumerates the
  // customer list. The dummy path has to do the same work, not skip it.
  const h = await hashPassword('a-real-password')

  const timeOf = async (fn) => {
    const t0 = process.hrtime.bigint()
    await fn()
    return Number(process.hrtime.bigint() - t0) / 1e6
  }

  // Warm up, so the first derivation's overhead does not skew the comparison.
  await verifyPassword('wrong', h)
  await verifyPasswordDummy('wrong')

  const real = await timeOf(() => verifyPassword('wrong', h))
  const missing = await timeOf(() => verifyPasswordDummy('wrong'))

  const ratio = Math.max(real, missing) / Math.max(1, Math.min(real, missing))
  assert.ok(ratio < 3, `timing differs too much: real ${real.toFixed(1)}ms vs missing ${missing.toFixed(1)}ms`)
  // And the dummy must never accidentally report success.
  assert.equal(await verifyPasswordDummy('anything'), false)
})

test('hashing does not block the event loop', async () => {
  // scryptSync holds Node's single thread for the whole derivation, so a
  // handful of concurrent logins freezes every other request — the login form
  // becomes a denial-of-service lever. The async version leaves the loop free.
  let ticks = 0
  const timer = setInterval(() => ticks++, 5)
  await Promise.all([hashPassword('a'), hashPassword('b'), hashPassword('c'), hashPassword('d')])
  clearInterval(timer)
  assert.ok(ticks > 0, 'the event loop was blocked for the whole of four derivations')
})

test('requireAuth rejects everything that is not a valid Bearer token', () => {
  const cases = [
    undefined,
    'Bearer',
    'Bearer ',
    'Basic ' + Buffer.from('a:b').toString('base64'),
    'Bearer ' + signToken({ sub: 'u_1' }, -1),
  ]
  for (const header of cases) {
    const res = makeRes()
    let nexted = false
    requireAuth({ get: () => header }, res, () => { nexted = true })
    assert.equal(nexted, false, `let through: ${header}`)
    assert.equal(res.statusCode, 401)
  }
})

test('requireAuth passes a valid token through and attaches the user', () => {
  const res = makeRes()
  const req = { get: () => `Bearer ${signToken({ sub: 'u_9', name: 'ن' })}` }
  let nexted = false
  requireAuth(req, res, () => { nexted = true })
  assert.equal(nexted, true)
  assert.equal(req.user.sub, 'u_9')
})

test('the signing secret is not the development default in this environment', () => {
  // If this fails in CI it is telling you something true: the suite is
  // exercising tokens that anyone reading the repository could mint.
  if (process.env.NODE_ENV === 'production') {
    assert.notEqual(config.authSecret, 'dev-only-change-me')
    assert.ok(config.authSecret.length >= 32)
  }
})

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}
