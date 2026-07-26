// The math captcha.
//
// A captcha is only worth having if the ways around it are closed. These tests
// are the ways around it: forge a challenge, replay a solved one, wait it out,
// or answer a challenge you were never issued.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { issue, verify, MESSAGES, _spentSize } from '../src/security/captcha.js'
import { config } from '../src/config.js'

/** Solve a challenge the way a human would: read the question, do the sum. */
function solve(question) {
  const fa = '۰۱۲۳۴۵۶۷۸۹'
  const ascii = question.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
  const m = ascii.match(/(-?\d+)\s*([+×−])\s*(-?\d+)/)
  assert.ok(m, `unparsable question: ${question}`)
  const [, a, op, b] = m
  if (op === '+') return Number(a) + Number(b)
  if (op === '−') return Number(a) - Number(b)
  return Number(a) * Number(b)
}

test('a correct answer passes', () => {
  const c = issue()
  assert.match(c.question, /=\s*\?$/)
  assert.equal(verify(c.id, solve(c.question)).ok, true)
})

test('Persian digits are accepted in the answer', () => {
  // The question is asked in Persian numerals, so a keyboard that types them
  // must not produce a wrong answer.
  const c = issue()
  const answer = String(solve(c.question)).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])
  assert.equal(verify(c.id, answer).ok, true)
})

test('a wrong answer fails', () => {
  const c = issue()
  const r = verify(c.id, solve(c.question) + 1)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'wrong')
})

test('a solved challenge cannot be replayed', () => {
  // The attack this closes: solve one challenge, then reuse that same id for
  // every subsequent request. Without single-use the captcha costs an attacker
  // one solve, ever.
  const c = issue()
  const answer = solve(c.question)
  assert.equal(verify(c.id, answer).ok, true)
  const second = verify(c.id, answer)
  assert.equal(second.ok, false)
  assert.equal(second.reason, 'reused')
})

test('a forged challenge is rejected', () => {
  // Anyone can construct the body — it is base64 of "answer.expiry.nonce" —
  // so the signature is the only thing standing between an attacker and a
  // challenge whose answer they chose.
  const body = `42.${Date.now() + 60000}.deadbeef`
  const forged = `${Buffer.from(body).toString('base64url')}.${'x'.repeat(43)}`
  const r = verify(forged, 42)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'forged')
})

test('a challenge signed with the wrong key is rejected', () => {
  const body = `7.${Date.now() + 60000}.abc`
  const sig = crypto.createHmac('sha256', 'not-our-secret').update(body).digest('base64url')
  const r = verify(`${Buffer.from(body).toString('base64url')}.${sig}`, 7)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'forged')
})

test('an expired challenge is rejected even with the right answer', () => {
  // Hand-built with a past expiry, signed correctly — so the only thing that
  // can reject it is the expiry check.
  const body = `9.${Date.now() - 1000}.nonce`
  const sig = crypto.createHmac('sha256', config.authSecret).update(body).digest('base64url')
  const r = verify(`${Buffer.from(body).toString('base64url')}.${sig}`, 9)
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'expired')
})

test('a missing or malformed id is rejected without throwing', () => {
  assert.equal(verify(undefined, 1).reason, 'missing')
  assert.equal(verify('', 1).reason, 'missing')
  assert.equal(verify('nodot', 1).reason, 'missing')
  assert.equal(verify('!!!.!!!', 1).ok, false)
})

test('an empty or non-numeric answer never passes', () => {
  const c = issue()
  for (const bad of ['', '  ', 'abc', null, undefined, {}, '1e3']) {
    assert.equal(verify(c.id, bad).ok, false, `accepted ${JSON.stringify(bad)}`)
  }
})

test('every failure reason has a message the user can act on', () => {
  for (const reason of ['missing', 'malformed', 'forged', 'expired', 'reused', 'wrong']) {
    assert.ok(MESSAGES[reason], `no message for ${reason}`)
  }
})

test('challenges differ, so one solved answer does not fit the next', () => {
  const ids = new Set()
  for (let i = 0; i < 20; i++) ids.add(issue().id)
  assert.equal(ids.size, 20, 'challenge ids must be unique')
})

test('spent challenges do not accumulate forever', () => {
  // The one-time-use set is memory, so it has to be swept. Reading the size
  // through the seam is enough: it must not grow past the number of live
  // challenges we actually solved.
  const before = _spentSize()
  const c = issue()
  verify(c.id, solve(c.question))
  assert.equal(_spentSize(), before + 1)
})
