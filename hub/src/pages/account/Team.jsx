import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Badge, Button, IconButton, Input, Select, AlertCard, Toast } from '../../components/index.js'
import { account, site as siteClient, ApiError } from '../../lib/api.js'
import { t, date } from '../../lib/i18n.js'

const ROLE_CFG = {
  owner: { badge: { variant: 'primary', icon: 'crown' }, avatar: 'var(--gd-primary)' },
  admin: { badge: { variant: 'info', icon: 'user-cog' }, avatar: 'var(--gd-cyan-600)' },
  viewer: { badge: { variant: 'neutral', icon: 'eye' }, avatar: 'var(--gd-green-600)' },
}

const roleOptions = () => [
  // برچسب نقشِ «مدیر» نباید چیزی را وعده بدهد که سرور فعلاً اجرا نمی‌کند: لایهٔ
  // عضویت (server/src/routes/sites.js) هر عضو غیرمالک را فقط-خواندنی نگه
  // می‌دارد و همین زیر هر عضو هم نشان داده می‌شود.
  { value: 'admin', label: t('team.roles.admin') },
  { value: 'viewer', label: t('team.roles.viewer') },
]

/* نمایش صدادق «دسترسی مؤثر»: اگر سرور effective نفرستد (نسخهٔ قدیمی)، سمت
   کلاینت نقش را به همان معنای فعلی ترجمه می‌کنیم — هیچ نقشی بیش از آنچه
   سرور اجازه می‌دهد نشان داده نمی‌شود. */
const effectiveOf = (m) => m?.effective
  || (m?.role === 'owner'
    ? { level: 'owner', label: t('team.effective.owner') }
    : { level: 'report', label: t('team.effective.report') })

const COLS = '2.2fr 1fr 1.4fr 1fr 0.6fr'

/* Server-side sendMail reasons for mail.ok=false (server/src/mailer.js). */
const MAIL_FAIL_REASONS = ['no_email_url', 'no_recipient', 'provider_error']
const mailFailReason = (reason) => (MAIL_FAIL_REASONS.includes(reason)
  ? t(`team.mailFail.${reason}`)
  : reason || t('team.mailFail.unknown'))

/**
 * Express answers an unmounted route with a bare «Not Found»; show what is
 * actually missing instead of that English fragment. A server-provided
 * message (site not found, owner-only, …) still wins.
 */
function describeApiError(e, fallback, notFound) {
  if (e instanceof ApiError) {
    if (e.status === 404 && (!e.message || e.message === 'Not Found')) return notFound
    if (e.message) return e.message
  }
  return fallback
}

/** One shared fetch+normalise path for the team of a site. */
async function teamRequest(siteId) {
  try {
    return { team: await siteClient(siteId).team() }
  } catch (e) {
    return { error: describeApiError(e, t('team.errors.loadMembers'), t('team.errors.notEnabled')) }
  }
}

