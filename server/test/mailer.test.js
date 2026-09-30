// Mailer routing: which transport answers, and what shape it answers in.
//
// The SMTP branch is exercised through the transport-factory seam, so the
// suite proves URL parsing, priority, and the response contract without
// importing nodemailer or speaking to any server. The HTTP branch uses a
// fetch stub. No real email is ever sent from this file.
import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../src/config.js'
import {
  sendMail,
  isMailerConfigured,
  _setSmtpTransportFactoryForTests,
} from '../src/mailer.js'

const realFetch = globalThis.fetch
const realAlerts = { ...config.alerts }

test.after(() => {
  globalThis.fetch = realFetch
  Object.assign(config.alerts, realAlerts)
  _setSmtpTransportFactoryForTests(null)
})

/** Install a fake SMTP transport; returns what it was called with. */
function fakeSmtp(sendMailImpl) {
  const seen = { options: null, mails: [] }
  _setSmtpTransportFactoryForTests((options) => {
    seen.options = options
    return { sendMail: async (mail) => seen.mails.push(mail) && (sendMailImpl ? sendMailImpl() : { response: '250 2.0.0 queued', messageId: '<t@site>' }) }
  })
  return seen
}

const MAIL = { to: 'dest@example.com', subject: 's', text: 't', html: '<p>t</p>' }

test('no transport configured: honest no_email_url, and isMailerConfigured() is false', async () => {
  config.alerts.emailServer = ''
  config.alerts.emailUrl = ''
  assert.equal(isMailerConfigured(), false)
  const r = await sendMail({ ...MAIL })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_email_url')
})

test('EMAIL_SERVER parses: smtps means implicit TLS/465, percent-encoded user and pass are decoded', async () => {
  config.alerts.emailServer = 'smtps://user%40example.com:p%40ss@smtp.example.com:465'
  config.alerts.emailUrl = ''
  assert.equal(isMailerConfigured(), true)
  const seen = fakeSmtp()

  const r = await sendMail({ ...MAIL })

  assert.deepEqual(Object.keys(seen.options.auth), ['user', 'pass'])
  assert.equal(seen.options.auth.user, 'user@example.com', '%40 in the username must decode to @')
  assert.equal(seen.options.auth.pass, 'p@ss')
  assert.equal(seen.options.host, 'smtp.example.com')
  assert.equal(seen.options.port, 465)
  assert.equal(seen.options.secure, true)

  assert.equal(r.ok, true)
  assert.equal(r.reason, 'accepted')
  assert.equal(r.status, 250, 'the leading SMTP code surfaces as status, like the HTTP branch')
  assert.equal(r.detail.messageId, '<t@site>')

  assert.equal(seen.mails.length, 1)
  assert.equal(seen.mails[0].to, 'dest@example.com')
  assert.equal(seen.mails[0].from, config.alerts.emailFrom, 'from defaults to EMAIL_FROM')
})

test('EMAIL_SERVER defaults: smtp means STARTTLS on 587, and a missing response code omits status', async () => {
  config.alerts.emailServer = 'smtp://plain@example.com@smtp.example.net'
  config.alerts.emailUrl = ''
  const seen = fakeSmtp(() => ({ messageId: '<x@y>' }))

  const r = await sendMail({ ...MAIL })

  assert.equal(seen.options.secure, false)
  assert.equal(seen.options.port, 587)
  assert.equal(r.ok, true)
  assert.equal('status' in r, false, 'no 2xx/4xx/5xx response line, no status field')
})

test('EMAIL_SERVER wins over EMAIL_URL when both are set', async () => {
  config.alerts.emailServer = 'smtps://u%40x.com:pw@smtp.example.com:465'
  config.alerts.emailUrl = 'http://provider.test/send'
  const seen = fakeSmtp()
  let httpCalls = 0
  globalThis.fetch = async () => { httpCalls++; return { ok: true, status: 200, json: async () => ({}) } }

  const r = await sendMail({ ...MAIL })

  assert.equal(r.ok, true)
  assert.equal(seen.mails.length, 1, 'SMTP carried the mail')
  assert.equal(httpCalls, 0, 'the HTTP provider must not also be called')
})

test('a send refused by the SMTP server is smtp_error', async () => {
  config.alerts.emailServer = 'smtps://u%40x.com:pw@smtp.example.com:465'
  config.alerts.emailUrl = ''
  fakeSmtp(() => { throw new Error('554 rejected') })

  const r = await sendMail({ ...MAIL })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'smtp_error')
  assert.equal(r.detail.message, '554 rejected')
})

test('a broken EMAIL_SERVER is smtp_misconfigured, and reports no credentials', async () => {
  config.alerts.emailUrl = ''
  for (const bad of ['not a url at all', 'http://secret%40user:pass123@wrong-scheme.example.com', 'ftp://also-wrong.example.com']) {
    config.alerts.emailServer = bad
    _setSmtpTransportFactoryForTests(() => { throw new Error('factory must not run: parse fails first') })
    const r = await sendMail({ ...MAIL })
    assert.equal(r.ok, false, bad)
    assert.equal(r.reason, 'smtp_misconfigured', bad)
    assert.ok(!JSON.stringify(r).includes('u%40x.com'), 'no userinfo in the failure detail')
  }
})

test('the HTTP branch is unchanged: provider response mapped onto the same contract', async () => {
  config.alerts.emailServer = ''
  config.alerts.emailUrl = 'http://provider.test/send'
  config.alerts.emailApiKey = 'test-key'
  let captured = null
  globalThis.fetch = async (url, opts) => {
    captured = { url: String(url), opts }
    return { ok: true, status: 202, json: async () => ({ accepted: true }) }
  }

  const r = await sendMail({ ...MAIL, from: 'custom@example.com' })

  assert.equal(r.ok, true)
  assert.equal(r.status, 202)
  assert.equal(r.reason, 'accepted')
  assert.deepEqual(r.detail, { accepted: true })
  assert.equal(captured.url, 'http://provider.test/send')
  assert.equal(captured.opts.headers.Authorization, 'Bearer test-key')
  assert.equal(JSON.parse(captured.opts.body).from, 'custom@example.com')
  config.alerts.emailApiKey = realAlerts.emailApiKey
})

test('the HTTP branch reports provider_error on a non-2xx', async () => {
  config.alerts.emailServer = ''
  config.alerts.emailUrl = 'http://provider.test/send'
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'down' }) })

  const r = await sendMail({ ...MAIL })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'provider_error')
  assert.equal(r.status, 503)
})

test('a missing recipient is refused before any transport is touched', async () => {
  config.alerts.emailServer = 'smtps://u%40x.com:pw@smtp.example.com:465'
  config.alerts.emailUrl = 'http://provider.test/send'
  const seen = fakeSmtp()
  let httpCalls = 0
  globalThis.fetch = async () => { httpCalls++; return { ok: true, status: 200, json: async () => ({}) } }

  const r = await sendMail({ subject: 's', text: 't' })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_recipient')
  assert.equal(seen.mails.length, 0)
  assert.equal(httpCalls, 0)
})
