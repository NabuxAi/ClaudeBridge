// ============================================================
// SQLite database — real, persistent storage for users + sites.
// Zero external service: a single file (config.dbFile). Swap the
// driver for Postgres/MySQL in production without touching routes.
// ============================================================
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import { config } from './config.js'
import { hashPassword } from './auth.js'
import { demoSites } from './seed.js'

export const db = new Database(config.dbFile)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    pass_hash  TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'مدیر حساب',
    plan       TEXT NOT NULL DEFAULT 'حرفه‌ای',
    two_factor INTEGER NOT NULL DEFAULT 0,
    lang       TEXT NOT NULL DEFAULT 'fa',
    timezone   TEXT NOT NULL DEFAULT 'Asia/Tehran',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sites (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    name           TEXT NOT NULL,
    title          TEXT,
    status         TEXT NOT NULL DEFAULT 'checking',
    authority      TEXT NOT NULL DEFAULT 'report',
    url            TEXT NOT NULL DEFAULT '',
    secret         TEXT NOT NULL DEFAULT '',
    site_key       TEXT NOT NULL DEFAULT '',
    plugin_site_id TEXT NOT NULL DEFAULT '',
    paired         INTEGER NOT NULL DEFAULT 0,
    connector      TEXT NOT NULL DEFAULT '',
    created_at     INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
`)

// One-time demo seed so the app is populated on first run AND real signups work.
export function seedDemo() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (count > 0) return
  const uid = 'u_demo'
  db.prepare(`INSERT INTO users (id, email, name, pass_hash, role, plan, two_factor, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 1, ?)`).run(
    uid, 'maryam@example.com', 'مریم رضایی', hashPassword('demo1234'), 'مدیر حساب', 'حرفه‌ای', Date.now()
  )
  const ins = db.prepare(`INSERT INTO sites (id, user_id, name, title, status, authority, paired, created_at)
                          VALUES (@id, @user_id, @name, @title, @status, @authority, @paired, @created_at)`)
  for (const s of demoSites) {
    ins.run({ id: s.id, user_id: uid, name: s.name, title: s.title, status: s.status, authority: s.authority, paired: 0, created_at: Date.now() })
  }
  console.log('Seeded demo user maryam@example.com / demo1234 with 3 sites.')
}

export const newId = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex')
