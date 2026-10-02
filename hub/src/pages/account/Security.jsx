import { useEffect, useState, useCallback } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Badge, Button, AlertCard, Toast, Input } from '../../components/index.js'
import { auth as authApi, setToken, ApiError } from '../../lib/api.js'

/** فارسی، تاریخ + ساعت. */
const fmtDateTime = (ts) => new Date(ts).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })
const fmtDate = (ts) => new Date(ts).toLocaleDateString('fa-IR')

/**
 * «Chrome روی Windows» → مانیتور، «… Android/iOS …» → موبایل. فقط برای انتخاب
 * آیکون؛ خودِ متن دستگاه همان خلاصهٔ سمت سرور است و دست‌نخورده می‌ماند.
 */
const deviceIcon = (device) => (/Android|iOS|iPhone|iPad/.test(device) ? 'smartphone' : 'monitor')

/**
 * Express answers an unmounted route with a bare «Not Found»; show what is
 * actually missing instead of that English fragment. A server-provided
 * message (نشست پیدا نشد، …) still wins.
 */
function describeApiError(e, fallback, notFound) {
  if (e instanceof ApiError) {
    if (e.status === 404 && (!e.message || e.message === 'Not Found')) return notFound
    if (e.message) return e.message
  }
  return fallback
}

/**
 * این صفحه پشت یک نشست زنده باز می‌شود؛ اگر همان نشست وسط کار ریوک شده باشد
 * (از دستگاهی دیگر، یا با «خروج از دستگاه‌های دیگر»)، کلاینت به‌جای نمایش خطا
 * همان مسیر جهانی ۴۰۱ را می‌رود: پاک‌کردن توکن و پرش به ورود با حفظ مقصد.
 * «/auth/*» در http() عمداً ۴۰۱ را به‌صورت خطا پرتاب می‌کند (قرارداد فرم‌های
 * ورود/بازنشانی)؛ مدیریتش همین‌جاست.
 */
function handleSessionGone(e) {
  if (e instanceof ApiError && e.status === 401) {
    sessionStorage.setItem('loginReturnTo', '/app/security')
    setToken('')
    window.location.replace('/login')
    return true
  }
  return false
}

/** مقدار در یک فیلد فقط‌خواندنی LTR، با دکمهٔ کپی — برای secret و otpauth URI. */
function SecretField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API همه‌جا در دسترس نیست (مثلاً بدون HTTPS)؛ کاربر همچنان
      // می‌تواند متن را از فیلد فقط‌خواندنی دستی انتخاب و کپی کند.
    }
  }
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', marginBottom: 6 }}>{label}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          readOnly
          value={value}
          dir="ltr"
          onFocus={(e) => e.target.select()}
          style={{
            flex: 1, minWidth: 0, fontFamily: 'var(--gd-font-mono)', fontSize: 12,
            padding: '8px 10px', borderRadius: 'var(--gd-radius-md)',
            border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)',
            color: 'var(--gd-text-primary)', overflowWrap: 'anywhere',
          }}
        />
        <Button variant="ghost" size="sm" leftIcon={copied ? 'check' : 'copy'} onClick={copy} type="button">
          {copied ? 'کپی شد' : 'کپی'}
        </Button>
      </span>
    </label>
  )
}

/**
 * بخش «ورود دو مرحله‌ای» — راه‌اندازی TOTP با اپلیکیشن احراز هویت، نمایش
 * یک‌بارهٔ کدهای بازیابی، و غیرفعال‌سازی پشت رمز فعلی + کد. وضعیت از
 * /auth/2fa/status می‌آید، نه از پرچم user.twoFactor: همان جدولی که سرور
 * با آن ورود را می‌سنجد، تنها منبعِ راستگوی «فعال است یا نه» است.
 */
