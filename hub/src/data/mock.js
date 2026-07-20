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
    authority: 'auto', uptime: 99.98, checks: 9, lastCheck: 2, incidents: 0, pendingUpdates: 5,
  },
  {
    id: 'blog', name: 'blog.myco.ir', title: 'وبلاگ شرکت', status: 'warning',
    authority: 'confirm', uptime: 99.7, checks: 9, lastCheck: 4, incidents: 1, pendingUpdates: 2,
  },
  {
    id: 'landing', name: 'promo.myco.ir', title: 'لندینگ کمپین', status: 'checking',
    authority: 'report', uptime: 100, checks: 9, lastCheck: 0, incidents: 0, pendingUpdates: 0,
  },
]
export const listSites = () => delay(sites)
export const addSite = (b) => delay({ id: 'new', ...b, status: 'checking' })

// ---- Billing / plans --------------------------------------
export const plans = () => delay([
  { id: 'base', name: 'پایه', price: 190000, popular: false,
    features: ['۱ سایت', 'پایش هر ۵ دقیقه', 'بکاپ روزانه'] },
  { id: 'pro', name: 'حرفه‌ای', price: 490000, popular: true,
    features: ['۵ سایت', 'پایش هر ۱ دقیقه', 'بکاپ + محیط استیجینگ', 'رفع خودکار خرابی'] },
  { id: 'agency', name: 'آژانس', price: 990000, popular: false,
    features: ['سایت نامحدود', 'اعضای تیم و نقش‌ها', 'گزارش با برند شما', 'پشتیبانی اولویت‌دار'] },
])
export const billing = () => delay({
  plan: 'حرفه‌ای', price: 490000, cycle: 'ماهانه', sitesUsed: 3, sitesLimit: 5,
  renewsAt: '۱۴۰۳/۰۵/۱۲', card: '•••• ۸۸۲۴',
})
export const invoices = () => delay([
  { id: 'INV-1403-014', date: '۱۴۰۳/۰۴/۱۲', amount: 490000, status: 'paid' },
  { id: 'INV-1403-009', date: '۱۴۰۳/۰۳/۱۲', amount: 490000, status: 'paid' },
  { id: 'INV-1403-004', date: '۱۴۰۳/۰۲/۱۲', amount: 490000, status: 'paid' },
])
export const invoice = (id) => delay({
  id, date: '۱۴۰۳/۰۴/۱۲', dueDate: '۱۴۰۳/۰۴/۱۲', status: 'paid',
  seller: { name: 'دیجی‌وردپرس (DigiWP Ai Support)', id: 'ai.digiwp.com', taxId: '۱۴۰۱۲۳۴۵۶۷۸' },
  buyer: { name: 'مریم رضایی', email: 'maryam@example.com' },
  items: [{ desc: 'اشتراک پلن حرفه‌ای — یک ماه', qty: 1, unit: 490000 }],
  subtotal: 490000, tax: 44100, total: 534100,
})

// ---- Team --------------------------------------------------
export const team = () => delay([
  { id: 't1', name: 'مریم رضایی', email: 'maryam@example.com', role: 'owner', roleLabel: 'مالک', initials: 'م', sites: 'همه' },
  { id: 't2', name: 'سینا احمدی', email: 'sina@example.com', role: 'admin', roleLabel: 'مدیر', initials: 'س', sites: 'mystore.ir' },
  { id: 't3', name: 'نگار موسوی', email: 'negar@example.com', role: 'viewer', roleLabel: 'ناظر', initials: 'ن', sites: 'blog.myco.ir' },
])

// ---- Notifications ----------------------------------------
export const notifications = () => delay({
  channels: [
    { id: 'email', label: 'ایمیل', icon: 'mail', value: 'maryam@example.com', on: true },
    { id: 'sms', label: 'پیامک', icon: 'message-square', value: '۰۹۱۲•••۴۵۶۷', on: true },
    { id: 'telegram', label: 'تلگرام', icon: 'send', value: '@maryam', on: false },
  ],
  prefs: [
    { id: 'critical', label: 'هشدارهای بحرانی', desc: 'خطای ۵۰۰، از دسترس خارج شدن سایت، نفوذ', on: true, locked: true },
    { id: 'approvals', label: 'درخواست‌های تأیید', desc: 'وقتی اقدامی نیازمند تأیید شماست', on: true },
    { id: 'updates', label: 'آپدیت‌ها', desc: 'آپدیت‌های انجام‌شده و در صف', on: true },
    { id: 'reports', label: 'گزارش روزانه', desc: 'خلاصهٔ روزانهٔ وضعیت سایت‌ها', on: false },
  ],
})
export const profile = () => delay({ ...currentUser, twoFactor: true, lang: 'fa', timezone: 'Asia/Tehran' })

