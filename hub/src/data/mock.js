// ============================================================
// Demo data for offline preview (VITE_USE_MOCK=1).
// Shapes match what YOUR server is expected to return, so wiring
// the real API later is a drop-in swap (see src/lib/api.js).
// Content mirrors the DigiWP "Panels & Pages" design samples.
// ============================================================

const delay = (v, ms = 260) => new Promise((r) => setTimeout(() => r(v), ms))

export const currentUser = {
  id: 'u_1',
  name: 'مریم رضایی',
  role: 'مدیر حساب',
  email: 'maryam@example.com',
  initials: 'م',
  plan: 'حرفه‌ای',
}

// ---- Auth --------------------------------------------------
export const login = () => delay({ token: 'demo-token', user: currentUser })
export const register = () => delay({ token: 'demo-token', user: currentUser })
export const me = () => delay(currentUser)

// ---- Sites -------------------------------------------------
export const sites = [
  {
    id: 'mystore', name: 'mystore.ir', title: 'فروشگاه من', status: 'healthy',
    authority: 'auto', uptime: null, checks: null, lastCheck: null, incidents: 3, pendingUpdates: null,
  },
  {
    id: 'blog', name: 'blog.myco.ir', title: 'وبلاگ شرکت', status: 'warning',
    authority: 'confirm', uptime: null, checks: null, lastCheck: null, incidents: null, pendingUpdates: null,
  },
  {
    id: 'landing', name: 'promo.myco.ir', title: 'لندینگ کمپین', status: 'checking',
    authority: 'report', uptime: null, checks: null, lastCheck: null, incidents: null, pendingUpdates: null,
  },
]
export const listSites = () => delay(sites)
export const addSite = (b) => {
  const name = (b?.name || 'site.example.ir').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'new'
  return delay({
    id, name, title: b?.title || name, status: 'checking',
    pairing: {
      serverUrl: 'https://api.digiwp.example/v1',
      siteKey: Math.random().toString(16).slice(2, 12),
      secret: Array.from({ length: 8 }, () => Math.random().toString(16).slice(2, 10)).join(''),
      steps: [
        'در سایت مقصد: افزونه‌ها → WP Claude Bridge را نصب و فعال کنید.',
        'ابزارها → Claude Bridge → Hub Connector Mode را باز کنید.',
        'حالت کانکتور را روشن کنید و «Hub server URL» و «Shared secret» بالا را وارد کنید.',
        'ذخیره کنید؛ سپس اینجا «بررسی اتصال» را بزنید.',
      ],
    },
  })
}
export const pingSite = (id) => delay({ ok: true, connector: { site: id, version: '3.5.1' } }, 700)

// ---- Billing / plans --------------------------------------
export const plans = () => delay([
  { id: 'base', name: 'پایه', price: 190000, popular: false, features: [
    '۱ سایت', 'به‌روزرسانی خودکار هسته، افزونه و قالب', 'بکاپ دیتابیس روی خود سایت', 'اسکن امنیتی روزانه',
  ] },
  { id: 'pro', name: 'حرفه‌ای', price: 490000, popular: true, features: [
    '۵ سایت', 'همهٔ امکانات پلن پایه', 'بررسی یکپارچگی فایل‌های هسته', 'بررسی تداخل افزونه و قالب', 'عملیات نجات',
  ] },
  { id: 'agency', name: 'آژانس', price: 990000, popular: false, features: [
    'سایت نامحدود', 'همهٔ امکانات پلن حرفه‌ای', 'گزارش امنیتی روزانه در تلگرام',
  ] },
])
export const billing = () => delay({ provenance: { live: [], unavailable: 'صورتحساب و پرداخت هنوز ساخته نشده — هیچ درگاه پرداختی متصل نیست و کارتی ذخیره نمی‌شود.' } })
export const invoices = () => delay({
  provenance: { live: [], unavailable: 'فاکتوری صادر نمی‌شود چون سیستم پرداخت هنوز وجود ندارد.' },
  list: [],
})
export const invoice = (id) => delay({
  id, date: '۱۴۰۳/۰۴/۱۲', dueDate: '۱۴۰۳/۰۴/۱۲', status: 'paid',
  seller: { name: 'دیجی‌وردپرس (DigiWP Ai Support)', id: 'ai.digiwp.com', taxId: '۱۴۰۱۲۳۴۵۶۷۸' },
  buyer: { name: 'مریم رضایی', email: 'maryam@example.com' },
  items: [{ desc: 'اشتراک پلن حرفه‌ای — یک ماه', qty: 1, unit: 490000 }],
  subtotal: 490000, tax: 44100, total: 534100,
})

