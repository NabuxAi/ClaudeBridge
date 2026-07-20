import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, Checkbox } from '../../components/index.js'
import { useAuth } from '../../lib/auth.jsx'

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await register({ name, email, password })
      nav('/onboarding')
    } catch (e2) {
      setErr(e2?.message || 'ساخت حساب ناموفق بود. دوباره تلاش کنید.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>ساخت حساب رایگان</h2>
      <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 24px' }}>
        ۱۴ روز رایگان — بدون نیاز به کارت بانکی.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Input label="نام و نام خانوادگی" placeholder="مثلاً مریم رضایی" leftIcon="user"
          value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="ایمیل" type="email" placeholder="you@example.com" leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="رمز عبور" type="password" leftIcon="lock" hint="حداقل ۸ نویسه"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Checkbox
          defaultChecked
          label={(
            <span>
              با <a href="#" style={{ fontWeight: 600 }}>قوانین</a> و{' '}
              <a href="#" style={{ fontWeight: 600 }}>حریم خصوصی</a> موافقم
            </span>
          )}
        />
        {err && <div className="gd-field__msg gd-field__msg--error">{err}</div>}
        <Button variant="primary" size="lg" fullWidth leftIcon="sparkles" type="submit" loading={busy}>
          شروع رایگان ۱۴ روزه
        </Button>
      </form>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--gd-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>یا</span>
        <span style={{ flex: 1, height: 1, background: 'var(--gd-border)' }} />
      </div>
      <Button variant="secondary" size="lg" fullWidth leftIcon="globe">ثبت‌نام با گوگل</Button>
      <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '22px 0 0' }}>
        قبلاً حساب دارید؟ <Link to="/login" style={{ fontWeight: 700 }}>وارد شوید</Link>
      </p>
    </>
  )
}
