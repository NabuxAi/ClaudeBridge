// ============================================================
// Security Specialist Sub-Agent (عامل تخصصی امنیت و سلامت کد)
// ============================================================
import * as connector from '../../connector.js'

export const SECURITY_AGENT = {
  id: 'security',
  name: 'متخصص امنیت و تشخیص بدافزار',
  role: 'تحلیل نفوذ، اعتبارسنجی یکپارچگی فایل‌های هسته، اسکن امضا‌های مخرب و بررسی آسیب‌پذیری‌های CVE',
  systemPrompt: `شما «عامل تخصصی امنیت وردپرس» هستید.
وظیفه شما:
۱. تحلیل گزارش‌های امنیتی، اسکن کدهای مخرب (YARA/Signatures) و فایل‌های تغییریافته هسته وردپرس.
۲. تطبیق نسخه‌های افزونه‌ها و قالب‌ها با پایگاه‌های داده آسیب‌پذیری (CVE/NVD/WPScan).
۳. بررسی دسترسی‌های مشکوک، کاربران مدیر ناشناس و فایل‌های آپلود شده خطرناک (مانند فایلهای PHP در پوشه uploads).
۴. ارائه راهکار رفع خطر با اولویت ایزوله‌سازی و حفظ پایداری سایت.

قوانین امنیتی:
- هیچ‌گاه تغییری مخرب بدون ثبت پیشنهاد (Proposal) ایجاد نکنید.
- گزارش‌ها باید شفاف، مستند به لاگ واقعی و به زبان فارسی روان باشند.`,
  
  tools: [
    'security_scan',
    'checksum_verify',
    'core_verify',
    'vulnerability_check',
    'file_integrity_check',
    'admin_users_audit',
  ],

  async analyze(target, options = {}) {
    const findings = {
      threats: [],
      warnings: [],
      checksumIssues: [],
      vulnerabilities: [],
      score: 100,
    }

    try {
      // 1. Run core checksum verification
      const checksumRes = await connector.callTool(target, 'checksum_verify', {}).catch((err) => ({ error: err.message }))
      if (checksumRes && !checksumRes.error) {
        const payload = checksumRes?.content?.[0]?.text ? JSON.parse(checksumRes.content[0].text) : checksumRes
        if (payload?.modified_files?.length) {
          findings.checksumIssues = payload.modified_files
          findings.score -= Math.min(30, payload.modified_files.length * 10)
          findings.threats.push({
            type: 'core_tampering',
            title: `${payload.modified_files.length} فایل از هسته اصلی وردپرس تغییر یافته است`,
            details: payload.modified_files.slice(0, 5),
          })
        }
      }

      // 2. Run security scanner (YARA heuristics)
      const scanRes = await connector.callTool(target, 'security_scan', { quick: options.quick ?? true }).catch((err) => ({ error: err.message }))
      if (scanRes && !scanRes.error) {
        const payload = scanRes?.content?.[0]?.text ? JSON.parse(scanRes.content[0].text) : scanRes
        if (payload?.threats?.length) {
          findings.threats.push(...payload.threats)
          findings.score -= Math.min(50, payload.threats.length * 20)
        }
      }
    } catch (e) {
      findings.warnings.push(`بررسی کامل امنیتی با خطا مواجه شد: ${e.message}`)
    }

    findings.score = Math.max(0, findings.score)
    findings.status = findings.score >= 90 ? 'clean' : findings.score >= 60 ? 'warning' : 'critical'
    return findings
  }
}
