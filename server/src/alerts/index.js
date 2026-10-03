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
//
// Language: compose() writes the owner's message in their users.lang; the
// operator's Telegram copy can be composed separately in
// config.operatorLocale and passed as `opsMsg`. The dispatch record itself
// (note, skip reasons) is evidence stored in alert_deliveries: English, with
// its key beside it.
// ============================================================
import { ORDER, telegramOps } from './channels.js'
import { config } from '../config.js'
import { isPushConfigured, dirFor } from '../push.js'
import { t, normalizeLocale, DEFAULT_LOCALE } from '../i18n.js'

/**
 * Send one emergency alert.
 *
 * `stopOnFirstSuccess` is the default and the point of the fallback chain: the
 * next road is only taken because the previous one did not work. Setting it
 * false sends everywhere at once, which is right for a confirmed compromise —
 * at that point waking someone twice is cheaper than waking them not at all.
 */
export async function dispatch(msg, to, { stopOnFirstSuccess = true, channels = ORDER, opsMsg = msg } = {}) {
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
      r = { channel: ch.id, ok: false, error: t('en', 'alerts.fail.unexpected', { error: e.message }) }
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
    ops = await telegramOps(opsMsg)
  } catch (e) {
    ops = { channel: 'telegram-ops', ok: false, error: e.message }
  }

  const tried = attempts.filter((a) => !a.skipped)
  const skipped = attempts.filter((a) => a.skipped)
  const noteKey = delivered
    ? 'alerts.notes.accepted'
    : tried.length === 0 ? 'alerts.notes.nothingConfigured' : 'alerts.notes.allFailed'

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
    skipped: skipped.map((s) => ({ channel: s.channel, why: s.error, whyKey: s.errorKey || null })),
    ops,
    // Never "notified". Accepted by a provider is as far as our knowledge goes.
    note: t('en', noteKey),
    noteKey,
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
export function compose(event, site, locale = DEFAULT_LOCALE) {
  const lang = normalizeLocale(locale) || DEFAULT_LOCALE
  const tr = (key, vars) => t(lang, key, vars)
  const name = site?.title || site?.name || tr('alerts.compose.yourSite')
  const panel = config.publicPanelUrl ? `${config.publicPanelUrl}/site/${site?.id || ''}` : null
  // The event's own title, in this reader's language when the row carries a
  // key (events.i18nTitle), else as stored.
  const what = event?.detail?.i18n?.key ? tr(event.detail.i18n.key, event.detail.i18n.vars) : event.title
  const v = { name, what }

  const templates = {
    malware: {
      title: tr('alerts.compose.malware.title', v),
      body: tr('alerts.compose.malware.body', v),
      smsBody: tr('alerts.compose.malware.sms', v),
      emailBody:
        tr('alerts.compose.malware.email', v) +
        (panel ? `${tr('alerts.compose.malware.panel', { url: panel })}\n` : ''),
    },
    core_integrity: {
      title: tr('alerts.compose.coreIntegrity.title', v),
      body: tr('alerts.compose.coreIntegrity.body', v),
      smsBody: tr('alerts.compose.coreIntegrity.sms', v),
      emailBody: tr('alerts.compose.coreIntegrity.email', v) + (panel ? `${panel}\n` : ''),
    },
    down: {
      title: tr('alerts.compose.down.title', v),
      body: tr('alerts.compose.down.body', v),
      smsBody: tr('alerts.compose.down.sms', v),
      emailBody: tr('alerts.compose.down.email', v) + (panel ? `${panel}\n` : ''),
    },
  }

  const text = templates[event.kind] || {
    title: tr('alerts.compose.generic.title', v),
    body: what,
    smsBody: `${name}: ${what}`.slice(0, 140),
    emailBody: `${what}\n\n` + (panel ? `${panel}\n` : ''),
  }

  // lang/dir ride along so every channel can render the text the right way
  // round (the web-push payload carries them to the service worker).
  return { ...text, url: panel, severity: event.severity || 'critical', lang, dir: dirFor(lang) }
}

/**
 * Should this event wake someone up?
 *
 * Deliberately narrow. An alert channel that fires on everything gets muted,
 * and a muted emergency channel is worse than none — it looks like coverage.
 * Only a confirmed-critical, currently-open finding qualifies.
 */
/**
 * Which owner-facing alert channels this deployment can actually use.
 *
 * Emergency dispatch is best-effort by design — an unconfigured channel is
 * skipped rather than failed, which is right, and also means a deployment with
 * none of them configured never tells a site owner anything and looks entirely
 * healthy doing it. The operator still hears about it on the ops channel, so
 * nothing appears wrong from the inside either.
 *
 * Said once at startup so that state is a choice rather than a discovery.
 */
export function alertChannelStatus() {
  const live = []
  const missing = []
  const check = (id, ok, env) => (ok ? live : missing).push(ok ? id : `${id} (${env})`)

  check('web-push', isPushConfigured(), 'VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY')
  check('firebase', !!config.alerts.fcmServerKey, 'FCM_SERVER_KEY')
  check('najva', !!config.alerts.najvaApiKey, 'NAJVA_API_KEY')
  check('sms', !!(config.alerts.smsUrl && config.alerts.smsApiKey), 'SMS_URL + SMS_API_KEY')
  check('email', !!config.alerts.emailUrl, 'EMAIL_URL')

  return { live, missing, ops: !!(config.telegram.token && config.telegram.chatId) }
}

export function isEmergency(event) {
  if (!event || event.resolved_at) return false
  if (event.severity !== 'critical') return false
  return ['malware', 'core_integrity', 'down'].includes(event.kind)
}