// ---- Per-site ---------------------------------------------
export const siteOverview = (id) => delay({
  id, name: sites.find((s) => s.id === id)?.name || 'mystore.ir',
  status: 'healthy', uptime: 99.98, responseMs: 412, hostSpace: 82, sslDays: 68,
  metrics: [
    { label: 'آپ‌تایم ۳۰ روزه', value: '۹۹٫۹۸', unit: '٪', icon: 'activity', tone: 'success', trend: '+۰٫۰۲', dir: 'up' },
    { label: 'زمان پاسخ', value: '۴۱۲', unit: 'ms', icon: 'gauge', tone: 'primary', trend: '−۳۸ms', dir: 'down' },
    { label: 'فضای هاست', value: '۸۲', unit: '٪', icon: 'hard-drive', tone: 'warning', trend: 'رو به افزایش', dir: 'flat' },
    { label: 'اعتبار SSL', value: '۶۸', unit: 'روز', icon: 'lock', tone: 'success', trend: 'معتبر', dir: 'flat' },
  ],
  services: [
    { label: 'صفحهٔ اصلی', ok: true }, { label: 'ورود مدیریت', ok: true },
    { label: 'سبد خرید', ok: true }, { label: 'درگاه پرداخت', ok: true },
    { label: 'فرم تماس', ok: true }, { label: 'SSL', ok: true },
    { label: 'WP-Cron', ok: true }, { label: 'فضای دیتابیس', ok: true }, { label: 'رندر موبایل', ok: true },
  ],
  report: [
    { icon: 'check-circle-2', tone: 'done', label: 'بکاپ روزانه با موفقیت گرفته شد', time: '۰۳:۰۰' },
    { icon: 'refresh-cw', tone: 'done', label: '۳ افزونه پس از تست به‌روزرسانی شدند', time: '۰۴:۱۲' },
    { icon: 'zap', tone: 'done', label: '۱۸ تصویر فشرده و به WebP تبدیل شد', time: '۰۵:۳۰' },
    { icon: 'shield-check', tone: 'done', label: 'اسکن امنیتی — موردی یافت نشد', time: '۰۶:۰۰' },
    { icon: 'alert-triangle', tone: 'warning', label: 'فضای هاست به ۸۲٪ رسید — پیشنهاد پاک‌سازی', time: '۰۹:۱۴' },
  ],
})

export const siteIncidents = (id) => delay({
  id,
  featured: {
    severity: 'critical', title: 'خطای ۵۰۰ در صفحهٔ پرداخت', time: '۱۴:۳۲',
    desc: 'صفحهٔ پرداخت از ۱۲ دقیقه قبل خطای ۵۰۰ داشت. پشتیبان به‌صورت خودکار علت را یافت و برطرف کرد.',
    fields: [
      { label: 'علت', value: 'آپدیت افزونهٔ درگاه پرداخت' },
      { label: 'اقدام انجام‌شده', value: 'نسخهٔ قبلی افزونه بازیابی شد' },
      { label: 'وضعیت فعلی', value: 'سایت سالم است', tone: 'success' },
      { label: 'کد خطا', value: 'HTTP 500', mono: true },
    ],
    timeline: [
      { t: '۱۴:۲۰', label: 'خطای ۵۰۰ در /checkout شناسایی شد', tone: 'danger' },
      { t: '۱۴:۲۱', label: 'علت: آپدیت افزونهٔ درگاه پرداخت', tone: 'info' },
      { t: '۱۴:۲۳', label: 'بکاپ سالم پیش از اقدام گرفته شد', tone: 'done' },
      { t: '۱۴:۲۵', label: 'نسخهٔ قبلی افزونه بازیابی شد', tone: 'done' },
      { t: '۱۴:۳۲', label: 'تست مجدد پرداخت موفق — سایت سالم', tone: 'done' },
    ],
  },
  list: [
    { id: 'i1', severity: 'critical', title: 'خطای ۵۰۰ در صفحهٔ پرداخت', time: '۱۴:۳۲', resolved: true },
    { id: 'i2', severity: 'warning', title: 'فضای هاست به ۸۲٪ رسید', time: 'دیروز', resolved: false },
    { id: 'i3', severity: 'info', title: 'ورود ناموفق مکرر از یک IP', time: 'دیروز', resolved: true },
    { id: 'i4', severity: 'warning', title: 'کندی موقت در بارگذاری صفحهٔ محصول', time: '۲ روز پیش', resolved: true },
  ],
})

