import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import Icon from '../../lib/icons.jsx'
import { useAuth } from '../../lib/auth.jsx'
import { PasswordField } from './shared.jsx'

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Registration always demands one: there is no prior failure to key off, and
  // an open registration endpoint is how a user table fills with junk.
  const [captchaId, setCaptchaId] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await register({ name, email, password, captchaId, captchaAnswer })
      nav('/onboarding')
    } catch (e2) {
      setErr(e2?.message || 'ساخت حساب ناموفق بود. دوباره تلاش کنید.')
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
        <span className="gd-sec-head__eyebrow"><Icon name="user-plus" size={13} /> ثبت‌نام</span>
        <h2 className="dwp-auth-title">ساخت حساب <span className="gd-gradient-text">رایگان</span></h2>
        <p className="dwp-auth-sub">دسترسی آزمایشی — بدون نیاز به کارت بانکی.</p>
      </div>
      <form onSubmit={submit} className="dwp-auth-form">
        <Input label="نام و نام خانوادگی" placeholder="مثلاً مریم رضایی" leftIcon="user"
          value={name} onChange={(e) => setName(e.target.value)} required autoFocus autoComplete="name" />
        <Input label="ایمیل" type="email" placeholder="you@example.com" leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" inputMode="email" />
        <PasswordField
          id="register-password"
          label="رمز عبور"
          hint="حداقل ۸ نویسه"
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
          ساخت حساب آزمایشی
        </Button>
      </form>
      {/* "Sign up with Google" was here with no handler and no OAuth client. */}
      <p className="dwp-auth-foot">
        قبلاً حساب دارید؟ <Link to="/login" className="dwp-auth-link dwp-auth-link--strong">وارد شوید</Link>
      </p>
    </>
  )
}
