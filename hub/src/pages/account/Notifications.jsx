import { useEffect, useState } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Select, Switch, Badge } from '../../components/index.js'
import { account, ApiError } from '../../lib/api.js'

/**
 * Notification preferences and contact enrollment.
 *
 * Every toggle, contact row, and quiet-hour setting is persisted through the
 * real API (/notifications/*). Those routes only exist once the server mounts
 * its notifications router; while it does not, this screen says so plainly in
 * an explicit unavailable state instead of claiming persistence that is not
 * there. There is no mock fallback in production; loading, error, empty, and
 * unavailable states are rendered honestly.
 */

/**
 * Express answers an unmounted route with a bare «Not Found»; name what is
 * actually missing instead. A server-provided message still wins.
 */
function describeError(e, fallback, notFound) {
  if (e instanceof ApiError) {
    if (e.status === 404 && (!e.message || e.message === 'Not Found')) return notFound
    if (e.message) return e.message
  }
  return e?.message || fallback
}

export default function Notifications() {
  const [channels, setChannels] = useState(null)
  const [contacts, setContacts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newContact, setNewContact] = useState({ type: 'email', value: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [rowBusy, setRowBusy] = useState({})
  const [rowError, setRowError] = useState('')

  const [savingChannel, setSavingChannel] = useState('')
  // نتیجهٔ ذخیره به کانال صاحبش گره می‌خورد؛ یک رشتهٔ مشترک پیام «ذخیره شد.»
  // یا خطای یک کانال را زیر همهٔ کارت‌های کانال تکرار می‌کرد.
  const [channelSaved, setChannelSaved] = useState(null)
  const [channelError, setChannelError] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([account.notificationPreferences(), account.notificationContacts()]).then(([prefs, cts]) => {
      if (!alive) return
      setChannels(prefs.channels || [])
      setContacts(cts.contacts || [])
      setLoading(false)
    }).catch((e) => {
      if (!alive) return
      setError(describeError(e, 'بارگذاری تنظیمات انجام نشد.', 'تنظیمات اعلان هنوز روی سرور فعال نشده است.'))
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  async function saveChannel(channel) {
    setSavingChannel(channel.id)
    setChannelSaved(null)
    setChannelError(null)
    try {
      const saved = await account.saveNotificationPreference(channel.id, {
        enabled: channel.enabled,
        destination: channel.destination,
        quietHoursStart: channel.quietHoursStart,
        quietHoursEnd: channel.quietHoursEnd,
      })
      setChannels((prev) => prev.map((c) => (c.id === saved.channel || c.id === channel.id ? { ...c, ...saved } : c)))
      setChannelSaved({ id: channel.id, message: 'ذخیره شد.' })
    } catch (e) {
      setChannelError({ id: channel.id, message: describeError(e, 'ذخیره نشد.', 'ذخیرهٔ تنظیمات اعلان هنوز روی سرور فعال نشده است.') })
    } finally {
      setSavingChannel('')
    }
  }

  function updateChannel(id, patch) {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    // الگوی صفحهٔ پروفایل: با هر ویرایش، پیام «ذخیره شد.» قبلی معتبر نیست.
    setChannelSaved(null)
    setChannelError(null)
  }

  async function addContact(e) {
    e.preventDefault()
    setAdding(true)
    setAddError('')
    try {
      const contact = await account.addNotificationContact(newContact)
      setContacts((prev) => [...prev.filter((c) => !(c.type === contact.type && c.value === contact.value)), contact])
      setNewContact({ type: 'email', value: '' })
    } catch (e2) {
      setAddError(describeError(e2, 'ثبت تماس انجام نشد.', 'ثبت مخاطب هنوز روی سرور فعال نشده است.'))
    } finally {
      setAdding(false)
    }
  }

  async function verifyContact(id) {
    setRowBusy((b) => ({ ...b, [id]: true }))
    setRowError('')
    try {
      const updated = await account.verifyNotificationContact(id)
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch (e) {
      setRowError(describeError(e, 'تأیید تماس انجام نشد.', 'تأیید مخاطب هنوز روی سرور فعال نشده است.'))
    } finally {
      setRowBusy((b) => ({ ...b, [id]: false }))
    }
  }

  async function removeContact(id) {
    if (!window.confirm('این مخاطب حذف می‌شود. ادامه می‌دهید؟')) return
    setRowBusy((b) => ({ ...b, [id]: true }))
    setRowError('')
    try {
      await account.deleteNotificationContact(id)
      setContacts((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      setRowError(describeError(e, 'حذف تماس انجام نشد.', 'حذف مخاطب هنوز روی سرور فعال نشده است.'))
    } finally {
      setRowBusy((b) => ({ ...b, [id]: false }))
    }
  }

  if (loading) {
    return (
      <>
        <PageHead title="اعلان‌ها و کانال هشدار" subtitle="کانال‌ها و ترجیحات اطلاع‌رسانی" />
        <div style={{ color: 'var(--gd-text-muted)', padding: '24px 0' }}>در حال بارگذاری…</div>
      </>
    )
  }

  return (
    <>
      <PageHead title="اعلان‌ها و کانال هشدار" subtitle="کانال‌ها و ترجیحات اطلاع‌رسانی" />

      {error && (
        <div style={{ ...banner, background: 'var(--gd-danger-bg)', borderColor: 'var(--gd-danger-border)', color: 'var(--gd-danger-text)', marginBottom: 18 }}>
          <Icon name="alert-circle" size={18} /> {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 18 }}>
        {channels && channels.map((channel) => (
          <div key={channel.id} className="dwp-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <Switch
                id={`ch-${channel.id}`}
                checked={!!channel.enabled}
                onChange={(on) => updateChannel(channel.id, { enabled: on })}
              />
              <label htmlFor={`ch-${channel.id}`} style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {channel.label}
              </label>
              <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: 0, flex: '1 1 100%' }}>{channel.desc}</p>
            </div>

            <div className="dwp-acc-channel-grid" style={{ marginBottom: 14 }}>
              <Input
                label="مقصد"
                hint={channel.id === 'email' ? 'مثلاً your@email.com' : channel.id === 'sms' ? 'مثلاً ۰۹۱۲۳۴۵۶۷۸۹' : 'توکن یا اشتراک push'}
                value={channel.destination || ''}
                onChange={(e) => updateChannel(channel.id, { destination: e.target.value })}
                dir={channel.id === 'sms' ? 'ltr' : undefined}
              />
              <Select
                label="شروع ساعت خاموشی"
                value={channel.quietHoursStart === null ? '' : String(channel.quietHoursStart)}
                onChange={(e) => updateChannel(channel.id, { quietHoursStart: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">خاموش</option>
                {HOURS.map((h) => <option key={h} value={h}>{faNum(h)}</option>)}
              </Select>
              <Select
                label="پایان ساعت خاموشی"
                value={channel.quietHoursEnd === null ? '' : String(channel.quietHoursEnd)}
                onChange={(e) => updateChannel(channel.id, { quietHoursEnd: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">خاموش</option>
                {HOURS.map((h) => <option key={h} value={h}>{faNum(h)}</option>)}
              </Select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {channelSaved?.id === channel.id && <span style={{ fontSize: 12.5, color: 'var(--gd-success)' }}>{channelSaved.message}</span>}
              {channelError?.id === channel.id && <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{channelError.message}</span>}
              <Button variant="secondary" size="md" disabled={savingChannel === channel.id} onClick={() => saveChannel(channel)}>
                {savingChannel === channel.id ? 'در حال ذخیره…' : 'ذخیرهٔ کانال'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="dwp-card" style={{ padding: '18px 20px', marginTop: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>مخاطبان ثبت‌شده</div>
        <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
          هر ایمیل، شماره یا دستگاهی که می‌خواهید روی آن اعلان بفرستیم باید اینجا ثبت و ترجیحاً تأیید شود.
        </p>

        {contacts && contacts.length === 0 && (
          <p style={{ ...hint, marginBottom: 16 }}>هنوز مخاطبی ثبت نشده.</p>
        )}

        {contacts && contacts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {contacts.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--gd-border-subtle)' : 'none', flexWrap: 'wrap' }}>
                <Icon name={CONTACT_ICON[c.type] || 'at-sign'} size={16} style={{ color: 'var(--gd-text-muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, direction: 'ltr' }}>{c.value}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 2 }}>
                    {CONTACT_LABEL[c.type] || c.type} — {c.verified ? 'تأیید شده' : 'تأیید نشده'}
                  </div>
                </div>
                <Badge variant={c.verified ? 'success' : 'neutral'} appearance="soft">
                  {c.verified ? 'تأیید شده' : 'تأیید نشده'}
                </Badge>
                {!c.verified && (
                  <Button variant="secondary" size="sm" loading={rowBusy[c.id]} onClick={() => verifyContact(c.id)}>
                    تأیید
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={rowBusy[c.id] ? undefined : 'trash-2'}
                  loading={rowBusy[c.id]}
                  onClick={() => removeContact(c.id)}
                >
                  حذف
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Row-level failures surface next to the row they came from, not in
            the add-form message far below. */}
        {rowError && <p style={{ ...hint, color: 'var(--gd-danger-text)', marginBottom: 12 }}>{rowError}</p>}

        <form onSubmit={addContact} style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Select
            label="نوع"
            value={newContact.type}
            onChange={(e) => setNewContact((s) => ({ ...s, type: e.target.value }))}
          >
            <option value="email">ایمیل</option>
            <option value="sms">پیامک</option>
            <option value="push">اعلان مرورگر</option>
          </Select>
          <Input
            label="مقدار"
            value={newContact.value}
            onChange={(e) => setNewContact((s) => ({ ...s, value: e.target.value }))}
            placeholder={newContact.type === 'email' ? 'your@email.com' : newContact.type === 'sms' ? '۰۹۱۲۳۴۵۶۷۸۹' : 'توکن push'}
            dir="ltr"
            wrapClassName="dwp-contact-value-field"
          />
          <Button variant="primary" size="md" type="submit" disabled={adding}>
            {adding ? 'در حال ثبت…' : 'ثبت مخاطب'}
          </Button>
        </form>
        {addError && <p style={{ ...hint, color: 'var(--gd-danger-text)' }}>{addError}</p>}
      </div>

      <p style={{ ...hint, marginTop: 16 }}>
        وقتی هشداری ارسال می‌شود، ما فقط می‌دانیم سرویس آن را پذیرفته — نه اینکه حتماً به دست شما رسیده.
        به همین دلیل چند کانال فعال داشتن اهمیت دارد.
      </p>
    </>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

const CONTACT_ICON = {
  email: 'mail',
  sms: 'smartphone',
  push: 'bell',
}

const CONTACT_LABEL = {
  email: 'ایمیل',
  sms: 'پیامک',
  push: 'اعلان مرورگر',
}

const faNum = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])

const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '8px 0 0', lineHeight: 1.9 }

const banner = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 16px',
  borderRadius: 'var(--gd-radius-lg)',
  fontSize: 13,
}
