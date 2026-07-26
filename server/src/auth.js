// Minimal signed-token auth for hub sessions (HMAC, no external deps).
import crypto from 'node:crypto'
import { config } from './config.js'

const b64url = (buf) => Buffer.from(buf).toString('base64url')
const fromB64url = (s) => Buffer.from(s, 'base64url').toString('utf8')

export function signToken(payload, ttlSeconds = 60 * 60 * 24 * 7) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }
  const p = b64url(JSON.stringify(body))
  const sig = crypto.createHmac('sha256', config.authSecret).update(p).digest('base64url')
  return `${p}.${sig}`
}

export function verifyToken(token) {
  // Typed check, not just truthiness. A non-string reaching here throws on
  // .includes, and this function is called with whatever arrived in an
  // Authorization header — so a crafted request could turn token parsing into
  // an unhandled exception rather than a clean 401.
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [p, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', config.authSecret).update(p).digest('base64url')
  const a = Buffer.from(sig || '')
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(fromB64url(p))
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

// ---- Password hashing (scrypt, no external deps) ----------
//
// Async, not scryptSync. Node runs one thread: scryptSync blocks it for the
// whole derivation, so a few concurrent login attempts freeze every other
// request on the server. That turns the login form into a denial-of-service
// lever, which is the opposite of what a slow hash is for. The async version
// runs on the threadpool and leaves the event loop free.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 }

const scrypt = (pw, salt) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(String(pw), salt, SCRYPT.keylen, SCRYPT, (err, dk) => (err ? reject(err) : resolve(dk)))
  })

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const dk = await scrypt(pw, salt)
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`
}

export async function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$')
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false
  const dk = await scrypt(pw, Buffer.from(saltHex, 'hex'))
  const a = Buffer.from(hashHex, 'hex')
  return a.length === dk.length && crypto.timingSafeEqual(a, dk)
}

/**
 * Burn the same time as a real verification, for an email that does not exist.
 *
 * Without this, login leaks which addresses have accounts: a miss returns in
 * under a millisecond while a hit costs a full scrypt derivation, and that gap
 * is measurable over the network. Anyone can then enumerate the customer list
 * before trying a single password.
 */
export async function verifyPasswordDummy(pw) {
  await scrypt(pw, DUMMY_SALT)
  return false
}

const DUMMY_SALT = crypto.randomBytes(16)

/**
 * Refuse to run in production with the development signing secret.
 *
 * With the default secret, anyone who has read this repository can mint a
 * valid session token for any user id. A server that boots anyway and prints a
 * warning nobody reads is a server that ships that way — so this stops the
 * process instead.
 */
export function assertSecretIsReal() {
  if (config.authSecret && config.authSecret !== 'dev-only-change-me' && config.authSecret.length >= 32) {
    return
  }
  const why = !config.authSecret || config.authSecret === 'dev-only-change-me'
    ? 'AUTH_SECRET is unset or still the development default'
    : 'AUTH_SECRET is shorter than 32 characters'
  if (process.env.NODE_ENV === 'production') {
    console.error(`Refusing to start: ${why}. Anyone who knows it can forge a session for any account.`)
    process.exit(1)
  }
  console.warn(`WARNING: ${why}. Fine for local work; the server will refuse to start like this in production.`)
}

/** Express middleware: require a valid hub session token. */
export function requireAuth(req, res, next) {
  const auth = req.get('authorization') || ''
  const m = auth.match(/Bearer\s+(.+)/i)
  const payload = m ? verifyToken(m[1].trim()) : null
  if (!payload) return res.status(401).json({ message: 'Unauthorized' })
  req.user = payload
  next()
}
