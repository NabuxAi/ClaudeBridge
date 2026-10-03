import { useState, useEffect } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { Button, IconButton, SidebarItem, StatusPill, AuthorityBadge } from '../components/index.js'
import TaskNotificationBar from '../components/TaskNotificationBar.jsx'
import Trans from '../components/Trans.jsx'
import { TaskProvider } from '../lib/tasks.jsx'
import { account } from '../lib/api.js'
import { digits, t } from '../lib/i18n.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { useAuth } from '../lib/auth.jsx'

// Full-content states the shell itself can be in while it does not know the
// site. None of them may borrow a status or an authority level: a missing
// reading never renders as "healthy", and a missing permission never renders
// as "auto".
//   loading  → shell renders, status pill says "checking"
//   ready    → normal shell
//   error    → the sites list could not be loaded; retry
//   notfound → the URL's siteId matches no site of this account
//   empty    → the account has no sites at all

function ShellState({ icon, tone = 'muted', title, text, children }) {
  return (
    <div className="dwp-shellstate">
      <span className={['dwp-shellstate__ic', tone !== 'muted' && `dwp-shellstate__ic--${tone}`].filter(Boolean).join(' ')}>
        <Icon name={icon} size={24} />
      </span>
      <h2 className="dwp-shellstate__title">{title}</h2>
      <p className="dwp-shellstate__text">{text}</p>
      {children && <div className="dwp-shellstate__actions">{children}</div>}
    </div>
  )
}

