import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, Checkbox } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import { useAuth } from '../../lib/auth.jsx'
import { auth as authApi } from '../../lib/api.js'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
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
      nav('/app')
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
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>ورود به حساب</h2>
      <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px' }}>
        به پنل پشتیبان هوشمند سایت خود وارد شوید.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="ایمیل" type="email" placeholder="you@example.com" leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="رمز عبور" type="password" placeholder="••••••••" leftIcon="lock"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Checkbox label="مرا به خاطر بسپار" defaultChecked />
          <Link to="/reset-password" style={{ fontSize: 13, fontWeight: 600 }}>فراموشی رمز؟</Link>
        </div>
        {needCaptcha && (
          <Captcha
            value={captchaAnswer}
            onChange={setCaptchaAnswer}
            onReady={setCaptchaId}
            refreshKey={captchaKey}
          />
        )}
        {err && <div className="gd-field__msg gd-field__msg--error">{err}</div>}
        <Button variant="primary" size="lg" fullWidth rightIcon="arrow-left" type="submit" loading={busy}>ورود</Button>
      </form>
      {/* A "sign in with Google" button used to sit here with no handler and no
          OAuth client — clicking it did nothing, on the one screen where a dead
          control makes someone think their account is broken. */}
      <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '24px 0 0' }}>
        حساب ندارید؟ <Link to="/register" style={{ fontWeight: 700 }}>ثبت‌نام کنید</Link>
      </p>
    </>
  )
}
