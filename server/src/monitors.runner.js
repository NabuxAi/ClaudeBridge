// ============================================================
// The runner that checks uptime monitors.
//
// What a check is — and deliberately is not:
//
//   It is one HTTP GET with a timeout, from this server, with redirects
//   followed. No JavaScript runs, no session is logged in, nothing is clicked.
//   The product label for exactly this scope is «بررسی دسترسی HTTP، نه سفر
//   کاربری/پرداخت», and it is carried in the API responses rather than only in
//   comments, so the panel cannot soften it.
//
// The request goes through global fetch on purpose: tests inject a fake the
// same way mailer.test.js does, so no test ever touches a real network.
// ============================================================
import { all } from './db.js'
import * as monitorsStore from './monitors.store.js'
import { config } from './config.js'

/** One answer within ten seconds, or the check has failed — a hung site is down. */
const TIMEOUT_MS = 10_000

/**
 * Sites whose monitors should be checked. A tombstoned site (account deleted,
 * `status='deleted'`) is skipped: its connectors are already dead and its
 * owner is gone, so firing requests at its URLs is residue, not monitoring.
 */
function pendingSql() {
  return `
    SELECT m.id, m.site_id, m.label, m.url, m.expect_status, m.expect_contains, m.enabled
      FROM site_monitors m
      JOIN sites s ON s.id = m.site_id
     WHERE m.enabled = true AND s.status <> 'deleted'
     ORDER BY m.site_id, m.created_at`
}

/**
 * Check one monitor once and record the attempt.
 *
 * `ok` means: status equals expect_status AND (when expect_contains is set)
 * the body carries it. A 200 from a page whose content is an error sheet is
 * not an uptime success — that is precisely what expect_contains exists to
 * catch.
 *
 * Accepts either the raw row (snake_case, from the scheduler query) or the
 * public shape (camelCase, from the routes), because both call this.
 */
export async function checkMonitor(monitor) {
  const url = monitor.url
  const expectStatus = Number(monitor.expect_status ?? monitor.expectStatus ?? 200)
  const expectContains = monitor.expect_contains ?? monitor.expectContains ?? ''

  let outcome
  const started = Date.now()
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'DigiWP-Monitor/1.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ms = Date.now() - started
    let containsOk = true
    let containsError = null
    if (expectContains) {
      // Bounded by the timeout above, and refused up front for a declared
      // body bigger than we are willing to download just to substring-match.
      const len = Number(res.headers.get('content-length') || 0)
      if (len > 2 * 1024 * 1024) {
        containsOk = false
        containsError = 'بدنهٔ پاسخ برای بررسی عبارت بیش از حد بزرگ بود.'
      } else {
        const text = await res.text()
        containsOk = text.includes(expectContains)
        if (!containsOk) containsError = 'پاسخ ۲۰۰ بود اما عبارت مورد انتظار در آن نبود.'
      }
    } else {
      // Nobody reads the body: release it instead of holding the connection.
      try { await res.body?.cancel() } catch { /* already consumed or null */ }
    }
    outcome = {
      ok: res.status === expectStatus && containsOk,
      status: res.status,
      ms,
      ...(containsError ? { error: containsError } : {}),
    }
  } catch (e) {
    outcome = {
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: e?.name === 'TimeoutError' ? 'پاسخی در مهلت ۱۰ ثانیه نرسید.' : (e?.message || 'درخواست ناموفق بود.'),
    }
  }
  return monitorsStore.monitors.recordResult(monitor, outcome)
}

/**
 * Check every pending monitor once, one after another.
 *
 * Sequential on purpose — the same choice sweep.js makes. These are our own
 * outbound requests against customers' sites and shared hosts; fanning the
 * whole fleet out at once is how a monitoring tick becomes the load spike it
 * was meant to detect. One monitor's storage failure must not stop the rest.
 */
export async function runMonitorChecks({ trigger = 'scheduled' } = {}) {
  const rows = await all(pendingSql())
  let checked = 0
  let failing = 0
  for (const m of rows) {
    try {
      const result = await checkMonitor(m)
      checked += 1
      if (!result.ok) failing += 1
    } catch (e) {
      console.error(`monitor ${m.id} (${m.label}) could not be checked:`, e?.message || e)
      failing += 1
    }
  }
  return { total: rows.length, checked, failing, trigger, at: Date.now() }
}

/**
 * Schedule the checks alongside the digest/intel/sweep schedulers in
 * index.js:start(). Interval from MONITOR_INTERVAL_MINUTES (default 5);
 * setting it to 0 turns the schedule off without touching the manual
 * «بررسی الان» path.
 */
export function scheduleMonitors() {
  const minutes = config.monitors.intervalMinutes
  if (!minutes || minutes <= 0) {
    console.log('Monitor checks: off (set MONITOR_INTERVAL_MINUTES > 0).')
    return
  }
  const tick = async () => {
    try {
      const r = await runMonitorChecks()
      if (r.total) {
        console.log(`Monitor checks: ${r.checked}/${r.total} recorded, ${r.failing} failing.`)
      }
    } catch (e) {
      console.error('Monitor checks failed:', e?.message || e)
    }
  }
  // First pass shortly after boot rather than at second zero: the server may
  // still be mid-migration, and an instant fleet-wide fan-out on every deploy
  // restart is not a reading anyone asked for.
  setTimeout(() => {
    tick()
    setInterval(tick, minutes * 60 * 1000)
  }, 15_000)
  console.log(`Monitor checks scheduled every ${minutes} min (HTTP GET only — no JS, no login).`)
}
