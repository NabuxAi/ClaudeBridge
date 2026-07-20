import { NavLink } from 'react-router-dom'
import Icon from '../lib/icons.jsx'

// SidebarItem — a routed nav item. `to` drives active state via NavLink.
export function SidebarItem({ to, icon, label, badge, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => ['gd-navitem', isActive && 'gd-navitem--active'].filter(Boolean).join(' ')}
    >
      {icon && <span className="gd-navitem__icon"><Icon name={icon} size={19} /></span>}
      <span className="gd-navitem__label">{label}</span>
      {badge != null && <span className="gd-navitem__badge">{badge}</span>}
    </NavLink>
  )
}

export function Tabs({ items = [], value, onChange, variant = 'underline', size = 'md' }) {
  return (
    <div className={['gd-tabs', `gd-tabs--${variant}`, `gd-tabs--${size}`].filter(Boolean).join(' ')} role="tablist">
      {items.map((it) => {
        const active = it.key === value
        return (
          <button
            key={it.key}
            role="tab"
            aria-selected={active}
            className={['gd-tab', active && 'gd-tab--active'].filter(Boolean).join(' ')}
            onClick={() => onChange && onChange(it.key)}
          >
            {it.icon && <Icon name={it.icon} size={16} />}
            {it.label}
            {it.badge != null && <span className="gd-tab__badge">{it.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
