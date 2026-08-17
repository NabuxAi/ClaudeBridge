// ============================================================
// Safety, Classification & Rollback Controller (سطح کنترل ایمنی و مهار ریسک)
// ============================================================
import { classify, permits } from '../authority.js'

export const SAFETY_CONTROLLER = {
  /**
   * Verify if a tool can be executed automatically or requires human confirmation.
   * @param {string} toolName
   * @param {string} authorityLevel 'report' | 'confirm' | 'auto'
   * @param {object} args Tool arguments
   */
  evaluateToolCall(toolName, authorityLevel, args = {}) {
    const outcome = permits(authorityLevel, toolName, args)

    return {
      tool: toolName,
      classification: outcome.kind,
      permitted: outcome.allowed,
      needsApproval: !outcome.allowed,
      reason: outcome.reason || '',
      rollbackPossible: this.canRollback(toolName),
    }
  },

  /**
   * Determine whether an automated rollback recipe can be constructed for a tool.
   */
  canRollback(toolName) {
    const reversible = [
      'plugin_activate',
      'plugin_deactivate',
      'theme_activate',
      'option_update',
      'transient_delete',
      'backup_run',
    ]
    return reversible.includes(toolName)
  },

  /**
   * Build reverse action payload where applicable
   */
  buildRollbackPlan(toolName, originalArgs = {}, currentState = {}) {
    switch (toolName) {
      case 'plugin_activate':
        return { tool: 'plugin_deactivate', args: { plugin: originalArgs.plugin } }
      case 'plugin_deactivate':
        return { tool: 'plugin_activate', args: { plugin: originalArgs.plugin } }
      case 'option_update':
        return { tool: 'option_update', args: { option: originalArgs.option, value: currentState.previousValue } }
      default:
        return null
    }
  }
}
