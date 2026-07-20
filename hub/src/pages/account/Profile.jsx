import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select, Switch } from '../../components/index.js'
import { account } from '../../lib/api.js'

export default function Profile() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    account.profile().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [])

  if (!data) return <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات شخصی، امنیت و نشست‌ها" />

  return (
    <>
      <PageHead title="پروفایل و تنظیمات حساب" subtitle="اطلاعات شخصی، امنیت و نشست‌ها" />

      <div className="dwp-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginBottom: 22 }}>
        {/* Profile card */}
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gd-primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26, flex: '0 0 auto' }}>
              {data.initials}
            </span>
            <div style={{ display: 'flex', gap: 9 }}>
              <Button variant="secondary" size="sm" leftIcon="upload">تغییر عکس</Button>
              <Button variant="ghost" size="sm">حذف</Button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input label="نام و نام خانوادگی" defaultValue={data.name} />
            <Input label="ایمیل" defaultValue={data.email} leftIcon="mail" />
            <Input label="شماره موبایل" defaultValue="۰۹۱۲ ••• ۴۵۶۷" leftIcon="phone" />
            <Select label="زبان پنل" defaultValue={data.lang === 'fa' ? 'فارسی' : 'English'}>
              <option>فارسی</option>
              <option>English</option>
            </Select>
            <div style={{ gridColumn: '1 / -1' }}>
              <Select label="منطقهٔ زمانی">
                <option>تهران (GMT+3:30)</option>
                <option>دبی (GMT+4)</option>
              </Select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <Button variant="primary" size="md" leftIcon="check">ذخیرهٔ پروفایل</Button>
          </div>
        </div>

        {/* Security column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
              <Icon name="key-round" size={17} style={{ color: 'var(--gd-primary)' }} /> رمز عبور و ورود
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input label="رمز عبور جدید" type="password" defaultValue="passwordvalue" />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--gd-success-bg)', border: '1px solid var(--gd-success-border)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--gd-success-text)' }}>
                  <Icon name="shield-check" size={16} /> ورود دومرحله‌ای
                </span>
                <Switch defaultChecked={data.twoFactor} />
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
                <Icon name="monitor-smartphone" size={17} style={{ color: 'var(--gd-primary)' }} /> نشست‌های فعال
              </span>
              <Button variant="ghost" size="sm">خروج از همه</Button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--gd-border-subtle)' }}>
              <Icon name="monitor" size={18} style={{ color: 'var(--gd-text-secondary)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Chrome · مک — تهران</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>این دستگاه</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--gd-success-text)', fontWeight: 600 }}>فعال</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0' }}>
              <Icon name="smartphone" size={18} style={{ color: 'var(--gd-text-secondary)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>اپ موبایل · iOS</div>
                <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>۲ روز پیش</div>
              </div>
              <Icon name="x" size={15} style={{ color: 'var(--gd-text-muted)', cursor: 'pointer' }} />
            </div>
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
        <Button variant="danger" size="sm">حذف حساب</Button>
      </div>
    </>
  )
}
