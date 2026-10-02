// ============================================================
// Persistent store for hub sessions — the server-side half of
// "log out this device / all other devices".
//
// Depends only on db.js helpers and node:crypto (never on auth.js or
// store.js): auth.js's requireAuth is one of this module's callers, and
// db.js already imports auth.js for password hashing — keeping this file
// out of that cycle is what makes the graph load in any order.
// ============================================================
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'

/** Sessions live exactly as long as the tokens they authorize. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * last_seen is refreshed at most once per minute per session. Every
 * authenticated request would otherwise turn a read into a read + write on
 * the hottest table in the database, for a timestamp nobody needs to the
 * second.
 */
export const LAST_SEEN_THROTTLE_MS = 60 * 1000

/** Only the SHA-256 of a token's jti is ever stored or compared. */
export const tokenHash = (jti) => crypto.createHash('sha256').update(String(jti)).digest('hex')

/**
 * The response shape for the sessions list. token_hash is deliberately
 * absent — it is an internal lookup key, not something any client needs —
 * and `current` marks the session the request itself arrived on.
 */
const publicSession = (s, currentHash = null) => s && ({
  id: s.id,
  device: s.device || 'دستگاه ناشناس',
  ip: s.ip || null,
  createdAt: s.created_at === undefined ? null : Number(s.created_at),
  lastSeenAt: s.last_seen_at === undefined ? null : Number(s.last_seen_at),
  expiresAt: s.expires_at === undefined ? null : Number(s.expires_at),
  revokedAt: s.revoked_at == null ? null : Number(s.revoked_at),
  current: currentHash != null && s.token_hash === currentHash,
})

export const sessions = {
  /**
   * Create the session row a fresh token's jti points at. Called from the
   * login and register routes: a token without a session row is dead on
   * arrival, so a failure here must fail the login (fail closed), not
   * hand out an untracked token.
   *
   * Expired rows for this user are pruned on the way in — logins are the
   * one moment the user's own session history is already being touched,
   * so no scheduler is needed to keep the table bounded.
   */
  async create({ userId, jti, device = '', ip = '', ttlMs = SESSION_TTL_MS }) {
    if (!userId || !jti) {
      const e = new Error('کاربر و شناسه نشست برای ساخت نشست لازم است.')
      e.status = 400
      throw e
    }
    const hash = tokenHash(jti)
    const now = Date.now()
    const ttl = Number(ttlMs)
    const expiresAt = Number.isFinite(ttl) ? now + ttl : now + SESSION_TTL_MS
    await one('DELETE FROM sessions WHERE user_id = $1 AND expires_at <= $2', [userId, now])
    return one(
      `INSERT INTO sessions (id, user_id, token_hash, device, ip, created_at, last_seen_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       RETURNING *`,
      [
        newId('ses_'), userId, hash,
        String(device || '').slice(0, 120),
        String(ip || '').slice(0, 64),
        now, expiresAt,
      ]
    )
  },

  /** The live session a token's jti maps to, or null — revoked and expired are the same "no". */
  async findActive(jtiHash) {
    return one(
      'SELECT * FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2',
      [jtiHash, Date.now()]
    )
  },

  /**
   * Cheap last_seen refresh: a single UPDATE that matches only when the
   * stored value is older than the throttle window, so the common case is
   * a no-row update rather than a read-modify-write race. The threshold is
   * computed here, not as `$1 - $3` in SQL: two untyped parameters around a
   * minus sign are an ambiguity PostgreSQL refuses to guess its way out of.
   */
  async touch(jtiHash) {
    const now = Date.now()
    await one(
      'UPDATE sessions SET last_seen_at = $1 WHERE token_hash = $2 AND last_seen_at <= $3',
      [now, jtiHash, now - LAST_SEEN_THROTTLE_MS]
    )
  },

  /**
   * The user's active sessions, current first, then most recent activity.
   * Revoked and expired sessions are not returned: the page answers
   * "which devices are signed in now", not a forensic history.
   */
  async listForUser(userId, currentJtiHash = null) {
    const rows = await all(
      'SELECT * FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2',
      [userId, Date.now()]
    )
    return rows
      .sort((a, b) =>
        Number(b.token_hash === currentJtiHash) - Number(a.token_hash === currentJtiHash)
        || Number(b.last_seen_at) - Number(a.last_seen_at))
      .map((r) => publicSession(r, currentJtiHash))
  },

  /** Revoke one session, but only if it belongs to this user. Returns the row or null. */
  async revoke(id, userId) {
    return one(
      `UPDATE sessions SET revoked_at = $3
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        RETURNING *`,
      [id, userId, Date.now()]
    )
  },

  /** Revoke every active session of this user except the current one. Returns how many. */
  async revokeOthers(userId, currentJtiHash) {
    const rows = await all(
      `UPDATE sessions SET revoked_at = $3
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $3 AND token_hash <> $2
        RETURNING id`,
      [userId, currentJtiHash, Date.now()]
    )
    return rows.length
  },

  /**
   * Revoke every active session of this user, the current one included —
   * "log out everywhere" with no exception. Account deletion is its caller:
   * the one flow where keeping the requesting session alive would be wrong,
   * since the person it authenticated no longer exists as an account. The
   * count is what the route reports, so the panel can say plainly that every
   * device was signed out.
   */
  async revokeAll(userId) {
    const rows = await all(
      `UPDATE sessions SET revoked_at = $2
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2
        RETURNING id`,
      [userId, Date.now()]
    )
    return rows.length
  },
}
