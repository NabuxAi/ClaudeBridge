import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, Switch, Select } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

const TIERS = [
  {
    key: 'report', icon: 'eye', title: 'فقط گزارش',
    desc: 'فقط مشاهده و پیشنهاد؛ هیچ تغییری اعمال نمی‌شود.',
    softBg: 'var(--gd-bg-inset)', softColor: 'var(--gd-gray-600)',
    solidBg: 'var(--gd-gray-700)', tint: 'var(--gd-bg-inset)',
    line: 'var(--gd-authority-report)', text: 'var(--gd-text)',
  },
  {
    key: 'confirm', icon: 'user-check', title: 'با تأیید',
    desc: 'راه‌حل را آماده می‌کند و منتظر تأیید شما می‌ماند.',
    softBg: 'var(--gd-warning-bg)', softColor: 'var(--gd-warning)',
    solidBg: 'var(--gd-warning)', tint: 'var(--gd-warning-bg)',
    line: 'var(--gd-authority-confirm)', text: 'var(--gd-warning-text)',
  },
  {
    key: 'auto', icon: 'zap', title: 'خودکار',
    desc: 'کارهای کم‌ریسک را خودش انجام می‌دهد؛ موارد حساس با تأیید.',
    softBg: 'var(--gd-success-bg)', softColor: 'var(--gd-success)',
    solidBg: 'var(--gd-success)', tint: 'var(--gd-success-bg)',
    line: 'var(--gd-authority-auto)', text: 'var(--gd-success-text)',
  },
]

const SENSITIVE_ICONS = ['trash-2', 'palette', 'file-code', 'credit-card', 'globe', 'database']

export default function Settings() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [authority, setAuthority] = useState('auto')

  useEffect(() => {
    let alive = true
    siteApi(siteId).settings().then((d) => {
      if (!alive) return
      setData(d)
      setAuthority(d.authority)
    })
    return () => { alive = false }
  }, [siteId])

  if (!data) return <PageHead title="تنظیمات سایت" subtitle="سطح اختیار پشتیبان، اتصال و ترجیحات پایش" />

  return (
    <>
      <PageHead title="تنظیمات سایت" subtitle="سطح اختیار پشتیبان، اتصال و ترجیحات پایش" />

      {/* Authority level selector */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>سطح اختیار پشتیبان</div>
      <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '0 0 14px' }}>
        تعیین کنید پشتیبان چقدر آزادی عمل داشته باشد. موارد حساس در هر سطحی به تأیید شما نیاز دارند.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {TIERS.map((t) => {
          const sel = authority === t.key
          return (
            <label
              key={t.key}
              onClick={() => setAuthority(t.key)}
              style={{
                border: sel ? `2px solid ${t.line}` : '1.5px solid var(--gd-border)',
                borderRadius: 'var(--gd-radius-lg)',
                padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 9,
                cursor: 'pointer',
                background: sel ? t.tint : 'var(--gd-bg-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: sel ? t.solidBg : t.softBg, color: sel ? '#fff' : t.softColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={19} />
                </span>
                {sel ? (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${t.solidBg}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.solidBg }} />
                  </span>
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--gd-border-strong)', flex: '0 0 auto' }} />
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: sel ? t.text : undefined }}>
                {t.title}
                {sel && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: t.solidBg, color: '#fff', borderRadius: 999, padding: '1px 8px', marginInlineStart: 4 }}>فعال</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: sel ? t.text : 'var(--gd-text-muted)', lineHeight: 1.6, opacity: sel ? 0.9 : 1 }}>
                {t.desc}
              </div>
            </label>
          )
        })}
      </div>

      {/* Feature toggles */}
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
          <Icon name="sliders-horizontal" size={17} style={{ color: 'var(--gd-primary)' }} /> ویژگی‌های خودکار
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
          {data.toggles.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '12px 14px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{t.desc}</div>
              </div>
              <Switch defaultChecked={t.on} size="md" />
            </div>
          ))}
        </div>
      </div>

      {/* Sensitive actions + connector/monitoring */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 18, marginBottom: 22 }}>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            <Icon name="lock" size={17} style={{ color: 'var(--gd-danger)' }} /> اقدام‌های همیشه نیازمند تأیید
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
            این کارها حتی در حالت خودکار هم بدون اجازهٔ شما انجام نمی‌شوند.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {data.sensitive.map((label, i) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
                <Icon name={SENSITIVE_ICONS[i] || 'lock'} size={15} style={{ color: 'var(--gd-text-muted)' }} /> {label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
            <Icon name="plug" size={17} style={{ color: 'var(--gd-primary)' }} /> اتصال و پایش
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>وضعیت اتصال</span>
            {data.connector.paired
              ? <Badge variant="success" appearance="soft" dot>متصل</Badge>
              : <Badge variant="danger" appearance="soft" dot>قطع</Badge>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>سرور واسط</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>{data.connector.server}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>نسخهٔ کانکتور</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>v{faNum(data.connector.version)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>آخرین ارتباط</span>
            <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{data.connector.lastSeen}</span>
          </div>
          <Select label="فرکانس بررسی" options={[
            { value: '1', label: 'هر ۱ دقیقه' },
            { value: '5', label: 'هر ۵ دقیقه' },
            { value: '15', label: 'هر ۱۵ دقیقه' },
          ]} />
          <Select label="پنجرهٔ نگهداری (کم‌ترافیک)" options={[
            { value: '2-5', label: '۰۲:۰۰ تا ۰۵:۰۰' },
            { value: '0-3', label: '۰۰:۰۰ تا ۰۳:۰۰' },
          ]} />
        </div>
      </div>

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 18 }}>
        <Button variant="ghost" size="md">بازنشانی</Button>
        <Button variant="primary" size="md" leftIcon="check">ذخیرهٔ تغییرات</Button>
      </div>
    </>
  )
}
