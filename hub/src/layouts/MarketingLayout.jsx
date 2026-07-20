import { Link, Outlet } from 'react-router-dom'
import Brand from './Brand.jsx'
import { Button } from '../components/index.js'
import Icon from '../lib/icons.jsx'

export default function MarketingLayout() {
  return (
    <div style={{ background: 'var(--gd-bg-surface)', color: 'var(--gd-text)' }}>
      <header className="dwp-mkt-nav">
        <div className="dwp-container dwp-mkt-nav__inner">
          <Brand />
          <span className="dwp-spacer" />
          <nav className="dwp-mkt-links">
            <a href="#features">قابلیت‌ها</a>
            <a href="#authority">سطوح اختیار</a>
            <Link to="/pricing">قیمت‌ها</Link>
          </nav>
          <span className="dwp-desktop-only" style={{ width: 1, height: 24, background: 'var(--gd-border)' }} />
          <Button as={Link} to="/login" variant="ghost" size="sm">ورود</Button>
          <Button as={Link} to="/register" variant="primary" size="sm">شروع رایگان</Button>
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
              پشتیبان هوشمند وردپرس؛ مراقبت، آپدیت امن و بکاپ سالم به‌صورت خودکار — همه از طریق سرور شما.
            </p>
          </div>
          {[
            { h: 'محصول', links: ['قابلیت‌ها', 'سطوح اختیار', 'قیمت‌ها'] },
            { h: 'شرکت', links: ['دربارهٔ ما', 'وبلاگ', 'تماس با ما'] },
            { h: 'پشتیبانی', links: ['راهنما', 'وضعیت سرویس', 'حریم خصوصی'] },
          ].map((c) => (
            <div key={c.h}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{c.h}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, color: 'var(--gd-text-secondary)' }}>
                {c.links.map((l) => <a key={l} href="#" style={{ color: 'inherit' }}>{l}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--gd-border)' }}>
          <div className="dwp-container" style={{ padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--gd-text-muted)' }}>
            <span>© ۱۴۰۳ DigiWP Ai Support — همهٔ حقوق محفوظ است.</span>
            <span className="dwp-mono">ai.digiwp.com</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
