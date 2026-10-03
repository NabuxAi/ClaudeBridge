import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import { MetricCard } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { t, digits } from '../../lib/i18n.js'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    admin.stats()
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setError(e?.message || t('admin.dashboard.loadFailed')))
    return () => { alive = false }
  }, [])

  return (
    <>
      <PageHead title={t('admin.dashboard.title')} subtitle={t('admin.dashboard.subtitle')} />
      {error && <p style={{ color: 'var(--gd-danger-text)' }}>{error}</p>}
      <div className="dwp-grid dwp-grid-3" style={{ marginBottom: 22 }}>
        <MetricCard icon="users" iconTone="primary" label={t('admin.dashboard.users')} value={digits(stats?.users ?? '—')} hint={t('admin.dashboard.usersHint')} />
        {/* The hint stays «—» until the stats actually arrive: a definite
            «۰ متصل» during loading or after an error dresses an unmeasured
            value up as a measured zero. */}
        <MetricCard icon="globe" iconTone="neutral" label={t('admin.dashboard.sites')} value={digits(stats?.sites ?? '—')} hint={stats ? t('admin.dashboard.paired', { n: digits(stats.pairedSites ?? 0) }) : '—'} />
        <MetricCard icon="bell-ring" iconTone="warning" label={t('admin.dashboard.openAlerts')} value={digits(stats?.openIncidents ?? '—')} hint={t('admin.dashboard.openAlertsHint')} />
        <MetricCard icon="activity" iconTone="success" label={t('admin.dashboard.events24h')} value={digits(stats?.events24h ?? '—')} hint={t('admin.dashboard.events24hHint')} />
        <MetricCard icon="activity" iconTone="neutral" label={t('admin.dashboard.events7d')} value={digits(stats?.events7d ?? '—')} hint={t('admin.dashboard.events7dHint')} />
      </div>
    </>
  )
}
