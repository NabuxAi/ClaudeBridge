// Persistent store backed by SQLite (src/db.js). Users + sites are real.
import crypto from 'node:crypto'
import { db, newId } from './db.js'
import { hashPassword } from './auth.js'

const publicUser = (u) => u && ({
  id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan,
  initials: (u.name || '?').trim().charAt(0), twoFactor: !!u.two_factor, lang: u.lang, timezone: u.timezone,
})

const publicSite = (s) => s && ({
  id: s.id, name: s.name, title: s.title, status: s.status, authority: s.authority,
  url: s.url, paired: !!s.paired, hasSecret: !!s.secret,
  connector: s.connector ? safeJson(s.connector) : null,
  // display metrics (real ones come from the connector once paired)
  uptime: s.paired ? 99.98 : 100, checks: s.paired ? 9 : 0, lastCheck: 2,
  incidents: 0, pendingUpdates: s.paired ? 5 : 0,
})

const safeJson = (v) => { try { return JSON.parse(v) } catch { return null } }

export const users = {
  create({ email, name, password }) {
    email = String(email || '').trim().toLowerCase()
    if (!email || !password) throw httpError(400, 'ایمیل و رمز عبور لازم است.')
    if (String(password).length < 8) throw httpError(400, 'رمز عبور باید حداقل ۸ نویسه باشد.')
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw httpError(409, 'این ایمیل قبلاً ثبت شده است.')
    const id = newId('u_')
    db.prepare(`INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, email, name || email.split('@')[0], hashPassword(password), Date.now())
    return this.byId(id)
  },
  byEmailRaw: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase()),
  byId: (id) => publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
  rawById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  update(id, fields) {
    const allowed = ['name', 'two_factor', 'lang', 'timezone']
    const sets = Object.keys(fields).filter((k) => allowed.includes(k))
    if (!sets.length) return this.byId(id)
    db.prepare(`UPDATE users SET ${sets.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ id, ...fields })
    return this.byId(id)
  },
}

export const sites = {
  listByUser: (userId) => db.prepare('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at').all(userId).map(publicSite),

  getForUser(id, userId) {
    const s = db.prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?').get(id, userId)
    return s ? publicSite(s) : null
  },

  /** Internal row incl. secret — for the relay. Caller must have checked ownership. */
  rawForUser: (id, userId) => db.prepare('SELECT * FROM sites WHERE id = ? AND user_id = ?').get(id, userId),

  add(userId, { name, title }) {
    if (!name) throw httpError(400, 'دامنهٔ سایت لازم است.')
    const clean = String(name).replace(/^https?:\/\//, '').replace(/\/$/, '')
    const id = slug(clean) || newId('s_')
    if (db.prepare('SELECT 1 FROM sites WHERE id = ?').get(id)) throw httpError(409, 'این سایت قبلاً افزوده شده است.')
    const site = {
      id, user_id: userId, name: clean, title: title || clean, status: 'checking', authority: 'report',
      url: name.startsWith('http') ? name : `https://${clean}`,
      secret: crypto.randomBytes(32).toString('hex'), site_key: crypto.randomBytes(10).toString('hex'),
      created_at: Date.now(),
    }
    db.prepare(`INSERT INTO sites (id, user_id, name, title, status, authority, url, secret, site_key, created_at)
                VALUES (@id, @user_id, @name, @title, @status, @authority, @url, @secret, @site_key, @created_at)`).run(site)
    return { ...publicSite(site), secret: site.secret, siteKey: site.site_key } // secret shown ONCE
  },

  markPaired(id, connector = {}) {
    const c = JSON.stringify({ ...connector, lastSeen: Date.now() })
    db.prepare(`UPDATE sites SET paired = 1, status = 'healthy', connector = ? WHERE id = ?`).run(c, id)
    return publicSite(db.prepare('SELECT * FROM sites WHERE id = ?').get(id))
  },

  recordRegister(id, { url, pluginSiteId, name, version } = {}) {
    const c = JSON.stringify({ version: version || '3.5.1', lastSeen: Date.now(), pluginSiteId })
    db.prepare(`UPDATE sites SET paired = 1, status = 'healthy', connector = ?,
                url = COALESCE(NULLIF(?, ''), url), title = COALESCE(NULLIF(?, ''), title),
                plugin_site_id = ? WHERE id = ?`).run(c, url || '', name || '', pluginSiteId || '', id)
    return publicSite(db.prepare('SELECT * FROM sites WHERE id = ?').get(id))
  },

  /** {id, secret} for every site — to match an inbound signed register call. */
  candidates: () => db.prepare("SELECT id, secret FROM sites WHERE secret != ''").all(),
}

function slug(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}

export function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}
