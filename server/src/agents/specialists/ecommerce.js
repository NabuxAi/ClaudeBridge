// ============================================================
// WooCommerce & Business Transactions Specialist Sub-Agent
//
// Prompts are English (the model is told the reply language by the
// orchestrator); text shown to people is rendered from the `agents` namespace
// in `options.locale`.
// ============================================================
import * as connector from '../../connector.js'
import { t } from '../../i18n.js'

export const ECOMMERCE_AGENT = {
  id: 'ecommerce',
  nameKey: 'agents.specialists.ecommerce.name',
  roleKey: 'agents.specialists.ecommerce.role',
  systemPrompt: `You are the WooCommerce and WordPress store specialist agent.
Your job:
1. Monitor payment gateways, make sure their callbacks are healthy and the Checkout page returns no 500 errors.
2. Review orders that are stuck on hold or pending payment for an unusual time, and database errors in the orders tables.
3. Watch WooCommerce's scheduled-task queue (Action Scheduler) and unblock stalled automated cron runs.`,

  tools: [
    'wc_status',
    'wc_gateways_check',
    'wc_pending_orders',
    'action_scheduler_status',
    'cron_status',
  ],

  async check(target, options = {}) {
    const report = {
      isWooCommerceActive: false,
      gateways: [],
      pendingOrdersCount: 0,
      schedulerBlocked: false,
      issues: [],
    }

    try {
      const wcRes = await connector.callTool(target, 'plugin_list', {}).catch((err) => ({ error: err.message }))
      if (wcRes && !wcRes.error) {
        const raw = wcRes?.content?.[0]?.text ? JSON.parse(wcRes.content[0].text) : wcRes
        const plugins = Array.isArray(raw?.plugins) ? raw.plugins : []
        const hasWc = plugins.some((p) => (p.name || '').toLowerCase().includes('woocommerce') && p.active)
        report.isWooCommerceActive = hasWc
      }
    } catch (e) {
      report.issues.push(t(options.locale, 'agents.ecommerce.checkFailed', { error: e.message }))
    }

    return report
  }
}
