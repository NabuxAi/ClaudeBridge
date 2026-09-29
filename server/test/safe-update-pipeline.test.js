// The transactional update pipeline is a set of promises about behaviour,
// not just a set of functions: waves are snapshotted before they run, gated
// by health probes after, rolled back from the snapshot when the gate fails,
// and journalled so "updated" and "still works" stay separate facts.
//
// Most of that cannot be exercised without a live WordPress site, so this
// pins the structure statically across the canonical source and both
// generated release artifacts — the same trick plugin-tool-dispatch.test.js
// uses, for the same reason: a regression here is a silent behavioural
// change, not a crash anyone notices.
//
// The regression this guards against has happened before: the pipeline was
// rewritten wave-by-wave in 3.8.0, and a later edit that quietly dropped the
// snapshot call, the baseline comparison, or the stop-after-rollback would
// leave a "safe mode" that updates blindly while still advertising safety.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { READ_TOOLS, SENSITIVE_TOOLS } from '../src/authority.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sources = [
  'wp-claude-bridge.php',
  'dist/digiwp-ai-bridge/digiwp-ai-bridge.php',
  'dist/digi-ai-bridge/digi-ai-bridge.php',
].map((p) => ({ p, src: readFileSync(join(root, p), 'utf8') }))

test('every release artifact carries the whole pipeline', () => {
  const pieces = [
    'function cb_safe_update_root(',
    'function cb_safe_update_run_dir(',
    'function cb_update_snapshot_item(',
    'function cb_update_rollback_item(',
    'function cb_update_rrmdir(',
    'function cb_update_health_checks(',
    'function cb_update_health_pass(',
    'function cb_update_journal_write(',
    'function cb_update_journal_latest_run(',
    'function cb_safe_update_prune(',
    'function cb_op_update_health(',
    'function cb_op_update_journal(',
    'function cb_op_update_rollback(',
  ]
  for (const { p, src } of sources) {
    for (const fn of pieces) {
      assert.ok(src.includes(fn), `${p} is missing ${fn}`)
    }
  }
})

test('each wave snapshots first, gates after, and stops when the gate fails', () => {
  for (const { p, src } of sources) {
    const job = src.slice(src.indexOf('function cb_job_update_apply('))
    assert.ok(job.length > 0, `${p} has no update job`)
    assert.ok(job.includes('cb_update_snapshot_item('), `${p}: waves must snapshot before upgrading`)
    assert.ok(job.includes('cb_update_health_pass('), `${p}: waves must be health-gated`)
    assert.ok(job.includes('cb_update_rollback_item('), `${p}: a failed gate must roll the wave back`)
    assert.ok(job.includes("'stopped_after_rollback'"), `${p}: a rollback must stop the queue, not continue it`)
    assert.ok(job.includes("'skipped'"), `${p}: items not run after the stop must be counted, not hidden`)
    // The pre-update database safety backup survived the rewrite.
    assert.ok(
      job.includes("cb_backup_run( array( 'label' => 'pre-update', 'files' => false ) )"),
      `${p}: the pre-update database backup is part of the pipeline`,
    )
    // The gate compares against a measured baseline, not an absolute guess.
    assert.ok(job.includes("'baseline_health'"), `${p}: preflight must measure a health baseline`)
  }
})

test('core is never auto-rolled-back, and that is deliberate', () => {
  for (const { p, src } of sources) {
    const job = src.slice(src.indexOf('function cb_job_update_apply('))
    // Snapshots exist for plugins and themes only.
    assert.ok(
      job.includes("if ( 'core' !== \$item['type'] )"),
      `${p}: only plugins and themes get file snapshots`,
    )
    // And the core failure branch says why it stops instead of rolling back.
    assert.ok(
      job.includes('applied_health_failed') && job.includes('بازگردانی خودکار هسته انجام نمی‌شود'),
      `${p}: a core health failure must stop and say so, not roll back over a migrated database`,
    )
    // The manual rollback tool refuses core for the same reason.
    const op = src.slice(src.indexOf('function cb_op_update_rollback('))
    assert.ok(op.includes("'core' === \$choice['type']"), `${p}: update_rollback must refuse core waves`)
  }
})

test('rollback only ever deletes a directory the resolver validated', () => {
  for (const { p, src } of sources) {
    const rb = src.slice(src.indexOf('function cb_update_rollback_item('))
    assert.ok(rb.includes('cb_update_resolve_item('), `${p}: rollback paths come from the resolver, not the caller`)
    const resolver = src.slice(src.indexOf('function cb_update_resolve_item('))
    assert.ok(resolver.includes('WP_PLUGIN_DIR') && resolver.includes('get_theme_root'), `${p}: the resolver is anchored to plugin and theme roots`)
    assert.ok(resolver.includes('../'), `${p}: the resolver rejects traversal`)
  }
})

test('the pipeline keeps its disk safety margin and prunes old runs', () => {
  for (const { p, src } of sources) {
    const job = src.slice(src.indexOf('function cb_job_update_apply('))
    assert.ok(job.includes('disk_free_space'), `${p}: preflight checks free disk before snapshotting`)
    assert.ok(job.includes('cb_safe_update_prune('), `${p}: finished runs prune their snapshots`)
  }
})

test('the three new tools are advertised consistently and classified on the server', () => {
  for (const { p, src } of sources) {
    for (const name of ['update_health_check', 'update_journal_get', 'update_rollback']) {
      assert.ok(src.includes(`'name' => '${name}'`), `${p} does not advertise ${name}`)
    }
    // The probe tool is the noargs shape; the other two take arguments.
    assert.ok(/'name' => 'update_health_check'.*'noargs' => true/.test(src), `${p}: update_health_check is noargs`)
    assert.ok(!/'name' => 'update_journal_get'.*'noargs' => true/.test(src), `${p}: update_journal_get takes run_id`)
    assert.ok(!/'name' => 'update_rollback'.*'noargs' => true/.test(src), `${p}: update_rollback takes run_id/index`)
  }
  // What the plugin advertises, the server must have classified — the two
  // observers read-only at every level, the rollback human-approved at
  // every level. An unclassified copy of these names fails closed already;
  // this pins the intended classification against list drift.
  assert.ok(READ_TOOLS.includes('update_health_check'))
  assert.ok(READ_TOOLS.includes('update_journal_get'))
  assert.ok(SENSITIVE_TOOLS.includes('update_rollback'))
})
