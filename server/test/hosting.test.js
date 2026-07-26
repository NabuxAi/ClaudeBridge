// The hosting profile.
//
// This decides which of our servers reaches a site and which address that
// site's connector is told to call back on. Both are silent when wrong — the
// requests simply never arrive — so the tests here are about what happens to
// bad or partial input, not about the happy path.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalise, describe as describeHosting, egressFor, needsCacheBust, PROVIDERS, REGIONS } from '../src/hosting.js'

test('a complete profile survives normalisation unchanged', () => {
  const p = normalise({ region: 'ir', provider: 'parspack', egress: 'ir', callbackUrl: 'https://ir.example.com/v1' })
  assert.equal(p.region, 'ir')
  assert.equal(p.provider, 'parspack')
  assert.equal(p.egress, 'ir')
  assert.equal(p.callbackUrl, 'https://ir.example.com/v1')
})

test('an unknown provider becomes "other" with the free-text name kept', () => {
  // Rejecting it would teach people to pick the first item in the list, and
  // then we would be acting on an answer that is worse than blank.
  const p = normalise({ provider: 'some-host-we-never-heard-of', providerName: 'هاست محلی' })
  assert.equal(p.provider, 'other')
  assert.equal(p.providerName, 'هاست محلی')
})

test('a known provider does not carry a stray free-text name', () => {
  const p = normalise({ provider: 'hetzner', providerName: 'ignore me' })
  assert.equal(p.providerName, null)
})

test('an unrecognised region falls back to unknown, not to a guess', () => {
  // Guessing "intl" here would route an Iranian site through a server that
  // cannot reach it, and the symptom would be timeouts nobody can explain.
  assert.equal(normalise({ region: 'mars' }).region, 'unknown')
  assert.equal(normalise({}).region, 'unknown')
})

test('a callback URL must be a real http(s) URL or nothing', () => {
  assert.equal(normalise({ callbackUrl: 'not a url' }).callbackUrl, null)
  assert.equal(normalise({ callbackUrl: 'javascript:alert(1)' }).callbackUrl, null)
  assert.equal(normalise({ callbackUrl: 'file:///etc/passwd' }).callbackUrl, null)
  assert.equal(normalise({ callbackUrl: '  ' }).callbackUrl, null)
  // http is allowed: an internal address is a legitimate answer.
  assert.equal(normalise({ callbackUrl: 'http://10.0.0.5:8787/v1' }).callbackUrl, 'http://10.0.0.5:8787/v1')
})

test('a trailing slash is stripped so paths do not double up', () => {
  // Otherwise the connector builds https://x/v1//connector/report.
  assert.equal(normalise({ callbackUrl: 'https://x.com/v1/' }).callbackUrl, 'https://x.com/v1')
})

test('egress follows the region until someone overrides it', () => {
  assert.equal(egressFor({ region: 'ir' }), 'ir')
  assert.equal(egressFor({ region: 'intl' }), 'intl')
  // Unknown is treated as international, which is the wider default.
  assert.equal(egressFor({ region: 'unknown' }), 'intl')
  // An override wins, because a site can be on an Iranian host and still be
  // reachable internationally — and only trying tells us.
  assert.equal(egressFor({ region: 'ir', egress: 'intl' }), 'intl')
})

test('hosts with a cache in front get cache-busted health checks', () => {
  // A cached 200 for a page that is actually broken is the worst possible
  // answer from a health check.
  assert.equal(needsCacheBust({ provider: 'cloudflare' }), true)
  assert.equal(needsCacheBust({ provider: 'wpengine' }), true)
  assert.equal(needsCacheBust({ provider: 'hetzner' }), false)
  assert.equal(needsCacheBust({}), false)
})

test('a described profile explains what the host limits', () => {
  const d = describeHosting({ provider: 'godaddy', region: 'intl' })
  assert.equal(d.providerLabel, 'GoDaddy')
  const ids = d.traits.map((t) => t.id)
  assert.ok(ids.includes('no-exec'))
  assert.ok(ids.includes('low-memory'))
  // Every trait has to say what it means for us, or it is trivia.
  for (const t of d.traits) assert.ok(t.effect, `trait ${t.id} has no stated effect`)
})

test('"no notes on this host" is worded differently from "no limits"', () => {
  // The two look identical in a UI that just renders an empty list, and one of
  // them is a claim we cannot make.
  const known = describeHosting({ provider: 'hetzner' })
  assert.equal(known.traits.length, 0)
  assert.match(known.traitsNote, /ثبت نکرده‌ایم/)

  const other = describeHosting({ provider: 'other', providerName: 'X' })
  assert.match(other.traitsNote, /در فهرست ما نیست/)
})

test('"other" is always offered, so the form is never a dead end', () => {
  assert.ok(PROVIDERS.some((p) => p.id === 'other'))
  assert.ok(REGIONS.some((r) => r.id === 'unknown'))
})

test('every region and provider entry is complete enough to render', () => {
  for (const r of REGIONS) {
    assert.ok(r.id && r.label && r.note, `region ${r.id} is missing a field`)
  }
  for (const p of PROVIDERS) {
    assert.ok(p.id && p.label, `provider ${p.id} is missing a label`)
    assert.ok(Array.isArray(p.traits), `provider ${p.id} has no traits array`)
  }
})

test('provider ids are unique', () => {
  const ids = PROVIDERS.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length)
})
