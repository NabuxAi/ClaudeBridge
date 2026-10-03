import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { Button, IconButton, SidebarItem } from '../components/index.js'
import { useAuth } from '../lib/auth.jsx'
import { t } from '../lib/i18n.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'

// The site count used to be a hardcoded "3" next to "My sites", for every
// account including a brand-new one with none. Removed rather than wired: a
// count that is right is worth a query, and a count that is wrong is worse
// than no badge at all.
const BASE_NAV = [
  { to: '/app', end: true, icon: 'layout-grid', label: 'shell.account.nav.dashboard' },
  { to: '/app/sites', icon: 'globe', label: 'shell.account.nav.sites' },
  { to: '/app/alerts', icon: 'bell-ring', label: 'shell.account.nav.alerts' },
  { to: '/app/billing', icon: 'credit-card', label: 'shell.account.nav.billing' },
  { to: '/app/team', icon: 'users', label: 'shell.account.nav.team' },
  { to: '/app/notifications', icon: 'bell', label: 'shell.account.nav.notifications' },
  { to: '/app/security', icon: 'monitor-smartphone', label: 'shell.account.nav.security' },
  { to: '/app/profile', icon: 'user-round', label: 'shell.account.nav.profile' },
]

export default function AccountShell() {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // A real sign-out, not just dropping the token from the browser:
  // authApi.logout revokes this device's session on the server
  // (POST /auth/logout), then clears the local token. Even when the call
  // fails the local sign-out completes — a network error must never trap
  // someone on the page that closes their session.
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try { await logout() } finally { navigate('/login', { replace: true }) }
  }
  const NAV = user?.role === 'admin'
    ? [...BASE_NAV, { to: '/admin', icon: 'shield-check', label: 'shell.account.nav.admin' }]
    : BASE_NAV
  return (
    <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')}>
      <div className="dwp-scrim" onClick={() => setOpen(false)} />
      <aside className="dwp-aside">
        <div className="dwp-aside__brand"><Brand sub={t('shell.account.brandSub')} /></div>
        <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
          {NAV.map((n) => <SidebarItem key={n.to} {...n} label={t(n.label)} />)}
        </nav>
        {/* A "Pro plan · 3/5 active sites" card used to sit here with a
            progress bar and an upgrade button. The 3/5 was a constant, not
            a reading. A link to the price list is the honest version. */}
        <div style={{ marginTop: 14, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: 13 }}>
          <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', textDecoration: 'none' }}>
            <Icon name="crown" size={15} /> {t('shell.account.seePlans')}
          </Link>
        </div>
      </aside>

      <div className="dwp-main">
        <header className="dwp-topbar">
          <IconButton className="dwp-burger" icon="menu" label={t('common.menu')} onClick={() => setOpen(true)} />
          <span className="dwp-spacer" />
          <LanguageSwitcher />
          <Button as={Link} to="/onboarding" variant="primary" size="sm" leftIcon="plus">{t('shell.addSite')}</Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon="log-out"
            loading={signingOut}
            disabled={signingOut}
            onClick={signOut}
          >
            {t('shell.signOut')}
          </Button>
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