// ---- Team --------------------------------------------------
export const team = () => delay({
  provenance: { live: [], unavailable: 'دعوت هم‌تیمی و دسترسی چندکاربره هنوز ساخته نشده. فقط حساب خودتان وجود دارد.' },
  list: [{ id: 'me', name: 'مریم رضایی', email: 'maryam@example.com', role: 'owner', roleLabel: 'مالک', initials: 'م', sites: 'همه' }],
})
export const notifications = () => delay({ provenance: { live: [], unavailable: 'تنظیمات اعلان هنوز ساخته نشده. گزارش امنیتی روزانه فقط به تلگرامی می‌رود که در سرور پیکربندی شده.' } })
export const profile = () => delay({ ...currentUser, twoFactor: true, lang: 'fa', timezone: 'Asia/Tehran' })

// ---- Per-site ---------------------------------------------
// The demo overview shows the same three real readings the live one does —
// an HTTP probe, a TLS handshake, and the event log — and the same absences.
// It used to carry a 99.98% uptime, a host-storage bar and a five-line report
// of work nothing performs.
export const siteOverview = (id) => delay({
  provenance: {
    live: ['site_info', 'HTTP probe', 'TLS handshake'],
    partial: {
      uptime: 'آپ‌تایم نیاز به پایش پیوسته دارد — ما فقط هنگام باز کردن این صفحه بررسی می‌کنیم',
      responseMs: 'یک نمونه از سرور ما، نه میانگین و نه تجربهٔ بازدیدکننده',
      hostSpace: 'فضای دیسک هاست از بیرون قابل اندازه‌گیری نیست',
    },
  },
  id, name: sites.find((s) => s.id === id)?.name || 'mystore.ir',
  status: 'healthy',
  authority: 'auto',
  uptime: null,
  hostSpace: null,
  info: { wp_version: '6.8.2', php_version: '8.2' },
  probe: {
    reachable: true,
    responseMs: 340,
    cert: { ok: true, daysLeft: 68, issuer: "Let's Encrypt", expiresAt: '2026-10-02T00:00:00.000Z' },
  },
  metrics: [
    { label: 'وردپرس', value: '6.8.2', unit: '', icon: 'boxes', tone: 'neutral' },
    { label: 'PHP', value: '8.2', unit: '', icon: 'code', tone: 'neutral' },
    { label: 'پاسخ همین حالا', value: '340', unit: 'ms', icon: 'gauge', tone: 'primary' },
    { label: 'اعتبار SSL', value: '68', unit: 'روز', icon: 'lock', tone: 'success' },
  ],
  services: [
    { label: 'صفحهٔ اصلی', ok: true, detail: '200 در 340ms' },
    { label: 'صفحهٔ ورود مدیریت', ok: true, detail: '200 در 410ms' },
    { label: 'گواهی SSL', ok: true, detail: "68 روز اعتبار — Let's Encrypt" },
  ],
  report: [
    { icon: 'alert-octagon', tone: 'danger', label: 'فایل آلوده پیدا شد: wp-content/uploads/2024/01/x.php', time: '۰۲:۱۴' },
    { icon: 'info', tone: 'info', label: 'سیاست به‌روزرسانی تغییر کرد', time: '۱۸:۳۰' },
    { icon: 'alert-triangle', tone: 'warning', label: 'اقدام حساس اجرا شد: delete_plugin', time: '۱۷:۰۵' },
  ],
  reportEmpty: false,
})

// Demo alerts mirror the real log's shape — including the parts that make it
// honest: a critical still open, its own history as the timeline, and an
// "ignored" entry that is not the same thing as fixed.
const demoEvents = [
  { id: 'ev_1', kind: 'malware', severity: 'critical', title: 'فایل آلوده پیدا شد: wp-content/uploads/2024/01/x.php', resolved: false, time: '۳ روز پیش',
    detail: { file: 'wp-content/uploads/2024/01/x.php', rule: 'webshell_generic_eval' } },
  { id: 'ev_2', kind: 'policy', severity: 'info', title: 'سیاست به‌روزرسانی تغییر کرد', resolved: false, time: 'دیروز' },
  { id: 'ev_3', kind: 'action', severity: 'warning', title: 'اقدام حساس اجرا شد: delete_plugin', resolved: false, time: 'دیروز' },
  { id: 'ev_4', kind: 'malware', severity: 'warning', title: 'فایل مشکوک: wp-content/themes/astra/inc/z.php', resolved: true, time: '۵ روز پیش' },
  { id: 'ev_5', kind: 'scan_failed', severity: 'warning', title: 'اسکن امنیتی به سایت نرسید', resolved: true, time: '۶ روز پیش' },
]

