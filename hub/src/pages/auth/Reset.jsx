import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'
import { auth } from '../../lib/api.js'

export default function Reset() {
  const [params] = useSearchParams()
  const token = params.get('token')

  return token ? <ResetForm token={token} /> : <ForgotForm />
}

function ForgotForm() {
  const [email, setEmail] = useState('')
  const [captcha, setCaptcha] = useState({ id: '', question: '', answer: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadCaptcha() }, [])

  async function loadCaptcha() {
    try {
      const c = await auth.captcha()
      setCaptcha({ id: c.id, question: c.question, answer: '' })
    } catch {
      setCaptcha({ id: '', question: '', answer: '' })
    }
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await auth.forgotPassword({ email, captchaId: captcha.id, captchaAnswer: captcha.answer })
      setSent(true)
    } catch (e) {
      setError(e?.message || 'ارسال نشد.')
      loadCaptcha()
      setCaptcha((c) => ({ ...c, answer: '' }))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <>
        <IconBadge name="mail-check" />
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>لینک ارسال شد</h2>
        <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px', lineHeight: 1.8 }}>
          اگر این ایمیل در سیستم وجود داشته باشد، لینک بازنشانی رمز عبور برای آن ارسال شده است.
        </p>
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
      <IconBadge name="key-round" />
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>بازنشانی رمز عبور</h2>
      <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px', lineHeight: 1.8 }}>
        ایمیل خود را وارد کنید؛ اگر حسابی با این ایمیل داشته باشید، لینک بازنشانی برای آن ارسال می‌شود.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          type="email"
          label="ایمیل"
          value={email}
          onChange={(v) => setEmail(v)}
          required
          autoFocus
        />
        {captcha.question && (
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: 'var(--gd-text-secondary)' }}>
              {captcha.question}
            </label>
            <Input
              type="text"
              value={captcha.answer}
              onChange={(v) => setCaptcha((c) => ({ ...c, answer: v }))}
              required
              placeholder="پاسخ عددی"
            />
          </div>
        )}
        {error && (
          <p style={{ fontSize: 13, color: 'var(--gd-danger)', margin: 0 }}>
            <Icon name="alert-circle" size={14} style={{ verticalAlign: '-2px', marginLeft: 5 }} />
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" fullWidth leftIcon="send" disabled={loading} type="submit" style={{ marginTop: 6 }}>
          {loading ? 'در حال ارسال…' : 'ارسال لینک بازنشانی'}
        </Button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-secondary)', margin: '24px 0 0' }}>
        <Link to="/login" style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="arrow-right" size={15} /> بازگشت به ورود
        </Link>
      </p>
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
        <IconBadge name="check-circle" />
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>رمز عبور بازنشانی شد</h2>
        <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px', lineHeight: 1.8 }}>
          رمز عبور جدید ذخیره شد. اکنون می‌توانید وارد شوید.
        </p>
        <Button variant="primary" size="lg" fullWidth leftIcon="log-in" href="/login">
          ورود
        </Button>
      </>
    )
  }

  return (
    <>
      <IconBadge name="lock" />
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>رمز عبور جدید</h2>
      <p style={{ fontSize: 14, color: 'var(--gd-text-secondary)', margin: '8px 0 26px', lineHeight: 1.8 }}>
        لینک بازنشانی یک ساعت معتبر و یک‌بار مصرف است. رمز جدید خود را وارد کنید.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          type="password"
          label="رمز عبور جدید"
          value={password}
          onChange={(v) => setPassword(v)}
          required
          autoFocus
        />
        <Input
          type="password"
          label="تکرار رمز عبور"
          value={confirm}
          onChange={(v) => setConfirm(v)}
          required
        />
        {error && (
          <p style={{ fontSize: 13, color: 'var(--gd-danger)', margin: 0 }}>
            <Icon name="alert-circle" size={14} style={{ verticalAlign: '-2px', marginLeft: 5 }} />
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" fullWidth leftIcon="check" disabled={loading} type="submit" style={{ marginTop: 6 }}>
          {loading ? 'در حال ذخیره…' : 'ذخیرهٔ رمز جدید'}
        </Button>
      </form>
    </>
  )
}

function IconBadge({ name }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 52, height: 52, borderRadius: 14,
      background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)',
      color: 'var(--gd-text-secondary)', marginBottom: 18,
    }}>
      <Icon name={name} size={26} />
    </span>
  )
}
