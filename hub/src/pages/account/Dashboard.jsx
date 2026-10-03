import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import {
  Button, MetricCard, StatusPill, AuthorityBadge, ActivityRow, AlertCard, SkeletonStats,
} from '../../components/index.js'
import { account } from '../../lib/api.js'
import { t, digits, num, time } from '../../lib/i18n.js'

const NS = 'dashboard'

// Pick a card icon from the site's title/name so the grid keeps visual variety.
// The titles are the owner's own text, so both Persian and English words are
// recognised here (input matching, not UI copy).
function siteIcon(s) {
  const text = `${s.title || ''} ${s.name || ''}`.toLowerCase()
  if (/فروشگاه|shop|store/.test(text)) return 'store'
  if (/وبلاگ|blog/.test(text)) return 'newspaper'
  if (/لندینگ|کمپین|landing|campaign/.test(text)) return 'megaphone'
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

function eventIcon(kind, severity) {
  if (severity === 'critical') return 'alert-octagon'
  if (severity === 'warning') return 'alert-triangle'
  if (kind === 'update' || kind === 'policy') return 'refresh-cw'
  if (kind === 'backup') return 'database'
  if (kind === 'malware' || kind === 'rescue') return 'shield-alert'
  return 'info'
}

function eventTone(severity, resolved) {
  if (resolved) return 'done'
  if (severity === 'critical') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'info'
}

export default function Dashboard() {
  const [sites, setSites] = useState(null)
  const [activity, setActivity] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([account.sites(), account.activity()])
      .then(([s, a]) => {
        if (!alive) return
        setSites(s)
        setActivity(a?.events || [])
      })
      .catch((e) => {
        // Without this catch a failed request was swallowed and the page sat
        // on the empty header forever — a network error looked like a slow one.
        if (alive) setError(e?.message || t('dashboard.loadFailed'))
      })
    return () => { alive = false }
  }, [reloadKey])

  const addAction = <Button variant="secondary" size="sm" leftIcon="plus" as={Link} to="/onboarding">{t('dashboard.addSite')}</Button>

  if (error) {
    return (
      <>
        <PageHead title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} action={addAction} />
        <AlertCard
          severity="critical"
          title={t('dashboard.loadFailedTitle')}
          desc={error}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setError(null); setReloadKey((k) => k + 1) }}>
              {t('common.retry')}
            </Button>
          )}
        />
      </>
    )
  }

  if (!sites) {
    return (
      <>
        <PageHead title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} action={addAction} />
        <SkeletonStats count={4} />
      </>
    )
  }

  const active = sites.length
  const healthy = sites.filter((s) => s.status === 'healthy').length
  const attention = sites.filter((s) => s.status === 'warning' || s.status === 'critical')
  // The server returns pendingUpdates: null where it has no measurement.
  // Folding that null into a sum with «|| 0» manufactured a confident «۰» —
  // a missing reading is a dash, never a green zero.
  const pendingKnown = sites.every((s) => s.pendingUpdates != null)
  const pendingTotal = pendingKnown ? sites.reduce((sum, s) => sum + s.pendingUpdates, 0) : null
  const sitesWithUpdates = pendingKnown ? sites.filter((s) => s.pendingUpdates > 0).length : null

  return (
    <>
      <PageHead
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        action={addAction}
      />

      {/* Summary metrics */}
      <div className="dwp-grid dwp-grid-4" style={{ marginBottom: 22 }}>
        <MetricCard icon="globe" iconTone="primary" label={t('dashboard.metrics.active')} value={digits(active)} />
        <MetricCard icon="shield-check" iconTone="success" label={t('dashboard.metrics.healthy')} value={digits(healthy)} hint={t('dashboard.metrics.healthyHint')} />
        <MetricCard icon="alert-triangle" iconTone="warning" label={t('dashboard.metrics.attention')} value={digits(attention.length)} hint={attention[0]?.name || t('dashboard.metrics.noneHint')} />
        <MetricCard
          icon="refresh-cw"
          iconTone="neutral"
          label={t('dashboard.metrics.pending')}
          value={pendingTotal == null ? '—' : digits(pendingTotal)}
          hint={pendingTotal == null ? t('common.notMeasured') : t('dashboard.metrics.pendingHint', { count: sitesWithUpdates })}
        />
      </div>

      {/* Site cards */}
      <div className="dwp-sec-title">{t('dashboard.yourSites')}</div>
      {sites.length === 0 ? (
        <AlertCard
          severity="info"
          title={t('dashboard.empty.title')}
          desc={t('dashboard.empty.desc')}
          className="dwp-acc-alert"
          actions={addAction}
        />
      ) : (
        <div className="dwp-grid dwp-grid-3" style={{ marginBottom: 24 }}>
          {sites.map((s) => {
            const attn = s.status === 'warning' || s.status === 'critical'
            return (
              <div
                key={s.id}
                className="dwp-card"
                style={{
                  borderColor: attn ? 'var(--gd-warning-border)' : undefined,
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
                  <Stat label={t(`${NS}.stat.uptime`)} value={s.uptime == null ? '—' : num(Number(s.uptime) / 100, { style: 'percent', maximumFractionDigits: 2 })} />
                  <Stat label={t(`${NS}.stat.updates`)} value={s.pendingUpdates == null ? '—' : digits(s.pendingUpdates)} color={s.pendingUpdates > 0 ? 'var(--gd-warning-text)' : undefined} />
                  <Stat label={t(`${NS}.stat.alerts`)} value={s.incidents == null ? '—' : digits(s.incidents)} color={s.incidents > 0 ? 'var(--gd-danger-text)' : undefined} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AuthorityBadge level={s.authority} size="sm" />
                  <Button as={Link} to={`/site/${s.id}`} variant="secondary" size="sm" rightIcon="arrow-left">{t(`${NS}.openPanel`)}</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cross-site activity */}
      <div className="dwp-sec-title">{t('dashboard.activityTitle')}</div>
      <div className="dwp-card" style={{ padding: '6px 20px' }}>
        {activity == null ? (
          <ActivityRow icon="loader" tone="neutral" label={t('dashboard.activityLoading')} meta="" time="" divided={false} />
        ) : activity.length === 0 ? (
          <ActivityRow icon="info" tone="neutral" label={t('dashboard.activityEmpty')} meta="" time="" divided={false} />
        ) : activity.map((e, i) => (
          <ActivityRow
            key={e.id || i}
            icon={eventIcon(e.kind, e.severity)}
            tone={eventTone(e.severity, e.resolved_at)}
            label={e.title}
            meta={e.site_name || e.site_id}
            time={time(Number(e.created_at))}
            divided={i < activity.length - 1}
          />
        ))}
      </div>
    </>
  )
}
