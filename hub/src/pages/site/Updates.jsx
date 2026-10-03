import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, AuthorityBadge, NotMeasured, SkeletonStats, SkeletonTable } from '../../components/index.js'
import { t, digits } from '../../lib/i18n.js'
import Trans from '../../components/Trans.jsx'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'

const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' }

// Names must exist in the generated map (src/lib/icon-map.js). The old names
// ('layout-template', 'shopping-cart', 'box') are not in it, so every plugin
// row fell back to an empty Circle.
const ITEM_ICON = {
  Elementor: 'layout-grid',
  WooCommerce: 'credit-card',
  'Yoast SEO': 'search',
  'WordPress Core': 'boxes',
}
// The machine kind of a queue row. Rows carry `kind` for plugins/themes;
// the core row has none and is identified by its id ('core') — never by the
// display label in `type`, which the server localises.
const kindOf = (u) =>
  u.kind || (u.id === 'core' || u.name === 'WordPress Core' ? 'core' : 'plugin')

const iconFor = (u) => {
  const kind = kindOf(u)
  return ITEM_ICON[u.name] || (kind === 'core' ? 'boxes' : kind === 'theme' ? 'palette' : 'plug')
}

const statusFor = (u) =>
  u.authority === 'auto'
    ? { icon: 'zap', color: 'var(--gd-success)', label: t('updates.status.auto') }
    : { icon: 'user-check', color: 'var(--gd-warning)', label: t('updates.status.confirm') }

// What runUpdates needs per item: the machine kind ('plugin'/'theme'/'core')
// and the file slug, not the queue row's display label. Core is matched by id
// on the server (server/src/routes/sites.js). One shared mapper — the batch
// button used to post the raw rows and the server's kind/name matching never
// matched.
const runItem = (u) => ({
  type: kindOf(u),
  name: u.file || u.name,
})

