import Icon from '../lib/icons.jsx'
import { IconButton, Button } from './actions.jsx'

const ALERT_ICON = { critical: 'alert-octagon', warning: 'alert-triangle', info: 'info', success: 'check-circle-2' }

export function AlertCard({
  severity = 'info', title, time, desc, fields = [], actions, onDismiss, className = '', children,
}) {
  return (
    <div className={['gd-alert', `gd-alert--${severity}`, className].filter(Boolean).join(' ')}>
      <span className="gd-alert__icon"><Icon name={ALERT_ICON[severity]} size={20} /></span>
      <div className="gd-alert__body">
        <div className="gd-alert__head">
          <span className="gd-alert__title">{title}</span>
          {time && <span className="gd-alert__time">{time}</span>}
        </div>
        {desc && <div className="gd-alert__desc">{desc}</div>}
        {fields.length > 0 && (
          <div className="gd-alert__fields">
            {fields.map((f, i) => (
              <div className="gd-alert__field" key={i}>
                <span className="gd-alert__flabel">{f.label}</span>
                <span className={['gd-alert__fvalue', f.mono && 'gd-alert__fvalue--mono'].filter(Boolean).join(' ')}
                  style={f.tone === 'success' ? { color: 'var(--gd-success-text)', fontWeight: 600 } : undefined}>
                  {f.value}
                </span>
              </div>
            ))}
          </div>
        )}
        {children}
        {actions && <div className="gd-alert__actions">{actions}</div>}
      </div>
      {onDismiss && <span className="gd-alert__dismiss"><IconButton icon="x" label="بستن" size="sm" onClick={onDismiss} /></span>}
    </div>
  )
}

export function Dialog({
  open, onClose, size = 'md', icon, iconTone = 'primary', title, desc, children, footer,
}) {
  if (!open) return null
  return (
    <div className="gd-dialog__overlay" onClick={onClose}>
      <div className={`gd-dialog gd-dialog--${size}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="gd-dialog__head">
          {icon && <span className={`gd-dialog__icon gd-dialog__icon--${iconTone}`}><Icon name={icon} size={22} /></span>}
          <div className="gd-dialog__titles">
            {title && <div className="gd-dialog__title">{title}</div>}
            {desc && <div className="gd-dialog__desc">{desc}</div>}
          </div>
          <span className="gd-dialog__close"><IconButton icon="x" label="بستن" size="sm" onClick={onClose} /></span>
        </div>
        {children && <div className="gd-dialog__body">{children}</div>}
        {footer && <div className="gd-dialog__footer">{footer}</div>}
      </div>
    </div>
  )
}

export function Toast({ tone = 'info', title, desc, onClose, icon }) {
  const ic = icon || { info: 'info', success: 'check-circle-2', warning: 'alert-triangle', danger: 'alert-octagon' }[tone]
  return (
    <div className="gd-toast">
      <span className={`gd-toast__icon gd-toast__icon--${tone}`}><Icon name={ic} size={17} /></span>
      <div className="gd-toast__body">
        <div className="gd-toast__title">{title}</div>
        {desc && <div className="gd-toast__desc">{desc}</div>}
      </div>
      {onClose && <span className="gd-toast__close"><IconButton icon="x" label="بستن" size="sm" onClick={onClose} /></span>}
    </div>
  )
}

export function Tooltip({ label, place = 'top', children }) {
  return (
    <span className="gd-tt" data-tt>
      {children}
      <span className={`gd-tt__bubble gd-tt__bubble--${place}`}>{label}</span>
    </span>
  )
}

export { Button }
