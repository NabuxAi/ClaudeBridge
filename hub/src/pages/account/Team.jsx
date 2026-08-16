import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Badge, IconButton } from '../../components/index.js'
import { account } from '../../lib/api.js'

// Presentational metadata per role — merged onto the fetched member list
// so the table matches the design while the members come from the API.
const ROLE_CFG = {
  owner: { badge: { variant: 'primary', icon: 'crown' }, avatar: 'var(--gd-primary)', online: true },
  admin: { badge: { variant: 'info' }, avatar: 'var(--gd-cyan-600)', activity: '۲ ساعت پیش' },
  viewer: { badge: { variant: 'neutral' }, avatar: 'var(--gd-green-600)', activity: 'دیروز' },
}

const COLS = '2.2fr 1fr 1.4fr 1fr 0.6fr'

export default function Team() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    // The server now answers with { provenance, list } — the list holds the one
    // real member (whoever is signed in) instead of three invented colleagues.
    account.team().then((d) => alive && setData(Array.isArray(d) ? { list: d } : d))
    return () => { alive = false }
  }, [])

  const members = data?.list || null

  const head = (
    <PageHead
      title="اعضای تیم"
      subtitle="افراد و سطح دسترسی آن‌ها به سایت‌ها"
      action={null}
    />
  )

  if (!members) return head

  return (
    <>
      {head}

      {/* Team invitations are not built yet. The table below shows only the
          one real member: the signed-in account owner. */}
      <div style={{ background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="info" size={18} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto' }} />
        <span style={{ fontSize: 13.5, color: 'var(--gd-text-secondary)', lineHeight: 1.7 }}>
          دعوت هم‌تیمی و دسترسی چندکاربره هنوز ساخته نشده. فقط حساب خودتان در این لیست دیده می‌شود.
        </span>
      </div>

      {/* Members table */}
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden', marginBottom: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>عضو</span>
          <span>نقش</span>
          <span>سایت‌های مجاز</span>
          <span>آخرین فعالیت</span>
          <span></span>
        </div>

        {members.map((m) => {
          const cfg = ROLE_CFG[m.role] || ROLE_CFG.viewer
          const allSites = m.sites === 'همه'
          return (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.avatar, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: '0 0 auto' }}>{m.initials}</span>
                <span>
                  <span style={{ display: 'block', fontWeight: 700 }}>{m.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }}>{m.email}</span>
                </span>
              </span>
              <Badge variant={cfg.badge.variant} appearance="soft" icon={cfg.badge.icon}>{m.roleLabel}</Badge>
              <span style={allSites
                ? { color: 'var(--gd-text-secondary)' }
                : { color: 'var(--gd-text-secondary)', fontFamily: 'var(--gd-font-mono)', fontSize: 12.5 }}>
                {allSites ? 'همهٔ سایت‌ها' : m.sites}
              </span>
              {cfg.online ? (
                <span style={{ color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gd-success)' }} /> آنلاین
                </span>
              ) : (
                <span style={{ color: 'var(--gd-text-muted)' }}>{cfg.activity}</span>
              )}
              <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                {m.role !== 'owner' && <IconButton icon="more-vertical" label="گزینه‌ها" size="sm" />}
              </span>
            </div>
          )
        })}

      </div>

      {/* Role reference cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '15px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 7 }}>
            <Icon name="crown" size={16} style={{ color: 'var(--gd-primary)' }} /> مالک
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.65 }}>دسترسی کامل، مدیریت صورت‌حساب، افزودن و حذف اعضا و سایت‌ها.</div>
        </div>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '15px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 7 }}>
            <Icon name="user-cog" size={16} style={{ color: 'var(--gd-info)' }} /> مدیر
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.65 }}>مدیریت سایت‌های مجاز، تأیید اقدام‌ها و تنظیم سطح اختیار — بدون دسترسی به صورت‌حساب.</div>
        </div>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '15px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, marginBottom: 7 }}>
            <Icon name="eye" size={16} style={{ color: 'var(--gd-text-muted)' }} /> فقط مشاهده
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', lineHeight: 1.65 }}>مشاهدهٔ گزارش‌ها و وضعیت سایت بدون امکان انجام یا تأیید تغییرات.</div>
        </div>
      </div>
    </>
  )
}
