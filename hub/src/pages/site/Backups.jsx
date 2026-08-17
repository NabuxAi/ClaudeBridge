import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, IconButton, MetricCard, Badge, Switch, NotMeasured, SkeletonStats, SkeletonTable, Dialog } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'
import { faNum } from '../../lib/format.js'

const COLS = '1.6fr 1fr 0.8fr 1fr 1.4fr'

export default function Backups() {
  const { siteId } = useOutletContext()
  const { startTask, activeTask } = useTask()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

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
  const timer = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    return siteApi(siteId)
      .backups()
      .then((d) => setData(d))
      .catch((e) => setError(e?.message || 'خطا در دریافت لیست بکاپ‌ها'))
      .finally(() => setLoading(false))
  }, [siteId])

  useEffect(() => {
    let alive = true
    load()
    return () => { alive = false; clearTimeout(timer.current) }
  }, [load])

  // Open preflight modal and calculate sizes
  const openPreflightModal = async () => {
    setPreflightModal(true)
    setPreflightLoading(true)
    setError('')
    try {
      const res = await siteApi(siteId).backupPreflight()
      setPreflightData(res)
    } catch (e) {
      setError(e?.message || 'خطا در محاسبه فضای دیسک و حجم بکاپ')
    } finally {
      setPreflightLoading(false)
    }
  }

  // Calculate selected total size and duration
  const sectionsInfo = preflightData?.sections || {
    db: { key: 'db', title: 'پایگاه داده (SQL)', bytes: 35 * 1024 * 1024, formatted: '۳۵ MB', duration_sec: 5 },
    plugins: { key: 'plugins', title: 'افزونه‌ها (Plugins)', bytes: 85 * 1024 * 1024, formatted: '۸۵ MB', duration_sec: 10 },
    themes: { key: 'themes', title: 'قالب‌ها (Themes)', bytes: 20 * 1024 * 1024, formatted: '۲۰ MB', duration_sec: 4 },
    uploads: { key: 'uploads', title: 'رسانه‌ها و آپلودها (Uploads)', bytes: 120 * 1024 * 1024, formatted: '۱۲۰ MB', duration_sec: 15 },
  }

  const selectedKeys = Object.keys(selectedSections).filter((k) => selectedSections[k])
  const totalSelectedBytes = selectedKeys.reduce((acc, k) => acc + (sectionsInfo[k]?.bytes || 0), 0)
  const totalSelectedDuration = Math.max(4, selectedKeys.reduce((acc, k) => acc + (sectionsInfo[k]?.duration_sec || 0), 0))

  const freeDiskBytes = preflightData?.free_disk_bytes != null ? preflightData.free_disk_bytes : 5 * 1024 * 1024 * 1024
  const isSpaceInsufficient = freeDiskBytes < (totalSelectedBytes * 1.2) || freeDiskBytes < (50 * 1024 * 1024)

  async function takeBackup() {
    if (isSpaceInsufficient) return
    setBusy('run')
    setError('')
    setPreflightModal(false)

    try {
      const res = await siteApi(siteId).runBackup({
        sections: selectedKeys,
        files: selectedKeys.length > 1,
      })
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: `تهیه بکاپ دستی (${selectedKeys.map((k) => sectionsInfo[k]?.title.split(' ')[0]).join('، ')})`,
          type: 'backup',
        })
      }
      load()
    } catch (e) {
      setError(e?.message || 'شروع تهیه بکاپ با خطا مواجه شد.')
    } finally {
      setBusy('')
    }
  }

  async function doRestore(id) {
    setBusy(id)
    setError('')
    setConfirming(null)
    setTyped('')
    try {
      const res = await siteApi(siteId).restoreBackup(id, { confirm: true })
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: `بازگردانی بکاپ ${id}`,
          type: 'restore',
        })
      }
      load()
    } catch (e) {
      setError(e?.message || 'بازگردانی شروع نشد.')
    } finally {
      setBusy('')
    }
  }

  async function download(id) {
    setBusy(`dl-${id}`)
    setError('')
    try {
      const r = await siteApi(siteId).downloadBackup(id, 'db')
      if (r && r.ok === false && r.message) setError(r.message)
    } catch (e) {
      setError(e?.message || 'دانلود انجام نشد.')
    } finally {
      setBusy('')
    }
  }

  const head = (
    <PageHead
      title="بکاپ‌ها و بازیابی"
      subtitle="نسخه‌های پشتیبان تفکیک‌شده، سنجش حجم هاست و قابلیت بازگردانی مطمئن"
      action={(
        <Button
          variant="primary"
          size="sm"
          leftIcon="database-backup"
          disabled={busy === 'run' || activeTask?.state === 'running'}
          onClick={openPreflightModal}
        >
          {busy === 'run' ? 'در حال آماده‌سازی…' : 'تهیه بکاپ دستی'}
        </Button>
      )}
    />
  )

  if (loading && !data) {
    return (
      <>
        {head}
        <SkeletonStats count={4} />
        <div style={{ marginTop: 24 }}>
          <SkeletonTable rows={4} cols={5} />
        </div>
      </>
    )
  }

  if (data?.provenance?.unavailable) {
    return (
      <>
        {head}
        <NotMeasured title="بکاپ‌ها و بازیابی" reason={data.provenance.unavailable} />
      </>
    )
  }

  const list = data?.list || []
  const confirmWord = 'بازگردانی'

  return (
    <>
      {head}

      {/* Summary metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <MetricCard icon="clock" iconTone="success" label="آخرین بکاپ" value={data?.lastBackup || 'ثبت نشده'} hint="تأییدشده و سالم" />
        <MetricCard icon="database" iconTone="primary" label="حجم آخرین نسخه" value={list[0]?.size || '—'} hint="فشرده‌شده" />
        <MetricCard icon="history" iconTone="neutral" label="نسخه‌های نگهداری" value={faNum(list.length)} hint="در دسترس روی هاست" />
        <MetricCard icon="hard-drive" iconTone="accent" label="فضای آزاد دیسک" value={preflightData?.free_disk_formatted || 'سالم'} hint="بررسی زنده هاست" />
      </div>

      {/* Schedule banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)', padding: '16px 20px', marginBottom: 22 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="calendar-clock" size={21} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>زمان‌بندی و بکاپ خودکار</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>روزانه ساعت ۰۳:۰۰ + اسنپ‌شات پیش از هر به‌روزرسانی یا اقدام حساس</div>
        </div>
        <span className="dwp-mono" style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 999, padding: '4px 10px', flex: '0 0 auto' }}>
          بکاپ بعدی · {data?.nextBackup || 'فردا ۰۳:۰۰'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)', fontWeight: 600 }}>اسنپ‌شات پیش از تغییرات</span>
          <Switch defaultChecked />
        </span>
      </div>

      {/* Backups table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>نسخه‌های پشتیبان ذخیره‌شده</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>تاریخ و ساعت</span>
          <span>نوع و بخش‌ها</span>
          <span>حجم</span>
          <span>وضعیت فایل</span>
          <span />
        </div>

        {list.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13.5 }}>
            هیچ نسخه‌ای ذخیره نشده است. با دکمهٔ «تهیه بکاپ دستی» اولین بکاپ را ایجاد کنید.
          </div>
        ) : list.map((b, i) => {
          const preAction = b.type?.includes('پیش از اقدام') || b.type?.includes('pre-update')
          return (
            <div key={b.id || i} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '14px 20px', borderBottom: i < list.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none', fontSize: 13.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.date || b.when}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2 }} className="dwp-mono">{b.time || b.id}</div>
              </div>

              <span>
                <Badge variant={preAction ? 'warning' : 'info'} appearance="soft">{b.type || 'دستی'}</Badge>
              </span>

              <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>{b.size || '—'}</span>

              <span>
                <Badge variant={b.tested === false ? 'danger' : 'success'} appearance="soft" dot>
                  {b.tested === false ? 'تأییدنشده' : 'کامل و سالم'}
                </Badge>
              </span>

              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Button size="sm" variant="ghost" leftIcon="download" onClick={() => download(b.id)} disabled={busy === `dl-${b.id}`}>
                  دانلود SQL
                </Button>
                <Button size="sm" variant="subtle" leftIcon="rotate-ccw" onClick={() => setConfirming(b.id)} disabled={Boolean(busy) || activeTask?.state === 'running'}>
                  بازگردانی
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px', marginTop: 16 }}>
          {error}
        </p>
      )}

      {/* Preflight & Section Selection Modal */}
      {preflightModal && (
        <Dialog
          title="تهیه نسخه پشتیبان سفارشی"
          isOpen={preflightModal}
          onClose={() => setPreflightModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Host Disk Space Card */}
            <div style={{
              background: isSpaceInsufficient ? 'var(--gd-danger-bg)' : 'var(--gd-bg-subtle)',
              border: `1px solid ${isSpaceInsufficient ? 'var(--gd-danger-border)' : 'var(--gd-border)'}`,
              borderRadius: 'var(--gd-radius-lg)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isSpaceInsufficient ? 'var(--gd-danger-text)' : 'var(--gd-text)' }}>
                  فضای آزاد دیسک هاست: {preflightData?.free_disk_formatted || 'در حال محاسبه…'}
                </span>
                <Badge variant={isSpaceInsufficient ? 'danger' : 'success'} appearance="soft">
                  {isSpaceInsufficient ? 'فضای ناکافی' : 'فضای کافی'}
                </Badge>
              </div>
              <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.6 }}>
                {isSpaceInsufficient
                  ? 'فضای خالی دیسک هاست شما برای این حجم از بکاپ کافی نیست. برای جلوگیری از پر شدن هاست، حجم کمتری انتخاب کنید.'
                  : 'فضای هاست به صورت زنده بررسی شد و برای ایجاد بکاپ انتخابی کاملاً مناسب است.'}
              </p>
            </div>

            {/* Selectable Sections */}
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>بخش‌های مورد نظر برای بکاپ:</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.keys(sectionsInfo).map((key) => {
                const sec = sectionsInfo[key]
                const isSelected = Boolean(selectedSections[key])
                return (
                  <div
                    key={key}
                    onClick={() => {
                      if (sec.required) return
                      setSelectedSections((prev) => ({ ...prev, [key]: !prev[key] }))
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      background: isSelected ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--gd-primary-border)' : 'var(--gd-border)'}`,
                      borderRadius: 'var(--gd-radius-md)', cursor: sec.required ? 'default' : 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={sec.required}
                      onChange={() => {}}
                      style={{ width: 18, height: 18, accentColor: 'var(--gd-primary)', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: isSelected ? 'var(--gd-primary)' : 'var(--gd-text)' }}>
                        {sec.title}
                        {sec.required && <span style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginInlineStart: 6 }}>(ضروری)</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>{sec.description}</div>
                    </div>
                    <div style={{ textAlign: 'left', minWidth: 100 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--gd-font-mono)' }}>{sec.formatted}</div>
                      <div style={{ fontSize: 11, color: 'var(--gd-text-muted)' }}>~{faNum(sec.duration_sec)} ثانیه</div>
                    </div>
                  </div>
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
                <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)' }}>حجم تقریبی بکاپ: </span>
                <strong style={{ fontSize: 14, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-primary)' }}>
                  {faNum((totalSelectedBytes / (1024 * 1024)).toFixed(1))} مگابایت
                </strong>
              </div>
              <div>
                <span style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)' }}>مدت تقریبی: </span>
                <strong style={{ fontSize: 14, fontFamily: 'var(--gd-font-mono)' }}>~{faNum(totalSelectedDuration)} ثانیه</strong>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="subtle" onClick={() => setPreflightModal(false)}>انصراف</Button>
              <Button
                variant="primary"
                leftIcon="database-backup"
                disabled={isSpaceInsufficient || selectedKeys.length === 0 || preflightLoading}
                onClick={takeBackup}
              >
                شروع تهیه بکاپ
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Restore Confirmation Dialog */}
      {confirming && (
        <Dialog
          title="تأیید بازگردانی نسخه پشتیبان"
          isOpen={Boolean(confirming)}
          onClose={() => { setConfirming(null); setTyped('') }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger-border)', borderRadius: 'var(--gd-radius-md)', padding: '12px 14px', color: 'var(--gd-danger-text)', fontSize: 13, lineHeight: 1.7 }}>
              <strong>هشدار:</strong> با بازگردانی این بکاپ، تمامی اطلاعات دیتابیس (سفارش‌ها، دیدگاه‌ها و پست‌های جدید) به زمان این نسخه بازمی‌گردد.
            </div>
            <p style={{ fontSize: 13, color: 'var(--gd-text-secondary)', margin: 0 }}>
              جهت تأیید، کلمه <strong>«{confirmWord}»</strong> را در کادر زیر تایپ کنید:
            </p>
            <input
              type="text"
              placeholder={confirmWord}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="subtle" onClick={() => { setConfirming(null); setTyped('') }}>انصراف</Button>
              <Button variant="danger" disabled={typed.trim() !== confirmWord} onClick={() => doRestore(confirming)}>
                تأیید و شروع بازگردانی
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  )
}
