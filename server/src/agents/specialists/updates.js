// ============================================================
// Updates & Compatibility Specialist Sub-Agent
// ============================================================
import * as connector from '../../connector.js'
import { t } from '../../i18n.js'
import { updatesFromStatus } from '../../live.js'

export const UPDATES_AGENT = {
  id: 'updates',
  nameKey: 'agents.specialists.updates.name',
  roleKey: 'agents.specialists.updates.role',
  systemPrompt: `You are the WordPress updates and compatibility specialist agent.
Your job:
1. Analyse the queue of pending updates (core, plugins and themes).
2. Check that the active PHP version meets the requirements of the new plugin versions.
3. Make sure a snapshot/backup is recorded before any change runs.
4. Verify the site's health after an update (check the homepage and wp-login.php respond).`,

  tools: [
    'update_status',
    'plugin_list',
    'theme_list',
    'backup_run',
    'job_start',
    'health_check',
  ],

  async analyze(target, options = {}) {
    const findings = {
      core: { current: null, latest: null, updateAvailable: false },
      plugins: { total: 0, pending: 0, items: [] },
      themes: { total: 0, pending: 0, items: [] },
      phpVersion: null,
      recommendations: [],
    }

    try {
      const statusRes = await connector.callTool(target, 'update_status', {}).catch((err) => ({ error: err.message }))
      if (statusRes && !statusRes.error) {
        const raw = statusRes?.content?.[0]?.text ? JSON.parse(statusRes.content[0].text) : statusRes
        const live = updatesFromStatus(raw, options.locale)
        if (live) {
          findings.core.current = live.wpVersion
          findings.core.latest = live.wpLatest
          findings.core.updateAvailable = Boolean(live.wpVersion && live.wpLatest && live.wpVersion !== live.wpLatest)

          const queue = live.queue || []
          findings.plugins.items = queue.filter((q) => q.type === 'plugin')
          findings.plugins.pending = findings.plugins.items.length

          findings.themes.items = queue.filter((q) => q.type === 'theme')
          findings.themes.pending = findings.themes.items.length

          if (findings.core.updateAvailable) {
            findings.recommendations.push({
              type: 'core_update',
              title: t(options.locale, 'agents.updates.coreTitle', { version: live.wpLatest }),
              risk: 'medium',
            })
          }
          if (findings.plugins.pending > 0) {
            findings.recommendations.push({
              type: 'plugin_updates',
              title: t(options.locale, 'agents.updates.pluginsTitle', { count: findings.plugins.pending }),
              items: findings.plugins.items.map((p) => p.name),
              risk: 'low',
            })
          }
        }
      }
    } catch (e) {
      findings.recommendations.push({ type: 'error', title: t(options.locale, 'agents.updates.failed', { error: e.message }) })
    }

    return findings
  }
}
