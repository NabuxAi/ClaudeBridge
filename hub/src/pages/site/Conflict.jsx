import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Input, Badge } from '../../components/index.js'
import { digits, pct, t } from '../../lib/i18n.js'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'

/**
 * Conflict hunt — find what breaks a page.
 */
export default function Conflict() {
  const { siteId } = useOutletContext()
  const { startTask } = useTask()
  const [url, setUrl] = useState('')
  const [expect, setExpect] = useState('')
  const [forbid, setForbid] = useState('')
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  // A stalled poll is one we gave up reading after repeated failures. It must
  // unlock the button again — the operator decides, not a network hiccup.
  const [stalled, setStalled] = useState(false)
  const timer = useRef(null)
  const fails = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  async function start() {
    if (!url.trim()) return
    setError('')
    setJob(null)
    setStalled(false)
    fails.current = 0
    try {
      const res = await siteApi(siteId).findConflict({ url: url.trim(), expect: expect.trim(), forbid: forbid.trim() })
      const started = res.job || res
      setJob(started)
      if (started?.id) {
        startTask({
          id: started.id,
          title: t('conflict.taskTitle', { url }),
          type: 'conflict',
        })
      }
      poll(started.id)
    } catch (e) {
      setError(e?.message || t('conflict.errors.notStarted'))
    }
  }

  // Poll rather than await. Every tick is a cheap option read on the site — the
  // expensive work is already running in its own background request. One
  // transient read failure must not brick the chain: retry a few times, then
  // stop honestly and hand control back to the operator.
  function poll(jobId) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      let s
      try {
        s = await siteApi(siteId).job(jobId)
        // A job the site no longer knows answers HTTP 200 {ok:false} — without
        // this check the poll would never terminate.
        if (!s || s.ok === false || !s.state) throw new Error(s?.message || t('conflict.errors.statusUnread'))
        fails.current = 0
      } catch (e) {
        fails.current = (fails.current || 0) + 1
        if (fails.current >= 5) {
          setStalled(true)
          setError(t('conflict.errors.pollGaveUp'))
          return
        }
        setError(t('conflict.errors.retrying', { reason: e?.message || t('conflict.errors.statusUnread') }))
        return poll(jobId)
      }
      setStalled(false)
      setJob(s)
      if (s.state !== 'done' && s.state !== 'failed') poll(jobId)
    }, 2000)
  }

  // Resuming means reading the same job again — the hunt keeps running on the
  // site regardless. Starting a fresh hunt over a live site is a separate,
  // explicit decision the start button still offers.
  function resumePoll() {
    if (!job?.id) return
    setStalled(false)
    fails.current = 0
    poll(job.id)
  }

  const running = job && !stalled && job.state !== 'done' && job.state !== 'failed'
  const result = job?.result

  return (
    <>
      <PageHead
        title={t('conflict.title')}
        subtitle={t('conflict.subtitle')}
      />

      <div style={{ background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--gd-warning-text)', marginBottom: 5 }}>
          <Icon name="alert-triangle" size={16} /> {t('conflict.liveWarning.title')}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--gd-warning-text)', margin: 0, lineHeight: 1.9, opacity: 0.92 }}>
          {t('conflict.liveWarning.body')}
        </p>
      </div>

      <div style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', boxShadow: 'var(--gd-shadow-sm)', padding: '18px 20px', marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
              {t('conflict.form.url')}
            </label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/checkout" dir="ltr" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
              {t('conflict.form.expect')} <span style={{ opacity: 0.7 }}>{t('conflict.form.expectOptional')}</span>
            </label>
            <Input value={expect} onChange={(e) => setExpect(e.target.value)} placeholder={t('conflict.form.expectPlaceholder')} />
            <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.7 }}>
              {t('conflict.form.expectHint')}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--gd-text-muted)', marginBottom: 6 }}>
              {t('conflict.form.forbid')} <span style={{ opacity: 0.7 }}>{t('conflict.form.optional')}</span>
            </label>
            <Input value={forbid} onChange={(e) => setForbid(e.target.value)} placeholder="Fatal error" dir="ltr" />
            <p style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.7 }}>
              {t('conflict.form.forbidHint')}
            </p>
          </div>
          <div>
            <Button variant="primary" size="md" disabled={running || !url.trim()} onClick={start} leftIcon="search">
              {running ? t('conflict.form.running') : t('conflict.form.start')}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--gd-danger-text)', background: 'var(--gd-danger-bg)', border: '1px solid var(--gd-danger)', borderRadius: 'var(--gd-radius-md)', padding: '11px 14px' }}>
          {error}
          {stalled && job?.id && (
            <div>
              <Button size="sm" variant="secondary" style={{ marginTop: 8 }} onClick={resumePoll}>
                {t('common.retry')}
              </Button>
            </div>
          )}
        </div>
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
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{job.message || t('conflict.job.running')}</span>
        <Badge variant={failed ? 'danger' : done ? 'success' : 'info'} appearance="soft">
          {failed ? t('conflict.job.failed') : done ? t('conflict.job.done') : pct(job.progress || 0)}
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
            {culprit ? (culprit.kind === 'theme' ? t('conflict.result.themeCulprit') : t('conflict.result.pluginCulprit')) : t('conflict.result.noCulprit')}
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
          title={t('conflict.result.themeTitle')}
          body={
            result.theme.tested
              ? result.theme.is_cause
                ? t('conflict.result.themeIsCause', { compared: result.theme.compared, current: result.theme.current })
                : t('conflict.result.themeNotCause', { compared: result.theme.compared, current: result.theme.current })
              : t('conflict.result.themeNotTested', { reason: result.theme.reason })
          }
        />
      )}

      {result.bisect && (
        <Row
          icon="git-branch"
          title={t('conflict.result.bisectTitle')}
          body={t('conflict.result.bisectBody', { count: result.bisect.tested })}
          extra={
            result.bisect.rounds?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, fontSize: 12, lineHeight: 1.9, color: 'var(--gd-text-muted)' }}>
                {result.bisect.rounds.map((r, i) => (
                  <li key={i}>
                    <span style={mono}>{digits(r.disabled.length)}</span> {t('conflict.result.roundDisabled')}{' '}
                    {r.healthy ? <b style={{ color: 'var(--gd-success)' }}>{t('conflict.result.roundHealthy')}</b> : t('conflict.result.roundBroken')}
                    {r.status ? ` (${digits(r.status)})` : ''}
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
          title={t('conflict.result.incompleteTitle')}
          body={t('conflict.result.incompleteBody', { error: result.error })}
        />
      )}

      {/* Restoration is the claim that matters most: the site was altered to
          run this, so "we put it back" is read back from the site, not assumed. */}
      <Row
        icon={result.restored ? 'check' : 'alert-triangle'}
        title={t('conflict.result.restoreTitle')}
        tone={result.restored ? 'success' : 'danger'}
        body={
          result.restored
            ? t('conflict.result.restored', {
                state: result.final_health?.healthy
                  ? t('conflict.result.stateHealthy')
                  : result.final_health
                    ? (result.final_health?.status
                      ? t('conflict.result.stateBrokenStatus', { status: digits(result.final_health.status) })
                      : t('conflict.result.stateBroken'))
                    : // The site never re-measured the page (e.g. the healthy-baseline
                      // short-circuit) — saying "still broken" would contradict the
                      // verdict above, so the missing reading stays missing.
                      t('conflict.result.stateUnmeasured'),
              })
            : t('conflict.result.notRestored', { error: result.restore_error || '' })
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
