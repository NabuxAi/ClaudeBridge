import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

/**
 * Conflict hunt — find what breaks a page.
 *
 * The work is queued on the site and polled, not awaited. That is not a UI
 * nicety: flipping plugins on a live site takes minutes, and holding a request
 * open for that long ties up one of the two or four PHP workers a shared host
 * gives you, which makes the customer's site slow while we diagnose it.
 *
 * The page is honest about what it is doing, because it IS disruptive: plugins
 * really are switched off in groups while it runs, and a visitor who lands
 * mid-round sees the site in that state. Saying so is the difference between a
 * tool someone trusts and one they run once by accident.
 */
export default function Conflict() {
  const { siteId } = useOutletContext()
  const [url, setUrl] = useState('')
  const [expect, setExpect] = useState('')
  const [forbid, setForbid] = useState('')
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function start() {
    if (!url.trim()) return
    setError('')
    setJob(null)
    try {
      const res = await siteApi(siteId).findConflict({ url: url.trim(), expect: expect.trim(), forbid: forbid.trim() })
      const started = res.job || res
      setJob(started)
      poll(started.id)
    } catch (e) {
      setError(e?.message || 'شروع نشد.')
    }
  }

  // Poll rather than await. Every tick is a cheap option read on the site — the
  // expensive work is already running in its own background request.
  function poll(jobId) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const s = await siteApi(siteId).job(jobId)
        setJob(s)
        if (s.state !== 'done' && s.state !== 'failed') poll(jobId)
      } catch (e) {
        setError(e?.message || 'وضعیت خوانده نشد.')
      }
    }, 2000)
  }

  const running = job && job.state !== 'done' && job.state !== 'failed'
  const result = job?.result

  return (
    <>
      <PageHead
        title="بررسی تداخل"
        subtitle="پیدا کردن افزونه یا قالبی که یک صفحه را خراب کرده"
      />

      <div style={{ background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--gd-warning-text)', marginBottom: 5 }}>
          <Icon name="alert-triangle" size={16} /> این بررسی روی سایت زنده انجام می‌شود
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--gd-warning-text)', margin: 0, lineHeight: 1.9, opacity: 0.92 }}>
          افزونه‌ها گروه‌گروه خاموش و دوباره روشن می‌شوند تا مقصر پیدا شود. بازدیدکننده‌ای که
          وسط کار وارد شود، سایت را در همان حالت می‌بیند. در پایان همه‌چیز — حتی اگر خطایی رخ
          دهد — به حالت اول برمی‌گردد. بهتر است در ساعت کم‌ترافیک اجرا شود.
        </p>
      </div>

      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
              آدرس صفحهٔ خراب
            </label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/checkout" dir="ltr" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
              متنی که در حالت سالم باید دیده شود <span style={{ opacity: 0.7 }}>(اختیاری، ولی دقت را زیاد می‌کند)</span>
            </label>
            <Input value={expect} onChange={(e) => setExpect(e.target.value)} placeholder="تکمیل خرید" />
            <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.7 }}>
              بدون این، فقط کد وضعیت بررسی می‌شود — صفحه‌ای که ۲۰۰ می‌دهد ولی خالی است، سالم حساب می‌شود.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
              متنی که نشانهٔ خرابی است <span style={{ opacity: 0.7 }}>(اختیاری)</span>
            </label>
            <Input value={forbid} onChange={(e) => setForbid(e.target.value)} placeholder="Fatal error" dir="ltr" />
            <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.7 }}>
              خطای PHP اغلب با کد ۲۰۰ برمی‌گردد. اگر متن خطا را اینجا بگذارید، صفحه با دیدن آن خراب حساب می‌شود.
            </p>
          </div>
          <div>
            <Button variant="primary" size="md" disabled={running || !url.trim()} onClick={start} leftIcon="search">
              {running ? 'در حال بررسی…' : 'شروع بررسی'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px' }}>
          {error}
        </p>
      )}

      {job && <JobProgress job={job} />}
      {result && <ConflictResult result={result} />}
    </>
  )
}

