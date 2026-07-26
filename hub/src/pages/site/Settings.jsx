import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, Switch, Select } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
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

const SENSITIVE_ICONS = ['trash-2', 'palette', 'file-code', 'credit-card', 'globe', 'database']

export default function Settings() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [authority, setAuthority] = useState('auto')
  const [saving, setSaving] = useState(false)

  async function saveAuthority() {
    setSaving(true)
    try {
      await siteApi(siteId).setAuthority(authority)
      setData((d) => ({ ...d, authority }))
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
    })
    return () => { alive = false }
  }, [siteId])

  if (!data) return <PageHead title="تنظیمات سایت" subtitle="سطح اختیار پشتیبان، اتصال و ترجیحات پایش" />

  return (
    <>
      <PageHead title="تنظیمات سایت" subtitle="سطح اختیار پشتیبان، اتصال و ترجیحات پایش" />

      {/* Authority level selector */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>سطح اختیار پشتیبان</div>
      <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '0 0 14px' }}>
        تعیین کنید پشتیبان چقدر آزادی عمل داشته باشد. موارد حساس در هر سطحی به تأیید شما نیاز دارند.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {TIERS.map((t) => {
          const sel = authority === t.key
          return (
            <label
              key={t.key}
              onClick={() => setAuthority(t.key)}
              style={{
                border: sel ? `2px solid ${t.line}` : '1.5px solid var(--gd-border)',
                borderRadius: 'var(--gd-radius-lg)',
                padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 9,
                cursor: 'pointer',
                background: sel ? t.tint : 'var(--gd-bg-surface)',
              }}
            >
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
          update-policy card above. */}

      {/* Sensitive actions + connector/monitoring */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 18, marginBottom: 22 }}>
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            <Icon name="lock" size={17} style={{ color: 'var(--gd-danger)' }} /> اقدام‌های همیشه نیازمند تأیید
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
            این کارها حتی در حالت خودکار هم بدون اجازهٔ شما انجام نمی‌شوند.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {data.sensitive.map((label, i) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px' }}>
                <Icon name={SENSITIVE_ICONS[i] || 'lock'} size={15} style={{ color: 'var(--gd-text-muted)' }} /> {label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700 }}>
            <Icon name="plug" size={17} style={{ color: 'var(--gd-primary)' }} /> اتصال و پایش
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>وضعیت اتصال</span>
            {data.connector.paired
              ? <Badge variant="success" appearance="soft" dot>متصل</Badge>
              : <Badge variant="danger" appearance="soft" dot>قطع</Badge>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>سرور واسط</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>{data.connector.server}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>نسخهٔ کانکتور</span>
            <span style={{ fontSize: 12.5, fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)' }}>v{faNum(data.connector.version)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--gd-text-secondary)' }}>آخرین ارتباط</span>
            <span style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{data.connector.lastSeen}</span>
          </div>
          <Select label="فرکانس بررسی" options={[
            { value: '1', label: 'هر ۱ دقیقه' },
            { value: '5', label: 'هر ۵ دقیقه' },
            { value: '15', label: 'هر ۱۵ دقیقه' },
          ]} />
          <Select label="پنجرهٔ نگهداری (کم‌ترافیک)" options={[
            { value: '2-5', label: '۰۲:۰۰ تا ۰۵:۰۰' },
            { value: '0-3', label: '۰۰:۰۰ تا ۰۳:۰۰' },
          ]} />
        </div>
      </div>

      {/* Save bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--gd-border-subtle)', paddingTop: 18 }}>
        {/* The authority selector is the only thing this bar still governs;
            the auto-update switches save themselves on click, because a
            security setting that waits for a button somewhere else is a
            setting that gets left half-applied. */}
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

  const pending =
    (state?.plugins_pending?.length || 0) +
    (state?.themes_pending?.length || 0) +
    (state?.core_outdated ? 1 : 0)

  return (
    <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
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

      {/* Measured, not claimed: what the site reports is still pending. */}
      {state && (
        <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--gd-border-subtle)', lineHeight: 1.7 }}>
          {pending === 0 ? (
            <>
              <Icon name="check" size={13} style={{ verticalAlign: '-2px', marginLeft: 5, color: 'var(--gd-success)' }} />
              وردپرس {faNum(state.wp_version)} — هیچ به‌روزرسانی معلقی نیست.
            </>
          ) : (
            <>
              وردپرس {faNum(state.wp_version)}
              {state.core_outdated && ` (آخرین نسخه: ${faNum(state.wp_latest)})`}
              {' — '}
              {faNum(state.plugins_pending?.length || 0)} افزونه و {faNum(state.themes_pending?.length || 0)} قالب در انتظار به‌روزرسانی.
            </>
          )}
        </div>
      )}
    </div>
  )
}
