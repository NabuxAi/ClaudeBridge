import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverWordPress, normalizeSiteAddress, siteLocation } from '../src/site-address.js'
import { ping, callTool, verifySignature } from '../src/connector.js'
import { createServer } from 'node:http'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const wordpress = { namespaces: ['wp/v2', 'claude-bridge/v1'] }

test('installation paths survive pasted admin, login, REST and whitespace addresses', () => {
  for (const input of [' alowp.ir/baneh/ ', 'https://alowp.ir/baneh/wp-admin/', 'https://alowp.ir/baneh/wp-admin/plugins.php?plugin=a', 'https://alowp.ir/baneh/wp-login.php?redirect_to=x', 'https://alowp.ir/baneh/wp-json/wp/v2', 'https://alowp.ir/baneh/index.php']) {
    assert.equal(normalizeSiteAddress(input), 'https://alowp.ir/baneh')
  }
  assert.equal(normalizeSiteAddress('HTTPS://BLOG.EXAMPLE.COM:443/shop/nested///'), 'https://blog.example.com/shop/nested')
  assert.equal(normalizeSiteAddress('http://localhost:8080/shop/'), 'http://localhost:8080/shop')
  for (const input of ['javascript:alert(1)', 'ftp://example.com', 'https://user:password@example.com/shop', 'https://exa mple.com', {}, '']) {
    assert.throws(() => normalizeSiteAddress(input), { status: 400 })
  }
})

test('location distinguishes subfolders and real subdomains, including multi-part public suffixes', () => {
  assert.equal(siteLocation('https://alowp.ir/baneh').kind, 'subfolder')
  assert.equal(siteLocation('https://www.example.co.uk').kind, 'root')
  assert.equal(siteLocation('https://store.example.co.uk').kind, 'subdomain')
  assert.deepEqual(siteLocation('https://store.example.co.uk/shop'), { kind: 'subdomain-subfolder', hostname: 'store.example.co.uk', subdomain: 'store', path: '/shop' })
})

test('discovery checks the supplied subfolder and never silently falls back to the domain root', async () => {
  const seen = []
  const result = await discoverWordPress('alowp.ir/baneh/wp-admin/', { resolve, fetchImpl: async (url) => {
    seen.push(url)
    return Response.json(wordpress)
  } })
  assert.equal(result.siteUrl, 'https://alowp.ir/baneh')
  assert.equal(result.connectorDetected, true)
  assert.deepEqual(seen, ['https://alowp.ir/baneh/wp-json/?_fields=namespaces'])
})

test('discovery preserves the subdomain and folder; absence of the connector is honest', async () => {
  const seen = []
  const result = await discoverWordPress('https://blog.example.com/shop', { resolve, fetchImpl: async (url) => {
    seen.push(url)
    return Response.json({ namespaces: ['wp/v2'] })
  } })
  assert.equal(result.siteUrl, 'https://blog.example.com/shop')
  assert.equal(result.connectorDetected, false)
  assert.deepEqual(seen, ['https://blog.example.com/shop/wp-json/?_fields=namespaces'])
})

test('redirects preserve the final installation path and are checked before following', async () => {
  let calls = 0
  const result = await discoverWordPress('http://example.com/shop', { resolve, fetchImpl: async () => {
    calls++
    return calls === 1 ? new Response('', { status: 301, headers: { location: 'https://www.example.com/shop/wp-json/' } }) : Response.json(wordpress)
  } })
  assert.equal(result.siteUrl, 'https://www.example.com/shop')
  assert.equal(calls, 2)

  calls = 0
  await assert.rejects(discoverWordPress('https://example.com/shop', { resolve, fetchImpl: async () => {
    calls++
    return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/secrets' } })
  } }), { status: 400 })
  assert.equal(calls, 1)
})

test('private network destinations are refused before any HTTP request', async () => {
  for (const address of ['127.0.0.1', '10.2.3.4', '169.254.169.254', '192.168.1.2', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    await assert.rejects(discoverWordPress('https://example.com/shop', {
      resolve: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
      fetchImpl: () => { assert.fail('must not fetch a private destination') },
    }), { status: 400 })
  }
})

test('HTML pages, blocked APIs and arbitrary JSON never become a successful WordPress detection', async () => {
  for (const response of [() => new Response('<html>OK</html>'), () => Response.json({ ok: true }), () => Response.json(wordpress, { status: 403 })]) {
    await assert.rejects(discoverWordPress('https://example.com/shop', { resolve, fetchImpl: async () => response() }), { status: 422 })
  }
})

test('the real HTTP relay signs ping and tool calls under the nested installation path', async () => {
  const paths = []
  const wp = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      paths.push(req.url)
      assert.equal(verifySignature('secret', { timestamp: req.headers['x-digiwp-timestamp'], signature: req.headers['x-digiwp-signature'], nonce: req.headers['x-digiwp-nonce'], rawBody: body }), true)
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/shop/nested/wp-json/claude-bridge/v1/connector/ping') return res.end(JSON.stringify({ ok: true, version: '3.9.1' }))
      if (req.url === '/shop/nested/wp-json/claude-bridge/v1/mcp') {
        assert.equal(JSON.parse(body).params.name, 'site_info')
        return res.end(JSON.stringify({ result: { content: [{ type: 'text', text: '{"ok":true}' }] } }))
      }
      res.writeHead(404).end()
    })
  })
  await new Promise((resolve) => wp.listen(0, '127.0.0.1', resolve))
  try {
    const site = { url: `http://127.0.0.1:${wp.address().port}/shop/nested///`, secret: 'secret', siteKey: 'key' }
    assert.equal((await ping(site)).ok, true)
    assert.equal((await callTool(site, 'site_info')).content[0].text, '{"ok":true}')
    assert.deepEqual(paths, ['/shop/nested/wp-json/claude-bridge/v1/connector/ping', '/shop/nested/wp-json/claude-bridge/v1/mcp'])
  } finally { await new Promise((resolve) => wp.close(resolve)) }
})
