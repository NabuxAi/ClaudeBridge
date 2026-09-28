import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import {
  Button, MetricCard, StatusPill, ActivityRow, AuthorityBadge, ProgressBar, Provenance,
  NotMeasured, SkeletonStats, SkeletonCard, SkeletonTable,
} from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

export default function Overview() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [checking, setChecking] = useState(false)
  const [loadError, setLoadError] = useState('')
  const aliveRef = useRef(true)

  // Every load re-probes: a real HTTP request and a real TLS handshake against
  // the site, right now. So "check again" is genuinely a fresh check.
  const fetchOverview = useCallback(() => {
    setLoadError('')
    return siteApi(siteId)
      .overview()
      .then((d) => { if (aliveRef.current) setData(d) })
      .catch((e) => { if (aliveRef.current) setLoadError(e?.message || 'بررسی سایت ممکن نشد.') })
  }, [siteId])

  const load = async () => {
    setChecking(true)
    try { await fetchOverview() } finally { if (aliveRef.current) setChecking(false) }
  }

  useEffect(() => {
    aliveRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOverview()
    return () => { aliveRef.current = false }
  }, [fetchOverview])

  const head = (
    <PageHead
      title="نمای کلی"
      subtitle="وضعیت لحظه‌ای سایت شما"
      action={(
        <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={checking} onClick={load}>
          {checking ? 'در حال بررسی…' : 'بررسی دوباره'}
        </Button>
      )}
    />
  )

  if (!data) {
    // A failed first load must end the skeleton. Without this state the page
    // stayed an eternal skeleton and the failure never reached the user.
    if (loadError) {
      return (
        <>
          {head}
          <NotMeasured title="وضعیت سایت خوانده نشد" reason={loadError} icon="alert-triangle" />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={checking} onClick={load}>
              تلاش دوباره
            </Button>
          </div>
        </>
      )
    }
    return (
      <>
        {head}
        <SkeletonCard height={120} />
        <div style={{ marginTop: 20 }}>
          <SkeletonStats count={4} />
        </div>
        <div style={{ marginTop: 20 }}>
          <SkeletonTable rows={3} cols={2} />
        </div>
      </>
    )
  }

  // Three honest states: answered / answered-no / could-not-ask. The old
  // expression (`data.status !== 'down'`) read a missing probe as healthy and
  // showed a green shield for exactly the check that never ran.
  const probe = data.probe || null
  const variant = probe ? (probe.reachable ? 'ok' : 'down') : 'unknown'
  const services = data.services || []
  const metrics = data.metrics || []
  const report = data.report || []

  return (
    <>
      {head}

      {loadError && (
        <div className="psa-err" role="alert">
          <Icon name="alert-triangle" size={17} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div style={{ flex: 1 }}>بررسی دوباره ممکن نشد: {loadError}</div>
        </div>
      )}

      {/* Health banner + service checklist */}
      <div className="psa-banner">
        <div className="psa-banner__main">
          <span className={`psa-banner__ic psa-banner__ic--${variant}`}>
            <Icon name={variant === 'ok' ? 'shield-check' : variant === 'down' ? 'alert-octagon' : 'alert-circle'} size={34} />
          </span>
          <div>
            {/* Says what was checked, not "everything is healthy". Two endpoints
                and a certificate answered — that is not the same as every part
                of a shop working, and the wording should not imply it. */}
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {variant === 'ok' ? 'سایت پاسخ می‌دهد' : variant === 'down' ? 'سایت پاسخ نداد' : 'بررسی انجام نشد'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9, flexWrap: 'wrap' }}>
              {/* 'down' had no label and no colour in the pill scale — a failed
                  probe rendered an invisible dot. critical (red) for a site that
                  answered badly, offline gray for a check that never happened. */}
              <StatusPill
                status={variant === 'ok' ? 'healthy' : variant === 'down' ? 'critical' : 'offline'}
                label={variant === 'unknown' ? 'بررسی نشد' : undefined}
              />
              {variant === 'unknown' ? (
                <span style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>
                  {data.probeError || 'پاسخی از بررسی دریافت نشد.'}
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--gd-text-muted)' }}>
                  <Icon name="refresh-cw" size={13} /> بررسی‌شده هنگام باز کردن این صفحه
                </span>
              )}
            </div>
          </div>
        </div>
        {services.length > 0 && (
          <div className="psa-banner__stats psa-banner__stats--grid">
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
        )}
      </div>

      {/* KPI metrics */}
      <div className="dwp-grid dwp-grid-4">
        {metrics.map((m) => (
          <MetricCard
            key={m.label} icon={m.icon} iconTone={m.tone} label={m.label}
            value={faNum(m.value)} unit={m.unit}
          />
        ))}
      </div>

      {/* Today's report + needs-attention */}
      <div className="psa-cols">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>رخدادهای اخیر</span>
          </div>
          <div className="psa-card psa-card--list">
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
          <div className="psa-card psa-card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              {/* The overview response carries no authority field (only the
                  settings view does), so the badge renders only when the real
                  value is present — the old `|| 'report'` claimed "فقط گزارش"
                  on every site, whatever its actual level. */}
              {data.authority && <AuthorityBadge level={data.authority} size="sm" />}
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
