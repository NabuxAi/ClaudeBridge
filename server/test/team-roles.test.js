// Per-site team roles on the site routes, and invitation acceptance at
// registration.
//
// Two behaviours are pinned here:
//
//   1. The membership layer (routes/sites.js, routes/offsite-backups.js):
//      an active member — admin or viewer — reads site views, while every
//      state change, setting, pairing action and job start answers 403 for
//      them and stays with the owner. The 403 must come BEFORE the route's
//      own 400s (unpaired site and the like), so a member probing for what
//      would work gets no different error map than the owner.
//   2. The no-account invitation path: POST /auth/register accepts the same
//      single-use invite token the email carries, spends it on the new
//      account, and honestly reports — without failing the registration —
//      when the token is expired, spent, or addressed to another email.
//
// Everything runs over real HTTP against createApp() with real PostgreSQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('team roles on site routes (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Own schema: the runner executes test files in parallel and every
  // database-touching file here creates the same table names.
  const TEST_SCHEMA = 'test_team_roles'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  const { createApp } = await import('../src/index.js')
  const { _reset: resetRateLimit } = await import('../src/security/ratelimit.js')

  const app = createApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  async function solveCaptcha() {
    const res = await fetch(`${API}/auth/captcha`)
    const body = await res.json()
    const ascii = body.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: body.id, captchaAnswer: String(answer) }
  }

  const authHeaders = (auth) => (auth ? { authorization: auth.authorization || auth } : {})

  async function request(method, path, body, auth) {
    const res = await fetch(API + path, {
      method,
      // Persian on purpose: these tests pin the reviewed Persian wording.
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'fa', ...authHeaders(auth) },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, body: data }
  }
  const post = (path, body, auth) => request('POST', path, body, auth)
  const patch = (path, body, auth) => request('PATCH', path, body, auth)
  const get = (path, auth) => request('GET', path, null, auth)

  // Registration is capped at 5/hour/IP and this file signs up a dozen-plus
  // accounts from 127.0.0.1; the limiter has its own tests. Reset per test so
  // a 429 never masquerades as a permission answer.
  test.beforeEach(() => { resetRateLimit() })

  /** Register; optionally carrying a team-invite token in the same request. */
  async function registerUser(email, inviteToken) {
    const { status, body } = await post('/auth/register', {
      name: 'Team Roles Test',
      email,
      password: 'a-strong-password-123',
      ...(await solveCaptcha()),
      ...(inviteToken ? { inviteToken } : {}),
    })
    assert.equal(status, 201, `register failed for ${email}: ${JSON.stringify(body)}`)
    return {
      authorization: `Bearer ${body.token}`,
      userId: body.user.id,
      email,
      invite: body.invite ?? null,
    }
  }

  async function createSite(auth, name) {
    const { status, body } = await post('/sites', { name, title: 'Team Roles Site' }, auth)
    assert.equal(status, 201, `createSite failed: ${JSON.stringify(body)}`)
    return body
  }

  async function invite(ownerAuth, siteId, email, role) {
    const { status, body } = await post(`/sites/${siteId}/team/invitations`, { email, role }, ownerAuth)
    assert.equal(status, 201, `invite failed: ${JSON.stringify(body)}`)
    return body.raw
  }

  /** Add an existing user as a member through the signed-in accept endpoint. */
  async function addMember(ownerAuth, siteId, memberAuth, role = 'viewer') {
    const raw = await invite(ownerAuth, siteId, memberAuth.email, role)
    const { status, body } = await post('/team/invitations/accept', { siteId, token: raw }, memberAuth)
    assert.equal(status, 201, `accept failed: ${JSON.stringify(body)}`)
    return body
  }

  test('an active member reads site views; a stranger gets 404, not 403', async () => {
    const owner = await registerUser(`tr-owner-read-${crypto.randomUUID()}@test.local`)
    const member = await registerUser(`tr-member-read-${crypto.randomUUID()}@test.local`)
    const stranger = await registerUser(`tr-stranger-read-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-read-${Date.now()}.ir`)
    await addMember(owner, site.id, member, 'admin')

    const ownerView = await get(`/sites/${site.id}/settings`, owner)
    assert.equal(ownerView.status, 200, JSON.stringify(ownerView.body))

    const memberView = await get(`/sites/${site.id}/settings`, member)
    assert.equal(memberView.status, 200, `member must read: ${JSON.stringify(memberView.body)}`)
    // Default authority of a fresh site, served from the real site row.
    assert.equal(memberView.body.authority, 'report')

    // A stranger must learn nothing: no 403 hinting the site exists.
    const strangerView = await get(`/sites/${site.id}/settings`, stranger)
    assert.equal(strangerView.status, 404)
  })

  test('a shared site shows in the member\'s site list with their role; strangers do not see it', async () => {
    const owner = await registerUser(`tr-owner-list-${crypto.randomUUID()}@test.local`)
    const member = await registerUser(`tr-member-list-${crypto.randomUUID()}@test.local`)
    const stranger = await registerUser(`tr-stranger-list-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-list-${Date.now()}.ir`)
    await addMember(owner, site.id, member, 'viewer')

    const ownerList = await get('/sites', owner)
    assert.equal(ownerList.status, 200)
    assert.deepEqual(ownerList.body.map((s) => [s.id, s.role]), [[site.id, 'owner']])

    const memberList = await get('/sites', member)
    assert.equal(memberList.status, 200)
    assert.deepEqual(memberList.body.map((s) => [s.id, s.role]), [[site.id, 'viewer']])
    assert.equal(memberList.body[0].secret, undefined, 'the list must never carry the pairing secret')

    const strangerList = await get('/sites', stranger)
    assert.deepEqual(strangerList.body, [])
  })

  test('admins manage the site, viewers only read; owner-only stays owner-only', async () => {
    const owner = await registerUser(`tr-owner-write-${crypto.randomUUID()}@test.local`)
    const admin = await registerUser(`tr-admin-write-${crypto.randomUUID()}@test.local`)
    const viewer = await registerUser(`tr-viewer-write-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-write-${Date.now()}.ir`)
    await addMember(owner, site.id, admin, 'admin')
    await addMember(owner, site.id, viewer, 'viewer')

    for (const member of [admin, viewer]) {
      // The authority level stays with the owner, for admins too.
      const res = await patch(`/sites/${site.id}/authority`, { authority: 'auto' }, member)
      assert.equal(res.status, 403, `${member.email} must not change authority`)
      assert.ok(
        String(res.body.message).includes('مالک'),
        `the 403 must carry the clear Persian message, got: ${res.body.message}`
      )

      // A capability token mints a download of the whole database dump —
      // owner-only, admins included.
      const token = await get(`/sites/${site.id}/backups/whatever/token`, member)
      assert.equal(token.status, 403, 'members must not mint backup download tokens')

      // And the download stream itself is owner-only too: the dump (user_pass
      // hashes, options, content) is not one of the views a member may read.
      // The 403 must precede the unpaired-site 400.
      const download = await get(`/sites/${site.id}/backups/whatever/download`, member)
      assert.equal(download.status, 403, 'members must not stream the backup dump with their own session')
      assert.notEqual(download.body.message, 'سایت متصل نیست.')
    }

    // Site operations (platform 0.7.0): a viewer is refused BEFORE the
    // route's own 400 — the membership 403 must win, proving the guard runs
    // first — while an admin passes the gate and gets the same honest
    // refusal as the owner would (the site is not paired yet).
    const viewerScan = await post(`/sites/${site.id}/scan`, {}, viewer)
    assert.equal(viewerScan.status, 403, 'membership 403 must precede the unpaired-site 400')
    assert.ok(String(viewerScan.body.message).includes('مدیر'), viewerScan.body.message)
    const adminScan = await post(`/sites/${site.id}/scan`, {}, admin)
    assert.equal(adminScan.status, 400, JSON.stringify(adminScan.body))
    assert.equal(adminScan.body.message, 'سایت متصل نیست.')
    // An admin changes settings for real.
    const adminPolicy = await patch(`/sites/${site.id}/update-policy`, { autoThemes: false }, admin)
    assert.equal(adminPolicy.status, 200, JSON.stringify(adminPolicy.body))
    const viewerPolicy = await patch(`/sites/${site.id}/update-policy`, { autoThemes: true }, viewer)
    assert.equal(viewerPolicy.status, 403)

    const ownerPass = await patch(`/sites/${site.id}/authority`, { authority: 'auto' }, owner)
    assert.equal(ownerPass.status, 200, JSON.stringify(ownerPass.body))
    assert.equal(ownerPass.body.authority, 'auto')

    // The mint → download pair stays owner-only end to end: the owner mints
    // the capability token, and the download route lets it through the same
    // ownership gate with no Authorization header at all — the token in the
    // query string is the credential (native browser download). The site is
    // unpaired here, so the honest refusal is the route's own 400, not a 403.
    const mint = await get(`/sites/${site.id}/backups/whatever/token`, owner)
    assert.equal(mint.status, 200, JSON.stringify(mint.body))
    const downloadAsOwner = await get(
      `/sites/${site.id}/backups/whatever/download?token=${encodeURIComponent(mint.body.token)}`,
      null
    )
    assert.equal(downloadAsOwner.status, 400, JSON.stringify(downloadAsOwner.body))
    assert.equal(downloadAsOwner.body.message, 'سایت متصل نیست.')
  })

  test('register with an invite token creates the membership in one step', async () => {
    const owner = await registerUser(`tr-owner-reg-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-reg-${Date.now()}.ir`)
    const email = `tr-invitee-${crypto.randomUUID()}@test.local`
    const raw = await invite(owner, site.id, email, 'admin')

    const user = await registerUser(email, raw)
    assert.ok(user.invite, 'the response must carry the invite outcome')
    assert.equal(user.invite.applied, true, JSON.stringify(user.invite))
    assert.equal(user.invite.member.role, 'admin')
    assert.equal(user.invite.member.email, email)

    // The new member reads, but does not write.
    const view = await get(`/sites/${site.id}/settings`, user)
    assert.equal(view.status, 200)
    const res = await patch(`/sites/${site.id}/authority`, { authority: 'auto' }, user)
    assert.equal(res.status, 403)

    // The owner's list shows the stored role and the honest effective access.
    const list = await get(`/sites/${site.id}/team`, owner)
    assert.equal(list.status, 200)
    assert.equal(list.body.members.length, 1)
    assert.equal(list.body.members[0].role, 'admin')
    assert.equal(list.body.members[0].effective.level, 'manage')
    assert.ok(list.body.members[0].effective.label.startsWith('مدیریت سایت'))
  })

  test('a spent invitation token does not work again', async () => {
    const owner = await registerUser(`tr-owner-spent-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-spent-${Date.now()}.ir`)
    const email = `tr-spent-${crypto.randomUUID()}@test.local`
    const raw = await invite(owner, site.id, email, 'viewer')

    const user = await registerUser(email, raw)
    assert.equal(user.invite.applied, true)

    // The login-path accept endpoint must refuse the same, now-spent token.
    const again = await post('/team/invitations/accept', { siteId: site.id, token: raw }, user)
    assert.equal(again.status, 400)
    assert.match(String(again.body.message), /استفاده|منقضی/)

    // And a second registration with the spent token applies nothing.
    const other = await registerUser(`tr-other-${crypto.randomUUID()}@test.local`, raw)
    assert.equal(other.invite.applied, false, 'a spent token must not apply on register')
    assert.match(String(other.invite.error), /استفاده|منقضی/)
    const list = await get(`/sites/${site.id}/team`, owner)
    assert.equal(list.body.members.length, 1, 'no second membership from the spent token')
  })

  test('an expired invitation is refused at registration and at accept', async () => {
    const owner = await registerUser(`tr-owner-exp-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-exp-${Date.now()}.ir`)
    const email = `tr-exp-${crypto.randomUUID()}@test.local`
    const raw = await invite(owner, site.id, email, 'viewer')

    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    await query('UPDATE invitations SET expires_at = $2 WHERE token_hash = $1', [tokenHash, Date.now() - 1000])

    const user = await registerUser(email, raw)
    assert.equal(user.invite.applied, false, 'an expired token must not apply')
    assert.match(String(user.invite.error), /منقضی/)
    assert.equal(user.invite.member, undefined)

    const viaAccept = await post('/team/invitations/accept', { siteId: site.id, token: raw }, user)
    assert.equal(viaAccept.status, 400)

    const list = await get(`/sites/${site.id}/team`, owner)
    assert.equal(list.body.members.length, 0, 'no membership from an expired invitation')
    assert.equal(list.body.invitations.length, 0, 'the expired invitation no longer shows as pending')
  })

  test('registering with a different email than invited applies nothing and spends nothing', async () => {
    const owner = await registerUser(`tr-owner-miss-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-miss-${Date.now()}.ir`)
    const invitedEmail = `tr-miss-a-${crypto.randomUUID()}@test.local`
    const raw = await invite(owner, site.id, invitedEmail, 'viewer')

    const wrong = await registerUser(`tr-miss-b-${crypto.randomUUID()}@test.local`, raw)
    assert.equal(wrong.invite.applied, false)
    assert.match(String(wrong.invite.error), /ایمیل دیگری/)
    assert.equal(wrong.invite.member, undefined, 'no membership for the wrong address')
    const listAfterWrong = await get(`/sites/${site.id}/team`, owner)
    assert.equal(listAfterWrong.body.members.length, 0)

    // A refusal must not burn the token: the invited address can still use it.
    const right = await registerUser(invitedEmail, raw)
    assert.equal(right.invite.applied, true, JSON.stringify(right.invite))
    const listAfterRight = await get(`/sites/${site.id}/team`, owner)
    assert.equal(listAfterRight.body.members.length, 1)
    assert.equal(listAfterRight.body.members[0].email, invitedEmail)
  })

  test('clashroyale.ir has one guest seat across simultaneous invitation accepts', async () => {
    const owner = await registerUser(`cap-owner-${crypto.randomUUID()}@test.local`)
    const first = await registerUser(`cap-first-${crypto.randomUUID()}@test.local`)
    const second = await registerUser(`cap-second-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, 'https://clashroyale.ir/')
    const duplicate = await post('/sites', { name: 'http://www.clashroyale.ir/' }, first)
    assert.equal(duplicate.status, 409)
    assert.match(duplicate.body.message, /دعوت/)
    assert.equal(duplicate.body.pairing, undefined)
    assert.equal((await get('/sites', first)).body.length, 0)

    const firstInvite = await invite(owner, site.id, first.email, 'viewer')
    const secondInvite = await invite(owner, site.id, second.email, 'viewer')
    const newEmail = `cap-new-${crypto.randomUUID()}@test.local`
    const newInvite = await invite(owner, site.id, newEmail, 'viewer')
    const accept = (user, token) => post('/team/invitations/accept', { siteId: site.id, token }, user)
    const [firstResult, secondResult] = await Promise.all([
      accept(first, firstInvite),
      accept(second, secondInvite),
    ])
    assert.deepEqual([firstResult.status, secondResult.status].sort(), [201, 409])
    const [winner, loser, loserInvite, winningMember] = firstResult.status === 201
      ? [first, second, secondInvite, firstResult.body]
      : [second, first, firstInvite, secondResult.body]
    assert.deepEqual((await get('/sites', winner)).body.map(({ id, role }) => ({ id, role })), [
      { id: site.id, role: 'viewer' },
    ])
    assert.equal((await get('/sites', loser)).body.length, 0)

    const signup = await registerUser(newEmail, newInvite)
    assert.equal(signup.invite.applied, false)
    assert.match(signup.invite.error, /مالک و یک عضو/)
    const full = await post(
      `/sites/${site.id}/team/invitations`,
      { email: 'extra@test.local', role: 'viewer' },
      owner
    )
    assert.equal(full.status, 409)
    assert.match(full.body.message, /مالک و یک عضو/)

    const removed = await request('DELETE', `/sites/${site.id}/team/members/${winningMember.id}`, null, owner)
    assert.equal(removed.status, 200)
    assert.equal((await get('/sites', winner)).body.length, 0)
    assert.equal((await accept(loser, loserInvite)).status, 201)
  })

  test('a legacy www root shares the cap; separate WordPress paths keep their team behavior', async () => {
    const owner = await registerUser(`alias-owner-${crypto.randomUUID()}@test.local`)
    const first = await registerUser(`alias-first-${crypto.randomUUID()}@test.local`)
    const second = await registerUser(`alias-second-${crypto.randomUUID()}@test.local`)
    await query(
      "INSERT INTO sites (id, user_id, name, url, created_at) VALUES ('www-bodogame-com', $1, 'www.bodogame.com', 'https://www.bodogame.com', $2)",
      [owner.userId, Date.now()]
    )
    const duplicate = await post('/sites', { name: 'https://bodogame.com' }, first)
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.pairing, undefined)
    await addMember(owner, 'www-bodogame-com', first)
    const full = await post('/sites/www-bodogame-com/team/invitations', { email: second.email, role: 'viewer' }, owner)
    assert.equal(full.status, 409)

    const folder = await createSite(owner, 'https://bodogame.com/shop')
    await addMember(owner, folder.id, first)
    await addMember(owner, folder.id, second)
    assert.equal((await get(`/sites/${folder.id}/team`, owner)).body.members.length, 2)
  })

  test('only the owner can issue a new connection key, and only with an explicit confirm', async () => {
    const owner = await registerUser(`tr-owner-key-${crypto.randomUUID()}@test.local`)
    const admin = await registerUser(`tr-admin-key-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-key-${Date.now()}.ir`)
    await addMember(owner, site.id, admin, 'admin')
    const before = site.pairing.secret
    await query("UPDATE sites SET paired = true, status = 'healthy' WHERE id = $1", [site.id])

    const byAdmin = await post(`/sites/${site.id}/connection-key`, { confirm: true }, admin)
    assert.equal(byAdmin.status, 403, 'a credential stays with the owner, admins included')

    const unconfirmed = await post(`/sites/${site.id}/connection-key`, {}, owner)
    assert.equal(unconfirmed.status, 400)
    assert.equal((await query('SELECT secret FROM sites WHERE id = $1', [site.id])).rows[0].secret, before, 'nothing changes without confirm')

    const issued = await post(`/sites/${site.id}/connection-key`, { confirm: true }, owner)
    assert.equal(issued.status, 200, JSON.stringify(issued.body))
    assert.match(issued.body.pairing.secret, /^[a-f0-9]{64}$/)
    assert.notEqual(issued.body.pairing.secret, before)
    assert.ok(issued.body.pairing.serverUrl)

    const row = (await query('SELECT secret, paired, status FROM sites WHERE id = $1', [site.id])).rows[0]
    assert.equal(row.secret, issued.body.pairing.secret)
    assert.equal(row.paired, false, 'the site reads as unpaired until the plugin holds the new key')
    assert.equal(row.status, 'checking')

    // The key appears in that one response and nowhere else.
    const list = await get('/sites', owner)
    assert.equal(JSON.stringify(list.body).includes(issued.body.pairing.secret), false)
    const pairing = await get(`/sites/${site.id}/pairing`, owner)
    assert.equal(JSON.stringify(pairing.body).includes(issued.body.pairing.secret), false)

    let audit = null
    for (let i = 0; i < 20 && !audit; i++) {
      audit = (await query("SELECT detail FROM events WHERE site_id = $1 AND title = 'New connection key issued'", [site.id])).rows[0]
      if (!audit) await new Promise((r) => setTimeout(r, 50))
    }
    assert.ok(audit, 'the reissue is on the audit trail')
    assert.equal(JSON.stringify(audit).includes(issued.body.pairing.secret), false, 'the audit row never holds the key')
  })

  test.after(async () => {
    server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