export default function SiteShell() {
  const { siteId } = useParams()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState(null)
  const [siteState, setSiteState] = useState('loading')
  const [attempt, setAttempt] = useState(0)

  const base = `/site/${siteId}`
  // Real open-alert count from the event log; null means unknown, and unknown
  // shows nothing rather than a zero we cannot stand behind.
  const openAlerts = site?.incidents ? digits(site.incidents) : undefined
  const NAV = [
    { to: base, end: true, icon: 'layout-dashboard', label: t('shell.site.nav.overview') },
    // Badges only where there is a real count behind them. `undefined` hides
    // the pill entirely, which is the honest state for a number nobody has
    // measured — a hardcoded "5" next to Updates is a number the customer will
    // act on, and it was decoration.
    { to: `${base}/incidents`, icon: 'bell', label: t('shell.site.nav.incidents'), badge: openAlerts },
    { to: `${base}/updates`, icon: 'refresh-cw', label: t('shell.site.nav.updates') },
    { to: `${base}/security`, icon: 'shield-check', label: t('shell.site.nav.security') },
    { to: `${base}/backups`, icon: 'database', label: t('shell.site.nav.backups') },
    { to: `${base}/speed`, icon: 'gauge', label: t('shell.site.nav.speed') },
    // HTTP availability checks — the page itself labels the honest scope:
    // "HTTP reachability, not a user/checkout journey".
    { to: `${base}/monitors`, icon: 'activity', label: t('shell.site.nav.monitors') },
    // Diagnostic, not destructive-by-intent — but it does flip plugins on a
    // live site, so it sits below the read-only screens.
    { to: `${base}/conflict`, icon: 'git-branch', label: t('shell.site.nav.conflict') },
    // Deliberately not near the top: this is the destructive one.
    { to: `${base}/rescue`, icon: 'shield-alert', label: t('shell.site.nav.rescue') },
    { to: `${base}/assistant`, icon: 'sparkles', label: t('shell.site.nav.assistant') },
    { to: `${base}/hosting`, icon: 'server', label: t('shell.site.nav.hosting') },
    { to: `${base}/settings`, icon: 'settings', label: t('shell.site.nav.settings') },
  ]

  useEffect(() => {
    let alive = true
    // The reset is the point: the previous site's name/status must never
    // render under this site's URL while the fresh list loads. The fetch
    // below re-fills both.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSite(null)
    setSiteState('loading')
    account.sites().then((list) => {
      if (!alive) return
      // Exact match only. Substituting the first site of the list would show
      // one site's name and status under another site's URL.
      const found = (Array.isArray(list) ? list : []).find((s) => s.id === siteId)
      if (found) {
        setSite(found)
        setSiteState('ready')
      } else {
        setSiteState(list?.length ? 'notfound' : 'empty')
      }
    }).catch(() => {
      if (alive) setSiteState('error')
    })
    return () => { alive = false }
  }, [siteId, attempt])

  // checking (cyan) while loading, unknown (gray) after a failure, the real
  // status once loaded — and no pill at all when there is no site to describe.
  const status = siteState === 'loading' ? 'checking' : siteState === 'error' ? 'unknown' : site?.status

  return (
    <TaskProvider siteId={siteId}>
      <div className={['dwp-shell', open && 'is-open'].filter(Boolean).join(' ')}>
        <div className="dwp-scrim" onClick={() => setOpen(false)} />
        <aside className="dwp-aside">
          <div className="dwp-aside__brand"><Brand sub={t('common.tagline')} /></div>
          <Link to="/app/sites" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--gd-text-secondary)', textDecoration: 'none', padding: '7px 9px', marginBottom: 10, borderRadius: 'var(--gd-radius-md)', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)' }}>
            <Icon name="arrow-right" size={15} /> {t('shell.site.backToSites')}
          </Link>
          <nav className="dwp-aside__nav" onClick={() => setOpen(false)}>
            {NAV.map((n) => <SidebarItem key={n.to} {...n} />)}
          </nav>
          <div style={{ marginTop: 14, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gd-text-secondary)' }}>{t('shell.site.authorityMode')}</span>
              <AuthorityBadge level={site?.authority} size="sm" />
            </div>
            <p style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--gd-text-muted)', margin: 0 }}>
              {t('shell.site.authorityHint')}
            </p>
          </div>
        </aside>

        <div className="dwp-main">
          <header className="dwp-topbar">
            <IconButton className="dwp-burger" icon="menu" label={t('common.menu')} onClick={() => setOpen(true)} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '6px 12px', fontSize: 13, fontWeight: 600 }}>
              <Icon name="globe" size={16} /><span className="dwp-mono">{site?.name || siteId}</span>
              <Icon name="chevron-down" size={15} style={{ color: 'var(--gd-text-muted)' }} />
            </span>
            <StatusPill status={status} />
            <span className="dwp-spacer" />
            <LanguageSwitcher />
            <Button as={Link} to={`${base}/assistant`} variant="subtle" size="sm" leftIcon="sparkles" className="dwp-desktop-only">{t('shell.site.askAssistant')}</Button>
            <span className="dwp-avatar">{user?.initials || '?'}</span>
          </header>
          <TaskNotificationBar />
          {siteState === 'ready' || siteState === 'loading' ? (
            <main className="dwp-content">
              {/* Keyed by siteId: switching sites remounts the page instead of
                  letting it keep the previous site's fetched state. */}
              <Outlet key={siteId} context={{ siteId, site }} />
            </main>
          ) : (
            <main className="dwp-content">
              {siteState === 'error' && (
                <ShellState icon="alert-circle" tone="warning" title={t('shell.site.loadError.title')}
                  text={t('shell.site.loadError.text')}>
                  <Button variant="secondary" size="md" leftIcon="refresh-cw" onClick={() => setAttempt((a) => a + 1)}>
                    {t('common.retry')}
                  </Button>
                </ShellState>
              )}
              {siteState === 'notfound' && (
                <ShellState icon="search" title={t('shell.site.notFound.title')}
                  text={<Trans k="shell.site.notFound.text" vars={{ siteId }} />}>
                  <Button as={Link} to="/app/sites" variant="secondary" size="md" leftIcon="arrow-right">
                    {t('shell.site.backToSites')}
                  </Button>
                </ShellState>
              )}
              {siteState === 'empty' && (
                <ShellState icon="globe" title={t('shell.site.empty.title')}
                  text={t('shell.site.empty.text')}>
                  <Button as={Link} to="/onboarding" variant="primary" size="md" leftIcon="plus">
                    {t('shell.addSite')}
                  </Button>
                </ShellState>
              )}
            </main>
          )}
        </div>
      </div>
    </TaskProvider>
  )
}
