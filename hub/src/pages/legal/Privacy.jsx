import Icon from '../../lib/icons.jsx'
import { Link } from 'react-router-dom'

// Draft privacy policy. No final legal review has happened yet — the banner
// says exactly that. Everything below describes data flows that actually
// exist in the code (AGENTS.md, docs/PRIVACY.md): scrypt password hashing
// (server/src/auth.js), once-only pairing secrets, the external services in
// server/src/intel and the plugin, the server-side revocable 7-day session
// (server/src/sessions.store.js), TOTP two-factor state (two_factor /
// two_factor_recovery tables), browser-push subscriptions
// (server/src/push.store.js), the account-deletion flow that purges them
// (server/src/routes/account.js), and the service worker that caches no
// dashboard data. Nothing is promised that the product does not do — and no
// limitation is claimed that the product has already closed.

const DRAFT_BANNER = 'پیش‌نویس اولیه — پیش از انتشار نهایی نیازمند بازبینی حقوقی است'

const COLLECTED = [
  {
    t: 'داده‌های حساب',
    d: 'نشانی ایمیل، نام (اختیاری) و هش رمز عبور. رمز عبور با الگوریتم scrypt هش می‌شود و متن آن هرگز ذخیره نمی‌شود.',
  },
  {
    t: 'اتصال سایت',
    d: 'نشانی سایت وردپرسی و اعتبارنامهٔ جفت‌سازی. رمز جفت‌سازی فقط یک‌بار، هنگام جفت‌سازی، نمایش داده می‌شود و پس از آن در هیچ فهرست یا جزئیاتی داخل پنل بازنمی‌گردد و به مرورگر ارسال نمی‌شود.',
  },
  {
    t: 'داده‌های سایت',
    d: 'فهرست افزونه‌ها، قالب‌ها و نسخهٔ هسته، وضعیت به‌روزرسانی، نتایج اسکن بدافزار و بررسی یکپارچگی، سیگنال‌های سلامت، گزارش‌های بکاپ و رخدادها — همه از مسیر افزونه به سرور واسط.',
  },
  {
    t: 'اطلاعات تماس اعلان‌ها',
    d: 'نشانی ایمیل یا شناسهٔ تلگرام — فقط اگر خودتان برای دریافت هشدارها ثبت کنید.',
  },
  {
    t: 'سابقهٔ رخدادها و عملیات',
    d: 'اینکه چه عملی پیشنهاد شد، انجام شد، ناموفق بود یا رد شد — برای حسابرسی و شفافیت.',
  },
  {
    t: 'نشست‌ها و دستگاه‌های واردشده',
    d: 'برای هر نشست ورود: خلاصهٔ نوع دستگاه (مرورگر و سیستم‌عامل، از User-Agent)، نشانی IP لحظهٔ ورود، زمان ورود، آخرین فعالیت و انقضا. از توکن نشست فقط هش نگه داشته می‌شود — خود توکن هرگز — و می‌توانید از صفحهٔ «امنیت حساب» هر دستگاه را ببینید و باطل کنید.',
  },
  {
    t: 'ورود دومرحله‌ای — در صورت فعال‌سازی',
    d: 'اگر ورود دومرحله‌ای (TOTP) را فعال کنید: رمزوزیر ثبت‌شده و هش کدهای بازیابی یک‌بارمصرف. رمزوزیر فقط هنگام راه‌اندازی یک‌بار نمایش داده می‌شود و در پاسخ‌های معمول برنمی‌گردد؛ از کدهای بازیابی نیز فقط هش ذخیره می‌شود. با حذف حساب، هر دو پاک می‌شوند.',
  },
  {
    t: 'اشتراک اعلان مرورگر — در صورت فعال‌سازی',
    d: 'اگر اعلان مرورگر را فعال کنید: نشانی endpoint مرورگر شما و کلیدهای رمزنگاری پیام، گره‌خورده به حساب شما. این داده‌ها فقط برای رساندن هشدار به مرورگر خودتان استفاده می‌شوند، در پاسخ‌های پنل کامل نمایش داده نمی‌شوند و با حذف حساب یا لغو اشتراک از همان دستگاه پاک می‌شوند.',
  },
]

