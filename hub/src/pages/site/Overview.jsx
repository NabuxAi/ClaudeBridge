import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import {
  Button, MetricCard, StatusPill, Badge, ActivityRow, AuthorityBadge, ProgressBar,
} from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

export default function Overview() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    siteApi(siteId).overview().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [siteId])

  if (!data) return <PageHead title="نمای کلی" subtitle="وضعیت لحظه‌ای سایت شما" />

  return (
    <>
      <PageHead
        title="نمای کلی"
        subtitle="وضعیت لحظه‌ای سایت شما"
        action={<Button variant="primary" size="sm" leftIcon="refresh-cw">بررسی دوباره</Button>}
      />

      {/* Health banner + service checklist */}
      <div className="dwp-ov-banner" style={{ display: 'flex', alignItems: 'center', gap: 26, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 26px', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '0 0 auto' }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gd-success-bg)', color: 'var(--gd-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield-check" size={34} />
          </span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>همه‌چیز سالم است</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
              <StatusPill status="healthy" />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--gd-text-muted)' }}>
                <Icon name="refresh-cw" size={13} /> آخرین بررسی: ۲ دقیقه پیش
              </span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 280, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '11px 22px', paddingInlineStart: 26, borderInlineStart: '1px solid var(--gd-border-subtle)' }}>
          {data.services.map((s) => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.ok ? 'var(--gd-success)' : 'var(--gd-warning)' }} />
              <span style={{ color: 'var(--gd-text-secondary)' }}>{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* KPI metrics */}
      <div className="dwp-grid dwp-grid-4">
        {data.metrics.map((m) => (
          <MetricCard
            key={m.label} icon={m.icon} iconTone={m.tone} label={m.label}
            value={m.value} unit={m.unit}
            trend={m.trend} trendDir={m.dir} trendTone={m.dir === 'up' ? 'positive' : m.dir === 'down' ? 'positive' : 'neutral'}
          />
        ))}
      </div>

      {/* Today's report + needs-attention */}
      <div className="dwp-ov-cols" style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, marginTop: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>گزارش امروز</span>
            <Badge variant="success" appearance="soft" icon="check">سالم</Badge>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 20px' }}>
            {data.report.map((r, i) => (
              <ActivityRow key={i} icon={r.icon} tone={r.tone} label={r.label} time={r.time} divided={i < data.report.length - 1} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>نیازمند توجه</span>
            <Badge variant="warning" appearance="soft" icon="alert-triangle">۱ مورد</Badge>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 7 }}>
                <span style={{ color: 'var(--gd-text-secondary)', fontWeight: 600 }}>فضای هاست</span>
                <span className="dwp-mono" style={{ fontWeight: 700, color: 'var(--gd-warning-text)' }}>۸۲٪ · ۴۱/۵۰GB</span>
              </div>
              <ProgressBar value={data.hostSpace} tone="warning" />
              <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--gd-text-muted)', margin: '9px 0 0' }}>
                با پاک‌سازی داده‌های موقت و بهینه‌سازی دیتابیس حدود ۶GB آزاد می‌شود. بکاپ سالم موجود است.
              </p>
            </div>
            <Button variant="secondary" size="sm" leftIcon="sparkles" fullWidth>پاک‌سازی خودکار فضا</Button>
            <div style={{ height: 1, background: 'var(--gd-border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AuthorityBadge level="auto" size="sm" />
              <span style={{ fontSize: 12, color: 'var(--gd-text-muted)', lineHeight: 1.5 }}>پشتیبان کارهای کم‌ریسک را خودکار انجام می‌دهد.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
