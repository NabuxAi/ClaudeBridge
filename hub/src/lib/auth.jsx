// Auth context — session against YOUR server (never a managed site).
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { auth as authApi, setToken, getToken } from './api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (getToken()) {
        try {
          const u = await authApi.me()
          if (alive) setUser(u)
        } catch {
          setToken('')
        }
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
  }, [])

  const login = useCallback(async (creds) => {
    const data = await authApi.login(creds)
    // چالش دومرحله‌ای: رمز درست بوده اما سرور هنوز نشستی صادر نکرده است.
    // پاسخ بدون توکن، دست‌نخورده به فرم ورود برمی‌گردد تا مرحلهٔ کد را نشان
    // دهد و همان فرم با `code` دوباره بفرستد. setToken با undefined خوانده
    // نمی‌شود — پاک‌کردن نشستِ موجود روی چالش، اشتباه است.
    if (data?.totp_required) return data
    const { token, user: u } = data
    setToken(token)
    setUser(u)
    return u
  }, [])

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
