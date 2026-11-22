// Peer relay: a site this server cannot reach is reached through the other
// DigiWP server (Iran ↔ international). Real HTTP against the mounted relay
// receiver and a stub WordPress; the "direct road is down" half is simulated
// by failing this process's own first fetch to the site.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'

process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
process.env.LIVE = '1'
process.env.PEER_RELAY_SECRET = 'peer-secret-shared-by-both-servers-0123456789'
// The stub WordPress listens on 127.0.0.1 and a random port.
process.env.PEER_RELAY_ALLOW_PRIVATE = '1'

const { config } = await import('../src/config.js')
const peerRelay = await import('../src/peer-relay.js')
const connector = await import('../src/connector.js')
const { createApp } = await import('../src/index.js')
const { _reset: resetRateLimits } = await import('../src/security/ratelimit.js')

const seen = []
let blockNext = 0
const wp = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body })
    if (blockNext > 0) {
      blockNext--
      res.statusCode = 403
      res.setHeader('content-type', 'text/html')
      return res.end('<html>Access denied by firewall</html>')
    }
    res.setHeader('content-type', 'application/json')
    if (req.url.endsWith('/connector/ping')) return res.end(JSON.stringify({ ok: true, version: '3.9.2' }))
    const rpc = body ? JSON.parse(body) : {}
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id ?? null, result: { content: [{ type: 'text', text: '{"ok":true}' }] } }))
  })
})
await new Promise((r) => wp.listen(0, r))
const wpUrl = `http://127.0.0.1:${wp.address().port}`
const site = { url: wpUrl, secret: 'site-secret', siteKey: 'site-key' }

const app = createApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const API = `http://127.0.0.1:${server.address().port}/v1`
config.peerRelay.url = API

test.beforeEach(async () => {
  await connector.ping(site)
  seen.length = 0
  blockNext = 0
  peerRelay._reset()
  resetRateLimits()
})

const forward = (payload, { secret = config.peerRelay.secret, headers = null } = {}) => {
  const raw = JSON.stringify(payload)
  return fetch(`${API}/relay/forward`, {
    method: 'POST',
    headers: headers || { 'content-type': 'application/json', ...peerRelay.signRelay(raw, secret) },
    body: raw,
  })
}

test('only Claude Bridge REST paths may be relayed', () => {
  assert.equal(peerRelay.isBridgePath('https://a.ir/wp-json/claude-bridge/v1/mcp'), true)
  assert.equal(peerRelay.isBridgePath('https://a.ir/shop/wp-json/claude-bridge/v1/connector/ping'), true)
  assert.equal(peerRelay.isBridgePath('https://a.ir/?rest_route=/claude-bridge/v1/mcp'), true)
  assert.equal(peerRelay.isBridgePath('https://a.ir/wp-json/wp/v2/users'), false)
  assert.equal(peerRelay.isBridgePath('https://a.ir/wp-admin/'), false)
  assert.equal(peerRelay.isBridgePath('file:///etc/passwd'), false)
  assert.equal(peerRelay.isBridgePath('https://u:p@a.ir/wp-json/claude-bridge/v1/mcp'), false)
})

test('signatures: fresh and exact, or nothing', () => {
  const raw = '{"a":1}'
  const h = peerRelay.signRelay(raw, 's1')
  const ok = { timestamp: h['X-DigiWP-Relay-Timestamp'], signature: h['X-DigiWP-Relay-Signature'], rawBody: raw }
  assert.equal(peerRelay.verifyRelay(ok, 's1'), true)
  assert.equal(peerRelay.verifyRelay(ok, 's2'), false)
  assert.equal(peerRelay.verifyRelay({ ...ok, rawBody: '{"a":2}' }, 's1'), false)
  assert.equal(peerRelay.verifyRelay({ ...ok, timestamp: String(Number(ok.timestamp) - 3600) }, 's1'), false)
})

test('a block page and a refused connection count as "never arrived"; JSON errors do not', () => {
  assert.equal(peerRelay.looksBlocked(403, 'text/html'), true)
  assert.equal(peerRelay.looksBlocked(503, ''), true)
  assert.equal(peerRelay.looksBlocked(403, 'application/json'), false)
  assert.equal(peerRelay.looksBlocked(500, 'text/html'), false)
  assert.equal(peerRelay.neverArrived(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })), true)
  assert.equal(peerRelay.neverArrived(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), false)
})

test('the receiver refuses unsigned, mis-signed and off-limits requests', async () => {
  const target = { url: `${wpUrl}/wp-json/claude-bridge/v1/mcp`, method: 'POST', headers: {}, body: '{}' }
  assert.equal((await forward(target, { headers: { 'content-type': 'application/json' } })).status, 401)
  assert.equal((await forward(target, { secret: 'not-the-shared-secret' })).status, 401)
  assert.equal((await forward({ ...target, url: `${wpUrl}/wp-json/wp/v2/users` })).status, 400)
  assert.equal((await forward({ ...target, method: 'DELETE' })).status, 400)
  assert.equal(seen.length, 0, 'nothing refused may reach the site')

  const secret = config.peerRelay.secret
  config.peerRelay.secret = ''
  try {
    assert.equal((await forward(target, { secret })).status, 404, 'no secret here means no relay at all')
  } finally {
    config.peerRelay.secret = secret
  }
})

