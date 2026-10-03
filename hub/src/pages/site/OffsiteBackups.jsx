import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Input, IconButton, Badge, MetricCard, NotMeasured } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'
import { t, num, dateTime } from '../../lib/i18n.js'

export default function OffsiteBackups() {
  const { siteId, site } = useOutletContext()
  const [targets, setTargets] = useState(null)
  const [jobs, setJobs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const timer = useRef(null)

  const api = useMemo(() => siteApi(siteId), [siteId])

  async function loadTargets() {
    const data = await api.offsiteTargets()
    setTargets(data?.targets || [])
  }

  async function loadJobs() {
    const data = await api.offsiteJobs()
    setJobs(data?.jobs || [])
  }

  const hasActiveJob = (list) => (list || []).some((j) => j.status === 'queued' || j.status === 'running')

  // Re-check job status every 2.5s while something is queued/running, so the
  // history updates without a manual refresh. The reschedule goes through a
  // ref because the timer callback must reach the latest poll, and poll cannot
  // reference itself while it is being declared.
  const pollRef = useRef(null)
  const poll = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const data = await api.offsiteJobs()
        setJobs(data?.jobs || [])
        if (hasActiveJob(data?.jobs)) pollRef.current?.()
      } catch { /* ignore polling errors */ }
    }, 2500)
  }, [api])

  useEffect(() => { pollRef.current = poll }, [poll])

  useEffect(() => {
    let alive = true
    Promise.all([
      api.offsiteTargets().then((d) => alive && setTargets(d?.targets || [])),
      api.offsiteJobs().then((d) => {
        if (!alive) return
        const list = d?.jobs || []
        setJobs(list)
        // Arriving back on this page with a job still in flight must keep
        // updating — not freeze on the loaded snapshot.
        if (hasActiveJob(list)) poll()
      }),
    ])
      .catch((e) => alive && setError(e?.message || t('offsiteBackups.errors.load')))
      // The finally belongs here: in the reject path the .then above is
      // skipped, and without this the page stayed on the skeleton forever
      // with the error message rendered behind the early return.
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false; clearTimeout(timer.current) }
  }, [api, poll, attempt])

  // Failed first load with nothing read: an explicit error state with a
  // retry, not the "no targets added yet" empty state.
  function retryLoad() {
    setError('')
    setLoading(true)
    setAttempt((a) => a + 1)
  }

  function emptyForm() {
    return { endpoint: '', bucket: '', region: '', accessKeyId: '', secretAccessKey: '', pathPrefix: '', retentionDays: '30' }
  }

  function startEdit(target) {
    setEditingId(target.id)
    setForm({
      endpoint: target.endpoint || '',
      bucket: target.bucket || '',
      region: target.region || '',
      accessKeyId: target.accessKeyId || '',
      secretAccessKey: '',
      pathPrefix: target.pathPrefix || '',
      retentionDays: String(target.retentionDays || 30),
    })
    setShowForm(true)
  }

  async function saveTarget(e) {
    e.preventDefault()
    setBusy('save'); setError('')
    const body = {
      ...form,
      retentionDays: Number(form.retentionDays) || 30,
      ...(form.secretAccessKey ? { secretAccessKey: form.secretAccessKey } : {}),
    }
    try {
      if (editingId) {
        await api.updateOffsiteTarget(editingId, body)
      } else {
        await api.createOffsiteTarget(body)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await loadTargets()
    } catch (err) { setError(err?.message || t('offsiteBackups.errors.save')) } finally { setBusy('') }
  }

  async function removeTarget(id) {
    if (!window.confirm(t('offsiteBackups.confirmDelete'))) return
    setBusy(`del-${id}`); setError('')
    try {
      await api.deleteOffsiteTarget(id)
      await loadTargets()
      await loadJobs()
    } catch (err) { setError(err?.message || t('offsiteBackups.errors.delete')) } finally { setBusy('') }
  }

  async function runBackup(targetId) {
    if (site?.paired === false) {
      setError(t('offsiteBackups.notPaired'))
      return
    }
    setBusy(`run-${targetId}`); setError('')
    try {
      await api.runOffsiteBackup(targetId)
      await loadJobs()
      poll()
    } catch (err) { setError(err?.message || t('offsiteBackups.errors.start')) } finally { setBusy('') }
  }

  const head = (
    <PageHead
      title={t('offsiteBackups.head.title')}
      subtitle={t('offsiteBackups.head.subtitle')}
      action={(
        <Button variant="primary" size="sm" leftIcon="cloud" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}>
          {t('offsiteBackups.head.add')}
        </Button>
      )}
    />
  )

  if (loading) return head

  if (error && targets == null && jobs == null) {
    return (
      <>
        {head}
        <NotMeasured title={t('offsiteBackups.loadFailed')} reason={error} icon="alert-triangle" />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={retryLoad}>
            {t('common.retry')}
          </Button>
        </div>
      </>
    )
  }

  // paired is a real boolean once the shell's site list lands; site === null
  // only means it has not arrived yet. Treating null as "unpaired" showed a
  // paired site a false "not connected yet" notice during that window.
  const unavailable = site?.paired === false
    ? t('offsiteBackups.notPaired')
    : null

  const formCard = showForm && (
    <form
      onSubmit={saveTarget}
      style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 18, marginBottom: 22 }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{editingId ? t('offsiteBackups.form.editTitle') : t('offsiteBackups.form.newTitle')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Input label={t('offsiteBackups.form.endpoint')} required dir="ltr" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} hint={t('offsiteBackups.form.endpointHint')} />
        <Input label={t('offsiteBackups.form.bucket')} required value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} />
        <Input label={t('offsiteBackups.form.region')} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} hint={t('offsiteBackups.form.regionHint')} />
        <Input label={t('offsiteBackups.form.accessKey')} required value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} />
        <Input label={t('offsiteBackups.form.secretKey')} type="password" required={!editingId} value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} hint={editingId ? t('offsiteBackups.form.secretHint') : ''} />
        <Input label={t('offsiteBackups.form.pathPrefix')} value={form.pathPrefix} onChange={(e) => setForm({ ...form, pathPrefix: e.target.value })} hint={t('offsiteBackups.form.optional')} />
        <Input label={t('offsiteBackups.form.retention')} type="number" min={1} required value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button variant="primary" size="sm" loading={busy === 'save'} type="submit">{editingId ? t('offsiteBackups.form.update') : t('common.save')}</Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()) }}>{t('common.cancel')}</Button>
      </div>
    </form>
  )

  return (
    <>
      {head}

      {unavailable && (
        <NotMeasured title={t('offsiteBackups.head.title')} reason={unavailable} />
      )}

      {formCard}

      {/* Targets summary */}
      <div className="pbk-metrics">
        <MetricCard icon="cloud" iconTone="accent" label={t('offsiteBackups.metrics.targets')} value={num(targets?.length || 0)} hint={t('offsiteBackups.metrics.targetsHint')} />
        <MetricCard icon="check-circle-2" iconTone="success" label={t('offsiteBackups.metrics.lastSuccess')} value={lastSuccess(jobs)} hint={t('offsiteBackups.metrics.lastSuccessHint')} />
        <MetricCard icon="database" iconTone="primary" label={t('offsiteBackups.metrics.lastSize')} value={lastSuccessSize(jobs)} />
        <MetricCard icon="shield-check" iconTone="neutral" label={t('offsiteBackups.metrics.encryption')} value="AES-256-GCM" hint={t('offsiteBackups.metrics.encryptionHint')} />
      </div>

      {/* Targets table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t('offsiteBackups.targets.title')}</div>
      <div className="pbk-panel" style={{ marginBottom: 24 }}>
        <div className="pbk-trow pbk-trow--head pbk-cols-target">
          <span>{t('offsiteBackups.targets.colEndpoint')}</span>
          <span>{t('offsiteBackups.targets.colRegion')}</span>
          <span>{t('offsiteBackups.targets.colPath')}</span>
          <span>{t('offsiteBackups.targets.colRetention')}</span>
          <span>{t('offsiteBackups.targets.colStatus')}</span>
          <span />
        </div>
        {targets?.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13 }}>
            {t('offsiteBackups.targets.empty')}
          </div>
        )}
        {targets?.map((target) => (
          <div
            key={target.id}
            className="pbk-trow pbk-trow--body pbk-cols-target"
          >
            <span style={{ minWidth: 0 }}>
              <div className="dwp-mono" style={{ fontWeight: 600 }}>{target.endpoint}</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>{target.bucket}</div>
            </span>
            <span style={{ color: 'var(--gd-text-secondary)' }}>{target.region || '—'}</span>
            <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>{target.pathPrefix || '/'}</span>
            <span>{t('offsiteBackups.targets.days', { count: Number(target.retentionDays) || 0 })}</span>
            <span><Badge variant="neutral" appearance="soft">{t('offsiteBackups.targets.configured')}</Badge></span>
            <span className="pbk-actions pbk-actions--start">
              <Button variant="secondary" size="sm" leftIcon="play" disabled={busy === `run-${target.id}` || site?.paired === false} onClick={() => runBackup(target.id)}>
                {busy === `run-${target.id}` ? t('offsiteBackups.targets.starting') : t('offsiteBackups.targets.run')}
              </Button>
              <Button variant="ghost" size="sm" leftIcon="settings" onClick={() => startEdit(target)}>{t('common.edit')}</Button>
              <IconButton icon="trash-2" label={t('common.delete')} size="sm" disabled={busy === `del-${target.id}`} onClick={() => removeTarget(target.id)} />
            </span>
          </div>
        ))}
      </div>

      {/* Jobs table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t('offsiteBackups.jobs.title')}</div>
      <div className="pbk-panel">
        <div className="pbk-trow pbk-trow--head pbk-cols-jobs">
          <span>{t('offsiteBackups.jobs.colTime')}</span>
          <span>{t('offsiteBackups.jobs.colTarget')}</span>
          <span>{t('offsiteBackups.jobs.colSize')}</span>
          <span>{t('offsiteBackups.jobs.colStatus')}</span>
          <span>{t('offsiteBackups.jobs.colMessage')}</span>
        </div>
        {jobs?.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13 }}>
            {t('offsiteBackups.jobs.empty')}
          </div>
        )}
        {jobs?.map((j) => (
          <div
            key={j.id}
            className="pbk-trow pbk-trow--body pbk-cols-jobs"
          >
            <span style={{ color: 'var(--gd-text-secondary)' }}>{j.createdAt ? dateTime(j.createdAt) : '—'}</span>
            <span className="dwp-mono" style={{ color: 'var(--gd-text-muted)' }}>{targetLabel(targets, j.targetId)}</span>
            <span className="dwp-mono">{j.sizeBytes != null ? humanBytes(j.sizeBytes) : '—'}</span>
            <span><Badge variant={jobTone(j.status)} appearance="soft">{jobLabel(j.status)}</Badge></span>
            <span style={{ color: 'var(--gd-text-muted)', fontSize: 12 }}>{j.error || '—'}</span>
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

function lastSuccess(jobs) {
  const j = (jobs || []).find((x) => x.status === 'done')
  return j && j.completedAt ? dateTime(j.completedAt) : '—'
}

// Human-readable target for the history rows: the bucket name while the
// target exists, otherwise the id suffix of a since-deleted target.
function targetLabel(targets, targetId) {
  const target = (targets || []).find((x) => x.id === targetId)
  return target?.bucket || (targetId ? String(targetId).slice(-8) : '—')
}

function lastSuccessSize(jobs) {
  const j = (jobs || []).find((x) => x.status === 'done')
  return j && j.sizeBytes != null ? humanBytes(j.sizeBytes) : '—'
}

function jobTone(status) {
  if (status === 'done') return 'success'
  if (status === 'failed') return 'danger'
  return 'info'
}

function jobLabel(status) {
  if (['queued', 'running', 'done', 'failed'].includes(status)) return t(`offsiteBackups.jobs.${status}`)
  return status
}

function humanBytes(n) {
  if (n == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = Number(n)
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}