const EXTERNAL = [
  {
    t: 'اسکرین‌شات وردپرس.کام (mShots)',
    d: 'ابزار اختیاری اسکرین‌شات. فقط نشانی عمومی صفحه‌ای که اسکرین‌شات می‌گیرید به سرویس ارسال می‌شود؛ هیچ رمز یا دادهٔ خصوصی‌ای ضمیمه نمی‌شود.',
  },
  {
    t: 'APIهای وردپرس.org (api.wordpress.org)',
    d: 'برای اطلاع از آخرین نسخهٔ افزونه و قالب، بررسی یکپارچگی فایل‌های هسته (checksums) و — در عملیات نجات — دریافت کلیدهای امنیتی. نامک و نسخهٔ افزونه/قالب/هسته رد و بدل می‌شود؛ رمز یا محتوای سایت شما نه.',
  },
  {
    t: 'بانک آسیب‌پذیری NVD (services.nvd.nist.gov)',
    d: 'دادهٔ عمومی CVE از سمت سرور ما دریافت می‌شود و تطبیق با نسخه‌های نصب‌شده روی سرور خودمان انجام می‌گیرد؛ سایت شما هرگز مستقیم به NVD وصل نمی‌شود و IP شما آنجا ثبت نمی‌شود.',
  },
  {
    t: 'فیدهای امضای بدافزار (گیت‌هاب — signature-base، و abuse.ch)',
    d: 'قوانین و امضاهای بدافزار از سمت سرور ما دریافت می‌شود؛ داده‌ای از سایت شما به این فیدها ارسال نمی‌شود.',
  },
  {
    t: 'VirusTotal — فقط با هش، و اختیاری',
    d: 'اگر کلید API پیکربندی شده باشد، برای بررسی فایل مشکوک فقط «اثر انگشت» (هش) فایل پرس‌وجو می‌شود. خود فایل شما هرگز به VirusTotal یا هیچ سرویس عمومی تحلیل بدافزار آپلود نمی‌شود.',
  },
  {
    t: 'سرور ایمیل (SMTP پیکربندی‌شده)',
    d: 'برای ارسال ایمیل بازیابی رمز عبور و هشدارهای مالک سایت، نشانی ایمیل شما و متن پیام به سرور ایمیل پیکربندی‌شده روی استقرار می‌رسد.',
  },
  {
    t: 'دروازهٔ مدل هوش مصنوعی — اختیاری',
    d: 'دستیار فقط وقتی دروازهٔ مدلی پیکربندی شده باشد می‌تواند فراتر از خوانش‌های قطعی استدلال کند. در آن حالت، داده‌های خواندنی سایت در چارچوب گام‌بندی‌شده به مدل می‌رود و ابزارهای حساس هرگز به مدل ارائه نمی‌شوند. بدون دروازهٔ مدل، دستیار همین را صادقانه اعلام می‌کند.',
  },
  {
    t: 'مقصد بکاپ بیرونی S3سازگار — اختیاری',
    d: 'اگر خودتان مقصدی تعریف کنید، فایل بکاپ پیش از خروج از سرور رمزنگاری می‌شود و به همان مقصدِ انتخاب خودتان آپلود می‌شود. بدون تعریف مقصد، بکاپ فقط روی خود سایت می‌ماند.',
  },
  {
    t: 'سرویس پوش مرورگر (Web Push) — اختیاری',
    d: 'اگر اعلان مرورگر را فعال کنید، هشدار از سرور ما به سرویس پوش مرورگر خودتان (مثل FCM یا سرویس‌های Mozilla/Apple) فرستاده می‌شود: پیام پیش از ارسال با کلیدهای اشتراکِ دستگاه شما رمز می‌شود و سرویس پوش فقط متن رمزشده را می‌بیند؛ هویت فرستنده با کلیدهای VAPID سرور تأیید می‌شود. بدون پیکربندی VAPID روی استقرار، این مسیر صادقانه «پیکربندی نشده» گزارش می‌شود و چیزی ارسال نمی‌شود.',
  },
]

const NOT_SENT = [
  'رمز جفت‌سازی سایت پس از نمایش اولیهٔ یک‌بار، دیگر هیچ‌جا نشان داده نمی‌شود و مرورگر شما هرگز آن را دریافت نمی‌کند.',
  'فایل‌های سایت شما به هیچ سرویس عمومی تحلیل بدافزار آپلود نمی‌شود — حداکثر هش فایل، و آن هم فقط در صورت پیکربندی اختیاری VirusTotal.',
  'بکاپ‌ها به‌صورت پیش‌فرض روی خودِ سایت مدیریت‌شده می‌مانند؛ چیزی بیرون نمی‌رود مگر اینکه خودتان مقصد خارجی تعریف کنید.',
  'پنل داده‌های داشبورد را در مرورگر کش نمی‌کند — وضعیت امنیتیِ کهنه از یک حافظهٔ موقت، بدتر از خطای صریح «آفلاین» است.',
]