test('the receiver carries the request on with only the allow-listed headers', async () => {
  const res = await forward({
    url: `${wpUrl}/wp-json/claude-bridge/v1/mcp`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DigiWP-Signature': 'abc', 'X-DigiWP-Timestamp': '1', 'X-DigiWP-Nonce': 'n', 'X-DigiWP-Site': 's',
      Cookie: 'wordpress_logged_in=steal-me', Authorization: 'Basic c2VjcmV0',
    },
    body: '{"jsonrpc":"2.0","id":7,"method":"tools/list"}',
  })
  assert.equal(res.status, 200)
  const answer = await res.json()
  assert.equal(answer.status, 200)
  assert.match(answer.contentType, /json/)
  assert.equal(JSON.parse(answer.body).id, 7)
  const got = seen[0].headers
  assert.equal(got['x-digiwp-signature'], 'abc')
  assert.equal(got.cookie, undefined)
  assert.equal(got.authorization, undefined)
})

test('a site behind a block page is reached through the peer, and remembered', async () => {
  blockNext = 1
  const result = await connector.callTool(site, 'site_info', {})
  assert.equal(result.content[0].text, '{"ok":true}')
  assert.equal(seen.length, 2, 'blocked direct attempt, then the relayed one')
  assert.equal(seen[0].body, seen[1].body, 'the peer sends the very same signed bytes')
  assert.equal(seen[1].headers['x-digiwp-signature'], seen[0].headers['x-digiwp-signature'])
  assert.equal(peerRelay.prefersPeer(`${wpUrl}/wp-json/claude-bridge/v1/mcp`), true)
})

// The direct road failing is simulated in this process's fetch; the peer's
// own fetch (the relay receiver forwarding to the stub) is left alone.
async function withFailingDirect(error, fn) {
  const real = globalThis.fetch
  let failed = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(wpUrl) && failed === 0) {
      failed++
      throw error
    }
    return real(url, init)
  }
  try { return await fn() } finally { globalThis.fetch = real }
}

test('a change takes the peer only when the direct connection never opened', async () => {
  // Refused before a byte was sent: the change cannot have run, so the peer carries it once.
  const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
  const ran = await withFailingDirect(refused, () => connector.callTool(site, 'update_posts', { id: 2 }))
  assert.equal(ran.content[0].text, '{"ok":true}')
  assert.equal(seen.length, 1, 'exactly one delivery, through the peer')

  // A reset may come after the body was sent: never sent twice.
  seen.length = 0
  peerRelay._reset()
  const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
  await assert.rejects(withFailingDirect(reset, () => connector.callTool(site, 'update_posts', { id: 2 })))
  assert.equal(seen.length, 0)
})

test('a site pinned to the peer is reached through it first, changes included', async () => {
  const real = globalThis.fetch
  let direct = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(wpUrl)) direct++
    return real(url, init)
  }
  try {
    // The relay receiver in this process is what reaches the stub, so the
    // counter sees that one hop: one call in total means no direct attempt.
    peerRelay.pinRoute(wpUrl, 'peer')
    const ran = await connector.callTool(site, 'update_posts', { id: 5 })
    assert.equal(ran.content[0].text, '{"ok":true}')
    assert.equal(direct, 1, 'only the peer\'s own delivery touched the site')
    assert.equal(seen.length, 1)

    peerRelay.pinRoute(wpUrl, 'direct')
    assert.equal(peerRelay.prefersPeer(`${wpUrl}/wp-json/claude-bridge/v1/mcp`), false)
  } finally {
    globalThis.fetch = real
  }
})

test('peer discovery: signed only, and the same public-address rule', async () => {
  const raw = JSON.stringify({ url: wpUrl })
  const unsigned = await fetch(`${API}/relay/discover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw })
  assert.equal(unsigned.status, 401)
  const answer = await peerRelay.discoverViaPeer(wpUrl)
  // PEER_RELAY_ALLOW_PRIVATE governs forwarding only; discovery keeps its
  // public-address/standard-port rule and never looks inside a private network.
  assert.equal(answer.ok, false)
  assert.ok(['sites.publicAddressRequired', 'sites.invalidAddress'].includes(answer.key), answer.key)
  assert.equal(seen.length, 0)
})

test('a timeout is retried through the peer only for a read', async () => {
  const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
  const read = await withFailingDirect(timeout, () => connector.callTool(site, 'site_info', {}))
  assert.equal(read.content[0].text, '{"ok":true}')
  assert.equal(seen.length, 1)

  seen.length = 0
  peerRelay._reset()
  // The site may already have run it; sending a change again could run it twice.
  await assert.rejects(withFailingDirect(timeout, () => connector.callTool(site, 'update_posts', { id: 3 })))
  assert.equal(seen.length, 0)
})

test('without a peer configured nothing changes: the direct failure is the answer', async () => {
  const url = config.peerRelay.url
  config.peerRelay.url = ''
  try {
    blockNext = 1
    await assert.rejects(connector.callTool(site, 'update_posts', { id: 4 }), /403/)
    assert.equal(seen.length, 1)
  } finally {
    config.peerRelay.url = url
  }
})

test.after(() => {
  server.close()
  wp.close()
})
