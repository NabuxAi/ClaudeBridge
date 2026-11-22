import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import crypto from 'node:crypto'
import { ping, callTool } from '../src/connector.js'

// A WordPress plugin build from before nonce support: it verifies ts\nbody only.
function oldPlugin(secret, { acceptsV2 = false } = {}) {
  const seen = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const ts = req.headers['x-digiwp-timestamp']
      const nonce = req.headers['x-digiwp-nonce']
      const sig = req.headers['x-digiwp-signature']
      const legacy = crypto.createHmac('sha256', secret).update(`${ts}\n${body}`).digest('hex')
      const v2 = crypto.createHmac('sha256', secret).update(`${ts}\n${nonce}\n${body}`).digest('hex')
      const ok = acceptsV2 ? (nonce && sig === v2) : sig === legacy
      seen.push({ path: req.url, nonce: Boolean(nonce), ok })
      res.setHeader('Content-Type', 'application/json')
      if (!ok) { res.statusCode = 401; return res.end('{"code":"bad_signature"}') }
      if (req.url.includes('/connector/ping')) return res.end('{"ok":true,"version":"3.9.1","connector":true}')
      return res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'pong' }] } }))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })))
}

test('a pre-nonce plugin is reached with the legacy signature after the current one is refused', async () => {
  const { server, seen, url } = await oldPlugin('s3cret')
  try {
    const site = { url, secret: 's3cret', siteKey: 'legacy-site' }
    const data = await ping(site)
    assert.equal(data.ok, true)
    assert.equal(data.legacySignature, true)
    assert.deepEqual(seen.slice(0, 2).map((r) => [r.nonce, r.ok]), [[true, false], [false, true]])
    const result = await callTool(site, 'site_info', {})
    assert.equal(result.content[0].text, 'pong')
    assert.equal(seen.at(-1).nonce, false)
  } finally { server.close() }
})

test('a current plugin keeps the nonce scheme and a wrong secret still fails', async () => {
  const current = await oldPlugin('k', { acceptsV2: true })
  try {
    const data = await ping({ url: current.url, secret: 'k', siteKey: 'v2-site' })
    assert.equal(data.legacySignature, undefined)
    assert.equal(current.seen.length, 1)
  } finally { current.server.close() }
  const old = await oldPlugin('right')
  try {
    await assert.rejects(ping({ url: old.url, secret: 'wrong', siteKey: 'x' }), (e) => e.upstreamStatus === 401 && e.status === 502)
  } finally { old.server.close() }
})

// Plugin 3.9.4+: a refusal names its reason, and the hub passes it on instead
// of the generic "check the key" line (the 2026-11-22 game30t.com incident).
function refusingPlugin(reply) {
  const seen = []
  const server = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      seen.push(req.url)
      const { status, body } = reply(req.url)
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })))
}

test('a named key mismatch is reported as such and no legacy downgrade is tried', async () => {
  const site = await refusingPlugin(() => ({ status: 401, body: { code: 'cb_signature_invalid', message: 'x', data: { status: 401 } } }))
  try {
    await assert.rejects(ping({ url: site.url, secret: 's', siteKey: 'k' }), (e) => {
      assert.equal(e.i18n.key, 'sites.connectorKeyMismatch')
      assert.equal(e.upstreamStatus, 401)
      assert.equal(e.status, 502, 'a site refusing our signature must not read as an ended panel session')
      return true
    })
    assert.equal(site.seen.length, 1, 'a 3.9.4 plugin is never retried with the legacy signature')
  } finally { site.server.close() }
})

test('a database that cannot be written surfaces as a storage failure on ping and on tool calls', async () => {
  const site = await refusingPlugin((path) => path.includes('/connector/ping')
    ? { status: 503, body: { code: 'cb_nonce_store_failed', message: 'x', data: { status: 503 } } }
    : { status: 503, body: { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'x', data: { reason: 'cb_nonce_store_failed' } } } })
  try {
    await assert.rejects(ping({ url: site.url, secret: 's', siteKey: 'k2' }), (e) => e.i18n.key === 'sites.connectorStorage' && e.status === 503)
    await assert.rejects(callTool({ url: site.url, secret: 's', siteKey: 'k2' }, 'site_info', {}), (e) => e.i18n.key === 'sites.connectorStorage')
  } finally { site.server.close() }
})

test('a clock refusal carries the site\'s own time', async () => {
  const site = await refusingPlugin(() => ({ status: 401, body: { code: 'cb_signature_expired', message: 'x', data: { status: 401, site_time: 1795400000 } } }))
  try {
    await assert.rejects(ping({ url: site.url, secret: 's', siteKey: 'k3' }), (e) => e.i18n.key === 'sites.connectorClock' && e.i18n.vars.siteTime === new Date(1795400000 * 1000).toISOString())
  } finally { site.server.close() }
})
