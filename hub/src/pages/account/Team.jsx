import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Badge, Button, IconButton, Input, Select, AlertCard } from '../../components/index.js'
import { account, site as siteClient, ApiError } from '../../lib/api.js'

const ROLE_CFG = {
  owner: { badge: { variant: 'primary', icon: 'crown' }, avatar: 'var(--gd-primary)' },
  admin: { badge: { variant: 'info', icon: 'user-cog' }, avatar: 'var(--gd-cyan-600)' },
  viewer: { badge: { variant: 'neutral', icon: 'eye' }, avatar: 'var(--gd-green-600)' },
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'مدیر — مدیریت سایت‌های مجاز و تأیید اقدام‌ها' },
  { value: 'viewer', label: 'فقط مشاهده — گزارش‌ها و وضعیت، بدون تغییر' },
]

const COLS = '2.2fr 1fr 1.4fr 1fr 0.6fr'

export default function Team() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sites, setSites] = useState(null)
  const [selectedSiteId, setSelectedSiteId] = useState(searchParams.get('site') || '')
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [actionBusy, setActionBusy] = useState({})
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let alive = true
    account.sites().then((d) => {
      if (!alive) return
      setSites(d || [])
      if (!selectedSiteId && d?.[0]?.id) {
        setSelectedSiteId(d[0].id)
      }
    })
    return () => { alive = false }
  }, [selectedSiteId])

  const loadTeam = useCallback(async (siteId) => {
    if (!siteId) return
    try {
      const data = await siteClient(siteId).team()
      setTeam(data)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'بارگذاری اعضا با خطا مواجه شد.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    if (selectedSiteId) {
      setSearchParams({ site: selectedSiteId })
      siteClient(selectedSiteId).team().then((data) => {
        if (alive) {
          setTeam(data)
          setError(null)
          setLoading(false)
        }
      }).catch((e) => {
        if (alive) {
          setError(e instanceof ApiError ? e.message : 'بارگذاری اعضا با خطا مواجه شد.')
          setLoading(false)
        }
      })
    }
    return () => { alive = false }
  }, [selectedSiteId, setSearchParams])

  const showToast = (title, tone = 'success') => {
    setToast({ title, tone })
    setTimeout(() => setToast(null), 3000)
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!inviteEmail.trim() || !selectedSiteId) return
    setInviteBusy(true)
    setInviteError(null)
    try {
      await siteClient(selectedSiteId).inviteMember({ email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail('')
      setInviteRole('viewer')
      showToast('دعوت‌نامه ارسال شد.')
      await loadTeam(selectedSiteId)
    } catch (e) {
      setInviteError(e instanceof ApiError ? e.message : 'ارسال دعوت‌نامه ناموفق بود.')
    } finally {
      setInviteBusy(false)
    }
  }

  const revoke = async (invitationId) => {
    setActionBusy((b) => ({ ...b, [`revoke:${invitationId}`]: true }))
    try {
      await siteClient(selectedSiteId).revokeInvitation(invitationId)
      showToast('دعوت‌نامه لغو شد.')
      await loadTeam(selectedSiteId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'لغو دعوت‌نامه ناموفق بود.')
    } finally {
      setActionBusy((b) => ({ ...b, [`revoke:${invitationId}`]: false }))
    }
  }

  const updateRole = async (memberId, role) => {
    setActionBusy((b) => ({ ...b, [`role:${memberId}`]: true }))
    try {
      await siteClient(selectedSiteId).updateMemberRole(memberId, role)
      showToast('نقش به‌روزرسانی شد.')
      await loadTeam(selectedSiteId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تغییر نقش ناموفق بود.')
    } finally {
      setActionBusy((b) => ({ ...b, [`role:${memberId}`]: false }))
    }
  }

  const remove = async (memberId) => {
    if (!window.confirm('این عضو از سایت حذف می‌شود. ادامه می‌دهید؟')) return
    setActionBusy((b) => ({ ...b, [`remove:${memberId}`]: true }))
    try {
      await siteClient(selectedSiteId).removeMember(memberId)
      showToast('عضو حذف شد.')
      await loadTeam(selectedSiteId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'حذف عضو ناموفق بود.')
    } finally {
      setActionBusy((b) => ({ ...b, [`remove:${memberId}`]: false }))
    }
  }

  const head = (
    <PageHead
      title="اعضای تیم"
      subtitle="افراد و سطح دسترسی آن‌ها به سایت‌ها"
      action={null}
    />
  )

  if (!sites) return head

  if (sites.length === 0) {
    return (
      <>
        {head}
        <AlertCard
          severity="info"
          title="هنوز سایتی ثبت نکرده‌اید"
          desc="برای مدیریت اعضا ابتدا یک سایت اضافه کنید."
        />
      </>
    )
  }

  return (
    <>
      {head}

      {sites.length > 1 && (
        <div style={{ marginBottom: 18, maxWidth: 420 }}>
          <Select
            label="انتخاب سایت"
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.title || s.name}</option>
            ))}
          </Select>
        </div>
      )}

      {error && (
        <AlertCard
          severity="danger"
          title="خطا"
          desc={error}
          onDismiss={() => setError(null)}
          style={{ marginBottom: 18 }}
        />
      )}

      {loading && (
        <div style={{ color: 'var(--gd-text-muted)', padding: '18px 0' }}>
          در حال بارگذاری اعضا…
        </div>
      )}

      {!loading && team && (
        <>
          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden', marginBottom: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
              <span>عضو</span>
              <span>نقش</span>
              <span>سایت</span>
              <span>وضعیت</span>
              <span></span>
            </div>

            {team.owner && (
              <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 38, height: 38, borderRadius: '50%', background: ROLE_CFG.owner.avatar, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: '0 0 auto' }}>{team.owner.initials}</span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 700 }}>{team.owner.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }}>{team.owner.email}</span>
                  </span>
                </span>
                <Badge variant={ROLE_CFG.owner.badge.variant} appearance="soft" icon={ROLE_CFG.owner.badge.icon}>{team.owner.roleLabel}</Badge>
                <span style={{ color: 'var(--gd-text-secondary)' }}>{team.site.title || team.site.name}</span>
                <span style={{ color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gd-success)' }} /> مالک
                </span>
                <span></span>
              </div>
            )}

            {team.members.map((m) => {
              const cfg = ROLE_CFG[m.role] || ROLE_CFG.viewer
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.avatar, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: '0 0 auto' }}>{m.initials}</span>
                    <span>
                      <span style={{ display: 'block', fontWeight: 700 }}>{m.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }}>{m.email}</span>
                    </span>
                  </span>
                  <Select
                    value={m.role}
                    onChange={(e) => updateRole(m.id, e.target.value)}
                    disabled={actionBusy[`role:${m.id}`]}
                    options={ROLE_OPTIONS}
                  />
                  <span style={{ color: 'var(--gd-text-secondary)' }}>{team.site.title || team.site.name}</span>
                  <span style={{ color: 'var(--gd-text-muted)' }}>عضو</span>
                  <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <IconButton
                      icon="trash-2"
                      label="حذف عضو"
                      size="sm"
                      disabled={actionBusy[`remove:${m.id}`]}
                      onClick={() => remove(m.id)}
                    />
                  </span>
                </div>
              )
            })}

            {team.members.length === 0 && !team.owner && (
              <div style={{ padding: '22px 20px', textAlign: 'center', color: 'var(--gd-text-muted)', fontSize: 13 }}>
                هنوز عضوی ثبت نشده.
              </div>
            )}
          </div>

          {team.invitations.length > 0 && (
            <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden', marginBottom: 22 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="mail" size={17} /> دعوت‌نامه‌های در انتظار
              </div>
              {team.invitations.map((inv) => {
                const cfg = ROLE_CFG[inv.role] || ROLE_CFG.viewer
                return (
                  <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 0.8fr', gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
                    <span style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 13 }}>{inv.email}</span>
                    <Badge variant={cfg.badge.variant} appearance="soft" icon={cfg.badge.icon}>{inv.roleLabel}</Badge>
                    <span style={{ color: 'var(--gd-text-muted)' }}>منقضی در {new Date(inv.expiresAt).toLocaleDateString('fa-IR')}</span>
                    <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon="x"
                        loading={actionBusy[`revoke:${inv.id}`]}
                        onClick={() => revoke(inv.id)}
                      >
                        لغو
                      </Button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="user-plus" size={17} /> دعوت عضو جدید
            </div>
            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
                <Input
                  label="ایمیل"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
                <Select
                  label="نقش"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  options={ROLE_OPTIONS}
                />
                <Button type="submit" variant="primary" loading={inviteBusy} leftIcon="send">ارسال دعوت</Button>
              </div>
              {inviteError && (
                <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{inviteError}</span>
              )}
            </form>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 100 }}>
          <div style={{ background: 'var(--gd-success)', color: '#fff', padding: '10px 16px', borderRadius: 'var(--gd-radius-md)', boxShadow: 'var(--gd-shadow-md)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={16} /> {toast.title}
          </div>
        </div>
      )}
    </>
  )
}