export default function Team() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sites, setSites] = useState(null)
  const [sitesError, setSitesError] = useState(null)
  const [selectedSiteId, setSelectedSiteId] = useState(searchParams.get('site') || '')
  const [team, setTeam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  // لینک ثبت‌نامِ آخرین دعوت، برای کسی که هنوز حساب ندارد. سرور توکن خام را
  // فقط در پاسخ همین درخواست برمی‌گرداند و در هیچ فهرستی ذخیره نمی‌شود.
  const [inviteLink, setInviteLink] = useState(null)
  const [actionBusy, setActionBusy] = useState({})
  const [toast, setToast] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [acceptResult, setAcceptResult] = useState(null)
  const acceptHandledRef = useRef(false)

  // The site list is fetched once. Depending on selectedSiteId here re-ran
  // this request on every site switch just to recompute a default that no
  // longer applies.
  useEffect(() => {
    let alive = true
    account.sites()
      .then((d) => {
        if (!alive) return
        setSites(d || [])
        setSelectedSiteId((cur) => cur || d?.[0]?.id || '')
      })
      .catch((e) => {
        if (alive) setSitesError(e?.message || t('team.errors.loadSites'))
      })
    return () => { alive = false }
  }, [reloadKey])

  // ایمیل دعوت روی «/app/team?accept=<توکن>» فرود می‌آید. توکن یک‌بارمصرف
  // است: یک‌بار می‌خوانیمش، بلافاصله از URL پاک می‌کنیم (نباید در تاریخچه یا
  // رفرش بماند) و همان‌جا می‌پذیریم. API پذیرش کنار توکن به شناسهٔ سایت هم
  // نیاز دارد که لینک باید به‌صورت ?site= بیاورد.
  useEffect(() => {
    const token = searchParams.get('accept')
    if (!token || acceptHandledRef.current) return undefined
    acceptHandledRef.current = true
    const siteId = searchParams.get('site')
    const next = new URLSearchParams(searchParams)
    next.delete('accept')
    setSearchParams(next, { replace: true })
    let alive = true
    if (!siteId) {
      // قاعدهٔ react-hooks/set-state-in-effect setState همگام در بدنهٔ افکت را
      // منع می‌کند. این هشدار ایستا و یک‌بارمصرف است؛ مثل شاخه‌های then/catch
      // در callback تنظیم می‌شود، عمداً به alive وابسته نیست (StrictMode
      // بلافاصله cleanup را صدا می‌زند و پیام پیش از نمایش حذف می‌شد).
      queueMicrotask(() => {
        setAcceptResult({
          severity: 'warning',
          title: t('team.accept.incompleteTitle'),
          desc: t('team.accept.incompleteDesc'),
        })
      })
      return undefined
    }
    siteClient(siteId).acceptInvitation(token)
      .then(() => {
        if (alive) setAcceptResult({ severity: 'success', title: t('team.accept.okTitle'), desc: t('team.accept.okDesc') })
      })
      .catch((e) => {
        if (alive) setAcceptResult({
          severity: 'critical',
          title: t('team.accept.failTitle'),
          desc: describeApiError(e, t('team.errors.accept'), t('team.errors.acceptNotEnabled')),
        })
      })
    return () => { alive = false }
  }, [searchParams, setSearchParams])

  const loadTeam = useCallback(async (siteId) => {
    const r = await teamRequest(siteId)
    setTeam(r.team || null)
    setError(r.error || null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!selectedSiteId) return undefined
    setSearchParams({ site: selectedSiteId })
    let alive = true
    teamRequest(selectedSiteId).then((r) => {
      if (!alive) return
      setTeam(r.team || null)
      setError(r.error || null)
      setLoading(false)
    })
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
      const result = await siteClient(selectedSiteId).inviteMember({ email: inviteEmail.trim(), role: inviteRole })
      setInviteEmail('')
      setInviteRole('viewer')
      // اگر این شخص حساب نداشته باشد، مسیر ثبت‌نام با توکنِ همین دعوت عضویت را
      // یک‌جا برقرار می‌کند (register با inviteToken سمت سرور). لینک فقط همین
      // یک‌بار نمایش داده می‌شود؛ توکن هش‌شده ذخیره شده و دوباره از سرور
      // قابل گرفتن نیست.
      if (result?.raw) {
        setInviteLink({
          url: `${window.location.origin}/register?invite=${result.raw}&email=${encodeURIComponent(result?.invitation?.email || '')}`,
          email: result?.invitation?.email || '',
        })
      }
      // «دعوت‌نامه ثبت شد» و «سرویس ایمیل آن را پذیرفت» دو ادعای جدایند؛ سرور
      // دومی را در mail.ok برمی‌گرداند و فقط با آن پیام موفقیت می‌دهیم.
      if (result?.mail && result.mail.ok === false) {
        setInviteError(t('team.inviteMailFailed', { reason: mailFailReason(result.mail.reason) }))
      } else {
        showToast(t('team.toast.invited'))
      }
      await loadTeam(selectedSiteId)
    } catch (e) {
      setInviteError(describeApiError(e, t('team.errors.invite'), t('team.errors.inviteNotEnabled')))
    } finally {
      setInviteBusy(false)
    }
  }

  const revoke = async (invitationId) => {
    setActionBusy((b) => ({ ...b, [`revoke:${invitationId}`]: true }))
    try {
      await siteClient(selectedSiteId).revokeInvitation(invitationId)
      showToast(t('team.toast.revoked'))
      await loadTeam(selectedSiteId)
    } catch (e) {
      setError(describeApiError(e, t('team.errors.revoke'), t('team.errors.notEnabled')))
    } finally {
      setActionBusy((b) => ({ ...b, [`revoke:${invitationId}`]: false }))
    }
  }

  const updateRole = async (memberId, role) => {
    setActionBusy((b) => ({ ...b, [`role:${memberId}`]: true }))
    try {
      await siteClient(selectedSiteId).updateMemberRole(memberId, role)
      showToast(t('team.toast.roleUpdated'))
      await loadTeam(selectedSiteId)
    } catch (e) {
      setError(describeApiError(e, t('team.errors.role'), t('team.errors.notEnabled')))
    } finally {
      setActionBusy((b) => ({ ...b, [`role:${memberId}`]: false }))
    }
  }

  const remove = async (memberId) => {
    if (!window.confirm(t('team.confirmRemove'))) return
    setActionBusy((b) => ({ ...b, [`remove:${memberId}`]: true }))
    try {
      await siteClient(selectedSiteId).removeMember(memberId)
      showToast(t('team.toast.removed'))
      await loadTeam(selectedSiteId)
    } catch (e) {
      setError(describeApiError(e, t('team.errors.remove'), t('team.errors.notEnabled')))
    } finally {
      setActionBusy((b) => ({ ...b, [`remove:${memberId}`]: false }))
    }
  }

  const head = (
    <PageHead
      title={t('team.title')}
      subtitle={t('team.subtitle')}
      action={null}
    />
  )

  if (sitesError) {
    return (
      <>
        {head}
        <AlertCard
          severity="critical"
          title={t('team.errors.loadSitesTitle')}
          desc={sitesError}
          className="dwp-acc-alert"
          actions={(
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setSitesError(null); setReloadKey((k) => k + 1) }}>
              {t('common.retry')}
            </Button>
          )}
        />
      </>
    )
  }

  if (!sites) return head

  if (sites.length === 0) {
    return (
      <>
        {head}
        <AlertCard
          severity="info"
          title={t('team.noSites.title')}
          desc={t('team.noSites.desc')}
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
            label={t('team.selectSite')}
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.title || s.name}</option>
            ))}
          </Select>
        </div>
      )}

      {acceptResult && (
        <AlertCard
          severity={acceptResult.severity}
          title={acceptResult.title}
          desc={acceptResult.desc}
          onDismiss={() => setAcceptResult(null)}
          className="dwp-acc-alert"
        />
      )}

      {error && (
        <AlertCard
          severity="critical"
          title={t('team.errors.title')}
          desc={error}
          onDismiss={() => setError(null)}
          className="dwp-acc-alert"
          actions={selectedSiteId ? (
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setError(null); loadTeam(selectedSiteId) }}>{t('common.retry')}</Button>
          ) : undefined}
        />
      )}

      {loading && (
        <div style={{ color: 'var(--gd-text-muted)', padding: '18px 0' }}>
          {t('team.loadingMembers')}
        </div>
      )}

      {!loading && team && (
        <>
          <div className="dwp-card dwp-acc-tablewrap" style={{ marginBottom: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
              <span>{t('team.cols.member')}</span>
              <span>{t('team.cols.role')}</span>
              <span>{t('team.cols.site')}</span>
              <span>{t('team.cols.status')}</span>
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
                <span>
                  <Badge variant={ROLE_CFG.owner.badge.variant} appearance="soft" icon={ROLE_CFG.owner.badge.icon}>{team.owner.roleLabel}</Badge>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 4 }}>
                    {t('team.effective.current', { label: effectiveOf(team.owner).label })}
                  </span>
                </span>
                <span style={{ color: 'var(--gd-text-secondary)' }}>{team.site.title || team.site.name}</span>
                <span style={{ color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gd-success)' }} /> {t('team.status.owner')}
                </span>
                <span></span>
              </div>
            )}

            {team.members.map((m) => {
              const cfg = ROLE_CFG[m.role] || ROLE_CFG.viewer
              const eff = effectiveOf(m)
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{ width: 38, height: 38, borderRadius: '50%', background: cfg.avatar, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flex: '0 0 auto' }}>{m.initials}</span>
                    <span>
                      <span style={{ display: 'block', fontWeight: 700 }}>{m.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }}>{m.email}</span>
                    </span>
                  </span>
                  <span>
                    <Select
                      value={m.role}
                      onChange={(e) => updateRole(m.id, e.target.value)}
                      disabled={actionBusy[`role:${m.id}`]}
                      options={roleOptions()}
                    />
                    {/* نقش ذخیره‌شده و دسترسی مؤثر دو چیزند؛ هر دو صادقانه
                        نشان داده می‌شوند تا برچسب «مدیر» کاری را وعده ندهد که
                        سرور با 403 پاسخ می‌دهد. */}
                    {eff.level !== 'owner' && (
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 4 }}>
                        {t('team.effective.current', { label: eff.label })}
                      </span>
                    )}
                  </span>
                  <span style={{ color: 'var(--gd-text-secondary)' }}>{team.site.title || team.site.name}</span>
                  <span style={{ color: 'var(--gd-text-muted)' }}>{t('team.status.member')}</span>
                  <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <IconButton
                      icon="trash-2"
                      label={t('team.removeMember')}
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
                {t('team.noMembers')}
              </div>
            )}
          </div>

          {inviteLink && (
            <div className="dwp-card" style={{ padding: '14px 20px', marginBottom: 22 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="link-2" size={16} /> {t('team.inviteLink.title', { email: inviteLink.email })}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '6px 0 10px' }}>
                {t('team.inviteLink.desc')}
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ flex: '1 1 260px', fontSize: 12, fontFamily: 'var(--gd-font-mono)', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 8, padding: '8px 10px', overflowWrap: 'anywhere' }}>
                  {inviteLink.url}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon="copy"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteLink.url)
                      showToast(t('team.toast.linkCopied'))
                    } catch {
                      showToast(t('team.toast.copyFailed'), 'warning')
                    }
                  }}
                >
                  {t('team.inviteLink.copy')}
                </Button>
                <Button variant="ghost" size="sm" leftIcon="x" onClick={() => setInviteLink(null)}>{t('common.close')}</Button>
              </div>
            </div>
          )}

          {team.invitations.length > 0 && (
            <div className="dwp-card dwp-acc-tablewrap" style={{ marginBottom: 22 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="mail" size={17} /> {t('team.pending.title')}
              </div>
              {team.invitations.map((inv) => {
                const cfg = ROLE_CFG[inv.role] || ROLE_CFG.viewer
                return (
                  <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 0.8fr', gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid var(--gd-border-subtle)', fontSize: 13.5 }}>
                    <span style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 13 }}>{inv.email}</span>
                    <Badge variant={cfg.badge.variant} appearance="soft" icon={cfg.badge.icon}>{inv.roleLabel}</Badge>
                    <span style={{ color: 'var(--gd-text-muted)' }}>{t('team.pending.expires', { date: date(inv.expiresAt) })}</span>
                    <span style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon="x"
                        loading={actionBusy[`revoke:${inv.id}`]}
                        onClick={() => revoke(inv.id)}
                      >
                        {t('team.pending.revoke')}
                      </Button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="dwp-card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="user-plus" size={17} /> {t('team.invite.title')}
            </div>
            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="dwp-acc-invite-grid">
                <Input
                  label={t('team.invite.email')}
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
                <Select
                  label={t('team.invite.role')}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  options={roleOptions()}
                />
                <Button type="submit" variant="primary" loading={inviteBusy} leftIcon="send">{t('team.invite.submit')}</Button>
              </div>
              {inviteError && (
                <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{inviteError}</span>
              )}
            </form>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 100 }}>
          <Toast tone={toast.tone} title={toast.title} />
        </div>
      )}
    </>
  )
}
