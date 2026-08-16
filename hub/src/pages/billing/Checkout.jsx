import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button } from '../../components/index.js'

export default function Checkout() {
  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--gd-bg-app)', color: 'var(--gd-text)', fontFamily: 'var(--gd-font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 64, height: 64, borderRadius: 18,
          background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)',
          color: 'var(--gd-text-secondary)', marginBottom: 22,
        }}>
          <Icon name="wallet" size={30} />
        </span>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>پرداخت هنوز فعال نشده</h1>
        <p style={{ fontSize: 15, color: 'var(--gd-text-secondary)', margin: '12px 0 28px', lineHeight: 1.8 }}>
          سیستم صدور فاکتور و درگاه پرداخت هنوز ساخته نشده. هیچ وجهی از این صفحه دریافت نمی‌شود.
        </p>
        <div style={{
          background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)',
          padding: '20px 22px', textAlign: 'right', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Icon name="info" size={20} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto', marginTop: 2 }} />
            <div style={{ fontSize: 14, color: 'var(--gd-text-secondary)', lineHeight: 1.8 }}>
              در حال حاضر همهٔ حساب‌ها در حالت آزمایشی فعال هستند. برای استفاده در محیط تولید یا دریافت اطلاعات بیشتر، لطفاً با تیم تماس بگیرید.
            </div>
          </div>
        </div>
        <Button variant="primary" size="lg" fullWidth leftIcon="mail" href="mailto:sales@digiwp.com">
          درخواست دسترسی آزمایشی
        </Button>
        <p style={{ marginTop: 20 }}>
          <Link to="/app" style={{ fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrow-right" size={15} /> بازگشت به داشبورد
          </Link>
        </p>
      </div>
    </div>
  )
}
