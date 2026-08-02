// The reply goes straight onto the owner's screen. A model that wraps its
// answer in JSON — which they do, even when asked for prose — must not put
// braces and \u escapes in front of a person.
import test from 'node:test'
import assert from 'node:assert/strict'

import { plainReply } from '../src/assistant.js'

test('plain prose is returned unchanged', () => {
  assert.equal(plainReply('سایت روی وردپرس ۶٫۶ است.'), 'سایت روی وردپرس ۶٫۶ است.')
})

test('a JSON object carrying the reply is unwrapped', () => {
  // Observed in production against nabu-smart: the whole answer arrived as a
  // JSON document and was rendered verbatim, escapes and all.
  const raw = JSON.stringify({ reply: 'در این سطح دسترسی تغییر انجام نمی‌دهم.' })
  assert.equal(plainReply(raw), 'در این سطح دسترسی تغییر انجام نمی‌دهم.')
})

test('the other common field names are unwrapped too', () => {
  for (const key of ['answer', 'content', 'text', 'message']) {
    assert.equal(plainReply(JSON.stringify({ [key]: 'نتیجه' })), 'نتیجه')
  }
})

test('a fenced JSON block is unwrapped', () => {
  assert.equal(plainReply('```json\n{"reply":"بله"}\n```'), 'بله')
})

test('a fenced non-JSON block loses only the fence', () => {
  assert.equal(plainReply('```\nwp core update\n```'), 'wp core update')
})

test('a JSON object with no text field is left alone', () => {
  // Better to show the owner something odd than to silently return nothing.
  const raw = '{"pending":3}'
  assert.equal(plainReply(raw), raw)
})

test('prose that merely starts with a brace survives', () => {
  const raw = '{ این یک متن است که با آکولاد شروع شده'
  assert.equal(plainReply(raw), raw)
})

test('an empty or missing reply yields an empty string, not a crash', () => {
  assert.equal(plainReply(''), '')
  assert.equal(plainReply(null), '')
  assert.equal(plainReply(undefined), '')
  assert.equal(plainReply('   '), '')
})

test('a reply whose text field is blank is not treated as unwrapped', () => {
  const raw = '{"reply":"   ","pending":1}'
  assert.equal(plainReply(raw), raw)
})
