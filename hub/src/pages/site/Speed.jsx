import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge } from '../../components/index.js'
import { faNum } from '../../lib/format.js'
import { site as siteApi } from '../../lib/api.js'

/**
 * Speed — what makes a page slow, measured rather than guessed.
 *
 * Two readings that fail differently, so they are shown apart: the site-wide
 * one (autoloaded options, object cache, cron backlog) which taxes every
 * request, and the per-page query log with each query attributed to the plugin
 * that issued it.
 *
 * Findings are ordered by risk, and only the reversible-and-invisible ones get
 * a button. Everything else is advice with the number that triggered it
 * attached, so the owner can disagree with us.
 */

const RISK = {
  safe: { label: 'بی‌خطر', variant: 'success', note: 'برگشت‌پذیر و بدون تغییر ظاهری' },
  careful: { label: 'با احتیاط', variant: 'warning', note: 'برگشت‌پذیر، ولی رفتاری را تغییر می‌دهد' },
  manual: { label: 'دستی', variant: 'neutral', note: 'نیازمند تصمیم شما یا دسترسی هاست' },
}

export default function Speed() {
  const { siteId } = useOutletContext()
  const [url, setUrl] = useState('')
  const [job, setJob] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState('')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function start() {
    setError(''); setReport(null); setJob(null)
    try {
      const res = await siteApi(siteId).measureSpeed({ url: url.trim() })
      const started = res.job || res
      setJob(started)
      poll(started.id)
    } catch (e) { setError(e?.message || 'شروع نشد.') }
  }

  function poll(jobId) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const s = await siteApi(siteId).job(jobId)
        setJob(s)
        if (s.state !== 'done' && s.state !== 'failed') return poll(jobId)
        // Matching runs on our server, not the site: the recipe book improves
        // over time and every site should get today's rules tonight, without
        // anyone updating a plugin.
        if (s.state === 'done' && s.result) {
          setReport(await siteApi(siteId).analyseSpeed(s.result))
        }
      } catch (e) { setError(e?.message || 'وضعیت خوانده نشد.') }
    }, 2000)
  }

  async function runFix(finding) {
    setActing(finding.id); setError('')
    try {
      const res = await siteApi(siteId).runAction(finding.action, {})
      const msg = res?.result?.content?.[0]?.text
      let parsed = null
      try { parsed = msg ? JSON.parse(msg) : null } catch { /* plain text */ }
      setReport((r) => ({
        ...r,
        findings: r.findings.map((f) =>
          f.id === finding.id ? { ...f, done: parsed?.message || 'انجام شد' } : f
        ),
      }))
    } catch (e) { setError(e?.message || 'اجرا نشد.') } finally { setActing('') }
  }

  const running = job && job.state !== 'done' && job.state !== 'failed'

  return (
    <>
      <PageHead
        title="سرعت"
        subtitle="کوئری‌های هر صفحه و آنچه واقعاً کندش می‌کند"
      />

      <div style={card}>
        <label style={label}>آدرس صفحه‌ای که می‌خواهید بررسی شود</label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="خالی بگذارید تا صفحهٔ اصلی بررسی شود" dir="ltr" />
        {/* Said up front because it is true and counter-intuitive: measuring
            costs the page being measured. One request, then off. */}
        <p style={hint}>
          برای شمردن کوئری‌ها، همان یک درخواست عمداً کندتر اجرا می‌شود و بعد بلافاصله خاموش می‌شود.
          روی بازدیدکنندگان دیگر اثری ندارد.
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" size="md" leftIcon="gauge" disabled={running} onClick={start}>
            {running ? 'در حال اندازه‌گیری…' : 'اندازه‌گیری سرعت'}
          </Button>
        </div>
      </div>

      {error && <p style={errorBox}>{error}</p>}

      {job && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 9, fontSize: 13.5, fontWeight: 700 }}>
            <span>{job.message || 'در حال اجرا'}</span>
            <Badge variant={job.state === 'failed' ? 'danger' : job.state === 'done' ? 'success' : 'info'} appearance="soft">
              {job.state === 'failed' ? 'ناموفق' : job.state === 'done' ? 'تمام' : `${faNum(job.progress || 0)}٪`}
            </Badge>
          </div>
          <div style={bar}>
            <div style={{ ...barFill, width: `${job.state === 'done' ? 100 : job.progress || 0}%`, background: job.state === 'failed' ? 'var(--gd-danger)' : 'var(--gd-primary)' }} />
          </div>
        </div>
      )}

      {job?.result && <Measurements profile={job.result} />}
      {report && <Findings report={report} onFix={runFix} acting={acting} />}
    </>
  )
}

