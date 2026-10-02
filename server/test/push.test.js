// Web Push (VAPID) — enrollment, the honest unconfigured state, and the send.
//
// Part 1 runs everywhere: the sender's contract is exercised through an
// injected fake web-push module (the mailer.test.js transport-seam pattern),
// so no test here ever speaks to a real push service or network.
//
// Part 2 needs real PostgreSQL (the guard pattern of pairing-flow.test.js):
// subscribe/unsubscribe over real HTTP against the app as it is mounted, user
// scoping, dead-subscription cleanup, and the account-deletion purge. The
// runner executes test files in parallel, so this file gets its own schema.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

// The DSN decision has to happen before the first import of config.js:
// push.js → push.store.js → db.js builds its pool from DATABASE_URL at module
// load, so the test schema must already be in the environment by then.
const dsn = process.env.CB_TEST_DATABASE_URL
const HAS_DB = Boolean(dsn)
if (HAS_DB) {
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent('-c search_path=test_push')
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
}

const { config } = await import('../src/config.js')
const { sendToSubscriptions, isPushConfigured, _setWebPushForTests } = await import('../src/push.js')
const { webPush } = await import('../src/alerts/channels.js')
const { alertChannelStatus } = await import('../src/alerts/index.js')

// All database setup happens BEFORE any test() registration — the runner
// starts executing registered tests while the module body is still awaiting,
// so tests registered above a pending init() run against half-migrated
// tables. This exact overlap once deadlocked this file against its own
// schema creation; setup-first is the rule every other DB file here follows
// by keeping its awaits inside the guard ahead of its tests.
let pushServer = null
let pushPool = null
if (HAS_DB) {
  const { query, init, pool } = await import('../src/db.js')
  await query('CREATE SCHEMA IF NOT EXISTS test_push')
  await init()
  const { createApp } = await import('../src/index.js')
  const app = createApp()
  pushServer = app.listen(0)
  await new Promise((r) => pushServer.once('listening', r))
  pushPool = pool
}

const realPush = { ...config.push }
test.after(() => {
  Object.assign(config.push, realPush)
  _setWebPushForTests(null)
  if (pushServer) pushServer.close()
  if (pushPool) return pushPool.end()
})

const clearVapid = () => { config.push.publicKey = ''; config.push.privateKey = '' }
const setVapid = () => {
  config.push.publicKey = 'BTestPublicKey-test-test-test-test-test-test-test'
  config.push.privateKey = 'OTestPrivateKey-test-test-test-test'
}

/** Install a fake web-push module; returns what it was called with. */
function fakeWebPush(sendImpl) {
  const seen = { vapid: null, calls: [] }
  _setWebPushForTests({
    setVapidDetails: (subject, publicKey, privateKey) => {
      seen.vapid = { subject, publicKey, privateKey }
    },
    sendNotification: async (sub, payload) => {
      seen.calls.push({ sub, payload: JSON.parse(payload) })
      if (sendImpl) return sendImpl(sub, payload)
    },
  })
  return seen
}

const SUB_ROW = (endpoint) => ({
  id: 'psub_test',
  endpoint,
  p256dh: 'p256dh-key-material',
  auth: 'auth-key-material',
})

// ---- Part 1 · the sender and its honesty (no database) ----------------------

test('an unconfigured deployment is a supported state: not_configured, and no push service is touched', async () => {
  clearVapid()
  assert.equal(isPushConfigured(), false)
  // Only one half set is still not configured: a VAPID pair must be a pair.
  config.push.publicKey = 'only-the-public-half'
  assert.equal(isPushConfigured(), false)
  setVapid()
  assert.equal(isPushConfigured(), true)
})

