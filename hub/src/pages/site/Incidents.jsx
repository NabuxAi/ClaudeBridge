import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, Badge, AlertCard, Checkbox, Dialog, Tabs, Provenance, SkeletonTable, SkeletonCard, NotMeasured } from '../../components/index.js'
import { t, digits, dateTime } from '../../lib/i18n.js'
import { site as siteApi } from '../../lib/api.js'

// Timeline dot styling per event tone.
const TONE = {
  danger: { bg: 'var(--gd-danger-bg)', text: 'var(--gd-danger-text)', icon: 'alert-octagon' },
  warning: { bg: 'var(--gd-warning-bg)', text: 'var(--gd-warning-text)', icon: 'alert-triangle' },
  info: { bg: 'var(--gd-info-bg)', text: 'var(--gd-info-text)', icon: 'info' },
  done: { bg: 'var(--gd-success-bg)', text: 'var(--gd-success-text)', icon: 'check-circle-2' },
}

// Past-incident row icon + colour per severity.
const SEV = {
  critical: { bg: 'var(--gd-danger-bg)', text: 'var(--gd-danger-text)', icon: 'alert-octagon' },
  warning: { bg: 'var(--gd-warning-bg)', text: 'var(--gd-warning-text)', icon: 'shield-alert' },
  info: { bg: 'var(--gd-info-bg)', text: 'var(--gd-info-text)', icon: 'info' },
}

const EXECUTION = {
  ran: { label: 'incidents.executionRan', variant: 'success' },
  failed: { label: 'incidents.executionFailed', variant: 'danger' },
  unconfirmed: { label: 'incidents.executionUnconfirmed', variant: 'warning' },
}

