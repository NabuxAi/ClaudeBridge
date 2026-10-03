import { Link, Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import { Button } from '../components/index.js'
import Icon from '../lib/icons.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import { t, date } from '../lib/i18n.js'

// Copyright year: the year this bundle loaded, in the reader's calendar.
const BUILD_TIME = Date.now()

export default function MarketingLayout() {
  return (
    <div style={{ background: 'var(--gd-bg-surface)', color: 'var(--gd-text)' }}>
      <header className="dwp-mkt-nav">
        <div className="dwp-container dwp-mkt-nav__inner">
          <Brand />
          <span className="dwp-spacer" />
          <nav className="dwp-mkt-links">
            <a href="#features">{t('layout.mkt.features')}</a>
            <a href="#authority">{t('layout.mkt.authority')}</a>
            <Link to="/pricing">{t('layout.mkt.pricing')}</Link>
          </nav>
          <LanguageSwitcher />
          <span className="dwp-desktop-only" style={{ width: 1, height: 24, background: 'var(--gd-border)' }} />
          <Button as={Link} to="/login" variant="ghost" size="sm">{t('layout.mkt.login')}</Button>
          <Button as={Link} to="/register" variant="primary" size="sm">{t('layout.mkt.register')}</Button>
        </div>
      </header>

      <Outlet />

      <footer className="dwp-footer">
        <div className="dwp-container" style={{ padding: '40px', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 24 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="dwp-brandmark" style={{ width: 32, height: 32, borderRadius: 9 }}><Icon name="shield-check" size={18} /></span>
              <span style={{ fontWeight: 800, fontSize: 15 }}>Digi<b style={{ color: 'var(--gd-primary)' }}>WP</b></span>
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.75, color: 'var(--gd-text-muted)', margin: 0, maxWidth: 230 }}>
              {t('layout.footer.blurb')}
            </p>
          </div>
          {[
            { h: t('layout.footer.product'), links: [{ t: t('layout.mkt.features') }, { t: t('layout.mkt.authority') }, { t: t('layout.mkt.pricing') }] },
            { h: t('layout.footer.company'), links: [{ t: t('layout.footer.about') }, { t: t('layout.footer.blog') }, { t: t('layout.footer.contact') }] },
            {
              h: t('layout.footer.support'),
              links: [
                { t: t('layout.footer.guide') },
                { t: t('layout.footer.status') },
                { t: t('layout.footer.privacy'), to: '/privacy' },
                { t: t('layout.footer.terms'), to: '/terms' },
              ],
            },
          ].map((c) => (
            <div key={c.h}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{c.h}</div>
              {/* Only labels with a real destination become links (the draft
                  /terms and /privacy pages); everything else stays plain text,
                  not a dead "#" anchor. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, color: 'var(--gd-text-muted)' }}>
                {c.links.map((l) => l.to
                  ? <Link key={l.t} to={l.to} style={{ color: 'inherit', textDecoration: 'none' }}>{l.t}</Link>
                  : <span key={l.t}>{l.t}</span>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--gd-border)' }}>
          <div className="dwp-container" style={{ padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--gd-text-muted)' }}>
            <span>{t('layout.footer.copyright', { year: date(BUILD_TIME, { year: 'numeric' }) })}</span>
            <span className="dwp-mono">ai.digiwp.com</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
