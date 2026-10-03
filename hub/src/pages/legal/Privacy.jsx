import Icon from '../../lib/icons.jsx'
import { Link } from 'react-router-dom'
import Trans from '../../components/Trans.jsx'
import { t, date } from '../../lib/i18n.js'

// Draft privacy policy. No final legal review has happened yet — the banner
// says exactly that. Everything below describes data flows that actually
// exist in the code (AGENTS.md, docs/PRIVACY.md): scrypt password hashing
// (server/src/auth.js), once-only pairing secrets, the external services in
// server/src/intel and the plugin, the server-side revocable 7-day session
// (server/src/sessions.store.js), TOTP two-factor state (two_factor /
// two_factor_recovery tables), browser-push subscriptions
// (server/src/push.store.js), the account-deletion flow that purges them
// (server/src/routes/account.js), and the service worker that caches no
// dashboard data. Nothing is promised that the product does not do — and no
// limitation is claimed that the product has already closed.

// The draft's revision date (10 Mehr 1405); rendered in the reader's calendar.
const UPDATED = new Date(2026, 9, 2)

const list = (key) => { const v = t(key); return Array.isArray(v) ? v : [] }

export default function Privacy() {
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
          {t('privacy.draftBanner')}
        </div>
      </div>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '44px 24px 72px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', margin: 0, lineHeight: 1.3 }}>
          {t('privacy.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gd-text-muted)', margin: '10px 0 0' }}>
          {t('privacy.updated', { date: date(UPDATED, { year: 'numeric', month: 'long', day: 'numeric' }) })}
        </p>

        <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: '22px 0 0' }}>
          {t('privacy.intro')}
        </p>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>{t('privacy.collected.title')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list('privacy.collected.items').map((c) => (
              <div
                key={c.t}
                style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px' }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{c.t}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>{t('privacy.external.title')}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: '0 0 12px' }}>
            {t('privacy.external.intro')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list('privacy.external.items').map((c) => (
              <div
                key={c.t}
                style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px' }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="globe" size={14} style={{ color: 'var(--gd-text-muted)', flex: '0 0 auto' }} />
                  {c.t}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 12px' }}>{t('privacy.notSent.title')}</h2>
          <ul style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list('privacy.notSent.items').map((item) => (
              <li key={item.slice(0, 24)} style={{ fontSize: 14.5, lineHeight: 1.95, color: 'var(--gd-text-secondary)' }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>{t('privacy.retention.title')}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: 0 }}>
            <Trans k="privacy.retention.body" components={{ link: (c) => <Link to="/terms" style={{ color: 'var(--gd-primary)', fontWeight: 700 }}>{c}</Link> }} />
          </p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>{t('privacy.security.title')}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: 0 }}>
            {t('privacy.security.body')}
          </p>
        </section>

        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>{t('privacy.changes.title')}</h2>
          <p style={{ fontSize: 14.5, lineHeight: 2, color: 'var(--gd-text-secondary)', margin: 0 }}>
            {t('privacy.changes.body')}
          </p>
        </section>

        <div
          style={{
            marginTop: 36, display: 'flex', alignItems: 'flex-start', gap: 9,
            fontSize: 13.5, lineHeight: 1.9, color: 'var(--gd-warning-text)',
            background: 'var(--gd-warning-bg)', border: '1px solid var(--gd-warning-border)',
            borderRadius: 'var(--gd-radius-lg)', padding: '14px 18px',
          }}
        >
          <Icon name="alert-triangle" size={16} style={{ flex: '0 0 auto', marginTop: 4 }} />
          <span>{t('privacy.draftFooter')}</span>
        </div>
      </article>
    </div>
  )
}
