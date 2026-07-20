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
    const { token, user: u } = await authApi.login(creds)
    setToken(token)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (body) => {
    const { token, user: u } = await authApi.register(body)
    setToken(token)
    setUser(u)
    return u
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

export const useAuth = () => useContext(AuthCtx)
