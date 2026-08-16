import { useEffect, useState, useCallback } from 'react'
import Icon from '../lib/icons.jsx'
import { auth as authApi } from '../lib/api.js'

/**
 * The math challenge.
 *
 * Deliberately plain: a readable question in normal text, not an image. An
 * image captcha excludes people using a screen reader, and the arithmetic here
 * is not trying to be unsolvable by a program — the rate limiter does that
 * work. This is the cheap first filter that makes scripted hammering cost a
 * round trip per attempt.
 *
 * The challenge is single-use on the server, so a failed submit needs a fresh
 * one. The parent signals that by bumping `refreshKey` rather than this
 * component guessing, because only the parent knows whether the request failed
 * for a captcha reason or some other one.
 */
export default function Captcha({ value, onChange, onReady, refreshKey = 0, error }) {
  const [challenge, setChallenge] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setFailed('')
    try {
      const c = await authApi.captcha()
      setChallenge(c)
      onReady?.(c.id)
      onChange?.('')
    } catch (e) {
      setFailed(e?.message || 'سؤال امنیتی بارگذاری نشد.')
    } finally {
      setLoading(false)
    }
  }, [onReady, onChange])

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setFailed('')
    authApi.captcha()
      .then((c) => {
        if (!alive) return
        setChallenge(c)
        onReady?.(c.id)
        onChange?.('')
      })
      .catch((e) => { if (alive) setFailed(e?.message || 'سؤال امنیتی بارگذاری نشد.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [refreshKey, onReady, onChange])

  if (failed) {
    return (
      <div style={box}>
        <span style={{ fontSize: 12.5, color: 'var(--gd-danger-text)' }}>{failed}</span>
        <button type="button" onClick={load} style={linkBtn}>تلاش دوباره</button>
      </div>
    )
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 7 }}>
        سؤال امنیتی
      </label>
      <div style={box}>
        <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--gd-font-mono)', minWidth: 84 }}>
          {loading ? '…' : challenge?.question}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="پاسخ"
          aria-label={challenge?.question || 'سؤال امنیتی'}
          style={{
            flex: 1, minWidth: 70, padding: '9px 12px', fontSize: 14,
            borderRadius: 'var(--gd-radius-md)', border: '1px solid var(--gd-border)',
            background: 'var(--gd-bg-surface)', fontFamily: 'inherit',
          }}
        />
        <button type="button" onClick={load} title="سؤال تازه" style={iconBtn} aria-label="سؤال تازه">
          <Icon name="refresh-cw" size={15} />
        </button>
      </div>
      {error && <div className="gd-field__msg gd-field__msg--error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  )
}

const box = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: 'var(--gd-bg-subtle)', border: '1px solid var(--gd-border-subtle)',
  borderRadius: 'var(--gd-radius-md)', padding: '8px 12px',
}

const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 'var(--gd-radius-md)',
  border: '1px solid var(--gd-border)', background: 'var(--gd-bg-surface)',
  color: 'var(--gd-text-secondary)', cursor: 'pointer', flex: '0 0 auto',
}

const linkBtn = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--gd-primary)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
}