export const siteIncidents = (id) => delay({
  provenance: {
    liveLabel: 'ثبت‌شده روی سرور ما',
    live: ['لاگ رخداد'],
    partial: {
      downtime: 'قطعی بین دو اسکن ثبت نمی‌شود — پایش مستمر هنوز ساخته نشده',
      logins: 'ورودهای ناموفق نیازمند ثبت رویداد ورود روی سایت است — هنوز ساخته نشده',
    },
  },
  id,
  empty: false,
  emptyNote: null,
  featured: {
    id: demoEvents[0].id,
    severity: 'critical',
    title: demoEvents[0].title,
    time: demoEvents[0].time,
    desc: 'این مورد در اسکن دیده شد و هنوز باز است. تا وقتی اسکن بعدی نبودنش را تأیید نکند، حل‌شده علامت نمی‌خورد.',
    fields: [
      { label: 'نوع', value: 'بدافزار' },
      { label: 'اولین مشاهده', value: '۳ روز پیش' },
      { label: 'فایل', value: demoEvents[0].detail.file, mono: true },
      { label: 'قاعدهٔ منطبق', value: demoEvents[0].detail.rule, mono: true },
      { label: 'وضعیت', value: 'هنوز باز است', tone: 'danger' },
    ],
    timeline: [
      { t: '۰۲:۱۴', label: demoEvents[0].title, tone: 'danger' },
      { t: '۰۲:۱۴', label: 'اسکن شبانه — همچنان دیده می‌شود', tone: 'warning' },
    ],
  },
  list: demoEvents.map(({ detail: _detail, ...rest }) => rest),
})

export const dismissIncident = (id, eventId) => delay({ ok: true, eventId })

export const siteUpdates = (id) => delay({
  provenance: { live: ['update_status'], partial: {} },

  id,
  queue: [
    { id: 'u1', name: 'Elementor', from: '3.21.4', to: '3.23.0', type: 'افزونه', risk: 'high', riskLabel: 'ریسک بالا',
      note: 'جهش نسخهٔ فرعی — احتمال تغییر رفتار وجود دارد.', authority: 'confirm' },
    { id: 'u2', name: 'WooCommerce', from: '9.1.2', to: '9.1.4', type: 'افزونه', risk: 'low', riskLabel: 'کم‌ریسک',
      note: 'فقط تغییر نسخهٔ وصله.', authority: 'auto' },
    { id: 'u3', name: 'Yoast SEO', from: '23.2', to: '23.4', type: 'افزونه', risk: 'low', riskLabel: 'کم‌ریسک',
      note: 'تغییر نسخهٔ فرعی.', authority: 'auto' },
    { id: 'u4', name: 'WordPress Core', from: '6.5.4', to: '6.6', type: 'هسته', risk: 'medium', riskLabel: 'ریسک متوسط',
      note: 'ارتقای نسخهٔ اصلی؛ بکاپ کامل و تست جامع لازم است.', authority: 'confirm' },
  ],
  done: [
    { id: 'd1', name: 'Contact Form 7', to: '5.9.8', when: 'امروز ۰۴:۱۲', ok: true },
    { id: 'd2', name: 'Akismet', to: '5.3.3', when: 'امروز ۰۴:۱۲', ok: true },
    { id: 'd3', name: 'Rank Math', to: '1.0.230', when: 'دیروز', ok: true },
  ],
})

