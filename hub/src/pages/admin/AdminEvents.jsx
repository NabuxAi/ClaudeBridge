import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Input, Select, Badge, SkeletonTable } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

const LIMIT = 25

export default function AdminEvents() {
  const [data, setData] = useState(null)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({ userId: '', siteId: '', kind: '', severity: '' })
  const [error, setError] = useState('')

  const load = () => {
    const params = { limit: LIMIT, offset, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }
    admin.events(params)
      .then(setData)
      .catch((e) => setError(e?.message || 'بارگذاری رویدادها انجام نشد.'))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, filters])

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }))
    setOffset(0)
  }

  return (
    <>
      <PageHead title="رویدادها" subtitle="گزارش سیستمی همهٔ سایت‌ها" />
      {error && <p style={{ color: 'var(--gd-danger-text)', marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)} placeholder="شناسه کاربر" />
        <Input value={filters.siteId} onChange={(e) => setFilter('siteId', e.target.value)} placeholder="شناسه سایت" />
        <Select value={filters.kind} onChange={(e) => setFilter('kind', e.target.value)}>
          <option value="">همه انواع</option>
          <option value="malware">بدافزار</option>
          <option value="update">آپدیت</option>
          <option value="backup">بکاپ</option>
          <option value="policy">سیاست</option>
          <option value="rescue">نجات</option>
          <option value="action">اقدام</option>
        </Select>
        <Select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="">همه شدت‌ها</option>
          <option value="critical">بحرانی</option>
          <option value="warning">هشدار</option>
          <option value="info">اطلاع</option>
        </Select>
      </div>
      {/* .gd-table scrolls its own overflow instead of clipping it — on phones
          the title and «جزئیات» columns were cut off with no way to reach them. */}
      {!data && !error && <SkeletonTable rows={5} cols={5} />}
      {data && (
        <div className="gd-table">
          <table>
            <thead>
              <tr>
                <th>زمان</th>
                <th>سایت</th>
                <th>نوع</th>
                <th>شدت</th>
                <th>عنوان</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.events.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gd-text-muted)', whiteSpace: 'normal' }}>
                    رویدادی با این فیلترها ثبت نشده.
                  </td>
                </tr>
              )}
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--gd-text-muted)' }}>{new Date(Number(e.created_at)).toLocaleString('fa-IR')}</td>
                  <td>{e.site_name || e.site_id}</td>
                  <td>{e.kind}</td>
                  <td>
                    <Badge variant={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warning' : 'neutral'} appearance="soft">{e.severity}</Badge>
                  </td>
                  <td>{e.title}</td>
                  <td style={{ textAlign: 'end' }}>
                    <Button as={Link} to={`/admin/events/${e.id}`} variant="ghost" size="sm">جزئیات</Button>
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
