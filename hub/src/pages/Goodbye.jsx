/**
 * صفحهٔ خروج تمیز بعد از حذف حساب (/goodbye).
 *
 * عمومی و بی‌نیاز از نشست: کاربر این‌جا می‌رسد وقتی حسابش حذف شده، همهٔ
 * نشست‌هایش باطل شده‌اند و توکن مرورگر پاک شده است. هیچ ادعایی دربارهٔ
 * «ایمیل تأیید» یا «حذف در چند روز» نمی‌کند — هیچ‌کدام در این سیستم وجود
 * ندارد؛ حذف همان لحظه انجام شده و بازگشت‌پذیر نیست.
 */
export default function Goodbye() {
  return (
    <div dir="rtl" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--gd-bg-app)', fontFamily: 'var(--gd-font-sans)', padding: 20,
    }}>
      <div className="dwp-card" style={{
        maxWidth: 520, width: '100%', padding: '32px 30px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <span style={{
          width: 56, height: 56, borderRadius: 16, background: 'var(--gd-bg-subtle)',
          color: 'var(--gd-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--gd-text-primary)' }}>
          حساب شما حذف شد
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--gd-text-secondary)', lineHeight: 2, margin: 0 }}>
          همهٔ نشست‌ها باطل شده، سایت‌های شما از پایش خارج شده‌اند و اعتبارنامهٔ جفت‌سازی آن‌ها باطل شده است —
          افزونهٔ روی سایت‌هایتان دیگر به این پنل وصل نمی‌شود. داده‌های شخصی حساب حذف شده و
          <strong> این تغییر بازگشت‌پذیر نیست.</strong>
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 2, margin: 0 }}>
          اگر در آینده دوباره به DigiWP نیاز داشتید، می‌توانید با همان ایمیل یک حساب تازه بسازید.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="/" style={{
            padding: '9px 18px', borderRadius: 'var(--gd-radius-md)', fontSize: 13.5, fontWeight: 700,
            background: 'var(--gd-primary)', color: '#fff', textDecoration: 'none',
          }}>
            صفحهٔ اصلی
          </a>
          <a href="/login" style={{
            padding: '9px 18px', borderRadius: 'var(--gd-radius-md)', fontSize: 13.5, fontWeight: 700,
            border: '1px solid var(--gd-border)', color: 'var(--gd-text-secondary)', textDecoration: 'none',
          }}>
            ورود یا ثبت‌نام
          </a>
        </div>
      </div>
    </div>
  )
}
