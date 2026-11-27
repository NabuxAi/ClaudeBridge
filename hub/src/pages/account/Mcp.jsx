import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, AlertCard, Toast, Input, Checkbox, Dialog, Select, Textarea } from '../../components/index.js'
import { account as accountApi, setToken, ApiError } from '../../lib/api.js'
import { t, date, dateTime, digits } from '../../lib/i18n.js'

const fmtDateTime = (ts) => dateTime(ts, { dateStyle: 'short', timeStyle: 'short' })
const fmtDate = (ts) => date(ts)
const parsePaths = (paths) => paths.split(/\r?\n/).map((path) => path.trim()).filter(Boolean)
const defaultEditHours = '24'
const editDurationOptions = () => [24, 48, 72].map((hours) => ({
  value: String(hours),
  label: t('accountSecurity.mcp.editWindowHours', { hours: digits(hours) }),
}))

function describeApiError(e, fallback, notFound) {
  if (e instanceof ApiError) {
    if (e.status === 404 && (!e.message || e.message === 'Not Found')) return notFound
    if (e.message) return e.message
  }
  return fallback
}

/** A revoked session mid-page goes the global 401 way: clear token, back to login. */
function handleSessionGone(e) {
  if (e instanceof ApiError && e.status === 401) {
    sessionStorage.setItem('loginReturnTo', '/app/mcp')
    setToken('')
    window.location.replace('/login')
    return true
  }
  return false
}

/** مقدار در یک فیلد فقط‌خواندنی LTR، با دکمهٔ کپی — برای secret و otpauth URI. */
function SecretField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API همه‌جا در دسترس نیست (مثلاً بدون HTTPS)؛ کاربر همچنان
      // می‌تواند متن را از فیلد فقط‌خواندنی دستی انتخاب و کپی کند.
    }
  }
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--gd-text-secondary)', marginBottom: 6 }}>{label}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          readOnly
          value={value}
          dir="ltr"
          onFocus={(e) => e.target.select()}
          style={{
            flex: 1, minWidth: 0, fontFamily: 'var(--gd-font-mono)', fontSize: 12,
            padding: '8px 10px', borderRadius: 'var(--gd-radius-md)',
            border: '1px solid var(--gd-border)', background: 'var(--gd-bg-subtle)',
            color: 'var(--gd-text-primary)', overflowWrap: 'anywhere',
          }}
        />
        <Button variant="ghost" size="sm" leftIcon={copied ? 'check' : 'copy'} onClick={copy} type="button">
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </span>
    </label>
  )
}

