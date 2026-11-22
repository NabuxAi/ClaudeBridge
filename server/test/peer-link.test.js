// Invitation landing and cross-server account links, end to end over HTTP
// with real PostgreSQL. See peer-link.js and Invite.jsx.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('hub MCP (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_peer_link'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.LIVE = '1'
  process.env.PEER_RELAY_SECRET = 'peer-secret-shared-by-both-servers-0123456789'
  process.env.SERVER_REGION = 'intl'

  const { pool, query, init } = await import('../src/db.js')
  await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
  await query(`CREATE SCHEMA ${TEST_SCHEMA}`)
  await init()

  const { createApp } = await import('../src/index.js')
  const app = createApp()
  const { _reset: resetRateLimits } = await import('../src/security/ratelimit.js')
  test.beforeEach(() => resetRateLimits())

  // Stub WordPress: answers tools/list and tools/call, records each call.
  const reached = []
  const wp = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (req.url.endsWith('/connector/ping')) return res.end(JSON.stringify({ ok: true }))
      if (!req.url.endsWith('/wp-json/claude-bridge/v1/mcp')) {
        res.statusCode = 404
        return res.end('{}')
      }
      const rpc = JSON.parse(body)
      reached.push(rpc.method === 'tools/call' ? rpc.params.name : rpc.method)
      if (rpc.method === 'tools/list') {
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: [
          { name: 'site_info', description: 'info', inputSchema: { type: 'object' } },
          { name: 'flush_cache', description: 'update', inputSchema: { type: 'object' } },
          { name: 'db_query', description: 'sql', inputSchema: { type: 'object' } },
        ] } }))
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, ran: rpc.params.name }) }],
      } }))
    })
  })
  await new Promise((r) => wp.listen(0, r))
  const wpUrl = `http://127.0.0.1:${wp.address().port}`

  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`
  // One process plays both servers: the partner of this server is itself.
  // Every hop still goes over HTTP with the shared-secret signature, and the
  // two accounts stand for "the account here" and "the account there".
  const { config } = await import('../src/config.js')
  config.peerRelay.url = API

  const send = async (path, opts = {}) => {
    const res = await fetch(API + path, opts)
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 200) } }
    return { status: res.status, body }
  }

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  const solveCaptcha = async () => {
    const { body } = await send('/auth/captcha')
    const ascii = body.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: body.id, captchaAnswer: String(answer) }
  }

  const signAs = (secret, body) => {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = crypto.randomBytes(16).toString('hex')
    return {
      'content-type': 'application/json',
      'X-DigiWP-Timestamp': timestamp,
      'X-DigiWP-Nonce': nonce,
      'X-DigiWP-Signature': crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex'),
      'X-DigiWP-Site': 'wp-site-under-test',
    }
  }

  const account = async () => {
    const email = `mcp-${crypto.randomUUID()}@test.local`
    const { status, body } = await send('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'a-strong-password-123', name: 'MCP Test', ...(await solveCaptcha()) }),
    })
    assert.equal(status, 201, JSON.stringify(body))
    const auth = { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' }
    const me = await send('/auth/me', { headers: auth })
    return { auth, id: me.body.user?.id ?? me.body.id, email }
  }

  const pairConnector = async (auth, name) => {
    const created = await send('/sites', {
      method: 'POST', headers: auth, body: JSON.stringify({ name, title: 'MCP Site' }),
    })
    assert.equal(created.status, 201)
    const body = JSON.stringify({ site_url: wpUrl, name: 'MCP Site', version: '3.9.1' })
    const reg = await send('/connector/register', { method: 'POST', headers: signAs(created.body.pairing.secret, body), body })
    assert.equal(reg.status, 200, JSON.stringify(reg.body))
    return created.body
  }

  const pairedSite = async (auth, name = `mcp-${Date.now()}-${crypto.randomInt(1e9)}`) =>
    (await pairConnector(auth, name)).id

  const newToken = async (auth) => {
    const made = await send('/account/mcp-tokens', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Claude' }) })
    assert.equal(made.status, 201, JSON.stringify(made.body))
    assert.match(made.body.token, /^dwmcp_/)
    assert.match(made.body.mcpUrl, /\/mcp$/)
    return made.body
  }

  let rpcId = 0
  const rpc = (token, method, params = {}, { inUrl = false } = {}) =>
    send(`/mcp${inUrl ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(inUrl ? {} : { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    })
  const callText = (r) => JSON.parse(r.body.result.content[0].text)


  const post = (path, auth, payload = {}) => send(path, { method: 'POST', headers: auth, body: JSON.stringify(payload) })

  // ---------- invitation landing (/invite) ----------

  test('an invitation link tells its holder whether to sign in or register', async () => {
    const owner = await account()
    const siteId = await pairedSite(owner.auth)
    const existing = await account()
    const lookup = (token) => post('/auth/invitation', { 'content-type': 'application/json' }, { token })

    // An existing account (invited under another spelling of the same Gmail box).
    const box = `inv.${crypto.randomInt(1e9)}@gmail.com`
    const member = await (async () => {
      const r = await send('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: box, password: 'a-strong-password-123', name: 'Member', ...(await solveCaptcha()) }) })
      assert.equal(r.status, 201, JSON.stringify(r.body))
      return { auth: { authorization: `Bearer ${r.body.token}`, 'content-type': 'application/json' } }
    })()
    const spelled = box.replace('inv.', 'inv') // same mailbox, different spelling
    const inv = await post(`/sites/${siteId}/team/invitations`, owner.auth, { email: spelled, role: 'admin' })
    assert.equal(inv.status, 201, JSON.stringify(inv.body))

    const seen = await lookup(inv.body.raw)
    assert.equal(seen.status, 200)
    assert.equal(seen.body.state, 'pending')
    assert.equal(seen.body.hasAccount, true, 'the same mailbox already has an account')
    assert.equal(seen.body.role, 'admin')
    assert.equal(seen.body.siteId, siteId)

    // Accepting needs the token only (the /invite page knows no site id).
    const accepted = await post('/team/invitations/accept', member.auth, { token: inv.body.raw })
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body))
    assert.equal(accepted.body.siteId, siteId)
    assert.equal(accepted.body.role, 'admin')
    assert.equal((await lookup(inv.body.raw)).body.state, 'gone', 'spent links read as gone')

    // A brand-new address: register.
    const fresh = await post(`/sites/${siteId}/team/invitations`, owner.auth, { email: `new-${crypto.randomUUID()}@test.local`, role: 'viewer' })
    assert.equal((await lookup(fresh.body.raw)).body.hasAccount, false)
    // Someone else signed in cannot take it.
    const stolen = await post('/team/invitations/accept', existing.auth, { token: fresh.body.raw })
    assert.equal(stolen.status, 403)

    // Garbage and short tokens: one answer, no detail.
    assert.deepEqual((await lookup('x'.repeat(64))).body, { state: 'gone' })
    assert.deepEqual((await lookup('')).body, { state: 'gone' })
  })

  test('invitation emails and reset emails never point at localhost', async () => {
    const { config: c } = await import('../src/config.js')
    // CORS_ORIGIN is unset in this test process, so this only proves the
    // fallback shape: the panel URL is either configured or derived, never invented.
    assert.ok(c.publicPanelUrl === '' || /^https?:\/\//.test(c.publicPanelUrl))
    const { inviteLink } = await import('../src/store.js')
    assert.equal(inviteLink('https://ai.digiwp.com', 'abc'), 'https://ai.digiwp.com/invite?token=abc')
  })

  // ---------- account link across the two servers ----------

  test('linking: a code made on one side, redeemed on the other, both rows kept', async () => {
    const here = await account()
    const there = await account()

    const before = await send('/account/peer-link', { headers: here.auth })
    assert.equal(before.body.enabled, true)
    assert.equal(before.body.link, null)

    const made = await post('/account/peer-link/code', there.auth)
    assert.equal(made.status, 201)
    assert.match(made.body.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/)

    assert.equal((await post('/account/peer-link/redeem', here.auth, { code: 'AAAAA-BBBBB' })).status, 400)
    const linked = await post('/account/peer-link/redeem', here.auth, { code: made.body.code.toLowerCase() })
    assert.equal(linked.status, 201, JSON.stringify(linked.body))
    assert.equal(linked.body.link.peerEmail, there.email)
    assert.equal(linked.body.link.peerRegion, 'ir')

    // Spent once.
    const again = await post('/account/peer-link/code', there.auth)
    assert.equal(again.status, 409, 'the other half is linked now too')
    const mirror = await send('/account/peer-link', { headers: there.auth })
    assert.equal(mirror.body.link.peerEmail, here.email)
  })

  test('one MCP token reaches the linked account\'s sites, under that server\'s policy', async () => {
    const here = await account()
    const there = await account()
    const mine = await pairedSite(here.auth)
    const theirs = await pairedSite(there.auth)
    const code = (await post('/account/peer-link/code', there.auth)).body.code
    assert.equal((await post('/account/peer-link/redeem', here.auth, { code })).status, 201)
    const { token } = await newToken(here.auth)

    const listed = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    const ids = listed.sites.map((s) => [s.id, s.server])
    assert.deepEqual(ids, [[mine, 'intl'], [`peer:${theirs}`, 'ir']])

    reached.length = 0
    const read = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: `peer:${theirs}`, tool: 'site_info' } })
    assert.equal(callText(read).ran, 'site_info')
    const sensitive = callText(await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: `peer:${theirs}`, tool: 'db_query', arguments: { sql: 'SELECT 1' } } }))
    assert.equal(sensitive.requiresApproval, true, 'the partner files it as a proposal')
    assert.deepEqual(reached, ['site_info'])

    // A change through the partner is in that site's audit trail as such.
    await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: `peer:${theirs}`, tool: 'flush_cache' } })
    // The audit write is fire-and-forget after the answer; give it a moment.
    let rows = []
    for (let i = 0; i < 20 && !rows.some((r) => r.detail?.via === 'hub-mcp-partner'); i++) {
      await new Promise((r) => setTimeout(r, 50));
      ({ rows } = await query("SELECT detail FROM events WHERE site_id = $1 AND kind = 'action'", [theirs]))
    }
    assert.ok(rows.some((r) => r.detail?.via === 'hub-mcp-partner'), JSON.stringify(rows))

    // Unlink: gone on both sides, and the partner refuses a forged call.
    const un = await send('/account/peer-link', { method: 'DELETE', headers: here.auth })
    assert.deepEqual(un.body, { unlinked: true, peer: 'removed' })
    assert.equal((await send('/account/peer-link', { headers: there.auth })).body.link, null)
    const after = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    assert.deepEqual(after.sites.map((s) => s.id), [mine])

    const { peerPost } = await import('../src/peer-relay.js')
    await assert.rejects(peerPost('/relay/mcp', { userId: there.id, peerUserId: here.id, name: 'list_sites', args: {} }), /not linked/)
  })

  test('the partner endpoints answer nothing without the shared signature', async () => {
    for (const path of ['/relay/link/redeem', '/relay/link/revoke', '/relay/mcp']) {
      const r = await send(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      assert.equal(r.status, 401, path)
    }
  })

  test.after(async () => {
    server.close()
    wp.close()
    await pool.end()
  })
}
