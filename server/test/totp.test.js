// TOTP two-factor authentication — the mathematics and the door it guards.
//
// Part 1 runs everywhere: RFC 6238's own published vectors prove the code
// generator against a fixed truth, and window tests prove the verifier.
//
// Part 2 needs real PostgreSQL (the guard pattern of pairing-flow.test.js):
// enrollment, the login challenge, recovery codes and disable, walked over
// real HTTP against the app as it is actually mounted. The runner executes
// test files in parallel, so this file gets its own schema.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import {
  base32Encode, base32Decode, generateSecret, totp, verify, otpauthUri,
} from '../src/totp.js'

// ---- Part 1 · the mathematics (no database) --------------------------------

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))

test('the RFC 6238 appendix secret encodes to its published base32 form', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
})

test('RFC 6238 SHA-1 vectors, 8 digits', () => {
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ]
  for (const [unixSeconds, want] of vectors) {
    assert.equal(totp(RFC_SECRET, { time: unixSeconds * 1000, digits: 8 }), want, `T=${unixSeconds}`)
  }
})

test('6-digit codes are the last six digits of the RFC values', () => {
  const vectors = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ]
  for (const [unixSeconds, want] of vectors) {
    assert.equal(totp(RFC_SECRET, { time: unixSeconds * 1000 }), want, `T=${unixSeconds}`)
  }
})

test('base32 round-trips, and decodes the shapes a human pastes', () => {
  const raw = crypto.randomBytes(40)
  assert.equal(base32Decode(base32Encode(raw)).toString('hex'), raw.toString('hex'))
  // Case, padding, spaces and the XXXX-XXXX grouping all decode identically.
  // (Buffers are compared as hex — assert.equal on two Buffers is identity.)
  const secret = generateSecret()
  const hexOf = (s) => base32Decode(s).toString('hex')
  assert.equal(hexOf(secret.toLowerCase()), hexOf(secret))
  assert.equal(hexOf(secret + '===='), hexOf(secret))
  const grouped = secret.slice(0, 4) + '-' + secret.slice(4, 8)
  assert.equal(hexOf(grouped), hexOf(secret.slice(0, 8)))
  // A genuinely invalid character must throw, not decode to something else.
  assert.throws(() => base32Decode('ABC1'), /base32/)
})

test('the verification window is exactly ±1 step', () => {
  const secret = generateSecret()
  const now = 1_700_000_000_000
  const current = totp(secret, { time: now })
  // Same step, and one step either way: accepted.
  assert.equal(verify(secret, current, { time: now }), true)
  assert.equal(verify(secret, current, { time: now - 30_000 }), true)
  assert.equal(verify(secret, current, { time: now + 30_000 }), true)
  // Two steps back or forward: outside the window, rejected — an old code
  // replayed later must not open the door.
  assert.equal(verify(secret, current, { time: now - 60_000 }), false)
  assert.equal(verify(secret, current, { time: now + 60_000 }), false)
  assert.equal(verify(secret, totp(secret, { time: now - 90_000 }), { time: now }), false)
})

test('verify rejects malformed input without throwing', () => {
  const secret = generateSecret()
  const now = Date.now()
  assert.equal(verify(secret, '', { time: now }), false)
  assert.equal(verify(secret, undefined, { time: now }), false)
  assert.equal(verify(secret, 'abcdef', { time: now }), false) // letters
  assert.equal(verify(secret, '12345', { time: now }), false)  // too short
  assert.equal(verify(secret, '1234567', { time: now }), false) // too long
})

test('a code with a leading zero verifies as a string, never through a number', () => {
  // The RFC value at T=1111111111 is "050471" — a parseInt-based comparison
  // would forget the leading zero and let "50471" through.
  assert.equal(verify(RFC_SECRET, '050471', { time: 1111111111 * 1000 }), true)
  assert.equal(verify(RFC_SECRET, '50471', { time: 1111111111 * 1000 }), false)
})

