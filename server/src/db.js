// ============================================================
// PostgreSQL database — real, persistent storage for users + sites.
// A connection pool + idempotent schema migration + a one-time demo
// seed. This is the only file that knows about the driver; routes go
// through the async store in src/store.js.
// ============================================================
import pg from 'pg'
import crypto from 'node:crypto'
import { config } from './config.js'
import { hashPassword } from './auth.js'
import { demoSites } from './seed.js'
import { SCHEMA as EVENTS_SCHEMA } from './events.schema.js'
import { SCHEMA as PROPOSALS_SCHEMA } from './proposals.schema.js'
import { SCHEMA as SWEEP_SCHEMA } from './sweep.schema.js'
import { SCHEMA as PASSWORD_RESETS_SCHEMA } from './password-resets.schema.js'
import { SCHEMA as TEAM_SCHEMA } from './team.schema.js'
import { SCHEMA as NOTIFICATIONS_SCHEMA } from './notifications.schema.js'
import { SCHEMA as BILLING_SCHEMA } from './billing.schema.js'
import { SCHEMA as OFFSITE_BACKUPS_SCHEMA } from './offsite-backups.schema.js'
import { SCHEMA as CONVERSATIONS_SCHEMA } from './conversations.schema.js'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

/** Small helpers so callers read cleanly. */
export const query = (text, params) => pool.query(text, params)
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null
export const all = async (text, params) => (await pool.query(text, params)).rows
export const newId = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex')

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    pass_hash  TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'مدیر حساب',
    plan       TEXT NOT NULL DEFAULT 'حرفه‌ای',
    two_factor BOOLEAN NOT NULL DEFAULT false,
    lang       TEXT NOT NULL DEFAULT 'fa',
    timezone   TEXT NOT NULL DEFAULT 'Asia/Tehran',
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sites (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    title          TEXT,
    status         TEXT NOT NULL DEFAULT 'checking',
    authority      TEXT NOT NULL DEFAULT 'report',
    url            TEXT NOT NULL DEFAULT '',
    secret         TEXT NOT NULL DEFAULT '',
    site_key       TEXT NOT NULL DEFAULT '',
    plugin_site_id TEXT NOT NULL DEFAULT '',
    paired         BOOLEAN NOT NULL DEFAULT false,
    connector      JSONB,
    created_at     BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);

  -- Update policy per site: whether core, plugins and themes keep themselves
  -- current, and whether safe mode is holding those switches down.
  --
  -- A column rather than part of the connector JSONB, because this is the one
  -- piece of site state the panel writes and the connector only reads — and
  -- because safe mode has to be enforced somewhere the server can see. A policy
  -- that lives only in the browser is a policy anyone can turn off with curl.
  --
  -- Defaults are deliberately the safe ones: a site added today updates itself
  -- from the moment it pairs, without anyone having to remember to switch it on.
  ALTER TABLE sites ADD COLUMN IF NOT EXISTS policy JSONB
    NOT NULL DEFAULT '{"safeMode":true,"autoCore":true,"autoPlugins":true,"autoThemes":true}'::jsonb;

  -- What the last update run actually did, written back by the connector, so
  -- the panel reports observed reality instead of the intent it sent.
  ALTER TABLE sites ADD COLUMN IF NOT EXISTS update_state JSONB;

  -- Where this site is hosted, and the routing that follows from it.
  --
  -- A column rather than something inferred at request time: which of our
  -- servers reaches a site, and which address we told its connector to call
  -- back on, both have to survive a restart and be changeable without
  -- re-pairing. Defaults are the honest unknown rather than a guess, because
  -- acting on a wrong guess here means requests that silently never arrive.
  ALTER TABLE sites ADD COLUMN IF NOT EXISTS hosting JSONB
    NOT NULL DEFAULT '{"region":"unknown","provider":"other","providerName":null,"egress":"auto","callbackUrl":null}'::jsonb;
` + EVENTS_SCHEMA + PROPOSALS_SCHEMA + SWEEP_SCHEMA + PASSWORD_RESETS_SCHEMA + TEAM_SCHEMA + NOTIFICATIONS_SCHEMA + BILLING_SCHEMA + OFFSITE_BACKUPS_SCHEMA + CONVERSATIONS_SCHEMA

/** Wait for Postgres to accept connections (compose may start us first). */
async function waitForDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (e) {
      if (i === retries - 1) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

/** Connect, migrate the schema, and optionally seed demo data once. */
export async function init() {
  await waitForDb()
  await pool.query(SCHEMA)
  if (config.seedDemo) {
    await seedDemo()
  }
}

async function seedDemo() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users')
  if (rows[0].n > 0) return
  const uid = 'u_demo'
  await pool.query(
    `INSERT INTO users (id, email, name, pass_hash, role, plan, two_factor, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
    [uid, 'maryam@example.com', 'مریم رضایی', await hashPassword('demo1234'), 'مدیر حساب', 'حرفه‌ای', Date.now()]
  )
  for (const s of demoSites) {
    await pool.query(
      `INSERT INTO sites (id, user_id, name, title, status, authority, paired, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
      [s.id, uid, s.name, s.title, s.status, s.authority, Date.now()]
    )
  }
  console.log('Seeded demo user maryam@example.com / demo1234 with 3 sites.')
}
