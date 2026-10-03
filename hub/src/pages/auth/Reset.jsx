import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import { auth } from '../../lib/api.js'
import { AuthSteps, AuthTitle, IconBadge, PasswordField } from './shared.jsx'
import { t } from '../../lib/i18n.js'

export default function Reset() {
  const [params] = useSearchParams()
  const token = params.get('token')

  return token ? <ResetForm token={token} /> : <ForgotForm />
}

function ForgotForm() {
  const [email, setEmail] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const [loading, setLoading] = useState(false)
  // idle | sent | unconfigured — the server's mail state decides the last two.
  const [result, setResult] = useState('idle')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await auth.forgotPassword({ email, captchaId, captchaAnswer })
      // Mail delivery is a DEPLOYMENT state, reported the same for every
      // request (never per-account), so reading it here cannot leak whether
      // this address exists. Older servers and the mock don't send the field —
      // then the enumeration-safe default text stands.
      const unconfigured = res?.delivery === 'unconfigured'
        || res?.mailConfigured === false
        || res?.mail_configured === false
      setResult(unconfigured ? 'unconfigured' : 'sent')
    } catch (e) {
      setError(e?.message || t('auth.reset.sendFailed'))
      // Single-use on the server: a failed submit burns the challenge.
      setCaptchaAnswer('')
      setCaptchaKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  if (result === 'unconfigured') {
    // Honest by requirement: this deployment cannot send mail at all, so
    // «لینک ارسال شد» would be a lie for every address alike.
    return (
      <>
        <IconBadge name="alert-triangle" tone="warning" />
        <h2 className="dwp-auth-title">{t('auth.reset.unconfiguredTitle')}</h2>
        <p className="dwp-auth-sub dwp-auth-sub--state">
          {t('auth.reset.unconfiguredBody')}
        </p>
        <BackToLogin />
      </>
    )
  }

  if (result === 'sent') {
    return (
      <>
        <IconBadge name="mail-check" />
        <h2 className="dwp-auth-title">{t('auth.reset.sentTitle')}</h2>
        <p className="dwp-auth-sub dwp-auth-sub--state">
          {t('auth.reset.sentBody')}
        </p>
        <BackToLogin />
      </>
    )
  }

  return (
    <>
      <div className="dwp-auth-head">
        <span className="gd-sec-head__eyebrow"><Icon name="key-round" size={13} /> {t('auth.reset.eyebrow')}</span>
        <h2 className="dwp-auth-title"><AuthTitle k="auth.reset.title" /></h2>
        <p className="dwp-auth-sub">{t('auth.reset.sub')}</p>
      </div>
      <AuthSteps current={1} />
      <form onSubmit={submit} className="dwp-auth-form">
        {/* Input passes the native event straight through (forms.jsx spreads
            {...rest} onto <input>) — the handler must read e.target.value,
            exactly like Login. Storing the event itself would stringify as
            "[object Object]" / crash JSON serialization downstream. */}
        <Input
          type="email"
          label={t('auth.shared.emailLabel')}
          leftIcon="mail"
          placeholder={t('auth.shared.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          inputMode="email"
        />
        {/* The same shared challenge component Login/Register use — this form
            used to render the question by hand, which drifted from the shared
            error/retry behaviour. */}
        <Captcha
          value={captchaAnswer}
          onChange={setCaptchaAnswer}
          onReady={setCaptchaId}
          refreshKey={captchaKey}
        />
        {error && (
          <div className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{error}</div>
        )}
        <Button variant="primary" size="lg" fullWidth leftIcon="send" type="submit" loading={loading}>
          {t('auth.reset.submit')}
        </Button>
      </form>
      <BackToLogin />
    </>
  )
}

function ResetForm({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('auth.reset.mismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('auth.reset.tooShort'))
      return
    }
    setLoading(true)
    setError('')
    try {
      await auth.resetPassword({ token, password })
      setDone(true)
    } catch (e) {
      setError(e?.message || t('auth.reset.resetFailed'))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <>
        <IconBadge name="check-circle-2" tone="success" />
        <h2 className="dwp-auth-title"><AuthTitle k="auth.reset.doneTitle" /></h2>
        <p className="dwp-auth-sub dwp-auth-sub--state">
          {t('auth.reset.doneBody')}
        </p>
        {/* href (not a router Link) keeps the existing behaviour: a fresh
            document load on the login screen after the password changed. */}
        <Button variant="primary" size="lg" fullWidth rightIcon="arrow-left" href="/login">
          {t('auth.reset.login')}
        </Button>
      </>
    )
  }

  return (
    <>
      <div className="dwp-auth-head">
        <span className="gd-sec-head__eyebrow"><Icon name="key-round" size={13} /> {t('auth.reset.eyebrow')}</span>
        <h2 className="dwp-auth-title"><AuthTitle k="auth.reset.newTitle" /></h2>
        <p className="dwp-auth-sub">{t('auth.reset.newSub')}</p>
      </div>
      <AuthSteps current={2} />
      <form onSubmit={submit} className="dwp-auth-form">
        <PasswordField
          id="reset-password"
          label={t('auth.reset.newPasswordLabel')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="new-password"
        />
        <PasswordField
          id="reset-confirm"
          label={t('auth.reset.confirmLabel')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && (
          <div className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{error}</div>
        )}
        <Button variant="primary" size="lg" fullWidth leftIcon="check" type="submit" loading={loading}>
          {t('auth.reset.save')}
        </Button>
      </form>
    </>
  )
}

function BackToLogin() {
  return (
    <p className="dwp-auth-foot">
      <Link to="/login" className="dwp-auth-link dwp-auth-link--strong dwp-auth-backlink">
        <Icon name="arrow-right" size={15} /> {t('auth.reset.backToLogin')}
      </Link>
    </p>
  )
}