export default function Updates() {
  const { siteId } = useOutletContext()
  const { startTask, activeTask } = useTask()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const aliveRef = useRef(true)

  const load = useCallback(() => {
    setLoading(true)
    return siteApi(siteId)
      .updates()
      .then((d) => { if (aliveRef.current) setData(d) })
      .catch((e) => { if (aliveRef.current) setError(e?.message || t('updates.errors.load')) })
      .finally(() => { if (aliveRef.current) setLoading(false) })
  }, [siteId])

  useEffect(() => {
    aliveRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    return () => { aliveRef.current = false }
  }, [load])

  async function apply(items) {
    const itemName = !items?.length
      ? t('updates.itemAll')
      : items.length > 1 ? t('updates.itemLowRisk', { count: items.length }) : items[0].name
    setBusy(itemName)
    setError('')
    try {
      const res = await siteApi(siteId).runUpdates(items)
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: t('updates.task', { item: itemName }),
          type: 'update',
        })
      }
      load()
    } catch (e) {
      setError(e?.message || t('updates.errors.run'))
    } finally {
      setBusy('')
    }
  }

  const head = (
    <PageHead
      title={t('updates.head.title')}
      subtitle={t('updates.head.subtitle')}
      action={(
        <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={load} disabled={loading}>
          {t('updates.head.recheck')}
        </Button>
      )}
    />
  )

  if (loading && !data && !error) {
    return (
      <>
        {head}
        <SkeletonStats count={3} />
        <div style={{ marginTop: 24 }}>
          <SkeletonTable rows={4} cols={5} />
        </div>
      </>
    )
  }

  if (!data) {
    // A failed load used to fall through to an empty queue, which the page
    // then announced as "all plugins and core are up to date". Nothing was
    // measured; the view says so instead of claiming an all-clear.
    return (
      <>
        {head}
        <NotMeasured title={t('updates.loadFailed.title')} reason={error || t('updates.loadFailed.noResponse')} icon="alert-triangle" />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={loading} onClick={load}>
            {t('common.retry')}
          </Button>
        </div>
      </>
    )
  }

  if (data.provenance?.unavailable) {
    // Same contract as Backups: an unpaired site or LIVE=0 has nothing to
    // measure, so the view says why instead of rendering zero cards.
    return (
      <>
        {head}
        <NotMeasured title={t('updates.unavailableTitle')} reason={data.provenance.unavailable} />
      </>
    )
  }

  const { queue = [], done = [] } = data
  // The live read itself failed (update_status error): the queue below is the
  // empty seed, not a measured zero, so the page must not present it as one.
  const updatesFailed = Boolean(data.updatesError)
  const autoCount = queue.filter((u) => u.authority === 'auto').length
  const confirmCount = queue.filter((u) => u.authority === 'confirm').length
  // Only a confirm-authority item belongs in the "needs your approval —
  // sensitive action" card. The old `|| queue[0]` promoted the first auto item into that
  // card with a confirm badge — a false claim for patch updates the server
  // marks auto (server/src/live.js:128-139). With no confirm item the card
  // does not render; auto items stay in the queue table with their honest
  // "ready to run automatically" status.
  const featured = queue.find((u) => u.authority === 'confirm')
  const rows = queue.filter((u) => u.id !== (featured && featured.id))
  // "Update all" used to post without items, and the site then queued
  // every pending change — including the high-risk confirm items the featured
  // card says always need approval. The batch is the low-risk/auto items only.
  const autoItems = queue.filter((u) => u.authority === 'auto')

  const stats = [
    { icon: 'list-checks', value: queue.length, label: t('updates.stats.queue'), bg: 'var(--gd-bg-inset)', color: 'var(--gd-text-secondary)' },
    { icon: 'zap', value: autoCount, label: t('updates.stats.auto'), bg: 'var(--gd-success-bg)', color: 'var(--gd-success)' },
    { icon: 'user-check', value: confirmCount, label: t('updates.stats.confirm'), bg: 'var(--gd-warning-bg)', color: 'var(--gd-warning)' },
  ]

  const featuredChecklist = featured && [
    { icon: 'info', color: 'var(--gd-text-muted)', text: t('updates.checklist.risk') },
    { icon: 'database-backup', color: 'var(--gd-text-secondary)', text: t('updates.checklist.snapshot') },
    { icon: 'shield-check', color: 'var(--gd-primary)', text: t('updates.checklist.tested') },
    ...(featured.note ? [{ icon: 'alert-triangle', color: 'var(--gd-warning)', text: featured.note }] : []),
  ]

  return (
    <>
      {head}

      {updatesFailed && (
        <div className="psa-err" role="alert">
          <Icon name="alert-triangle" size={17} style={{ flex: '0 0 auto', marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            {data.updatesError ? t('updates.readFailedWith', { error: data.updatesError }) : t('updates.readFailed')}
            {' '}{t('updates.readFailedNote')}
          </div>
        </div>
      )}

      {/* Summary stat cards — hidden when the read failed: zero cards there
          would be a measured-looking claim about data nobody read. */}
      {!updatesFailed && (
      <div className="psa-stats">
        {stats.map((s) => (
          <div key={s.icon} className="psa-stat">
            <span style={{ width: 40, height: 40, borderRadius: 11, background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name={s.icon} size={21} />
            </span>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{digits(s.value)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Needs-approval decision card */}
      {featured && (
        <div style={{ borderRadius: 'var(--gd-radius-xl)', border: '1px solid var(--gd-warning-border)', background: 'var(--gd-bg-surface)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 20px', background: 'var(--gd-warning-bg)', borderBottom: '1px solid var(--gd-warning-border)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-warning)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="user-check" size={19} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gd-warning-text)' }}>{t('updates.featured.title')}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-warning-text)', opacity: 0.85, marginTop: 1 }}>{t('updates.featured.subtitle')}</div>
            </div>
            <AuthorityBadge level="confirm" />
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name={iconFor(featured)} size={23} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{t('updates.featured.itemTitle', { type: t(`updates.kind.${kindOf(featured)}`), name: featured.name })}</div>
                <div style={{ fontSize: 13, color: 'var(--gd-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {t('updates.featured.current')} <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{digits(featured.from)}</span>
                  <Icon name="arrow-left" size={13} />
                  {t('updates.featured.next')} <span style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)', fontWeight: 700 }}>{digits(featured.to)}</span>
                </div>
              </div>
              <Badge variant={RISK_VARIANT[featured.risk]} appearance="soft" icon="gauge">{featured.riskLabel}</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 24px', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 16 }}>
              {featuredChecklist.map((c, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Icon name={c.icon} size={16} style={{ color: c.color, flex: '0 0 auto' }} /> {c.text}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <Button
                variant="primary" size="md" leftIcon="check"
                disabled={Boolean(busy) || activeTask?.state === 'running'}
                onClick={() => apply([runItem(featured)])}
              >
                {t('updates.featured.approve')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Update queue */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {updatesFailed ? t('updates.queue.title') : t('updates.queue.titleCount', { count: queue.length })}
        </div>
        {/* Runs only the low-risk (auto-authority) items, and only when there
            are some — the old button posted with no items and the site queued
            every pending change, including the confirm-risk ones the featured
            card promises will always ask first. */}
        {!updatesFailed && autoItems.length > 0 && (
          <Button
            size="sm"
            variant="subtle"
            leftIcon="refresh-cw"
            disabled={Boolean(busy) || activeTask?.state === 'running'}
            onClick={() => apply(autoItems.map(runItem))}
          >
            {t('updates.queue.runLowRisk', { count: autoItems.length })}
          </Button>
        )}
      </div>

      <div className="psa-queue">
        <div className="psa-queue__row psa-queue__row--head">
          <span>{t('updates.queue.colItem')}</span>
          <span>{t('updates.queue.colVersion')}</span>
          <span>{t('updates.queue.colRisk')}</span>
          <span>{t('updates.queue.colStatus')}</span>
          <span />
        </div>
        {rows.length === 0 && !featured ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13.5 }}>
            {updatesFailed
              ? t('updates.queue.emptyFailed')
              : t('updates.queue.empty')}
          </div>
        ) : rows.map((u) => {
          const st = statusFor(u)
          return (
            <div key={u.id} className="psa-queue__row psa-queue__row--body">
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon name={iconFor(u)} size={17} style={{ color: 'var(--gd-text-secondary)', flex: '0 0 auto' }} /> {u.name}
              </span>
              <span style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text-secondary)' }}>{t('updates.queue.versionChange', { from: digits(u.from), to: digits(u.to) })}</span>
              <span>
                <Badge variant={RISK_VARIANT[u.risk]} appearance="soft" dot>{u.riskLabel}</Badge>
              </span>
              <span style={{ color: 'var(--gd-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name={st.icon} size={14} style={{ color: st.color, flex: '0 0 auto' }} /> {st.label}
              </span>
              <Button
                variant="ghost" size="sm"
                disabled={Boolean(busy) || activeTask?.state === 'running'}
                onClick={() => apply([runItem(u)])}
              >
                {t('updates.queue.run')}
              </Button>
            </div>
          )
        })}
      </div>

      {/* Completed updates */}
      <div style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 12px' }}>{t('updates.done.title')}</div>
      <div className="psa-card">
        {done.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13 }}>
            {t('updates.done.empty')}
          </div>
        ) : done.map((d, i) => (
          <div key={d.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: i < done.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-success-bg)', color: 'var(--gd-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="check" size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span><Trans k="updates.done.toVersion" vars={{ version: digits(d.to) }} components={{ mono: (c) => <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{c}</span> }} /></span>
                <span>·</span>
                <span>{d.when}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px', marginTop: 16 }}>
          {error}
        </p>
      )}
    </>
  )
}