function JobProgress({ job }) {
  const done = job.state === 'done'
  const failed = job.state === 'failed'
  return (
    <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '16px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{job.message || 'در حال اجرا'}</span>
        <Badge variant={failed ? 'danger' : done ? 'success' : 'info'} appearance="soft">
          {failed ? 'ناموفق' : done ? 'تمام' : `${faNum(job.progress || 0)}٪`}
        </Badge>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--gd-bg-inset)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${done ? 100 : job.progress || 0}%`,
          background: failed ? 'var(--gd-danger)' : 'var(--gd-primary)',
          transition: 'width .4s ease',
        }} />
      </div>
    </div>
  )
}

function ConflictResult({ result }) {
  const culprit = result.culprit
  const mono = { fontFamily: 'var(--gd-font-mono)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: culprit ? 'var(--gd-danger-bg)' : 'var(--gd-bg-subtle)',
        border: `1px solid ${culprit ? 'var(--gd-danger)' : 'var(--gd-border)'}`,
        borderRadius: 'var(--gd-radius-lg)', padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name={culprit ? 'alert-triangle' : 'info'} size={20} style={{ color: culprit ? 'var(--gd-danger)' : 'var(--gd-text-muted)' }} />
          <span style={{ fontSize: 15.5, fontWeight: 800 }}>
            {culprit ? (culprit.kind === 'theme' ? 'قالب مقصر است' : 'افزونهٔ مقصر پیدا شد') : 'مقصری پیدا نشد'}
          </span>
        </div>
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.9 }}>{result.verdict}</p>
        {culprit && (
          <div style={{ marginTop: 10, ...mono, fontSize: 13, fontWeight: 700 }}>{culprit.name}</div>
        )}
      </div>

      {/* The theme check runs first and is reported even when it was not the
          cause — knowing it was ruled out is what stops someone re-testing it. */}
      {result.theme && (
        <Row
          icon="palette"
          title="بررسی قالب"
          body={
            result.theme.tested
              ? result.theme.is_cause
                ? `با قالب پیش‌فرض «${result.theme.compared}» صفحه سالم شد — یعنی قالب «${result.theme.current}» مقصر است.`
                : `با قالب پیش‌فرض «${result.theme.compared}» هم صفحه خراب ماند، پس قالب «${result.theme.current}» مقصر نیست.`
              : `بررسی نشد: ${result.theme.reason}`
          }
        />
      )}

      {result.bisect && (
        <Row
          icon="git-branch"
          title="جست‌وجوی دودویی"
          body={`مقصر با ${faNum(result.bisect.tested)} مرحله پیدا شد. در هر مرحله نیمی از افزونه‌ها خاموش شدند و بقیه روشن ماندند — تا تداخل بین دو افزونه هم قابل بازتولید بماند.`}
          extra={
            result.bisect.rounds?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, fontSize: 12, lineHeight: 1.9, color: 'var(--gd-text-muted)' }}>
                {result.bisect.rounds.map((r, i) => (
                  <li key={i}>
                    <span style={mono}>{faNum(r.disabled.length)}</span> افزونه خاموش →{' '}
                    {r.healthy ? <b style={{ color: 'var(--gd-success)' }}>صفحه سالم شد</b> : 'همچنان خراب'}
                    {r.status ? ` (${faNum(r.status)})` : ''}
                  </li>
                ))}
              </ul>
            )
          }
        />
      )}

      {/* The hunt can die partway — a timeout, a fatal in a plugin being
          toggled. Restoration still runs, but the diagnosis is incomplete and
          saying so beats presenting a half-search as a clean bill. */}
      {result.error && (
        <Row
          icon="alert-triangle"
          tone="danger"
          title="بررسی ناتمام ماند"
          body={`${result.error} — نتیجهٔ بالا کامل نیست.`}
        />
      )}

      {/* Restoration is the claim that matters most: the site was altered to
          run this, so "we put it back" is read back from the site, not assumed. */}
      <Row
        icon={result.restored ? 'check' : 'alert-triangle'}
        title="بازگردانی"
        tone={result.restored ? 'success' : 'danger'}
        body={
          result.restored
            ? `افزونه‌های فعال و قالب دوباره خوانده شدند و با حالت اول یکی هستند. وضعیت صفحه پس از بازگردانی: ${
                result.final_health?.healthy ? 'سالم' : `همان خرابی اولیه${result.final_health?.status ? ` (${faNum(result.final_health.status)})` : ''}`
              }.`
            : `بازگردانی کامل نشد — سایت را دستی بررسی کنید. ${result.restore_error || ''}`
        }
      />
    </div>
  )
}

function Row({ icon, title, body, extra, tone }) {
  const color = tone === 'success' ? 'var(--gd-success)' : tone === 'danger' ? 'var(--gd-danger)' : 'var(--gd-text-muted)'
  return (
    <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '15px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>
        <Icon name={icon} size={16} style={{ color }} /> {title}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>{body}</p>
      {extra}
    </div>
  )
}
