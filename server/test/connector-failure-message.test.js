// What a failed server-initiated call leaves behind.
//
// The nightly scan runs on our schedule, not a user's, so nobody is watching
// when it fails — the recorded event IS the whole diagnosis. On the live
// deployment one read, in full: `{"error": "tool security_scan failed"}`. That
// names neither a cause nor a status, and three very different failures all
// produced it: the plugin refusing the call, the host returning 500 with an
// HTML error page, and nothing answering at all.
//
// The body was being discarded before anyone could look at it — `res.json()`
// with a swallowed catch turns a PHP fatal into `{}`.
import test from 'node:test'
import assert from 'node:assert/strict'

const connector = await import('../src/connector.js')

const SITE = { url: 'https://scan.test', secret: 's3cr3t', siteKey: 'k' }

const realFetch = globalThis.fetch

function respondWith({ status = 200, body = '', json = null }) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (json ? JSON.stringify(json) : body),
    json: async () => json ?? JSON.parse(body || '{}'),
  })
}

test.after(() => {
  globalThis.fetch = realFetch
})

test('the site\'s own error text is what gets reported', async () => {
  // When the plugin says why, that is the most useful thing available.
  respondWith({ status: 500, json: { error: { message: 'ModSecurity blocked the request' } } })

  await assert.rejects(
    () => connector.callTool(SITE, 'security_scan', {}),
    (e) => {
      assert.match(e.message, /ModSecurity blocked the request/)
      return true
    }
  )
})

test('an HTML error page is reported instead of being swallowed', async () => {
  // This is the case that produced "tool security_scan failed": a body that is
  // not JSON, discarded by a catch, leaving nothing to go on.
  respondWith({
    status: 500,
    body: '<!DOCTYPE html><html><body>Fatal error: Allowed memory size exhausted in scan.php</body></html>',
  })

  await assert.rejects(
    () => connector.callTool(SITE, 'security_scan', {}),
    (e) => {
      assert.match(e.message, /500/)
      assert.match(e.message, /memory size exhausted/)
      return true
    }
  )
})

test('an empty body still names the status', async () => {
  // Nothing to quote, but "nothing came back with a 502" is still a diagnosis.
  respondWith({ status: 502, body: '' })

  await assert.rejects(
    () => connector.callTool(SITE, 'security_scan', {}),
    (e) => {
      assert.match(e.message, /no response body/)
      assert.match(e.message, /502/)
      return true
    }
  )
})

test('a long error page is truncated rather than pasted whole', async () => {
  // The message is stored on an event and shown in a digest. An entire HTML
  // page in either is worse than useless.
  respondWith({ status: 500, body: 'x'.repeat(5000) })

  await assert.rejects(
    () => connector.callTool(SITE, 'security_scan', {}),
    (e) => {
      assert.ok(e.message.length < 400, `message was ${e.message.length} chars`)
      assert.match(e.message, /…/)
      return true
    }
  )
})

test('the status travels on the error, not only in the text', async () => {
  // digest.js records it separately so the three failure kinds stay
  // distinguishable without parsing prose.
  respondWith({ status: 503, body: 'upstream down' })

  await assert.rejects(
    () => connector.callTool(SITE, 'security_scan', {}),
    (e) => {
      assert.equal(e.status, 503)
      return true
    }
  )
})

test('a rejected signature is still reported as such', async () => {
  // 401 has its own message because it means the pairing is wrong, not the
  // site — behaviour that existed before and must not be lost.
  respondWith({ status: 401, body: '' })

  await assert.rejects(
    () => connector.callTool(SITE, 'security_scan', {}),
    (e) => {
      assert.match(e.message, /signature/)
      assert.equal(e.status, 401)
      return true
    }
  )
})

test('a successful call is unaffected by reading the body as text', async () => {
  respondWith({ status: 200, json: { result: { content: [{ text: '{"clean":true}' }] } } })

  const out = await connector.callTool(SITE, 'security_scan', {})
  assert.deepEqual(out, { content: [{ text: '{"clean":true}' }] })
})
