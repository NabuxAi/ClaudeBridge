import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import PageHead from '../../layouts/PageHead.jsx'
import {
  Button, MetricCard, StatusPill, AuthorityBadge, ActivityRow,
} from '../../components/index.js'
import { account } from '../../lib/api.js'
import { faNum } from '../../lib/format.js'

// Pick a card icon from the site's title/name so the grid keeps visual variety.
function siteIcon(s) {
  const t = `${s.title || ''} ${s.name || ''}`
  if (t.includes('فروشگاه')) return 'store'
  if (t.includes('وبلاگ')) return 'newspaper'
  if (t.includes('لندینگ') || t.includes('کمپین')) return 'megaphone'
  return 'globe'
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 14, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// Cross-site event feed (design copy — no account-level events endpoint yet).
const EVENTS = [
  { tone: 'done', icon: 'check-circle-2', meta: 'mystore.ir', time: '۱۴:۳۲', label: 'خطای ۵۰۰ صفحهٔ پرداخت به‌صورت خودکار برطرف شد' },
  { tone: 'warning', icon: 'alert-triangle', meta: 'shop2.ir', time: '۱۲:۱۰', label: 'فضای هاست به ۹۱٪ رسید — نیازمند بررسی' },
  { tone: 'done', icon: 'refresh-cw', meta: 'blog.digiwp.com', time: '۰۹:۰۰', label: '۳ آپدیت امن نصب و تست شد' },
  { tone: 'info', icon: 'database', meta: 'همه سایت‌ها', time: '۰۳:۰۰', label: 'بکاپ روزانه گرفته و تأیید شد' },
]

export default function Dashboard() {
  const [sites, setSites] = useState(null)

  useEffect(() => {
    let alive = true
    account.sites().then((d) => alive && setSites(d))
    return () => { alive = false }
  }, [])

  const addAction = <Button variant="secondary" size="sm" leftIcon="plus" as={Link} to="/onboarding">افزودن سایت</Button>

  if (!sites) {
    return <PageHead title="داشبورد حساب" subtitle="نمای کلی و سلامت همهٔ سایت‌های تحت پوشش" action={addAction} />
  }

  const active = sites.length
  const healthy = sites.filter((s) => s.status === 'healthy').length
  const attention = sites.filter((s) => s.status === 'warning' || s.status === 'critical')
  const pendingTotal = sites.reduce((sum, s) => sum + (s.pendingUpdates || 0), 0)
  const sitesWithUpdates = sites.filter((s) => (s.pendingUpdates || 0) > 0).length

  return (
    <>
      <PageHead
        title="داشبورد حساب"
        subtitle="نمای کلی و سلامت همهٔ سایت‌های تحت پوشش"
        action={addAction}
      />

      {/* Summary metrics */}
      <div className="dwp-grid dwp-grid-4" style={{ marginBottom: 22 }}>
        <MetricCard icon="globe" iconTone="primary" label="سایت‌های فعال" value={faNum(active)} hint="از ۵ سایت پلن" />
        <MetricCard icon="shield-check" iconTone="success" label="سالم" value={faNum(healthy)} hint="بدون مشکل" />
        <MetricCard icon="alert-triangle" iconTone="warning" label="نیازمند توجه" value={faNum(attention.length)} hint={attention[0]?.name || 'بدون مورد'} />
        <MetricCard icon="refresh-cw" iconTone="neutral" label="آپدیت در انتظار" value={faNum(pendingTotal)} hint={`در ${faNum(sitesWithUpdates)} سایت`} />
      </div>

      {/* Site cards */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>سایت‌های شما</div>
      <div className="dwp-grid dwp-grid-3" style={{ marginBottom: 24 }}>
        {sites.map((s) => {
          const attn = s.status === 'warning' || s.status === 'critical'
          return (
            <div
              key={s.id}
              style={{
                background: 'var(--gd-bg-surface)',
                border: `1px solid ${attn ? 'var(--gd-warning-border)' : 'var(--gd-border)'}`,
                borderRadius: 'var(--gd-radius-lg)',
                boxShadow: 'var(--gd-shadow-sm)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 15,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, background: attn ? 'var(--gd-warning-bg)' : 'var(--gd-primary-subtle)', color: attn ? 'var(--gd-warning)' : 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                  <Icon name={siteIcon(s)} size={21} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 1 }}>{s.title}</div>
                </div>
                <StatusPill status={s.status} size="sm" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px' }}>
                <Stat label="آپ‌تایم" value={`${faNum(String(s.uptime).replace('.', '٫'))}٪`} />
                <Stat label="آپدیت" value={faNum(s.pendingUpdates)} color={s.pendingUpdates > 0 ? 'var(--gd-warning-text)' : undefined} />
                <Stat label="هشدار" value={faNum(s.incidents)} color={s.incidents > 0 ? 'var(--gd-danger-text)' : undefined} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <AuthorityBadge level={s.authority} size="sm" />
                <Button as={Link} to={`/site/${s.id}`} variant="secondary" size="sm" rightIcon="arrow-left">ورود به پنل</Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cross-site activity */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>آخرین رویدادها در همهٔ سایت‌ها</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '6px 20px' }}>
        {EVENTS.map((e, i) => (
          <ActivityRow key={i} icon={e.icon} tone={e.tone} label={e.label} meta={e.meta} time={e.time} divided={i < EVENTS.length - 1} />
        ))}
      </div>
    </>
  )
}
