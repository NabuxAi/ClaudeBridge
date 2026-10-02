import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select, AlertCard, Dialog } from '../../components/index.js'
import { account, setToken } from '../../lib/api.js'

/** عبارتی که کاربر باید برای تأیید تایپ کند — همان الگوی «تأیید بازگردانی» بکاپ‌ها. */
const DELETE_PHRASE = 'حذف حساب'

export default function Profile() {
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
        setForm({ name: d.name || '', lang: d.lang || 'fa', timezone: d.timezone || 'Asia/Tehran' })
      })
      .catch((e) => {
        // A failed request must not leave the page hung on the empty header.
        if (alive) setLoadError(e?.message || 'بارگذاری پروفایل انجام نشد.')
      })
    return () => { alive = false }
  }, [reloadKey])

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(''); }

  async function save() {
    setSaving(true); setError(''); setSaved('')
    try {
      const next = await account.saveProfile(form)
      setData((d) => ({ ...d, ...next }))
      setSaved('ذخیره شد.')
    } catch (e) {
      setError(e?.message || 'ذخیره نشد.')
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
      setDelError(e?.message || 'حذف حساب ناموفق بود. دوباره تلاش کنید.')
      setDelBusy(false)
    }
  }

  if (loadError) {
    return (
      <>
        <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات حساب" />
        <AlertCard
          severity="critical"
          title="بارگذاری پروفایل ناموفق بود"
          desc={loadError}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setLoadError(null); setReloadKey((k) => k + 1) }}>
              تلاش دوباره
            </Button>
          )}
        />
      </>
    )
  }

  if (!data || !form) return <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات حساب" />

  return (
    <>
      <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات حساب" />

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
              تصویر پروفایل از حروف اول نام ساخته می‌شود.
            </div>
          </div>
          {/* The mobile-number field held "۰۹۱۲ ••• ۴۵۶۷" for every account —
              a fake number, on a field the server has no column for. Email is
              read-only because changing it is an identity change and needs a
              verification flow that does not exist yet. */}
          <div className="dwp-acc-form-grid">
            <Input label="نام و نام خانوادگی" value={form.name} onChange={(e) => set('name')(e.target.value)} />
            <Input label="ایمیل" value={data.email} leftIcon="mail" disabled readOnly />
            <Select label="زبان پنل" value={form.lang} onChange={(e) => set('lang')(e.target.value)}>
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </Select>
            <Select label="منطقهٔ زمانی" value={form.timezone} onChange={(e) => set('timezone')(e.target.value)}>
              <option value="Asia/Tehran">تهران (GMT+3:30)</option>
              <option value="Asia/Dubai">دبی (GMT+4)</option>
              <option value="UTC">UTC</option>
            </Select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 18 }}>
            {saved && <span style={{ fontSize: 12.5, color: 'var(--gd-success)' }}>{saved}</span>}
            {error && <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{error}</span>}
            <Button variant="primary" size="md" leftIcon="check" disabled={saving} onClick={save}>
              {saving ? 'در حال ذخیره…' : 'ذخیرهٔ پروفایل'}
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
              <Icon name="key-round" size={17} style={{ color: 'var(--gd-primary)' }} /> امنیت حساب
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
              دستگاه‌های واردشده به حساب، خروج از هرکدام، و فعال‌سازی ورود دومرحله‌ای در{' '}
              <Link to="/app/security" style={{ color: 'var(--gd-primary)', fontWeight: 600 }}>امنیت حساب</Link> مدیریت می‌شود.
              تغییر رمز عبور داخل پنل هنوز ساخته نشده است؛ برای تغییر رمز، از
              «فراموشی رمز عبور» در صفحهٔ ورود استفاده کنید.
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
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gd-danger-text)' }}>حذف حساب کاربری</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', opacity: 0.85, marginTop: 2 }}>
            همهٔ سایت‌ها از پایش خارج، نشست‌ها باطل و داده‌های شخصی حساب برای همیشه حذف می‌شود. این تغییر بازگشت‌پذیر نیست.
          </div>
        </div>
        <Button variant="danger" size="md" leftIcon="trash-2" onClick={() => { setDelOpen(true); setDelError('') }}>
          حذف حساب…
        </Button>
      </div>

      {/* تأیید دومرحله‌ای: تایپ عبارت + رمز فعلی. هیچ‌کدام به‌تنهایی کافی نیست. */}
      <Dialog
        title="حذف حساب کاربری"
        open={delOpen}
        onClose={() => { if (!delBusy) { setDelOpen(false); resetDeleteForm() } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger-border)', borderRadius: 'var(--gd-radius-md)', padding: '12px 14px', color: 'var(--gd-danger-text)', fontSize: 13, lineHeight: 1.9 }}>
            <strong>این کار بازگشت‌پذیر نیست.</strong> با حذف حساب:
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              <li>همهٔ سایت‌های شما بلافاصله از پایش خارج می‌شوند و اعتبارنامهٔ جفت‌سازی هرکدام باطل می‌شود؛ افزونهٔ روی سایت دیگر به این پنل وصل نخواهد شد.</li>
              <li>همهٔ نشست‌های واردشده به حساب (هر دستگاهی) همان لحظه از حساب خارج می‌شوند.</li>
              <li>ایمیل، نام، شماره تماس و توکن‌های اعلان شما از حساب حذف می‌شود. آدرس ایمیل‌تان آزاد می‌شود و بعداً می‌توان با همان آدرس دوباره ثبت‌نام کرد.</li>
              <li>سابقهٔ رویدادها بدون دادهٔ شخصی برای ممیزی می‌ماند.</li>
            </ul>
          </div>
          <p style={{ fontSize: 13, color: 'var(--gd-text-secondary)', margin: 0, lineHeight: 1.9 }}>
            برای تأیید، عبارت <strong>«{DELETE_PHRASE}»</strong> را تایپ کنید و رمز عبور فعلی‌تان را وارد کنید:
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
            label="رمز عبور فعلی"
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
              انصراف
            </Button>
            <Button
              variant="danger"
              leftIcon="trash-2"
              loading={delBusy}
              disabled={delPhrase.trim() !== DELETE_PHRASE || !delPassword}
              onClick={deleteAccount}
            >
              {delBusy ? 'در حال حذف…' : 'حذف همیشگی حساب'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
