// Reachability: both DigiWP servers (international and Iran) look at a site
// when it is added, and the answer decides the road this server takes.
// The discovery on each side is injected; no test touches a real network.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.AUTH_SECRET = 'a-test-secret-of-more-than-32-characters'
// Before any import: config.js reads DATABASE_URL once, when first loaded.
const dsn = process.env.CB_TEST_DATABASE_URL
const TEST_SCHEMA = 'test_reachability'
if (dsn) process.env.DATABASE_URL = dsn + (dsn.includes('?') ? '&' : '?') + 'options=' + encodeURIComponent(`-c search_path=${TEST_SCHEMA}`)

const { checkReach, recalled, _reset } = await import('../src/reachability.js')
const { httpError } = await import('../src/i18n.js')

const found = (siteUrl) => async () => ({ siteUrl, hostname: new URL(siteUrl).hostname, kind: 'domain', path: '/', connectorDetected: true })
const notFound = (key = 'sites.discoveryTimeout') => async () => { throw httpError(422, key) }

test.beforeEach(() => _reset())

test('seen from here: direct road, international listed before Iran', async () => {
  const { result, reach } = await checkReach('https://shop.example.com', {
    region: 'ir', peerConfigured: true,
    discover: found('https://shop.example.com'),
    viaPeer: async () => ({ ok: false, key: 'sites.discoveryTimeout' }),
  })
  assert.equal(result.siteUrl, 'https://shop.example.com')
  assert.equal(reach.route, 'direct')
  assert.deepEqual(reach.servers.map((s) => [s.region, s.self, s.ok]), [['intl', false, false], ['ir', true, true]])
  assert.equal(reach.servers[0].reason, 'sites.discoveryTimeout')
  assert.deepEqual(recalled('https://shop.example.com/'), reach, 'kept for the site created next')
})

test('seen only from the partner: the peer road, with the partner\'s answer', async () => {
  const { result, reach } = await checkReach('https://bank-filtered.ir', {
    region: 'intl', peerConfigured: true,
    discover: notFound('sites.wordpressForbidden'),
    viaPeer: async () => ({ ok: true, result: { siteUrl: 'https://bank-filtered.ir/', hostname: 'bank-filtered.ir', kind: 'domain', path: '/', connectorDetected: true } }),
  })
  assert.equal(reach.route, 'peer')
  assert.equal(result.siteUrl, 'https://bank-filtered.ir', 'the partner\'s address is normalized here')
  assert.deepEqual(reach.servers.map((s) => [s.region, s.ok, s.reason]), [['intl', false, 'sites.wordpressForbidden'], ['ir', true, null]])
})

test('seen by nobody: this server\'s error, carrying what each side saw', async () => {
  await assert.rejects(checkReach('https://gone.example.com', {
    region: 'intl', peerConfigured: true,
    discover: notFound(),
    viaPeer: async () => { throw new Error('peer down') },
  }), (e) => {
    assert.equal(e.status, 422)
    assert.equal(e.details.reach.route, null)
    assert.deepEqual(e.details.reach.servers.map((s) => s.reason), ['sites.discoveryTimeout', 'sites.reach.peerUnavailable'])
    return true
  })
})

test('a malformed or private address is refused before anything is reported', async () => {
  await assert.rejects(checkReach('http://10.0.0.5', {
    region: 'intl', peerConfigured: true,
    discover: async () => { throw httpError(400, 'sites.publicAddressRequired') },
    viaPeer: async () => ({ ok: false, key: 'sites.publicAddressRequired' }),
  }), (e) => e.details === undefined && e.i18n.key === 'sites.publicAddressRequired')
})

test('no partner configured: one server, honestly labelled when its region is unset', async () => {
  let asked = false
  const { reach } = await checkReach('https://solo.example.com', {
    region: '', peerConfigured: false,
    discover: found('https://solo.example.com'),
    viaPeer: async () => { asked = true; return { ok: true } },
  })
  assert.equal(asked, false)
  assert.deepEqual(reach.servers, [{ region: '', self: true, ok: true, reason: null }])
})

test('a partner answer that is not a discovery result counts as not seen', async () => {
  const { reach } = await checkReach('https://odd.example.com', {
    region: 'intl', peerConfigured: true,
    discover: found('https://odd.example.com'),
    viaPeer: async () => ({ ok: true, result: { siteUrl: 42 } }),
  })
  assert.equal(reach.servers[1].ok, false)
  assert.equal(reach.servers[1].reason, 'sites.reach.unknownFailure')
})

if (!dsn) {
  test('stored routes (skipped: set CB_TEST_DATABASE_URL)', { skip: true }, () => {})
} else {
  const { pool, query, init } = await import('../src/db.js')
  await query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`)
  await query(`CREATE SCHEMA ${TEST_SCHEMA}`)
  await init()
  const { sites, users } = await import('../src/store.js')
  const peerRelay = await import('../src/peer-relay.js')

  test('a stored peer road is pinned, survives a restart, and follows a signed ping', async () => {
    peerRelay._reset()
    const user = await users.create({ email: 'reach-owner@example.com', name: 'Reach', password: 'a-long-password-123' })
    const site = await sites.add(user.id, { name: 'https://iran-only.example.ir' })
    const mcp = 'https://iran-only.example.ir/wp-json/claude-bridge/v1/mcp'

    const stored = await sites.setReach(site.id, { checkedAt: 1, route: 'peer', servers: [{ region: 'intl', self: true, ok: false, reason: 'sites.discoveryTimeout' }, { region: 'ir', self: false, ok: true, reason: null }] })
    assert.equal(stored.route, 'peer')
    assert.equal(peerRelay.prefersPeer(mcp), true)

    peerRelay._reset() // a fresh process
    assert.equal(peerRelay.prefersPeer(mcp), false)
    assert.equal(await sites.loadRoutes(), 1)
    assert.equal(peerRelay.prefersPeer(mcp), true)

    const after = await sites.noteRoute(site.id, 'direct')
    assert.equal(after.route, 'direct')
    assert.equal(after.servers.length, 2, 'what each server saw stays as seen')
    assert.equal(peerRelay.prefersPeer(mcp), false)
  })

  test.after(() => pool.end())
}
