// Uptime monitors: CRUD, permissions, the per-site cap, result recording,
// 7/30-day availability with episode counting, disabled/tombstoned monitors
// not being checked, and retention pruning.
//
// Every monitor check runs against an injected global fetch (the
// mailer.test.js pattern) — no test in this file touches a real network.
// Everything else runs over real HTTP against createApp() with real PostgreSQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('uptime monitors (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Own schema: the runner executes test files in parallel and every
  // database-touching file here creates the same table names.
  const TEST_SCHEMA = 'test_monitors'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.LIVE = '1'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { createApp } = await import('../src/index.js')
  const { _reset: resetRateLimit } = await import('../src/security/ratelimit.js')
  const { signToken, verifyToken } = await import('../src/auth.js')
  const { users, sites } = await import('../src/store.js')
  const { sessions: sessionsStore } = await import('../src/sessions.store.js')
  const { runMonitorChecks } = await import('../src/monitors.runner.js')
  const { _forcePruneForTests } = await import('../src/monitors.store.js')

  const app = createApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  // The real fetch, saved for OUR api calls: when a test replaces
  // globalThis.fetch with a fake for the monitor runner, the test's own
  // requests to the API under test must keep going through the real stack.
  const realFetch = globalThis.fetch

  const send = async (method, path, body, auth) => {
    const res = await realFetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth.authorization } : {}) },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, body: data }
  }
  const get = (path, auth) => send('GET', path, null, auth)
  const post = (path, body, auth) => send('POST', path, body, auth)
  const patch = (path, body, auth) => send('PATCH', path, body, auth)
  const del = (path, auth) => send('DELETE', path, null, auth)

  /** Install a fake fetch for the monitor runner; returns every call it saw. */
  function fakeFetch(impl) {
    const seen = { calls: [] }
    globalThis.fetch = async (url, opts) => {
      seen.calls.push({ url: String(url) })
      return impl(String(url), opts)
    }
    return seen
  }

  const OWNER_RESULT = (status, body = 'ok') => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    text: async () => body,
    body: { cancel: async () => {} },
  })

  async function owner() {
    const user = await users.create({
      email: `mon-${crypto.randomUUID()}@test.local`,
      name: 'Monitor Test',
      password: 'a-strong-password-123',
    })
    const token = signToken({ sub: user.id, name: user.name })
    // requireAuth resolves a token's jti to a live sessions row, so the minted
    // token needs its session written — exactly what login would have done.
    await sessionsStore.create({ userId: user.id, jti: verifyToken(token).jti, device: 'test', ip: '127.0.0.1' })
    return { user, authorization: `Bearer ${token}`, email: user.email }
  }

  async function makeSite(auth) {
    const site = await sites.add(auth.user.id, { name: `mon-${crypto.randomUUID()}.test`, title: 'Monitor Site' })
    return site
  }

  /** Add an existing user as a member through the signed-in accept endpoint. */
  async function addMember(ownerAuth, siteId, memberAuth, role = 'viewer') {
    const inv = await post(`/sites/${siteId}/team/invitations`, { email: memberAuth.email, role }, ownerAuth)
    assert.equal(inv.status, 201, `invite failed: ${JSON.stringify(inv.body)}`)
    const accepted = await post('/team/invitations/accept', { siteId, token: inv.body.raw }, memberAuth)
    assert.equal(accepted.status, 201, `accept failed: ${JSON.stringify(accepted.body)}`)
  }

  const goodBody = (overrides = {}) => ({
    label: 'صفحهٔ اصلی',
    url: 'https://site.example.com/',
    ...overrides,
  })

  test.beforeEach(() => { resetRateLimit() })
  test.after(async () => {
    globalThis.fetch = realFetch
    server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })

  // ---- CRUD + permissions ----------------------------------------

  test('owner creates, edits, lists and deletes a monitor; validation is honest', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    const noLabel = await post(`/sites/${site.id}/monitors`, { url: 'https://x.example.com/' }, auth)
    assert.equal(noLabel.status, 400)

    const badUrl = await post(`/sites/${site.id}/monitors`, goodBody({ url: 'not a url' }), auth)
    assert.equal(badUrl.status, 400)

    const badScheme = await post(`/sites/${site.id}/monitors`, goodBody({ url: 'ftp://x.example.com/' }), auth)
    assert.equal(badScheme.status, 400)

    const badStatus = await post(`/sites/${site.id}/monitors`, goodBody({ expectStatus: 999 }), auth)
    assert.equal(badStatus.status, 400)

    const created = await post(`/sites/${site.id}/monitors`, goodBody(), auth)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.label, 'صفحهٔ اصلی')
    assert.equal(created.body.url, 'https://site.example.com/')
    assert.equal(created.body.expectStatus, 200, 'expect_status defaults to 200')
    assert.equal(created.body.expectContains, null)
    assert.equal(created.body.enabled, true)
    assert.ok(created.body.id.startsWith('mon_'))

    const listed = await get(`/sites/${site.id}/monitors`, auth)
    assert.equal(listed.status, 200)
    assert.equal(listed.body.monitors.length, 1)
    assert.equal(listed.body.limit, 10)
    assert.ok(
      String(listed.body.scope).includes('بررسی دسترسی HTTP'),
      'the honest scope label must travel with the response'
    )
    assert.equal(listed.body.monitors[0].lastResult, null, 'no checks yet, no fabricated last result')
    assert.equal(listed.body.monitors[0].days7.measured, false)
    assert.equal(listed.body.monitors[0].days7.percent, null, 'unmeasured must be null, not zero')

    const edited = await patch(`/sites/${site.id}/monitors/${created.body.id}`, {
      label: 'درگاه پرداخت', expectStatus: 204, expectContains: 'پردازش شد', enabled: false,
    }, auth)
    assert.equal(edited.status, 200)
    assert.equal(edited.body.label, 'درگاه پرداخت')
    assert.equal(edited.body.expectStatus, 204)
    assert.equal(edited.body.expectContains, 'پردازش شد')
    assert.equal(edited.body.enabled, false)

    const removed = await del(`/sites/${site.id}/monitors/${created.body.id}`, auth)
    assert.equal(removed.status, 200)
    assert.equal(removed.body.ok, true)

    const after = await get(`/sites/${site.id}/monitors`, auth)
    assert.equal(after.body.monitors.length, 0)

    const ghost = await patch(`/sites/${site.id}/monitors/mon_missing`, { label: 'x' }, auth)
    assert.equal(ghost.status, 404)
  })

  test('a member reads monitors but every write stays owner-only; a stranger learns nothing', async () => {
    const ownerAuth = await owner()
    const member = await owner()
    const stranger = await owner()
    const site = await makeSite(ownerAuth)
    await addMember(ownerAuth, site.id, member, 'admin')

    const created = await post(`/sites/${site.id}/monitors`, goodBody(), ownerAuth)
    assert.equal(created.status, 201)

    const memberList = await get(`/sites/${site.id}/monitors`, member)
    assert.equal(memberList.status, 200, 'an active member must read the monitors')
    assert.equal(memberList.body.monitors.length, 1)

    const memberPost = await post(`/sites/${site.id}/monitors`, goodBody({ label: 'دوم' }), member)
    assert.equal(memberPost.status, 403)
    assert.ok(String(memberPost.body.message).includes('مالک'), JSON.stringify(memberPost.body))

    const memberPatch = await patch(`/sites/${site.id}/monitors/${created.body.id}`, { enabled: false }, member)
    assert.equal(memberPatch.status, 403)

    const memberDelete = await del(`/sites/${site.id}/monitors/${created.body.id}`, member)
    assert.equal(memberDelete.status, 403)

    // Manual check fires an outbound request at the URL — a write, not a read.
    const memberCheck = await post(`/sites/${site.id}/monitors/${created.body.id}/check`, {}, member)
    assert.equal(memberCheck.status, 403)

    const strangerList = await get(`/sites/${site.id}/monitors`, stranger)
    assert.equal(strangerList.status, 404, 'existence is not disclosed to strangers')

    // Even a valid id is unreachable across owners: the store scopes by site.
    const otherSite = await makeSite(stranger)
    const cross = await del(`/sites/${otherSite.id}/monitors/${created.body.id}`, stranger)
    assert.equal(cross.status, 404)
  })

  test('the per-site cap is 10, and the refusal names its code', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    for (let i = 0; i < 10; i++) {
      const r = await post(`/sites/${site.id}/monitors`, goodBody({ label: `مانیتور ${i + 1}`, url: `https://site.example.com/${i}` }), auth)
      assert.equal(r.status, 201, `create #${i + 1} failed: ${JSON.stringify(r.body)}`)
    }
    const over = await post(`/sites/${site.id}/monitors`, goodBody({ label: 'یازدهم' }), auth)
    assert.equal(over.status, 400)
    assert.equal(over.body.code, 'monitor_limit_reached', JSON.stringify(over.body))

    // Disabled monitors hold their slot too — a cap that only counts enabled
    // rows would let a parked monitor fleet grow without bound.
    const first = (await get(`/sites/${site.id}/monitors`, auth)).body.monitors[0]
    await patch(`/sites/${site.id}/monitors/${first.id}`, { enabled: false }, auth)
    const still = await post(`/sites/${site.id}/monitors`, goodBody({ label: 'دوباره' }), auth)
    assert.equal(still.status, 400)
  })

  test('concurrent creates cannot slip past the cap — the count is taken under a lock', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    // Fourteen writes land at once. Count-then-insert without a lock lets the
    // whole batch through: every request reads the same pre-insert count. The
    // advisory lock in monitors.store.js create() serializes them, so exactly
    // ten may win and the four refusals must name the cap's code — no 500s,
    // no duplicates, no eleventh row.
    const results = await Promise.all(Array.from({ length: 14 }, (_, i) =>
      post(`/sites/${site.id}/monitors`, goodBody({ label: `هم‌زمان ${i + 1}`, url: `https://site.example.com/c${i}` }), auth)
    ))
    const won = results.filter((r) => r.status === 201)
    const refused = results.filter((r) => r.status === 400 && r.body.code === 'monitor_limit_reached')
    assert.equal(won.length, 10, `exactly 10 may win, statuses: ${JSON.stringify(results.map((r) => r.status))}`)
    assert.equal(refused.length, 4, `the other 4 must be honest cap refusals: ${JSON.stringify(results.filter((r) => r.status !== 201).map((r) => r.body))}`)

    const n = (await query('SELECT COUNT(*)::int AS n FROM site_monitors WHERE site_id = $1', [site.id])).rows[0].n
    assert.equal(n, 10, 'no row may exist beyond the cap')
  })

  // ---- Result recording + availability ---------------------------

  test('checks are recorded as attempts, and 7/30-day availability counts episodes not raw failures', async () => {
    const auth = await owner()
    const site = await makeSite(auth)
    const created = await post(`/sites/${site.id}/monitors`, goodBody(), auth)
    const id = created.body.id

    // A row of attempts: up, down, down, up, down → 2 ok / 5 total, two
    // distinct outage episodes (the two consecutive downs are ONE outage).
    const impls = [200, 500, 500, 200, 503]
    const seen = fakeFetch(async () => OWNER_RESULT(impls.length > 1 ? impls.shift() : impls[0]))

    for (let i = 0; i < 5; i++) {
      const r = await post(`/sites/${site.id}/monitors/${id}/check`, {}, auth)
      assert.equal(r.status, 200, JSON.stringify(r.body))
      assert.equal(r.body.scope.includes('بررسی دسترسی HTTP'), true)
    }
    assert.equal(seen.calls.length, 5, 'all five checks went through the injected fetch')
    assert.equal(impls.length, 1, 'all five injected answers were consumed')

    const listed = await get(`/sites/${site.id}/monitors`, auth)
    const m = listed.body.monitors.find((x) => x.id === id)
    assert.ok(m, 'the monitor must be listed')
    assert.equal(m.lastResult.status, 503, 'the newest attempt is the last result')
    assert.equal(m.lastResult.ok, false)
    assert.equal(typeof m.lastResult.ms, 'number')

    assert.equal(m.days7.measured, true)
    assert.equal(m.days7.checks, 5)
    assert.equal(m.days7.percent, 40, '2 of 5 attempts succeeded')
    assert.equal(m.days7.incidents, 2, 'down-down is one outage, not two')

    assert.equal(m.days30.measured, true)
    assert.deepEqual(m.days30, m.days7, 'the same attempts fill both windows identically')

    // The history endpoint returns the attempts, failures included.
    const results = await get(`/sites/${site.id}/monitors/${id}/results`, auth)
    assert.equal(results.status, 200)
    assert.equal(results.body.results.length, 5)
    assert.equal(results.body.results.filter((r) => !r.ok).length, 3)

    // Site status response: the same history, plus the honest scope label.
    const overview = await get(`/sites/${site.id}/overview`, auth)
    assert.equal(overview.status, 200)
    assert.equal(overview.body.uptime.days7.percent, 40)
    assert.equal(overview.body.uptime.days7.incidents, 2)
    assert.ok(
      String(overview.body.uptime.scope).includes('بررسی دسترسی HTTP'),
      'the overview must say this is HTTP reachability, not a user journey'
    )
  })

  test('expect_contains catches a 200 that does not carry the expected content; expect_status is honoured', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    const contains = await post(`/sites/${site.id}/monitors`, goodBody({
      label: 'سلامت', url: 'https://site.example.com/health', expectContains: 'پردازش شد',
    }), auth)
    assert.equal(contains.status, 201)

    fakeFetch(async () => OWNER_RESULT(200, 'سفارش شما پردازش شد'))
    const good = await post(`/sites/${site.id}/monitors/${contains.body.id}/check`, {}, auth)
    assert.equal(good.body.result.ok, true, JSON.stringify(good.body))

    fakeFetch(async () => OWNER_RESULT(200, 'خطای کش — ناموجود'))
    const bad = await post(`/sites/${site.id}/monitors/${contains.body.id}/check`, {}, auth)
    assert.equal(bad.body.result.ok, false, 'a 200 without the expected content is not an uptime success')
    assert.ok(String(bad.body.result.error).includes('عبارت'), JSON.stringify(bad.body.result))

    const custom = await post(`/sites/${site.id}/monitors`, goodBody({
      label: 'سلامت قدیمی', url: 'https://site.example.com/legacy', expectStatus: 204,
    }), auth)
    assert.equal(custom.status, 201)
    fakeFetch(async () => OWNER_RESULT(204, ''))
    const ok204 = await post(`/sites/${site.id}/monitors/${custom.body.id}/check`, {}, auth)
    assert.equal(ok204.body.result.ok, true)

    // A connection failure is an attempt with no status — recorded, not skipped.
    fakeFetch(async () => { throw new Error('ECONNREFUSED') })
    const down = await post(`/sites/${site.id}/monitors/${custom.body.id}/check`, {}, auth)
    assert.equal(down.body.result.ok, false)
    assert.equal(down.body.result.status, null)
    assert.ok(down.body.result.error)
  })

  test('a site with monitors but no checks reports «اندازه‌گیری نشده», never a green zero', async () => {
    const auth = await owner()
    const site = await makeSite(auth)
    await post(`/sites/${site.id}/monitors`, goodBody(), auth)

    const overview = await get(`/sites/${site.id}/overview`, auth)
    assert.equal(overview.status, 200)
    assert.equal(overview.body.uptime.days7.measured, false)
    assert.equal(overview.body.uptime.days7.percent, null, 'no data must not become 0 or 100')
    assert.equal(overview.body.uptime.days30.incidents, null)

    // And a site that never had a monitor answers the same shape.
    const bare = await makeSite(auth)
    const other = await get(`/sites/${bare.id}/overview`, auth)
    assert.equal(other.body.uptime.days7.measured, false)
    assert.equal(other.body.uptime.days7.percent, null)
  })

  // ---- The scheduler path ----------------------------------------

  test('the scheduled runner checks enabled monitors of live sites and skips the rest', async () => {
    const auth = await owner()
    const site = await makeSite(auth)

    const enabled = await post(`/sites/${site.id}/monitors`, goodBody({ url: 'https://enabled.example.test/' }), auth)
    const disabled = await post(`/sites/${site.id}/monitors`, goodBody({ label: 'خاموش', url: 'https://disabled.example.test/' }), auth)
    await patch(`/sites/${site.id}/monitors/${disabled.body.id}`, { enabled: false }, auth)

    const dead = await makeSite(auth)
    const tombstoned = await post(`/sites/${dead.id}/monitors`, goodBody({ label: 'tombstoned', url: 'https://tombstoned.example.test/' }), auth)

    // Tombstone the site the way account deletion does.
    await query("UPDATE sites SET status = 'deleted' WHERE id = $1", [dead.id])

    const seen = fakeFetch(async () => OWNER_RESULT(200, 'fine'))
    const summary = await runMonitorChecks({ trigger: 'test' })

    assert.equal(summary.trigger, 'test')
    const urls = seen.calls.map((c) => c.url)
    assert.ok(urls.includes('https://enabled.example.test/'), 'an enabled monitor of a live site is checked')
    assert.ok(!urls.includes('https://disabled.example.test/'), 'a disabled monitor is not checked')
    assert.ok(!urls.includes('https://tombstoned.example.test/'), 'a monitor of a tombstoned site is not checked')

    const listed = await get(`/sites/${site.id}/monitors`, auth)
    const off = listed.body.monitors.find((m) => m.id === disabled.body.id)
    assert.equal(off.lastResult, null, 'skipped monitors keep no fabricated reading')
    assert.equal(off.days7.measured, false)

    // Re-enabled, the monitor is checked again.
    await patch(`/sites/${site.id}/monitors/${disabled.body.id}`, { enabled: true }, auth)
    seen.calls.length = 0
    await runMonitorChecks({ trigger: 'test' })
    assert.ok(
      seen.calls.some((c) => c.url === 'https://disabled.example.test/'),
      'a re-enabled monitor rejoins the schedule'
    )
    const reListed = await get(`/sites/${site.id}/monitors`, auth)
    const backOn = reListed.body.monitors.find((m) => m.id === disabled.body.id)
    assert.equal(backOn.lastResult.ok, true)
  })

  test('results past the retention window are pruned; fresh ones stay', async () => {
    const auth = await owner()
    const site = await makeSite(auth)
    const created = await post(`/sites/${site.id}/monitors`, goodBody(), auth)

    // One stale attempt (40 days old — outside the 35-day retention) and one
    // fresh one, both written the way the runner writes them.
    const staleId = 'monr_stale_' + crypto.randomBytes(4).toString('hex')
    const freshId = 'monr_fresh_' + crypto.randomBytes(4).toString('hex')
    await query(
      `INSERT INTO monitor_results (id, monitor_id, site_id, ok, status, ms, checked_at)
       VALUES ($1,$2,$3,true,200,10,$4), ($5,$2,$3,false,500,20,$6)`,
      [staleId, created.body.id, site.id, Date.now() - 40 * 24 * 60 * 60 * 1000, freshId, Date.now()],
    )

    await _forcePruneForTests()

    const { rows } = await query('SELECT id FROM monitor_results WHERE monitor_id = $1', [created.body.id])
    const ids = rows.map((r) => r.id)
    assert.ok(!ids.includes(staleId), 'the stale attempt must be pruned')
    assert.ok(ids.includes(freshId), 'the fresh attempt must stay')
  })
}
