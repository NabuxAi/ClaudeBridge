import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, AlertCard, Tabs } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

// Timeline dot styling per event tone.
const TONE = {
  danger: { bg: 'var(--gd-danger-bg)', text: 'var(--gd-danger-text)', icon: 'alert-octagon' },
  warning: { bg: 'var(--gd-warning-bg)', text: 'var(--gd-warning-text)', icon: 'alert-triangle' },
  info: { bg: 'var(--gd-info-bg)', text: 'var(--gd-info-text)', icon: 'info' },
  done: { bg: 'var(--gd-success-bg)', text: 'var(--gd-success-text)', icon: 'check-circle-2' },
}

// Past-incident row icon + colour per severity.
const SEV = {
  critical: { bg: 'var(--gd-danger-bg)', text: 'var(--gd-danger-text)', icon: 'alert-octagon' },
  warning: { bg: 'var(--gd-warning-bg)', text: 'var(--gd-warning-text)', icon: 'shield-alert' },
  info: { bg: 'var(--gd-info-bg)', text: 'var(--gd-info-text)', icon: 'info' },
}

export default function Incidents() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('all')

  useEffect(() => {
    let alive = true
    siteApi(siteId).incidents().then((d) => alive && setData(d))
    return () => { alive = false }
  }, [siteId])

  if (!data) return <PageHead title="هشدارها" subtitle="رخدادها و اقدام‌های خودکار پشتیبان" />

  const { featured, list } = data
  const filtered = list.filter((it) => {
    if (tab === 'all') return true
    if (tab === 'resolved') return it.resolved
    return it.severity === tab
  })
  const timeline = featured?.timeline || []

  const tabs = [
    { key: 'all', label: 'همه', badge: faNum(list.length) },
    { key: 'critical', label: 'بحرانی' },
    { key: 'warning', label: 'هشدار' },
    { key: 'resolved', label: 'حل‌شده' },
  ]

  return (
    <>
      <PageHead
        title="هشدارها"
        subtitle="رخدادها و اقدام‌های خودکار پشتیبان"
        action={<Button variant="primary" size="sm" leftIcon="refresh-cw">بررسی دوباره</Button>}
      />

      {/* Severity filter */}
      <div style={{ marginBottom: 20 }}>
        <Tabs items={tabs} value={tab} onChange={setTab} variant="underline" />
      </div>

      {/* Featured critical incident */}
      {featured && (
        <div style={{ marginBottom: 22 }}>
          <AlertCard
            severity={featured.severity}
            title={featured.title}
            time={featured.time}
            desc={featured.desc}
            fields={featured.fields}
            actions={(
              <>
                <Button variant="primary" size="sm" leftIcon="file-text">گزارش کامل رخداد</Button>
                <Button variant="secondary" size="sm" leftIcon="git-compare">مشاهدهٔ نسخهٔ افزونه</Button>
                <Button variant="ghost" size="sm">نادیده گرفتن</Button>
              </>
            )}
          />
        </div>
      )}

      {/* Resolution timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>خط زمانی رسیدگی</div>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '20px 22px' }}>
            {timeline.map((ev, i) => {
              const t = TONE[ev.tone] || TONE.info
              const last = i === timeline.length - 1
              return (
                <div key={i} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: t.bg, color: t.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={t.icon} size={16} />
                    </span>
                    {!last && <span style={{ flex: 1, width: 2, background: 'var(--gd-border-subtle)', margin: '4px 0' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gd-text-secondary)', lineHeight: 1.6 }}>{ev.label}</div>
                    <div style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 3 }}>{ev.t}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Past incidents */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>رخدادهای اخیر</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '4px 20px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-muted)' }}>
            موردی در این دسته یافت نشد
          </div>
        )}
        {filtered.map((it, i) => {
          const s = SEV[it.severity] || SEV.info
          const last = i === filtered.length - 1
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--gd-border-subtle)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: s.bg, color: s.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name={s.icon} size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{it.title}</div>
              </div>
              <span style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 12, color: 'var(--gd-text-muted)', whiteSpace: 'nowrap' }}>{it.time}</span>
              {it.resolved
                ? <Badge variant="success" appearance="soft">حل شد</Badge>
                : <Badge variant="warning" appearance="soft">در انتظار</Badge>}
            </div>
          )
        })}
      </div>
    </>
  )
}
