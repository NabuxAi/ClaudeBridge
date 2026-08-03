// The pairing flow through the front door, end to end.
//
// PROJECT_PROGRESS has carried the line "the normal pairing flow through the
// panel was not exercised" since 2 August. The live demo site was paired by
// writing the same secret into both sides by hand, which proves the connector
// signs correctly and proves nothing about the path an actual owner walks:
// sign up, add a site, copy what that screen shows, paste it into the plugin.
//
// Every step here goes over real HTTP against the app as it is mounted, with a
// real PostgreSQL. The only stand-in is the WordPress itself.
//
// The captcha is solved rather than disabled. A walkthrough that turns off a
// defence to get past it has proved that the door opens when unlocked, which is
// not the question.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'

const dsn = process.env.CB_TEST_DATABASE_URL

if (!dsn) {
  test('pairing flow (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  // Its own PostgreSQL schema. The runner executes test files in parallel and
  // every database-touching file here creates the same table names.
  const TEST_SCHEMA = 'test_pairing'
  process.env.DATABASE_URL =
    dsn + (dsn.includes('?') ? '&' : '?') +
    'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)
  process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
  process.env.LIVE = '1'

  const { pool, query } = await import('../src/db.js')
  await query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`)

  const { init } = await import('../src/db.js')
  await init()

  // `createApp`, not the default export. Importing the module for its app also
  // connected to the database, bound the configured port and started three
  // daily schedulers — which is why this path had never been tested. The
  // factory mounts the same routers in the same order and starts nothing.
  const { createApp } = await import('../src/index.js')
  const app = createApp()

  // A stub WordPress. It answers the connector's signed calls the way the
  // plugin does, so the relay's own signing and response handling run.
  const wp = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (req.url.includes('/ping')) return res.end(JSON.stringify({ ok: true, pong: true }))
      res.end(JSON.stringify({
        result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, wp_version: '6.7.1' }) }] },
      }))
    })
  })
  await new Promise((r) => wp.listen(0, r))
  const wpUrl = `http://127.0.0.1:${wp.address().port}`

  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const API = `http://127.0.0.1:${server.address().port}/v1`

  const send = async (path, opts = {}) => {
    const res = await fetch(API + path, opts)
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 200) } }
    return { status: res.status, body }
  }

  const FA = '۰۱۲۳۴۵۶۷۸۹'
  const solveCaptcha = async () => {
    const { body } = await send('/auth/captcha')
    const ascii = body.question.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    const [, x, op, y] = /(\d+)\s*([+−×])\s*(\d+)/.exec(ascii)
    const answer = op === '+' ? +x + +y : op === '−' ? +x - +y : +x * +y
    return { captchaId: body.id, captchaAnswer: String(answer) }
  }

  /** Sign a body exactly as wp-claude-bridge.php does. */
  const signAs = (secret, body) => {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    return {
      'content-type': 'application/json',
      'X-DigiWP-Timestamp': timestamp,
      'X-DigiWP-Signature': crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}\n${body}`)
        .digest('hex'),
      'X-DigiWP-Site': 'wp-site-under-test',
    }
  }

  const owner = async () => {
    const email = `pair-${crypto.randomUUID()}@test.local`
    const { status, body } = await send('/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email, password: 'a-strong-password-123', name: 'Pair Test',
        ...(await solveCaptcha()),
      }),
    })
    assert.equal(status, 201, `registration failed: ${JSON.stringify(body)}`)
    return { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' }
  }

  const addSite = async (auth, name) =>
    send('/sites', {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name, title: 'Pair Test Site' }),
    })

  test('an owner can pair a site and immediately drive it', async () => {
    const auth = await owner()

    const created = await addSite(auth, `pairtest-${Date.now()}`)
    assert.equal(created.status, 201)
    // Shown exactly once. If this ever stops appearing there is no way to
    // complete a pairing at all, and the failure is silent from here.
    assert.ok(created.body.pairing?.secret, 'the secret must be shown on creation')
    assert.ok(created.body.pairing?.siteKey)

    const before = await send(`/sites/${created.body.id}/pairing`, { headers: auth })
    assert.equal(before.body.paired, false)

    // Now be the plugin.
    const body = JSON.stringify({ site_url: wpUrl, name: 'Pair Test Site', version: '3.7.4' })
    const reg = await send('/connector/register', {
      method: 'POST', headers: signAs(created.body.pairing.secret, body), body,
    })
    assert.equal(reg.status, 200, JSON.stringify(reg.body))
    assert.equal(reg.body.ok, true)

    const after = await send(`/sites/${created.body.id}/pairing`, { headers: auth })
    assert.equal(after.body.paired, true, 'the panel must see the site as paired')

    // And the point of pairing: a signed command now reaches the site.
    const acted = await send(`/sites/${created.body.id}/actions`, {
      method: 'POST', headers: auth, body: JSON.stringify({ tool: 'site_info', args: {} }),
    })
    assert.equal(acted.status, 200)
    assert.equal(acted.body.relayed, true, 'the call must actually be relayed, not simulated')
  })

  test('a wrong secret pairs nothing', async () => {
    const auth = await owner()
    const created = await addSite(auth, `wrongsecret-${Date.now()}`)

    const body = JSON.stringify({ site_url: wpUrl, name: 'Impostor', version: '3.7.4' })
    const reg = await send('/connector/register', {
      method: 'POST', headers: signAs('not-the-secret', body), body,
    })

    assert.equal(reg.status, 401)
    // The registration endpoint is unauthenticated by necessity — it does not
    // know which site is calling until a secret validates. So the signature is
    // the only thing standing between a stranger and pointing somebody's site
    // record at a server they control.
    const after = await send(`/sites/${created.body.id}/pairing`, { headers: auth })
    assert.equal(after.body.paired, false)
  })

  test('a stale timestamp is refused even with a correct signature', async () => {
    const auth = await owner()
    const created = await addSite(auth, `replay-${Date.now()}`)

    const body = JSON.stringify({ site_url: wpUrl, name: 'Replay', version: '3.7.4' })
    const old = (Math.floor(Date.now() / 1000) - 3600).toString()
    const reg = await send('/connector/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-DigiWP-Timestamp': old,
        'X-DigiWP-Signature': crypto
          .createHmac('sha256', created.body.pairing.secret)
          .update(`${old}\n${body}`)
          .digest('hex'),
        'X-DigiWP-Site': 'replayer',
      },
      body,
    })

    // A captured registration replayed later must not re-point a site.
    assert.equal(reg.status, 401)
  })

  test('one site cannot be paired with another site\'s secret', async () => {
    const auth = await owner()
    const a = await addSite(auth, `tenant-a-${Date.now()}`)
    const b = await addSite(auth, `tenant-b-${Date.now()}`)

    // Signed with A's secret. The endpoint identifies the caller *by* whichever
    // secret validates, so this legitimately pairs A — the assertion that
    // matters is that it does not touch B.
    const body = JSON.stringify({ site_url: wpUrl, name: 'A', version: '3.7.4' })
    const reg = await send('/connector/register', {
      method: 'POST', headers: signAs(a.body.pairing.secret, body), body,
    })
    assert.equal(reg.status, 200)
    assert.equal(reg.body.site.id, a.body.id)

    const bAfter = await send(`/sites/${b.body.id}/pairing`, { headers: auth })
    assert.equal(bAfter.body.paired, false)
  })

  test.after(async () => {
    server.close()
    wp.close()
    await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
    await pool.end()
  })
}
