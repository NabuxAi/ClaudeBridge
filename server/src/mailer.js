import { config } from './config.js'

/**
 * Send a transactional email.
 *
 * Two providers, in priority order:
 *
 *   EMAIL_SERVER  direct SMTP, as a connection URL:
 *                   smtps://user%40domain.com:pass@host:465  (implicit TLS)
 *                   smtp://user:pass@host:587                 (STARTTLS)
 *                 The username is percent-encoded because it holds "@";
 *                 it is decoded here, not by nodemailer.
 *   EMAIL_URL     an HTTP POST endpoint. The body shape is the common one:
 *                   { to, subject, text, html, from }
 *                 Providers differ, so the field names and auth are
 *                 configurable:
 *                   EMAIL_API_KEY — added as Authorization: Bearer <key>
 *                   EMAIL_FROM    — default sender address
 *
 * The response shape { ok, status?, reason, detail } is a contract: callers
 * (team invitations, password resets) read ok/reason and must not have to
 * know which transport answered. "accepted" still means the provider took
 * the message, not that a human read it.
 */
let smtpTransportPromise = null

// Test seam: lets the suite exercise the SMTP branch with a fake transport
// instead of importing nodemailer or touching a network. Setting it (or
// clearing it) also drops the cached transport.
let smtpTransportFactory = null
export function _setSmtpTransportFactoryForTests(factory) {
  smtpTransportFactory = factory
  smtpTransportPromise = null
}

/**
 * Parse an smtp(s):// connection URL into nodemailer transport options.
 *
 * Throws on anything nodemailer could not be asked to speak to, so a bad
 * EMAIL_SERVER becomes an honest `{ok:false}` per send rather than a crash
 * inside a route.
 */
export function parseEmailServerUrl(raw) {
  const u = new URL(raw)
  if (u.protocol !== 'smtps:' && u.protocol !== 'smtp:') {
    throw new Error(`EMAIL_SERVER must be an smtp:// or smtps:// URL, got "${u.protocol}//"`)
  }
  // URL keeps userinfo percent-encoded; SMTP usernames contain "@" and some
  // providers put reserved characters in passwords, so both are decoded.
  const auth = u.username || u.password
    ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) }
    : undefined
  return {
    host: u.hostname,
    port: Number(u.port) || (u.protocol === 'smtps:' ? 465 : 587),
    secure: u.protocol === 'smtps:',
    ...(auth ? { auth } : {}),
  }
}

async function getSmtpTransport() {
  if (!smtpTransportPromise) {
    smtpTransportPromise = (async () => {
      const options = parseEmailServerUrl(config.alerts.emailServer)
      if (smtpTransportFactory) return smtpTransportFactory(options)
      // Lazy so a deployment (or test run) that never sends SMTP never pays
      // for the import.
      const mod = await import('nodemailer')
      const nodemailer = mod.default || mod
      return nodemailer.createTransport(options)
    })()
  }
  return smtpTransportPromise
}

/**
 * Whether any email transport is configured. Deployment state, not account
 * state: safe to compute before a database lookup and to return to every
 * caller identically.
 */
export function isMailerConfigured() {
  return Boolean(config.alerts.emailServer || config.alerts.emailUrl)
}

export async function sendMail({ to, subject, text, html, from }) {
  const smtpUrl = config.alerts.emailServer
  const url = config.alerts.emailUrl
  if (!smtpUrl && !url) {
    return { ok: false, reason: 'no_email_url', detail: 'No email transport configured: set EMAIL_SERVER (SMTP) or EMAIL_URL (HTTP provider)' }
  }
  if (!to) return { ok: false, reason: 'no_recipient', detail: 'No recipient address' }

  if (smtpUrl) {
    let transport
    try {
      transport = await getSmtpTransport()
    } catch (e) {
      // The URL could not be parsed (or nodemailer is missing) — a deployment
      // problem, distinct from a refused send.
      return { ok: false, reason: 'smtp_misconfigured', detail: { message: e?.message || null } }
    }
    try {
      const info = await transport.sendMail({
        from: from || config.alerts.emailFrom,
        to,
        subject,
        text,
        html,
      })
      // The last SMTP response usually starts with its 2xx/4xx/5xx code;
      // surface it as `status` when it does, so the shape matches the HTTP
      // branch. Never includes credentials.
      const code = /^(\d{3})/.exec(String(info?.response || ''))
      return {
        ok: true,
        ...(code ? { status: Number(code[1]) } : {}),
        reason: 'accepted',
        detail: { response: info?.response ?? null, messageId: info?.messageId ?? null },
      }
    } catch (e) {
      return { ok: false, reason: 'smtp_error', detail: { message: e?.message || null } }
    }
  }

  const body = JSON.stringify({
    to,
    from: from || config.alerts.emailFrom,
    subject,
    text,
    html,
  })

  const headers = { 'Content-Type': 'application/json' }
  if (config.alerts.emailApiKey) {
    headers.Authorization = `Bearer ${config.alerts.emailApiKey}`
  }

  const res = await fetch(url, { method: 'POST', headers, body })
  let detail = null
  try {
    detail = await res.json()
  } catch {
    detail = await res.text().catch(() => null)
  }
  return {
    ok: res.ok,
    status: res.status,
    reason: res.ok ? 'accepted' : 'provider_error',
    detail,
  }
}
