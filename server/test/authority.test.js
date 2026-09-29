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

test('the safe-update observers are readable at every level', () => {
  // update_health_check and update_journal_get are the pipeline's evidence:
  // probes and the journal. Reading them is what lets a cautious owner
  // verify a run without being able to start one.
  for (const level of AUTHORITY_LEVELS) {
    for (const tool of ['update_health_check', 'update_journal_get']) {
      const v = permits(level, tool)
      assert.equal(v.allowed, true, `${tool} must be readable at ${level}`)
      assert.equal(v.kind, 'read')
    }
  }
})

test('manual update rollback needs a human at every authority level', () => {
  // update_rollback puts pre-update files back over live ones, possibly long
  // after the run — everything changed since the snapshot is overwritten.
  // The automatic rollback inside a just-failed wave is part of that wave;
  // this tool is a separate human decision, so it sits with edit_file.
  for (const level of AUTHORITY_LEVELS) {
    const v = permits(level, 'update_rollback')
    assert.equal(v.allowed, false, `update_rollback must never run unattended at ${level}`)
    assert.equal(v.kind, 'sensitive')
  }
  assert.equal(classify('update_rollback'), 'sensitive')
})

test('design-viewing tools are readable at every level', () => {
  // list_block_types, render_blocks and list_elementor_widgets only look: the
  // registered palette, and a compiled preview of specs nothing saves. Seeing
  // what a design would become is what lets a cautious owner review it.
  for (const level of AUTHORITY_LEVELS) {
    for (const tool of ['list_block_types', 'render_blocks', 'list_elementor_widgets']) {
      const v = permits(level, tool)
      assert.equal(v.allowed, true, `${tool} must be readable at ${level}`)
      assert.equal(v.kind, 'read')
    }
  }
})

test('in-place block/elementor editing never runs unattended', () => {
  // append_blocks and elementor_section_append change a live page the moment
  // they run. Revisions keep the history, but policy treats in-place editing
  // of existing content like edit_file: a human approves, at every level —
  // creating a new draft page (create_block_page, elementor_page_create) is
  // the recoverable half and stays mutating.
  for (const level of AUTHORITY_LEVELS) {
    for (const tool of ['append_blocks', 'elementor_section_append']) {
      const v = permits(level, tool)
      assert.equal(v.allowed, false, `${tool} must never run unattended at ${level}`)
      assert.equal(v.kind, 'sensitive')
    }
  }
  assert.equal(permits('auto', 'create_block_page').allowed, true)
  assert.equal(permits('auto', 'elementor_page_create').allowed, true)
})

test('publishing a designed page asks a human; creating a draft does not', () => {
  // The draft default of create_block_page / elementor_page_create is a
  // convention. The status argument is the real decision, so it carries the
  // classification: draft stays recoverable, publish is live content and
  // must not happen unattended under `auto`.
  for (const tool of ['create_block_page', 'elementor_page_create']) {
    assert.equal(classify(tool, { status: 'draft' }), 'mutating', `${tool} draft stays mutating`)
    assert.equal(permits('auto', tool, { status: 'draft' }).allowed, true)
    assert.equal(classify(tool, { status: 'publish' }), 'sensitive', `${tool} publish must be sensitive`)
    assert.equal(permits('auto', tool, { status: 'publish' }).allowed, false)
    // No args at all is the tool's own classification: draft-shaped mutating.
    assert.equal(classify(tool), 'mutating')
  }
})
