import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Input, Badge } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

const LIMIT = 25

export default function AdminUsers() {
  const [data, setData] = useState(null)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    admin.users({ limit: LIMIT, offset, search })
      .then(setData)
      .catch((e) => setError(e?.message || 'بارگذاری کاربران انجام نشد.'))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, search])

  async function setRole(id, role) {
    try {
      await admin.setUserRole(id, role)
      load()
    } catch (e) {
      setError(e?.message || 'تغییر نقش انجام نشد.')
    }
  }

  return (
    <>
      <PageHead title="مدیریت کاربران" subtitle="مشاهده و مدیریت حساب‌های کاربری" />
      {error && <p style={{ color: 'var(--gd-danger-text)', marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0) }}
          placeholder="جستجو در نام یا ایمیل…"
          style={{ maxWidth: 320 }}
        />
      </div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--gd-bg-subtle)', fontWeight: 700, color: 'var(--gd-text-muted)', textAlign: 'right' }}>
              <th style={{ padding: '12px 16px' }}>نام</th>
              <th style={{ padding: '12px 16px' }}>ایمیل</th>
              <th style={{ padding: '12px 16px' }}>نقش</th>
              <th style={{ padding: '12px 16px' }}>پلن</th>
              <th style={{ padding: '12px 16px' }}>سایت‌ها</th>
              <th style={{ padding: '12px 16px' }}>ثبت‌نام</th>
              <th style={{ padding: '12px 16px' }} />
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} style={{ borderTop: '1px solid var(--gd-border-subtle)' }}>
                <td style={{ padding: '12px 16px' }}>{u.name}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--gd-font-mono)' }}>{u.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  <Badge variant={u.role === 'admin' ? 'primary' : 'neutral'} appearance="soft">{u.role}</Badge>
                </td>
                <td style={{ padding: '12px 16px' }}>{u.plan}</td>
                <td style={{ padding: '12px 16px' }}>{faNum(u.site_count || 0)}</td>
                <td style={{ padding: '12px 16px', color: 'var(--gd-text-muted)' }}>{new Date(Number(u.created_at)).toLocaleDateString('fa-IR')}</td>
                <td style={{ padding: '12px 16px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button as={Link} to={`/admin/users/${u.id}`} variant="ghost" size="sm">جزئیات</Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRole(u.id, u.role === 'admin' ? 'مدیر حساب' : 'admin')}
                    >
                      {u.role === 'admin' ? 'عزل از ادمین' : 'ادمین کن'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>قبلی</Button>
        <span style={{ fontSize: 13, color: 'var(--gd-text-muted)' }}>
          {faNum(offset + 1)} تا {faNum(Math.min(offset + LIMIT, data?.total || 0))} از {faNum(data?.total || 0)}
        </span>
        <Button variant="secondary" size="sm" disabled={!data || offset + LIMIT >= data.total} onClick={() => setOffset((o) => o + LIMIT)}>بعدی</Button>
      </div>
    </>
  )
}
