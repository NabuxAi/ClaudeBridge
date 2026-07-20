import { useState, useEffect } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { Button, IconButton, SidebarItem, StatusPill, AuthorityBadge } from '../components/index.js'
import { account } from '../lib/api.js'

export default function SiteShell() {
  const { siteId } = useParams()
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState(null)

  const base = `/site/${siteId}`
  const NAV = [
    { to: base, end: true, icon: 'layout-dashboard', label: 'نمای کلی' },
    { to: `${base}/incidents`, icon: 'bell', label: 'هشدارها', badge: '۲' },
    { to: `${base}/updates`, icon: 'refresh-cw', label: 'آپدیت‌ها', badge: '۵' },
    { to: `${base}/security`, icon: 'shield-check', label: 'امنیت' },
    { to: `${base}/backups`, icon: 'database', label: 'بکاپ‌ها' },
    { to: `${base}/assistant`, icon: 'sparkles', label: 'دستیار هوشمند' },
    { to: `${base}/settings`, icon: 'settings', label: 'تنظیمات' },
  ]

  useEffect(() => {
    let alive = true
    account.sites().then((list) => { if (alive) setSite(list.find((s) => s.id === siteId) || list[0]) })
    return () => { alive = false }
  }, [siteId])

  return (
    <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')} dir="rtl">
      <div className="dwp-scrim" onClick={() => setOpen(false)} />
      <aside className="dwp-aside">
        <div className="dwp-aside__brand"><Brand sub="پشتیبان هوشمند وردپرس" /></div>
        <Link to="/app/sites" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--gd-text-secondary)', textDecoration: 'none', padding: '7px 9px', marginBottom: 10, borderRadius: 'var(--gd-radius-md)', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)' }}>
          <Icon name="arrow-right" size={15} /> بازگشت به همه سایت‌ها
        </Link>
        <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
          {NAV.map((n) => <SidebarItem key={n.to} {...n} />)}
        </nav>
        <div style={{ marginTop: 14, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gd-text-secondary)' }}>حالت اختیار</span>
            <AuthorityBadge level={site?.authority || 'auto'} size="sm" />
          </div>
          <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--gd-text-muted)', margin: 0 }}>
            کارهای کم‌ریسک خودکار انجام می‌شوند؛ موارد حساس نیازمند تأیید شماست.
          </p>
        </div>
      </aside>

      <div className="dwp-main">
        <header className="dwp-topbar">
          <IconButton className="dwp-burger" icon="menu" label="منو" onClick={() => setOpen(true)} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '6px 12px', fontSize: 13, fontWeight: 600 }}>
            <Icon name="globe" size={16} /><span className="dwp-mono">{site?.name || siteId}</span>
            <Icon name="chevron-down" size={15} style={{ color: 'var(--gd-text-muted)' }} />
          </span>
          <StatusPill status={site?.status || 'healthy'} />
          <span className="dwp-spacer" />
          <Button as={Link} to={`${base}/assistant`} variant="subtle" size="sm" leftIcon="sparkles" className="dwp-desktop-only">از پشتیبان بپرسید</Button>
          <IconButton icon="bell" label="اعلان‌ها" />
          <span className="dwp-avatar">م</span>
        </header>
        <main className="dwp-content"><Outlet context={{ siteId, site }} /></main>
      </div>
    </div>
  )
}
