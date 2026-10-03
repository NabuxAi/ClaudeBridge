import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Input, Select, Badge, SkeletonTable } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { t, digits, dateTime } from '../../lib/i18n.js'

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
      .catch((e) => setError(e?.message || t('admin.events.loadFailed')))
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
      <PageHead title={t('admin.events.title')} subtitle={t('admin.events.subtitle')} />
      {error && <p style={{ color: 'var(--gd-danger-text)', marginBottom: 12 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)} placeholder={t('admin.events.userId')} />
        <Input value={filters.siteId} onChange={(e) => setFilter('siteId', e.target.value)} placeholder={t('admin.events.siteId')} />
        <Select value={filters.kind} onChange={(e) => setFilter('kind', e.target.value)}>
          <option value="">{t('admin.events.allKinds')}</option>
          <option value="malware">{t('admin.events.kinds.malware')}</option>
          <option value="update">{t('admin.events.kinds.update')}</option>
          <option value="backup">{t('admin.events.kinds.backup')}</option>
          <option value="policy">{t('admin.events.kinds.policy')}</option>
          <option value="rescue">{t('admin.events.kinds.rescue')}</option>
          <option value="action">{t('admin.events.kinds.action')}</option>
        </Select>
        <Select value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
          <option value="">{t('admin.events.allSeverities')}</option>
          <option value="critical">{t('components.status.critical')}</option>
          <option value="warning">{t('components.status.warning')}</option>
          <option value="info">{t('components.status.info')}</option>
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
                <th>{t('admin.cols.time')}</th>
                <th>{t('admin.cols.site')}</th>
                <th>{t('admin.cols.kind')}</th>
                <th>{t('admin.cols.severity')}</th>
                <th>{t('admin.cols.title')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.events.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gd-text-muted)', whiteSpace: 'normal' }}>
                    {t('admin.events.empty')}
                  </td>
                </tr>
              )}
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--gd-text-muted)' }}>{dateTime(Number(e.created_at))}</td>
                  <td>{e.site_name || e.site_id}</td>
                  <td>{e.kind}</td>
                  <td>
                    <Badge variant={e.severity === 'critical' ? 'danger' : e.severity === 'warning' ? 'warning' : 'neutral'} appearance="soft">{e.severity}</Badge>
                  </td>
                  <td>{e.title}</td>
                  <td style={{ textAlign: 'end' }}>
                    <Button as={Link} to={`/admin/events/${e.id}`} variant="ghost" size="sm">{t('admin.details')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}>{t('admin.prev')}</Button>
        <span style={{ fontSize: 13, color: 'var(--gd-text-muted)' }}>
          {t('admin.range', { from: digits(offset + 1), to: digits(Math.min(offset + LIMIT, data?.total || 0)), total: digits(data?.total || 0) })}
        </span>
        <Button variant="secondary" size="sm" disabled={!data || offset + LIMIT >= data.total} onClick={() => setOffset((o) => o + LIMIT)}>{t('admin.next')}</Button>
      </div>
    </>
  )
}
