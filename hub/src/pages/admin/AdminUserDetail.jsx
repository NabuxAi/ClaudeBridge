import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Badge, StatusPill, Select, Input } from '../../components/index.js'
import { admin } from '../../lib/api.js'
import { t, digits, dateTime, date } from '../../lib/i18n.js'

// /admin/users/:id serves the public user shape (users.byId → publicUser in
// server/src/store.js), which carries no created_at — Number(undefined) used
// to render «Invalid Date». Until the API returns the field, missing stays «—».
const registeredAt = (v) => {
  const ms = Number(v)
  return Number.isFinite(ms) && ms > 0 ? dateTime(ms) : '—'
}

export default function AdminUserDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    admin.user(id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e?.message || t('admin.user.loadFailed')))
    return () => { alive = false }
  }, [id])

  if (error) return <p style={{ color: 'var(--gd-danger-text)' }}>{error}</p>
  if (!data) return <PageHead title={t('admin.user.title')} subtitle="…" />

  const { user, sites } = data

  return (
    <>
      <PageHead
        title={user.name || user.email}
        subtitle={`${user.email} · ${user.role}`}
        action={<Button as={Link} to="/admin/users" variant="secondary" size="sm" rightIcon="arrow-right">{t('common.back')}</Button>}
      />
      {/* Column split lives in polish-site-d.css so mobile can fold it to one
          column — an inline `1fr 2fr` cannot be overridden by a media query. */}
      <div className="dwp-detail-grid">
        <div className="gd-card gd-card--e-sm gd-card--p-md">
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>{t('admin.user.account')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ wordBreak: 'break-all' }}><span style={{ color: 'var(--gd-text-muted)' }}>{t('admin.user.email')}</span> {user.email}</div>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>{t('admin.user.role')}</span> <Badge variant={user.role === 'admin' ? 'primary' : 'neutral'} appearance="soft">{user.role}</Badge></div>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>{t('admin.user.plan')}</span> {user.plan}</div>
            <div><span style={{ color: 'var(--gd-text-muted)' }}>{t('admin.user.registered')}</span> {registeredAt(user.created_at)}</div>
          </div>
        </div>
        <div className="gd-card gd-card--e-sm gd-card--p-md">
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>{t('admin.user.sites', { n: digits(sites.length) })}</div>
          {sites.length === 0 ? (
            <p style={{ color: 'var(--gd-text-muted)', fontSize: 13 }}>{t('admin.user.noSites')}</p>
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
      <GrantCard userId={user.id} />
    </>
  )
}

/** Operator activation: a paid period on a plan, without a gateway payment. */
function GrantCard({ userId }) {
  const [plan, setPlan] = useState('pro')
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function grant() {
    setBusy(true); setResult(null)
    try {
      const sub = await admin.grantSubscription(userId, plan, Number(days))
      setResult({ ok: true, text: t('admin.grant.done', { plan: sub.plan?.name || plan, date: date(sub.currentPeriodEnd) }) })
    } catch (e) {
      setResult({ ok: false, text: e?.message || t('admin.grant.failed') })
    } finally { setBusy(false) }
  }

  return (
    <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{t('admin.grant.title')}</div>
      <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 12px', lineHeight: 1.8 }}>{t('admin.grant.hint')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label={t('admin.grant.plan')}>
          <option value="base">{t('admin.grant.plans.base')}</option>
          <option value="pro">{t('admin.grant.plans.pro')}</option>
          <option value="agency">{t('admin.grant.plans.agency')}</option>
        </Select>
        <Input type="number" min="1" max="3660" value={days} onChange={(e) => setDays(e.target.value)} aria-label={t('admin.grant.days')} style={{ width: 110 }} />
        <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{t('admin.grant.daysUnit')}</span>
        <Button variant="primary" size="sm" loading={busy} onClick={grant}>{t('admin.grant.action')}</Button>
      </div>
      {result && <p role={result.ok ? 'status' : 'alert'} style={{ fontSize: 13, margin: '10px 0 0', color: result.ok ? 'var(--gd-success-text)' : 'var(--gd-danger-text)' }}>{result.text}</p>}
    </div>
  )
}
