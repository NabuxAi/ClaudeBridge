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
    await assert.rejects(ping({ url: old.url, secret: 'wrong', siteKey: 'x' }), (e) => e.status === 401)
  } finally { old.server.close() }
})
