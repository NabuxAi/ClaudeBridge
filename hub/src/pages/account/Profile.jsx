import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select, AlertCard, Dialog } from '../../components/index.js'
import { account, setToken } from '../../lib/api.js'
import Trans from '../../components/Trans.jsx'
import { t, LANGS, getLang } from '../../lib/i18n.js'
import { useI18n } from '../../lib/I18nProvider.jsx'

export default function Profile() {
  // The phrase the user types to confirm deletion (same pattern as the
  // backup-restore confirmation), in the active UI language.
  const DELETE_PHRASE = t('profile.delete.phrase')
  const { setLang } = useI18n()
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    account.profile()
      .then((d) => {
        if (!alive) return
        setData(d)
        // بدون کلید «twoFactor»: از این موج، وضعیت ورود دومرحله‌ای فقط از
        // راه /auth/2fa/* در «امنیت حساب» تغییر می‌کند و یک ذخیرهٔ پروفایل
        // نباید بتواند پرچمی را جابه‌جا کند که secretی پشتش نیست.
        // The language select starts on the language the panel is showing now.
        setForm({ name: d.name || '', lang: getLang(), timezone: d.timezone || 'Asia/Tehran' })
      })
      .catch((e) => {
        // A failed request must not leave the page hung on the empty header.
        if (alive) setLoadError(e?.message || t('profile.loadFailed'))
      })
    return () => { alive = false }
  }, [reloadKey])

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(''); }

  async function save() {
    setSaving(true); setError(''); setSaved('')
    try {
      const next = await account.saveProfile(form)
      setData((d) => ({ ...d, ...next }))
      setSaved(t('profile.saved'))
      // Apply the chosen language only after the save succeeded. setLang
      // remounts the app in the new language (and persists it to the account).
      if (form.lang !== getLang()) await setLang(form.lang)
    } catch (e) {
      setError(e?.message || t('profile.saveFailed'))
    } finally { setSaving(false) }
  }

  // ---- حذف حساب -------------------------------------------------------------
  // تأیید دومرحله‌ای (عبارت تایپ‌شده + رمز فعلی) و خروج تمیز به /goodbye بعد
  // از موفقیت. پنجرهٔ تأیید عمداً پشت رمز است: نشست دزدیده‌شده بدون رمز فعلی
  // نمی‌تواند حساب را بسوزاند.
  const [delOpen, setDelOpen] = useState(false)
  const [delPhrase, setDelPhrase] = useState('')
  const [delPassword, setDelPassword] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState('')

  const resetDeleteForm = () => { setDelPhrase(''); setDelPassword(''); setDelError('') }

  async function deleteAccount() {
    setDelBusy(true); setDelError('')
    try {
      await account.deleteAccount(delPassword)
      // خروج تمیز: توکن همین مرورگر پاک و به صفحهٔ خروج پرش کامل می‌شود —
      // همان الگوی ۴۰۱ سراسری، چون state در حافظهٔ AuthProvider هم باید برود.
      setToken('')
      window.location.replace('/goodbye')
    } catch (e) {
      // ۴۰۱ وسط راه یعنی خود نشست مرده (خارج شده یا منقضی)؛ کلاینت همین را
      // مسیر جهانی ۴۰۱ می‌برد و پیامش اینجا نمی‌ماند.
      setDelError(e?.message || t('profile.delete.failed'))
      setDelBusy(false)
    }
  }

  if (loadError) {
    return (
      <>
        <PageHead title={t('profile.title')} subtitle={t('profile.subtitle')} />
        <AlertCard
          severity="critical"
          title={t('profile.loadFailedTitle')}
          desc={loadError}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setLoadError(null); setReloadKey((k) => k + 1) }}>
              {t('common.retry')}
            </Button>
          )}
        />
      </>
    )
  }

  if (!data || !form) return <PageHead title={t('profile.title')} subtitle={t('profile.subtitle')} />

  return (
    <>
      <PageHead title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <div className="dwp-profile-grid" style={{ marginBottom: 22 }}>
        {/* Profile card */}
        <div className="dwp-card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26, flex: '0 0 auto' }}>
              {data.initials}
            </span>
            {/* "تغییر عکس" / "حذف" were here with no upload endpoint behind
                them. The initials are generated from the name, which is the
                one avatar this system actually has. */}
            <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.8 }}>
              {t('profile.avatarNote')}
            </div>
          </div>
          {/* The mobile-number field held "۰۹۱۲ ••• ۴۵۶۷" for every account —
              a fake number, on a field the server has no column for. Email is
              read-only because changing it is an identity change and needs a
              verification flow that does not exist yet. */}
          <div className="dwp-acc-form-grid">
            <Input label={t('profile.fields.name')} value={form.name} onChange={(e) => set('name')(e.target.value)} />
            <Input label={t('profile.fields.email')} value={data.email} leftIcon="mail" disabled readOnly />
            <Select label={t('profile.fields.lang')} value={form.lang} onChange={(e) => set('lang')(e.target.value)}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </Select>
            <Select label={t('profile.fields.timezone')} value={form.timezone} onChange={(e) => set('timezone')(e.target.value)}>
              <option value="Asia/Tehran">{t('profile.tz.tehran')}</option>
              <option value="Asia/Dubai">{t('profile.tz.dubai')}</option>
              <option value="UTC">{t('profile.tz.utc')}</option>
            </Select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 18 }}>
            {saved && <span style={{ fontSize: 12.5, color: 'var(--gd-success)' }}>{saved}</span>}
            {error && <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{error}</span>}
            <Button variant="primary" size="md" leftIcon="check" disabled={saving} onClick={save}>
              {saving ? t('common.saving') : t('profile.saveProfile')}
            </Button>
          </div>
        </div>

        {/* The security column used to hold three controls with nothing
            behind them: a "new password" field pre-filled with the literal
            string "passwordvalue", a two-factor switch with no handler, and a
            session list of invented devices. Session/device management and
            two-factor login are now real (/app/security) — what is still NOT
            built stays stated as not built: in-panel password change. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="dwp-card" style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              <Icon name="key-round" size={17} style={{ color: 'var(--gd-primary)' }} /> {t('profile.security.title')}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
              <Trans
                k="profile.security.body"
                components={{ link: (c) => <Link to="/app/security" style={{ color: 'var(--gd-primary)', fontWeight: 600 }}>{c}</Link> }}
              />
            </p>
          </div>
        </div>
      </div>

      {/* Danger zone — the deletion is real now: POST /account/delete behind
          it, guarded by the typed phrase AND the current password. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-danger-border)', background: 'var(--gd-danger-bg)', padding: '16px 20px' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gd-danger)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="trash-2" size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gd-danger-text)' }}>{t('profile.delete.title')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', opacity: 0.85, marginTop: 2 }}>
            {t('profile.delete.zoneDesc')}
          </div>
        </div>
        <Button variant="danger" size="md" leftIcon="trash-2" onClick={() => { setDelOpen(true); setDelError('') }}>
          {t('profile.delete.open')}
        </Button>
      </div>

      {/* تأیید دومرحله‌ای: تایپ عبارت + رمز فعلی. هیچ‌کدام به‌تنهایی کافی نیست. */}
      <Dialog
        title={t('profile.delete.title')}
        open={delOpen}
        onClose={() => { if (!delBusy) { setDelOpen(false); resetDeleteForm() } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger-border)', borderRadius: 'var(--gd-radius-md)', padding: '12px 14px', color: 'var(--gd-danger-text)', fontSize: 13, lineHeight: 1.9 }}>
            <strong>{t('profile.delete.irreversible')}</strong> {t('profile.delete.intro')}
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              <li>{t('profile.delete.items.sites')}</li>
              <li>{t('profile.delete.items.sessions')}</li>
              <li>{t('profile.delete.items.personal')}</li>
              <li>{t('profile.delete.items.audit')}</li>
            </ul>
          </div>
          <p style={{ fontSize: 13, color: 'var(--gd-text-secondary)', margin: 0, lineHeight: 1.9 }}>
            <Trans k="profile.delete.confirm" vars={{ phrase: DELETE_PHRASE }} />
          </p>
          <input
            type="text"
            placeholder={DELETE_PHRASE}
            value={delPhrase}
            onChange={(e) => setDelPhrase(e.target.value)}
            disabled={delBusy}
            style={{ padding: '8px 12px', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
          />
          <Input
            label={t('profile.delete.password')}
            type="password"
            value={delPassword}
            onChange={(e) => setDelPassword(e.target.value)}
            disabled={delBusy}
          />
          {delError && (
            <div style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', lineHeight: 1.8 }}>{delError}</div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="subtle" disabled={delBusy} onClick={() => { setDelOpen(false); resetDeleteForm() }}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              leftIcon="trash-2"
              loading={delBusy}
              disabled={delPhrase.trim() !== DELETE_PHRASE || !delPassword}
              onClick={deleteAccount}
            >
              {delBusy ? t('profile.delete.deleting') : t('profile.delete.submit')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
