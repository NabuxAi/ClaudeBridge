// ============================================================
// Where each panel view's data actually comes from.
//
// The panel showed seed data indistinguishable from measurement: "99.98%
// uptime", "24 blocked login attempts", "1.8 GB backup verified". None of it
// was measured, and a customer cannot tell which numbers to trust — so they
// end up trusting none of them, including the ones that are real.
//
// This module makes provenance explicit. Every view declares which fields come
// from the site, and anything without a source is reported as not-yet-built
// rather than filled in with something plausible. A feature that says "not
// measured yet" is honest; the same screen showing an invented number is not.
// ============================================================

/**
 * Provenance for each view.
 *
 *   live    — the connector tools that supply it
 *   missing — what has no source at all, and why
 */
export const PROVENANCE = {
  overview: {
    live: ['site_info'],
    partial: {
      uptime: 'نیازمند پایش مستمر از سمت ما — هنوز ساخته نشده',
      responseMs: 'نیازمند پایش مستمر — هنوز ساخته نشده',
    },
  },
  updates: {
    live: ['update_status'],
    partial: {},
  },
  security: {
    live: ['core_integrity', 'security_scan'],
    partial: {
      score: 'امتیاز ترکیبی — تا وقتی همهٔ ورودی‌هایش واقعی نشده، محاسبه نمی‌شود',
      blockedLogins: 'نیازمند ثبت رویداد ورود روی سایت — هنوز ساخته نشده',
    },
  },
  incidents: {
    live: [],
    unavailable: 'ثبت رخداد هنوز ساخته نشده. برای این بخش هیچ دادهٔ واقعی وجود ندارد.',
  },
  backups: {
    live: [],
    unavailable: 'سیستم پشتیبان‌گیری هنوز ساخته نشده. هیچ بکاپی گرفته نمی‌شود.',
  },
}

/**
 * Turn the plugin's update_status into what the panel's updates view expects.
 *
 * Risk is derived from what the update actually is, not invented: a major
 * version jump earns a warning because it can break a site, a patch does not.
 * Nothing here claims an update was "tested on staging" — there is no staging.
 */
export function updatesFromStatus(status) {
  if (!status || typeof status !== 'object') return null

  const queue = []

  if (status.core_outdated && status.wp_latest) {
    queue.push({
      id: 'core',
      name: 'WordPress Core',
      from: status.wp_version,
      to: status.wp_latest,
      type: 'هسته',
      ...riskOf(status.wp_version, status.wp_latest),
    })
  }
  for (const p of status.plugins_pending || []) {
    queue.push({
      id: `plugin:${p.name}`,
      name: p.name,
      from: p.from,
      to: p.to,
      type: 'افزونه',
      ...riskOf(p.from, p.to),
    })
  }
  for (const t of status.themes_pending || []) {
    queue.push({
      id: `theme:${t.name}`,
      name: t.name,
      from: t.from,
      to: t.to,
      type: 'قالب',
      ...riskOf(t.from, t.to),
    })
  }

  return {
    queue,
    // The site reports what is pending, not what it has already installed —
    // WordPress keeps no durable log of that. Claiming a completed list would
    // be inventing history.
    done: [],
    doneNote: 'وردپرس تاریخچهٔ ماندگاری از به‌روزرسانی‌های انجام‌شده نگه نمی‌دارد؛ این فهرست از گزارش خود سایت ساخته می‌شود.',
    wpVersion: status.wp_version,
    wpLatest: status.wp_latest,
    phpVersion: status.php_version,
    policy: status.policy || null,
    checkedAt: status.checked_at ? status.checked_at * 1000 : null,
  }
}

/** A major version jump can break a site; a patch rarely does. */
function riskOf(from, to) {
  const major = (v) => Number(String(v || '').split('.')[0]) || 0
  const minor = (v) => Number(String(v || '').split('.')[1]) || 0
  if (!from || !to) return { risk: 'low', riskLabel: 'کم‌ریسک', authority: 'auto' }
  if (major(to) > major(from)) {
    return { risk: 'high', riskLabel: 'نسخهٔ اصلی جدید', authority: 'confirm' }
  }
  if (minor(to) > minor(from)) {
    return { risk: 'medium', riskLabel: 'نسخهٔ میانی', authority: 'confirm' }
  }
  return { risk: 'low', riskLabel: 'وصلهٔ جزئی', authority: 'auto' }
}
