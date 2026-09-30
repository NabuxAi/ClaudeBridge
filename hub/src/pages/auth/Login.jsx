import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, Input } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import Icon from '../../lib/icons.jsx'
import { useAuth } from '../../lib/auth.jsx'
import { auth as authApi } from '../../lib/api.js'
import { PasswordField } from './shared.jsx'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Not shown by default: a first-time visitor should not have to do arithmetic
  // to sign in. The server decides when this address owes proof.
  const [needCaptcha, setNeedCaptcha] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  useEffect(() => {
    let alive = true
    authApi.challengeState()
      .then((s) => alive && setNeedCaptcha(Boolean(s.captchaRequired)))
      // If the check itself fails, showing the challenge is the safe direction:
      // an extra sum is an inconvenience, a bypassed one is not.
      .catch(() => alive && setNeedCaptcha(true))
    return () => { alive = false }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await login({
        email,
        password,
        ...(needCaptcha ? { captchaId, captchaAnswer } : {}),
      })
      const returnTo = location.state?.returnTo || sessionStorage.getItem('loginReturnTo') || '/app'
      sessionStorage.removeItem('loginReturnTo')
      nav(returnTo, { replace: true })
    } catch (e2) {
      setErr(e2?.message || 'ورود ناموفق بود. دوباره تلاش کنید.')
      // The server tells us when the next attempt needs one. A challenge is
      // single-use, so any failed submit also burns the current one.
      if (e2?.data?.captchaRequired) setNeedCaptcha(true)
      setCaptchaAnswer('')
      setCaptchaKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="dwp-auth-head">
        <span className="gd-sec-head__eyebrow"><Icon name="lock-keyhole" size={13} /> حساب کاربری</span>
        <h2 className="dwp-auth-title">ورود به <span className="gd-gradient-text">حساب</span></h2>
        <p className="dwp-auth-sub">به پنل پشتیبان هوشمند سایت خود وارد شوید.</p>
      </div>
      <form onSubmit={submit} className="dwp-auth-form">
        {/* autoFocus: the email is the first thing every visitor types. */}
        <Input label="ایمیل" type="email" placeholder="you@example.com" leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
          autoComplete="username" inputMode="email" />
        {/* "Remember me" lived here as a defaultChecked checkbox with no
            handler — the token is kept for 7 days regardless (api.js token
            storage). A control that claims behaviour it has is removed until
            real session-length handling exists. */}
        <PasswordField
          id="login-password"
          label="رمز عبور"
          labelExtra={<Link to="/reset-password" className="dwp-auth-link">فراموشی رمز؟</Link>}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {needCaptcha && (
          <Captcha
            value={captchaAnswer}
            onChange={setCaptchaAnswer}
            onReady={setCaptchaId}
            refreshKey={captchaKey}
          />
        )}
        {err && (
          <div className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{err}</div>
        )}
        <Button variant="primary" size="lg" fullWidth rightIcon="arrow-left" type="submit" loading={busy}>ورود</Button>
      </form>
      {/* A "sign in with Google" button used to sit here with no handler and no
          OAuth client — clicking it did nothing, on the one screen where a dead
          control makes someone think their account is broken. */}
      <p className="dwp-auth-foot">
        حساب ندارید؟ <Link to="/register" className="dwp-auth-link dwp-auth-link--strong">ثبت‌نام کنید</Link>
      </p>
    </>
  )
}
