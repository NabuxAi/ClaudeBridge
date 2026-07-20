import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, Input } from '../../components/index.js'
import { account } from '../../lib/api.js'

const STEPS = [
  { n: '۱', label: 'اتصال سایت' },
  { n: '۲', label: 'سطح اختیار' },
  { n: '۳', label: 'اولین بررسی' },
]

const METHODS = [
  { id: 'connector', icon: 'plug-zap', title: 'افزونهٔ Connector', desc: 'ساده و امن — نصب با یک کلیک' },
  { id: 'api', icon: 'key-round', title: 'اتصال با کلید API', desc: 'برای کاربران حرفه‌ای' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('https://mystore.ir')
  const [method, setMethod] = useState('connector')
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    try {
      await account.addSite({ name: url, url, method })
    } finally {
      navigate('/site/mystore')
    }
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: 'var(--gd-bg-app)',
        fontFamily: 'var(--gd-font-sans)',
        color: 'var(--gd-text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 40px 48px',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 30 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shield-check" size={19} />
        </span>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b></span>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 34 }}>
        {STEPS.map((s, i) => {
          const active = i === 0
          return (
            <Fragment key={s.n}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 120 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: active ? 'var(--gd-primary)' : 'var(--gd-bg-surface)',
                    border: active ? 'none' : '1.5px solid var(--gd-border-strong)',
                    color: active ? '#fff' : 'var(--gd-text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {s.n}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? 'var(--gd-primary)' : 'var(--gd-text-muted)' }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span style={{ width: 70, height: 2, background: 'var(--gd-border-strong)', marginBottom: 22 }} />
              )}
            </Fragment>
          )
        })}
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--gd-bg-surface)',
          border: '1px solid var(--gd-border)',
          borderRadius: 'var(--gd-radius-xl)',
          boxShadow: 'var(--gd-shadow-md)',
          padding: '30px 32px',
        }}
      >
        <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.01em', margin: 0 }}>اتصال اولین سایت</h2>
        <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: '8px 0 22px' }}>
          آدرس سایت وردپرسی خود را وارد کنید و روش اتصال را انتخاب کنید. پشتیبان بلافاصله اولین بررسی سلامت را انجام می‌دهد.
        </p>

        <Input label="آدرس سایت" value={url} leftIcon="globe" onChange={(e) => setUrl(e.target.value)} />

        <div style={{ fontSize: 13, fontWeight: 700, margin: '20px 0 10px' }}>روش اتصال</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
          {METHODS.map((m) => {
            const selected = method === m.id
            return (
              <label
                key={m.id}
                onClick={() => setMethod(m.id)}
                style={{
                  border: selected ? '2px solid var(--gd-primary)' : '1.5px solid var(--gd-border)',
                  background: selected ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
                  borderRadius: 'var(--gd-radius-lg)',
                  padding: '15px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: selected ? 'var(--gd-primary)' : 'var(--gd-bg-inset)',
                      color: selected ? '#fff' : 'var(--gd-text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={m.icon} size={18} />
                  </span>
                  {selected ? (
                    <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--gd-primary)' }} />
                    </span>
                  ) : (
                    <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--gd-border-strong)' }} />
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.title}</div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-secondary)', lineHeight: 1.55 }}>{m.desc}</div>
              </label>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 11,
            background: 'var(--gd-info-bg)',
            border: '1px solid var(--gd-info-border)',
            borderRadius: 'var(--gd-radius-lg)',
            padding: '14px 16px',
            marginBottom: 22,
          }}
        >
          <Icon name="info" size={18} style={{ color: 'var(--gd-info)', flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--gd-info-text)' }}>
            افزونهٔ <b>DigiWP Connector</b> را از پیشخوان وردپرس نصب و فعال کنید، سپس روی «اتصال و بررسی» بزنید. اتصال رمزنگاری‌شده و در هر زمان قابل قطع است.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" size="lg" leftIcon="plug" loading={busy} onClick={connect}>
            اتصال و بررسی سایت
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate('/app')}>بعداً</Button>
        </div>
      </div>
    </div>
  )
}
