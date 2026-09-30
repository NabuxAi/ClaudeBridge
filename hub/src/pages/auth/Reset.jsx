import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import { auth } from '../../lib/api.js'
import { AuthSteps, IconBadge, PasswordField } from './shared.jsx'

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
      setError(e?.message || 'ارسال نشد.')
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
        <h2 className="dwp-auth-title">ارسال ایمیل فعال نیست</h2>
        <p className="dwp-auth-sub dwp-auth-sub--state">
          در حال حاضر ارسال ایمیل روی این سرویس پیکربندی نشده و لینک بازنشانی برای هیچ حسابی ارسال نمی‌شود. برای بازنشانی رمز عبور، از پشتیبانی بخواهید.
        </p>
        <BackToLogin />
      </>
    )
  }

  if (result === 'sent') {
    return (
      <>
        <IconBadge name="mail-check" />
        <h2 className="dwp-auth-title">لینک ارسال شد</h2>
        <p className="dwp-auth-sub dwp-auth-sub--state">
          اگر این ایمیل در سیستم وجود داشته باشد، لینک بازنشانی رمز عبور برای آن ارسال شده است.
        </p>
        <BackToLogin />
      </>
    )
  }

  return (
    <>
      <div className="dwp-auth-head">
        <span className="gd-sec-head__eyebrow"><Icon name="key-round" size={13} /> بازیابی دسترسی</span>
        <h2 className="dwp-auth-title">بازنشانی <span className="gd-gradient-text">رمز عبور</span></h2>
        <p className="dwp-auth-sub">ایمیل خود را وارد کنید؛ اگر حسابی با این ایمیل داشته باشید، لینک بازنشانی برای آن ارسال می‌شود.</p>
      </div>
      <AuthSteps current={1} />
      <form onSubmit={submit} className="dwp-auth-form">
        {/* Input passes the native event straight through (forms.jsx spreads
            {...rest} onto <input>) — the handler must read e.target.value,
            exactly like Login. Storing the event itself would stringify as
            "[object Object]" / crash JSON serialization downstream. */}
        <Input
          type="email"
          label="ایمیل"
          leftIcon="mail"
          placeholder="you@example.com"
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
          ارسال لینک بازنشانی
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
      setError('رمز عبور و تکرار آن یکسان نیستند.')
      return
    }
    if (password.length < 8) {
      setError('رمز عبور باید حداقل ۸ نویسه باشد.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await auth.resetPassword({ token, password })
      setDone(true)
    } catch (e) {
      setError(e?.message || 'بازنشانی نشد.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <>
        <IconBadge name="check-circle-2" tone="success" />
        <h2 className="dwp-auth-title">رمز عبور <span className="gd-gradient-text">بازنشانی شد</span></h2>
        <p className="dwp-auth-sub dwp-auth-sub--state">
          رمز عبور جدید ذخیره شد. اکنون می‌توانید وارد شوید.
        </p>
        {/* href (not a router Link) keeps the existing behaviour: a fresh
            document load on the login screen after the password changed. */}
        <Button variant="primary" size="lg" fullWidth rightIcon="arrow-left" href="/login">
          ورود
        </Button>
      </>
    )
  }

  return (
    <>
      <div className="dwp-auth-head">
        <span className="gd-sec-head__eyebrow"><Icon name="key-round" size={13} /> بازیابی دسترسی</span>
        <h2 className="dwp-auth-title">رمز عبور <span className="gd-gradient-text">جدید</span></h2>
        <p className="dwp-auth-sub">لینک بازنشانی یک ساعت معتبر و یک‌بار مصرف است. رمز جدید خود را وارد کنید.</p>
      </div>
      <AuthSteps current={2} />
      <form onSubmit={submit} className="dwp-auth-form">
        <PasswordField
          id="reset-password"
          label="رمز عبور جدید"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="new-password"
        />
        <PasswordField
          id="reset-confirm"
          label="تکرار رمز عبور"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && (
          <div className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{error}</div>
        )}
        <Button variant="primary" size="lg" fullWidth leftIcon="check" type="submit" loading={loading}>
          ذخیرهٔ رمز جدید
        </Button>
      </form>
    </>
  )
}

function BackToLogin() {
  return (
    <p className="dwp-auth-foot">
      <Link to="/login" className="dwp-auth-link dwp-auth-link--strong dwp-auth-backlink">
        <Icon name="arrow-right" size={15} /> بازگشت به ورود
      </Link>
    </p>
  )
}
