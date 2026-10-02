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
import { pushSubscriptions } from './push.store.js'

export { SCHEMA } from './events.schema.js'


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

export async function listByUser(userId, limit = 20) {
  return all(
    `SELECT e.*, s.name AS site_name, s.title AS site_title
       FROM events e
       JOIN sites s ON s.id = e.site_id
      WHERE s.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [userId, limit]
  )
}

function buildEventFilters(filters = {}) {
  const where = []
  const params = []
  let idx = 1
  if (filters.userId) {
    where.push(`s.user_id = $${idx++}`)
    params.push(filters.userId)
  }
  if (filters.siteId) {
    where.push(`e.site_id = $${idx++}`)
    params.push(filters.siteId)
  }
  if (filters.kind) {
    where.push(`e.kind = $${idx++}`)
    params.push(filters.kind)
  }
  if (filters.severity) {
    where.push(`e.severity = $${idx++}`)
    params.push(filters.severity)
  }
  if (filters.from) {
    where.push(`e.created_at >= $${idx++}`)
    params.push(Number(filters.from))
  }
  if (filters.to) {
    where.push(`e.created_at <= $${idx++}`)
    params.push(Number(filters.to))
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params, nextIdx: idx }
}

export async function listAll(filters = {}, limit = 50, offset = 0) {
  const f = buildEventFilters(filters)
  return all(
    `SELECT e.*, s.name AS site_name, s.title AS site_title, u.email AS user_email, u.name AS user_name
       FROM events e
       JOIN sites s ON s.id = e.site_id
       JOIN users u ON u.id = s.user_id
       ${f.clause}
       ORDER BY e.created_at DESC
       LIMIT $${f.nextIdx} OFFSET $${f.nextIdx + 1}`,
    [...f.params, limit, offset]
  )
}

export async function countAll(filters = {}) {
  const f = buildEventFilters(filters)
  const row = await one(
    `SELECT COUNT(*)::int AS n
       FROM events e
       JOIN sites s ON s.id = e.site_id
       ${f.clause}`,
    f.params
  )
  return row?.n || 0
}

export async function byId(id) {
  return one(
    `SELECT e.*, s.name AS site_name, s.title AS site_title, u.email AS user_email, u.name AS user_name
       FROM events e
       JOIN sites s ON s.id = e.site_id
       JOIN users u ON u.id = s.user_id
      WHERE e.id = $1`,
    [id]
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
    // Web Push subscriptions are their own store, not a contact field: one
    // row per enrolled browser, with the encryption keys the payload needs.
    // Fetched here so the channel can tell "not configured" from "no browser
    // enrolled" up front, exactly like every other channel's skip check.
    pushSubscriptions: await pushSubscriptions.allForUser(site.owner_id).catch(() => []),
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
