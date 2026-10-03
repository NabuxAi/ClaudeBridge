import { useState, useRef, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge } from '../../components/index.js'
import { digits, num, t } from '../../lib/i18n.js'
import Trans from '../../components/Trans.jsx'
import { site as siteApi } from '../../lib/api.js'
import { useTask } from '../../lib/tasks.jsx'

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
// Title/description live in rescue.steps.<key>.{title,desc}, translated at render.
const STEPS = [
  {
    id: 'backup',
    key: 'backup',
    icon: 'database-backup',
    writes: true,
  },
  {
    id: 'inventory',
    key: 'inventory',
    icon: 'list-checks',
    writes: false,
  },
  {
    id: 'leftovers',
    key: 'leftovers',
    icon: 'search',
    writes: false,
  },
  {
    id: 'db-audit',
    key: 'dbAudit',
    icon: 'database',
    writes: false,
  },
  {
    id: 'rotate-keys',
    key: 'rotateKeys',
    icon: 'key-round',
    writes: true,
    confirm: true,
  },
  {
    id: 'verify',
    key: 'verify',
    icon: 'shield-check',
    writes: false,
  },
]

export default function Rescue() {
  const { siteId } = useOutletContext()
  const { startTask } = useTask()
  const [results, setResults] = useState({})
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState({})
  // A queued step (backup) finishes in a background job, not in the rescue
  // response. Each running step polls its own job id; unmount clears them all.
  const timers = useRef({})
  const fails = useRef({})

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout)
  }, [])

  async function run(step) {
    if (step.confirm) {
      const ok = window.confirm(t('rescue.confirmRotate'))
      if (!ok) return
    }
    setBusy(step.id)
    setErrors((e) => ({ ...e, [step.id]: null }))
    try {
      const res = await siteApi(siteId).rescue(step.id, step.confirm ? { confirm: true } : {})
      // Only a queued step carries a real job id. Fabricating one instead —
      // e.g. `rescue-backup` — would be polled forever, because nothing answers
      // for an id the site never issued.
      const jobId = res?.queued ? res.result?.id : null
      if (jobId) {
        startTask({ id: jobId, title: t('rescue.taskTitle', { step: t(`rescue.steps.${step.key}.title`) }), type: 'rescue' })
        pollJob(step.id, jobId)
      } else if (res?.queued) {
        // Queued, but the site answered without a job id (e.g. an outdated
        // plugin refused the job type). The outcome is genuinely not available.
        setErrors((er) => ({
          ...er,
          [step.id]: res.result?.message || t('rescue.errors.queuedNoId'),
        }))
        setBusy((b) => (b === step.id ? '' : b))
      } else {
        setResults((r) => ({ ...r, [step.id]: res?.result }))
        setBusy((b) => (b === step.id ? '' : b))
      }
    } catch (e) {
      setErrors((er) => ({ ...er, [step.id]: e?.message || t('rescue.errors.notRun') }))
      setBusy((b) => (b === step.id ? '' : b))
    }
  }

  // Same contract as Speed's poll: transient read failures retry a few times,
  // then the step stops honestly instead of hanging on «در حال اجرا». The
  // finished job carries the step's real result (backup: counts, size,
  // verified) or its real failure message.
  function pollJob(stepId, jobId) {
    clearTimeout(timers.current[stepId])
    timers.current[stepId] = setTimeout(async () => {
      let s
      try {
        s = await siteApi(siteId).job(jobId)
        // A job the site no longer knows answers HTTP 200 {ok:false} — without
        // this check the poll would never terminate.
        if (!s || s.ok === false || !s.state) throw new Error(s?.message || t('rescue.errors.statusUnread'))
        fails.current[stepId] = 0
      } catch {
        fails.current[stepId] = (fails.current[stepId] || 0) + 1
        if (fails.current[stepId] >= 5) {
          delete timers.current[stepId]
          setErrors((er) => ({
            ...er,
            [stepId]: t('rescue.errors.pollGaveUp'),
          }))
          setBusy((b) => (b === stepId ? '' : b))
          return
        }
        return pollJob(stepId, jobId)
      }
      delete timers.current[stepId]
      if (s.state === 'done') {
        setResults((r) => ({ ...r, [stepId]: s.result }))
        setBusy((b) => (b === stepId ? '' : b))
      } else if (s.state === 'failed') {
        setErrors((er) => ({ ...er, [stepId]: s.message || t('rescue.errors.failedOnSite') }))
        setBusy((b) => (b === stepId ? '' : b))
      } else {
        pollJob(stepId, jobId)
      }
    }, 2000)
  }

  return (
    <>
      <PageHead
        title={t('rescue.title')}
        subtitle={t('rescue.subtitle')}
      />

      {/* The premise, stated once. Without it the steps look arbitrary. */}
      <div style={{ background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          <Icon name="info" size={17} style={{ color: 'var(--gd-primary)' }} /> {t('rescue.premise.title')}
        </div>
        <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: 0, lineHeight: 1.9 }}>
          <Trans k="rescue.premise.body" />
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
              {digits(index)}. {t(`rescue.steps.${step.key}.title`)}
            </span>
            {step.writes ? (
              <Badge variant="warning" appearance="soft">{t('rescue.badge.writes')}</Badge>
            ) : (
              <Badge variant="neutral" appearance="soft">{t('rescue.badge.readOnly')}</Badge>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--gd-text-muted)', margin: '5px 0 0', lineHeight: 1.8 }}>{t(`rescue.steps.${step.key}.desc`)}</p>
        </div>
        <Button variant={done ? 'secondary' : 'primary'} size="sm" disabled={busy} onClick={onRun}>
          {busy ? t('rescue.running') : done ? t('rescue.runAgain') : t('rescue.run')}
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
    if (!b) return box(result?.message || t('rescue.result.backupFailed'), 'danger')
    return box(
      <>
        {t('rescue.result.backupSaved', {
          tables: b.tables,
          rows: b.rows,
          mb: num(b.db_bytes / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        })}{' '}
        {b.verified
          ? <b style={{ color: 'var(--gd-success)' }}>{t('rescue.result.dumpVerified')}</b>
          : <b style={{ color: 'var(--gd-danger-text)' }}>{t('rescue.result.dumpIncomplete')}</b>}
      </>
    )
  }

  if (step === 'inventory') {
    const c = result?.counts || {}
    return box(
      <>
        <div>
          <b>{digits(c.repo || 0)}</b> {t('rescue.result.invRepo')} ·{' '}
          <b>{digits(c.foreign || 0)}</b> {t('rescue.result.invForeign')} ·{' '}
          <b style={{ color: (c.orphan || 0) > 0 ? 'var(--gd-danger-text)' : undefined }}>
            {digits(c.orphan || 0)}
          </b>{' '}
          {t('rescue.result.invOrphan')}
        </div>
        {result.foreign?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {t('rescue.result.needsUpload')} <span style={mono}>{result.foreign.map((f) => f.slug).join(t('rescue.listSep'))}</span>
          </div>
        )}
        {result.orphan?.length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            {t('rescue.result.suspectFolders')} <span style={mono}>{result.orphan.map((o) => o.slug).join(t('rescue.listSep'))}</span>
            {' '}{t('rescue.result.suspectFoldersNote')}
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
          {t('rescue.result.critical', { count: c.critical || 0 })}
        </b>{' '}
        · {t('rescue.result.review', { count: c.review || 0 })}
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
        <div>{t('rescue.result.admins', { count: (result?.admins || []).length })}</div>
        {hidden.length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            <b>{t('rescue.result.hiddenAdmins', { count: hidden.length })}</b>{' '}
            <span style={mono}>{hidden.map((h) => h.login).join(t('rescue.listSep'))}</span>
          </div>
        )}
        {opts.length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            <b>{t('rescue.result.suspectOptions', { count: opts.length })}</b>{' '}
            <span style={mono}>{opts.map((o) => `${o.option} (${o.marker})`).join(t('rescue.listSep'))}</span>
          </div>
        )}
        {(result?.suspect_cron || []).length > 0 && (
          <div style={{ marginTop: 8, color: 'var(--gd-danger-text)' }}>
            {t('rescue.result.suspectCron')} <span style={mono}>{result.suspect_cron.map((c) => c.hook).join(t('rescue.listSep'))}</span>
          </div>
        )}
        <div style={{ marginTop: 8, opacity: 0.85 }}>{result?.note}</div>
      </>,
      hidden.length || opts.length ? 'danger' : 'subtle'
    )
  }

  if (step === 'rotate-keys') {
    if (!result?.ok) return box(result?.message || t('rescue.result.rotateFailed'), 'danger')
    return box(
      <>
        {result.message}
        {result.backup && <div style={{ marginTop: 6 }}>{t('rescue.result.rotateBackup')} <span style={mono}>{result.backup}</span></div>}
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
          {t('rescue.result.core', {
            value: result?.integrity?.clean
              ? t('rescue.result.coreClean')
              : t('rescue.result.coreUnknown', { count: result?.integrity?.unexpected?.length || 0 }),
          })}
          {' · '}{t('rescue.result.scan', { count: result?.scan?.hits?.length || 0 })}
          {' · '}{t('rescue.result.leftoverCritical', { count: result?.leftovers?.counts?.critical || 0 })}
        </div>
      </>,
      result?.clean ? 'subtle' : 'danger'
    )
  }

  return box(<pre style={{ margin: 0, ...mono, whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 1).slice(0, 600)}</pre>)
}
