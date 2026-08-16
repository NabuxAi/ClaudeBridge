import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'

export default function ProtectedRoute({ children }) {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div dir="rtl" style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gd-bg-app)', color: 'var(--gd-text-secondary)', fontFamily: 'var(--gd-font-sans)',
      }}>
        <span>در حال بارگذاری…</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ returnTo: location.pathname + location.search }} replace />
  }

  return children
}
