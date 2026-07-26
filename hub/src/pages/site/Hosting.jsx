import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select, Badge } from '../../components/index.js'
import { site as siteApi, account } from '../../lib/api.js'

/**
 * Where this site is hosted.
 *
 * Not a form for its own sake — three things depend on the answer, and the
 * page says which, because a field whose effect is invisible is a field people
 * fill in carelessly:
 *
 *   which of our servers reaches the site,
 *   which address the site's connector is told to call us back on,
 *   and what we already know we cannot do on that host.
 *
 * All three fail silently when wrong: the requests simply never arrive.
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

  useEffect(() => {
    let alive = true
    Promise.all([account.hostingOptions(), account.sites()]).then(([opts, sites]) => {
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
    })
    return () => { alive = false }
  }, [siteId])

  if (!form || !options) return <PageHead title="میزبانی" subtitle="محل سایت و مسیر ارتباط ما با آن" />

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved('') }

  // The provider list is filtered by region so someone choosing "ایران" is not
  // scrolling past Kinsta. "Other" always stays, so the form is never a dead end.
  const providers = options.providers.filter(
    (p) => p.id === 'other' || form.region === 'unknown' || p.region === form.region
  )

  async function save() {
    setSaving(true); setError(''); setSaved('')
    try {
      const res = await siteApi(siteId).setHosting(form)
      setDescribed(res.hosting)
      setServerUrl(res.serverUrl || '')
      setSaved('ذخیره شد.')
    } catch (e) {
      setError(e?.message || 'ذخیره نشد.')
    } finally { setSaving(false) }
  }

  return (
    <>
      <PageHead title="میزبانی" subtitle="محل سایت و مسیر ارتباط ما با آن" />

      <div style={card}>
        <Field
          label="سایت روی کدام کشور میزبانی می‌شود؟"
          hint="اگر درخواست‌های ما از سرور نامناسبی برود، ممکن است اصلاً به سایت نرسد و ما آن را «خاموش» ببینیم."
        >
          <Select value={form.region} onChange={(e) => set('region')(e.target.value)}>
            {options.regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
          <p style={hint}>{options.regions.find((r) => r.id === form.region)?.note}</p>
        </Field>

        <Field label="شرکت میزبان" hint="اگر در فهرست نبود، «موردی غیر از این‌ها» را بزنید و نامش را بنویسید.">
          <Select value={form.provider} onChange={(e) => set('provider')(e.target.value)}>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        </Field>

        {form.provider === 'other' && (
          <Field label="نام شرکت میزبان">
            <Input value={form.providerName} onChange={(e) => set('providerName')(e.target.value)} placeholder="مثلاً هاست محلی شهر شما" />
          </Field>
        )}

        <Field
          label="درخواست‌های ما از کدام سرور برود؟"
          hint="پیش‌فرض از روی کشور تعیین می‌شود. اگر بررسی‌ها به سایت نمی‌رسد، دستی عوضش کنید."
        >
          <Select value={form.egress} onChange={(e) => set('egress')(e.target.value)}>
            <option value="auto">خودکار (بر اساس کشور)</option>
            <option value="ir">سرور داخلی</option>
            <option value="intl">سرور بین‌المللی</option>
          </Select>
        </Field>

        <Field
          label="آدرسی که سایت باید به ما درخواست بدهد"
          hint="خالی یعنی آدرس پیش‌فرض. اگر آدرس پیش‌فرض از داخل سایت شما در دسترس نیست، اینجا آدرس دیگری بگذارید — نیازی به جفت‌کردن دوباره نیست."
        >
          <Input value={form.callbackUrl} onChange={(e) => set('callbackUrl')(e.target.value)} placeholder="https://api.digiwp.com/v1" dir="ltr" />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
          {saved && <span style={{ fontSize: 12.5, color: 'var(--gd-success)' }}>{saved}</span>}
          {error && <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{error}</span>}
          <Button variant="primary" size="md" leftIcon="check" disabled={saving} onClick={save}>
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </div>
      </div>

      {serverUrl && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>آدرس فعلی بازگشت</div>
          <p style={{ ...hint, marginTop: 0 }}>
            افزونهٔ روی سایت شما دفعهٔ بعد که تنظیمات را می‌خواند، این آدرس را می‌گیرد.
          </p>
          <code style={mono}>{serverUrl}</code>
        </div>
      )}

      {/* What we already know we cannot do on this host. Said before someone
          runs into it, not after a job fails and looks like our bug. */}
      {described?.traits?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>
            <Icon name="info" size={16} style={{ color: 'var(--gd-text-muted)' }} />
            محدودیت‌های شناخته‌شدهٔ این هاست
          </div>
          {described.traits.map((t) => (
            <div key={t.id} style={{ padding: '9px 0', borderTop: '1px solid var(--gd-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                <Badge variant="warning" appearance="soft">{t.label}</Badge>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>{t.effect}</p>
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

const card = {
  background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
  borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px',
}
const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.9 }
const mono = {
  display: 'block', fontFamily: 'var(--gd-font-mono)', fontSize: 12,
  background: 'var(--gd-bg-inset)', padding: '9px 12px',
  borderRadius: 'var(--gd-radius-sm)', overflowX: 'auto', direction: 'ltr',
}
