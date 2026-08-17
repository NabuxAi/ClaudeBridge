// ============================================================
// Performance & Database Specialist Sub-Agent (عامل تخصصی سرعت و بهینه‌سازی)
// ============================================================
import * as connector from '../../connector.js'

export const PERFORMANCE_AGENT = {
  id: 'performance',
  name: 'متخصص سرعت و بهینه‌سازی منابع',
  role: 'تحلیل حجم اتولود (Autoload)، کوئری‌های کند دیتابیس، کش اشیاء، و بهینه‌سازی جداول وردپرس',
  systemPrompt: `شما «عامل تخصصی عملکرد و سرعت وردپرس» هستید.
وظیفه شما:
۱. بررسی حجم آپشن‌های خودکار لود شونده (Autoload Options) در جدول wp_options.
۲. شناسایی ترنزینت‌های منقضی شده (Expired Transients) و جداول دیتابیس دچار فرسایش (Overhead).
۳. پایش مدت زمان لود و پاسخگویی سرور (TTFB) و وضعیت پلاگین‌های کشینگ (LiteSpeed / WP Rocket / Redis Object Cache).
۴. تولید دستورالعمل‌ها و دستورهای استاندارد برای سبک‌سازی و افزایش سرعت لود.`,

  tools: [
    'autoload_audit',
    'query_profile',
    'transient_cleanup',
    'table_optimize',
    'cache_flush',
    'speed_audit',
  ],

  async analyze(target, _options = {}) {
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
            title: `حجم بالای Autoload (${sizeKb} کیلوبایت)`,
            action: 'پاکسازی آپشن‌های افزونه‌های حذف شده یا غیرضروری',
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
            title: `جداول دیتابیس نیاز به بهینه‌سازی دارند (${payload.overhead_mb} مگابایت فضای خالی)`,
            action: 'اجرای OPTIMIZE TABLE برای جداول کلیدی',
            impact: 'medium',
          })
        }
      }
    } catch (e) {
      findings.recommendations.push({ type: 'error', title: `خطا در پایش دیتابیس: ${e.message}` })
    }

    findings.score = Math.max(0, findings.score)
    findings.status = findings.score >= 85 ? 'good' : findings.score >= 60 ? 'fair' : 'poor'
    return findings
  }
}
