import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge } from '../../components/index.js'
import { account } from '../../lib/api.js'

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
      setSaved('ذخیره شد.')
    } catch (e) { setError(e?.message || 'ذخیره نشد.') } finally { setSaving(false) }
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
    setPushState('در حال درخواست اجازه…')
    try {
      if (!('Notification' in window)) {
        return setPushState('این مرورگر از اعلان پشتیبانی نمی‌کند.')
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        return setPushState('اجازهٔ اعلان داده نشد. بدون آن، اعلان مرورگر کار نمی‌کند.')
      }
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg) return setPushState('سرویس‌ورکر ثبت نشده؛ صفحه را دوباره بارگذاری کنید.')

      const sub = await reg.pushManager.getSubscription()
      const token = sub ? JSON.stringify(sub) : null
      if (!token) return setPushState('اشتراک اعلان ساخته نشد.')

      await account.setContact({ fcmToken: token })
      await load()
      setPushState('اعلان مرورگر فعال شد.')
    } catch (e) {
      setPushState(e?.message || 'فعال‌سازی اعلان انجام نشد.')
    }
  }

  if (!readiness) return <PageHead title="هشدار اضطراری" subtitle="اگر سایتی هک شود، چطور به شما خبر می‌دهیم" />

  const tone = readiness.readyCount === 0 ? 'danger' : readiness.readyCount === 1 ? 'warning' : 'success'

  return (
    <>
      <PageHead title="هشدار اضطراری" subtitle="اگر سایتی هک شود، چطور به شما خبر می‌دهیم" />

      <div style={{
        background: `var(--gd-${tone}-bg)`, border: `1px solid var(--gd-${tone})`,
        borderRadius: 'var(--gd-radius-lg)', padding: '16px 20px', marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14.5, fontWeight: 800, marginBottom: 5 }}>
          <Icon name={readiness.readyCount === 0 ? 'alert-octagon' : readiness.readyCount === 1 ? 'alert-triangle' : 'shield-check'} size={18} />
          {readiness.readyCount === 0 ? 'هیچ راه اطلاع‌رسانی فعالی ندارید' : `${faNum(readiness.readyCount)} راه فعال`}
        </div>
        <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.9 }}>{readiness.verdict}</p>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>راه‌های اطلاع‌رسانی</div>
        {/* Both halves are shown, because "we have no key" and "you gave us no
            number" are different problems with different fixes, and a single
            red dot would hide which one this is. */}
        <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
          هر راه دو طرف دارد: سرویس باید روی سرور ما تنظیم باشد و اطلاعات تماس شما هم ثبت شده باشد.
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
              {c.ready ? 'فعال' : 'غیرفعال'}
            </Badge>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>شمارهٔ موبایل</div>
        <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
          پیامک وقتی به کار می‌آید که گوشی اینترنت ندارد یا اپ نصب نیست — یعنی دقیقاً وقتی بقیهٔ راه‌ها جواب نمی‌دهند.
        </p>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲۳۴۵۶۷۸۹" dir="ltr" style={{ flex: '1 1 200px' }} />
          <Button variant="secondary" size="md" disabled={saving} onClick={savePhone}>
            {saving ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
        </div>
        {saved && <p style={{ ...hint, color: 'var(--gd-success)' }}>{saved}</p>}
        {error && <p style={{ ...hint, color: 'var(--gd-danger-text)' }}>{error}</p>}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>اعلان مرورگر</div>
        <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
          سریع‌ترین راه است. اگر این پنل را به صفحهٔ اصلی گوشی اضافه کنید، اعلان مثل یک اپ می‌آید.
        </p>
        <Button variant="secondary" size="md" leftIcon="bell" onClick={enablePush}>
          فعال‌سازی اعلان روی این دستگاه
        </Button>
        {pushState && <p style={hint}>{pushState}</p>}
      </div>

      {/* The honest caveat, kept next to the controls rather than buried. */}
      <p style={{ ...hint, marginTop: 16 }}>
        وقتی هشداری فرستاده می‌شود، ما فقط می‌دانیم سرویس آن را پذیرفته — نه اینکه به دست شما رسیده یا خوانده شده.
        به همین دلیل بیش از یک راه اهمیت دارد.
      </p>
    </>
  )
}

const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

const card = {
  background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
  borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px',
}
const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '8px 0 0', lineHeight: 1.9 }
