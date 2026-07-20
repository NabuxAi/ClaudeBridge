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
  if (!token || !token.includes('.')) return null
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
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const dk = crypto.scryptSync(String(pw), salt, 64)
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`
}

export function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$')
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false
  const dk = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64)
  const a = Buffer.from(hashHex, 'hex')
  return a.length === dk.length && crypto.timingSafeEqual(a, dk)
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
