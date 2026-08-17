// Team invitations and RBAC: owners can invite, accept, revoke and manage roles.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('team invitations and RBAC (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_team'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
  await init()

  // The team router is not mounted in the main app yet (the task asked not to
  // edit index.js). We mount the required routers here to exercise the route
  // module and store against real PostgreSQL.
  const { default: authRouter } = await import('../src/routes/auth.js')
  const { default: accountRouter } = await import('../src/routes/account.js')
  const { default: teamRouter } = await import('../src/routes/team.js')
  const { requireAuth } = await import('../src/auth.js')
  const { _reset: resetRateLimit } = await import('../src/security/ratelimit.js')
  const express = (await import('express')).default

  const app = express()
  app.use(express.json())
  app.use('/v1', authRouter)
  app.use('/v1', requireAuth, accountRouter)
  app.use('/v1', requireAuth, teamRouter)
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: err.message }))

  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const { hashPassword } = await import('../src/auth.js')

  async function post(path, body, headers = {}) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, body: data }
  }

  async function http(method, path, headers = {}) {
    const res = await fetch(API + path, { method, headers })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, body: data }
  }

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  async function solveCaptcha() {
    const res = await fetch(`${API}/auth/captcha`)
    const body = await res.json()
    const ascii = body.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: body.id, captchaAnswer: String(answer) }
  }

  async function registerUser(email) {
    const name = 'Team Test'
    const password = 'a-strong-password-123'
    const { status, body } = await post('/auth/register', {
      name, email, password,
      ...(await solveCaptcha()),
    })
    if (status !== 201) {
      console.log('register failed', status, email, JSON.stringify(body))
    }
    return { authorization: `Bearer ${body.token}`, userId: body.user.id }
  }

  async function createSite(auth, name) {
    const { status, body } = await post('/sites', { name, title: 'Team Test Site' }, auth)
    assert.equal(status, 201, `createSite failed: ${JSON.stringify(body)}`)
    return body
  }

  test.before(() => {
    resetRateLimit()
  })

  test('an owner sees themselves and no fake members on a fresh site', async () => {
    const { authorization: auth } = await registerUser(`owner-list-${crypto.randomUUID()}@test.local`)
    console.log('test1 auth header', auth.slice(0, 40))
    const site = await createSite(auth, `team-list-${Date.now()}.ir`)

    const { status, body } = await http('GET', `/sites/${site.id}/team`, auth)
    assert.equal(status, 200, JSON.stringify(body))
    assert.equal(body.site.id, site.id)
    assert.equal(body.owner.role, 'owner')
    assert.ok(body.members.length === 0)
    assert.ok(body.invitations.length === 0)
  })

  test('only the owner can manage members; non-owners get 403', async () => {
    const owner = await registerUser(`owner-403-${crypto.randomUUID()}@test.local`)
    const stranger = await registerUser(`stranger-403-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `team-403-${Date.now()}.ir`)

    const list = await http('GET', `/sites/${site.id}/team`, stranger)
    assert.equal(list.status, 403, 'stranger must not list team')

    const invite = await post(`/sites/${site.id}/team/invitations`, { email: 'x@example.com', role: 'viewer' }, stranger)
    assert.equal(invite.status, 403, 'stranger must not invite')
  })

  test('an owner can invite by email and the token is hashed in storage', async () => {
    const { authorization: auth } = await registerUser(`owner-invite-${crypto.randomUUID()}@test.local`)
    const site = await createSite(auth, `team-invite-${Date.now()}.ir`)
    const email = `invitee-${crypto.randomUUID()}@test.local`

    const { status, body } = await post(`/sites/${site.id}/team/invitations`, { email, role: 'admin' }, auth)
    assert.equal(status, 201, JSON.stringify(body))
    assert.equal(body.invitation.email, email)
    assert.equal(body.invitation.role, 'admin')
    assert.ok(body.raw, 'raw token must be returned for the email')
    assert.ok(body.raw.length >= 32)

    const hash = crypto.createHash('sha256').update(body.raw).digest('hex')
    const { rows } = await query('SELECT token_hash FROM invitations WHERE id = $1', [body.invitation.id])
    assert.equal(rows[0].token_hash, hash)
    assert.notEqual(rows[0].token_hash, body.raw)

    const teamList = await http('GET', `/sites/${site.id}/team`, auth)
    assert.equal(teamList.body.invitations.length, 1)
    assert.equal(teamList.body.invitations[0].email, email)
    assert.equal(teamList.body.invitations[0].role, 'admin')
    assert.equal(teamList.body.invitations[0].tokenHash, undefined)
  })

  test('a user can accept an invitation and becomes a member', async () => {
    const owner = await registerUser(`owner-accept-${crypto.randomUUID()}@test.local`)
    const invitee = await registerUser(`invitee-accept-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `team-accept-${Date.now()}.ir`)

    const invited = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'admin' }, owner)
    assert.equal(invited.status, 201)

    const accepted = await post('/team/invitations/accept', { siteId: site.id, token: invited.body.raw }, invitee)
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body))
    assert.equal(accepted.body.email, invitee.email)
    assert.equal(accepted.body.role, 'admin')

    const teamList = await http('GET', `/sites/${site.id}/team`, owner)
    assert.equal(teamList.body.members.length, 1)
    assert.equal(teamList.body.members[0].email, invitee.email)
    assert.equal(teamList.body.members[0].role, 'admin')
    assert.equal(teamList.body.invitations.length, 0)
  })

  test('accepting with the wrong email or token is refused', async () => {
    const owner = await registerUser(`owner-wrong-${crypto.randomUUID()}@test.local`)
    const invitee = await registerUser(`invitee-wrong-${crypto.randomUUID()}@test.local`)
    const other = await registerUser(`other-wrong-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `team-wrong-${Date.now()}.ir`)

    const invited = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'viewer' }, owner)
    assert.equal(invited.status, 201)

    const wrongToken = await post('/team/invitations/accept', { siteId: site.id, token: 'not-the-token' }, invitee)
    assert.equal(wrongToken.status, 400)

    const wrongUser = await post('/team/invitations/accept', { siteId: site.id, token: invited.body.raw }, other)
    assert.equal(wrongUser.status, 403)
  })

  test('an owner can revoke a pending invitation', async () => {
    const { authorization: auth } = await registerUser(`owner-revoke-${crypto.randomUUID()}@test.local`)
    const site = await createSite(auth, `team-revoke-${Date.now()}.ir`)
    const email = `revoke-${crypto.randomUUID()}@test.local`

    const invited = await post(`/sites/${site.id}/team/invitations`, { email, role: 'viewer' }, auth)
    assert.equal(invited.status, 201)

    const revoked = await http('DELETE', `/sites/${site.id}/team/invitations/${invited.body.invitation.id}`, auth)
    assert.equal(revoked.status, 200)

    const teamList = await http('GET', `/sites/${site.id}/team`, auth)
    assert.equal(teamList.body.invitations.length, 0)
  })

  test('an owner can update a member role', async () => {
    const owner = await registerUser(`owner-role-${crypto.randomUUID()}@test.local`)
    const invitee = await registerUser(`invitee-role-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `team-role-${Date.now()}.ir`)

    const invited = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'viewer' }, owner)
    await post('/team/invitations/accept', { siteId: site.id, token: invited.body.raw }, invitee)

    const before = await http('GET', `/sites/${site.id}/team`, owner)
    const memberId = before.body.members[0].id

    const updated = await post(`/sites/${site.id}/team/members/${memberId}`, { role: 'admin' }, auth)
    assert.equal(updated.status, 200, JSON.stringify(updated.body))
    assert.equal(updated.body.role, 'admin')

    const after = await http('GET', `/sites/${site.id}/team`, owner)
    assert.equal(after.body.members[0].role, 'admin')
  })

  test('an owner can remove a member', async () => {
    const owner = await registerUser(`owner-remove-${crypto.randomUUID()}@test.local`)
    const invitee = await registerUser(`invitee-remove-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `team-remove-${Date.now()}.ir`)

    const invited = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'viewer' }, owner)
    await post('/team/invitations/accept', { siteId: site.id, token: invited.body.raw }, invitee)

    const before = await http('GET', `/sites/${site.id}/team`, owner)
    const memberId = before.body.members[0].id

    const removed = await http('DELETE', `/sites/${site.id}/team/members/${memberId}`, auth)
    assert.equal(removed.status, 200)

    const after = await http('GET', `/sites/${site.id}/team`, owner)
    assert.equal(after.body.members.length, 0)
  })

  test('duplicated active invitations and memberships are rejected', async () => {
    const owner = await registerUser(`owner-dup-${crypto.randomUUID()}@test.local`)
    const invitee = await registerUser(`invitee-dup-${crypto.randomUUID()}@test.local`)
    const site = await createSite(owner, `team-dup-${Date.now()}.ir`)

    const first = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'viewer' }, owner)
    assert.equal(first.status, 201)

    const second = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'admin' }, owner)
    assert.equal(second.status, 409, 'duplicate pending invite must be rejected')

    await post('/team/invitations/accept', { siteId: site.id, token: first.body.raw }, invitee)

    const third = await post(`/sites/${site.id}/team/invitations`, { email: invitee.email, role: 'viewer' }, owner)
    assert.equal(third.status, 409, 'invite to existing member must be rejected')
  })

  test.after(async () => {
    server.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
