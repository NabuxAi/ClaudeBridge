import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

/**
 * Rescue — recovering a site compromised past the point where any scanner can
 * vouch for its files.
 *
 * Deliberately NOT a single "rescue this site" button. Each step runs on its
 * own and stops on its own, because a rescue that dies halfway and leaves a
 * site part-replaced is worse than one never started. The order is fixed —
 * backup first, verify last — but the operator decides when to take each one.
 *
 * Two steps are treated differently on purpose:
 *   db-audit    reports and never writes. Deleting a "suspicious admin"
 *               automatically can lock the real owner out of their own site.
 *   rotate-keys logs every user out, including whoever is running the rescue,
 *               so it asks for confirmation in the UI as well as the API.
 */
const STEPS = [
  {
    id: 'backup',
    title: 'عکس‌برداری',
    desc: 'بکاپ کامل دیتابیس، پیش از هر تغییر. بکاپ خودش آلوده است — هدفش برگرداندن سایت نیست، امکان بازگشت است.',
    icon: 'database-backup',
    writes: true,
  },
  {
    id: 'inventory',
    title: 'فهرست‌برداری',
    desc: 'هر افزونه و قالب در یکی از سه دسته: قابل جایگزینی از مخزن، نیازمند فایل سالم از سازنده، یا پوشه‌ای که اصلاً افزونه نیست.',
    icon: 'list-checks',
    writes: false,
  },
  {
    id: 'leftovers',
    title: 'شکار باقی‌مانده‌ها',
    desc: 'جاهایی که نصب مجدد هسته پوشش نمی‌دهد: فایل PHP در uploads، drop-inها، mu-plugins.',
    icon: 'search',
    writes: false,
  },
  {
    id: 'db-audit',
    title: 'بازرسی دیتابیس',
    desc: 'کاربران مدیر، دسترسی‌های پنهان، آپشن‌های آلوده و کرون‌های مشکوک. فقط گزارش — هیچ چیزی حذف نمی‌شود.',
    icon: 'database',
    writes: false,
  },
  {
    id: 'rotate-keys',
    title: 'چرخش کلیدها',
    desc: 'اگر مهاجم به دیتابیس رسیده باشد، هش رمزها و توکن نشست‌ها را دارد. بدون این مرحله، همهٔ کارهای بالا تا فردا باطل است.',
    icon: 'key-round',
    writes: true,
    confirm: true,
  },
  {
    id: 'verify',
    title: 'تأیید',
    desc: 'هستهٔ سالم، اسکن خالی، و هیچ فایل بحرانی باقی‌نمانده. کمتر از این سه، ادعاست نه نتیجه.',
    icon: 'shield-check',
    writes: false,
  },
]

export default function Rescue() {
  const { siteId } = useOutletContext()
  const [results, setResults] = useState({})
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState({})

  async function run(step) {
    if (step.confirm) {
      const ok = window.confirm(
        'چرخش کلیدها همهٔ کاربران را از سایت خارج می‌کند — از جمله خود شما.\n\n' +
          'یک نسخهٔ پشتیبان از wp-config.php نگه داشته می‌شود. ادامه می‌دهید؟'
      )
      if (!ok) return
    }
    setBusy(step.id)
    setErrors((e) => ({ ...e, [step.id]: null }))
    try {
      const res = await siteApi(siteId).rescue(step.id, step.confirm ? { confirm: true } : {})
      setResults((r) => ({ ...r, [step.id]: res.result }))
    } catch (e) {
      setErrors((er) => ({ ...er, [step.id]: e?.message || 'اجرا نشد.' }))
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHead
        title="عملیات نجات"
        subtitle="بازیابی سایتی که آلودگی‌اش از حد اطمینان به فایل‌ها گذشته است"
      />

      {/* The premise, stated once. Without it the steps look arbitrary. */}
      <div style={{ background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          <Icon name="info" size={17} style={{ color: 'var(--gd-primary)' }} /> چرا جایگزینی، نه پاک‌سازی
        </div>
        <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
          نمی‌شود ثابت کرد یک فایل PHP تمیز است — یک بک‌دور خوب از کد سالم قابل تفکیک نیست.
          ولی می‌شود ثابت کرد یک فایل با نسخهٔ رسمی <b>یکسان</b> است. برای همین اینجا فایل‌ها
          پاک‌سازی نمی‌شوند، جایگزین می‌شوند؛ و هرچه منبع رسمی ندارد، تصمیمِ شماست نه حذف خودکار.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEPS.map((step, i) => (
          <StepCard
            key={step.id}
            index={i + 1}
            step={step}
            busy={busy === step.id}
            result={results[step.id]}
            error={errors[step.id]}
            onRun={() => run(step)}
          />
        ))}
      </div>
    </>
  )
}

function StepCard({ index, step, busy, result, error, onRun }) {
  const done = result !== undefined
  return (
    <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--gd-success-bg)' : 'var(--gd-bg-inset)', color: done ? 'var(--gd-success)' : 'var(--gd-text-muted)' }}>
          <Icon name={done ? 'check' : step.icon} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>
              {faNum(index)}. {step.title}
            </span>
            {step.writes ? (
              <Badge variant="warning" appearance="soft">می‌نویسد</Badge>
            ) : (
              <Badge variant="neutral" appearance="soft">فقط خواندن</Badge>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '5px 0 0', lineHeight: 1.8 }}>{step.desc}</p>
        </div>
        <Button variant={done ? 'secondary' : 'primary'} size="sm" disabled={busy} onClick={onRun}>
          {busy ? 'در حال اجرا…' : done ? 'اجرای دوباره' : 'اجرا'}
        </Button>
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '9px 12px', margin: '12px 0 0' }}>
          {error}
        </p>
      )}
      {done && <StepResult step={step.id} result={result} />}
    </div>
  )
}

