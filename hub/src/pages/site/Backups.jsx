import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, MetricCard, Badge, Switch, NotMeasured, SkeletonStats, SkeletonTable, Dialog } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'
import { faNum } from '../../lib/format.js'

const COLS = '1.4fr 1.1fr 1fr 0.8fr 1fr 1.5fr'

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
  const [selectedDestination, setSelectedDestination] = useState('local')
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
              const t = b.created_at ? (b.created_at * 1000) : (b.timestamp || 0)
              return t >= todayStart
            }).length
            setBackupsToday((prev) => (countToday > 0 ? countToday : prev))
          }
        }
      })
      .catch((e) => { if (aliveRef.current) setError(e?.message || 'خطا در دریافت لیست بکاپ‌ها') })
      .finally(() => { if (aliveRef.current) setLoading(false) })
  }, [siteId])

  useEffect(() => {
    aliveRef.current = true
    const timerId = timer.current
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    loadPolicy()
    loadOffsite()
    return () => { aliveRef.current = false; clearTimeout(timerId) }
  }, [load, loadPolicy, loadOffsite])

  // Open preflight modal and calculate sizes
  const openPreflightModal = async () => {
    setPreflightModal(true)
    setPreflightLoading(true)
    setSelectedDestination(policy.destination || 'local')
    setError('')
    setSuccessMsg('')
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
  const isSpaceInsufficient = selectedDestination === 'local' && (freeDiskBytes < (totalSelectedBytes * 1.2) || freeDiskBytes < (50 * 1024 * 1024))

  async function takeBackup() {
    if (isSpaceInsufficient) return
    setBusy('run')
    setError('')
    setSuccessMsg('')
    setPreflightModal(false)

    try {
      const res = await siteApi(siteId).runBackup({
        sections: selectedKeys,
        files: selectedKeys.length > 1,
        destination: selectedDestination,
      })
      const started = res.job || res
      if (started?.id) {
        startTask({
          id: started.id,
          title: `تهیه بکاپ (${selectedDestination === 'hub' ? 'سرور دیجی‌دبلیوپی' : 'سرور محلی'})`,
          type: 'backup',
        })
      }
      load()
      loadPolicy()
    } catch (e) {
      setError(e?.message || 'شروع تهیه بکاپ با خطا مواجه شد.')
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
      setSuccessMsg('تنظیمات نگهداری و ذخیره‌سازی بکاپ با موفقیت ذخیره شد.')
      setPolicyModal(false)
      loadPolicy()
    } catch (e) {
      setError(e?.message || 'خطا در ذخیره تنظیمات نگهداری بکاپ')
    } finally {
      setSavingPolicy(false)
    }
  }

  async function handleManualPrune() {
    if (!window.confirm('آیا مایلید فایل‌های بکاپ قدیمی‌تر از سقف نگهداری برای آزادسازی فضای هاست حذف شوند؟')) return
    setBusy('pruning')
    setError('')
    setSuccessMsg('')
    try {
      const res = await siteApi(siteId).pruneBackups({
        keep: 10,
        days: policy.retentionDays,
        max_mb: policy.maxStorageMb,
      })
      const freedMb = res?.freed_bytes ? (res.freed_bytes / (1024 * 1024)).toFixed(1) : '۰'
      setSuccessMsg(`پاک‌سازی انجام شد: ${faNum(res?.pruned || 0)} نسخه حذف و ${faNum(freedMb)} مگابایت حافظه آزاد شد.`)
      load()
      loadPolicy()
    } catch (e) {
      setError(e?.message || 'خطا در اجرای پاک‌سازی بکاپ‌ها')
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

  async function download(id, what = 'db') {
    setBusy(`dl-${id}`)
    setError('')
    setSuccessMsg('')
    try {
      const r = await siteApi(siteId).downloadBackup(id, what)
      if (r && r.ok === false && r.message) setError(r.message)
    } catch (e) {
      setError(e?.message || 'دانلود انجام نشد.')
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
      setError(e?.message || 'ثبت مقصد ابری با خطا مواجه شد.')
    } finally {
      setBusy('')
    }
  }

  async function deleteTarget(targetId) {
    if (!window.confirm('آیا از حذف این مقصد ابری اطمینان دارید؟')) return
    setBusy(`del-${targetId}`)
    setError('')
    try {
      await siteApi(siteId).deleteOffsiteTarget(targetId)
      loadOffsite()
    } catch (e) {
      setError(e?.message || 'حذف مقصد ابری با خطا مواجه شد.')
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
          title: 'همگام‌سازی پشتیبان با فضای ابری S3',
          type: 'backup',
        })
      }
      loadOffsite()
    } catch (e) {
      setError(e?.message || 'شروع همگام‌سازی ابری با خطا مواجه شد.')
    } finally {
      setBusy('')
    }
  }

  const head = (
    <PageHead
      title="بکاپ‌ها و بازیابی"
      subtitle="مدیریت محل ذخیره (سرور ما / سرور شما)، سقف روزانه، حذف خودکار و دانلود فوق‌سریع"
      action={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="subtle"
            size="sm"
            leftIcon="settings"
            onClick={() => setPolicyModal(true)}
          >
            تنظیمات نگهداری و ذخیره
          </Button>
          <Button
            variant="subtle"
            size="sm"
            leftIcon="trash-2"
            disabled={busy === 'pruning'}
            onClick={handleManualPrune}
          >
            {busy === 'pruning' ? 'در حال پاک‌سازی…' : 'پاک‌سازی نسخه‌های قدیمی'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon="database-backup"
            disabled={Boolean(busy) || activeTask?.state === 'running'}
            onClick={openPreflightModal}
          >
            تهیه بکاپ دستی
          </Button>
        </div>
      )}
    />
  )

  if (loading && !data) {
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
        <MetricCard
          icon="hard-drive"
          iconTone="primary"
          label="مقصد پیش‌فرض ذخیره"
          value={policy.destination === 'hub' ? 'سرور ابری ما' : 'سرور وردپرس (هاست)'}
          hint={`سقف نگهداری: ${faNum(policy.retentionDays)} روز`}
        />
        <MetricCard
          icon="history"
          iconTone="neutral"
          label="بکاپ‌های امروز"
          value={`${faNum(backupsToday)} از ${faNum(policy.maxDaily)}`}
          hint={backupsToday >= policy.maxDaily ? 'سقف روزانه تکمیل است' : 'مجاز برای تهیه نسخه جدید'}
        />
        <MetricCard
          icon="database"
          iconTone="accent"
          label="فضای آزاد دیسک"
          value={preflightData?.free_disk_formatted || 'بررسی زنده'}
          hint={`سقف حجم پوشه: ${faNum(policy.maxStorageMb)} MB`}
        />
      </div>

      {/* Notifications / Alerts */}
      {successMsg && (
        <div style={{ padding: '11px 16px', background: 'var(--gd-success-subtle)', border: '1px solid var(--gd-success-border)', borderRadius: 'var(--gd-radius-md)', color: 'var(--gd-success)', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          {successMsg}
        </div>
      )}
      {error && (
        <div style={{ padding: '11px 16px', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', color: 'var(--gd-danger-text)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Schedule & Destination Quick Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)', padding: '16px 20px', marginBottom: 22 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="calendar-clock" size={21} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>سیاست نگهداری و ذخیره‌سازی خودکار</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>
            ذخیره روی {policy.destination === 'hub' ? 'سرور ابری دیجی‌دبلیوپی (بدون اشغال هاست)' : 'سرور وردپرس شما'} · حذف خودکار نسخه‌های قدیمی‌تر از {faNum(policy.retentionDays)} روز یا پس از پر شدن {faNum(policy.maxStorageMb)} مگابایت
          </div>
        </div>
        <Button size="sm" variant="subtle" onClick={() => setPolicyModal(true)}>
          تغییر سیاست
        </Button>
      </div>

      {/* Backups table */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>نسخه‌های پشتیبان موجود</span>
        <span style={{ fontSize: 12, color: 'var(--gd-text-muted)', fontWeight: 400 }}>
          {faNum(list.length)} نسخه ذخیره‌شده
        </span>
      </div>

      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>تاریخ و ساعت</span>
          <span>نوع و بخش‌ها</span>
          <span>محل ذخیره</span>
          <span>حجم</span>
          <span>وضعیت سلامت</span>
          <span />
        </div>

        {list.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13.5 }}>
            هیچ نسخه‌ای ذخیره نشده است. با دکمهٔ «تهیه بکاپ دستی» اولین بکاپ را ایجاد کنید.
          </div>
        ) : list.map((b, i) => {
          const preAction = b.type?.includes('پیش از اقدام') || b.type?.includes('pre-update')
          const isFilesZip = Boolean(b.files_file || b.files_bytes > 0)
          const targetLoc = b.destination === 'hub' ? 'سرور دیجی‌دبلیوپی' : b.destination === 's3' ? 'ابری S3' : 'سرور وردپرس'
          return (
            <div key={b.id || i} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '14px 20px', borderBottom: i < list.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none', fontSize: 13.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{b.date || b.when}</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2 }} className="dwp-mono">{b.time || b.id}</div>
              </div>

              <span>
                <Badge variant={preAction ? 'warning' : 'info'} appearance="soft">{b.type || 'دستی'}</Badge>
              </span>

              <span>
                <Badge variant={b.destination === 'hub' ? 'primary' : 'neutral'} appearance="soft">
                  {targetLoc}
                </Badge>
              </span>

              <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>{b.size || '—'}</span>

              <span>
                <Badge variant={b.tested === false ? 'danger' : 'success'} appearance="soft" dot>
                  {b.tested === false ? 'تأییدنشده' : 'کامل و سالم'}
                </Badge>
              </span>

              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon="download"
                  onClick={() => download(b.id, 'db')}
                  disabled={busy === `dl-${b.id}`}
                  title="دانلود مستقیم و سریع استریم SQL"
                >
                  {busy === `dl-${b.id}` ? 'دریافت…' : 'دانلود SQL'}
                </Button>
                {isFilesZip && (
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon="file-archive"
                    onClick={() => download(b.id, 'files')}
                    disabled={busy === `dl-${b.id}`}
                    title="دانلود فایل فشرده رسانه‌ها و افزونه‌ها"
                  >
                    دانلود ZIP
                  </Button>
                )}
                <Button size="sm" variant="subtle" leftIcon="rotate-ccw" onClick={() => setConfirming(b.id)} disabled={Boolean(busy) || activeTask?.state === 'running'}>
                  بازگردانی
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Policy & Storage Settings Modal */}
      {policyModal && (
        <Dialog
          title="تنظیمات ذخیره‌سازی، سقف روزانه و نگهداری بکاپ"
          isOpen={policyModal}
          onClose={() => setPolicyModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Storage Destination Selection */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>
                محل ذخیره‌سازی فایل‌های پشتیبان:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div
                  onClick={() => setPolicy({ ...policy, destination: 'local' })}
                  style={{
                    padding: '12px 14px',
                    border: `1.5px solid ${policy.destination === 'local' ? 'var(--gd-primary)' : 'var(--gd-border)'}`,
                    borderRadius: 'var(--gd-radius-md)',
                    background: policy.destination === 'local' ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: policy.destination === 'local' ? 'var(--gd-primary)' : 'var(--gd-text)' }}>
                    <input type="radio" checked={policy.destination === 'local'} onChange={() => {}} />
                    <span>روی سرور وردپرس (هاست خودتان)</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                    بکاپ‌ها در پوشه امن خارج از وب ذخیره می‌شوند و مستقیماً روی هاست سایت قرار دارند.
                  </div>
                </div>

                <div
                  onClick={() => setPolicy({ ...policy, destination: 'hub' })}
                  style={{
                    padding: '12px 14px',
                    border: `1.5px solid ${policy.destination === 'hub' ? 'var(--gd-primary)' : 'var(--gd-border)'}`,
                    borderRadius: 'var(--gd-radius-md)',
                    background: policy.destination === 'hub' ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: policy.destination === 'hub' ? 'var(--gd-primary)' : 'var(--gd-text)' }}>
                    <input type="radio" checked={policy.destination === 'hub'} onChange={() => {}} />
                    <span>روی سرور ابری دیجی‌دبلیوپی (سرور ما)</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                    بدون اشغال فضای دیسک هاست شما؛ فایل‌ها روی سرور ابری ما به صورت ایزوله نگهداری می‌شوند.
                  </div>
                </div>
              </div>
            </div>

            {/* Daily limit */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                حداکثر تعداد بکاپ در طول روز (سقف روزانه):
              </label>
              <select
                value={policy.maxDaily}
                onChange={(e) => setPolicy({ ...policy, maxDaily: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', fontSize: 13 }}
              >
                <option value={1}>۱ بار در روز</option>
                <option value={2}>۲ بار در روز</option>
                <option value={3}>۳ بار در روز</option>
                <option value={5}>۵ بار در روز (پیش‌فرض)</option>
                <option value={10}>۱۰ بار در روز</option>
                <option value={20}>۲۰ بار در روز</option>
              </select>
              <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', display: 'block', marginTop: 4 }}>
                برای جلوگیری از بار اضافی و مصرف مکرر منابع هاست در طول ۲۴ ساعت.
              </span>
            </div>

            {/* Retention Days */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                دوره نگهداری نسخه‌ها (حذف خودکار قدیمی‌تر از چند روز):
              </label>
              <select
                value={policy.retentionDays}
                onChange={(e) => setPolicy({ ...policy, retentionDays: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', fontSize: 13 }}
              >
                <option value={7}>۷ روز (۱ هفته)</option>
                <option value={14}>۱۴ روز (۲ هفته)</option>
                <option value={30}>۳۰ روز (۱ ماه - پیشنهادی)</option>
                <option value={60}>۶۰ روز (۲ ماه)</option>
                <option value={90}>۹۰ روز (۳ ماه)</option>
                <option value={180}>۱۸۰ روز (۶ ماه)</option>
              </select>
            </div>

            {/* Storage Quota & Auto Prune */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                سقف حجم کل پوشه بکاپ (حذف نسخه‌های قدیمی در صورت پر شدن):
              </label>
              <select
                value={policy.maxStorageMb}
                onChange={(e) => setPolicy({ ...policy, maxStorageMb: Number(e.target.value) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)', fontSize: 13 }}
              >
                <option value={500}>۵۰۰ مگابایت</option>
                <option value={1024}>۱ گیگابایت (۱۰۲۴ MB)</option>
                <option value={2048}>۲ گیگابایت (۲۰۴۸ MB - استاندارد)</option>
                <option value={5120}>۵ گیگابایت (۵۱۲۰ MB)</option>
                <option value={10240}>۱۰ گیگابایت (۱۰۲۴۰ MB)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--gd-bg-subtle)', borderRadius: 'var(--gd-radius-md)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>پاک‌سازی خودکار در زمان پر شدن سقف حجم</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>قدیمی‌ترین نسخه‌ها به طور هوشمند حذف می‌شوند تا هاست پر نشود.</div>
              </div>
              <Switch
                checked={policy.autoPruneOnFull}
                onChange={(e) => setPolicy({ ...policy, autoPruneOnFull: e.target.checked })}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="subtle" onClick={() => setPolicyModal(false)}>انصراف</Button>
              <Button
                variant="primary"
                leftIcon="save"
                disabled={savingPolicy}
                onClick={handleSavePolicy}
              >
                {savingPolicy ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
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
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>پشتیبان‌گیری ابری اختصاصی (S3 Storage)</h3>
              <Badge variant="primary" appearance="soft">رمزنگاری AES-256</Badge>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '4px 0 0 0' }}>
              انتقال مستقیم نسخه‌های پشتیبان به فضاهای ذخیره‌سازی ابری سازگار با پروتکل S3 (ابر آروان، لیارا، AWS S3، مین‌آی‌او)
            </p>
          </div>
          <Button
            size="sm"
            variant="subtle"
            leftIcon="plus"
            onClick={() => setTargetModal(true)}
          >
            افزودن مقصد S3
          </Button>
        </div>

        {offsiteTargets.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--gd-bg-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gd-text-muted)', marginBottom: 12 }}>
              <Icon name="cloud-off" size={22} />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--gd-text)' }}>هنوز مقصد ابری S3 اضافه نشده است</div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', maxWidth: 440, margin: '6px auto 16px auto', lineHeight: 1.6 }}>
              می‌توانید باکت‌های اختصاصی خود در ابر آروان، لیارا، یا آمازون را برای پشتیبان‌گیری ثانویه و ایزوله متصل کنید.
            </p>
            <Button size="sm" variant="subtle" leftIcon="plus" onClick={() => setTargetModal(true)}>
              پیکربندی باکت S3
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
                      <Badge variant={target.status === 'active' ? 'success' : 'neutral'} appearance="soft" dot>
                        {target.status === 'active' ? 'فعال' : 'غیرفعال'}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginBottom: 4 }} className="dwp-mono">
                      {target.endpoint}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--gd-text-secondary)' }}>
                      منطقه: <span className="dwp-mono">{target.region}</span> · نگهداری: {faNum(target.retentionDays)} روز
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
                      حذف
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      leftIcon="cloud-upload"
                      onClick={() => syncOffsiteNow(target.id)}
                      disabled={busy === 'offsite-sync' || activeTask?.state === 'running'}
                    >
                      همگام‌سازی فوری
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Offsite Jobs History */}
            {offsiteJobs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--gd-text)' }}>
                  تاریخچه آخرین انتقال‌های ابری:
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
                          {job.status === 'done' ? 'موفق' : job.status === 'failed' ? 'ناموفق' : 'در حال انتقال'}
                        </Badge>
                        <span className="dwp-mono" style={{ color: 'var(--gd-text-secondary)' }}>
                          {new Date(job.createdAt).toLocaleString('fa-IR')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {job.sizeBytes && (
                          <span className="dwp-mono" style={{ color: 'var(--gd-text-muted)' }}>
                            {faNum((job.sizeBytes / (1024 * 1024)).toFixed(1))} MB
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
          title="پیکربندی مقصد ذخیره‌سازی ابری (S3)"
          isOpen={targetModal}
          onClose={() => setTargetModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.6 }}>
              مشخصات باکت سازگار با S3 خود را وارد کنید. کلیدهای امنیتی به صورت رمزنگاری‌شده (AES-256-GCM) ذخیره می‌شوند.
            </p>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>نشانی اندپوینت S3 (Endpoint URL):</label>
              <input
                type="text"
                placeholder="https://s3.ir-thr-at1.arvanstorage.ir یا https://s3.amazonaws.com"
                value={newTarget.endpoint}
                onChange={(e) => setNewTarget({ ...newTarget, endpoint: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>نام باکت (Bucket Name):</label>
                <input
                  type="text"
                  placeholder="my-wordpress-backups"
                  value={newTarget.bucket}
                  onChange={(e) => setNewTarget({ ...newTarget, bucket: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>منطقه (Region):</label>
                <input
                  type="text"
                  placeholder="us-east-1 یا ir-thr-at1"
                  value={newTarget.region}
                  onChange={(e) => setNewTarget({ ...newTarget, region: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>شناسه کلید دسترسی (Access Key ID):</label>
              <input
                type="text"
                placeholder="AKIAIOSFODNN7EXAMPLE"
                value={newTarget.accessKeyId}
                onChange={(e) => setNewTarget({ ...newTarget, accessKeyId: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>کلید محرمانه (Secret Access Key):</label>
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
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>پیشوند مسیر (Path Prefix):</label>
                <input
                  type="text"
                  placeholder="backups/site1"
                  value={newTarget.pathPrefix}
                  onChange={(e) => setNewTarget({ ...newTarget, pathPrefix: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 13, direction: 'ltr', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>دوره نگهداری (روز):</label>
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
              <Button variant="subtle" onClick={() => setTargetModal(false)}>انصراف</Button>
              <Button
                variant="primary"
                leftIcon="save"
                disabled={!newTarget.endpoint || !newTarget.bucket || !newTarget.accessKeyId || !newTarget.secretAccessKey || busy === 'saving-target'}
                onClick={saveTarget}
              >
                ذخیره مقصد ابری
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Preflight & Section Selection Modal */}
      {preflightModal && (
        <Dialog
          title="تهیه نسخه پشتیبان سفارشی"
          isOpen={preflightModal}
          onClose={() => setPreflightModal(false)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Storage Destination Selection */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                محل ذخیره این نسخه پشتیبان:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div
                  onClick={() => setSelectedDestination('local')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--gd-radius-md)',
                    border: `1.5px solid ${selectedDestination === 'local' ? 'var(--gd-primary)' : 'var(--gd-border)'}`,
                    background: selectedDestination === 'local' ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: selectedDestination === 'local' ? 'var(--gd-primary)' : 'var(--gd-text)' }}>
                    سرور وردپرس (هاست محلی)
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>ذخیره روی فضای هاست سایت</div>
                </div>

                <div
                  onClick={() => setSelectedDestination('hub')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--gd-radius-md)',
                    border: `1.5px solid ${selectedDestination === 'hub' ? 'var(--gd-primary)' : 'var(--gd-border)'}`,
                    background: selectedDestination === 'hub' ? 'var(--gd-primary-subtle)' : 'var(--gd-bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: selectedDestination === 'hub' ? 'var(--gd-primary)' : 'var(--gd-text)' }}>
                    سرور ابری دیجی‌دبلیوپی
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 2 }}>بدون اشغال فضای هاست شما</div>
                </div>
              </div>
            </div>

            {/* Host Disk Space Card */}
            {selectedDestination === 'local' && (
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
                    ? 'فضای خالی دیسک هاست شما برای این حجم از بکاپ کافی نیست. پیشنهاد می‌شود مقصد ذخیره را «سرور ابری دیجی‌دبلیوپی» انتخاب نمایید.'
                    : 'فضای هاست به صورت زنده بررسی شد و برای ایجاد بکاپ انتخابی کاملاً مناسب است.'}
                </p>
              </div>
            )}

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
