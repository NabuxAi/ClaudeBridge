import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WordPressMultiAgentOrchestrator,
  orchestrator,
  SECURITY_AGENT,
  PERFORMANCE_AGENT,
  UPDATES_AGENT,
  RESCUE_AGENT,
  ECOMMERCE_AGENT,
  SAFETY_CONTROLLER,
} from '../src/agents/index.js'

test('multi-agent orchestrator initializes with all 5 specialist agents', () => {
  const o = new WordPressMultiAgentOrchestrator()
  assert.equal(typeof o.specialists.security, 'object')
  assert.equal(typeof o.specialists.performance, 'object')
  assert.equal(typeof o.specialists.updates, 'object')
  assert.equal(typeof o.specialists.rescue, 'object')
  assert.equal(typeof o.specialists.ecommerce, 'object')
  assert.equal(o.specialists.security.id, 'security')
  assert.equal(o.specialists.performance.id, 'performance')
  assert.equal(o.specialists.updates.id, 'updates')
  assert.equal(o.specialists.rescue.id, 'rescue')
  assert.equal(o.specialists.ecommerce.id, 'ecommerce')
})

test('safety controller enforces authority rules and identifies destructive tools', () => {
  // Read tool in 'report' mode
  const readCheck = SAFETY_CONTROLLER.evaluateToolCall('site_info', 'report')
  assert.equal(readCheck.permitted, true)
  assert.equal(readCheck.needsApproval, false)

  // Mutating tool in 'report' mode
  const mutReport = SAFETY_CONTROLLER.evaluateToolCall('set_plugin_state', 'report', { plugin: 'test' })
  assert.equal(mutReport.permitted, false)
  assert.equal(mutReport.needsApproval, true)

  // Mutating tool in 'auto' mode
  const mutAuto = SAFETY_CONTROLLER.evaluateToolCall('set_plugin_state', 'auto', { plugin: 'test' })
  assert.equal(mutAuto.permitted, true)
  assert.equal(mutAuto.needsApproval, false)

  // Sensitive/destructive tool in 'auto' mode MUST still require approval
  const destAuto = SAFETY_CONTROLLER.evaluateToolCall('delete_file', 'auto')
  assert.equal(destAuto.permitted, false)
  assert.equal(destAuto.needsApproval, true)
  assert.equal(destAuto.classification, 'sensitive')
})

test('safety controller builds valid rollback plans for reversible actions', () => {
  const rollbackActivate = SAFETY_CONTROLLER.buildRollbackPlan('plugin_activate', { plugin: 'akismet/akismet.php' })
  assert.deepEqual(rollbackActivate, {
    tool: 'plugin_deactivate',
    args: { plugin: 'akismet/akismet.php' },
  })

  const rollbackDeactivate = SAFETY_CONTROLLER.buildRollbackPlan('plugin_deactivate', { plugin: 'akismet/akismet.php' })
  assert.deepEqual(rollbackDeactivate, {
    tool: 'plugin_activate',
    args: { plugin: 'akismet/akismet.php' },
  })

  const nonReversible = SAFETY_CONTROLLER.buildRollbackPlan('unknown_tool', {})
  assert.equal(nonReversible, null)
})

test('orchestrator deterministic summary formats all domain findings accurately', () => {
  const sampleResults = {
    security: {
      threats: [{ type: 'core_tampering', title: 'فایل wp-config دستکاری شده' }],
      score: 50,
    },
    performance: {
      autoloadSizeKb: 1200,
      score: 60,
    },
    updates: {
      core: { updateAvailable: true },
      plugins: { pending: 3 },
    },
    rescue: {
      isDegraded: true,
      suspectPlugins: ['woocommerce-gateway-stripe'],
    },
    ecommerce: {
      isWooCommerceActive: true,
    },
  }

  const summary = orchestrator.renderDeterministicSummary(sampleResults)
  assert.match(summary, /امنیت:/)
  assert.match(summary, /1 مورد مشکوک/)
  assert.match(summary, /عملکرد:/)
  assert.match(summary, /1200 KB/)
  assert.match(summary, /به‌روزرسانی:/)
  assert.match(summary, /3 افزونه/)
  assert.match(summary, /عملیات نجات:/)
  assert.match(summary, /woocommerce-gateway-stripe/)
})

test('orchestrator runs audit with simulated connector responses', async () => {
  const mockSite = {
    id: 'site-test-123',
    url: 'https://example.com',
    secret: 'test-secret',
    site_key: 'test-key',
    authority: 'confirm',
  }

  const res = await orchestrator.runAudit(mockSite, { query: 'وضعیت سلامت سایتم چطوره؟' })
  assert.equal(res.siteId, 'site-test-123')
  assert.equal(res.authority, 'confirm')
  assert.ok(res.summary.length > 0)
  assert.ok(typeof res.details, 'object')
})