export const siteUpdates = (id) => delay({
  id,
  queue: [
    { id: 'u1', name: 'Elementor', from: '3.21.4', to: '3.23.0', type: 'افزونه', risk: 'high', riskLabel: 'ریسک بالا',
      note: 'تغییرات عمده در رندر؛ نیازمند تست استیجینگ و تأیید شما.', authority: 'confirm' },
    { id: 'u2', name: 'WooCommerce', from: '9.1.2', to: '9.1.4', type: 'افزونه', risk: 'low', riskLabel: 'کم‌ریسک',
      note: 'وصلهٔ امنیتی جزئی؛ در محیط استیجینگ تست شد.', authority: 'auto' },
    { id: 'u3', name: 'Yoast SEO', from: '23.2', to: '23.4', type: 'افزونه', risk: 'low', riskLabel: 'کم‌ریسک',
      note: 'سازگار؛ آمادهٔ اعمال خودکار.', authority: 'auto' },
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
  id, score: 92, ssl: { valid: true, days: 68, issuer: "Let's Encrypt" },
  metrics: [
    { label: 'امتیاز امنیت', value: '۹۲', unit: '/۱۰۰', icon: 'shield-check', tone: 'success' },
    { label: 'تلاش ورود مسدودشده', value: '۲۴', unit: 'امروز', icon: 'lock', tone: 'primary' },
    { label: 'فایل‌های تغییریافته', value: '۰', unit: '', icon: 'file-check-2', tone: 'success' },
    { label: 'افزونهٔ آسیب‌پذیر', value: '۱', unit: '', icon: 'alert-triangle', tone: 'warning' },
  ],
  events: [
    { icon: 'user-x', tone: 'warning', label: '۵ تلاش ناموفق ورود از ۱۹۸٫۵۱٫۱۰۰٫۲۲ مسدود شد', time: '۱۱:۰۴' },
    { icon: 'shield-check', tone: 'done', label: 'اسکن بدافزار روزانه — پاک', time: '۰۶:۰۰' },
    { icon: 'alert-triangle', tone: 'warning', label: 'افزونهٔ «Slider X» دارای آسیب‌پذیری شناخته‌شده است', time: 'دیروز' },
    { icon: 'lock', tone: 'info', label: 'گواهی SSL تا ۶۸ روز دیگر معتبر است', time: 'دیروز' },
  ],
})

export const siteBackups = (id) => delay({
  id, lastBackup: '۲ ساعت پیش', nextBackup: 'امشب ۰۳:۰۰', location: 'فضای خارجی (رمزنگاری‌شده)', totalSize: '۱٫۸ گیگابایت',
  list: [
    { id: 'b1', when: 'امروز ۰۳:۰۰', type: 'خودکار روزانه', size: '۱٫۸ GB', verified: true, db: true, files: true },
    { id: 'b2', when: 'دیروز ۱۴:۲۳', type: 'پیش از اقدام (پرداخت)', size: '۱٫۸ GB', verified: true, db: true, files: true },
    { id: 'b3', when: 'دیروز ۰۳:۰۰', type: 'خودکار روزانه', size: '۱٫۷ GB', verified: true, db: true, files: true },
    { id: 'b4', when: '۲ روز پیش ۰۳:۰۰', type: 'خودکار روزانه', size: '۱٫۷ GB', verified: true, db: true, files: true },
  ],
})

export const siteSettings = (id) => delay({
  id, authority: 'auto',
  sensitive: [
    'حذف افزونه', 'تعویض قالب', 'ویرایش کد PHP', 'تغییر درگاه پرداخت', 'تغییر DNS', 'حذف دادهٔ دیتابیس',
  ],
  toggles: [
    { id: 'monitor', label: 'پایش ۲۴ ساعته', desc: 'بررسی مداوم دسترس‌پذیری و سرویس‌ها', on: true },
    { id: 'autofix', label: 'رفع خودکار خرابی', desc: 'بازگردانی آخرین تغییر در صورت خرابی', on: true },
    { id: 'autobackup', label: 'بکاپ پیش از هر تغییر', desc: 'گرفتن بکاپ سالم قبل از هر اقدام', on: true },
    { id: 'speed', label: 'بهینه‌سازی سرعت', desc: 'فشرده‌سازی تصاویر و پاک‌سازی دیتابیس', on: false },
  ],
  connector: { paired: true, server: 'api.digiwp.com', lastSeen: '۴۰ ثانیه پیش', version: '3.5.1' },
})

export const runAction = (id, action) => delay({ ok: true, action, requiresApproval: false })
export const askGuardian = (id, message) => delay({
  reply: 'در ۲۴ ساعت گذشته سایت سالم بوده است. یک آپدیت پرریسک (Elementor) در صف تأیید شماست و فضای هاست به ۸۲٪ رسیده که پیشنهاد پاک‌سازی داده‌ام.',
  refs: ['گزارش امروز', 'صف آپدیت‌ها'],
  echo: message,
})
