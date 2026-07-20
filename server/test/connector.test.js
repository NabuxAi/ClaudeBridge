import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { signHeaders, verifySignature } from '../src/connector.js'

// Independently reproduce the PLUGIN's scheme (wp-claude-bridge.php):
//   hash_hmac('sha256', ts . "\n" . body, secret)   // hex
function pluginExpected(secret, ts, body) {
  return crypto.createHmac('sha256', secret).update(`${ts}\n${body}`).digest('hex')
}

test('signHeaders matches the plugin HMAC scheme byte-for-byte', () => {
  const secret = 'shared-secret-abc'
  const body = JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'tools/call', params: { name: 'site_info' } })
  const h = signHeaders(secret, 'site-key', body)
  assert.equal(h['X-DigiWP-Signature'], pluginExpected(secret, h['X-DigiWP-Timestamp'], body))
  assert.match(h['X-DigiWP-Timestamp'], /^\d+$/)
  assert.equal(h['X-DigiWP-Site'], 'site-key')
})

test('verifySignature accepts a freshly signed request', () => {
  const secret = 's3cr3t'
  const body = '{"hello":"world"}'
  const h = signHeaders(secret, 'k', body)
  assert.equal(verifySignature(secret, {
    timestamp: h['X-DigiWP-Timestamp'], signature: h['X-DigiWP-Signature'], rawBody: body,
  }), true)
})

test('verifySignature rejects a wrong secret, tampered body, and stale timestamp', () => {
  const body = '{"a":1}'
  const h = signHeaders('right', 'k', body)
  assert.equal(verifySignature('wrong', { timestamp: h['X-DigiWP-Timestamp'], signature: h['X-DigiWP-Signature'], rawBody: body }), false)
  assert.equal(verifySignature('right', { timestamp: h['X-DigiWP-Timestamp'], signature: h['X-DigiWP-Signature'], rawBody: '{"a":2}' }), false)
  const stale = String(Math.floor(Date.now() / 1000) - 999)
  const sig = crypto.createHmac('sha256', 'right').update(`${stale}\n${body}`).digest('hex')
  assert.equal(verifySignature('right', { timestamp: stale, signature: sig, rawBody: body }), false)
})
