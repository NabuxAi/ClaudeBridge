import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select } from '../../components/index.js'
import { account } from '../../lib/api.js'

export default function Profile() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    account.profile().then((d) => {
      if (!alive) return
      setData(d)
      setForm({ name: d.name || '', lang: d.lang || 'fa', timezone: d.timezone || 'Asia/Tehran', two_factor: Boolean(d.twoFactor) })
    })
    return () => { alive = false }
  }, [])

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

  if (!data || !form) return <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات حساب" />

  return (
    <>
      <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات حساب" />

      <div className="dwp-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginBottom: 22 }}>
        {/* Profile card */}
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 24px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

        {/* The security column held three controls with nothing behind them:
            a "new password" field pre-filled with the literal string
            "passwordvalue", a two-factor switch with no handler and no
            server-side 2FA, and a session list showing a Chrome-on-Mac and an
            iOS app session that were the same on every account — this system
            issues one bearer token and tracks no devices at all. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              <Icon name="key-round" size={17} style={{ color: 'var(--gd-primary)' }} /> امنیت حساب
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
              تغییر رمز عبور، ورود دومرحله‌ای و مدیریت نشست‌ها هنوز ساخته نشده‌اند.
              ورود فعلاً با ایمیل و رمز عبور انجام می‌شود و هر ورود یک توکن می‌سازد که با خروج باطل می‌شود.
            </p>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-danger-border)', background: 'var(--gd-danger-bg)', padding: '16px 20px' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gd-danger)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="trash-2" size={20} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gd-danger-text)' }}>حذف حساب کاربری</div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', opacity: 0.85, marginTop: 2 }}>همهٔ سایت‌ها از پایش خارج و داده‌های حساب برای همیشه حذف می‌شوند.</div>
        </div>
        {/* No delete-account endpoint exists. Left as a written instruction
            rather than a button that does nothing when someone is trying to
            leave — the one moment a dead control is least forgivable. */}
        <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', fontWeight: 600 }}>
          فعلاً با پشتیبانی تماس بگیرید
        </span>
      </div>
    </>
  )
}
