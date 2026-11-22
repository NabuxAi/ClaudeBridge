import { useState } from 'react'
import { Button, Dialog } from './index.js'
import { site as siteApi, account } from '../lib/api.js'
import { t } from '../lib/i18n.js'

/**
 * Issue a new connection key for a site whose plugin no longer holds the old
 * one. Owner-only on the server; anyone else sees the server's 403 message.
 * The key is shown once, here, and never fetched again.
 */
export default function ConnectionKey({ siteId, role }) {
  // The check is a manager action; issuing a key is the owner's. A viewer sees neither.
  const owner = role === 'owner'

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState(null)
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState(null) // { ok, text }

  // The signed ping: on failure the server's message names the site's own
  // refusal reason (plugin 3.9.4+), e.g. a key mismatch or a database that
  // cannot be written.
  async function verify() {
    setChecking(true); setCheck(null)
    try {
      const res = await account.pingSite(siteId)
      setCheck({ ok: true, text: t('hosting.key.checkOk', { version: res?.connector?.version || '?' }) })
    } catch (e) {
      setCheck({ ok: false, text: e?.message || t('hosting.key.checkFailed') })
    } finally { setChecking(false) }
  }

  async function issue() {
    setBusy(true); setError('')
    try {
      const res = await siteApi(siteId).reissueConnectionKey()
      setIssued(res.pairing)
      setConfirming(false)
    } catch (e) {
      setError(e?.message || t('hosting.key.failed'))
      setConfirming(false)
    } finally { setBusy(false) }
  }

  if (role === 'viewer') return null
  return (
    <div className="gd-card gd-card--e-sm gd-card--p-md" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{t('hosting.key.title')}</div>
      <p style={hint}>{t('hosting.key.hint')}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
        {check && <span role={check.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, lineHeight: 1.9, color: check.ok ? 'var(--gd-success)' : 'var(--gd-danger-text)' }}>{check.text}</span>}
        <Button variant="secondary" size="sm" leftIcon="refresh-cw" loading={checking} onClick={verify}>{t('hosting.key.check')}</Button>
      </div>

      {!owner ? null : issued ? (
        <div style={{ marginTop: 12 }}>
          <p role="status" style={{ ...hint, color: 'var(--gd-warning-text, var(--gd-text))', fontWeight: 600 }}>{t('hosting.key.once')}</p>
          <CopyRow label={t('hosting.key.serverUrl')} value={issued.serverUrl} />
          <CopyRow label={t('hosting.key.secret')} value={issued.secret} />
          <p style={hint}>{t('hosting.key.next')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
          {error && <span role="alert" style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{error}</span>}
          <Button variant="secondary" size="sm" leftIcon="key-round" onClick={() => { setError(''); setConfirming(true) }}>{t('hosting.key.action')}</Button>
        </div>
      )}

      <Dialog
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        icon="alert-triangle"
        iconTone="warning"
        title={t('hosting.key.confirmTitle')}
        desc={t('hosting.key.confirmDesc')}
        footer={(
          <>
            <Button variant="secondary" size="md" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" size="md" loading={busy} onClick={issue}>{t('hosting.key.confirm')}</Button>
          </>
        )}
      />
    </div>
  )
}

function CopyRow({ label, value }) {
  // "Copied" only after the clipboard promise resolved; the value stays selectable either way.
  const [state, setState] = useState('idle')
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(value)
      setState('ok')
    } catch { setState('failed') }
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={mono}>{value}</code>
        <Button variant="secondary" size="sm" leftIcon={state === 'ok' ? 'check' : 'copy'} onClick={copy}>
          {state === 'ok' ? t('hosting.key.copied') : state === 'failed' ? t('hosting.key.copyFailed') : t('hosting.key.copy')}
        </Button>
      </div>
    </div>
  )
}

const hint = { fontSize: 11.5, color: 'var(--gd-text-muted)', margin: '6px 0 0', lineHeight: 1.9 }
const mono = {
  flex: 1, minWidth: 0, display: 'block', fontFamily: 'var(--gd-font-mono)', fontSize: 12,
  background: 'var(--gd-bg-inset)', padding: '9px 12px', borderRadius: 'var(--gd-radius-sm)',
  overflowX: 'auto', direction: 'ltr', wordBreak: 'break-all',
}