test('no subscription enrolled is its own honest answer, distinct from not configured', async () => {
  setVapid()
  const seen = fakeWebPush()
  const r = await sendToSubscriptions([], { title: 't' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_subscription')
  assert.equal(seen.calls.length, 0, 'nothing to send to, nobody called')
})

test('an accepted send carries the config VAPID pair and the sw.js payload shape, and never claims "read"', async () => {
  setVapid()
  const seen = fakeWebPush()
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123'

  const r = await sendToSubscriptions([SUB_ROW(endpoint)], { title: 'سایت پاسخ نمی‌دهد', body: 'شرح', url: '/site/s1', severity: 'critical' })

  assert.equal(seen.vapid.subject, config.push.subject)
  assert.equal(seen.vapid.publicKey, config.push.publicKey)
  assert.equal(seen.vapid.privateKey, config.push.privateKey)
  assert.equal(seen.calls.length, 1)
  assert.equal(seen.calls[0].sub.endpoint, endpoint)
  assert.deepEqual(seen.calls[0].sub.keys, { p256dh: 'p256dh-key-material', auth: 'auth-key-material' })
  assert.equal(seen.calls[0].payload.title, 'سایت پاسخ نمی‌دهد')
  assert.equal(seen.calls[0].payload.url, '/site/s1')

  assert.equal(r.ok, true)
  assert.equal(r.reason, 'accepted')
  assert.equal(r.accepted, 1)
  assert.equal(r.failed, 0)
  assert.deepEqual(r.removed, [])
  // "Provider accepted" is the ceiling: the note says so in plain words.
  assert.match(r.note, /پذیرفته شد/)
  assert.match(r.note, /تأیید نشده/)
})

test('a dead endpoint (410) is removed from the store, a server error (500) is kept', async () => {
  if (!HAS_DB) return // needs the store; the DB half re-proves this with real rows
  setVapid()
  const { pushSubscriptions } = await import('../src/push.store.js')
  const { query } = await import('../src/db.js')
  // The subscriptions FK points at a real user, so one is minted here and
  // deleted (cascading) at the end. Row ids are random on purpose: a second
  // copy of this file running against the same schema (a parallel suite run
  // on a shared container) must not collide on a fixed primary key.
  const uid = `push-send-${crypto.randomUUID()}`
  const goneId = 'psub-' + crypto.randomUUID()
  const brokenId = 'psub-' + crypto.randomUUID()
  await query(
    `INSERT INTO users (id, email, name, pass_hash, created_at)
     VALUES ($1, $2, 'Push Sender Test', 'not-a-real-hash', 1)`,
    [uid, `push-send-${crypto.randomUUID()}@test.local`]
  )
  await query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
     VALUES ($2, $1, 'https://push.test/gone', 'k', 'a', 1),
            ($3, $1, 'https://push.test/broken', 'k', 'a', 2)`,
    [uid, goneId, brokenId]
  )
  fakeWebPush((sub) => {
    if (sub.endpoint.endsWith('/gone')) {
      throw Object.assign(new Error('subscription gone'), { statusCode: 410 })
    }
    throw Object.assign(new Error('upstream exploded'), { statusCode: 500 })
  })

  const rows = await pushSubscriptions.allForUser(uid)
  const r = await sendToSubscriptions(rows, { title: 't' })

  assert.equal(r.ok, false, 'nothing was accepted')
  assert.equal(r.accepted, 0)
  assert.equal(r.failed, 1, 'a 500 is a failure, not a removal')
  assert.deepEqual(r.removed, [goneId], 'a 410 is a dead endpoint, removed')
  const left = await query('SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY id', [uid])
  assert.deepEqual(left.rows.map((x) => x.id), [brokenId])
  await query('DELETE FROM users WHERE id = $1', [uid])
})

test('the dispatcher channel skips honestly and sends honestly', async () => {
  setVapid()
  // No subscription enrolled: a skip, not a failure — same rule as every channel.
  const r0 = await webPush({ title: 't', body: 'b' }, {})
  assert.equal(r0.skipped, true)
  assert.match(r0.error, /اشتراک مرورگری ثبت نشده/)

  const seen = fakeWebPush()
  const r = await webPush(
    { title: 'هشدار: فروشگاه', body: 'بدنه', url: '/site/s1', severity: 'critical' },
    { pushSubscriptions: [SUB_ROW('https://push.test/dev1')] }
  )
  assert.equal(r.channel, 'web-push')
  assert.equal(r.ok, true)
  assert.equal(r.accepted, 1)
  assert.match(r.note, /تأیید نشده/)
  assert.equal(seen.calls[0].payload.title, 'هشدار: فروشگاه')

  // Unconfigured deployment: the channel does not exist there, and says why.
  clearVapid()
  const r2 = await webPush({ title: 't', body: 'b' }, { pushSubscriptions: [SUB_ROW('https://push.test/dev1')] })
  assert.equal(r2.skipped, true)
  assert.match(r2.error, /VAPID/)
})

test('alertChannelStatus names the VAPID variables when the channel is missing', () => {
  clearVapid()
  const s = alertChannelStatus()
  assert.ok(!s.live.includes('web-push'))
  assert.ok(s.missing.some((m) => m.includes('VAPID_PUBLIC_KEY')))
  setVapid()
  assert.ok(alertChannelStatus().live.includes('web-push'))
})

// ---- Part 2 · enrollment over real HTTP (needs PostgreSQL) -------------------
//
// Schema, init, and the HTTP server were all brought up at the top of the
// module, before any test registration (see the setup-first note there).

if (!HAS_DB) {
  test('push enrollment flow (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const { query } = await import('../src/db.js')
  const API = `http://127.0.0.1:${pushServer.address().port}/v1`

  // The register limiter is per-IP in this process; the sessions suite's
  // pattern applies it honestly (5/hour) while _reset keeps a file with more
  // than five accounts from tripping it.
  const { _reset } = await import('../src/security/ratelimit.js')
  const { issue } = await import('../src/security/captcha.js')

  const send = async (path, opts = {}) => {
    const res = await fetch(API + path, opts)
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 200) } }
    return { status: res.status, body }
  }

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  const solveCaptcha = () => {
    const c = issue()
    const ascii = c.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: c.id, captchaAnswer: String(answer) }
  }

  const newUser = async (name) => {
    _reset()
    const email = `push-${crypto.randomUUID()}@test.local`
    const { status, body } = await send('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'a-strong-password-123', name,
        ...solveCaptcha(),
      }),
    })
    assert.equal(status, 201, `registration failed: ${JSON.stringify(body)}`)
    return {
      email, password: 'a-strong-password-123', token: body.token,
      auth: { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' },
    }
  }

  const endpointFor = (tag) => `https://fcm.googleapis.com/fcm/send/${tag}-${crypto.randomUUID()}`
  const subBody = (endpoint) => JSON.stringify({
    endpoint,
    keys: { p256dh: 'p256dh-' + tag(), auth: 'auth-' + tag() },
  })
  const tag = () => crypto.randomBytes(6).toString('hex')
  const countFor = async (userId) =>
    Number((await query('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [userId])).rows[0].n)
  const userIdByEmail = async (email) =>
    (await query('SELECT id FROM users WHERE email = $1', [email])).rows[0].id

  test('unconfigured is honest everywhere: status, public-key, and subscribe all refuse', async () => {
    clearVapid()
    const u = await newUser('Push Unconfigured')

    const st = await send('/push/status', { headers: u.auth })
    assert.equal(st.status, 200)
    assert.equal(st.body.configured, false)
    assert.match(st.body.reason, /VAPID/)
    assert.deepEqual(st.body.subscriptions, [])

    const pk = await send('/push/public-key', { headers: u.auth })
    assert.equal(pk.status, 200, 'a deployment state is an answer, not an error')
    assert.equal(pk.body.configured, false)
    assert.match(pk.body.message, /VAPID/)

    const sub = await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody(endpointFor('unconf')) })
    assert.equal(sub.status, 503, 'a subscription that can never receive is refused, not stored')
    assert.match(sub.body.message, /VAPID/)
  })

  test('subscribe → status → public-key: enrollment is real, and never leaks keys or the full endpoint', async () => {
    setVapid()
    const u = await newUser('Push Enroll')
    const uid = await userIdByEmail(u.email)
    const endpoint = endpointFor('enroll')

    const sub = await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody(endpoint) })
    assert.equal(sub.status, 201, JSON.stringify(sub.body))
    assert.ok(sub.body.id)
    assert.equal(sub.body.endpointHost, 'fcm.googleapis.com')
    assert.equal(sub.body.endpointTail, endpoint.slice(-12))
    assert.equal(JSON.stringify(sub.body).includes(endpoint), false, 'the capability URL is not returned in full')
    assert.equal(JSON.stringify(sub.body).includes('p256dh-'), false, 'encryption keys never leave the server')

    const st = await send('/push/status', { headers: u.auth })
    assert.equal(st.body.configured, true)
    assert.equal(st.body.subscriptions.length, 1)
    assert.equal(st.body.subscriptions[0].id, sub.body.id)
    assert.equal(await countFor(uid), 1)

    const pk = await send('/push/public-key', { headers: u.auth })
    assert.equal(pk.body.configured, true)
    assert.equal(pk.body.publicKey, config.push.publicKey)
  })

  test('invalid subscriptions are refused: plain HTTP endpoint, missing keys, junk URL', async () => {
    setVapid()
    const u = await newUser('Push Invalid')
    for (const [bad, why] of [
      [JSON.stringify({ endpoint: 'http://insecure.test/x', keys: { p256dh: 'k', auth: 'a' } }), 'http endpoint'],
      [JSON.stringify({ endpoint: endpointFor('nokeys') }), 'missing keys'],
      [JSON.stringify({ endpoint: 'not a url', keys: { p256dh: 'k', auth: 'a' } }), 'junk url'],
      [JSON.stringify({}), 'nothing at all'],
    ]) {
      const r = await send('/push/subscribe', { method: 'POST', headers: u.auth, body: bad })
      assert.equal(r.status, 400, `${why} must be refused`)
    }
  })

  test('re-subscribing the same endpoint updates the row instead of duplicating it', async () => {
    setVapid()
    const u = await newUser('Push Upsert')
    const uid = await userIdByEmail(u.email)
    const endpoint = endpointFor('upsert')

    const first = await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody(endpoint) })
    const second = await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody(endpoint) })
    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    assert.equal(await countFor(uid), 1, 'one browser, one row')
  })

  test('unsubscribe is scoped to the owning account; a stranger cannot remove another user’s row', async () => {
    setVapid()
    const a = await newUser('Push Owner')
    const b = await newUser('Push Stranger')
    const uidA = await userIdByEmail(a.email)
    const endpoint = endpointFor('scoped')

    const sub = await send('/push/subscribe', { method: 'POST', headers: a.auth, body: subBody(endpoint) })

    const steal = await send('/push/unsubscribe', {
      method: 'POST', headers: b.auth,
      body: JSON.stringify({ endpoint }),
    })
    assert.equal(steal.status, 404, 'user B sees no such subscription of user A')
    assert.equal(await countFor(uidA), 1)

    const stealById = await send('/push/unsubscribe', {
      method: 'POST', headers: b.auth,
      body: JSON.stringify({ id: sub.body.id }),
    })
    assert.equal(stealById.status, 404, 'the id is scoped too')
    assert.equal(await countFor(uidA), 1)

    const own = await send('/push/unsubscribe', {
      method: 'POST', headers: a.auth,
      body: JSON.stringify({ id: sub.body.id }),
    })
    assert.equal(own.status, 200)
    assert.equal(own.body.ok, true)
    assert.equal(await countFor(uidA), 0)

    const again = await send('/push/unsubscribe', {
      method: 'POST', headers: a.auth,
      body: JSON.stringify({ id: sub.body.id }),
    })
    assert.equal(again.status, 404)
  })

  test('delivery removes a dead subscription (410) and keeps a failed one (500)', async () => {
    setVapid()
    const u = await newUser('Push Cleanup')
    const uid = await userIdByEmail(u.email)
    await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody('https://push.test/gone-' + tag()) })
    await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody('https://push.test/broken-' + tag()) })

    fakeWebPush((sub) => {
      if (sub.endpoint.includes('/gone-')) {
        throw Object.assign(new Error('gone'), { statusCode: 410 })
      }
      throw Object.assign(new Error('boom'), { statusCode: 500 })
    })
    const r = await sendToSubscriptions(await (await import('../src/push.store.js')).pushSubscriptions.allForUser(uid), { title: 't' })
    assert.equal(r.removed.length, 1)
    assert.equal(r.failed, 1)
    assert.equal(await countFor(uid), 1, 'only the dead row goes')
  })

  test('account deletion purges the subscriptions — they are enrolled contact material', async () => {
    setVapid()
    const u = await newUser('Push Delete')
    const uid = await userIdByEmail(u.email)
    await send('/push/subscribe', { method: 'POST', headers: u.auth, body: subBody('https://push.test/doomed-' + tag()) })
    assert.equal(await countFor(uid), 1)

    const del = await send('/account/delete', {
      method: 'POST', headers: u.auth,
      body: JSON.stringify({ password: u.password }),
    })
    assert.equal(del.status, 200, JSON.stringify(del.body))
    assert.equal(await countFor(uid), 0, 'nothing browser-scoped outlives the account')
  })
}
