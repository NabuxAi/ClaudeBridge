import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge } from '../../components/index.js'
import { admin } from '../../lib/api.js'

export default function AdminEventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    admin.event(id)
      .then((e) => alive && setEvent(e))
      .catch((e) => alive && setError(e?.message || 'بارگذاری رویداد انجام نشد.'))
    return () => { alive = false }
  }, [id])

  if (error) return <p style={{ color: 'var(--gd-danger-text)' }}>{error}</p>
  if (!event) return <PageHead title="جزئیات رویداد" subtitle="…" />

  return (
    <>
      <PageHead
        title={event.title}
        subtitle={`${event.site_name || event.site_id} · ${new Date(Number(event.created_at)).toLocaleString('fa-IR')}`}
        action={<Button as={Link} to="/admin/events" variant="secondary" size="sm" rightIcon="arrow-right">بازگشت</Button>}
      />
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>نوع</div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{event.kind}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>شدت</div>
            <Badge variant={event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'warning' : 'neutral'} appearance="soft">{event.severity}</Badge>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>وضعیت</div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{event.resolved_at ? 'بسته‌شده' : 'باز'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>کاربر</div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{event.user_name || event.user_email || '—'}</div>
          </div>
        </div>
        {event.detail && (
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>جزئیات</div>
            <pre style={{ background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: 12, fontSize: 12, overflow: 'auto', direction: 'ltr', textAlign: 'left' }}>
              {JSON.stringify(event.detail, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  )
}
