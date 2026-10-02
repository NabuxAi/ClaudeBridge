// Account deletion (POST /account/delete), over real HTTP against real
// PostgreSQL.
//
// The point of this file is the exit boundary: after a successful deletion the
// next login must fail, every issued token must 401 despite a valid signature,
// the paired sites' connector credentials must be dead (a signed register call
// with the OLD secret must be refused), the user row must carry no personal
// data — and the audit events must still be there, minus that personal data.
//
// Skipped unless CB_TEST_DATABASE_URL is set — the guard pattern of
// pairing-flow.test.js. Every step rides the mounted app; nothing is stubbed.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('account deletion (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Its own PostgreSQL schema: the runner executes test files in parallel and
  // every database-touching file here creates the same table names.
  const TEST_SCHEMA = 'test_account_delete'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  // createApp, not the module's default export: same routers, no port, no
  // schedulers — the factory exists so tests can ride the real mounts.
  const { createApp } = await import('../src/index.js')
  const { _reset } = await import('../src/security/ratelimit.js')
  const { issue } = await import('../src/security/captcha.js')
  const events = await import('../src/events.js')

  const app = createApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const PASSWORD = 'a-strong-password-123'

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  function solveCaptcha() {
    const c = issue()
    const ascii = c.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: c.id, captchaAnswer: String(answer) }
  }

  /** A fresh account per test: limiter buckets and session state never leak. */
  async function register(email = `del-${crypto.randomUUID()}@test.local`) {
    _reset()
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'حذف آزمون', email, password: PASSWORD, ...solveCaptcha() }),
    })
    const body = await res.json()
    assert.equal(res.status, 201, `register failed: ${JSON.stringify(body)}`)
    return { email, userId: body.user.id, token: body.token }
  }

  async function login(email, password = PASSWORD) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Firefox/120.0' },
      body: JSON.stringify({ email, password }),
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  }

  const get = (path, auth) => fetch(API + path, { headers: auth ? { Authorization: auth } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

  const post = (path, auth, body) => fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: body === undefined ? '{}' : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

  /** A site with real pairing credentials, as POST /sites would hand them out. */
  async function addSite(auth, name = `del-${crypto.randomUUID()}.example.com`) {
    const r = await post('/sites', auth, { name })
    assert.equal(r.status, 201, `add site failed: ${JSON.stringify(r.body)}`)
    // The one-time secret lives under `pairing` in the response shape.
    return { ...r.body, secret: r.body.pairing.secret, siteKey: r.body.pairing.siteKey }
  }

  /**
   * What the plugin does after pairing: announce itself with an HMAC over
   * ts + "\n" + body, keyed with the shared secret it was shown ONCE.
   */
  function signedRegister(secret, siteKey) {
    const body = JSON.stringify({ site_url: `https://${siteKey}.example`, name: 'connector-test' })
    const ts = Math.floor(Date.now() / 1000).toString()
    const sig = crypto.createHmac('sha256', secret).update(`${ts}\n${body}`).digest('hex')
    return fetch(`${API}/connector/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DigiWP-Timestamp': ts,
        'X-DigiWP-Signature': sig,
        'X-DigiWP-Site': siteKey,
      },
      body,
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
  }

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
    server.close()
  })

  test('a wrong password is a generic error and leaves the account intact', async () => {
    const u = await register()
    const site = await addSite(`Bearer ${u.token}`)

    const missing = await post('/account/delete', `Bearer ${u.token}`, {})
    const wrong = await post('/account/delete', `Bearer ${u.token}`, { password: 'not-the-password' })
    assert.equal(missing.status, 400)
    assert.equal(wrong.status, 400)
    // Identical, deliberately vague answer either way — the endpoint never
    // says whether the failure was an absent password or a wrong one.
    assert.equal(missing.body.message, wrong.body.message)
    assert.match(wrong.body.message, /رمز عبور/)
    assert.ok(!/درست است|درست بود/.test(wrong.body.message.replace('نادرست است', '')))

    // Nothing happened: the session is alive, the site is untouched.
    assert.equal((await get('/auth/me', `Bearer ${u.token}`)).status, 200)
    const sites = await get('/sites', `Bearer ${u.token}`)
    assert.equal(sites.status, 200)
    assert.equal(sites.body.length, 1)
    assert.equal(sites.body[0].id, site.id)

    const row = (await query('SELECT * FROM users WHERE id = $1', [u.userId])).rows[0]
    assert.equal(row.email, u.email, 'the email must survive a refused deletion')
  })

  test('wrong-password attempts hit a per-account rate limit, and the right password does not bypass it', async () => {
    const u = await register()

    // Five wrong attempts answer 400; the sixth is refused by the limiter.
    for (let i = 0; i < 5; i++) {
      const r = await post('/account/delete', `Bearer ${u.token}`, { password: `guess-${i}` })
      assert.equal(r.status, 400, `attempt ${i + 1} should be a password failure, not a lockout`)
    }
    const locked = await post('/account/delete', `Bearer ${u.token}`, { password: 'guess-5' })
    assert.equal(locked.status, 429)
    assert.ok(locked.body.retryAfter > 0)

    // The lock gates BEFORE the password check: the correct password cannot
    // slip through, or the limit would be decorative against brute force.
    const correct = await post('/account/delete', `Bearer ${u.token}`, { password: PASSWORD })
    assert.equal(correct.status, 429)
    assert.equal((await get('/auth/me', `Bearer ${u.token}`)).status, 200, 'the account must survive the lockout window')
  })

  test('successful deletion: next login fails, every token 401s, connector credentials die, audit survives', async () => {
    const u = await register()
    const site = await addSite(`Bearer ${u.token}`)
    // A second device, so "all sessions revoked" is observable, not vacuous.
    const second = await login(u.email)
    assert.equal(second.status, 200)
    const secondToken = `Bearer ${second.body.token}`

    // A real audit record on the site, written before the deletion — this is
    // what must still be there afterwards, without the personal data.
    await events.record({
      siteId: site.id, kind: 'update', severity: 'info',
      title: 'به‌روزرسانی آزمون انجام شد', detail: { probe: true },
    })

    const r = await post('/account/delete', secondToken, { password: PASSWORD })
    assert.equal(r.status, 200, `delete failed: ${JSON.stringify(r.body)}`)
    assert.equal(r.body.ok, true)
    assert.equal(r.body.sitesAffected, 1)
    // No mail claim: no delivery exists behind this endpoint, so the response
    // must not imply one.
    assert.ok(!('mail' in r.body), 'the response must not imply an email was sent')

    // 1 · Every token is dead: the requesting session AND the other device.
    assert.equal((await get('/auth/me', secondToken)).status, 401)
    assert.equal((await get('/auth/me', `Bearer ${u.token}`)).status, 401)

    // 2 · The next login with the same email + password fails, generically.
    const next = await login(u.email)
    assert.equal(next.status, 401)
    assert.equal(next.body.message, 'ایمیل یا رمز عبور نادرست است.')

    // 3 · The pairing credentials are gone from the row…
    const siteRow = (await query('SELECT * FROM sites WHERE id = $1', [site.id])).rows[0]
    assert.ok(siteRow, 'the site ROW survives (it carries the audit trail)')
    assert.equal(siteRow.secret, '')
    assert.equal(siteRow.site_key, '')
    assert.equal(siteRow.paired, false)
    assert.equal(siteRow.status, 'deleted')
    // …and the connector is actually dead: the OLD secret signs a register
    // call that no longer matches any known site.
    const reg = await signedRegister(site.secret, site.siteKey)
    assert.equal(reg.status, 401)
    assert.match(reg.body.message, /did not match any known site/)

    // 4 · The user row is a tombstone: no email, no name, no usable hash,
    //     no contact data.
    const row = (await query('SELECT * FROM users WHERE id = $1', [u.userId])).rows[0]
    assert.ok(row, 'the user row survives as a tombstone')
    assert.match(row.email, /^deleted-[0-9a-f]{12}@invalid$/)
    assert.ok(!row.email.includes('test.local'), 'the original address must be gone from the row')
    assert.equal(row.name, 'حساب حذف‌شده')
    assert.ok(!row.pass_hash.startsWith('scrypt$'), 'the stored hash must not verify any password')
    // contact is NOT NULL by schema; the tombstone resets it to the neutral
    // all-null shape — no phone, no push token survives.
    assert.deepEqual(row.contact, { phone: null, fcmToken: null, najvaToken: null })

    // 5 · The audit trail survived, without personal data in it.
    const evs = (await query('SELECT * FROM events WHERE site_id = $1 ORDER BY created_at', [site.id])).rows
    assert.ok(evs.length >= 2, 'both the pre-existing event and the deletion record must remain')
    const del = evs.find((e) => e.kind === 'account')
    assert.ok(del, 'an account-deletion audit event must be recorded')
    assert.equal(del.severity, 'info')
    const blob = JSON.stringify(evs.map((e) => ({ t: e.title, d: e.detail })))
    assert.ok(!blob.includes(u.email), 'no email in the audit trail')
    assert.ok(!blob.includes('حذف آزمون'), 'no name in the audit trail')

    // 6 · The address is free again: re-registration works (the tombstone's
    //     placeholder email must not collide with it).
    const again = await register(u.email)
    assert.equal(again.userId !== u.userId, true)
  })

  test('deletion is self-scoped: another account cannot be erased with someone else\u2019s session', async () => {
    const a = await register()
    const b = await register(`del-other-${crypto.randomUUID()}@test.local`)
    const bSite = await addSite(`Bearer ${b.token}`)

    // A's session, A's password, but the route acts on the SESSION's subject:
    // it can only ever delete A, and only with A's password.
    const r = await post('/account/delete', `Bearer ${a.token}`, { password: PASSWORD })
    assert.equal(r.status, 200)

    // B is untouched — session live, site live, credentials intact.
    assert.equal((await get('/auth/me', `Bearer ${b.token}`)).status, 200)
    const sites = await get('/sites', `Bearer ${b.token}`)
    assert.equal(sites.body.length, 1)
    assert.equal(sites.body[0].id, bSite.id)
    const reg = await signedRegister(bSite.secret, bSite.siteKey)
    assert.equal(reg.status, 200, 'B\u2019s connector must keep working')
  })
}
