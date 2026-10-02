// Session/device management, over real HTTP against a real PostgreSQL.
//
// The point of this file is the revocation boundary: a signature on a token
// used to be the whole credential, so "log out that device" was a wish. Here
// a revoked session row must beat a perfectly valid signature, an expired
// row must beat it too, and the list endpoint must hand the browser device
// names without ever handing it a hash.
//
// Skipped unless CB_TEST_DATABASE_URL is set — the guard pattern of
// pairing-flow.test.js. Every step rides the mounted app; nothing is stubbed.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('sessions and devices (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Its own PostgreSQL schema: the runner executes test files in parallel and
  // every database-touching file here creates the same table names.
  const TEST_SCHEMA = 'test_sessions'
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
  const { signToken, verifyToken } = await import('../src/auth.js')
  const { sessions: sessionsStore, LAST_SEEN_THROTTLE_MS } = await import('../src/sessions.store.js')
  const { _reset } = await import('../src/security/ratelimit.js')
  const { issue } = await import('../src/security/captcha.js')

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

  /** A fresh account per test: session state never leaks between cases. */
  async function register(email = `sessions-${crypto.randomUUID()}@test.local`) {
    _reset()
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sessions Test', email, password: PASSWORD, ...solveCaptcha() }),
    })
    const body = await res.json()
    assert.equal(res.status, 201, `register failed: ${JSON.stringify(body)}`)
    return { email, userId: body.user.id }
  }

  async function login(email, { ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0' } = {}) {
    _reset()
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    const body = await res.json()
    assert.equal(res.status, 200, `login failed: ${JSON.stringify(body)}`)
    return body
  }

  const get = (path, auth) => fetch(API + path, { headers: auth ? { Authorization: auth } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

  const del = (path, auth) => fetch(API + path, { method: 'DELETE', headers: auth ? { Authorization: auth } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

  const post = (path, auth) => fetch(API + path, { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: '{}' })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

  const me = (auth) => get('/auth/me', auth)

  // A pre-sessions token: right signature, right expiry, no jti.
  function oldStyleToken(userId) {
    const body = Buffer.from(
      JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url')
    const sig = crypto.createHmac('sha256', 'a-test-secret-of-more-than-32-characters')
      .update(body).digest('base64url')
    return `${body}.${sig}`
  }

  test.after(async () => {
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
    server.close()
  })

  test('login mints a jti, writes its session row, and the token works', async () => {
    const user = await register()
    const { token, user: pub } = await login(user.email)
    assert.equal(pub.id, user.userId)
    const payload = verifyToken(token)
    assert.equal(payload.sub, user.userId)
    assert.ok(typeof payload.jti === 'string' && payload.jti.length >= 32, 'the token must carry a random jti')

    // The row exists and is keyed by SHA-256 of that jti — never by the raw jti.
    // (Registering already created the account's first session for its own
    // token, so the login's row is looked up by its hash, not by count.)
    const sha = crypto.createHash('sha256').update(payload.jti).digest('hex')
    const rows = await query('SELECT * FROM sessions WHERE user_id = $1 AND token_hash = $2', [user.userId, sha])
    assert.equal(rows.rows.length, 1)
    const row = rows.rows[0]
    assert.equal(row.device, 'Firefox روی Windows', 'the stored device is a summary of the user-agent')
    assert.equal(row.ip, '127.0.0.1')
    assert.ok(row.expires_at > Date.now(), 'the session outlives the request by days, not seconds')
    assert.equal(row.revoked_at, null)

    // And the token is a live credential end to end.
    const r = await me(`Bearer ${token}`)
    assert.equal(r.status, 200)
  })

  test('the session list answers with devices, never with hashes', async () => {
    const user = await register()
    await login(user.email) // Firefox روی Windows
    const second = await login(user.email, { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15' })

    const r = await get('/auth/sessions', `Bearer ${second.token}`)
    assert.equal(r.status, 200)
    const list = r.body.sessions
    // Three active sessions: the registration token's own session (its
    // user-agent is Node's fetch — honestly unrecognised), then two logins.
    assert.equal(list.length, 3)
    // Current session first, and marked as such.
    assert.equal(list[0].current, true)
    assert.equal(list[0].device, 'Safari روی macOS')
    const devices = list.map((s) => s.device)
    assert.ok(devices.includes('Firefox روی Windows'))
    assert.ok(devices.includes('دستگاه ناشناس'), 'an unrecognised user-agent says so instead of inventing a device')
    for (const s of list) {
      assert.ok(!('token_hash' in s), 'token_hash must never reach the browser')
      assert.ok(!('tokenHash' in s), 'no camelCase leak of the hash either')
      assert.equal(typeof s.id, 'string')
      assert.equal(typeof s.device, 'string')
      assert.equal(typeof s.expiresAt, 'number')
      assert.equal(s.revokedAt, null)
    }
  })

  test('revoking a device kills its token: valid signature, 401 anyway', async () => {
    const user = await register()
    const a = await login(user.email, { ua: 'Chrome' })
    const b = await login(user.email, { ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0' })
    const list = await get('/auth/sessions', `Bearer ${a.token}`)
    const other = list.body.sessions.find((s) => !s.current)
    assert.ok(other, 'the other device must be listed')
    assert.equal(other.device, 'Chrome روی Linux')

    const del1 = await del(`/auth/sessions/${other.id}`, `Bearer ${a.token}`)
    assert.equal(del1.status, 200)

    // b's signature is still perfectly valid. The row is not.
    const after = await me(`Bearer ${b.token}`)
    assert.equal(after.status, 401, 'a revoked session must 401 even with a valid signature')
    // a is untouched.
    assert.equal((await me(`Bearer ${a.token}`)).status, 200)

    // The revoked row is spent exactly once: a second revoke of the same id is a 404.
    const del2 = await del(`/auth/sessions/${other.id}`, `Bearer ${a.token}`)
    assert.equal(del2.status, 404)
  })

  test('an expired session row rejects its token even though the signature is fresh', async () => {
    const user = await register()
    const jti = crypto.randomBytes(16).toString('hex')
    await sessionsStore.create({ userId: user.userId, jti, device: 'آزمون', ip: '127.0.0.1', ttlMs: -1000 })
    const token = signToken({ sub: user.userId, jti })
    assert.ok(verifyToken(token), 'the token itself is unexpired — the SESSION is what expired')
    const r = await me(`Bearer ${token}`)
    assert.equal(r.status, 401)
  })

  test('a token with no jti (pre-sessions) is rejected outright', async () => {
    const user = await register()
    const r = await me(`Bearer ${oldStyleToken(user.userId)}`)
    assert.equal(r.status, 401)
  })

  test('revoke-others logs out every other device and not the current one', async () => {
    const user = await register()
    const one = await login(user.email, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' })
    const two = await login(user.email, { ua: 'Mozilla/5.0 (Android; Mobile) Chrome/119.0' })
    const three = await login(user.email, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1' })

    const r = await post('/auth/sessions/revoke-others', `Bearer ${one.token}`)
    assert.equal(r.status, 200)
    // Three others: the registration session plus the two other logins.
    assert.equal(r.body.revoked, 3)

    assert.equal((await me(`Bearer ${one.token}`)).status, 200, 'the current device stays signed in')
    assert.equal((await me(`Bearer ${two.token}`)).status, 401)
    assert.equal((await me(`Bearer ${three.token}`)).status, 401)

    // The list from the surviving session now shows exactly one active device.
    const list = await get('/auth/sessions', `Bearer ${one.token}`)
    assert.equal(list.body.sessions.length, 1)
    assert.equal(list.body.sessions[0].current, true)
  })

  test('a session id belonging to another user is a plain 404, not a revoke', async () => {
    const mine = await register()
    const other = await register(`sessions-other-${crypto.randomUUID()}@test.local`)
    const otherLogin = await login(other.email)

    const myLogin = await login(mine.email)
    const myList = await get('/auth/sessions', `Bearer ${myLogin.token}`)
    const mySession = myList.body.sessions[0]

    // The other account cannot revoke (or even learn about) my session.
    const r = await del(`/auth/sessions/${mySession.id}`, `Bearer ${otherLogin.token}`)
    assert.equal(r.status, 404)
    const still = await me(`Bearer ${myLogin.token}`)
    assert.equal(still.status, 200, 'the session must survive someone else trying to kill it')
  })

  test('logout revokes the session it rode in on; other devices survive', async () => {
    const user = await register()
    const a = await login(user.email, { ua: 'Chrome' })
    const b = await login(user.email, { ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0' })

    const r = await post('/auth/logout', `Bearer ${a.token}`)
    assert.equal(r.status, 200)
    assert.equal(r.body.ok, true)

    // The token left in that browser is dead on the server — not at its
    // 7-day expiry. A perfectly valid signature, 401 anyway.
    assert.equal((await me(`Bearer ${a.token}`)).status, 401, 'the logged-out token must be dead server-side')

    // Only THIS session: the other device and the registration session live on.
    assert.equal((await me(`Bearer ${b.token}`)).status, 200, 'logout must not touch other devices')
    // Three sessions existed (registration + two logins); after the logout
    // exactly two remain, so the logged-out row left the active list.
    const list = await get('/auth/sessions', `Bearer ${b.token}`)
    assert.equal(list.body.sessions.length, 2, 'the logged-out session must leave the active list')

    // Logging out again on a dead token: the row is already revoked, the
    // outcome the caller wanted holds — but requireAuth refuses the dead
    // token before the route runs, so the honest answer is still 401.
    const again = await post('/auth/logout', `Bearer ${a.token}`)
    assert.equal(again.status, 401)
  })

  test('logout answers only to real session tokens', async () => {
    const user = await register()
    // A purpose-scoped capability token is not a person and has no session
    // row; like the other session routes it must get 401, not a silent ok.
    const cap = signToken({ sub: user.userId, kind: 'backup_download', siteId: 's1', backupId: 'b1', what: 'db' }, 300)
    const r = await post('/auth/logout', `Bearer ${cap}`)
    assert.equal(r.status, 401)
    // And without any token at all.
    const anon = await post('/auth/logout', null)
    assert.equal(anon.status, 401)
  })

  test('a purpose-scoped token (kind) still works without a session row', async () => {
    // The backup-download capability is a deliberate exception: it is a
    // five-minute single-purpose URL token, not a login session. If this
    // test ever fails, the direct download contract broke.
    const user = await register()
    const token = signToken({ sub: user.userId, kind: 'backup_download', siteId: 's1', backupId: 'b1', what: 'db' }, 300)
    const r = await me(`Bearer ${token}`)
    assert.equal(r.status, 200)
  })

  test('last_seen is throttled to one write per minute per session', async () => {
    const user = await register()
    const { token } = await login(user.email, { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0' })
    const jti = verifyToken(token).jti
    const sha = crypto.createHash('sha256').update(jti).digest('hex')

    // Fresh session: a touch inside the throttle window must not move it.
    const before = (await query('SELECT last_seen_at FROM sessions WHERE token_hash = $1', [sha])).rows[0].last_seen_at
    await sessionsStore.touch(sha)
    const after = (await query('SELECT last_seen_at FROM sessions WHERE token_hash = $1', [sha])).rows[0].last_seen_at
    assert.equal(after, before, 'a touch within 60s must not write')

    // Older than the window: it must.
    await query('UPDATE sessions SET last_seen_at = $2 WHERE token_hash = $1', [sha, Date.now() - LAST_SEEN_THROTTLE_MS - 1000])
    await sessionsStore.touch(sha)
    const bumped = (await query('SELECT last_seen_at FROM sessions WHERE token_hash = $1', [sha])).rows[0].last_seen_at
    assert.ok(bumped > before, 'a touch past the throttle window must update last_seen')
  })

  test('expired rows are pruned for the user on the next login', async () => {
    const user = await register()
    const now = Date.now()
    // Two dead rows, written directly so the count here is not confounded by
    // create() pruning expired rows as it goes.
    for (let i = 0; i < 2; i++) {
      await query(
        `INSERT INTO sessions (id, user_id, token_hash, device, ip, created_at, last_seen_at, expires_at)
         VALUES ($1, $2, $3, 'dead', '127.0.0.1', $4, $4, $5)`,
        [`ses_dead_${crypto.randomBytes(4).toString('hex')}`, user.userId, `dead${i}`, now, now - 1000]
      )
    }
    const dead = (await query('SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = $1 AND expires_at <= $2', [user.userId, now])).rows[0].n
    assert.equal(dead, 2)
    await login(user.email)
    const left = (await query('SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = $1 AND expires_at <= $2', [user.userId, Date.now()])).rows[0].n
    assert.equal(left, 0, `the next login sweeps the user's expired rows`)
  })
}
