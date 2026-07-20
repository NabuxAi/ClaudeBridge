import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button } from '../../components/index.js'
import { faMoney } from '../../lib/format.js'
import { account } from '../../lib/api.js'

// Design copy per plan id — merged onto the fetched plans so prices stay
// data-driven while the marketing text is reproduced verbatim.
const PLAN_DETAILS = {
  base: {
    subtitle: 'برای یک وب‌سایت شخصی یا فروشگاه',
    cta: 'شروع آزمایش رایگان',
    variant: 'secondary',
    features: [
      { t: '۱ سایت وردپرس' },
      { t: 'پایش هر ۵ دقیقه' },
      { t: 'بکاپ روزانه (۷ روز)' },
      { t: 'ریسک‌سنجی آپدیت‌ها' },
      { t: 'هشدار ایمیلی' },
    ],
  },
  pro: {
    subtitle: 'برای فریلنسرها و کسب‌وکارهای در حال رشد',
    cta: 'انتخاب پلن حرفه‌ای',
    variant: 'primary',
    features: [
      { t: 'همهٔ امکانات پایه، به‌علاوهٔ:', head: true },
      { t: 'تا ۵ سایت وردپرس' },
      { t: 'پایش هر ۱ دقیقه + محیط استیجینگ' },
      { t: 'دستیار هوشمند AI' },
      { t: 'هشدار ایمیل، پیامک و تلگرام' },
      { t: 'گزارش هفتگی خودکار' },
    ],
  },
  agency: {
    subtitle: 'برای آژانس‌ها و مدیریت سایت مشتریان',
    cta: 'تماس با تیم فروش',
    variant: 'secondary',
    features: [
      { t: 'همهٔ امکانات حرفه‌ای، به‌علاوهٔ:', head: true },
      { t: 'سایت نامحدود' },
      { t: 'اعضای تیم و نقش‌ها' },
      { t: 'گزارش با برند شما (White-label)' },
      { t: 'API و وبهوک' },
      { t: 'پشتیبانی اولویت‌دار + مدیر اختصاصی' },
    ],
  },
}

// Feature-comparison rows. A cell is a string, { t, mono }, or { icon }.
const ROWS = [
  { label: 'تعداد سایت', base: { t: '۱', mono: true }, pro: { t: '۵', mono: true }, agency: 'نامحدود' },
  { label: 'فاصلهٔ پایش', base: '۵ دقیقه', pro: '۱ دقیقه', agency: '۳۰ ثانیه' },
  { label: 'بکاپ خودکار', base: 'روزانه · ۷ روز', pro: 'روزانه · ۳۰ روز', agency: 'ساعتی · ۹۰ روز' },
  { label: 'محیط استیجینگ', base: { icon: 'minus' }, pro: { icon: 'check' }, agency: { icon: 'check' } },
  { label: 'دستیار هوشمند AI', base: 'محدود', pro: { icon: 'check' }, agency: 'نامحدود' },
  { label: 'کانال هشدار', base: 'ایمیل', pro: 'ایمیل·پیامک·تلگرام', agency: 'همه + وبهوک' },
  { label: 'اعضای تیم', base: { icon: 'minus' }, pro: '۳ نفر', agency: 'نامحدود' },
  { label: 'گزارش با برند شما', base: { icon: 'minus' }, pro: { icon: 'minus' }, agency: { icon: 'check' } },
  { label: 'پشتیبانی', base: 'تیکت', pro: 'تیکت · چت', agency: 'اولویت‌دار · تلفن' },
]

const TRUST = [
  { icon: 'badge-check', color: 'var(--gd-success)', t: 'نماد اعتماد الکترونیکی' },
  { icon: 'rotate-ccw', color: 'var(--gd-primary)', t: 'بازگشت وجه تا ۷ روز' },
  { icon: 'credit-card', color: 'var(--gd-text-secondary)', t: 'پرداخت با همهٔ کارت‌های شتاب' },
  { icon: 'file-text', color: 'var(--gd-text-secondary)', t: 'صدور فاکتور رسمی' },
]

function ValueCell({ v, pro, last }) {
  const style = {
    padding: '13px 16px',
    textAlign: 'center',
    fontSize: 13,
    borderBottom: last ? 'none' : '1px solid var(--gd-border-subtle)',
    ...(pro ? { background: 'var(--gd-primary-subtle)' } : {}),
  }
  if (v && v.icon) {
    const isCheck = v.icon === 'check'
    return (
      <div style={style}>
        <Icon name={v.icon} size={isCheck ? 17 : 16} style={{ color: isCheck ? 'var(--gd-success)' : 'var(--gd-text-disabled)' }} />
      </div>
    )
  }
  const text = typeof v === 'string' ? v : v.t
  const textStyle = {
    ...style,
    ...(pro ? { fontWeight: 700 } : {}),
    ...(v && v.mono ? { fontFamily: 'var(--gd-font-mono)' } : {}),
  }
  return <div style={textStyle}>{text}</div>
}

