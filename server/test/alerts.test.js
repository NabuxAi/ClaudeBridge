// Emergency dispatch.
//
// The requirement behind this file: when a site is compromised, the owner has
// to hear from us before they hear from a customer. That makes the fallback
// chain the feature, and these tests are the ways it could silently fail to be
// one — a missing API key counted as a delivery, a dead provider stopping the
// walk, a resolved finding waking someone at 3am.
import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatch, compose, isEmergency } from '../src/alerts/index.js'
import { t } from '../src/i18n.js'

/** A stand-in channel with a scripted outcome. */
const chan = (id, outcome) => ({
  id,
  send: async () => {
    if (outcome === 'ok') return { channel: id, ok: true }
    if (outcome === 'skip') return { channel: id, ok: false, skipped: true, error: 'not configured' }
    if (outcome === 'throw') throw new Error('boom')
    return { channel: id, ok: false, error: outcome }
  },
})

test('the first working channel wins and the rest are not tried', async () => {
  const calls = []
  const spy = (id, ok) => ({ id, send: async () => { calls.push(id); return { channel: id, ok } } })
  const r = await dispatch({ title: 't', body: 'b' }, { email: 'a@b.c' }, {
    channels: [spy('push', true), spy('sms', true)],
  })
  assert.equal(r.delivered, 'push')
  assert.deepEqual(calls, ['push'], 'a working first channel must not also send an SMS')
})

test('a failed channel falls through to the next', async () => {
  const r = await dispatch({ title: 't', body: 'b' }, {}, {
    channels: [chan('firebase', 'HTTP 500'), chan('najva', 'ok')],
  })
  assert.equal(r.delivered, 'najva')
  assert.equal(r.attempts.length, 2)
  assert.equal(r.allFailed, false)
})

test('an unconfigured channel is skipped, not counted as an attempt', async () => {
  // The distinction that matters operationally: a deployment missing an API
  // key and a night when every provider was down look identical unless skips
  // are recorded separately.
  const r = await dispatch({ title: 't', body: 'b' }, {}, {
    channels: [chan('firebase', 'skip'), chan('najva', 'skip')],
  })
  assert.equal(r.delivered, null)
  assert.equal(r.nothingConfigured, true, 'nothing was configured, so nothing failed')
  assert.equal(r.allFailed, false, 'calling this a failure hides the real problem')
  assert.equal(r.skipped.length, 2)
})

test('configured channels that all break is a different answer from none configured', async () => {
  const r = await dispatch({ title: 't', body: 'b' }, {}, {
    channels: [chan('sms', 'gateway down'), chan('email', 'HTTP 502')],
  })
  assert.equal(r.allFailed, true)
  assert.equal(r.nothingConfigured, false)
  assert.match(r.note, /None of the notification channels worked/)
  assert.equal(r.noteKey, 'alerts.notes.allFailed')
})

test('a skip in the middle does not stop the walk', async () => {
  // Otherwise one missing key silently disables every channel below it.
  const r = await dispatch({ title: 't', body: 'b' }, {}, {
    channels: [chan('firebase', 'skip'), chan('najva', 'down'), chan('sms', 'ok')],
  })
  assert.equal(r.delivered, 'sms')
})

test('stopOnFirstSuccess false reaches everyone', async () => {
  // For a confirmed compromise, waking someone twice is cheaper than waking
  // them not at all.
  const r = await dispatch({ title: 't', body: 'b' }, {}, {
    stopOnFirstSuccess: false,
    channels: [chan('firebase', 'ok'), chan('sms', 'ok'), chan('email', 'down')],
  })
  assert.equal(r.attempts.filter((a) => a.ok).length, 2)
})

test('a channel that throws does not take the dispatch down', async () => {
  // Caught this for real: without a per-channel guard, one provider throwing
  // meant sms and email were never tried — the exact moment the fallback
  // exists for.
  const r = await dispatch({ title: 't', body: 'b' }, {}, {
    channels: [chan('firebase', 'throw'), chan('sms', 'ok')],
  })
  assert.equal(r.delivered, 'sms')
  assert.equal(r.attempts[0].ok, false)
  assert.match(r.attempts[0].error, /boom/)
})

