// The sweep runs at 06:00 and the digest goes out at 08:00, and nothing
// connected them. Its proposals reach the digest, but only when there are any —
// so a sweep that ran and found every site healthy produced exactly the same
// digest as a sweep that never started, or one that died on its first site.
// Silence meant two opposite things.
//
// These pin the distinctions that section exists to make. Each one is a pair of
// states that used to render identically.
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { renderSweep } = await import('../src/digest.js')

const HOUR = 3_600_000
const NOW = 1_800_000_000_000

const run = (over = {}) => ({
  finished_at: NOW - HOUR,
  sites: 4,
  skipped: 0,
  failed: 0,
  degraded: 0,
  proposed: 0,
  performed: 0,
  trigger: 'scheduled',
  ...over,
})

test('a quiet successful sweep still says it happened', () => {
  // The whole point. Without this line, "checked everything, all fine" and
  // "never ran" are the same empty space in the message.
  const out = renderSweep(run(), NOW, true)

  assert.match(out, /بررسی خودکار/)
  assert.match(out, /4 سایت/)
  assert.match(out, /چیزی برای انجام نبود/)
})

test('a sweep that found work does not claim there was none', () => {
  const out = renderSweep(run({ proposed: 2, performed: 1 }), NOW, true)

  assert.match(out, /2 پیشنهاد/)
  assert.match(out, /1 اقدام/)
  assert.doesNotMatch(out, /چیزی برای انجام نبود/)
})

test('a run with no model is not reported as a clean bill of health', () => {
  // It proposed nothing because it could not think, not because the sites are
  // fine. Collapsing the two is how a broken gateway reads as a healthy fleet.
  const out = renderSweep(run({ degraded: 4 }), NOW, true)

  assert.match(out, /بدون مدل/)
  assert.doesNotMatch(out, /چیزی برای انجام نبود/)
})

test('failures are named rather than folded into the site count', () => {
  const out = renderSweep(run({ sites: 4, failed: 3 }), NOW, true)

  assert.match(out, /3 ناموفق/)
  assert.doesNotMatch(out, /چیزی برای انجام نبود/)
})

test('what the cap left out is stated, not silently dropped', () => {
  // A sweep that stops at the cap reads as one that covered the whole fleet.
  const out = renderSweep(run({ sites: 25, skipped: 7 }), NOW, true)

  assert.match(out, /7 خارج از سقف/)
})

test('a missed run is reported as missed', () => {
  // The scheduler ticks every four minutes, so a gap beyond a day and a half is
  // a run that did not happen — not a rounding artefact.
  const out = renderSweep(run({ finished_at: NOW - 40 * HOUR }), NOW, true)

  assert.match(out, /40 ساعت پیش/)
  assert.match(out, /اجرا نشده/)
})

test('a sweep from yesterday morning is not called stale', () => {
  // Digest at 08:00, sweep at 06:00 the previous day is 26 hours. Calling that
  // a missed run would fire the warning every single day, which is how a
  // warning stops being read.
  const out = renderSweep(run({ finished_at: NOW - 26 * HOUR }), NOW, true)

  assert.doesNotMatch(out, /اجرا نشده/)
  assert.match(out, /4 سایت/)
})

test('switched on and never run is said out loud', () => {
  // The setting is a promise the deployment has not kept, and nothing else
  // would reveal it.
  const out = renderSweep(null, NOW, true)

  assert.match(out, /روشن است/)
  assert.match(out, /اجرا نشده/)
})

test('the section is absent entirely when the sweep is off', () => {
  // A deployment that has not asked for this should not carry a daily line
  // about a feature it does not use.
  assert.equal(renderSweep(null, NOW, false), '')
  assert.equal(renderSweep(run(), NOW, false), '')
})
