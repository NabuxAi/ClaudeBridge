import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, StatusPill, AuthorityBadge } from '../../components/index.js'
import { account } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

// Pick a card icon from the site's title/name so the grid keeps visual variety.
function siteIcon(s) {
  const t = `${s.title || ''} ${s.name || ''}`
  if (t.includes('فروشگاه')) return 'store'
  if (t.includes('وبلاگ')) return 'newspaper'
  if (t.includes('لندینگ') || t.includes('کمپین')) return 'megaphone'
  return 'globe'
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 14, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function Sites() {
  const [sites, setSites] = useState(null)

  useEffect(() => {
    let alive = true
    account.sites().then((d) => alive && setSites(d))
    return () => { alive = false }
  }, [])

  const addAction = <Button variant="primary" size="sm" leftIcon="plus" as={Link} to="/onboarding">افزودن سایت</Button>

  if (!sites) {
    return <PageHead title="سایت‌های من" subtitle="همهٔ سایت‌های تحت پوشش شما در یک نگاه" action={addAction} />
  }

  return (
    <>
      <PageHead
        title="سایت‌های من"
        subtitle="همهٔ سایت‌های تحت پوشش شما در یک نگاه"
        action={addAction}
      />

      <div className="dwp-grid dwp-grid-3">
        {sites.map((s) => {
          const attn = s.status === 'warning' || s.status === 'critical'
          return (
            <div
              key={s.id}
              style={{
                background: 'var(--gd-bg-surface)',
                border: `1px solid ${attn ? 'var(--gd-warning-border)' : 'var(--gd-border)'}`,
                borderRadius: 'var(--gd-radius-lg)',
                boxShadow: 'var(--gd-shadow-sm)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 15,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: attn ? 'var(--gd-warning-bg)' : 'var(--gd-primary-subtle)', color: attn ? 'var(--gd-warning)' : 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <Icon name={siteIcon(s)} size={21} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>{s.title}</div>
                </div>
                <StatusPill status={s.status} size="sm" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px' }}>
                <Stat label="آپ‌تایم" value={`${faNum(String(s.uptime).replace('.', '٫'))}٪`} />
                <Stat label="آپدیت" value={faNum(s.pendingUpdates)} color={s.pendingUpdates > 0 ? 'var(--gd-warning-text)' : undefined} />
                <Stat label="هشدار" value={faNum(s.incidents)} color={s.incidents > 0 ? 'var(--gd-danger-text)' : undefined} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <AuthorityBadge level={s.authority} size="sm" />
                <Button as={Link} to={`/site/${s.id}`} variant="secondary" size="sm" rightIcon="arrow-left">ورود به پنل</Button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
