// ============================================================
// Emergency delivery — one message, several roads, in order.
//
// The requirement this exists for: when a site is compromised, we have to know
// before its owner does, and they have to hear from us before they hear from a
// customer. That means delivery cannot depend on any single provider being up,
// reachable from here, or not blocked this week.
//
// So every channel is a small, independent attempt with the same shape, and
// the dispatcher walks them until one genuinely succeeds. "Genuinely" is the
// load-bearing word: a channel that is not configured has not failed and must
// not be counted as an attempt, and an HTTP 200 from a provider that quietly
// dropped the message is not a success we can claim. Where a provider gives us
// a message id we keep it; where it does not, we say so rather than implying
// confirmation we do not have.
//
// Nothing here retries on its own. Retrying inside a channel would delay the
// fallback, and the whole point is that the second road is tried quickly.
// ============================================================
import { config } from '../config.js'

const TIMEOUT = 12000

/** Shape every channel returns. Uniform so the dispatcher needs no special cases. */
const ok = (channel, detail = {}) => ({ channel, ok: true, ...detail })
const fail = (channel, error, detail = {}) => ({ channel, ok: false, error, ...detail })
const skip = (channel, why) => ({ channel, ok: false, skipped: true, error: why })

/**
 * Firebase Cloud Messaging.
 *
 * The legacy `key=` server-key endpoint, because it needs one secret and no
 * OAuth dance — which matters for a path that has to work when everything else
 * is on fire. FCM answers 200 with a per-message failure inside the body, so
 * the body is checked rather than the status code.
 */
export async function firebase(msg, to) {
  if (!config.alerts.fcmServerKey) return skip('firebase', 'کلید Firebase تنظیم نشده')
  if (!to?.fcmToken) return skip('firebase', 'توکن دستگاه ثبت نشده')

  try {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${config.alerts.fcmServerKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: to.fcmToken,
        priority: 'high',
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url || '', severity: msg.severity || 'critical' },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return fail('firebase', `HTTP ${res.status}`)
    const body = await res.json().catch(() => ({}))
    // 200 with success:0 is a failure wearing a success's clothes.
    if (body.success !== 1) {
      return fail('firebase', body.results?.[0]?.error || 'پیام تحویل نشد')
    }
    return ok('firebase', { id: body.multicast_id ? String(body.multicast_id) : null })
  } catch (e) {
    return fail('firebase', e.message)
  }
}

/**
 * Najva — web push that works from inside Iran.
 *
 * Here precisely because Firebase is not dependable from an Iranian network.
 * Two providers on the same medium is not redundancy for its own sake: it is
 * the case where the first one is reachable for us and not for the person we
 * are trying to warn.
 */
export async function najva(msg, to) {
  if (!config.alerts.najvaApiKey) return skip('najva', 'کلید نجوا تنظیم نشده')
  if (!to?.najvaToken) return skip('najva', 'توکن نجوا ثبت نشده')

  try {
    const res = await fetch('https://app.najva.com/api/v1/notification/management/send/', {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.alerts.najvaApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: msg.title,
        body: msg.body,
        url: msg.url || undefined,
        subscriber_tokens: [to.najvaToken],
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return fail('najva', `HTTP ${res.status}`)
    const body = await res.json().catch(() => ({}))
    return ok('najva', { id: body.id ? String(body.id) : null })
  } catch (e) {
    return fail('najva', e.message)
  }
}

/**
 * SMS.
 *
 * The channel that works when the phone has no data and the app is uninstalled,
 * which is why it sits below push but above email. Kept to one short line: a
 * long SMS is several messages, costs several times as much, and arrives out
 * of order often enough to matter.
 */
export async function sms(msg, to) {
  if (!config.alerts.smsApiKey || !config.alerts.smsUrl) return skip('sms', 'سرویس پیامک تنظیم نشده')
  if (!to?.phone) return skip('sms', 'شماره موبایل ثبت نشده')

  const text = `${msg.title}\n${msg.smsBody || msg.body}`.slice(0, 300)
  try {
    const res = await fetch(config.alerts.smsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.alerts.smsAuthHeader
          ? { [config.alerts.smsAuthHeader]: config.alerts.smsApiKey }
          : { Authorization: `Bearer ${config.alerts.smsApiKey}` }),
      },
      body: JSON.stringify({
        // Kept generic on purpose: Iranian SMS gateways all differ, and the
        // field names live in configuration rather than being hardcoded to one
        // vendor we would then be unable to switch away from in a hurry.
        [config.alerts.smsToField]: to.phone,
        [config.alerts.smsTextField]: text,
        ...(config.alerts.smsFrom ? { [config.alerts.smsFromField]: config.alerts.smsFrom } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return fail('sms', `HTTP ${res.status}`)
    return ok('sms', { id: null, note: 'ارسال پذیرفته شد؛ تحویل به گوشی تأیید نشده' })
  } catch (e) {
    return fail('sms', e.message)
  }
}

/**
 * Email, over plain SMTP-as-a-service HTTP APIs or a webhook.
 *
 * Last, because it is the slowest to be read and the most likely to be
 * filtered — but it is also the only channel that carries detail, so the body
 * here is the full explanation rather than the one-line version.
 */
export async function email(msg, to) {
  if (!config.alerts.emailUrl) return skip('email', 'سرویس ایمیل تنظیم نشده')
  if (!to?.email) return skip('email', 'ایمیل ثبت نشده')

  try {
    const res = await fetch(config.alerts.emailUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.alerts.emailApiKey ? { Authorization: `Bearer ${config.alerts.emailApiKey}` } : {}),
      },
      body: JSON.stringify({
        to: to.email,
        from: config.alerts.emailFrom,
        subject: msg.title,
        text: msg.emailBody || msg.body,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return fail('email', `HTTP ${res.status}`)
    return ok('email')
  } catch (e) {
    return fail('email', e.message)
  }
}

/**
 * Telegram — our own operator channel, not the customer's.
 *
 * Always attempted regardless of what else succeeded, because the requirement
 * is that *we* find out first. A customer alert that lands and is never read
 * still leaves the site compromised; this is the one that reaches a human on
 * our side.
 */
export async function telegramOps(msg) {
  if (!config.telegram.token || !config.telegram.chatId) {
    return skip('telegram-ops', 'تلگرام تنظیم نشده')
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: `🚨 <b>${msg.title}</b>\n${msg.body}${msg.url ? `\n${msg.url}` : ''}`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!res.ok) return fail('telegram-ops', `HTTP ${res.status}`)
    return ok('telegram-ops')
  } catch (e) {
    return fail('telegram-ops', e.message)
  }
}

/**
 * The order the dispatcher walks.
 *
 * Fastest and most immediate first, most durable last. Push wakes a phone in
 * seconds; SMS survives having no data; email is slowest to be read but is the
 * only one that carries the full explanation.
 */
export const ORDER = [
  { id: 'firebase', send: firebase },
  { id: 'najva', send: najva },
  { id: 'sms', send: sms },
  { id: 'email', send: email },
]
