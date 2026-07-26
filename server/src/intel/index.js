// ============================================================
// Intelligence bootstrap — apply the schema, then keep the feeds fresh.
//
// The CVE database and the signature bank were built but never wired in: the
// tables did not exist on the running server, so /cookbook/signatures answered
// from nothing and the vulnerability matcher had nothing to match against.
// This is the missing half.
//
// Pacing is the constraint that shapes everything here. NVD without a key
// allows roughly five requests per rolling thirty seconds and will start
// returning 403 rather than slowing you down, and GitHub raw has its own
// limits. So the first ingest is deliberately not run at boot — a restart loop
// would hammer both — and refreshes are spread out rather than bunched.
// ============================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { query, one } from '../db.js'
import * as nvd from './nvd.js'
import * as signatures from './signatures.js'

const here = dirname(fileURLToPath(import.meta.url))

/** Create the intel tables. Idempotent, same as the main schema. */
export async function initIntel() {
  await query(readFileSync(join(here, 'schema.sql'), 'utf8'))
}

/** When a feed last finished successfully, or null if it never has. */
async function lastGoodRun(feed) {
  const row = await one(
    `SELECT finished_at FROM intel_runs
      WHERE feed = $1 AND error IS NULL AND finished_at IS NOT NULL
      ORDER BY finished_at DESC LIMIT 1`,
    [feed]
  )
  return row ? Number(row.finished_at) : null
}

/**
 * Refresh one feed if it is stale.
 *
 * NVD is asked only for what changed since the last good run, so the daily
 * cost after the first ingest is a handful of requests. The first run has no
 * `since` and is capped — an unbounded first walk is thousands of pages, and
 * the useful ones are the recent ones.
 */
export async function refresh({ force = false, log = console.log } = {}) {
  const out = {}

  const sigAge = await lastGoodRun('signatures')
  if (force || !sigAge || Date.now() - sigAge > 7 * 86400000) {
    log('intel: refreshing signature bank…')
    out.signatures = await signatures.ingest({ log })
  } else {
    out.signatures = { skipped: true, lastRun: sigAge }
  }

  const nvdAge = await lastGoodRun('nvd')
  if (force || !nvdAge || Date.now() - nvdAge > 86400000) {
    const first = !nvdAge
    log(first ? 'intel: first NVD ingest (this takes a while)…' : 'intel: NVD delta…')
    out.nvd = await nvd.ingest({
      // A day of overlap on incremental runs. Cheap, and it means a CVE
      // published while a run was in flight is not skipped forever.
      since: nvdAge ? nvdAge - 86400000 : null,
      maxPages: first ? 40 : 10,
      log,
    })
  } else {
    out.nvd = { skipped: true, lastRun: nvdAge }
  }

  return out
}

/**
 * Check once an hour whether anything is stale.
 *
 * The first check is delayed rather than immediate: a server that ingests on
 * boot turns a crash loop into a rate-limit ban, and there is no reason the
 * bank has to be current in the first minute of uptime.
 */
export function scheduleIntel() {
  const tick = async () => {
    try {
      const r = await refresh({})
      const parts = []
      if (!r.signatures?.skipped) parts.push(`signatures +${r.signatures?.added ?? 0}`)
      if (!r.nvd?.skipped) parts.push(`nvd +${r.nvd?.added ?? 0}/~${r.nvd?.updated ?? 0}`)
      if (parts.length) console.log(`Intel refresh: ${parts.join(', ')}.`)
    } catch (e) {
      // Never fatal. A stale bank is worse than a fresh one and better than a
      // server that will not stay up.
      console.error('Intel refresh failed:', e.message)
    }
  }

  setTimeout(tick, 5 * 60 * 1000)
  setInterval(tick, 60 * 60 * 1000)
  console.log('Intel refresh scheduled: first run in 5 minutes, then hourly staleness checks.')
}
