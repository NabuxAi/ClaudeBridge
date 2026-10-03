import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, MetricCard, Badge, Switch, NotMeasured, SkeletonStats, SkeletonTable, Dialog } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'
import { t, digits, num, dateTime } from '../../lib/i18n.js'
import Trans from '../../components/Trans.jsx'

export default function Backups() {
  const { siteId } = useOutletContext()
  const { startTask, activeTask } = useTask()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Policy state
  const [policy, setPolicy] = useState({
    destination: 'local',
    maxDaily: 5,
    retentionDays: 30,
    maxStorageMb: 2048,
    autoPruneOnFull: true,
  })
  const [backupsToday, setBackupsToday] = useState(0)
  const [policyModal, setPolicyModal] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

  // Preflight and section selection modal
  const [preflightModal, setPreflightModal] = useState(false)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preflightData, setPreflightData] = useState(null)
  const [selectedSections, setSelectedSections] = useState({
    db: true,
    plugins: false,
    themes: false,
    uploads: false,
  })

  // Restore confirmation modal
  const [confirming, setConfirming] = useState(null)
  const [typed, setTyped] = useState('')

  // Off-site S3 Cloud Backups
  const [offsiteTargets, setOffsiteTargets] = useState([])
  const [offsiteJobs, setOffsiteJobs] = useState([])
  const [targetModal, setTargetModal] = useState(false)
  const [newTarget, setNewTarget] = useState({
    type: 's3',
    endpoint: '',
    bucket: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: '',
    pathPrefix: 'backups',
    retentionDays: 30,
  })

  const aliveRef = useRef(true)

  const loadPolicy = useCallback(() => {
    siteApi(siteId)
      .backupPolicy()
      .then((res) => {
        if (!aliveRef.current) return
        if (res?.policy) {
          setPolicy({
            destination: res.policy.destination || 'local',
            maxDaily: Number(res.policy.maxDaily || res.policy.max_daily_backups) || 5,
            retentionDays: Number(res.policy.retentionDays || res.policy.retention_days) || 30,
            maxStorageMb: Number(res.policy.maxStorageMb || res.policy.max_storage_mb) || 2048,
            autoPruneOnFull: res.policy.autoPruneOnFull ?? res.policy.auto_prune_on_full ?? true,
          })
        }
        if (res?.live?.backups_today != null) {
          setBackupsToday(Number(res.live.backups_today))
        }
      })
      .catch(() => {})
  }, [siteId])

  const loadOffsite = useCallback(() => {
    Promise.allSettled([
      siteApi(siteId).listOffsiteTargets(),
      siteApi(siteId).listOffsiteJobs(),
    ]).then(([tRes, jRes]) => {
      if (!aliveRef.current) return
      if (tRes.status === 'fulfilled') setOffsiteTargets(tRes.value?.targets || [])
      if (jRes.status === 'fulfilled') setOffsiteJobs(jRes.value?.jobs || [])
    })
  }, [siteId])

  const load = useCallback(() => {
    setLoading(true)
    return siteApi(siteId)
      .backups()
      .then((d) => {
        if (aliveRef.current) {
          setData(d)
          if (d?.list && Array.isArray(d.list)) {
            const todayStart = new Date().setHours(0, 0, 0, 0)
            const countToday = d.list.filter((b) => {
              const ts = b.created_at ? (b.created_at * 1000) : (b.timestamp || 0)
              return ts >= todayStart
            }).length
            setBackupsToday((prev) => (countToday > 0 ? countToday : prev))
          }
        }
      })
      .catch((e) => { if (aliveRef.current) setError(e?.message || t('backups.errors.loadList')) })
      .finally(() => { if (aliveRef.current) setLoading(false) })
  }, [siteId])

  useEffect(() => {
    aliveRef.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    loadPolicy()
    loadOffsite()
    return () => { aliveRef.current = false }
  }, [load, loadPolicy, loadOffsite])

  // Open preflight modal and calculate sizes
  const openPreflightModal = async () => {
    setPreflightModal(true)
    setPreflightLoading(true)
    setError('')
    setSuccessMsg('')
    try {
      const res = await siteApi(siteId).backupPreflight()
      setPreflightData(res)
    } catch (e) {
      setPreflightData(null)
      setError(e?.message || t('backups.errors.preflight'))
    } finally {
      setPreflightLoading(false)
    }
  }

  // Section catalogue for the picker. Sizes/durations come only from the
  // preflight measurement — when it has not run (or failed) we render "—",
  // never invented numbers.
  const sectionsInfo = preflightData?.sections || {
    db: { key: 'db', title: t('backups.sections.dbTitle'), description: t('backups.sections.dbDesc'), required: true },
    plugins: { key: 'plugins', title: t('backups.sections.pluginsTitle'), description: t('backups.sections.pluginsDesc') },
    themes: { key: 'themes', title: t('backups.sections.themesTitle'), description: t('backups.sections.themesDesc') },
    uploads: { key: 'uploads', title: t('backups.sections.uploadsTitle'), description: t('backups.sections.uploadsDesc') },
  }
  const sizesKnown = Boolean(preflightData?.sections)

  const selectedKeys = Object.keys(selectedSections).filter((k) => selectedSections[k])
  const totalSelectedBytes = selectedKeys.reduce((acc, k) => acc + (sectionsInfo[k]?.bytes || 0), 0)
  const totalSelectedDuration = Math.max(4, selectedKeys.reduce((acc, k) => acc + (sectionsInfo[k]?.duration_sec || 0), 0))

  const freeDiskKnown = preflightData?.free_disk_bytes != null
  const isSpaceInsufficient = freeDiskKnown
    && (preflightData.free_disk_bytes < (totalSelectedBytes * 1.2) || preflightData.free_disk_bytes < (50 * 1024 * 1024))

  async function takeBackup() {
    if (isSpaceInsufficient) return
    setBusy('run')
    setError('')
    setSuccessMsg('')
    setPreflightModal(false)

    try {
      // The connector only understands sections/files — there is no remote
      // destination parameter, backups always land in the site's protected
      // local directory.
      const res = await siteApi(siteId).runBackup({
        sections: selectedKeys,
        files: selectedKeys.length > 1,
      })
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: t('backups.task.backup'),
          type: 'backup',
        })
      }
      load()
      loadPolicy()
    } catch (e) {
      setError(e?.message || t('backups.errors.startBackup'))
    } finally {
      setBusy('')
    }
  }

  async function handleSavePolicy() {
    setSavingPolicy(true)
    setError('')
    setSuccessMsg('')
    try {
      await siteApi(siteId).setBackupPolicy(policy)
      setSuccessMsg(t('backups.success.policySaved'))
      setPolicyModal(false)
      loadPolicy()
    } catch (e) {
      setError(e?.message || t('backups.errors.savePolicy'))
    } finally {
      setSavingPolicy(false)
    }
  }

  async function handleManualPrune() {
    if (!window.confirm(t('backups.confirm.prune'))) return
    setBusy('pruning')
    setError('')
    setSuccessMsg('')
    try {
      const res = await siteApi(siteId).pruneBackups({
        keep: 10,
        days: policy.retentionDays,
        max_mb: policy.maxStorageMb,
      })
      const freedMb = res?.freed_bytes ? (res.freed_bytes / (1024 * 1024)).toFixed(1) : '0'
      setSuccessMsg(t('backups.success.pruned', { count: Number(res?.pruned) || 0, mb: digits(freedMb) }))
      load()
      loadPolicy()
    } catch (e) {
      setError(e?.message || t('backups.errors.prune'))
    } finally {
      setBusy('')
    }
  }

  async function doRestore(id) {
    setBusy(id)
    setError('')
    setSuccessMsg('')
    setConfirming(null)
    setTyped('')
    try {
      const res = await siteApi(siteId).restoreBackup(id, { confirm: true })
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: t('backups.task.restore', { id }),
          type: 'restore',
        })
      }
      load()
    } catch (e) {
      setError(e?.message || t('backups.errors.restore'))
    } finally {
      setBusy('')
    }
  }

  async function download(id, what = 'db') {
    setBusy(`dl-${id}`)
    setError('')
    setSuccessMsg('')
    try {
      const r = await siteApi(siteId).downloadBackup(id, what)
      if (r && r.ok === false && r.message) setError(r.message)
    } catch (e) {
      setError(e?.message || t('backups.errors.download'))
    } finally {
      setBusy('')
    }
  }

  async function saveTarget() {
    setBusy('saving-target')
    setError('')
    try {
      await siteApi(siteId).createOffsiteTarget(newTarget)
      setTargetModal(false)
      loadOffsite()
    } catch (e) {
      setError(e?.message || t('backups.errors.saveTarget'))
    } finally {
      setBusy('')
    }
  }

  async function deleteTarget(targetId) {
    if (!window.confirm(t('backups.confirm.deleteTarget'))) return
    setBusy(`del-${targetId}`)
    setError('')
    try {
      await siteApi(siteId).deleteOffsiteTarget(targetId)
      loadOffsite()
    } catch (e) {
      setError(e?.message || t('backups.errors.deleteTarget'))
    } finally {
      setBusy('')
    }
  }

  async function syncOffsiteNow(targetId) {
    setBusy('offsite-sync')
    setError('')
    try {
      const res = await siteApi(siteId).syncOffsite({ targetId })
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: t('backups.task.sync'),
          type: 'backup',
        })
      }
      loadOffsite()
    } catch (e) {
      setError(e?.message || t('backups.errors.sync'))
    } finally {
      setBusy('')
    }
  }

  const head = (
    <PageHead
      title={t('backups.head.title')}
      subtitle={t('backups.head.subtitle')}
      action={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="subtle"
            size="sm"
            leftIcon="settings"
            onClick={() => setPolicyModal(true)}
          >
            {t('backups.head.policyButton')}
          </Button>
          <Button
            variant="subtle"
            size="sm"
            leftIcon="trash-2"
            disabled={busy === 'pruning'}
            onClick={handleManualPrune}
          >
            {busy === 'pruning' ? t('backups.head.pruning') : t('backups.head.prune')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon="database-backup"
            disabled={Boolean(busy) || activeTask?.state === 'running'}
            onClick={openPreflightModal}
          >
            {t('backups.head.takeBackup')}
          </Button>
        </div>
      )}
    />
  )

  if (loading && !data && !error) {
    return (
      <>
        {head}
        <SkeletonStats count={4} />
        <div style={{ marginTop: 24 }}>
          <SkeletonTable rows={4} cols={6} />
        </div>
      </>
    )
  }

  if (data?.provenance?.unavailable) {
    return (
      <>
        {head}
        <NotMeasured title={t('backups.head.title')} reason={data.provenance.unavailable} />
      </>
    )
  }

  if (!data) {
    // A failed list load must not fall through to the "no backups stored"
    // empty state — that would turn a broken read into the claim that no
    // backup was ever taken.
    return (
      <>
        {head}
        <NotMeasured title={t('backups.loadFailed.title')} reason={error || t('backups.loadFailed.noResponse')} icon="alert-triangle" />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={loading} onClick={load}>
            {t('common.retry')}
          </Button>
        </div>
      </>
    )
  }

  const list = data?.list || []
  // Newest entry first — the server (and the mock) both order it this way.
  const latest = list[0]
  const confirmWord = t('backups.restore.confirmWord')

  return (
    <>
      {head}

      {/* Summary metrics */}
      <div className="pbk-metrics">
        {/* The newest entry is list[0] — the same record the server derives
            data.lastBackup from (server/src/routes/sites.js:292) — so its
            verified flag is the only honest source for this card's claim.
            "Verified and healthy" was previously hardcoded, even for "none recorded". */}
        <MetricCard
          icon="clock"
          iconTone={latest ? (latest.verified ? 'success' : 'danger') : 'neutral'}
          label={t('backups.metrics.lastBackup')}
          value={data?.lastBackup || t('backups.metrics.notRecorded')}
          hint={latest ? (latest.verified ? t('backups.metrics.verified') : t('backups.metrics.unverified')) : t('backups.metrics.noneYet')}
        />
        <MetricCard
          icon="hard-drive"
          iconTone="primary"
          label={t('backups.metrics.location')}
          value={t('backups.metrics.locationValue')}
          hint={t('backups.metrics.retentionHint', { count: policy.retentionDays })}
        />
        <MetricCard
          icon="history"
          iconTone="neutral"
          label={t('backups.metrics.today')}
          value={t('backups.metrics.todayValue', { done: backupsToday, max: policy.maxDaily })}
          hint={backupsToday >= policy.maxDaily ? t('backups.metrics.dailyFull') : t('backups.metrics.dailyOk')}
        />
        <MetricCard
          icon="database"
          iconTone="accent"
          label={t('backups.metrics.freeDisk')}
          value={preflightData?.free_disk_formatted || '—'}
          hint={preflightData?.free_disk_formatted ? t('backups.metrics.quotaHint', { mb: digits(policy.maxStorageMb) }) : t('backups.metrics.diskUnchecked')}
        />
      </div>

      {/* Notifications / Alerts */}
      {successMsg && (
        <div className="pbk-note pbk-note--success">{successMsg}</div>
      )}
      {error && (
        <div className="pbk-note pbk-note--danger">{error}</div>
      )}

      {/* Schedule & Retention Quick Banner */}
      <div className="pbk-banner">
        <span className="pbk-banner__icon">
          <Icon name="calendar-clock" size={21} />
        </span>
        <div className="pbk-banner__grow">
          <div style={{ fontSize: 14, fontWeight: 700 }}>{t('backups.banner.title')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>
            {t('backups.banner.body', { days: digits(policy.retentionDays), mb: digits(policy.maxStorageMb) })}
          </div>
        </div>
        <Button size="sm" variant="subtle" onClick={() => setPolicyModal(true)}>
          {t('backups.banner.change')}
        </Button>
      </div>

      {/* Backups table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{t('backups.list.title')}</span>
        <span style={{ fontSize: 12, color: 'var(--gd-text-muted)', fontWeight: 400 }}>
          {t('backups.list.count', { count: list.length })}
        </span>
      </div>

      <div className="pbk-panel">
        <div className="pbk-trow pbk-trow--head pbk-cols-backups">
          <span>{t('backups.list.colDate')}</span>
          <span>{t('backups.list.colType')}</span>
          <span>{t('backups.list.colLocation')}</span>
          <span>{t('backups.list.colSize')}</span>
          <span>{t('backups.list.colHealth')}</span>
          <span />
        </div>

        {list.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13.5 }}>
            {t('backups.list.empty')}
          </div>
        ) : list.map((b, i) => {
          // Matched on the machine label only — never on the display text,
          // which the server localises.
          const preAction = /pre-update/.test(`${b.label || ''} ${b.type || ''}`)
          // The server (and the mock) only send `verified` — the dump ends the
          // way a complete dump ends — and a boolean `files` for the ZIP part.
          const isFilesZip = Boolean(b.files)
          return (
            <div key={b.id || i} className="pbk-trow pbk-trow--body pbk-cols-backups">
              <div>
                <div style={{ fontWeight: 600 }}>{b.date || b.when}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2 }} className="dwp-mono">{b.time || b.id}</div>
              </div>

              <span>
                <Badge variant={preAction ? 'warning' : 'info'} appearance="soft">{b.type || t('backups.list.typeManual')}</Badge>
              </span>

              <span>
                <Badge variant="neutral" appearance="soft">{t('backups.list.locationBadge')}</Badge>
              </span>

              <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>{b.size || '—'}</span>

              <span>
                <Badge variant={b.verified ? 'success' : 'danger'} appearance="soft" dot>
                  {b.verified ? t('backups.metrics.verified') : t('backups.metrics.unverified')}
                </Badge>
              </span>

              <div className="pbk-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon="download"
                  onClick={() => download(b.id, 'db')}
                  disabled={busy === `dl-${b.id}`}
                  title={t('backups.list.downloadSqlTitle')}
                >
                  {busy === `dl-${b.id}` ? t('backups.list.downloading') : t('backups.list.downloadSql')}
                </Button>
                {isFilesZip && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon="boxes"
                    onClick={() => download(b.id, 'files')}
                    disabled={busy === `dl-${b.id}`}
                    title={t('backups.list.downloadZipTitle')}
                  >
                    {t('backups.list.downloadZip')}
                  </Button>
                )}
                <Button size="sm" variant="subtle" leftIcon="rotate-ccw" onClick={() => setConfirming(b.id)} disabled={Boolean(busy) || activeTask?.state === 'running'}>
                  {t('backups.list.restore')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Policy & Storage Settings Modal */}
      {policyModal && (
        <Dialog
          title={t('backups.policy.title')}
          open={policyModal}
          onClose={() => setPolicyModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Storage location is a fixed fact, not a choice: the connector
                always writes to its protected local directory. Off-site copy
                is the S3 section below. */}
            <div className="pbk-note pbk-note--info pbk-note--flat">
              <Trans k="backups.policy.info" />
            </div>

            {/* Daily limit */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                {t('backups.policy.dailyLabel')}
              </label>
              <select
                value={policy.maxDaily}
                onChange={(e) => setPolicy({ ...policy, maxDaily: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', fontSize: 13 }}
              >
                {[1, 2, 3, 5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {t(n === 5 ? 'backups.policy.dailyOptionDefault' : 'backups.policy.dailyOption', { count: n })}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', display: 'block', marginTop: 4 }}>
                {t('backups.policy.dailyHint')}
              </span>
            </div>

            {/* Retention Days */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                {t('backups.policy.retentionLabel')}
              </label>
              <select
                value={policy.retentionDays}
                onChange={(e) => setPolicy({ ...policy, retentionDays: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', fontSize: 13 }}
              >
                {[7, 14, 30, 60, 90, 180].map((n) => (
                  <option key={n} value={n}>{t(`backups.policy.retention.d${n}`)}</option>
                ))}
              </select>
            </div>

            {/* Storage Quota & Auto Prune */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                {t('backups.policy.storageLabel')}
              </label>
              <select
                value={policy.maxStorageMb}
                onChange={(e) => setPolicy({ ...policy, maxStorageMb: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', fontSize: 13 }}
              >
                {[500, 1024, 2048, 5120, 10240].map((n) => (
                  <option key={n} value={n}>{t(`backups.policy.storage.mb${n}`)}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--gd-bg-subtle)', borderRadius: 'var(--gd-radius-md)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t('backups.policy.autoPruneTitle')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{t('backups.policy.autoPruneDesc')}</div>
              </div>
              <Switch
                checked={policy.autoPruneOnFull}
                onChange={(v) => setPolicy({ ...policy, autoPruneOnFull: v })}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="subtle" onClick={() => setPolicyModal(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                leftIcon="check"
                disabled={savingPolicy}
                onClick={handleSavePolicy}
              >
                {savingPolicy ? t('common.saving') : t('backups.policy.save')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Off-site S3 Storage Card & Section */}
      <div style={{ marginTop: 32, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--gd-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name="cloud" size={20} style={{ color: 'var(--gd-primary)' }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{t('backups.offsite.title')}</h3>
              <Badge variant="primary" appearance="soft">{t('backups.offsite.badge')}</Badge>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '4px 0 0 0' }}>
              {t('backups.offsite.desc')}
            </p>
          </div>
          <Button
            size="sm"
            variant="subtle"
            leftIcon="plus"
            onClick={() => setTargetModal(true)}
          >
            {t('backups.offsite.add')}
          </Button>
        </div>

        {offsiteTargets.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--gd-bg-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gd-text-muted)', marginBottom: 12 }}>
              <Icon name="cloud" size={22} />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gd-text)' }}>{t('backups.offsite.emptyTitle')}</div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', maxWidth: 440, margin: '6px auto 16px auto', lineHeight: 1.6 }}>
              {t('backups.offsite.emptyBody')}
            </p>
            <Button size="sm" variant="subtle" leftIcon="plus" onClick={() => setTargetModal(true)}>
              {t('backups.offsite.configure')}
            </Button>
          </div>
        ) : (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {offsiteTargets.map((target) => (
                <div
                  key={target.id}
                  style={{
                    border: '1px solid var(--gd-border)',
                    borderRadius: 'var(--gd-radius-lg)',
                    padding: '14px 16px',
                    background: 'var(--gd-bg-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--gd-text)' }} className="dwp-mono">
                        {target.bucket}
                      </span>
                      {/* The server sends no status field for targets — claiming
                          «فعال/غیرفعال» here would be invented. Only the type. */}
                      <Badge variant="neutral" appearance="soft">
                        {String(target.type || 's3').toUpperCase()}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginBottom: 4 }} className="dwp-mono">
                      {target.endpoint}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)' }}>
                      <Trans k="backups.offsite.targetMeta" vars={{ region: target.region || '—', count: Number(target.retentionDays) || 0 }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--gd-border-subtle)' }}>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon="trash-2"
                      onClick={() => deleteTarget(target.id)}
                      disabled={busy === `del-${target.id}`}
                    >
                      {t('common.delete')}
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      leftIcon="upload"
                      onClick={() => syncOffsiteNow(target.id)}
                      disabled={busy === 'offsite-sync' || activeTask?.state === 'running'}
                    >
                      {t('backups.offsite.syncNow')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Offsite Jobs History */}
            {offsiteJobs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--gd-text)' }}>
                  {t('backups.offsite.historyTitle')}
                </div>
                <div style={{ border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', overflow: 'hidden' }}>
                  {offsiteJobs.slice(0, 5).map((job, idx) => (
                    <div
                      key={job.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        fontSize: 12.5,
                        background: idx % 2 === 0 ? 'var(--gd-bg-surface)' : 'var(--gd-bg-subtle)',
                        borderBottom: idx < Math.min(offsiteJobs.length, 5) - 1 ? '1px solid var(--gd-border-subtle)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Badge
                          variant={job.status === 'done' ? 'success' : job.status === 'failed' ? 'danger' : 'info'}
                          appearance="soft"
                          dot
                        >
                          {job.status === 'done' ? t('backups.offsite.jobDone') : job.status === 'failed' ? t('backups.offsite.jobFailed') : t('backups.offsite.jobRunning')}
                        </Badge>
                        <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>
                          {dateTime(job.createdAt)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {job.sizeBytes && (
                          <span className="dwp-mono" style={{ color: 'var(--gd-text-muted)' }}>
                            {num(job.sizeBytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB
                          </span>
                        )}
                        {job.error && (
                          <span style={{ color: 'var(--gd-danger-text)', fontSize: 11.5 }}>
                            {job.error}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Off-site S3 Target Configuration Modal */}
      {targetModal && (
        <Dialog
          title={t('backups.target.title')}
          open={targetModal}
          onClose={() => setTargetModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.6 }}>
              {t('backups.target.intro')}
            </p>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.endpoint')}</label>
              <input
                type="text"
                placeholder={t('backups.target.endpointPlaceholder')}
                value={newTarget.endpoint}
                onChange={(e) => setNewTarget({ ...newTarget, endpoint: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.bucket')}</label>
                <input
                  type="text"
                  placeholder="my-wordpress-backups"
                  value={newTarget.bucket}
                  onChange={(e) => setNewTarget({ ...newTarget, bucket: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.region')}</label>
                <input
                  type="text"
                  placeholder={t('backups.target.regionPlaceholder')}
                  value={newTarget.region}
                  onChange={(e) => setNewTarget({ ...newTarget, region: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.accessKey')}</label>
              <input
                type="text"
                placeholder="AKIAIOSFODNN7EXAMPLE"
                value={newTarget.accessKeyId}
                onChange={(e) => setNewTarget({ ...newTarget, accessKeyId: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.secretKey')}</label>
              <input
                type="password"
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                value={newTarget.secretAccessKey}
                onChange={(e) => setNewTarget({ ...newTarget, secretAccessKey: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.pathPrefix')}</label>
                <input
                  type="text"
                  placeholder="backups/site1"
                  value={newTarget.pathPrefix}
                  onChange={(e) => setNewTarget({ ...newTarget, pathPrefix: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>{t('backups.target.retention')}</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={newTarget.retentionDays}
                  onChange={(e) => setNewTarget({ ...newTarget, retentionDays: Number(e.target.value) || 30 })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="subtle" onClick={() => setTargetModal(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                leftIcon="check"
                disabled={!newTarget.endpoint || !newTarget.bucket || !newTarget.accessKeyId || !newTarget.secretAccessKey || busy === 'saving-target'}
                onClick={saveTarget}
              >
                {t('backups.target.save')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Preflight & Section Selection Modal */}
      {preflightModal && (
        <Dialog
          title={t('backups.preflight.title')}
          open={preflightModal}
          onClose={() => setPreflightModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Host Disk Space Card */}
            <div style={{
              background: isSpaceInsufficient ? 'var(--gd-danger-bg)' : 'var(--gd-bg-subtle)',
              border: `1px solid ${isSpaceInsufficient ? 'var(--gd-danger-border)' : 'var(--gd-border)'}`,
              borderRadius: 'var(--gd-radius-lg)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isSpaceInsufficient ? 'var(--gd-danger-text)' : 'var(--gd-text)' }}>
                  {t('backups.preflight.freeDisk', { value: preflightData?.free_disk_formatted || (preflightLoading ? t('backups.preflight.calculating') : '—') })}
                </span>
                <Badge
                  variant={isSpaceInsufficient ? 'danger' : preflightLoading ? 'info' : freeDiskKnown ? 'success' : 'neutral'}
                  appearance="soft"
                >
                  {preflightLoading ? t('backups.preflight.checking') : isSpaceInsufficient ? t('backups.preflight.insufficient') : freeDiskKnown ? t('backups.preflight.sufficient') : t('backups.preflight.unchecked')}
                </Badge>
              </div>
              <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.6 }}>
                {isSpaceInsufficient
                  ? t('backups.preflight.msgInsufficient')
                  : freeDiskKnown
                    ? t('backups.preflight.msgOk')
                    : t('backups.preflight.msgUnchecked')}
              </p>
            </div>

            {/* Selectable Sections */}
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t('backups.preflight.sectionsTitle')}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.keys(sectionsInfo).map((key) => {
                const sec = sectionsInfo[key]
                const isSelected = Boolean(selectedSections[key])
                // A real <label> wrapping a wired checkbox: clicking anywhere
                // toggles it, and keyboard users can Space-toggle the focused
                // input (the div-onClick + dead-input pattern is gone).
                return (
                  <label
                    key={key}
                    className={['pbk-opt', isSelected && 'pbk-opt--selected', sec.required && 'pbk-opt--disabled'].filter(Boolean).join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="pbk-opt__input"
                      checked={isSelected}
                      disabled={sec.required}
                      onChange={() => {
                        if (!sec.required) setSelectedSections((prev) => ({ ...prev, [key]: !prev[key] }))
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: isSelected ? 'var(--gd-primary)' : 'var(--gd-text)' }}>
                        {sec.title}
                        {sec.required && <span style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginInlineStart: 6 }}>{t('backups.preflight.required')}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>{sec.description}</div>
                    </div>
                    <div style={{ textAlign: 'end', minWidth: 100 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--gd-font-mono)' }}>{sec.formatted || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--gd-text-muted)' }}>{sec.duration_sec != null ? t('backups.preflight.seconds', { s: digits(sec.duration_sec) }) : '—'}</div>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Total Estimate Bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: 'var(--gd-bg-inset)', borderRadius: 'var(--gd-radius-md)',
              border: '1px solid var(--gd-border)', marginTop: 4,
            }}>
              <div>
                <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)' }}>{t('backups.preflight.estSize')}</span>
                <strong style={{ fontSize: 14, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-primary)' }}>
                  {sizesKnown ? t('backups.preflight.megabytes', { mb: digits((totalSelectedBytes / (1024 * 1024)).toFixed(1)) }) : '—'}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)' }}>{t('backups.preflight.estDuration')}</span>
                <strong style={{ fontSize: 14, fontFamily: 'var(--gd-font-mono)' }}>{sizesKnown ? t('backups.preflight.seconds', { s: digits(totalSelectedDuration) }) : '—'}</strong>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="subtle" onClick={() => setPreflightModal(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                leftIcon="database-backup"
                disabled={isSpaceInsufficient || selectedKeys.length === 0 || preflightLoading}
                onClick={takeBackup}
              >
                {t('backups.preflight.start')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Restore Confirmation Dialog */}
      {confirming && (
        <Dialog
          title={t('backups.restore.title')}
          open={Boolean(confirming)}
          onClose={() => { setConfirming(null); setTyped('') }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger-border)', borderRadius: 'var(--gd-radius-md)', padding: '12px 14px', color: 'var(--gd-danger-text)', fontSize: 13, lineHeight: 1.7 }}>
              <Trans k="backups.restore.warning" />
            </div>
            <p style={{ fontSize: 13, color: 'var(--gd-text-secondary)', margin: 0 }}>
              <Trans k="backups.restore.prompt" vars={{ word: confirmWord }} />
            </p>
            <input
              type="text"
              placeholder={confirmWord}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="subtle" onClick={() => { setConfirming(null); setTyped('') }}>{t('common.cancel')}</Button>
              <Button variant="danger" disabled={typed.trim() !== confirmWord} onClick={() => doRestore(confirming)}>
                {t('backups.restore.confirm')}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
