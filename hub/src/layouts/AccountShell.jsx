import { useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { Button, IconButton, SidebarItem } from '../components/index.js'
import { useAuth } from '../lib/auth.jsx'

// The site count used to be a hardcoded "۳" next to سایت‌های من, for every
// account including a brand-new one with none. Removed rather than wired: a
// count that is right is worth a query, and a count that is wrong is worse
// than no badge at all.
const BASE_NAV = [
  { to: '/app', end: true, icon: 'layout-grid', label: 'داشبورد حساب' },
  { to: '/app/sites', icon: 'globe', label: 'سایت‌های من' },
  { to: '/app/alerts', icon: 'bell-ring', label: 'هشدار اضطراری' },
  { to: '/app/billing', icon: 'credit-card', label: 'اشتراک و صورت‌حساب' },
  { to: '/app/team', icon: 'users', label: 'اعضای تیم' },
  { to: '/app/notifications', icon: 'bell', label: 'اعلان‌ها' },
  { to: '/app/security', icon: 'monitor-smartphone', label: 'امنیت حساب' },
  { to: '/app/profile', icon: 'user-round', label: 'پروفایل و حساب' },
]

export default function AccountShell() {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // خروج واقعی، نه فقط پاک‌کردن توکن از مرورگر: authApi.logout نشست همین
  // دستگاه را روی سرور باطل می‌کند (POST /auth/logout) و بعد توکن محلی پاک
  // می‌شود. حتی اگر فراخوانی شکست بخورد، خروج محلی کامل می‌شود — کاربر
  // نباید به‌خاطر خطای شبکه در صفحه‌ای قفل بماند که نشستش را می‌بندد.
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try { await logout() } finally { navigate('/login', { replace: true }) }
  }
  const NAV = user?.role === 'admin'
    ? [...BASE_NAV, { to: '/admin', icon: 'shield-check', label: 'پنل ادمین' }]
    : BASE_NAV
  return (
    <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')} dir="rtl">
      <div className="dwp-scrim" onClick={() => setOpen(false)} />
      <aside className="dwp-aside">
        <div className="dwp-aside__brand"><Brand sub="حساب کاربری" /></div>
        <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
          {NAV.map((n) => <SidebarItem key={n.to} {...n} />)}
        </nav>
        {/* A "پلن حرفه‌ای · ۳/۵ سایت فعال" card used to sit here with a
            progress bar and an upgrade button. There is no subscription
            system, no plan attached to any account, and the ۳/۵ was a
            constant. A link to the price list is the honest version. */}
        <div style={{ marginTop: 14, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: 13 }}>
          <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', textDecoration: 'none' }}>
            <Icon name="crown" size={15} /> دیدن پلن‌ها و قیمت‌ها
          </Link>
        </div>
      </aside>

      <div className="dwp-main">
        <header className="dwp-topbar">
          <IconButton className="dwp-burger" icon="menu" label="منو" onClick={() => setOpen(true)} />
          <span className="dwp-spacer" />
          <Button as={Link} to="/onboarding" variant="primary" size="sm" leftIcon="plus">افزودن سایت</Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon="log-out"
            loading={signingOut}
            disabled={signingOut}
            onClick={signOut}
          >
            خروج
          </Button>
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
