import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select, Badge, SkeletonStats, SkeletonCard } from '../../components/index.js'
import { site as siteApi, account } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'

/**
 * Where this site is hosted.
 */
export default function Hosting() {
  const { siteId } = useOutletContext()
  const [options, setOptions] = useState(null)
  const [form, setForm] = useState(null)
  const [described, setDescribed] = useState(null)
  const [serverUrl, setServerUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // The route element is reused when only :siteId changes, so state from the
  // previous site survives in this component. `loadedFor` says which site the
  // rendered state belongs to: until it matches, the skeleton shows and no
  // stale message or value leaks through.
  const [loadedFor, setLoadedFor] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([account.hostingOptions(), account.sites()])
      .then(([opts, sites]) => {
        if (!alive) return
        setOptions(opts)
        const me = sites.find((s) => s.id === siteId)
        const h = me?.hosting || {}
        setDescribed(h)
        setForm({
          region: h.region || 'unknown',
          provider: h.provider || 'other',
          providerName: h.providerName || '',
          egress: h.egress || 'auto',
          callbackUrl: h.callbackUrl || '',
        })
        // Session-scoped notes ("saved", server URL, errors) never outlive
        // the load they belong to.
        setServerUrl(''); setSaved(''); setError(''); setLoadError('')
        setLoadedFor(siteId)
      })
      .catch((e) => {
        if (!alive) return
        setOptions(null); setForm(null); setDescribed(null)
        setLoadError(e?.message || t('hosting.error.load'))
        setLoadedFor(siteId)
      })
    return () => { alive = false }
  }, [siteId, attempt])

  const head = <PageHead title={t('hosting.title')} subtitle={t('hosting.subtitle')} />

  // A failed first load must say so and offer a way back — never an eternal
  // skeleton that looks like slowness.
  if (loadError && loadedFor === siteId) {
    return (
      <>
        {head}
        <div className="gd-card gd-card--e-sm gd-card--p-md dwp-error-row">
          <Icon name="alert-circle" size={17} style={{ color: 'var(--gd-danger)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--gd-danger-text)', flex: 1 }}>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>{t('common.retry')}</Button>
        </div>
      </>
    )
  }

  if (loadedFor !== siteId || !form || !options) {
    return (
      <>
        {head}
        <SkeletonStats count={3} />
        <SkeletonCard height={160} />
      </>
    )
  }

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved('') }

  // The provider list is filtered by region so someone choosing "ایران" is not
  // scrolling past Kinsta. "Other" always stays, so the form is never a dead end.
  const providers = options.providers.filter(
    (p) => p.id === 'other' || form.region === 'unknown' || p.region === form.region
  )

  // Changing the region can disqualify the selected provider. Left alone, the
  // controlled select would render empty while form.provider kept the stale
  // value — a pair the server happily stores but this panel can no longer show.
  // Drop back to "other" so what is sent is always what is on screen.
  const changeRegion = (region) => {
    setForm((f) => {
      const keepsProvider = region === 'unknown' || f.provider === 'other'
        || options.providers.some((p) => p.id === f.provider && p.region === region)
      return keepsProvider ? { ...f, region } : { ...f, region, provider: 'other' }
    })
    setSaved('')
  }

  async function save() {
    // The server silently nulls a callback URL it cannot parse
    // (server/src/hosting.js normaliseUrl). Refuse the same input here, so the
    // field never keeps showing an address that was not actually stored.
    const cb = form.callbackUrl.trim()
    if (cb) {
      let valid = false
      try { valid = ['http:', 'https:'].includes(new URL(cb).protocol) } catch { valid = false }
      if (!valid) {
        setError(t('hosting.error.callbackInvalid'))
        return
      }
    }
    setSaving(true); setError(''); setSaved('')
    try {
      const res = await siteApi(siteId).setHosting(form)
      const h = res.hosting || {}
      setDescribed(h)
      // Sync the inputs with what the server actually stored — it normalises
      // values (trims the URL, nulls an unknown provider name), so the form
      // must not keep showing what it refused.
      setForm((f) => ({
        region: h.region || f.region,
        provider: h.provider || f.provider,
        providerName: h.providerName || '',
        egress: h.egress || f.egress,
        callbackUrl: h.callbackUrl || '',
      }))
      setServerUrl(res.serverUrl || '')
      setSaved(t('hosting.saved'))
    } catch (e) {
      setError(e?.message || t('hosting.error.save'))
    } finally { setSaving(false) }
  }

  return (
    <>
      {head}

      <div className="gd-card gd-card--e-sm gd-card--p-md">
        <Field
          label={t('hosting.region.label')}
          hint={t('hosting.region.hint')}
        >
          <Select value={form.region} onChange={(e) => changeRegion(e.target.value)}>
            {options.regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
          <p style={hint}>{options.regions.find((r) => r.id === form.region)?.note}</p>
        </Field>

        <Field label={t('hosting.provider.label')} hint={t('hosting.provider.hint')}>
          <Select value={form.provider} onChange={(e) => set('provider')(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>

        {form.provider === 'other' && (
          <Field label={t('hosting.provider.nameLabel')}>
            <Input value={form.providerName} onChange={(e) => set('providerName')(e.target.value)} placeholder={t('hosting.provider.namePlaceholder')} />
          </Field>
        )}

        <Field
          label={t('hosting.egress.label')}
          hint={t('hosting.egress.hint')}
        >
          <Select value={form.egress} onChange={(e) => set('egress')(e.target.value)}>
            <option value="auto">{t('hosting.egress.auto')}</option>
            <option value="ir">{t('hosting.egress.ir')}</option>
            <option value="intl">{t('hosting.egress.intl')}</option>
          </Select>
        </Field>

        <Field
          label={t('hosting.callback.label')}
          hint={t('hosting.callback.hint')}
        >
          <Input value={form.callbackUrl} onChange={(e) => set('callbackUrl')(e.target.value)} placeholder="https://api.digiwp.com/v1" dir="ltr" />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
          {saved && <span style={{ fontSize: 12.5, color: 'var(--gd-success)' }}>{saved}</span>}
          {error && <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{error}</span>}
          <Button variant="primary" size="md" leftIcon="check" disabled={saving} onClick={save}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      {serverUrl && (
        <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{t('hosting.current.title')}</div>
          <p style={{ ...hint, marginTop: 0 }}>
            {t('hosting.current.hint')}
          </p>
          <code style={mono}>{serverUrl}</code>
        </div>
      )}

      {/* What we already know we cannot do on this host. Said before someone
          runs into it, not after a job fails and looks like our bug. */}
      {described?.traits?.length > 0 && (
        <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>
            <Icon name="info" size={16} style={{ color: 'var(--gd-text-muted)' }} />
            {t('hosting.traits.title')}
          </div>
          {described.traits.map((trait) => (
            <div key={trait.id} style={{ padding: '9px 0', borderTop: '1px solid var(--gd-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                <Badge variant="warning" appearance="soft">{trait.label}</Badge>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>{trait.effect}</p>
            </div>
          ))}
        </div>
      )}

      {described?.traitsNote && (
        <p style={{ ...hint, marginTop: 14 }}>{described.traitsNote}</p>
      )}
    </>
  )
}

function Field({ label, hint: h, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
      {h && <p style={hint}>{h}</p>}
    </div>
  )
}

const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.9 }
const mono = {
  display: 'block', fontFamily: 'var(--gd-font-mono)', fontSize: 12,
  background: 'var(--gd-bg-inset)', padding: '9px 12px',
  borderRadius: 'var(--gd-radius-sm)', overflowX: 'auto', direction: 'ltr',
}
