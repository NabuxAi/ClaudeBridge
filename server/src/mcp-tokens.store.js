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

const activeEditWindow = (row) => row.edit_window_site_id && Number(row.edit_window_expires_at) > Date.now()
  ? { siteId: row.edit_window_site_id, paths: row.edit_window_paths, expiresAt: Number(row.edit_window_expires_at) }
  : null

const publicToken = (row) => row && ({
  id: row.id,
  name: row.name,
  createdAt: Number(row.created_at),
  lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at),
  fileEdit: row.edit_site_id ? { siteId: row.edit_site_id, paths: row.edit_paths } : null,
  editWindow: activeEditWindow(row),
})

export const mcpTokens = {
  async create(userId, name = '', fileEdit = null) {
    const live = await one('SELECT COUNT(*)::int AS n FROM mcp_tokens WHERE user_id = $1 AND revoked_at IS NULL', [userId])
    if (live.n >= MAX_PER_USER) {
      throw httpError(409, 'mcp.tokenLimit', { max: MAX_PER_USER })
    }
    const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url')
    const row = await one(
      `INSERT INTO mcp_tokens (id, user_id, name, token_hash, created_at, edit_site_id, edit_paths)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [newId('mcpt_'), userId, String(name || '').trim().slice(0, 80), tokenHash(token), Date.now(),
        fileEdit?.siteId || null, JSON.stringify(fileEdit?.paths || [])]
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

  async startEditWindow(userId, id, { siteId, paths, hours }) {
    const now = Date.now()
    const row = await one(
      `UPDATE mcp_tokens SET edit_window_site_id = $3, edit_window_paths = $4, edit_window_expires_at = $5
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND edit_site_id IS NULL
          AND (edit_window_site_id IS NULL OR edit_window_expires_at <= $6)
        RETURNING *`,
      [id, userId, siteId, JSON.stringify(paths), now + hours * 3600_000, now]
    )
    return publicToken(row)
  },

  async endEditWindow(userId, id, expiresAt) {
    return one(
      `UPDATE mcp_tokens SET edit_window_expires_at = 0, edit_window_paths = '[]'::jsonb
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND edit_window_expires_at = $3
          AND edit_window_expires_at > $4 AND edit_window_site_id IS NOT NULL
        RETURNING edit_window_site_id AS site_id`,
      [id, userId, expiresAt, Date.now()]
    )
  },

  async editWindowStillActive(id, siteId, expiresAt) {
    return Boolean(await one(
      `SELECT id FROM mcp_tokens WHERE id = $1 AND edit_window_site_id = $2 AND revoked_at IS NULL
         AND edit_window_expires_at = $3 AND edit_window_expires_at > $4`,
      [id, siteId, expiresAt, Date.now()]
    ))
  },

  /** The user a presented token belongs to, or null. Joins users for role. */
  async resolve(token) {
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null
    const row = await one(
      `SELECT t.id, t.user_id, t.last_used_at, t.edit_site_id, t.edit_paths,
              t.edit_window_site_id, t.edit_window_paths, t.edit_window_expires_at, u.email, u.role
         FROM mcp_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
      [tokenHash(token)]
    )
    if (!row) return null
    const now = Date.now()
    if (!row.last_used_at || now - Number(row.last_used_at) > TOUCH_THROTTLE_MS) {
      await one('UPDATE mcp_tokens SET last_used_at = $2 WHERE id = $1', [row.id, now])
    }
    const { fileEdit, editWindow } = publicToken(row)
    return { tokenId: row.id, userId: row.user_id, email: row.email, role: row.role, fileEdit, editWindow }
  },
}
