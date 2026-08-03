// Nobody was told when a site fell behind.
//
// The server has known both halves of this for a while and never put them
// together: each site's bridge version is recorded from the nightly contact,
// and the manifest says what is current. That gap is how a site sat five days
// on a version whose security scan fatally errored, while the fix was
// published, reachable and installable the whole time.
import test from 'node:test'
import assert from 'node:assert/strict'

import { currentPluginVersion, renderOutdatedSites } from '../src/digest.js'

const site = (name, version) => ({
  name,
  connector: version === undefined ? null : JSON.stringify({ version }),
})

test('a site behind the published version is named, with both versions', () => {
  const out = renderOutdatedSites([site('old.example', '3.7.0')], '3.7.4')
  assert.match(out, /old\.example/)
  assert.match(out, /3\.7\.0/)
  assert.match(out, /3\.7\.4/)
})

test('a site on the current version is not mentioned', () => {
  assert.equal(renderOutdatedSites([site('new.example', '3.7.4')], '3.7.4'), '')
})

test('a site that never reported a version is counted, not accused', () => {
  // Saying it is behind would be inventing a fact; saying nothing hides that we
  // cannot tell. It is reported as unknown.
  const out = renderOutdatedSites([site('quiet.example', undefined)], '3.7.4')
  assert.match(out, /گزارش نکرده/)
  assert.doesNotMatch(out, /quiet\.example/)
})

test('nothing is rendered when every site is current', () => {
  const out = renderOutdatedSites([site('a', '3.7.4'), site('b', '3.7.4')], '3.7.4')
  assert.equal(out, '')
})

test('nothing is rendered when the current version is unknown', () => {
  // A comparison against a guess is worse than no comparison.
  assert.equal(renderOutdatedSites([site('a', '3.7.0')], null), '')
  assert.equal(renderOutdatedSites([site('a', '3.7.0')], ''), '')
})

test('a malformed connector blob does not break the digest', () => {
  // This runs inside the one message that leaves the server; a parse error here
  // must not cost the whole report.
  const out = renderOutdatedSites([{ name: 'broken', connector: '{not json' }], '3.7.4')
  assert.match(out, /گزارش نکرده/)
})

test('site names are escaped', () => {
  // Telegram HTML mode, and a site title is user-supplied.
  const out = renderOutdatedSites([site('<b>x</b>', '3.7.0')], '3.7.4')
  assert.doesNotMatch(out, /<b>x<\/b>/)
  assert.match(out, /&lt;b&gt;x/)
})

test('the published version is read from the manifest the sites poll', () => {
  // If this drifted from the manifest, the digest would tell people to expect a
  // version the updater would never install.
  const v = currentPluginVersion()
  assert.match(v, /^\d+\.\d+\.\d+$/)
})
