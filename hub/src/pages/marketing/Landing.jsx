import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, StatusPill, AuthorityBadge } from '../../components/index.js'

// Six capability claims, each rewritten to what the product does. The old set
// promised 24-hour monitoring, contact-form and payment-gateway checks, host
// storage tracking, staging tests, automatic break-fix, mobile/desktop
// rendering tests, off-site backups with restore testing, image compression,
// Core Web Vitals, suspicious-login detection and attack blocking. None of
// those exist. Selling them is worse than showing them in the panel, because
// this is where the purchase decision is made.
const FEATURES = [
  { icon: 'refresh-cw', title: 'همیشه به‌روز', desc: 'هسته، افزونه‌ها و قالب‌ها خودکار به آخرین نسخه می‌رسند. در حالت ایمنی، این گزینه‌ها قابل خاموش کردن نیستند.' },
  { icon: 'shield-check', title: 'اسکن بدافزار', desc: 'اسکن روزانه با بانک امضای به‌روز، به‌علاوهٔ جست‌وجوی هش در پایگاه‌های بیرونی.' },
  { icon: 'file-check-2', title: 'بررسی یکپارچگی هسته', desc: 'هر فایل هستهٔ وردپرس با نسخهٔ رسمی مقایسه می‌شود؛ فایل ناشناس در wp-includes خودش یک یافته است.' },
  { icon: 'database', title: 'بکاپ و بازگردانی', desc: 'دامپ دیتابیس با PHP خالص — روی هاست‌هایی که exec() بسته است هم کار می‌کند — و فقط دامپ‌های کامل ثبت می‌شوند.' },
  { icon: 'git-branch', title: 'پیدا کردن تداخل', desc: 'صفحهٔ خرابتان را می‌دهید؛ افزونه‌ها و قالب گروه‌گروه خاموش می‌شوند تا مقصر پیدا شود و بعد همه‌چیز برمی‌گردد.' },
  { icon: 'shield-alert', title: 'عملیات نجات', desc: 'برای سایتی که دیگر به فایل‌هایش نمی‌شود اعتماد کرد: جایگزینی با نسخهٔ رسمی، نه پاک‌سازی حدسی.' },
]


const AUTH_LEVELS = [
  { level: 'report', icon: 'eye', tone: 'gray', title: 'فقط گزارش', desc: 'فقط مشاهده و پیشنهاد می‌دهد؛ هیچ تغییری روی سایت اعمال نمی‌شود.' },
  { level: 'confirm', icon: 'user-check', tone: 'warning', title: 'با تأیید', desc: 'راه‌حل را آماده می‌کند، منتظر تأیید شما می‌ماند و سپس اجرا و تست می‌کند.' },
  { level: 'auto', icon: 'zap', tone: 'success', title: 'خودکار', desc: 'کارهای کم‌ریسک را خودش انجام می‌دهد؛ موارد حساس همچنان با تأیید شما.' },
]

const PLANS = [
  { name: 'پایه', price: '۱۹۰٬۰۰۰', popular: false, feats: ['۱ سایت', 'به‌روزرسانی خودکار', 'بکاپ و اسکن روزانه'], cta: 'درخواست دسترسی', variant: 'secondary' },
  { name: 'حرفه‌ای', price: '۴۹۰٬۰۰۰', popular: true, feats: ['۵ سایت', 'بررسی یکپارچگی هسته', 'بررسی تداخل و عملیات نجات'], cta: 'درخواست دسترسی', variant: 'primary' },
  { name: 'آژانس', price: '۹۹۰٬۰۰۰', popular: false, feats: ['سایت نامحدود', 'همهٔ امکانات حرفه‌ای', 'گزارش روزانه در تلگرام'], cta: 'تماس با فروش', variant: 'secondary' },
]


