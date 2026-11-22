import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/index.js'
import Icon from '../../lib/icons.jsx'
import { useAuth } from '../../lib/auth.jsx'
import { auth as authApi, team as teamApi } from '../../lib/api.js'
import { t, date } from '../../lib/i18n.js'
import DigiMascot from '../../components/DigiMascot.jsx'

/**
 * Every team invitation link lands here: /invite?token=…
 *
 * The server says (to the token holder only) which site, which role, the
 * invited address and whether that address already has an account. From
 * there the person is sent the one right way: an existing account signs in
 * and accepts; a new person registers with the token attached. Nobody who
 * already has an account is pushed into a registration that can only fail.
 */
export default function Invite() {
  const [params] = useSearchParams()
  const token = params.get('token') || params.get('invite') || ''
  const { user, ready, logout } = useAuth()
  const nav = useNavigate()
  const [invite, setInvite] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [joined, setJoined] = useState(null)

  useEffect(() => {
    let alive = true
    authApi.invitation(token)
      .then((r) => { if (alive) setInvite(r) })
      .catch((e) => { if (alive) setLoadError(e?.message || t('auth.invite.loadFailed')) })
    return () => { alive = false }
  }, [token])

  const here = `/invite?token=${encodeURIComponent(token)}`
  const signIn = () => nav('/login', { state: { returnTo: here, email: invite?.email } })
  const register = () => nav(`/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite?.email || '')}`)

  const accept = async () => {
    setBusy(true); setErr('')
    try {
      const member = await teamApi.acceptInvitation(token)
      setJoined(member?.siteId || invite.siteId)
    } catch (e) {
      setErr(e?.message || t('auth.invite.acceptFailed'))
    } finally { setBusy(false) }
  }

  const switchAccount = async () => {
    await logout()
    signIn()
  }

  const mascotState = joined ? 'success' : err ? 'error' : busy ? 'busy' : ''
  const head = (
    <div className="dwp-auth-head">
      <span className="gd-sec-head__eyebrow"><Icon name="user-plus" size={13} /> {t('auth.invite.eyebrow')}</span>
      <h2 className="dwp-auth-title">{joined ? t('auth.invite.joinedTitle') : t('auth.invite.title')}</h2>
    </div>
  )

  if (loadError || (!invite && !token)) {
    return (
      <>
        <DigiMascot state="error" />
        {head}
        <div className="gd-field__msg gd-field__msg--error"><Icon name="alert-circle" size={13} />{loadError || t('auth.invite.gone')}</div>
        <p className="dwp-auth-foot"><Link to="/login" className="dwp-auth-link dwp-auth-link--strong">{t('auth.invite.toLogin')}</Link></p>
      </>
    )
  }

  if (!invite || !ready) {
    return (
      <>
        <DigiMascot state="busy" />
        {head}
        <p className="dwp-auth-sub" role="status">{t('auth.invite.checking')}</p>
      </>
    )
  }

  if (invite.state !== 'pending') {
    return (
      <>
        <DigiMascot state="error" />
        {head}
        <p className="dwp-auth-sub">{t('auth.invite.gone')}</p>
        <Button variant="primary" size="lg" fullWidth leftIcon="log-in" onClick={() => nav(user ? '/app' : '/login')}>
          {user ? t('auth.invite.toPanel') : t('auth.invite.toLogin')}
        </Button>
      </>
    )
  }

  return (
    <>
      <DigiMascot state={mascotState} />
      {head}
      <div className="dwp-invite-card">
        <div><span>{t('auth.invite.site')}</span><strong dir="ltr">{invite.site}</strong></div>
        <div><span>{t('auth.invite.role')}</span><strong>{invite.roleLabel}</strong></div>
        <div><span>{t('auth.invite.email')}</span><strong dir="ltr">{invite.email}</strong></div>
        <div><span>{t('auth.invite.expires')}</span><strong>{date(invite.expiresAt)}</strong></div>
      </div>

      {joined ? (
        <>
          <p className="dwp-auth-sub">{t('auth.invite.joined', { site: invite.site })}</p>
          <Button variant="primary" size="lg" fullWidth leftIcon="arrow-left" onClick={() => nav(`/site/${joined}`)} data-anidoodle="submit">
            {t('auth.invite.openSite')}
          </Button>
        </>
      ) : user ? (
        <>
          <p className="dwp-auth-sub">{t('auth.invite.signedInAs', { email: user.email })}</p>
          <Button variant="primary" size="lg" fullWidth leftIcon="check" loading={busy} onClick={accept} data-anidoodle="submit">
            {t('auth.invite.accept')}
          </Button>
          <Button variant="ghost" fullWidth leftIcon="log-out" onClick={switchAccount} style={{ marginTop: 8 }}>
            {t('auth.invite.switchAccount')}
          </Button>
        </>
      ) : invite.hasAccount ? (
        <>
          <p className="dwp-auth-sub">{t('auth.invite.hasAccount')}</p>
          <Button variant="primary" size="lg" fullWidth leftIcon="log-in" onClick={signIn} data-anidoodle="submit">{t('auth.invite.signIn')}</Button>
        </>
      ) : (
        <>
          <p className="dwp-auth-sub">{t('auth.invite.noAccount')}</p>
          <Button variant="primary" size="lg" fullWidth leftIcon="user-plus" onClick={register} data-anidoodle="submit">{t('auth.invite.register')}</Button>
        </>
      )}
      {err && <div className="gd-field__msg gd-field__msg--error" role="alert" style={{ marginTop: 12 }}><Icon name="alert-circle" size={13} />{err}</div>}
    </>
  )
}
