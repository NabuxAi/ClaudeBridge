// The approval round trip, over real HTTP.
//
// The assistant proposes a tool it may not run itself; the panel shows it; the
// owner clicks approve; the same tool and the same arguments are relayed to the
// site. That chain crosses the assistant, the authority policy, the route and
// the connector, and each piece is fine on its own — this covers the seam, which
// is where "the button does nothing" lives.
//
// Nothing is mocked except the site lookup and the connector, because the point
// is to exercise the route exactly as it is mounted.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

import { config } from '../src/config.js'
import { SENSITIVE_TOOLS } from '../src/authority.js'

const store = await import('../src/store.js')
const { default: sitesRouter } = await import('../src/routes/sites.js')

const SITE = {
  id: 'site-1',
  user_id: 'u_1',
  name: 'example.test',
  url: 'https://example.test',
  secret: 's3cr3t',
  site_key: 'k',
  paired: true,
  authority: 'confirm',
}

let relayed = []

const real = {
  rawForUser: store.sites.rawForUser,
  fetch: globalThis.fetch,
  live: config.live,
}

function stub() {
  store.sites.rawForUser = async () => ({ ...SITE })
  config.live = true

  // The connector is a module function and cannot be reassigned, so the stub
  // sits one level lower: it answers the HTTP call the connector makes. That
  // also means the connector's real signing and response handling run, rather
  // than a stand-in for them.
  globalThis.fetch = async (url, opts) => {
    const target = String(url)
    if (target.startsWith('https://example.test')) {
      const body = JSON.parse(opts.body)
      relayed.push({ name: body.params.name, args: body.params.arguments })
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { content: [{ text: '{"ok":true}' }] } }),
      }
    }
    return real.fetch(url, opts)
  }
}

function restore() {
  store.sites.rawForUser = real.rawForUser
  globalThis.fetch = real.fetch
  config.live = real.live
}

let server
let base

test.before(async () => {
  stub()
  const app = express()
  app.use(express.json())
  // The router reads req.user; the real stack sets it in auth middleware.
  app.use((req, _res, next) => {
    req.user = { sub: 'u_1' }
    next()
  })
  app.use('/v1', sitesRouter)
  server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}/v1`
})

test.after(() => {
  restore()
  server?.close()
})

test.beforeEach(() => {
  relayed = []
})

const act = (body) =>
  fetch(`${base}/sites/site-1/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

test('a sensitive tool without approval is held, not run', async () => {
  const res = await act({ tool: 'db_query', args: { sql: 'SELECT 1' } })
  const body = await res.json()

  assert.equal(res.status, 202)
  assert.equal(body.requiresApproval, true)
  assert.equal(relayed.length, 0, 'a sensitive tool ran without approval')
})

test('the same tool with approval is relayed, arguments intact', async () => {
  const args = { sql: 'SELECT 1', limit: 10 }
  const res = await act({ tool: 'db_query', args, approved: true })
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.ok, true)
  assert.equal(relayed.length, 1)
  assert.equal(relayed[0].name, 'db_query')
  // The arguments must survive the round trip: approving a proposal has to run
  // the proposal, not a version of it the panel retyped.
  assert.deepEqual(relayed[0].args, args)
})

test('a non-sensitive tool needs no approval', async () => {
  const res = await act({ tool: 'flush_cache', args: {} })

  assert.equal(res.status, 200)
  assert.equal(relayed[0]?.name, 'flush_cache')
})

test('every tool the policy calls sensitive is held by the route', async () => {
  // The route and the assistant share one list; this proves the route honours
  // all of it rather than a subset someone typed out again.
  for (const tool of SENSITIVE_TOOLS) {
    relayed = []
    const res = await act({ tool, args: {} })
    assert.equal(res.status, 202, `${tool} was not held for approval`)
    assert.equal(relayed.length, 0, `${tool} reached the site unapproved`)
  }
})

test('a request naming no tool is refused', async () => {
  const res = await act({ args: {} })
  assert.equal(res.status, 400)
})

test('the legacy `action` field still works', async () => {
  // The panel sends `action`; the assistant's proposals speak `tool`. Both have
  // to keep working or one of the two callers breaks silently.
  const res = await act({ action: 'flush_cache' })

  assert.equal(res.status, 200)
  assert.equal(relayed[0]?.name, 'flush_cache')
})