export const siteSecurity = (id) => delay({
  // One real vulnerability, because this is the case the card exists for and
  // an all-clear demo never shows how it reads. Also one entry in the
  // can't-compare bucket, which is the category people most need to see
  // distinguished from "safe".
  vulns: {
    checked: 34,
    vulnerable: [
      {
        cve: 'CVE-2024-32713', slug: 'slider-x', name: 'Slider X', kind: 'plugin',
        installed: '2.4.1', fixedIn: '2.5.0', severity: 'high', cvss: 8.8, active: true,
        summary: 'آپلود فایل بدون بررسی نوع، که اجرای کد از راه دور را ممکن می‌کند.',
        advice: 'به نسخهٔ 2.5.0 یا بالاتر به‌روزرسانی کنید.',
      },
      {
        cve: 'CVE-2023-51488', slug: 'old-gallery', name: 'Old Gallery', kind: 'plugin',
        installed: '1.2.0', fixedIn: '1.4.2', severity: 'medium', cvss: 6.1, active: false,
        summary: 'XSS ذخیره‌شده در پنل مدیریت.',
        advice: 'به نسخهٔ 1.4.2 یا بالاتر به‌روزرسانی کنید.',
      },
    ],
    unknownVersion: [
      {
        cve: 'CVE-2022-45820', slug: 'contact-thing', name: 'Contact Thing',
        installed: '3.1.0', fixedIn: null, severity: 'medium', cvss: 5.4, active: true,
        why: 'نسخهٔ اصلاح‌شده در گزارش اصلی ذکر نشده',
        advice: 'نسخهٔ اصلاح‌شده مشخص نیست؛ سایت سازنده را بررسی کنید.',
      },
    ],
    note: 'این بررسی روی پایگاه CVE خودمان انجام می‌شود که از NVD ساخته شده. خالی بودن نتیجه یعنی در این پایگاه چیزی نبود، نه اینکه افزونه‌ها قطعاً امن‌اند.',
  },
  // Same shape the server sends for a real, verified-clean core. The demo shows
  // a passing check rather than inventing findings — a mock that cries wolf
  // teaches people to ignore the real one.
  integrity: {
    ok: true, clean: true, version: '7.0.2', locale: 'fa_IR',
    files_known: 4171, modified: [], missing: [], unexpected: [],
    checked_at: Math.floor(Date.now() / 1000),
  },
  id, score: 92, ssl: { valid: true, days: 68, issuer: "Let's Encrypt" },
  metrics: [
    { label: 'فایل ناشناخته در هسته', value: '0', unit: '', icon: 'file-check-2', tone: 'success' },
    { label: 'فایل تغییریافتهٔ هسته', value: '0', unit: '', icon: 'file-check-2', tone: 'success' },
    { label: 'یافتهٔ بدافزار', value: '0', unit: '', icon: 'shield-check', tone: 'success' },
    { label: 'فایل اسکن‌شده', value: '4171', unit: '', icon: 'search', tone: 'neutral' },
  ],
  // No invented event feed: the real one does not exist yet, and a demo that
  // shows blocked logins from a fictional IP teaches customers to expect it.
  events: [],
})

// Backups are real now — the connector dumps the database in pure PHP and only
// records dumps it verified complete. The demo reflects that, including the two
// claims the old mock quietly overstated: snapshots live on the site itself,
// not in encrypted off-site storage, and "verified" means the dump ends the way
// a complete dump ends — nothing here has been test-restored.
export const siteBackups = (id) => delay({
  provenance: { live: ['backup_list', 'backup_run'], partial: {} },
  id,
  lastBackup: '۱۴۰۴/۰۵/۰۳ ۰۳:۱۰',
  location: 'wp-content/uploads/cb-backups',
  totalSize: '۲۴۰ مگابایت',
  empty: false,
  list: [
    { id: 'cb_1a2b3c', when: '۱۴۰۴/۰۵/۰۳ ۰۳:۱۰', type: 'خودکار روزانه', size: '۶۲ MB', verified: true, db: true, files: false },
    { id: 'cb_9f8e7d', when: '۱۴۰۴/۰۵/۰۲ ۰۳:۱۰', type: 'خودکار روزانه', size: '۶۱ MB', verified: true, db: true, files: false },
    { id: 'cb_4c5d6e', when: '۱۴۰۴/۰۵/۰۱ ۱۹:۴۲', type: 'دستی', size: '۵۹ MB', verified: false, db: true, files: false },
  ],
})

