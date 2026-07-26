import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, AuthorityBadge } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

const RISK_VARIANT = { high: 'danger', medium: 'warning', low: 'success' }

const ITEM_ICON = {
  Elementor: 'layout-template',
  WooCommerce: 'shopping-cart',
  'Yoast SEO': 'box',
  'WordPress Core': 'boxes',
}
const iconFor = (u) => ITEM_ICON[u.name] || (u.type === 'هسته' ? 'boxes' : 'box')

const statusFor = (u) =>
  u.authority === 'auto'
    ? { icon: 'zap', color: 'var(--gd-success)', label: 'آمادهٔ اجرای خودکار' }
    : { icon: 'user-check', color: 'var(--gd-warning)', label: 'نیازمند تأیید شما' }

const COLS = '2fr 1.1fr 1fr 1.3fr 0.9fr'

export default function Updates() {
  const { siteId } = useOutletContext()
  const [data, setData] = useState(null)
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const timer = useRef(null)

  // update_status forces a fresh check against wordpress.org rather than
  // reading a cached transient, so reloading the view really is re-checking.
  const load = () => siteApi(siteId).updates().then(setData)

  useEffect(() => {
    let alive = true
    siteApi(siteId).updates().then((d) => alive && setData(d))
    return () => { alive = false; clearTimeout(timer.current) }
  }, [siteId])

  function poll(jobId) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const s = await siteApi(siteId).job(jobId)
      setJob(s)
      if (s.state !== 'done' && s.state !== 'failed') poll(jobId)
      else load()
    }, 2000)
  }

  async function apply(items) {
    setBusy(items ? items[0].name : 'all'); setError('')
    try {
      const res = await siteApi(siteId).runUpdates(items)
      const started = res.job || res
      setJob(started)
      poll(started.id)
    } catch (e) { setError(e?.message || 'اجرا نشد.') } finally { setBusy('') }
  }

  const head = (
    <PageHead
      title="آپدیت‌های ریسک‌سنجی‌شده"
      subtitle="ریسک هر آپدیت از نوع تغییر نسخه سنجیده می‌شود؛ محیط استیجینگ نداریم"
      action={(
        <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={load}>
          بررسی دوباره
        </Button>
      )}
    />
  )

  if (!data) return head

  const { queue, done } = data
  const autoCount = queue.filter((u) => u.authority === 'auto').length
  const confirmCount = queue.filter((u) => u.authority === 'confirm').length
  const featured = queue.find((u) => u.authority === 'confirm') || queue[0]
  const rows = queue.filter((u) => u.id !== (featured && featured.id))

  const stats = [
    { icon: 'list-checks', value: queue.length, label: 'در صف بررسی', bg: 'var(--gd-bg-inset)', color: 'var(--gd-text-secondary)' },
    { icon: 'zap', value: autoCount, label: 'کم‌ریسک · خودکار', bg: 'var(--gd-success-bg)', color: 'var(--gd-success)' },
    { icon: 'user-check', value: confirmCount, label: 'نیازمند تأیید شما', bg: 'var(--gd-warning-bg)', color: 'var(--gd-warning)' },
  ]

  // Three of the four lines here used to be unconditional green ticks:
  // "compatibility checked", "full backup taken before the change", "staging
  // test passed". None had happened — the backup is taken when the update
  // actually runs, and there is no staging environment at all. What is left is
  // what can be said truthfully before the button is pressed.
  const featuredChecklist = featured && [
    { icon: 'info', color: 'var(--gd-text-muted)', text: 'ریسک از روی نوع تغییر نسخه سنجیده شده، نه از اجرای واقعی' },
    { icon: 'database-backup', color: 'var(--gd-text-secondary)', text: 'هنگام اجرا، پیش از هر تغییر یک بکاپ دیتابیس گرفته می‌شود' },
    { icon: 'alert-triangle', color: 'var(--gd-warning)', text: 'محیط استیجینگ نداریم — تغییر مستقیم روی سایت زنده اعمال می‌شود' },
    ...(featured.note ? [{ icon: 'alert-triangle', color: 'var(--gd-warning)', text: featured.note }] : []),
  ]

  return (
    <>
      {head}

      {/* Summary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-xs)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 13 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: s.bg, color: s.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name={s.icon} size={21} />
            </span>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--gd-font-mono)' }}>{faNum(s.value)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Needs-approval decision card (the «با تأیید» flow) */}
      {featured && (
        <div style={{ borderRadius: 'var(--gd-radius-xl)', border: '1px solid var(--gd-warning-border)', background: 'var(--gd-bg-surface)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 20px', background: 'var(--gd-warning-bg)', borderBottom: '1px solid var(--gd-warning-border)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-warning)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="user-check" size={19} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gd-warning-text)' }}>نیازمند تأیید شما — اقدام حساس</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-warning-text)', opacity: 0.85, marginTop: 1 }}>تغییرات پرریسک همیشه پیش از اجرا به تأیید شما نیاز دارند</div>
            </div>
            <AuthorityBadge level="confirm" />
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name={iconFor(featured)} size={23} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{`${featured.type}ٔ «${featured.name}»`}</div>
                <div style={{ fontSize: 13, color: 'var(--gd-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  نسخهٔ فعلی <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{faNum(featured.from)}</span>
                  <Icon name="arrow-left" size={13} />
                  نسخهٔ جدید <span style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text)', fontWeight: 700 }}>{faNum(featured.to)}</span>
                </div>
              </div>
              <Badge variant={RISK_VARIANT[featured.risk]} appearance="soft" icon="gauge">{featured.riskLabel}</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 24px', background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 16 }}>
              {featuredChecklist.map((c, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <Icon name={c.icon} size={16} style={{ color: c.color, flex: '0 0 auto' }} /> {c.text}
                </span>
              ))}
            </div>
            {/* "مشاهدهٔ تفاوت‌ها" and "فعلاً نه" were here with no handler and
                no backend — there is no diff viewer and no defer list. */}
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <Button
                variant="primary" size="md" leftIcon="check"
                disabled={Boolean(busy) || job?.state === 'running'}
                onClick={() => apply([{ type: featured.kind === 'theme' ? 'theme' : 'plugin', name: featured.file || featured.name }])}
              >
                تأیید و اجرا
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Update queue */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>صف آپدیت</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '11px 20px', background: 'var(--gd-bg-subtle)', borderBottom: '1px solid var(--gd-border)', fontSize: 12, fontWeight: 700, color: 'var(--gd-text-muted)' }}>
          <span>مورد</span>
          <span>نسخه</span>
          <span>ریسک</span>
          <span>وضعیت</span>
          <span />
        </div>
        {rows.map((u, i) => {
          const st = statusFor(u)
          return (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: i < rows.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none', fontSize: 13.5 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Icon name={iconFor(u)} size={17} style={{ color: 'var(--gd-text-secondary)', flex: '0 0 auto' }} /> {u.name}
              </span>
              <span style={{ fontFamily: 'var(--gd-font-mono)', color: 'var(--gd-text-secondary)' }}>{faNum(u.from)} ← {faNum(u.to)}</span>
              <span>
                <Badge variant={RISK_VARIANT[u.risk]} appearance="soft" dot>{u.riskLabel}</Badge>
              </span>
              <span style={{ color: 'var(--gd-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name={st.icon} size={14} style={{ color: st.color, flex: '0 0 auto' }} /> {st.label}
              </span>
              {/* Was a "جزئیات" button with nowhere to go. The row already
                  carries every field we hold about the update. */}
              <Button
                variant="ghost" size="sm"
                disabled={Boolean(busy) || job?.state === 'running'}
                onClick={() => apply([{ type: u.kind === 'theme' ? 'theme' : 'plugin', name: u.file || u.name }])}
              >
                اجرا
              </Button>
            </div>
          )
        })}
      </div>

      {/* Completed updates */}
      <div style={{ fontSize: 15, fontWeight: 700, margin: '22px 0 12px' }}>انجام‌شده</div>
      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', overflow: 'hidden' }}>
        {done.map((d, i) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: i < done.length - 1 ? '1px solid var(--gd-border-subtle)' : 'none' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--gd-success-bg)', color: 'var(--gd-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="check" size={18} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>به نسخهٔ <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{faNum(d.to)}</span></span>
                <span>·</span>
                <span>{d.when}</span>
              </div>
            </div>
            {/* Rolling a plugin back to its previous version is a real thing
                WordPress can do, but nothing here implements it — the button
                did nothing. Removed rather than left as decoration. */}
          </div>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px', marginTop: 16 }}>
          {error}
        </p>
      )}

      {job && (
        <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 9, fontSize: 13.5, fontWeight: 700 }}>
            <span>{job.message || 'در حال اجرا'}</span>
            <Badge variant={job.state === 'failed' ? 'danger' : job.state === 'done' ? 'success' : 'info'} appearance="soft">
              {job.state === 'failed' ? 'ناموفق' : job.state === 'done' ? 'تمام' : `${faNum(job.progress || 0)}٪`}
            </Badge>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--gd-bg-inset)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${job.state === 'done' ? 100 : job.progress || 0}%`, background: job.state === 'failed' ? 'var(--gd-danger)' : 'var(--gd-primary)', transition: 'width .4s ease' }} />
          </div>
          {job.result?.failed?.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, fontSize: 12, color: 'var(--gd-danger-text)', lineHeight: 1.9 }}>
              {job.result.failed.map((f, i) => <li key={i}>{f.name}: {f.error}</li>)}
            </ul>
          )}
          {job.result?.safety_backup && (
            <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '9px 0 0', lineHeight: 1.8 }}>
              بکاپ پیش از به‌روزرسانی: <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{job.result.safety_backup}</span>
            </p>
          )}
        </div>
      )}
    </>
  )
}
