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
      headers: { 'Content-Type': 'application/json', ...authHeaders(auth) },
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

  test('writes of lower-role members are 403 before route-specific 400s; owner passes', async () => {
    const owner = await registerUser(`tr-owner-write-${crypto.randomUUID()}@test.local`)
    const admin = await registerUser(`tr-admin-write-${crypto.randomUUID()}@test.local`)
    const viewer = await registerUser(`tr-viewer-write-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `tr-write-${Date.now()}.ir`)
    await addMember(owner, site.id, admin, 'admin')
    await addMember(owner, site.id, viewer, 'viewer')

    for (const member of [admin, viewer]) {
      const res = await patch(`/sites/${site.id}/authority`, { authority: 'auto' }, member)
      assert.equal(res.status, 403, `${member.email} must not change authority`)
      assert.ok(
        String(res.body.message).includes('مالک'),
        `the 403 must carry the clear Persian message, got: ${res.body.message}`
      )

      // The site is not paired, so the route's own 400 would be «سایت متصل
      // نیست» — the membership 403 must win, proving the guard runs first.
      const scan = await post(`/sites/${site.id}/scan`, {}, member)
      assert.equal(scan.status, 403, 'membership 403 must precede the unpaired-site 400')
      assert.notEqual(scan.body.message, 'سایت متصل نیست.')

      // A capability token mints a download of the whole database dump —
      // owner-only like every other write.
      const token = await get(`/sites/${site.id}/backups/whatever/token`, member)
      assert.equal(token.status, 403, 'members must not mint backup download tokens')

      // And the download stream itself is owner-only too: the dump (user_pass
      // hashes, options, content) is not one of the «گزارش‌ها و وضعیت» views a
      // member may read. The 403 must again precede the unpaired-site 400.
      const download = await get(`/sites/${site.id}/backups/whatever/download`, member)
      assert.equal(download.status, 403, 'members must not stream the backup dump with their own session')
      assert.notEqual(download.body.message, 'سایت متصل نیست.')
    }

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
    assert.equal(list.body.members[0].effective.level, 'report')
    assert.equal(list.body.members[0].effective.label, 'فقط خواندن')
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

  test.after(async () => {
    server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