export const siteSettings = (id) => delay({
  id, authority: 'auto',
  sensitive: [
    'حذف افزونه', 'تعویض قالب', 'ویرایش کد PHP', 'تغییر درگاه پرداخت', 'تغییر DNS', 'حذف دادهٔ دیتابیس',
  ],
  connector: { paired: true, server: 'api.digiwp.com', lastSeen: '۴۰ ثانیه پیش', version: '3.5.1' },
  updatePolicy: describeMockPolicy(mockPolicy),
  updateState: null,
})

// The demo has to lock the switches the same way the server does. A mock that
// lets you turn safe mode's switches off teaches the wrong thing about the
// product, and hides the bug where the real lock is missing.
let mockPolicy = { safeMode: true, autoCore: true, autoPlugins: true, autoThemes: true }

function describeMockPolicy(p) {
  const locked = p.safeMode
  return {
    safeMode: p.safeMode,
    locked,
    lockReason: locked
      ? 'حالت ایمنی روشن است. بدون به‌روز بودن، امنیت معنا ندارد — این سه گزینه تا وقتی حالت ایمنی روشن است خاموش نمی‌شوند.'
      : null,
    switches: [
      { id: 'autoCore', label: 'به‌روزرسانی خودکار هستهٔ وردپرس', desc: 'نصب خودکار نسخه‌های جدید وردپرس، شامل نسخه‌های اصلی', on: p.autoCore, locked },
      { id: 'autoPlugins', label: 'به‌روزرسانی خودکار افزونه‌ها', desc: 'همهٔ افزونه‌های مخزن وردپرس روی آخرین نسخه می‌مانند', on: p.autoPlugins, locked },
      { id: 'autoThemes', label: 'به‌روزرسانی خودکار قالب‌ها', desc: 'همهٔ قالب‌های مخزن وردپرس روی آخرین نسخه می‌مانند', on: p.autoThemes, locked },
    ],
  }
}

export const setUpdatePolicy = (id, patch = {}) => {
  const refused = []
  const next = { ...mockPolicy }
  if (typeof patch.safeMode === 'boolean') next.safeMode = patch.safeMode
  for (const k of ['autoCore', 'autoPlugins', 'autoThemes']) {
    if (typeof patch[k] !== 'boolean') continue
    if (next.safeMode && patch[k] === false) { refused.push(k); continue }
    next[k] = patch[k]
  }
  if (next.safeMode) for (const k of ['autoCore', 'autoPlugins', 'autoThemes']) next[k] = true
  mockPolicy = next
  return delay({
    ...describeMockPolicy(next),
    pushed: null,
    refused,
    message: refused.length ? 'حالت ایمنی روشن است؛ به‌روزرسانی خودکار خاموش نشد.' : null,
  })
}

export const runAction = (id, action) => delay({ ok: true, action, requiresApproval: false })
// The demo answer mirrors the real one's shape and its limits: a briefing built
// only from readings, an explicit note that free conversation is off without a
// model, and the list of things nobody is measuring. A demo that answers
// anything fluently sets an expectation the product does not meet.
export const askGuardian = (id, message) => delay({
  reply: 'سایت روی وردپرس ۶.۸.۲ و PHP ۸.۲ است. ۵ به‌روزرسانی در صف است؛ از جمله Elementor → ۳.۲۵.۱۱. ۱ هشدار بحرانی باز دارید: فایل آلوده پیدا شد: wp-content/uploads/2024/01/x.php. آخرین بکاپ: ۱۴۰۴/۰۵/۰۳ ۰۳:۱۰ (کامل بودنش بررسی شده).',
  refs: ['صف به‌روزرسانی‌ها', 'لاگ هشدارها', 'فهرست بکاپ‌ها'],
  grounded: true,
  note: 'این خلاصه مستقیماً از خود سایت خوانده شده. پاسخ‌گویی آزاد به سؤال هنوز فعال نیست، چون مدل زبانی پیکربندی نشده است.',
  unknown: [
    'آپ‌تایم و سرعت پاسخ سایت را نمی‌سنجیم — پایش مستمر هنوز ساخته نشده.',
    'فضای دیسک و منابع هاست را نمی‌بینیم.',
  ],
  echo: message,
})

