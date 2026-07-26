// ============================================================
// The event log — what actually happened to a site.
//
// This is the source the alerts view was missing. Everything here is written
// at the moment a real thing occurs: a scan that found something, an update
// this system applied, a job that failed, a policy someone changed. Nothing
// is generated to fill the screen, and nothing is inferred after the fact.
//
// Two consequences worth stating, because they shape what the panel may claim:
//
//  1. There are no events before this table existed, and none for a site that
//     has never been scanned. An empty list means "nothing was recorded", not
//     "nothing happened" — the view has to say so rather than show a reassuring
//     green summary.
//
//  2. We only see the site when we ask. Downtime between two scans leaves no
//     trace here, so this log must never be presented as uptime monitoring.
//     A 500 at 3am that healed by morning is invisible to us, and pretending
//     otherwise would be the exact kind of fake data this replaces.
// ============================================================
import { query, all, one, newId } from './db.js'

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    severity    TEXT NOT NULL DEFAULT 'info',
    title       TEXT NOT NULL,
    detail      JSONB,
    -- A dedup key: one open event per real-world condition. A site that fails
    -- every nightly scan for a week is one unresolved problem, not seven
    -- alerts, and an inbox that cries seven times is an inbox people mute.
    fingerprint TEXT,
    resolved_at BIGINT,
    created_at  BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_site ON events(site_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_open
    ON events(site_id, fingerprint) WHERE resolved_at IS NULL AND fingerprint IS NOT NULL;
`

/**
 * Record something that happened.
 *
 * With a fingerprint this is idempotent while the condition persists: the
 * existing open event is touched, not duplicated. Without one, every call is
 * a distinct entry — right for actions (an update ran twice = two runs), wrong
 * for conditions (malware still present = still one problem).
 */
export async function record({ siteId, kind, severity = 'info', title, detail = null, fingerprint = null }) {
  const now = Date.now()
  if (fingerprint) {
    const open = await one(
      'SELECT * FROM events WHERE site_id = $1 AND fingerprint = $2 AND resolved_at IS NULL',
      [siteId, fingerprint]
    )
    if (open) {
      // Keep the first-seen time. When a problem started matters more than
      // when we last confirmed it, and overwriting it would make a week-old
      // infection look like it appeared this morning.
      await query('UPDATE events SET detail = $1, title = $2, severity = $3 WHERE id = $4',
        [detail, title, severity, open.id])
      return { ...open, detail, title, severity, repeated: true }
    }
  }
  const row = {
    id: newId('ev_'), site_id: siteId, kind, severity, title,
    detail, fingerprint, resolved_at: null, created_at: now,
  }
  await query(
    `INSERT INTO events (id, site_id, kind, severity, title, detail, fingerprint, resolved_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [row.id, siteId, kind, severity, title, detail, fingerprint, null, now]
  )
  return row
}

/**
 * Close every open event matching a fingerprint prefix.
 *
 * Called when a fresh observation shows the condition is gone — a clean scan
 * closes the malware findings from the previous one. Resolution is therefore
 * evidence-based: nothing here is marked fixed because someone clicked a
 * button, only because a later measurement disagreed with the earlier one.
 */
export async function resolveByPrefix(siteId, prefix) {
  const res = await query(
    `UPDATE events SET resolved_at = $1
     WHERE site_id = $2 AND resolved_at IS NULL AND fingerprint LIKE $3`,
    [Date.now(), siteId, prefix + '%']
  )
  return res.rowCount
}

/** Close one event by id. Used by the "ignore" action, which is an admission, not a fix. */
export async function resolveOne(siteId, id) {
  const res = await query(
    'UPDATE events SET resolved_at = $1 WHERE id = $2 AND site_id = $3 AND resolved_at IS NULL',
    [Date.now(), id, siteId]
  )
  return res.rowCount > 0
}

export async function list(siteId, limit = 60) {
  return all(
    'SELECT * FROM events WHERE site_id = $1 ORDER BY created_at DESC LIMIT $2',
    [siteId, limit]
  )
}

/** Every event sharing a fingerprint, oldest first — the history of one problem. */
export async function history(siteId, fingerprint) {
  return all(
    'SELECT * FROM events WHERE site_id = $1 AND fingerprint = $2 ORDER BY created_at ASC',
    [siteId, fingerprint]
  )
}
