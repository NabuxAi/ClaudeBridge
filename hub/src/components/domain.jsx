import Icon from '../lib/icons.jsx'

// The product's signature 3-tier autonomy model.
const AUTHORITY = {
  report: { icon: 'eye', label: 'فقط گزارش' },
  confirm: { icon: 'user-check', label: 'با تأیید' },
  auto: { icon: 'zap', label: 'خودکار' },
}

export function AuthorityBadge({ level, size = 'md', showIcon = true, label, className = '' }) {
  const cfg = AUTHORITY[level]
  // An authority nobody reported must not borrow one of the three real
  // levels — each of them is a permission claim. Neutral "نامشخص" is the
  // honest state until the server says otherwise.
  if (!cfg) {
    return (
      <span className={['gd-authority', 'gd-authority--unknown', `gd-authority--${size}`, className].filter(Boolean).join(' ')}>
        {label != null ? label : 'نامشخص'}
      </span>
    )
  }
  return (
    <span className={['gd-authority', `gd-authority--${level}`, `gd-authority--${size}`, className].filter(Boolean).join(' ')}>
      {showIcon && <Icon name={cfg.icon} size={size === 'sm' ? 12 : 14} />}
      {label != null ? label : cfg.label}
    </span>
  )
}

// The daily-report checklist row: icon (state) · label · optional meta/time.
export function ActivityRow({ icon = 'check-circle-2', tone = 'done', label, meta, time, divided = false, spin = false }) {
  return (
    <div className={['gd-activity', divided && 'gd-activity--divided'].filter(Boolean).join(' ')}>
      <span className={['gd-activity__ic', `gd-activity__ic--${tone}`, spin && 'gd-activity__ic--spin'].filter(Boolean).join(' ')}>
        <Icon name={icon} size={15} />
      </span>
      <span className="gd-activity__label">{label}</span>
      {meta && <span className="gd-activity__meta">{meta}</span>}
      {time && <span className="gd-activity__time">{time}</span>}
    </div>
  )
}
