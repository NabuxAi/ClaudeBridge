// The forgot-password endpoint's honesty about email delivery, over real HTTP.
//
// The wire the route is mounted on matters here: the property under test is
// that `mailConfigured` is deployment state — identical for every address —
// while the message stays vague. Nothing is mocked except the user lookup,
// the token store, and the mail transports themselves (fetch stub / injected
// SMTP transport). No real email is sent.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { _reset } from '../src/security/ratelimit.js'
import { issue } from '../src/security/captcha.js'
import { config } from '../src/config.js'
import { _setSmtpTransportFactoryForTests } from '../src/mailer.js'

const { default: authRouter } = await import('../src/routes/auth.js')
const store = await import('../src/store.js')

const EXISTS = 'someone@example.com'
const RAW_TOKEN = 't'.repeat(64)

const realByEmailRaw = store.users.byEmailRaw
const realCreate = store.passwordResets.create
const realFetch = globalThis.fetch
const realWarn = console.warn
const realAlerts = { ...config.alerts }

store.users.byEmailRaw = async (email) =>
  String(email).toLowerCase() === EXISTS ? { id: 'u_1', email: EXISTS } : null
store.passwordResets.create = async () => ({ raw: RAW_TOKEN })

let httpCalls = []
let smtpMails = []
let warns = []

function useHttpMailer(impl) {
  config.alerts.emailServer = ''
  config.alerts.emailUrl = 'http://provider.test/send'
  httpCalls = []
  globalThis.fetch = async (url, opts) => {
    httpCalls.push({ url: String(url), body: JSON.parse(opts.body) })
    return impl ? impl() : { ok: true, status: 202, json: async () => ({ accepted: true }) }
  }
}

function useSmtpMailer() {
  config.alerts.emailServer = 'smtps://user%40example.com:pw@smtp.example.com:465'
  config.alerts.emailUrl = ''
  smtpMails = []
  _setSmtpTransportFactoryForTests(() => ({
    sendMail: async (mail) => { smtpMails.push(mail); return { response: '250 queued', messageId: '<t@s>' } },
  }))
}

function useNoMailer() {
  config.alerts.emailServer = ''
  config.alerts.emailUrl = ''
  httpCalls = []
  globalThis.fetch = async () => { throw new Error('must not be called: no mailer is configured') }
}

const app = express()
app.use(express.json())
app.use('/v1', authRouter)
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}/v1`

console.warn = (...args) => warns.push(args.join(' '))

test.after(async () => {
  store.users.byEmailRaw = realByEmailRaw
  store.passwordResets.create = realCreate
  globalThis.fetch = realFetch
  console.warn = realWarn
  Object.assign(config.alerts, realAlerts)
  _setSmtpTransportFactoryForTests(null)
  server.close()
})

/** Solve a challenge the way the browser does (Persian digits and all). */
function solved() {
  const c = issue()
  const fa = '۰۱۲۳۴۵۶۷۸۹'
  const ascii = c.question.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)))
  const [, a, op, b] = ascii.match(/(-?\d+)\s*([+×−])\s*(-?\d+)/)
  const answer = op === '+' ? Number(a) + Number(b) : op === '−' ? Number(a) - Number(b) : Number(a) * Number(b)
  return { captchaId: c.id, captchaAnswer: answer }
}

async function forgot(email) {
  _reset()
  // Our own request must ride the real fetch: the stub below exists to catch
  // the server's outbound mail delivery, and would otherwise answer (or throw
  // for) this very call.
  const res = await realFetch(base + '/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...solved() }),
  })
  return { status: res.status, body: await res.json() }
}

test('with no mailer configured: mailConfigured:false, an honest message, and nothing sent', async () => {
  useNoMailer()
  const { status, body } = await forgot(EXISTS)
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.mailConfigured, false)
  assert.ok(!body.message.includes('ارسال شده است'), 'must not claim a link was sent when no transport exists')
  assert.ok(body.message.includes('پیکربندی نشده'), 'must say plainly that email is not configured here')
  assert.equal(httpCalls.length, 0)
})

test('with no mailer configured: the response is byte-identical for a missing address', async () => {
  useNoMailer()
  const a = await forgot(EXISTS)
  const b = await forgot('nobody@example.com')
  assert.equal(a.status, b.status)
  assert.deepEqual(a.body, b.body,
    'a different response for a missing account enumerates the customer list')
})

test('with EMAIL_URL configured: mailConfigured:true, vague message, link delivered', async () => {
  useHttpMailer()
  const { status, body } = await forgot(EXISTS)
  assert.equal(status, 200)
  assert.equal(body.mailConfigured, true)
  assert.equal(body.message, 'اگر این ایمیل در سیستم وجود داشته باشد، لینک بازنشانی ارسال شده است.')
  assert.equal(httpCalls.length, 1)
  assert.equal(httpCalls[0].body.to, EXISTS)
  assert.ok(httpCalls[0].body.text.includes(`/reset?token=${RAW_TOKEN}`), 'the single-use token reaches the mail')
})

test('with EMAIL_URL configured: the response is byte-identical for a missing address', async () => {
  useHttpMailer()
  const a = await forgot(EXISTS)
  const b = await forgot('nobody@example.com')
  assert.equal(a.status, b.status)
  assert.deepEqual(a.body, b.body)
  assert.equal(b.body.mailConfigured, true, 'configured state is global, not per-address')
})

test('with EMAIL_SERVER configured: the reset link goes out over SMTP', async () => {
  useSmtpMailer()
  const { status, body } = await forgot(EXISTS)
  assert.equal(status, 200)
  assert.equal(body.mailConfigured, true)
  assert.equal(smtpMails.length, 1)
  assert.equal(smtpMails[0].to, EXISTS)
  assert.ok(smtpMails[0].text.includes(`/reset?token=${RAW_TOKEN}`))
})

test('a failed delivery stays out of the response and reaches the operator log instead', async () => {
  useHttpMailer(() => ({ ok: false, status: 503, json: async () => ({ error: 'down' }) }))
  warns = []
  const a = await forgot(EXISTS)
  const b = await forgot('nobody@example.com')

  // The client-visible outcome does not budge: saying "delivery failed" for
  // one address and not the other would be an account-existence oracle.
  assert.equal(a.status, 200)
  assert.deepEqual(a.body, b.body)
  assert.equal(a.body.mailConfigured, true)

  assert.equal(warns.length, 1)
  assert.ok(warns[0].includes('provider_error'), 'the log carries the reason')
  assert.ok(warns[0].includes('503'), 'the log carries the status')
  assert.ok(!warns[0].includes(EXISTS), 'the log must not echo the address')
})

test('the captcha gate still comes first', async () => {
  useNoMailer()
  _reset()
  // Real fetch for the same reason as in forgot(): the no-mailer stub must
  // only fire if the server itself attempts a delivery.
  const res = await realFetch(base + '/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EXISTS }),
  })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).captchaRequired, true)
})
