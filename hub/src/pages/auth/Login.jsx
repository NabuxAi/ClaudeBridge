import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, Checkbox } from '../../components/index.js'
import { useAuth } from '../../lib/auth.jsx'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await login({ email, password })
      nav('/app')
    } catch (e2) {
      setErr(e2?.message || 'ورود ناموفق بود. دوباره تلاش کنید.')
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
        {err && <div className="gd-field__msg gd-field__msg--error">{err}</div>}
        <Button variant="primary" size="lg" fullWidth rightIcon="arrow-left" type="submit" loading={busy}>ورود</Button>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--gd-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>یا</span>
        <span style={{ flex: 1, height: 1, background: 'var(--gd-border)' }} />
      </div>
      <Button variant="secondary" size="lg" fullWidth leftIcon="globe">ورود با گوگل</Button>
      <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '24px 0 0' }}>
        حساب ندارید؟ <Link to="/register" style={{ fontWeight: 700 }}>ثبت‌نام کنید</Link>
      </p>
    </>
  )
}
