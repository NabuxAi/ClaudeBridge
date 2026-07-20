import { Routes, Route, Navigate } from 'react-router-dom'

import MarketingLayout from './layouts/MarketingLayout.jsx'
import AuthLayout from './layouts/AuthLayout.jsx'
import AccountShell from './layouts/AccountShell.jsx'
import SiteShell from './layouts/SiteShell.jsx'

// A · marketing
import Landing from './pages/marketing/Landing.jsx'
// B · auth + onboarding
import Login from './pages/auth/Login.jsx'
import Reset from './pages/auth/Reset.jsx'
import Register from './pages/auth/Register.jsx'
import Onboarding from './pages/auth/Onboarding.jsx'
// C · account panel
import Dashboard from './pages/account/Dashboard.jsx'
import Sites from './pages/account/Sites.jsx'
import Billing from './pages/account/Billing.jsx'
import Team from './pages/account/Team.jsx'
import Notifications from './pages/account/Notifications.jsx'
import Profile from './pages/account/Profile.jsx'
// D · per-site panel
import Overview from './pages/site/Overview.jsx'
import Incidents from './pages/site/Incidents.jsx'
import Updates from './pages/site/Updates.jsx'
import Security from './pages/site/Security.jsx'
import Backups from './pages/site/Backups.jsx'
import Assistant from './pages/site/Assistant.jsx'
import Settings from './pages/site/Settings.jsx'
// E · payment
import Pricing from './pages/billing/Pricing.jsx'
import Checkout from './pages/billing/Checkout.jsx'
import Invoice from './pages/billing/Invoice.jsx'

export default function App() {
  return (
    <Routes>
      {/* A · marketing */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
      </Route>

      {/* B · auth */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<Reset />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route path="/onboarding" element={<Onboarding />} />

      {/* C · account panel */}
      <Route path="/app" element={<AccountShell />}>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="billing" element={<Billing />} />
        <Route path="team" element={<Team />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* D · per-site management panel */}
      <Route path="/site/:siteId" element={<SiteShell />}>
        <Route index element={<Overview />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="updates" element={<Updates />} />
        <Route path="security" element={<Security />} />
        <Route path="backups" element={<Backups />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* E · payment */}
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/invoice/:id" element={<Invoice />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
