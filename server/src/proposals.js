// ============================================================
// Proposals — changes the assistant asked to make and was refused.
//
// A proposal only mattered while the answer was on screen: it lived in the
// panel's React state and nowhere else, so a refresh lost it. That makes
// "confirm" authority weaker than it looks — a confirmation that has to arrive
// in the same breath as the question is not really a second pair of eyes, and
// it can never come from the person who is actually allowed to give it.
//
// Persisting them is what turns the approve button into an inbox.
// ============================================================
import { all, newId, one, query } from './db.js'
import * as events from './events.js'

// The fingerprint ties the "a decision is waiting" event to the proposal that
// raised it, so a repeated proposal touches one open event instead of adding
// another, and resolving the proposal can close it.
const fingerprintFor = (id) => `proposal:${id}`

/**
 * Record a proposal, or return the one already open for the same change.
 *
 * The assistant re-proposes the same thing every time it is asked the same
 * question, so the same (site, tool, args) must not accumulate a row per retry.
 * The unique partial index makes that a database property rather than a race
 * between two requests.
 */
export async function record({ siteId, userId, tool, args = {}, kind, reason, authority }) {
  const { rows } = await query(
    `INSERT INTO proposals (id, site_id, user_id, tool, args, kind, reason, authority, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (site_id, tool, md5(args::text)) WHERE status = 'pending'
     DO UPDATE SET reason = EXCLUDED.reason
     -- xmax is 0 only on a real insert, so this distinguishes a new proposal
     -- from the same one being made again. Without it every retry would raise
     -- another alert about a decision the owner has already been told about.
     RETURNING *, (xmax = 0) AS inserted`,
    [newId('prop_'), siteId, userId || null, tool, JSON.stringify(args), kind,
      reason || null, authority || null, Date.now()]
  )
  const row = rows[0]

  // Durable and visible on the site's page was still not the same as anyone
  // knowing. A proposal nobody is told about waits exactly as long as it takes
  // for the person to happen to open that page — which for a change the
  // assistant thought was worth making is the wrong amount of time.
  //
  // An event, not an emergency dispatch: a pending decision is not a site being
  // down, and treating the two alike is how people learn to ignore both.
  if (row?.inserted) {
    events
      .record({
        siteId,
        kind: 'proposal',
        severity: 'warning',
        title: `تأیید شما لازم است: ${tool}`,
        detail: { proposalId: row.id, tool, args, kind, reason: reason || null, authority: authority || null },
        fingerprint: fingerprintFor(row.id),
      })
      .catch(() => {})
  }

  return row
}

/** Everything still waiting on this site, newest first. */
export function pending(siteId) {
  return all(
    `SELECT * FROM proposals WHERE site_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [siteId]
  )
}

/**
 * Everything waiting across every site, for the daily digest.
 *
 * Joined to sites for the name, because "flush_cache on site-7" tells the
 * reader nothing they can act on.
 */
export function pendingAcrossSites(limit = 50) {
  return all(
    `SELECT p.*, s.name AS site_name
     FROM proposals p JOIN sites s ON s.id = p.site_id
     WHERE p.status = 'pending'
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit]
  )
}

/** One proposal, scoped to its site so an id from elsewhere cannot be read. */
export function get(siteId, id) {
  return one(`SELECT * FROM proposals WHERE id = $1 AND site_id = $2`, [id, siteId])
}

/**
 * Move a proposal out of pending, once.
 *
 * The `status = 'pending'` predicate is the concurrency control: two people
 * clicking approve at the same moment both issue this UPDATE, and exactly one
 * matches a row. The loser gets null and must not run the tool — which is the
 * difference between an approval and a double execution.
 */
export async function resolve(siteId, id, status, { by, result } = {}) {
  const { rows } = await query(
    `UPDATE proposals SET status = $3, resolved_by = $4, resolved_at = $5, result = $6
     WHERE id = $1 AND site_id = $2 AND status = 'pending'
     RETURNING *`,
    [id, siteId, status, by || null, Date.now(), result ? JSON.stringify(result) : null]
  )
  const row = rows[0] || null

  // Close the alert with the decision. An inbox that keeps showing what has
  // already been decided is one people stop reading.
  if (row) {
    events.resolveByPrefix(siteId, fingerprintFor(id)).catch(() => {})
  }

  return row
}
