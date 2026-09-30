import { Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import Icon from '../lib/icons.jsx'
import { StatusPill } from '../components/index.js'

// Split auth screen, rebuilt in the landing hero's language (NabuxUi mapping
// §3.2/§3.5): an ink aurora scene carries a glass form card on one side and
// the "night watch" panel on the other. Glass is invisible on a flat surface,
// so the whole screen becomes the ink backdrop the glass sits on.
export default function AuthLayout() {
  return (
    <div className="dwp-authwrap" dir="rtl" data-theme="ink">
      {/* Decorative drifting lights — the same .dwp-hero-backdrop the landing
          hero uses (polish-marketing.css), reused instead of copied. It is
          aria-hidden and pointer-events:none there, and clips its own
          overflow, so it can never add scroll or steal a tap. */}
      <div className="dwp-hero-backdrop" aria-hidden="true"><i /><i /><i /></div>
      <div className="dwp-auth-main">
        <div className="dwp-auth-card gd-card--glass">
          <div className="dwp-auth-brand"><Brand /></div>
          <Outlet />
        </div>
      </div>
      <aside className="dwp-auth-aside dwp-desktop-only">
        <span className="gd-sec-head__eyebrow">
          <Icon name="shield-check" size={14} /> پشتیبان هوشمند وردپرس
        </span>
        <h3 className="dwp-auth-aside__title">
          سایت شما، <span className="gd-gradient-text">همیشه به‌روز</span> و زیر نظر اسکن روزانه.
        </h3>
        <ul className="dwp-auth-aside__list">
          {['به‌روزرسانی خودکار با حالت ایمنی', 'اسکن بدافزار و بررسی یکپارچگی هسته', 'بکاپ دیتابیس با بازگردانی'].map((t) => (
            <li key={t} className="dwp-auth-aside__item">
              <Icon name="check-circle-2" size={19} /> {t}
            </li>
          ))}
        </ul>
        {/* Preview, not a reading — no site is connected on this screen. The
            tag says «پیش‌نمایش پنل» and the copy points at where the real
            status will appear: the same honest preview card as the landing
            hero, instead of a made-up «example.ir · ۹ سرویس» healthy site. */}
        <div className="dwp-auth-preview gd-card--glass">
          <div className="dwp-auth-preview__head">
            <span className="dwp-auth-preview__tag">پیش‌نمایش پنل</span>
            <StatusPill status="healthy" size="sm" />
          </div>
          <div className="dwp-auth-preview__row">
            <span className="dwp-auth-preview__ic"><Icon name="shield-check" size={22} /></span>
            <div>
              <div className="dwp-auth-preview__title">وضعیت سایت شما</div>
              <div className="dwp-auth-preview__sub">پس از اتصال، اینجا نمایش داده می‌شود</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