test('generated secrets are 160-bit base32, and the otpauth URI carries them', () => {
  const secret = generateSecret()
  assert.match(secret, /^[A-Z2-7]{32}$/)
  assert.notEqual(secret, generateSecret())
  const uri = otpauthUri({ secret, account: 'user@example.com', issuer: 'DigiWP' })
  assert.match(uri, /^otpauth:\/\/totp\//)
  assert.ok(uri.includes(encodeURIComponent('DigiWP:user@example.com')), uri)
  assert.ok(uri.includes(`secret=${secret}`), uri)
  assert.ok(uri.includes('issuer=DigiWP'), uri)
  assert.ok(uri.includes('digits=6'), uri)
  assert.ok(uri.includes('period=30'), uri)
})

// ---- Part 2 · enrollment + login over real HTTP (needs PostgreSQL) ---------

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('two-factor HTTP flow (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_totp'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.LIVE = '1'

  const { query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  // createApp, not the default export: the factory mounts the same routers
  // and starts no schedulers and binds no configured port.
  const { createApp } = await import('../src/index.js')
  const app = createApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const send = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(API + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = { raw: text.slice(0, 200) } }
    return { status: res.status, body: parsed }
  }

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  const solveCaptcha = async () => {
    const { body } = await send('/auth/captcha')
    const ascii = body.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: body.id, captchaAnswer: String(answer) }
  }

  /** A fresh account; returns { email, password, auth } for further calls. */
  const register = async () => {
    // The whole file is one IP address; the register limiter (5/hour) is a
    // real defence this file has no interest in testing, and the runner's
    // `_reset` seam exists for exactly this.
    const { _reset } = await import('../src/security/ratelimit.js')
    _reset()
    const email = `totp-${crypto.randomUUID()}@test.local`
    const password = 'a-strong-password-123'
    const { status, body } = await send('/auth/register', {
      method: 'POST',
      body: { email, password, name: 'TOTP Test', ...(await solveCaptcha()) },
    })
    assert.equal(status, 201, `registration failed: ${JSON.stringify(body)}`)
    return { email, password, auth: { authorization: `Bearer ${body.token}` } }
  }

  /** Full enrollment up to (excluding) activation. Returns the setup secret. */
  const startSetup = async (auth) => {
    const { status, body } = await send('/auth/2fa/setup', { method: 'POST', headers: auth, body: {} })
    assert.equal(status, 200, `setup failed: ${JSON.stringify(body)}`)
    assert.ok(body.secret && body.otpauth, 'setup must return secret + otpauth URI')
    assert.match(body.otpauth, /^otpauth:\/\/totp\//)
    return body
  }

  test.after(() => { server?.close() })

  test('setup stores a pending factor; login is untouched until activation', async () => {
    const u = await register()
    await startSetup(u.auth)

    const { body: st } = await send('/auth/2fa/status', { headers: u.auth })
    assert.equal(st.enabled, false)
    assert.equal(st.pending, true)

    // Pending enrollment must not gate login: the factor is not live until
    // the user proves the app derives the same codes.
    const { status, body } = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password },
    })
    assert.equal(status, 200)
    assert.ok(body.token, 'a pending factor must not demand a code')
    assert.equal(body.totp_required, undefined)
  })

  test('activate refuses a wrong code, then accepts the right one and mints 8 recovery codes', async () => {
    const u = await register()
    const setup = await startSetup(u.auth)

    const bad = await send('/auth/2fa/activate', {
      method: 'POST', headers: u.auth, body: { code: '000000' },
    })
    assert.equal(bad.status, 400)

    // A wrong activation attempt must not have turned anything on.
    const mid = await send('/auth/2fa/status', { headers: u.auth })
    assert.equal(mid.body.enabled, false)

    const code = totp(setup.secret) // window ±1 covers the request's travel time
    const ok = await send('/auth/2fa/activate', {
      method: 'POST', headers: u.auth, body: { code },
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.recoveryCodes.length, 8)
    for (const c of ok.body.recoveryCodes) assert.match(c, /^[A-Z2-7]{4}-[A-Z2-7]{4}$/)

    const { body: st } = await send('/auth/2fa/status', { headers: u.auth })
    assert.equal(st.enabled, true)
    assert.equal(st.pending, false)
    assert.equal(st.recoveryCodesLeft, 8)

    // The display flag rides along on /auth/me.
    const me = await send('/auth/me', { headers: u.auth })
    assert.equal(me.body.twoFactor, true)

    // Setup while active is refused — re-enrollment goes through disable.
    const again = await send('/auth/2fa/setup', { method: 'POST', headers: u.auth, body: {} })
    assert.equal(again.status, 400)
  })

  test('login with an active factor: challenge, wrong code, window edge, success', async () => {
    const u = await register()
    const setup = await startSetup(u.auth)
    const activate = await send('/auth/2fa/activate', {
      method: 'POST', headers: u.auth, body: { code: totp(setup.secret) },
    })
    assert.equal(activate.status, 200)

    // Correct password without a code → the challenge, and no session.
    const challenge = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password },
    })
    assert.equal(challenge.status, 200)
    assert.equal(challenge.body.totp_required, true)
    assert.equal(challenge.body.token, undefined)

    // A wrong code is a 401 — and not the wrong-password lie, since this
    // caller already proved the password.
    const wrong = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password, code: '000000' },
    })
    assert.equal(wrong.status, 401)
    assert.ok(wrong.body.message.includes('دو مرحله‌ای'))
    assert.equal(wrong.body.token, undefined)

    // A code one step old (the ±1 window) is accepted.
    const drifted = totp(setup.secret, { time: Date.now() - 30_000 })
    const edge = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password, code: drifted },
    })
    assert.equal(edge.status, 200)
    assert.ok(edge.body.token, 'a code within the ±1 window must log in')

    // A code three steps old is outside the window and must not.
    const stale = totp(setup.secret, { time: Date.now() - 90_000 })
    const outside = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password, code: stale },
    })
    assert.equal(outside.status, 401)

    // The current code logs in.
    const good = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password, code: totp(setup.secret) },
    })
    assert.equal(good.status, 200)
    assert.ok(good.body.token)
  })

  test('a recovery code logs in exactly once', async () => {
    const u = await register()
    const setup = await startSetup(u.auth)
    const activate = await send('/auth/2fa/activate', {
      method: 'POST', headers: u.auth, body: { code: totp(setup.secret) },
    })
    const [code] = activate.body.recoveryCodes

    // Recovery codes are compared case- and dash-insensitively: the hash is
    // over the normalized form.
    const first = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password, code: code.toLowerCase() },
    })
    assert.equal(first.status, 200, 'an unspent recovery code must log in')
    assert.ok(first.body.token)

    const second = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password, code },
    })
    assert.equal(second.status, 401, 'a spent recovery code must be refused')

    const { body: st } = await send('/auth/2fa/status', { headers: u.auth })
    assert.equal(st.recoveryCodesLeft, 7)
  })

  test('disable needs the current password and a valid code', async () => {
    const u = await register()
    const setup = await startSetup(u.auth)
    const activate = await send('/auth/2fa/activate', {
      method: 'POST', headers: u.auth, body: { code: totp(setup.secret) },
    })
    assert.equal(activate.status, 200)

    // Wrong password.
    const wrongPw = await send('/auth/2fa/disable', {
      method: 'POST', headers: u.auth, body: { password: 'not-the-password', code: totp(setup.secret) },
    })
    assert.equal(wrongPw.status, 400)

    // Right password, wrong code.
    const wrongCode = await send('/auth/2fa/disable', {
      method: 'POST', headers: u.auth, body: { password: u.password, code: '000000' },
    })
    assert.equal(wrongCode.status, 400)

    // Both right → off, and login is password-only again.
    const ok = await send('/auth/2fa/disable', {
      method: 'POST', headers: u.auth, body: { password: u.password, code: totp(setup.secret) },
    })
    assert.equal(ok.status, 200)

    const { body: st } = await send('/auth/2fa/status', { headers: u.auth })
    assert.equal(st.enabled, false)
    assert.equal(st.pending, false)
    assert.equal(st.recoveryCodesLeft, 0)

    const login = await send('/auth/login', {
      method: 'POST', body: { email: u.email, password: u.password },
    })
    assert.equal(login.status, 200)
    assert.ok(login.body.token)
    assert.equal(login.body.totp_required, undefined)

    const me = await send('/auth/me', { headers: u.auth })
    assert.equal(me.body.twoFactor, false)
  })

  test('disable also accepts a recovery code — the lost-phone way out', async () => {
    const u = await register()
    const setup = await startSetup(u.auth)
    const activate = await send('/auth/2fa/activate', {
      method: 'POST', headers: u.auth, body: { code: totp(setup.secret) },
    })
    const [code] = activate.body.recoveryCodes

    const ok = await send('/auth/2fa/disable', {
      method: 'POST', headers: u.auth, body: { password: u.password, code },
    })
    assert.equal(ok.status, 200)

    const { body: st } = await send('/auth/2fa/status', { headers: u.auth })
    assert.equal(st.enabled, false)
  })
}
