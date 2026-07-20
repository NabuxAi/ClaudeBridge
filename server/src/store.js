// Persistent store backed by PostgreSQL (src/db.js). All methods are async.
import crypto from 'node:crypto'
import { one, all, newId } from './db.js'
import { hashPassword } from './auth.js'

const publicUser = (u) => u && ({
  id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan,
  initials: (u.name || '?').trim().charAt(0), twoFactor: !!u.two_factor, lang: u.lang, timezone: u.timezone,
})

const publicSite = (s) => s && ({
  id: s.id, name: s.name, title: s.title, status: s.status, authority: s.authority,
  url: s.url, paired: !!s.paired, hasSecret: !!s.secret,
  connector: s.connector || null, // JSONB → already an object
  // display metrics (real ones come from the connector once paired)
  uptime: s.paired ? 99.98 : 100, checks: s.paired ? 9 : 0, lastCheck: 2,
  incidents: 0, pendingUpdates: s.paired ? 5 : 0,
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
      [id, email, name || email.split('@')[0], hashPassword(password), Date.now()]
    )
    return publicUser(row)
  },
  byEmailRaw: (email) => one('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]),
  byId: async (id) => publicUser(await one('SELECT * FROM users WHERE id = $1', [id])),
  async update(id, fields) {
    const allowed = ['name', 'two_factor', 'lang', 'timezone']
    const keys = Object.keys(fields).filter((k) => allowed.includes(k))
    if (!keys.length) return this.byId(id)
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const row = await one(`UPDATE users SET ${sets} WHERE id = $1 RETURNING *`, [id, ...keys.map((k) => fields[k])])
    return publicUser(row)
  },
}

export const sites = {
  listByUser: async (userId) =>
    (await all('SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at', [userId])).map(publicSite),

  getForUser: async (id, userId) =>
    publicSite(await one('SELECT * FROM sites WHERE id = $1 AND user_id = $2', [id, userId])),

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
}

function slug(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}

export function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}
