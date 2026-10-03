import { Link } from 'react-router-dom'
import Icon from '../../lib/icons.jsx'
import { Button, StatusPill, AuthorityBadge } from '../../components/index.js'
import Trans from '../../components/Trans.jsx'
import { t, num, digits } from '../../lib/i18n.js'

// Six capability claims, each rewritten to what the product does. The old set
// promised 24-hour monitoring, contact-form and payment-gateway checks, host
// storage tracking, staging tests, automatic break-fix, mobile/desktop
// rendering tests, off-site backups with restore testing, image compression,
// Core Web Vitals, suspicious-login detection and attack blocking. None of
// those exist. Selling them is worse than showing them in the panel, because
// this is where the purchase decision is made.
//
// The "transparent report" sample below obeys the same rule: it shows a core
// integrity finding (a real daily check) with an honestly unknown cause and a
// rescue proposal that waits for the owner's approval. It deliberately does
// NOT show payment-page 500 detection or automatic plugin-version rollback —
// probes only cover homepage/wp-login and no file rollback path exists.
const FEATURES = [
  { icon: 'refresh-cw', key: 'updates' },
  { icon: 'shield-check', key: 'malware' },
  { icon: 'file-check-2', key: 'integrity' },
  { icon: 'database', key: 'backup' },
  { icon: 'git-branch', key: 'conflict' },
  { icon: 'shield-alert', key: 'rescue' },
]

const AUTH_LEVELS = [
  { level: 'report', icon: 'eye', tone: 'gray' },
  { level: 'confirm', icon: 'user-check', tone: 'warning' },
  { level: 'auto', icon: 'zap', tone: 'success' },
]

// Prices are monthly Toman amounts; num() localises the digits/grouping.
const PLANS = [
  { key: 'basic', price: 190000, popular: false, variant: 'secondary' },
  { key: 'pro', price: 490000, popular: true, variant: 'primary' },
  // No "گزارش روزانه در تلگرام" here: the daily digest goes to the operator's
  // fixed TELEGRAM_CHAT_ID, not to site owners (no owner Telegram channel
  // exists). And no "تماس با فروش" CTA: /pricing offers pilot access, not a
  // sales contact — the label must match what the destination actually does.
  { key: 'agency', price: 990000, popular: false, variant: 'secondary' },
]


