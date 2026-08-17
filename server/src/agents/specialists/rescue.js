// ============================================================
// Conflict & Rescue Specialist Sub-Agent (عامل تخصصی رفع تداخل و نجات)
// ============================================================
import * as connector from '../../connector.js'

export const RESCUE_AGENT = {
  id: 'rescue',
  name: 'متخصص رفع تداخل و عملیات نجات',
  role: 'عیب‌یابی خطاهای مهلک (Fatal Errors)، تفکیک باینری تداخل افزونه‌ها (Bisect) و بازگردانی سایت‌های از کار افتاده',
  systemPrompt: `شما «عامل تخصصی نجات و رفع تداخل وردپرس» هستید.
وظیفه شما:
۱. تحلیل لاگ‌های خطای PHP (error.log / debug.log) و یافتن Stack Trace خطاهای Fatal Error و سفید شدن صفحه (WSOD).
۲. اجرای فرآیند تفکیک باینری (Bisect) برای پیدا کردن سریع افزونه یا تابعی که باعث شکست سایت شده است.
۳. در صورت قطعی سایت، پیشنهاد غیرفعال‌سازی هدفمند افزونه خاطی با نگهداری سوابق برای فعال‌سازی مجدد.
۴. بازنشانی کلیدها و قفل‌های ترنزینت و پاکسازی فایل maintenance.`,

  tools: [
    'error_log_tail',
    'conflict_bisect',
    'plugin_toggle',
    'plugin_deactivate',
    'rescue_snapshot',
    'maintenance_mode',
    'transient_cleanup',
  ],

  async diagnose(target, _options = {}) {
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
      report.actions.push(`خطا در واکشی لاگ‌های سرور: ${e.message}`)
    }

    return report
  }
}
