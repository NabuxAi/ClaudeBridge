// ============================================================
// Web Push sender — the server's own VAPID channel to a user's browsers.
//
// Two honesty rules shape the response shape:
//
//  1. An unconfigured deployment is a supported state, not an error: with no
//     VAPID keys the answer is { ok:false, reason:'not_configured' } — the
//     same mailConfigured lesson, never a self-minted key that the next
//     deploy would orphan.
//
//  2. "The push service accepted the message" is as far as our knowledge
//     goes. A notification can be delivered to a locked phone the person
//     never looks at, or dropped by the OS. Nothing here may be worded as
//     "the owner was notified" — the caller records what the provider said.
//
// The web-push module sits behind a seam (the mailer's transport-factory
// pattern), so tests exercise the whole send/cleanup contract with a fake
// and never touch a real push service or the network.
// ============================================================
import { config } from './config.js'
import { pushSubscriptions } from './push.store.js'
import { t, normalizeLocale, DEFAULT_LOCALE } from './i18n.js'

/** Right-to-left scripts among the supported languages. */
const RTL = new Set(['fa', 'ar'])
export const dirFor = (locale) => (RTL.has(normalizeLocale(locale)) ? 'rtl' : 'ltr')

// Test seam: injects a fake web-push module. Setting (or clearing) it also
// drops the lazily imported real module, like the mailer's factory seam.
let webPushOverride = null
export function _setWebPushForTests(mod) {
  webPushOverride = mod
}

let webPushModule = null
async function getWebPush() {
  if (webPushOverride) return webPushOverride
  if (!webPushModule) {
    const mod = await import('web-push')
    webPushModule = mod.default || mod
  }
  return webPushModule
}

/**
 * Whether this deployment can push at all. Deployment state, not account
 * state — safe to compute before any lookup and to return identically to
 * every caller (the mailConfigured property).
 */
export function isPushConfigured() {
  return Boolean(config.push.publicKey && config.push.privateKey)
}

/**
 * Send one payload to explicit subscription rows.
 *
 * `payload.lang` is the recipient's language (their users.lang): it picks the
 * default title and the wording of `detail`/`note`, and travels in the push
 * body with `dir` so the service worker renders the notification the right
 * way round (hub/public/sw.js reads data.lang / data.dir).
 *
 * Returns what each provider said, plus which subscriptions were removed for
 * being gone (404/410) — a push service that has forgotten an endpoint will
 * never deliver to it again, so keeping the row would make every future alert
 * pay for a guaranteed failure.
 */
export async function sendToSubscriptions(subs, payload = {}) {
  const lang = normalizeLocale(payload.lang) || DEFAULT_LOCALE
  const tr = (key) => t(lang, key)
  if (!isPushConfigured()) {
    return {
      ok: false, reason: 'not_configured', total: 0, accepted: 0, failed: 0, removed: 0,
      detail: tr('pushSender.notConfigured'),
    }
  }
  const rows = Array.isArray(subs) ? subs : []
  if (!rows.length) {
    return {
      ok: false, reason: 'no_subscription', total: 0, accepted: 0, failed: 0, removed: 0,
      detail: tr('pushSender.noSubscription'),
    }
  }

  const webpush = await getWebPush()
  // Identifies the server to push services on every send; cheap and stateless.
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey)
  const body = JSON.stringify({
    title: payload.title || tr('pushSender.defaultTitle'),
    body: payload.body || '',
    lang,
    dir: dirFor(lang),
    url: payload.url || '/',
    ...(payload.tag ? { tag: payload.tag } : {}),
    ...(payload.severity ? { severity: payload.severity } : {}),
  })

  let accepted = 0
  let failed = 0
  const removed = []
  for (const s of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      )
      accepted++
    } catch (e) {
      // 404/410: the subscription is expired, revoked, or unknown — gone for
      // good. 413/payload too large and 403/invalid keys are also permanent,
      // but only 404/410 is the push-service contract for "dead endpoint".
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        if (await pushSubscriptions.removeByEndpoint(s.endpoint)) removed.push(s.id || s.endpoint)
      } else {
        failed++
      }
    }
  }

  return {
    // "Accepted by the push service" — not "seen by a human".
    ok: accepted > 0,
    reason: accepted > 0 ? 'accepted' : 'all_failed',
    total: rows.length,
    accepted,
    failed,
    removed,
    note: accepted > 0
      ? tr('pushSender.accepted')
      : tr('pushSender.noneAccepted'),
  }
}

/** Convenience wrapper: fetch a user's rows, then send. */
export async function sendToUser(userId, payload) {
  if (!isPushConfigured()) return sendToSubscriptions([], payload)
  const subs = await pushSubscriptions.allForUser(userId)
  return sendToSubscriptions(subs, payload)
}
