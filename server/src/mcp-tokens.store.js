// ============================================================
// Persistent store for hub MCP tokens.
//
// A token is `dwmcp_` + 32 random bytes (base64url). It is returned exactly
// once, at creation; afterwards only its SHA-256 exists, so a database leak
// does not hand out live access to anybody's fleet.
// ============================================================
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'
import { httpError } from './i18n.js'

export const TOKEN_PREFIX = 'dwmcp_'
const MAX_PER_USER = 20
// last_used_at is refreshed at most once a minute per token.
const TOUCH_THROTTLE_MS = 60 * 1000

export const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

const publicToken = (row) => row && ({
  id: row.id,
  name: row.name,
  createdAt: Number(row.created_at),
  lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at),
})

export const mcpTokens = {
  async create(userId, name = '') {
    const live = await one('SELECT COUNT(*)::int AS n FROM mcp_tokens WHERE user_id = $1 AND revoked_at IS NULL', [userId])
    if (live.n >= MAX_PER_USER) {
      throw httpError(409, 'mcp.tokenLimit', { max: MAX_PER_USER })
    }
    const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url')
    const row = await one(
      `INSERT INTO mcp_tokens (id, user_id, name, token_hash, created_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [newId('mcpt_'), userId, String(name || '').trim().slice(0, 80), tokenHash(token), Date.now()]
    )
    return { token, record: publicToken(row) }
  },

  async list(userId) {
    return (await all(
      'SELECT * FROM mcp_tokens WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
      [userId]
    )).map(publicToken)
  },

  async revoke(userId, id) {
    const row = await one(
      'UPDATE mcp_tokens SET revoked_at = $3 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id',
      [id, userId, Date.now()]
    )
    return Boolean(row)
  },

  /** The user a presented token belongs to, or null. Joins users for role. */
  async resolve(token) {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null
    const row = await one(
      `SELECT t.id, t.user_id, t.last_used_at, u.email, u.role
         FROM mcp_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
      [tokenHash(token)]
    )
    if (!row) return null
    const now = Date.now()
    if (!row.last_used_at || now - Number(row.last_used_at) > TOUCH_THROTTLE_MS) {
      await one('UPDATE mcp_tokens SET last_used_at = $2 WHERE id = $1', [row.id, now])
    }
    return { tokenId: row.id, userId: row.user_id, email: row.email, role: row.role }
  },
}
