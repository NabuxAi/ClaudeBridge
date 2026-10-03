import { useEffect, useState, useCallback } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Badge, Button, AlertCard, Toast, Input } from '../../components/index.js'
import { auth as authApi, setToken, ApiError } from '../../lib/api.js'
import { t, date, dateTime } from '../../lib/i18n.js'

/** Date + time in the active locale. */
const fmtDateTime = (ts) => dateTime(ts, { dateStyle: 'short', timeStyle: 'short' })
const fmtDate = (ts) => date(ts)

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
          {copied ? t('common.copied') : t('common.copy')}
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
        if (!handleSessionGone(e)) setLoadError(describeApiError(e, t('accountSecurity.twoFactor.loadError'), t('accountSecurity.twoFactor.loadNotFound')))
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
      if (!handleSessionGone(e)) setErr(describeApiError(e, t('accountSecurity.twoFactor.setupError'), t('accountSecurity.twoFactor.setupNotFound')))
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
      if (!handleSessionGone(e)) setErr(describeApiError(e, t('accountSecurity.twoFactor.activateError'), t('accountSecurity.twoFactor.activateNotFound')))
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
      showToast(t('accountSecurity.twoFactor.disabledToast'))
      load()
    } catch (e) {
      if (!handleSessionGone(e)) setErr(describeApiError(e, t('accountSecurity.twoFactor.disableError'), t('accountSecurity.twoFactor.disableNotFound')))
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
        <Icon name="shield-check" size={17} /> {t('accountSecurity.twoFactor.title')}
        {status?.enabled && <Badge variant="success" appearance="soft" icon="check-circle-2">{t('accountSecurity.twoFactor.active')}</Badge>}
        {status && !status.enabled && status.pending && <Badge variant="warning" appearance="soft">{t('accountSecurity.twoFactor.pending')}</Badge>}
        {status?.enabled && (
          <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => { setDisOpen((v) => !v); setErr('') }} type="button">
              {disOpen ? t('common.close') : t('accountSecurity.twoFactor.disable')}
            </Button>
          </span>
        )}
        {!status?.enabled && !loading && !loadError && stage !== 'setup' && (
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="secondary" size="sm" leftIcon="key-round" loading={busy} onClick={startSetup} type="button">
              {/* یک راه‌اندازی نیمه‌تمامِ قبلی، secretش را دوباره نشان نمی‌دهد —
                  دکمه همیشه secret تازه می‌سازد و قدیمی جای خود را می‌دهد. */}
              {t('accountSecurity.twoFactor.setup')}
            </Button>
          </span>
        )}
      </div>

      <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gd-text-secondary)', lineHeight: 1.9 }}>
        {loading && <span style={{ color: 'var(--gd-text-muted)' }}>{t('accountSecurity.twoFactor.loadingStatus')}</span>}

        {!loading && loadError && (
          <AlertCard severity="critical" title={t('accountSecurity.error')} desc={loadError}
            actions={(
              <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setLoadError(null); load() }} type="button">
                {t('common.retry')}
              </Button>
            )} />
        )}

        {!loading && !loadError && stage === 'idle' && !status?.enabled && !status?.pending && (
          <p style={{ margin: 0 }}>
            {t('accountSecurity.twoFactor.intro')}
          </p>
        )}

        {!loading && !loadError && stage === 'idle' && status?.enabled && (
          <p style={{ margin: 0 }}>
            {t('accountSecurity.twoFactor.enabledIntro')}{' '}
            {status.recoveryCodesLeft === 0
              ? t('accountSecurity.twoFactor.noCodesLeft')
              : t('accountSecurity.twoFactor.codesLeft', { count: Number(status.recoveryCodesLeft) })}
          </p>
        )}

        {!loading && !loadError && stage === 'setup' && setup && (
          <>
            <p style={{ marginTop: 0 }}>
              {t('accountSecurity.twoFactor.setupIntro')}
            </p>
            <SecretField label={t('accountSecurity.twoFactor.secretLabel')} value={setup.secret} />
            <SecretField label={t('accountSecurity.twoFactor.uriLabel')} value={setup.otpauth} />
            <div style={{ maxWidth: 260, marginTop: 14 }}>
              <Input
                label={t('accountSecurity.twoFactor.codeLabel')}
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
                {t('accountSecurity.twoFactor.activate')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setStage('idle'); setSetup(null); setErr('') }} type="button">
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        {!loading && !loadError && stage === 'recovery' && recoveryCodes && (
          <>
            <AlertCard
              severity="warning"
              title={t('accountSecurity.twoFactor.recoveryTitle')}
              desc={t('accountSecurity.twoFactor.recoveryDesc')}
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
              {t('accountSecurity.twoFactor.savedThem')}
            </Button>
          </>
        )}

        {!loading && !loadError && stage === 'idle' && status?.enabled && disOpen && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 14 }}>
            <p style={{ marginTop: 0 }}>
              {t('accountSecurity.twoFactor.disableIntro')}
            </p>
            <div style={{ maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input label={t('accountSecurity.twoFactor.currentPassword')} type="password" value={disPassword} onChange={(e) => setDisPassword(e.target.value)} autoComplete="current-password" required />
              <Input label={t('accountSecurity.twoFactor.verifyCode')} value={disCode} onChange={(e) => setDisCode(e.target.value)} dir="ltr" inputMode="numeric" autoComplete="one-time-code" required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="danger" size="sm" loading={busy} disabled={!disPassword || !disCode.trim()} onClick={disable} type="button">
                {t('accountSecurity.twoFactor.disableSubmit')}
              </Button>
            </div>
          </div>
        )}

        {err && (
          <div style={{ marginTop: 12 }}>
            <AlertCard severity="critical" title={t('accountSecurity.error')} desc={err} />
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

export default function Security() {
  const [sessions, setSessions] = useState(null)
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
          setError(describeApiError(e, t('accountSecurity.sessions.loadError'), t('accountSecurity.sessions.loadNotFound')))
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
    if (s.current && !window.confirm(t('accountSecurity.sessions.confirmCurrent'))) return
    setActionBusy((b) => ({ ...b, [s.id]: true }))
    try {
      await authApi.revokeSession(s.id)
      if (s.current) {
        sessionStorage.setItem('loginReturnTo', '/app/security')
        setToken('')
        window.location.replace('/login')
        return
      }
      showToast(t('accountSecurity.sessions.revoked'))
      reload()
    } catch (e) {
      if (!handleSessionGone(e)) setError(describeApiError(e, t('accountSecurity.sessions.revokeError'), t('accountSecurity.sessions.revokeNotFound')))
    } finally {
      setActionBusy((b) => ({ ...b, [s.id]: false }))
    }
  }

  const revokeOthers = async () => {
    const count = (sessions || []).filter((s) => !s.current).length
    if (!count) return
    if (!window.confirm(t('accountSecurity.sessions.confirmOthers', { count }))) return
    setActionBusy((b) => ({ ...b, others: true }))
    try {
      const r = await authApi.revokeOtherSessions()
      showToast(t('accountSecurity.sessions.othersRevoked', { count: Number(r?.revoked ?? count) }))
      reload()
    } catch (e) {
      if (!handleSessionGone(e)) setError(describeApiError(e, t('accountSecurity.sessions.othersError'), t('accountSecurity.sessions.othersNotFound')))
    } finally {
      setActionBusy((b) => ({ ...b, others: false }))
    }
  }

  const otherCount = (sessions || []).filter((s) => !s.current).length

  const head = (
    <PageHead
      title={t('accountSecurity.title')}
      subtitle={t('accountSecurity.subtitle')}
      action={(
        <Button
          variant="secondary"
          size="sm"
          leftIcon="log-out"
          loading={!!actionBusy.others}
          disabled={loading || !sessions || otherCount === 0}
          onClick={revokeOthers}
        >
          {t('accountSecurity.sessions.signOutOthers')}
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
          title={t('accountSecurity.error')}
          desc={error}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setError(null); reload() }}>
              {t('common.retry')}
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
          {t('accountSecurity.sessions.loading')}
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
          title={t('accountSecurity.sessions.emptyTitle')}
          desc={t('accountSecurity.sessions.emptyDesc')}
        />
      )}

      {/* یک نشست فعال (همین دستگاه) — گفتنی است، نه بی‌صدا */}
      {sessions.length === 1 && sessions[0].current && (
        <AlertCard
          severity="info"
          title={t('accountSecurity.sessions.onlyThisTitle')}
          desc={t('accountSecurity.sessions.onlyThisDesc')}
        />
      )}

      <div className="dwp-card" style={{ marginBottom: 22 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="monitor-smartphone" size={17} /> {t('accountSecurity.sessions.listTitle', { n: sessions.length })}
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
                  {s.current && <Badge variant="primary" appearance="soft" icon="check-circle-2">{t('accountSecurity.sessions.current')}</Badge>}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }} dir="ltr">
                  {s.ip || t('accountSecurity.sessions.unknownIp')}
                </span>
              </span>
            </span>

            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: 'var(--gd-text-secondary)', flex: '1 1 240px' }}>
              <span>{t('accountSecurity.sessions.lastActive', { when: fmtDateTime(s.lastSeenAt) })}</span>
              <span style={{ color: 'var(--gd-text-muted)' }}>
                {t('accountSecurity.sessions.signedIn', { created: fmtDate(s.createdAt), expires: fmtDate(s.expiresAt) })}
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
                {s.current ? t('accountSecurity.sessions.signOutThis') : t('accountSecurity.sessions.signOut')}
              </Button>
            </span>
          </div>
        ))}
      </div>

      {/* ورود دو مرحله‌ای — فعال‌سازی، کدهای بازیابی یک‌مصرف، غیرفعال‌سازی */}
      <TwoFactorSection />

      <div className="dwp-card" style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gd-text-secondary)', lineHeight: 1.9 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="shield-check" size={16} /> {t('accountSecurity.guarantee.title')}
        </div>
        {t('accountSecurity.guarantee.body')}
      </div>

      {toast && (
        <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 100 }}>
          <Toast tone={toast.tone} title={toast.title} />
        </div>
      )}
    </>
  )
}
