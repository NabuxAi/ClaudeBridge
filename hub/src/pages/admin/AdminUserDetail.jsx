import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge, StatusPill } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

export default function AdminUserDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    admin.user(id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e?.message || 'بارگذاری کاربر انجام نشد.'))
    return () => { alive = false }
  }, [id])

  if (error) return <p style={{ color: 'var(--gd-danger-text)' }}>{error}</p>
  if (!data) return <PageHead title="جزئیات کاربر" subtitle="…" />

  const { user, sites } = data

  return (
    <>
      <PageHead
        title={user.name || user.email}
        subtitle={`${user.email} · ${user.role}`}
        action={<Button as={Link} to="/admin/users" variant="secondary" size="sm" rightIcon="arrow-right">بازگشت</Button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18, marginBottom: 22 }}>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>اطلاعات حساب</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>ایمیل:</span> {user.email}</div>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>نقش:</span> <Badge variant={user.role === 'admin' ? 'primary' : 'neutral'} appearance="soft">{user.role}</Badge></div>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>پلن:</span> {user.plan}</div>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>تاریخ ثبت‌نام:</span> {new Date(Number(user.created_at)).toLocaleString('fa-IR')}</div>
          </div>
        </div>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>سایت‌ها ({faNum(sites.length)})</div>
          {sites.length === 0 ? (
            <p style={{ color: 'var(--gd-text-muted)', fontSize: 13 }}>هیچ سایتی ثبت نشده.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sites.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--gd-bg-subtle)', borderRadius: 'var(--gd-radius-md)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{s.title}</div>
                  </div>
                  <StatusPill status={s.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
