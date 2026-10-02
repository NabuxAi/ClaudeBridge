// ============================================================
// Persistent store for web push subscriptions.
//
// Depends only on db.js helpers (never on auth.js or store.js's httpError
// path is fine — db.js already imports auth.js, and nothing here is imported
// by db.js, so the graph loads in any order).
//
// Honesty rules this store carries: the endpoint is a capability URL, so the
// public shapes never return it in full — only an id, a host, and a short
// tail a person can recognise their own browser by. The encryption keys
// never leave this module for the API at all.
// ============================================================
import { one, all, newId } from './db.js'
import { httpError } from './store.js'

/** Never ship the full endpoint or the encryption keys to the browser. */
const publicSubscription = (s) => s && ({
  id: s.id,
  endpointHost: hostOf(s.endpoint),
  endpointTail: String(s.endpoint || '').slice(-12),
  createdAt: s.created_at === undefined ? null : Number(s.created_at),
})

function hostOf(endpoint) {
  try {
    return new URL(endpoint).host
  } catch {
    return null
  }
}

export const pushSubscriptions = {
  /**
   * Register (or refresh) one browser subscription for a user.
   *
   * Upsert on the endpoint: the same browser subscribing again updates its
   * keys and owner rather than leaving a stale row behind. Moving an endpoint
   * between users is allowed on purpose — "unsubscribe then subscribe" on a
   * shared or re-registered browser must not orphan the row under an old
   * account.
   */
  async upsert(userId, { endpoint, p256dh, auth }) {
    const row = await one(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth
       RETURNING *`,
      [newId('psub_'), userId, endpoint, p256dh, auth, Date.now()]
    )
    return publicSubscription(row)
  },

  /** Remove one of THIS user's subscriptions, by id or endpoint. True if a row went. */
  async remove(userId, { id, endpoint } = {}) {
    const row = await one(
      `DELETE FROM push_subscriptions
        WHERE user_id = $1 AND ($2::text IS NOT NULL AND id = $2 OR $3::text IS NOT NULL AND endpoint = $3)
       RETURNING id`,
      [userId, id || null, endpoint || null]
    )
    return !!row
  },

  /** The user's subscriptions, safe to render — no endpoint URL, no keys. */
  async listForUser(userId) {
    const rows = await all(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    )
    return rows.map(publicSubscription)
  },

  async countForUser(userId) {
    const row = await one(
      'SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1',
      [userId]
    )
    return row?.n || 0
  },

  /**
   * Full rows for delivery, keys included — server-internal only.
   * Oldest first, so cleanup during a send walks rows in a stable order.
   */
  async allForUser(userId) {
    return all(
      'SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    )
  },

  /**
   * Delivery-time cleanup: a push service answers 404/410 for an endpoint it
   * will never deliver to again. Keeping the row would make every future
   * alert pay for a guaranteed failure, so the sender deletes it. The endpoint
   * is globally unique, so this needs no user scope; there is no row for it
   * to escape.
   */
  async removeByEndpoint(endpoint) {
    const row = await one(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 RETURNING id',
      [endpoint]
    )
    return !!row
  },
}

/** Shared validation for the subscribe route and the sender. */
export function validateSubscription(body) {
  const endpoint = String(body?.endpoint || '').trim()
  if (!endpoint || endpoint.length > 2048) {
    throw httpError(400, 'نشانی اشتراک (endpoint) نامعتبر است.')
  }
  let url
  try {
    url = new URL(endpoint)
  } catch {
    throw httpError(400, 'نشانی اشتراک (endpoint) نامعتبر است.')
  }
  // A push endpoint is an HTTPS capability. Anything else is either a mistake
  // or someone trying to make the server fetch/sign something it should not.
  if (url.protocol !== 'https:') {
    throw httpError(400, 'اشتراک اعلان باید یک نشانی HTTPS معتبر باشد.')
  }
  const p256dh = String(body?.keys?.p256dh || '').trim()
  const auth = String(body?.keys?.auth || '').trim()
  if (!p256dh || !auth || p256dh.length > 512 || auth.length > 512) {
    throw httpError(400, 'کلیدهای رمزنگاری اشتراک (p256dh و auth) لازم است.')
  }
  return { endpoint, p256dh, auth }
}