// Rescue in the demo returns the same shapes the real steps do, including the
// refusal when key rotation is attempted without confirmation. A mock that
// skips the confirmation teaches the wrong thing about the most destructive
// step in the product.
export const rescueStep = (id, step, body = {}) => {
  if (step === 'rotate-keys' && !body.confirm) {
    return delay({ step, result: { ok: false, message: 'برای چرخش کلیدها confirm=true لازم است.' } })
  }
  const results = {
    backup: { ok: true, backup: { id: 'demo', db_bytes: 4210000, tables: 42, rows: 18300, verified: true } },
    inventory: {
      counts: { repo: 9, foreign: 2, orphan: 1 },
      repo: [{ slug: 'contact-form-7', name: 'Contact Form 7', version: '6.1.6', kind: 'plugin' }],
      foreign: [{ slug: 'acf-pro', name: 'ACF Pro', version: '6.2', kind: 'plugin', why: 'not in the wordpress.org repository — commercial or custom' }],
      orphan: [{ slug: 'wp-cache-x', kind: 'plugin-dir', php_files: 3, why: 'directory in plugins/ with no plugin header' }],
      needs_upload: ['acf-pro'],
      note: 'فایل افزونه‌های تجاری را حتماً از سایت سازنده بگیرید، نه از همین سرور آلوده.',
    },
    leftovers: {
      counts: { critical: 1, review: 2 },
      findings: [
        { path: 'wp-content/uploads/2024/03/x.php', severity: 'critical', why: 'executable PHP inside the media library' },
        { path: 'wp-content/object-cache.php', severity: 'review', why: 'drop-in: runs early, invisible on the plugins screen' },
      ],
      note: 'فقط گزارش است. حذف خودکار انجام نمی‌شود — در uploads رسانهٔ واقعی هست.',
    },
    'db-audit': {
      admins: [{ id: 1, login: 'owner', email: 'owner@example.com', registered: '2021-04-02', posts: 118 }],
      hidden_admins: [{ id: 44, login: 'svc_backup', roles: ['subscriber'], why: 'has administrator capabilities without the administrator role' }],
      suspect_options: [{ option: 'wp_cache_x', marker: 'base64_decode', length: 4210 }],
      suspect_cron: [],
      urls: { siteurl: 'https://example.com', home: 'https://example.com' },
      note: 'گزارش است، نه اقدام.',
    },
    'rotate-keys': { ok: true, backup: 'wp-config.php.pre-rescue.bak', message: 'کلیدها عوض شدند. همهٔ نشست‌ها باطل شد.' },
    verify: {
      clean: false,
      integrity: { ok: true, clean: true, files_known: 4171, modified: [], missing: [], unexpected: [] },
      scan: { hits: [] },
      leftovers: { counts: { critical: 1, review: 2 } },
      verdict: 'هنوز موردی باقی است — تا رفع نشده، سایت را پاک‌شده حساب نکنید.',
    },
  }
  return delay({ step, result: results[step] || {} }, 900)
}

export const setAuthority = (id, authority) => delay({ authority })

// The demo walks the same queued path the real thing does — returning a
// finished result immediately would hide the polling the UI has to handle.
let mockJobTick = 0
export const findConflict = (_id, _body) => {
  mockJobTick = 0
  return delay({ queued: true, job: { id: 'job_demo', state: 'queued', progress: 0, message: 'در صف' } })
}
export const jobStatus = (id, jobId) => {
  mockJobTick++
  // Jobs are keyed by id in the real thing too, so the demo branches the same
  // way rather than returning one shape for every job type.
  if (jobId === 'job_perf_demo') {
    if (mockJobTick < 3) {
      return delay({
        id: jobId, state: 'running', progress: mockJobTick * 40,
        message: mockJobTick === 1 ? 'بررسی کلی سایت انجام شد' : 'در حال اندازه‌گیری صفحه',
      }, 700)
    }
    return delay({ id: jobId, state: 'done', progress: 100, message: 'بررسی سرعت انجام شد', result: demoProfile })
  }
  if (mockJobTick < 3) {
    return delay({
      id: jobId, state: 'running', progress: mockJobTick * 30,
      message: `بررسی گروه ${['۱','۲','۳'][mockJobTick - 1]} از ۳`,
    }, 700)
  }
  return delay({
    id: jobId, state: 'done', progress: 100,
    message: 'افزونهٔ «slider-x/slider-x.php» عامل خرابی است.',
    result: {
      url: 'https://mystore.ir/checkout',
      baseline: { healthy: false, status: 500 },
      theme: { tested: true, current: 'astra', compared: 'twentytwentyfive', is_cause: false },
      bisect: {
        culprit: 'slider-x/slider-x.php', tested: 5,
        rounds: [
          { disabled: ['a/a.php', 'b/b.php', 'c/c.php'], healthy: true, status: 200 },
          { disabled: ['a/a.php'], healthy: false, status: 500 },
          { disabled: ['b/b.php'], healthy: false, status: 500 },
        ],
      },
      culprit: { kind: 'plugin', name: 'slider-x/slider-x.php' },
      verdict: 'افزونهٔ «slider-x/slider-x.php» عامل خرابی است. با ۵ مرحله پیدا شد، به‌جای ۲۴ بار خاموش و روشن کردن.',
      restored: true,
      final_health: { healthy: false, status: 500 },
    },
  })
}

