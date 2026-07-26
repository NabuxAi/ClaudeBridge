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
import { dispatch, compose, isEmergency } from './alerts/index.js'

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

  -- What we tried to send, to whom, and what each provider said.
  --
  -- Kept because "we notified you" is a claim, and a claim about an emergency
  -- needs evidence behind it. It is also the only way to notice that a channel
  -- has been quietly failing for a fortnight.
  CREATE TABLE IF NOT EXISTS alert_deliveries (
    id         TEXT PRIMARY KEY,
    event_id   TEXT REFERENCES events(id) ON DELETE CASCADE,
    site_id    TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id    TEXT,
    delivered  TEXT,
    attempts   JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alert_site ON alert_deliveries(site_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_events_open
    ON events(site_id, fingerprint) WHERE resolved_at IS NULL AND fingerprint IS NOT NULL;

  -- Where to reach this person in an emergency. On users, not sites: a phone
  -- belongs to a human, and someone with four sites should not have to enter
  -- it four times.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS contact JSONB
    NOT NULL DEFAULT '{"phone":null,"fcmToken":null,"najvaToken":null}'::jsonb;
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

  // Fired here rather than by whoever happened to call record(), so a new code
  // path that logs a compromise cannot forget to raise the alarm. Only genuinely
  // new events reach this line: an existing open row returns above, which is
  // what stops four nightly scans of the same shell waking someone four times.
  //
  // Deliberately not awaited. Recording the event must not depend on an SMS
  // gateway answering, and it must not be undone if one times out.
  if (isEmergency(row)) {
    raiseEmergency(row).catch((e) => console.error('Emergency dispatch failed:', e.message))
  }

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

/**
 * Wake someone up.
 *
 * The recipient is the site's owner; the operator channel is notified in
 * parallel by the dispatcher, because the standing requirement is that we find
 * out before the customer does.
 *
 * Every attempt is written down — including the ones that were skipped for
 * want of configuration. A deployment missing an API key and a night where
 * every provider was down look identical from the outside, and only the record
 * tells them apart.
 */
export async function raiseEmergency(event) {
  const site = await one(
    'SELECT s.*, u.id AS owner_id, u.email, u.contact FROM sites s JOIN users u ON u.id = s.user_id WHERE s.id = $1',
    [event.site_id]
  )
  if (!site) return null

  const to = {
    email: site.email,
    phone: site.contact?.phone || null,
    fcmToken: site.contact?.fcmToken || null,
    najvaToken: site.contact?.najvaToken || null,
  }

  const result = await dispatch(compose(event, site), to)

  await query(
    `INSERT INTO alert_deliveries (id, event_id, site_id, user_id, delivered, attempts, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [newId('al_'), event.id, event.site_id, site.owner_id, result.delivered,
      JSON.stringify(result.attempts), Date.now()]
  )

  return result
}

/** What was attempted for a site, newest first. Evidence, not reassurance. */
export function deliveries(siteId, limit = 20) {
  return all(
    'SELECT * FROM alert_deliveries WHERE site_id = $1 ORDER BY created_at DESC LIMIT $2',
    [siteId, limit]
  )
}
