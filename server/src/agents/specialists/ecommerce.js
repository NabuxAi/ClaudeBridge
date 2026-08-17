// ============================================================
// WooCommerce & Business Transactions Specialist Sub-Agent
// (عامل تخصصی ووکامرس و پایش تراکنش‌ها)
// ============================================================
import * as connector from '../../connector.js'

export const ECOMMERCE_AGENT = {
  id: 'ecommerce',
  name: 'متخصص فروشگاه ووکامرس و تراکنش‌ها',
  role: 'پایش صف سفارش‌ها، وضعیت درگاه‌های پرداخت فعال، سلامت کران‌های Action Scheduler و ارزیابی فرایند تسویه‌حساب',
  systemPrompt: `شما «عامل تخصصی ووکامرس و فروشگاه وردپرس» هستید.
وظیفه شما:
۱. پایش وضعیت درگاه‌های پرداخت، اطمینان از سلامت کال‌بک‌ها و عدم وجود خطای ۵۰۰ در برگه تسویه‌حساب (Checkout).
۲. بررسی سفارش‌های معلق یا در انتظار پرداخت غیرعادی و خطاهای دیتابیسی جدول سفارشات.
۳. نظارت بر صف وظایف زمان‌بندی شده ووکامرس (Action Scheduler) و رفع مسدودی کران‌های خودکار.`,

  tools: [
    'wc_status',
    'wc_gateways_check',
    'wc_pending_orders',
    'action_scheduler_status',
    'cron_status',
  ],

  async check(target, _options = {}) {
    const report = {
      isWooCommerceActive: false,
      gateways: [],
      pendingOrdersCount: 0,
      schedulerBlocked: false,
      issues: [],
    }

    try {
      const wcRes = await connector.callTool(target, 'plugin_list', {}).catch((err) => ({ error: err.message }))
      if (wcRes && !wcRes.error) {
        const raw = wcRes?.content?.[0]?.text ? JSON.parse(wcRes.content[0].text) : wcRes
        const plugins = Array.isArray(raw?.plugins) ? raw.plugins : []
        const hasWc = plugins.some((p) => (p.name || '').toLowerCase().includes('woocommerce') && p.active)
        report.isWooCommerceActive = hasWc
      }
    } catch (e) {
      report.issues.push(`خطا در بررسی وضعیت افزونه ووکامرس: ${e.message}`)
    }

    return report
  }
}
