import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'
import { account } from '../../lib/api.js'

const STEPS = [
  { n: '۱', label: 'اتصال سایت' },
  { n: '۲', label: 'جفت‌سازی کانکتور' },
  { n: '۳', label: 'اولین بررسی' },
]

const Shell = ({ activeStep, children }) => (
  <div dir="rtl" style={{ minHeight: '100vh', background: 'var(--gd-bg-app)', fontFamily: 'var(--gd-font-sans)', color: 'var(--gd-text)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 40px 48px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield-check" size={19} /></span>
      <span style={{ fontWeight: 800, fontSize: 16 }}>Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b></span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 34 }}>
      {STEPS.map((s, i) => {
        const active = i <= activeStep
        return (
          <Fragment key={s.n}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 130 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: active ? 'var(--gd-primary)' : 'var(--gd-bg-surface)', border: active ? 'none' : '1.5px solid var(--gd-border-strong)', color: active ? '#fff' : 'var(--gd-text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                {i < activeStep ? <Icon name="check" size={17} strokeWidth={3} /> : s.n}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? 'var(--gd-primary)' : 'var(--gd-text-muted)' }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span style={{ width: 60, height: 2, background: i < activeStep ? 'var(--gd-primary)' : 'var(--gd-border-strong)', marginBottom: 22 }} />}
          </Fragment>
        )
      })}
    </div>
    <div style={{ width: '100%', maxWidth: 640, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-md)', padding: '30px 32px' }}>
      {children}
    </div>
  </div>
)

const Row = ({ label, value, mono }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400) }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: mono ? 'var(--gd-font-mono)' : undefined, fontSize: 13, wordBreak: 'break-all' }}>{value}</span>
        <Button variant="ghost" size="sm" leftIcon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'کپی شد' : 'کپی'}</Button>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('input') // input → pair
  const [url, setUrl] = useState('https://mystore.ir')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [site, setSite] = useState(null) // { id, pairing }

  const createSite = async (e) => {
    e?.preventDefault()
    setBusy(true); setErr('')
    try {
      const res = await account.addSite({ name: url })
      setSite(res)
      setPhase('pair')
    } catch (e2) {
      setErr(e2?.message || 'افزودن سایت ناموفق بود.')
    } finally { setBusy(false) }
  }

  const verify = async () => {
    setBusy(true); setErr('')
    try {
      await account.pingSite(site.id)
      navigate(`/site/${site.id}`)
    } catch (e2) {
      setErr(e2?.message || 'اتصال هنوز برقرار نشده است. تنظیمات کانکتور را بررسی کنید و دوباره تلاش کنید.')
    } finally { setBusy(false) }
  }

  if (phase === 'input') {
    return (
      <Shell activeStep={0}>
        <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>اتصال اولین سایت</h2>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: '8px 0 22px' }}>
          آدرس سایت وردپرسی خود را وارد کنید. یک «کلید اتصال» یکتا برای شما می‌سازیم که در افزونهٔ کانکتور وارد می‌کنید — از این پس همه‌چیز فقط از طریق سرور شما انجام می‌شود.
        </p>
        <form onSubmit={createSite}>
          <Input label="آدرس سایت" value={url} leftIcon="globe" onChange={(e) => setUrl(e.target.value)} placeholder="https://example.ir" required />
          <div style={{ display: 'flex', gap: 11, background: 'var(--gd-info-bg)', border: '1px solid var(--gd-info-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 16px', margin: '20px 0' }}>
            <Icon name="shield-check" size={18} style={{ color: 'var(--gd-info)', flex: '0 0 auto', marginTop: 1 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--gd-info-text)' }}>
              افزونهٔ <b>WP Claude Bridge</b> را نصب و «حالت کانکتور» را روشن کنید. افزونه فقط فرمان‌های امضاشدهٔ سرور شما را می‌پذیرد و مستقیم روی سایت کاری نمی‌کند.
            </div>
          </div>
          {err && <div className="gd-field__msg gd-field__msg--error" style={{ marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="primary" size="lg" leftIcon="plug" loading={busy} type="submit">ساخت کلید اتصال</Button>
            <Button variant="ghost" size="lg" type="button" onClick={() => navigate('/app')}>بعداً</Button>
          </div>
        </form>
      </Shell>
    )
  }

  const p = site?.pairing || {}
  return (
    <Shell activeStep={1}>
      <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>جفت‌سازی کانکتور</h2>
      <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: '8px 0 20px' }}>
        در سایت <b>{site?.name}</b>: به <span className="dwp-mono">ابزارها → Claude Bridge → Hub Connector Mode</span> بروید و این دو مقدار را وارد کنید. این رمز فقط همین یک‌بار نمایش داده می‌شود.
      </p>
      <Row label="آدرس سرور (Hub server URL)" value={p.serverUrl} mono />
      <Row label="رمز مشترک (Shared secret)" value={p.secret} mono />
      <div style={{ background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', margin: '16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>مراحل</div>
        <ol style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {(p.steps || []).map((s, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--gd-text-secondary)' }}>{s}</li>)}
        </ol>
      </div>
      {err && <div className="gd-field__msg gd-field__msg--error" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="primary" size="lg" leftIcon="plug-zap" loading={busy} onClick={verify}>بررسی اتصال</Button>
        <Button variant="ghost" size="lg" onClick={() => navigate(`/site/${site.id}`)}>ورود به پنل سایت</Button>
      </div>
    </Shell>
  )
}