export default function Incidents() {
  const { siteId, site } = useOutletContext()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [decision, setDecision] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [confirmBatch, setConfirmBatch] = useState(null)
  const [batchProgress, setBatchProgress] = useState(null)

  // Soft refresh while the page is shown: on failure the already-loaded data
  // stays and the error surfaces in the banner below — a failed refresh never
  // silently leaves a critical alert looking handled.
  const load = () => siteApi(siteId).incidents()
    .then((d) => { setData(d); setError('') })
    .catch((e) => setError(e?.message || t('incidents.loadError')))

  useEffect(() => {
    let alive = true
    siteApi(siteId).incidents()
      .then((d) => { if (alive) { setData(d); setError('') } })
      // Without this catch a failed first load left data null forever and the
      // gate below spun the skeleton with no message at all.
      .catch((e) => { if (alive) setError(e?.message || t('incidents.loadError')) })
    return () => { alive = false }
  }, [siteId, attempt])

  // Dismissing closes our record of the alert. It does not touch the site, and
  // the next scan that still sees the problem will open it again — so the
  // button is worded as ignoring, never as resolving.
  async function dismiss(id) {
    setBusy(id)
    try { await siteApi(siteId).dismissIncident(id); await load() }
    catch (e) { setError(e?.message || t('incidents.dismissError')) }
    finally { setBusy('') }
  }

  async function decide(proposal, approve) {
    setBusy(proposal.id)
    setDecision(null)
    let outcome
    try {
      const api = siteApi(siteId)
      const result = await (approve ? api.approveProposal(proposal.id) : api.rejectProposal(proposal.id))
      if (!result?.ok || (approve && !result.relayed)) throw new Error(t('incidents.proposalFailed'))
      outcome = { text: t(approve ? 'incidents.proposalRan' : 'incidents.proposalRejected', { tool: proposal.tool }) }
    } catch (e) {
      outcome = { text: e?.message || t('incidents.proposalFailed'), failed: true }
    }
    await load()
    setDecision(outcome)
    setBusy('')
  }

  async function approveBatch(batch) {
    setConfirmBatch(null)
    setBusy('batch')
    setDecision(null)
    const api = siteApi(siteId)
    const issues = []
    let succeeded = 0
    let settled = 0
    setBatchProgress({ done: 0, total: batch.length })

    // Each request keeps the same server-side claim and audit as a single
    // approval. Work oldest first and avoid concurrent writes to the site.
    for (const proposal of batch) {
      try {
        const result = await api.approveProposal(proposal.id)
        if (!result?.ok || !result.relayed) throw new Error(t('incidents.proposalFailed'))
        succeeded += 1
      } catch (e) {
        if (e?.data?.code === 'proposal_already_settled') settled += 1
        else issues.push({ proposal, message: e?.message || t('incidents.proposalFailed') })
      }
      setBatchProgress({ done: succeeded + settled + issues.length, total: batch.length })
    }

    setDecision({
      text: t('incidents.batchResult', { succeeded: digits(succeeded), issues: digits(issues.length), settled: digits(settled) }),
      failed: issues.length > 0,
      issues,
    })
    setSelected(new Set())
    await load()
    setBatchProgress(null)
    setBusy('')
  }

  const openBatch = (rows) => {
    setConfirmBatch([...rows].sort((a, b) => Number(a.created_at) - Number(b.created_at)))
  }

  const head = <PageHead title={t('incidents.title')} subtitle={t('incidents.subtitle')} />

  if (!data) {
    if (error) {
      return (
        <>
          {head}
          <NotMeasured title={t('incidents.notReadTitle')} reason={error} icon="alert-triangle" />
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={() => { setError(''); setAttempt((a) => a + 1) }}>
              {t('common.retry')}
            </Button>
          </div>
        </>
      )
    }
    return (
      <>
        {head}
        <SkeletonCard height={140} />
        <div style={{ marginTop: 20 }}>
          <SkeletonTable rows={4} cols={3} />
        </div>
      </>
    )
  }

  const { featured, canManage, proposals = [], proposalDecisions = [] } = data
  const selectedProposals = proposals.filter(({ id }) => selected.has(id))
  const allSelected = proposals.length > 0 && selectedProposals.length === proposals.length
  const list = data.list.filter((it) => it.kind !== 'proposal' || it.resolved)
  const filtered = list.filter((it) => {
    if (tab === 'all') return true
    if (tab === 'resolved') return it.resolved
    return it.severity === tab
  })
  const timeline = featured?.timeline || []

  const tabs = [
    { key: 'all', label: t('incidents.tabs.all'), badge: digits(list.length) },
    { key: 'critical', label: t('incidents.tabs.critical') },
    { key: 'warning', label: t('incidents.tabs.warning') },
    { key: 'resolved', label: t('incidents.tabs.resolved') },
  ]

  return (
    <>
      <PageHead
        title={t('incidents.title')}
        subtitle={t('incidents.subtitle')}
        action={(
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {site.role === 'owner' && <Button as={Link} to={`/app/mcp?site=${encodeURIComponent(siteId)}`} variant="ghost" size="sm">{t('incidents.temporaryMcpEdit')}</Button>}
            <Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={load} disabled={Boolean(busy)}>
              {t('incidents.reload')}
            </Button>
          </div>
        )}
      />

      {/* Failed dismiss/refresh — visible, with the loaded data kept below */}
      {error && (
        <div className="pbk-note pbk-note--danger">{error}</div>
      )}
      {decision && (
        <div role={decision.failed ? 'alert' : 'status'} className={`pbk-note${decision.failed ? ' pbk-note--danger' : ''}`}>
          {decision.text}
          {decision.issues?.length > 0 && (
            <ul style={{ marginBlockEnd: 0, overflowWrap: 'anywhere' }}>
              {decision.issues.map(({ proposal, message }) => (
                <li key={proposal.id}><bdi>{proposal.args?.path || proposal.tool}</bdi> <span>{message}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {batchProgress && <div role="status" className="pbk-note">
        {t('incidents.batchProgress', { done: digits(batchProgress.done), total: digits(batchProgress.total) })}
      </div>}

      {proposals.length > 0 && (
        <section aria-labelledby="pending-proposals-title" style={{ marginBottom: 22 }}>
          <h2 id="pending-proposals-title" style={{ fontSize: 15, marginBlock: '0 12px' }}>{t('incidents.pendingProposals')}</h2>
          {canManage && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBlockEnd: 12 }}>
              <Checkbox label={t('incidents.selectAll')} checked={allSelected} disabled={Boolean(busy)}
                aria-checked={selectedProposals.length > 0 && !allSelected ? 'mixed' : allSelected}
                onChange={(e) => setSelected(new Set(e.target.checked ? proposals.map(({ id }) => id) : []))} />
              <Button size="sm" variant="primary" disabled={Boolean(busy) || selectedProposals.length === 0}
                onClick={() => openBatch(selectedProposals)}>
                {t('incidents.approveSelected', { count: digits(selectedProposals.length) })}
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => openBatch(proposals)}>
                {t('incidents.approveAll')}
              </Button>
            </div>
          )}
          {proposals.map((proposal) => (
            <div key={proposal.id} className="pbk-panel" style={{ padding: '14px 18px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {canManage && <Checkbox checked={selected.has(proposal.id)} disabled={Boolean(busy)}
                  aria-label={t('incidents.selectProposal', { label: proposal.args?.path || proposal.tool })}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (checked) next.add(proposal.id)
                      else next.delete(proposal.id)
                      return next
                    })
                  }} />}
                <strong><bdi>{proposal.tool}</bdi></strong>
              </div>
              {proposal.args?.path && <div dir="ltr" style={{ textAlign: 'start', overflowWrap: 'anywhere' }}>{proposal.args.path}</div>}
              {proposal.tool === 'create_plugin' && <div>{t('incidents.pluginCreationApproval')}</div>}
              {proposal.reason && <div>{proposal.reason}</div>}
              {canManage && (
                <>
                  <details style={{ marginBlock: 8 }}>
                    <summary>{t('incidents.proposalDetails')}</summary>
                    <pre dir="ltr" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 300, overflow: 'auto' }}>
                      {JSON.stringify(proposal.args, null, 2)}
                    </pre>
                  </details>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Button variant="primary" size="sm" disabled={Boolean(busy)} onClick={() => decide(proposal, true)}>
                      {t('incidents.approveAndRun')}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => decide(proposal, false)}>
                      {t('incidents.rejectProposal')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      <Dialog open={confirmBatch !== null} onClose={() => setConfirmBatch(null)}
        title={t('incidents.confirmBatch', { count: digits(confirmBatch?.length || 0) })}
        desc={t('incidents.confirmBatchHint')}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmBatch(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => approveBatch(confirmBatch)}>{t('incidents.approveAndRun')}</Button>
        </>}>
        <ul style={{ maxHeight: '35vh', overflow: 'auto', overflowWrap: 'anywhere', margin: 0 }}>
          {confirmBatch?.map(({ id, tool, args }) => <li key={id}><bdi>{tool}{args?.path ? ` · ${args.path}` : ''}</bdi></li>)}
        </ul>
      </Dialog>

      {proposalDecisions.length > 0 && (
        <section aria-labelledby="proposal-decisions-title" style={{ marginBottom: 22 }}>
          <h2 id="proposal-decisions-title" style={{ fontSize: 15, marginBlock: '0 12px' }}>{t('incidents.proposalDecisions')}</h2>
          {proposalDecisions.map((row) => {
            const execution = EXECUTION[row.execution]
            return (
              <article key={row.id} className="pbk-panel" style={{ padding: '12px 18px', marginBottom: 8, overflowWrap: 'anywhere' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <strong><bdi>{row.tool}</bdi></strong>
                  <Badge variant="info" appearance="soft">{t(row.status === 'approved' ? 'incidents.decisionApproved' : 'incidents.decisionRejected')}</Badge>
                  {execution && <Badge variant={execution.variant} appearance="soft">{t(execution.label)}</Badge>}
                  {row.decidedAt && <time dateTime={new Date(row.decidedAt).toISOString()} style={{ marginInlineStart: 'auto' }}>
                    {dateTime(row.decidedAt, { dateStyle: 'short', timeStyle: 'short' })}
                  </time>}
                </div>
                <div><code dir="ltr">{row.id}</code>{row.path && <> · <bdi>{row.path}</bdi></>}</div>
                {row.error && <div><bdi>{row.error}</bdi></div>}
              </article>
            )
          })}
        </section>
      )}

      {/* Severity filter */}
      <div style={{ marginBottom: 20 }}>
        <Tabs items={tabs} value={tab} onChange={setTab} variant="underline" />
      </div>

      {/* Featured critical incident */}
      {featured && (
        <div style={{ marginBottom: 22 }}>
          <AlertCard
            severity={featured.severity}
            title={featured.title}
            time={featured.time}
            desc={featured.desc}
            fields={featured.fields}
            actions={canManage && (
              <Button
                variant="ghost" size="sm"
                disabled={Boolean(busy)}
                onClick={() => featured.id && dismiss(featured.id)}
              >
                {t('incidents.ignore')}
              </Button>
            )}
          />
        </div>
      )}

      {/* Resolution timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t('incidents.timeline')}</div>
          <div className="pbk-panel" style={{ padding: '20px 22px' }}>
            {timeline.map((ev, i) => {
              const tone = TONE[ev.tone] || TONE.info
              const last = i === timeline.length - 1
              return (
                <div key={i} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: tone.bg, color: tone.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={tone.icon} size={16} />
                    </span>
                    {!last && <span style={{ flex: 1, width: 2, background: 'var(--gd-border-subtle)', margin: '4px 0' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gd-text-secondary)', lineHeight: 1.6 }}>{ev.label}</div>
                    <div style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 12, color: 'var(--gd-text-muted)', marginTop: 3 }}>{ev.t}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Past incidents */}
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t('incidents.recent')}</div>
      <div className="pbk-panel" style={{ padding: '4px 20px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13.5, color: 'var(--gd-text-muted)', lineHeight: 1.9 }}>
            {data.empty ? (data.emptyNote || t('incidents.empty')) : t('incidents.emptyFilter')}
          </div>
        )}
        {filtered.map((it, i) => {
          const s = SEV[it.severity] || SEV.info
          const last = i === filtered.length - 1
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: last ? 'none' : '1px solid var(--gd-border-subtle)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: s.bg, color: s.text, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                <Icon name={s.icon} size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{it.title}</div>
                {it.backupId && <div style={{ overflowWrap: 'anywhere' }}>{t('incidents.editBackup')} <code dir="ltr">{it.backupId}</code></div>}
              </div>
              <span style={{ fontFamily: 'var(--gd-font-mono)', fontSize: 12, color: 'var(--gd-text-muted)', whiteSpace: 'nowrap' }}>{it.time}</span>
              {it.resolved
                ? <Badge variant="success" appearance="soft">{t('incidents.closed')}</Badge>
                : (
                  <>
                    <Badge variant="warning" appearance="soft">{t('incidents.open')}</Badge>
                    {canManage && <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => dismiss(it.id)}>
                      {t('incidents.ignore')}
                    </Button>}
                  </>
                )}
            </div>
          )
        })}
      </div>

      <Provenance data={data} />
    </>
  )
}
