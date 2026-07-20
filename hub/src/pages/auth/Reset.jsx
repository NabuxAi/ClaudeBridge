import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'

export default function Reset() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    await new Promise((r) => setTimeout(r, 600))
    setBusy(false)
    setSent(true)
  }

  if (sent) {
    return (
      <>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: 14,
          background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)',
          color: 'var(--gd-primary)', marginBottom: 18,
        }}>
          <Icon name="mail-check" size={26} />
        </span>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>ایمیل بازیابی ارسال شد</h2>
        <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px', lineHeight: 1.8 }}>
          لینک بازنشانی رمز به ایمیل زیر فرستاده شد. صندوق ورودی خود را بررسی کنید.
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 16, borderRadius: 'var(--gd-radius-xl)',
          background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)',
        }}>
          <span style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
          }}>
            <Icon name="mail-check" size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>لینک ارسال شد</div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2, fontFamily: 'var(--gd-font-mono)' }}>
              {email || 'you@example.com'}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, marginTop: 20,
          padding: '12px 14px', borderRadius: 'var(--gd-radius-lg)',
          background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)',
        }}>
          <Icon name="info" size={17} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto' }} />
          <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)', lineHeight: 1.7 }}>
            اگر ایمیل را دریافت نکردید، پوشهٔ اسپم را بررسی کنید یا چند دقیقه صبر کنید.
          </span>
        </div>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '24px 0 0' }}>
          <Link to="/login" style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="arrow-right" size={15} /> بازگشت به ورود
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 52, height: 52, borderRadius: 14,
        background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)',
        color: 'var(--gd-primary)', marginBottom: 18,
      }}>
        <Icon name="key-round" size={26} />
      </span>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>رمزتان را فراموش کردید؟</h2>
      <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px', lineHeight: 1.8 }}>
        ایمیل حساب خود را وارد کنید؛ لینک بازنشانی رمز را برایتان می‌فرستیم.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="ایمیل" type="email" placeholder="you@example.com" leftIcon="mail"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Button variant="primary" size="lg" fullWidth leftIcon="send" type="submit" loading={busy}>
          ارسال لینک بازیابی
        </Button>
      </form>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, marginTop: 20,
        padding: '12px 14px', borderRadius: 'var(--gd-radius-lg)',
        background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)',
      }}>
        <Icon name="info" size={17} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto' }} />
        <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)', lineHeight: 1.7 }}>
          اگر ایمیل را دریافت نکردید، پوشهٔ اسپم را بررسی کنید یا چند دقیقه صبر کنید.
        </span>
      </div>
      <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '24px 0 0' }}>
        <Link to="/login" style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="arrow-right" size={15} /> بازگشت به ورود
        </Link>
      </p>
    </>
  )
}
