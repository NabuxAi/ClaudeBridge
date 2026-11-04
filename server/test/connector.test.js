import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { signHeaders, verifySignature, consumeSignedNonce } from '../src/connector.js'

// Independently reproduce the plugin's PHP scheme: ts + newline + nonce + newline + raw body.
function pluginExpected(secret, timestamp, nonce, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${body}`).digest('hex')
}

test('signHeaders uses unpredictable nonce and matches PHP HMAC byte-for-byte', () => {
  const body = JSON.stringify({ method: 'tools/call', params: { name: 'site_info' } })
  const a = signHeaders('secret', 'site-key', body)
  const b = signHeaders('secret', 'site-key', body)
  assert.match(a['X-DigiWP-Timestamp'], /^\d{10,12}$/)
  assert.match(a['X-DigiWP-Nonce'], /^[a-f0-9]{32}$/)
  assert.notEqual(a['X-DigiWP-Nonce'], b['X-DigiWP-Nonce'])
  assert.equal(a['X-DigiWP-Signature'], pluginExpected('secret', a['X-DigiWP-Timestamp'], a['X-DigiWP-Nonce'], body))
  assert.equal(a['X-DigiWP-Site'], 'site-key')
})

test('signature verifier rejects bad secret, nonce, body, timestamp and legacy v1 signatures', () => {
  const body = '{"a":1}'
  const h = signHeaders('right', 'site', body)
  const signed = { timestamp: h['X-DigiWP-Timestamp'], nonce: h['X-DigiWP-Nonce'], signature: h['X-DigiWP-Signature'], rawBody: body }
  assert.equal(verifySignature('right', signed), true)
  assert.equal(verifySignature('wrong', signed), false)
  assert.equal(verifySignature('right', { ...signed, rawBody: '{"a":2}' }), false)
  assert.equal(verifySignature('right', { ...signed, nonce: '0'.repeat(32) }), false)
  assert.equal(verifySignature('right', { ...signed, nonce: undefined }), false)
  const old = crypto.createHmac('sha256', 'right').update(`${signed.timestamp}\n${body}`).digest('hex')
  assert.equal(verifySignature('right', { ...signed, signature: old }), false)
  const stale = String(Math.floor(Date.now() / 1000) - 999)
  const staleSig = pluginExpected('right', stale, signed.nonce, body)
  assert.equal(verifySignature('right', { ...signed, timestamp: stale, signature: staleSig }), false)
})

test('replay guard refuses a second use of the same signed nonce per site', () => {
  const nonce = crypto.randomBytes(16).toString('hex')
  assert.equal(consumeSignedNonce('siteA', nonce), true)
  assert.equal(consumeSignedNonce('siteA', nonce), false)
  assert.equal(consumeSignedNonce('siteB', nonce), true)
  assert.equal(consumeSignedNonce('siteB', nonce), false)
  assert.equal(consumeSignedNonce('siteA', 'invalid'), false)
})
