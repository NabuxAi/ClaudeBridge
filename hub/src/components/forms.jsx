import { useState } from 'react'
import Icon from '../lib/icons.jsx'

export function Input({
  label, leftIcon, rightIcon, size = 'md', error, hint, required, id,
  className = '', wrapClassName = '', ...rest
}) {
  const box = (
    <div className={['gd-input', `gd-input--${size}`, error && 'gd-input--error', className].filter(Boolean).join(' ')}>
      {leftIcon && <Icon name={leftIcon} size={16} className="gd-input__icon" />}
      <input id={id} className="gd-input__el" {...rest} />
      {rightIcon && <Icon name={rightIcon} size={16} className="gd-input__icon" />}
    </div>
  )
  if (!label && !error && !hint) return box
  return (
    <div className={['gd-field', wrapClassName].filter(Boolean).join(' ')}>
      {label && (
        <label className="gd-field__label" htmlFor={id}>
          {label}{required && <span className="gd-field__req">*</span>}
        </label>
      )}
      {box}
      {error && <span className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{error}</span>}
      {!error && hint && <span className="gd-field__msg">{hint}</span>}
    </div>
  )
}

export function Textarea({ label, hint, error, rows = 4, id, required, ...rest }) {
  const el = (
    <textarea
      id={id} rows={rows}
      className={['gd-textarea__el', error && 'gd-textarea__el--error'].filter(Boolean).join(' ')}
      {...rest}
    />
  )
  if (!label && !hint && !error) return el
  return (
    <div className="gd-field">
      {label && <label className="gd-field__label" htmlFor={id}>{label}{required && <span className="gd-field__req">*</span>}</label>}
      {el}
      {error ? <span className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{error}</span>
        : hint && <span className="gd-field__msg">{hint}</span>}
    </div>
  )
}

export function Select({ label, size = 'md', options = [], id, hint, error, required, children, ...rest }) {
  const el = (
    <div className={['gd-select', `gd-select--${size}`].filter(Boolean).join(' ')}>
      <select id={id} className="gd-select__el" {...rest}>
        {children || options.map((o) =>
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <span className="gd-select__chev"><Icon name="chevron-down" size={16} /></span>
    </div>
  )
  if (!label && !hint && !error) return el
  return (
    <div className="gd-field">
      {label && <label className="gd-field__label" htmlFor={id}>{label}{required && <span className="gd-field__req">*</span>}</label>}
      {el}
      {error ? <span className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{error}</span>
        : hint && <span className="gd-field__msg">{hint}</span>}
    </div>
  )
}

export function Switch({ checked, defaultChecked, onChange, disabled, size = 'md', label, id }) {
  const [internal, setInternal] = useState(!!defaultChecked)
  const isControlled = checked !== undefined
  const on = isControlled ? checked : internal
  const toggle = (e) => {
    if (disabled) return
    if (!isControlled) setInternal(!on)
    onChange && onChange(!on, e)
  }
  const btn = (
    <button
      type="button" role="switch" aria-checked={on} disabled={disabled} onClick={toggle} id={id}
      className={['gd-switch', `gd-switch--${size}`, on && 'gd-switch--on'].filter(Boolean).join(' ')}
    >
      <span className="gd-switch__thumb" />
    </button>
  )
  if (!label) return btn
  return (
    <span className="gd-switch-row">
      {btn}
      <label className="gd-switch__label" htmlFor={id} onClick={toggle}>{label}</label>
    </span>
  )
}

export function Checkbox({ label, defaultChecked, checked, onChange, disabled, id, ...rest }) {
  return (
    <label className={['gd-check-row', disabled && 'gd-check-row--disabled'].filter(Boolean).join(' ')}>
      <input
        type="checkbox" className="gd-check__input" id={id}
        defaultChecked={defaultChecked} checked={checked} onChange={onChange} disabled={disabled} {...rest}
      />
      <span className="gd-check__box"><Icon name="check" size={13} strokeWidth={3} /></span>
      {label && <span className="gd-check__label">{label}</span>}
    </label>
  )
}
