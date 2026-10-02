// Persistent store for uptime monitors and their check results.
//
// Two honest distinctions this file is responsible for keeping:
//
//   - A window with zero recorded checks is «اندازه‌گیری نشده» (measured:
//     false, percent: null) — never 100%, never 0%. A missing measurement
//     must not become a green (or red) zero.
//   - «تعداد اختلال» counts failure *episodes* — a stretch of consecutive
//     failed checks is one outage, however many 5-minute ticks it spanned.
//     Counting raw failed checks instead would price one bad hour as twelve
//     separate incidents.
import { one, all, query, pool, newId } from './db.js'

/** Monitors per site. Ten URLs is already far beyond "homepage + shop + api". */
export const PER_SITE_LIMIT = 10

/** What this feature measures, carried in every list/status response. */
export const SCOPE_LABEL = 'بررسی دسترسی HTTP، نه سفر کاربری/پرداخت'

/** Results are kept a little longer than the widest reported window (30 days). */
export const RETENTION_MS = 35 * 24 * 60 * 60 * 1000
export const WINDOW_7_MS = 7 * 24 * 60 * 60 * 1000
export const WINDOW_30_MS = 30 * 24 * 60 * 60 * 1000

function httpError(status, message, code) {
  const e = new Error(message)
  e.status = status
  if (code) e.code = code
  return e
}

const publicResult = (r) => r && ({
  id: r.id,
  monitorId: r.monitor_id,
  ok: Boolean(r.ok),
  status: r.status != null ? Number(r.status) : null,
  ms: r.ms != null ? Number(r.ms) : null,
  error: r.error || null,
  checkedAt: Number(r.checked_at),
})

const publicMonitor = (m) => m && ({
  id: m.id,
  siteId: m.site_id,
  label: m.label,
  url: m.url,
  expectStatus: Number(m.expect_status),
  expectContains: m.expect_contains || null,
  enabled: Boolean(m.enabled),
  createdAt: Number(m.created_at),
})

/**
 * Validate one monitor payload. `partial` (edit) validates only the keys that
 * are present; create always requires label and url.
 */
function normalizeFields(fields, { partial = false } = {}) {
  const out = {}
  const has = (k) => Object.prototype.hasOwnProperty.call(fields, k)

  if (!partial || has('label')) {
    const label = String(fields.label ?? '').trim()
    if (!label) throw httpError(400, 'برچسب مانیتور لازم است.')
    if (label.length > 120) throw httpError(400, 'برچسب مانیتور بیش از حد بلند است.')
    out.label = label
  }
  if (!partial || has('url')) {
    const url = String(fields.url ?? '').trim()
    let parsed
    try { parsed = new URL(url) } catch { throw httpError(400, 'نشانی مانیتور معتبر نیست.') }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw httpError(400, 'نشانی مانیتور باید با http یا https شروع شود.')
    }
    out.url = parsed.href
  }
  if (has('expectStatus') || !partial) {
    const raw = fields.expectStatus ?? 200
    const status = Number(raw)
    if (!Number.isInteger(status) || status < 100 || status > 599) {
      throw httpError(400, 'کد وضعیت مورد انتظار باید عددی بین ۱۰۰ تا ۵۹۹ باشد.')
    }
    out.expect_status = status
  }
  if (has('expectContains')) {
    const contains = String(fields.expectContains ?? '').trim()
    if (contains.length > 500) throw httpError(400, 'عبارت مورد انتظار بیش از حد بلند است.')
    out.expect_contains = contains || null
  }
  if (has('enabled')) {
    out.enabled = Boolean(fields.enabled)
  }
  return out
}

/**
 * Per-monitor availability aggregates over one window.
 *
 * `incidents` counts episodes: a failed check whose predecessor (in time) was
 * not also a failure starts a new episode. The window boundary is honest about
 * being a boundary — a monitor that was already failing before the window
 * counts its first in-window failure as the episode this window can see.
 */
const AGGREGATE_SQL = `
  SELECT monitor_id,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE ok)::int AS ok_count,
         COUNT(*) FILTER (WHERE ok = false AND prev_ok IS DISTINCT FROM false)::int AS incidents
    FROM (
      SELECT monitor_id, ok,
             LAG(ok) OVER (PARTITION BY monitor_id ORDER BY checked_at) AS prev_ok
        FROM monitor_results
       WHERE site_id = $1 AND checked_at >= $2
    ) t
   GROUP BY monitor_id`

