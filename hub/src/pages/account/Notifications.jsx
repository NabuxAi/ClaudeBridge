import { useEffect, useState } from 'react'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import { Switch, Select, Badge } from '../../components/index.js'
import { account } from '../../lib/api.js'

const CHANNEL_TONE = {
  email: { bg: 'var(--gd-primary-subtle)', fg: 'var(--gd-primary)' },
  sms: { bg: 'var(--gd-primary-subtle)', fg: 'var(--gd-primary)' },
  telegram: { bg: 'var(--gd-accent-subtle)', fg: 'var(--gd-accent)' },
}

const PREF_DOT = {
  critical: 'var(--gd-danger)',
  approvals: 'var(--gd-warning)',
  updates: 'var(--gd-success)',
  reports: 'var(--gd-primary)',
}

export default function Notifications() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    account.notifications().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [])

  const head = (
    <PageHead
      title="اعلان‌ها و کانال هشدار"
      subtitle="کانال‌های دریافت هشدار و انتخاب رویدادها"
    />
  )

  if (!data) return head

  return (
    <>
      {head}

      <div className="dwp-notif-cols" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 22 }}>
        {/* Channels */}
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 22px' }}>
          {data.channels.map((ch) => {
            const tone = CHANNEL_TONE[ch.id] || CHANNEL_TONE.email
            return (
              <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 0', borderBottom: '1px solid var(--gd-border-subtle)' }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: tone.bg, color: tone.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <Icon name={ch.icon} size={20} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {ch.label}
                    {ch.id === 'telegram' && <Badge variant="success" appearance="soft" dot>متصل</Badge>}
                  </div>
                  <div className="dwp-mono" style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)', marginTop: 1 }}>{ch.value}</div>
                </div>
                <Switch defaultChecked={ch.on} />
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 0' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gd-bg-inset)', color: 'var(--gd-text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="bell-ring" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>اعلان مرورگر (وب‌پوش)</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 1 }}>غیرفعال</div>
            </div>
            <Switch />
          </div>
        </div>

        {/* Quiet hours */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
              <Icon name="moon" size={17} style={{ color: 'var(--gd-primary)' }} /> ساعت‌های سکوت
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Select label="از">
                <option>۲۳:۰۰</option>
                <option>۲۲:۰۰</option>
              </Select>
              <Select label="تا">
                <option>۰۷:۰۰</option>
                <option>۰۸:۰۰</option>
              </Select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gd-text-muted)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger-border)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px', marginTop: 12 }}>
              <Icon name="alert-octagon" size={15} style={{ color: 'var(--gd-danger)', flex: '0 0 auto' }} /> رخدادهای بحرانی حتی در ساعت سکوت هم ارسال می‌شوند.
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>چه رویدادهایی اطلاع داده شوند؟</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 22px' }}>
        {data.prefs.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 0', borderBottom: i < data.prefs.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: PREF_DOT[p.id] || 'var(--gd-text-muted)', flex: '0 0 auto' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{p.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 1 }}>{p.desc}</div>
            </div>
            {p.locked
              ? <Badge variant="danger" appearance="soft" icon="lock">همیشه فعال</Badge>
              : <Switch defaultChecked={p.on} />}
          </div>
        ))}
      </div>
    </>
  )
}