export default function Landing() {
  return (
    <>
      {/* Hero (ink) */}
      <div data-theme="ink" style={{ background: 'var(--gd-bg-app)' }}>
        <div className="dwp-container dwp-hero" style={{ paddingBlock: '66px 74px', display: 'grid', gap: 44, alignItems: 'center' }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--gd-primary)', background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)', padding: '6px 13px', borderRadius: 'var(--gd-radius-pill)' }}>
              <Icon name="sparkles" size={14} /> پشتیبان هوشمند وردپرس
            </span>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.25, fontWeight: 800, letterSpacing: '-.02em', margin: '18px 0 0', color: 'var(--gd-text)' }}>
              سایت وردپرسی شما، <span style={{ color: 'var(--gd-primary)' }}>همیشه به‌روز</span> و زیر نظر اسکن روزانه
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.85, color: 'var(--gd-text-secondary)', margin: '16px 0 0', maxWidth: 520 }}>
              به‌جای استخدام پشتیبان دائمی سایت. کارهای روزمرهٔ نگهداری خودکار می‌شوند و فقط برای تصمیم‌های حساس از شما اجازه گرفته می‌شود.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
              <Button as={Link} to="/register" variant="primary" size="lg" leftIcon="shield-check">ساخت حساب</Button>
              <Button as={Link} to="/pricing" variant="secondary" size="lg" rightIcon="arrow-left">مشاهده قیمت‌ها</Button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 22, fontSize: 12.5, color: 'var(--gd-text-muted)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={15} style={{ color: 'var(--gd-primary)' }} /> نصب در ۲ دقیقه</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={15} style={{ color: 'var(--gd-primary)' }} /> بدون نیاز به کارت بانکی در دسترسی آزمایشی</span>
            </div>
          </div>
          <div>
            <div style={{ borderRadius: 'var(--gd-radius-2xl)', padding: 20, boxShadow: 'var(--gd-shadow-xl)', border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span className="dwp-mono" style={{ fontSize: 13, color: 'var(--gd-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 7 }}><Icon name="globe" size={15} /> mystore.ir</span>
                <span className="dwp-spacer" /><StatusPill status="healthy" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 15, borderRadius: 'var(--gd-radius-lg)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)' }}>
                <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--gd-success-bg)', color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="shield-check" size={23} /></span>
                <div><div style={{ fontWeight: 800, fontSize: 16 }}>همه‌چیز سالم است</div><div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 3 }}>آخرین بررسی: ۲ دقیقه پیش · ۹ سرویس</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                {['پرداخت سالم', 'SSL معتبر'].map((t) => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '8px 11px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gd-success)' }} /> {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="dwp-container" style={{ paddingBlock: 66 }}>
        <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 40px' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--gd-primary)' }}>قابلیت‌ها</span>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.01em', margin: '10px 0 0' }}>دقیقاً چه کارهایی انجام می‌دهد؟</h2>
        </div>
        <div className="dwp-grid dwp-grid-3">
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', padding: 24, boxShadow: 'var(--gd-shadow-xs)' }}>
              <span style={{ width: 46, height: 46, borderRadius: 'var(--gd-radius-lg)', background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name={f.icon} size={23} /></span>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 7px' }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Authority levels */}
      <section id="authority" style={{ background: 'var(--gd-bg-app)', borderTop: '1px solid var(--gd-border)', borderBottom: '1px solid var(--gd-border)' }}>
        <div className="dwp-container" style={{ paddingBlock: 60 }}>
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 34px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--gd-primary)' }}>کنترل با شماست</span>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.01em', margin: '10px 0 8px' }}>سه سطح اختیار</h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--gd-text-secondary)', margin: 0 }}>تعیین کنید پشتیبان چقدر آزادی عمل داشته باشد. اقدام‌های حساس در هر سطحی به تأیید شما نیاز دارند.</p>
          </div>
          <div className="dwp-grid dwp-grid-3">
            {AUTH_LEVELS.map((a) => (
              <div key={a.level} style={{ background: 'var(--gd-bg-surface)', border: `1px solid ${a.tone === 'warning' ? 'var(--gd-warning-border)' : a.tone === 'success' ? 'var(--gd-success-border)' : 'var(--gd-border)'}`, borderRadius: 'var(--gd-radius-xl)', padding: 24, boxShadow: 'var(--gd-shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: a.tone === 'warning' ? 'var(--gd-warning-bg)' : a.tone === 'success' ? 'var(--gd-success-bg)' : 'var(--gd-bg-inset)', color: a.tone === 'warning' ? 'var(--gd-warning)' : a.tone === 'success' ? 'var(--gd-success)' : 'var(--gd-gray-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={22} /></span>
                  <AuthorityBadge level={a.level} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 7px' }}>{a.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: 0 }}>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparent report sample */}
      <section className="dwp-container dwp-report" style={{ paddingBlock: 64, display: 'grid', gap: 44, alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--gd-primary)' }}>گزارش شفاف</span>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.01em', margin: '10px 0 12px' }}>به زبان ساده به شما می‌گوید چه شد</h2>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--gd-text-secondary)', margin: 0 }}>هر رخداد را با همین ترتیب گزارش می‌کند: وضعیت، علت، اقدام انجام‌شده و نتیجه — بدون اصطلاحات فنی گیج‌کننده.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-danger-border)', background: 'var(--gd-danger-bg)', padding: '18px 22px', boxShadow: 'var(--gd-shadow-sm)' }}>
          <span style={{ width: 40, height: 40, borderRadius: 'var(--gd-radius-md)', background: 'var(--gd-danger)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="alert-octagon" size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gd-danger-text)' }}>هشدار مهم</span>
              <span className="dwp-mono" style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginInlineStart: 'auto' }}>۱۴:۳۲</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--gd-text-secondary)', marginTop: 6 }}>صفحهٔ پرداخت از ۱۲ دقیقه قبل خطای ۵۰۰ داشت.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 9, fontSize: 13 }}>
              <span><b style={{ color: 'var(--gd-text-muted)', fontWeight: 600 }}>علت:</b> آپدیت افزونهٔ درگاه پرداخت</span>
              <span><b style={{ color: 'var(--gd-text-muted)', fontWeight: 600 }}>اقدام:</b> نسخهٔ قبلی افزونه بازیابی شد</span>
              <span style={{ color: 'var(--gd-success-text)', fontWeight: 600 }}><b style={{ color: 'var(--gd-text-muted)', fontWeight: 600 }}>وضعیت فعلی:</b> سایت سالم است</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section style={{ background: 'var(--gd-bg-app)', borderTop: '1px solid var(--gd-border)' }}>
        <div className="dwp-container" style={{ paddingBlock: 64 }}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 36px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--gd-primary)' }}>قیمت‌گذاری ساده</span>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.01em', margin: '10px 0 0' }}>پلنی برای هر اندازه</h2>
          </div>
          <div className="dwp-grid dwp-grid-3" style={{ alignItems: 'start' }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{ background: 'var(--gd-bg-surface)', border: p.popular ? '2px solid var(--gd-primary)' : '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', padding: 26, boxShadow: p.popular ? 'var(--gd-shadow-md)' : 'var(--gd-shadow-xs)', position: 'relative' }}>
                {p.popular && <span style={{ position: 'absolute', top: -12, insetInlineStart: 26, background: 'var(--gd-primary)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '4px 12px' }}>محبوب‌ترین</span>}
                <div style={{ fontSize: 16, fontWeight: 800 }}>{p.name}</div>
                <div style={{ margin: '12px 0 4px' }}><span className="dwp-mono" style={{ fontSize: 30, fontWeight: 800 }}>{p.price}</span></div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>تومان / ماه</div>
                <div style={{ height: 1, background: 'var(--gd-border)', margin: '18px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, color: 'var(--gd-text-secondary)', marginBottom: 20 }}>
                  {p.feats.map((f) => <span key={f} style={{ display: 'flex', gap: 9 }}><Icon name="check" size={17} style={{ color: 'var(--gd-success)' }} /> {f}</span>)}
                </div>
                <Button as={Link} to="/checkout" variant={p.variant} size="md" fullWidth>{p.cta}</Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA (ink) */}
      <div data-theme="ink" style={{ background: 'var(--gd-bg-app)' }}>
        <div className="dwp-container dwp-cta" style={{ paddingBlock: 60, display: 'flex', alignItems: 'center', gap: 30, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.01em', margin: 0, color: 'var(--gd-text)' }}>همین امروز خیال‌تان از سایت راحت شود</h2>
            <p style={{ fontSize: 15, color: 'var(--gd-text-secondary)', margin: '10px 0 0' }}>دسترسی آزمایشی — بدون کارت بانکی. اتصال در کمتر از دو دقیقه.</p>
          </div>
          <Button as={Link} to="/register" variant="primary" size="lg" leftIcon="shield-check">ساخت حساب</Button>
        </div>
      </div>
    </>
  )
}
