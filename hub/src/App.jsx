import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

import MarketingLayout from './layouts/MarketingLayout.jsx'
import AuthLayout from './layouts/AuthLayout.jsx'
import AccountShell from './layouts/AccountShell.jsx'
import SiteShell from './layouts/SiteShell.jsx'
import ProtectedRoute from './lib/ProtectedRoute.jsx'

// A · marketing
const Landing = lazy(() => import('./pages/marketing/Landing.jsx'))
// B · auth + onboarding
const Login = lazy(() => import('./pages/auth/Login.jsx'))
const Reset = lazy(() => import('./pages/auth/Reset.jsx'))
const Register = lazy(() => import('./pages/auth/Register.jsx'))
const Onboarding = lazy(() => import('./pages/auth/Onboarding.jsx'))
// C · account panel
const Dashboard = lazy(() => import('./pages/account/Dashboard.jsx'))
const Sites = lazy(() => import('./pages/account/Sites.jsx'))
const Billing = lazy(() => import('./pages/account/Billing.jsx'))
const Team = lazy(() => import('./pages/account/Team.jsx'))
const Notifications = lazy(() => import('./pages/account/Notifications.jsx'))
const Profile = lazy(() => import('./pages/account/Profile.jsx'))
const Alerts = lazy(() => import('./pages/account/Alerts.jsx'))
// D · per-site panel
const Overview = lazy(() => import('./pages/site/Overview.jsx'))
const Incidents = lazy(() => import('./pages/site/Incidents.jsx'))
const Updates = lazy(() => import('./pages/site/Updates.jsx'))
const Security = lazy(() => import('./pages/site/Security.jsx'))
const Backups = lazy(() => import('./pages/site/Backups.jsx'))
const Assistant = lazy(() => import('./pages/site/Assistant.jsx'))
const Rescue = lazy(() => import('./pages/site/Rescue.jsx'))
const Conflict = lazy(() => import('./pages/site/Conflict.jsx'))
const Speed = lazy(() => import('./pages/site/Speed.jsx'))
const Hosting = lazy(() => import('./pages/site/Hosting.jsx'))
const Settings = lazy(() => import('./pages/site/Settings.jsx'))
// E · payment
const Pricing = lazy(() => import('./pages/billing/Pricing.jsx'))
const Checkout = lazy(() => import('./pages/billing/Checkout.jsx'))
const Invoice = lazy(() => import('./pages/billing/Invoice.jsx'))

function PageLoader() {
  return (
    <div dir="rtl" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--gd-bg-app)', color: 'var(--gd-text-secondary)', fontFamily: 'var(--gd-font-sans)',
    }}>
      <span>در حال بارگذاری…</span>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
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
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

      {/* C · account panel */}
      <Route path="/app" element={<ProtectedRoute><AccountShell /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<Sites />} />
        <Route path="billing" element={<Billing />} />
        <Route path="team" element={<Team />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      {/* D · per-site management panel */}
      <Route path="/site/:siteId" element={<ProtectedRoute><SiteShell /></ProtectedRoute>}>
        <Route index element={<Overview />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="updates" element={<Updates />} />
        <Route path="security" element={<Security />} />
        <Route path="backups" element={<Backups />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="rescue" element={<Rescue />} />
        <Route path="conflict" element={<Conflict />} />
        <Route path="speed" element={<Speed />} />
        <Route path="hosting" element={<Hosting />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* E · payment */}
      <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
      <Route path="/invoice/:id" element={<ProtectedRoute><Invoice /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
