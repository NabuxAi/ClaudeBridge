// Whether a site owner can be reached at all.
//
// Emergency dispatch skips an unconfigured channel rather than failing it,
// which is right — but it also means a deployment with none of them configured
// never tells an owner their site is compromised, and looks entirely healthy
// doing it: the operator still gets the ops message, so nothing seems wrong
// from the inside either. This deployment is that deployment. Every account has
// an email address and EMAIL_URL is unset.
//
// The status is reported once at startup so the state is a choice rather than
// something discovered after an incident.
import test from 'node:test'
import assert from 'node:assert/strict'

import { config } from '../src/config.js'
import { alertChannelStatus } from '../src/alerts/index.js'

const snapshot = JSON.parse(JSON.stringify({ alerts: config.alerts, telegram: config.telegram }))

test.afterEach(() => {
  Object.assign(config.alerts, snapshot.alerts)
  Object.assign(config.telegram, snapshot.telegram)
})

const clearAll = () => {
  config.alerts.fcmServerKey = ''
  config.alerts.najvaApiKey = ''
  config.alerts.smsUrl = ''
  config.alerts.smsApiKey = ''
  config.alerts.emailUrl = ''
}

test('nothing configured is reported as nothing, and names what to set', () => {
  clearAll()
  const s = alertChannelStatus()
  assert.deepEqual(s.live, [])
  // The point is actionability: an operator should not have to read the source
  // to learn which variable turns this on.
  assert.ok(s.missing.some((m) => m.includes('EMAIL_URL')))
  assert.ok(s.missing.some((m) => m.includes('FCM_SERVER_KEY')))
  assert.ok(s.missing.some((m) => m.includes('SMS_URL')))
  assert.ok(s.missing.some((m) => m.includes('NAJVA_API_KEY')))
})

test('a configured channel moves from missing to live', () => {
  clearAll()
  config.alerts.emailUrl = 'https://mail.example/send'
  const s = alertChannelStatus()
  assert.ok(s.live.includes('email'))
  assert.ok(!s.missing.some((m) => m.startsWith('email')))
})

test('SMS needs both halves before it counts as live', () => {
  // A URL with no key is not a working channel, and reporting it as one would
  // be worse than reporting nothing.
  clearAll()
  config.alerts.smsUrl = 'https://sms.example/send'
  assert.ok(!alertChannelStatus().live.includes('sms'))

  config.alerts.smsApiKey = 'k'
  assert.ok(alertChannelStatus().live.includes('sms'))
})

test('the operator channel is reported separately from the owner channels', () => {
  // They answer different questions. "We will find out" is not "the customer
  // will find out", and conflating them is how an owner learns from a visitor.
  clearAll()
  config.telegram.token = 't'
  config.telegram.chatId = 'c'
  const s = alertChannelStatus()
  assert.equal(s.ops, true)
  assert.deepEqual(s.live, [], 'the ops channel must not count as an owner channel')
})
