import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import {
  Button, MetricCard, StatusPill, ActivityRow, AuthorityBadge, ProgressBar, Provenance,
} from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

export default function Overview() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [checking, setChecking] = useState(false)

  // Every load re-probes: a real HTTP request and a real TLS handshake against
  // the site, right now. So "check again" is genuinely a fresh check.
  const load = async () => {
    setChecking(true)
    try { setData(await siteApi(siteId).overview()) } finally { setChecking(false) }
  }

  useEffect(() => {
    let alive = true
    siteApi(siteId).overview().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [siteId])

  if (!data) return <PageHead title="نمای کلی" subtitle="وضعیت لحظه‌ای سایت شما" />

  const reachable = data.probe ? data.probe.reachable : data.status !== 'down'
  const services = data.services || []
  const metrics = data.metrics || []
  const report = data.report || []

  return (
    <>
      <PageHead
        title="نمای کلی"
        subtitle="وضعیت لحظه‌ای سایت شما"
        action={(
          <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={checking} onClick={load}>
            {checking ? 'در حال بررسی…' : 'بررسی دوباره'}
          </Button>
        )}
      />

      {/* Health banner + service checklist */}
      <div className="dwp-ov-banner" style={{ display: 'flex', alignItems: 'center', gap: 26, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 26px', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '0 0 auto' }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', background: reachable ? 'var(--gd-success-bg)' : 'var(--gd-danger-bg)', color: reachable ? 'var(--gd-success)' : 'var(--gd-danger)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={reachable ? 'shield-check' : 'alert-octagon'} size={34} />
          </span>
          <div>
            {/* Says what was checked, not "everything is healthy". Two endpoints
                and a certificate answered — that is not the same as every part
                of a shop working, and the wording should not imply it. */}
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {reachable ? 'سایت پاسخ می‌دهد' : 'سایت پاسخ نداد'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, flexWrap: 'wrap' }}>
              <StatusPill status={reachable ? 'healthy' : 'down'} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--gd-text-muted)' }}>
                <Icon name="refresh-cw" size={13} /> بررسی‌شده هنگام باز کردن این صفحه
              </span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 280, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '11px 22px', paddingInlineStart: 26, borderInlineStart: '1px solid var(--gd-border-subtle)' }}>
          {services.map((s) => (
            <span key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.ok ? 'var(--gd-success)' : 'var(--gd-danger)' }} />
                <span style={{ color: 'var(--gd-text-secondary)' }}>{s.label}</span>
              </span>
              {/* The reading behind the dot. A green dot on its own is a claim;
                  "200 در 340ms" is evidence. */}
              {s.detail && <span style={{ fontSize: 11, color: 'var(--gd-text-muted)', paddingInlineStart: 16 }}>{s.detail}</span>}
            </span>
          ))}
        </div>
      </div>

      {/* KPI metrics */}
      <div className="dwp-grid dwp-grid-4">
        {metrics.map((m) => (
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
            <span>رخدادهای اخیر</span>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 20px' }}>
            {report.length === 0 && (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--gd-text-muted)', lineHeight: 1.9 }}>
                هنوز رخدادی ثبت نشده. سایت فقط هنگام اسکن یا اقدام دیده می‌شود.
              </div>
            )}
            {report.map((r, i) => (
              <ActivityRow key={i} icon={r.icon} tone={r.tone} label={r.label} time={r.time} divided={i < report.length - 1} />
            ))}
          </div>
        </div>
        {/* What was here: a "host storage 82% · 41/50GB" bar with a progress
            meter, a claim that cleaning would free 6GB, and an "auto-clean
            space" button. Nothing measures host storage — it is not visible
            from outside the server — no cleanup routine exists, and the button
            had no handler. Replaced with the certificate, which is a real
            reading and the thing that most often takes a healthy site down. */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>گواهی SSL</div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.probe?.cert?.ok ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--gd-text-secondary)', fontWeight: 600 }}>اعتبار باقی‌مانده</span>
                  <span className="dwp-mono" style={{ fontWeight: 700, color: data.probe.cert.daysLeft < 14 ? 'var(--gd-danger-text)' : data.probe.cert.daysLeft < 30 ? 'var(--gd-warning-text)' : 'var(--gd-success)' }}>
                    {faNum(data.probe.cert.daysLeft)} روز
                  </span>
                </div>
                <ProgressBar
                  value={Math.max(0, Math.min(100, Math.round((data.probe.cert.daysLeft / 90) * 100)))}
                  tone={data.probe.cert.daysLeft < 14 ? 'danger' : data.probe.cert.daysLeft < 30 ? 'warning' : 'success'}
                />
                <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.8 }}>
                  صادرکننده: {data.probe.cert.issuer || 'نامشخص'} · انقضا: {new Date(data.probe.cert.expiresAt).toLocaleDateString('fa-IR')}
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
                گواهی خوانده نشد{data.probe?.cert?.error ? `: ${data.probe.cert.error}` : ''}.
              </p>
            )}
            <div style={{ height: 1, background: 'var(--gd-border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AuthorityBadge level={data.authority || 'report'} size="sm" />
              <span style={{ fontSize: 12, color: 'var(--gd-text-muted)', lineHeight: 1.5 }}>
                سطح اختیار در تنظیمات تعیین می‌شود.
              </span>
            </div>
          </div>
        </div>
      </div>

      <Provenance data={data} />
    </>
  )
}
