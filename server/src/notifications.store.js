// Persistent store for notification preferences and enrolled contacts.
import { one, all, newId } from './db.js'
import { httpError } from './store.js'
import { t } from './i18n.js'

const CHANNELS = [{ id: 'email' }, { id: 'sms' }, { id: 'push' }]

/** A channel with its label/description in `locale`. */
const channelMeta = (id, locale) => ({
  id,
  label: t(locale, `notifications.channel.${id}.label`),
  desc: t(locale, `notifications.channel.${id}.desc`),
})

const publicContact = (c) => c && ({
  id: c.id,
  type: c.type,
  value: c.value,
  verified: !!c.verified_at,
  verifiedAt: c.verified_at || null,
  createdAt: c.created_at,
})

const publicSetting = (s, locale) => s && ({
  channel: s.channel,
  enabled: !!s.enabled,
  destination: s.destination || null,
  quietHoursStart: s.quiet_hours_start,
  quietHoursEnd: s.quiet_hours_end,
  updatedAt: s.updated_at,
  ...(CHANNELS.some((c) => c.id === s.channel) ? channelMeta(s.channel, locale) : {}),
})

export const notifications = {
  channels: CHANNELS,

  /** Return every known channel merged with the user's saved preference, if any. */
  async getPreferences(userId, locale) {
    const rows = await all(
      'SELECT * FROM notification_settings WHERE user_id = $1 ORDER BY channel',
      [userId]
    )
    const byChannel = new Map(rows.map((r) => [r.channel, r]))
    return CHANNELS.map((c) => {
      const saved = byChannel.get(c.id)
      return saved
        ? publicSetting(saved, locale)
        : { ...channelMeta(c.id, locale), enabled: false, destination: null, quietHoursStart: null, quietHoursEnd: null, updatedAt: null }
    })
  },

  /**
   * Upsert a preference for one channel.
   *
   * This is a full overwrite (PUT semantics): every field is written as sent,
   * so sending null clears destination or quiet hours.
   */
  async setPreference(userId, channel, { enabled, destination, quietHoursStart, quietHoursEnd } = {}, locale) {
    if (!CHANNELS.some((c) => c.id === channel)) {
      throw httpError(400, 'notifications.invalidChannel')
    }
    const now = Date.now()
    const start = clampHour(quietHoursStart)
    const end = clampHour(quietHoursEnd)
    const dest = normaliseDestination(channel, destination)
    const row = await one(
      `INSERT INTO notification_settings
         (user_id, channel, enabled, destination, quiet_hours_start, quiet_hours_end, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, channel)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         destination = EXCLUDED.destination,
         quiet_hours_start = EXCLUDED.quiet_hours_start,
         quiet_hours_end = EXCLUDED.quiet_hours_end,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [userId, channel, !!enabled, dest, start, end, now]
    )
    return publicSetting(row, locale)
  },

  async listContacts(userId) {
    const rows = await all(
      'SELECT * FROM user_contacts WHERE user_id = $1 ORDER BY type, created_at DESC',
      [userId]
    )
    return rows.map(publicContact)
  },

  async addContact(userId, type, value) {
    if (!CHANNELS.some((c) => c.id === type)) {
      throw httpError(400, 'notifications.invalidContactType')
    }
    const normalised = normaliseContactValue(type, value)
    if (!normalised) throw httpError(400, 'notifications.invalidContactValue')
    const id = newId('uc_')
    const now = Date.now()
    const row = await one(
      `INSERT INTO user_contacts (id, user_id, type, value, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, type, value)
       DO UPDATE SET value = EXCLUDED.value
       RETURNING *`,
      [id, userId, type, normalised, now]
    )
    return publicContact(row)
  },

  async deleteContact(userId, id) {
    const row = await one(
      'DELETE FROM user_contacts WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    )
    if (!row) throw httpError(404, 'notifications.contactNotFound')
    return { ok: true, id: row.id }
  },

  async verifyContact(userId, id) {
    const row = await one(
      'UPDATE user_contacts SET verified_at = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId, Date.now()]
    )
    if (!row) throw httpError(404, 'notifications.contactNotFound')
    return publicContact(row)
  },
}

function clampHour(v) {
  if (v === undefined || v === null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n < 0 || n > 23) return null
  return Math.floor(n)
}

function normaliseDestination(channel, value) {
  const s = String(value || '').trim()
  if (!s) return null
  if (channel === 'email') {
    // Basic sanity check; the dispatcher will validate again before sending.
    if (!s.includes('@') || s.length > 254) return null
    return s.toLowerCase()
  }
  if (channel === 'sms') {
    const digits = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '')
    if (!digits) return null
    if (/^09\d{9}$/.test(digits)) return '+98' + digits.slice(1)
    if (/^989\d{9}$/.test(digits)) return '+' + digits
    if (/^9\d{9}$/.test(digits)) return '+98' + digits
    if (digits.length >= 10 && digits.length <= 15) return '+' + digits
    return null
  }
  // push tokens can be long JSON blobs from the browser; just cap length.
  return s.length <= 2048 ? s : null
}

function normaliseContactValue(type, value) {
  return normaliseDestination(type, value)
}
