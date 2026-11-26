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

test('temporary file grants require current ownership, exact paths, and future expiry', async () => {
  const { isGrantedEdit } = await import('../src/mcp-file-edits.js')
  const path = 'plugins/shop/main.php'
  const site = { id: 'site', member_role: 'owner' }
  const editWindow = { siteId: site.id, paths: [path], expiresAt: Date.now() + 3600_000 }
  const user = { editWindow }
  assert.equal(isGrantedEdit(user, site, { path }), true)
  assert.equal(isGrantedEdit(user, { ...site, member_role: 'admin' }, { path }), false)
  assert.equal(isGrantedEdit(user, { ...site, id: 'other' }, { path }), false)
  assert.equal(isGrantedEdit(user, site, { path: 'plugins/shop/other.php' }), false)
  assert.equal(isGrantedEdit(user, site, { path, theme: 'child' }), false)
  assert.equal(isGrantedEdit({ editWindow: { ...editWindow, expiresAt: Date.now() - 1 } }, site, { path }), false)
  const all = { editWindow: { ...editWindow, paths: null } }
  assert.equal(isGrantedEdit(all, site, { path: 'themes/shop/style.css' }), true)
  assert.equal(isGrantedEdit(all, site, { path: 'mu-plugins/shop.php' }), true)
  assert.equal(isGrantedEdit(all, site, { path: 'plugins/../wp-config.php' }), false)
  assert.equal(isGrantedEdit(all, site, { path: 'uploads/index.php' }), false)
  assert.equal(isGrantedEdit(all, { ...site, member_role: 'admin' }, { path }), false)
})

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
      const { name, arguments: args } = rpc.params
      if (['edit_file', 'edit_file_with_backup'].includes(name)) {
        const missing = args.search === 'missing'
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: {
          ...(missing ? { isError: true } : {}),
          content: [{ type: 'text', text: missing ? 'Search string not found.' : JSON.stringify({
            ran: name, args, ...(name === 'edit_file_with_backup' ? { backup_id: 'a'.repeat(32) } : {}),
          }) }],
        } }))
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

  const newToken = async (auth, fileEdit) => {
    const made = await send('/account/mcp-tokens', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Claude', fileEdit }) })
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
    // The audit write is fire-and-forget after the answer; give it a moment under load.
    let rows = []
    for (let i = 0; i < 40 && !rows.some((r) => r.detail?.via === 'hub-mcp' && r.detail?.op === 'flush_cache'); i++) {
      if (i) await new Promise((r) => setTimeout(r, 50));
      ({ rows } = await query("SELECT detail FROM events WHERE site_id = $1 AND kind = 'action'", [siteId]))
    }
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

  const wpEdit = { path: 'plugins/test/main.php', search: 'old', replace: 'new' }
  const siteTool = (token, siteId, tool, args) => rpc(token, 'tools/call', {
    name: 'call_site_tool', arguments: { site: siteId, tool, arguments: args },
  })

  test('Alerts exposes stored proposals; approval relays the stored change exactly once', async () => {
    const { auth } = await account()
    const siteId = await pairedSite(auth)
    const { token } = await newToken(auth)
    const { proposalId } = callText(await siteTool(token, siteId, 'edit_file', wpEdit))
    const incidents = await send(`/sites/${siteId}/incidents`, { headers: auth })
    assert.equal(incidents.body.canManage, true)
    assert.deepEqual(incidents.body.proposals.find(({ id }) => id === proposalId)?.args, wpEdit)

    reached.length = 0
    const approve = () => send(`/sites/${siteId}/proposals/${proposalId}/approve`, {
      method: 'POST', headers: auth, body: JSON.stringify({ tool: 'db_query', args: {} }),
    })
    const decisions = await Promise.all([approve(), approve()])
    assert.deepEqual(decisions.map((d) => d.status).sort(), [200, 409])
    assert.deepEqual(reached, ['edit_file'])
    assert.deepEqual(JSON.parse(decisions.find((d) => d.status === 200).body.result.content[0].text).args, wpEdit)
    const refreshed = await send(`/sites/${siteId}/incidents`, { headers: auth })
    assert.equal(refreshed.body.proposals.length, 0)
    assert.equal(refreshed.body.proposalDecisions.find(({ id }) => id === proposalId)?.execution, 'ran')

    const failure = callText(await siteTool(token, siteId, 'edit_file', { ...wpEdit, search: 'missing' }))
    const refused = await send(`/sites/${siteId}/proposals/${failure.proposalId}/approve`, { method: 'POST', headers: auth })
    assert.equal(refused.status, 502)
    assert.equal(refused.body.approved, true)
    assert.equal(refused.body.proposalId, failure.proposalId)
    assert.match(refused.body.message, /Search string not found/)
    const stored = (await query('SELECT status, result FROM proposals WHERE id = $1', [failure.proposalId])).rows[0]
    assert.equal(stored.status, 'approved')
    assert.equal(stored.result.ok, false)
    const view = await send(`/sites/${siteId}/incidents`, { headers: auth })
    const failed = view.body.proposalDecisions.find(({ id }) => id === failure.proposalId)
    assert.equal(failed.status, 'approved')
    assert.equal(failed.execution, 'failed')
    assert.equal(failed.path, wpEdit.path)
    assert.match(failed.error, /Search string not found/)
    assert.equal(failed.args, undefined)
  })

  test('scoped MCP token backs up granted file edits, audits failures, and holds other sensitive calls', async () => {
    const { auth } = await account()
    const siteId = await pairedSite(auth)
    const otherSite = await pairedSite(auth)
    const fileEdit = { siteId, paths: [wpEdit.path] }
    const { token, record } = await newToken(auth, fileEdit)
    assert.deepEqual(record.fileEdit, fileEdit)
    const listed = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    assert.deepEqual(listed.sites.map(({ id }) => id), [siteId])
    reached.length = 0

    const direct = callText(await siteTool(token, siteId, 'edit_file', wpEdit))
    assert.equal(direct.ran, 'edit_file_with_backup')
    assert.equal((await siteTool(token, siteId, 'edit_file', { ...wpEdit, search: 'missing' })).body.result.isError, true)
    for (const [tool, args] of [
      ['edit_file', { ...wpEdit, path: 'plugins/test/other.php' }],
      ['edit_file', { ...wpEdit, theme: 'another-theme' }],
      ['restore_file_edit', { backup_id: direct.backup_id }],
      ['delete_file', { path: wpEdit.path }],
      ['edit_file_with_backup', wpEdit],
    ]) {
      assert.equal(callText(await siteTool(token, siteId, tool, args)).requiresApproval, true)
    }
    assert.equal((await siteTool(token, otherSite, 'edit_file', wpEdit)).body.result.isError, true)
    assert.deepEqual(reached, ['edit_file_with_backup', 'edit_file_with_backup'])
    const audit = (await query(
      "SELECT detail FROM events WHERE site_id = $1 AND detail->>'via' = 'hub-mcp-file-edit' ORDER BY created_at",
      [siteId],
    )).rows.map(({ detail }) => detail)
    assert.deepEqual(audit.map(({ outcome }) => outcome), ['performed', 'failed'])
    assert.equal(audit[0].backupId, direct.backup_id)
    assert.equal(audit[0].tokenId, record.id)
    assert.equal(audit[0].args, undefined)

    const stranger = await account()
    const forbidden = await send('/account/mcp-tokens', { method: 'POST', headers: stranger.auth, body: JSON.stringify({ fileEdit }) })
    assert.equal(forbidden.status, 404)
    await send(`/account/mcp-tokens/${record.id}`, { method: 'DELETE', headers: auth })
    assert.equal((await siteTool(token, siteId, 'edit_file', wpEdit)).status, 401)
  })

  test('an existing MCP token gets backed-up edits only within its owner-approved time window', async () => {
    const { auth } = await account()
    const siteId = await pairedSite(auth)
    const otherSite = await pairedSite(auth)
    const { token, record } = await newToken(auth)
    const url = `/account/mcp-tokens/${record.id}/edit-window`
    const grant = { siteId, allFiles: true, hours: 24 }
    const activate = (body = grant, headers = auth) => send(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const end = (expiresAt) => send(url, { method: 'DELETE', headers: auth, body: JSON.stringify({ expiresAt }) })
    const queuedEdit = { ...wpEdit, search: 'already pending' }
    const queued = callText(await siteTool(token, siteId, 'edit_file', queuedEdit))

    reached.length = 0
    for (const hours of [0, 25, 1.5, '3']) assert.equal((await activate({ ...grant, hours })).status, 400)
    assert.equal((await activate({ ...grant, paths: [] })).status, 400)
    assert.equal((await activate({ siteId, hours: 24 })).status, 400)
    const stranger = await account()
    assert.equal((await activate(grant, stranger.auth)).status, 404)
    const foreignSite = await pairedSite(stranger.auth)
    assert.equal((await activate({ ...grant, siteId: foreignSite }, stranger.auth)).status, 409)

    const before = Date.now()
    const activated = await activate()
    assert.equal(activated.status, 200, JSON.stringify(activated.body))
    const { editWindow } = activated.body
    assert.equal(editWindow.paths, null)
    assert.ok(editWindow.expiresAt >= before + 24 * 3600_000 && editWindow.expiresAt <= Date.now() + 24 * 3600_000)
    assert.equal((await activate()).status, 409)
    assert.equal(callText(await siteTool(token, siteId, 'edit_file', queuedEdit)).proposalId, queued.proposalId)
    assert.equal(callText(await siteTool(token, siteId, 'edit_file_with_backup', queuedEdit)).proposalId, queued.proposalId)
    const toolList = callText(await rpc(token, 'tools/call', { name: 'site_tools', arguments: { site: siteId } }))
    assert.equal(toolList.site.directEditExpiresAt, editWindow.expiresAt)
    assert.equal(toolList.site.directEditScope, 'all_editable_files')
    reached.length = 0
    const direct = callText(await siteTool(token, siteId, 'edit_file', wpEdit))
    assert.equal(direct.ran, 'edit_file_with_backup')
    assert.match(direct.backup_id, /^[a-f0-9]{32}$/)
    assert.equal(callText(await siteTool(token, otherSite, 'edit_file', wpEdit)).requiresApproval, true)
    const anotherPath = { ...wpEdit, path: 'themes/store/style.css' }
    assert.equal(callText(await siteTool(token, siteId, 'edit_file_with_backup', anotherPath)).ran, 'edit_file_with_backup')
    assert.equal(callText(await siteTool(token, siteId, 'delete_file', { path: wpEdit.path })).requiresApproval, true)
    assert.equal(callText(await siteTool(token, siteId, 'restore_file_edit', { backup_id: direct.backup_id })).requiresApproval, true)
    assert.deepEqual(reached, ['edit_file_with_backup', 'edit_file_with_backup'])

    await query('UPDATE mcp_tokens SET edit_window_expires_at = $2 WHERE id = $1', [record.id, Date.now() - 1])
    const listed = await send('/account/mcp-tokens', { headers: auth })
    assert.equal(listed.body.tokens.find(({ id }) => id === record.id).editWindow, null)
    assert.equal(callText(await siteTool(token, siteId, 'edit_file', { ...wpEdit, search: 'after expiry' })).requiresApproval, true)
    const restarted = await activate({ siteId, paths: [wpEdit.path], hours: 1 })
    assert.equal(restarted.status, 200)
    assert.deepEqual(restarted.body.editWindow.paths, [wpEdit.path])
    assert.equal(callText(await siteTool(token, siteId, 'edit_file_with_backup', { ...wpEdit, search: 'scoped edit' })).ran, 'edit_file_with_backup')
    assert.equal(callText(await siteTool(token, siteId, 'edit_file', anotherPath)).requiresApproval, true)
    assert.equal((await end(editWindow.expiresAt)).status, 409)
    assert.equal((await end(restarted.body.editWindow.expiresAt)).status, 200)
    assert.equal(callText(await siteTool(token, siteId, 'edit_file', { ...wpEdit, search: 'after early end' })).requiresApproval, true)
    assert.deepEqual(reached, ['edit_file_with_backup', 'edit_file_with_backup', 'edit_file_with_backup'])
  })

  test('a new token can start with all editable files and stays bound to one site after its grant ends', async () => {
    const { auth } = await account()
    const siteId = await pairedSite(auth)
    const otherSite = await pairedSite(auth)
    const grant = { siteId, allFiles: true, hours: 3 }
    const create = (fileEdit, headers = auth) => send('/account/mcp-tokens', {
      method: 'POST', headers, body: JSON.stringify({ name: 'Timed editor', fileEdit }),
    })
    for (const fileEdit of [{ siteId, allFiles: true }, { ...grant, hours: 25 }, { ...grant, paths: [] }, { siteId, paths: [] }]) {
      assert.equal((await create(fileEdit)).status, 400)
    }
    const stranger = await account()
    assert.equal((await create(grant, stranger.auth)).status, 404)
    assert.deepEqual((await send('/account/mcp-tokens', { headers: auth })).body.tokens, [])

    const before = Date.now()
    const { token, record } = await newToken(auth, grant)
    assert.equal(record.siteScope, siteId)
    assert.equal(record.fileEdit, null)
    assert.equal(record.editWindow.siteId, siteId)
    assert.equal(record.editWindow.paths, null)
    assert.ok(record.editWindow.expiresAt >= before + 3 * 3600_000)
    assert.ok(record.editWindow.expiresAt <= Date.now() + 3 * 3600_000)
    const visibleSiteIds = async () => callText(await rpc(token, 'tools/call', {
      name: 'list_sites', arguments: {},
    })).sites.map(({ id }) => id)
    assert.deepEqual(await visibleSiteIds(), [siteId])

    reached.length = 0
    const edit = callText(await siteTool(token, siteId, 'edit_file', wpEdit))
    assert.equal(edit.ran, 'edit_file_with_backup')
    assert.equal((await siteTool(token, otherSite, 'site_info')).body.result.isError, true)
    assert.equal(callText(await siteTool(token, siteId, 'restore_file_edit', { backup_id: edit.backup_id })).requiresApproval, true)
    assert.deepEqual(reached, ['edit_file_with_backup'])

    const windowUrl = `/account/mcp-tokens/${record.id}/edit-window`
    const ended = await send(windowUrl, {
      method: 'DELETE', headers: auth, body: JSON.stringify({ expiresAt: record.editWindow.expiresAt }),
    })
    assert.equal(ended.status, 200)
    assert.deepEqual(await visibleSiteIds(), [siteId])
    assert.equal(callText(await siteTool(token, siteId, 'edit_file', wpEdit)).requiresApproval, true)
    const start = (editWindow) => send(windowUrl, { method: 'POST', headers: auth, body: JSON.stringify(editWindow) })
    assert.equal((await start({ ...grant, siteId: otherSite })).status, 409)
    assert.equal((await start(grant)).status, 200)
  })

  test('an invited test site member may read through a personal MCP token but not change the site', async () => {
    const owner = await account()
    const siteId = await pairedSite(owner.auth, 'https://bodogame.com')
    const member = await account()
    const invited = await send(`/sites/${siteId}/team/invitations`, {
      method: 'POST', headers: owner.auth, body: JSON.stringify({ email: member.email, role: 'viewer' }),
    })
    assert.equal(invited.status, 201, JSON.stringify(invited.body))
    const accepted = await send('/team/invitations/accept', {
      method: 'POST', headers: member.auth, body: JSON.stringify({ siteId, token: invited.body.raw }),
    })
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body))
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

  test('an admin member runs changes through MCP; sensitive ones still wait for approval', async () => {
    const owner = await account()
    const siteId = await pairedSite(owner.auth)
    const admin = await account()
    const invited = await send(`/sites/${siteId}/team/invitations`, {
      method: 'POST', headers: owner.auth, body: JSON.stringify({ email: admin.email, role: 'admin' }),
    })
    assert.equal(invited.status, 201, JSON.stringify(invited.body))
    const accepted = await send('/team/invitations/accept', { method: 'POST', headers: admin.auth, body: JSON.stringify({ token: invited.body.raw }) })
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body))
    const { token } = await newToken(admin.auth)

    reached.length = 0
    const changed = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'flush_cache', arguments: { id: 1 } } })
    assert.equal(callText(changed).ran, 'flush_cache')
    const sensitive = callText(await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: siteId, tool: 'db_query', arguments: { sql: 'SELECT 1' } } }))
    assert.equal(sensitive.requiresApproval, true)
    assert.deepEqual(reached, ['flush_cache'])
  })

  test('a paired WordPress site can verify only one other DigiWP account', async () => {
    const owner = await account()
    const first = await account()
    const second = await account()
    const site = await pairConnector(owner.auth, 'https://clashroyale.ir')
    const requestCode = (auth) => send('/sites/wordpress-access', {
      method: 'POST', headers: auth, body: JSON.stringify({ url: 'https://clashroyale.ir/' }),
    })
    const verify = (code, email, secret = site.pairing.secret) => {
      const body = JSON.stringify({ code, email })
      return send('/connector/wordpress-access', { method: 'POST', headers: signAs(secret, body), body })
    }
    const firstCode = (await requestCode(first.auth)).body.code
    const secondCode = (await requestCode(second.auth)).body.code
    assert.match(firstCode, /^dwp_join_/)
    assert.match(secondCode, /^dwp_join_/)
    assert.equal((await send('/sites', { headers: first.auth })).body.length, 0)
    assert.equal((await verify(firstCode, first.email, 'wrong-secret')).status, 403)
    assert.equal((await verify(firstCode, second.email)).status, 403)

    const results = await Promise.all([verify(firstCode, first.email), verify(secondCode, second.email)])
    assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409])
    const [winner, code, loser] = results[0].status === 200 ? [first, firstCode, second] : [second, secondCode, first]
    assert.equal((await verify(code, winner.email)).status, 403)
    assert.equal((await send('/sites', { headers: loser.auth })).body.length, 0)

    const { token } = await newToken(winner.auth)
    const listed = callText(await rpc(token, 'tools/call', { name: 'list_sites', arguments: {} }))
    assert.equal(listed.sites[0].role, 'viewer')
    assert.equal(listed.sites[0].id, site.id)
    const read = await rpc(token, 'tools/call', { name: 'call_site_tool', arguments: { site: site.id, tool: 'site_info' } })
    assert.equal(callText(read).ran, 'site_info')
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
