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
     RETURNING *`,
    [newId('prop_'), siteId, userId || null, tool, JSON.stringify(args), kind,
      reason || null, authority || null, Date.now()]
  )
  return rows[0]
}

/** Everything still waiting on this site, newest first. */
export function pending(siteId) {
  return all(
    `SELECT * FROM proposals WHERE site_id = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [siteId]
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
  return rows[0] || null
}
