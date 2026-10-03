import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, StatusPill, AuthorityBadge, AlertCard } from '../../components/index.js'
import { account } from '../../lib/api.js'
import { t, digits, num } from '../../lib/i18n.js'

const NS = 'sites'

// Pick a card icon from the site's title/name so the grid keeps visual variety.
// The titles are the owner's own text, so both Persian and English words are
// recognised here (input matching, not UI copy).
function siteIcon(s) {
  const text = `${s.title || ''} ${s.name || ''}`.toLowerCase()
  if (/فروشگاه|shop|store/.test(text)) return 'store'
  if (/وبلاگ|blog/.test(text)) return 'newspaper'
  if (/لندینگ|کمپین|landing|campaign/.test(text)) return 'megaphone'
  return 'globe'
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 14, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function Sites() {
  const [sites, setSites] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    account.sites()
      .then((d) => alive && setSites(d))
      .catch((e) => alive && setError(e?.message || t('sites.loadFailed')))
    return () => { alive = false }
  }, [reloadKey])

  const addAction = <Button variant="primary" size="sm" leftIcon="plus" as={Link} to="/onboarding">{t('sites.addSite')}</Button>

  if (error) {
    return (
      <>
        <PageHead title={t('sites.title')} subtitle={t('sites.subtitle')} action={addAction} />
        <AlertCard
          severity="critical"
          title={t('sites.loadFailedTitle')}
          desc={error}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setError(null); setReloadKey((k) => k + 1) }}>
              {t('common.retry')}
            </Button>
          )}
        />
      </>
    )
  }

  if (!sites) {
    return <PageHead title={t('sites.title')} subtitle={t('sites.subtitle')} action={addAction} />
  }

  return (
    <>
      <PageHead
        title={t('sites.title')}
        subtitle={t('sites.subtitle')}
        action={addAction}
      />

      {sites.length === 0 ? (
        <AlertCard
          severity="info"
          title={t('sites.empty.title')}
          desc={t('sites.empty.desc')}
          className="dwp-acc-alert"
          actions={addAction}
        />
      ) : (
        <div className="dwp-grid dwp-grid-3">
          {sites.map((s) => {
            const attn = s.status === 'warning' || s.status === 'critical'
            return (
              <div
                key={s.id}
                className="dwp-card"
                style={{
                  borderColor: attn ? 'var(--gd-warning-border)' : undefined,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 15,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 40, height: 40, borderRadius: 11, background: attn ? 'var(--gd-warning-bg)' : 'var(--gd-primary-subtle)', color: attn ? 'var(--gd-warning)' : 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <Icon name={siteIcon(s)} size={21} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>{s.title}</div>
                  </div>
                  <StatusPill status={s.status} size="sm" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px' }}>
                  {/* A dash where we have no measurement. This card used to show
                      "99.98%" uptime for sites nobody had ever monitored — the
                      most convincing lie in the product, because it is precise,
                      on the first screen, and pure decoration. */}
                  <Stat label={t(`${NS}.stat.uptime`)} value={s.uptime == null ? '—' : num(Number(s.uptime) / 100, { style: 'percent', maximumFractionDigits: 2 })} />
                  <Stat label={t(`${NS}.stat.updates`)} value={s.pendingUpdates == null ? '—' : digits(s.pendingUpdates)} color={s.pendingUpdates > 0 ? 'var(--gd-warning-text)' : undefined} />
                  <Stat label={t(`${NS}.stat.alerts`)} value={s.incidents == null ? '—' : digits(s.incidents)} color={s.incidents > 0 ? 'var(--gd-danger-text)' : undefined} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <AuthorityBadge level={s.authority} size="sm" />
                  <Button as={Link} to={`/site/${s.id}`} variant="secondary" size="sm" rightIcon="arrow-left">{t(`${NS}.openPanel`)}</Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
