// ============================================================
// Rate limiting — the actual brute-force defence.
//
// The captcha next door filters scripts; this is what makes guessing passwords
// impractical. Two independent limits, because they stop different attacks and
// either one alone has a hole:
//
//   per IP       one machine hammering one login form.
//   per account  a distributed attempt against one known email, where every
//                request comes from a different address and a per-IP limit
//                never trips.
//
// A failed attempt costs the attacker; a successful login clears the account
// counter, so a customer who mistypes twice and then gets it right is not
// carrying a penalty into tomorrow.
//
// In memory on purpose. It is one process today, and a limiter that needs
// Redis is a limiter that silently stops working the day Redis is unreachable
// — which is exactly when someone is attacking you. If this ever becomes
// several processes, the fix is a shared store, and until then the honest
// statement is in `note` below rather than in nobody's head.
// ============================================================

const buckets = new Map()

/** Trim expired entries. Called on write, so an idle server does not hold memory. */
function sweep(now) {
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key)
  }
}

/**
 * Count one attempt against a key.
 *
 * `hit` returns what the caller needs to answer with: whether to allow it, how
 * many tries are left, and how long to wait. It does not throw, because a
 * limiter that throws tends to get wrapped in a try/catch that swallows it.
 */
export function hit(key, { limit, windowMs }) {
  const now = Date.now()
  if (buckets.size > 5000) sweep(now)

  let b = buckets.get(key)
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  b.count++

  const allowed = b.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - b.count),
    retryAfter: Math.ceil((b.resetAt - now) / 1000),
  }
}

/** Forget a key. Used after a successful login so honest mistakes do not accumulate. */
export function clear(key) {
  buckets.delete(key)
}

/** Read without counting — for deciding whether to demand a captcha. */
export function peek(key) {
  const b = buckets.get(key)
  if (!b || b.resetAt < Date.now()) return { count: 0 }
  return { count: b.count }
}

/**
 * The client's address.
 *
 * Behind Traefik every request arrives from the proxy, so the forwarded header
 * is the only way to tell clients apart. That header is also trivially forged
 * by anyone talking to the server directly — which is why `trustProxy` is a
 * deliberate configuration choice rather than a default: switched on where a
 * proxy really does sit in front, off where it does not. Trusting it blindly
 * would let an attacker rotate a header value and bypass the per-IP limit
 * entirely.
 */
export function clientIp(req, { trustProxy }) {
  if (trustProxy) {
    const fwd = req.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    const real = req.get('x-real-ip')
    if (real) return real.trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}

/**
 * Express middleware factory.
 *
 * `keyFn` decides what is being limited — an address, an account, a pairing
 * token. Keys are namespaced by `name` so two limiters cannot collide.
 */
export function limiter(name, { limit, windowMs, keyFn, message }) {
  return (req, res, next) => {
    const key = `${name}:${keyFn(req)}`
    const r = hit(key, { limit, windowMs })
    res.setHeader('X-RateLimit-Remaining', String(r.remaining))
    if (r.allowed) return next()
    res.setHeader('Retry-After', String(r.retryAfter))
    res.status(429).json({
      message: message || 'درخواست‌های شما بیش از حد مجاز است. کمی صبر کنید.',
      retryAfter: r.retryAfter,
    })
  }
}

export const note =
  'Rate limits are held in this process. With more than one server process they ' +
  'become per-process and the effective limit multiplies — move to a shared store first.'

/** Test seam. */
export function _reset() {
  buckets.clear()
}
