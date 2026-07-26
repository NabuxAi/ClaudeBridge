// ============================================================
// Probes — things we can measure about a site from outside it.
//
// The overview screen used to be entirely invented: a 99.98% uptime for a site
// nobody had ever monitored, a 412ms response time, "82% · 41/50GB" of host
// storage, and nine green service checks including a payment gateway this
// system has never called. All of it on the first screen, all of it precise,
// none of it measured.
//
// What is here is what an HTTP client and a TLS handshake can actually
// establish. It is a shorter list, and that is the point: three real readings
// beat nine convincing ones.
// ============================================================
import tls from 'node:tls'

/**
 * Fetch a URL and time it.
 *
 * The timing is one sample from our server, not an average and not a user's
 * experience — the caller has to label it as such. Redirects are followed
 * because a site that 301s to https is working, not broken.
 */
async function timedGet(url, timeoutMs = 12000) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'DigiWP-Monitor/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: res.ok, status: res.status, ms: Date.now() - started, url: res.url }
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - started, error: e.message }
  }
}

/**
 * How long the TLS certificate has left.
 *
 * Read from the handshake rather than from any API, so it reflects what a
 * browser will see. An expiring certificate is the single most common way a
 * healthy site becomes unreachable overnight, and it is cheap to know.
 */
export function certificate(hostname, port = 443, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    try {
      const socket = tls.connect({ host: hostname, port, servername: hostname, timeout: timeoutMs }, () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        if (!cert || !cert.valid_to) return done({ ok: false, error: 'گواهی خوانده نشد' })
        const expires = new Date(cert.valid_to)
        done({
          ok: true,
          expiresAt: expires.toISOString(),
          daysLeft: Math.floor((expires - Date.now()) / 86400000),
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
        })
      })
      socket.on('error', (e) => done({ ok: false, error: e.message }))
      socket.on('timeout', () => { socket.destroy(); done({ ok: false, error: 'timeout' }) })
    } catch (e) {
      done({ ok: false, error: e.message })
    }
  })
}

/**
 * Check the endpoints we can check.
 *
 * Homepage and wp-login only. Cart, payment gateway and contact form were on
 * the old list — we have no idea what URLs those are on any given site, and a
 * green tick beside "درگاه پرداخت" that nothing tested is worse than no tick.
 *
 * wp-login is expected to answer 200: a 200 means WordPress is serving, and a
 * 403 usually means someone has locked it down deliberately, which is reported
 * rather than called a failure.
 */
export async function probeSite(siteUrl) {
  if (!siteUrl) return null
  let base
  try { base = new URL(siteUrl) } catch { return null }

  const [home, login, cert] = await Promise.all([
    timedGet(base.origin + '/'),
    timedGet(new URL('/wp-login.php', base.origin).href),
    base.protocol === 'https:' ? certificate(base.hostname) : Promise.resolve({ ok: false, error: 'سایت روی https نیست' }),
  ])

  const services = [
    {
      label: 'صفحهٔ اصلی',
      ok: home.ok,
      detail: home.ok ? `${home.status} در ${home.ms}ms` : (home.error || `کد ${home.status}`),
    },
    {
      label: 'صفحهٔ ورود مدیریت',
      ok: login.ok || login.status === 403,
      detail: login.status === 403
        ? 'دسترسی بسته شده (۴۰۳) — احتمالاً عمدی'
        : login.ok ? `${login.status} در ${login.ms}ms` : (login.error || `کد ${login.status}`),
    },
    {
      label: 'گواهی SSL',
      ok: cert.ok && cert.daysLeft > 0,
      detail: cert.ok
        ? `${cert.daysLeft} روز اعتبار${cert.issuer ? ` — ${cert.issuer}` : ''}`
        : (cert.error || 'خوانده نشد'),
    },
  ]

  return {
    checkedAt: Date.now(),
    home,
    login,
    cert,
    services,
    // One sample, named as one sample. Averaging a single reading into a
    // "typical response time" is how the old 412ms happened.
    responseMs: home.ok ? home.ms : null,
    reachable: home.ok,
  }
}
