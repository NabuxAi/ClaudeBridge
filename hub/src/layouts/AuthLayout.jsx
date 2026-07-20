import { Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { StatusPill } from '../components/index.js'

// Split auth screen: form on one side, an ink "night-watch" panel on the other.
export default function AuthLayout() {
  return (
    <div className="dwp-authwrap" dir="rtl"
      style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--gd-font-sans)', color: 'var(--gd-text)' }}>
      <div style={{ flex: 1, background: 'var(--gd-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 376 }}>
          <div style={{ marginBottom: 30 }}><Brand /></div>
          <Outlet />
        </div>
      </div>
      <aside className="dwp-desktop-only" data-theme="ink"
        style={{ width: '46%', background: 'var(--gd-bg-app)', color: 'var(--gd-text)', padding: '56px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ width: 56, height: 56, borderRadius: 15, background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shield-check" size={30} />
        </span>
        <h3 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-.01em', margin: '22px 0 0' }}>
          سایت شما، ۲۴ ساعته زیر نظر یک پشتیبان هوشمند.
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 26 }}>
          {['مراقبت و رفع خودکار خرابی', 'آپدیت با ریسک‌سنجی و تست', 'بکاپ سالم و برگشت‌پذیر'].map((t) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 14, color: 'var(--gd-text-secondary)' }}>
              <Icon name="check-circle-2" size={19} style={{ color: 'var(--gd-primary)' }} /> {t}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 32, borderRadius: 'var(--gd-radius-xl)', border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)', padding: 16, boxShadow: 'var(--gd-shadow-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--gd-success-bg)', color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="shield-check" size={22} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>همه‌چیز سالم است</div>
              <div className="dwp-mono" style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>mystore.ir · ۹ سرویس</div>
            </div>
            <StatusPill status="healthy" size="sm" />
          </div>
        </div>
      </aside>
    </div>
  )
}
