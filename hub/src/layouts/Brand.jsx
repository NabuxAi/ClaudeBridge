import { Link } from 'react-router-dom'
import Icon from '../lib/icons.jsx'

// The DigiWP wordmark. `sub` shows the small caption under it.
export default function Brand({ to = '/', size = 'md', sub }) {
  const mark = size === 'sm' ? 32 : 38
  const font = size === 'sm' ? 15 : 16
  return (
    <Link to={to} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--gd-text)' }}>
      <span className="dwp-brandmark" style={{ width: mark, height: mark }}>
        <Icon name="shield-check" size={mark * 0.58} />
      </span>
      <span>
        <span style={{ fontWeight: 800, fontSize: font, letterSpacing: '-.01em', display: 'block', lineHeight: 1.1 }}>
          Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b>
          {size !== 'sm' && <span style={{ color: 'var(--gd-text-muted)', fontWeight: 700, fontSize: 13 }}> Ai Support</span>}
        </span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--gd-text-muted)', fontWeight: 600 }}>{sub}</span>}
      </span>
    </Link>
  )
}
