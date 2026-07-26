// ============================================================
// NVD ingest — WordPress plugin and theme CVEs into our own database.
//
// NVD publishes ~17,600 CVEs mentioning WordPress plugins, free and without a
// key. This walks that set in pages, extracts what we can match to a
// wordpress.org slug, and stores the rest as unconfirmed for review.
//
// The honest part of this file is the matcher. A CVE describes a product in
// prose — "WP Super Cache plugin before 1.7.2 for WordPress" — while a site
// reports the slug `wp-super-cache`. Getting from one to the other is a guess,
// and a wrong guess means telling someone their healthy plugin is vulnerable.
// So a guess only becomes visible to sites when it is corroborated; otherwise
// it waits for a human. Under-reporting is recoverable, crying wolf is not.
// ============================================================
import { one, all, query } from '../db.js'

const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const PAGE = 200 // NVD's documented maximum is 2000; smaller pages fail less

// Without a key NVD allows roughly 5 requests per 30s. Staying well under it
// costs a slower first import and buys never being throttled mid-run.
const DELAY_MS = 7000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The matcher lives in match.js and is re-exported here so callers still see a
// single module; only its IO wrapper belongs in this file.
export { extractTarget, extractFixedIn, extractSeverity, slugExists, toRow, compareVersions } from './match.js'
import { toRow, compareVersions } from './match.js'

export async function upsert(row) {
  const existing = await one('SELECT id, confirmed FROM vulnerabilities WHERE cve_id = $1 AND slug = $2', [
    row.cve_id,
    row.slug,
  ])
  if (existing) {
    // Never demote something a human confirmed back to unconfirmed.
    await query(
      `UPDATE vulnerabilities
         SET fixed_in = COALESCE($3, fixed_in), severity = COALESCE($4, severity),
             cvss = COALESCE($5, cvss), summary = $6,
             confirmed = confirmed OR $7, match_note = $8
       WHERE id = $1 AND cve_id = $2`,
      [existing.id, row.cve_id, row.fixed_in, row.severity, row.cvss, row.summary, row.confirmed, row.match_note]
    )
    return 'updated'
  }
  await query(
    `INSERT INTO vulnerabilities
       (cve_id, slug, kind, fixed_in, severity, cvss, summary, published_at, source, confirmed, match_note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (cve_id, slug) DO NOTHING`,
    [row.cve_id, row.slug, row.kind, row.fixed_in, row.severity, row.cvss, row.summary,
     row.published_at, row.source, row.confirmed, row.match_note, Date.now()]
  )
  return 'added'
}

/**
 * Walk NVD and store what it has.
 *
 * `since` keeps daily runs cheap: only CVEs published or modified since the
 * last successful run. The first run, with no `since`, is the long one.
 */
export async function ingest({ since = null, maxPages = 50, log = console.log } = {}) {
  const started = Date.now()
  const run = await one(
    'INSERT INTO intel_runs (feed, started_at) VALUES ($1,$2) RETURNING id',
    ['nvd', started]
  )
  let added = 0
  let updated = 0
  let error = null

  try {
    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        keywordSearch: 'wordpress',
        resultsPerPage: String(PAGE),
        startIndex: String(page * PAGE),
      })
      if (since) {
        params.set('lastModStartDate', new Date(since).toISOString())
        params.set('lastModEndDate', new Date().toISOString())
      }

      const res = await fetch(`${NVD}?${params}`, { signal: AbortSignal.timeout(60000) })
      if (!res.ok) throw new Error(`NVD returned ${res.status}`)
      const body = await res.json()
      const items = body.vulnerabilities || []
      if (!items.length) break

      for (const item of items) {
        const row = await toRow(item)
        if (!row) continue
        const what = await upsert(row)
        if (what === 'added') added++
        else updated++
      }
      log(`  nvd page ${page + 1}: ${items.length} records, ${added} new so far`)

      if ((page + 1) * PAGE >= (body.totalResults || 0)) break
      await sleep(DELAY_MS)
    }
  } catch (e) {
    error = e.message
  }

  await query('UPDATE intel_runs SET finished_at = $2, added = $3, updated = $4, error = $5 WHERE id = $1', [
    run.id, Date.now(), added, updated, error,
  ])
  return { added, updated, error }
}

/** When the last successful NVD run finished, for incremental fetches. */
export async function lastSuccess() {
  const row = await one(
    "SELECT finished_at FROM intel_runs WHERE feed = 'nvd' AND error IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1"
  )
  return row?.finished_at || null
}

/** Confirmed vulnerabilities affecting an installed version. */
export async function findFor(slug, version) {
  const rows = await all(
    'SELECT cve_id, fixed_in, severity, cvss, summary FROM vulnerabilities WHERE slug = $1 AND confirmed',
    [slug]
  )
  return rows.filter((r) => r.fixed_in && compareVersions(version, r.fixed_in) < 0)
}
