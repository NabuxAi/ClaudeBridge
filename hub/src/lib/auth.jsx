// Auth context — session against YOUR server (never a managed site).
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { auth as authApi, setToken, getToken } from './api.js'
import { getLang, hasStoredLang } from './i18n.js'
import { useI18n } from './I18nProvider.jsx'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const { setLang } = useI18n()

  // A browser that never picked a language follows the account's saved one
  // (a returning Persian-speaking user on a new device); an explicit choice
  // on this browser always wins.
  const adoptLang = useCallback((u) => {
    if (u?.lang && !hasStoredLang() && u.lang !== getLang()) setLang(u.lang)
  }, [setLang])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (getToken()) {
        try {
          const u = await authApi.me()
          if (alive) { setUser(u); adoptLang(u) }
        } catch {
          setToken('')
        }
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
  }, [adoptLang])

  const login = useCallback(async (creds) => {
    const data = await authApi.login(creds)
    // Two-factor challenge: the password was right but the server has not
    // issued a session yet. The token-less answer goes back to the login form
    // untouched so it can show the code step and resubmit with `code`.
    // setToken is not called with undefined — clearing an existing session
    // on a challenge would be wrong.
    if (data?.totp_required) return data
    const { token, user: u } = data
    setToken(token)
    setUser(u)
    adoptLang(u)
    return u
  }, [adoptLang])

  const register = useCallback(async (body) => {
    const { token, user: u, invite } = await authApi.register(body)
    setToken(token)
    setUser(u)
    // The optional team-invite outcome rides along: applied, or an honest
    // reason it was not (expired, spent, or addressed to another email).
    return { user: u, invite }
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx)
