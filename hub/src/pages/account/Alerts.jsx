import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge } from '../../components/index.js'
import { account } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'

/**
 * Emergency contact.
 *
 * The screen exists for one sentence: if your site is compromised, can we
 * actually reach you? That question has a real answer — the server knows which
 * providers are configured on its side and which details are present on yours
 * — and it is stated at the top rather than left for someone to infer from a
 * page of switches.
 *
 * A single working channel is called out as insufficient on purpose. One
 * channel is not redundancy, and the whole design of the dispatcher assumes
 * there is somewhere to fall back to.
 */
export default function Alerts() {
  const [readiness, setReadiness] = useState(null)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [pushState, setPushState] = useState('')

  const load = () => account.alertReadiness().then(setReadiness)

  useEffect(() => {
    let alive = true
    Promise.all([account.alertReadiness(), account.contact()]).then(([r, c]) => {
      if (!alive) return
      setReadiness(r)
      setPhone(c.phone || '')
    })
    return () => { alive = false }
  }, [])

  async function savePhone() {
    setSaving(true); setError(''); setSaved('')
    try {
      await account.setContact({ phone })
      await load()
      setSaved(t('alerts.saved'))
    } catch (e) { setError(e?.message || t('alerts.saveFailed')) } finally { setSaving(false) }
  }

  /**
   * Browser push.
   *
   * Registration is done by the browser, not by us: permission has to be
   * granted in a real user gesture, and the token that comes back is what the
   * server stores. If permission is refused, that is reported plainly instead
   * of leaving a switch that looks on.
   */
  async function enablePush() {
    setPushState(t('alerts.push.requesting'))
    try {
      if (!('Notification' in window)) {
        return setPushState(t('alerts.push.unsupported'))
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        return setPushState(t('alerts.push.denied'))
      }
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg) return setPushState(t('alerts.push.noWorker'))

      const sub = await reg.pushManager.getSubscription()
      const token = sub ? JSON.stringify(sub) : null
      if (!token) return setPushState(t('alerts.push.noSubscription'))

      await account.setContact({ fcmToken: token })
      await load()
      setPushState(t('alerts.push.enabled'))
    } catch (e) {
      setPushState(e?.message || t('alerts.push.failed'))
    }
  }

  if (!readiness) return <PageHead title={t('alerts.title')} subtitle={t('alerts.subtitle')} />

  const tone = readiness.readyCount === 0 ? 'danger' : readiness.readyCount === 1 ? 'warning' : 'success'

  return (
    <>
      <PageHead title={t('alerts.title')} subtitle={t('alerts.subtitle')} />

      <div style={{
        background: `var(--gd-${tone}-bg)`, border: `1px solid var(--gd-${tone})`,
        borderRadius: 'var(--gd-radius-lg)', padding: '16px 20px', marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14.5, fontWeight: 800, marginBottom: 5 }}>
          <Icon name={readiness.readyCount === 0 ? 'alert-octagon' : readiness.readyCount === 1 ? 'alert-triangle' : 'shield-check'} size={18} />
          {readiness.readyCount === 0 ? t('alerts.readiness.none') : t('alerts.readiness.count', { count: readiness.readyCount })}
        </div>
        <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.9 }}>{readiness.verdict}</p>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{t('alerts.channels.title')}</div>
        {/* Both halves are shown, because "we have no key" and "you gave us no
            number" are different problems with different fixes, and a single
            red dot would hide which one this is. */}
        <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
          {t('alerts.channels.hint')}
        </p>
        {readiness.channels.map((c, i) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--gd-border-subtle)' : 'none' }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%', flex: '0 0 auto',
              background: c.ready ? 'var(--gd-success)' : 'var(--gd-text-muted)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.label}</div>
              {c.why && <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>{c.why}</div>}
            </div>
            <Badge variant={c.ready ? 'success' : 'neutral'} appearance="soft">
              {c.ready ? t('alerts.channels.active') : t('alerts.channels.inactive')}
            </Badge>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{t('alerts.phone.title')}</div>
        <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
          {t('alerts.phone.hint')}
        </p>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('alerts.phone.placeholder')} dir="ltr" style={{ flex: '1 1 200px' }} />
          <Button variant="secondary" size="md" disabled={saving} onClick={savePhone}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
        {saved && <p style={{ ...hint, color: 'var(--gd-success)' }}>{saved}</p>}
        {error && <p style={{ ...hint, color: 'var(--gd-danger-text)' }}>{error}</p>}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{t('alerts.push.title')}</div>
        <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
          {t('alerts.push.hint')}
        </p>
        <Button variant="secondary" size="md" leftIcon="bell" onClick={enablePush}>
          {t('alerts.push.enable')}
        </Button>
        {pushState && <p style={hint}>{pushState}</p>}
      </div>

      {/* The honest caveat, kept next to the controls rather than buried. */}
      <p style={{ ...hint, marginTop: 16 }}>
        {t('alerts.caveat')}
      </p>
    </>
  )
}

const card = {
  background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
  borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px',
}
const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '8px 0 0', lineHeight: 1.9 }
