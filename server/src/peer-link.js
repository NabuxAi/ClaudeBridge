// ============================================================
// Account links across the two DigiWP servers (Iran <-> international).
// ------------------------------------------------------------
// Each server has its own accounts. Someone with an account on both links
// them once, and from then on one hub MCP token — on either server — lists
// and acts on the sites of both accounts.
//
// Linking proves both halves belong to one person:
//   1. signed in on server A, they make a code (10 chars, ten minutes, once);
//   2. signed in on server B, they enter it. B sends it to A over the signed
//      peer relay with B's account id; A checks and spends the code, keeps
//      its row (A.user <-> B.user) and answers with A's account; B keeps the
//      mirror row. Same email is NOT required and never sufficient: neither
//      panel verifies an address at registration.
//
// A federated call carries both ids, and the receiving server acts only when
// its own row pairs exactly those two. It runs the request through its own
// hub-MCP policy as that local user (member read-only, sensitive -> proposal)
// and never forwards it again.
// ============================================================
import crypto from 'node:crypto'
import { one, query, newId } from './db.js'
import { httpError } from './i18n.js'
import { config } from './config.js'
import * as peerRelay from './peer-relay.js'

const CODE_TTL_MS = 10 * 60 * 1000
// No 0/O/1/I/L: people read this off one screen and type it into another.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

const hashCode = (code) => crypto.createHash('sha256').update(normalizeCode(code)).digest('hex')
export const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

function newCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

const peerRegion = () => (config.serverRegion === 'ir' ? 'intl' : config.serverRegion === 'intl' ? 'ir' : '')

const publicLink = (row) => row && ({
  peerEmail: row.peer_email,
  peerRegion: peerRegion(),
  linkedAt: Number(row.created_at),
})

export const peerLinks = {
  enabled: () => peerRelay.isConfigured(),

  get: async (userId) => one('SELECT * FROM account_links WHERE user_id = $1', [userId]),

  async status(userId) {
    return {
      enabled: peerRelay.isConfigured(),
      region: config.serverRegion || null,
      peerRegion: peerRegion() || null,
      peerPanelUrl: config.peerPanelUrl || null,
      link: publicLink(await this.get(userId)),
    }
  },

  /** Step 1, on the server that will be asked: a code for this account. */
  async createCode(userId) {
    if (!peerRelay.isConfigured()) throw httpError(503, 'peerLink.notConfigured')
    const code = newCode()
    const now = Date.now()
    // One live code per account: a new one replaces the last.
    await query('DELETE FROM account_link_codes WHERE user_id = $1 AND used_at IS NULL', [userId])
    await one(
      `INSERT INTO account_link_codes (id, user_id, code_hash, expires_at, created_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [newId('alc_'), userId, hashCode(code), now + CODE_TTL_MS, now]
    )
    return { code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresAt: now + CODE_TTL_MS }
  },

  /**
   * Step 2, on the server the code was entered on: ask the partner to spend
   * it, then keep the mirror row. Refuses when this account is already linked.
   */
  async redeem(user, code) {
    if (!peerRelay.isConfigured()) throw httpError(503, 'peerLink.notConfigured')
    if (normalizeCode(code).length !== CODE_LENGTH) throw httpError(400, 'peerLink.badCode')
    if (await this.get(user.id)) throw httpError(409, 'peerLink.alreadyLinked')
    let answer
    try {
      answer = await peerRelay.peerPost('/relay/link/redeem', { code: normalizeCode(code), peerUserId: user.id, peerEmail: user.email }, 20000)
    } catch (e) {
      if (e.status === 400 || e.status === 409) throw httpError(e.status, e.i18n?.key || 'peerLink.badCode')
      throw httpError(502, 'peerLink.peerUnavailable')
    }
    if (typeof answer?.userId !== 'string' || typeof answer?.email !== 'string') throw httpError(502, 'peerLink.peerUnavailable')
    const row = await one(
      `INSERT INTO account_links (id, user_id, peer_user_id, peer_email, created_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING RETURNING *`,
      [newId('al_'), user.id, answer.userId, answer.email, Date.now()]
    )
    if (!row) throw httpError(409, 'peerLink.alreadyLinked')
    return publicLink(row)
  },

  /** Receiving half of step 2 (signed by the partner). */
  async spendCode({ code, peerUserId, peerEmail }) {
    if (typeof peerUserId !== 'string' || !peerUserId || typeof peerEmail !== 'string') throw httpError(400, 'peerLink.badCode')
    const now = Date.now()
    const spent = await one(
      `UPDATE account_link_codes SET used_at = $2
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2
        RETURNING user_id`,
      [hashCode(code), now]
    )
    if (!spent) throw httpError(400, 'peerLink.badCode')
    const user = await one(`SELECT id, email FROM users WHERE id = $1 AND email NOT LIKE 'deleted-%@invalid'`, [spent.user_id])
    if (!user) throw httpError(400, 'peerLink.badCode')
    const row = await one(
      `INSERT INTO account_links (id, user_id, peer_user_id, peer_email, created_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING RETURNING id`,
      [newId('al_'), user.id, peerUserId, peerEmail.slice(0, 320), now]
    )
    if (!row) throw httpError(409, 'peerLink.alreadyLinked')
    return { userId: user.id, email: user.email }
  },

  /** Unlink here, and ask the partner to drop its half (best effort). */
  async unlink(userId) {
    const row = await one('DELETE FROM account_links WHERE user_id = $1 RETURNING *', [userId])
    if (!row) return { unlinked: false, peer: null }
    let peer = 'skipped'
    if (peerRelay.isConfigured()) {
      try {
        await peerRelay.peerPost('/relay/link/revoke', { userId: row.peer_user_id, peerUserId: userId }, 15000)
        peer = 'removed'
      } catch {
        // Its half stays until removed there; it is inert from this side,
        // because every federated call is checked against our row too.
        peer = 'unreachable'
      }
    }
    return { unlinked: true, peer }
  },

  /** Receiving half of unlink. */
  async dropMirror({ userId, peerUserId }) {
    await query('DELETE FROM account_links WHERE user_id = $1 AND peer_user_id = $2', [String(userId || ''), String(peerUserId || '')])
  },

  /** The local user a federated call may act as, or null. */
  async localUserFor({ userId, peerUserId }) {
    if (typeof userId !== 'string' || typeof peerUserId !== 'string') return null
    const row = await one(
      `SELECT u.id, u.email, u.role FROM account_links l JOIN users u ON u.id = l.user_id
        WHERE l.user_id = $1 AND l.peer_user_id = $2`,
      [userId, peerUserId]
    )
    return row ? { userId: row.id, email: row.email, role: row.role, tokenId: null, viaPeer: true } : null
  },
}
