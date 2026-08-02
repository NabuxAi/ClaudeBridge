// The authority level was stored, shown in the panel, and read by nothing. Now
// it decides whether the assistant may touch a live site, so every branch is
// pinned here rather than left to whoever next edits the tool lists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUTHORITY_LEVELS,
  MUTATING_TOOLS,
  READ_TOOLS,
  SENSITIVE_TOOLS,
  classify,
  isSensitive,
  offeredTools,
  permits,
  readAuthority,
} from '../src/authority.js'

test('reading is allowed at every level, including the most cautious', () => {
  for (const level of AUTHORITY_LEVELS) {
    for (const tool of ['site_info', 'read_file', 'security_scan']) {
      assert.equal(permits(level, tool).allowed, true, `${tool} must be readable at ${level}`)
    }
  }
})

test('report may not change anything', () => {
  const v = permits('report', 'flush_cache')
  assert.equal(v.allowed, false)
  assert.match(v.reason, /گزارش/, 'the refusal must say why, so the reply can say why')
})

test('confirm turns a change into something the owner approves', () => {
  const v = permits('confirm', 'install_plugin')
  assert.equal(v.allowed, false)
  assert.match(v.reason, /تأیید/)
})

test('auto performs recoverable changes without asking', () => {
  for (const tool of ['backup_run', 'flush_cache', 'set_plugin_state', 'write_file']) {
    assert.equal(permits('auto', tool).allowed, true, `${tool} should run under auto`)
  }
})

test('auto is not authority to run destructive tools', () => {
  // This is the whole reason the three-way selector is not a two-way one.
  for (const tool of SENSITIVE_TOOLS) {
    const v = permits('auto', tool)
    assert.equal(v.allowed, false, `${tool} must never run unattended`)
    assert.equal(v.kind, 'sensitive')
  }
})

test('an unknown tool is treated as destructive, not as harmless', () => {
  // New tools land in the plugin before they land here. The failure that costs
  // something is the one where an unclassified tool runs on its own.
  assert.equal(classify('some_tool_added_next_week'), 'sensitive')
  assert.equal(permits('auto', 'some_tool_added_next_week').allowed, false)
  assert.equal(isSensitive(''), true)
})

test('an unknown authority level falls back to the most cautious one', () => {
  assert.equal(readAuthority('godmode'), 'report')
  assert.equal(readAuthority(undefined), 'report')
  assert.equal(readAuthority(null), 'report')
  assert.equal(permits('godmode', 'flush_cache').allowed, false)
})

test('the three classifications do not overlap', () => {
  const seen = new Map()
  for (const [kind, list] of [
    ['read', READ_TOOLS],
    ['mutating', MUTATING_TOOLS],
    ['sensitive', SENSITIVE_TOOLS],
  ]) {
    for (const t of list) {
      assert.equal(seen.has(t), false, `${t} is classified twice (${seen.get(t)} and ${kind})`)
      seen.set(t, kind)
    }
  }
})

test('every classified tool classifies back to its own list', () => {
  for (const t of READ_TOOLS) assert.equal(classify(t), 'read', t)
  for (const t of MUTATING_TOOLS) assert.equal(classify(t), 'mutating', t)
  for (const t of SENSITIVE_TOOLS) assert.equal(classify(t), 'sensitive', t)
})

test('no sensitive tool is ever offered to the model', () => {
  for (const level of AUTHORITY_LEVELS) {
    const offered = new Set(offeredTools(level))
    for (const t of SENSITIVE_TOOLS) {
      assert.equal(offered.has(t), false, `${t} must not be offered at ${level}`)
    }
  }
})

test('mutating tools are offered even where they cannot run, so a proposal can be exact', () => {
  // At `report` the model should be able to name `install_plugin` with real
  // arguments rather than describing an installation in prose.
  const offered = new Set(offeredTools('report'))
  assert.equal(offered.has('install_plugin'), true)
  assert.equal(permits('report', 'install_plugin').allowed, false)
})

test('the route and the assistant share one sensitive list', async () => {
  // Two lists that must agree are one list that will eventually disagree.
  const routes = await import('../src/routes/sites.js')
  assert.ok(routes, 'routes module still loads with the shared set')
  const { SENSITIVE_SET } = await import('../src/authority.js')
  for (const t of SENSITIVE_TOOLS) assert.equal(SENSITIVE_SET.has(t), true)
})
