import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, IconButton, Badge, MetricCard, NotMeasured } from '../../components/index.js'
import { t, digits, num, dateTime } from '../../lib/i18n.js'
import { site as siteApi } from '../../lib/api.js'

// مانیتورهای دسترس‌پذیری — یک HTTP GET زمان‌بندی‌شده به هر نشانی، بدون اجرای
// جاوااسکریپت و بدون لاگین. برچسب صادقانهٔ همین دامنه («بررسی دسترسی HTTP، نه
// سفر کاربری/پرداخت») از خود سرور می‌آید و در سربرگ صفحه هم تکرار می‌شود، تا
// هیچ‌کس این بخش را «پایش سفر خرید» نخواند.
//
// صداقت این صفحه:
//   - درصد دسترس‌پذیریِ بدون هیچ بررسی ثبت‌شده «اندازه‌گیری نشده» است، نه ۱۰۰٪
//     و نه ۰٪ (percent:null از سرور).
//   - «آخرین بررسی» تا وقتی بررسی‌ای ثبت نشده «هنوز بررسی نشده» است.
//   - تعداد اختلال، تعداد «قطعی» است نه تعداد بررسی ناموفق؛ دو بررسی پشت‌سرهم
//     ناموفق یک قطعی است و سرور آن را این‌طور می‌شمارد.

