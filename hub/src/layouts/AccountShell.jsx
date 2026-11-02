import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'
import { useAuth } from '../lib/auth.jsx'
import { t } from '../lib/i18n.js'
import PanelFrame from './PanelFrame.jsx'

const NAV = [
  { to: '/app', end: true, icon: 'layout-grid', label: 'dashboard', group: 'shell.panel.mainMenu' },
  { to: '/app/sites', icon: 'globe', label: 'sites', group: 'shell.panel.mainMenu' },
  { to: '/app/alerts', icon: 'bell-ring', label: 'alerts', group: 'shell.panel.mainMenu' },
  { to: '/app/team', icon: 'users', label: 'team', group: 'shell.panel.accountMenu' },
  { to: '/app/billing', icon: 'credit-card', label: 'billing', group: 'shell.panel.accountMenu' },
  { to: '/app/notifications', icon: 'bell', label: 'notifications', group: 'shell.panel.accountMenu' },
  { to: '/app/security', icon: 'monitor-smartphone', label: 'security', group: 'shell.panel.accountMenu' },
  { to: '/app/profile', icon: 'user-round', label: 'profile', group: 'shell.panel.accountMenu' },
]

export default function AccountShell() {
  const { user } = useAuth()
  const nav = NAV.map((item) => ({ ...item, label: t(`shell.account.nav.${item.label}`) }))
  if (user?.role === 'admin') nav.push({ to: '/admin', icon: 'shield-check', label: t('shell.account.nav.admin'), group: 'shell.panel.accountMenu' })
  return <PanelFrame nav={nav} sidebarFooter={<Link className="panel-plans" to="/pricing"><Icon name="crown" size={18} /><span>{t('shell.account.seePlans')}</span></Link>} />
}
