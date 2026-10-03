import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, Switch, SkeletonStats, SkeletonCard } from '../../components/index.js'
import { t, digits, ago, date, dateTime, getIntlLocale } from '../../lib/i18n.js'
import { site as siteApi } from '../../lib/api.js'

// Title/description are translated at render: settings.tiers.<key>.title|desc
const TIERS = [
  {
    key: 'report', icon: 'eye',
    softBg: 'var(--gd-bg-inset)', softColor: 'var(--gd-gray-600)',
    solidBg: 'var(--gd-gray-700)', tint: 'var(--gd-bg-inset)',
    line: 'var(--gd-authority-report)', text: 'var(--gd-text)',
  },
  {
    key: 'confirm', icon: 'user-check',
    softBg: 'var(--gd-warning-bg)', softColor: 'var(--gd-warning)',
    solidBg: 'var(--gd-warning)', tint: 'var(--gd-warning-bg)',
    line: 'var(--gd-authority-confirm)', text: 'var(--gd-warning-text)',
  },
  {
    key: 'auto', icon: 'zap',
    softBg: 'var(--gd-success-bg)', softColor: 'var(--gd-success)',
    solidBg: 'var(--gd-success)', tint: 'var(--gd-success-bg)',
    line: 'var(--gd-authority-auto)', text: 'var(--gd-success-text)',
  },
]

// Names must exist in hub/src/lib/icon-map.js — an unregistered name silently
// falls back to the generic circle icon.
const SENSITIVE_ICONS = ['trash-2', 'palette', 'code', 'credit-card', 'globe', 'database']

// The relay stores connector.lastSeen as a raw epoch-ms number — every contact
// rewrites it with Date.now() (server/src/store.js) and the settings route
// returns it unformatted — so printing it directly showed a 13-digit integer.
// The dev mock instead sends a ready-made string. A number becomes localised
// relative time (absolute date past a month, like the server's own when-label
// in routes/sites.js); any other non-empty string passes through;
// anything else is missing → «—».
function lastSeenLabel(value) {
  if (value === null || value === undefined || value === '') return '—'
  const ts = typeof value === 'number'
    ? value
    : (/^\d+$/.test(String(value).trim()) ? Number(value) : NaN)
  if (!Number.isFinite(ts) || ts <= 0) return typeof value === 'string' ? value : '—'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins >= 60 * 24 * 31) return date(ts)
  return ago(Math.max(0, mins))
}

