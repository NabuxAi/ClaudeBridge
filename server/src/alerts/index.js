// ============================================================
// Emergency dispatch — walk the channels until one really lands.
//
// The rule that shapes everything: an unconfigured channel has not failed.
// Skipping it must not consume the attempt, must not count towards "we tried
// everything", and must be visible in the record — otherwise a deployment that
// forgot an API key looks identical to one where every provider was down, and
// nobody finds out until the night it matters.
//
// A second rule, less obvious: a channel that reported success is not proof
// the person read it. Push can be delivered to a phone that is off; SMS can be
// accepted by a gateway that never delivers. So a dispatch records what was
// attempted and what each provider said, and the panel presents that as
// evidence rather than as "the customer has been notified".
// ============================================================
import { ORDER, telegramOps } from './channels.js'
import { config } from '../config.js'

/**
 * Send one emergency alert.
 *
 * `stopOnFirstSuccess` is the default and the point of the fallback chain: the
 * next road is only taken because the previous one did not work. Setting it
 * false sends everywhere at once, which is right for a confirmed compromise —
 * at that point waking someone twice is cheaper than waking them not at all.
 */
export async function dispatch(msg, to, { stopOnFirstSuccess = true, channels = ORDER } = {}) {
  const attempts = []
  let delivered = null

  for (const ch of channels) {
    // Every channel is wrapped. A provider SDK that throws, a DNS failure, an
    // unexpected response shape — any of those would otherwise abandon the
    // remaining channels, and that is the precise moment the fallback exists
    // for. A throw is recorded as a failure of that road, not of the walk.
    let r
    try {
      r = await ch.send(msg, to)
    } catch (e) {
      r = { channel: ch.id, ok: false, error: `خطای غیرمنتظره: ${e.message}` }
    }
    attempts.push(r)

    if (r.ok) {
      delivered = r.channel
      if (stopOnFirstSuccess) break
    }
    // A skip is not a failure and does not end the walk — it just means this
    // road does not exist on this deployment.
  }

  // Our own channel, always, and never in place of the customer's. The
  // requirement is that we find out first; a customer alert that lands and is
  // never opened still leaves a compromised site running.
  let ops
  try {
    ops = await telegramOps(msg)
  } catch (e) {
    ops = { channel: 'telegram-ops', ok: false, error: e.message }
  }

  const tried = attempts.filter((a) => !a.skipped)
  const skipped = attempts.filter((a) => a.skipped)

  return {
    delivered,
    // Explicit, because these three are different situations that a boolean
    // would flatten into one:
    //   delivered           at least one provider accepted it
    //   nothingConfigured   we had no way to reach this person at all
    //   allFailed           we had roads and every one of them broke
    nothingConfigured: tried.length === 0,
    allFailed: tried.length > 0 && !delivered,
    attempts,
    skipped: skipped.map((s) => ({ channel: s.channel, why: s.error })),
    ops,
    // Never "notified". Accepted by a provider is as far as our knowledge goes.
    note: delivered
      ? 'پیام توسط سرویس پذیرفته شد. تحویل و خوانده‌شدن آن تأیید نشده است.'
      : tried.length === 0
        ? 'هیچ راه اطلاع‌رسانی‌ای برای این کاربر تنظیم نشده بود.'
        : 'هیچ‌کدام از راه‌های اطلاع‌رسانی کار نکرد.',
  }
}

/**
 * Turn an event into the wording that goes out.
 *
 * Three lengths for three media. The SMS line has to survive being the only
 * thing someone reads at 3am on a lock screen, so it names the site and the
 * one action; the email carries the whole explanation because it is the only
 * channel with room for it.
 */
export function compose(event, site) {
  const name = site?.title || site?.name || 'سایت شما'
  const panel = config.publicPanelUrl ? `${config.publicPanelUrl}/site/${site?.id || ''}` : null

  const templates = {
    malware: {
      title: `هشدار امنیتی: ${name}`,
      body: `فایل آلوده روی ${name} پیدا شد. تا بررسی نشود، احتمال دسترسی مهاجم به سایت وجود دارد.`,
      smsBody: `فایل آلوده روی ${name} پیدا شد. لطفاً همین حالا پنل را ببینید.`,
      emailBody:
        `روی ${name} فایلی پیدا شد که با امضای بدافزارهای شناخته‌شده مطابقت دارد.\n\n` +
        `${event.title}\n\n` +
        'این یعنی احتمالاً کسی به سایت دسترسی نوشتن داشته. تا وقتی منشأ آن پیدا نشده، ' +
        'عوض کردن رمزها به‌تنهایی کافی نیست.\n\n' +
        (panel ? `جزئیات و عملیات نجات: ${panel}\n` : ''),
    },
    core_integrity: {
      title: `فایل هستهٔ دستکاری‌شده: ${name}`,
      body: `فایلی در هستهٔ وردپرس ${name} با نسخهٔ رسمی یکی نیست.`,
      smsBody: `فایل هستهٔ ${name} دستکاری شده. پنل را ببینید.`,
      emailBody:
        `یک یا چند فایل هستهٔ وردپرس روی ${name} با نسخهٔ رسمی همان نسخه تفاوت دارند.\n\n` +
        `${event.title}\n\n` +
        'فایل هسته بدون دلیل عوض نمی‌شود. این تقریباً همیشه یعنی چیزی آن را نوشته است.\n\n' +
        (panel ? `${panel}\n` : ''),
    },
    down: {
      title: `${name} پاسخ نمی‌دهد`,
      body: `آخرین بررسی ما به ${name} نرسید.`,
      smsBody: `${name} پاسخ نمی‌دهد.`,
      emailBody: `آخرین بررسی ما به ${name} نرسید.\n\n${event.title}\n\n` + (panel ? `${panel}\n` : ''),
    },
  }

  const t = templates[event.kind] || {
    title: `هشدار: ${name}`,
    body: event.title,
    smsBody: `${name}: ${event.title}`.slice(0, 140),
    emailBody: `${event.title}\n\n` + (panel ? `${panel}\n` : ''),
  }

  return { ...t, url: panel, severity: event.severity || 'critical' }
}

/**
 * Should this event wake someone up?
 *
 * Deliberately narrow. An alert channel that fires on everything gets muted,
 * and a muted emergency channel is worse than none — it looks like coverage.
 * Only a confirmed-critical, currently-open finding qualifies.
 */
export function isEmergency(event) {
  if (!event || event.resolved_at) return false
  if (event.severity !== 'critical') return false
  return ['malware', 'core_integrity', 'down'].includes(event.kind)
}
