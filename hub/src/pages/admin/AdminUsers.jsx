import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge, SkeletonTable } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

const LIMIT = 25

// The users list serves raw rows (created_at as epoch ms). A missing or
// malformed value must read «—», never «Invalid Date».
const registeredOn = (v) => {
  const t = Number(v)
  return Number.isFinite(t) && t > 0 ? new Date(t).toLocaleDateString('fa-IR') : '—'
}

export default function AdminUsers() {
  const [data, setData] = useState(null)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  // Bumping it refetches through the guarded effect below — from the retry
  // button after a failed load, and from setRole after a role change.
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    // Search refetches on every keystroke, so replies race: without this guard
    // the slower older response lands last and the table stops matching the
    // search box — and a superseded failure lingers as a stale error. A
    // success also clears any error left from an earlier attempt.
    let alive = true
    admin.users({ limit: LIMIT, offset, search })
      .then((d) => { if (alive) { setData(d); setError('') } })
      .catch((e) => { if (alive) setError(e?.message || 'بارگذاری کاربران انجام نشد.') })
    return () => { alive = false }
  }, [offset, search, refresh])

  async function setRole(id, role) {
    try {
      await admin.setUserRole(id, role)
      setRefresh((n) => n + 1)
    } catch (e) {
      setError(e?.message || 'تغییر نقش انجام نشد.')
    }
  }

  // A failed first load must say so and offer a way back — never an eternal
  // skeleton that looks like slowness (same banner as Settings/Hosting).
  if (error && !data) {
    return (
      <>
        <PageHead title="مدیریت کاربران" subtitle="مشاهده و مدیریت حساب‌های کاربری" />
        <div className="gd-card gd-card--e-sm gd-card--p-md dwp-error-row">
          <Icon name="alert-circle" size={17} style={{ color: 'var(--gd-danger)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--gd-danger-text)', flex: 1 }}>{error}</span>
          <Button variant="secondary" size="sm" onClick={() => setRefresh((n) => n + 1)}>تلاش دوباره</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead title="مدیریت کاربران" subtitle="مشاهده و مدیریت حساب‌های کاربری" />
      {error && <p style={{ color: 'var(--gd-danger-text)', marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0) }}
          placeholder="جستجو در نام یا ایمیل…"
          style={{ maxWidth: 320 }}
        />
      </div>
      {/* .gd-table scrolls its own overflow instead of clipping it — a
          seven-column table was unreachable on the right on phones. */}
      {!data && !error && <SkeletonTable rows={5} cols={6} />}
      {data && (
        <div className="gd-table">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>ایمیل</th>
                <th>نقش</th>
                <th>پلن</th>
                <th>سایت‌ها</th>
                <th>ثبت‌نام</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--gd-text-muted)', whiteSpace: 'normal' }}>
                    {search ? 'کاربری با این مشخصات پیدا نشد.' : 'هنوز کاربری ثبت نشده.'}
                  </td>
                </tr>
              )}
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="dwp-mono">{u.email}</td>
                  <td>
                    <Badge variant={u.role === 'admin' ? 'primary' : 'neutral'} appearance="soft">{u.role}</Badge>
                  </td>
                  <td>{u.plan}</td>
                  <td data-numeric>{faNum(u.site_count || 0)}</td>
                  <td style={{ color: 'var(--gd-text-muted)' }}>{registeredOn(u.created_at)}</td>
                  <td style={{ textAlign: 'end' }}>
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
      )}
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
