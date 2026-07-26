// Matching installed software against the CVE table.
//
// The database access is stubbed; what is tested is the decision logic, which
// is where the damage happens. Three outcomes must stay distinct: vulnerable,
// not vulnerable, and cannot say — collapsing the third into either of the
// others is how a scanner starts lying.
import test from 'node:test'
import assert from 'node:assert/strict'
// Imported from match.js, not vulns.js: match.js is the pure half and pulls
// in no database driver, so this suite runs anywhere.
import { compareVersions, slugOf } from '../src/intel/match.js'

test('a plugin file resolves to its wordpress.org slug', () => {
  assert.equal(slugOf('woocommerce/woocommerce.php'), 'woocommerce')
  assert.equal(slugOf('hello.php'), 'hello')
  assert.equal(slugOf(''), '')
})

test('a prerelease is behind its release, so the fix still applies', () => {
  // The bug this guards: naive string comparison puts "1.0.0-beta" above
  // "1.0.0", so a site running a prerelease would be told it is patched when
  // it is not — and prerelease sites are exactly the ones most likely to be
  // vulnerable.
  assert.ok(compareVersions('1.0.0-beta', '1.0.0') < 0)
  assert.ok(compareVersions('3.2.0-rc1', '3.2.0') < 0)
  assert.ok(compareVersions('3.2.1', '3.2.0') > 0)
  assert.equal(compareVersions('3.2.0', '3.2.0'), 0)
})

test('version comparison is numeric, not lexical', () => {
  // "9" > "10" as strings. A site on 2.9 must not look newer than the 2.10
  // that fixed the hole.
  assert.ok(compareVersions('2.9', '2.10') < 0)
  assert.ok(compareVersions('1.2.3', '1.2') > 0)
})
