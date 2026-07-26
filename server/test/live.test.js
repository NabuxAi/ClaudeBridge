// The updates view is now built from what the site reports. These pin the two
// things that make it trustworthy: risk is derived from the actual version
// jump, and nothing is invented to fill a gap.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { updatesFromStatus, PROVENANCE } from '../src/live.js'

const status = {
  wp_version: '6.5.4',
  wp_latest: '7.0.2',
  core_outdated: true,
  plugins_pending: [
    { name: 'WooCommerce', from: '9.1.2', to: '9.1.4' },   // patch
    { name: 'Elementor', from: '3.21.4', to: '3.23.0' },   // minor
    { name: 'Big Thing', from: '2.9.0', to: '3.0.0' },     // major
  ],
  themes_pending: [{ name: 'Astra', from: '4.6', to: '4.7' }],
  php_version: '8.1.2',
  checked_at: 1700000000,
}

test('the queue is built from what the site reports, nothing else', () => {
  const u = updatesFromStatus(status)
  assert.equal(u.queue.length, 5, 'core + 3 plugins + 1 theme')
  assert.deepEqual(
    u.queue.map((q) => q.name),
    ['WordPress Core', 'WooCommerce', 'Elementor', 'Big Thing', 'Astra']
  )
})

test('risk comes from the version jump, not from a guess', () => {
  const u = updatesFromStatus(status)
  const by = Object.fromEntries(u.queue.map((q) => [q.name, q]))
  assert.equal(by.WooCommerce.risk, 'low', '9.1.2 → 9.1.4 is a patch')
  assert.equal(by.Elementor.risk, 'medium', '3.21 → 3.23 is a minor')
  assert.equal(by['Big Thing'].risk, 'high', '2.x → 3.x can break a site')
  assert.equal(by['WordPress Core'].risk, 'high', '6.x → 7.x is a major')
})

test('high-risk updates ask for confirmation, patches do not', () => {
  const u = updatesFromStatus(status)
  const by = Object.fromEntries(u.queue.map((q) => [q.name, q]))
  assert.equal(by['Big Thing'].authority, 'confirm')
  assert.equal(by.WooCommerce.authority, 'auto')
})

test('completed updates are empty, with the reason stated', () => {
  const u = updatesFromStatus(status)
  assert.deepEqual(u.done, [], 'WordPress keeps no durable log of installed updates')
  assert.ok(u.doneNote, 'and the panel is told why rather than shown an invented list')
})

test('a site with nothing pending produces an empty queue, not a placeholder', () => {
  const u = updatesFromStatus({
    wp_version: '7.0.2', wp_latest: '7.0.2', core_outdated: false,
    plugins_pending: [], themes_pending: [], php_version: '8.2',
  })
  assert.deepEqual(u.queue, [])
})

test('garbage in gives null, so the caller keeps its own error path', () => {
  assert.equal(updatesFromStatus(null), null)
  assert.equal(updatesFromStatus('nope'), null)
})

test('views without a data source declare it instead of being filled in', () => {
  assert.ok(PROVENANCE.backups.unavailable, 'backups has no source and says so')
  assert.ok(PROVENANCE.incidents.unavailable, 'incidents has no source and says so')
  assert.deepEqual(PROVENANCE.backups.live, [])
  assert.deepEqual(PROVENANCE.updates.live, ['update_status'], 'updates is genuinely measured')
})
