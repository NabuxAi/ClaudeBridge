import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import { MetricCard } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    admin.stats()
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setError(e?.message || 'بارگذاری آمار انجام نشد.'))
    return () => { alive = false }
  }, [])

  return (
    <>
      <PageHead title="داشبورد ادمین" subtitle="آمار کلی سیستم" />
      {error && <p style={{ color: 'var(--gd-danger-text)' }}>{error}</p>}
      <div className="dwp-grid dwp-grid-3" style={{ marginBottom: 22 }}>
        <MetricCard icon="users" iconTone="primary" label="کاربران" value={faNum(stats?.users ?? '—')} hint="ثبت‌نام‌شده" />
        <MetricCard icon="globe" iconTone="neutral" label="سایت‌ها" value={faNum(stats?.sites ?? '—')} hint={`${faNum(stats?.pairedSites ?? 0)} متصل`} />
        <MetricCard icon="bell-ring" iconTone="warning" label="هشدار باز" value={faNum(stats?.openIncidents ?? '—')} hint="نیازمند توجه" />
        <MetricCard icon="activity" iconTone="success" label="رویداد ۲۴ ساعت" value={faNum(stats?.events24h ?? '—')} hint="آخرین شبانه‌روز" />
        <MetricCard icon="activity" iconTone="neutral" label="رویداد ۷ روز" value={faNum(stats?.events7d ?? '—')} hint="آخرین هفته" />
      </div>
    </>
  )
}