export default function Landing() {
  return (
    <>
      {/* Hero (ink) — aurora backdrop feeds the glass panel (mapping §3.2/§3.5) */}
      <div data-theme="ink" className="dwp-hero-shell" style={{ background: 'var(--gd-bg-app)' }}>
        <div className="dwp-hero-backdrop" aria-hidden="true"><i /><i /><i /></div>
        <div className="dwp-container dwp-hero" style={{ paddingBlock: '66px 74px', display: 'grid', gap: 44, alignItems: 'center' }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--gd-primary)', background: 'var(--gd-primary-subtle)', border: '1px solid var(--gd-primary-border)', padding: '6px 13px', borderRadius: 'var(--gd-radius-pill)' }}>
              <Icon name="sparkles" size={14} /> {t('landing.hero.badge')}
            </span>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.25, fontWeight: 800, margin: '18px 0 0', color: 'var(--gd-text)' }}>
              <Trans k="landing.hero.title" components={{ hl: (c) => <span className="gd-gradient-text">{c}</span> }} />
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.85, color: 'var(--gd-text-secondary)', margin: '16px 0 0', maxWidth: 520 }}>
              {t('landing.hero.sub')}
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
              <Button as={Link} to="/register" variant="primary" size="lg" leftIcon="shield-check">{t('landing.hero.ctaRegister')}</Button>
              <Button as={Link} to="/pricing" variant="secondary" size="lg" rightIcon="arrow-left">{t('landing.hero.ctaPricing')}</Button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 22, fontSize: 12.5, color: 'var(--gd-text-muted)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={15} style={{ color: 'var(--gd-primary)' }} /> {t('landing.hero.pointInstall')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" size={15} style={{ color: 'var(--gd-primary)' }} /> {t('landing.hero.pointNoCard')}</span>
            </div>
          </div>
          <div>
            <div className="gd-card--glass" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gd-text-muted)', background: 'var(--gd-bg-inset)', border: '1px solid var(--gd-border)', borderRadius: 999, padding: '3px 10px' }}>{t('landing.hero.previewTag')}</span>
                <span className="dwp-spacer" /><StatusPill status="healthy" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 15, borderRadius: 'var(--gd-radius-lg)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)' }}>
                <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--gd-success-bg)', color: 'var(--gd-success-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="shield-check" size={23} /></span>
                <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t('landing.hero.previewTitle')}</div><div style={{ fontSize: 11.5, color: 'var(--gd-text-muted)', marginTop: 3 }}>{t('landing.hero.previewSub')}</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                {[t('landing.hero.chipSsl'), t('landing.hero.chipUpdates')].map((chip) => (
                  <span key={chip} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--gd-text-secondary)', background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-md)', padding: '8px 11px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gd-success)' }} /> {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <section id="features" className="dwp-container" style={{ paddingBlock: 66 }}>
        <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 40px' }}>
          <span className="gd-sec-head__eyebrow">{t('landing.features.eyebrow')}</span>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: '10px 0 0' }}>{t('landing.features.title')}</h2>
        </div>
        <div className="dwp-grid dwp-grid-3">
          {FEATURES.map((f) => (
            <div key={f.key} style={{ background: 'var(--gd-bg-surface)', border: '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', padding: 24, boxShadow: 'var(--gd-shadow-xs)' }}>
              <span style={{ width: 46, height: 46, borderRadius: 'var(--gd-radius-lg)', background: 'var(--gd-primary-subtle)', color: 'var(--gd-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name={f.icon} size={23} /></span>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 7px' }}>{t(`landing.features.${f.key}.title`)}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: 0 }}>{t(`landing.features.${f.key}.desc`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Authority levels */}
      <section id="authority" style={{ background: 'var(--gd-bg-app)', borderTop: '1px solid var(--gd-border)', borderBottom: '1px solid var(--gd-border)' }}>
        <div className="dwp-container" style={{ paddingBlock: 60 }}>
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 34px' }}>
            <span className="gd-sec-head__eyebrow">{t('landing.authority.eyebrow')}</span>
            <h2 style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 8px' }}>{t('landing.authority.title')}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--gd-text-secondary)', margin: 0 }}>{t('landing.authority.sub')}</p>
          </div>
          <div className="dwp-grid dwp-grid-3">
            {AUTH_LEVELS.map((a) => (
              <div key={a.level} style={{ background: 'var(--gd-bg-surface)', border: `1px solid ${a.tone === 'warning' ? 'var(--gd-warning-border)' : a.tone === 'success' ? 'var(--gd-success-border)' : 'var(--gd-border)'}`, borderRadius: 'var(--gd-radius-xl)', padding: 24, boxShadow: 'var(--gd-shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: a.tone === 'warning' ? 'var(--gd-warning-bg)' : a.tone === 'success' ? 'var(--gd-success-bg)' : 'var(--gd-bg-inset)', color: a.tone === 'warning' ? 'var(--gd-warning)' : a.tone === 'success' ? 'var(--gd-success)' : 'var(--gd-gray-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={22} /></span>
                  <AuthorityBadge level={a.level} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 7px' }}>{t(`landing.authority.${a.level}.title`)}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--gd-text-secondary)', margin: 0 }}>{t(`landing.authority.${a.level}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparent report sample */}
      <section className="dwp-container dwp-report" style={{ paddingBlock: 64, display: 'grid', gap: 44, alignItems: 'center' }}>
        <div>
          <span className="gd-sec-head__eyebrow">{t('landing.report.eyebrow')}</span>
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 12px' }}>{t('landing.report.title')}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: 'var(--gd-text-secondary)', margin: 0 }}>{t('landing.report.sub')}</p>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gd-text-muted)', marginBottom: 8 }}>{t('landing.report.sampleLabel')}</div>
          <div style={{ display: 'flex', gap: 12, borderRadius: 'var(--gd-radius-lg)', border: '1px solid var(--gd-danger-border)', background: 'var(--gd-danger-bg)', padding: '18px 22px', boxShadow: 'var(--gd-shadow-sm)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 'var(--gd-radius-md)', background: 'var(--gd-danger)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="alert-octagon" size={22} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gd-danger-text)' }}>{t('landing.report.alertTitle')}</span>
                <span className="dwp-mono" style={{ fontSize: 12, color: 'var(--gd-text-muted)', marginInlineStart: 'auto' }}>{digits('14:32')}</span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--gd-text-secondary)', marginTop: 6 }}>{t('landing.report.alertBody')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 9, fontSize: 13 }}>
                <span><b style={{ color: 'var(--gd-text-muted)', fontWeight: 600 }}>{t('landing.report.causeLabel')}</b> {t('landing.report.causeValue')}</span>
                <span><b style={{ color: 'var(--gd-text-muted)', fontWeight: 600 }}>{t('landing.report.actionLabel')}</b> {t('landing.report.actionValue')}</span>
                <span style={{ color: 'var(--gd-warning-text)', fontWeight: 600 }}><b style={{ color: 'var(--gd-text-muted)', fontWeight: 600 }}>{t('landing.report.statusLabel')}</b> {t('landing.report.statusValue')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section style={{ background: 'var(--gd-bg-app)', borderTop: '1px solid var(--gd-border)' }}>
        <div className="dwp-container" style={{ paddingBlock: 64 }}>
          <div style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 36px' }}>
            <span className="gd-sec-head__eyebrow">{t('landing.pricing.eyebrow')}</span>
            <h2 style={{ fontSize: 30, fontWeight: 800, margin: '10px 0 0' }}>{t('landing.pricing.title')}</h2>
          </div>
          <div className="dwp-grid dwp-grid-3" style={{ alignItems: 'start' }}>
            {PLANS.map((p) => (
              <div key={p.key} style={{ background: 'var(--gd-bg-surface)', border: p.popular ? '2px solid var(--gd-primary)' : '1px solid var(--gd-border)', borderRadius: 'var(--gd-radius-xl)', padding: 26, boxShadow: p.popular ? 'var(--gd-shadow-md)' : 'var(--gd-shadow-xs)', position: 'relative' }}>
                {p.popular && <span style={{ position: 'absolute', top: -12, insetInlineStart: 26, background: 'var(--gd-primary)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '4px 12px' }}>{t('landing.pricing.popular')}</span>}
                <div style={{ fontSize: 16, fontWeight: 800 }}>{t(`landing.pricing.${p.key}.name`)}</div>
                <div style={{ margin: '12px 0 4px' }}><span className="dwp-mono" style={{ fontSize: 30, fontWeight: 800 }}>{num(p.price)}</span></div>
                <div style={{ fontSize: 12, color: 'var(--gd-text-muted)' }}>{t('landing.pricing.perMonth')}</div>
                <div style={{ height: 1, background: 'var(--gd-border)', margin: '18px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, color: 'var(--gd-text-secondary)', marginBottom: 20 }}>
                  {t(`landing.pricing.${p.key}.feats`).map((f) => <span key={f} style={{ display: 'flex', gap: 9 }}><Icon name="check" size={17} style={{ color: 'var(--gd-success)' }} /> {f}</span>)}
                </div>
                <Button as={Link} to="/pricing" variant={p.variant} size="md" fullWidth rightIcon="arrow-left">{t('landing.pricing.cta')}</Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA (ink) */}
      <div data-theme="ink" style={{ background: 'var(--gd-bg-app)' }}>
        <div className="dwp-container dwp-cta" style={{ paddingBlock: 60, display: 'flex', alignItems: 'center', gap: 30, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, margin: 0, color: 'var(--gd-text)' }}>{t('landing.cta.title')}</h2>
            <p style={{ fontSize: 15, color: 'var(--gd-text-secondary)', margin: '10px 0 0' }}>{t('landing.cta.sub')}</p>
          </div>
          <Button as={Link} to="/register" variant="primary" size="lg" leftIcon="shield-check">{t('landing.cta.button')}</Button>
        </div>
      </div>
    </>
  )
}
