import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge, Checkbox } from '../../components/index.js'

const GATEWAYS = [
  {
    id: 'zarinpal', chip: 'زرین', chipBg: '#ffe000', chipColor: '#1a1a1a', chipSize: 11,
    title: 'درگاه زرین‌پال', desc: 'پرداخت با همهٔ کارت‌های عضو شتاب', recommended: true,
  },
  {
    id: 'mellat', chip: 'ملت', chipBg: '#e6202e', chipColor: '#fff', chipSize: 10,
    title: 'به‌پرداخت ملت', desc: 'درگاه مستقیم بانک ملت',
  },
  {
    id: 'saman', chip: 'سامان', chipBg: '#0a4ea3', chipColor: '#fff', chipSize: 10,
    title: 'درگاه بانک سامان (سِپ)', desc: 'درگاه مستقیم بانک سامان',
  },
]

export default function Checkout() {
  const navigate = useNavigate()
  const [gateway, setGateway] = useState('zarinpal')

  const pay = () => navigate('/invoice/INV-1403-014')

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--gd-bg-app)', color: 'var(--gd-text)', fontFamily: 'var(--gd-font-sans)' }}>

      {/* Brand + steps header */}
      <div style={{ height: 60, display: 'flex', alignItems: 'center', gap: 26, padding: '0 34px', background: 'var(--gd-bg-surface)', borderBottom: '1px solid var(--gd-border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield-check" size={19} /></span>
          <span style={{ fontWeight: 800, fontSize: 16 }}>Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b></span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--gd-success-text)', fontWeight: 700 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gd-success)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={13} /></span> انتخاب پلن
          </span>
          <span style={{ width: 26, height: 1, background: 'var(--gd-border-strong)' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--gd-primary)', fontWeight: 800 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--gd-font-mono)', fontSize: 11 }}>۲</span> پرداخت
          </span>
          <span style={{ width: 26, height: 1, background: 'var(--gd-border)' }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--gd-text-muted)', fontWeight: 600 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gd-bg-inset)', color: 'var(--gd-text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--gd-font-mono)', fontSize: 11 }}>۳</span> تأیید
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--gd-success-text)', fontWeight: 700 }}><Icon name="lock" size={14} /> اتصال امن SSL</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 22, padding: '28px 34px 34px', alignItems: 'start' }}>

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Billing info */}
            <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="user" size={15} /></span> اطلاعات صورت‌حساب
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Input label="نام و نام خانوادگی" placeholder="مریم رضایی" />
                <Input label="شمارهٔ موبایل" placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹" leftIcon="smartphone" />
                <Input label="ایمیل" placeholder="maryam@digiwp.com" leftIcon="mail" />
                <Input label="کد/شناسهٔ ملی (اختیاری)" placeholder="برای فاکتور رسمی" leftIcon="file-badge" />
              </div>
            </div>

            {/* Payment method */}
            <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="wallet" size={15} /></span> روش پرداخت
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {GATEWAYS.map((g) => {
                  const active = gateway === g.id
                  return (
                    <div
                      key={g.id}
                      onClick={() => setGateway(g.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer', border: active ? '2px solid var(--gd-primary)' : '1px solid var(--gd-border)', background: active ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 16px' }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', border: active ? '6px solid var(--gd-primary)' : '2px solid var(--gd-border-strong)', background: active ? '#fff' : 'var(--gd-bg-surface)', flex: '0 0 auto' }} />
                      <span style={{ width: 46, height: 32, borderRadius: 7, background: g.chipBg, color: g.chipColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: g.chipSize, flex: '0 0 auto' }}>{g.chip}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{g.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>{g.desc}</div>
                      </div>
                      {g.recommended && <Badge variant="success" appearance="soft" dot>پیشنهادی</Badge>}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 16px', opacity: 0.7 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--gd-border-strong)', background: 'var(--gd-bg-surface)', flex: '0 0 auto' }} />
                  <span style={{ width: 46, height: 32, borderRadius: 7, background: 'var(--gd-bg-inset)', color: 'var(--gd-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="wallet" size={17} /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>کیف پول دیجی‌وی‌پی</div>
                    <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>موجودی: ۰ تومان</div>
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', fontWeight: 700 }}>ناکافی</span>
                </div>
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--gd-border-subtle)' }}>
                <Checkbox label="پرداخت خودکار در پایان دوره فعال باشد" defaultChecked />
              </div>
            </div>
          </div>

          {/* Right column — order summary */}
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-md)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>خلاصهٔ سفارش</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)', borderRadius: 'var(--gd-radius-lg)', padding: '13px 15px' }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="crown" size={20} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>پلن حرفه‌ای</div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-secondary)', marginTop: 1 }}>دورهٔ سالانه · ۵ سایت · پایش ۱ دقیقه</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <div style={{ flex: 1 }}><Input placeholder="کد تخفیف" leftIcon="ticket-percent" /></div>
              <Button variant="secondary" size="md">اعمال</Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 13.5, paddingTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--gd-text-secondary)' }}>قیمت پلن (۱۲ ماه)</span><span style={{ fontFamily: 'var(--gd-font-mono)' }}>۵٬۸۸۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={15} /> تخفیف پرداخت سالانه</span><span style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-success-text)' }}>−۹۸۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--gd-text-secondary)' }}>جمع جزء</span><span style={{ fontFamily: 'var(--gd-font-mono)' }}>۴٬۹۰۰٬۰۰۰</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--gd-text-secondary)' }}>مالیات بر ارزش افزوده (۱۰٪)</span><span style={{ fontFamily: 'var(--gd-font-mono)' }}>۴۹۰٬۰۰۰</span></div>
            </div>
            <div style={{ height: 1, background: 'var(--gd-border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>مبلغ قابل پرداخت</span>
              <span style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-primary)' }}>۵٬۳۹۰٬۰۰۰ <span style={{ fontSize: 12, color: 'var(--gd-text-muted)', fontWeight: 600 }}>تومان</span></span>
            </div>
            <Button variant="primary" size="lg" fullWidth leftIcon="lock" onClick={pay}>پرداخت امن</Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', paddingTop: 2 }}>
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, border: '1px solid var(--gd-border)', borderRadius: 8, background: 'var(--gd-bg-subtle)', color: 'var(--gd-success-text)' }}>
                <Icon name="shield-check" size={20} /><span style={{ fontSize: 7, fontWeight: 700, marginTop: 2 }}>eNamad</span>
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', lineHeight: 1.7 }}>پرداخت از طریق درگاه‌های دارای مجوز شاپرک انجام می‌شود. اطلاعات کارت شما نزد دیجی‌وی‌پی ذخیره نمی‌شود.</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