// Backup writes in the demo behave like the real ones: queued, polled, and —
// for restore — refused outright without an explicit confirm.
export const runBackup = (id, _body = {}) =>
  delay({ queued: true, job: { id: 'job_backup_demo', state: 'queued', progress: 0, message: 'در صف' } })

export const restoreBackup = (id, backupId, body = {}) => {
  if (!body.confirm) {
    return Promise.reject(Object.assign(
      new Error('بازگردانی، دیتابیس فعلی را با نسخهٔ قدیمی جایگزین می‌کند و هر تغییری پس از آن بکاپ از بین می‌رود. برای اجرا confirm=true بفرستید.'),
      { status: 400 }
    ))
  }
  return delay({ queued: true, job: { id: 'job_restore_demo', state: 'queued', progress: 0, message: 'در صف' } })
}

export const downloadBackup = (_id, _backupId, _what) =>
  delay({ ok: false, demo: true, message: 'در حالت نمایشی فایلی برای دانلود وجود ندارد.' })

export const runUpdates = (_id, _items) =>
  delay({ queued: true, job: { id: 'job_update_demo', state: 'queued', progress: 0, message: 'در صف' } })

export const saveProfile = (body) => delay({ ...body, saved: true })

// The demo profile is a real-shaped one: a site whose autoload table has been
// quietly taxing every request for a year, one plugin dominating the page, and
// an N+1 pattern. It runs through the same matcher the server uses, so the
// demo cannot drift from the real recipe book.
const demoProfile = {
  url: 'https://mystore.ir/',
  site: {
    autoload: {
      bytes: 2_640_000, count: 780, verdict: 'bad',
      largest: [
        { name: 'wpseo_sitemap_cache_validator', bytes: 1_180_000, owner: null },
        { name: 'rewrite_rules', bytes: 410_000, owner: 'wordpress' },
        { name: 'slider_x_slides_cache', bytes: 260_000, owner: null },
        { name: 'elementor_global_css', bytes: 88_000, owner: 'elementor' },
        { name: 'cb_last_scan', bytes: 4_100, owner: 'digiwp-ai-bridge' },
      ],
    },
    transients: { total: 9_240, expired: 4_880 },
    object_cache: { external: false, dropin: false },
    cron: { overdue: 34, disabled: false },
    bloat: { revisions: 18_400, spam: 2_100, trash_posts: 41, orphan_meta: 9_600 },
    php: { version: '8.0.30', memory_limit: '256M', opcache: true },
    plugins_active: 31,
  },
  page: {
    url: 'https://mystore.ir/',
    queries: 412, query_ms: 890, generated_ms: 1_640, peak_memory: '196 MB',
    by_source: [
      { source: 'plugin: slider-x', queries: 244, ms: 520 },
      { source: 'wordpress core', queries: 96, ms: 190 },
      { source: 'plugin: woocommerce', queries: 48, ms: 120 },
      { source: 'theme/mu: astra', queries: 24, ms: 60 },
    ],
    repeated: [
      { shape: 'SELECT * FROM wp_postmeta WHERE post_id = ? AND meta_key = ?', count: 212, ms: 430, source: 'plugin: slider-x' },
      { shape: 'SELECT option_value FROM wp_options WHERE option_name = ?', count: 38, ms: 22, source: 'wordpress core' },
    ],
    slow: [
      { ms: 184, source: 'plugin: slider-x', sql: 'SELECT p.* FROM wp_posts p INNER JOIN wp_postmeta pm ON …' },
    ],
    note: 'شمارش از لحظهٔ بارگذاری افزونه‌ها شروع می‌شود؛ چند کوئری اولیهٔ هسته در آن نیست.',
  },
}

