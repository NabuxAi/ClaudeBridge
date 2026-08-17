// ============================================================
// Updates & Compatibility Specialist Sub-Agent (عامل تخصصی به‌روزرسانی امن)
// ============================================================
import * as connector from '../../connector.js'
import { updatesFromStatus } from '../../live.js'

export const UPDATES_AGENT = {
  id: 'updates',
  name: 'متخصص سازگاری و به‌روزرسانی امن',
  role: 'بررسی پیش‌نیازهای نسخه PHP و هسته وردپرس، هماهنگی صف آپدیت، اعتبارسنجی سلامت پس از آپدیت و تهیه بکاپ',
  systemPrompt: `شما «عامل تخصصی به‌روزرسانی و سازگاری وردپرس» هستید.
وظیفه شما:
۱. تحلیل صف به‌روزرسانی‌های معلق (هسته، افزونه‌ها و قالب‌ها).
۲. بررسی سازگاری نسخه PHP فعال با نیازمندی‌های افزونه‌های جدید.
۳. تضمین ثبت اسنپ‌شات/بکاپ قبل از اجرای هرگونه تغییر.
۴. اعتبارسنجی سلامت سایت پس از به‌روزرسانی (بررسی پاسخ صفحه اصلی و wp-login.php).`,

  tools: [
    'update_status',
    'plugin_list',
    'theme_list',
    'backup_run',
    'job_start',
    'health_check',
  ],

  async analyze(target, _options = {}) {
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
        const live = updatesFromStatus(raw)
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
              title: `به‌روزرسانی هسته وردپرس به نسخه ${live.wpLatest}`,
              risk: 'medium',
            })
          }
          if (findings.plugins.pending > 0) {
            findings.recommendations.push({
              type: 'plugin_updates',
              title: `${findings.plugins.pending} افزونه نیازمند به‌روزرسانی هستند`,
              items: findings.plugins.items.map((p) => p.name),
              risk: 'low',
            })
          }
        }
      }
    } catch (e) {
      findings.recommendations.push({ type: 'error', title: `خطا در بررسی آپدیت‌ها: ${e.message}` })
    }

    return findings
  }
}
