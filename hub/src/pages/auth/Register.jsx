import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import Icon from '../../lib/icons.jsx'
import { useAuth } from '../../lib/auth.jsx'
import { AuthTitle, PasswordField } from './shared.jsx'
import { t } from '../../lib/i18n.js'

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  // دعوت‌نامهٔ تیمی: لینک «ثبت‌نام و پذیرش دعوت» با ?invite=<توکن>&email=<ایمیل>
  // می‌آید. توکن هرگز در state ذخیره نمی‌شود که در تاریخچه بماند؛ مستقیم از
  // searchParams به بدنهٔ درخواست می‌رود.
  const inviteToken = searchParams.get('invite') || ''
  const [name, setName] = useState('')
  const [email, setEmail] = useState(() => searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [inviteError, setInviteError] = useState('')
  // Registration always demands one: there is no prior failure to key off, and
  // an open registration endpoint is how a user table fills with junk.
  const [captchaId, setCaptchaId] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(''); setInviteError('')
    try {
      const res = await register({
        name, email, password, captchaId, captchaAnswer,
        ...(inviteToken ? { inviteToken } : {}),
      })
      if (res.invite && res.invite.applied === false) {
        // حساب ساخته شده و کاربر وارد شده، اما دعوت اعمال نشد. صفحه را ترک
        // نمی‌کنیم تا دلیلش دیده شود؛ ادامهٔ مسیر با دکمهٔ پایین انجام می‌شود.
        setInviteError(res.invite.error || t('auth.register.inviteNotApplied'))
        return
      }
      nav('/onboarding')
    } catch (e2) {
      setErr(e2?.message || t('auth.register.failed'))
      // Single-use on the server, so a failed submit burns it.
      setCaptchaAnswer('')
      setCaptchaKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="dwp-auth-head">
        <span className="gd-sec-head__eyebrow"><Icon name="user-plus" size={13} /> {t('auth.register.eyebrow')}</span>
        <h2 className="dwp-auth-title"><AuthTitle k="auth.register.title" /></h2>
        <p className="dwp-auth-sub">{t('auth.register.sub')}</p>
      </div>
      {inviteToken && (
        <div className="gd-field__msg" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14 }}>
          <Icon name="user-plus" size={13} />
          <span>{t('auth.register.inviteNotice')}</span>
        </div>
      )}
      <form onSubmit={submit} className="dwp-auth-form">
        <Input label={t('auth.register.nameLabel')} placeholder={t('auth.register.namePlaceholder')} leftIcon="user"
          value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" />
        <Input label={t('auth.shared.emailLabel')} type="email" placeholder={t('auth.shared.emailPlaceholder')} leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" inputMode="email" />
        <PasswordField
          id="register-password"
          label={t('auth.shared.passwordLabel')}
          hint={t('auth.register.passwordHint')}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Captcha
          value={captchaAnswer}
          onChange={setCaptchaAnswer}
          onReady={setCaptchaId}
          refreshKey={captchaKey}
        />
        {err && (
          <div className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{err}</div>
        )}
        <Button variant="primary" size="lg" fullWidth leftIcon="sparkles" type="submit" loading={busy}>
          {/* No "14-day free trial" here: no trial clock or entitlement exists
              server-side (billing is NOT_BUILT). What this button really does
              is create a pilot account — the label must say exactly that. */}
          {t('auth.register.submit')}
        </Button>
      </form>
      {inviteError && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="gd-field__msg gd-field__msg--error">
            <Icon name="alert-circle" size={13} />
            {t('auth.register.inviteFailed', { error: inviteError })}
          </div>
          <Button variant="secondary" fullWidth leftIcon="arrow-left" onClick={() => nav('/onboarding')}>
            {t('auth.register.continue')}
          </Button>
        </div>
      )}
      {/* "Sign up with Google" was here with no handler and no OAuth client. */}
      <p className="dwp-auth-foot">
        {t('auth.register.haveAccount')} <Link to="/login" className="dwp-auth-link dwp-auth-link--strong">{t('auth.register.loginLink')}</Link>
        {inviteToken && (
          <>{t('auth.register.inviteAfterLogin')}</>
        )}
      </p>
    </>
  )
}