export const measureSpeed = (id, _body = {}) =>
  delay({ queued: true, job: { id: 'job_perf_demo', state: 'queued', progress: 0, message: 'در صف' } })

export const analyseSpeed = async (id, profile) => {
  // The same matcher the server runs, from a copy inside hub/ — the hub image
  // contains only this directory, so importing across into server/ builds
  // locally and fails in Docker. A demo with its own hardcoded advice would be
  // exactly the kind of fake this pass exists to remove, so it is a copy of the
  // rules rather than a second set of them.
  const { analyse } = await import('../lib/perf-recipes.js')
  return delay(analyse(profile || demoProfile))
}

export { demoProfile }

// The demo captcha is solvable the same way the real one is, so the login form
// can be exercised end to end without a server.
let mockCaptchaFails = 0
export const captcha = () => {
  const a = 3 + (mockCaptchaFails % 5)
  const b = 4
  return delay({ id: `demo.${a + b}`, question: `${faDigits(a)} + ${faDigits(b)} = ?`, expiresIn: 600 })
}
export const challengeState = () => delay({ captchaRequired: mockCaptchaFails >= 3, failures: mockCaptchaFails })
export const forgotPassword = () => delay({ ok: true, message: 'اگر این ایمیل در سیستم وجود داشته باشد، لینک بازنشانی ارسال شده است.' })
export const resetPassword = () => delay({ ok: true, message: 'رمز عبور بازنشانی شد. اکنون می‌توانید وارد شوید.' })

const faDigits = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

// Hosting and emergency-contact demo data. The readiness verdict is the one
// screen where a reassuring mock would be actively harmful, so the demo shows
// a realistically incomplete setup: email works, nothing else does.
export const hostingOptions = () => delay({
  regions: [
    { id: 'ir', label: 'ایران', note: 'درخواست‌ها از سرور داخلی ما فرستاده می‌شود و آدرس بازگشتی هم داخلی است.' },
    { id: 'intl', label: 'خارج از ایران', note: 'درخواست‌ها از سرور بین‌المللی ما فرستاده می‌شود.' },
    { id: 'unknown', label: 'نمی‌دانم', note: 'با تنظیمات پیش‌فرض کار می‌کنیم. اگر بررسی‌ها کند بود یا به سایت نرسید، این را مشخص کنید.' },
  ],
  providers: [
    { id: 'iranserver', label: 'ایران سرور', region: 'ir', traits: [] },
    { id: 'parspack', label: 'پارس‌پک', region: 'ir', traits: [] },
    { id: 'abrarvan', label: 'ابر آروان', region: 'ir', traits: ['cdn'] },
    { id: 'hetzner', label: 'Hetzner', region: 'intl', traits: [] },
    { id: 'siteground', label: 'SiteGround', region: 'intl', traits: ['page-cache', 'no-exec'] },
    { id: 'other', label: 'موردی غیر از این‌ها', region: null, traits: [] },
  ],
  traits: {},
})

export const setHosting = (id, body) => delay({
  hosting: { ...body, traits: [], traitsNote: 'در حالت نمایشی محدودیتی محاسبه نمی‌شود.' },
  serverUrl: 'https://api.digiwp.com/v1',
})

export const contact = () => delay({ phone: null, fcmToken: null, najvaToken: null })
export const setContact = (body) => delay({ phone: null, fcmToken: null, najvaToken: null, ...body })

export const alertReadiness = () => delay({
  channels: [
    { id: 'firebase', label: 'اعلان مرورگر (Firebase)', server: false, user: false, ready: false, why: 'این سرویس روی سرور ما تنظیم نشده' },
    { id: 'najva', label: 'اعلان نجوا', server: false, user: false, ready: false, why: 'این سرویس روی سرور ما تنظیم نشده' },
    { id: 'sms', label: 'پیامک', server: false, user: false, ready: false, why: 'اطلاعات تماس شما برای این راه ثبت نشده' },
    { id: 'email', label: 'ایمیل', server: true, user: true, ready: true, why: null },
  ],
  readyCount: 1,
  verdict: 'فقط یک راه فعال است (ایمیل). اگر همان یکی کار نکند، هشداری به شما نمی‌رسد.',
})

export const startScan = (_id) =>
  delay({ queued: true, job: { id: 'job_scan_demo', state: 'queued', progress: 0, message: 'در صف' } })
