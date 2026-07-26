// ============================================================
// Math captcha — a challenge the server does not have to remember.
//
// The whole challenge (the answer, when it expires, and a nonce) is packed
// into an HMAC-signed token handed to the client. Nothing is stored, so this
// works with more than one server process and survives a restart: an attacker
// cannot exhaust a challenge table, because there is no challenge table.
//
// What it is and is not. This stops scripted form-hammering, which is what
// actually happens to a login page. It does not stop someone determined — the
// arithmetic is solvable by any parser, deliberately, because a captcha hard
// enough to stop a program is hard enough to stop a person with poor eyesight
// or a screen reader. The real brute-force defence is the rate limiter next to
// it; this is the cheap first filter, and it must never be the only one.
// ============================================================
import crypto from 'node:crypto'
import { config } from '../config.js'

const TTL_MS = 10 * 60 * 1000

// One-time use. A signed token is otherwise replayable until it expires, which
// would let a script solve one challenge and reuse it for every attempt —
// exactly the thing this is meant to prevent.
const spent = new Map()

function sweep() {
  const now = Date.now()
  for (const [id, exp] of spent) if (exp < now) spent.delete(id)
}

const FA = '۰۱۲۳۴۵۶۷۸۹'
const faNum = (n) => String(n).replace(/\d/g, (d) => FA[d])

/**
 * Build a challenge.
 *
 * Small numbers and only + − ×. The point is to cost a script a round trip and
 * a parse, not to test anyone's arithmetic; a question a tired person gets
 * wrong at 2am is a question that locks out a real customer.
 */
export function issue() {
  const ops = [
    () => { const a = rand(2, 9), b = rand(2, 9); return { q: `${faNum(a)} + ${faNum(b)}`, a: a + b } },
    () => { const a = rand(5, 15), b = rand(1, 4); return { q: `${faNum(a)} − ${faNum(b)}`, a: a - b } },
    () => { const a = rand(2, 6), b = rand(2, 6); return { q: `${faNum(a)} × ${faNum(b)}`, a: a * b } },
  ]
  const { q, a } = ops[rand(0, ops.length - 1)]()
  const exp = Date.now() + TTL_MS
  const nonce = crypto.randomBytes(9).toString('base64url')
  const body = `${a}.${exp}.${nonce}`
  const sig = crypto.createHmac('sha256', config.authSecret).update(body).digest('base64url')

  return {
    id: `${Buffer.from(body).toString('base64url')}.${sig}`,
    question: `${q} = ?`,
    expiresIn: Math.floor(TTL_MS / 1000),
  }
}

/**
 * Check an answer.
 *
 * Returns a reason rather than a bare false, because the caller has to tell a
 * wrong answer (offer a new challenge) apart from an expired one (also offer a
 * new challenge, but do not count it as a failed attempt against the user).
 */
export function verify(id, answer) {
  if (!id || typeof id !== 'string' || !id.includes('.')) {
    return { ok: false, reason: 'missing' }
  }
  const [bodyB64, sig] = id.split('.')
  let body
  try {
    body = Buffer.from(bodyB64, 'base64url').toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const expected = crypto.createHmac('sha256', config.authSecret).update(body).digest('base64url')
  const a = Buffer.from(sig || '')
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'forged' }
  }

  const [ansStr, expStr] = body.split('.')
  if (Number(expStr) < Date.now()) return { ok: false, reason: 'expired' }

  sweep()
  if (spent.has(id)) return { ok: false, reason: 'reused' }

  // Persian digits go in, so they have to be accepted coming back.
  const given = String(answer ?? '').trim().replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
  if (!/^-?\d+$/.test(given) || Number(given) !== Number(ansStr)) {
    return { ok: false, reason: 'wrong' }
  }

  spent.set(id, Number(expStr))
  return { ok: true }
}

/** Human-readable Persian for each failure, so callers do not invent their own. */
export const MESSAGES = {
  missing: 'پاسخ سؤال امنیتی را وارد کنید.',
  malformed: 'سؤال امنیتی نامعتبر است. صفحه را دوباره بارگذاری کنید.',
  forged: 'سؤال امنیتی نامعتبر است. صفحه را دوباره بارگذاری کنید.',
  expired: 'مهلت پاسخ به سؤال امنیتی تمام شد. سؤال تازه بگیرید.',
  reused: 'این سؤال قبلاً استفاده شده. سؤال تازه بگیرید.',
  wrong: 'پاسخ سؤال امنیتی درست نیست.',
}

function rand(min, max) {
  // crypto rather than Math.random: a predictable challenge is not a challenge.
  return min + crypto.randomInt(max - min + 1)
}

/** Test seam — lets a suite assert that used challenges really are rejected. */
export function _spentSize() {
  sweep()
  return spent.size
}
