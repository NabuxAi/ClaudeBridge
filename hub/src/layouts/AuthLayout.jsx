import { Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { StatusPill } from '../components/index.js'
import LanguageSwitcher from '../components/LanguageSwitcher.jsx'
import Trans from '../components/Trans.jsx'
import { t } from '../lib/i18n.js'

// Split auth screen, rebuilt in the landing hero's language (NabuxUi mapping
// §3.2/§3.5): an ink aurora scene carries a glass form card on one side and
// the "night watch" panel on the other. Glass is invisible on a flat surface,
// so the whole screen becomes the ink backdrop the glass sits on.
export default function AuthLayout() {
  return (
    <div className="dwp-authwrap" data-theme="ink">
      {/* Decorative drifting lights — the same .dwp-hero-backdrop the landing
          hero uses (polish-marketing.css), reused instead of copied. It is
          aria-hidden and pointer-events:none there, and clips its own
          overflow, so it can never add scroll or steal a tap. */}
      <div className="dwp-hero-backdrop" aria-hidden="true"><i /><i /><i /></div>
      <div className="dwp-auth-main">
        <div className="dwp-auth-card gd-card--glass">
          <div className="dwp-auth-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Brand /><LanguageSwitcher /></div>
          <Outlet />
        </div>
      </div>
      <aside className="dwp-auth-aside dwp-desktop-only">
        <span className="gd-sec-head__eyebrow">
          <Icon name="shield-check" size={14} /> {t('common.tagline')}
        </span>
        <h3 className="dwp-auth-aside__title">
          <Trans k="layout.auth.title" components={{ hl: (c) => <span className="gd-gradient-text">{c}</span> }} />
        </h3>
        <ul className="dwp-auth-aside__list">
          {t('layout.auth.points').map((p) => (
            <li key={p} className="dwp-auth-aside__item">
              <Icon name="check-circle-2" size={19} /> {p}
            </li>
          ))}
        </ul>
        {/* Preview, not a reading — no site is connected on this screen. The
            tag says "Panel preview" and the copy points at where the real
            status will appear: the same honest preview card as the landing
            hero, instead of a made-up healthy example site. */}
        <div className="dwp-auth-preview gd-card--glass">
          <div className="dwp-auth-preview__head">
            <span className="dwp-auth-preview__tag">{t('layout.auth.previewTag')}</span>
            <StatusPill status="healthy" size="sm" />
          </div>
          <div className="dwp-auth-preview__row">
            <span className="dwp-auth-preview__ic"><Icon name="shield-check" size={22} /></span>
            <div>
              <div className="dwp-auth-preview__title">{t('layout.auth.previewTitle')}</div>
              <div className="dwp-auth-preview__sub">{t('layout.auth.previewSub')}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