export default function Monitors() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const alive = useRef(true)

  const api = useMemo(() => siteApi(siteId), [siteId])

  const loadMonitors = () => api.listMonitors().then((d) => { if (alive.current) setData(d) })

  useEffect(() => {
    alive.current = true
    loadMonitors()
      .catch((e) => { if (alive.current) setError(e?.message || t('monitors.error.load')) })
      .finally(() => { if (alive.current) setLoading(false) })
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, attempt])

  function retryLoad() {
    setError('')
    setLoading(true)
    setAttempt((a) => a + 1)
  }

  async function saveMonitor(e) {
    e.preventDefault()
    setBusy('save'); setError('')
    const body = {
      label: form.label,
      url: form.url,
      expectStatus: Number(form.expectStatus) || 200,
      ...(form.expectContains ? { expectContains: form.expectContains } : { expectContains: '' }),
    }
    try {
      if (editingId) await api.updateMonitor(editingId, body)
      else await api.createMonitor(body)
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      await loadMonitors()
    } catch (err) { setError(err?.message || t('monitors.error.save')) } finally { setBusy('') }
  }

  function startEdit(m) {
    setEditingId(m.id)
    setForm({
      label: m.label || '',
      url: m.url || '',
      expectStatus: String(m.expectStatus ?? 200),
      expectContains: m.expectContains || '',
    })
    setShowForm(true)
  }

  async function removeMonitor(m) {
    if (!window.confirm(t('monitors.confirmDelete', { label: m.label }))) return
    setBusy(`del-${m.id}`); setError('')
    try {
      await api.deleteMonitor(m.id)
      await loadMonitors()
    } catch (err) { setError(err?.message || t('monitors.error.delete')) } finally { setBusy('') }
  }

  async function toggleEnabled(m) {
    setBusy(`en-${m.id}`); setError('')
    try {
      await api.updateMonitor(m.id, { enabled: !m.enabled })
      await loadMonitors()
    } catch (err) { setError(err?.message || t('monitors.error.toggle')) } finally { setBusy('') }
  }

  async function checkNow(m) {
    setBusy(`chk-${m.id}`); setError('')
    try {
      await api.checkMonitor(m.id)
      await loadMonitors()
    } catch (err) { setError(err?.message || t('monitors.error.check')) } finally { setBusy('') }
  }

  const head = (
    <PageHead
      title={t('monitors.title')}
      subtitle={t('monitors.scopeLabel')}
      action={(
        <Button
          variant="primary" size="sm" leftIcon="plus"
          disabled={atCap(data)}
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}
        >
          {t('monitors.add')}
        </Button>
      )}
    />
  )

  if (loading) return head

  if (error && data == null) {
    return (
      <>
        {head}
        <NotMeasured title={t('monitors.loadFailedTitle')} reason={error} icon="alert-triangle" />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={retryLoad}>{t('common.retry')}</Button>
        </div>
      </>
    )
  }

  const monitors = data?.monitors || []
  const availability = data?.availability || null

  // Same inline-form idiom as OffsiteBackups: built during render, never a
  // module-level helper shuffling setters around.
  const formCard = showForm && (
    <form
      onSubmit={saveMonitor}
      style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: 18, marginBottom: 22 }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{editingId ? t('monitors.form.editTitle') : t('monitors.form.newTitle')}</div>
      <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.9 }}>
        {t('monitors.form.intro')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Input label={t('monitors.form.label')} required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} hint={t('monitors.form.labelHint')} />
        <Input label={t('monitors.form.url')} required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} hint={t('monitors.form.urlHint')} />
        <Input label={t('monitors.form.expectStatus')} type="number" min={100} max={599} required value={form.expectStatus} onChange={(e) => setForm({ ...form, expectStatus: e.target.value })} hint={t('monitors.form.expectStatusHint', { status: digits(200) })} />
        <Input label={t('monitors.form.expectContains')} value={form.expectContains} onChange={(e) => setForm({ ...form, expectContains: e.target.value })} hint={t('monitors.form.expectContainsHint', { status: digits(200) })} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button variant="primary" size="sm" loading={busy === 'save'} type="submit">{editingId ? t('monitors.form.update') : t('common.save')}</Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm()) }}>{t('common.cancel')}</Button>
      </div>
    </form>
  )

  return (
    <>
      {head}

      {/* What this actually is, in the server's own words — one HTTP GET,
          no JS, no login. Never a checkout or user-journey claim. */}
      <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 18px', lineHeight: 1.8 }}>
        <Icon name="info" size={14} style={{ flex: '0 0 auto' }} />
        {t('monitors.scopeNote', { scope: data?.scope || t('monitors.scopeFallback') })}
      </p>

      {/* Site-wide availability. Without recorded checks this renders
          «اندازه‌گیری نشده» — the metric value is null on purpose, never a
          fabricated 100%. */}
      <div className="pbk-metrics">
        <MetricCard
          icon="activity" iconTone={availability?.days7?.measured ? (availability.days7.percent >= 99 ? 'success' : availability.days7.percent >= 95 ? 'warning' : 'danger') : 'neutral'}
          label={t('monitors.metric.avail7')}
          value={availability?.days7?.measured ? availPct(availability.days7.percent) : t('monitors.notMeasured')}
          hint={availability?.days7?.measured ? t('monitors.metric.checksRecorded', { count: availability.days7.checks }) : t('monitors.metric.noChecks')}
        />
        <MetricCard
          icon="activity" iconTone={availability?.days30?.measured ? (availability.days30.percent >= 99 ? 'success' : availability.days30.percent >= 95 ? 'warning' : 'danger') : 'neutral'}
          label={t('monitors.metric.avail30')}
          value={availability?.days30?.measured ? availPct(availability.days30.percent) : t('monitors.notMeasured')}
          hint={availability?.days30?.measured ? t('monitors.metric.checksRecorded', { count: availability.days30.checks }) : t('monitors.metric.noChecks')}
        />
        <MetricCard
          icon="alert-octagon" iconTone={availability?.days7?.incidents ? 'danger' : 'neutral'}
          label={t('monitors.metric.incidents7')}
          value={availability?.days7?.measured ? num(availability.days7.incidents) : '—'}
          hint={availability?.days7?.measured ? t('monitors.metric.incidentsHint') : t('monitors.metric.noDataHint')}
        />
        <MetricCard
          icon="monitor" iconTone="primary"
          label={t('monitors.metric.active')}
          value={`${num(monitors.filter((m) => m.enabled).length)} / ${num(data?.limit ?? 10)}`}
          hint={t('monitors.metric.activeHint')}
        />
      </div>

      {formCard}

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t('monitors.list.title')}</div>
      <div className="pbk-panel" style={{ marginBottom: 24 }}>
        <div className="pbk-trow pbk-trow--head mon-cols">
          <span>{t('monitors.list.monitor')}</span>
          <span>{t('monitors.list.lastCheck')}</span>
          <span>{t('monitors.metric.avail7')}</span>
          <span>{t('monitors.list.status')}</span>
          <span />
        </div>
        {monitors.length === 0 && (
          <div style={{ padding: '26px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13, lineHeight: 2 }}>
            {t('monitors.list.empty')}
          </div>
        )}
        {monitors.map((m) => (
          <div key={m.id} className="pbk-trow pbk-trow--body mon-cols">
            <span style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
              <div className="dwp-mono" style={{ fontSize: 12, color: 'var(--gd-text-muted)', overflowWrap: 'anywhere' }}>{m.url}</div>
              {m.expectContains && (
                <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>
                  {t('monitors.list.mustContain')} <span className="dwp-mono">{m.expectContains}</span>
                </div>
              )}
            </span>
            {lastCheckCell(m)}
            {availabilityCell(m)}
            <span>
              {m.enabled
                ? <Badge variant="success" appearance="soft">{t('monitors.list.enabled')}</Badge>
                : <Badge variant="neutral" appearance="soft">{t('monitors.list.disabled')}</Badge>}
            </span>
            <span className="pbk-actions pbk-actions--start">
              <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={busy === `chk-${m.id}`} onClick={() => checkNow(m)}>
                {busy === `chk-${m.id}` ? t('monitors.list.checking') : t('monitors.list.checkNow')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>{t('common.edit')}</Button>
              <IconButton icon={m.enabled ? 'eye-off' : 'eye'} label={m.enabled ? t('monitors.list.disable') : t('monitors.list.enable')} size="sm" disabled={busy === `en-${m.id}`} onClick={() => toggleEnabled(m)} />
              <IconButton icon="trash-2" label={t('common.delete')} size="sm" disabled={busy === `del-${m.id}`} onClick={() => removeMonitor(m)} />
            </span>
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

// Availability is only formatted when the server says it was measured; a
// missing percent still renders "not measured", never 0%.
// Up to two decimals: rounding 99.95 to "100%" would overstate uptime.
function availPct(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return t('monitors.notMeasured')
  return num(Number(percent) / 100, { style: 'percent', maximumFractionDigits: 2 })
}

function atCap(data) {
  return Array.isArray(data?.monitors) && data.limit != null && data.monitors.length >= data.limit
}

function emptyForm() {
  return { label: '', url: '', expectStatus: '200', expectContains: '' }
}

/** Last check as evidence — the reading behind the verdict, or an honest «هیچ». */
function lastCheckCell(m) {
  const r = m.lastResult
  return (
    <span style={{ minWidth: 0 }}>
      {r == null ? (
        <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{t('monitors.list.notChecked')}</span>
      ) : (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: r.ok ? 'var(--gd-success)' : 'var(--gd-danger-text)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.ok ? 'var(--gd-success)' : 'var(--gd-danger)' }} />
            {r.ok
              ? t('monitors.result.ok', { status: digits(r.status ?? '—'), ms: digits(r.ms ?? '—') })
              : (r.error || (r.status != null ? t('monitors.result.code', { status: digits(r.status) }) : t('monitors.result.noResponse')))}
          </span>
          <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>
            {dateTime(r.checkedAt)}
          </div>
        </>
      )}
    </span>
  )
}

/** Per-monitor 7-day window. No recorded checks → «اندازه‌گیری نشده». */
function availabilityCell(m) {
  const w = m.days7
  return (
    <span style={{ fontSize: 12.5 }}>
      {w?.measured ? (
        <>
          <span style={{ fontWeight: 700, color: w.percent >= 99 ? 'var(--gd-success)' : w.percent >= 95 ? 'var(--gd-warning-text)' : 'var(--gd-danger-text)' }}>
            {availPct(w.percent)}
          </span>
          {w.incidents > 0 && (
            <span style={{ fontSize: 11, color: 'var(--gd-danger-text)', marginInlineStart: 6 }}>
              {t('monitors.result.incidents', { count: w.incidents })}
            </span>
          )}
          <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>{t('monitors.result.checks', { count: w.checks })}</div>
        </>
      ) : (
        <span style={{ color: 'var(--gd-text-muted)' }}>{t('monitors.notMeasured')}</span>
      )}
    </span>
  )
}
