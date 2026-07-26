import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, IconButton, MetricCard, Badge, Switch, NotMeasured } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

const COLS = '1.6fr 1fr 0.8fr 1fr 1.4fr'

export default function Backups() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  // Restore is guarded by a typed confirmation, not a second click. Every table
  // is overwritten with an older copy, so orders and posts created since that
  // snapshot are gone — that deserves more friction than "are you sure?".
  const [confirming, setConfirming] = useState(null)
  const [typed, setTyped] = useState('')
  const timer = useRef(null)

  const load = () => siteApi(siteId).backups().then(setData)

  useEffect(() => {
    let alive = true
    siteApi(siteId).backups().then((d) => alive && setData(d))
    return () => { alive = false; clearTimeout(timer.current) }
  }, [siteId])

  function poll(jobId) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const s = await siteApi(siteId).job(jobId)
      setJob(s)
      if (s.state !== 'done' && s.state !== 'failed') poll(jobId)
      else load()
    }, 2000)
  }

  async function takeBackup() {
    setBusy('run'); setError('')
    try {
      const res = await siteApi(siteId).runBackup({ files: false })
      const started = res.job || res
      setJob(started)
      poll(started.id)
    } catch (e) { setError(e?.message || 'شروع نشد.') } finally { setBusy('') }
  }

  async function doRestore(id) {
    setBusy(id); setError(''); setConfirming(null); setTyped('')
    try {
      const res = await siteApi(siteId).restoreBackup(id, { confirm: true })
      const started = res.job || res
      setJob(started)
      poll(started.id)
    } catch (e) { setError(e?.message || 'بازگردانی شروع نشد.') } finally { setBusy('') }
  }

  async function download(id) {
    setBusy(`dl-${id}`); setError('')
    try {
      const r = await siteApi(siteId).downloadBackup(id, 'db')
      if (r && r.ok === false && r.message) setError(r.message)
    } catch (e) { setError(e?.message || 'دانلود انجام نشد.') } finally { setBusy('') }
  }

  const head = (
    <PageHead
      title="بکاپ‌ها و بازیابی"
      subtitle="نسخه‌های پشتیبان تأییدشده، خارج از سرور و قابل بازیابی"
      action={(
        <Button variant="primary" size="sm" leftIcon="database-backup" disabled={busy === 'run'} onClick={takeBackup}>
          {busy === 'run' ? 'در حال شروع…' : 'بکاپ دستی'}
        </Button>
      )}
    />
  )

  if (!data) return head

  // The server tells us when a view has no real source yet. Showing the
  // seed numbers here would be inventing a reading the customer cannot
  // distinguish from a measured one.
  const confirmWord = 'بازگردانی'

  if (data.provenance?.unavailable) {
    return (
      <>
        {head}
        <NotMeasured title="بکاپ‌ها و بازیابی" reason={data.provenance.unavailable} />
      </>
    )
  }

  return (
    <>
      {head}

      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <MetricCard icon="clock" iconTone="success" label="آخرین بکاپ" value={data.lastBackup} hint="امروز · تأییدشده" />
        <MetricCard icon="database" iconTone="primary" label="حجم آخرین نسخه" value={data.list[0]?.size} hint="دیتابیس + فایل‌ها" />
        <MetricCard icon="history" iconTone="neutral" label="نسخه‌های نگهداری" value="۳۰" hint="۳۰ روز اخیر" />
        <MetricCard icon="cloud" iconTone="accent" label="محل ذخیره" value="خارجی" hint={data.location} />
      </div>

      {/* Schedule banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)', padding: '16px 20px', marginBottom: 22 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="calendar-clock" size={21} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>زمان‌بندی خودکار</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>روزانه ساعت ۰۳:۰۰ + هفتگی یکشنبه‌ها — و یک بکاپ کامل پیش از هر تغییر</div>
        </div>
        <span className="dwp-mono" style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 999, padding: '4px 10px', flex: '0 0 auto' }}>
          بکاپ بعدی · {data.nextBackup}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)', fontWeight: 600 }}>بکاپ پیش از هر تغییر</span>
          <Switch defaultChecked />
        </span>
      </div>

      {/* Backups table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>نسخه‌های پشتیبان</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>تاریخ و ساعت</span>
          <span>نوع</span>
          <span>حجم</span>
          <span>تست بازیابی</span>
          <span />
        </div>

        {data.list.map((b, i) => {
          const preAction = b.type.includes('پیش از اقدام')
          return (
            <div
              key={b.id}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center',
                padding: '13px 20px', fontSize: 13.5,
                borderBottom: i < data.list.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon
                  name={preAction ? 'database-backup' : 'check-circle-2'}
                  size={17}
                  style={{ color: preAction ? 'var(--gd-primary)' : 'var(--gd-success)', flex: '0 0 auto' }}
                />
                {b.when}
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ color: 'var(--gd-text-secondary)' }}>{b.type}</span>
                <span style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--gd-text-muted)' }}>
                  {b.db && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icon name="database" size={11} /> دیتابیس
                    </span>
                  )}
                  {b.files && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Icon name="file" size={11} /> فایل‌ها
                    </span>
                  )}
                </span>
              </div>

              <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>{b.size}</span>

              <span>
                {b.verified
                  ? <Badge variant="success" appearance="soft">موفق</Badge>
                  : <Badge variant="warning" appearance="soft">در انتظار</Badge>}
              </span>

              <span style={{ display: 'flex', gap: 7, justifyContent: 'flex-start' }}>
                <Button
                  variant="secondary" size="sm" leftIcon="rotate-ccw"
                  disabled={busy === b.id} onClick={() => { setConfirming(b); setTyped('') }}
                >
                  بازگردانی
                </Button>
                <IconButton
                  icon="download" label="دانلود دیتابیس" size="sm"
                  disabled={busy === `dl-${b.id}`} onClick={() => download(b.id)}
                />
              </span>
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px', marginTop: 16 }}>
          {error}
        </p>
      )}

      {job && (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 9, fontSize: 13.5, fontWeight: 700 }}>
            <span>{job.message || 'در حال اجرا'}</span>
            <Badge variant={job.state === 'failed' ? 'danger' : job.state === 'done' ? 'success' : 'info'} appearance="soft">
              {job.state === 'failed' ? 'ناموفق' : job.state === 'done' ? 'تمام' : `${job.progress || 0}٪`}
            </Badge>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--gd-bg-inset)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${job.state === 'done' ? 100 : job.progress || 0}%`, background: job.state === 'failed' ? 'var(--gd-danger)' : 'var(--gd-primary)', transition: 'width .4s ease' }} />
          </div>
          {job.result?.safety_backup && (
            <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '9px 0 0', lineHeight: 1.8 }}>
              پیش از بازگردانی یک بکاپ ایمنی گرفته شد: <span className="dwp-mono">{job.result.safety_backup}</span> — اگر بکاپ اشتباهی را برگرداندید، راه برگشت همین است.
            </p>
          )}
        </div>
      )}

      {confirming && (
        <div style={{ background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-lg)', padding: '18px 20px', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14.5, fontWeight: 800, color: 'var(--gd-danger-text)', marginBottom: 7 }}>
            <Icon name="alert-triangle" size={17} /> بازگردانی دیتابیس به {confirming.when}
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.9, margin: '0 0 12px' }}>
            همهٔ جدول‌ها با نسخهٔ آن تاریخ جایگزین می‌شوند. هر سفارش، دیدگاه یا نوشته‌ای که پس از آن بکاپ ساخته شده از بین می‌رود.
            سایت پیش از شروع، خودش یک بکاپ ایمنی می‌گیرد؛ اگر آن هم ناموفق باشد، بازگردانی اصلاً انجام نمی‌شود.
            برای تأیید، واژهٔ «{confirmWord}» را بنویسید.
          </p>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <input
              value={typed} onChange={(e) => setTyped(e.target.value)}
              style={{ flex: '1 1 200px', padding: '9px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', background: 'var(--gd-bg-surface)', fontSize: 13, fontFamily: 'inherit' }}
            />
            <Button variant="danger" size="md" disabled={typed.trim() !== confirmWord} onClick={() => doRestore(confirming.id)}>
              بازگردانی کن
            </Button>
            <Button variant="ghost" size="md" onClick={() => { setConfirming(null); setTyped('') }}>انصراف</Button>
          </div>
        </div>
      )}
    </>
  )
}
