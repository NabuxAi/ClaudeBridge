// ============================================================
// TOTP — RFC 6238 — on node:crypto alone, no external dependency.
//
// Parameters (the de-facto standard every authenticator app ships with):
//   HMAC-SHA1, 30-second step, 6 digits, verification window ±1 step
//   (clock skew between the server and the phone is the normal case,
//   not the exception).
//
// Deliberately pure: no database, no config, no Express. The store that
// keeps secrets (twofactor.store.js) and the routes that expose them
// (routes/auth.js) sit above this module, and the RFC test vectors live
// in test/totp.test.js — the mathematics is the one part of this feature
// that can be proven against a fixed, published truth.
// ============================================================
import crypto from 'node:crypto'

/** RFC 4648 base32 alphabet — the form Google Authenticator expects. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/**
 * Encode a buffer as unpadded base32. Padding ("=") is legal RFC 4648 but
 * every authenticator app accepts the unpadded form and some manual-entry
 * UIs choke on it, so the secret is generated without it.
 */
export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  // Remaining 1–4 bits pad with zeros on the right — the RFC's own rule.
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

/**
 * Decode base32, tolerating the shapes a human pastes: lower case, the
 * "XXXX-XXXX" grouping the recovery codes use, spaces, and "=" padding.
 * A genuinely invalid character throws — a silent partial decode would
 * verify codes against a different key than the one the user scanned.
 */
export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[=\s-]/g, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error('رشته base32 نویسهٔ نامعتبر دارد.')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * A fresh TOTP secret: 160 bits of randomness (the RFC 4226 recommendation),
 * base32-encoded — 32 characters a user can also type by hand.
 */
export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes))
}

/**
 * The HOTP truncation (RFC 4226, section 5.3) feeding RFC 6238: HMAC over
 * the 8-byte big-endian counter, dynamic offset from the last byte's low
 * nibble, 31-bit extraction, mod 10^digits, zero-padded.
 */
function hotp(keyBuf, counter, { digits = 6, algorithm = 'sha1' } = {}) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const h = crypto.createHmac(algorithm, keyBuf).update(msg).digest()
  const offset = h[h.length - 1] & 0x0f
  const binary =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

const keyOf = (secret) => (Buffer.isBuffer(secret) ? secret : base32Decode(secret))

/** The TOTP code the given secret shows at `time` (epoch ms). */
export function totp(secret, { time = Date.now(), step = 30, digits = 6, algorithm = 'sha1' } = {}) {
  return hotp(keyOf(secret), Math.floor(time / 1000 / step), { digits, algorithm })
}

/**
 * Verify a user-supplied code against the ±`window` steps around `time`.
 *
 * Comparison is constant-time per candidate and the candidate is compared
 * only when its length matches — a short "1234" never learns anything about
 * the expected value. The leading-zero case is why the string form is
 * compared, never parseInt: "050471" parses to a number that no longer
 * remembers how long it was.
 */
export function verify(
  secret,
  code,
  { window = 1, time = Date.now(), step = 30, digits = 6, algorithm = 'sha1' } = {}
) {
  const given = String(code ?? '').replace(/[\s-]/g, '')
  if (!new RegExp(`^\\d{${digits}}$`).test(given)) return false
  const key = keyOf(secret)
  const counter = Math.floor(time / 1000 / step)
  for (let i = -window; i <= window; i++) {
    const expected = hotp(key, counter + i, { digits, algorithm })
    if (expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      return true
    }
  }
  return false
}

/**
 * The otpauth:// URI an authenticator app scans (or accepts as a manual
 * "account key"). Issuer appears twice on purpose: once in the label —
 * which is what most apps display — and once as the `issuer` parameter,
 * which is what the rest of them display.
 */
export function otpauthUri({ secret, account, issuer = 'DigiWP', digits = 6, step = 30 }) {
  const label = encodeURIComponent(`${issuer}:${account || ''}`)
  const q = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(step),
  })
  return `otpauth://totp/${label}?${q.toString()}`
}
