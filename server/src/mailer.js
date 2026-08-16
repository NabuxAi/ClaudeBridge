import { config } from './config.js'

/**
 * Send a transactional email via the configured provider.
 *
 * EMAIL_URL is an HTTP POST endpoint. The body shape is the common one:
 *   { to, subject, text, html, from }
 *
 * Providers differ, so the field names and auth are configurable:
 *   EMAIL_API_KEY  — added as Authorization: Bearer <key> when present
 *   EMAIL_FROM     — default sender address
 *
 * Returns the provider response so the caller can decide what to log. A missing
 * EMAIL_URL is not a failure here; the caller treats "no mailer configured" as
 * its own state.
 */
export async function sendMail({ to, subject, text, html, from }) {
  const url = config.alerts.emailUrl
  if (!url) return { ok: false, reason: 'no_email_url', detail: 'EMAIL_URL is not configured' }
  if (!to) return { ok: false, reason: 'no_recipient', detail: 'No recipient address' }

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