function TwoFactorSection() {
  const [status, setStatus] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // 'setup': secret + otpauth نمایش داده شده و فرم کد باز است.
  // 'recovery': کدهای بازیابی همین یک بار در حال نمایش‌اند.
  const [stage, setStage] = useState('idle')
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [disOpen, setDisOpen] = useState(false)
  const [disPassword, setDisPassword] = useState('')
  const [disCode, setDisCode] = useState('')
  const [toast, setToast] = useState(null)

  const showToast = (title, tone = 'success') => {
    setToast({ title, tone })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(() => {
    authApi.twoFactorStatus()
      .then((s) => setStatus(s || { enabled: false, pending: false, recoveryCodesLeft: 0 }))
      .catch((e) => {
        if (!handleSessionGone(e)) setLoadError(describeApiError(e, 'بارگذاری وضعیت ورود دو مرحله‌ای با خطا مواجه شد.', 'وضعیت ورود دو مرحله‌ای هنوز روی سرور فعال نشده است.'))
      })
  }, [])

  useEffect(() => { load() }, [load])

  const startSetup = async () => {
    setBusy(true); setErr('')
    try {
      const s = await authApi.twoFactorSetup()
      setSetup(s)
      setCode('')
      setStage('setup')
    } catch (e) {
      if (!handleSessionGone(e)) setErr(describeApiError(e, 'شروع راه‌اندازی ناموفق بود.', 'راه‌اندازی ورود دو مرحله‌ای هنوز روی سرور فعال نشده است.'))
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    setBusy(true); setErr('')
    try {
      const r = await authApi.twoFactorActivate({ code })
      setStage('recovery')
      setRecoveryCodes(r?.recoveryCodes || [])
      setCode('')
      load()
    } catch (e) {
      if (!handleSessionGone(e)) setErr(describeApiError(e, 'فعال‌سازی ناموفق بود.', 'فعال‌سازی ورود دو مرحله‌ای هنوز روی سرور فعال نشده است.'))
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true); setErr('')
    try {
      await authApi.twoFactorDisable({ password: disPassword, code: disCode })
      setDisOpen(false); setDisPassword(''); setDisCode('')
      setStage('idle'); setSetup(null)
      showToast('ورود دو مرحله‌ای غیرفعال شد.')
      load()
    } catch (e) {
      if (!handleSessionGone(e)) setErr(describeApiError(e, 'غیرفعال‌سازی ناموفق بود.', 'غیرفعال‌سازی ورود دو مرحله‌ای هنوز روی سرور فعال نشده است.'))
    } finally {
      setBusy(false)
    }
  }

  const finishRecovery = () => {
    // کدها فقط همین یک بار نمایش داده می‌شوند؛ بستن همین‌جا یعنی هیچ نسخه‌ای
    // از آن‌ها نه در state می‌ماند و نه دوباره گرفته نمی‌شود.
    setRecoveryCodes(null)
    setStage('idle')
    setSetup(null)
  }

  const loading = status === null && !loadError

  return (
    <div className="dwp-card" style={{ marginBottom: 22 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="shield-check" size={17} /> ورود دو مرحله‌ای
        {status?.enabled && <Badge variant="success" appearance="soft" icon="check-circle-2">فعال</Badge>}
        {status && !status.enabled && status.pending && <Badge variant="warning" appearance="soft">راه‌اندازی نیمه‌تمام</Badge>}
        {status?.enabled && (
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => { setDisOpen((v) => !v); setErr('') }} type="button">
              {disOpen ? 'بستن' : 'غیرفعال‌سازی'}
            </Button>
          </span>
        )}
        {!status?.enabled && !loading && !loadError && stage !== 'setup' && (
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="secondary" size="sm" leftIcon="key-round" loading={busy} onClick={startSetup} type="button">
              {/* یک راه‌اندازی نیمه‌تمامِ قبلی، secretش را دوباره نشان نمی‌دهد —
                  دکمه همیشه secret تازه می‌سازد و قدیمی جای خود را می‌دهد. */}
              راه‌اندازی
            </Button>
          </span>
        )}
      </div>

      <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gd-text-secondary)', lineHeight: 1.9 }}>
        {loading && <span style={{ color: 'var(--gd-text-muted)' }}>در حال بارگذاری وضعیت…</span>}

        {!loading && loadError && (
          <AlertCard severity="critical" title="خطا" desc={loadError}
            actions={(
              <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setLoadError(null); load() }} type="button">
                تلاش دوباره
              </Button>
            )} />
        )}

        {!loading && !loadError && stage === 'idle' && !status?.enabled && !status?.pending && (
          <p style={{ margin: 0 }}>
            با فعال‌کردن ورود دو مرحله‌ای، علاوه بر رمز عبور، یک کد شش‌رقمی از اپلیکیشن احراز هویت
            (Google Authenticator، Authy و…) خواسته می‌شود. هشت کد بازیابی یک‌مصرف هم دریافت می‌کنید
            برای زمانی که به اپلیکیشن دسترسی ندارید.
          </p>
        )}

        {!loading && !loadError && stage === 'idle' && status?.enabled && (
          <p style={{ margin: 0 }}>
            ورود به حساب علاوه بر رمز عبور به کد اپلیکیشن احراز هویت نیاز دارد.
            {status.recoveryCodesLeft === 0
              ? ' همهٔ کدهای بازیابی مصرف شده‌اند؛ اگر دسترسی به اپلیکیشن را از دست بدهید، بازیابی حساب فقط از راه پشتیبانی ممکن می‌شود.'
              : ` ${Number(status.recoveryCodesLeft).toLocaleString('fa-IR')} کد بازیابی یک‌مصرف باقی مانده است.`}
          </p>
        )}

        {!loading && !loadError && stage === 'setup' && setup && (
          <>
            <p style={{ marginTop: 0 }}>
              این secret را در اپلیکیشن احراز هویت وارد کنید یا URI آن را اسکن/افزودن کنید، سپس کد
              شش‌رقمیِ فعلی را برای تأیید وارد کنید:
            </p>
            <SecretField label="کلید (secret) برای ورود دستی" value={setup.secret} />
            <SecretField label="otpauth URI برای افزودن به اپلیکیشن" value={setup.otpauth} />
            <div style={{ maxWidth: 260, marginTop: 14 }}>
              <Input
                label="کد شش‌رقمی اپلیکیشن"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" leftIcon="check" loading={busy} disabled={!code.trim()} onClick={activate} type="button">
                فعال‌سازی
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStage('idle'); setSetup(null); setErr('') }} type="button">
                انصراف
              </Button>
            </div>
          </>
        )}

        {!loading && !loadError && stage === 'recovery' && recoveryCodes && (
          <>
            <AlertCard
              severity="warning"
              title="این کدها فقط همین یک بار نمایش داده می‌شوند"
              desc="هر کد فقط یک‌بار کار می‌کند و پس از بستن این بخش دیگر قابل دیدن نیست. آن‌ها را جایی امن ذخیره کنید — هر کد جای کد اپلیکیشن، یک‌بار، هنگام ورود پذیرفته می‌شود."
            />
            <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, margin: '14px 0' }}>
              {recoveryCodes.map((c) => (
                <span key={c} style={{
                  fontFamily: 'var(--gd-font-mono)', fontSize: 14, letterSpacing: 1,
                  padding: '8px 12px', borderRadius: 'var(--gd-radius-md)',
                  border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)',
                  textAlign: 'center',
                }}>
                  {c}
                </span>
              ))}
            </div>
            <Button variant="primary" size="sm" leftIcon="check" onClick={finishRecovery} type="button">
              ذخیره کردم
            </Button>
          </>
        )}

        {!loading && !loadError && stage === 'idle' && status?.enabled && disOpen && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 14 }}>
            <p style={{ marginTop: 0 }}>
              برای غیرفعال‌سازی، رمز عبور فعلی و یک کد معتبر (اپلیکیشن یا بازیابی) لازم است:
            </p>
            <div style={{ maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input label="رمز عبور فعلی" type="password" value={disPassword} onChange={(e) => setDisPassword(e.target.value)} autoComplete="current-password" required />
              <Input label="کد تأیید دومرحله‌ای" value={disCode} onChange={(e) => setDisCode(e.target.value)} dir="ltr" inputMode="numeric" autoComplete="one-time-code" required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="danger" size="sm" loading={busy} disabled={!disPassword || !disCode.trim()} onClick={disable} type="button">
                غیرفعال‌سازی ورود دو مرحله‌ای
              </Button>
            </div>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 12 }}>
            <AlertCard severity="critical" title="خطا" desc={err} />
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 100 }}>
          <Toast tone={toast.tone} title={toast.title} />
        </div>
      )}
    </div>
  )
}

