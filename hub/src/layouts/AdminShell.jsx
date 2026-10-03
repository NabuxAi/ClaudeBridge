import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { IconButton, SidebarItem } from '../components/index.js'
import { useAuth } from '../lib/auth.jsx'
import { t } from '../lib/i18n.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'

const NAV = [
  { to: '/admin', end: true, icon: 'layout-dashboard', label: 'shell.admin.nav.dashboard' },
  { to: '/admin/users', icon: 'users', label: 'shell.admin.nav.users' },
  { to: '/admin/events', icon: 'activity', label: 'shell.admin.nav.events' },
]

export default function AdminShell() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  return (
    <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')}>
      <div className="dwp-scrim" onClick={() => setOpen(false)} />
      <aside className="dwp-aside">
        <div className="dwp-aside__brand"><Brand sub={t('shell.admin.brandSub')} /></div>
        <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
          {NAV.map((n) => <SidebarItem key={n.to} {...n} label={t(n.label)} />)}
        </nav>
        <div style={{ marginTop: 14, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: 13 }}>
          <Link to="/app" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', textDecoration: 'none' }}>
            <Icon name="arrow-right" size={15} /> {t('shell.admin.backToAccount')}
          </Link>
        </div>
      </aside>

      <div className="dwp-main">
        <header className="dwp-topbar">
          <IconButton className="dwp-burger" icon="menu" label={t('common.menu')} onClick={() => setOpen(true)} />
          <span className="dwp-spacer" />
          <LanguageSwitcher />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, paddingInlineStart: 10, borderInlineStart: '1px solid var(--gd-border)' }}>
            <span className="dwp-avatar">{user?.initials || '?'}</span>
            <span className="dwp-desktop-only">
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{user?.name || '…'}</span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gd-text-muted)' }}>{user?.role || t('common.loading')}</span>
            </span>
          </span>
        </header>
        <main className="dwp-content"><Outlet /></main>
      </div>
    </div>
  )
}
