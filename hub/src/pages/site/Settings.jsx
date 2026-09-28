import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, Switch, SkeletonStats, SkeletonCard } from '../../components/index.js'
import { faNum, faAgo } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

const TIERS = [
  {
    key: 'report', icon: 'eye', title: 'فقط گزارش',
    desc: 'فقط مشاهده و پیشنهاد؛ هیچ تغییری اعمال نمی‌شود.',
    softBg: 'var(--gd-bg-inset)', softColor: 'var(--gd-gray-600)',
    solidBg: 'var(--gd-gray-700)', tint: 'var(--gd-bg-inset)',
    line: 'var(--gd-authority-report)', text: 'var(--gd-text)',
  },
  {
    key: 'confirm', icon: 'user-check', title: 'با تأیید',
    desc: 'راه‌حل را آماده می‌کند و منتظر تأیید شما می‌ماند.',
    softBg: 'var(--gd-warning-bg)', softColor: 'var(--gd-warning)',
    solidBg: 'var(--gd-warning)', tint: 'var(--gd-warning-bg)',
    line: 'var(--gd-authority-confirm)', text: 'var(--gd-warning-text)',
  },
  {
    key: 'auto', icon: 'zap', title: 'خودکار',
    desc: 'کارهای کم‌ریسک را خودش انجام می‌دهد؛ موارد حساس با تأیید.',
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
// The dev mock instead sends a ready-made Persian string. A number becomes
// relative Persian time (absolute date past a month, like the server's own
// faWhen in routes/sites.js); any other non-empty string passes through;
// anything else is missing → «—».
function lastSeenLabel(value) {
  if (value === null || value === undefined || value === '') return '—'
  const t = typeof value === 'number'
    ? value
    : (/^\d+$/.test(String(value).trim()) ? Number(value) : NaN)
  if (!Number.isFinite(t) || t <= 0) return typeof value === 'string' ? value : '—'
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins >= 60 * 24 * 31) return new Date(t).toLocaleDateString('fa-IR')
  return faAgo(Math.max(0, mins))
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
      setSaveError(e?.message || 'ذخیره نشد — سطح اختیار اعمال نشد.')
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
      setLoadError(e?.message || 'بارگذاری تنظیمات انجام نشد.')
      setLoadedFor(siteId)
    })
    return () => { alive = false }
  }, [siteId, attempt])

  const subtitle = 'سطح اختیار پشتیبان، اتصال و ترجیحات پایش'
  const fresh = loadedFor === siteId

  if (loadError && fresh) {
    return (
      <>
        <PageHead title="تنظیمات سایت" subtitle={subtitle} />
        <div className="gd-card gd-card--e-sm gd-card--p-md dwp-error-row">
          <Icon name="alert-circle" size={17} style={{ color: 'var(--gd-danger)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--gd-danger-text)', flex: 1 }}>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>تلاش دوباره</Button>
        </div>
      </>
    )
  }

  if (!fresh || !data) {
    return (
      <>
        <PageHead title="تنظیمات سایت" subtitle={subtitle} />
        <SkeletonStats count={3} />
        <SkeletonCard height={200} />
      </>
    )
  }

  // The sensitive-action list comes from the server. When it is absent there
  // is nothing to show but the connector card — inventing labels would break
  // product truth rule ۱.
  const hasSensitive = Array.isArray(data.sensitive) && data.sensitive.length > 0

  return (
    <>
      <PageHead title="تنظیمات سایت" subtitle={subtitle} />

      {/* Authority level selector — a real radio group: keyboard arrows move
          between levels and screen readers see the selection. The input is
          visually hidden; the wrapping label is the click target. */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>سطح اختیار پشتیبان</div>
      <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '0 0 14px' }}>
        تعیین کنید پشتیبان چقدر آزادی عمل داشته باشد. موارد حساس در هر سطحی به تأیید شما نیاز دارند.
      </p>
      <div className="dwp-tiers" role="radiogroup" aria-label="سطح اختیار پشتیبان">
        {TIERS.map((t) => {
          const sel = authority === t.key
          return (
            <label
              key={t.key}
              className="dwp-tier"
              style={{
                border: sel ? `2px solid ${t.line}` : '1.5px solid var(--gd-border)',
                borderRadius: 'var(--gd-radius-lg)',
                padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 9,
                cursor: 'pointer',
                background: sel ? t.tint : 'var(--gd-bg-surface)',
              }}
            >
              <input
                type="radio" name="authority-level" value={t.key}
                className="dwp-tier__radio"
                checked={sel}
                onChange={() => setAuthority(t.key)}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: sel ? t.solidBg : t.softBg, color: sel ? '#fff' : t.softColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={19} />
                </span>
                {sel ? (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${t.solidBg}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.solidBg }} />
                  </span>
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--gd-border-strong)', flex: '0 0 auto' }} />
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: sel ? t.text : undefined }}>
                {t.title}
                {sel && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: t.solidBg, color: '#fff', borderRadius: 999, padding: '1px 8px', marginInlineStart: 4 }}>فعال</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: sel ? t.text : 'var(--gd-text-muted)', lineHeight: 1.6, opacity: sel ? 0.9 : 1 }}>
                {t.desc}
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
              <Icon name="lock" size={17} style={{ color: 'var(--gd-danger)' }} /> اقدام‌های همیشه نیازمند تأیید
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
              این کارها حتی در حالت خودکار هم بدون اجازهٔ شما انجام نمی‌شوند.
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
            <Icon name="plug" size={17} style={{ color: 'var(--gd-primary)' }} /> اتصال و پایش
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>وضعیت اتصال</span>
            {data.connector.paired
              ? <Badge variant="success" appearance="soft" dot>متصل</Badge>
              : <Badge variant="danger" appearance="soft" dot>قطع</Badge>}
          </div>
          {/* An unpaired site sends { paired: false } and nothing else. Missing
              is missing: «—», not an empty cell that looks like a rendering bug. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>سرور واسط</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>{data.connector.server || '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>نسخهٔ کانکتور</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>
              {data.connector.version ? `v${faNum(data.connector.version)}` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>آخرین ارتباط</span>
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
          بازنشانی
        </Button>
        <Button
          variant="primary" size="md" leftIcon="check"
          disabled={saving || authority === data.authority}
          onClick={saveAuthority}
        >
          {saving ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'}
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
      else if (next.pushed === false) setNotice('ذخیره شد، ولی هنوز به سایت اعمال نشده — در بررسی بعدی دوباره تلاش می‌شود.')
    } catch (e) {
      setNotice(e?.message || 'ذخیره نشد.')
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
      setNotice(e?.message || 'ذخیره نشد.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
          <Icon name="shield-check" size={17} style={{ color: 'var(--gd-success)' }} /> به‌روزرسانی خودکار
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>حالت ایمنی</span>
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
          <Icon name="lock" size={13} style={{ verticalAlign: '-2px', marginLeft: 5, color: 'var(--gd-success)' }} />
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
    { label: 'هسته', list: summary.core },
    { label: 'افزونه', list: summary.plugin },
    { label: 'قالب', list: summary.theme },
  ]
  const total = groups.reduce((n, g) => n + (g.list?.length || 0), 0)
  const failedItems = groups.flatMap((g) => (g.list || []).filter((i) => i && !i.ok && !i.unknown))
  const failedNames = failedItems.map((i) => i.name).filter(Boolean).join('، ')
  const unknown = groups.reduce((n, g) => n + (g.list || []).filter((i) => i?.unknown).length, 0)
  const when = state?.at ? new Date(state.at).toLocaleString('fa-IR') : ''
  const counts = groups.filter((g) => g.list?.length).map((g) => `${faNum(g.list.length)} ${g.label}`).join(' و ')

  // No reported run at all, or an empty one: pending updates are simply not
  // measured here. Say that — never a green zero.
  if (!total) {
    return <>هنوز گزارش به‌روزرسانی خودکاری از سایت ثبت نشده؛ تا اولین اجرا، به‌روزرسانی‌های معلق اندازه‌گیری نشده‌اند.</>
  }

  if (failedItems.length || unknown) {
    return (
      <span style={{ display: 'block', color: 'var(--gd-warning-text)', background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning-border)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
        آخرین گزارش به‌روزرسانی خودکار{when ? ` (${when})` : ''}: {counts}.
        {failedItems.length > 0 && (
          <span style={{ display: 'block' }}>
            {faNum(failedItems.length)} مورد ناموفق بود{failedNames ? `: ${failedNames}` : ''}.
          </span>
        )}
        {unknown > 0 && (
          <span style={{ display: 'block' }}>
            نتیجهٔ {faNum(unknown)} مورد نامشخص ماند — نه موفق ثبت شد، نه ناموفق.
          </span>
        )}
      </span>
    )
  }

  return (
    <>
      <Icon name="check" size={13} style={{ verticalAlign: '-2px', marginLeft: 5, color: 'var(--gd-success)' }} />
      آخرین گزارش به‌روزرسانی خودکار{when ? ` (${when})` : ''}: {counts} — همگی با موفقیت انجام شد.
    </>
  )
}
