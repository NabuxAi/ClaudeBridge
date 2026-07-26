import Icon from '../lib/icons.jsx'

/**
 * Shown where a view has no real data source yet.
 *
 * The alternative — leaving the seed numbers in place — is worse than an empty
 * screen. A customer who later discovers that "1.8 GB backup verified" was
 * decoration stops believing the readings that ARE measured, including the ones
 * that would have told them their site was compromised.
 *
 * So an unbuilt feature says it is unbuilt.
 */
export function NotMeasured({ title, reason, icon = 'info' }) {
  return (
    <div
      style={{
        background: 'var(--gd-bg-subtle)',
        border: '1px dashed var(--gd-border-strong)',
        borderRadius: 'var(--gd-radius-lg)',
        padding: '26px 24px',
        textAlign: 'center',
      }}
    >
      <Icon name={icon} size={26} style={{ color: 'var(--gd-text-muted)' }} />
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>{title}</div>
      <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '8px auto 0', maxWidth: 460, lineHeight: 1.8 }}>
        {reason}
      </p>
      <p style={{ fontSize: 12, color: 'var(--gd-text-muted)', margin: '10px 0 0', opacity: 0.75 }}>
        اینجا عددی نشان نمی‌دهیم تا با دادهٔ واقعی اشتباه گرفته نشود.
      </p>
    </div>
  )
}

/**
 * A short line under a view naming the tools its numbers came from, and any
 * field still without a source. Provenance in the UI, not just in the docs.
 */
export function Provenance({ data }) {
  const p = data?.provenance
  if (!p) return null
  const partial = Object.entries(p.partial || {})
  if (!p.live?.length && !partial.length) return null

  return (
    <div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 14, lineHeight: 1.9 }}>
      {p.live?.length > 0 && (
        <div>
          <Icon name="check" size={12} style={{ verticalAlign: '-1px', marginLeft: 4, color: 'var(--gd-success)' }} />
          اندازه‌گیری‌شده از سایت: <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{p.live.join('، ')}</span>
        </div>
      )}
      {partial.map(([field, why]) => (
        <div key={field} style={{ opacity: 0.85 }}>
          <Icon name="minus" size={12} style={{ verticalAlign: '-1px', marginLeft: 4 }} />
          <span style={{ fontFamily: 'var(--gd-font-mono)' }}>{field}</span> — {why}
        </div>
      ))}
    </div>
  )
}
