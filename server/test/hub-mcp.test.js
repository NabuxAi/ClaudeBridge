// The hub's own MCP endpoint, end to end: a personal token, one URL, every
// site its owner can reach — and the panel's policy, not a looser one.
//
// Real HTTP against the mounted app, real PostgreSQL, a stub WordPress that
// answers the signed connector calls and counts what actually reached it.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('hub MCP (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const TEST_SCHEMA = 'test_hub_mcp'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.LIVE = '1'

  const { pool, query, init } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)
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
    return { auth, id: me.body.user?.id ?? me.body.id }
  }

  const pairedSite = async (auth) => {
    const created = await send('/sites', {
      method: 'POST', headers: auth, body: JSON.stringify({ name: `mcp-${Date.now()}-${crypto.randomInt(1e9)}`, title: 'MCP Site' }),
    })
    assert.equal(created.status, 201)
    const body = JSON.stringify({ site_url: wpUrl, name: 'MCP Site', version: '3.9.1' })
    const reg = await send('/connector/register', { method: 'POST', headers: signAs(created.body.pairing.secret, body), body })
    assert.equal(reg.status, 200, JSON.stringify(reg.body))
    return created.body.id
  }

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

  test('without a valid token the endpoint answers nothing', async () => {
    const none = await send('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' })
    assert.equal(none.status, 401)
    const bogus = await rpc('dwmcp_not-a-real-token', 'tools/list')
    assert.equal(bogus.status, 401)
    // A panel session token is not an MCP token.
    const { auth } = await account()
    const session = await send('/mcp', { method: 'POST', headers: auth, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' })
    assert.equal(session.status, 401)
  })

  test('one token reaches the owner\'s site: list, catalogue, read and change', async () => {
    const { auth } = await account()
    const siteId = await pairedSite(auth)
    const { token } = await newToken(auth)

    const init = await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } })
    assert.equal(init.body.result.protocolVersion, '2025-06-18')
    assert.equal(init.body.result.serverInfo.name, 'digiwp-hub')

    const tools = await rpc(token, 'tools/list')
    assert.deepEqual(tools.body.result.tools.map((t) => t.name), ['list_sites', 'site_tools', 'call_site_tool'])

    const listed = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    assert.equal(listed.sites.length, 1)
    assert.equal(listed.sites[0].id, siteId)
    assert.equal(listed.sites[0].role, 'owner')
    assert.equal(listed.sites[0].paired, true)

    // The site is found by its address as well as by its id.
    const catalogue = callText(await rpc(token, 'tools/call', { name: 'site_tools', arguments: { site: wpUrl } }))
    const kinds = Object.fromEntries(catalogue.tools.map((t) => [t.name, t.kind]))
    assert.deepEqual(kinds, { site_info: 'read', flush_cache: 'mutating', db_query: 'sensitive' })

    reached.length = 0
    const read = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'site_info' } })
    assert.equal(callText(read).ran, 'site_info')
    const changed = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'flush_cache', arguments: { id: 1, title: 'x' } } })
    assert.equal(callText(changed).ran, 'flush_cache')
    assert.deepEqual(reached, ['site_info', 'flush_cache'])

    // A change made from an AI client is in the site's audit trail.
    const { rows } = await query("SELECT detail FROM events WHERE site_id = $1 AND kind = 'action'", [siteId])
    assert.ok(rows.some((r) => r.detail?.via === 'hub-mcp' && r.detail?.op === 'flush_cache'))
  })

  test('a sensitive tool is filed for approval and never reaches the site', async () => {
    const { auth } = await account()
    const siteId = await pairedSite(auth)
    const { token } = await newToken(auth)

    reached.length = 0
    const res = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'db_query', arguments: { sql: 'SELECT 1' } } })
    const out = callText(res)
    assert.equal(out.ran, false)
    assert.equal(out.requiresApproval, true)
    assert.ok(out.proposalId)
    assert.deepEqual(reached, [], 'a sensitive tool must not be relayed')

    const pending = await send(`/sites/${siteId}/proposals`, { headers: auth })
    assert.ok(pending.body.proposals.some((p) => p.id === out.proposalId && p.tool === 'db_query'))
  })

  test('a team member may read through the hub but not change the site', async () => {
    const owner = await account()
    const siteId = await pairedSite(owner.auth)
    const member = await account()
    await query(
      "INSERT INTO team_members (id, site_id, user_id, role, status, created_at) VALUES ($1,$2,$3,'viewer','active',$4)",
      [`tm_${crypto.randomUUID()}`, siteId, member.id, Date.now()]
    )
    const { token } = await newToken(member.auth)

    const listed = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    assert.equal(listed.sites[0].role, 'viewer')

    reached.length = 0
    const read = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'site_info' } })
    assert.equal(callText(read).ran, 'site_info')
    const refused = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'flush_cache', arguments: { id: 1 } } })
    assert.equal(refused.body.result.isError, true)
    assert.deepEqual(reached, ['site_info'])
  })

  test('a stranger\'s site is not reachable with your token', async () => {
    const other = await account()
    const theirs = await pairedSite(other.auth)
    const { auth } = await account()
    const { token } = await newToken(auth)

    const listed = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    assert.equal(listed.sites.length, 0)
    const res = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: theirs, tool: 'site_info' } })
    assert.equal(res.body.result.isError, true)
  })

  test('a token in the URL works, and a revoked token stops working', async () => {
    const { auth } = await account()
    const { token, record } = await newToken(auth)
    assert.equal((await rpc(token, 'ping', {}, { inUrl: true })).status, 200)

    const list = await send('/account/mcp-tokens', { headers: auth })
    assert.equal(list.body.tokens.length, 1)
    assert.equal(list.body.tokens[0].id, record.id)
    assert.equal(list.body.tokens[0].token, undefined, 'a token is shown once, never listed')

    assert.equal((await send(`/account/mcp-tokens/${record.id}`, { method: 'DELETE', headers: auth })).status, 200)
    assert.equal((await rpc(token, 'ping')).status, 401)
    // Somebody else cannot revoke your token either.
    const second = await newToken(auth)
    const stranger = await account()
    assert.equal((await send(`/account/mcp-tokens/${second.record.id}`, { method: 'DELETE', headers: stranger.auth })).status, 404)
    assert.equal((await rpc(second.token, 'ping')).status, 200)
  })

  test.after(async () => {
    server.close()
    wp.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
