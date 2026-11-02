import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { Button, IconButton } from '../components/index.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import PanelPageLoader from '../components/PanelPageLoader.jsx'
import { useAuth } from '../lib/auth.jsx'
import { t } from '../lib/i18n.js'
import { beginNavigation } from '../lib/page-progress.js'
import { version } from '../../package.json'

const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } }
const save = (key, value) => { try { localStorage.setItem(key, value) } catch { /* This session still works without storage. */ } }
const normalize = (value) => value.toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim()

export default function PanelFrame({ nav, title, subtitle, brandSub, sidebarHeader, sidebarFooter, headerActions, notice, onRefresh, children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useState(() => {
    const stored = read('digiwp.panel.theme', '')
    return ['dark', 'light'].includes(stored) ? stored : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  })
  const [collapsed, setCollapsed] = useState(() => read('digiwp.panel.collapsed', 'false') === 'true')
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 860px)').matches)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const [track, setTrack] = useState(null)
  const navRef = useRef(null)
  const searchRef = useRef(null)
  const asideRef = useRef(null)
  const burgerRef = useRef(null)
  const contentRef = useRef(null)
  const previousPath = useRef(location.pathname)
  const menu = nav.filter((item) => normalize(item.label).includes(normalize(query)))
  const active = nav.find((item) => item.end ? item.to === location.pathname : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))

  useEffect(() => {
    const media = matchMedia('(max-width: 860px)')
    const change = () => { setMobile(media.matches); setOpen(false) }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    const shortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCollapsed(false); save('digiwp.panel.collapsed', 'false')
        if (mobile) setOpen(true)
        requestAnimationFrame(() => searchRef.current?.focus())
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [mobile])

  useEffect(() => {
    if (!mobile || !open) return
    const overflow = document.body.style.overflow
    const burger = burgerRef.current
    document.body.style.overflow = 'hidden'
    asideRef.current?.querySelector('button')?.focus()
    return () => { document.body.style.overflow = overflow; burger?.focus() }
  }, [mobile, open])

  useLayoutEffect(() => {
    const update = () => {
      const selected = navRef.current?.querySelector('[aria-current="page"]')
      const next = selected ? { top: selected.offsetTop, height: selected.offsetHeight } : null
      setTrack((previous) => previous?.top === next?.top && previous?.height === next?.height ? previous : next)
    }
    update()
    const observer = new ResizeObserver(update)
    if (navRef.current) observer.observe(navRef.current)
    return () => observer.disconnect()
  }, [location.pathname, query, collapsed, nav.length])

  useEffect(() => {
    const selected = navRef.current?.querySelector('[aria-current="page"]')
    const scroll = navRef.current?.parentElement
    if (selected && scroll) {
      const top = selected.offsetTop
      if (top < scroll.scrollTop || top + selected.offsetHeight > scroll.scrollTop + scroll.clientHeight) {
        scroll.scrollTo({ top: Math.max(0, top - scroll.clientHeight / 2), behavior: 'auto' })
      }
    }
  }, [location.pathname, nav.length])

  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname
      contentRef.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0 })
    }
  }, [location.pathname])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next); save('digiwp.panel.theme', next)
  }
  const toggleMenu = () => {
    if (mobile) { setOpen(false); return }
    const next = !collapsed
    setCollapsed(next); save('digiwp.panel.collapsed', String(next)); setQuery('')
  }
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try { await logout() } finally { navigate('/login', { replace: true }) }
  }
  const refresh = () => { setRefreshKey((key) => key + 1); onRefresh?.() }
  const startNavigation = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target.closest('a[href]')
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return
    const target = new URL(link.href)
    if (target.origin === window.location.origin && target.pathname + target.search !== window.location.pathname + window.location.search) beginNavigation()
  }
  const trapFocus = (event) => {
    if (!mobile || !open) return
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
    if (event.key !== 'Tab') return
    const focusable = [...asideRef.current.querySelectorAll('a[href], button:not(:disabled), input')].filter((element) => element.getClientRects().length)
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  return (
    <div className={`dwp-shell panel-frame${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`} data-panel-theme={theme} data-theme={theme === 'dark' ? 'ink' : undefined} onClickCapture={startNavigation}>
      <a href="#panel-content" className="panel-skip">{t('shell.panel.skip')}</a>
      <button className="dwp-scrim" onClick={() => setOpen(false)} aria-label={t('common.close')} tabIndex={-1} />
      <aside ref={asideRef} className="dwp-aside panel-sidebar" id="panel-sidebar" role={mobile ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-label={t('shell.panel.navigation')} aria-hidden={mobile && !open ? true : undefined} inert={mobile && !open ? '' : undefined} onKeyDown={trapFocus}>
        <button type="button" className="panel-collapse" onClick={toggleMenu} aria-label={mobile ? t('common.close') : t(collapsed ? 'shell.panel.expand' : 'shell.panel.collapse')} aria-expanded={mobile ? open : !collapsed} aria-controls="panel-menu">
          <Icon name={collapsed && !mobile ? 'chevron-left' : 'chevron-right'} size={18} />
        </button>
        <Link to="/app" className="panel-brand" aria-label="DigiWP Ai Support">
          <span className="panel-brand__mark"><Icon name="shield-check" size={35} /></span>
          <span className="panel-brand__text"><strong>DigiWP <b>Ai Support</b></strong><small>{brandSub || t('shell.account.brandSub')}</small></span>
        </Link>
        {sidebarHeader && <div className="panel-sidebar__context">{sidebarHeader}</div>}
        <div className="panel-search">
          <Icon name="search" size={21} />
          <input ref={searchRef} type="search" aria-label={t('shell.panel.search')} placeholder={t('shell.panel.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} tabIndex={collapsed && !mobile ? -1 : undefined} onFocus={() => { if (collapsed && !mobile) { setCollapsed(false); save('digiwp.panel.collapsed', 'false') } }} />
          <kbd>⌘ K</kbd>
          {collapsed && !mobile && <button className="panel-search__expand" aria-label={t('shell.panel.search')} onClick={() => { setCollapsed(false); save('digiwp.panel.collapsed', 'false'); requestAnimationFrame(() => searchRef.current?.focus()) }} />}
        </div>
        <div className="panel-sidebar__scroll">
          <nav id="panel-menu" ref={navRef} className="panel-nav" aria-label={t('shell.panel.navigation')}>
            <span className="panel-nav__track" aria-hidden="true" style={{ opacity: track ? 1 : 0, height: track?.height || 0, transform: `translateY(${track?.top || 0}px)` }} />
            {menu.map((item, index) => <div key={item.to} className="panel-nav__entry">
              {(index === 0 || item.group !== menu[index - 1].group) && <div className="panel-nav__caption">{t(item.group || 'shell.panel.mainMenu')}</div>}
              <NavLink to={item.to} end={item.end} className="panel-nav__link" aria-label={item.label} title={collapsed && !mobile ? item.label : undefined} onClick={() => { setOpen(false); setQuery('') }}>
                <Icon name={item.icon} size={23} /><span className="panel-nav__label">{item.label}</span>
                {item.badge != null && <span className="panel-nav__badge">{item.badge}</span>}
              </NavLink>
            </div>)}
            {!menu.length && <p className="panel-nav__empty" role="status">{t('shell.panel.noResults')}</p>}
          </nav>
        </div>
        {sidebarFooter && <div className="panel-sidebar__extra">{sidebarFooter}</div>}
        <div className="panel-sidebar__footer">
          <Button variant="ghost" leftIcon="log-out" loading={signingOut} onClick={signOut} title={collapsed ? t('shell.signOut') : undefined} aria-label={t('shell.signOut')}>{t('shell.signOut')}</Button>
          <a className="panel-version" href="https://github.com/NabuxAi/ClaudeBridge/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" aria-label={t('shell.panel.releaseNotes', { version })} title={t('shell.panel.releaseNotes', { version })}>
            <span className="panel-version__label">{t('shell.panel.version')}</span><span dir="ltr">v{version}</span>
          </a>
        </div>
      </aside>
      <div className="dwp-main" inert={mobile && open ? '' : undefined}>
        <header className="dwp-topbar panel-topbar">
          <button ref={burgerRef} className="panel-mobile-menu" aria-label={t('common.menu')} aria-expanded={open} aria-controls="panel-sidebar" onClick={() => setOpen(true)}><Icon name="menu" size={23} /></button>
          <div className="panel-topbar__intro"><small>{subtitle || t('shell.panel.workspace')}</small><strong>{title || t('shell.panel.hello', { name: user?.name || '…' })}</strong></div>
          <div className="panel-topbar__actions">
            {headerActions}
            <Link to="/onboarding" className="panel-add-site" aria-label={t('shell.addSite')} title={t('shell.addSite')}><Icon name="plus" size={20} /><span>{t('shell.addSite')}</span></Link>
            <div className="panel-topbar__divider" />
            <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={t(theme === 'dark' ? 'shell.panel.lightMode' : 'shell.panel.darkMode')} onClick={toggleTheme} />
            <Link className="panel-tool-link" to="/app/notifications" aria-label={t('shell.account.nav.notifications')} title={t('shell.account.nav.notifications')}><Icon name="bell" size={21} /></Link>
            <LanguageSwitcher />
            <Link to="/app/profile" className="panel-user" aria-label={t('shell.account.nav.profile')}><Icon name="user-round" size={19} /><span>{user?.name || '…'}</span></Link>
          </div>
        </header>
        {notice}
        <main id="panel-content" className="dwp-content panel-content" ref={contentRef} tabIndex={-1}>
          <div className="panel-page-toolbar"><span><Icon name={active?.icon || 'layout-grid'} size={17} />{active?.label || t('shell.panel.workspace')}</span><IconButton icon="rotate-ccw" label={t('shell.panel.refresh')} onClick={refresh} /></div>
          <Suspense fallback={<PanelPageLoader />}><div key={`${location.pathname}:${refreshKey}`} className="panel-page">{children ?? <Outlet />}</div></Suspense>
        </main>
      </div>
    </div>
  )
}
