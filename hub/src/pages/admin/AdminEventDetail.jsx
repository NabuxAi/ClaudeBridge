import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { t, dateTime } from '../../lib/i18n.js'

export default function AdminEventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    admin.event(id)
      .then((e) => alive && setEvent(e))
      .catch((e) => alive && setError(e?.message || t('admin.event.loadFailed')))
    return () => { alive = false }
  }, [id])

  if (error) return <p style={{ color: 'var(--gd-danger-text)' }}>{error}</p>
  if (!event) return <PageHead title={t('admin.event.title')} subtitle="…" />

  return (
    <>
      <PageHead
        title={event.title}
        subtitle={`${event.site_name || event.site_id} · ${dateTime(Number(event.created_at))}`}
        action={<Button as={Link} to="/admin/events" variant="secondary" size="sm" rightIcon="arrow-right">{t('common.back')}</Button>}
      />
      <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{t('admin.cols.kind')}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{event.kind}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{t('admin.cols.severity')}</div>
            <Badge variant={event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'warning' : 'neutral'} appearance="soft">{event.severity}</Badge>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{t('admin.event.status')}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{event.resolved_at ? t('admin.event.closed') : t('admin.event.open')}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{t('admin.event.user')}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{event.user_name || event.user_email || '—'}</div>
          </div>
        </div>
        {event.detail && (
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{t('admin.event.detail')}</div>
            <pre style={{ background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: 12, fontSize: 12, overflow: 'auto', direction: 'ltr', textAlign: 'left' }}>
              {JSON.stringify(event.detail, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  )
}
