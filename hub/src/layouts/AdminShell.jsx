import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { IconButton, SidebarItem } from '../components/index.js'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  { to: '/admin', end: true, icon: 'layout-dashboard', label: 'داشبورد ادمین' },
  { to: '/admin/users', icon: 'users', label: 'کاربران' },
  { to: '/admin/events', icon: 'activity', label: 'رویدادها' },
]

export default function AdminShell() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  return (
    <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')} dir="rtl">
      <div className="dwp-scrim" onClick={() => setOpen(false)} />
      <aside className="dwp-aside">
        <div className="dwp-aside__brand"><Brand sub="پنل ادمین" /></div>
        <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
          {NAV.map((n) => <SidebarItem key={n.to} {...n} />)}
        </nav>
        <div style={{ marginTop: 14, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: 13 }}>
          <Link to="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', textDecoration: 'none' }}>
            <Icon name="arrow-right" size={15} /> بازگشت به حساب کاربری
          </Link>
        </div>
      </aside>

      <div className="dwp-main">
        <header className="dwp-topbar">
          <IconButton className="dwp-burger" icon="menu" label="منو" onClick={() => setOpen(true)} />
          <span className="dwp-spacer" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, paddingInlineStart: 10, borderInlineStart: '1px solid var(--gd-border)' }}>
            <span className="dwp-avatar">{user?.initials || '؟'}</span>
            <span className="dwp-desktop-only">
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{user?.name || '…'}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gd-text-muted)' }}>{user?.role || 'بارگذاری…'}</span>
            </span>
          </span>
        </header>
        <main className="dwp-content"><Outlet /></main>
      </div>
    </div>
  )
}