test('delivery is never described as the person having been notified', async () => {
  const r = await dispatch({ title: 't', body: 'b' }, {}, { channels: [chan('sms', 'ok')] })
  // An SMS gateway accepting a message is not the same as a phone showing it.
  // Stored English with its key, so any reader renders it in their language
  // without the caveat being lost.
  assert.match(r.note, /delivery and reading are not confirmed/)
  assert.doesNotMatch(r.note, /notified/i)
  assert.equal(r.noteKey, 'alerts.notes.accepted')
  assert.match(t('fa', r.noteKey), /تحویل و خوانده‌شدن آن تأیید نشده/)
})

test('only open, critical, security-relevant events wake anyone', () => {
  const base = { kind: 'malware', severity: 'critical', resolved_at: null }
  assert.equal(isEmergency(base), true)

  // A resolved finding is history, not an emergency.
  assert.equal(isEmergency({ ...base, resolved_at: Date.now() }), false)
  // Warnings are the ones that make people mute a channel.
  assert.equal(isEmergency({ ...base, severity: 'warning' }), false)
  // A policy change is worth logging, not worth a 3am SMS.
  assert.equal(isEmergency({ ...base, kind: 'policy' }), false)
  assert.equal(isEmergency({ ...base, kind: 'update' }), false)
  assert.equal(isEmergency(null), false)
})

test('core integrity and unreachability count as emergencies', () => {
  for (const kind of ['malware', 'core_integrity', 'down']) {
    assert.equal(isEmergency({ kind, severity: 'critical', resolved_at: null }), true, kind)
  }
})

test('the message names the site in every medium', () => {
  const m = compose(
    { kind: 'malware', severity: 'critical', title: 'فایل آلوده: wp-content/x.php' },
    { id: 's1', name: 'mystore.ir', title: 'فروشگاه من' }
  )
  assert.match(m.title, /فروشگاه من/)
  assert.match(m.body, /فروشگاه من/)
  // The SMS is what someone reads on a lock screen at 3am, so it has to say
  // which site without them opening anything.
  assert.match(m.smsBody, /فروشگاه من/)
  assert.ok(m.smsBody.length <= 160, `SMS line is ${m.smsBody.length} chars — that is several messages`)
  // The email is the only channel with room for the explanation.
  assert.ok(m.emailBody.length > m.smsBody.length)
})

test('the owner reads the alert in their own language, and push knows its direction', () => {
  const ev = { kind: 'down', severity: 'critical', title: 'Homepage unreachable' }
  const site = { id: 's1', name: 'shop.example' }
  const en = compose(ev, site)
  assert.equal(en.title, 'shop.example is not responding')
  assert.equal(en.lang, 'en')
  assert.equal(en.dir, 'ltr')
  const fa = compose(ev, site, 'fa')
  assert.equal(fa.title, 'shop.example پاسخ نمی‌دهد')
  assert.equal(fa.lang, 'fa')
  assert.equal(fa.dir, 'rtl')
  // An event stored with a key is re-rendered for the reader, not quoted in English.
  const keyed = compose({ kind: 'malware', severity: 'critical', title: 'Infected file found: x.php',
    detail: { i18n: { key: 'events.scan.infectedFile', vars: { file: 'x.php' } } } }, site, 'fa')
  assert.match(keyed.emailBody, /فایل آلوده پیدا شد: x\.php/)
})

test('an unknown event kind still produces a sendable message', () => {
  const m = compose({ kind: 'something-new', title: 'رویداد تازه' }, { id: 's1', name: 'x.ir' })
  assert.ok(m.title && m.body && m.smsBody && m.emailBody)
  assert.ok(m.smsBody.length <= 160)
})
