// Demo content, matching the shapes the hub renders. Your real server would
// build these from its DB + live connector reads; here they seed a working demo.
export const demoUser = {
  id: 'u_1', name: 'مریم رضایی', role: 'مدیر حساب',
  email: 'maryam@example.com', initials: 'م', plan: 'حرفه‌ای',
  password: 'demo1234', // demo only
}

export const demoSites = [
  { id: 'mystore', name: 'mystore.ir', title: 'فروشگاه من', status: 'healthy', authority: 'auto', uptime: 99.98, checks: 9, lastCheck: 2, incidents: 0, pendingUpdates: 5 },
  { id: 'blog', name: 'blog.myco.ir', title: 'وبلاگ شرکت', status: 'warning', authority: 'confirm', uptime: 99.7, checks: 9, lastCheck: 4, incidents: 1, pendingUpdates: 2 },
  { id: 'landing', name: 'promo.myco.ir', title: 'لندینگ کمپین', status: 'checking', authority: 'report', uptime: 100, checks: 9, lastCheck: 0, incidents: 0, pendingUpdates: 0 },
]

// Features listed here must be features that exist. The old list promised
// one-minute monitoring, a staging environment, automatic break-fix and team
// roles — none of which are built, and one of which (staging) is contradicted
// on the updates screen. A price list is a contract; it is the last place to
// describe intentions as capabilities.
export const plans = [
  { id: 'base', name: 'پایه', price: 190000, popular: false, features: [
    '۱ سایت', 'به‌روزرسانی خودکار هسته، افزونه و قالب', 'بکاپ دیتابیس روی خود سایت', 'اسکن امنیتی روزانه',
  ] },
  { id: 'pro', name: 'حرفه‌ای', price: 490000, popular: true, features: [
    '۵ سایت', 'همهٔ امکانات پلن پایه', 'بررسی یکپارچگی فایل‌های هسته', 'بررسی تداخل افزونه و قالب', 'عملیات نجات',
  ] },
  { id: 'agency', name: 'آژانس', price: 990000, popular: false, features: [
    'سایت نامحدود', 'همهٔ امکانات پلن حرفه‌ای', 'گزارش امنیتی روزانه در تلگرام',
  ] },
]

export const billing = { plan: 'حرفه‌ای', price: 490000, cycle: 'ماهانه', sitesUsed: 3, sitesLimit: 5, renewsAt: '۱۴۰۳/۰۵/۱۲', card: '•••• ۸۸۲۴' }
export const invoices = [
  { id: 'INV-1403-014', date: '۱۴۰۳/۰۴/۱۲', amount: 490000, status: 'paid' },
  { id: 'INV-1403-009', date: '۱۴۰۳/۰۳/۱۲', amount: 490000, status: 'paid' },
  { id: 'INV-1403-004', date: '۱۴۰۳/۰۲/۱۲', amount: 490000, status: 'paid' },
]
export const invoiceDetail = (id) => ({
  id, date: '۱۴۰۳/۰۴/۱۲', dueDate: '۱۴۰۳/۰۴/۱۲', status: 'paid',
  seller: { name: 'دیجی‌وردپرس (DigiWP Ai Support)', id: 'ai.digiwp.com', taxId: '۱۴۰۱۲۳۴۵۶۷۸' },
  buyer: { name: 'مریم رضایی', email: 'maryam@example.com' },
  items: [{ desc: 'اشتراک پلن حرفه‌ای — یک ماه', qty: 1, unit: 490000 }],
  subtotal: 490000, tax: 44100, total: 534100,
})

export const team = [
  { id: 't1', name: 'مریم رضایی', email: 'maryam@example.com', role: 'owner', roleLabel: 'مالک', initials: 'م', sites: 'همه' },
  { id: 't2', name: 'سینا احمدی', email: 'sina@example.com', role: 'admin', roleLabel: 'مدیر', initials: 'س', sites: 'mystore.ir' },
  { id: 't3', name: 'نگار موسوی', email: 'negar@example.com', role: 'viewer', roleLabel: 'ناظر', initials: 'ن', sites: 'blog.myco.ir' },
]

export const notifications = {
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
}

/**
 * Per-site payload skeletons.
 *
 * This used to hold a full invented site: 99.98% uptime, a 412ms response
 * time, "82%" host storage, nine green service checks including a payment
 * gateway, a five-line daily report of work nothing performs, a resolved
 * 500-error incident with a minute-by-minute timeline, and an update queue of
 * plugins the site may not even have installed. Every view fell back to it
 * whenever the connector was unreachable — so a site we could not read looked
 * healthier than one we could.
 *
 * What remains is empty structure. Each view now fills what it measures and
 * declares what it cannot, which is why `provenance` carries an `unavailable`
 * note rather than these numbers filling the gap.
 */
export const siteData = (id) => ({
  overview: { id, name: demoSites.find((s) => s.id === id)?.name || '', metrics: [], services: [], report: [] },
  incidents: { id, list: [], featured: null },
  updates: { id, queue: [], done: [] },
  security: { id, metrics: [] },
  backups: { id, list: [], empty: true },
  settings: {
    id,
    authority: demoSites.find((s) => s.id === id)?.authority || 'report',
    // Enforced for real in routes/sites.js — this list is the same set the
    // relay refuses without an explicit approval.
    sensitive: ['حذف افزونه', 'تعویض قالب', 'ویرایش فایل', 'اجرای کوئری دیتابیس', 'حذف فایل'],
  },
})
