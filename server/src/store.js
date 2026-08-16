// Persistent store backed by PostgreSQL (src/db.js). All methods are async.
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'
import { hashPassword } from './auth.js'
import { describe as describeHosting, normalise as normaliseHosting } from './hosting.js'
import { applyPolicyChange, readPolicy } from './policy.js'

const publicUser = (u) => u && ({
  id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan,
  initials: (u.name || '?').trim().charAt(0), twoFactor: !!u.two_factor, lang: u.lang, timezone: u.timezone,
})

const publicSite = (s) => s && ({
  id: s.id, name: s.name, title: s.title, status: s.status, authority: s.authority,
  url: s.url, paired: !!s.paired, hasSecret: !!s.secret,
  connector: s.connector || null, // JSONB → already an object
  policy: readPolicy(s.policy),
  updateState: s.update_state || null,
  hosting: describeHosting(s.hosting),
  // No invented metrics here. This object feeds the sites list, where an
  // uptime of "99.98%" for a site nobody has ever monitored is the most
  // convincing lie in the product: it is on the first screen, it is precise,
  // and it is pure decoration. Null means "we do not know", which the list
  // renders as a dash and the customer can ask us about.
  uptime: null,
  checks: null,
  lastCheck: null,
  // Filled by list() from the event log where we have one. Left null — which
  // the list renders as a dash — wherever we genuinely do not know, because a
  // confident zero and an unmeasured zero look identical to a customer.
  incidents: s.open_incidents === undefined ? null : Number(s.open_incidents),
  pendingUpdates: null,
})

export const users = {
  async create({ email, name, password }) {
    email = String(email || '').trim().toLowerCase()
    if (!email || !password) throw httpError(400, 'ایمیل و رمز عبور لازم است.')
    if (String(password).length < 8) throw httpError(400, 'رمز عبور باید حداقل ۸ نویسه باشد.')
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) throw httpError(409, 'این ایمیل قبلاً ثبت شده است.')
    const id = newId('u_')
    const row = await one(
      `INSERT INTO users (id, email, name, pass_hash, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, email, name || email.split('@')[0], await hashPassword(password), Date.now()]
    )
    return publicUser(row)
  },
  byEmailRaw: (email) => one('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]),
  byId: async (id) => publicUser(await one('SELECT * FROM users WHERE id = $1', [id])),
  /** Emergency contact details. Merged, so writing a push token keeps the phone. */
  async setContact(id, patch) {
    const row = await one('SELECT contact FROM users WHERE id = $1', [id])
    if (!row) throw httpError(404, 'کاربر پیدا نشد.')
    const merged = { ...(row.contact || {}), ...patch }
    const updated = await one('UPDATE users SET contact = $2 WHERE id = $1 RETURNING contact', [id, JSON.stringify(merged)])
    return updated.contact
  },

  async contact(id) {
    const row = await one('SELECT contact FROM users WHERE id = $1', [id])
    return row?.contact || { phone: null, fcmToken: null, najvaToken: null }
  },

  async update(id, fields) {
    const allowed = ['name', 'two_factor', 'lang', 'timezone']
    const keys = Object.keys(fields).filter((k) => allowed.includes(k))
    if (!keys.length) return this.byId(id)
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const row = await one(`UPDATE users SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => fields[k])])
    return publicUser(row)
  },

  async updatePassword(id, password) {
    if (!password || String(password).length < 8) throw httpError(400, 'رمز عبور باید حداقل ۸ نویسه باشد.')
    const row = await one('UPDATE users SET pass_hash = $2 WHERE id = $1 RETURNING *', [id, await hashPassword(password)])
    if (!row) throw httpError(404, 'کاربر پیدا نشد.')
    return publicUser(row)
  },
}