export default function Pricing() {
  const [plans, setPlans] = useState(null)
  const [cycle, setCycle] = useState('yearly')

  useEffect(() => {
    account.plans().then(setPlans)
  }, [])

  const toggleOption = (active) => ({
    padding: '9px 20px',
    borderRadius: 999,
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    ...(active
      ? { background: 'var(--gd-bg-surface)', color: 'var(--gd-text)', boxShadow: 'var(--gd-shadow-xs)' }
      : { background: 'transparent', color: 'var(--gd-text-secondary)' }),
  })

  if (!plans) return null

  const isYearly = cycle === 'yearly'

  return (
    <div style={{ background: 'var(--gd-bg-app)', color: 'var(--gd-text)' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto', padding: '46px 24px 10px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--gd-success-text)', background: 'var(--gd-success-bg)', border: '1px solid var(--gd-success-border)', borderRadius: 999, padding: '6px 13px' }}>
          <Icon name="gift" size={14} /> ۱۴ روز آزمایش رایگان — بدون کارت بانکی
        </span>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-.02em', margin: '18px 0 0', lineHeight: 1.2 }}>پلنی که با کسب‌وکار شما بزرگ می‌شود</h1>
        <p style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--gd-text-secondary)', margin: '12px 0 0' }}>از یک فروشگاه تا ده‌ها سایت مشتری — همیشه یک پلن مناسب دارید. هر زمان تغییر یا لغو کنید.</p>
      </div>

      {/* Billing cycle toggle */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 6px' }}>
        <div style={{ display: 'inline-flex', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 999, padding: 4, gap: 3 }}>
          <button type="button" style={toggleOption(!isYearly)} onClick={() => setCycle('monthly')}>پرداخت ماهانه</button>
          <button type="button" style={toggleOption(isYearly)} onClick={() => setCycle('yearly')}>
            پرداخت سالانه
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gd-success-text)', background: 'var(--gd-success-bg)', borderRadius: 999, padding: '2px 8px' }}>۲ ماه رایگان</span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'start', maxWidth: 1120, margin: '0 auto', padding: '28px 40px 8px' }}>
        {plans.map((plan) => {
          const detail = PLAN_DETAILS[plan.id] || { subtitle: '', cta: 'انتخاب پلن', variant: 'secondary', features: [] }
          const monthly = plan.price
          const yearly = plan.price * 10
          const monthlyEquiv = Math.round(yearly / 12 / 1000) * 1000
          const big = isYearly ? faMoney(yearly) : faMoney(monthly)
          const unit = isYearly ? 'تومان / سال' : 'تومان / ماه'
          const sub = isYearly ? `معادل ${faMoney(monthlyEquiv)} تومان در ماه` : null
          return (
            <div key={plan.id} style={{ background: 'var(--gd-bg-surface)', border: plan.popular ? '2px solid var(--gd-primary)' : '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', padding: 26, boxShadow: plan.popular ? 'var(--gd-shadow-lg)' : 'var(--gd-shadow-xs)', position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {plan.popular && (
                <span style={{ position: 'absolute', top: -12, insetInlineStart: 26, background: 'var(--gd-primary)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '4px 12px' }}>محبوب‌ترین</span>
              )}
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{plan.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 3 }}>{detail.subtitle}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: plan.popular ? 'var(--gd-primary)' : 'inherit' }}>{big}</span>
                  <span style={{ fontSize: 13, color: 'var(--gd-text-muted)' }}>{unit}</span>
                </div>
                {sub && <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 4 }}>{sub}</div>}
              </div>
              <Button as={Link} to="/checkout" variant={detail.variant} size="lg" fullWidth>{detail.cta}</Button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 13.5, color: 'var(--gd-text-secondary)' }}>
                {detail.features.map((f) => (
                  <span key={f.t} style={{ display: 'flex', gap: 9, ...(f.head ? { fontWeight: 600, color: 'var(--gd-text)' } : {}) }}>
                    <Icon name="check" size={17} style={{ color: f.head ? 'var(--gd-primary)' : 'var(--gd-success)', flex: '0 0 auto' }} /> {f.t}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Feature comparison table */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '34px 40px 10px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>مقایسهٔ کامل امکانات</div>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-xs)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr' }}>
            <div style={{ padding: '14px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12.5, fontWeight: 700, color: 'var(--gd-text-muted)' }}>قابلیت</div>
            <div style={{ padding: '14px 16px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', textAlign: 'center', fontSize: 13.5, fontWeight: 800 }}>پایه</div>
            <div style={{ padding: '14px 16px', background: 'var(--gd-primary-subtle)', borderBottom: '1px solid var(--gd-primary-border)', textAlign: 'center', fontSize: 13.5, fontWeight: 800, color: 'var(--gd-primary)' }}>حرفه‌ای</div>
            <div style={{ padding: '14px 16px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', textAlign: 'center', fontSize: 13.5, fontWeight: 800 }}>آژانس</div>
            {ROWS.map((row, i) => {
              const last = i === ROWS.length - 1
              return (
                <div key={row.label} style={{ display: 'contents' }}>
                  <div style={{ padding: '13px 20px', borderBottom: last ? 'none' : '1px solid var(--gd-border-subtle)', fontSize: 13, color: 'var(--gd-text-secondary)' }}>{row.label}</div>
                  <ValueCell v={row.base} last={last} />
                  <ValueCell v={row.pro} pro last={last} />
                  <ValueCell v={row.agency} last={last} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '14px 40px 44px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
          {TRUST.map((b) => (
            <span key={b.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 999, padding: '9px 15px' }}>
              <Icon name={b.icon} size={16} style={{ color: b.color }} /> {b.t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
