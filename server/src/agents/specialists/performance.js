// ============================================================
// Performance & Database Specialist Sub-Agent
// ============================================================
import * as connector from '../../connector.js'
import { t } from '../../i18n.js'

export const PERFORMANCE_AGENT = {
  id: 'performance',
  nameKey: 'agents.specialists.performance.name',
  roleKey: 'agents.specialists.performance.role',
  systemPrompt: `You are the WordPress performance and speed specialist agent.
Your job:
1. Check the size of autoloaded options in the wp_options table.
2. Find expired transients and database tables with overhead.
3. Watch load time, server response time (TTFB) and the state of caching plugins (LiteSpeed / WP Rocket / Redis Object Cache).
4. Produce standard instructions and commands for slimming the site down and speeding up page loads.`,

  tools: [
    'autoload_audit',
    'query_profile',
    'transient_cleanup',
    'table_optimize',
    'cache_flush',
    'speed_audit',
  ],

  async analyze(target, options = {}) {
    const findings = {
      autoloadSizeKb: 0,
      expiredTransients: 0,
      heavyTables: [],
      recommendations: [],
      score: 100,
    }

    try {
      // 1. Audit autoload options size
      const autoloadRes = await connector.callTool(target, 'autoload_audit', {}).catch((err) => ({ error: err.message }))
      if (autoloadRes && !autoloadRes.error) {
        const payload = autoloadRes?.content?.[0]?.text ? JSON.parse(autoloadRes.content[0].text) : autoloadRes
        const sizeKb = Number(payload?.total_size_kb || payload?.size_kb || 0)
        findings.autoloadSizeKb = sizeKb
        if (sizeKb > 800) {
          findings.score -= 25
          findings.recommendations.push({
            type: 'autoload_bloat',
            title: t(options.locale, 'agents.performance.autoloadTitle', { size: sizeKb }),
            action: t(options.locale, 'agents.performance.autoloadAction'),
            impact: 'high',
          })
        }
      }

      // 2. Audit database tables / transients
      const dbRes = await connector.callTool(target, 'database_info', {}).catch((err) => ({ error: err.message }))
      if (dbRes && !dbRes.error) {
        const payload = dbRes?.content?.[0]?.text ? JSON.parse(dbRes.content[0].text) : dbRes
        if (payload?.overhead_mb && Number(payload.overhead_mb) > 10) {
          findings.score -= 15
          findings.recommendations.push({
            type: 'table_optimize',
            title: t(options.locale, 'agents.performance.overheadTitle', { size: Number(payload.overhead_mb) }),
            action: t(options.locale, 'agents.performance.overheadAction'),
            impact: 'medium',
          })
        }
      }
    } catch (e) {
      findings.recommendations.push({ type: 'error', title: t(options.locale, 'agents.performance.failed', { error: e.message }) })
    }

    findings.score = Math.max(0, findings.score)
    findings.status = findings.score >= 85 ? 'good' : findings.score >= 60 ? 'fair' : 'poor'
    return findings
  }
}
