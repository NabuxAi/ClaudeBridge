import { useEffect, useState, useCallback } from 'react'
import PageHead from '../../layouts/PageHead.jsx'
import Icon from '../../lib/icons.jsx'
import { Button, AlertCard, Toast, Input } from '../../components/index.js'
import { account as accountApi, setToken, ApiError } from '../../lib/api.js'
import { t, date, dateTime } from '../../lib/i18n.js'

const fmtDateTime = (ts) => dateTime(ts, { dateStyle: 'short', timeStyle: 'short' })
const fmtDate = (ts) => date(ts)

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

/**
 * «کلاینت‌های هوش مصنوعی (MCP)» — یک نشانی برای همهٔ سایت‌ها، مثل WPVibe.
 * توکن فقط یک بار، همان لحظهٔ ساخت، نشان داده می‌شود؛ سرور فقط هش آن را دارد.
 * سیاست اجرا سمت سرور است (routes/hub-mcp.js)، نه این صفحه.
 */
function McpSection({ showToast }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fresh, setFresh] = useState(null)
  const [revoking, setRevoking] = useState({})

  const load = useCallback(() => {
    accountApi.mcpTokens()
      .then((d) => { setData(d); setLoadError(null) })
      .catch((e) => {
        if (!handleSessionGone(e)) setLoadError(describeApiError(e, t('accountSecurity.mcp.loadError'), t('accountSecurity.mcp.loadNotFound')))
      })
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const made = await accountApi.createMcpToken(name.trim())
      setFresh(made)
      setName('')
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
          <form onSubmit={create} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 12px' }}>
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accountSecurity.mcp.namePlaceholder')} maxLength={80} aria-label={t('accountSecurity.mcp.namePlaceholder')} />
            </span>
            <Button variant="secondary" size="sm" leftIcon="key-round" loading={busy} type="submit">{t('accountSecurity.mcp.create')}</Button>
          </form>
        )}
        {err && <div role="alert" style={{ color: 'var(--gd-danger, #c0392b)', marginBottom: 10 }}>{err}</div>}

        {data && data.tokens.length === 0 && <div>{t('accountSecurity.mcp.none')}</div>}
        {data?.tokens?.map((tok) => (
          <div key={tok.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--gd-border)' }}>
            <Icon name="key-round" size={15} />
            <span style={{ fontWeight: 600, color: 'var(--gd-text-primary)', overflowWrap: 'anywhere' }}>{tok.name}</span>
            <span style={{ fontSize: 12 }}>
              {t('accountSecurity.mcp.created', { when: fmtDate(tok.createdAt) })}
              {' · '}
              {tok.lastUsedAt ? t('accountSecurity.mcp.lastUsed', { when: fmtDateTime(tok.lastUsedAt) }) : t('accountSecurity.mcp.neverUsed')}
            </span>
            <span style={{ marginInlineStart: 'auto' }}>
              <Button variant="ghost" size="sm" leftIcon="trash-2" loading={!!revoking[tok.id]} onClick={() => revoke(tok)} type="button">
                {t('accountSecurity.mcp.revoke')}
              </Button>
            </span>
          </div>
        ))}
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
      {toast && (
        <div style={{ position: 'fixed', insetInlineEnd: 20, bottom: 20, zIndex: 100 }}>
          <Toast tone={toast.tone} title={toast.title} />
        </div>
      )}
    </>
  )
}
