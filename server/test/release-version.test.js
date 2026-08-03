// A fix that ships under the version it fixes never reaches a site.
//
// Sites pull updates: the plugin polls /plugin/manifest and installs when the
// advertised version is newer than the installed one. Equal is not newer. So a
// corrected plugin published under the same number is invisible to every site
// already running it — which is not a hypothetical here, the repo carries a
// commit reading "bump to 3.7.0 and rebuild — none of this had reached a site".
//
// This pins the three places the version lives to the same value, so a rebuild
// cannot quietly advertise one number while shipping another.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const plugin = readFileSync(join(root, 'wp-claude-bridge.php'), 'utf8')
const manifest = JSON.parse(readFileSync(join(root, 'server', 'plugin-manifest.json'), 'utf8'))

const headerVersion = /^ \* Version:\s*([0-9.]+)/m.exec(plugin)?.[1]
const constVersion = /define\(\s*'CB_VERSION',\s*'([0-9.]+)'\s*\)/.exec(plugin)?.[1]

test('the plugin header and CB_VERSION agree', () => {
  // WordPress reads the header; the updater compares CB_VERSION. Disagreement
  // means the site believes one thing and the server another.
  assert.ok(headerVersion, 'no Version: header')
  assert.ok(constVersion, 'no CB_VERSION')
  assert.equal(headerVersion, constVersion)
})

test('the served manifest advertises the version that was built', () => {
  // The manifest is generated from CB_VERSION. If they drift, sites are told to
  // install a version the download does not contain.
  assert.equal(manifest.version, constVersion)
})

test('the version is a comparable three-part number', () => {
  // WordPress compares with version_compare; anything else sorts unpredictably.
  assert.match(constVersion, /^\d+\.\d+\.\d+$/)
})

test('the built distributables carry the same version', () => {
  // dist/ is generated. A stale build means the zip a site downloads is older
  // than the manifest that advertised it — the failure this file exists for.
  for (const rel of [
    'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
    'dist/digi-ai-bridge/digi-ai-bridge.php',
  ]) {
    const built = readFileSync(join(root, rel), 'utf8')
    const v = /define\(\s*'CB_VERSION',\s*'([0-9.]+)'\s*\)/.exec(built)?.[1]
    assert.equal(v, constVersion, `${rel} was not rebuilt`)
  }
})

test('the security_scan fix is present in every shipped build', () => {
  // The specific reason 3.7.2 exists. If a build predates the fix, the version
  // bump is worse than useless: it advertises a fix that is not in the zip.
  for (const rel of [
    'wp-claude-bridge.php',
    'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
    'dist/digi-ai-bridge/digi-ai-bridge.php',
  ]) {
    const src = readFileSync(join(root, rel), 'utf8')
    assert.match(src, /function cb_op_security_scan\(\s*\$args\s*=/, `${rel} has the old signature`)
  }
})
