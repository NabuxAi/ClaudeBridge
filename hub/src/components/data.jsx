import Icon from '../lib/icons.jsx'

const STATUS_LABELS = {
  healthy: 'سالم', warning: 'هشدار', critical: 'بحرانی',
  checking: 'در حال بررسی', info: 'اطلاع', offline: 'آفلاین',
}

export function StatusPill({ status = 'healthy', label, pulse, size = 'md', className = '', children }) {
  const doPulse = pulse === undefined ? status === 'checking' : pulse
  const text = children != null ? children : label != null ? label : STATUS_LABELS[status]
  return (
    <span className={['gd-status', `gd-status--${status}`, `gd-status--${size}`, className].filter(Boolean).join(' ')}>
      <span className={'gd-status__dot' + (doPulse ? ' gd-status__dot--pulse' : '')} />
      {text}
    </span>
  )
}

export function Badge({ variant = 'neutral', appearance = 'soft', size = 'md', icon, dot = false, className = '', children }) {
  return (
    <span className={['gd-badge', `gd-badge--${appearance}`, `gd-badge--${variant}`, `gd-badge--${size}`, className].filter(Boolean).join(' ')}>
      {dot && <span className="gd-badge__dot" />}
      {icon && <Icon name={icon} size={size === 'sm' ? 11 : 12} />}
      {children}
    </span>
  )
}

export function Card({ elevation = 'sm', padding = 'md', interactive = false, className = '', children, ...rest }) {
  const cls = [
    'gd-card', `gd-card--e-${elevation}`, `gd-card--p-${padding}`,
    interactive && 'gd-card--interactive', className,
  ].filter(Boolean).join(' ')
  return <div className={cls} {...rest}>{children}</div>
}

export function CardHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="gd-card__header">
      {icon && <span className="gd-card__hicon"><Icon name={icon} size={19} /></span>}
      <div className="gd-card__titles">
        <div className="gd-card__title">{title}</div>
        {subtitle && <div className="gd-card__subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="gd-card__actions">{actions}</div>}
    </div>
  )
}

const TREND_ICON = { up: 'trending-up', down: 'trending-down', flat: 'minus' }

export function MetricCard({ label, value, unit, icon, iconTone = 'neutral', trend, trendDir = 'flat', trendTone = 'neutral', hint, className = '' }) {
  return (
    <div className={['gd-metric', className].filter(Boolean).join(' ')}>
      <div className="gd-metric__top">
        {icon && <span className={`gd-metric__ic gd-metric__ic--${iconTone}`}><Icon name={icon} size={17} /></span>}
        <span className="gd-metric__label">{label}</span>
      </div>
      <div className="gd-metric__value">
        <span>{value}</span>{unit && <span className="gd-metric__unit">{unit}</span>}
      </div>
      {(trend || hint) && (
        <div className="gd-metric__foot">
          {trend && (
            <span className={`gd-metric__trend gd-metric__trend--${trendTone}`}>
              <Icon name={TREND_ICON[trendDir] || 'minus'} size={13} />{trend}
            </span>
          )}
          {hint && <span className="gd-metric__hint">{hint}</span>}
        </div>
      )}
    </div>
  )
}

export function ProgressBar({ value = 0, max = 100, tone = 'primary', size = 'md', label, showValue = false, valueText, className = '' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  let resolved = tone
  if (tone === 'auto') resolved = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success'
  return (
    <div className={['gd-progress', `gd-progress--${size}`, className].filter(Boolean).join(' ')}>
      {(label || showValue) && (
        <div className="gd-progress__head">
          <span>{label}</span>
          {showValue && <span className="gd-progress__val">{valueText != null ? valueText : `${Math.round(pct)}٪`}</span>}
        </div>
      )}
      <div className="gd-progress__track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`gd-progress__fill gd-progress__fill--${resolved}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
