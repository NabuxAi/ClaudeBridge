import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, MetricCard, Badge, ActivityRow } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

export default function Security() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    siteApi(siteId).security().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [siteId])

  if (!data) return <PageHead title="امنیت" subtitle="نگهبانی امنیتی روزانه و کنترل دسترسی" />

  return (
    <>
      <PageHead
        title="امنیت"
        subtitle="نگهبانی امنیتی روزانه و کنترل دسترسی"
        action={<Button variant="primary" size="sm" leftIcon="scan-search">اسکن کامل</Button>}
      />

      {/* Security status banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', boxShadow: 'var(--gd-shadow-sm)', padding: '22px 26px', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '0 0 auto' }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gd-success-bg)', color: 'var(--gd-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield-check" size={34} />
          </span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>وضعیت امنیتی: مطلوب</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
              <Badge variant="success" appearance="soft" icon="shield-check">هیچ تهدید فعال</Badge>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--gd-text-muted)' }}>
                <Icon name="scan-search" size={13} /> آخرین اسکن بدافزار: ۶ ساعت پیش
              </span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 280, display: 'flex', gap: 34, paddingInlineStart: 26, borderInlineStart: '1px solid var(--gd-border-subtle)' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-danger-text)' }}>۱۲</div>
            <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>حملهٔ مسدودشده امروز</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{faNum(data.ssl.days)}</div>
            <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>روز تا انقضای SSL</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-success-text)' }}>۰</div>
            <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2 }}>افزونهٔ آسیب‌پذیر</div>
          </div>
        </div>
      </div>

      {/* Security score + KPI metrics */}
      <div className="dwp-grid dwp-grid-4">
        {data.metrics.map((m) => (
          <MetricCard
            key={m.label} icon={m.icon} iconTone={m.tone}
            label={m.label} value={m.value} unit={m.unit}
          />
        ))}
      </div>

      {/* SSL card + security events */}
      <div className="dwp-ov-cols" style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, marginTop: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>رویدادهای امنیتی</span>
            <Badge variant="info" appearance="soft" icon="history">{faNum(data.events.length)} رویداد</Badge>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 20px' }}>
            {data.events.map((e, i) => (
              <ActivityRow key={i} icon={e.icon} tone={e.tone} label={e.label} time={e.time} divided={i < data.events.length - 1} />
            ))}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
            <span>گواهی SSL</span>
            <Badge variant="success" appearance="soft" dot>{data.ssl.valid ? 'معتبر' : 'نامعتبر'}</Badge>
          </div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--gd-success-bg)', color: 'var(--gd-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="lock-keyhole" size={20} />
              </span>
              <span className="dwp-mono" style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-success-text)' }}>{faNum(data.ssl.days)}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>گواهی SSL</div>
            <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 3, lineHeight: 1.6 }}>
              {data.ssl.issuer} · تمدید خودکار · انقضا {faNum(data.ssl.days)} روز دیگر
            </div>
          </div>
        </div>
      </div>

      {/* Reversible-actions note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-info-border)', background: 'var(--gd-info-bg)', padding: '15px 20px', marginTop: 20 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--gd-info)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <Icon name="bot" size={19} />
        </span>
        <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.7, color: 'var(--gd-info-text)' }}>
          همهٔ اقدام‌های امنیتی برگشت‌پذیرند. پشتیبان تغییرات فایل و ورودها را لحظه‌ای رصد می‌کند و در صورت تهدید جدی بلافاصله به شما هشدار می‌دهد.
        </div>
        <Button variant="secondary" size="sm">گزارش امنیتی</Button>
      </div>
    </>
  )
}
