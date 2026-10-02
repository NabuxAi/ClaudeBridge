import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, IconButton, Badge, MetricCard, NotMeasured } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
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
      .catch((e) => { if (alive.current) setError(e?.message || 'مانیتورها خوانده نشد.') })
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
    } catch (err) { setError(err?.message || 'ذخیره نشد.') } finally { setBusy('') }
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
    if (!window.confirm(`مانیتور «${m.label}» و تاریخچهٔ بررسی‌هایش حذف می‌شود. ادامه می‌دهید؟`)) return
    setBusy(`del-${m.id}`); setError('')
    try {
      await api.deleteMonitor(m.id)
      await loadMonitors()
    } catch (err) { setError(err?.message || 'حذف نشد.') } finally { setBusy('') }
  }

  async function toggleEnabled(m) {
    setBusy(`en-${m.id}`); setError('')
    try {
      await api.updateMonitor(m.id, { enabled: !m.enabled })
      await loadMonitors()
    } catch (err) { setError(err?.message || 'تغییر وضعیت نشد.') } finally { setBusy('') }
  }

  async function checkNow(m) {
    setBusy(`chk-${m.id}`); setError('')
    try {
      await api.checkMonitor(m.id)
      await loadMonitors()
    } catch (err) { setError(err?.message || 'بررسی انجام نشد.') } finally { setBusy('') }
  }

  const head = (
    <PageHead
      title="مانیتورها"
      subtitle="بررسی دسترسی HTTP، نه سفر کاربری/پرداخت"
      action={(
        <Button
          variant="primary" size="sm" leftIcon="plus"
          disabled={atCap(data)}
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}
        >
          افزودن مانیتور
        </Button>
      )}
    />
  )

  if (loading) return head

  if (error && data == null) {
    return (
      <>
        {head}
        <NotMeasured title="مانیتورها خوانده نشد" reason={error} icon="alert-triangle" />
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={retryLoad}>تلاش دوباره</Button>
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
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{editingId ? 'ویرایش مانیتور' : 'مانیتور جدید'}</div>
      <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.9 }}>
        نشانی کامل (با https) چیزی که هر چند دقیقه با یک GET ساده چک می‌شود؛ مثلاً صفحهٔ اصلی، یک صفحهٔ سلامت (health) یا آدرس سبد خرید. این یک درخواست HTTP است، نه بازدید واقعی کاربر.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Input label="برچسب" required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} hint="مثلاً «صفحهٔ اصلی» یا «سبد خرید»" />
        <Input label="نشانی" required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} hint="مثلاً https://example.com/" />
        <Input label="کد وضعیت مورد انتظار" type="number" min={100} max={599} required value={form.expectStatus} onChange={(e) => setForm({ ...form, expectStatus: e.target.value })} hint="پیش‌فرض ۲۰۰" />
        <Input label="عبارت مورد انتظار در پاسخ" value={form.expectContains} onChange={(e) => setForm({ ...form, expectContains: e.target.value })} hint="اختیاری — پاسخ ۲۰۰ بدون این عبارت، ناموفق شمرده می‌شود" />
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

      {/* What this actually is, in the server's own words — one HTTP GET,
          no JS, no login. Never a checkout or user-journey claim. */}
      <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 18px', lineHeight: 1.8 }}>
        <Icon name="info" size={14} style={{ flex: '0 0 auto' }} />
        هر مانیتور یک نشانی است که سرور هر چند دقیقه یک‌بار با یک درخواست HTTP ساده چک می‌کند — بدون اجرای جاوااسکریپت و بدون لاگین. دامنهٔ همین است: {data?.scope || 'بررسی دسترسی HTTP'}.
      </p>

      {/* Site-wide availability. Without recorded checks this renders
          «اندازه‌گیری نشده» — the metric value is null on purpose, never a
          fabricated 100%. */}
      <div className="pbk-metrics">
        <MetricCard
          icon="activity" iconTone={availability?.days7?.measured ? (availability.days7.percent >= 99 ? 'success' : availability.days7.percent >= 95 ? 'warning' : 'danger') : 'neutral'}
          label="دسترس‌پذیری ۷ روزه"
          value={availability?.days7?.measured ? `${faNum(availability.days7.percent)}٪` : 'اندازه‌گیری نشده'}
          hint={availability?.days7?.measured ? `${faNum(availability.days7.checks)} بررسی ثبت‌شده` : 'هنوز بررسی‌ای ثبت نشده'}
        />
        <MetricCard
          icon="activity" iconTone={availability?.days30?.measured ? (availability.days30.percent >= 99 ? 'success' : availability.days30.percent >= 95 ? 'warning' : 'danger') : 'neutral'}
          label="دسترس‌پذیری ۳۰ روزه"
          value={availability?.days30?.measured ? `${faNum(availability.days30.percent)}٪` : 'اندازه‌گیری نشده'}
          hint={availability?.days30?.measured ? `${faNum(availability.days30.checks)} بررسی ثبت‌شده` : 'هنوز بررسی‌ای ثبت نشده'}
        />
        <MetricCard
          icon="alert-octagon" iconTone={availability?.days7?.incidents ? 'danger' : 'neutral'}
          label="اختلال ۷ روز گذشته"
          value={availability?.days7?.measured ? faNum(availability.days7.incidents) : '—'}
          hint={availability?.days7?.measured ? 'هر بازهٔ قطع پیوسته یک اختلال است' : 'بدون داده، عددی معنا ندارد'}
        />
        <MetricCard
          icon="monitor" iconTone="primary"
          label="مانیتورهای فعال"
          value={`${faNum(monitors.filter((m) => m.enabled).length)} / ${faNum(data?.limit ?? 10)}`}
          hint="حداکثر به‌ازای هر سایت"
        />
      </div>

      {formCard}

      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>فهرست مانیتورها</div>
      <div className="pbk-panel" style={{ marginBottom: 24 }}>
        <div className="pbk-trow pbk-trow--head mon-cols">
          <span>مانیتور</span>
          <span>آخرین بررسی</span>
          <span>دسترس‌پذیری ۷ روزه</span>
          <span>وضعیت</span>
          <span />
        </div>
        {monitors.length === 0 && (
          <div style={{ padding: '26px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13, lineHeight: 2 }}>
            هنوز مانیتوری افزوده نشده. یک نشانی اضافه کنید تا دسترس‌پذیری HTTP آن از سرور ما چک شود — تا آن لحظه، هیچ عدد دسترس‌پذیری‌ای وجود ندارد و «اندازه‌گیری نشده» صادقانه‌ترین حالت است.
          </div>
        )}
        {monitors.map((m) => (
          <div key={m.id} className="pbk-trow pbk-trow--body mon-cols">
            <span style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</div>
              <div className="dwp-mono" style={{ fontSize: 12, color: 'var(--gd-text-muted)', overflowWrap: 'anywhere' }}>{m.url}</div>
              {m.expectContains && (
                <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>
                  باید شامل: <span className="dwp-mono">{m.expectContains}</span>
                </div>
              )}
            </span>
            {lastCheckCell(m)}
            {availabilityCell(m)}
            <span>
              {m.enabled
                ? <Badge variant="success" appearance="soft">فعال</Badge>
                : <Badge variant="neutral" appearance="soft">خاموش — چک نمی‌شود</Badge>}
            </span>
            <span className="pbk-actions pbk-actions--start">
              <Button variant="secondary" size="sm" leftIcon="refresh-cw" disabled={busy === `chk-${m.id}`} onClick={() => checkNow(m)}>
                {busy === `chk-${m.id}` ? 'در حال بررسی…' : 'بررسی الان'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>ویرایش</Button>
              <IconButton icon={m.enabled ? 'eye-off' : 'eye'} label={m.enabled ? 'خاموش کردن بررسی' : 'روشن کردن بررسی'} size="sm" disabled={busy === `en-${m.id}`} onClick={() => toggleEnabled(m)} />
              <IconButton icon="trash-2" label="حذف" size="sm" disabled={busy === `del-${m.id}`} onClick={() => removeMonitor(m)} />
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
        <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>هنوز بررسی نشده</span>
      ) : (
        <>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: r.ok ? 'var(--gd-success)' : 'var(--gd-danger-text)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.ok ? 'var(--gd-success)' : 'var(--gd-danger)' }} />
            {r.ok
              ? `${faNum(r.status ?? '—')} در ${faNum(r.ms ?? '—')}ms`
              : (r.error || (r.status != null ? `کد ${faNum(r.status)}` : 'پاسخی نرسید'))}
          </span>
          <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>
            {new Date(r.checkedAt).toLocaleString('fa-IR')}
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
            {faNum(w.percent)}٪
          </span>
          {w.incidents > 0 && (
            <span style={{ fontSize: 11, color: 'var(--gd-danger-text)', marginRight: 6 }}>
              {faNum(w.incidents)} اختلال
            </span>
          )}
          <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>{faNum(w.checks)} بررسی</div>
        </>
      ) : (
        <span style={{ color: 'var(--gd-text-muted)' }}>اندازه‌گیری نشده</span>
      )}
    </span>
  )
}
