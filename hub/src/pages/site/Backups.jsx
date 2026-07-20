import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, IconButton, MetricCard, Badge, Switch } from '../../components/index.js'
import { site as siteApi } from '../../lib/api.js'

const COLS = '1.6fr 1fr 0.8fr 1fr 1.4fr'

export default function Backups() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    siteApi(siteId).backups().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [siteId])

  const head = (
    <PageHead
      title="بکاپ‌ها و بازیابی"
      subtitle="نسخه‌های پشتیبان تأییدشده، خارج از سرور و قابل بازیابی"
      action={<Button variant="primary" size="sm" leftIcon="database-backup">بکاپ دستی</Button>}
    />
  )

  if (!data) return head

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
                <Button variant="secondary" size="sm" leftIcon="rotate-ccw">بازگردانی</Button>
                <IconButton icon="download" label="دانلود" size="sm" />
              </span>
            </div>
          )
        })}
      </div>
    </>
  )
}
