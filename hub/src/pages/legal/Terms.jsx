import Icon from '../../lib/icons.jsx'
import { t, date } from '../../lib/i18n.js'

// Draft terms of service. No final legal review has happened yet — the banner
// above the text says exactly that. Every claim below describes behavior that
// actually exists in the product (AGENTS.md, "honest current feature
// boundary" and "Product truth rules"): known limitations are listed, not
// hidden, and there is no invented company registration, address, email, or
// guarantee language.

// The draft's revision date (10 Mehr 1405); rendered in the reader's calendar.
const UPDATED = new Date(2026, 9, 2)

export default function Terms() {
  const sections = t('terms.sections')
  return (
    <div style={{ background: 'var(--gd-bg-app)', color: 'var(--gd-text)', minHeight: '60vh' }}>
      {/* Prominent draft banner — this page is NOT final legal text. */}
      <div
        role="note"
        style={{
          background: 'var(--gd-warning-bg)',
          borderBottom: '1px solid var(--gd-warning-border)',
          color: 'var(--gd-warning-text)',
        }}
      >
        <div
          className="dwp-container"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 24px', fontSize: 13.5, fontWeight: 700, textAlign: 'center',
          }}
        >
          <Icon name="alert-triangle" size={16} style={{ flex: '0 0 auto' }} />
          {t('terms.draftBanner')}
        </div>
      </div>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '44px 24px 72px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: 0, lineHeight: 1.3 }}>
          {t('terms.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '10px 0 0' }}>
          {t('terms.updated', { date: date(UPDATED, { year: 'numeric', month: 'long', day: 'numeric' }) })}
        </p>

        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {(Array.isArray(sections) ? sections : []).map((s) => (
            <section key={s.h}>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>{s.h}</h2>
              {(s.ps || []).map((p) => (
                <p key={p.slice(0, 24)} style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: '0 0 10px' }}>
                  {p}
                </p>
              ))}
              {s.list && (
                <ul style={{ margin: '0 0 10px', paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {s.list.map((item) => (
                    <li key={item.slice(0, 24)} style={{ fontSize: 14.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div
          style={{
            marginTop: 36, display: 'flex', alignItems: 'flex-start', gap: 9,
            fontSize: 13.5, lineHeight: 1.9, color: 'var(--gd-warning-text)',
            background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning-border)',
            borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px',
          }}
        >
          <Icon name="alert-triangle" size={16} style={{ flex: '0 0 auto', marginTop: 4 }} />
          <span>{t('terms.draftFooter')}</span>
        </div>
      </article>
    </div>
  )
}