/** Each step reports differently, because each answers a different question. */
function StepResult({ step, result }) {
  const box = (children, tone = 'subtle') => (
    <div style={{
      marginTop: 12, padding: '12px 14px', borderRadius: 'var(--gd-radius-md)',
      background: tone === 'danger' ? 'var(--gd-danger-bg)' : 'var(--gd-bg-subtle)',
      border: `1px solid ${tone === 'danger' ? 'var(--gd-danger)' : 'var(--gd-border-subtle)'}`,
      fontSize: 12.5, lineHeight: 1.9,
    }}>{children}</div>
  )
  const mono = { fontFamily: 'var(--gd-font-mono)' }

  if (step === 'backup') {
    const b = result?.backup
    if (!b) return box(result?.message || 'بکاپ گرفته نشد.', 'danger')
    return box(
      <>
        دیتابیس ذخیره شد: {faNum(b.tables)} جدول، {faNum(b.rows)} ردیف،{' '}
        {faNum((b.db_bytes / 1048576).toFixed(1))} مگابایت.{' '}
        {b.verified
          ? <b style={{ color: 'var(--gd-success)' }}>دامپ کامل تأیید شد.</b>
          : <b style={{ color: 'var(--gd-danger-text)' }}>دامپ ناقص است — به این بکاپ تکیه نکنید.</b>}
      </>
    )
  }

  if (step === 'inventory') {
    const c = result?.counts || {}
    return box(
      <>
        <div>
          <b>{faNum(c.repo || 0)}</b> مورد از مخزن قابل جایگزینی ·{' '}
          <b>{faNum(c.foreign || 0)}</b> مورد نیازمند فایل از سازنده ·{' '}
          <b style={{ color: (c.orphan || 0) > 0 ? 'var(--gd-danger-text)' : undefined }}>
            {faNum(c.orphan || 0)}
          </b>{' '}
          پوشهٔ بدون هدر افزونه
        </div>
        {result.foreign?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            نیازمند آپلود: <span style={mono}>{result.foreign.map((f) => f.slug).join('، ')}</span>
          </div>
        )}
        {result.orphan?.length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            پوشه‌های مشکوک: <span style={mono}>{result.orphan.map((o) => o.slug).join('، ')}</span>
            {' '}— اینها اغلب خودِ بک‌دورند، ولی حذفشان بدون بررسی سایت را می‌شکند.
          </div>
        )}
        {result.note && <div style={{ marginTop: 8, opacity: 0.85 }}>{result.note}</div>}
      </>
    )
  }

  if (step === 'leftovers') {
    const c = result?.counts || {}
    const critical = (c.critical || 0) > 0
    return box(
      <>
        <b style={{ color: critical ? 'var(--gd-danger-text)' : 'var(--gd-success)' }}>
          {faNum(c.critical || 0)} مورد بحرانی
        </b>{' '}
        · {faNum(c.review || 0)} مورد نیازمند بررسی
        {result.findings?.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
            {result.findings.slice(0, 10).map((f) => (
              <li key={f.path} style={{ color: f.severity === 'critical' ? 'var(--gd-danger-text)' : undefined }}>
                <span style={mono}>{f.path}</span> — {f.why}
              </li>
            ))}
          </ul>
        )}
        {result.note && <div style={{ marginTop: 8, opacity: 0.85 }}>{result.note}</div>}
      </>,
      critical ? 'danger' : 'subtle'
    )
  }

  if (step === 'db-audit') {
    const hidden = result?.hidden_admins || []
    const opts = result?.suspect_options || []
    return box(
      <>
        <div>{faNum((result?.admins || []).length)} حساب مدیر</div>
        {hidden.length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            <b>{faNum(hidden.length)} کاربر با دسترسی مدیر بدون نقش مدیر:</b>{' '}
            <span style={mono}>{hidden.map((h) => h.login).join('، ')}</span>
          </div>
        )}
        {opts.length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            <b>{faNum(opts.length)} آپشن مشکوک:</b>{' '}
            <span style={mono}>{opts.map((o) => `${o.option} (${o.marker})`).join('، ')}</span>
          </div>
        )}
        {(result?.suspect_cron || []).length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            کرون مشکوک: <span style={mono}>{result.suspect_cron.map((c) => c.hook).join('، ')}</span>
          </div>
        )}
        <div style={{ marginTop: 8, opacity: 0.85 }}>{result?.note}</div>
      </>,
      hidden.length || opts.length ? 'danger' : 'subtle'
    )
  }

  if (step === 'rotate-keys') {
    if (!result?.ok) return box(result?.message || 'انجام نشد.', 'danger')
    return box(
      <>
        {result.message}
        {result.backup && <div style={{ marginTop: 6 }}>نسخهٔ پشتیبان: <span style={mono}>{result.backup}</span></div>}
      </>
    )
  }

  if (step === 'verify') {
    return box(
      <>
        <b style={{ color: result?.clean ? 'var(--gd-success)' : 'var(--gd-danger-text)' }}>
          {result?.verdict}
        </b>
        <div style={{ marginTop: 8 }}>
          هسته: {result?.integrity?.clean ? 'سالم' : `${faNum(result?.integrity?.unexpected?.length || 0)} فایل ناشناخته`}
          {' · '}اسکن: {faNum(result?.scan?.hits?.length || 0)} یافته
          {' · '}باقی‌مانده بحرانی: {faNum(result?.leftovers?.counts?.critical || 0)}
        </div>
      </>,
      result?.clean ? 'subtle' : 'danger'
    )
  }

  return box(<pre style={{ margin: 0, ...mono, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 1).slice(0, 600)}</pre>)
}