export default function Privacy() {
  return (
    <div dir="rtl" style={{ background: 'var(--gd-bg-app)', color: 'var(--gd-text)', minHeight: '60vh' }}>
      {/* Prominent draft banner — this page is NOT final legal text. */}
      <div
        role="note"
        style={{
          background: 'var(--gd-warning-bg)',
          borderBottom: '1px solid var(--gd-warning-border)',
          color: 'var(--gd-warning-text)',
        }}
      >
        <div
          className="dwp-container"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 24px', fontSize: 13.5, fontWeight: 700, textAlign: 'center',
          }}
        >
          <Icon name="alert-triangle" size={16} style={{ flex: '0 0 auto' }} />
          {DRAFT_BANNER}
        </div>
      </div>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '44px 24px 72px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: 0, lineHeight: 1.3 }}>
          سیاست حریم خصوصی DigiWP Ai Support
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '10px 0 0' }}>
          نسخهٔ پیش‌نویس — آخرین به‌روزرسانی: ۱۰ مهر ۱۴۰۵
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: '22px 0 0' }}>
          این صفحه با یک اصل نوشته شده است: بگوییم دقیقاً چه داده‌ای، کجا و چرا می‌رود — و دربارهٔ چیزهایی که
          هنوز ساخته نشده‌اند، سکوت یا ادعای دروغ نکنیم. هر تغییری در جریان داده‌ها باید در همین صفحه منعکس شود.
        </p>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>۱. داده‌هایی که نگه می‌داریم</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {COLLECTED.map((c) => (
              <div
                key={c.t}
                style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px' }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{c.t}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>۲. سرویس‌های بیرونی — چه داده‌ای کجا می‌رود</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: '0 0 12px' }}>
            همهٔ این سرویس‌ها از سمت سرور واسط درگیر می‌شوند، نه از مرورگر شما — به‌جز مواردی که صریحاً گفته شده است.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {EXTERNAL.map((c) => (
              <div
                key={c.t}
                style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px' }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="globe" size={14} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto' }} />
                  {c.t}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>۳. چه چیزی بیرون نمی‌رود</h2>
          <ul style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {NOT_SENT.map((item) => (
              <li key={item.slice(0, 24)} style={{ fontSize: 14.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>۴. نگهداری داده و حذف حساب</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: 0 }}>
            داده‌های حساب و سایت تا زمانی که حساب شما فعال است روی سرور می‌مانند. حذف حساب از صفحهٔ پروفایل در
            دسترس است: با رمز فعلی، حساب بلافاصله و بدون بازگشت حذف می‌شود — همهٔ نشست‌ها باطل، اتصال سایت‌ها
            غیرفعال و اعتبارنامه‌های آن‌ها پاک، نشست‌ها، تنظیمات ورود دومرحله‌ای، اشتراک‌های اعلان مرورگر،
            مخاطبان اعلان و دعوت‌های تیم حذف می‌شوند و داده‌های هویتی حساب بازنویسی می‌شوند تا نشانی ایمیل شما
            آزاد شود. صادقانه بگوییم: پنجرهٔ انتظار برای بازگشت، آرشیو خروجیِ داده و ایمیل تأیید حذف وجود ندارد؛
            حذف فوری و قطعی است. امنیت حساب و تنظیمات احراز هویت
            در <Link to="/terms" style={{ color: 'var(--gd-primary)', fontWeight: 700 }}>شرایط استفاده</Link> آمده است.
          </p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>۵. امنیت — و حدود آن</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: 0 }}>
            ارتباط پنل با سرور با توکن نشست محافظت می‌شود، رمزهای عبور هش می‌شوند و ارتباط سرور با سایت شما با امضای
            HMAC و بازهٔ زمانی ضدبازپخش انجام می‌گیرد. اما هیچ سیستمی بی‌نقص نیست: «اسکن تمیز» به معنای تضمین
            امنیت سایت نیست و «بکاپ ایجاد شد» به معنای «بازیابی تضمین‌شده» نیست — این دو ادعا را عمداً از هم جدا نگه
            می‌داریم.
          </p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>۶. تغییرات این سیاست</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: 0 }}>
            اگر جریان داده‌ها تغییر کند — سرویس بیرونی تازه‌ای اضافه شود یا سرویسی حذف شود — همین صفحه با تاریخ جدید
            به‌روزرسانی می‌شود.
          </p>
        </section>

        <div
          style={{
            marginTop: 36, display: 'flex', alignItems: 'flex-start', gap: 9,
            fontSize: 13.5, lineHeight: 1.9, color: 'var(--gd-warning-text)',
            background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning-border)',
            borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px',
          }}
        >
          <Icon name="alert-triangle" size={16} style={{ flex: '0 0 auto', marginTop: 4 }} />
          <span>{DRAFT_BANNER}. پیش از انتشار نهایی، متن بالا توسط مشاور حقوقی بازبینی می‌شود و ممکن است تغییر کند.</span>
        </div>
      </article>
    </div>
  )
}
