// The event log's rules, tested without a database.
//
// events.js talks to Postgres, so what is exercised here is the logic those
// queries encode — stated as pure functions over the same shapes. The point is
// not coverage of the driver; it is that the two decisions which make the log
// trustworthy stay true: a persisting problem is one alert, and an alert only
// closes because a later measurement disagreed with the earlier one.
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The fingerprint rule, as record() applies it: an open row with the same
 * fingerprint is updated in place and keeps its original created_at.
 */
function upsert(rows, ev) {
  const open = rows.find((r) => r.fingerprint && r.fingerprint === ev.fingerprint && !r.resolved_at)
  if (open) {
    open.title = ev.title
    open.severity = ev.severity
    return rows
  }
  rows.push({ ...ev, resolved_at: null })
  return rows
}

/** What recordScanEvents does after a scan: close anything this scan no longer sees. */
function closeUnseen(rows, seen, now = 1000) {
  for (const r of rows) {
    if (r.resolved_at || !r.fingerprint) continue
    if (!r.fingerprint.startsWith('scan:file:') && r.fingerprint !== 'scan:robots') continue
    if (!seen.has(r.fingerprint)) r.resolved_at = now
  }
  return rows
}

test('a problem that persists across scans stays one alert', () => {
  let rows = []
  const finding = {
    fingerprint: 'scan:file:wp-content/x.php', kind: 'malware', severity: 'critical',
    title: 'فایل آلوده پیدا شد: wp-content/x.php', created_at: 100,
  }
  // Four nightly scans, same shell still there.
  for (let night = 0; night < 4; night++) upsert(rows, { ...finding, created_at: 100 + night })

  assert.equal(rows.length, 1, 'four scans of one problem is one alert, not four')
  assert.equal(rows[0].created_at, 100, 'first-seen time is kept — when it started matters')
})

test('a clean scan closes what it no longer sees, and only that', () => {
  const rows = [
    { fingerprint: 'scan:file:a.php', resolved_at: null, created_at: 1 },
    { fingerprint: 'scan:file:b.php', resolved_at: null, created_at: 1 },
    { fingerprint: 'scan:robots', resolved_at: null, created_at: 1 },
    // Not a scan finding. A scan must not be able to close it.
    { fingerprint: 'update:failed:woocommerce', resolved_at: null, created_at: 1 },
    { fingerprint: null, resolved_at: null, created_at: 1 },
  ]
  closeUnseen(rows, new Set(['scan:file:b.php']))

  assert.ok(rows[0].resolved_at, 'a.php is gone, so its alert closes')
  assert.equal(rows[1].resolved_at, null, 'b.php is still there, so it stays open')
  assert.ok(rows[2].resolved_at, 'robots is clean again')
  assert.equal(rows[3].resolved_at, null, 'a malware scan cannot close a failed update')
  assert.equal(rows[4].resolved_at, null, 'events with no fingerprint are never auto-closed')
})

test('a dismissed alert reopens if the next scan still finds it', () => {
  const rows = []
  const ev = { fingerprint: 'scan:file:x.php', title: 'فایل آلوده', severity: 'critical', created_at: 1 }
  upsert(rows, ev)

  // Someone clicks "ignore". That closes our record; it does not clean the site.
  rows[0].resolved_at = 500

  // Tonight's scan sees it again. Because the open row is gone, a new one is
  // inserted rather than the closed one being silently reused — which is what
  // makes dismissal an admission rather than a way to hide a live infection.
  upsert(rows, { ...ev, created_at: 900 })

  assert.equal(rows.length, 2)
  assert.equal(rows[1].resolved_at, null, 'the problem is open again')
})

test('an update that succeeds closes the failure alert for that same item', () => {
  // The rule from routes/connector.js: resolve by prefix, per item name, so a
  // plugin that finally updates stops nagging — and only that plugin does.
  const rows = [
    { fingerprint: 'update:failed:woocommerce', resolved_at: null },
    { fingerprint: 'update:failed:elementor', resolved_at: null },
  ]
  const succeeded = 'woocommerce'
  for (const r of rows) {
    if (!r.resolved_at && r.fingerprint.startsWith(`update:failed:${succeeded}`)) r.resolved_at = 1
  }
  assert.ok(rows[0].resolved_at)
  assert.equal(rows[1].resolved_at, null, 'elementor still fails, so its alert stands')
})
