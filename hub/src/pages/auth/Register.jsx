import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from '../../components/index.js'
import Captcha from '../../components/captcha.jsx'
import { useAuth } from '../../lib/auth.jsx'

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
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>ساخت حساب رایگان</h2>
      <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 24px' }}>
        دسترسی آزمایشی — بدون نیاز به کارت بانکی.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Input label="نام و نام خانوادگی" placeholder="مثلاً مریم رضایی" leftIcon="user"
          value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="ایمیل" type="email" placeholder="you@example.com" leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="رمز عبور" type="password" leftIcon="lock" hint="حداقل ۸ نویسه"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Captcha
          value={captchaAnswer}
          onChange={setCaptchaAnswer}
          onReady={setCaptchaId}
          refreshKey={captchaKey}
        />
        {err && <div className="gd-field__msg gd-field__msg--error">{err}</div>}
        <Button variant="primary" size="lg" fullWidth leftIcon="sparkles" type="submit" loading={busy}>
          شروع رایگان ۱۴ روزه
        </Button>
      </form>
      {/* "Sign up with Google" was here with no handler and no OAuth client. */}
      <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '22px 0 0' }}>
        قبلاً حساب دارید؟ <Link to="/login" style={{ fontWeight: 700 }}>وارد شوید</Link>
      </p>
    </>
  )
}