function EditWindowDialog({ token, initialSite, ownedSites, sitesError, loadOwnedSites, onClose, onStarted }) {
  const [siteId, setSiteId] = useState(token.siteScope || initialSite)
  const [scope, setScope] = useState(token.siteScope ? 'all' : 'paths')
  const [paths, setPaths] = useState('')
  const [hours, setHours] = useState(defaultEditHours)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const siteChoices = token.siteScope ? ownedSites?.filter((site) => site.id === token.siteScope) : ownedSites
  const validSite = siteChoices?.some((site) => site.id === siteId)
  const allFiles = scope === 'all'
  const canStart = validSite && !sitesError && (allFiles || paths.trim())

  const start = async (e) => {
    e.preventDefault()
    if (busy || !canStart) return
    setBusy(true)
    setErr('')
    try {
      const fileScope = allFiles ? { allFiles: true } : { paths: parsePaths(paths) }
      const { editWindow } = await accountApi.startMcpEditWindow(token.id, { siteId, ...fileScope, hours: Number(hours) })
      if (!editWindow) throw new Error(t('accountSecurity.mcp.editWindowError'))
      onStarted(token.id, editWindow)
    } catch (e2) {
      if (!handleSessionGone(e2)) setErr(describeApiError(e2, t('accountSecurity.mcp.editWindowError'), t('accountSecurity.mcp.loadNotFound')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={() => { if (!busy) onClose() }}
      title={t('accountSecurity.mcp.editWindowTitle', { name: token.name })}
      desc={t('accountSecurity.mcp.editWindowHint')}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose} type="button">{t('common.cancel')}</Button>
        <Button loading={busy} disabled={!canStart} type="submit" form="mcp-window-form">
          {t('accountSecurity.mcp.startEditWindow')}
        </Button>
      </>}>
      <form id="mcp-window-form" onSubmit={start} style={{ display: 'grid', gap: 12 }}>
        {sitesError && (
          <div role="alert">
            {t('accountSecurity.mcp.directSiteError')}{' '}
            <Button variant="ghost" size="sm" onClick={loadOwnedSites} type="button">{t('common.retry')}</Button>
          </div>
        )}
        {!ownedSites && !sitesError && <div role="status">{t('common.loading')}</div>}
        {siteChoices?.length === 0 && <div>{t(token.siteScope ? 'accountSecurity.mcp.boundSiteUnavailable' : 'accountSecurity.mcp.noOwnedSites')}</div>}
        {siteChoices?.length > 0 && (
          <Select id="mcp-window-site" label={t('accountSecurity.mcp.directSite')} required disabled={busy || Boolean(token.siteScope)}
            value={validSite ? siteId : ''} onChange={(e) => setSiteId(e.target.value)}
            options={[{ value: '', label: t('accountSecurity.mcp.chooseDirectSite') },
              ...siteChoices.map((site) => ({ value: site.id, label: site.title || site.name }))]} />
        )}
        <Select id="mcp-window-scope" label={t('accountSecurity.mcp.editWindowScope')} disabled={busy}
          value={scope} onChange={(e) => setScope(e.target.value)} options={[
            { value: 'paths', label: t('accountSecurity.mcp.editWindowScopePaths') },
            { value: 'all', label: t('accountSecurity.mcp.editWindowScopeAll') },
          ]} />
        {allFiles ? <p style={{ margin: 0 }}>{t('accountSecurity.mcp.editWindowAllHint')}</p> : (
          <Textarea id="mcp-window-paths" label={t('accountSecurity.mcp.directPaths')} required disabled={busy} dir="ltr"
            value={paths} onChange={(e) => setPaths(e.target.value)} placeholder="plugins/my-plugin/main.php" />
        )}
        <Select id="mcp-window-hours" label={t('accountSecurity.mcp.editWindowDuration')} disabled={busy}
          value={hours} onChange={(e) => setHours(e.target.value)} options={editDurationOptions()} />
        {err && <div role="alert" className="pbk-note pbk-note--danger">{err}</div>}
      </form>
    </Dialog>
  )
}

/**
 * «کلاینت‌های هوش مصنوعی (MCP)» — یک نشانی برای همهٔ سایت‌ها، مثل WPVibe.
 * توکن فقط یک بار، همان لحظهٔ ساخت، نشان داده می‌شود؛ سرور فقط هش آن را دارد.
 * سیاست اجرا سمت سرور است (routes/hub-mcp.js)، نه این صفحه.
 */
function McpSection({ showToast }) {
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [name, setName] = useState('')
  const [ownedSites, setOwnedSites] = useState(null)
  const [sitesError, setSitesError] = useState(false)
  const [directEdit, setDirectEdit] = useState(false)
  const [editSite, setEditSite] = useState('')
  const [editScope, setEditScope] = useState('paths')
  const [editHours, setEditHours] = useState(defaultEditHours)
  const [paths, setPaths] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fresh, setFresh] = useState(null)
  const [revoking, setRevoking] = useState({})
  const [windowToken, setWindowToken] = useState(null)
  const [endingWindow, setEndingWindow] = useState('')
  const allFiles = editScope === 'all'
  const canCreate = !directEdit || (!sitesError && ownedSites?.length > 0)

  const load = useCallback(() => {
    accountApi.mcpTokens()
      .then((d) => { setData(d); setLoadError(null) })
      .catch((e) => {
        if (!handleSessionGone(e)) setLoadError(describeApiError(e, t('accountSecurity.mcp.loadError'), t('accountSecurity.mcp.loadNotFound')))
      })
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const expiry = Math.min(...(data?.tokens || []).map((tok) => tok.editWindow?.expiresAt || Infinity))
    if (!Number.isFinite(expiry)) return
    const timer = setTimeout(() => {
      const now = Date.now()
      setData((current) => ({
        ...current,
        tokens: current.tokens.map((tok) => tok.editWindow?.expiresAt <= now ? { ...tok, editWindow: null } : tok),
      }))
    }, Math.max(0, expiry - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [data])

  const loadOwnedSites = () => {
    setSitesError(false)
    accountApi.sites()
      .then((rows) => setOwnedSites(rows.filter((site) => site.role === 'owner' && site.status !== 'deleted')))
      .catch((e) => { if (!handleSessionGone(e)) setSitesError(true) })
  }

  const create = async (e) => {
    e.preventDefault()
    if (busy || !canCreate) return
    setBusy(true)
    setErr('')
    try {
      let fileEdit
      if (directEdit) {
        fileEdit = allFiles
          ? { siteId: editSite, allFiles: true, hours: Number(editHours) }
          : { siteId: editSite, paths: parsePaths(paths) }
      }
      const made = await accountApi.createMcpToken(name.trim(), fileEdit)
      setFresh(made)
      setName('')
      setDirectEdit(false)
      setEditSite('')
      setEditScope('paths')
      setEditHours(defaultEditHours)
      setPaths('')
      load()
    } catch (e2) {
      if (!handleSessionGone(e2)) setErr(describeApiError(e2, t('accountSecurity.mcp.createError'), t('accountSecurity.mcp.loadNotFound')))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (tok) => {
    if (!window.confirm(t('accountSecurity.mcp.confirmRevoke'))) return
    setRevoking((r) => ({ ...r, [tok.id]: true }))
    try {
      await accountApi.revokeMcpToken(tok.id)
      if (fresh?.record?.id === tok.id) setFresh(null)
      showToast(t('accountSecurity.mcp.revoked'))
      load()
    } catch (e) {
      if (!handleSessionGone(e)) setErr(describeApiError(e, t('accountSecurity.mcp.revokeError'), t('accountSecurity.mcp.loadNotFound')))
    } finally {
      setRevoking((r) => ({ ...r, [tok.id]: false }))
    }
  }

  const mcpUrl = fresh?.mcpUrl || data?.mcpUrl || ''

  const updateWindow = (id, editWindow) => {
    setData((current) => ({
      ...current,
      tokens: current.tokens.map((tok) => tok.id === id ? { ...tok, editWindow } : tok),
    }))
  }
  const endWindow = async (tok) => {
    setEndingWindow(tok.id)
    setErr('')
    try {
      const result = await accountApi.endMcpEditWindow(tok.id, tok.editWindow.expiresAt)
      if (!result?.ok) throw new Error(t('accountSecurity.mcp.editWindowError'))
      updateWindow(tok.id, null)
      showToast(t('accountSecurity.mcp.editWindowEnded'))
    } catch (e) {
      if (!handleSessionGone(e)) {
        setErr(describeApiError(e, t('accountSecurity.mcp.editWindowError'), t('accountSecurity.mcp.loadNotFound')))
        load()
      }
    } finally {
      setEndingWindow('')
    }
  }

  return (
    <div className="dwp-card" style={{ marginBottom: 22 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="bot" size={17} /> {t('accountSecurity.mcp.title')}
      </div>
      <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gd-text-secondary)', lineHeight: 1.9 }}>
        <p style={{ marginTop: 0 }}>{t('accountSecurity.mcp.intro')}</p>

        {loadError && (
          <AlertCard severity="critical" title={t('accountSecurity.error')} desc={loadError}
            actions={<Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={load} type="button">{t('common.retry')}</Button>} />
        )}

        {mcpUrl && <SecretField label={t('accountSecurity.mcp.urlLabel')} value={mcpUrl} />}

        {fresh && (
          <div style={{ border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '12px 14px', margin: '8px 0 14px' }}>
            <div style={{ fontWeight: 700, color: 'var(--gd-text-primary)', marginBottom: 8 }}>{t('accountSecurity.mcp.newTokenTitle')}</div>
            <SecretField label={t('accountSecurity.mcp.tokenLabel')} value={fresh.token} />
            <SecretField label={t('accountSecurity.mcp.urlWithTokenLabel')} value={`${fresh.mcpUrl}?token=${fresh.token}`} />
            <div style={{ fontSize: 12 }}>{t('accountSecurity.mcp.urlWithTokenWarning')}</div>
          </div>
        )}

        {!loadError && (
          <form onSubmit={create} style={{ display: 'grid', gap: 10, margin: '4px 0 12px' }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accountSecurity.mcp.namePlaceholder')} maxLength={80} aria-label={t('accountSecurity.mcp.namePlaceholder')} />
            <Checkbox checked={directEdit} disabled={busy} aria-describedby={directEdit ? 'mcp-edit-help' : undefined}
              label={t('accountSecurity.mcp.directEdit')}
              onChange={(e) => {
                setDirectEdit(e.target.checked)
                if (e.target.checked && !ownedSites) loadOwnedSites()
              }} />
            {directEdit && (
              <>
                <p id="mcp-edit-help" style={{ margin: 0 }}>{t('accountSecurity.mcp.directEditHint')}</p>
                {sitesError && (
                  <div role="alert">
                    {t('accountSecurity.mcp.directSiteError')}{' '}
                    <Button variant="ghost" size="sm" onClick={loadOwnedSites} type="button">{t('common.retry')}</Button>
                  </div>
                )}
                {!ownedSites && !sitesError && <div role="status">{t('common.loading')}</div>}
                {ownedSites && ownedSites.length === 0 && <p style={{ margin: 0 }}>{t('accountSecurity.mcp.noOwnedSites')}</p>}
                {ownedSites?.length > 0 && (
                  <>
                    <Select id="mcp-edit-site" label={t('accountSecurity.mcp.directSite')} required disabled={busy}
                      value={editSite} onChange={(e) => setEditSite(e.target.value)}
                      options={[{ value: '', label: t('accountSecurity.mcp.chooseDirectSite') },
                        ...ownedSites.map((site) => ({ value: site.id, label: site.title || site.name }))]} />
                    <Select id="mcp-edit-scope" label={t('accountSecurity.mcp.editWindowScope')} disabled={busy}
                      value={editScope} onChange={(e) => setEditScope(e.target.value)} options={[
                        { value: 'paths', label: t('accountSecurity.mcp.editWindowScopePaths') },
                        { value: 'all', label: t('accountSecurity.mcp.directEditScopeAll') },
                      ]} />
                    {allFiles ? (
                      <>
                        <p id="mcp-edit-all-help" style={{ margin: 0 }}>{t('accountSecurity.mcp.editWindowAllHint')}</p>
                        <Select id="mcp-edit-hours" label={t('accountSecurity.mcp.editWindowDuration')} disabled={busy}
                          aria-describedby="mcp-edit-all-help" value={editHours} onChange={(e) => setEditHours(e.target.value)}
                          options={editDurationOptions()} />
                      </>
                    ) : (
                      <Textarea id="mcp-edit-paths" label={t('accountSecurity.mcp.directPaths')} required disabled={busy} dir="ltr"
                        value={paths} onChange={(e) => setPaths(e.target.value)} placeholder="plugins/my-plugin/main.php" />
                    )}
                  </>
                )}
              </>
            )}
            <div>
              <Button variant="secondary" size="sm" leftIcon="key-round" loading={busy} type="submit"
                disabled={!canCreate}>{t('accountSecurity.mcp.create')}</Button>
            </div>
          </form>
        )}
        {err && <div role="alert" style={{ color: 'var(--gd-danger, #c0392b)', marginBottom: 10 }}>{err}</div>}

        {windowToken && (
          <EditWindowDialog token={windowToken} initialSite={params.get('site') || ''} ownedSites={ownedSites}
            sitesError={sitesError} loadOwnedSites={loadOwnedSites} onClose={() => setWindowToken(null)}
            onStarted={(id, grant) => {
              updateWindow(id, grant)
              setWindowToken(null)
              showToast(t('accountSecurity.mcp.editWindowStarted'))
            }} />
        )}
        {data && data.tokens.length === 0 && <div>{t('accountSecurity.mcp.none')}</div>}
        {data?.tokens?.map((tok) => {
          const scope = tok.fileEdit || tok.editWindow
          return (
            <div key={tok.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--gd-border)' }}>
              <Icon name="key-round" size={15} />
              <span style={{ fontWeight: 600, color: 'var(--gd-text-primary)', overflowWrap: 'anywhere' }}>{tok.name}</span>
              <span style={{ fontSize: 12 }}>
                {t('accountSecurity.mcp.created', { when: fmtDate(tok.createdAt) })}
                {' · '}
                {tok.lastUsedAt ? t('accountSecurity.mcp.lastUsed', { when: fmtDateTime(tok.lastUsedAt) }) : t('accountSecurity.mcp.neverUsed')}
              </span>
              {scope?.paths && (
                <details style={{ flex: '1 1 240px', overflowWrap: 'anywhere' }}>
                  <summary>{t('accountSecurity.mcp.scopedToken', { site: scope.siteId })}</summary>
                  <ul dir="ltr" style={{ marginBlock: 4, textAlign: 'start' }}>
                    {scope.paths.map((path) => <li key={path}>{path}</li>)}
                  </ul>
                </details>
              )}
              {tok.editWindow?.paths === null && <span>{t('accountSecurity.mcp.allEditableFiles', { site: tok.editWindow.siteId })}</span>}
              {tok.editWindow && <span>{t('accountSecurity.mcp.editWindowEnds', { when: fmtDateTime(tok.editWindow.expiresAt) })}</span>}
              {!scope && tok.siteScope && <span>{t('accountSecurity.mcp.tokenBoundSite', { site: tok.siteScope })}</span>}
              <span style={{ marginInlineStart: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {!tok.fileEdit && (tok.editWindow ? (
                  <Button variant="secondary" size="sm" loading={endingWindow === tok.id} disabled={Boolean(endingWindow) || !!revoking[tok.id]}
                    onClick={() => endWindow(tok)} type="button">{t('accountSecurity.mcp.endEditWindow')}</Button>
                ) : (
                  <Button variant="secondary" size="sm" disabled={Boolean(endingWindow) || !!revoking[tok.id]}
                    onClick={() => {
                      setWindowToken(tok)
                      if (!ownedSites) loadOwnedSites()
                    }} type="button">{t('accountSecurity.mcp.editWindow')}</Button>
                ))}
                <Button variant="ghost" size="sm" leftIcon="trash-2" loading={!!revoking[tok.id]} onClick={() => revoke(tok)} type="button">
                  {t('accountSecurity.mcp.revoke')}
                </Button>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}


const REGION_KEY = { intl: 'sites.reach.server.intl', ir: 'sites.reach.server.ir' }
const regionName = (r) => t(REGION_KEY[r] || 'sites.reach.server.peer')

/**
 * Link this account with one on the partner server, so one MCP token reaches
 * the sites of both. Proof is a short code made while signed in there and
 * typed here (server: peer-link.js). Same email alone is never enough.
 */
function PeerLinkSection({ showToast }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [code, setCode] = useState(null)
  const [entry, setEntry] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    accountApi.peerLink()
      .then((d) => { setData(d); setLoadError('') })
      .catch((e) => { if (!handleSessionGone(e)) setLoadError(describeApiError(e, t('accountSecurity.peer.loadError'), t('accountSecurity.peer.loadError'))) })
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (what, fn) => {
    setBusy(what); setErr('')
    try { await fn() } catch (e) {
      if (!handleSessionGone(e)) setErr(describeApiError(e, t('accountSecurity.peer.failed'), t('accountSecurity.peer.failed')))
    } finally { setBusy('') }
  }

  const makeCode = () => run('code', async () => setCode(await accountApi.peerLinkCode()))
  const redeem = (e) => {
    e.preventDefault()
    run('redeem', async () => {
      await accountApi.peerLinkRedeem(entry.trim())
      setEntry(''); setCode(null)
      showToast(t('accountSecurity.peer.linkedToast'))
      load()
    })
  }
  const unlink = () => {
    if (!window.confirm(t('accountSecurity.peer.confirmUnlink'))) return
    run('unlink', async () => { await accountApi.peerUnlink(); showToast(t('accountSecurity.peer.unlinkedToast')); load() })
  }

  if (data && !data.enabled) return null
  const other = data ? regionName(data.peerRegion) : ''

  return (
    <div className="dwp-card" style={{ marginTop: 22 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gd-border)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="link-2" size={17} /> {t('accountSecurity.peer.title')}
      </div>
      <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gd-text-secondary)', lineHeight: 1.9 }}>
        {loadError && <AlertCard severity="critical" title={t('accountSecurity.error')} desc={loadError}
          actions={<Button variant="secondary" size="sm" leftIcon="refresh-cw" onClick={load} type="button">{t('common.retry')}</Button>} />}
        {!data && !loadError && <div role="status">{t('common.loading')}</div>}

        {data?.link && (
          <>
            <p style={{ marginTop: 0 }}>{t('accountSecurity.peer.linked', { email: data.link.peerEmail, server: other, when: fmtDate(data.link.linkedAt) })}</p>
            <p>{t('accountSecurity.peer.linkedHint')}</p>
            <Button variant="ghost" size="sm" leftIcon="unlink" loading={busy === 'unlink'} onClick={unlink} type="button">{t('accountSecurity.peer.unlink')}</Button>
          </>
        )}

        {data && !data.link && (
          <>
            <p style={{ marginTop: 0 }}>{t('accountSecurity.peer.intro', { server: other })}</p>
            <ol style={{ paddingInlineStart: 20, margin: '0 0 14px' }}>
              <li>{t('accountSecurity.peer.step1', { server: other })}{data.peerPanelUrl && <> — <a href={`${data.peerPanelUrl}/app/mcp`} target="_blank" rel="noreferrer" dir="ltr">{data.peerPanelUrl.replace(/^https?:\/\//, '')}</a></>}</li>
              <li>{t('accountSecurity.peer.step2')}</li>
            </ol>
            <form onSubmit={redeem} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Input value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="ABCDE-FGHJK" maxLength={16} dir="ltr"
                  aria-label={t('accountSecurity.peer.codeLabel')} autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} />
              </span>
              <Button variant="primary" size="sm" leftIcon="link-2" loading={busy === 'redeem'} type="submit" disabled={!entry.trim()}>{t('accountSecurity.peer.redeem')}</Button>
            </form>
            <div style={{ borderTop: '1px solid var(--gd-border)', paddingTop: 12 }}>
              <p style={{ margin: '0 0 8px' }}>{t('accountSecurity.peer.orMake', { server: other })}</p>
              {code ? (
                <div>
                  <SecretField label={t('accountSecurity.peer.codeLabel')} value={code.code} />
                  <div style={{ fontSize: 12 }}>{t('accountSecurity.peer.codeExpires', { when: fmtDateTime(code.expiresAt) })}</div>
                </div>
              ) : (
                <Button variant="secondary" size="sm" leftIcon="key-round" loading={busy === 'code'} onClick={makeCode} type="button">{t('accountSecurity.peer.makeCode')}</Button>
              )}
            </div>
          </>
        )}
        {err && <div role="alert" style={{ color: 'var(--gd-danger, #c0392b)', marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  )
}

export default function Mcp() {
  const [toast, setToast] = useState(null)
  const showToast = (title, tone = 'success') => {
    setToast({ title, tone })
    setTimeout(() => setToast(null), 2500)
  }
  return (
    <>
      <PageHead title={t('accountSecurity.mcp.pageTitle')} subtitle={t('accountSecurity.mcp.pageSubtitle')} />
      <McpSection showToast={showToast} />
      <PeerLinkSection showToast={showToast} />
      {toast && (
        <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 100 }}>
          <Toast tone={toast.tone} title={toast.title} />
        </div>
      )}
    </>
  )
}
