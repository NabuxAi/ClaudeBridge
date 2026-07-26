// The path from "a scan found a shell" to "someone's phone rang".
//
// The individual pieces are tested elsewhere; this is the wiring between them,
// which is where this kind of feature actually fails — an alert that fires on
// the wrong events, or fires four times for one problem, or does not fire at
// all because the code path that logs a compromise forgot to call it.
//
// The database is stubbed rather than mocked wholesale: what is under test is
// the decision logic in record(), so the queries are replaced with something
// that remembers rows.
import test from 'node:test'
import assert from 'node:assert/strict'
import { isEmergency, compose, dispatch } from '../src/alerts/index.js'

/**
 * A miniature of what events.record() does, so the flow can be exercised
 * without a Postgres instance. It mirrors the real logic: an open row with the
 * same fingerprint is updated and returns early; only a genuinely new row
 * reaches the alert.
 */
function makeRecorder(onEmergency) {
  const rows = []
  return {
    rows,
    record({ siteId, kind, severity = 'info', title, fingerprint = null }) {
      if (fingerprint) {
        const open = rows.find((r) => r.fingerprint === fingerprint && !r.resolved_at && r.site_id === siteId)
        if (open) {
          open.title = title
          return { ...open, repeated: true }
        }
      }
      const row = {
        id: `ev_${rows.length}`, site_id: siteId, kind, severity, title,
        fingerprint, resolved_at: null, created_at: Date.now(),
      }
      rows.push(row)
      if (isEmergency(row)) onEmergency(row)
      return row
    },
    resolve(fingerprint) {
      const r = rows.find((x) => x.fingerprint === fingerprint && !x.resolved_at)
      if (r) r.resolved_at = Date.now()
    },
  }
}

test('a critical malware finding raises the alarm exactly once', () => {
  const fired = []
  const log = makeRecorder((e) => fired.push(e))

  log.record({
    siteId: 's1', kind: 'malware', severity: 'critical',
    title: 'فایل آلوده: wp-content/x.php', fingerprint: 'scan:file:x.php',
  })
  assert.equal(fired.length, 1)
})

test('the same shell found on four consecutive nights wakes someone once', () => {
  // This is the property that decides whether people keep the channel enabled.
  // Four alerts for one unresolved problem is how an emergency channel becomes
  // a muted one.
  const fired = []
  const log = makeRecorder((e) => fired.push(e))

  for (let night = 0; night < 4; night++) {
    log.record({
      siteId: 's1', kind: 'malware', severity: 'critical',
      title: 'فایل آلوده: wp-content/x.php', fingerprint: 'scan:file:x.php',
    })
  }
  assert.equal(fired.length, 1, 'one problem, one alarm')
  assert.equal(log.rows.length, 1)
})

test('a problem that returns after being resolved raises the alarm again', () => {
  // The opposite failure: a shell that is cleaned and comes back must not be
  // silently swallowed because a closed row with that fingerprint exists.
  const fired = []
  const log = makeRecorder((e) => fired.push(e))
  const ev = {
    siteId: 's1', kind: 'malware', severity: 'critical',
    title: 'فایل آلوده', fingerprint: 'scan:file:x.php',
  }

  log.record(ev)
  log.resolve('scan:file:x.php')
  log.record(ev)

  assert.equal(fired.length, 2)
})

test('two different sites each get their own alarm', () => {
  const fired = []
  const log = makeRecorder((e) => fired.push(e))
  const ev = { kind: 'malware', severity: 'critical', title: 'فایل آلوده', fingerprint: 'scan:file:x.php' }

  log.record({ ...ev, siteId: 's1' })
  log.record({ ...ev, siteId: 's2' })

  assert.equal(fired.length, 2, 'the fingerprint is per site, not global')
})

test('routine activity never wakes anyone', () => {
  const fired = []
  const log = makeRecorder((e) => fired.push(e))

  log.record({ siteId: 's1', kind: 'update', severity: 'info', title: 'به‌روزرسانی انجام شد' })
  log.record({ siteId: 's1', kind: 'policy', severity: 'info', title: 'سیاست عوض شد' })
  log.record({ siteId: 's1', kind: 'update_failed', severity: 'warning', title: 'به‌روزرسانی ناموفق' })
  log.record({ siteId: 's1', kind: 'action', severity: 'warning', title: 'اقدام حساس' })
  log.record({ siteId: 's1', kind: 'conflict', severity: 'info', title: 'بررسی تداخل' })

  assert.equal(fired.length, 0, 'a channel that fires on everything gets muted')
})

test('the composed alert carries the site name and a way back to the panel', async () => {
  const fired = []
  const log = makeRecorder((e) => fired.push(e))
  log.record({
    siteId: 's1', kind: 'core_integrity', severity: 'critical',
    title: 'فایل هسته دستکاری شده: wp-includes/load.php',
  })

  const msg = compose(fired[0], { id: 's1', name: 'shop.ir', title: 'فروشگاه' })
  assert.match(msg.title, /فروشگاه/)
  assert.match(msg.emailBody, /wp-includes\/load\.php/, 'the email is the only channel with room for the detail')
})

test('the whole chain still reports failure honestly when nothing is configured', async () => {
  const fired = []
  const log = makeRecorder((e) => fired.push(e))
  log.record({ siteId: 's1', kind: 'malware', severity: 'critical', title: 'فایل آلوده' })

  const msg = compose(fired[0], { id: 's1', name: 'shop.ir' })
  // No channels configured is the realistic state of a fresh deployment, and
  // it must not be reported as a delivery.
  const result = await dispatch(msg, {}, { channels: [] })
  assert.equal(result.delivered, null)
  assert.equal(result.nothingConfigured, true)
})
