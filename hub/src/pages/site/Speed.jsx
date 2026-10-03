import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge, SkeletonStats, SkeletonCard } from '../../components/index.js'
import { t, digits, num, pct } from '../../lib/i18n.js'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'

/**
 * Speed — what makes a page slow, measured rather than guessed.
 */
// Labels are keys, translated at render (see Findings).
const RISK = {
  safe: { key: 'safe', variant: 'success' },
  careful: { key: 'careful', variant: 'warning' },
  manual: { key: 'manual', variant: 'neutral' },
}

export default function Speed() {
  const { siteId } = useOutletContext()
  const { startTask } = useTask()
  const [url, setUrl] = useState('')
  const [job, setJob] = useState(null)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState('')
  // A stalled poll is one we gave up reading after repeated failures. It must
  // unlock the button again — the operator decides, not a network hiccup.
  const [stalled, setStalled] = useState(false)
  const timer = useRef(null)
  const fails = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function start() {
    setError(''); setReport(null); setJob(null); setStalled(false); fails.current = 0
    try {
      const res = await siteApi(siteId).measureSpeed({ url: url.trim() })
      const started = res.job || res
      setJob(started)
      if (started?.id) {
        startTask({
          id: started.id,
          title: url ? t('speed.task.titleUrl', { url }) : t('speed.task.titleHome'),
          type: 'speed',
        })
      }
      poll(started.id)
    } catch (e) { setError(e?.message || t('speed.error.start')) }
  }

  function poll(jobId) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      // One transient read failure must not brick the chain: retry a few
      // times, then stop honestly and hand control back to the operator.
      let s
      try {
        s = await siteApi(siteId).job(jobId)
        fails.current = 0
      } catch (e) {
        fails.current += 1
        if (fails.current >= 5) {
          setStalled(true)
          setError(t('speed.error.stalled'))
          return
        }
        setError(t('speed.error.retrying', { message: e?.message || t('speed.error.status') }))
        return poll(jobId)
      }
      setStalled(false)
      setJob(s)
      if (s.state !== 'done' && s.state !== 'failed') return poll(jobId)
      // Matching runs on our server, not the site: the recipe book improves
      // over time and every site should get today's rules tonight, without
      // anyone updating a plugin. A failed analysis must not restart the poll
      // of an already-done job — it reports once, here.
      if (s.state === 'done' && s.result) {
        try {
          setReport(await siteApi(siteId).analyseSpeed(s.result))
        } catch (e) { setError(e?.message || t('speed.error.analyse')) }
      }
    }, 2000)
  }

  async function runFix(finding) {
    setActing(finding.id); setError('')
    try {
      const res = await siteApi(siteId).runAction(finding.action, {})
      const msg = res?.result?.content?.[0]?.text
      let parsed = null
      try { parsed = msg ? JSON.parse(msg) : null } catch { /* plain text */ }
      // perf_clean_transients is batched: while it reports remaining > 0 the
      // work is not done, so the finding stays open and the button offers
      // another run instead of a green checkmark.
      const remaining = typeof parsed?.remaining === 'number' ? parsed.remaining : null
      setReport((r) => ({
        ...r,
        findings: r.findings.map((f) =>
          f.id === finding.id
            ? (remaining === null || remaining === 0
              ? { ...f, done: parsed?.message || t('speed.fix.done'), again: null }
              : { ...f, done: null, again: parsed?.message || t('speed.fix.partial') })
            : f
        ),
      }))
    } catch (e) { setError(e?.message || t('speed.error.run')) } finally { setActing('') }
  }

  const running = job && !stalled && job.state !== 'done' && job.state !== 'failed'

  return (
    <>
      <PageHead
        title={t('speed.title')}
        subtitle={t('speed.subtitle')}
      />

      <div style={card}>
        <label style={label}>{t('speed.form.urlLabel')}</label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('speed.form.urlPlaceholder')} dir="ltr" />
        {/* Said up front because it is true and counter-intuitive: measuring
            costs the page being measured. One request, then off. */}
        <p style={hint}>
          {t('speed.form.costNote')}
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" size="md" leftIcon="gauge" disabled={running} onClick={start}>
            {running ? t('speed.form.measuring') : t('speed.form.measure')}
          </Button>
        </div>
      </div>

      {error && <p style={errorBox}>{error}</p>}

      {job && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 9, fontSize: 13.5, fontWeight: 700 }}>
            <span>{job.message || t('speed.job.running')}</span>
            <Badge variant={job.state === 'failed' ? 'danger' : job.state === 'done' ? 'success' : 'info'} appearance="soft">
              {job.state === 'failed' ? t('speed.job.failed') : job.state === 'done' ? t('speed.job.done') : pct(job.progress || 0)}
            </Badge>
          </div>
          <div style={bar}>
            <div style={{ ...barFill, width: `${job.state === 'done' ? 100 : job.progress || 0}%`, background: job.state === 'failed' ? 'var(--gd-danger)' : 'var(--gd-primary)' }} />
          </div>
        </div>
      )}

      {running && !job?.result && (
        <div style={{ marginTop: 20 }}>
          <SkeletonStats count={3} />
          <SkeletonCard height={130} />
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
      <div style={sectionTitle}>{t('speed.measure.title')}</div>

      <div className="dwp-grid dwp-grid-4">
        <Stat
          label={t('speed.measure.autoload')} value={kb(s.autoload?.bytes)} unit=""
          // Missing autoload data stays neutral — an absent reading is not a
          // healthy one, and the dash must not render green.
          tone={!s.autoload
            ? 'neutral'
            : s.autoload.verdict === 'bad' ? 'danger' : s.autoload.verdict === 'warn' ? 'warning' : 'success'}
          sub={s.autoload ? t('speed.measure.autoloadRows', { count: s.autoload.count }) : null}
        />
        <Stat
          label={t('speed.measure.queries')} value={p ? digits(p.queries) : '—'} unit=""
          tone={p && p.queries > 150 ? 'warning' : 'neutral'}
          sub={p ? t('speed.measure.dbTime', { ms: digits(p.query_ms) }) : profile.page_error ? t('speed.measure.notMeasured') : null}
        />
        <Stat
          label={t('speed.measure.generation')} value={p ? digits(Math.round(p.generated_ms)) : '—'} unit={p ? 'ms' : ''}
          tone={p && p.generated_ms > 1500 ? 'danger' : p && p.generated_ms > 800 ? 'warning' : 'neutral'}
          sub={p?.peak_memory ? t('speed.measure.peakMemory', { value: p.peak_memory }) : null}
        />
        <Stat
          label={t('speed.measure.objectCache')} value={s.object_cache?.external ? t('speed.measure.present') : t('speed.measure.absent')} unit=""
          tone={s.object_cache?.external ? 'success' : 'neutral'}
          sub={`PHP ${s.php?.version || '—'}${s.php?.opcache === false ? ` · ${t('speed.measure.opcacheOff')}` : ''}`}
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
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>{t('speed.sources.title')}</div>
          {p.by_source.map((row) => {
            const share = p.query_ms ? Math.round((row.ms / p.query_ms) * 100) : 0
            return (
              <div key={row.source} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{row.source}</span>
                  <span style={{ color: 'var(--gd-text-muted)' }}>
                    {t('speed.sources.row', { count: row.queries, ms: digits(Math.round(row.ms)), share: pct(share) })}
                  </span>
                </div>
                <div style={bar}>
                  <div style={{ ...barFill, width: `${share}%`, background: share > 40 ? 'var(--gd-warning)' : 'var(--gd-primary)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {p?.repeated?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{t('speed.repeated.title')}</div>
          <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
            {t('speed.repeated.hint')}
          </p>
          {p.repeated.map((r, i) => (
            <div key={i} style={{ padding: '9px 0', borderTop: i ? '1px solid var(--gd-border-subtle)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, marginBottom: 3 }}>
                <span style={{ fontWeight: 700 }}>{t('speed.repeated.times', { count: r.count })}</span>
                <span style={{ color: 'var(--gd-text-muted)', fontFamily: 'var(--gd-font-mono)' }}>{r.source}</span>
              </div>
              <code style={sql}>{r.shape}</code>
            </div>
          ))}
        </div>
      )}

      {s.autoload?.largest?.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{t('speed.largest.title')}</div>
          <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
            {t('speed.largest.hint')}
          </p>
          {s.autoload.largest.slice(0, 8).map((o, i) => (
            <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--gd-border-subtle)' : 'none', fontSize: 12.5 }}>
              <code style={{ ...sql, flex: 1, padding: 0, background: 'none' }}>{o.name}</code>
              <span style={{ color: 'var(--gd-text-muted)', whiteSpace: 'nowrap' }}>{kb(o.bytes)}</span>
              {o.owner
                ? <Badge variant="neutral" appearance="soft">{o.owner}</Badge>
                : <Badge variant="warning" appearance="soft">{t('speed.largest.orphan')}</Badge>}
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
      <div style={sectionTitle}>{t('speed.findings.title')}</div>
      <p style={{ ...hint, marginTop: 0, marginBottom: 14 }}>{report.summary}</p>

      {report.findings.map((f) => {
        const r = RISK[f.risk] || RISK.manual
        return (
          <div key={f.id} style={{ ...card, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800 }}>{f.title}</span>
              <Badge variant={r.variant} appearance="soft">{t(`speed.risk.${r.key}.label`)}</Badge>
              <span style={{ fontSize: 11.5, color: 'var(--gd-text-muted)' }}>{t(`speed.risk.${r.key}.note`)}</span>
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
                <Button variant="secondary" size="sm" leftIcon={f.again ? 'repeat' : 'sparkles'} disabled={acting === f.id} onClick={() => onFix(f)}>
                  {acting === f.id ? t('speed.findings.running') : f.again ? t('speed.findings.runAgain') : t('speed.findings.run')}
                </Button>
              </div>
            )}
            {f.done && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--gd-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} /> {f.done}
              </div>
            )}
            {f.again && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--gd-warning-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="repeat" size={14} /> {f.again}
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
  if (b >= 1048576) return `${num(b / 1048576, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}MB`
  return `${num(Math.round(b / 1024))}KB`
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
