// One tool, seven jobs, two of them dangerous.
//
// `job_start` sits under MUTATING, which is right for a scan, an integrity
// check or a backup: recoverable work. It also starts `update_apply`, which
// installs plugin and core updates, and `backup_restore`, which writes a
// database over the live one. Both match this module's own definition of
// sensitive — takes the site down, destroys data.
//
// While those two were absent from the tool schema the distinction was
// academic. They are advertised now, so a classification that stops at the tool
// name would let an assistant on `auto` authority restore a backup over a live
// database without anyone being asked.
import test from 'node:test'
import assert from 'node:assert/strict'

import { classify, isSensitive, permits, SENSITIVE_JOB_TYPES } from '../src/authority.js'

test('recoverable job types stay mutating', () => {
  for (const type of ['security_scan', 'core_integrity', 'backup', 'conflict_hunt', 'perf']) {
    assert.equal(classify('job_start', { type }), 'mutating', type)
  }
})

test('destructive job types are sensitive', () => {
  for (const type of SENSITIVE_JOB_TYPES) {
    assert.equal(classify('job_start', { type }), 'sensitive', type)
  }
  // Named explicitly as well as through the export, so shrinking the list is a
  // visible change rather than a silently passing test.
  assert.equal(classify('job_start', { type: 'update_apply' }), 'sensitive')
  assert.equal(classify('job_start', { type: 'backup_restore' }), 'sensitive')
})

test('an unfamiliar job type is sensitive', () => {
  // A site on a newer plugin may offer a job this build has never heard of.
  // Unknown is not the same as safe — the same rule the module already applies
  // to unknown tools.
  assert.equal(classify('job_start', { type: 'wipe_everything' }), 'sensitive')
})

test('job_start with no arguments keeps its own classification', () => {
  // Callers that cannot supply args still get the cautious answer for the tool:
  // mutating, which under `confirm` authority still needs a human.
  assert.equal(classify('job_start'), 'mutating')
  assert.equal(classify('job_start', null), 'mutating')
  assert.equal(classify('job_start', {}), 'mutating')
})

test('auto authority does not silently restore a backup', () => {
  // The failure this exists to prevent, stated as the verdict the assistant
  // actually reads.
  const scan = permits('auto', 'job_start', { type: 'security_scan' })
  assert.equal(scan.allowed, true)

  for (const type of SENSITIVE_JOB_TYPES) {
    const verdict = permits('auto', 'job_start', { type })
    assert.equal(verdict.allowed, false, `${type} was allowed under auto`)
    assert.equal(verdict.kind, 'sensitive')
    assert.ok(verdict.reason, 'a refusal must say why')
  }
})

test('isSensitive agrees with classify for both shapes', () => {
  assert.equal(isSensitive('job_start', { type: 'update_apply' }), true)
  assert.equal(isSensitive('job_start', { type: 'security_scan' }), false)
  assert.equal(isSensitive('db_query'), true)
  assert.equal(isSensitive('flush_cache'), false)
})

test('classification of ordinary tools is unchanged by the args parameter', () => {
  // The new parameter must not disturb every other tool.
  assert.equal(classify('flush_cache', { type: 'update_apply' }), 'mutating')
  assert.equal(classify('db_query', { type: 'security_scan' }), 'sensitive')
  assert.equal(classify('site_info', { type: 'backup_restore' }), 'read')
})
