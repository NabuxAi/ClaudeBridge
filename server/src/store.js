// Persistent store backed by PostgreSQL (src/db.js). All methods are async.
import { httpError, normalizeLocale, DEFAULT_LOCALE, t } from './i18n.js'
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'
import { hashPassword } from './auth.js'
import { config } from './config.js'
import { describe as describeHosting, normalise as normaliseHosting } from './hosting.js'
import { applyPolicyChange, readPolicy } from './policy.js'
import { sendMail } from './mailer.js'

const publicUser = (u) => u && ({
  id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan,
  initials: (u.name || '?').trim().charAt(0), twoFactor: !!u.two_factor, lang: u.lang, timezone: u.timezone,
  // Registration timestamp (epoch ms) as stored; the admin panel renders it.
  // Never include pass_hash or other raw columns here.
  created_at: u.created_at === undefined ? null : Number(u.created_at),
})

const publicSite = (s) => s && ({
  id: s.id, name: s.name, title: s.title, status: s.status, authority: s.authority,
  url: s.url, paired: !!s.paired, hasSecret: !!s.secret,
  connector: s.connector || null, // JSONB → already an object
  policy: readPolicy(s.policy),
  backupPolicy: s.backup_policy || { destination: 'local', maxDaily: 5, retentionDays: 30, maxStorageMb: 2048, autoPruneOnFull: true },
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

// Stored legacy values (Persian schema defaults, kept for compatibility —
// no destructive migration): users.role 'مدیر حساب' is the non-admin role,
// users.plan holds a plan display name. Both are served with a translated
// label next to the raw value.
const LEGACY_ACCOUNT_MANAGER = 'مدیر حساب'
const DELETED_NAME = 'Deleted account'
const PLAN_ID_BY_NAME = { 'پایه': 'base', 'حرفه‌ای': 'pro', 'آژانس': 'agency', base: 'base', pro: 'pro', agency: 'agency' }
export const planIdFromName = (name) => PLAN_ID_BY_NAME[String(name || '').trim()] || null

export const users = {
  /** The public user plus display labels in `locale` (roleLabel, planId, planLabel, display name of a tombstone). */
  withLabels(locale, u) {
    if (!u) return u
    const planId = planIdFromName(u.plan)
    return {
      ...u,
      roleLabel: t(locale, u.role === 'admin' ? 'account.role.admin' : 'account.role.accountManager'),
      planId,
      planLabel: planId ? t(locale, `billing.plans.${planId}.name`) : u.plan,
      ...(u.name === DELETED_NAME || u.name === 'حساب حذف‌شده' ? { name: t(locale, 'account.deletedName') } : {}),
    }
  },
  async create({ email, name, password, lang }) {
    email = String(email || '').trim().toLowerCase()
    if (!email || !password) throw httpError(400, 'account.emailPasswordRequired')
    if (String(password).length < 8) throw httpError(400, 'common.passwordTooShort', { min: 8 })
    if (await one('SELECT 1 FROM users WHERE email = $1', [email])) throw httpError(409, 'account.emailTaken')
    const id = newId('u_')
    const row = await one(
      `INSERT INTO users (id, email, name, pass_hash, lang, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, email, name || email.split('@')[0], await hashPassword(password), normalizeLocale(lang) || DEFAULT_LOCALE, Date.now()]
    )
    return publicUser(row)
  },
  byEmailRaw: (email) => one('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]),
  // The unshaped row — pass_hash included. Routes that re-prove the password
  // behind a live session (2FA disable, account deletion) need the hash; the
  // public shape deliberately never carries it.
  byIdRaw: (id) => one('SELECT * FROM users WHERE id = $1', [id]),
  byId: async (id) => publicUser(await one('SELECT * FROM users WHERE id = $1', [id])),
  /** Emergency contact details. Merged, so writing a push token keeps the phone. */
  async setContact(id, patch) {
    const row = await one('SELECT contact FROM users WHERE id = $1', [id])
    if (!row) throw httpError(404, 'common.userNotFound')
    const merged = { ...(row.contact || {}), ...patch }
    const updated = await one('UPDATE users SET contact = $2 WHERE id = $1 RETURNING contact', [id, JSON.stringify(merged)])
    return updated.contact
  },

  async contact(id) {
    const row = await one('SELECT contact FROM users WHERE id = $1', [id])
    return row?.contact || { phone: null, fcmToken: null, najvaToken: null }
  },

  async update(id, fields) {
    // No `two_factor`: the flag is owned by /auth/2fa/* (activate/disable),
    // which keep it in sync with the enrollment row. A profile write that
    // could flip it would let a claim exist with no secret behind it.
    const allowed = ['name', 'lang', 'timezone']
    const keys = Object.keys(fields).filter((k) => allowed.includes(k))
    if (!keys.length) return this.byId(id)
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const row = await one(`UPDATE users SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => fields[k])])
    return publicUser(row)
  },

  async updatePassword(id, password) {
    if (!password || String(password).length < 8) throw httpError(400, 'common.passwordTooShort', { min: 8 })
    const row = await one('UPDATE users SET pass_hash = $2 WHERE id = $1 RETURNING *', [id, await hashPassword(password)])
    if (!row) throw httpError(404, 'common.userNotFound')
    return publicUser(row)
  },

  async list({ limit = 50, offset = 0, search = '' } = {}) {
    const q = String(search || '').trim().toLowerCase()
    const where = q ? 'WHERE LOWER(email) LIKE $3 OR LOWER(name) LIKE $3' : ''
    const params = q ? [limit, offset, `%${q}%`] : [limit, offset]
    return (await all(
      `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params
    )).map(publicUser)
  },

  async listWithSiteCounts({ limit = 50, offset = 0, search = '' } = {}) {
    const q = String(search || '').trim().toLowerCase()
    const where = q ? 'WHERE LOWER(u.email) LIKE $3 OR LOWER(u.name) LIKE $3' : ''
    const params = q ? [limit, offset, `%${q}%`] : [limit, offset]
    const rows = await all(
      `SELECT u.*, COUNT(s.id) AS site_count
         FROM users u
         LEFT JOIN sites s ON s.user_id = u.id
         ${where}
         GROUP BY u.id
         ORDER BY u.created_at DESC
         LIMIT $1 OFFSET $2`,
      params
    )
    // Strip pass_hash via publicUser; only site_count is appended on top.
    return rows.map((r) => ({ ...publicUser(r), site_count: Number(r.site_count) }))
  },

  async count({ search = '' } = {}) {
    const q = String(search || '').trim().toLowerCase()
    if (!q) {
      const row = await one('SELECT COUNT(*)::int AS n FROM users')
      return row.n
    }
    const row = await one(
      'SELECT COUNT(*)::int AS n FROM users WHERE LOWER(email) LIKE $1 OR LOWER(name) LIKE $1',
      [`%${q}%`]
    )
    return row.n
  },

  async setRole(id, role) {
    // 'account_manager' is the language-neutral name of the stored legacy value.
    if (role === 'account_manager') role = LEGACY_ACCOUNT_MANAGER
    if (!['admin', LEGACY_ACCOUNT_MANAGER].includes(role)) throw httpError(400, 'account.invalidRole')
    const row = await one('UPDATE users SET role = $2 WHERE id = $1 RETURNING *', [id, role])
    if (!row) throw httpError(404, 'common.userNotFound')
    return publicUser(row)
  },

  /**
   * Tombstone a deleted account's row instead of deleting it.
   *
   * Deleting the row outright would CASCADE through sites → events and take
   * the audit trail with it; the events log is site-scoped by design, so the
   * audit record survives only if both the user and site rows do. What "the
   * account is deleted" therefore means here is: the identity is gone from
   * the row, and nothing about the row can authenticate or be contacted.
   *
   *   email → `deleted-<sha256(id)…>@invalid` — unique per account (the
   *     column is UNIQUE), so the address frees up for re-registration
   *     without colliding with another tombstone, and `.invalid` is a
   *     reserved TLD no mailer can deliver to.
   *   pass_hash → a value verifyPassword() rejects by shape (no scrypt
   *     derivation, no timing worth measuring). It is unreachable by login
   *     anyway: byEmailRaw no longer finds the old address.
   *   name → a neutral label, so the admin users list says "deleted" instead
   *     of carrying the person's name.
   *   contact → NULL — the enrolled phone/push tokens are personal data.
   *
   * Returns the RAW row; the route decides what of it may be said out loud.
   */
  async anonymize(id) {
    const row = await one('SELECT * FROM users WHERE id = $1', [id])
    if (!row) throw httpError(404, 'common.userNotFound')
    const deletedEmail =
      'deleted-' + crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12) + '@invalid'
    return one(
      `UPDATE users
         SET email = $2, name = $3, pass_hash = $4,
             contact = '{"phone":null,"fcmToken":null,"najvaToken":null}'::jsonb, two_factor = false
        WHERE id = $1
       RETURNING *`,
      [id, deletedEmail, DELETED_NAME, 'deleted:' + crypto.randomBytes(32).toString('hex')]
    )
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

  /**
   * Site row incl. secret plus this user's membership role in one query:
   * 'owner' when the site row belongs to them, otherwise their active
   * team_members role, otherwise null. The site-routes membership layer
   * (routes/sites.js) is written against this — a single round trip decides
   * whether the user may see the site at all, and whether they may change it.
   */
  rawWithRole: (id, userId) => one(
    `SELECT s.*,
            CASE WHEN s.user_id = $2 THEN 'owner'
              ELSE (
                SELECT tm.role FROM team_members tm
                 WHERE tm.site_id = s.id AND tm.user_id = $2 AND tm.status = 'active'
                 LIMIT 1
              )
            END AS member_role
       FROM sites s
      WHERE s.id = $1`,
    [id, userId]
  ),

  async add(userId, { name, title }) {
    if (!name) throw httpError(400, 'sites.domainRequired')
    const clean = String(name).replace(/^https?:\/\//, '').replace(/\/$/, '')
    const id = slug(clean) || newId('s_')
    if (await one('SELECT 1 FROM sites WHERE id = $1', [id])) throw httpError(409, 'sites.alreadyAdded')
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
    // Record the owner in team_members so permission checks can be written
    // against one table. A missing row here is tolerated on list() for sites
    // created before this feature existed.
    await one(
      `INSERT INTO team_members (id, site_id, user_id, role, status, created_at)
       VALUES ($1, $2, $3, 'owner', 'active', $4)
       ON CONFLICT (site_id, user_id) WHERE status = 'active' AND user_id IS NOT NULL
       DO NOTHING`,
      [newId('tm_'), site.id, userId, Date.now()]
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
    if (!row) throw httpError(404, 'common.siteMissing')
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
    if (!row) throw httpError(404, 'common.siteMissing')
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
    if (!row) throw httpError(404, 'common.siteMissing')
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

  /** Storage destination, daily limits, and retention policy for backups. */
  async setBackupPolicy(id, userId, patch) {
    const row = await one('SELECT backup_policy FROM sites WHERE id = $1 AND user_id = $2', [id, userId])
    if (!row) throw httpError(404, 'common.siteMissing')
    const merged = { ...(row.backup_policy || {}), ...(patch || {}) }
    const updated = await one(
      'UPDATE sites SET backup_policy = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId, JSON.stringify(merged)]
    )
    return publicSite(updated)
  },
}

// ---- Team members and invitations ---------------------------

// Role display names: translation keys, rendered per request.
const ROLE_LABEL = {
  owner: 'team.role.owner',
  admin: 'team.role.admin',
  viewer: 'team.role.viewer',
}

const VALID_ROLES = Object.keys(ROLE_LABEL)

/**
 * What the stored role grants TODAY on the site routes. The role names a ladder
 * (admin above viewer), but the membership enforcement shipped in this wave
 * makes every non-owner member read-only at that layer — the site's authority
 * level (report/confirm/auto) stays a separate, owner-set setting and the
 * sensitive-tool classification is untouched. The panel must render this
 * effective access, not the promise carried by the role name, or an "admin"
 * badge would advertise writes the server answers with 403.
 */
const EFFECTIVE_ACCESS = {
  owner: { level: 'owner', label: 'team.effective.full' },
  admin: { level: 'report', label: 'team.effective.readOnly' },
  viewer: { level: 'report', label: 'team.effective.readOnly' },
}
const roleLabel = (locale, role) => (ROLE_LABEL[role] ? t(locale, ROLE_LABEL[role]) : role)
const effectiveOf = (locale, role) => {
  const e = EFFECTIVE_ACCESS[role] || EFFECTIVE_ACCESS.viewer
  return { level: e.level, label: t(locale, e.label) }
}

const publicMember = (m, locale) => m && ({
  id: m.id,
  userId: m.user_id,
  name: m.name || m.invited_email || '?',
  email: m.email || m.invited_email,
  role: m.role,
  roleLabel: roleLabel(locale, m.role),
  effective: effectiveOf(locale, m.role),
  initials: (m.name || m.invited_email || '?').trim().charAt(0),
  status: m.status,
  joinedAt: Number(m.created_at),
})

const publicInvitation = (i, locale) => i && ({
  id: i.id,
  email: i.email,
  role: i.role,
  roleLabel: roleLabel(locale, i.role),
  createdAt: Number(i.created_at),
  expiresAt: Number(i.expires_at),
})

async function requireSiteOwner(siteId, userId) {
  const site = await one('SELECT id, user_id, name, title FROM sites WHERE id = $1', [siteId])
  if (!site) throw httpError(404, 'common.siteMissing')
  if (site.user_id !== userId) throw httpError(403, 'team.ownerOnly')
  return site
}

export const team = {
  ROLE_LABEL,
  VALID_ROLES,

  /** Everything the team UI needs for one site. */
  async list(siteId, userId, locale) {
    const site = await requireSiteOwner(siteId, userId)

    const ownerRow = await one(
      `SELECT u.id, u.name, u.email, tm.id AS member_id, tm.created_at
         FROM users u
         LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.site_id = $1 AND tm.status = 'active'
        WHERE u.id = $2`,
      [siteId, site.user_id]
    )

    const memberRows = await all(
      `SELECT tm.id, tm.user_id, tm.role, tm.invited_email, tm.status, tm.created_at,
              u.name, u.email
         FROM team_members tm
         LEFT JOIN users u ON u.id = tm.user_id
        WHERE tm.site_id = $1 AND tm.status = 'active' AND tm.role <> 'owner'
        ORDER BY tm.created_at DESC`,
      [siteId]
    )

    const invitationRows = await all(
      `SELECT id, email, role, created_at, expires_at
         FROM invitations
        WHERE site_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2
        ORDER BY created_at DESC`,
      [siteId, Date.now()]
    )

    return {
      site: { id: site.id, name: site.name, title: site.title },
      owner: publicMember({
        id: ownerRow?.member_id || `owner:${site.user_id}`,
        user_id: ownerRow?.id,
        name: ownerRow?.name,
        email: ownerRow?.email,
        role: 'owner',
        status: 'active',
        created_at: ownerRow?.created_at || site.created_at,
      }, locale),
      members: memberRows.map((m) => publicMember(m, locale)),
      invitations: invitationRows.map((i) => publicInvitation(i, locale)),
    }
  },

  /**
   * Invite someone to a site by email.
   *
   * Returns the public invitation and the raw token (for the email). The raw
   * token is never stored; only its SHA-256 hash lives in the database.
   */
  async invite(siteId, ownerId, { email, role = 'viewer', locale } = {}) {
    const site = await requireSiteOwner(siteId, ownerId)
    const normalized = String(email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw httpError(400, 'team.invalidEmail')
    }
    if (!VALID_ROLES.includes(role) || role === 'owner') {
      throw httpError(400, 'team.invalidInviteRole')
    }

    const existingUser = await one('SELECT id, lang FROM users WHERE email = $1', [normalized])
    if (existingUser) {
      const already = await one(
        `SELECT 1 FROM team_members
          WHERE site_id = $1 AND user_id = $2 AND status = 'active'`,
        [siteId, existingUser.id]
      )
      if (already) throw httpError(409, 'team.alreadyMember')
    }

    const raw = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const id = newId('in_')
    const now = Date.now()
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000 // 7 days

    try {
      await one(
        `INSERT INTO invitations (id, site_id, email, role, inviter_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, siteId, normalized, role, ownerId, tokenHash, expiresAt, now]
      )
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'team.activeInviteExists')
      throw e
    }

    const publicPanelUrl = config.publicPanelUrl || 'http://localhost:8080'
    // Two landing paths, because we cannot know whether the address has an
    // account yet: one registers with the token attached, one signs in and
    // accepts from the team page. Both carry the same single-use token, so
    // whichever is opened first wins and the other reports it as spent.
    const registerUrl = `${publicPanelUrl}/register?invite=${raw}&email=${encodeURIComponent(normalized)}`
    const acceptUrl = `${publicPanelUrl}/app/team?accept=${raw}&site=${siteId}`
    // The invitee's own language when they already have an account; the
    // inviter's request language otherwise.
    const lang = existingUser?.lang || locale
    const vars = { site: site.name, role: roleLabel(lang, role), days: 7 }
    const mailResult = await sendMail({
      to: normalized,
      subject: t(lang, 'team.inviteMail.subject', vars),
      text: `${t(lang, 'team.inviteMail.intro', vars)}\n\n${t(lang, 'team.inviteMail.registerText')}\n${registerUrl}\n\n${t(lang, 'team.inviteMail.acceptText')}\n${acceptUrl}\n\n${t(lang, 'team.inviteMail.validity', vars)}`,
      html: `<p>${t(lang, 'team.inviteMail.intro', vars)}</p><p>${t(lang, 'team.inviteMail.registerHtml', { link: registerUrl })}</p><p>${t(lang, 'team.inviteMail.acceptHtml', { link: acceptUrl })}</p><p>${t(lang, 'team.inviteMail.validity', vars)}</p>`,
    })

    return {
      invitation: publicInvitation({
        id, email: normalized, role, created_at: now, expires_at: expiresAt,
      }, locale),
      raw, // caller may log or return; here it is returned only for tests
      mail: { ok: mailResult.ok, reason: mailResult.reason || null },
    }
  },

  /** Spend an invitation and add the user to the site. */
  async accept(siteId, rawToken, userId, locale) {
    if (!rawToken || String(rawToken).length < 32) throw httpError(400, 'team.invalidInviteLink')
    const tokenHash = crypto.createHash('sha256').update(String(rawToken)).digest('hex')

    const invitation = await one(
      `SELECT * FROM invitations
        WHERE token_hash = $1 AND site_id = $2 AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > $3`,
      [tokenHash, siteId, Date.now()]
    )
    if (!invitation) throw httpError(400, 'team.inviteLinkGone')

    const user = await one('SELECT id, email FROM users WHERE id = $1', [userId])
    if (!user) throw httpError(401, 'team.signInFirst')
    if (user.email !== invitation.email) {
      throw httpError(403, 'team.inviteOtherEmail')
    }

    const existing = await one(
      `SELECT id FROM team_members
        WHERE site_id = $1 AND user_id = $2 AND status = 'active'`,
      [siteId, userId]
    )
    if (existing) throw httpError(409, 'team.youAreMember')

    const memberId = newId('tm_')
    const now = Date.now()
    await one(
      `INSERT INTO team_members (id, site_id, user_id, role, invited_email, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
      [memberId, siteId, userId, invitation.role, invitation.email, now]
    )
    await one('UPDATE invitations SET used_at = $2 WHERE id = $1', [invitation.id, now])

    return publicMember({
      id: memberId, user_id: user.id, name: user.name, email: user.email,
      role: invitation.role, invited_email: invitation.email, status: 'active', created_at: now,
    }, locale)
  },

  /**
   * Spend an invitation during registration — the no-account-yet path.
   *
   * The register flow hands over the raw token from the invite link and the
   * freshly created user; no siteId travels with the request, so the invitation
   * is found by token hash alone. Every old guarantee holds: the token is
   * matched by SHA-256 (the raw value was never stored), must be unused,
   * unrevoked and inside its 7-day window, and belongs to exactly the address
   * that registered.
   *
   * Single-use is enforced by the UPDATE, not the earlier SELECT: two
   * registrations racing on one link both pass the SELECT, but only the one
   * whose UPDATE returns a row gets to insert the membership. A failure here
   * must not fail the account itself — registration reports it and the owner
   * can re-invite.
   */
  async acceptOnRegister(rawToken, user, locale) {
    if (!rawToken || String(rawToken).length < 32) throw httpError(400, 'team.invalidInviteLink')
    const tokenHash = crypto.createHash('sha256').update(String(rawToken)).digest('hex')
    const invitation = await one(
      `SELECT * FROM invitations
        WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL
          AND expires_at > $2`,
      [tokenHash, Date.now()]
    )
    if (!invitation) throw httpError(400, 'team.inviteGone')
    if (user.email !== invitation.email) {
      throw httpError(403, 'team.inviteOtherEmailRegister')
    }

    const now = Date.now()
    const spent = await one(
      'UPDATE invitations SET used_at = $2 WHERE id = $1 AND used_at IS NULL RETURNING id',
      [invitation.id, now]
    )
    if (!spent) throw httpError(400, 'team.inviteSpent')

    const memberId = newId('tm_')
    await one(
      `INSERT INTO team_members (id, site_id, user_id, role, invited_email, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
      [memberId, invitation.site_id, user.id, invitation.role, invitation.email, now]
    )
    return publicMember({
      id: memberId, user_id: user.id, name: user.name, email: user.email,
      role: invitation.role, invited_email: invitation.email, status: 'active', created_at: now,
    }, locale)
  },

  /** Owner cancels a pending invitation. */
  async revoke(siteId, ownerId, invitationId) {
    await requireSiteOwner(siteId, ownerId)
    const row = await one(
      `UPDATE invitations SET revoked_at = $3
        WHERE id = $1 AND site_id = $2 AND used_at IS NULL AND revoked_at IS NULL
       RETURNING *`,
      [invitationId, siteId, Date.now()]
    )
    if (!row) throw httpError(404, 'team.inviteNotFound')
    return { ok: true }
  },

  /** Owner changes a member's role. */
  async updateRole(siteId, ownerId, memberId, role, locale) {
    await requireSiteOwner(siteId, ownerId)
    if (!VALID_ROLES.includes(role) || role === 'owner') {
      throw httpError(400, 'team.invalidRole')
    }
    // Four values were bound for three placeholders: a Date.now() sat at $3 for
    // an updated_at column team_members does not have. PostgreSQL cannot infer a
    // type for a parameter the statement never references, so it rejected the
    // whole UPDATE and every role change returned 500.
    const row = await one(
      `UPDATE team_members SET role = $3
        WHERE id = $1 AND site_id = $2 AND status = 'active' AND role <> 'owner'
       RETURNING *`,
      [memberId, siteId, role]
    )
    if (!row) throw httpError(404, 'team.memberNotFound')
    const user = await one('SELECT name, email FROM users WHERE id = $1', [row.user_id])
    return publicMember({ ...row, name: user?.name, email: user?.email }, locale)
  },

  /** Owner removes a member from the site. */
  async removeMember(siteId, ownerId, memberId) {
    await requireSiteOwner(siteId, ownerId)
    const row = await one(
      `UPDATE team_members SET status = 'removed'
        WHERE id = $1 AND site_id = $2 AND status = 'active' AND role <> 'owner'
       RETURNING *`,
      [memberId, siteId]
    )
    if (!row) throw httpError(404, 'team.memberNotFound')
    return { ok: true }
  },
}

function slug(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}

// Errors carry translation keys (see i18n.js); re-exported for existing importers.
export { httpError }
