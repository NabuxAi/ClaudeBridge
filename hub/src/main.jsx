import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/digiwp.css'
import './styles/app.css'
import './styles/polish-shell.css'
import './styles/polish-auth.css'
import './styles/polish-account.css'
import './styles/polish-site-a.css'
import './styles/polish-site-b.css'
import './styles/polish-site-c.css'
import './styles/polish-site-d.css'
import './styles/polish-marketing.css'
import { AuthProvider } from './lib/auth.jsx'
import { I18nProvider } from './lib/I18nProvider.jsx'
import { initI18n } from './lib/i18n.js'
import App from './App.jsx'

// The saved language (English by default) is loaded before the first paint,
// so nobody sees a flash of the wrong language or direction.
initI18n().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <I18nProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </I18nProvider>
      </BrowserRouter>
    </StrictMode>
  )
})

/**
 * Register the service worker.
 *
 * Only for notifications — it caches nothing. An offline copy of a security
 * dashboard would show yesterday's "everything is fine" while a site is being
 * defaced, and a stale answer here is worse than an error.
 *
 * Registration failing is not fatal: the panel works without it, the person
 * simply does not get browser alerts, and the readiness screen reports that
 * honestly rather than showing a channel as active.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('Service worker not registered — browser alerts will be unavailable:', e.message)
    })
  })
}
