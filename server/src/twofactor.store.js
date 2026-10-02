// ============================================================
// Persistent store for TOTP two-factor enrollment — the secret a
// user's authenticator app holds, and the one-time recovery codes
// that stand in for it when the phone is gone.
//
// Depends only on db.js helpers, node:crypto and the base32 codec in
// totp.js — never on auth.js or store.js — so the module graph loads
// in any order (the same discipline sessions.store.js follows).
//
// Source of truth: THIS table, not the legacy `users.two_factor`
// display flag. The flag is kept in sync on activate/disable so the
// public user shape stays truthful, but enforcement and the security
// page read from here.
// ============================================================
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'
import { base32Encode } from './totp.js'

/** How many one-time recovery codes an activation mints. */
export const RECOVERY_CODE_COUNT = 8

/**
 * Recovery codes are stored uppercase, without the display dash. A user
 * typing "abcd-efgh" or "ABCDEFGH" means the same code; the normalization
 * lives here so every writer and reader hashes the same string.
 */
export const normalizeRecoveryCode = (code) =>
  String(code || '').toUpperCase().replace(/[\s-]/g, '')

/** Only the SHA-256 of a recovery code is ever stored or compared. */
const codeHash = (code) =>
  crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex')

/** 40 random bits → 8 base32 characters → the "XXXX-XXXX" a human can read out. */
const generateRecoveryCode = () => {
  const raw = base32Encode(crypto.randomBytes(5))
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

const publicState = (row) => row && ({
  status: row.status,
  createdAt: row.created_at === undefined ? null : Number(row.created_at),
  activatedAt: row.activated_at == null ? null : Number(row.activated_at),
})

export const twoFactor = {
  /** The raw enrollment row (secret included) — for verification paths only. */
  async get(userId) {
    return one('SELECT * FROM two_factor WHERE user_id = $1', [userId])
  },

  /**
   * Store a freshly generated secret as "pending". Any earlier enrollment —
   * a pending secret the user abandoned, or leftover rows from a deactivated
   * factor — is replaced: a setup that starts over must not resurrect an
   * old secret an attacker may have seen in transit.
   */
  async setPending(userId, secret) {
    if (!userId || !secret) {
      const e = new Error('کاربر و رمز برای راه‌اندازی لازم است.')
      e.status = 400
      throw e
    }
    await one(
      `INSERT INTO two_factor (user_id, secret, status, created_at)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (user_id) DO UPDATE SET secret = $2, status = 'pending', activated_at = NULL`,
      [userId, secret, Date.now()]
    )
  },

  /**
   * Promote the pending secret to "active" and mint a fresh set of one-time
   * recovery codes. Returns the raw codes — the only time they exist outside
   * the hash column, so the caller must put them in exactly one response.
   * Old recovery codes are wiped: they belonged to a previous activation.
   */
  async activate(userId) {
    const row = await one(
      `UPDATE two_factor SET status = 'active', activated_at = $2
        WHERE user_id = $1 AND status = 'pending'
        RETURNING *`,
      [userId, Date.now()]
    )
    if (!row) {
      const e = new Error('راه‌اندازی ورود دو مرحله‌ای در جریان نیست.')
      e.status = 400
      throw e
    }
    await all('DELETE FROM two_factor_recovery WHERE user_id = $1', [userId])
    const codes = []
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      const code = generateRecoveryCode()
      codes.push(code)
      await one(
        'INSERT INTO two_factor_recovery (id, user_id, code_hash, created_at) VALUES ($1, $2, $3, $4)',
        [newId('tfr_'), userId, codeHash(code), Date.now()]
      )
    }
    await one('UPDATE users SET two_factor = true WHERE id = $1', [userId])
    return { codes, activatedAt: Number(row.activated_at) }
  },

  /**
   * Spend one recovery code, atomically. The UPDATE matches only an unused
   * row, so two simultaneous guesses cannot both spend the same code — the
   * loser's UPDATE matches nothing and returns no row. A code someone
   * already used is, from here on, just a wrong answer.
   */
  async consumeRecoveryCode(userId, code) {
    const normalized = normalizeRecoveryCode(code)
    // 8 base32 characters is the exact shape generateRecoveryCode mints;
    // anything else is a wrong answer without a database round trip.
    if (!/^[A-Z2-7]{8}$/.test(normalized)) return false
    const row = await one(
      `UPDATE two_factor_recovery SET used_at = $3
        WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
        RETURNING id`,
      [userId, codeHash(normalized), Date.now()]
    )
    return !!row
  },

  /** How many of the user's recovery codes are still unspent. */
  async recoveryCodesLeft(userId) {
    const row = await one(
      'SELECT COUNT(*)::int AS n FROM two_factor_recovery WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    )
    return row?.n || 0
  },

  /**
   * Turn the factor off and erase it: the secret, every recovery code (spent
   * or not), and the display flag. Nothing is kept "in case" — a disabled
   * factor leaves nothing behind to leak, and a later setup starts clean.
   */
  async disable(userId) {
    await all('DELETE FROM two_factor_recovery WHERE user_id = $1', [userId])
    await all('DELETE FROM two_factor WHERE user_id = $1', [userId])
    await one('UPDATE users SET two_factor = false WHERE id = $1', [userId])
  },

  /**
   * Same erase, for account deletion — where the user row is tombstoned
   * rather than deleted, so the FK cascade never fires and this must run
   * explicitly or the secret outlives the account.
   */
  async purge(userId) {
    await twoFactor.disable(userId)
  },
}