export default function Settings() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [authority, setAuthority] = useState('auto')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // The route element is reused when only :siteId changes; `loadedFor` says
  // which site the rendered state belongs to, so the previous site's data and
  // messages never show while the new one loads.
  const [loadedFor, setLoadedFor] = useState(null)

  async function saveAuthority() {
    setSaving(true)
    setSaveError('')
    try {
      await siteApi(siteId).setAuthority(authority)
      setData((d) => ({ ...d, authority }))
    } catch (e) {
      // Silence here reads as "applied". The failure must be visible next to
      // the button that claimed it.
      setSaveError(e?.message || t('settings.error.saveAuthority'))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let alive = true
    siteApi(siteId).settings().then((d) => {
      if (!alive) return
      setData(d)
      setAuthority(d.authority)
      // Messages from the previous site or attempt never outlive this load.
      setSaveError(''); setLoadError(''); setSaving(false)
      setLoadedFor(siteId)
    }).catch((e) => {
      if (!alive) return
      setData(null)
      setLoadError(e?.message || t('settings.error.load'))
      setLoadedFor(siteId)
    })
    return () => { alive = false }
  }, [siteId, attempt])

  const subtitle = t('settings.subtitle')
  const title = t('settings.title')
  const fresh = loadedFor === siteId

  if (loadError && fresh) {
    return (
      <>
        <PageHead title={title} subtitle={subtitle} />
        <div className="gd-card gd-card--e-sm gd-card--p-md dwp-error-row">
          <Icon name="alert-circle" size={17} style={{ color: 'var(--gd-danger)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--gd-danger-text)', flex: 1 }}>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>{t('common.retry')}</Button>
        </div>
      </>
    )
  }

  if (!fresh || !data) {
    return (
      <>
        <PageHead title={title} subtitle={subtitle} />
        <SkeletonStats count={3} />
        <SkeletonCard height={200} />
      </>
    )
  }

  // The sensitive-action list comes from the server. When it is absent there
  // is nothing to show but the connector card — inventing labels would break
  // product truth rule 1.
  const hasSensitive = Array.isArray(data.sensitive) && data.sensitive.length > 0

  return (
    <>
      <PageHead title={title} subtitle={subtitle} />

      {/* Authority level selector — a real radio group: keyboard arrows move
          between levels and screen readers see the selection. The input is
          visually hidden; the wrapping label is the click target. */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>{t('settings.authority.title')}</div>
      <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '0 0 14px' }}>
        {t('settings.authority.hint')}
      </p>
      <div className="dwp-tiers" role="radiogroup" aria-label={t('settings.authority.title')}>
        {TIERS.map((tier) => {
          const sel = authority === tier.key
          return (
            <label
              key={tier.key}
              className="dwp-tier"
              style={{
                border: sel ? `2px solid ${tier.line}` : '1.5px solid var(--gd-border)',
                borderRadius: 'var(--gd-radius-lg)',
                padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 9,
                cursor: 'pointer',
                background: sel ? tier.tint : 'var(--gd-bg-surface)',
              }}
            >
              <input
                type="radio" name="authority-level" value={tier.key}
                className="dwp-tier__radio"
                checked={sel}
                onChange={() => setAuthority(tier.key)}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: sel ? tier.solidBg : tier.softBg, color: sel ? '#fff' : tier.softColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={tier.icon} size={19} />
                </span>
                {sel ? (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${tier.solidBg}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: tier.solidBg }} />
                  </span>
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--gd-border-strong)', flex: '0 0 auto' }} />
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: sel ? tier.text : undefined }}>
                {t(`settings.tiers.${tier.key}.title`)}
                {sel && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: tier.solidBg, color: '#fff', borderRadius: 999, padding: '1px 8px', marginInlineStart: 4 }}>{t('settings.authority.active')}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: sel ? tier.text : 'var(--gd-text-muted)', lineHeight: 1.6, opacity: sel ? 0.9 : 1 }}>
                {t(`settings.tiers.${tier.key}.desc`)}
              </div>
            </label>
          )
        })}
      </div>

      {/* Auto-update policy. Rendered from the server's own description of the
          switches, including whether each is locked, so the panel never has to
          re-derive the rule and drift from the enforcement. */}
      {data.updatePolicy && (
        <UpdatePolicyCard
          siteId={siteId}
          policy={data.updatePolicy}
          state={data.updateState}
          onChange={(next) => setData((d) => ({ ...d, updatePolicy: next }))}
        />
      )}

      {/* The four switches that used to sit here — ۲۴-hour monitoring, automatic
          break-fix, backup-before-every-change, speed optimisation — were
          `defaultChecked` with no handler: nothing behind them existed, and
          nothing was saved when they were flipped. Three of the four described
          capabilities this system does not have at all. The real switches, the
          ones that write to the server and are enforced by safe mode, are the
          update-policy card above. The «فرکانس بررسی» / «پنجرهٔ نگهداری»
          selects met the same end: no endpoint behind them, so a change saved
          nothing. They are gone until such an endpoint exists. */}

      {/* Sensitive actions + connector/monitoring */}
      <div
        className={hasSensitive ? 'dwp-settings-grid' : undefined}
        style={hasSensitive ? undefined : { marginBottom: 22 }}
      >
        {hasSensitive && (
          <div className="gd-card gd-card--e-sm gd-card--p-md">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              <Icon name="lock" size={17} style={{ color: 'var(--gd-danger)' }} /> {t('settings.sensitive.title')}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
              {t('settings.sensitive.hint')}
            </p>
            <div className="dwp-chip-grid">
              {data.sensitive.map((label, i) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
                  <Icon name={SENSITIVE_ICONS[i] || 'lock'} size={15} style={{ color: 'var(--gd-text-muted)' }} /> {label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
            <Icon name="plug" size={17} style={{ color: 'var(--gd-primary)' }} /> {t('settings.connector.title')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>{t('settings.connector.status')}</span>
            {data.connector.paired
              ? <Badge variant="success" appearance="soft" dot>{t('settings.connector.connected')}</Badge>
              : <Badge variant="danger" appearance="soft" dot>{t('settings.connector.disconnected')}</Badge>}
          </div>
          {/* An unpaired site sends { paired: false } and nothing else. Missing
              is missing: «—», not an empty cell that looks like a rendering bug. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>{t('settings.connector.relay')}</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>{data.connector.server || '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>{t('settings.connector.version')}</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>
              {data.connector.version ? `v${digits(data.connector.version)}` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>{t('settings.connector.lastSeen')}</span>
            <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{lastSeenLabel(data.connector.lastSeen)}</span>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 18, flexWrap: 'wrap' }}>
        {/* The authority selector is the only thing this bar still governs;
            the auto-update switches save themselves on click, because a
            security setting that waits for a button somewhere else is a
            setting that gets left half-applied. */}
        {saveError && <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', marginInlineEnd: 'auto' }}>{saveError}</span>}
        <Button variant="ghost" size="md" onClick={() => setAuthority(data.authority)}>
          {t('settings.reset')}
        </Button>
        <Button
          variant="primary" size="md" leftIcon="check"
          disabled={saving || authority === data.authority}
          onClick={saveAuthority}
        >
          {saving ? t('common.saving') : t('settings.saveChanges')}
        </Button>
      </div>
    </>
  )
}

/**
 * The three auto-update switches.
 *
 * Each saves on its own — there is no "save changes" step, because a security
 * setting that only takes effect if you remember to press a button somewhere
 * else is a setting that will be left half-applied.
 *
 * Locked state comes from the server, and so does the refusal: when safe mode
 * rejects a change, the switch snaps back AND the reason is shown. A control
 * that silently reverts reads as a bug and teaches people to distrust the panel.
 */
function UpdatePolicyCard({ siteId, policy, state, onChange }) {
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  async function flip(id, on) {
    setBusy(id)
    setNotice('')
    try {
      const next = await siteApi(siteId).setUpdatePolicy({ [id]: on })
      onChange(next)
      if (next.message) setNotice(next.message)
      else if (next.pushed === false) setNotice(t('settings.policy.notPushed'))
    } catch (e) {
      setNotice(e?.message || t('settings.error.save'))
    } finally {
      setBusy('')
    }
  }

  async function flipSafeMode(on) {
    setBusy('safeMode')
    setNotice('')
    try {
      onChange(await siteApi(siteId).setUpdatePolicy({ safeMode: on }))
    } catch (e) {
      setNotice(e?.message || t('settings.error.save'))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
          <Icon name="shield-check" size={17} style={{ color: 'var(--gd-success)' }} /> {t('settings.policy.title')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{t('settings.policy.safeMode')}</span>
          <Switch
            checked={policy.safeMode}
            disabled={busy === 'safeMode'}
            onChange={(v) => flipSafeMode(v)}
            size="md"
          />
        </div>
      </div>

      {policy.lockReason && (
        <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.7 }}>
          <Icon name="lock" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 5, color: 'var(--gd-success)' }} />
          {policy.lockReason}
        </p>
      )}

      <div className="dwp-switch-grid">
        {policy.switches.map((s) => (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)',
              borderRadius: 'var(--gd-radius-md)', padding: '12px 14px',
              opacity: busy === s.id ? 0.6 : 1,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.label}
                {s.locked && <Icon name="lock" size={12} style={{ color: 'var(--gd-text-muted)' }} />}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
            <Switch
              checked={s.on}
              disabled={s.locked || busy === s.id}
              onChange={(v) => flip(s.id, v)}
              size="md"
            />
          </div>
        ))}
      </div>

      {notice && (
        <p style={{ fontSize: 12.5, color: 'var(--gd-warning-text)', background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px', margin: '14px 0 0', lineHeight: 1.6 }}>
          {notice}
        </p>
      )}

      {/* Measured, not claimed. The only writer of update_state is the site's
          own update-run report (server/src/routes/connector.js), stored as
          { summary: { core, plugin, theme }, at } — what was ATTEMPTED and how
          it ended. It never contains a pending list: the old UI read
          plugins_pending/themes_pending/core_outdated fields nothing writes,
          so every site with one reported run rendered a green «هیچ
          به‌روزرسانی معلقی نیست» from absent data. What follows states the
          measured outcome, worded as exactly that. */}
      <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gd-border-subtle)', lineHeight: 1.7 }}>
        <UpdateRunNote state={state} />
      </div>
    </div>
  )
}

function UpdateRunNote({ state }) {
  const summary = state?.summary || {}
  const groups = [
    { kind: 'core', list: summary.core },
    { kind: 'plugin', list: summary.plugin },
    { kind: 'theme', list: summary.theme },
  ]
  const total = groups.reduce((n, g) => n + (g.list?.length || 0), 0)
  const failedItems = groups.flatMap((g) => (g.list || []).filter((i) => i && !i.ok && !i.unknown))
  const failedNames = failedItems.map((i) => i.name).filter(Boolean).join(t('settings.run.nameSeparator'))
  const unknown = groups.reduce((n, g) => n + (g.list || []).filter((i) => i?.unknown).length, 0)
  const when = state?.at ? dateTime(state.at) : ''
  const counts = new Intl.ListFormat(getIntlLocale(), { type: 'conjunction' })
    .format(groups.filter((g) => g.list?.length).map((g) => t(`settings.run.kind.${g.kind}`, { count: g.list.length })))

  // No reported run at all, or an empty one: pending updates are simply not
  // measured here. Say that — never a green zero.
  if (!total) {
    return <>{t('settings.run.none')}</>
  }

  if (failedItems.length || unknown) {
    return (
      <span style={{ display: 'block', color: 'var(--gd-warning-text)', background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning-border)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
        {when ? t('settings.run.lastWhen', { when, counts }) : t('settings.run.last', { counts })}
        {failedItems.length > 0 && (
          <span style={{ display: 'block' }}>
            {failedNames
              ? t('settings.run.failedNames', { count: failedItems.length, names: failedNames })
              : t('settings.run.failed', { count: failedItems.length })}
          </span>
        )}
        {unknown > 0 && (
          <span style={{ display: 'block' }}>
            {t('settings.run.unknown', { count: unknown })}
          </span>
        )}
      </span>
    )
  }

  return (
    <>
      <Icon name="check" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: 5, color: 'var(--gd-success)' }} />
      {when ? t('settings.run.allOkWhen', { when, counts }) : t('settings.run.allOk', { counts })}
    </>
  )
}
