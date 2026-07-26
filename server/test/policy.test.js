// Safe mode is a security control, so its behaviour is pinned by tests rather
// than by whoever last edited the panel. Every case here is something a user or
// a crafted request could actually try.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPolicyChange, describePolicy, readPolicy, DEFAULT_POLICY } from '../src/policy.js'

test('a fresh site updates everything by default', () => {
  const p = readPolicy(null)
  assert.deepEqual(p, DEFAULT_POLICY)
})

test('safe mode refuses to let a switch be turned off', () => {
  const { policy, refused } = applyPolicyChange(
    { safeMode: true, autoCore: true, autoPlugins: true, autoThemes: true },
    { autoPlugins: false }
  )
  assert.equal(policy.autoPlugins, true, 'switch must stay on')
  assert.deepEqual(refused, ['autoPlugins'], 'and the refusal must be reported')
})

test('safe mode refuses all three at once', () => {
  const { policy, refused } = applyPolicyChange(
    { safeMode: true },
    { autoCore: false, autoPlugins: false, autoThemes: false }
  )
  assert.deepEqual(refused, ['autoCore', 'autoPlugins', 'autoThemes'])
  assert.ok(policy.autoCore && policy.autoPlugins && policy.autoThemes)
})

test('turning a switch ON is always allowed, even under safe mode', () => {
  const { policy, refused } = applyPolicyChange(
    { safeMode: true, autoCore: false, autoPlugins: true, autoThemes: true },
    { autoCore: true }
  )
  assert.equal(policy.autoCore, true)
  assert.deepEqual(refused, [], 'raising security is never refused')
})

test('with safe mode off, a switch can be turned off', () => {
  const { policy, refused } = applyPolicyChange(
    { safeMode: false, autoCore: true, autoPlugins: true, autoThemes: true },
    { autoThemes: false }
  )
  assert.equal(policy.autoThemes, false)
  assert.deepEqual(refused, [])
})

test('enabling safe mode pulls every switch back on', () => {
  const { policy } = applyPolicyChange(
    { safeMode: false, autoCore: false, autoPlugins: false, autoThemes: false },
    { safeMode: true }
  )
  assert.ok(policy.autoCore && policy.autoPlugins && policy.autoThemes)
})

test('a request cannot disable a switch in the same call that enables safe mode', () => {
  const { policy } = applyPolicyChange(
    { safeMode: false, autoCore: true, autoPlugins: true, autoThemes: true },
    { safeMode: true, autoCore: false }
  )
  assert.equal(policy.autoCore, true, 'safe mode wins regardless of key order')
})

test('junk input cannot corrupt the policy', () => {
  const { policy } = applyPolicyChange(
    { safeMode: true },
    { autoCore: 'no', autoPlugins: 0, autoThemes: null, nonsense: true }
  )
  assert.deepEqual(policy, DEFAULT_POLICY, 'non-boolean values are ignored, not coerced')
  assert.equal('nonsense' in policy, false)
})

test('the panel is told the switches are locked and why', () => {
  const d = describePolicy({ safeMode: true })
  assert.equal(d.locked, true)
  assert.ok(d.lockReason && d.lockReason.length > 10)
  assert.equal(d.switches.length, 3)
  assert.ok(d.switches.every((s) => s.locked === true))
})

test('with safe mode off nothing is locked', () => {
  const d = describePolicy({ safeMode: false, autoCore: false, autoPlugins: true, autoThemes: true })
  assert.equal(d.locked, false)
  assert.equal(d.lockReason, null)
  assert.equal(d.switches.find((s) => s.id === 'autoCore').on, false)
})