/** One availability window as the API returns it — never a fabricated zero. */
function publicAvailability(agg) {
  if (!agg.total) return { measured: false, percent: null, incidents: null, checks: 0 }
  return {
    measured: true,
    percent: Math.round((agg.ok / agg.total) * 1000) / 10,
    incidents: agg.incidents,
    checks: agg.total,
  }
}

export const monitors = {
  /** Every monitor of one site, each with its last result and 7/30-day history. */
  async list(siteId) {
    const rows = await all(
      'SELECT * FROM site_monitors WHERE site_id = $1 ORDER BY created_at, id',
      [siteId],
    )
    if (!rows.length) return []

    const since7 = Date.now() - WINDOW_7_MS
    const since30 = Date.now() - WINDOW_30_MS
    const aggRows = await all(
      `SELECT monitor_id,
              COUNT(*) FILTER (WHERE checked_at >= $2)::int AS total7,
              COUNT(*) FILTER (WHERE checked_at >= $2 AND ok)::int AS ok7,
              COUNT(*) FILTER (WHERE checked_at >= $2 AND ok = false AND prev_ok IS DISTINCT FROM false)::int AS inc7,
              COUNT(*)::int AS total30,
              COUNT(*) FILTER (WHERE ok)::int AS ok30,
              COUNT(*) FILTER (WHERE ok = false AND prev_ok IS DISTINCT FROM false)::int AS inc30
         FROM (
           SELECT monitor_id, ok, checked_at,
                  LAG(ok) OVER (PARTITION BY monitor_id ORDER BY checked_at) AS prev_ok
             FROM monitor_results
            WHERE site_id = $1 AND checked_at >= $3
         ) t
        GROUP BY monitor_id`,
      [siteId, since7, since30],
    )
    const agg = new Map(aggRows.map((r) => [r.monitor_id, r]))

    const ids = rows.map((r) => r.id)
    const lastRows = await all(
      `SELECT DISTINCT ON (monitor_id) *
         FROM monitor_results
        WHERE monitor_id = ANY($1)
        ORDER BY monitor_id, checked_at DESC`,
      [ids],
    )
    const last = new Map(lastRows.map((r) => [r.monitor_id, r]))

    return rows.map((m) => {
      const a = agg.get(m.id)
      return {
        ...publicMonitor(m),
        lastResult: last.has(m.id) ? publicResult(last.get(m.id)) : null,
        days7: publicAvailability({ total: a?.total7 || 0, ok: a?.ok7 || 0, incidents: a?.inc7 || 0 }),
        days30: publicAvailability({ total: a?.total30 || 0, ok: a?.ok30 || 0, incidents: a?.inc30 || 0 }),
      }
    })
  },

  async get(siteId, monitorId) {
    const row = await one(
      'SELECT * FROM site_monitors WHERE id = $1 AND site_id = $2',
      [monitorId, siteId],
    )
    return row ? publicMonitor(row) : null
  },

  async create(siteId, fields) {
    const norm = normalizeFields(fields || {})
    // The cap is count-then-insert, and a bare count is a TOCTOU: two
    // simultaneous POSTs both read n = limit-1 and both insert. A transaction
    // scoped to one client with a transaction-level advisory lock keyed on
    // this site serializes concurrent creates, so every contender's count
    // sees the committed inserts of the ones that went first. Nothing else
    // in the store takes this lock, so a create never blocks a check run.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT pg_advisory_xact_lock(hashtext('site_monitors:' || $1))", [siteId])
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS n FROM site_monitors WHERE site_id = $1',
        [siteId],
      )
      if (rows[0].n >= PER_SITE_LIMIT) {
        throw httpError(
          400,
          `سقف مانیتورهای این سایت پر است (حداکثر ${PER_SITE_LIMIT} مانیتور به‌ازای هر سایت).`,
          'monitor_limit_reached',
        )
      }
      const id = newId('mon_')
      const { rows: inserted } = await client.query(
        `INSERT INTO site_monitors (id, site_id, label, url, expect_status, expect_contains, enabled, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          id, siteId, norm.label, norm.url,
          norm.expect_status ?? 200,
          norm.expect_contains ?? null,
          norm.enabled ?? true,
          Date.now(),
        ],
      )
      await client.query('COMMIT')
      const row = inserted[0]
      return { ...publicMonitor(row), lastResult: null, days7: publicAvailability({ total: 0 }), days30: publicAvailability({ total: 0 }) }
    } catch (e) {
      // A refused cap throws inside the open transaction; roll back so the
      // client is released clean. COMMIT/ROLLBACK on an already-broken
      // client rethrows — swallow that one, the original error is the truth.
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  },

  async update(siteId, monitorId, patch) {
    const existing = await one(
      'SELECT * FROM site_monitors WHERE id = $1 AND site_id = $2',
      [monitorId, siteId],
    )
    if (!existing) throw httpError(404, 'مانیتور یافت نشد.')

    const norm = normalizeFields(patch || {}, { partial: true })
    const sets = []
    const values = []
    const add = (col, val) => { sets.push(`${col} = $${values.length + 1}`); values.push(val) }
    for (const col of ['label', 'url', 'expect_status', 'expect_contains', 'enabled']) {
      if (col in norm) add(col, norm[col])
    }
    if (!sets.length) return publicMonitor(existing)
    values.push(monitorId, siteId)
    const row = await one(
      `UPDATE site_monitors SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND site_id = $${values.length} RETURNING *`,
      values,
    )
    return publicMonitor(row)
  },

  async remove(siteId, monitorId) {
    const row = await one(
      'DELETE FROM site_monitors WHERE id = $1 AND site_id = $2 RETURNING id',
      [monitorId, siteId],
    )
    if (!row) throw httpError(404, 'مانیتور یافت نشد.')
    // Results die with the monitor through ON DELETE CASCADE — history for a
    // monitor that no longer exists is not history anyone can read anyway.
    return { ok: true }
  },

  /** Recent results of one monitor, newest first. */
  async listResults(siteId, monitorId, { limit = 50 } = {}) {
    return (await all(
      `SELECT * FROM monitor_results WHERE monitor_id = $1 AND site_id = $2
        ORDER BY checked_at DESC LIMIT $3`,
      [monitorId, siteId, Math.min(Number(limit) || 50, 200)],
    )).map(publicResult)
  },

  /** Record one check attempt. Attempts are recorded, not just successes. */
  async recordResult(monitor, { ok, status = null, ms = null, error = null } = {}) {
    const id = newId('monr_')
    const row = await one(
      `INSERT INTO monitor_results (id, monitor_id, site_id, ok, status, ms, error, checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id,
        monitor.id,
        monitor.site_id ?? monitor.siteId,
        Boolean(ok),
        status != null ? Number(status) : null,
        ms != null ? Math.round(Number(ms)) : null,
        error ? String(error).slice(0, 500) : null,
        Date.now(),
      ],
    )
    pruneOldResults()
    return publicResult(row)
  },

  /**
   * Site-wide availability for the status (overview) response: all monitors of
   * the site pooled, episodes counted per monitor and then summed.
   */
  async siteAvailability(siteId) {
    const [a7, a30] = await Promise.all([
      windowTotals(siteId, Date.now() - WINDOW_7_MS),
      windowTotals(siteId, Date.now() - WINDOW_30_MS),
    ])
    return {
      scope: SCOPE_LABEL,
      days7: publicAvailability(a7),
      days30: publicAvailability(a30),
    }
  },
}

async function windowTotals(siteId, sinceMs) {
  const rows = await all(AGGREGATE_SQL, [siteId, sinceMs])
  return rows.reduce(
    (acc, r) => ({ total: acc.total + r.total, ok: acc.ok + r.ok_count, incidents: acc.incidents + r.incidents }),
    { total: 0, ok: 0, incidents: 0 },
  )
}

/**
 * Prune results past the retention window, at most once an hour per process.
 * Delete-on-insert at this table's write rate would be an indexed DELETE per
 * check for rows that almost never exist.
 */
let lastPruneAt = 0
function pruneOldResults() {
  const now = Date.now()
  if (now - lastPruneAt < 60 * 60 * 1000) return
  lastPruneAt = now
  query('DELETE FROM monitor_results WHERE checked_at < $1', [now - RETENTION_MS])
    .catch(() => { /* retention is housekeeping; a failed prune must not fail a recorded check */ })
}

/** Test seam: forget the throttle and prune immediately. */
export async function _forcePruneForTests() {
  lastPruneAt = 0
  await query('DELETE FROM monitor_results WHERE checked_at < $1', [Date.now() - RETENTION_MS])
}