function Measurements({ profile }) {
  const s = profile.site || {}
  const p = profile.page

  return (
    <div style={{ marginTop: 20 }}>
      <div style={sectionTitle}>اندازه‌گیری‌ها</div>

      <div className="dwp-grid dwp-grid-4">
        <Stat
          label="حجم autoload" value={kb(s.autoload?.bytes)} unit=""
          tone={s.autoload?.verdict === 'bad' ? 'danger' : s.autoload?.verdict === 'warn' ? 'warning' : 'success'}
          sub={s.autoload ? `${faNum(s.autoload.count)} ردیف، روی هر درخواست` : null}
        />
        <Stat
          label="کوئری این صفحه" value={p ? faNum(p.queries) : '—'} unit=""
          tone={p && p.queries > 150 ? 'warning' : 'neutral'}
          sub={p ? `${faNum(p.query_ms)}ms صرف دیتابیس` : profile.page_error ? 'اندازه‌گیری نشد' : null}
        />
        <Stat
          label="ساخت صفحه" value={p ? faNum(Math.round(p.generated_ms)) : '—'} unit={p ? 'ms' : ''}
          tone={p && p.generated_ms > 1500 ? 'danger' : p && p.generated_ms > 800 ? 'warning' : 'neutral'}
          sub={p?.peak_memory ? `اوج حافظه ${p.peak_memory}` : null}
        />
        <Stat
          label="آبجکت‌کش" value={s.object_cache?.external ? 'دارد' : 'ندارد'} unit=""
          tone={s.object_cache?.external ? 'success' : 'neutral'}
          sub={`PHP ${s.php?.version || '—'}${s.php?.opcache === false ? ' · OPcache خاموش' : ''}`}
        />
      </div>

      {profile.page_error && (
        <p style={{ ...hint, marginTop: 12 }}>{profile.page_error}</p>
      )}
      {p?.note && <p style={{ ...hint, marginTop: 8 }}>{p.note}</p>}

      {/* Attribution is the part that turns a number into a decision: 340
          queries means nothing until you know which plugin issued them. */}
      {p?.by_source?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>زمان دیتابیس، به تفکیک منبع</div>
          {p.by_source.map((row) => {
            const pct = p.query_ms ? Math.round((row.ms / p.query_ms) * 100) : 0
            return (
              <div key={row.source} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{row.source}</span>
                  <span style={{ color: 'var(--gd-text-muted)' }}>
                    {faNum(row.queries)} کوئری · {faNum(Math.round(row.ms))}ms · {faNum(pct)}٪
                  </span>
                </div>
                <div style={bar}>
                  <div style={{ ...barFill, width: `${pct}%`, background: pct > 40 ? 'var(--gd-warning)' : 'var(--gd-primary)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {p?.repeated?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>کوئری‌های تکرارشونده</div>
          <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
            یک شکل کوئری که ده‌ها بار اجرا می‌شود، تقریباً همیشه یعنی کدی داخل حلقه برای هر آیتم جداگانه به دیتابیس می‌زند.
          </p>
          {p.repeated.map((r, i) => (
            <div key={i} style={{ padding: '9px 0', borderTop: i ? '1px solid var(--gd-border-subtle)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ fontWeight: 700 }}>{faNum(r.count)} بار</span>
                <span style={{ color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }}>{r.source}</span>
              </div>
              <code style={sql}>{r.shape}</code>
            </div>
          ))}
        </div>
      )}

      {s.autoload?.largest?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>بزرگ‌ترین ردیف‌های autoload</div>
          <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
            این‌ها روی هر درخواست خوانده می‌شوند — نه فقط صفحات، بلکه admin-ajax و REST و کرون.
          </p>
          {s.autoload.largest.slice(0, 8).map((o, i) => (
            <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--gd-border-subtle)' : 'none', fontSize: 12.5 }}>
              <code style={{ ...sql, flex: 1, padding: 0, background: 'none' }}>{o.name}</code>
              <span style={{ color: 'var(--gd-text-muted)', whiteSpace: 'nowrap' }}>{kb(o.bytes)}</span>
              {o.owner
                ? <Badge variant="neutral" appearance="soft">{o.owner}</Badge>
                : <Badge variant="warning" appearance="soft">بی‌صاحب</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Findings({ report, onFix, acting }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={sectionTitle}>راهکارها</div>
      <p style={{ ...hint, marginTop: 0, marginBottom: 14 }}>{report.summary}</p>

      {report.findings.map((f) => {
        const r = RISK[f.risk] || RISK.manual
        return (
          <div key={f.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800 }}>{f.title}</span>
              <Badge variant={r.variant} appearance="soft">{r.label}</Badge>
              <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{r.note}</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gd-text-secondary)', margin: '0 0 10px', lineHeight: 1.9 }}>{f.why}</p>
            <ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 12.5, lineHeight: 2 }}>
              {f.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>

            {/* Only 'safe' recipes carry an action, and the recipe book itself
                enforces that — a careful or manual finding never renders a
                button, however tempting the one-click version would be. */}
            {f.action && !f.done && (
              <div style={{ marginTop: 12 }}>
                <Button variant="secondary" size="sm" leftIcon="sparkles" disabled={acting === f.id} onClick={() => onFix(f)}>
                  {acting === f.id ? 'در حال اجرا…' : 'انجامش بده'}
                </Button>
              </div>
            )}
            {f.done && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--gd-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} /> {f.done}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value, unit, tone, sub }) {
  const color = tone === 'danger' ? 'var(--gd-danger-text)'
    : tone === 'warning' ? 'var(--gd-warning-text)'
    : tone === 'success' ? 'var(--gd-success)'
    : 'var(--gd-text)'
  return (
    <div style={{ ...card, marginBottom: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--gd-font-mono)' }}>
        {value}<span style={{ fontSize: 12, fontWeight: 600, marginInlineStart: 3 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--gd-text-muted)', marginTop: 5, lineHeight: 1.6 }}>{sub}</div>}
    </div>
  )
}

const kb = (b) => {
  if (typeof b !== 'number') return '—'
  if (b >= 1048576) return `${faNum((b / 1048576).toFixed(1))}MB`
  return `${faNum(Math.round(b / 1024))}KB`
}

const card = {
  background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)',
  borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px',
}
const label = { display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }
const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '8px 0 0', lineHeight: 1.9 }
const sectionTitle = { fontSize: 15, fontWeight: 700, marginBottom: 12 }
const bar = { height: 6, borderRadius: 3, background: 'var(--gd-bg-inset)', overflow: 'hidden' }
const barFill = { height: '100%', transition: 'width .4s ease' }
const sql = {
  display: 'block', fontFamily: 'var(--gd-font-mono)', fontSize: 11,
  color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-inset)',
  padding: '6px 9px', borderRadius: 'var(--gd-radius-sm)', overflowX: 'auto', whiteSpace: 'pre',
}
const errorBox = {
  fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)',
  border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px', marginTop: 16,
}
