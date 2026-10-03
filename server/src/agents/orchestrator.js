// ============================================================
// Multi-Agent WordPress Support Orchestrator (L0 Supervisor)
//
// Language: `options.locale` (the caller's req.locale, or the owner's
// users.lang for unattended runs) decides the language of everything a person
// reads — specialist findings, the deterministic summary, and the model's
// reply, which the English system prompt asks for in that language.
// ============================================================
import { SECURITY_AGENT } from './specialists/security.js'
import { PERFORMANCE_AGENT } from './specialists/performance.js'
import { UPDATES_AGENT } from './specialists/updates.js'
import { RESCUE_AGENT } from './specialists/rescue.js'
import { ECOMMERCE_AGENT } from './specialists/ecommerce.js'
import { SAFETY_CONTROLLER } from './safety.js'
import { completionsEndpoint, plainReply, languageName } from '../assistant.js'
import { config } from '../config.js'
import * as events from '../events.js'
import * as proposalStore from '../proposals.js'
import * as connector from '../connector.js'
import { readAuthority } from '../authority.js'
import { t, DEFAULT_LOCALE } from '../i18n.js'

export class WordPressMultiAgentOrchestrator {
  constructor() {
    this.specialists = {
      security: SECURITY_AGENT,
      performance: PERFORMANCE_AGENT,
      updates: UPDATES_AGENT,
      rescue: RESCUE_AGENT,
      ecommerce: ECOMMERCE_AGENT,
    }
  }

  /**
   * Run full multi-agent diagnostic review on a site
   * @param {object} site Site record with url, secret, authority
   * @param {object} options Optional parameters { scope, query }
   */
  async runAudit(site, options = {}) {
    const target = { url: site.url, secret: site.secret, siteKey: site.site_key }
    const authorityLevel = readAuthority(site.authority)

    const specialistResults = {}

    // Run specialists in parallel where appropriate
    const [sec, perf, upd, rsc, ecom] = await Promise.allSettled([
      this.specialists.security.analyze(target, options),
      this.specialists.performance.analyze(target, options),
      this.specialists.updates.analyze(target, options),
      this.specialists.rescue.diagnose(target, options),
      this.specialists.ecommerce.check(target, options),
    ])

    specialistResults.security = sec.status === 'fulfilled' ? sec.value : { error: sec.reason?.message }
    specialistResults.performance = perf.status === 'fulfilled' ? perf.value : { error: perf.reason?.message }
    specialistResults.updates = upd.status === 'fulfilled' ? upd.value : { error: upd.reason?.message }
    specialistResults.rescue = rsc.status === 'fulfilled' ? rsc.value : { error: rsc.reason?.message }
    specialistResults.ecommerce = ecom.status === 'fulfilled' ? ecom.value : { error: ecom.reason?.message }

    // Build synthesized report with NabuGate model
    const synthesis = await this.synthesizeReport({
      site,
      authorityLevel,
      query: options.query,
      results: specialistResults,
      locale: options.locale,
    })

    return {
      siteId: site.id,
      timestamp: new Date().toISOString(),
      authority: authorityLevel,
      summary: synthesis.summary,
      proposals: synthesis.proposals || [],
      performedActions: synthesis.performedActions || [],
      details: specialistResults,
    }
  }

  /**
   * Use NabuGate AI gateway to synthesize insights and generate actionable advice
   * in the reader's language.
   */
  async synthesizeReport({ site, authorityLevel, query, results, locale = DEFAULT_LOCALE }) {
    const target = { url: site.url, secret: site.secret, siteKey: site.site_key }
    const proposals = []
    const performedActions = []

    // If NabuGate is configured, query the model
    if (config.assistantUrl && config.assistantApiKey) {
      try {
        const endpoint = completionsEndpoint(config.assistantUrl)
        const systemPrompt = `You are the supervisor of DigiWP / NabuGate's multi-layer WordPress support.
Your job is to assess the findings of five specialist agents (security, speed and database, updates, rescue operations, and WooCommerce) and give a direct, clear and practical report. Always write the report in ${languageName(locale)}, the site owner's language.

Rules:
1. Never invent a number or a claim; report only from the agents' real data.
2. If there is an acute problem (malware, a fatal error, a large autoload), say which fix comes first.
3. When an action is needed, name the exact tool and its parameters.
4. The site's authority level is "${authorityLevel}".`

        const userMessage = query
          ? `The user's question or request: ${query}\n\nSpecialist findings:\n${JSON.stringify(results, null, 2)}`
          : `Periodic site health review. Specialist findings:\n${JSON.stringify(results, null, 2)}`

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.assistantApiKey}`,
          },
          body: JSON.stringify({
            model: config.assistantModel || 'nabu-smart',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.2,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const rawText = data.choices?.[0]?.message?.content
          const summary = plainReply(rawText)

          // Process actionable recommendations into proposals
          if (results.updates?.recommendations?.length) {
            for (const rec of results.updates.recommendations) {
              const evalRes = SAFETY_CONTROLLER.evaluateToolCall('job_start', authorityLevel, { job_type: 'update_run' })
              if (evalRes.needsApproval) {
                const prop = {
                  tool: 'job_start',
                  arguments: { job_type: 'update_run' },
                  reason: rec.title,
                }
                proposals.push(prop)
                await this.persistProposal(site.id, prop)
              }
            }
          }

          return { summary, proposals, performedActions }
        }
      } catch (e) {
        console.warn('NabuGate synthesis fallback:', e.message)
      }
    }

    // Deterministic fallback if NabuGate is unavailable
    const fallbackSummary = this.renderDeterministicSummary(results, locale)
    return { summary: fallbackSummary, proposals, performedActions }
  }

  /**
   * Deterministic summary, in `locale`, when the AI gateway is offline.
   */
  renderDeterministicSummary(results, locale = DEFAULT_LOCALE) {
    const tr = (key, vars) => t(locale, key, vars)
    const lines = []

    // Security
    if (results.security?.threats?.length) {
      lines.push(`⚠️ ${tr('agents.summary.securityThreats', { count: results.security.threats.length })}`)
    } else {
      lines.push(`✅ ${tr('agents.summary.securityClean')}`)
    }

    // Performance
    if (results.performance?.autoloadSizeKb > 800) {
      lines.push(`⚡ ${tr('agents.summary.performanceHeavy', { size: results.performance.autoloadSizeKb })}`)
    } else {
      lines.push(`⚡ ${tr('agents.summary.performanceOk')}`)
    }

    // Updates
    if (results.updates?.plugins?.pending > 0 || results.updates?.core?.updateAvailable) {
      lines.push(`🔄 ${tr('agents.summary.updatesPending', { count: results.updates.plugins?.pending || 0 })}`)
    } else {
      lines.push(`🔄 ${tr('agents.summary.updatesNone')}`)
    }

    // Rescue
    if (results.rescue?.isDegraded) {
      lines.push(`🚨 ${tr('agents.summary.rescueFatal', { plugins: results.rescue.suspectPlugins.join(tr('agents.summary.listSep')) })}`)
    }

    return lines.join('\n')
  }

  async persistProposal(siteId, prop) {
    try {
      await proposalStore.record(siteId, prop.tool, prop.arguments || {}, prop.reason)
      await events.record(siteId, {
        kind: 'proposal_created',
        severity: 'info',
        title: t('en', 'events.proposal.recorded', { tool: prop.tool }),
        detail: { reason: prop.reason, i18n: { key: 'events.proposal.recorded', vars: { tool: prop.tool } } },
      })
    } catch {
      // Ignored if DB write fails in memory tests
    }
  }
}

export const orchestrator = new WordPressMultiAgentOrchestrator()
