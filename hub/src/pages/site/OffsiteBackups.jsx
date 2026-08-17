import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import { Button, Input, IconButton, Badge, MetricCard, NotMeasured } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

const TARGET_COLS = '1.4fr 1fr 0.8fr 1fr 0.7fr 1.3fr'
const JOB_COLS = '1fr 1.2fr 0.9fr 0.9fr 1fr'

export default function OffsiteBackups() {
  const { siteId, site } = useOutletContext()
  const [targets, setTargets] = useState(null)
  const [jobs, setJobs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
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

  useEffect(() => {
    let alive = true
    Promise.all([
      api.offsiteTargets().then((d) => alive && setTargets(d?.targets || [])),
      api.offsiteJobs().then((d) => alive && setJobs(d?.jobs || [])),
    ]).then(() => alive && setLoading(false)).catch((e) => alive && setError(e?.message || 'بارگذاری انجام نشد.'))
    return () => { alive = false; clearTimeout(timer.current) }
  }, [api])

  function poll() {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const data = await api.offsiteJobs()
        setJobs(data?.jobs || [])
        const active = (data?.jobs || []).some((j) => j.status === 'queued' || j.status === 'running')
        if (active) poll()
      } catch { /* ignore polling errors */ }
    }, 2500)
  }

  function emptyForm() {
    return { endpoint: '', bucket: '', region: '', accessKeyId: '', secretAccessKey: '', pathPrefix: '', retentionDays: '30' }
  }

  function startEdit(t) {
    setEditingId(t.id)
    setForm({
      endpoint: t.endpoint || '',
      bucket: t.bucket || '',
      region: t.region || '',
      accessKeyId: t.accessKeyId || '',
      secretAccessKey: '',
      pathPrefix: t.pathPrefix || '',
      retentionDays: String(t.retentionDays || 30),
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
    } catch (err) { setError(err?.message || 'ذخیره نشد.') } finally { setBusy('') }
  }

  async function removeTarget(id) {
    if (!window.confirm('این هدف و تاریخچهٔ بکاپ‌هایش حذف می‌شود. ادامه می‌دهید؟')) return
    setBusy(`del-${id}`); setError('')
    try {
      await api.deleteOffsiteTarget(id)
      await loadTargets()
      await loadJobs()
    } catch (err) { setError(err?.message || 'حذف نشد.') } finally { setBusy('') }
  }

  async function runBackup(targetId) {
    if (!site?.paired) {
      setError('سایت هنوز به سرور ما وصل نشده — افزونهٔ واسط را نصب و جفت کنید.')
      return
    }
    setBusy(`run-${targetId}`); setError('')
    try {
      await api.runOffsiteBackup(targetId)
      await loadJobs()
      poll()
    } catch (err) { setError(err?.message || 'شروع نشد.') } finally { setBusy('') }
  }

  const head = (
    <PageHead
      title="بکاپ خارجی"
      subtitle="ارسال رمزنگاری‌شدهٔ نسخه‌های پشتیبان به سرویس S3 سازگار"
      action={(
        <Button variant="primary" size="sm" leftIcon="cloud" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}>
          افزودن هدف
        </Button>
      )}
    />
  )

  if (loading) return head

  const unavailable = !site?.paired
    ? 'سایت هنوز به سرور ما وصل نشده — افزونهٔ واسط را نصب و جفت کنید.'
    : null

  const formCard = showForm && (
    <form
      onSubmit={saveTarget}
      style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 18, marginBottom: 22 }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>{editingId ? 'ویرایش هدف' : 'هدف بکاپ خارجی جدید'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Input label="نشانی S3" required value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} hint="مثلاً https://s3.example.com" />
        <Input label="نام باکت" required value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} />
        <Input label="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} hint="مثلاً us-east-1" />
        <Input label="Access Key ID" required value={form.accessKeyId} onChange={(e) => setForm({ ...form, accessKeyId: e.target.value })} />
        <Input label="Secret Access Key" type="password" required={!editingId} value={form.secretAccessKey} onChange={(e) => setForm({ ...form, secretAccessKey: e.target.value })} hint={editingId ? 'خالی بگذارید تا تغییر نکند' : ''} />
        <Input label="پیشوند مسیر (path prefix)" value={form.pathPrefix} onChange={(e) => setForm({ ...form, pathPrefix: e.target.value })} hint="اختیاری" />
        <Input label="دوره نگهداری (روز)" type="number" min={1} required value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button variant="primary" size="sm" loading={busy === 'save'} type="submit">{editingId ? 'به‌روزرسانی' : 'ذخیره'}</Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()) }}>انصراف</Button>
      </div>
    </form>
  )

  return (
    <>
      {head}

      {unavailable && (
        <NotMeasured title="بکاپ خارجی" reason={unavailable} />
      )}

      {formCard}

      {/* Targets summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <MetricCard icon="cloud" iconTone="accent" label="اهداف فعال" value={String(targets?.length || 0)} hint="S3-compatible" />
        <MetricCard icon="check-circle-2" iconTone="success" label="آخرین بکاپ موفق" value={lastSuccess(jobs)} hint="براساس تاریخچه" />
        <MetricCard icon="database" iconTone="primary" label="حجم آخرین بکاپ" value={lastSuccessSize(jobs)} hint="بایت" />
        <MetricCard icon="shield-check" iconTone="neutral" label="رمزنگاری" value="AES-256-GCM" hint="در حالت استراحت" />
      </div>

      {/* Targets table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>اهداف ذخیره‌سازی</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: TARGET_COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>نشانی / باکت</span>
          <span>Region</span>
          <span>مسیر</span>
          <span>نگهداری</span>
          <span>وضعیت</span>
          <span />
        </div>
        {targets?.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13 }}>
            هنوز هدفی افزوده نشده.
          </div>
        )}
        {targets?.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: 'grid', gridTemplateColumns: TARGET_COLS, gap: 12, alignItems: 'center',
              padding: '13px 20px', fontSize: 13.5,
              borderBottom: i < targets.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none',
            }}
          >
            <span style={{ minWidth: 0 }}>
              <div className="dwp-mono" style={{ fontWeight: 600 }}>{t.endpoint}</div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>{t.bucket}</div>
            </span>
            <span style={{ color: 'var(--gd-text-secondary)' }}>{t.region || '—'}</span>
            <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>{t.pathPrefix || '/'}</span>
            <span>{t.retentionDays} روز</span>
            <span><Badge variant="success" appearance="soft">فعال</Badge></span>
            <span style={{ display: 'flex', gap: 7, justifyContent: 'flex-start' }}>
              <Button variant="secondary" size="sm" leftIcon="play" disabled={busy === `run-${t.id}` || !site?.paired} onClick={() => runBackup(t.id)}>
                {busy === `run-${t.id}` ? 'در حال شروع…' : 'بکاپ بگیر'}
              </Button>
              <Button variant="ghost" size="sm" leftIcon="pencil" onClick={() => startEdit(t)}>ویرایش</Button>
              <IconButton icon="trash-2" label="حذف" size="sm" disabled={busy === `del-${t.id}`} onClick={() => removeTarget(t.id)} />
            </span>
          </div>
        ))}
      </div>

      {/* Jobs table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>تاریخچهٔ ارسال</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: JOB_COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>زمان</span>
          <span>هدف</span>
          <span>حجم</span>
          <span>وضعیت</span>
          <span>پیام</span>
        </div>
        {jobs?.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13 }}>
            هنوز هیچ بکاپ خارجی ارسال نشده.
          </div>
        )}
        {jobs?.map((j, i) => (
          <div
            key={j.id}
            style={{
              display: 'grid', gridTemplateColumns: JOB_COLS, gap: 12, alignItems: 'center',
              padding: '13px 20px', fontSize: 13.5,
              borderBottom: i < jobs.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none',
            }}
          >
            <span style={{ color: 'var(--gd-text-secondary)' }}>{j.createdAt ? new Date(j.createdAt).toLocaleString('fa-IR') : '—'}</span>
            <span className="dwp-mono" style={{ color: 'var(--gd-text-muted)' }}>{j.targetId.slice(-8)}</span>
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
  return j && j.completedAt ? new Date(j.completedAt).toLocaleString('fa-IR') : '—'
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
  if (status === 'queued') return 'در صف'
  if (status === 'running') return 'در حال اجرا'
  if (status === 'done') return 'موفق'
  if (status === 'failed') return 'ناموفق'
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
