import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { Button, IconButton, SidebarItem, ProgressBar } from '../components/index.js'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  { to: '/app', end: true, icon: 'layout-grid', label: 'داشبورد حساب' },
  { to: '/app/sites', icon: 'globe', label: 'سایت‌های من', badge: '۳' },
  { to: '/app/billing', icon: 'credit-card', label: 'اشتراک و صورت‌حساب' },
  { to: '/app/team', icon: 'users', label: 'اعضای تیم' },
  { to: '/app/notifications', icon: 'bell', label: 'اعلان‌ها' },
  { to: '/app/profile', icon: 'user-round', label: 'پروفایل و حساب' },
]

export default function AccountShell() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  return (
    <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')} dir="rtl">
      <div className="dwp-scrim" onClick={() => setOpen(false)} />
      <aside className="dwp-aside">
        <div className="dwp-aside__brand"><Brand sub="حساب کاربری" /></div>
        <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
          {NAV.map((n) => <SidebarItem key={n.to} {...n} />)}
        </nav>
        <div style={{ marginTop: 14, background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)', borderRadius: 'var(--gd-radius-lg)', padding: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="crown" size={15} /></span>
            <div style={{ fontSize: 13, fontWeight: 800 }}>پلن حرفه‌ای</div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--gd-text-secondary)', marginBottom: 5 }}>
              <span>سایت‌های فعال</span><span className="dwp-mono">۳ / ۵</span>
            </div>
            <ProgressBar value={3} max={5} tone="primary" size="sm" />
          </div>
          <Button as={Link} to="/pricing" variant="primary" size="sm" fullWidth leftIcon="arrow-up-circle">ارتقای پلن</Button>
        </div>
      </aside>

      <div className="dwp-main">
        <header className="dwp-topbar">
          <IconButton className="dwp-burger" icon="menu" label="منو" onClick={() => setOpen(true)} />
          <span className="dwp-desktop-only" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-pill)', padding: '7px 14px', fontSize: 13, color: 'var(--gd-text-muted)', width: 250 }}>
            <Icon name="search" size={15} /> جستجوی سایت یا تنظیمات…
          </span>
          <span className="dwp-spacer" />
          <Button as={Link} to="/onboarding" variant="primary" size="sm" leftIcon="plus">افزودن سایت</Button>
          <IconButton icon="bell" label="اعلان‌ها" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, paddingInlineStart: 10, borderInlineStart: '1px solid var(--gd-border)' }}>
            <span className="dwp-avatar">{user?.initials || 'م'}</span>
            <span className="dwp-desktop-only">
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{user?.name || 'مریم رضایی'}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gd-text-muted)' }}>{user?.role || 'مدیر حساب'}</span>
            </span>
          </span>
        </header>
        <main className="dwp-content"><Outlet /></main>
      </div>
    </div>
  )
}
