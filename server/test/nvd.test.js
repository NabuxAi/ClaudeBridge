// The matcher decides whether a customer sees "your plugin is vulnerable".
// A wrong yes is a support ticket and a lost customer, so the rules that keep
// a guess out of that state are pinned here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTarget, extractFixedIn, extractSeverity, toRow, compareVersions } from '../src/intel/match.js'

const cpeCve = {
  id: 'CVE-2024-0001',
  descriptions: [{ lang: 'en', value: 'The WP Super Cache plugin for WordPress is vulnerable before 1.7.2.' }],
  configurations: [{ nodes: [{ cpeMatch: [{ criteria: 'cpe:2.3:a:automattic:wp_super_cache:*:*:*:*:*:wordpress:*:*', versionEndExcluding: '1.7.2' }] }] }],
  metrics: { cvssMetricV31: [{ baseSeverity: 'HIGH', cvssData: { baseScore: 8.8 } }] },
  published: '2024-01-05T00:00:00.000',
}

const proseOnly = {
  id: 'CVE-2024-0002',
  descriptions: [{ lang: 'en', value: 'The Awesome Slider plugin for WordPress is vulnerable to XSS before 3.1.' }],
  configurations: [],
  metrics: {},
}

test('a CPE gives the slug, with underscores normalised', () => {
  const t = extractTarget(cpeCve)
  assert.equal(t.slug, 'wp-super-cache')
  assert.equal(t.kind, 'plugin')
  assert.equal(t.confident, true)
})

test('core CVEs are identified as core, not as a plugin', () => {
  const t = extractTarget({
    configurations: [{ nodes: [{ cpeMatch: [{ criteria: 'cpe:2.3:a:wordpress:wordpress:6.4:*:*:*:*:*:*:*' }] }] }],
  })
  assert.equal(t.kind, 'core')
  assert.equal(t.slug, 'wordpress')
})

test('prose parsing works but never claims confidence', () => {
  const t = extractTarget(proseOnly)
  assert.equal(t.slug, 'awesome-slider')
  assert.equal(t.confident, false, 'a slug guessed from prose must not be trusted')
})

test('a CVE with nothing identifiable is skipped, not guessed at', () => {
  assert.equal(extractTarget({ descriptions: [{ lang: 'en', value: 'Some unrelated product flaw.' }], configurations: [] }), null)
})

test('fixed version comes from CPE first, prose second', () => {
  assert.equal(extractFixedIn(cpeCve), '1.7.2')
  assert.equal(extractFixedIn(proseOnly), '3.1')
})

test('severity and score are read from CVSS v3.1', () => {
  assert.deepEqual(extractSeverity(cpeCve), { severity: 'high', cvss: 8.8 })
})

test('a solid CPE match on a real plugin is confirmed', async () => {
  const row = await toRow(cpeCve, { verify: async () => true })
  assert.equal(row.confirmed, true)
  assert.equal(row.fixed_in, '1.7.2')
})

test('a slug that does not exist on wordpress.org is NOT confirmed', async () => {
  const row = await toRow(cpeCve, { verify: async () => false })
  assert.equal(row.confirmed, false, 'refuse to warn about a plugin that does not exist')
  assert.match(row.match_note, /no such plugin/)
})

test('a prose-only match is never confirmed even if the slug exists', async () => {
  const row = await toRow(proseOnly, { verify: async () => true })
  assert.equal(row.confirmed, false)
  assert.match(row.match_note, /guessed/)
})

test('no fixed version means nothing to compare, so it stays unconfirmed', async () => {
  const noFix = { ...cpeCve, configurations: [{ nodes: [{ cpeMatch: [{ criteria: 'cpe:2.3:a:x:some_plugin:*:*' }] }] }], descriptions: [{ lang: 'en', value: 'no version info' }] }
  const row = await toRow(noFix, { verify: async () => true })
  assert.equal(row.confirmed, false)
  assert.match(row.match_note, /no fixed version/)
})

test('version comparison handles the strings plugins really use', () => {
  assert.equal(compareVersions('1.7.1', '1.7.2') < 0, true)
  assert.equal(compareVersions('1.7.2', '1.7.2'), 0)
  assert.equal(compareVersions('1.10.0', '1.9.0') > 0, true, '10 is above 9, not below')
  assert.equal(compareVersions('2.0', '2.0.1') < 0, true)
  assert.equal(compareVersions('1.0.0-beta', '1.0.0') < 0, true)
})
