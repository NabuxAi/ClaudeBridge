import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/digiwp.css'
import './styles/app.css'
import { AuthProvider } from './lib/auth.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)

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
