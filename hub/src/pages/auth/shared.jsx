import { Fragment, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import Trans from '../../components/Trans.jsx'
import { t, digits } from '../../lib/i18n.js'

/** A translated auth heading; `<hl>…</hl>` in the string gets the gradient. */
export function AuthTitle({ k }) {
  return <Trans k={k} components={{ hl: (c) => <span className="gd-gradient-text">{c}</span> }} />
}

// Shared skin atoms for the auth pages (hub/src/pages/auth/). These compose
// the SAME .gd-field / .gd-input classes the shared Input component renders
// (components/forms.jsx), so the look stays identical — they only add the
// controls Input's contract does not carry. Input/Button/Switch/Icon/
// StatusPill themselves stay untouched.

/**
 * Password field with a show/hide toggle.
 *
 * Built from the same gd-field/gd-input classes instead of wrapping <Input>
 * because the toggle must sit INSIDE the input box, next to the text:
 * Input's rightIcon renders a plain icon, not a button.
 */
export function PasswordField({
  label, value, onChange, id, hint, labelExtra,
  autoComplete = 'current-password', placeholder, autoFocus, required = true,
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="gd-field">
      <span className="dwp-auth-pass__labelrow">
        <label className="gd-field__label" htmlFor={id}>
          {label}{required && <span className="gd-field__req">*</span>}
        </label>
        {labelExtra}
      </span>
      <div className="gd-input gd-input--md">
        <Icon name="lock" size={16} className="gd-input__icon" />
        <input
          id={id}
          className="gd-input__el"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="dwp-auth-pass__toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('auth.shared.hidePassword') : t('auth.shared.showPassword')}
          aria-pressed={show}
        >
          <Icon name={show ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
      {hint && <span className="gd-field__msg">{hint}</span>}
    </div>
  )
}

/** Two-step progress rail for the reset flow (request link → new password). */
export function AuthSteps({ current }) {
  const steps = [
    { n: 1, label: t('auth.shared.steps.request') },
    { n: 2, label: t('auth.shared.steps.newPassword') },
  ]
  return (
    <ol className="dwp-auth-steps" aria-label={t('auth.shared.steps.aria')}>
      {steps.map((s, i) => {
        const done = i + 1 < current
        const active = i + 1 === current
        return (
          <Fragment key={s.n}>
            <li
              className={['dwp-auth-steps__step', active && 'is-active', done && 'is-done'].filter(Boolean).join(' ')}
              aria-current={active ? 'step' : undefined}
            >
              <span className="dwp-auth-steps__dot" aria-hidden="true">
                {done ? <Icon name="check" size={13} strokeWidth={3} /> : digits(s.n)}
              </span>
              <span className="dwp-auth-steps__label">{s.label}</span>
            </li>
            {i < steps.length - 1 && <li className="dwp-auth-steps__conn" aria-hidden="true" />}
          </Fragment>
        )
      })}
    </ol>
  )
}

/**
 * Status badge above a reset-flow heading. Tone matches what actually
 * happened: neutral primary for the "if this email exists" screen (it must
 * not confirm anything), green only for an action that truly completed (a
 * saved password), amber for a deployment state (mail not configured).
 */
export function IconBadge({ name, tone = 'primary' }) {
  return (
    <span className={['dwp-auth-iconbadge', `dwp-auth-iconbadge--${tone}`].filter(Boolean).join(' ')}>
      <Icon name={name} size={26} />
    </span>
  )
}
