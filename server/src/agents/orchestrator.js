// ============================================================
// Multi-Agent WordPress Support Orchestrator (L0 Supervisor)
// مدیر هماهنگی و عارضه‌یابی چند لایه هوشمند وردپرس
// ============================================================
import { SECURITY_AGENT } from './specialists/security.js'
import { PERFORMANCE_AGENT } from './specialists/performance.js'
import { UPDATES_AGENT } from './specialists/updates.js'
import { RESCUE_AGENT } from './specialists/rescue.js'
import { ECOMMERCE_AGENT } from './specialists/ecommerce.js'
import { SAFETY_CONTROLLER } from './safety.js'
import { completionsEndpoint, plainReply } from '../assistant.js'
import { config } from '../config.js'
import * as events from '../events.js'
import * as proposalStore from '../proposals.js'
import * as connector from '../connector.js'
import { readAuthority } from '../authority.js'

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
   * Use NabuGate AI gateway to synthesize insights and generate actionable Persian advice.
   */
  async synthesizeReport({ site, authorityLevel, query, results }) {
    const target = { url: site.url, secret: site.secret, siteKey: site.site_key }
    const proposals = []
    const performedActions = []

    // If NabuGate is configured, query the model
    if (config.assistantUrl && config.assistantApiKey) {
      try {
        const endpoint = completionsEndpoint(config.assistantUrl)
        const systemPrompt = `شما «سرپرست هوشمند پشتیبانی چند لایه وردپرس (DigiWP / NabuGate)» هستید.
وظیفه شما ارزیابی یافته‌های ۵ عامل تخصصی (امنیت، سرعت و دیتابیس، به‌روزرسانی‌ها، عملیات نجات و ووکامرس) و ارائه گزارشی صریح، شفاف و کاربردی به زبان فارسی است.

اصول کار:
۱. هیچ عدد یا ادعایی را اختراع نکنید؛ تنها بر اساس داده‌های واقعی عوامل گزارش دهید.
۲. اگر مشکلی حاد وجود دارد (بدافزار، خطای مهلک، حجم بالای اتولود)، اولویت رفع آن را مشخص کنید.
۳. در صورت نیاز به اقدام، نوع ابزار و پارامترها را با دقت نام ببرید.
۴. سطح اختیار سایت: «${authorityLevel}» است.`

        const userMessage = query
          ? `پرسش یا درخواست کاربر: ${query}\n\nیافته‌های عوامل تخصصی:\n${JSON.stringify(results, null, 2)}`
          : `بررسی دوره‌ای سلامت سایت. یافته‌های عوامل تخصصی:\n${JSON.stringify(results, null, 2)}`

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
    const fallbackSummary = this.renderDeterministicSummary(results)
    return { summary: fallbackSummary, proposals, performedActions }
  }

  /**
   * Deterministic Persian summary when AI gateway is offline
   */
  renderDeterministicSummary(results) {
    const lines = []
    
    // Security
    if (results.security?.threats?.length) {
      lines.push(`⚠️ امنیت: ${results.security.threats.length} مورد مشکوک یا تغییر در هسته مشاهده شد.`)
    } else {
      lines.push('✅ امنیت: فایل‌های هسته سالم و هیچ بدافزار شناخته‌شده‌ای یافت نشد.')
    }

    // Performance
    if (results.performance?.autoloadSizeKb > 800) {
      lines.push(`⚡ عملکرد: حجم Autoload بالاست (${results.performance.autoloadSizeKb} KB) و نیاز به پاکسازی دارد.`)
    } else {
      lines.push('⚡ عملکرد: وضعیت بارگذاری پایگاه داده در محدوده مطلوب است.')
    }

    // Updates
    if (results.updates?.plugins?.pending > 0 || results.updates?.core?.updateAvailable) {
      lines.push(`🔄 به‌روزرسانی: ${results.updates.plugins.pending} افزونه و هسته نیازمند آپدیت هستند.`)
    } else {
      lines.push('🔄 به‌روزرسانی: تمام افزونه‌ها و هسته وردپرس به‌روز هستند.')
    }

    // Rescue
    if (results.rescue?.isDegraded) {
      lines.push(`🚨 عملیات نجات: خطای مهلک در لاگ‌ها ثبت شده است (افزونه‌های مشکوک: ${results.rescue.suspectPlugins.join('، ')}).`)
    }

    return lines.join('\n')
  }

  async persistProposal(siteId, prop) {
    try {
      await proposalStore.record(siteId, prop.tool, prop.arguments || {}, prop.reason)
      await events.record(siteId, {
        kind: 'proposal_created',
        severity: 'info',
        title: `پیشنهاد اقدام ثبت شد: ${prop.tool}`,
        detail: prop.reason,
      })
    } catch {
      // Ignored if DB write fails in memory tests
    }
  }
}

export const orchestrator = new WordPressMultiAgentOrchestrator()
