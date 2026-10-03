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
import { t, DEFAULT_LOCALE } from './i18n.js'

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
        if (!cert || !cert.valid_to) return done({ ok: false, error: 'certificate could not be read', code: 'unreadable' })
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
 * green tick beside "payment gateway" that nothing tested is worse than no tick.
 *
 * wp-login is expected to answer 200: a 200 means WordPress is serving, and a
 * 403 usually means someone has locked it down deliberately, which is reported
 * rather than called a failure.
 */
export async function probeSite(siteUrl, { cacheBust = false, locale = DEFAULT_LOCALE } = {}) {
  if (!siteUrl) return null
  const tr = (key, vars) => t(locale, key, vars)
  let base
  try { base = new URL(siteUrl) } catch { return null }

  // Behind a CDN or a server-level page cache, a health check can be answered
  // from cache — so a site that is down returns a cheerful 200 from last hour.
  // The unique parameter is the difference between checking the site and
  // checking the cache.
  const bust = cacheBust ? `?cb=${Date.now().toString(36)}` : ''

  const [home, login, cert] = await Promise.all([
    timedGet(base.origin + '/' + bust),
    timedGet(new URL('/wp-login.php' + bust, base.origin).href),
    base.protocol === 'https:' ? certificate(base.hostname) : Promise.resolve({ ok: false, error: 'site is not served over https', code: 'not_https' }),
  ])

  const services = [
    {
      label: tr('probe.services.home'),
      ok: home.ok,
      detail: home.ok ? tr('probe.detail.answered', { status: String(home.status), ms: home.ms }) : (home.error || tr('probe.detail.code', { status: String(home.status) })),
    },
    {
      label: tr('probe.services.login'),
      ok: login.ok || login.status === 403,
      detail: login.status === 403
        ? tr('probe.detail.loginLocked')
        : login.ok ? tr('probe.detail.answered', { status: String(login.status), ms: login.ms }) : (login.error || tr('probe.detail.code', { status: String(login.status) })),
    },
    {
      label: tr('probe.services.ssl'),
      ok: cert.ok && cert.daysLeft > 0,
      detail: cert.ok
        ? tr(cert.issuer ? 'probe.detail.certDaysIssuer' : 'probe.detail.certDays', { count: cert.daysLeft, issuer: cert.issuer || '' })
        : (cert.code ? tr(`probe.cert.${cert.code}`) : cert.error || tr('probe.cert.unreadable')),
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
