// ============================================================
// Conflict & Rescue Specialist Sub-Agent
// ============================================================
import * as connector from '../../connector.js'
import { t } from '../../i18n.js'

export const RESCUE_AGENT = {
  id: 'rescue',
  nameKey: 'agents.specialists.rescue.name',
  roleKey: 'agents.specialists.rescue.role',
  systemPrompt: `You are the WordPress rescue and conflict-resolution specialist agent.
Your job:
1. Analyse PHP error logs (error.log / debug.log) and find the stack traces of fatal errors and white screens (WSOD).
2. Run a binary bisect to find quickly which plugin or function broke the site.
3. When the site is down, propose deactivating the offending plugin specifically, keeping a record so it can be re-activated.
4. Reset transient keys and locks, and clear a stale maintenance file.`,

  tools: [
    'error_log_tail',
    'conflict_bisect',
    'plugin_toggle',
    'plugin_deactivate',
    'rescue_snapshot',
    'maintenance_mode',
    'transient_cleanup',
  ],

  async diagnose(target, options = {}) {
    const report = {
      isDegraded: false,
      fatalErrors: [],
      suspectPlugins: [],
      actions: [],
    }

    try {
      // 1. Read latest error logs from the site
      const logRes = await connector.callTool(target, 'error_log_tail', { lines: 50 }).catch((err) => ({ error: err.message }))
      if (logRes && !logRes.error) {
        const raw = logRes?.content?.[0]?.text ? JSON.parse(logRes.content[0].text) : logRes
        const errors = raw?.errors || raw?.lines || []
        const fatalList = errors.filter((l) => typeof l === 'string' && (l.includes('Fatal error') || l.includes('Parse error') || l.includes('Uncaught Error')))
        if (fatalList.length) {
          report.isDegraded = true
          report.fatalErrors = fatalList.slice(0, 5)
          
          // Extract plugin paths from error lines
          for (const err of fatalList) {
            const match = err.match(/wp-content\/plugins\/([^/]+)/)
            if (match && match[1] && !report.suspectPlugins.includes(match[1])) {
              report.suspectPlugins.push(match[1])
            }
          }
        }
      }
    } catch (e) {
      report.actions.push(t(options.locale, 'agents.rescue.logsFailed', { error: e.message }))
    }

    return report
  }
}