export const passwordResets = {
  /**
   * Create a reset token for a user.
   *
   * Returns the raw token (to put in the email) and stores its SHA-256 hash.
   * A user can only have one active token at a time, enforced by a partial
   * unique index; creating a new one replaces the old.
   */
  async create(userId) {
    const raw = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const id = newId('pr_')
    const now = Date.now()
    // Expire in 1 hour.
    const expiresAt = now + 60 * 60 * 1000
    // Remove expired unused tokens for this user before inserting a new one.
    await one(
      'DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL AND expires_at <= $2',
      [userId, now]
    )
    await one(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) WHERE used_at IS NULL
       DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = EXCLUDED.created_at`,
      [id, userId, tokenHash, expiresAt, now]
    )
    return { id, raw, expiresAt }
  },

  /** Find an active, unused token by its hash. */
  async find(tokenHash) {
    return one(
      `SELECT * FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > EXTRACT(EPOCH FROM NOW()) * 1000`,
      [tokenHash]
    )
  },

  /** Mark a token as used. */
  async markUsed(id) {
    return one('UPDATE password_resets SET used_at = $2 WHERE id = $1 RETURNING *', [id, Date.now()])
  },
}

export const sites = {
  // One query, not one per site: the alert count comes from a LEFT JOIN so a
  // customer with forty sites still costs a single round trip.
  listByUser: async (userId) =>
    (await all(
      `SELECT s.*, COUNT(e.id) FILTER (WHERE e.resolved_at IS NULL) AS open_incidents
         FROM sites s
         LEFT JOIN events e ON e.site_id = s.id
        WHERE s.user_id = $1
        GROUP BY s.id
        ORDER BY s.created_at`,
      [userId]
    )).map(publicSite),

  getForUser: async (id, userId) =>
    publicSite(await one(
      `SELECT s.*, COUNT(e.id) FILTER (WHERE e.resolved_at IS NULL) AS open_incidents
         FROM sites s
         LEFT JOIN events e ON e.site_id = s.id
        WHERE s.id = $1 AND s.user_id = $2
        GROUP BY s.id`,
      [id, userId]
    )),

  /** Internal row incl. secret — for the relay. Caller must have checked ownership. */
  rawForUser: (id, userId) => one('SELECT * FROM sites WHERE id = $1 AND user_id = $2', [id, userId]),

  async add(userId, { name, title }) {
    if (!name) throw httpError(400, 'دامنهٔ سایت لازم است.')
    const clean = String(name).replace(/^https?:\/\//, '').replace(/\/$/, '')
    const id = slug(clean) || newId('s_')
    if (await one('SELECT 1 FROM sites WHERE id = $1', [id])) throw httpError(409, 'این سایت قبلاً افزوده شده است.')
    const site = {
      id, user_id: userId, name: clean, title: title || clean, status: 'checking', authority: 'report',
      url: name.startsWith('http') ? name : `https://${clean}`,
      secret: crypto.randomBytes(32).toString('hex'), site_key: crypto.randomBytes(10).toString('hex'),
      created_at: Date.now(),
    }
    const row = await one(
      `INSERT INTO sites (id, user_id, name, title, status, authority, url, secret, site_key, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [site.id, site.user_id, site.name, site.title, site.status, site.authority, site.url, site.secret, site.site_key, site.created_at]
    )
    return { ...publicSite(row), secret: site.secret, siteKey: site.site_key } // secret shown ONCE
  },

  async markPaired(id, connector = {}) {
    const row = await one(
      `UPDATE sites SET paired = true, status = 'healthy', connector = $2 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify({ ...connector, lastSeen: Date.now() })]
    )
    return publicSite(row)
  },

  /**
   * Record the plugin version we OBSERVED, rather than the one a site last
   * volunteered.
   *
   * Registration only happens when the plugin decides to announce itself. On
   * this deployment that left one paired site reporting a version five days
   * old and another reporting none at all — while the nightly run was talking
   * to both every night. So the answer to "has the security fix reached this
   * site" was unavailable from the one place that had just been in contact.
   *
   * Merged into the existing connector blob so nothing already there is lost,
   * and lastSeen is set from this contact because that is what it means.
   */
  async recordObservedVersion(id, version) {
    if (!version) return null
    const row = await one(
      `UPDATE sites
         SET connector = COALESCE(connector, '{}'::jsonb)
                         || jsonb_build_object('version', $2::text, 'lastSeen', $3::bigint)
       WHERE id = $1 RETURNING *`,
      [id, String(version), Date.now()]
    )
    return row || null
  },

  async recordRegister(id, { url, pluginSiteId, name, version } = {}) {
    const row = await one(
      `UPDATE sites SET paired = true, status = 'healthy', connector = $2,
        url = COALESCE(NULLIF($3,''), url), title = COALESCE(NULLIF($4,''), title),
        plugin_site_id = $5 WHERE id = $1 RETURNING *`,
      [id, JSON.stringify({ version: version || '3.5.1', lastSeen: Date.now(), pluginSiteId }), url || '', name || '', pluginSiteId || '']
    )
    return publicSite(row)
  },

  /** {id, secret} for every site — to match an inbound signed register call. */
  candidates: () => all("SELECT id, secret FROM sites WHERE secret <> ''"),

  /**
   * Change a site's update policy.
   *
   * The safe-mode lock is applied here rather than in the route, so every path
   * that can reach the policy — the panel, a future CLI, a scheduled job —
   * gets the same enforcement without having to remember it.
   *
   * Returns the stored policy and anything the lock refused, so the caller can
   * say so instead of letting a switch spring back with no explanation.
   */
  async setPolicy(id, userId, patch) {
    const row = await one('SELECT policy FROM sites WHERE id = $1 AND user_id = $2', [id, userId])
    if (!row) throw httpError(404, 'سایت پیدا نشد.')
    const { policy, refused } = applyPolicyChange(row.policy, patch)
    const saved = await one(
      'UPDATE sites SET policy = $2 WHERE id = $1 RETURNING *',
      [id, JSON.stringify(policy)]
    )
    return { site: publicSite(saved), policy, refused }
  },

  async setAuthority(id, userId, authority) {
    const row = await one(
      'UPDATE sites SET authority = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId, authority]
    )
    if (!row) throw httpError(404, 'سایت پیدا نشد.')
    return publicSite(row)
  },

  /**
   * Where this site is hosted.
   *
   * Merged rather than replaced, so a panel that only sends `callbackUrl` does
   * not silently blank the region someone set last week.
   */
  async setHosting(id, userId, patch) {
    const row = await one('SELECT hosting FROM sites WHERE id = $1 AND user_id = $2', [id, userId])
    if (!row) throw httpError(404, 'سایت پیدا نشد.')
    const merged = normaliseHosting({ ...(row.hosting || {}), ...(patch || {}) })
    const updated = await one(
      'UPDATE sites SET hosting = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId, JSON.stringify(merged)]
    )
    return publicSite(updated)
  },

  /** What the connector reported after it last ran updates. */
  async recordUpdateRun(id, state) {
    const row = await one(
      'UPDATE sites SET update_state = $2 WHERE id = $1 RETURNING *',
      [id, JSON.stringify({ ...state, at: Date.now() })]
    )
    return publicSite(row)
  },
}

function slug(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}

export function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}
