import { Fragment, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'
import { account } from '../../lib/api.js'

// A reload mid-pairing used to destroy the one-time shared secret forever:
// the pairing endpoint returns it only in the POST /sites response and never
// again, so the only "recovery" was creating a duplicate site. Keep the
// pairing payload in sessionStorage (this tab only) while the pairing step is
// open, and drop it the moment the user leaves the step on purpose.
const PAIRING_KEY = 'digiwp.onboarding.pairing'

function readPairing() {
  try {
    const raw = sessionStorage.getItem(PAIRING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function keepPairing(site) {
  try { sessionStorage.setItem(PAIRING_KEY, JSON.stringify(site)) } catch { /* storage unavailable — the secret still shows below; a reload just loses it */ }
}

function dropPairing() {
  try { sessionStorage.removeItem(PAIRING_KEY) } catch { /* ignore */ }
}

const STEPS = [
  { n: '۱', label: 'اتصال سایت' },
  { n: '۲', label: 'جفت‌سازی کانکتور' },
  { n: '۳', label: 'اولین بررسی' },
]

const Shell = ({ activeStep, children }) => (
  // Padding lives in .ob-shell (polish-auth.css) so a media query can tighten
  // it on phones — the fixed 40px gutters were part of the mobile overflow.
  <div dir="rtl" className="ob-shell" style={{ minHeight: '100vh', background: 'var(--gd-bg-app)', fontFamily: 'var(--gd-font-sans)', color: 'var(--gd-text)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="shield-check" size={19} /></span>
      <span style={{ fontWeight: 800, fontSize: 16 }}>Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b></span>
    </div>
    {/* Fluid step rail: steps shrink to a share of the row, connectors flex
        between 8 and 60px. Desktop keeps the exact 130 + 60 rhythm; below
        ~510px of content the rail compresses instead of overflowing. */}
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 34, width: '100%', maxWidth: 510 }}>
      {STEPS.map((s, i) => {
        const active = i <= activeStep
        return (
          <Fragment key={s.n}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 'min(130px, 31%)' }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: active ? 'var(--gd-primary)' : 'var(--gd-bg-surface)', border: active ? 'none' : '1.5px solid var(--gd-border-strong)', color: active ? '#fff' : 'var(--gd-text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                {i < activeStep ? <Icon name="check" size={17} strokeWidth={3} /> : s.n}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? 'var(--gd-primary)' : 'var(--gd-text-muted)', textAlign: 'center' }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span style={{ flex: '1 1 12px', minWidth: 8, maxWidth: 60, height: 2, background: i < activeStep ? 'var(--gd-primary)' : 'var(--gd-border-strong)', marginBottom: 22 }} />}
          </Fragment>
        )
      })}
    </div>
    <div style={{ width: '100%', maxWidth: 640, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-md), inset 0 1px 0 var(--gd-highlight)', padding: '30px 32px' }}>
      {children}
    </div>
  </div>
)

const Row = ({ label, value, mono }) => {
  // Copy feedback is honest: "کپی شد" only after the clipboard promise
  // actually resolved. A denied permission or an insecure context says
  // "کپی نشد" instead of faking success on a pairing secret the user
  // depends on — and the value stays selectable in the row either way.
  const [copy, setCopy] = useState('idle') // idle | ok | failed
  const timer = useRef(null)
  const flash = (state) => {
    setCopy(state)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopy('idle'), 1400)
  }
  const doCopy = async () => {
    if (!navigator.clipboard?.writeText) { flash('failed'); return }
    try {
      await navigator.clipboard.writeText(value)
      flash('ok')
    } catch {
      flash('failed')
    }
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: mono ? 'var(--gd-font-mono)' : undefined, fontSize: 13, wordBreak: 'break-all' }}>{value}</span>
        <Button
          variant="ghost" size="sm"
          leftIcon={copy === 'ok' ? 'check' : copy === 'failed' ? 'x' : 'copy'}
          onClick={doCopy}
          style={copy === 'failed' ? { color: 'var(--gd-danger-text)' } : undefined}
        >
          {copy === 'ok' ? 'کپی شد' : copy === 'failed' ? 'کپی نشد' : 'کپی'}
        </Button>
      </div>
    </div>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  // Restored from sessionStorage when a reload happened mid-pairing (see
  // PAIRING_KEY above) — otherwise a fresh flow starts at the URL step.
  const restored = readPairing()
  const [phase, setPhase] = useState(restored ? 'pair' : 'input') // input → pair
  const [url, setUrl] = useState('') // never prefill a URL: a careless submit would create a real site record for a made-up domain
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [site, setSite] = useState(restored) // { id, pairing }

  const createSite = async (e) => {
    e?.preventDefault()
    setBusy(true); setErr('')
    try {
      const res = await account.addSite({ name: url })
      keepPairing(res)
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
      dropPairing()
      navigate(`/site/${site.id}`)
    } catch (e2) {
      setErr(e2?.message || 'اتصال هنوز برقرار نشده است. تنظیمات کانکتور را بررسی کنید و دوباره تلاش کنید.')
    } finally { setBusy(false) }
  }

  if (phase === 'input') {
    return (
      <Shell activeStep={0}>
        <h2 style={{ fontSize: 23, fontWeight: 800, margin: 0 }}>اتصال اولین سایت</h2>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: '8px 0 22px' }}>
          آدرس سایت وردپرسی خود را وارد کنید. یک «کلید اتصال» یکتا برای شما می‌سازیم که در افزونهٔ کانکتور وارد می‌کنید — از این پس همه‌چیز فقط از طریق سرور شما انجام می‌شود.
        </p>
        <form onSubmit={createSite}>
          <Input label="آدرس سایت" value={url} leftIcon="globe" onChange={(e) => setUrl(e.target.value)} placeholder="https://example.ir" required />
          <div style={{ display: 'flex', gap: 11, background: 'var(--gd-info-bg)', border: '1px solid var(--gd-info-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 16px', margin: '20px 0' }}>
            <Icon name="shield-check" size={18} style={{ color: 'var(--gd-info)', flex: '0 0 auto', marginTop: 1 }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--gd-info-text)' }}>
              افزونهٔ <b>DigiWp Ai Bridge</b> را نصب و «حالت کانکتور» را روشن کنید. افزونه فقط فرمان‌های امضاشدهٔ سرور شما را می‌پذیرد و مستقیم روی سایت کاری نمی‌کند.
              <div style={{ marginTop: 10 }}>
                <a href="/digiwp-ai-bridge.zip" download style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--gd-info)', textDecoration: 'none' }}>
                  <Icon name="download" size={15} /> دانلود افزونهٔ DigiWp Ai Bridge
                </a>
              </div>
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
      <h2 style={{ fontSize: 23, fontWeight: 800, margin: 0 }}>جفت‌سازی کانکتور</h2>
      <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: '8px 0 20px' }}>
        در سایت <b>{site?.name}</b>: به <span className="dwp-mono">ابزارها → DigiWp Ai Bridge → Hub Connector Mode</span> بروید و این دو مقدار را وارد کنید. این رمز فقط همین یک‌بار نمایش داده می‌شود.
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
        {/* Leaving the pairing step on purpose ends the one-time display: the
            stored copy is dropped, matching the "shown only once" promise. */}
        <Button variant="ghost" size="lg" onClick={() => { dropPairing(); navigate(`/site/${site.id}`) }}>ورود به پنل سایت</Button>
      </div>
    </Shell>
  )
}