export default function Security() {  const [sessions, setSessions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionBusy, setActionBusy] = useState({})
  const [toast, setToast] = useState(null)

  const showToast = (title, tone = 'success') => {
    setToast({ title, tone })
    setTimeout(() => setToast(null), 3000)
  }

  // همهٔ setStateها داخل callbackهای پرامیس می‌نشینند، نه در بدنهٔ همگامِ
  // load — همان قاعدهٔ react-hooks/set-state-in-effect که صفحات همسایه هم
  // رعایت می‌کنند. بار اول، loading از ابتدای state همان true است.
  const load = useCallback(() => {
    authApi.sessions()
      .then((d) => setSessions(d?.sessions || []))
      .catch((e) => {
        if (!handleSessionGone(e)) {
          setError(describeApiError(e, 'بارگذاری نشست‌ها با خطا مواجه شد.', 'فهرست نشست‌ها هنوز روی سرور فعال نشده است.'))
          setSessions(null)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const reload = () => {
    setSessions(null)
    setError(null)
    load()
  }

  /** خروج یک دستگاه. اگر نشست جاری باشد، توکن همین مرورگر هم تمام است. */
  const revoke = async (s) => {
    if (s.current && !window.confirm('در حال خروج از همین دستگاه هستید. ادامه می‌دهید؟')) return
    setActionBusy((b) => ({ ...b, [s.id]: true }))
    try {
      await authApi.revokeSession(s.id)
      if (s.current) {
        sessionStorage.setItem('loginReturnTo', '/app/security')
        setToken('')
        window.location.replace('/login')
        return
      }
      showToast('دستگاه از حساب خارج شد.')
      reload()
    } catch (e) {
      if (!handleSessionGone(e)) setError(describeApiError(e, 'خروج دستگاه ناموفق بود.', 'خروج دستگاه هنوز روی سرور فعال نشده است.'))
    } finally {
      setActionBusy((b) => ({ ...b, [s.id]: false }))
    }
  }

  const revokeOthers = async () => {
    const count = (sessions || []).filter((s) => !s.current).length
    if (!count) return
    if (!window.confirm(`از همهٔ دستگاه‌های دیگر (${count.toLocaleString('fa-IR')} دستگاه) خارج می‌شوید. ادامه می‌دهید؟`)) return
    setActionBusy((b) => ({ ...b, others: true }))
    try {
      const r = await authApi.revokeOtherSessions()
      showToast(`${Number(r?.revoked ?? count).toLocaleString('fa-IR')} دستگاه دیگر از حساب خارج شد.`)
      reload()
    } catch (e) {
      if (!handleSessionGone(e)) setError(describeApiError(e, 'خروج از دستگاه‌های دیگر ناموفق بود.', 'این کار هنوز روی سرور فعال نشده است.'))
    } finally {
      setActionBusy((b) => ({ ...b, others: false }))
    }
  }

  const otherCount = (sessions || []).filter((s) => !s.current).length

  const head = (
    <PageHead
      title="امنیت حساب"
      subtitle="دستگاه‌هایی که اکنون به این حساب واردند، و ورود دو مرحله‌ای"
      action={(
        <Button
          variant="secondary"
          size="sm"
          leftIcon="log-out"
          loading={!!actionBusy.others}
          disabled={loading || !sessions || otherCount === 0}
          onClick={revokeOthers}
        >
          خروج از دستگاه‌های دیگر
        </Button>
      )}
    />
  )

  if (error) {
    return (
      <>
        {head}
        <AlertCard
          severity="critical"
          title="خطا"
          desc={error}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setError(null); reload() }}>
              تلاش دوباره
            </Button>
          )}
        />
      </>
    )
  }

  if (loading || !sessions) {
    return (
      <>
        {head}
        <div style={{ color: 'var(--gd-text-muted)', padding: '18px 0' }}>
          در حال بارگذاری نشست‌ها…
        </div>
      </>
    )
  }

  return (
    <>
      {head}

      {sessions.length === 0 && (
        <AlertCard
          severity="info"
          title="نشست فعالی یافت نشد"
          desc="اگر همین حالا وارد حساب شده‌اید، این وضعیت یعنی فهرست نشست‌ها از سرور خالی برگشته است."
        />
      )}

      {/* یک نشست فعال (همین دستگاه) — گفتنی است، نه بی‌صدا */}
      {sessions.length === 1 && sessions[0].current && (
        <AlertCard
          severity="info"
          title="تنها همین دستگاه به حساب وارد است"
          desc="هر جا نشست تازه‌ای باز شود، همین‌جا با نام دستگاه، IP و زمان آخرین فعالیت فهرست می‌شود."
        />
      )}

      <div className="dwp-card" style={{ marginBottom: 22 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="monitor-smartphone" size={17} /> دستگاه‌های واردشده ({sessions.length.toLocaleString('fa-IR')})
        </div>
        {sessions.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center',
              padding: '14px 20px',
              borderBottom: i < sessions.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none',
              fontSize: 13.5,
              background: s.current ? 'var(--gd-bg-subtle)' : 'transparent',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 210, flex: '1 1 210px' }}>
              <span style={{
                width: 38, height: 38, borderRadius: 'var(--gd-radius-md)', flex: '0 0 auto',
                background: s.current ? 'var(--gd-primary)' : 'var(--gd-bg-subtle)',
                color: s.current ? '#fff' : 'var(--gd-text-secondary)',
                border: s.current ? 'none' : '1px solid var(--gd-border)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={deviceIcon(s.device)} size={18} />
              </span>
              <span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700 }}>{s.device}</span>
                  {s.current && <Badge variant="primary" appearance="soft" icon="check-circle-2">نشست جاری</Badge>}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }} dir="ltr">
                  {s.ip || 'IP نامشخص'}
                </span>
              </span>
            </span>

            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: 'var(--gd-text-secondary)', flex: '1 1 240px' }}>
              <span>آخرین فعالیت: {fmtDateTime(s.lastSeenAt)}</span>
              <span style={{ color: 'var(--gd-text-muted)' }}>
                ورود: {fmtDate(s.createdAt)} · اعتبار تا {fmtDate(s.expiresAt)}
              </span>
            </span>

            <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <Button
                variant="ghost"
                size="sm"
                leftIcon="log-out"
                loading={!!actionBusy[s.id]}
                onClick={() => revoke(s)}
              >
                {s.current ? 'خروج از این دستگاه' : 'خروج'}
              </Button>
            </span>
          </div>
        ))}
      </div>

      {/* ورود دو مرحله‌ای — فعال‌سازی، کدهای بازیابی یک‌مصرف، غیرفعال‌سازی */}
      <TwoFactorSection />

      <div className="dwp-card" style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gd-text-secondary)', lineHeight: 1.9 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="shield-check" size={16} /> چه چیزی این صفحه تضمین می‌کند؟
        </div>
        خروج یک دستگاه، نشست آن را روی سرور باطل می‌کند؛ حتی اگر توکن آن دستگاه پیش‌تر کپی شده باشد، دیگر پذیرفته نمی‌شود.
        «آخرین فعالیت» هر دستگاه از ترافیک واقعی همان نشست ثبت می‌شود. اگر دستگاهی را نمی‌شناسید، از آن خارج شوید و
        برای امنیت بیشتر، از دکمهٔ «فراموشی رمز عبور» در صفحهٔ ورود، رمز تازه‌ای برای حساب خود بفرستید.
      </div>

      {toast && (
        <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 100 }}>
          <Toast tone={toast.tone} title={toast.title} />
        </div>
      )}
    </>
  )
}
